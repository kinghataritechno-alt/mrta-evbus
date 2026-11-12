-- MRTA Shuttle EV · ปรับตารางเดินรถตามช่วงวันที่ (เปลี่ยนคิวของรถ + ตัด/เพิ่ม/เปลี่ยนเวลาเที่ยว) · 12 พ.ย. 2569
-- รันใน Supabase SQL Editor ครั้งเดียว · ใช้กับหน้า "ปรับตารางเดินรถ" ของผู้จัดการ
-- set_queue_range(รถ, วันเริ่ม, วันสุดท้าย, คิวเดิมที่จะเปลี่ยน[], คิวต้นแบบ, รายการเที่ยว, p_dry)
--   รายการเที่ยว = [{"t":"07:30","o":"C"}, ...]  o: C ศูนย์วัฒนธรรมฯ · R สถานี รฟม. · HQ รฟม. สำนักงานใหญ่ · MRT MRT อิสรภาพ
--   เที่ยวตรงกับคิวที่มีอยู่แล้ว → ใช้รหัสนั้น · ไม่ตรง → สร้างรหัสใหม่ "<คิวต้นแบบ>-n" (เช่น ว730-3) ใน queue_patterns
--   เปลี่ยนเฉพาะวันที่รถคันนั้นใช้ "คิวเดิมที่เลือก" อยู่ (วันอื่น เช่น เสาร์–อาทิตย์ หรือรถจอด ไม่แตะ และแสดงให้เห็น)
--   ปรับ vehicle_queue (คิว, รอบแรก, ต้นทาง, จำนวนเที่ยว, departures) + work_schedules ของคนขับรถคันนั้นวันนั้น
--   วันที่ผ่านมาแล้วแก้ไม่ได้ (ประวัติไม่เปลี่ยน) · p_dry = true แสดงผลก่อน · false บันทึกจริง

create or replace function public.set_queue_range(p_vehicle uuid, p_from date, p_to date, p_replace text[], p_base text, p_trips jsonb, p_dry boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  n int; code text; is_new boolean := false; root text; kn int := 2;
  first_t time; first_o text; first_k text; deps jsonb; days jsonb; skipped jsonb;
begin
  if not app.is_manager() then raise exception 'เฉพาะผู้จัดการ'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'ช่วงวันที่ไม่ถูกต้อง'; end if;
  if p_from < app.bkk_today() then raise exception 'ปรับได้ตั้งแต่วันนี้เป็นต้นไป (วันที่ผ่านมาแล้วไม่เปลี่ยน)'; end if;
  if p_to - p_from > 92 then raise exception 'ช่วงวันที่ยาวเกิน 93 วัน'; end if;
  if coalesce(array_length(p_replace, 1), 0) = 0 then raise exception 'เลือกคิวเดิมที่จะเปลี่ยนอย่างน้อย 1 คิว'; end if;
  n := coalesce(jsonb_array_length(p_trips), 0);
  if n = 0 then raise exception 'ต้องมีอย่างน้อย 1 เที่ยว'; end if;
  if exists (select 1 from jsonb_array_elements(p_trips) x where x->>'o' not in ('C','R','HQ','MRT') or (x->>'t') !~ '^\d{2}:\d{2}$') then raise exception 'เวลาหรือต้นทางของเที่ยวไม่ถูกต้อง'; end if;
  if (select count(distinct x->>'t') from jsonb_array_elements(p_trips) x) <> n then raise exception 'มีเวลาออกซ้ำกัน'; end if;

  -- the trips as (no, time, origin) in time order
  create temp table if not exists _qt(trip_no int, dep_time time, origin text, k text) on commit drop; truncate _qt;
  insert into _qt select row_number() over (order by (x->>'t')::time), (x->>'t')::time,
      case x->>'o' when 'C' then 'สถานีศูนย์วัฒนธรรมฯ' when 'R' then 'สถานี รฟม.' when 'HQ' then 'รฟม. สำนักงานใหญ่' else 'MRT อิสรภาพ' end, x->>'o'
    from jsonb_array_elements(p_trips) x;

  -- same trips as an existing queue? (the base queue first)
  select p.queue_code into code from (select distinct queue_code from public.queue_patterns) p
   where (select count(*) from public.queue_patterns q where q.queue_code = p.queue_code) = n
     and not exists (select 1 from _qt t left join public.queue_patterns q on q.queue_code = p.queue_code and q.trip_no = t.trip_no
                      where q.dep_time is distinct from t.dep_time or q.origin is distinct from t.origin)
   order by (p.queue_code = p_base) desc, p.queue_code limit 1;
  if code is null then
    root := regexp_replace(coalesce(nullif(p_base, ''), 'คิว'), '-\d+$', '');
    while exists (select 1 from public.queue_patterns where queue_code = root || '-' || kn) loop kn := kn + 1; end loop;
    code := root || '-' || kn; is_new := true;
  end if;

  select t.dep_time, case t.k when 'C' then 'ศูนย์วัฒนธรรมฯ' else t.origin end, t.k into first_t, first_o, first_k from _qt t order by t.trip_no limit 1;
  select jsonb_agg(jsonb_build_array(to_char(t.dep_time, 'HH24:MI'), t.k) order by t.trip_no) into deps from _qt t;

  select coalesce(jsonb_agg(jsonb_build_object('date', work_date, 'from', queue_code) order by work_date), '[]') into days
    from public.vehicle_queue where vehicle_id = p_vehicle and work_date between p_from and p_to and queue_code = any(p_replace);
  select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'code', vq.queue_code) order by d), '[]') into skipped
    from generate_series(p_from, p_to, interval '1 day') d
    left join public.vehicle_queue vq on vq.vehicle_id = p_vehicle and vq.work_date = d::date
   where vq.queue_code is null or not (vq.queue_code = any(p_replace));

  if not p_dry and jsonb_array_length(days) > 0 then
    if is_new then insert into public.queue_patterns(queue_code, trip_no, dep_time, origin) select code, trip_no, dep_time, origin from _qt; end if;
    -- the driver's schedule first (only the days whose queue is being replaced), then the bus queue
    update public.work_schedules w set queue_code = code, first_time = first_t, first_origin = first_o, updated_at = now()
      from public.vehicle_queue vq
     where w.vehicle_id = p_vehicle and w.status = 'work' and w.work_date between p_from and p_to
       and vq.vehicle_id = p_vehicle and vq.work_date = w.work_date and vq.queue_code = any(p_replace);
    update public.vehicle_queue set queue_code = code, first_time = first_t, first_origin = first_o, planned_trips = n, departures = deps
     where vehicle_id = p_vehicle and work_date between p_from and p_to and queue_code = any(p_replace);
  end if;
  return jsonb_build_object('code', code, 'is_new', is_new, 'trips', n, 'first', to_char(first_t, 'HH24:MI'), 'days', days, 'skipped', skipped);
end $$;
revoke all on function public.set_queue_range(uuid, date, date, text[], text, jsonb, boolean) from public, anon;
grant execute on function public.set_queue_range(uuid, date, date, text[], text, jsonb, boolean) to authenticated;

-- ตรวจ: ควรได้ 1 แถว
select proname from pg_proc where proname = 'set_queue_range';
