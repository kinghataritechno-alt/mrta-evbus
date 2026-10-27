/* Smart Shuttle Bus EV — work-schedule PDFs built from live data (period 26–25).
   Managers: full fleet schedule, legacy-format timesheet, any person's schedule. Drivers: own schedule only (RLS enforces this too).
   Rendering: HTML page(s) at A4 pixel size → html2pdf (html2canvas + jsPDF), so Thai text is drawn by the browser font. */
const VCODE = { "439edda2-b085-49da-9c68-bced8ca30313": "STC-01", "441bfef8-acc5-4234-885d-d26aa46b0f72": "STC-02", "9e65b5c0-8ce0-437c-b50d-5003cfe801a0": "STC-03", "e188773b-353a-4647-a640-e3c8bb27aaf9": "STC-04" };
const VPLATE = { "STC-01": "08804", "STC-02": "08824", "STC-03": "08958", "STC-04": "08960" };
const VHEX = { "STC-01": "#e5484d", "STC-02": "#e2a400", "STC-03": "#7048e8", "STC-04": "#2f9e44" };
const QTRIPS = { WA: 14, WB: 13, WC: 14, SA: 12, SB: 12, SC: 1, R2: 2, RED: 16, YEL: 17, GRN: 13 };
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
  if (window.pdfDocWant) { pdfDoc = window.pdfDocWant; window.pdfDocWant = null; }
  if (!mgr) { if (!["person", "cert"].includes(pdfDoc)) pdfDoc = "person"; pdfEmp = ME.employee?.id || null; }
  if (!pdfDoc) pdfDoc = "fleet";
  const emps = mgr ? await q(sb.from("employees").select("*").in("kind", ["regular", "relief", "spare"]).order("code")) : ME.employee ? [await q(sb.from("employees").select("*").eq("id", ME.employee.id).single())] : [];
  if (["person", "cert"].includes(pdfDoc) && !pdfEmp && emps.length) pdfEmp = emps[0].id;
  const tabs = `<div class="tabs2">${(mgr ? [["fleet", "ตารางรวมทั้งรอบ"], ["sheet", "ตารางเข้าปฏิบัติงาน"], ["person", "แยกรายคน"], ["cert", "ใบรับรองเวลา/การใช้รถ"]] : [["person", "ตารางงานของฉัน"], ["cert", "ใบรับรองเวลา/การใช้รถ"]]).map(([k, l]) => `<button data-doc="${k}" aria-selected="${pdfDoc === k}">${l}</button>`).join("")}</div>`;
  const picker = ["person", "cert"].includes(pdfDoc) && mgr ? `<div class="fld" style="margin-top:10px"><label for="pEmp">พนักงานขับรถ</label><select id="pEmp">${emps.map((e) => `<option value="${e.id}" ${e.id === pdfEmp ? "selected" : ""}>${esc(e.full_name)}</option>`).join("")}</select></div>` : "";
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
  const ws = await q(sb.from("work_schedules").select("*").gte("work_date", a).lte("work_date", b).in("employee_id", ["person", "cert"].includes(pdfDoc) ? [pdfEmp] : emps.map((e) => e.id)).order("work_date"));
  let pages, land = false, fname;
  const tag = `${pdfMonth.getFullYear() + 543}-${String(pdfMonth.getMonth() + 1).padStart(2, "0")}`;
  if (pdfDoc === "fleet") { pages = docFleet(days, ws, emps); fname = `MRTA_ตารางคิวรถและพนักงานขับรถ_รอบ${tag}.pdf`; }
  else if (pdfDoc === "sheet") { pages = [docSheet(days, ws, emps)]; land = true; fname = `MRTA_ตารางเข้าปฏิบัติงาน_รอบ${tag}.pdf`; }
  else if (pdfDoc === "cert") {
    const e = emps.find((x) => x.id === pdfEmp);
    const shifts = await q(sb.from("work_shifts").select("*").eq("employee_id", pdfEmp).gte("work_date", a).lte("work_date", b)).catch(() => null);
    const vids = [...new Set(ws.filter((r) => r.vehicle_id).map((r) => r.vehicle_id).concat(e.home_vehicle_id ? [e.home_vehicle_id] : []))];
    const ch = vids.length ? await q(sb.from("charging_records").select("vehicle_id,receipt_date,total").in("vehicle_id", vids).gte("receipt_date", a).lte("receipt_date", b)).catch(() => []) : [];
    pages = [docCert(days, ws, e, shifts || [], ch)]; fname = `MRTA_ใบรับรองเวลาปฏิบัติงาน_${e.full_name.split(" ")[0]}_รอบ${tag}.pdf`;
    if (!shifts) $("pMsg").innerHTML = `<b>ระบบลงเวลาเข้า-ออกงานยังไม่เปิดใช้</b> (รอรัน SQL work_shifts) ช่องเวลา/เลขไมล์/แบตจะว่าง`;
    if (mgr && shifts) setTimeout(() => certEditor(days, ws, e, shifts), 0);
  }
  else { const e = emps.find((x) => x.id === pdfEmp); pages = [docPerson(days, ws, e)]; fname = `MRTA_ตารางงาน_${e.full_name.split(" ")[0]}_รอบ${tag}.pdf`; }
  if (!ws.length && pdfDoc !== "cert") $("pMsg").innerHTML = `<b>ยังไม่มีตารางงานของรอบนี้</b> เอกสารจะว่าง`;
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
  let stage = null;
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    stage = document.createElement("div");
    stage.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;background:#fff`;
    stage.innerHTML = `<div class="doc" style="width:${W}px">${$("docEl").innerHTML}</div>`;
    stage.querySelectorAll(".dpg").forEach((p) => (p.style.marginBottom = "0"));
    document.body.appendChild(stage);
    const blob = await html2pdf().set({ margin: 0, filename: fname, image: { type: "jpeg", quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: Math.max(W, window.innerWidth), scrollX: 0, scrollY: 0 },
      jsPDF: { unit: "px", format: [W, H], orientation: land ? "landscape" : "portrait", hotfixes: ["px_scaling"] }, pagebreak: { mode: [] } }).from(stage.firstElementChild).outputPdf("blob");
    pdfBlob = blob; pdfReady(blob, fname, fname.replace(/^MRTA_/, "").replace(/_/g, " ").replace(/\.pdf$/, ""));
  } catch (e) { toast("สร้าง PDF ไม่สำเร็จ: " + errMsg(e)); }
  finally { if (stage) stage.remove(); btn.disabled = false; btn.textContent = "สร้าง PDF"; }
}

/* ---------- shared document parts ---------- */
function dHead(title, sub) {
  return `<header class="dh"><img src="assets/img/mrta-logo.png" alt="" class="dm"><div class="dt"><h1>${title}</h1><p>${sub}</p></div><div class="dco"><img src="assets/img/smart-terminal-logo.png" alt=""><span>บริษัท สมาร์ท เทอร์มินอล<br>คอร์ปอเรชั่น จำกัด</span></div></header>`;
}
function dFoot(p, n) { return `<footer class="df"><span>MRTA Shuttle Bus · ข้อมูลจากระบบ ณ ${bk(today())} ${nowHM()} น. · ${periodSpan(pdfMonth)}</span><span>หน้า ${p}/${n}</span></footer>`; }
// signature block: blank space to sign → dotted line → (printed name) → role → date
const dSign = (labels) => `<div class="dsign">${labels.map((l) => `<div class="sg"><div class="sg-sp"></div><div class="sg-ln"></div><div class="sg-nm">(.......................................................)</div><div class="sg-rl">${l}</div><div class="sg-dt">วันที่ ........../........../..........</div></div>`).join("")}</div>`;
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
   <table class="dtb dperson"><thead><tr><th>วันที่</th><th>วัน</th><th>สถานะ</th><th>รถ</th><th>คิว</th><th>รอบแรก</th><th class="r">เที่ยว</th><th>หมายเหตุ</th></tr></thead><tbody>${rows}</tbody></table>
   <p class="dnote">เวลาทำงาน M3 06.30 – 15.30 น. · เที่ยวตามคิว: STC-03 นับเป็นรอบ (2 รอบ/วัน) · ตารางอาจเปลี่ยนเมื่อมีการลาหรือรับรถแทน ดูข้อมูลล่าสุดในแอพ</p>
   ${dSign(["พนักงานขับรถ", "ผู้จัดการ"])}${dFoot(1, 1)}`;
}

/* ---------- แบบบันทึกรับรองเวลาปฏิบัติงานและการใช้รถ (per driver, period 26–25) ---------- */
const hmBkk = (ts) => (ts ? tHM(ts).replace(":", ".") : "");
const hrs = (a, b) => (a && b ? (new Date(b) - new Date(a)) / 36e5 : 0);
function docCert(days, ws, e, shifts, ch) {
  const S = Object.fromEntries(shifts.map((x) => [x.work_date, x])), W = Object.fromEntries(ws.map((x) => [x.work_date, x]));
  const homeV = e.home_vehicle_id ? vcode(e.home_vehicle_id) : "";
  const routeOf = (c) => (c === "STC-03" ? "MRT อิสรภาพ – รพ.ศิริราช" : c ? "ลานจอด รฟม. – อาคารจอดรถศูนย์วัฒนธรรมฯ" : "");
  let nWork = 0, nOff = 0, ot = 0;
  const rows = days.map((d) => {
    const sh = S[d], w = W[d], vid = sh?.vehicle_id || w?.vehicle_id, c = vid ? vcode(vid) : "";
    const st = w?.status, off = st === "off" || st === "leave";
    if (sh?.clock_in || st === "work") nWork++; else if (off) nOff++;
    ot += Number(sh?.ot_hours || 0);
    const amt = ch.filter((x) => x.vehicle_id === vid && x.receipt_date === d).map((x) => fmt(x.total));
    const note = [st === "off" ? "หยุด" : st === "leave" ? "ลา" + (w.leave_type ? " (" + esc(w.leave_type) + ")" : "") : "", (w?.note || "").includes("แทน") ? `ขับแทน ${c}` : c && homeV && c !== homeV ? `ขับ ${c}` : "", st === "standby" && !c ? "สำรอง" : "", sh?.ot_hours ? `OT ${sh.ot_hours} ชม.` : "", esc(sh?.note || "")].filter(Boolean).join(" · ");
    return `<tr class="${off ? "offr" : ""}"><td class="c">${dObj(d).getDate()}</td><td>${off && !sh?.clock_in ? `<b class="offt">${st === "off" ? "หยุด" : "ลา"}</b>` : hmBkk(sh?.clock_in)}</td><td>${hmBkk(sh?.clock_out)}</td><td class="r">${sh?.odo_start ?? ""}</td><td class="r">${sh?.odo_end ?? ""}</td><td class="r">${sh?.soc_start != null ? sh.soc_start + "%" : ""}</td><td class="r">${sh?.soc_end != null ? sh.soc_end + "%" : ""}</td><td class="r">${amt.join(" + ")}</td><td class="nt">${note}</td></tr>`;
  }).join("");
  const kmTot = shifts.reduce((s, x) => s + (x.odo_end != null && x.odo_start != null ? Math.max(0, x.odo_end - x.odo_start) : 0), 0);
  const p = (pdfMonth.getMonth() + 11) % 12;
  return `<div class="ch"><img src="assets/img/smart-terminal-logo.png" alt=""><h1>แบบบันทึกรับรองเวลาปฏิบัติงานและการใช้รถ</h1></div>
   <div class="cf"><span>ประจำเดือน <b>${MONTH[pdfMonth.getMonth()]}</b></span><span>พ.ศ. <b>${pdfMonth.getFullYear() + 543}</b></span><span>สังกัด/แผนก <b>พัฒนาธุรกิจ</b></span><span>โครงการ <b>รถบัสไฟฟ้า MRT</b></span></div>
   <div class="cf"><span>ชื่อ-นามสกุล พนักงาน <b>${esc(e.full_name)}</b></span><span>รหัสพนักงาน <b>${esc(e.emp_no || "รอข้อมูล")}</b></span></div>
   <div class="cf"><span>หมายเลขรถบัสประจำ <b>${homeV || (e.kind === "relief" ? "ขับได้ทุกคัน" : "ตามรถว่าง")}</b></span><span>เส้นทางวิ่งประจำ <b>${routeOf(homeV) || "ตามตารางงาน"}</b></span></div>
   <div class="cbar">บันทึกการปฏิบัติงานประจำวัน (วันที่ 26 ${MONTH[p]} ${new Date(pdfMonth.getFullYear(), pdfMonth.getMonth() - 1, 1).getFullYear() + 543} ถึง 25 ${MONTH[pdfMonth.getMonth()]} ${pdfMonth.getFullYear() + 543})</div>
   <table class="ct"><thead><tr><th rowspan="2" style="width:34px">วันที่</th><th colspan="2">เวลาเข้า - ออกงาน</th><th colspan="2">เลขไมล์ (กม.)</th><th colspan="2">ระดับแบตเตอรี่ (%)</th><th rowspan="2" style="width:118px">รวมการชาร์จ<br>แบตเตอรี่ (บาท)</th><th rowspan="2">หมายเหตุ</th></tr>
   <tr><th>เข้า</th><th>ออก</th><th>เริ่ม</th><th>กลับ</th><th>เริ่ม</th><th>กลับ</th></tr></thead><tbody>${rows}</tbody></table>
   <div class="cs"><div><div class="cbar sm">สรุปการปฏิบัติงานประจำเดือน</div><ul><li>จำนวนวันทำงานปกติ <b>${nWork}</b> วัน</li><li>จำนวนวันหยุด/ลากิจ/ลาป่วย <b>${nOff}</b> วัน</li><li>รวมชั่วโมงการทำงานล่วงเวลา (OT) <b>${ot || "–"}</b> ชั่วโมง</li><li>ระยะทางรวม <b>${kmTot ? kmTot.toLocaleString("th-TH") : "–"}</b> กม.</li></ul></div>
   <div><div class="cbar sm">เงื่อนไขและข้อรับรอง</div><ol><li>พนักงานต้องลงเวลาตามความเป็นจริง และนำรถเข้าชาร์จ/ตรวจเช็กแบตเตอรี่ตามระเบียบก่อนส่งมอบงานทุกครั้ง</li><li>การปฏิบัติงานล่วงเวลา (OT) ต้องได้รับความเห็นชอบจากผู้ควบคุมงานก่อนเริ่มปฏิบัติงานจริงเท่านั้น</li></ol></div></div>
   <div class="cbar">ส่วนการรับรองและอนุมัติ</div>
   <div class="csg"><div><b>ผู้ขอรับรอง (พนักงานขับรถ)</b><p>ลงชื่อ ..................................</p><p>( ${esc(e.full_name)} )</p><p>ตำแหน่ง: พนักงานขับรถ</p><p>วันที่ ......../......../........</p></div>
   <div><b>ผู้อนุมัติ (ผู้ควบคุมงาน)</b><p>ลงชื่อ ..................................</p><p>( .................................... )</p><p>ตำแหน่ง: ผู้ควบคุมงาน / หัวหน้างาน</p><p>วันที่ ......../......../........</p></div>
   <div><b>ผู้ตรวจสอบ (ฝ่ายทรัพยากรบุคคล)</b><p>ลงชื่อ ..................................</p><p>( .................................... )</p><p>ตำแหน่ง: เจ้าหน้าที่ฝ่ายบุคคล</p><p>วันที่ ......../......../........</p></div></div>
   <footer class="df"><span>ข้อมูลจากแอพ (ลงเวลาเข้า-ออกงาน · ตารางงาน · ใบเสร็จชาร์จ) ณ ${bk(today())} ${nowHM()} น.</span><span>หน้า 1/1</span></footer>`;
}
// managers: list of days to correct times / odometer / battery / OT
function certEditor(days, ws, e, shifts) {
  const S = Object.fromEntries(shifts.map((x) => [x.work_date, x]));
  const box = document.createElement("section"); box.className = "card"; box.style.marginTop = "12px";
  box.innerHTML = `<div class="row1"><b>แก้ไข/เพิ่ม บันทึกเวลา · ${esc(e.full_name)}</b></div><p class="sm" style="margin:4px 0 8px">แตะวันที่เพื่อแก้ไข หรือใส่ OT ที่อนุมัติ</p>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${days.map((d) => `<button class="btn" data-ed="${d}" style="min-width:46px;padding:6px 8px;${S[d]?.clock_in ? "border-color:#3fa725" : ""}">${dObj(d).getDate()}</button>`).join("")}</div>`;
  $("docWrap").after(box);
  box.querySelectorAll("[data-ed]").forEach((b) => (b.onclick = () => shiftSheet(b.dataset.ed, e, S[b.dataset.ed], ws.find((x) => x.work_date === b.dataset.ed))));
}
function shiftSheet(d, e, sh, w) {
  const s = $("sheet"), t = (ts) => (ts ? tHM(ts) : "");
  s.innerHTML = `<div class="in"><div class="sh"><b>${esc(e.full_name.split(" ")[0])} · ${bk(d)}</b><button class="lnk" id="shX">ปิด</button></div>
   <div class="grid"><div class="fld"><label for="zIn">เวลาเข้า</label><input id="zIn" type="time" value="${t(sh?.clock_in)}"></div><div class="fld"><label for="zOut">เวลาออก</label><input id="zOut" type="time" value="${t(sh?.clock_out)}"></div>
   <div class="fld"><label for="zO1">ไมล์เริ่ม</label><input id="zO1" type="number" inputmode="decimal" value="${sh?.odo_start ?? ""}"></div><div class="fld"><label for="zO2">ไมล์กลับ</label><input id="zO2" type="number" inputmode="decimal" value="${sh?.odo_end ?? ""}"></div>
   <div class="fld"><label for="zS1">แบตเริ่ม %</label><input id="zS1" type="number" inputmode="numeric" value="${sh?.soc_start ?? ""}"></div><div class="fld"><label for="zS2">แบตกลับ %</label><input id="zS2" type="number" inputmode="numeric" value="${sh?.soc_end ?? ""}"></div>
   <div class="fld"><label for="zOt">OT ที่อนุมัติ (ชม.)</label><input id="zOt" type="number" step="0.5" inputmode="decimal" value="${sh?.ot_hours ?? ""}"></div><div class="fld"><label for="zN">หมายเหตุ</label><input id="zN" value="${esc(sh?.note || "")}"></div></div>
   <button class="btn block pri" id="zOk" style="margin-top:10px">บันทึก</button></div>`;
  s.hidden = false; $("shX").onclick = () => (s.hidden = true);
  $("zOk").onclick = async () => {
    const ts = (v) => (v ? new Date(`${d}T${v}:00+07:00`).toISOString() : null), num = (id) => ($(id).value === "" ? null : Number($(id).value));
    const row = { work_date: d, employee_id: e.id, vehicle_id: sh?.vehicle_id || w?.vehicle_id || e.home_vehicle_id || null, clock_in: ts($("zIn").value), clock_out: ts($("zOut").value), odo_start: num("zO1"), odo_end: num("zO2"), soc_start: num("zS1"), soc_end: num("zS2"), ot_hours: num("zOt"), note: $("zN").value.trim() || null, updated_at: new Date().toISOString() };
    try { await q(sb.from("work_shifts").upsert(row, { onConflict: "work_date,employee_id" })); s.hidden = true; toast("บันทึกแล้ว"); pdfPage(); } catch (err) { toast("บันทึกไม่สำเร็จ: " + errMsg(err)); }
  };
}
window.pdfPage = pdfPage;
