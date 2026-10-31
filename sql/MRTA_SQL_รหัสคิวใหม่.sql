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

-- เพิ่ม 31 ต.ค. 2569 12:15: วันหยุด STC-03 วิ่งเที่ยว 18:30 สถานี รฟม. → ศูนย์วัฒนธรรมฯ เพิ่ม (คำขอผู้ใช้) → รหัส สศ830 (4 เที่ยว)
insert into public.queue_patterns (queue_code, trip_no, dep_time, origin) values
 ('สศ830',1,'08:30','รฟม. สำนักงานใหญ่'),('สศ830',2,'11:00','MRT อิสรภาพ'),('สศ830',3,'13:00','MRT อิสรภาพ'),('สศ830',4,'18:30','สถานี รฟม.')
on conflict do nothing;
-- วันหยุดในตาราง (31 ต.ค., 1, 7, 8, 14, 15, 21, 22, 28, 29 พ.ย.): STC-03 ศ830 → สศ830, planned_trips 4 (vehicle_queue + work_schedules)
