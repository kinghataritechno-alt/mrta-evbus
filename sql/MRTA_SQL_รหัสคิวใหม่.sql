-- MRTA Shuttle EV — เปลี่ยนรหัสคิวเป็น "อักษรต้นทาง + เวลาเที่ยวแรก" (ผู้จัดการอนุมัติ 31 ต.ค. 2569)
-- ว = ออกศูนย์วัฒนธรรมฯ · ร = ออกสถานี รฟม. · ศ = ศิริราช · ส นำหน้า = เสาร์–อาทิตย์/นักขัตฤกษ์
-- RED→ร730 · YEL→ว730 · GRN→ว715 · SA→สว730 · SB→สร730 · R2→ศ830 · ลบ SC, WA, WB, WC (ไม่ได้ใช้แล้ว)
-- route_code (R1/R2) ของรถและ trip_logs ไม่เปลี่ยน — เป็นรหัสเส้นทาง ไม่ใช่รหัสคิว
begin;

create temp table qmap(old text primary key, new text not null) on commit drop;
insert into qmap values ('RED','ร730'),('YEL','ว730'),('GRN','ว715'),('SA','สว730'),('SB','สร730'),('R2','ศ830');

delete from public.queue_patterns where queue_code in ('SC','WA','WB','WC');
update public.queue_patterns p set queue_code = m.new from qmap m where p.queue_code = m.old;
update public.vehicle_queue  t set queue_code = m.new from qmap m where t.queue_code = m.old;
update public.work_schedules t set queue_code = m.new from qmap m where t.queue_code = m.old;
update public.trip_logs      t set queue_code = m.new from qmap m where t.queue_code = m.old;

-- ตรวจ: ต้องไม่เหลือรหัสเดิมในตารางใด
do $$
declare n int;
begin
  select (select count(*) from public.queue_patterns where queue_code !~ '^(ร730|ว730|ว715|สว730|สร730|ศ830)$')
       + (select count(*) from public.vehicle_queue  where queue_code in ('RED','YEL','GRN','SA','SB','SC','R2','WA','WB','WC'))
       + (select count(*) from public.work_schedules where queue_code in ('RED','YEL','GRN','SA','SB','SC','R2','WA','WB','WC'))
       + (select count(*) from public.trip_logs      where queue_code in ('RED','YEL','GRN','SA','SB','SC','R2','WA','WB','WC'))
  into n;
  if n > 0 then raise exception 'ยังเหลือรหัสเดิม % แถว', n; end if;
end $$;

commit;

select queue_code, count(*) as trips, min(dep_time) as first_trip from public.queue_patterns group by 1 order by 1;
