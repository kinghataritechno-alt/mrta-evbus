-- MRTA Shuttle EV · (1) ปุ่ม "เปลี่ยนรถวันนี้" สำหรับคนขับประจำ (แบบ C) · (2) ข้อมูลคนขับ (โปรไฟล์)
-- จัดทำ 29 ต.ค. 2569 · รันครั้งเดียวใน Supabase SQL Editor (รันซ้ำได้)

-- ========== 1) เปลี่ยนรถวันนี้ ==========
alter table public.cover_claims add column if not exists kind text not null default 'cover';
alter table public.cover_claims add column if not exists from_vehicle_id uuid references public.vehicles(id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cover_claims_kind_check') then
    alter table public.cover_claims add constraint cover_claims_kind_check check (kind in ('cover','switch'));
  end if;
end $$;

-- รถของฉันวันนี้: ตามตาราง เว้นแต่มีคนรับแทน/ฉันเปลี่ยนไปคันอื่น + คันที่ฉันรับแทน/เปลี่ยนมา + คันที่เพื่อนสลับให้
create or replace function app.my_vehicles_today() returns setof uuid language sql stable security definer set search_path = '' as $$
  select ws.vehicle_id from public.work_schedules ws
   where ws.employee_id = app.my_employee() and ws.work_date = app.bkk_today()
     and ws.status = 'work' and ws.vehicle_id is not null
     and not exists (select 1 from public.cover_claims c where c.work_date = ws.work_date and c.vehicle_id = ws.vehicle_id
                     and c.absent_employee_id = ws.employee_id and c.status in ('pending','approved'))
     and not exists (select 1 from public.cover_claims c where c.work_date = ws.work_date and c.kind = 'switch'
                     and c.relief_employee_id = ws.employee_id and c.status in ('pending','approved'))
  union
  select c.vehicle_id from public.cover_claims c
   where c.relief_employee_id = app.my_employee() and c.work_date = app.bkk_today() and c.status in ('pending','approved')
  union
  select c.from_vehicle_id from public.cover_claims c
   where c.kind = 'switch' and c.absent_employee_id = app.my_employee() and c.from_vehicle_id is not null
     and c.work_date = app.bkk_today() and c.status in ('pending','approved')
$$;

-- รถที่เปลี่ยนไปได้วันนี้ (มีคิววันนี้ และไม่ใช่คันของฉัน)
create or replace function public.switchable_today() returns table(vehicle_id uuid, code text, plate text, driver_id uuid, driver_name text, started boolean)
language sql stable security definer set search_path = '' as $$
  select v.id, v.code, v.plate, ws.employee_id, e.full_name,
         exists (select 1 from public.inspections i where i.vehicle_id = v.id and (i.inspected_at at time zone 'Asia/Bangkok')::date = q.work_date)
  from public.vehicle_queue q join public.vehicles v on v.id = q.vehicle_id
  left join public.work_schedules ws on ws.work_date = q.work_date and ws.vehicle_id = q.vehicle_id and ws.status = 'work'
  left join public.employees e on e.id = ws.employee_id
  where q.work_date = app.bkk_today() and app.my_role() = 'DRIVER'
    and v.id not in (select app.my_vehicles_today())
    and not exists (select 1 from public.cover_claims c where c.vehicle_id = v.id and c.work_date = q.work_date and c.status in ('pending','approved'))
  order by v.code
$$;
grant execute on function public.switchable_today() to authenticated;

-- กดเปลี่ยนรถ: ใช้รถใหม่ได้ทันที ผู้จัดการอนุมัติภายหลัง · ถ้าคันนั้นมีคนขับตามตาราง เขาได้รถเดิมของฉันไป (สลับกัน)
create or replace function public.switch_vehicle(p_vehicle uuid, p_reason text) returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := app.my_employee(); d date := app.bkk_today(); mine uuid; other uuid; cid uuid;
begin
  if app.my_role() <> 'DRIVER' then raise exception 'เฉพาะคนขับเท่านั้น'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'กรุณาระบุเหตุผล'; end if;
  select ws.vehicle_id into mine from public.work_schedules ws where ws.employee_id = me and ws.work_date = d and ws.status = 'work';
  if mine is null then raise exception 'วันนี้คุณไม่มีรถตามตาราง ใช้ "รับรถแทน" แทน'; end if;
  if mine = p_vehicle then raise exception 'เป็นรถของคุณอยู่แล้ว'; end if;
  if not exists (select 1 from public.vehicle_queue q where q.vehicle_id = p_vehicle and q.work_date = d) then raise exception 'รถคันนี้ไม่มีคิววันนี้'; end if;
  if exists (select 1 from public.cover_claims c where c.work_date = d and c.status in ('pending','approved')
             and (c.vehicle_id = p_vehicle or c.from_vehicle_id = p_vehicle or c.relief_employee_id = me)) then
    raise exception 'มีการเปลี่ยน/รับรถแทนที่เกี่ยวข้องอยู่แล้ววันนี้ ติดต่อผู้จัดการ'; end if;
  select ws.employee_id into other from public.work_schedules ws where ws.vehicle_id = p_vehicle and ws.work_date = d and ws.status = 'work';
  insert into public.cover_claims(work_date, vehicle_id, relief_employee_id, absent_employee_id, reason, kind, from_vehicle_id)
  values (d, p_vehicle, me, other, p_reason, 'switch', case when other is null then null else mine end) returning id into cid;
  return cid;
end $$;
revoke all on function public.switch_vehicle(uuid, text) from public, anon;
grant execute on function public.switch_vehicle(uuid, text) to authenticated;

-- อนุมัติ: บันทึกลงตารางงานให้ตรงกับที่ขับจริง
create or replace function public.decide_cover(p_claim uuid, p_approve boolean, p_note text default null) returns void language plpgsql security definer set search_path = '' as $$
declare c public.cover_claims; q1 text; q2 text;
begin
  if not app.is_manager() then raise exception 'เฉพาะผู้จัดการ'; end if;
  update public.cover_claims set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = p_note
   where id = p_claim and status = 'pending' returning * into c;
  if c.id is null then raise exception 'ไม่พบคำขอที่รออนุมัติ'; end if;
  if not p_approve then return; end if;
  if c.kind = 'switch' then
    select queue_code into q1 from public.vehicle_queue where work_date = c.work_date and vehicle_id = c.vehicle_id;
    -- free the buses first (one driver per bus per day)
    update public.work_schedules set vehicle_id = null, status = 'standby', updated_at = now()
     where work_date = c.work_date and employee_id in (c.relief_employee_id, c.absent_employee_id);
    update public.work_schedules set status = 'work', vehicle_id = c.vehicle_id, queue_code = q1, note = 'เปลี่ยนรถ (อนุมัติ): ' || c.reason, updated_at = now()
     where work_date = c.work_date and employee_id = c.relief_employee_id;
    if c.absent_employee_id is not null and c.from_vehicle_id is not null then
      select queue_code into q2 from public.vehicle_queue where work_date = c.work_date and vehicle_id = c.from_vehicle_id;
      update public.work_schedules set status = 'work', vehicle_id = c.from_vehicle_id, queue_code = q2, note = 'สลับรถ (อนุมัติ): ' || c.reason, updated_at = now()
       where work_date = c.work_date and employee_id = c.absent_employee_id;
    end if;
    return;
  end if;
  if c.absent_employee_id is not null then
    insert into public.work_schedules(work_date, employee_id, status, leave_type, note)
    values (c.work_date, c.absent_employee_id, 'leave', c.reason, 'อนุมัติจากการรับรถแทน')
    on conflict (work_date, employee_id) do update set status='leave', vehicle_id=null, leave_type=excluded.leave_type, note=excluded.note, updated_at=now();
  end if;
  insert into public.work_schedules(work_date, employee_id, status, vehicle_id, note)
  values (c.work_date, c.relief_employee_id, 'work', c.vehicle_id, 'รับรถแทน (อนุมัติ)')
  on conflict (work_date, employee_id) do update set status='work', vehicle_id=excluded.vehicle_id, note=excluded.note, updated_at=now();
end $$;

-- Manager Agent: ตรวจคนที่ขับจริงหลังเปลี่ยน/สลับรถ
create or replace function public.run_compliance(p_date date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d date := coalesce(p_date, app.bkk_today());
  now_t time := (now() at time zone 'Asia/Bangkok')::time;
  full_day boolean;
  cutoff time;
  n int;
begin
  if auth.uid() is not null and not app.is_manager() then raise exception 'manager only'; end if;
  full_day := d < app.bkk_today() or now_t >= time '20:30';
  cutoff := case when full_day then time '23:59' else now_t end;

  -- เริ่มรอบใหม่: ถือว่าเรื่องเดิมของวันนั้นแก้แล้ว แล้วค่อยใส่เรื่องที่ยังพบอยู่กลับเข้าไป
  update public.compliance_alerts set resolved_at = now() where work_date = d and resolved_at is null;

  drop table if exists _resp; drop table if exists _new;
  create temp table _resp on commit drop as
  with cc as (select * from public.cover_claims c where c.work_date = d and c.status in ('pending','approved')),
  claims as (
    -- cover / switch: the person who took the bus
    select c.relief_employee_id as employee_id, c.vehicle_id, q.queue_code, q.first_time
    from cc c join public.vehicle_queue q on q.vehicle_id = c.vehicle_id and q.work_date = c.work_date
    union
    -- switch with a scheduled driver: that driver takes the other bus
    select c.absent_employee_id, c.from_vehicle_id, q.queue_code, q.first_time
    from cc c join public.vehicle_queue q on q.vehicle_id = c.from_vehicle_id and q.work_date = c.work_date
    where c.kind = 'switch' and c.absent_employee_id is not null and c.from_vehicle_id is not null),
  sched as (
    select w.employee_id, w.vehicle_id, coalesce(w.queue_code, q.queue_code) as queue_code, coalesce(w.first_time, q.first_time) as first_time
    from public.work_schedules w left join public.vehicle_queue q on q.vehicle_id = w.vehicle_id and q.work_date = w.work_date
    where w.work_date = d and w.status = 'work' and w.vehicle_id is not null
      and not exists (select 1 from claims c where c.vehicle_id = w.vehicle_id)
      and not exists (select 1 from cc c where c.kind = 'switch' and c.relief_employee_id = w.employee_id))
  select * from claims union select * from sched;

  create temp table _new (employee_id uuid, vehicle_id uuid, kind text, severity text, detail text) on commit drop;

  -- A. ลงเวลาเข้างาน
  insert into _new select r.employee_id, r.vehicle_id, 'clock_in', 'high', 'ยังไม่ลงเวลาเข้างาน (รอบแรก ' || to_char(r.first_time, 'HH24:MI') || ' น.)'
  from _resp r where r.first_time <= cutoff
    and not exists (select 1 from public.work_shifts s where s.work_date = d and s.employee_id = r.employee_id and s.clock_in is not null);
  -- B. ลงเวลาออกงาน (ตรวจหลัง 20:30 หรือวันที่ผ่านไปแล้ว)
  insert into _new select r.employee_id, r.vehicle_id, 'clock_out', 'medium', 'ลงเวลาเข้างานแล้ว แต่ยังไม่ลงเวลาออกงาน (เลขไมล์/แบตกลับ)'
  from _resp r where full_day
    and exists (select 1 from public.work_shifts s where s.work_date = d and s.employee_id = r.employee_id and s.clock_in is not null and s.clock_out is null);
  -- C. ตรวจสภาพรถก่อนออกรถ
  insert into _new select r.employee_id, r.vehicle_id, 'inspection', 'high', 'ยังไม่ตรวจสภาพรถก่อนออกรถ (รอบแรก ' || to_char(r.first_time, 'HH24:MI') || ' น.)'
  from _resp r where r.first_time <= cutoff
    and not exists (select 1 from public.inspections i where i.vehicle_id = r.vehicle_id and (i.inspected_at at time zone 'Asia/Bangkok')::date = d);
  insert into _new select r.employee_id, r.vehicle_id, 'inspection_late', 'low', 'ตรวจสภาพรถหลังเวลาออกรอบแรก (' || to_char(min(i.inspected_at at time zone 'Asia/Bangkok'), 'HH24:MI') || ' น. รอบแรก ' || to_char(r.first_time, 'HH24:MI') || ' น.)'
  from _resp r join public.inspections i on i.vehicle_id = r.vehicle_id and (i.inspected_at at time zone 'Asia/Bangkok')::date = d
  group by r.employee_id, r.vehicle_id, r.first_time
  having min((i.inspected_at at time zone 'Asia/Bangkok')::time) > r.first_time + interval '10 minutes';
  -- D. รายงานรอบเดินรถ (ถ่ายรูปรับออก) — นับเที่ยวที่เลยเวลาออกมาแล้ว 15 นาที
  insert into _new select r.employee_id, r.vehicle_id, 'trips', case when count(*) >= 3 then 'high' else 'medium' end,
    'ไม่รายงานรอบเดินรถ ' || count(*) || ' เที่ยว: ' || string_agg(to_char(p.dep_time, 'HH24:MI'), ', ' order by p.dep_time)
  from _resp r join public.queue_patterns p on p.queue_code = r.queue_code
  where p.dep_time + interval '15 minutes' <= cutoff
    and not exists (select 1 from public.trip_logs t where t.vehicle_id = r.vehicle_id and t.work_date = d and t.scheduled_time = p.dep_time and t.origin = p.origin
                    and (t.photo_path is not null or t.status = 'cancelled'))
  group by r.employee_id, r.vehicle_id;
  -- E. บันทึกผู้โดยสาร ของเที่ยวที่รายงานแล้ว
  insert into _new select r.employee_id, r.vehicle_id, 'pax', 'low',
    'ยังไม่บันทึกผู้โดยสาร ' || count(*) || ' เที่ยว: ' || string_agg(to_char(t.scheduled_time, 'HH24:MI'), ', ' order by t.scheduled_time)
  from _resp r join public.trip_logs t on t.vehicle_id = r.vehicle_id and t.work_date = d and t.photo_path is not null and t.status = 'standby'
  where t.scheduled_time + interval '30 minutes' <= cutoff
    and not exists (select 1 from public.trip_stops s where s.trip_log_id = t.id)
  group by r.employee_id, r.vehicle_id;
  -- F. บันทึกชาร์จแต่ไม่มีไฟล์ใบเสร็จ
  insert into _new select c.employee_id, c.vehicle_id, 'receipt', 'medium', 'บันทึกการชาร์จ ' || count(*) || ' ครั้งไม่มีไฟล์ใบเสร็จ: ' || string_agg(coalesce(c.receipt_no, '–'), ', ')
  from public.charging_records c where c.source = 'app' and c.receipt_path is null and coalesce(c.receipt_date, (c.created_at at time zone 'Asia/Bangkok')::date) = d
  group by c.employee_id, c.vehicle_id;
  -- G. ตรวจพบไม่ปกติ แต่ยังไม่มีงานแจ้งซ่อม → แจ้งคนขับที่ตรวจ และช่างซ่อม
  insert into _new select i.employee_id, i.vehicle_id, 'defect_job', 'medium', 'ตรวจรถพบ "ไม่ปกติ" แต่ยังไม่สร้างงานแจ้งซ่อม'
  from public.inspections i where (i.inspected_at at time zone 'Asia/Bangkok')::date = d and i.result <> 'normal'
    and not exists (select 1 from public.maintenance_jobs m where m.vehicle_id = i.vehicle_id and m.reported_on >= d)
  group by i.employee_id, i.vehicle_id;
  insert into _new select e.id, i.vehicle_id, 'defect_job', 'medium', 'รถตรวจพบ "ไม่ปกติ" วันนี้ ยังไม่มีงานซ่อมรองรับ'
  from public.inspections i cross join public.employees e
  where e.kind = 'technician' and coalesce(e.active, true) and (i.inspected_at at time zone 'Asia/Bangkok')::date = d and i.result <> 'normal'
    and not exists (select 1 from public.maintenance_jobs m where m.vehicle_id = i.vehicle_id and m.reported_on >= d)
  group by e.id, i.vehicle_id;
  -- H. งานซ่อมค้าง (ช่างซ่อม)
  insert into _new select e.id, m.vehicle_id, 'job_stale', case when bool_or(m.vehicle_stopped) then 'high' else 'medium' end,
    'งานซ่อมค้าง ' || count(*) || ' งาน: ' || string_agg(coalesce(m.job_type, 'งานซ่อม') || ' (' ||
      case when m.status = 0 then 'ยังไม่เริ่ม ' || (d - m.reported_on) || ' วัน' else 'ซ่อมมา ' || (d - m.started_on) || ' วัน' end || ')', ', ')
  from public.maintenance_jobs m cross join public.employees e
  where e.kind = 'technician' and coalesce(e.active, true) and m.status < 2
    and ((m.status = 0 and m.reported_on <= d - 2) or (m.status = 1 and m.started_on <= d - 7))
  group by e.id, m.vehicle_id;

  insert into public.compliance_alerts(work_date, employee_id, vehicle_id, kind, severity, detail)
  select d, employee_id, vehicle_id, kind, (array['low','medium','high'])[max(array_position(array['low','medium','high'], severity))], string_agg(distinct detail, ' · ') from _new group by employee_id, vehicle_id, kind
  on conflict (work_date, employee_id, vehicle_id, kind)
  do update set severity = excluded.severity, detail = excluded.detail, resolved_at = null, updated_at = now(),
    ack_at = case when public.compliance_alerts.detail = excluded.detail then public.compliance_alerts.ack_at end;
  get diagnostics n = row_count;

  return jsonb_build_object('date', d, 'checked_until', to_char(cutoff, 'HH24:MI'), 'full_day', full_day,
    'people', (select count(distinct employee_id) from _resp), 'open_alerts', n);
end $$;

-- ========== 2) ข้อมูลคนขับ (ข้อมูลส่วนบุคคล: ผู้จัดการ/ผู้ดูแลระบบ และเจ้าของข้อมูลเท่านั้น) ==========
create table if not exists public.employee_profiles (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  address text,
  phone text,
  birth_date date,
  photo_path text,           -- storage: profiles/<employee_id>/...
  age_years int check (age_years between 15 and 90),   -- อายุตามที่แจ้ง (เมื่อยังไม่มีวันเกิด)
  age_as_of date,                                      -- วันที่แจ้งอายุ (ใช้คำนวณอายุปีต่อไป)
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.employee_profiles enable row level security;
drop policy if exists ep_read on public.employee_profiles;
drop policy if exists ep_write on public.employee_profiles;
create policy ep_read on public.employee_profiles for select to authenticated using (app.is_manager() or employee_id = app.my_employee());
create policy ep_write on public.employee_profiles for all to authenticated using (app.is_manager()) with check (app.is_manager());
drop trigger if exists audit_employee_profiles on public.employee_profiles;
create trigger audit_employee_profiles after insert or update or delete on public.employee_profiles for each row execute function app.audit();

-- รูปโปรไฟล์: bucket ส่วนตัว "profiles"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profiles', 'profiles', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;
drop policy if exists profiles_read on storage.objects;
drop policy if exists profiles_write on storage.objects;
drop policy if exists profiles_delete on storage.objects;
create policy profiles_read on storage.objects for select to authenticated
  using (bucket_id = 'profiles' and (app.is_manager() or (storage.foldername(name))[1] = app.my_employee()::text));
create policy profiles_write on storage.objects for insert to authenticated with check (bucket_id = 'profiles' and app.is_manager());
create policy profiles_delete on storage.objects for delete to authenticated using (bucket_id = 'profiles' and app.is_manager());

alter table public.employee_profiles add column if not exists age_years int check (age_years between 15 and 90);
alter table public.employee_profiles add column if not exists age_as_of date;

-- ข้อมูลที่ผู้จัดการแจ้ง 29 ต.ค. 2569
insert into public.employee_profiles(employee_id, address, phone, age_years, age_as_of)
values ('01ddf6bc-d92f-4f1d-a2f8-c09f3ab8c617', '16 หมู่ 7 ถนนพัฒนาชนบท 3 แขวงลาดกระบัง เขตลาดกระบัง กรุงเทพมหานคร 10520', '082-038-9947', 43, '2026-10-29')
on conflict (employee_id) do update set address = excluded.address, phone = excluded.phone, age_years = excluded.age_years, age_as_of = excluded.age_as_of, updated_at = now();
update public.employees set emp_no = '690603' where id = '01ddf6bc-d92f-4f1d-a2f8-c09f3ab8c617';
insert into public.employee_profiles(employee_id, address, phone, age_years, age_as_of)
values ('1965f2ff-b7c0-4310-a713-91d10672907a', '127 หมู่ 5 ซอยประชาร่วมใจ 35 แขวงทรายกองดินใต้ เขตคลองสามวา กรุงเทพมหานคร 10510', '086-380-4096', 43, '2026-10-29')
on conflict (employee_id) do update set address = excluded.address, phone = excluded.phone, age_years = excluded.age_years, age_as_of = excluded.age_as_of, updated_at = now();
update public.employees set emp_no = '690802' where id = '1965f2ff-b7c0-4310-a713-91d10672907a';

select 'ok' as ready, (select count(*) from public.employee_profiles) as profiles;
