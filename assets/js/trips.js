/* Smart Shuttle Bus EV — trip check-in (สแตนด์บายรับออก) for every trip + monthly trip report.
   Each trip: driver takes a photo → app stamps date/time, vehicle, trip and origin on it → saved to trip_logs + Storage
   → share to the LINE group (photo via share sheet, text copied to clipboard). */
const ORIGIN = { C: "สถานีศูนย์วัฒนธรรมฯ", R: "สถานี รฟม.", HQ: "รฟม. สำนักงานใหญ่", MRT: "MRT อิสรภาพ" };
const TRIP_PAT = {
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
  const [qrow, logs] = await Promise.all([
    q(sb.from("vehicle_queue").select("*").eq("work_date", TRIP.date).eq("vehicle_id", TRIP.vid)),
    tl(sb.from("trip_logs").select("*").eq("work_date", TRIP.date).eq("vehicle_id", TRIP.vid).order("scheduled_time")),
  ]);
  const qq = qrow[0], plan = qq ? tripsOf(qq.queue_code) : [];
  const done = (t) => logs.find((l) => String(l.scheduled_time).slice(0, 5) === t.time && l.origin === t.origin);
  const now = TRIP.date === today() ? minsOf(nowHM()) : TRIP.date < today() ? 9999 : -1;
  const nextIdx = plan.findIndex((t) => !done(t) && minsOf(t.time) >= now - 30);
  const nDone = plan.filter(done).length;
  const extra = logs.filter((l) => !plan.some((t) => t.time === String(l.scheduled_time).slice(0, 5) && t.origin === l.origin));
  main().innerHTML = `${isMgr() || role() === "CUSTOMER" ? `<div class="grid"><div class="fld"><label for="tDate">วันที่</label><input type="date" id="tDate" value="${TRIP.date}"></div></div>` : ""}
   ${busPicker(vs, TRIP.vid, "data-tv")}
   <section class="sum"><div class="tile"><small>ตามแผน</small><b class="num">${plan.length || "–"}</b><span>${qq?.queue_code === "R2" ? "รอบ" : "เที่ยว"}</span></div><div class="tile"><small>รายงานแล้ว</small><b class="num">${nDone}</b><span>${qq?.queue_code === "R2" ? "รอบ" : "เที่ยว"}</span></div><div class="tile ${plan.length - nDone > 0 && now === 9999 ? "alert" : ""}"><small>ยังไม่รายงาน</small><b class="num">${Math.max(0, plan.length - nDone)}</b><span>${qq?.queue_code === "R2" ? "รอบ" : "เที่ยว"}</span></div></section>
   ${qq ? `<p class="sm" style="margin:8px 0 0">${v.code} · คิว ${esc(qq.queue_code)} · ${ROUTE[v.route_code] || ""} · ${bk(TRIP.date)}</p>` : `<div class="empty" style="margin-top:12px"><b>${v.code} ไม่มีคิววันนี้</b>รถจอดหรือยังไม่ได้จัดตาราง</div>`}
   <div class="list" style="margin-top:8px">${plan.map((t, i) => { const l = done(t), late = l && minsOf(bkkHM(l.taken_at)) > minsOf(t.time) + LATE_MIN;
     return `<button class="day trip ${i === nextIdx ? "today" : ""}" data-trip="${i}" style="text-align:left;cursor:pointer;border-left:4px solid ${l ? (late ? "#ffb347" : "#3fa725") : i === nextIdx ? "#1fc2ff" : "transparent"}">
       <div class="d"><b class="num">${t.time}</b><small>${qq.queue_code === "R2" ? "รอบ " + t.no : "เที่ยว " + t.no}</small></div>
       <div class="sm">${esc(t.origin)}${l ? `<em class="sub2">${l.status === "cancelled" ? "ยกเลิก" : `รายงาน ${bkkHM(l.taken_at)} น.${late ? " · ช้า" : ""}`}</em>` : i === nextIdx ? `<em class="sub2">เที่ยวถัดไป · แตะเพื่อถ่ายรูปรายงาน</em>` : ""}</div></button>`; }).join("")}
   ${extra.map((l) => `<div class="day"><div class="d"><b class="num">${String(l.scheduled_time).slice(0, 5)}</b><small>เพิ่ม</small></div><div class="sm">${esc(l.origin)}<em class="sub2">รายงาน ${bkkHM(l.taken_at)} น. ${esc(l.note || "")}</em></div></div>`).join("")}</div>
   ${isMgr() || role() === "CUSTOMER" ? `<a class="btn block" href="#tripreport" style="margin-top:14px">รายงานรอบเดินรถประจำเดือน</a>` : ""}`;
  main().querySelectorAll("[data-tv]").forEach((b) => (b.onclick = () => { TRIP.vid = b.dataset.tv; tripPage(); }));
  if ($("tDate")) $("tDate").onchange = (e) => { if (e.target.value) { TRIP.date = e.target.value; tripPage(); } };
  main().querySelectorAll("[data-trip]").forEach((b) => (b.onclick = () => tripSheet(v, qq, plan[+b.dataset.trip], done(plan[+b.dataset.trip]))));
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
    ${isMgr() ? `<button class="btn block" id="tCancel">บันทึกว่ายกเลิกเที่ยวนี้</button>` : ""}</div>` : `<p class="sm">บันทึกย้อนหลังได้เฉพาะผู้จัดการ</p>`}</div>`;
  s.hidden = false;
  $("shX").onclick = () => (s.hidden = true);
  if ($("tOld")) $("tOld").onclick = async (e) => { e.preventDefault(); const [u] = await signed([existing.photo_path]); if (u) { $("vImg").src = u; $("viewer").hidden = false; } };
  if (!canEdit) return;
  $("tCam").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const shot = new Date();
    TRIP.blob = await stampPhoto(f, [`${shot.getDate()} ${MS[shot.getMonth()]} ${shot.getFullYear() + 543} ${shot.toTimeString().slice(0, 8)}`, `${v.code} · ${qq.queue_code === "R2" ? "รอบที่ " + t.no : "รอบ " + t.time + " น."}`, t.origin]);
    if (!TRIP.blob) { toast("อ่านรูปไม่ได้ ลองถ่ายใหม่"); return; }
    if (TRIP.url) URL.revokeObjectURL(TRIP.url);
    TRIP.url = URL.createObjectURL(TRIP.blob); $("tPrev").src = TRIP.url; $("tPrev").style.display = "block"; $("tSave").disabled = false;
  };
  $("tSave").onclick = () => saveTrip(v, qq, t, "standby");
  if ($("tCancel")) $("tCancel").onclick = () => saveTrip(v, qq, t, "cancelled");
}

/* draw photo + yellow timestamp block (bottom-right), like the camera-stamp photos used in the LINE group */
function stampPhoto(file, lines, max = 1600) {
  return new Promise((res) => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement("canvas");
      c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      const g = c.getContext("2d"); g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      const fs = Math.round(c.width * 0.04), lh = fs * 1.25, pad = Math.round(fs * 0.7);
      g.font = `700 ${fs}px "IBM Plex Sans Thai", sans-serif`; g.textAlign = "right"; g.textBaseline = "bottom";
      g.lineJoin = "round"; g.lineWidth = Math.max(3, fs * 0.16); g.strokeStyle = "rgba(0,0,0,.85)"; g.fillStyle = "#ffd60a";
      lines.forEach((t, i) => { const y = c.height - pad - (lines.length - 1 - i) * lh; g.strokeText(t, c.width - pad, y); g.fillText(t, c.width - pad, y); });
      c.toBlob((b) => res(b), "image/jpeg", 0.82);
    };
    im.onerror = () => res(null); im.src = u;
  });
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
  const text = lineText(v, qq, t, note), file = TRIP.blob ? new File([TRIP.blob], `${v.code}_${TRIP.date}_${t.time.replace(":", "")}.jpg`, { type: "image/jpeg" }) : null;
  const s = $("sheet");
  s.innerHTML = `<div class="in"><div class="sh"><b>บันทึกแล้ว · ส่งกลุ่ม LINE</b><button class="lnk" id="shX">ปิด</button></div>
    <pre class="sm" style="white-space:pre-wrap;background:rgba(255,255,255,.06);border-radius:10px;padding:10px;margin:0 0 10px;font-family:inherit">${esc(text)}</pre>
    <div style="display:grid;gap:8px"><button class="btn block pri" id="tShare">ส่งรูปเข้า LINE (คัดลอกข้อความให้แล้ว)</button><button class="btn block" id="tCopy">คัดลอกข้อความอีกครั้ง</button></div>
    <p class="sm" style="margin:10px 0 0">ใน LINE: เลือกกลุ่ม → ส่งรูป → กดค้างช่องพิมพ์แล้ววางข้อความ</p></div>`;
  s.hidden = false;
  $("shX").onclick = () => (s.hidden = true);
  $("tCopy").onclick = () => copyText(text);
  $("tShare").onclick = async () => {
    try { await navigator.clipboard.writeText(text); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], text }).catch(() => {});
    else { copyText(text); toast("เครื่องนี้แชร์รูปตรงไม่ได้ คัดลอกข้อความแล้ว"); }
  };
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
    const ok = plan.filter((t) => L.some((l) => l.status === "standby" && String(l.scheduled_time).slice(0, 5) === t.time && l.origin === t.origin));
    const late = ok.filter((t) => { const l = L.find((x) => String(x.scheduled_time).slice(0, 5) === t.time && x.origin === t.origin); return minsOf(bkkHM(l.taken_at)) > minsOf(t.time) + LATE_MIN; });
    const can = L.filter((l) => l.status === "cancelled").length;
    return { plan: plan.length, ok: ok.length, late: late.length, can, r2: qq.queue_code === "R2" };
  };
  const G = days.map((d) => cars.map((c) => cell(d, c)));
  const sumC = cars.map((c, j) => G.reduce((s, r) => { const x = r[j]; if (x) { s.plan += x.plan; s.ok += x.ok; s.late += x.late; s.can += x.can; s.days++; } return s; }, { plan: 0, ok: 0, late: 0, can: 0, days: 0 }));
  const pct = (o, p) => (p ? Math.round((o / p) * 100) : 0);
  const label = `${MONTH[trMonth.getMonth()]} ${trMonth.getFullYear() + 543}`;
  const tbl = `<table class="t"><thead><tr><th>วันที่</th>${cars.map((c) => `<th class="r">${c}</th>`).join("")}</tr></thead><tbody>${days.map((d, i) => `<tr><td class="num">${dObj(d).getDate()} ${DOW[dObj(d).getDay()]}</td>${G[i].map((x) => `<td class="r num">${x ? `${x.ok}/${x.plan}${x.late ? ` <small style="color:#ffb347">ช้า${x.late}</small>` : ""}` : `<span class="sm">จอด</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  main().innerHTML = `<div class="wk"><button id="trPrev" aria-label="เดือนก่อน">‹</button><div>${label}<small>รายงานรอบเดินรถ · 1 – ${days.length} ${MS[trMonth.getMonth()]}</small></div><button id="trNext" aria-label="เดือนถัดไป">›</button></div>
   <section class="sum">${cars.map((c, j) => `<div class="tile"><small>${c}</small><b class="num">${pct(sumC[j].ok, sumC[j].plan)}%</b><span>${sumC[j].ok}/${sumC[j].plan} ${c === "STC-03" ? "รอบ" : "เที่ยว"}</span></div>`).join("")}</section>
   <a class="btn block" id="trPdf" href="#" style="margin-top:12px">สร้าง PDF รายงานประจำเดือน</a>
   <h2>รายวัน <small>รายงานแล้ว/ตามแผน</small></h2><section class="card" style="overflow-x:auto">${tbl}</section>
   <p class="sm">นับเฉพาะเที่ยวที่ถ่ายรูปรายงาน "สแตนด์บายรับออก" · ช้า = บันทึกหลังเวลาออกเกิน ${LATE_MIN} นาที · STC-03 นับเป็นรอบ (2 รอบ/วัน)</p>`;
  $("trPrev").onclick = () => { trMonth.setMonth(trMonth.getMonth() - 1); tripReport(); };
  $("trNext").onclick = () => { trMonth.setMonth(trMonth.getMonth() + 1); tripReport(); };
  $("trPdf").onclick = (e) => { e.preventDefault(); tripPdf(label, days, cars, G, sumC, logs); };
}

async function tripPdf(label, days, cars, G, sumC, logs) {
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
    <div class="dsign"><div>ผู้จัดทำ<br><br>วันที่ ........./........./.........</div><div>ผู้ตรวจสอบ<br><br>วันที่ ........./........./.........</div><div>ผู้อนุมัติ<br><br>วันที่ ........./........./.........</div></div>${foot(1, 1)}`;
  const html = `<div class="doc" style="width:${W}px"><section class="dpg" style="width:${W}px;height:${H}px;margin:0;box-shadow:none">${p1}</section></div>`;
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
    if (canShare) $("pShare").onclick = () => navigator.share({ files: [file], title: fname }).catch(() => {});
  } catch (e) { toast("สร้าง PDF ไม่สำเร็จ: " + errMsg(e)); }
  finally { stage.remove(); }
}

window.tripPage = tripPage;
window.tripReport = tripReport;
