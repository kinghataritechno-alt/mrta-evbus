/* Smart AI — ผู้ช่วยในแอพ: แนะนำวิธีใช้งาน และตรวจรอบเดินรถของวันนี้
   - "เช็ครอบเดินรถ" คำนวณในเครื่องจากข้อมูลจริง (ไม่ใช้ AI ไม่มีค่าใช้จ่าย ตอบทันที)
   - คำถามอื่นส่งไป Edge Function smart-ai (Claude) ซึ่งอ่านข้อมูลด้วยสิทธิ์ของผู้ใช้เอง
   - ถ้ายังไม่ได้ตั้งคีย์ AI หรือเน็ตหลุด จะตอบจากคู่มือในเครื่องแทน */
(function () {
  const HKEY = "mrta-smartai-chat";
  const load = () => { try { return JSON.parse(sessionStorage.getItem(HKEY) || "[]"); } catch (e) { return []; } };
  const save = (h) => { try { sessionStorage.setItem(HKEY, JSON.stringify(h.slice(-30))); } catch (e) {} };
  // ใช้ระบบตอบจากคู่มือในเครื่องเท่านั้น (ฟรี ไม่ส่งข้อมูลออกนอกระบบ) — ตัดสินใจ 27 ต.ค. 2569
  // ถ้าวันหลังจะเปิด AI ภายนอก เปลี่ยน USE_AI เป็น true และตั้งคีย์ใน Edge Function smart-ai
  const USE_AI = false;
  let H = load(), busy = false, aiOff = !USE_AI;

  const FAQ = [
    { k: /ขั้นตอน|ทำอะไรบ้าง|เริ่มงาน|ประจำวัน|ต้องทำ/, a: "ขั้นตอนประจำวันของคนขับครับ\n1. หน้าหลัก → **ลงเวลาเข้างาน** ใส่เลขไมล์และแบต % ก่อนรอบแรก\n2. เมนู **ตรวจสภาพรถ** ก่อนออกรอบแรก ถ่ายรูป กดบันทึก\n3. ทุกเที่ยว → **รายงานรอบเดินรถ** ถ่ายรูปรถ ณ จุดรับออก แล้วส่งกลุ่ม LINE (ภายใน 15 นาทีหลังเวลาออก)\n4. บันทึกผู้โดยสารขึ้น-ลงทุกจุดจอด\n5. ชาร์จไฟทุกครั้ง → **บันทึกการชาร์จ** พร้อมแนบใบเสร็จ\n6. เลิกงาน → **ลงเวลาออกงาน** ใส่เลขไมล์และแบตกลับ" },
    { k: /ถ่ายรูป.*(รอบ|เที่ยว|รับออก)|รายงานรอบ|สแตนด์บาย|ส่งรอบ/, a: "รายงานรอบเดินรถ (สแตนด์บายรับออก) ครับ\n1. หน้าหลัก → ปุ่ม **📷 รายงานรอบเดินรถ**\n2. แตะเที่ยวที่จะออก (เที่ยวถัดไปมีกรอบสีฟ้า)\n3. กด **ถ่ายรูปรถ ณ จุดรับออก** ใส่หมายเหตุถ้ามี (เช่น รถติด)\n4. กด **บันทึกและส่งกลุ่ม LINE** → ① ส่งรูป เลือก LINE → กลุ่ม → ② ส่งข้อความ (คัดลอกไว้ให้แล้ว วางได้เลย)\nควรทำภายใน 15 นาทีหลังเวลาออก เกิน 5 นาทีนับว่าช้าครับ" },
    { k: /ผู้โดยสาร|นับคน|ขึ้น.?ลง|จุดจอด/, a: "บันทึกผู้โดยสารครับ\n1. หน้ารายงานรอบเดินรถ → แตะเที่ยว → **👥 บันทึกผู้โดยสารขึ้น-ลงเที่ยวนี้**\n2. ถึงจุดจอดกด **ถึง** แล้วกด + / − นับคนขึ้นและคนลง\n3. รถออกกด **ออก** แอพจะไปจุดถัดไปเอง\n4. จุดสุดท้ายนับคนลง\nถ้าเน็ตหลุด แอพเก็บไว้ในเครื่องและส่งเองเมื่อเน็ตกลับครับ" },
    { k: /line|ไลน์|ส่งไม่ได้|แชร์/i, a: "ส่ง LINE ไม่ได้ ลองแบบนี้ครับ\n1. เปิดแอพใน **Chrome / Safari** (ถ้าเปิดลิงก์จากใน LINE แอพจะเด้งไปเบราว์เซอร์ให้เอง)\n2. กด **① ส่งรูป** ก่อน เลือกแอพ LINE → เลือกกลุ่ม\n3. กลับมากด **② ส่งข้อความ** แล้ววางในกลุ่ม\nถ้าส่งรูปไม่ได้ แอพจะบันทึกรูปลงเครื่อง ให้แนบจากอัลบั้มใน LINE ครับ" },
    { k: /รูป.*(เปิด|ไม่ขึ้น|ไม่ได้|เสีย)|heif|heic|samsung|ซัมซุง/i, a: "ถ่ายรูปแล้วเปิดไม่ได้ (มักเป็น Samsung/Android) ครับ\n1. เปิดแอพกล้อง → ตั้งค่า → ปิด **รูปภาพประสิทธิภาพสูง (HEIF)**\n2. กลับมาถ่ายใหม่ในแอพ\nถึงแสดงตัวอย่างไม่ได้ แอพยังแนบรูปต้นฉบับเป็นหลักฐานให้ครับ" },
    { k: /ชาร์จ|ใบเสร็จ|ไฟฟ้า/, a: "บันทึกการชาร์จครับ\n1. เมนู **บันทึกการชาร์จ** → เลือกรถ\n2. ใส่ % แบตก่อน/หลัง เวลา และสถานี\n3. แนบใบเสร็จ: กด **ถ่ายใบเสร็จ** หรือ **เลือกรูป/PDF จากเครื่อง** (ถ้ากล้องใช้ไม่ได้)\n4. กดบันทึก\nทุกครั้งที่ชาร์จต้องมีใบเสร็จครับ" },
    { k: /ตรวจสภาพ|ตรวจรถ|ไม่ปกติ|ชำรุด|เสีย(?!ง)/, a: "ตรวจสภาพรถก่อนออกรอบแรกครับ\n1. เมนู **ตรวจสภาพรถ** ติ๊กทุกรายการ ใส่เลขไมล์ แบต % ถ่ายรูป กดบันทึก\n2. ถ้าพบ **ไม่ปกติ** ให้ไปเมนู **ซ่อมบำรุง** แจ้งซ่อม และแจ้งผู้จัดการ\nถ้ารถเสียกลางทาง ให้จอดในที่ปลอดภัยและโทรแจ้งผู้จัดการทันทีครับ" },
    { k: /ลงเวลา|เข้างาน|ออกงาน|เลขไมล์/, a: "ลงเวลาครับ\n• เข้างาน: หน้าหลัก → **ลงเวลาเข้างาน · เลขไมล์ · แบตเตอรี่** ก่อนรอบแรก (ค่าเริ่มดึงจากการตรวจรถ แก้ได้)\n• เลิกงาน: ปุ่มเดิม → **ลงเวลาออกงาน** ใส่เลขไมล์และแบตกลับ" },
    { k: /รับรถแทน|ขับแทน|ลาป่วย|ขาดงาน/, a: "รับรถแทน (คนขับสำรอง/สแปร์) ครับ\n1. หน้าหลัก → หัวข้อ **รับรถแทน** เลือกรถที่คนขับยังไม่เริ่มงาน\n2. เลือกคนที่ขาดและเหตุผล\n3. ใช้รถได้ทันที ผู้จัดการอนุมัติภายหลัง\nถ้าตัวเองจะลา แจ้งผู้จัดการล่วงหน้าครับ" },
    { k: /อุบัติเหตุ|ชน|เฉี่ยว/, a: "เกิดอุบัติเหตุครับ\n1. หยุดรถในที่ปลอดภัย ดูแลผู้โดยสารก่อน\n2. โทรแจ้งผู้จัดการทันที\n3. ในแอพ เมนู **แจ้งอุบัติเหตุ** ถ่ายรูปและเล่าเหตุการณ์" },
    { k: /วันหยุด|ตารางงาน|หยุดวัน|กะ|m3/i, a: "ดูวันทำงาน/วันหยุดของคุณที่เมนู **ตารางงาน** ครับ (รอบ 26 ถึง 25 ของเดือนถัดไป)\nวันหยุดประจำ: ณภัทร อาทิตย์ · สุปราณี ศุกร์ · สุชาติ เสาร์ · สุรินทร พฤหัสบดี · ฐิติณัฏฐ์ จันทร์\nกะ M3 = 06:30–15:30 น." },
    { k: /รหัส|password|ล็อกอิน|login|เข้าระบบ/i, a: "เข้าระบบไม่ได้ ตรวจชื่อผู้ใช้ (เช่น Driver4) และรหัสผ่านให้ถูก ไม่มีเว้นวรรคครับ ถ้ายังไม่ได้ ให้แจ้งผู้จัดการ\nใช้บัญชีของตัวเองเท่านั้น และอย่าบอกรหัสผ่านกับใคร (รวมถึง Smart AI) ครับ" },
    { k: /แจ้งเตือน|manager agent|รับทราบ/i, a: "กล่อง **Manager Agent แจ้งเตือน** บนหน้าหลัก คือข้อมูลที่ยังบันทึกไม่ครบครับ\nแตะหัวข้อเพื่อไปบันทึก แล้วกด **รับทราบ** ระบบตรวจซ้ำเวลา 08:00 12:00 16:00 20:45 น. และลบออกเองเมื่อบันทึกครบ" },
  ];
  FAQ.push(
    { k: /สาย|เส้นทาง|จุดจอด|ป้าย|ศิริราช|อิสรภาพ|r1|r2/i, a: "เส้นทางเดินรถครับ\n• **R1** (STC-01, STC-02, STC-04): อาคารจอดรถศูนย์วัฒนธรรมฯ → อาคาร 2 รฟม. → อาคาร 1 รฟม. → ลานจอดรถ สถานี รฟม. และย้อนกลับ\n• **R2** (STC-03): MRT อิสรภาพ – รพ.ศิริราช วันละ 3 เที่ยว · 08:30 จาก รฟม. สำนักงานใหญ่ → MRT อิสรภาพ · 11:00 และ 13:00 จาก MRT อิสรภาพ วนผ่าน รพ.ศิริราช กลับ MRT อิสรภาพ · วิ่งทุกวัน วันละ 1 คัน" },
    { k: /ตารางเดินรถ|เวลาออก|กี่โมง|กลุ่มสี|คิว|รหัส|แดง|เหลือง|เขียว|ว715|ว730|ร730|สว730|สร730|ศ830/, a: "รหัสคิว = อักษรต้นทาง + เวลาเที่ยวแรก ครับ (ว = ออกศูนย์วัฒนธรรมฯ · ร = ออกสถานี รฟม. · ศ = ศิริราช · ส นำหน้า = เสาร์–อาทิตย์/นักขัตฤกษ์)\n• วันธรรมดา: **ร730** STC-01 16 เที่ยว · **ว730** STC-02 17 เที่ยว · **ว715** STC-04 13 เที่ยว\n• วันหยุด: **สว730** 12 เที่ยว · **สร730** 12 เที่ยว (รถของคนที่หยุดจอด)\n• ทุกวัน: **ศ830** STC-03 ศิริราช 3 เที่ยว\nเวลาทุกเที่ยวของรถคุณวันนี้ ดูได้ที่ **รายงานรอบเดินรถ** หรือกด **เช็ครอบเดินรถของฉันวันนี้** ครับ" },
    { k: /แอพค้าง|ค้าง|ช้า|ไม่อัปเดต|หน้าเก่า|รีเฟรช/, a: "แอพค้างหรือแสดงหน้าเก่าครับ\n1. ปิดแท็บแอพ\n2. เปิดลิงก์ https://mrta-evbus.vercel.app ใหม่ใน Chrome / Safari\n3. ถ้ายังไม่หาย ตรวจว่าเน็ตใช้ได้ แล้วแจ้งผู้จัดการ" },
    { k: /ย้อนหลัง|ลืมบันทึก|บันทึกผิด|แก้ไข/, a: "บันทึกผิดหรือลืมบันทึกครับ\n• ภายในวันเดียวกัน: เข้าเมนูเดิมแล้วบันทึกใหม่ได้ (เช่น ถ่ายรูปรอบเดินรถใหม่จะแทนรูปเดิม)\n• วันก่อนหน้า: คนขับแก้เองไม่ได้ ให้แจ้งผู้จัดการแก้ให้ครับ" },
  );
  const CHIPS = ["🚌 เช็ครอบเดินรถของฉันวันนี้", "📋 ขั้นตอนประจำวัน", "📷 ถ่ายรูปรายงานรอบยังไง", "👥 บันทึกผู้โดยสารยังไง", "📤 ส่ง LINE ไม่ได้", "🖼️ ถ่ายรูปแล้วเปิดไม่ได้", "⚡ แนบใบเสร็จชาร์จ"];
  const AV = `<img class="ai-av" src="assets/img/smartai-96.png?v=2" alt="" width="34" height="34">`;
  const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
  const faq = (q) => (FAQ.find((f) => f.k.test(q)) || {}).a;

  /* ---------- ตรวจรอบเดินรถในเครื่อง (ข้อมูลจริง สิทธิ์เดียวกับหน้ารายงานรอบเดินรถ) ---------- */
  async function tripCheck() {
    const d = ME.date, vs = isMgr() || role() === "CUSTOMER" ? VEH : myVehicles();
    if (!vs.length) return `วันนี้คุณไม่มีรถที่ได้รับมอบหมายครับ (${ME.schedule?.status === "off" ? "วันหยุด" : ME.schedule?.status === "standby" ? "เป็นคนขับสำรอง" : "ดูเมนูตารางงาน"})`;
    const ids = vs.map((v) => v.id);
    const [qv, logs, stops] = await Promise.all([
      q(sb.from("vehicle_queue").select("vehicle_id,queue_code").eq("work_date", d).in("vehicle_id", ids)),
      q(sb.from("trip_logs").select("id,vehicle_id,scheduled_time,origin,status,photo_path,taken_at").eq("work_date", d).in("vehicle_id", ids)),
      q(sb.from("trip_stops").select("trip_log_id").eq("work_date", d).in("vehicle_id", ids)).catch(() => []),
    ]);
    const now = minsOf(nowHM()), out = [];
    for (const v of vs) {
      const qq = qv.find((x) => x.vehicle_id === v.id);
      if (!qq) { out.push(`**${v.code}** ไม่มีคิววันนี้ (รถจอด)`); continue; }
      const plan = tripsOf(qq.queue_code); let done = 0; const miss = [], nopax = []; let next = null;
      plan.forEach((t) => {
        const l = logs.find((x) => x.vehicle_id === v.id && String(x.scheduled_time).slice(0, 5) === t.time && x.origin === t.origin);
        if (l && (l.photo_path || l.status === "cancelled")) { done++; if (l.status !== "cancelled" && !stops.some((s) => s.trip_log_id === l.id) && minsOf(t.time) + 30 <= now) nopax.push(t.time); }
        else if (minsOf(t.time) + 15 <= now) miss.push(t.time);
        else if (!next) next = t;
      });
      let s = `**${v.code}** คิว ${qq.queue_code} · รายงานแล้ว **${done}/${plan.length}** เที่ยว`;
      s += miss.length ? `\n❗ ยังไม่รายงาน ${miss.length} เที่ยว: ${miss.join(", ")}` : "\n✅ เที่ยวที่เลยเวลาแล้ว รายงานครบ";
      if (nopax.length) s += `\n👥 ยังไม่บันทึกผู้โดยสาร: ${nopax.join(", ")}`;
      s += next ? `\n⏭️ เที่ยวถัดไป **${next.time}** จาก${next.origin}` : "\n🏁 ไม่มีเที่ยวเหลือวันนี้";
      out.push(s);
    }
    const anyMiss = out.some((x) => x.includes("❗"));
    return out.join("\n\n") + (anyMiss ? "\n\nเที่ยวที่ยังไม่รายงาน: ไปที่ **รายงานรอบเดินรถ** → แตะเที่ยวนั้น → ถ่ายรูป → บันทึก (ถ้าเป็นวันก่อน ให้แจ้งผู้จัดการแก้ให้)" : "");
  }

  async function askAI(hist) {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(CFG.url + "/functions/v1/smart-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CFG.key, Authorization: "Bearer " + (session ? session.access_token : CFG.key) },
      body: JSON.stringify({ messages: hist.filter((m) => !m.local).map((m) => ({ role: m.role, content: m.content })).slice(-10) }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.reply) return { text: j.reply };
    if (j.code === "no_key") aiOff = true;
    return { err: j.code || r.status, msg: j.error };
  }

  async function send(text) {
    text = String(text || "").trim(); if (!text || busy) return;
    busy = true; H.push({ role: "user", content: text }); draw(true);
    let reply, local = false;
    try {
      if (/เช็ครอบ|ตรวจรอบ|รอบเดินรถของฉัน|ขาดเที่ยว|ยังไม่รายงาน|เที่ยวถัดไป|รายงานครบ/.test(text)) { reply = await tripCheck(); local = true; }
      else if (aiOff || !navigator.onLine) { reply = faq(text); local = true; }
      else {
        const r = await askAI(H);
        if (r.text) reply = r.text;
        else { local = true; reply = faq(text) || (r.err === "no_key" ? "ตอนนี้ Smart AI ตอบได้เฉพาะหัวข้อในคู่มือครับ (ยังไม่ได้เปิดใช้ AI เต็มรูปแบบ) ลองเลือกหัวข้อด้านล่าง หรือสอบถามผู้จัดการ" : (r.msg || "Smart AI ไม่ว่างชั่วคราว ลองใหม่อีกครั้งครับ")); }
      }
      if (!reply) reply = "ยังไม่มีคำตอบเรื่องนี้ในคู่มือครับ ลองถามด้วยคำสั้น ๆ เช่น \"ส่งไลน์\" \"ชาร์จ\" \"ผู้โดยสาร\" \"ตรวจรถ\" \"วันหยุด\" \"เส้นทาง\" หรือเลือกหัวข้อด้านล่าง ถ้าเป็นเรื่องอื่นให้สอบถามผู้จัดการครับ";
    } catch (e) { local = true; reply = (e && e.message === STALE) ? null : (faq(text) || "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้งครับ"); }
    busy = false;
    if (reply == null) return;
    if (local) H[H.length - 1].local = true; // keep locally answered turns out of the AI history
    H.push({ role: "assistant", content: reply, local }); save(H);
    if (location.hash.startsWith("#ai")) draw(false);
  }

  function draw(thinking) {
    const box = $("aiLog"); if (!box) return;
    const name = (ME.employee?.name || PROFILE.display_name || "").split(" ")[0];
    box.innerHTML = `<div class="ai-hero"><img src="assets/img/smartai-full.jpg?v=2" alt="Smart AI"><div><b>Smart AI</b><span>ผู้ช่วยคนขับ MRTA Shuttle Bus EV</span></div></div><div class="ai-row">${AV}<div class="ai-msg bot">สวัสดีครับ${name ? " คุณ" + esc(name) : ""} ผม <b>Smart AI</b> ผู้ช่วยของแอพ Smart Shuttle Bus EV<br>ถามวิธีใช้งาน หรือให้ผมเช็ครอบเดินรถของวันนี้ได้เลยครับ</div></div>` +
      H.map((m) => m.role === "user" ? `<div class="ai-msg me">${md(m.content)}</div>` : `<div class="ai-row">${AV}<div class="ai-msg bot">${md(m.content)}</div></div>`).join("") +
      (thinking ? `<div class="ai-row">${AV}<div class="ai-msg bot"><span class="spin"></span> กำลังคิด…</div></div>` : "");
    box.scrollTop = box.scrollHeight; scrollTo(0, document.body.scrollHeight);
  }

  window.aiPage = async function () {
    main().innerHTML = `<div class="ai-wrap"><div id="aiLog" class="ai-log" aria-live="polite"></div>
      <div class="ai-chips">${CHIPS.map((c) => `<button class="chip" data-aq="${esc(c.replace(/^\S+\s/, ""))}">${esc(c)}</button>`).join("")}</div>
      <form id="aiF" class="ai-form"><input id="aiQ" maxlength="500" autocomplete="off" placeholder="พิมพ์คำถาม เช่น ชาร์จแล้วแนบใบเสร็จยังไง"><button class="btn pri" id="aiS" aria-label="ส่ง">ส่ง</button></form>
      <p class="sm" style="margin:6px 2px 0">Smart AI ตอบจากคู่มือของโครงการ และอ่านข้อมูลได้อย่างเดียว ไม่บันทึกแทนคุณ · อย่าพิมพ์รหัสผ่าน${H.length ? ` · <a href="#" id="aiClr">ล้างแชท</a>` : ""}</p></div>`;
    draw(false);
    main().querySelectorAll("[data-aq]").forEach((b) => (b.onclick = () => send(b.dataset.aq)));
    $("aiF").onsubmit = (e) => { e.preventDefault(); const v = $("aiQ").value; $("aiQ").value = ""; send(v); };
    if ($("aiClr")) $("aiClr").onclick = (e) => { e.preventDefault(); H = []; save(H); aiPage(); };
  };

  /* ปุ่มลอยเรียก Smart AI จากทุกหน้า (ยกเว้นหน้าแชทเอง) */
  function fab() {
    let b = document.getElementById("aiFab");
    if (!b) { b = document.createElement("a"); b.id = "aiFab"; b.href = "#ai"; b.className = "ai-fab"; b.setAttribute("aria-label", "Smart AI ผู้ช่วย"); b.innerHTML = `<img src="assets/img/smartai-96.png?v=2" alt="" width="40" height="40"><b>Smart AI</b>`; document.body.appendChild(b); }
    b.hidden = !PROFILE || /^#(ai|password|tripstops|inspect|charge)/.test(location.hash); // keep counters and forms clear
  }
  window.addEventListener("hashchange", fab);
  const t0 = setInterval(() => { if (typeof PROFILE !== "undefined" && PROFILE) { clearInterval(t0); fab(); } }, 300);
})();
