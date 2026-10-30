-- MRTA Shuttle EV · แก้ไข / ลบ / เรียกดู บันทึกการชาร์จ (30 ต.ค. 2569) · รันใน Supabase SQL Editor (รันซ้ำได้)
-- สิทธิ์: คนขับ แก้ไข/ลบ รายการของตัวเองได้ถึงวันถัดไป (วันที่ชาร์จ หรือวันรุ่งขึ้น) · ผู้จัดการ/ผู้ดูแลระบบ ได้ทุกเวลา · ทุกครั้งเก็บประวัติใน audit

drop trigger if exists audit_charging_records on public.charging_records;
create trigger audit_charging_records after insert or update or delete on public.charging_records for each row execute function app.audit();

create or replace function app.can_edit_charge(r public.charging_records) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_manager() or (r.employee_id = app.my_employee() and r.source = 'app'
    and coalesce(r.receipt_date, (r.created_at at time zone 'Asia/Bangkok')::date) >= app.bkk_today() - 1)
$$;

create or replace function public.edit_charge(p_id uuid, p jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare r public.charging_records; a int; b int; k numeric; t numeric; path text; st timestamptz; en timestamptz;
begin
  select * into r from public.charging_records where id = p_id for update;
  if not found then raise exception 'ไม่พบบันทึกการชาร์จนี้'; end if;
  if not app.can_edit_charge(r) then raise exception 'แก้ไขได้เฉพาะรายการของตัวเอง ภายในวันถัดไปหลังชาร์จ · เกินกำหนดให้แจ้งผู้จัดการ'; end if;
  a := nullif(p->>'soc_before', '')::int; b := nullif(p->>'soc_after', '')::int;
  k := nullif(p->>'kwh', '')::numeric; t := nullif(p->>'total', '')::numeric;
  path := coalesce(nullif(p->>'receipt_path', ''), r.receipt_path);
  st := coalesce(nullif(p->>'started_at', '')::timestamptz, r.started_at); en := coalesce(nullif(p->>'ended_at', '')::timestamptz, r.ended_at);
  if a is null or b is null or a < 0 or b > 100 or b <= a then raise exception 'แบตหลังชาร์จต้องมากกว่าก่อนชาร์จ และไม่เกิน 100%%'; end if;
  if st is not null and en is not null and en <= st then raise exception 'เวลาสิ้นสุดต้องหลังเวลาเริ่มชาร์จ'; end if;
  if path is distinct from r.receipt_path and path not like r.vehicle_id::text || '/receipt/%' then raise exception 'ไฟล์ใบเสร็จไม่ถูกต้อง'; end if;
  if path is not null and (coalesce(trim(p->>'receipt_no'), '') = '' or coalesce(k, 0) <= 0 or coalesce(t, 0) <= 0) then raise exception 'มีใบเสร็จแล้ว ต้องกรอกเลขที่ใบเสร็จ kWh และยอดรวม'; end if;
  update public.charging_records set
    station = coalesce(nullif(trim(p->>'station'), ''), station), soc_before = a, soc_after = b, started_at = st, ended_at = en,
    receipt_no = nullif(trim(p->>'receipt_no'), ''), ev_ref = nullif(trim(p->>'ev_ref'), ''), kwh = k,
    subtotal = nullif(p->>'subtotal', '')::numeric, vat = nullif(p->>'vat', '')::numeric, total = t, receipt_path = path
  where id = p_id;
end $$;

create or replace function public.delete_charge(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare r public.charging_records;
begin
  select * into r from public.charging_records where id = p_id for update;
  if not found then raise exception 'ไม่พบบันทึกการชาร์จนี้'; end if;
  if not app.can_edit_charge(r) then raise exception 'ลบได้เฉพาะรายการของตัวเอง ภายในวันถัดไปหลังชาร์จ · เกินกำหนดให้แจ้งผู้จัดการ'; end if;
  delete from public.charging_records where id = p_id;  -- ไฟล์ใบเสร็จเดิมยังเก็บไว้ใน storage · แถวเดิมอยู่ใน audit
end $$;

revoke all on function public.edit_charge(uuid, jsonb) from public, anon;
revoke all on function public.delete_charge(uuid) from public, anon;
grant execute on function public.edit_charge(uuid, jsonb) to authenticated;
grant execute on function public.delete_charge(uuid) to authenticated;

-- อัปโหลดใบเสร็จ (แนบภายหลัง หรือเปลี่ยนไฟล์ตอนแก้ไข) ได้ เมื่อมีบันทึกชาร์จของตัวเองที่ยังแก้ได้ของรถคันนั้น
drop policy if exists evidence_receipt_late on storage.objects;
create policy evidence_receipt_late on storage.objects for insert to authenticated with check (
  bucket_id = 'evidence' and (storage.foldername(name))[2] = 'receipt'
  and exists (select 1 from public.charging_records c where c.vehicle_id::text = (storage.foldername(name))[1]
              and (app.is_manager() or (c.employee_id = app.my_employee() and (c.receipt_path is null
                   or coalesce(c.receipt_date, (c.created_at at time zone 'Asia/Bangkok')::date) >= app.bkk_today() - 1)))));

select 'ok' as ready, (select count(*) from pg_proc where proname in ('edit_charge', 'delete_charge')) as functions;
