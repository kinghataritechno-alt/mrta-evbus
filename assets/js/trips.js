/* Smart Shuttle Bus EV — trip check-in (สแตนด์บายรับออก) for every trip + monthly trip report.
   Each trip: driver takes a photo → app stamps date/time, vehicle, trip and origin on it → saved to trip_logs + Storage
   → share to the LINE group (photo via share sheet, text copied to clipboard). */
const ORIGIN = { C: "สถานีศูนย์วัฒนธรรมฯ", R: "สถานี รฟม.", HQ: "รฟม. สำนักงานใหญ่", MRT: "MRT อิสรภาพ" };
const TRIP_PAT = {
  // weekday colour-group plan (ตารางเดินรถ MRTA Shuttle Bus จ.–ศ. แยกกลุ่มสี, confirmed 26 ต.ค. 2569)
  RED: "07:30R 08:00C 09:00R 09:40C 10:20R 13:00C 13:30R 14:00C 15:00R 15:40C 16:20R 17:00C 17:30R 18:10C 19:00R 19:20C", // กลุ่มสีแดง STC-01 (จ.–ศ.)
  YEL: "07:30C 08:00R 08:40C 09:40R 10:20C 11:00R 11:30C 12:00R 12:30C 13:00R 15:00C 16:00R 16:30C 17:00R 17:30C 18:10R 19:00C", // กลุ่มสีเหลือง STC-02 (จ.–ศ.)
  GRN: "07:15C 08:00R 10:20R 11:00C 11:30R 12:00C 12:30R 13:30C 14:00R 15:00C 17:05R 18:10C 19:20R", // กลุ่มสีเขียว STC-04 (จ.–ศ.)
  WA: "07:15C 08:00R 08:40C 10:20R 11:00C 12:00R 12:30C 13:30R 14:00C 16:00R 16:30C 17:30R 18:10C 19:20R",
  WB: "07:30C 09:00R 09:40C 11:00R 11:30C 12:30R 13:00C 14:00R 15:00C 16:20R 17:00C 18:10R 19:00C",
  WC: "07:30R 08:00C 09:40R 10:20C 11:30R 12:00C 13:00R 13:30C 15:00R 15:40C 17:00R 17:30C 19:00R 19:20C",
  SA: "07:30C 08:00R 09:30C 10:00R 11:30C 12:00R 13:30C 14:00R 15:30C 16:00R 17:30C 18:10R",
  SB: "07:30R 08:30C 09:00R 10:30C 11:00R 12:30C 13:00R 14:30C 15:00R 16:30C 17:00R 18:30C",
  SC: "18:30R",
  R2: "08:30HQ 13:00MRT",
};
const tripsOf = (qc) => (TRIP_PAT[qc] || "").split(" ").filter(Boolean).map((s, i) => ({ no: i + 1, time: s.slice(0, 5), origin: ORIGIN[s.slice(5)] }));
const LATE_MIN = 5; // บันทึกหลังเวลาออกเกินกี่นาทีถือว่าช้า
const minsOf = (hm) => { const [h, m] = String(hm).slice(0, 5).split(":").map(Number); return h * 60 + m; };
const bkkHM = (ts) => tHM(ts);
const tl = (p) => q(p).catch((e) => { if (/trip_logs|relation|schema cache/i.test(errMsg(e))) throw new Error("ระบบรายงานรอบเดินรถยังไม่เปิดใช้ในฐานข้อมูล (รอรัน SQL trip_logs)"); throw e; });
let TRIP = { date: null, vid: null, blob: null, url: null, trip: null };

async function tripPage() {
  if (!TRIP.date) TRIP.date = ME.date;
  const vs = isMgr() || role() === "CUSTOMER" ? VEH : myVehicles();
  if (!vs.length) { main().innerHTML = `<div class="empty"><b>วันนี้ยังไม่มีรถที่ได้รับมอบหมาย</b>บันทึกรอบเดินรถได้เมื่อมีรถในตารางงานของวันนี้</div>`; return; }
  if (!TRIP.vid || !vs.some((v) => v.id === TRIP.vid)) TRIP.vid = vs[0].id;
  const v = vById(TRIP.vid);
  const [qrow, logs, stops] = await Promise.all([
    q(sb.from("vehicle_queue").select("*").eq("work_date", TRIP.date).eq("vehicle_id", TRIP.vid)),
    tl(sb.from("trip_logs").select("*").eq("work_date", TRIP.date).eq("vehicle_id", TRIP.vid).order("scheduled_time")),
    q(sb.from("trip_stops").select("trip_log_id,board,alight").eq("work_date", TRIP.date).eq("vehicle_id", TRIP.vid)).catch(() => []),
  ]);
  const pax = (l) => { const r = stops.filter((x) => x.trip_log_id === l.id); return r.length ? { b: r.reduce((s, x) => s + x.board, 0), a: r.reduce((s, x) => s + x.alight, 0) } : null; };
  const paxDay = stops.reduce((s, x) => s + x.board, 0);
  const qq = qrow[0], plan = qq ? tripsOf(qq.queue_code) : [];
  const logOf = (t) => logs.find((l) => String(l.scheduled_time).slice(0, 5) === t.time && l.origin === t.origin);
  const done = (t) => { const l = logOf(t); return l && (l.photo_path || l.status === "cancelled") ? l : null; }; // reported = photo taken (or cancelled)
  const now = TRIP.date === today() ? minsOf(nowHM()) : TRIP.date < today() ? 9999 : -1;
  const nextIdx = plan.findIndex((t) => !done(t) && minsOf(t.time) >= now - 30);
  const nDone = plan.filter(done).length;
  const extra = logs.filter((l) => !plan.some((t) => t.time === String(l.scheduled_time).slice(0, 5) && t.origin === l.origin));
  main().innerHTML = `${isMgr() || role() === "CUSTOMER" ? `<div class="grid"><div class="fld"><label for="tDate">วันที่</label><input type="date" id="tDate" value="${TRIP.date}"></div></div>` : ""}
   ${busPicker(vs, TRIP.vid, "data-tv")}
   <section class="sum"><div class="tile"><small>ตามแผน</small><b class="num">${plan.length || "–"}</b><span>${qq?.queue_code === "R2" ? "รอบ" : "เที่ยว"}</span></div><div class="tile"><small>รายงานแล้ว</small><b class="num">${nDone}</b><span>${qq?.queue_code === "R2" ? "รอบ" : "เที่ยว"}</span></div><div class="tile ${plan.length - nDone > 0 && now === 9999 ? "alert" : ""}"><small>ยังไม่รายงาน</small><b class="num">${Math.max(0, plan.length - nDone)}</b><span>${qq?.queue_code === "R2" ? "รอบ" : "เที่ยว"}</span></div></section>
   ${qq ? `<p class="sm" style="margin:8px 0 0">${v.code} · คิว ${esc(qq.queue_code)} · ${ROUTE[v.route_code] || ""} · ${bk(TRIP.date)}${paxDay ? ` · ผู้โดยสารขึ้นวันนี้ <b>${paxDay}</b> คน` : ""}</p>` : `<div class="empty" style="margin-top:12px"><b>${v.code} ไม่มีคิววันนี้</b>รถจอดหรือยังไม่ได้จัดตาราง</div>`}
   <div class="list" style="margin-top:8px">${plan.map((t, i) => { const l = done(t), late = l && minsOf(bkkHM(l.taken_at)) > minsOf(t.time) + LATE_MIN;
     return `<button class="day trip ${i === nextIdx ? "today" : ""}" data-trip="${i}" style="text-align:left;cursor:pointer;border-left:4px solid ${l ? (late ? "#ffb347" : "#3fa725") : i === nextIdx ? "#1fc2ff" : "transparent"}">
       <div class="d"><b class="num">${t.time}</b><small>${qq.queue_code === "R2" ? "รอบ " + t.no : "เที่ยว " + t.no}</small></div>
       <div class="sm">${esc(t.origin)}${!l && logOf(t) && pax(logOf(t)) ? `<em class="sub2">ยังไม่ถ่ายรูปรับออก · ขึ้น ${pax(logOf(t)).b} ลง ${pax(logOf(t)).a}</em>` : ""}${l ? `<em class="sub2">${l.status === "cancelled" ? "ยกเลิก" : `รายงาน ${bkkHM(l.taken_at)} น.${late ? " · ช้า" : ""}${pax(l) ? ` · ขึ้น ${pax(l).b} ลง ${pax(l).a}` : ""}`}</em>` : i === nextIdx ? `<em class="sub2">เที่ยวถัดไป · แตะเพื่อถ่ายรูปรายงาน</em>` : ""}</div></button>`; }).join("")}
   ${extra.map((l) => `<div class="day"><div class="d"><b class="num">${String(l.scheduled_time).slice(0, 5)}</b><small>เพิ่ม</small></div><div class="sm">${esc(l.origin)}<em class="sub2">รายงาน ${bkkHM(l.taken_at)} น. ${esc(l.note || "")}</em></div></div>`).join("")}</div>
   ${isMgr() || role() === "CUSTOMER" ? `<a class="btn block" href="#tripreport" style="margin-top:14px">รายงานรอบเดินรถประจำเดือน</a>` : ""}`;
  main().querySelectorAll("[data-tv]").forEach((b) => (b.onclick = () => { TRIP.vid = b.dataset.tv; tripPage(); }));
  if ($("tDate")) $("tDate").onchange = (e) => { if (e.target.value) { TRIP.date = e.target.value; tripPage(); } };
  main().querySelectorAll("[data-trip]").forEach((b) => (b.onclick = () => tripSheet(v, qq, plan[+b.dataset.trip], done(plan[+b.dataset.trip]) || null)));
}

function lineText(v, qq, t, note) {
  const isR2 = qq.queue_code === "R2";
  const head = isR2 ? `${v.code} สแตนด์บาย รับออก รอบที่ ${t.no}\nเวลา ${t.time.replace(":", ".")} น.\n${ROUTE.R2}` : `${v.code} สแตนด์บายรับออก\nรอบ ${t.time} น. ${t.origin}`;
  return head + (note ? `\n${note}` : "");
}

function tripSheet(v, qq, t, existing) {
  const s = $("sheet"); TRIP.blob = null; TRIP.trip = t;
  const canEdit = isMgr() || (role() === "DRIVER" && TRIP.date === today());
  s.innerHTML = `<div class="in"><div class="sh"><b>${v.code} · ${qq.queue_code === "R2" ? "รอบที่ " + t.no : "เที่ยว " + t.no} · ${t.time} น.</b><button class="lnk" id="shX">ปิด</button></div>
    <p class="sm" style="margin:0 0 10px">สแตนด์บายรับออก ${esc(t.origin)}</p>
    ${existing ? `<p class="notice ok" style="margin:0 0 10px">รายงานแล้ว ${bkkHM(existing.taken_at)} น.${existing.photo_path ? ` · <a href="#" id="tOld">ดูรูป</a>` : ""} · ถ่ายใหม่จะแทนที่ของเดิม</p>` : ""}
    ${canEdit ? `<label class="btn block pri" style="min-height:54px">📷 ถ่ายรูปรถ ณ จุดรับออก<input type="file" id="tCam" accept="image/*" capture="environment" hidden></label>
    <img id="tPrev" alt="" style="display:none;width:100%;border-radius:12px;margin-top:10px">
    <div class="fld" style="margin-top:10px"><label for="tNote">หมายเหตุ (ถ้ามี)</label><input id="tNote" placeholder="เช่น รถติด ออกช้า 5 นาที" value="${esc(existing?.note || "")}"></div>
    <div style="display:grid;gap:8px;margin-top:10px"><button class="btn block pri" id="tSave" disabled>บันทึกและส่งกลุ่ม LINE</button>
    <button class="btn block" id="tPax">👥 บันทึกผู้โดยสารขึ้น-ลงเที่ยวนี้</button>
    ${isMgr() ? `<button class="btn block" id="tCancel">บันทึกว่ายกเลิกเที่ยวนี้</button>` : ""}</div>` : `<p class="sm">บันทึกย้อนหลังได้เฉพาะผู้จัดการ</p>`}</div>`;
  s.hidden = false;
  $("shX").onclick = () => (s.hidden = true);
  if ($("tOld")) $("tOld").onclick = async (e) => { e.preventDefault(); const [u] = await signed([existing.photo_path]); if (u) { $("vImg").src = u; $("viewer").hidden = false; } };
  if (!canEdit) return;
  $("tCam").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const shot = new Date();
    TRIP.blob = await stampPhoto(f, [`${shot.getDate()} ${MS[shot.getMonth()]} ${shot.getFullYear() + 543} ${shot.toTimeString().slice(0, 8)}`, `${v.code} · ${qq.queue_code === "R2" ? "รอบที่ " + t.no : "รอบ " + t.time + " น."}`, t.origin]);
    if (!TRIP.blob) return; // reason already shown
    if (TRIP.url) URL.revokeObjectURL(TRIP.url);
    TRIP.url = URL.createObjectURL(TRIP.blob); $("tPrev").src = TRIP.url; $("tPrev").style.display = "block"; $("tSave").disabled = false;
  };
  $("tSave").onclick = () => saveTrip(v, qq, t, "standby");
  $("tPax").onclick = () => openStops(v, qq, t);
  if ($("tCancel")) $("tCancel").onclick = () => saveTrip(v, qq, t, "cancelled");
}

/* draw photo + yellow timestamp block (bottom-right), like the camera-stamp photos used in the LINE group */
async function stampPhoto(file, lines, max = 1600) {
  const d = await decodeImage(file, max);
  if (!d) return rawPhoto(file); // cannot stamp: keep the original photo; the record still has the time it was taken
  const c = document.createElement("canvas"); c.width = d.w; c.height = d.h;
  const g = c.getContext("2d"); g.drawImage(d.src, 0, 0, d.w, d.h); if (d.url) URL.revokeObjectURL(d.url); if (d.src.close) d.src.close();
  const fs = Math.round(c.width * 0.04), lh = fs * 1.25, pad = Math.round(fs * 0.7);
  g.font = `700 ${fs}px "IBM Plex Sans Thai", sans-serif`; g.textAlign = "right"; g.textBaseline = "bottom";
  g.lineJoin = "round"; g.lineWidth = Math.max(3, fs * 0.16); g.strokeStyle = "rgba(0,0,0,.85)"; g.fillStyle = "#ffd60a";
  lines.forEach((t, i) => { const y = c.height - pad - (lines.length - 1 - i) * lh; g.strokeText(t, c.width - pad, y); g.fillText(t, c.width - pad, y); });
  return new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
}

async function saveTrip(v, qq, t, status) {
  const btn = status === "cancelled" ? $("tCancel") : $("tSave"); btn.disabled = true; const label = btn.textContent; btn.innerHTML = `<span class="spin"></span> กำลังบันทึก…`;
  try {
    const note = ($("tNote")?.value || "").trim() || null;
    const path = TRIP.blob ? await upload(v.id, "trip", TRIP.blob, t.no) : null;
    const emp = isMgr() ? (await q(sb.from("work_schedules").select("employee_id").eq("work_date", TRIP.date).eq("vehicle_id", v.id).eq("status", "work")))[0]?.employee_id || null : ME.employee?.id;
    const row = { work_date: TRIP.date, vehicle_id: v.id, employee_id: emp, route_code: v.route_code || (qq.queue_code === "R2" ? "R2" : "R1"), queue_code: qq.queue_code, trip_no: t.no, scheduled_time: t.time, origin: t.origin, status, note, taken_at: new Date().toISOString() };
    if (path) row.photo_path = path;
    await q(sb.from("trip_logs").upsert(row, { onConflict: "vehicle_id,work_date,scheduled_time,origin" }));
    $("sheet").hidden = true;
    if (status === "standby") shareTrip(v, qq, t, note); else toast("บันทึกยกเลิกเที่ยวแล้ว");
    tripPage();
  } catch (e) { toast("บันทึกไม่สำเร็จ: " + errMsg(e)); btn.disabled = false; btn.textContent = label; }
}

function shareTrip(v, qq, t, note) {
  const text = lineText(v, qq, t, note), file = TRIP.blob ? new File([TRIP.blob], `${v.code}_${TRIP.date}_${t.time.replace(":", "")}.${TRIP.blob.type === "image/heic" ? "heic" : "jpg"}`, { type: TRIP.blob.type || "image/jpeg" }) : null;
  const s = $("sheet");
  s.innerHTML = `<div class="in"><div class="sh"><b>บันทึกแล้ว · ส่งกลุ่ม LINE</b><button class="lnk" id="shX">ปิด</button></div>
    <pre class="sm" style="white-space:pre-wrap;background:rgba(255,255,255,.06);border-radius:10px;padding:10px;margin:0 0 10px;font-family:inherit">${esc(text)}</pre>
    <div style="display:grid;gap:8px">${file ? `<button class="btn block pri" id="tShare">① ส่งรูปเข้ากลุ่ม LINE</button>` : ""}${lineBtn(text, file ? "② ส่งข้อความเข้ากลุ่ม LINE" : "📤 ส่งข้อความเข้ากลุ่ม LINE")}<button class="btn block" id="tCopy">คัดลอกข้อความ</button><button class="btn block" id="tGoPax">👥 เริ่มบันทึกผู้โดยสารเที่ยวนี้ →</button></div>
    <p class="sm" style="margin:10px 0 0">① เลือก LINE → เลือกกลุ่ม → ส่งรูป แล้วกลับมากด ② เพื่อส่งข้อความ (หรือกดค้างช่องพิมพ์ใน LINE แล้ววาง ข้อความคัดลอกไว้ให้แล้ว)</p></div>`;
  s.hidden = false;
  $("shX").onclick = () => (s.hidden = true);
  $("tCopy").onclick = () => copyText(text);
  $("tGoPax").onclick = () => openStops(v, qq, t);
  if ($("tShare")) $("tShare").onclick = () => sharePhoto(file, text);

}

/* ---------- monthly trip report (calendar month) ---------- */
let trMonth = null;
async function tripReport() {
  if (!(isMgr() || role() === "CUSTOMER")) return tripPage();
  if (!trMonth) { const t = dObj(today()); trMonth = new Date(t.getFullYear(), t.getMonth(), 1); }
  const a = iso(trMonth), b = iso(new Date(trMonth.getFullYear(), trMonth.getMonth() + 1, 0));
  const [qs, logs] = await Promise.all([
    q(sb.from("vehicle_queue").select("work_date,vehicle_id,queue_code").gte("work_date", a).lte("work_date", b)),
    tl(sb.from("trip_logs").select("*").gte("work_date", a).lte("work_date", b)),
  ]);
  const days = []; for (let t = dObj(a); iso(t) <= b; t.setDate(t.getDate() + 1)) days.push(iso(t));
  const cars = ["STC-01", "STC-02", "STC-03", "STC-04"], idOf = (c) => VEH.find((v) => v.code === c)?.id;
  const cell = (d, c) => {
    const qq = qs.find((x) => x.work_date === d && x.vehicle_id === idOf(c)); if (!qq) return null;
    const plan = tripsOf(qq.queue_code), L = logs.filter((l) => l.work_date === d && l.vehicle_id === idOf(c));
    const ok = plan.filter((t) => L.some((l) => l.status === "standby" && l.photo_path && String(l.scheduled_time).slice(0, 5) === t.time && l.origin === t.origin));
    const late = ok.filter((t) => { const l = L.find((x) => x.photo_path && String(x.scheduled_time).slice(0, 5) === t.time && x.origin === t.origin); return minsOf(bkkHM(l.taken_at)) > minsOf(t.time) + LATE_MIN; });
    const can = L.filter((l) => l.status === "cancelled").length;
    return { plan: plan.length, ok: ok.length, late: late.length, can, r2: qq.queue_code === "R2" };
  };
  const G = days.map((d) => cars.map((c) => cell(d, c)));
  const sumC = cars.map((c, j) => G.reduce((s, r) => { const x = r[j]; if (x) { s.plan += x.plan; s.ok += x.ok; s.late += x.late; s.can += x.can; s.days++; } return s; }, { plan: 0, ok: 0, late: 0, can: 0, days: 0 }));
  const pct = (o, p) => (p ? Math.round((o / p) * 100) : 0);
  const label = `${MONTH[trMonth.getMonth()]} ${trMonth.getFullYear() + 543}`;
  const P = await paxStats(a, b);
  const paxHTML = !P ? `<p class="notice" style="margin-top:12px">ระบบบันทึกผู้โดยสารยังไม่เปิดใช้ (รอรัน SQL trip_stops)</p>` : !P.n ? `<div class="empty" style="margin-top:12px"><b>ยังไม่มีข้อมูลผู้โดยสารเดือนนี้</b>คนขับบันทึกได้ที่หน้ารายงานรอบเดินรถ → บันทึกผู้โดยสาร</div>` :
    `<h2>ผู้โดยสาร <small>รวม ${P.total.toLocaleString("th-TH")} คน</small></h2>
     <section class="sum">${cars.map((c) => `<div class="tile"><small>${c}</small><b class="num">${(P.byCar[c] || 0).toLocaleString("th-TH")}</b><span>คน</span></div>`).join("")}</section>
     <section class="sum"><div class="tile"><small>เช้า 07:15–08:40</small><b class="num">${P.bySlot.am}</b><span>คน</span></div><div class="tile"><small>กลางวัน 09:00–16:30</small><b class="num">${P.bySlot.off}</b><span>คน</span></div><div class="tile"><small>เย็น 17:00–19:20</small><b class="num">${P.bySlot.pm}</b><span>คน</span></div></section>
     <section class="card" style="margin-top:10px;overflow-x:auto"><table class="t"><thead><tr><th>จุดขึ้นรถ</th><th class="r">คน</th></tr></thead><tbody>${stopOrder(P.byStop).map(([k, n]) => { const [d, st] = k.split("|"); return `<tr><td>${{ CC: "ศูนย์ฯ → รฟม.", LOT: "รฟม. → ศูนย์ฯ", R2: "ศิริราช" }[d]} · ${esc(st)}</td><td class="r num">${n}</td></tr>`; }).join("")}</tbody></table></section>`;
  const tbl = `<table class="t"><thead><tr><th>วันที่</th>${cars.map((c) => `<th class="r">${c}</th>`).join("")}</tr></thead><tbody>${days.map((d, i) => `<tr><td class="num">${dObj(d).getDate()} ${DOW[dObj(d).getDay()]}</td>${G[i].map((x) => `<td class="r num">${x ? `${x.ok}/${x.plan}${x.late ? ` <small style="color:#ffb347">ช้า${x.late}</small>` : ""}` : `<span class="sm">จอด</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  main().innerHTML = `<div class="wk"><button id="trPrev" aria-label="เดือนก่อน">‹</button><div>${label}<small>รายงานรอบเดินรถ · 1 – ${days.length} ${MS[trMonth.getMonth()]}</small></div><button id="trNext" aria-label="เดือนถัดไป">›</button></div>
   <section class="sum">${cars.map((c, j) => `<div class="tile"><small>${c}</small><b class="num">${pct(sumC[j].ok, sumC[j].plan)}%</b><span>${sumC[j].ok}/${sumC[j].plan} ${c === "STC-03" ? "รอบ" : "เที่ยว"}</span></div>`).join("")}</section>
   <a class="btn block" id="trPdf" href="#" style="margin-top:12px">สร้าง PDF รายงานประจำเดือน</a>
   <h2>รายวัน <small>รายงานแล้ว/ตามแผน</small></h2><section class="card" style="overflow-x:auto">${tbl}</section>
   <p class="sm">นับเฉพาะเที่ยวที่ถ่ายรูปรายงาน "สแตนด์บายรับออก" · ช้า = บันทึกหลังเวลาออกเกิน ${LATE_MIN} นาที · STC-03 นับเป็นรอบ (2 รอบ/วัน)</p>${paxHTML}`;
  $("trPrev").onclick = () => { trMonth.setMonth(trMonth.getMonth() - 1); tripReport(); };
  $("trNext").onclick = () => { trMonth.setMonth(trMonth.getMonth() + 1); tripReport(); };
  $("trPdf").onclick = (e) => { e.preventDefault(); tripPdf(label, days, cars, G, sumC, logs, P); };
}

async function tripPdf(label, days, cars, G, sumC, logs, P) {
  const W = 794, H = 1123, pct = (o, p) => (p ? ((o / p) * 100).toFixed(1) : "0.0");
  const head = `<header class="dh"><img src="assets/img/mrta-logo.png" alt="" class="dm"><div class="dt"><h1>รายงานรอบเดินรถประจำเดือน ${label}</h1><p>MRTA Shuttle Bus · สแตนด์บายรับออกพร้อมรูปถ่ายประทับเวลา</p></div><div class="dco"><img src="assets/img/smart-terminal-logo.png" alt=""><span>บริษัท สมาร์ท เทอร์มินอล<br>คอร์ปอเรชั่น จำกัด</span></div></header>`;
  const foot = (p, n) => `<footer class="df"><span>ข้อมูลจากระบบ ณ ${bk(today())} ${nowHM()} น. · เที่ยวตามแผนจากคิวรถประจำวัน</span><span>หน้า ${p}/${n}</span></footer>`;
  const cards = cars.map((c, j) => `<div class="dcard" style="--c:${VHEX[c]}"><b>${c}</b><span>ทะเบียน ${VPLATE[c]}</span><strong>${pct(sumC[j].ok, sumC[j].plan)}%</strong><span>${sumC[j].ok}/${sumC[j].plan} ${c === "STC-03" ? "รอบ" : "เที่ยว"} · ${sumC[j].days} วัน</span></div>`).join("");
  const tot = sumC.reduce((s, x) => ({ ok: s.ok + x.ok, plan: s.plan + x.plan, late: s.late + x.late, can: s.can + x.can }), { ok: 0, plan: 0, late: 0, can: 0 });
  const rows = days.map((d, i) => `<tr class="${dObj(d).getDay() % 6 === 0 ? "we" : ""}"><td class="c">${dObj(d).getDate()}</td><td>${DOW[dObj(d).getDay()]}</td>${G[i].map((x) => `<td class="r">${x ? `${x.ok}/${x.plan}${x.late ? ` · ช้า ${x.late}` : ""}${x.can ? ` · ยกเลิก ${x.can}` : ""}` : `<span class="pk">จอด</span>`}</td>`).join("")}</tr>`).join("");
  const p1 = `${head}<div class="dcards">${cards}</div>
    <h2>สรุปทั้งเดือน</h2><table class="dst"><thead><tr><th>รถ</th><th class="r">วันให้บริการ</th><th class="r">ตามแผน</th><th class="r">รายงานแล้ว</th><th class="r">ร้อยละ</th><th class="r">ช้า</th><th class="r">ยกเลิก</th><th class="r">ไม่รายงาน</th></tr></thead><tbody>
    ${cars.map((c, j) => { const x = sumC[j]; return `<tr><td>${c}</td><td class="r">${x.days}</td><td class="r">${x.plan}</td><td class="r">${x.ok}</td><td class="r">${pct(x.ok, x.plan)}</td><td class="r">${x.late}</td><td class="r">${x.can}</td><td class="r">${Math.max(0, x.plan - x.ok - x.can)}</td></tr>`; }).join("")}
    <tr><td><b>รวม</b></td><td></td><td class="r"><b>${tot.plan}</b></td><td class="r"><b>${tot.ok}</b></td><td class="r"><b>${pct(tot.ok, tot.plan)}</b></td><td class="r"><b>${tot.late}</b></td><td class="r"><b>${tot.can}</b></td><td class="r"><b>${Math.max(0, tot.plan - tot.ok - tot.can)}</b></td></tr></tbody></table>
    <h2>รายวัน (รายงานแล้ว/ตามแผน)</h2><table class="dtb sm xs"><thead><tr><th>วันที่</th><th>วัน</th>${cars.map((c) => `<th class="r"><i style="background:${VHEX[c]}"></i>${c}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
    <p class="dnote">ช้า = บันทึกหลังเวลาออกตามตารางเกิน ${LATE_MIN} นาที · STC-03 เส้น MRT อิสรภาพ – รพ.ศิริราช นับเป็นรอบ · รูปถ่ายทุกเที่ยวเก็บในระบบ ดูได้ที่เมนูรอบเดินรถ</p>
    <div class="dsign"><div>ผู้จัดทำ<br><br>วันที่ ........./........./.........</div><div>ผู้ตรวจสอบ<br><br>วันที่ ........./........./.........</div><div>ผู้อนุมัติ<br><br>วันที่ ........./........./.........</div></div>${foot(1, P && P.n ? 2 : 1)}`;
  let p2 = "";
  if (P && P.n) {
    const times = Object.keys(P.byTime).sort();
    const dayRows = days.map((d) => `<tr class="${dObj(d).getDay() % 6 === 0 ? "we" : ""}"><td class="c">${dObj(d).getDate()}</td><td>${DOW[dObj(d).getDay()]}</td>${cars.map((c) => `<td class="r">${P.byDay[d]?.[c] ?? "–"}</td>`).join("")}<td class="r"><b>${cars.reduce((s, c) => s + (P.byDay[d]?.[c] || 0), 0) || "–"}</b></td></tr>`).join("");
    const stopRows = stopOrder(P.byStop).map(([k, n]) => { const [d, st] = k.split("|"); return `<tr><td>${{ CC: "ศูนย์ฯ → รฟม.", LOT: "รฟม. → ศูนย์ฯ", R2: "ศิริราช" }[d]}</td><td>${esc(st)}</td><td class="r">${n}</td></tr>`; }).join("");
    const timeRows = times.map((t) => `<tr><td>${t}</td>${["STC-01", "STC-02", "STC-04"].map((c) => `<td class="r">${P.byTime[t][c] || 0}</td>`).join("")}<td class="r"><b>${Object.values(P.byTime[t]).reduce((x, y) => x + y, 0)}</b></td></tr>`).join("");
    p2 = `${head}<div class="dcards">${cars.map((c) => `<div class="dcard" style="--c:${VHEX[c]}"><b>${c}</b><span>ผู้โดยสารขึ้น</span><strong>${(P.byCar[c] || 0).toLocaleString("th-TH")}</strong><span>คน/เดือน</span></div>`).join("")}</div>
      <div style="display:flex;gap:14px;margin-top:8px"><div style="flex:1.1"><h2>รายวัน (คนขึ้น)</h2><table class="dtb sm xs"><thead><tr><th>วันที่</th><th>วัน</th>${cars.map((c) => `<th class="r">${c.slice(4)}</th>`).join("")}<th class="r">รวม</th></tr></thead><tbody>${dayRows}<tr><td></td><td><b>รวม</b></td>${cars.map((c) => `<td class="r"><b>${P.byCar[c] || 0}</b></td>`).join("")}<td class="r"><b>${P.total}</b></td></tr></tbody></table></div>
      <div style="flex:1"><h2>ช่วงเวลา (ศูนย์ฯ–รฟม.)</h2><table class="dst"><tbody><tr><td>Peak เช้า 07:15–08:40</td><td class="r">${P.bySlot.am}</td></tr><tr><td>Off-Peak 09:00–16:30</td><td class="r">${P.bySlot.off}</td></tr><tr><td>Peak เย็น 17:00–19:20</td><td class="r">${P.bySlot.pm}</td></tr></tbody></table>
      <h2>แยกจุดขึ้นรถ</h2><table class="dst"><thead><tr><th>ทิศทาง</th><th>จุด</th><th class="r">คน</th></tr></thead><tbody>${stopRows}</tbody></table>
      <h2>แยกตามเวลาออก</h2><table class="dtb sm xs"><thead><tr><th>เวลา</th><th class="r">01</th><th class="r">02</th><th class="r">04</th><th class="r">รวม</th></tr></thead><tbody>${timeRows}</tbody></table></div></div>
      <p class="dnote">ข้อมูลจากการบันทึกของพนักงานขับรถทุกจุดจอดในแอพ (แทนแบบฟอร์มกระดาษ) · ทุกตารางคำนวณจากข้อมูลชุดเดียวกัน ยอดรวมจึงตรงกันทุกตาราง</p>${foot(2, 2)}`;
  }
  const pg = (x) => `<section class="dpg" style="width:${W}px;height:${H}px;margin:0;box-shadow:none">${x}</section>`;
  const html = `<div class="doc" style="width:${W}px">${pg(p1)}${p2 ? pg(p2) : ""}</div>`;
  const fname = `MRTA_รายงานรอบเดินรถ_${trMonth.getFullYear() + 543}-${String(trMonth.getMonth() + 1).padStart(2, "0")}.pdf`;
  if (!window.html2pdf) { toast("โหลดตัวสร้าง PDF ไม่ได้"); return; }
  toast("กำลังสร้าง PDF…");
  const stage = document.createElement("div"); stage.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;background:#fff`; stage.innerHTML = html; document.body.appendChild(stage);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const blob = await html2pdf().set({ margin: 0, image: { type: "jpeg", quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: "#fff", windowWidth: W }, jsPDF: { unit: "px", format: [W, H], orientation: "portrait", hotfixes: ["px_scaling"] }, pagebreak: { mode: [] } }).from(stage.firstElementChild).outputPdf("blob");
    const url = URL.createObjectURL(blob), file = new File([blob], fname, { type: "application/pdf" }), canShare = navigator.canShare && navigator.canShare({ files: [file] });
    const s = $("sheet");
    s.innerHTML = `<div class="in"><div class="sh"><b>PDF พร้อมแล้ว</b><button class="lnk" id="shX">ปิด</button></div><p class="sm" style="margin:0 0 10px">${esc(fname)}</p>
      <div style="display:grid;gap:8px"><a class="btn block" href="${url}" target="_blank" rel="noopener">เปิดดู PDF</a>${canShare ? `<button class="btn block" id="pShare">แชร์ / ส่ง LINE</button>` : ""}<a class="btn block" href="${url}" download="${esc(fname)}">บันทึกไฟล์</a></div></div>`;
    s.hidden = false; $("shX").onclick = () => (s.hidden = true);
    if (canShare) $("pShare").onclick = () => navigator.share({ files: [file] }).catch((e) => { if (e && e.name !== "AbortError") savePhoto(file); });
  } catch (e) { toast("สร้าง PDF ไม่สำเร็จ: " + errMsg(e)); }
  finally { stage.remove(); }
}

/* ---------- passengers per stop (replaces the paper "ตารางการเก็บข้อมูลผู้ใช้บริการ") ---------- */
const P_CC = "อาคารจอดรถศูนย์วัฒนธรรมฯ", P_LOT = "ลานจอดรถ สถานี รฟม.", P_B2 = "อาคาร 2 รฟม.", P_B1 = "อาคาร 1 รฟม.";
const R2_STOPS = {
  1: ["รฟม. สำนักงานใหญ่", "รพ.ศิริราช", "ตรงข้าม The Most อิสรภาพ", "ตรงข้าม dBura อิสรภาพ", "MRT อิสรภาพ", "ตรงข้ามวัดอรุณราชวราราม", "ตรงข้าม รพ.ศิริราช", "ซอยอรุณอมรินทร์ 53 (ลุมพินีคอนโด)", "หอพักเจ้าพระยา (ศิริราช)", "รพ.ศิริราช (วงเวียน)", "ตรงข้าม The Most อิสรภาพ", "ตรงข้าม dBura อิสรภาพ", "MRT อิสรภาพ"],
  2: ["MRT อิสรภาพ", "ตรงข้ามวัดอรุณราชวราราม", "ตรงข้าม รพ.ศิริราช", "ซอยอรุณอมรินทร์ 53 (ลุมพินีคอนโด)", "หอพักเจ้าพระยา (ศิริราช)", "รพ.ศิริราช (วงเวียน)", "ตรงข้าม The Most อิสรภาพ", "ตรงข้าม dBura อิสรภาพ", "MRT อิสรภาพ"],
};
// ศูนย์ฯ → อาคาร 2 → อาคาร 1 → ลานจอด รฟม. · ลานจอด รฟม. → อาคาร 2 → อาคาร 1 → ศูนย์ฯ (ตามแบบฟอร์มเดิม)
const stopsOf = (qc, t) => qc === "R2" ? R2_STOPS[t.no] || [] : t.origin === ORIGIN.C ? [P_CC, P_B2, P_B1, P_LOT] : [P_LOT, P_B2, P_B1, P_CC];
const SKEY = "mrta-trip-stops", QKEY = "mrta-stop-queue";
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
let ST = null; // { logId, vid, code, date, qc, no, time, origin, rows:[{seq,stop,arrived_at,departed_at,board,alight}] }

async function ensureLog(v, qq, t) {
  const ex = await tl(sb.from("trip_logs").select("id").eq("work_date", TRIP.date).eq("vehicle_id", v.id).eq("scheduled_time", t.time).eq("origin", t.origin));
  if (ex[0]) return ex[0].id;
  const emp = isMgr() ? (await q(sb.from("work_schedules").select("employee_id").eq("work_date", TRIP.date).eq("vehicle_id", v.id).eq("status", "work")))[0]?.employee_id || null : ME.employee?.id;
  const row = { work_date: TRIP.date, vehicle_id: v.id, employee_id: emp, route_code: v.route_code || (qq.queue_code === "R2" ? "R2" : "R1"), queue_code: qq.queue_code, trip_no: t.no, scheduled_time: t.time, origin: t.origin, status: "standby", note: "บันทึกผู้โดยสาร (ยังไม่ถ่ายรูปรับออก)" };
  const r = await q(sb.from("trip_logs").insert(row).select("id").single());
  return r.id;
}
async function openStops(v, qq, t) {
  try {
    const logId = await ensureLog(v, qq, t);
    const got = await q(sb.from("trip_stops").select("*").eq("trip_log_id", logId).order("seq"));
    const rows = stopsOf(qq.queue_code, t).map((stop, i) => { const g = got.find((x) => x.seq === i + 1); return { seq: i + 1, stop, arrived_at: g?.arrived_at || null, departed_at: g?.departed_at || null, board: g?.board || 0, alight: g?.alight || 0 }; });
    ST = { logId, vid: v.id, code: v.code, date: TRIP.date, qc: qq.queue_code, no: t.no, time: t.time, origin: t.origin, rows };
    lsSet(SKEY, ST); $("sheet").hidden = true; location.hash = "#tripstops";
  } catch (e) { toast(/trip_stops/.test(errMsg(e)) ? "ระบบบันทึกผู้โดยสารยังไม่เปิดใช้ (รอรัน SQL trip_stops)" : "เปิดไม่ได้: " + errMsg(e)); }
}
async function flushStops() {
  if (flushStops.busy) return 0;
  const qd = lsGet(QKEY) || []; if (!qd.length) return 0;
  flushStops.busy = true; const sent = [];
  try { for (const r of qd) { const { error } = await sb.from("trip_stops").upsert(r, { onConflict: "trip_log_id,seq" }); if (!error) sent.push(r); } }
  finally {
    flushStops.busy = false;
    // re-read: rows queued while we were sending must survive; drop only what was sent and not changed since
    const now = (lsGet(QKEY) || []).filter((x) => !sent.some((y) => y.trip_log_id === x.trip_log_id && y.seq === x.seq && y.updated_at === x.updated_at));
    lsSet(QKEY, now.length ? now : null);
  }
  return sent.length;
}
window.addEventListener("online", () => flushStops().then((n) => n && toast(`ส่งข้อมูลผู้โดยสารที่ค้าง ${n} จุดแล้ว`)));
async function saveStop(r) {
  const row = { trip_log_id: ST.logId, work_date: ST.date, vehicle_id: ST.vid, seq: r.seq, stop: r.stop, arrived_at: r.arrived_at, departed_at: r.departed_at, board: r.board, alight: r.alight, updated_at: new Date().toISOString() };
  lsSet(SKEY, ST);
  const { error } = await sb.from("trip_stops").upsert(row, { onConflict: "trip_log_id,seq" });
  if (error) { const qd = (lsGet(QKEY) || []).filter((x) => !(x.trip_log_id === row.trip_log_id && x.seq === row.seq)); qd.push(row); lsSet(QKEY, qd); toast("ไม่มีสัญญาณ บันทึกไว้ในเครื่องแล้ว จะส่งให้อัตโนมัติ"); }
}
async function tripStops() {
  if (!ST) ST = lsGet(SKEY);
  if (!ST) { location.hash = "#trip"; return; }
  flushStops();
  const R = ST.rows, cur = R.findIndex((r) => !r.departed_at);
  const tb = R.reduce((s, r) => s + r.board, 0), ta = R.reduce((s, r) => s + r.alight, 0), onboard = tb - ta;
  const hm = (ts) => (ts ? tHM(ts) : "–");
  main().innerHTML = `<section class="card"><div class="row1"><b>${ST.code} · ${ST.qc === "R2" ? "รอบที่ " + ST.no : "เที่ยว " + ST.no} · ${ST.time} น.</b><span class="pill ${cur < 0 ? "ok" : "warn"}">${cur < 0 ? "จบเที่ยว" : "กำลังวิ่ง"}</span></div>
     <p class="sm" style="margin:4px 0 0">ออกจาก${esc(ST.origin)} · ${bk(ST.date)}</p></section>
   <section class="sum"><div class="tile"><small>ขึ้นรวม</small><b class="num">${tb}</b><span>คน</span></div><div class="tile"><small>ลงรวม</small><b class="num">${ta}</b><span>คน</span></div><div class="tile ${onboard < 0 ? "alert" : ""}"><small>บนรถตอนนี้</small><b class="num">${onboard}</b><span>คน</span></div></section>
   <p class="notice" style="margin-top:10px">บันทึกเฉพาะตอนรถจอดสนิทแล้วเท่านั้น ห้ามใช้โทรศัพท์ขณะขับ</p>
   <div class="list" style="margin-top:10px">${R.map((r, i) => i === cur ? stopCard(r, i, i === R.length - 1) : `<button class="day" data-st="${i}" style="text-align:left;cursor:pointer;opacity:${i > cur && cur >= 0 ? ".55" : "1"};border-left:4px solid ${r.departed_at ? "#3fa725" : "transparent"}">
       <div class="d"><b class="num">${i + 1}</b><small>${hm(r.arrived_at)}</small></div><div class="sm">${esc(r.stop)}${r.arrived_at ? `<em class="sub2">จอด ${hm(r.arrived_at)} · ออก ${hm(r.departed_at)} · ขึ้น ${r.board} ลง ${r.alight}</em>` : ""}</div></button>`).join("")}</div>
   <div style="display:grid;gap:8px;margin-top:12px">${cur < 0 ? `<a class="btn block pri" href="#trip">✓ จบเที่ยว กลับไปรายการเที่ยว</a>` : `<a class="btn block" href="#trip">กลับไปรายการเที่ยว (บันทึกไว้แล้ว)</a>`}</div>`;
  main().querySelectorAll("[data-st]").forEach((b) => (b.onclick = () => editStop(+b.dataset.st)));
  bindStopCard(cur);
}
function stopCard(r, i, last) {
  const ctr = (k, l) => `<div style="flex:1"><small class="sm">${l}</small><div style="display:flex;align-items:center;gap:6px;margin-top:4px"><button class="btn" data-dec="${k}" style="min-width:52px;min-height:52px;font-size:1.4rem">−</button><b class="num" id="c_${k}" style="font-size:1.8rem;min-width:44px;text-align:center">${r[k]}</b><button class="btn pri" data-inc="${k}" style="min-width:52px;min-height:52px;font-size:1.4rem">+</button></div></div>`;
  return `<section class="card" style="border-color:#1fc2ff"><div class="row1"><b>${i + 1}. ${esc(r.stop)}</b><span class="sm">${r.arrived_at ? "จอด " + tHM(r.arrived_at) + " น." : "ยังไม่ถึง"}</span></div>
    ${r.arrived_at ? `<div style="display:flex;gap:12px;margin-top:10px">${i === 0 ? "" : ctr("alight", "ลง")}${last ? "" : ctr("board", "ขึ้น")}</div>
      <button class="btn block pri" id="sGo" style="margin-top:12px;min-height:54px">${last ? "ถึงปลายทาง · จบเที่ยว" : "ออกจากจุดนี้ →"}</button>`
    : `<button class="btn block pri" id="sArr" style="margin-top:10px;min-height:54px">ถึงจุดนี้แล้ว (ลงเวลาจอด)</button>`}</section>`;
}
function bindStopCard(cur) {
  if (cur < 0) return;
  const r = ST.rows[cur], last = cur === ST.rows.length - 1;
  if ($("sArr")) $("sArr").onclick = async () => { r.arrived_at = new Date().toISOString(); await saveStop(r); tripStops(); };
  main().querySelectorAll("[data-inc]").forEach((b) => (b.onclick = () => { const k = b.dataset.inc; r[k] = Math.min(200, r[k] + 1); $("c_" + k).textContent = r[k]; lsSet(SKEY, ST); }));
  main().querySelectorAll("[data-dec]").forEach((b) => (b.onclick = () => { const k = b.dataset.dec; r[k] = Math.max(0, r[k] - 1); $("c_" + k).textContent = r[k]; lsSet(SKEY, ST); }));
  if ($("sGo")) $("sGo").onclick = async () => { r.departed_at = new Date().toISOString(); await saveStop(r); if (last) toast("จบเที่ยวแล้ว"); tripStops(); };
}
function editStop(i) {
  const r = ST.rows[i], s = $("sheet");
  s.innerHTML = `<div class="in"><div class="sh"><b>แก้ไข ${i + 1}. ${esc(r.stop)}</b><button class="lnk" id="shX">ปิด</button></div>
    <div class="grid"><div class="fld"><label for="eB">ขึ้น (คน)</label><input id="eB" type="number" inputmode="numeric" min="0" max="200" value="${r.board}"></div><div class="fld"><label for="eA">ลง (คน)</label><input id="eA" type="number" inputmode="numeric" min="0" max="200" value="${r.alight}"></div></div>
    <button class="btn block pri" id="eOk" style="margin-top:10px">บันทึก</button></div>`;
  s.hidden = false; $("shX").onclick = () => (s.hidden = true);
  $("eOk").onclick = async () => { r.board = Math.max(0, Math.min(200, +$("eB").value || 0)); r.alight = Math.max(0, Math.min(200, +$("eA").value || 0)); if (!r.arrived_at) r.arrived_at = new Date().toISOString(); s.hidden = true; await saveStop(r); tripStops(); };
}
window.tripStops = tripStops;

/* passenger statistics for the monthly report */
const SLOT = (hm) => { const m = minsOf(hm); return m <= minsOf("08:40") ? "am" : m >= minsOf("17:00") ? "pm" : "off"; };
async function paxStats(a, b) {
  const [S, L] = await Promise.all([q(sb.from("trip_stops").select("*").gte("work_date", a).lte("work_date", b)).catch(() => null), tl(sb.from("trip_logs").select("id,vehicle_id,work_date,scheduled_time,origin,queue_code").gte("work_date", a).lte("work_date", b))]);
  if (!S) return null;
  const LG = Object.fromEntries(L.map((l) => [l.id, l])), code = (id) => vcode(id);
  const byDay = {}, byStop = {}, bySlot = { am: 0, off: 0, pm: 0 }, byTime = {}, byCar = {};
  S.forEach((s) => {
    const l = LG[s.trip_log_id]; if (!l) return; const c = code(s.vehicle_id), t = String(l.scheduled_time).slice(0, 5), dir = l.queue_code === "R2" ? "R2" : l.origin === ORIGIN.C ? "CC" : "LOT";
    byDay[s.work_date] = byDay[s.work_date] || {}; byDay[s.work_date][c] = (byDay[s.work_date][c] || 0) + s.board;
    const k = dir + "|" + s.stop; byStop[k] = (byStop[k] || 0) + s.board;
    if (dir !== "R2") { bySlot[SLOT(t)] += s.board; byTime[t] = byTime[t] || {}; byTime[t][c] = (byTime[t][c] || 0) + s.board; }
    byCar[c] = (byCar[c] || 0) + s.board;
  });
  return { byDay, byStop, bySlot, byTime, byCar, total: Object.values(byCar).reduce((x, y) => x + y, 0), n: S.length };
}
const STOP_ORD = ["CC|" + P_CC, "CC|" + P_B2, "CC|" + P_B1, "LOT|" + P_LOT, "LOT|" + P_B2, "LOT|" + P_B1, ...R2_STOPS[1].map((x) => "R2|" + x)];
const stopOrder = (o) => Object.entries(o).filter(([, n]) => n > 0).sort((x, y) => { const a = STOP_ORD.indexOf(x[0]), b = STOP_ORD.indexOf(y[0]); return (a < 0 ? 99 : a) - (b < 0 ? 99 : b); });
window.paxStats = paxStats;

/* ---------- clock in / clock out (เวลาเข้า-ออกงาน + เลขไมล์ + แบต) on the driver home ---------- */
let SHIFT = null;
async function shiftCard() {
  if (role() !== "DRIVER" || !ME.employee) return "";
  const st = ME.schedule?.status; if (st === "off" || st === "leave") return "";
  const r = await q(sb.from("work_shifts").select("*").eq("work_date", ME.date).eq("employee_id", ME.employee.id)).catch(() => null);
  if (r === null) return "";
  SHIFT = r[0] || null;
  const t = (x) => (x ? tHM(x) : "");
  if (!SHIFT?.clock_in) return `<button class="btn block pri" id="shIn" style="margin-top:12px;min-height:54px">🕒 ลงเวลาเข้างาน · เลขไมล์ · แบตเตอรี่</button>`;
  if (!SHIFT.clock_out) return `<section class="card" style="margin-top:12px"><div class="row1"><b>เข้างาน ${t(SHIFT.clock_in)} น.</b><span class="pill ok">กำลังทำงาน</span></div><p class="sm" style="margin:4px 0 8px">ไมล์เริ่ม ${SHIFT.odo_start ?? "–"} · แบต ${SHIFT.soc_start ?? "–"}%</p><button class="btn block" id="shOut">ลงเวลาออกงาน · ไมล์กลับ · แบตกลับ</button></section>`;
  const km = SHIFT.odo_end != null && SHIFT.odo_start != null ? SHIFT.odo_end - SHIFT.odo_start : null;
  return `<p class="notice ok" style="margin-top:12px">วันนี้ เข้า ${t(SHIFT.clock_in)} · ออก ${t(SHIFT.clock_out)} น.${km != null ? ` · ${km} กม.` : ""} · <a href="#pdf" id="shCert">ใบรับรองเวลา</a></p>`;
}
function bindShift() {
  if ($("shIn")) $("shIn").onclick = () => shiftForm("in");
  if ($("shOut")) $("shOut").onclick = () => shiftForm("out");
  if ($("shCert")) $("shCert").onclick = () => { window.pdfDocWant = "cert"; };
}
async function shiftForm(kind) {
  const vs = myVehicles(), vid = vs[0]?.id || null;
  let pre = { odo: "", soc: "" };
  if (kind === "in" && vid) { const ins = await q(sb.from("inspections").select("soc,odometer,inspected_at").eq("vehicle_id", vid).gte("inspected_at", ME.date + "T00:00:00+07:00").order("inspected_at", { ascending: false }).limit(1)).catch(() => []); if (ins[0]) pre = { odo: ins[0].odometer ?? "", soc: ins[0].soc ?? "" }; }
  const s = $("sheet");
  s.innerHTML = `<div class="in"><div class="sh"><b>${kind === "in" ? "ลงเวลาเข้างาน" : "ลงเวลาออกงาน"} · ${nowHM()} น.</b><button class="lnk" id="shX">ปิด</button></div>
    <p class="sm" style="margin:0 0 8px">${vs[0] ? vs[0].code + " · " : ""}${bk(ME.date)} · เวลาบันทึกตามเวลาที่กด</p>
    <div class="grid"><div class="fld"><label for="fOdo">เลขไมล์${kind === "in" ? "เริ่ม" : "กลับ"} (กม.)</label><input id="fOdo" type="number" inputmode="decimal" value="${pre.odo}"></div>
    <div class="fld"><label for="fSoc">แบตเตอรี่${kind === "in" ? "เริ่ม" : "กลับ"} (%)</label><input id="fSoc" type="number" inputmode="numeric" min="0" max="100" value="${pre.soc}"></div></div>
    ${kind === "out" ? `<div class="fld" style="margin-top:8px"><label for="fNote">หมายเหตุ (ถ้ามี)</label><input id="fNote" placeholder="เช่น ลิฟท์ยกวีลแชร์มีเสียง"></div>` : ""}
    <button class="btn block pri" id="fOk" style="margin-top:10px;min-height:52px">บันทึก</button></div>`;
  s.hidden = false; $("shX").onclick = () => (s.hidden = true);
  $("fOk").onclick = async () => {
    const odo = $("fOdo").value === "" ? null : Number($("fOdo").value), soc = $("fSoc").value === "" ? null : Number($("fSoc").value);
    if (soc != null && (soc < 0 || soc > 100)) { toast("แบตเตอรี่ต้องอยู่ระหว่าง 0–100%"); return; }
    if (kind === "out" && odo != null && SHIFT?.odo_start != null && odo < SHIFT.odo_start) { toast("เลขไมล์กลับน้อยกว่าเลขไมล์เริ่ม ตรวจสอบอีกครั้ง"); return; }
    const row = kind === "in" ? { work_date: ME.date, employee_id: ME.employee.id, vehicle_id: vid, clock_in: new Date().toISOString(), odo_start: odo, soc_start: soc }
      : { work_date: ME.date, employee_id: ME.employee.id, vehicle_id: SHIFT?.vehicle_id || vid, clock_in: SHIFT?.clock_in || null, odo_start: SHIFT?.odo_start ?? null, soc_start: SHIFT?.soc_start ?? null, clock_out: new Date().toISOString(), odo_end: odo, soc_end: soc, note: ($("fNote")?.value || "").trim() || null };
    row.updated_at = new Date().toISOString();
    try { await q(sb.from("work_shifts").upsert(row, { onConflict: "work_date,employee_id" })); s.hidden = true; toast(kind === "in" ? "ลงเวลาเข้างานแล้ว" : "ลงเวลาออกงานแล้ว"); home(); }
    catch (e) { toast("บันทึกไม่สำเร็จ: " + errMsg(e)); }
  };
}
window.shiftCard = shiftCard; window.bindShift = bindShift;

window.tripPage = tripPage;
window.tripReport = tripReport;
