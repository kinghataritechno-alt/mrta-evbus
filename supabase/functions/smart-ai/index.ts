// Smart AI — ผู้ช่วยในแอพ Smart Shuttle Bus EV (MRTA Shuttle EV)
// - ตอบคำถามวิธีใช้แอพ / กฎของโครงการ และตรวจรอบเดินรถของผู้ถามจากข้อมูลจริง
// - อ่านข้อมูลด้วย JWT ของผู้ใช้เอง (RLS เดียวกับในแอพ): คนขับเห็นเฉพาะรถของตัวเองวันนี้
// - คีย์ Claude อยู่ใน Edge Function secret ANTHROPIC_API_KEY เท่านั้น ไม่อยู่ในโค้ดฝั่งมือถือ
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const MODEL = Deno.env.get("SMART_AI_MODEL") || "claude-haiku-5-5";
const DAILY_LIMIT = Number(Deno.env.get("SMART_AI_DAILY_LIMIT") || 60); // ข้อความต่อคนต่อวัน

const KNOWLEDGE = `
# โครงการ
- MRTA Shuttle EV Bus ของ รฟม. (การรถไฟฟ้าขนส่งมวลชนแห่งประเทศไทย) ผู้ให้บริการ บริษัท สมาร์ท เทอร์มินอล คอร์ปอเรชั่น จำกัด
- รถบัสไฟฟ้า 4 คัน: STC-01 (08804) STC-02 (08824) STC-04 (08960) วิ่งสาย R1 ศูนย์วัฒนธรรมฯ – สถานี รฟม. · STC-03 (08958) วิ่งสาย R2 MRT อิสรภาพ – รพ.ศิริราช
- เริ่มใช้แอพจริง 1 พ.ย. 2569 · 26–31 ต.ค. 2569 เป็นช่วงทดลอง (ข้อมูลช่วงทดลองจะถูกล้างก่อนใช้จริง)
- จุดจอด R1 ขาไป: อาคารจอดรถศูนย์วัฒนธรรมฯ → อาคาร 2 รฟม. → อาคาร 1 รฟม. → ลานจอดรถ สถานี รฟม. · ขากลับ: ลานจอดรถ สถานี รฟม. → อาคาร 2 → อาคาร 1 → ศูนย์วัฒนธรรมฯ
- R2 (STC-03) วิ่งวันละ 2 รอบ: รอบ 1 08:30 จาก รฟม. สำนักงานใหญ่ · รอบ 2 13:00 จาก MRT อิสรภาพ (จอด รพ.ศิริราช, The Most, dBura, วัดอรุณฯ, ซอยอรุณอมรินทร์ 53, หอพักเจ้าพระยา ฯลฯ)

# คนขับและวันหยุด
- ณภัทร ทองวงศ์ษา STC-01 หยุดอาทิตย์ · สุปราณี รักสกุล STC-02 หยุดศุกร์ · สุชาติ รองเมือง STC-03 หยุดเสาร์ · สุรินทร เสาโกมุท STC-04 หยุดพฤหัสบดี
- ฐิติณัฏฐ์ รัตนชูชัย (คนขับสำรอง ขับได้ทุกคัน) ขับแทน STC-04 วันพฤหัส และ STC-02 วันศุกร์ · หยุดวันจันทร์ · วันอื่นเป็นสำรอง (M3)
- ชุติมา บูรณ์เจริญ (สแปร์) ไม่มีตารางประจำ รับรถแทนเมื่อมีคนลา/ฉุกเฉิน
- จันทร์–ศุกร์ วิ่ง 4 คัน · เสาร์ อาทิตย์ และวันหยุดนักขัตฤกษ์ วิ่ง 3 คัน ไม่มีคนขับแทน (เสาร์ STC-03 จอด ไม่มีเที่ยวศิริราช · อาทิตย์ STC-01 จอด)
- กะ M3 = 06:30–15:30 น. · รหัสลา O วันหยุดประจำสัปดาห์ · H นักขัตฤกษ์ · AB ลาไม่รับค่าจ้าง · V ลาพักร้อน · S ลาป่วย · P ลากิจ
- รอบตารางงาน/ใบรับรองเวลา คือวันที่ 26 ถึง 25 ของเดือนถัดไป · รายงานชาร์จไฟรายเดือนใช้ 1 ถึงสิ้นเดือน

# ตารางเดินรถวันธรรมดา (กลุ่มสี ตามที่ รฟม. กำหนด, ร = สถานี รฟม., ศ = ศูนย์วัฒนธรรมฯ)
- STC-01 กลุ่มแดง 16 เที่ยว: 07:30ร 08:00ศ 09:00ร 09:40ศ 10:20ร 13:00ศ 13:30ร 14:00ศ 15:00ร 15:40ศ 16:20ร 17:00ศ 17:30ร 18:10ศ 19:00ร 19:20ศ
- STC-02 กลุ่มเหลือง 17 เที่ยว: 07:30ศ 08:00ร 08:40ศ 09:40ร 10:20ศ 11:00ร 11:30ศ 12:00ร 12:30ศ 13:00ร 15:00ศ 16:00ร 16:30ศ 17:00ร 17:30ศ 18:10ร 19:00ศ
- STC-04 กลุ่มเขียว 13 เที่ยว: 07:15ศ 08:00ร 10:20ร 11:00ศ 11:30ร 12:00ศ 12:30ร 13:30ศ 14:00ร 15:00ศ 17:05ร 18:10ศ 19:20ร (08:00 และ 10:20 ออกจาก รฟม. ทั้งคู่ เพื่อช่วยวิ่งให้คันอื่นพักชาร์จ)
- วันหยุดใช้คิวหมุน SA/SB/SC · ตารางของวันนั้นดูได้ในแอพ "รายงานรอบเดินรถ"

# ขั้นตอนประจำวันของคนขับ (ตามลำดับ)
1. เข้าแอพด้วยบัญชีของตัวเองเท่านั้น (Driver1–Driver6) ห้ามใช้บัญชีคนอื่น · คนขับและช่างไม่ต้องเปลี่ยนรหัสผ่าน ลืมรหัสให้แจ้งผู้จัดการ
2. หน้าหลัก → ปุ่ม "ลงเวลาเข้างาน · เลขไมล์ · แบตเตอรี่" ก่อนรอบแรก (ค่าเริ่มดึงจากการตรวจรถ แก้ได้)
3. เมนู "ตรวจสภาพรถ" ก่อนออกรอบแรก: ติ๊กรายการตรวจ ใส่เลขไมล์ แบต % ถ่ายรูป กดบันทึก · ถ้าพบไม่ปกติ ให้ไปเมนู "ซ่อมบำรุง" แจ้งซ่อม
4. ทุกเที่ยว: ปุ่ม "รายงานรอบเดินรถ (สแตนด์บายรับออก)" → แตะเที่ยว → "ถ่ายรูปรถ ณ จุดรับออก" → ใส่หมายเหตุถ้ามี → "บันทึกและส่งกลุ่ม LINE" ต้องทำภายใน 15 นาทีหลังเวลาออก (เกิน 5 นาทีนับว่าช้า)
   - ส่ง LINE: ปุ่ม ① ส่งรูป (เลือกแอพ LINE → กลุ่ม) แล้ว ② ส่งข้อความ (ข้อความคัดลอกไว้แล้ว วางได้เลย) · ถ้าส่งรูปไม่ได้ แอพจะบันทึกรูปลงเครื่อง ให้แนบจากอัลบั้มใน LINE
   - ถ้าเปิดลิงก์แอพจากใน LINE แอพจะเด้งไปเปิดในเบราว์เซอร์ปกติ (Chrome/Safari) เพื่อให้ส่งรูปได้
5. บันทึกผู้โดยสาร: ในหน้ารอบเดินรถ แตะเที่ยว → "บันทึกผู้โดยสารขึ้น-ลงเที่ยวนี้" → ทุกจุดจอดกด "ถึง" ใช้ปุ่ม +/− นับคนขึ้น/ลง แล้วกด "ออก" · จุดสุดท้ายนับคนลง · เน็ตหลุดบันทึกค้างไว้ในเครื่อง ส่งเองเมื่อเน็ตกลับ ควรบันทึกภายใน 30 นาที
6. ชาร์จไฟ: เมนู "บันทึกการชาร์จ" ใส่ % แบตก่อน/หลัง เวลา สถานี แนบใบเสร็จ (ถ่ายด้วยกล้อง หรือเลือกรูป/PDF จากเครื่อง) ทุกครั้งต้องมีใบเสร็จ
7. อุบัติเหตุ: เมนู "แจ้งอุบัติเหตุ" ถ่ายรูป เล่าเหตุการณ์ แจ้งผู้จัดการทันที
8. เลิกงาน: หน้าหลัก → "ลงเวลาออกงาน" ใส่เลขไมล์และแบตกลับ
- รับรถแทน (ฐิติณัฏฐ์/ชุติมา): หน้าหลัก → "รับรถแทน" เลือกรถ คนที่ขาด และเหตุผล ใช้รถได้ทันที ผู้จัดการอนุมัติภายหลัง
- ตารางงานและ PDF ใบรับรองเวลา: เมนู "ตารางงาน" / หน้า PDF แท็บ "ใบรับรองเวลา/การใช้รถ"
- กล่องแจ้งเตือน "Manager Agent" บนหน้าหลัก = ข้อมูลที่ยังบันทึกไม่ครบ แตะหัวข้อเพื่อไปบันทึก แล้วกด "รับทราบ" ระบบตรวจซ้ำเวลา 08:00 12:00 16:00 20:45 และลบออกเองเมื่อครบ

# ปัญหาที่พบบ่อย
- ถ่ายรูปแล้วเปิดไม่ได้ / รูปไม่ขึ้น (Samsung/Android): ตั้งค่ากล้อง → ปิด "รูปภาพประสิทธิภาพสูง (HEIF)" แล้วถ่ายใหม่ · แอพยังแนบรูปต้นฉบับให้ได้
- ส่ง LINE ไม่ได้บน Android: เปิดแอพใน Chrome (ไม่ใช่ใน LINE) กดส่งรูปก่อน แล้วส่งข้อความ
- เข้าระบบไม่ได้: ตรวจชื่อผู้ใช้ (เช่น Driver4) และรหัสผ่าน ไม่มีเว้นวรรค · ยังไม่ได้ให้แจ้งผู้จัดการ
- ใบเสร็จแนบไม่ได้: ใช้ปุ่ม "เลือกรูป/PDF จากเครื่อง" แทนกล้อง
- บันทึกย้อนหลังวันก่อน: คนขับทำไม่ได้ ต้องให้ผู้จัดการแก้
- แอพค้าง/หน้าเก่า: ปิดแท็บแล้วเปิดลิงก์ https://mrta-evbus.vercel.app ใหม่
`;

const RULES = `คุณคือ "Smart AI" ผู้ช่วยในแอพ Smart Shuttle Bus EV ของโครงการ MRTA Shuttle EV
- ตอบภาษาไทย สุภาพ ลงท้าย "ครับ" สั้น กระชับ อ่านง่ายบนมือถือ เป็นขั้นตอนตัวเลขเมื่ออธิบายวิธีใช้ ไม่ใช้ตาราง markdown
- ใช้เฉพาะข้อมูลใน <knowledge> และ <live_data> ห้ามเดาหรือแต่งข้อมูล ตัวเลข เวลา ชื่อคน หรือนโยบายที่ไม่มีในข้อมูล ถ้าไม่ทราบให้บอกตรง ๆ และแนะนำให้สอบถามผู้จัดการ
- ตรวจรอบเดินรถ: อ่านจาก <live_data> บอกว่าเที่ยวไหนรายงานแล้ว เที่ยวไหนยังไม่รายงาน (เลยเวลาแล้ว) เที่ยวถัดไปคือเวลาใด และบันทึกผู้โดยสารครบหรือยัง แล้วบอกวิธีแก้
- ห้ามบอก ถาม หรือเก็บรหัสผ่าน ห้ามแนะนำให้ใช้บัญชีคนอื่น ห้ามเปิดเผยข้อมูลคนอื่นที่ไม่มีใน <live_data>
- ห้ามบอกว่าได้บันทึก ส่ง หรือแก้ไขข้อมูลให้แล้ว คุณอ่านได้อย่างเดียว ผู้ใช้ต้องกดบันทึกในแอพเอง
- เรื่องความปลอดภัย อุบัติเหตุ รถเสียกลางทาง ให้หยุดรถในที่ปลอดภัย แจ้งผู้จัดการทันที แล้วบันทึกในแอพ
- ไม่ตอบเรื่องที่ไม่เกี่ยวกับงานโครงการนี้ ให้ชวนกลับมาที่เรื่องงานอย่างสุภาพ`;

const hm = (t: string) => String(t || "").slice(0, 5);
const bkkHM = (ts: string) => new Date(Date.parse(ts) + 7 * 36e5).toISOString().slice(11, 16);
const toMin = (t: string) => { const [h, m] = hm(t).split(":").map(Number); return h * 60 + m; };

async function liveData(sb: ReturnType<typeof createClient>) {
  const { data: me, error } = await sb.rpc("my_today");
  if (error || !me) return { text: "ไม่สามารถอ่านข้อมูลของผู้ใช้ได้", me: null };
  const d = me.date as string, nowMin = toMin(new Date(Date.now() + 7 * 36e5).toISOString().slice(11, 16));
  const lines: string[] = [`วันที่ ${d} เวลาตอนนี้ ${new Date(Date.now() + 7 * 36e5).toISOString().slice(11, 16)} น.`,
    `ผู้ใช้: ${me.employee?.name || "-"} บทบาท ${me.role}${me.employee?.kind ? ` (${me.employee.kind})` : ""}`,
    `สถานะตามตารางวันนี้: ${me.schedule?.status || "ไม่มีข้อมูล"}`];
  const mgr = ["ADMIN", "MANAGER"].includes(me.role);
  let vids: string[] = (me.vehicles || []).map((v: { id: string }) => v.id);
  const { data: vehs } = await sb.from("vehicles").select("id,code,plate,route_code").order("code");
  if (mgr || me.role === "CUSTOMER") vids = (vehs || []).map((v: { id: string }) => v.id);
  if (!vids.length) lines.push("วันนี้ผู้ใช้ไม่มีรถที่ได้รับมอบหมาย");
  if (vids.length) {
    const [qv, logs, stops, insp, pats] = await Promise.all([
      sb.from("vehicle_queue").select("vehicle_id,queue_code,first_time,first_origin,planned_trips").eq("work_date", d).in("vehicle_id", vids),
      sb.from("trip_logs").select("id,vehicle_id,scheduled_time,origin,status,photo_path,taken_at,note").eq("work_date", d).in("vehicle_id", vids),
      sb.from("trip_stops").select("trip_log_id,board,alight,departed_at").eq("work_date", d).in("vehicle_id", vids),
      me.role === "CUSTOMER" ? Promise.resolve({ data: [] }) : sb.from("inspections").select("vehicle_id,result,inspected_at").in("vehicle_id", vids).gte("inspected_at", d + "T00:00:00+07:00"),
      sb.from("queue_patterns").select("queue_code,trip_no,dep_time,origin"),
    ]);
    for (const vid of vids) {
      const v = (vehs || []).find((x: { id: string }) => x.id === vid); if (!v) continue;
      const q = (qv.data || []).find((x: { vehicle_id: string }) => x.vehicle_id === vid);
      if (!q) { lines.push(`\n${v.code}: ไม่มีคิววันนี้ (รถจอด)`); continue; }
      const plan = (pats.data || []).filter((p: { queue_code: string }) => p.queue_code === q.queue_code).sort((a: { trip_no: number }, b: { trip_no: number }) => a.trip_no - b.trip_no);
      const ins = (insp.data || []).filter((x: { vehicle_id: string }) => x.vehicle_id === vid);
      lines.push(`\n${v.code} (${v.plate}) คิว ${q.queue_code} แผน ${plan.length || q.planned_trips} เที่ยว รอบแรก ${hm(q.first_time)} จาก${q.first_origin}`);
      lines.push(ins.length ? `ตรวจสภาพรถแล้ว ${bkkHM(ins[0].inspected_at)} น. ผล ${ins[0].result === "normal" ? "ปกติ" : "ไม่ปกติ"}` : "ยังไม่ได้ตรวจสภาพรถวันนี้");
      if (!plan.length) lines.push("(ไม่มีรายละเอียดเที่ยวในฐานข้อมูล)");
      let done = 0, missed: string[] = [], next = "";
      for (const p of plan) {
        const l = (logs.data || []).find((x: { vehicle_id: string; scheduled_time: string; origin: string }) => x.vehicle_id === vid && hm(x.scheduled_time) === hm(p.dep_time) && x.origin === p.origin);
        const st = l ? (stops.data || []).filter((s: { trip_log_id: string }) => s.trip_log_id === l.id) : [];
        const pax = st.length ? ` ผู้โดยสารขึ้น ${st.reduce((a: number, s: { board: number }) => a + s.board, 0)} ลง ${st.reduce((a: number, s: { alight: number }) => a + s.alight, 0)}` : "";
        let s: string;
        if (l && l.status === "cancelled") { s = "ยกเลิก"; done++; }
        else if (l && l.photo_path) { done++; const late = toMin(bkkHM(l.taken_at)) > toMin(p.dep_time) + 5; s = `รายงานแล้ว ${bkkHM(l.taken_at)} น.${late ? " (ช้า)" : ""}${pax || " ยังไม่บันทึกผู้โดยสาร"}`; }
        else if (toMin(p.dep_time) + 15 <= nowMin) { s = `ยังไม่รายงาน (เลยเวลาแล้ว)${pax}`; missed.push(hm(p.dep_time)); }
        else { s = "ยังไม่ถึงเวลา"; if (!next) next = `${hm(p.dep_time)} จาก${p.origin}`; }
        lines.push(`- เที่ยว ${p.trip_no} ${hm(p.dep_time)} ${p.origin}: ${s}`);
      }
      lines.push(`สรุป ${v.code}: รายงานแล้ว ${done}/${plan.length} เที่ยว${missed.length ? ` · ขาด ${missed.join(", ")}` : ""}${next ? ` · เที่ยวถัดไป ${next}` : ""}`);
    }
  }
  if (me.employee?.id) {
    const [sh, al] = await Promise.all([
      sb.from("work_shifts").select("clock_in,clock_out,odo_start,soc_start").eq("work_date", d).eq("employee_id", me.employee.id).maybeSingle(),
      sb.from("compliance_alerts").select("kind,detail,ack_at").eq("employee_id", me.employee.id).is("resolved_at", null).gte("work_date", d),
    ]);
    const s = sh.data;
    lines.push(`\nลงเวลา: ${s?.clock_in ? `เข้างาน ${bkkHM(s.clock_in)} น.` : "ยังไม่ลงเวลาเข้างาน"}${s?.clock_out ? ` · ออกงาน ${bkkHM(s.clock_out)} น.` : ""}`);
    if (al.data?.length) lines.push("แจ้งเตือนจาก Manager Agent ที่ยังค้าง: " + al.data.map((a: { detail: string }) => a.detail).join(" | "));
  }
  return { text: lines.join("\n"), me };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json({ error: "กรุณาเข้าสู่ระบบใหม่" }, 401);
  let body: { messages?: { role: string; content: string }[] } = {};
  try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  const msgs = (body.messages || []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json({ error: "ไม่มีคำถาม" }, 400);
  while (msgs[0].role !== "user") msgs.shift();

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ code: "no_key", error: "ยังไม่ได้ตั้งค่าคีย์ AI" }, 503);

  // จำกัดจำนวนข้อความต่อวัน (นับใน ai_usage ถ้ามีตาราง)
  const day = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
  const { data: used } = await sb.rpc("ai_use", { p_day: day });
  if (typeof used === "number" && used > DAILY_LIMIT) return json({ code: "limit", error: `ใช้ Smart AI ครบ ${DAILY_LIMIT} ข้อความของวันนี้แล้ว พรุ่งนี้ใช้ได้ใหม่` }, 429);

  const live = await liveData(sb);
  const system = `${RULES}\n\n<knowledge>${KNOWLEDGE}</knowledge>\n\n<live_data>\n${live.text}\n</live_data>`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 800, system, messages: msgs }),
  });
  if (!r.ok) { const t = await r.text(); console.error("anthropic", r.status, t.slice(0, 300)); return json({ code: "upstream", error: "Smart AI ไม่ว่างชั่วคราว ลองใหม่อีกครั้ง" }, 502); }
  const out = await r.json();
  const text = (out.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim();
  return json({ reply: text || "ขออภัยครับ ตอบไม่ได้ ลองถามใหม่อีกครั้ง" });
});
