-- MRTA Shuttle EV · การเบิก-จ่ายค่าชาร์จ (เงินสำรองคนขับ · รอบ 3 วัน) · 18 พ.ย. 2569
-- รันใน Supabase SQL Editor ครั้งเดียว
-- หลัก (ผู้จัดการอนุมัติ 18 พ.ย. 2569):
--   * คนขับสำรองจ่ายค่าชาร์จจากเงินสำรองของตัวเอง ยอดเป็นของ "คนที่บันทึกการชาร์จ"
--   * รอบละ 3 วันเริ่ม 17 พ.ย. 2569 (รอบ 1 = 17–19 พ.ย.) นับตามวันทำงาน (ชาร์จก่อน 05:00 = วันก่อนหน้า)
--   * ปิดรอบ = รวมทุกรายการที่ "แนบใบเสร็จแล้ว" และยังไม่เคยเบิก ที่วันทำงาน <= วันสุดท้ายของรอบ
--     (ใบเสร็จที่แนบช้าจากรอบก่อนจะเข้ารอบนี้ · รายการที่ยังรอใบเสร็จยกไปรอบถัดไป · เบิกซ้ำไม่ได้)
--   * ผู้จัดการโอนคืนคนขับตามยอดจริง (แนบสลิปได้ ไม่บังคับ) → ยื่นเบิกบริษัท → บันทึกเงินบริษัทเข้า
--   * คนขับเห็นเฉพาะวงเงิน/การโอนของตัวเอง · ข้อมูลรอบเบิกเห็นเฉพาะผู้จัดการ/แอดมิน

-- 1) วงเงินสำรองของคนขับ
create table if not exists public.reserve_accounts (
  employee_id uuid primary key references public.employees(id),
  credit numeric(10,2) not null check (credit >= 0),
  start_date date not null default date '2026-11-17',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.reserve_accounts(employee_id, credit) values
  ('01ddf6bc-d92f-4f1d-a2f8-c09f3ab8c617', 3500),  -- ณภัทร ทองวงศ์ษา (STC-01)
  ('67927048-c392-4d88-893c-399c6f2dc22d', 3500),  -- สุปราณี รักสกุล (STC-02)
  ('1965f2ff-b7c0-4310-a713-91d10672907a', 3500),  -- สุชาติ รองเมือง (STC-03)
  ('f88b4c93-bf02-41df-8cd9-6ce4a9f89234', 3500),  -- สุรินทร เสาโกมุท (STC-04)
  ('af1672a6-77c7-4ccd-a918-3c3cdda53f93', 2000)   -- ฐิติณัฏฐ์ รัตนชูชัย (ขับแทน)
on conflict (employee_id) do nothing;

-- 2) รอบเบิก
create table if not exists public.claim_rounds (
  round_no int primary key check (round_no >= 1),
  period_from date not null,
  period_to date not null,
  closed_at timestamptz not null default now(),
  closed_by uuid default auth.uid(),
  submitted_on date,
  received_on date,
  received_amount numeric(12,2),
  note text
);
alter table public.charging_records add column if not exists claim_round int references public.claim_rounds(round_no);
create index if not exists charging_records_claim_round_idx on public.charging_records(claim_round);

-- 3) การโอนคืนคนขับ
create table if not exists public.reserve_transfers (
  id uuid primary key default gen_random_uuid(),
  round_no int references public.claim_rounds(round_no),
  employee_id uuid not null references public.employees(id),
  amount numeric(10,2) not null check (amount > 0),
  transferred_on date not null,
  slip_path text,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.reserve_accounts enable row level security;
alter table public.claim_rounds enable row level security;
alter table public.reserve_transfers enable row level security;
drop policy if exists ra_read on public.reserve_accounts;
create policy ra_read on public.reserve_accounts for select to authenticated using (app.is_manager() or employee_id = app.my_employee());
drop policy if exists ra_manage on public.reserve_accounts;
create policy ra_manage on public.reserve_accounts for update to authenticated using (app.is_manager()) with check (app.is_manager());
drop policy if exists cr_read on public.claim_rounds;
create policy cr_read on public.claim_rounds for select to authenticated using (app.is_manager());
drop policy if exists rt_read on public.reserve_transfers;
create policy rt_read on public.reserve_transfers for select to authenticated using (app.is_manager() or employee_id = app.my_employee());
-- writes to claim_rounds / reserve_transfers only through the functions below

-- วันทำงานของรายการชาร์จ (ชาร์จก่อน 05:00 = วันก่อนหน้า) และช่วงวันของรอบ
create or replace function app.work_day(p_receipt date, p_started timestamptz) returns date
language sql immutable as $$
  select case when p_started is not null and (p_started at time zone 'Asia/Bangkok')::time < time '05:00' then p_receipt - 1 else p_receipt end
$$;
create or replace function app.round_from(p_round int) returns date language sql immutable as $$ select date '2026-11-17' + 3 * (p_round - 1) $$;

-- 4) ปิดรอบ (p_dry = true แสดงผลก่อน)
create or replace function public.claim_close(p_round int, p_dry boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f date := app.round_from(p_round); t date := app.round_from(p_round) + 2; res jsonb;
begin
  if not app.is_manager() then raise exception 'เฉพาะผู้จัดการ'; end if;
  if p_round < 1 then raise exception 'เลขรอบไม่ถูกต้อง'; end if;
  if exists (select 1 from public.claim_rounds where round_no = p_round) then raise exception 'รอบที่ % ปิดไปแล้ว', p_round; end if;
  if p_round > 1 and not exists (select 1 from public.claim_rounds where round_no = p_round - 1) then raise exception 'ต้องปิดรอบที่ % ก่อน', p_round - 1; end if;
  if app.bkk_today() <= t then raise exception 'รอบที่ % ยังไม่ครบ (ถึงวันที่ %)', p_round, to_char(t, 'DD/MM'); end if;

  with c as (
    select c.*, app.work_day(c.receipt_date, c.started_at) wd from public.charging_records c
     where c.claim_round is null and app.work_day(c.receipt_date, c.started_at) between date '2026-11-17' and t),
  ok as (select * from c where receipt_path is not null and coalesce(total, 0) > 0),
  wait as (select * from c where receipt_path is null or coalesce(total, 0) = 0)
  select jsonb_build_object(
    'round', p_round, 'from', f, 'to', t,
    'count', (select count(*) from ok), 'total', (select coalesce(sum(total), 0) from ok),
    'late', (select count(*) from ok where wd < f),
    'people', (select coalesce(jsonb_agg(x order by x->>'name'), '[]') from (
        select jsonb_build_object('employee_id', o.employee_id, 'name', coalesce(e.full_name, '–'), 'count', count(*), 'total', sum(o.total)) x
          from ok o left join public.employees e on e.id = o.employee_id group by o.employee_id, e.full_name) z),
    'waiting', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(e.full_name, '–'), 'date', w.wd, 'bus', v.code) order by w.wd), '[]')
                  from wait w left join public.employees e on e.id = w.employee_id left join public.vehicles v on v.id = w.vehicle_id)
  ) into res;

  if p_dry then return res; end if;
  if (res->>'count')::int = 0 then raise exception 'รอบนี้ไม่มีรายการที่แนบใบเสร็จแล้ว'; end if;
  insert into public.claim_rounds(round_no, period_from, period_to) values (p_round, f, t);
  update public.charging_records c set claim_round = p_round
   where c.claim_round is null and c.receipt_path is not null and coalesce(c.total, 0) > 0
     and app.work_day(c.receipt_date, c.started_at) between date '2026-11-17' and t;
  return res;
end $$;

-- 5) โอนคืนคนขับ / ลบรายการโอนที่บันทึกผิด
create or replace function public.claim_transfer(p_round int, p_employee uuid, p_amount numeric, p_date date, p_slip text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare nid uuid;
begin
  if not app.is_manager() then raise exception 'เฉพาะผู้จัดการ'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'ยอดโอนต้องมากกว่า 0'; end if;
  if p_date is null or p_date > app.bkk_today() then raise exception 'วันที่โอนไม่ถูกต้อง'; end if;
  if p_round is not null and not exists (select 1 from public.claim_rounds where round_no = p_round) then raise exception 'ยังไม่ได้ปิดรอบที่ %', p_round; end if;
  insert into public.reserve_transfers(round_no, employee_id, amount, transferred_on, slip_path, note)
  values (p_round, p_employee, round(p_amount, 2), p_date, nullif(p_slip, ''), nullif(p_note, '')) returning id into nid;
  return nid;
end $$;
create or replace function public.claim_transfer_delete(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_manager() then raise exception 'เฉพาะผู้จัดการ'; end if;
  delete from public.reserve_transfers where id = p_id;
end $$;

-- 6) ยื่นเบิกแล้ว / เงินบริษัทเข้าแล้ว (ส่งค่าที่จะบันทึก · p_clear = true ล้างค่าที่บันทึกผิด)
create or replace function public.claim_mark(p_round int, p_submitted date default null, p_received date default null, p_amount numeric default null, p_clear boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_manager() then raise exception 'เฉพาะผู้จัดการ'; end if;
  if not exists (select 1 from public.claim_rounds where round_no = p_round) then raise exception 'ยังไม่ได้ปิดรอบที่ %', p_round; end if;
  if p_clear then update public.claim_rounds set submitted_on = null, received_on = null, received_amount = null where round_no = p_round; return; end if;
  if greatest(p_submitted, p_received) > app.bkk_today() then raise exception 'วันที่ต้องไม่เกินวันนี้'; end if;
  update public.claim_rounds set submitted_on = coalesce(p_submitted, submitted_on),
         received_on = coalesce(p_received, received_on), received_amount = coalesce(round(p_amount, 2), received_amount)
   where round_no = p_round;
end $$;

-- 7) รายการที่เบิกแล้ว: คนขับแก้/ลบไม่ได้ (ผู้จัดการแก้ได้)
create or replace function app.claimed_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.claim_round is not null and not app.is_manager() then
    raise exception 'รายการนี้อยู่ในรอบเบิกที่ % แล้ว แก้ไขหรือลบได้เฉพาะผู้จัดการ', old.claim_round;
  end if;
  if tg_op = 'UPDATE' and new.claim_round is distinct from old.claim_round and not app.is_manager() then
    raise exception 'เฉพาะผู้จัดการ';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists charging_claimed_guard on public.charging_records;
create trigger charging_claimed_guard before update or delete on public.charging_records
  for each row execute function app.claimed_guard();

revoke all on function public.claim_close(int, boolean), public.claim_transfer(int, uuid, numeric, date, text, text),
  public.claim_transfer_delete(uuid), public.claim_mark(int, date, date, numeric, boolean) from public, anon;
grant execute on function public.claim_close(int, boolean), public.claim_transfer(int, uuid, numeric, date, text, text),
  public.claim_transfer_delete(uuid), public.claim_mark(int, date, date, numeric, boolean) to authenticated;
grant select on public.reserve_accounts, public.claim_rounds, public.reserve_transfers to authenticated;
grant update on public.reserve_accounts to authenticated;

-- ตรวจ: ควรได้ 5 คน รวม 16,000 บาท
select count(*) as people, sum(credit) as total_credit from public.reserve_accounts;
