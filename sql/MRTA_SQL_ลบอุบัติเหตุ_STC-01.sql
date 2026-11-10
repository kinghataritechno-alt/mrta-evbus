-- MRTA Shuttle EV · ลบข้อมูลอุบัติเหตุ STC-01 ทั้ง 2 รายการ (ผู้จัดการสั่ง 10 พ.ย. 2569) · รันใน Supabase SQL Editor
-- 1) อุบัติเหตุ 7 ส.ค. 2569 กระจกมองข้างด้านขวาโดนรถบัสเฉี่ยวชน (กำลังซ่อม)
-- 2) อุบัติเหตุ 10 พ.ย. 2569 กระจกมองข้างขวาครูด (แจ้งซ่อม)
-- ลบทั้งงานซ่อมในเมนูซ่อมบำรุง และบันทึกในแท็บอุบัติเหตุ · ถ้าจำนวนไม่ตรงที่คาด ระบบจะยกเลิกทั้งหมด ไม่ลบอะไรเลย
-- รูปถ่ายใน storage ยังเก็บไว้ · แถวที่ลบยังอยู่ในประวัติ audit (ถ้าตารางมี trigger)

do $$
declare v uuid; nj int; na int;
begin
  select id into v from public.vehicles where code = 'STC-01';
  -- งานซ่อมจากอุบัติเหตุของ STC-01 สองรายการที่เห็นในหน้าซ่อมบำรุง
  delete from public.maintenance_jobs
   where vehicle_id = v and job_type = 'อุบัติเหตุ'
     and (description like 'ซ่อมจากอุบัติเหตุ 7 ส.ค. 2569%' or description like 'ซ่อมจากอุบัติเหตุ 10 พ.ย. 2569%');
  get diagnostics nj = row_count;
  if nj <> 2 then raise exception 'งานซ่อมที่ตรงเงื่อนไขมี % รายการ (คาดว่า 2) · ยกเลิก ไม่ลบอะไร', nj; end if;
  -- บันทึกอุบัติเหตุของ STC-01 วันที่ 7 ส.ค. และ 10 พ.ย. 2569
  delete from public.accidents
   where vehicle_id = v and (occurred_at at time zone 'Asia/Bangkok')::date in (date '2026-08-07', date '2026-11-10');
  get diagnostics na = row_count;
  if na > 2 then raise exception 'บันทึกอุบัติเหตุที่ตรงเงื่อนไขมี % รายการ (เกิน 2) · ยกเลิก ไม่ลบอะไร', na; end if;
  raise notice 'ลบงานซ่อม % รายการ · บันทึกอุบัติเหตุ % รายการ', nj, na;
end $$;

-- ตรวจผล: ควรเหลือ 0 ทั้งสองช่อง
select
  (select count(*) from public.maintenance_jobs j join public.vehicles x on x.id = j.vehicle_id where x.code = 'STC-01' and j.job_type = 'อุบัติเหตุ'
     and (j.description like 'ซ่อมจากอุบัติเหตุ 7 ส.ค. 2569%' or j.description like 'ซ่อมจากอุบัติเหตุ 10 พ.ย. 2569%')) as jobs_left,
  (select count(*) from public.accidents a join public.vehicles x on x.id = a.vehicle_id where x.code = 'STC-01'
     and (a.occurred_at at time zone 'Asia/Bangkok')::date in (date '2026-08-07', date '2026-11-10')) as accidents_left;
