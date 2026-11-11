-- MRTA Shuttle EV · บันทึกวันที่/เวลาชาร์จตามใบเสร็จ กฟน. (11 พ.ย. 2569) · รันใน Supabase SQL Editor (รันซ้ำได้)
-- 1) edit_charge รับ receipt_date (วันที่ตามใบเสร็จ) และ vehicle_id (ผู้จัดการเท่านั้น)
-- 2) attach_receipt รับวันที่และเวลาตามใบเสร็จ (แนบใบเสร็จภายหลังแล้วแก้วันให้ตรงเอง)
-- 3) แก้รายการใบเสร็จ 006911518997 ให้ตรงใบเสร็จ: วันที่ 9 พ.ย. 2569 เวลา 18:02:59 น.

create or replace function public.edit_charge(p_id uuid, p jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare r public.charging_records; a int; b int; k numeric; t numeric; path text; st timestamptz; en timestamptz; dt date; vid uuid;
begin
  select * into r from public.charging_records where id = p_id for update;
  if not found then raise exception 'ไม่พบบันทึกการชาร์จนี้'; end if;
  if not app.can_edit_charge(r) then raise exception 'แก้ไขได้เฉพาะรายการของตัวเอง ภายในวันถัดไปหลังชาร์จ · เกินกำหนดให้แจ้งผู้จัดการ'; end if;
  a := nullif(p->>'soc_before', '')::int; b := nullif(p->>'soc_after', '')::int;
  k := nullif(p->>'kwh', '')::numeric; t := nullif(p->>'total', '')::numeric;
  path := coalesce(nullif(p->>'receipt_path', ''), r.receipt_path);
  st := coalesce(nullif(p->>'started_at', '')::timestamptz, r.started_at); en := coalesce(nullif(p->>'ended_at', '')::timestamptz, r.ended_at);
  dt := coalesce(nullif(p->>'receipt_date', '')::date, r.receipt_date);
  vid := coalesce(nullif(p->>'vehicle_id', '')::uuid, r.vehicle_id);
  if vid <> r.vehicle_id and not app.is_manager() then raise exception 'เปลี่ยนรถได้เฉพาะผู้จัดการ'; end if;
  if not exists (select 1 from public.vehicles where id = vid) then raise exception 'ไม่พบรถคันนี้'; end if;
  if r.receipt_date is not null and abs(dt - r.receipt_date) > 31 then raise exception 'วันที่ตามใบเสร็จห่างจากวันที่บันทึกเกิน 31 วัน · ตรวจใบเสร็จอีกครั้ง'; end if;
  if dt > (now() at time zone 'Asia/Bangkok')::date then raise exception 'วันที่ชาร์จต้องไม่เป็นวันในอนาคต'; end if;
  if a is null or b is null or a < 0 or b > 100 or b <= a then raise exception 'แบตหลังชาร์จต้องมากกว่าก่อนชาร์จ และไม่เกิน 100%%'; end if;
  if st is not null and en is not null and en <= st then raise exception 'เวลาสิ้นสุดต้องหลังเวลาเริ่มชาร์จ'; end if;
  if path is distinct from r.receipt_path and path not like r.vehicle_id::text || '/receipt/%' and path not like vid::text || '/receipt/%' then raise exception 'ไฟล์ใบเสร็จไม่ถูกต้อง'; end if;
  if path is not null and (coalesce(trim(p->>'receipt_no'), '') = '' or coalesce(k, 0) <= 0 or coalesce(t, 0) <= 0) then raise exception 'มีใบเสร็จแล้ว ต้องกรอกเลขที่ใบเสร็จ kWh และยอดรวม'; end if;
  update public.charging_records set
    station = coalesce(nullif(trim(p->>'station'), ''), station), soc_before = a, soc_after = b, started_at = st, ended_at = en,
    receipt_no = nullif(trim(p->>'receipt_no'), ''), ev_ref = nullif(trim(p->>'ev_ref'), ''), kwh = k,
    subtotal = nullif(p->>'subtotal', '')::numeric, vat = nullif(p->>'vat', '')::numeric, total = t, receipt_path = path,
    receipt_date = dt, vehicle_id = vid
  where id = p_id;
end $$;

-- attach_receipt + วันที่/เวลาตามใบเสร็จ (พารามิเตอร์ใหม่มีค่าเริ่มต้น จึงใช้กับแอพรุ่นเก่าได้)
drop function if exists public.attach_receipt(uuid, text, text, text, numeric, numeric, numeric, numeric);
create or replace function public.attach_receipt(p_id uuid, p_path text, p_no text, p_ref text, p_kwh numeric, p_sub numeric, p_vat numeric, p_total numeric,
  p_date date default null, p_start timestamptz default null, p_end timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.charging_records;
begin
  select * into r from public.charging_records where id = p_id for update;
  if not found then raise exception 'ไม่พบบันทึกการชาร์จนี้'; end if;
  if not (app.is_manager() or r.employee_id = app.my_employee()) then raise exception 'แนบใบเสร็จได้เฉพาะผู้บันทึกการชาร์จหรือผู้จัดการ'; end if;
  if r.receipt_path is not null and not app.is_manager() then raise exception 'รายการนี้แนบใบเสร็จแล้ว'; end if;
  if p_path is null or p_path not like r.vehicle_id::text || '/receipt/%' then raise exception 'ไฟล์ใบเสร็จไม่ถูกต้อง'; end if;
  if coalesce(trim(p_no), '') = '' or coalesce(p_kwh, 0) <= 0 or coalesce(p_total, 0) <= 0 then raise exception 'กรุณากรอกเลขที่ใบเสร็จ kWh และยอดรวม'; end if;
  if p_date is not null and (abs(p_date - r.receipt_date) > 31 or p_date > (now() at time zone 'Asia/Bangkok')::date) then raise exception 'วันที่ตามใบเสร็จไม่สมเหตุสมผล · ตรวจใบเสร็จอีกครั้ง'; end if;
  if p_start is not null and p_end is not null and p_end <= p_start then raise exception 'เวลาสิ้นสุดต้องหลังเวลาเริ่มชาร์จ'; end if;
  update public.charging_records set receipt_path = p_path, receipt_no = trim(p_no), ev_ref = coalesce(nullif(trim(p_ref), ''), ev_ref),
    kwh = p_kwh, subtotal = p_sub, vat = p_vat, total = p_total,
    receipt_date = coalesce(p_date, receipt_date), started_at = coalesce(p_start, started_at), ended_at = coalesce(p_end, ended_at)
  where id = p_id;
end $$;
revoke all on function public.attach_receipt(uuid, text, text, text, numeric, numeric, numeric, numeric, date, timestamptz, timestamptz) from public, anon;
grant execute on function public.attach_receipt(uuid, text, text, text, numeric, numeric, numeric, numeric, date, timestamptz, timestamptz) to authenticated;

-- 3) ใบเสร็จ 006911518997 (กฟน. 9 พฤศจิกายน 2569 · BTC01 เวลา 18:02:59 · 61.0070 kWh · 457.55 บาท)
--    ในระบบบันทึกเป็น 10 พ.ย. 04:31–04:33 → แก้วันที่และเวลาสิ้นสุดตามใบเสร็จ · เวลาเริ่มไม่มีในใบเสร็จ จึงล้างออก (ไม่เดา)
do $$
declare nullable text;
begin
  select is_nullable into nullable from information_schema.columns where table_schema = 'public' and table_name = 'charging_records' and column_name = 'started_at';
  update public.charging_records
     set receipt_date = date '2026-11-09', ended_at = timestamptz '2026-11-09 18:02:59+07',
         started_at = case when nullable = 'YES' then null else timestamptz '2026-11-09 18:02:59+07' end, kwh = 61.007
   where receipt_no = '006911518997';
  if not found then raise notice 'ไม่พบใบเสร็จ 006911518997'; end if;
end $$;
-- ทะเบียนบนใบเสร็จคือ 08824 (STC-02) แต่ในระบบบันทึกเป็น STC-03 · ถ้าผู้จัดการยืนยันว่าเป็นรถ STC-02 ให้ลบ -- หน้าบรรทัดล่างแล้วรันบรรทัดนี้:
-- update public.charging_records set vehicle_id = (select id from public.vehicles where code = 'STC-02') where receipt_no = '006911518997';

select 'ok' as ready, receipt_date, to_char(ended_at at time zone 'Asia/Bangkok', 'DD/MM HH24:MI:SS') as ended, (select code from public.vehicles v where v.id = c.vehicle_id) as bus, kwh, total
from public.charging_records c where receipt_no = '006911518997';
