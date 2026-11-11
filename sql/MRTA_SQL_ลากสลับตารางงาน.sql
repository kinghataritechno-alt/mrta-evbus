-- MRTA Shuttle EV · ลากสลับตารางงาน (สลับวันหยุด / สลับรถระหว่างคน) · 11 พ.ย. 2569
-- รันใน Supabase SQL Editor ครั้งเดียว · ใช้กับหน้า "ตารางงาน" แบบรายสัปดาห์ของผู้จัดการ
-- swap_sched(คน A, วัน A, คน B, วัน B, p_dry)
--   p_dry = true  → แสดงรายการที่จะเปลี่ยน (ยังไม่บันทึก)
--   p_dry = false → บันทึกจริง (ทำทั้งชุดหรือไม่ทำเลย)
-- 1) คนเดียวกัน ต่างวัน (วันหยุด ↔ วันทำงาน) = สลับวันหยุด:
--    วันหยุดเดิม: คนขับมาขับรถของตัวเองตามคิวรถวันนั้น · คนที่เคยขับแทนรถคันนั้นเปลี่ยนเป็น "สำรอง"
--    วันหยุดใหม่: คนขับหยุด · คนขับแทนที่ว่าง (คนเดิมก่อน แล้วคนขับแทน/สแปร์ที่ว่าง) มาขับรถคันนั้น
-- 2) วันเดียวกัน ต่างคน = สลับงานของสองคนวันนั้นทั้งหมด (รถ คิว รอบแรก สถานะ)
-- คิวรถอยู่กับรถเสมอ ไม่ย้ายคิว

create or replace function app.ws_label(p_status text, p_vehicle uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case p_status
    when 'work' then 'ทำงาน ' || coalesce((select code from public.vehicles where id = p_vehicle), '')
    when 'off' then 'วันหยุด' when 'leave' then 'ลา' when 'standby' then 'สำรอง' else 'ยังไม่จัด' end
$$;

create or replace function app.ws_set(p_date date, p_emp uuid, p_status text, p_vehicle uuid, p_queue text,
  p_first public.work_schedules.first_time%type, p_origin text, p_leave text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.work_schedules(work_date, employee_id, status, vehicle_id, queue_code, first_time, first_origin, leave_type, note, approval, created_by, updated_at)
  values (p_date, p_emp, p_status, p_vehicle, p_queue, p_first, p_origin, p_leave, p_note, 'approved', auth.uid(), now())
  on conflict (work_date, employee_id) do update set status = excluded.status, vehicle_id = excluded.vehicle_id, queue_code = excluded.queue_code,
    first_time = excluded.first_time, first_origin = excluded.first_origin, leave_type = excluded.leave_type, note = excluded.note, approval = 'approved', updated_at = now();
end $$;
revoke all on function app.ws_set from public, anon, authenticated;

create or replace function public.swap_sched(p_emp_a uuid, p_date_a date, p_emp_b uuid, p_date_b date, p_dry boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.work_schedules; b public.work_schedules; xw public.work_schedules; r public.work_schedules; cr public.work_schedules;
  vq public.vehicle_queue; o_date date; w_date date; v uuid; c_emp uuid; plan jsonb := '[]'::jsonb;
  nm_x text; nm_a text; nm_b text;
  f_q text; f_t public.work_schedules.first_time%type; f_o text;
begin
  if not app.is_manager() then raise exception 'เฉพาะผู้จัดการ'; end if;
  if least(p_date_a, p_date_b) < app.bkk_today() then raise exception 'สลับได้เฉพาะวันนี้และวันถัดไป (วันที่ผ่านมาแล้วแก้ทีละช่อง)'; end if;
  select * into a from public.work_schedules where employee_id = p_emp_a and work_date = p_date_a;
  select * into b from public.work_schedules where employee_id = p_emp_b and work_date = p_date_b;
  select split_part(full_name, ' ', 1) into nm_a from public.employees where id = p_emp_a;
  select split_part(full_name, ' ', 1) into nm_b from public.employees where id = p_emp_b;

  -- 2) same day, two people: swap everything
  if p_date_a = p_date_b and p_emp_a <> p_emp_b then
    plan := jsonb_build_array(
      jsonb_build_object('date', p_date_a, 'name', nm_a, 'before', app.ws_label(a.status, a.vehicle_id), 'after', app.ws_label(b.status, b.vehicle_id)),
      jsonb_build_object('date', p_date_a, 'name', nm_b, 'before', app.ws_label(b.status, b.vehicle_id), 'after', app.ws_label(a.status, a.vehicle_id)));
    if not p_dry then
      update public.work_schedules set vehicle_id = null, status = 'standby', updated_at = now() where work_date = p_date_a and employee_id in (p_emp_a, p_emp_b);
      perform app.ws_set(p_date_a, p_emp_a, coalesce(b.status, 'standby'), b.vehicle_id, b.queue_code, b.first_time, b.first_origin, b.leave_type, 'สลับงานกับ ' || nm_b);
      perform app.ws_set(p_date_a, p_emp_b, coalesce(a.status, 'standby'), a.vehicle_id, a.queue_code, a.first_time, a.first_origin, a.leave_type, 'สลับงานกับ ' || nm_a);
    end if;
    return plan;
  end if;

  if not (p_emp_a = p_emp_b and p_date_a <> p_date_b) then
    raise exception 'ลากสลับได้ในแถวเดียวกัน (สลับวันหยุดของคนเดียวกัน) หรือในคอลัมน์เดียวกัน (สลับงานสองคนในวันเดียวกัน)';
  end if;

  -- 1) same person: day off <-> work day
  if a.status = 'off' and b.status = 'work' then o_date := p_date_a; w_date := p_date_b; xw := b;
  elsif a.status = 'work' and b.status = 'off' then o_date := p_date_b; w_date := p_date_a; xw := a;
  else raise exception 'สลับวันหยุด: ลากช่อง "วันหยุด" ไปวางบนช่องวันทำงานของคนเดียวกัน (หรือกลับกัน)'; end if;
  v := xw.vehicle_id; nm_x := nm_a;
  if v is null then raise exception 'วันทำงานนี้ยังไม่ได้ระบุรถ'; end if;

  -- day off → the driver works own bus; whoever covered that bus becomes standby
  select * into r from public.work_schedules where work_date = o_date and vehicle_id = v and status = 'work';
  if r.id is not null then f_q := r.queue_code; f_t := r.first_time; f_o := r.first_origin;
  else
    select * into vq from public.vehicle_queue where work_date = o_date and vehicle_id = v;
    if vq.vehicle_id is null then raise exception 'วันที่ % รถ % ไม่มีคิววิ่ง (จอด) — สลับวันนี้ไม่ได้', to_char(o_date, 'DD/MM'), (select code from public.vehicles where id = v); end if;
    f_q := vq.queue_code; f_t := vq.first_time; f_o := vq.first_origin;
  end if;

  -- new day off → a free driver takes the bus (the same cover driver first, then relief, then spare)
  if r.id is not null then
    select * into cr from public.work_schedules where work_date = w_date and employee_id = r.employee_id;
    if cr.id is null or cr.status = 'standby' then c_emp := r.employee_id; end if;
  end if;
  if c_emp is null then
    select e.id into c_emp from public.employees e
      left join public.work_schedules s on s.employee_id = e.id and s.work_date = w_date
     where e.kind in ('relief', 'spare') and e.id <> p_emp_a and (s.id is null or s.status = 'standby')
     order by (e.kind = 'relief') desc, e.code limit 1;
  end if;
  if c_emp is null then raise exception 'วันที่ % ไม่มีคนขับแทนที่ว่าง — เลือกวันอื่น หรือแก้ตารางทีละช่อง', to_char(w_date, 'DD/MM'); end if;
  select * into cr from public.work_schedules where work_date = w_date and employee_id = c_emp;

  if r.id is not null then
    plan := plan || jsonb_build_object('date', o_date, 'name', (select split_part(full_name, ' ', 1) from public.employees where id = r.employee_id), 'before', app.ws_label('work', v), 'after', 'สำรอง');
  end if;
  plan := plan || jsonb_build_object('date', o_date, 'name', nm_x, 'before', 'วันหยุด', 'after', app.ws_label('work', v))
               || jsonb_build_object('date', w_date, 'name', nm_x, 'before', app.ws_label('work', v), 'after', 'วันหยุด')
               || jsonb_build_object('date', w_date, 'name', (select split_part(full_name, ' ', 1) from public.employees where id = c_emp), 'before', app.ws_label(cr.status, cr.vehicle_id), 'after', app.ws_label('work', v));
  if p_dry then return plan; end if;

  if r.id is not null then perform app.ws_set(o_date, r.employee_id, 'standby', null, null, null, null, null, 'ว่าง: ' || nm_x || ' สลับวันหยุดมาทำงาน'); end if;
  perform app.ws_set(o_date, p_emp_a, 'work', v, f_q, f_t, f_o, null, 'สลับวันหยุด (หยุดแทนวันที่ ' || to_char(w_date, 'DD/MM') || ')');
  perform app.ws_set(w_date, p_emp_a, 'off', null, null, null, null, null, 'สลับวันหยุด (มาทำงานวันที่ ' || to_char(o_date, 'DD/MM') || ')');
  perform app.ws_set(w_date, c_emp, 'work', v, xw.queue_code, xw.first_time, xw.first_origin, null, 'แทน ' || nm_x || ' (สลับวันหยุด)');
  return plan;
end $$;
revoke all on function public.swap_sched(uuid, date, uuid, date, boolean) from public, anon;
grant execute on function public.swap_sched(uuid, date, uuid, date, boolean) to authenticated;

-- ตรวจ: ควรได้ 1 แถว
select proname from pg_proc where proname = 'swap_sched';
