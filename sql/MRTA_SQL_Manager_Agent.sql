-- MRTA Shuttle EV · Manager Agent (ตรวจการบันทึกข้อมูลตามขั้นตอน) · จัดทำ 27 ต.ค. 2569

-- 1) แผนเที่ยวของแต่ละคิว (ให้ฐานข้อมูลรู้ว่าเที่ยวไหนต้องรายงานเวลาใด)
create table if not exists public.queue_patterns (
  queue_code text not null, trip_no int not null, dep_time time not null, origin text not null,
  primary key (queue_code, trip_no)
);
alter table public.queue_patterns enable row level security;
drop policy if exists qp_read on public.queue_patterns;
create policy qp_read on public.queue_patterns for select to authenticated using (true);
insert into public.queue_patterns(queue_code,trip_no,dep_time,origin) values
('RED',1,'07:30','สถานี รฟม.'),
('RED',2,'08:00','สถานีศูนย์วัฒนธรรมฯ'),
('RED',3,'09:00','สถานี รฟม.'),
('RED',4,'09:40','สถานีศูนย์วัฒนธรรมฯ'),
('RED',5,'10:20','สถานี รฟม.'),
('RED',6,'13:00','สถานีศูนย์วัฒนธรรมฯ'),
('RED',7,'13:30','สถานี รฟม.'),
('RED',8,'14:00','สถานีศูนย์วัฒนธรรมฯ'),
('RED',9,'15:00','สถานี รฟม.'),
('RED',10,'15:40','สถานีศูนย์วัฒนธรรมฯ'),
('RED',11,'16:20','สถานี รฟม.'),
('RED',12,'17:00','สถานีศูนย์วัฒนธรรมฯ'),
('RED',13,'17:30','สถานี รฟม.'),
('RED',14,'18:10','สถานีศูนย์วัฒนธรรมฯ'),
('RED',15,'19:00','สถานี รฟม.'),
('RED',16,'19:20','สถานีศูนย์วัฒนธรรมฯ'),
('YEL',1,'07:30','สถานีศูนย์วัฒนธรรมฯ'),
('YEL',2,'08:00','สถานี รฟม.'),
('YEL',3,'08:40','สถานีศูนย์วัฒนธรรมฯ'),
('YEL',4,'09:40','สถานี รฟม.'),
('YEL',5,'10:20','สถานีศูนย์วัฒนธรรมฯ'),
('YEL',6,'11:00','สถานี รฟม.'),
('YEL',7,'11:30','สถานีศูนย์วัฒนธรรมฯ'),
('YEL',8,'12:00','สถานี รฟม.'),
('YEL',9,'12:30','สถานีศูนย์วัฒนธรรมฯ'),
('YEL',10,'13:00','สถานี รฟม.'),
('YEL',11,'15:00','สถานีศูนย์วัฒนธรรมฯ'),
('YEL',12,'16:00','สถานี รฟม.'),
('YEL',13,'16:30','สถานีศูนย์วัฒนธรรมฯ'),
('YEL',14,'17:00','สถานี รฟม.'),
('YEL',15,'17:30','สถานีศูนย์วัฒนธรรมฯ'),
('YEL',16,'18:10','สถานี รฟม.'),
('YEL',17,'19:00','สถานีศูนย์วัฒนธรรมฯ'),
('GRN',1,'07:15','สถานีศูนย์วัฒนธรรมฯ'),
('GRN',2,'08:00','สถานี รฟม.'),
('GRN',3,'10:20','สถานี รฟม.'),
('GRN',4,'11:00','สถานีศูนย์วัฒนธรรมฯ'),
('GRN',5,'11:30','สถานี รฟม.'),
('GRN',6,'12:00','สถานีศูนย์วัฒนธรรมฯ'),
('GRN',7,'12:30','สถานี รฟม.'),
('GRN',8,'13:30','สถานีศูนย์วัฒนธรรมฯ'),
('GRN',9,'14:00','สถานี รฟม.'),
('GRN',10,'15:00','สถานีศูนย์วัฒนธรรมฯ'),
('GRN',11,'17:05','สถานี รฟม.'),
('GRN',12,'18:10','สถานีศูนย์วัฒนธรรมฯ'),
('GRN',13,'19:20','สถานี รฟม.'),
('WA',1,'07:15','สถานีศูนย์วัฒนธรรมฯ'),
('WA',2,'08:00','สถานี รฟม.'),
('WA',3,'08:40','สถานีศูนย์วัฒนธรรมฯ'),
('WA',4,'10:20','สถานี รฟม.'),
('WA',5,'11:00','สถานีศูนย์วัฒนธรรมฯ'),
('WA',6,'12:00','สถานี รฟม.'),
('WA',7,'12:30','สถานีศูนย์วัฒนธรรมฯ'),
('WA',8,'13:30','สถานี รฟม.'),
('WA',9,'14:00','สถานีศูนย์วัฒนธรรมฯ'),
('WA',10,'16:00','สถานี รฟม.'),
('WA',11,'16:30','สถานีศูนย์วัฒนธรรมฯ'),
('WA',12,'17:30','สถานี รฟม.'),
('WA',13,'18:10','สถานีศูนย์วัฒนธรรมฯ'),
('WA',14,'19:20','สถานี รฟม.'),
('WB',1,'07:30','สถานีศูนย์วัฒนธรรมฯ'),
('WB',2,'09:00','สถานี รฟม.'),
('WB',3,'09:40','สถานีศูนย์วัฒนธรรมฯ'),
('WB',4,'11:00','สถานี รฟม.'),
('WB',5,'11:30','สถานีศูนย์วัฒนธรรมฯ'),
('WB',6,'12:30','สถานี รฟม.'),
('WB',7,'13:00','สถานีศูนย์วัฒนธรรมฯ'),
('WB',8,'14:00','สถานี รฟม.'),
('WB',9,'15:00','สถานีศูนย์วัฒนธรรมฯ'),
('WB',10,'16:20','สถานี รฟม.'),
('WB',11,'17:00','สถานีศูนย์วัฒนธรรมฯ'),
('WB',12,'18:10','สถานี รฟม.'),
('WB',13,'19:00','สถานีศูนย์วัฒนธรรมฯ'),
('WC',1,'07:30','สถานี รฟม.'),
('WC',2,'08:00','สถานีศูนย์วัฒนธรรมฯ'),
('WC',3,'09:40','สถานี รฟม.'),
('WC',4,'10:20','สถานีศูนย์วัฒนธรรมฯ'),
('WC',5,'11:30','สถานี รฟม.'),
('WC',6,'12:00','สถานีศูนย์วัฒนธรรมฯ'),
('WC',7,'13:00','สถานี รฟม.'),
('WC',8,'13:30','สถานีศูนย์วัฒนธรรมฯ'),
('WC',9,'15:00','สถานี รฟม.'),
('WC',10,'15:40','สถานีศูนย์วัฒนธรรมฯ'),
('WC',11,'17:00','สถานี รฟม.'),
('WC',12,'17:30','สถานีศูนย์วัฒนธรรมฯ'),
('WC',13,'19:00','สถานี รฟม.'),
('WC',14,'19:20','สถานีศูนย์วัฒนธรรมฯ'),
('SA',1,'07:30','สถานีศูนย์วัฒนธรรมฯ'),
('SA',2,'08:00','สถานี รฟม.'),
('SA',3,'09:30','สถานีศูนย์วัฒนธรรมฯ'),
('SA',4,'10:00','สถานี รฟม.'),
('SA',5,'11:30','สถานีศูนย์วัฒนธรรมฯ'),
('SA',6,'12:00','สถานี รฟม.'),
('SA',7,'13:30','สถานีศูนย์วัฒนธรรมฯ'),
('SA',8,'14:00','สถานี รฟม.'),
('SA',9,'15:30','สถานีศูนย์วัฒนธรรมฯ'),
('SA',10,'16:00','สถานี รฟม.'),
('SA',11,'17:30','สถานีศูนย์วัฒนธรรมฯ'),
('SA',12,'18:10','สถานี รฟม.'),
('SB',1,'07:30','สถานี รฟม.'),
('SB',2,'08:30','สถานีศูนย์วัฒนธรรมฯ'),
('SB',3,'09:00','สถานี รฟม.'),
('SB',4,'10:30','สถานีศูนย์วัฒนธรรมฯ'),
('SB',5,'11:00','สถานี รฟม.'),
('SB',6,'12:30','สถานีศูนย์วัฒนธรรมฯ'),
('SB',7,'13:00','สถานี รฟม.'),
('SB',8,'14:30','สถานีศูนย์วัฒนธรรมฯ'),
('SB',9,'15:00','สถานี รฟม.'),
('SB',10,'16:30','สถานีศูนย์วัฒนธรรมฯ'),
('SB',11,'17:00','สถานี รฟม.'),
('SB',12,'18:30','สถานีศูนย์วัฒนธรรมฯ'),
('SC',1,'18:30','สถานี รฟม.'),
('R2',1,'08:30','รฟม. สำนักงานใหญ่'),
('R2',2,'13:00','MRT อิสรภาพ')
on conflict (queue_code,trip_no) do update set dep_time=excluded.dep_time, origin=excluded.origin;

-- 2) รายการแจ้งเตือนจาก Agent
create table if not exists public.compliance_alerts (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  employee_id uuid references public.employees(id),
  vehicle_id uuid references public.vehicles(id),
  kind text not null,                 -- clock_in, clock_out, inspection, inspection_late, trips, pax, receipt, defect_job, job_stale
  severity text not null check (severity in ('high','medium','low')),
  detail text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,            -- Agent ตรวจซ้ำแล้วพบว่าแก้แล้ว
  ack_at timestamptz,                 -- ผู้ถูกแจ้งกด "รับทราบ"
  constraint compliance_one unique nulls not distinct (work_date, employee_id, vehicle_id, kind)
);
create index if not exists compliance_date_idx on public.compliance_alerts(work_date);
alter table public.compliance_alerts enable row level security;
drop policy if exists ca_read on public.compliance_alerts;
drop policy if exists ca_ack on public.compliance_alerts;
create policy ca_read on public.compliance_alerts for select to authenticated
  using (app.is_manager() or employee_id = app.my_employee());
create policy ca_ack on public.compliance_alerts for update to authenticated
  using (app.is_manager() or employee_id = app.my_employee())
  with check (app.is_manager() or employee_id = app.my_employee());

-- ผู้ถูกแจ้งแก้ได้เฉพาะ "รับทราบ" (ack_at) เท่านั้น
create or replace function app.ca_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_manager() and auth.uid() is not null then
    new := old; new.ack_at := coalesce(old.ack_at, now());
  end if;
  return new;
end $$;
drop trigger if exists ca_guard on public.compliance_alerts;
create trigger ca_guard before update on public.compliance_alerts for each row execute function app.ca_guard();

-- 3) Agent: ตรวจการบันทึกของวันที่กำหนด (ค่าเริ่มต้น = วันนี้ เวลาไทย)
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
  with claims as (
    select c.relief_employee_id as employee_id, c.vehicle_id, q.queue_code, q.first_time
    from public.cover_claims c join public.vehicle_queue q on q.vehicle_id = c.vehicle_id and q.work_date = c.work_date
    where c.work_date = d and c.status in ('pending','approved')),
  sched as (
    select w.employee_id, w.vehicle_id, coalesce(w.queue_code, q.queue_code) as queue_code, coalesce(w.first_time, q.first_time) as first_time
    from public.work_schedules w left join public.vehicle_queue q on q.vehicle_id = w.vehicle_id and q.work_date = w.work_date
    where w.work_date = d and w.status = 'work' and w.vehicle_id is not null
      and not exists (select 1 from claims c where c.vehicle_id = w.vehicle_id))
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
revoke all on function public.run_compliance(date) from public, anon;
grant execute on function public.run_compliance(date) to authenticated;

-- 4) ตั้งเวลาให้ Agent ทำงานเอง (เวลาไทย 08:00, 12:00, 16:00, 20:45 และ 07:00 สรุปเมื่อวานซ้ำ)
create extension if not exists pg_cron;
do $u$ declare j text; begin foreach j in array array['agent-0800','agent-1200','agent-1600','agent-2045','agent-yesterday'] loop
  perform cron.unschedule(j) where exists (select 1 from cron.job where jobname = j); end loop; end $u$;
select cron.schedule('agent-0800', '0 1 * * *',  $c$select public.run_compliance()$c$);
select cron.schedule('agent-1200', '0 5 * * *',  $c$select public.run_compliance()$c$);
select cron.schedule('agent-1600', '0 9 * * *',  $c$select public.run_compliance()$c$);
select cron.schedule('agent-2045', '45 13 * * *', $c$select public.run_compliance()$c$);
select cron.schedule('agent-yesterday', '0 0 * * *', $c$select public.run_compliance(app.bkk_today() - 1)$c$);

-- ตรวจผล: รันวันที่ 26 ต.ค. (วันทดลองแรก)
select public.run_compliance('2026-10-26');
