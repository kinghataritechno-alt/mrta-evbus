-- MRTA Shuttle EV · สายศิริราช (STC-03 · คิว R2) เปลี่ยนเป็นวันละ 3 เที่ยว (30 ต.ค. 2569) · รันใน Supabase SQL Editor (รันซ้ำได้)
-- เที่ยว 1 08:30 รฟม. สำนักงานใหญ่ → รพ.ศิริราช → MRT อิสรภาพ
-- เที่ยว 2 11:00 MRT อิสรภาพ วนผ่าน รพ.ศิริราช กลับ MRT อิสรภาพ (เดิมอยู่ในรอบเช้า)
-- เที่ยว 3 13:00 MRT อิสรภาพ วนผ่าน รพ.ศิริราช กลับ MRT อิสรภาพ

-- แผนเที่ยวที่ Manager Agent ใช้ตรวจการรายงาน
insert into public.queue_patterns(queue_code, trip_no, dep_time, origin) values
  ('R2', 1, '08:30', 'รฟม. สำนักงานใหญ่'),
  ('R2', 2, '11:00', 'MRT อิสรภาพ'),
  ('R2', 3, '13:00', 'MRT อิสรภาพ')
on conflict (queue_code, trip_no) do update set dep_time = excluded.dep_time, origin = excluded.origin;

-- จำนวนเที่ยวตามแผนของ STC-03 ทุกวัน (ตั้งแต่วันนี้เป็นต้นไป)
update public.vehicle_queue set planned_trips = 3 where queue_code = 'R2' and work_date >= date '2026-10-30';

-- ตรวจของวันนี้ใหม่ทันที (ระบบจะตรวจเองตามเวลาปกติอยู่แล้ว)
select public.run_compliance(app.bkk_today());

select 'ok' as ready,
  (select count(*) from public.queue_patterns where queue_code = 'R2') as r2_trips,
  (select count(*) from public.vehicle_queue where queue_code = 'R2' and work_date >= date '2026-10-30' and planned_trips = 3) as days_updated;
