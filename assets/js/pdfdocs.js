/* Smart Shuttle Bus EV — work-schedule PDFs built from live data (period 26–25).
   Managers: full fleet schedule, legacy-format timesheet, any person's schedule. Drivers: own schedule only (RLS enforces this too).
   Rendering: HTML page(s) at A4 pixel size → html2pdf (html2canvas + jsPDF), so Thai text is drawn by the browser font. */
const VCODE = { "439edda2-b085-49da-9c68-bced8ca30313": "STC-01", "441bfef8-acc5-4234-885d-d26aa46b0f72": "STC-02", "9e65b5c0-8ce0-437c-b50d-5003cfe801a0": "STC-03", "e188773b-353a-4647-a640-e3c8bb27aaf9": "STC-04" };
const VPLATE = { "STC-01": "08804", "STC-02": "08824", "STC-03": "08958", "STC-04": "08960" };
const VHEX = { "STC-01": "#e5484d", "STC-02": "#e2a400", "STC-03": "#7048e8", "STC-04": "#2f9e44" };
const QTRIPS = { WA: 14, WB: 13, WC: 14, SA: 12, SB: 12, SC: 1, R2: 2 };
const KIND_TH = { regular: "พนักงานขับรถประจำ", relief: "พนักงานขับรถ (ขับแทน)", spare: "พนักงานขับรถสำรอง (สแปร์)" };
const LEAVE_CODE = { "ลาป่วย": "S", "ลากิจ": "P", "ลาพักร้อน": "V", "ลาไม่รับค่าจ้าง": "AB" };
const vcode = (id) => VCODE[id] || vById(id)?.code || "";
const ori = (o) => (String(o || "").startsWith("ศูนย์") ? "ศูนย์ฯ" : String(o || "").startsWith("สถานี") ? "รฟม." : esc(o || ""));
const first = (n) => esc(String(n || "").split(" ")[0]);
let pdfMonth = null, pdfDoc = null, pdfEmp = null, pdfBlob = null;

function periodDays(m) { const [a, b] = periodRange(m), out = []; for (let t = dObj(a); iso(t) <= b; t.setDate(t.getDate() + 1)) out.push(iso(t)); return out; }

async function pdfPage() {
  // default: the period that is running; from the 21st on, the next period (schedules are prepared ahead)
  if (!pdfMonth) { const t = dObj(today()); if (t.getDate() >= 21 && t.getDate() <= 25) t.setDate(26); pdfMonth = periodOf(iso(t)); }
  const mgr = isMgr();
  if (!mgr) { pdfDoc = "person"; pdfEmp = ME.employee?.id || null; }
  if (!pdfDoc) pdfDoc = "fleet";
  const emps = mgr ? await q(sb.from("employees").select("*").in("kind", ["regular", "relief", "spare"]).order("code")) : ME.employee ? [await q(sb.from("employees").select("*").eq("id", ME.employee.id).single())] : [];
  if (pdfDoc === "person" && !pdfEmp && emps.length) pdfEmp = emps[0].id;
  const tabs = mgr ? `<div class="tabs2">${[["fleet", "ตารางรวมทั้งรอบ"], ["sheet", "ตารางเข้าปฏิบัติงาน"], ["person", "แยกรายคน"]].map(([k, l]) => `<button data-doc="${k}" aria-selected="${pdfDoc === k}">${l}</button>`).join("")}</div>` : "";
  const picker = pdfDoc === "person" && mgr ? `<div class="fld" style="margin-top:10px"><label for="pEmp">พนักงานขับรถ</label><select id="pEmp">${emps.map((e) => `<option value="${e.id}" ${e.id === pdfEmp ? "selected" : ""}>${esc(e.full_name)}</option>`).join("")}</select></div>` : "";
  main().innerHTML = `<div class="wk"><button id="pPrev" aria-label="รอบก่อน">‹</button><div>${periodLabel(pdfMonth)}<small>${periodSpan(pdfMonth)}</small></div><button id="pNext" aria-label="รอบถัดไป">›</button></div>
   ${tabs}${picker}
   <div class="acts" style="display:flex;gap:8px;margin-top:12px"><button class="btn block" id="pMake">สร้าง PDF</button></div>
   <p class="sm" id="pMsg" style="margin:8px 0 0">ตัวอย่างเอกสารด้านล่าง กด "สร้าง PDF" เพื่อเปิด แชร์ หรือบันทึกไฟล์</p>
   <div class="docwrap" id="docWrap"><p class="loading"><span class="spin"></span>กำลังเตรียมเอกสาร…</p></div>`;
  $("pPrev").onclick = () => { pdfMonth.setMonth(pdfMonth.getMonth() - 1); pdfPage(); };
  $("pNext").onclick = () => { pdfMonth.setMonth(pdfMonth.getMonth() + 1); pdfPage(); };
  main().querySelectorAll("[data-doc]").forEach((b) => (b.onclick = () => { pdfDoc = b.dataset.doc; pdfPage(); }));
  if ($("pEmp")) $("pEmp").onchange = (e) => { pdfEmp = e.target.value; pdfPage(); };
  if (!emps.length) { $("docWrap").innerHTML = `<div class="empty"><b>ไม่พบข้อมูลพนักงานของบัญชีนี้</b>ติดต่อผู้จัดการ</div>`; $("pMake").disabled = true; return; }

  const [a, b] = periodRange(pdfMonth), days = periodDays(pdfMonth);
  const ws = await q(sb.from("work_schedules").select("*").gte("work_date", a).lte("work_date", b).in("employee_id", pdfDoc === "person" ? [pdfEmp] : emps.map((e) => e.id)).order("work_date"));
  let pages, land = false, fname;
  const tag = `${pdfMonth.getFullYear() + 543}-${String(pdfMonth.getMonth() + 1).padStart(2, "0")}`;
  if (pdfDoc === "fleet") { pages = docFleet(days, ws, emps); fname = `MRTA_ตารางคิวรถและพนักงานขับรถ_รอบ${tag}.pdf`; }
  else if (pdfDoc === "sheet") { pages = [docSheet(days, ws, emps)]; land = true; fname = `MRTA_ตารางเข้าปฏิบัติงาน_รอบ${tag}.pdf`; }
  else { const e = emps.find((x) => x.id === pdfEmp); pages = [docPerson(days, ws, e)]; fname = `MRTA_ตารางงาน_${e.full_name.split(" ")[0]}_รอบ${tag}.pdf`; }
  if (!ws.length) $("pMsg").innerHTML = `<b>ยังไม่มีตารางงานของรอบนี้</b> เอกสารจะว่าง`;
  const W = land ? 1123 : 794, H = land ? 794 : 1123;
  const html = pages.map((p) => `<section class="dpg" style="width:${W}px;height:${H}px">${p}</section>`).join("");
  const wrap = $("docWrap"); wrap.innerHTML = `<div class="docscale"><div class="doc" id="docEl" style="width:${W}px">${html}</div></div>`;
  const fit = () => { const s = Math.min(1, wrap.clientWidth / W), el = wrap.firstElementChild; el.style.transform = `scale(${s})`; el.style.height = `${(H * pages.length + 12 * (pages.length - 1)) * s}px`; };
  fit(); window.onresize = fit;
  pdfBlob = null;
  $("pMake").onclick = () => makePdf(fname, land, W, H);
}

async function makePdf(fname, land, W, H) {
  const btn = $("pMake");
  if (!window.html2pdf) { toast("โหลดตัวสร้าง PDF ไม่ได้ ตรวจสอบอินเทอร์เน็ต"); return; }
  btn.disabled = true; btn.innerHTML = `<span class="spin"></span> กำลังสร้าง PDF…`;
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const stage = document.createElement("div");
    stage.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;background:#fff`;
    stage.innerHTML = `<div class="doc" style="width:${W}px">${$("docEl").innerHTML}</div>`;
    stage.querySelectorAll(".dpg").forEach((p) => (p.style.marginBottom = "0"));
    document.body.appendChild(stage);
    const blob = await html2pdf().set({ margin: 0, filename: fname, image: { type: "jpeg", quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: W },
      jsPDF: { unit: "px", format: [W, H], orientation: land ? "landscape" : "portrait", hotfixes: ["px_scaling"] }, pagebreak: { mode: [] } }).from(stage.firstElementChild).outputPdf("blob");
    stage.remove();
    pdfBlob = blob; const url = URL.createObjectURL(blob);
    const file = new File([blob], fname, { type: "application/pdf" });
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    const s = $("sheet");
    s.innerHTML = `<div class="in"><div class="sh"><b>PDF พร้อมแล้ว</b><button class="lnk" id="shX">ปิด</button></div>
      <p class="sm" style="margin:0 0 10px">${esc(fname)} · ${(blob.size / 1024).toFixed(0)} KB</p>
      <div style="display:grid;gap:8px"><a class="btn block" href="${url}" target="_blank" rel="noopener">เปิดดู PDF</a>
      ${canShare ? `<button class="btn block" id="pShare">แชร์ / ส่ง LINE</button>` : ""}
      <a class="btn block" href="${url}" download="${esc(fname)}">บันทึกไฟล์</a></div></div>`;
    s.hidden = false;
    $("shX").onclick = () => (s.hidden = true);
    if (canShare) $("pShare").onclick = () => navigator.share({ files: [file], title: fname }).catch(() => {});
  } catch (e) { toast("สร้าง PDF ไม่สำเร็จ: " + errMsg(e)); }
  finally { btn.disabled = false; btn.textContent = "สร้าง PDF"; }
}

/* ---------- shared document parts ---------- */
function dHead(title, sub) {
  return `<header class="dh"><img src="assets/img/mrta-logo.png" alt="" class="dm"><div class="dt"><h1>${title}</h1><p>${sub}</p></div><div class="dco"><img src="assets/img/smart-terminal-logo.png" alt=""><span>บริษัท สมาร์ท เทอร์มินอล<br>คอร์ปอเรชั่น จำกัด</span></div></header>`;
}
function dFoot(p, n) { return `<footer class="df"><span>MRTA Shuttle Bus · ข้อมูลจากระบบ ณ ${bk(today())} ${nowHM()} น. · ${periodSpan(pdfMonth)}</span><span>หน้า ${p}/${n}</span></footer>`; }
const dSign = (labels) => `<div class="dsign">${labels.map((l) => `<div>${l}<br><br>วันที่ ........./........./.........</div>`).join("")}</div>`;
const dnum = (d) => { const x = dObj(d); return x.getDate() === 26 || x.getDate() === 1 ? `${x.getDate()} ${MS[x.getMonth()]}` : x.getDate(); };
const isWE = (d) => dObj(d).getDay() % 6 === 0;
const CARS = ["STC-01", "STC-02", "STC-03", "STC-04"];

function docFleet(days, ws, emps) {
  const E = Object.fromEntries(emps.map((e) => [e.id, e]));
  const rowsQ = days.map((d) => {
    const w = ws.filter((r) => r.work_date === d && r.status === "work"), empty = !ws.some((r) => r.work_date === d);
    const cells = CARS.map((c) => { const r = w.find((x) => vcode(x.vehicle_id) === c); return r ? `<td><span class="q">${esc(r.queue_code || "")}</span> ${String(r.first_time || "").slice(0, 5)} ${ori(r.first_origin)} <span class="n">· ${QTRIPS[r.queue_code] ?? ""}</span></td>` : `<td class="pk">${empty ? "–" : "จอด"}</td>`; }).join("");
    return `<tr class="${isWE(d) ? "we" : ""}"><td class="c">${dnum(d)}</td><td>${DOW[dObj(d).getDay()]}</td>${cells}</tr>`;
  }).join("");
  const tot = Object.fromEntries(CARS.map((c) => [c, ws.filter((r) => r.status === "work" && vcode(r.vehicle_id) === c).reduce((s, r) => s + (QTRIPS[r.queue_code] || 0), 0)]));
  const cards = CARS.map((c) => `<div class="dcard" style="--c:${VHEX[c]}"><b>${c}</b><span>ทะเบียน ${VPLATE[c]}</span><strong>${tot[c]}</strong><span>${c === "STC-03" ? "รอบศิริราช" : "เที่ยว"}/รอบงาน</span></div>`).join("");
  const p1 = `${dHead("ตารางคิวรถและพนักงานขับรถ " + periodLabel(pdfMonth), "MRTA Shuttle Bus · " + periodSpan(pdfMonth))}
   <div class="dcards">${cards}</div>
   <h2>คิวรถรายวัน</h2>
   <table class="dtb"><thead><tr><th>วันที่</th><th>วัน</th>${CARS.map((c) => `<th><i style="background:${VHEX[c]}"></i>${c}</th>`).join("")}</tr></thead><tbody>${rowsQ}</tbody></table>
   <p class="dnote">ช่อง: รหัสคิว · เวลาออกรอบแรก · ต้นทาง · จำนวนเที่ยว · STC-03 = เส้น MRT อิสรภาพ – รพ.ศิริราช (R2 = 2 รอบ/วัน) · แถวสีฟ้า = เสาร์–อาทิตย์</p>${dFoot(1, 2)}`;
  const rowsD = days.map((d) => {
    const w = ws.filter((r) => r.work_date === d), empty = !w.length;
    const cells = CARS.map((c) => { const r = w.find((x) => x.status === "work" && vcode(x.vehicle_id) === c); if (!r) return `<td class="pk">${empty ? "–" : "จอด"}</td>`; const sub = (r.note || "").includes("แทน"); return `<td class="${sub ? "sub" : ""}">${first(E[r.employee_id]?.full_name)}${sub ? " (แทน)" : ""}</td>`; }).join("");
    const off = w.filter((r) => r.status === "off" || r.status === "leave").map((r) => first(E[r.employee_id]?.full_name) + (r.status === "leave" ? ` (${esc(r.leave_type || "ลา")})` : "")).join(", ") || "–";
    const sb2 = w.filter((r) => r.status === "standby").map((r) => first(E[r.employee_id]?.full_name)).join(", ");
    return `<tr class="${isWE(d) ? "we" : ""}"><td class="c">${dnum(d)}</td><td>${DOW[dObj(d).getDay()]}</td>${cells}<td class="off">${off}</td><td class="sbx">${sb2}</td></tr>`;
  }).join("");
  const stat = emps.map((e) => { const m = ws.filter((r) => r.employee_id === e.id); const n = (f) => m.filter(f).length;
    return `<tr><td>${esc(e.full_name)}</td><td>${e.home_vehicle_id ? vcode(e.home_vehicle_id) : e.kind === "relief" ? "ขับได้ทุกคัน" : "สแปร์"}</td><td>${e.weekly_day_off == null ? "–" : DOW[e.weekly_day_off]}</td><td class="r">${n((r) => r.status === "work")}</td><td class="r">${n((r) => r.status === "work" && (r.note || "").includes("แทน"))}</td><td class="r">${n((r) => r.status === "standby")}</td><td class="r">${n((r) => r.status === "off")}</td><td class="r">${n((r) => r.status === "leave")}</td></tr>`; }).join("");
  const p2 = `${dHead("ตารางพนักงานขับรถ " + periodLabel(pdfMonth), "MRTA Shuttle Bus · " + periodSpan(pdfMonth))}
   <table class="dtb sm"><thead><tr><th>วันที่</th><th>วัน</th>${CARS.map((c) => `<th><i style="background:${VHEX[c]}"></i>${c}</th>`).join("")}<th>หยุด/ลา</th><th>สำรอง</th></tr></thead><tbody>${rowsD}</tbody></table>
   <h2>สรุปรายคน</h2>
   <table class="dst"><thead><tr><th>พนักงานขับรถ</th><th>ประจำรถ</th><th>วันหยุด</th><th class="r">ขับรถ</th><th class="r">ขับแทน</th><th class="r">สำรอง</th><th class="r">หยุด</th><th class="r">ลา</th></tr></thead><tbody>${stat}</tbody></table>
   ${dFoot(2, 2)}`;
  return [p1, p2];
}

function sheetCode(r, e) {
  if (!r) return "";
  if (r.status === "off") return "O";
  if (r.status === "leave") return LEAVE_CODE[r.leave_type] || "ลา";
  if (r.status === "work") return "M3";
  if (r.status === "standby") return e.kind === "spare" ? "" : "M3";
  return "";
}
function docSheet(days, ws, emps) {
  const TH1 = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  const grid = emps.map((e) => days.map((d) => { const r = ws.find((x) => x.employee_id === e.id && x.work_date === d); return { v: sheetCode(r, e), sub: !!(r && r.status === "work" && (r.note || "").includes("แทน")) }; }));
  const rows = emps.map((e, i) => `<tr><td>${i + 1}</td><td class="nm">${esc(e.full_name)}${e.kind === "spare" ? " (สแปร์)" : ""}</td>${grid[i].map((c) => `<td class="${c.v === "O" ? "o" : c.sub ? "cv" : ["S", "P", "V", "AB", "ลา"].includes(c.v) ? "lv" : ""}">${c.v}</td>`).join("")}</tr>`).join("");
  const cnt = (f) => days.map((_, j) => `<td>${grid.filter((g) => f(g[j].v)).length}</td>`).join("");
  const leg = [["M3", "", "เวลาทำงาน 06.30 - 15.30 น.", (v) => v === "M3"], ["O", "o", "วันหยุดประจำสัปดาห์", (v) => v === "O"], ["H", "h", "วันหยุดนักขัตฤกษ์", (v) => v === "H"], ["AB", "t", "ลาไม่รับค่าจ้าง", (v) => v === "AB"], ["V", "t", "ลาพักร้อน", (v) => v === "V"], ["S", "t", "ลาป่วย (มีใบรับรองแพทย์)", (v) => v === "S"], ["P", "t", "ลากิจ", (v) => v === "P"]];
  return `${dHead("ตารางเข้าปฏิบัติงานโครงการ รถบัสไฟฟ้า MRT " + periodLabel(pdfMonth), "MRTA Shuttle Bus · " + periodSpan(pdfMonth))}
   <table class="dlg"><thead><tr><th rowspan="2" style="width:30px">ลำดับ</th><th rowspan="2" class="nm">ชื่อ-นามสกุล</th>${days.map((d) => `<th>${dObj(d).getDate()}</th>`).join("")}</tr><tr>${days.map((d) => `<th class="${isWE(d) ? "we" : ""}">${TH1[dObj(d).getDay()]}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
   <table class="dlg" style="margin-top:10px"><tbody>${leg.map(([k, c, t, f]) => `<tr><td class="lc ${c}" style="width:30px">${k}</td><td class="nm">${t}</td>${cnt(f)}</tr>`).join("")}<tr class="tot"><td></td><td class="nm">รวม</td>${cnt((v) => v !== "")}</tr></tbody></table>
   <p class="dnote">ช่องสีเหลือง = ขับแทนวันหยุดคนขับประจำ · สำรองของพนักงานขับแทนลงเป็น M3 · สแปร์ลงงานเมื่อมีคนลา · วันลาตามที่ผู้จัดการบันทึกในแอพ</p>
   ${dSign(["ผู้จัดทำ", "ผู้ตรวจสอบ", "ผู้อนุมัติ"])}${dFoot(1, 1)}`;
}

function docPerson(days, ws, e) {
  ws = ws.filter((r) => r.employee_id === e.id);
  const R = Object.fromEntries(ws.map((r) => [r.work_date, r]));
  const n = (f) => ws.filter(f).length, trips = ws.filter((r) => r.status === "work").reduce((s, r) => s + (QTRIPS[r.queue_code] || 0), 0);
  const rows = days.map((d) => {
    const r = R[d], c = r && r.status === "work" ? vcode(r.vehicle_id) : "", sub = !!(r && (r.note || "").includes("แทน"));
    const st = !r ? `<span class="pk">ยังไม่จัด</span>` : { work: "ทำงาน", off: `<b class="offt">วันหยุด</b>`, standby: "สำรอง", leave: `<b class="offt">ลา${r.leave_type ? " · " + esc(r.leave_type) : ""}</b>` }[r.status];
    return `<tr class="${isWE(d) ? "we" : ""} ${sub ? "subr" : ""}"><td class="c">${dnum(d)}</td><td>${DOWL[dObj(d).getDay()]}</td><td>${st}</td><td>${c ? `<i style="background:${VHEX[c]}"></i><b>${c}</b>` : "–"}</td><td>${c ? `<span class="q">${esc(r.queue_code || "")}</span>` : ""}</td><td>${c ? `${String(r.first_time || "").slice(0, 5)} ${esc(r.first_origin || "")}` : ""}</td><td class="r">${c ? QTRIPS[r.queue_code] ?? "" : ""}</td><td>${sub ? "ขับแทนวันหยุดคนขับประจำ" : esc(r?.note || "")}</td></tr>`;
  }).join("");
  const home = e.home_vehicle_id ? vcode(e.home_vehicle_id) : e.kind === "relief" ? "ขับได้ทุกคัน" : "ตามรถว่างของวัน";
  return `${dHead("ตารางปฏิบัติงานรายบุคคล " + periodLabel(pdfMonth), "MRTA Shuttle Bus · " + periodSpan(pdfMonth))}
   <div class="dinfo"><div><small>ชื่อ-นามสกุล</small><b>${esc(e.full_name)}</b></div><div><small>ตำแหน่ง</small><b>${KIND_TH[e.kind] || ""}</b></div><div><small>รถประจำ</small><b>${home}</b></div><div><small>วันหยุดประจำสัปดาห์</small><b>${e.weekly_day_off == null ? "–" : DOWL[e.weekly_day_off]}</b></div></div>
   <div class="dcards">${[["วันทำงาน", n((r) => r.status === "work"), "วัน"], ["ขับแทน", n((r) => r.status === "work" && (r.note || "").includes("แทน")), "วัน"], ["สำรอง", n((r) => r.status === "standby"), "วัน"], ["วันหยุด/ลา", n((r) => r.status === "off" || r.status === "leave"), "วัน"], ["เที่ยว/รอบที่วิ่ง", trips, "ตามคิว"]].map(([l, v, u]) => `<div class="dcard" style="--c:#0b2a6b"><span>${l}</span><strong>${v}</strong><span>${u}</span></div>`).join("")}</div>
   <table class="dtb"><thead><tr><th>วันที่</th><th>วัน</th><th>สถานะ</th><th>รถ</th><th>คิว</th><th>รอบแรก</th><th class="r">เที่ยว</th><th>หมายเหตุ</th></tr></thead><tbody>${rows}</tbody></table>
   <p class="dnote">เวลาทำงาน M3 06.30 – 15.30 น. · เที่ยวตามคิว: STC-03 นับเป็นรอบ (2 รอบ/วัน) · ตารางอาจเปลี่ยนเมื่อมีการลาหรือรับรถแทน ดูข้อมูลล่าสุดในแอพ</p>
   ${dSign(["พนักงานขับรถ", "ผู้จัดการ"])}${dFoot(1, 1)}`;
}

window.pdfPage = pdfPage;
