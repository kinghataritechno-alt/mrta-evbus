/* Smart Shuttle Bus EV — app shell (Supabase). Pages: home, schedule, inspect, charge, maint, vehicle, report, account, password */
const CFG = {
  url: "https://gxgiefixfpfbwiaftkdb.supabase.co",
  key: "sb_publishable_z7uItqnu_idS-uLr-ChxaQ_QaFO0c-j",
  bucket: "evidence",
};
const sb = window.supabase.createClient(CFG.url, CFG.key);
const $ = (id) => document.getElementById(id);
const main = () => $("main");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n, d = 2) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });
const MS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MONTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const DOWL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const bkk = () => new Date(Date.now() + 7 * 36e5);
const today = () => bkk().toISOString().slice(0, 10);
const nowHM = () => bkk().toISOString().slice(11, 16);
const dObj = (d) => new Date(d + "T00:00:00");
const bk = (d) => { if (!d) return "–"; const x = dObj(String(d).slice(0, 10)); return `${x.getDate()} ${MS[x.getMonth()]} ${x.getFullYear() + 543}`; };
const bkLong = (d) => { const x = dObj(d); return `วัน${DOWL[x.getDay()]}ที่ ${x.getDate()} ${MONTH[x.getMonth()]} ${x.getFullYear() + 543}`; };
const bkD = (ts) => (ts ? new Date(Date.parse(ts) + 7 * 36e5).toISOString().slice(0, 10) : ""); // timestamp → Bangkok date
const tHM = (ts) => ts ? new Date(new Date(ts).getTime() + 7 * 36e5).toISOString().slice(11, 16) : "";
const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
const COLOR = { "STC-01": "var(--c1)", "STC-02": "var(--c2)", "STC-03": "var(--c3)", "STC-04": "var(--c4)" };
const SCOL = { "STC-01": "var(--s1)", "STC-02": "var(--s2)", "STC-03": "var(--s3)", "STC-04": "var(--s4)", "ไม่ระบุ": "var(--s0)" };
const ROUTE = { R1: "ศูนย์วัฒนธรรมฯ – สถานี รฟม.", R2: "MRT อิสรภาพ – รพ.ศิริราช" };
const ROLE_TH = { ADMIN: "ผู้ดูแลระบบ", MANAGER: "ผู้จัดการ", CUSTOMER: "รฟม. (MRTA)", DRIVER: "พนักงานขับรถ", MAINTENANCE: "ช่างซ่อมบำรุง" };

let ME = null;        // my_today()
let PROFILE = null;   // profiles row
let VEH = [];         // vehicles visible to me
const isMgr = () => ["ADMIN", "MANAGER"].includes(PROFILE?.role);
const role = () => PROFILE?.role;

function toast(t) { if (String(t).includes(STALE)) return; const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2800); }
function errMsg(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/row-level security|permission denied/i.test(m)) return "ไม่มีสิทธิ์ทำรายการนี้";
  if (/duplicate key.*receipt_no/i.test(m)) return "เลขที่ใบเสร็จนี้เคยบันทึกแล้ว";
  if (/Failed to fetch|NetworkError/i.test(m)) return "เชื่อมต่ออินเทอร์เน็ตไม่ได้ ลองใหม่อีกครั้ง";
  if (/mime type|not supported|invalid_mime/i.test(m)) return "ระบบยังไม่รับไฟล์ชนิดนี้ (รอเปิดรับ PDF) ลองแนบเป็นรูปภาพแทน";
  if (/exceeded the maximum allowed size|Payload too large|413/i.test(m)) return "ไฟล์ใหญ่เกิน 10 MB";
  return m;
}
const busImg = (code) => `assets/img/${code}-thumb.jpg`;
const vById = (id) => VEH.find((v) => v.id === id);
const loading = () => (main().innerHTML = `<p class="loading"><span class="spin"></span>กำลังโหลด…</p>`);
// a page that is still loading after the user moved on must not draw over the new page
async function q(p) { const s0 = route.seq; const { data, error } = await p; if (s0 !== route.seq) throw new Error(STALE); if (error) throw error; return data; }

/* ---------- images ---------- */
/* Decode a camera photo robustly. Samsung/Android phones produce very large (50–200 MP) or HEIF photos that the
   plain <img> decoder rejects or runs out of memory on; createImageBitmap can downscale while decoding. */
/* last resort when the phone's browser cannot decode the photo (e.g. HEIF on Android): keep the original file as evidence */
function rawPhoto(file) {
  if (file.size > 10 * 1024 * 1024) { toast(`รูปใหญ่เกิน 10 MB (${(file.size / 1048576).toFixed(1)} MB) ลดความละเอียดกล้องแล้วถ่ายใหม่`); return null; }
  const type = isHeic(file) ? "image/heic" : /^image\/(jpeg|png|webp)$/i.test(file.type) ? file.type : file.type ? null : "image/jpeg";
  if (!type) { toast(`อ่านรูปไม่ได้ (ชนิดไฟล์ ${file.type}) ลองถ่ายใหม่`); return null; }
  toast("แนบรูปต้นฉบับแล้ว (เครื่องนี้แสดงตัวอย่างรูปไม่ได้) · แนะนำปิด \"รูปภาพประสิทธิภาพสูง (HEIF)\" ในตั้งค่ากล้อง");
  const b = new Blob([file], { type }); b.raw = true; return b;
}
const isHeic = (f) => /heic|heif/i.test(f.type || "") || /\.(heic|heif)$/i.test(f.name || "");
async function decodeImage(file, max) {
  if (window.createImageBitmap) {
    try { // ask the decoder for a small bitmap directly (low memory); keep EXIF orientation
      const probe = await createImageBitmap(file, { imageOrientation: "from-image" });
      const s = Math.min(1, max / Math.max(probe.width, probe.height)), w = Math.max(1, Math.round(probe.width * s)), h = Math.max(1, Math.round(probe.height * s));
      if (s === 1) return { src: probe, w, h };
      probe.close && probe.close();
      const bm = await createImageBitmap(file, { imageOrientation: "from-image", resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
      return { src: bm, w, h };
    } catch (e) { /* fall back to <img> */ }
  }
  return new Promise((res) => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { const s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)); res({ src: im, w: Math.max(1, Math.round(im.naturalWidth * s)), h: Math.max(1, Math.round(im.naturalHeight * s)), url: u }); };
    im.onerror = () => { URL.revokeObjectURL(u); res(null); };
    im.src = u;
  });
}
async function shrink(file, max = 1400, quality = 0.75) {
  const d = await decodeImage(file, max);
  if (d) {
    const c = document.createElement("canvas"); c.width = d.w; c.height = d.h;
    c.getContext("2d").drawImage(d.src, 0, 0, d.w, d.h);
    if (d.url) URL.revokeObjectURL(d.url); if (d.src.close) d.src.close();
    const b = await new Promise((r) => c.toBlob(r, "image/jpeg", quality));
    if (b) return b;
  }
  return rawPhoto(file);
}
async function upload(vehicleId, kind, blob, i = 0) {
  const pdf = blob.type === "application/pdf", ext = pdf ? "pdf" : blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : blob.type === "image/heic" ? "heic" : "jpg";
  const path = `${vehicleId}/${kind}/${today()}/${Date.now()}-${i}.${ext}`;
  const { error } = await sb.storage.from(CFG.bucket).upload(path, blob, { contentType: pdf ? "application/pdf" : ["image/png", "image/webp", "image/heic"].includes(blob.type) ? blob.type : "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}
async function signed(paths) {
  if (!paths?.length) return [];
  const { data } = await sb.storage.from(CFG.bucket).createSignedUrls(paths, 3600);
  return (data || []).map((x) => x.signedUrl).filter(Boolean);
}
document.addEventListener("error", (e) => { const im = e.target; if (im && im.tagName === "IMG" && String(im.src).startsWith("blob:") && !im.dataset.ph0) { im.dataset.ph0 = "1"; const sp = document.createElement("span"); sp.className = "sm"; sp.style.cssText = "display:grid;place-items:center;min-height:60px;text-align:center"; sp.textContent = "📷 แนบรูปแล้ว"; im.replaceWith(sp); } }, true);
document.addEventListener("click", (e) => { const v = e.target.closest("[data-view]"); if (v) { $("vImg").src = v.dataset.view || v.src; $("viewer").hidden = false; } });

/* ---------- boot ---------- */
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return location.replace("index.html");
  try {
    PROFILE = await q(sb.from("profiles").select("*").eq("user_id", session.user.id).single());
    ME = await q(sb.rpc("my_today"));
    VEH = await q(sb.from("vehicles").select("*").order("code"));
  } catch (e) { main().innerHTML = `<p class="err">โหลดข้อมูลไม่ได้: ${esc(errMsg(e))}</p>`; return; }
  $("who").textContent = `${PROFILE.display_name || PROFILE.username} · ${ROLE_TH[PROFILE.role]}`;
  drawNav();
  window.addEventListener("hashchange", route);
  route();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && ME && ME.date !== today() && route.dayChecked !== today()) route(); });
/* new version check: an iPad keeps the old app open for days — compare the deployed app.html with the running build */
const BUILD = (document.querySelector('script[src*="assets/js/app.js"]')?.getAttribute("src") || "").split("v=")[1] || "";
async function checkUpdate() {
  if (!BUILD || document.getElementById("updBar")) return;
  try {
    const html = await (await fetch("app.html?check=" + Date.now(), { cache: "no-store" })).text();
    const live = (html.match(/assets\/js\/app\.js\?v=([0-9A-Za-z-]+)/) || [])[1];
    if (live && live !== BUILD) {
      const b = document.createElement("button"); b.id = "updBar"; b.className = "updbar";
      b.innerHTML = "🔄 มีแอพเวอร์ชันใหม่ · แตะเพื่ออัปเดต"; b.onclick = () => location.reload();
      document.body.appendChild(b);
    }
  } catch (e) { /* offline: try again later */ }
}
setInterval(() => { if (!document.hidden) checkUpdate(); }, 5 * 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkUpdate(); });
setTimeout(checkUpdate, 15000);
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") location.replace("index.html"); });

const NAV_DRIVER = () => [
  ["home", "หน้าหลัก", '<path d="M4 11 12 4l8 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H4.5a.5.5 0 0 1-.5-.5z"/>'],
  ["vehicle", "รถของฉัน", '<rect x="4.5" y="4" width="15" height="13" rx="2.5"/><path d="M4.5 11h15M7.5 20v-3M16.5 20v-3"/>'],
  ["trip", "รายงาน", '<path d="M9 4h6v3H9z"/><rect x="5" y="5.5" width="14" height="15" rx="2"/><path d="M8.5 13l2.3 2.3L15.5 10.5"/>'],
  ["alerts", "แจ้งเตือน", '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'],
  ["account", "บัญชีผู้ใช้", '<circle cx="12" cy="8" r="4"/><path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4"/>'],
];
const NAV = () => PROFILE.role === "DRIVER" ? NAV_DRIVER() : [
  ["home", "หน้าหลัก", '<path d="M4 11 12 4l8 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H4.5a.5.5 0 0 1-.5-.5z"/>'],
  ["schedule", "ตารางงาน", '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'],
  ["vehicle", "ข้อมูลรถ", '<rect x="4.5" y="4" width="15" height="13" rx="2.5"/><path d="M4.5 11h15M7.5 20v-3M16.5 20v-3"/>'],
  isMgr() ? ["report", "รายงาน", '<path d="M4 19h16"/><path d="M6 15l4-5 3 3 5-7"/>'] : ["maint", "ซ่อมบำรุง", '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.6-.4-.4-2.6z"/>'],
  ["account", "บัญชี", '<circle cx="12" cy="8" r="4"/><path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4"/>'],
];
function drawNav() {
  $("nav").innerHTML = NAV().map(([k, l, p]) => `<a href="#${k}" data-k="${k}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${p}</svg>${l}</a>`).join("");
  drawSide(); setBell();
}
/* Tablet / PC: sidebar with every module the role may use, grouped like a platform */
const SVG = {
  home: '<path d="M4 11 12 4l8 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H4.5a.5.5 0 0 1-.5-.5z"/>',
  trip: '<path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13.2" r="3.4"/>',
  inspect: '<path d="M9 4h6v3H9z"/><rect x="5" y="5.5" width="14" height="15" rx="2"/><path d="M8.5 13l2.3 2.3L15.5 10.5"/>',
  charge: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3"/><path d="M11.5 8.5 9 12.5h3.5L10 15.5"/>',
  maint: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.6-.4-.4-2.6z"/>',
  accident: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17v.5"/>',
  schedule: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  pdf: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9.5 13h5M9.5 16.5h5"/>',
  vehicle: '<rect x="4.5" y="4" width="15" height="13" rx="2.5"/><path d="M4.5 11h15M7.5 20v-3M16.5 20v-3"/>',
  report: '<path d="M4 19h16"/><path d="M6 15l4-5 3 3 5-7"/>',
  tripreport: '<path d="M4 19h16"/><rect x="6" y="11" width="3" height="6"/><rect x="11" y="7" width="3" height="10"/><rect x="16" y="13" width="3" height="4"/>',
  drivers: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.9-3 3-4.6 5.5-4.6s4.6 1.6 5.5 4.6"/><path d="M15 6.5h5M15 10h5M16.5 13.5h3.5"/>',
  alerts: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4"/>',
};
function sideItems() {
  const r = role(), mgr = isMgr(), cust = r === "CUSTOMER", robot = '<img src="assets/img/smartai-96.png?v=2" alt="">';
  const g = [
    ["ภาพรวม", [["home", "หน้าหลัก"], ["DRIVER", "MAINTENANCE"].includes(r) && ["alerts", "แจ้งเตือน"], mgr && ["agent", "Manager Agent", robot], mgr && ["report", "รายงานการชาร์จไฟฟ้า"], (mgr || cust) && ["tripreport", "รายงานรอบเดินรถ"]]],
    ["งานประจำวัน", [["trip", "รอบเดินรถ"], !cust && ["inspect", "ตรวจสภาพรถ"], !cust && ["charge", "บันทึกการชาร์จ"], !cust && ["maint", "ซ่อมบำรุง"], !cust && !mgr && ["maint/accident", "แจ้งอุบัติเหตุ", SVG.accident]]],
    ["ข้อมูล", [mgr && ["drivers", "ข้อมูลคนขับ"], ["schedule", "ตารางงาน"], !cust && ["pdf", "ตารางงาน (PDF)"], ["vehicle", "ข้อมูลรถ"]]],
    ["ช่วยเหลือ", [!cust && ["ai", "Smart AI ผู้ช่วย", robot], ["account", "บัญชีผู้ใช้"]]],
  ];
  return g.map(([h, xs]) => [h, xs.filter(Boolean)]).filter(([, xs]) => xs.length);
}
function drawSide() {
  const el = $("side"); if (!el) return;
  el.innerHTML = `<div class="sbrand"><img src="assets/img/smart-terminal-logo.png" alt=""><div><b>Smart Shuttle Bus EV</b><span>MRTA Shuttle EV · SMART TERMINAL</span></div></div>
    <nav aria-label="เมนูทั้งหมด">${sideItems().map(([h, xs]) => `<p class="sgrp">${h}</p>` + xs.map(([k, l, ico]) => `<a href="#${k}" data-k="${k.split("/")[0]}"${k.includes("/") ? ` data-sub="${k}"` : ""} title="${l}">${ico && ico.startsWith("<img") ? ico : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${ico || SVG[k] || ""}</svg>`}<span>${l}</span></a>`).join("")).join("")}</nav>
    <div class="sme"><b>${esc(PROFILE.display_name || PROFILE.username)}</b><span>${ROLE_TH[PROFILE.role] || ""}</span></div>`;
}
const PAGES = { home, alerts, schedule, inspect, charge, maint, vehicle, report, account, password, trip: () => window.tripPage(), tripstops: () => window.tripStops(), tripreport: () => window.tripReport(), drivers: () => (window.driversPage ? window.driversPage() : Promise.reject(new Error("โหลดหน้าข้อมูลคนขับไม่สำเร็จ ลองเปิดแอพใหม่"))), ai: () => (window.aiPage ? window.aiPage() : Promise.reject(new Error("โหลด Smart AI ไม่สำเร็จ ลองเปิดแอพใหม่"))), agent: () => (window.agentPage ? window.agentPage() : Promise.reject(new Error("โหลดหน้า Manager Agent ไม่สำเร็จ ลองเปิดแอพใหม่"))), pdf: () => (window.pdfPage ? window.pdfPage() : Promise.reject(new Error("โหลดหน้าเอกสารไม่สำเร็จ ลองเปิดแอพใหม่"))) };
const STALE = "\u2063stale";
function route() {
  $("sheet").hidden = true; $("viewer").hidden = true; // never leave a sheet over a different page
  // tab left open overnight: reload today's assignment first
  // (once per calendar day, so a phone whose clock disagrees with the server cannot loop)
  if (ME && ME.date !== today() && route.dayChecked !== today()) { route.dayChecked = today(); if (typeof TRIP !== "undefined") TRIP.date = null; refreshMe().then(route, route); return; }
  route.seq = (route.seq || 0) + 1; const my = route.seq;
  const raw = (location.hash || "#home").slice(1);
  let k = raw.split("/")[0];
  if (k === "maint") mTab = raw.includes("accident") ? "A" : "M";
  // drivers and technicians keep the password the admin issued (decision 26 ต.ค. 2569): no forced change, no change page
  const fixedPw = ["DRIVER", "MAINTENANCE"].includes(PROFILE.role);
  if (fixedPw && k === "password") k = "account";
  if (!fixedPw && PROFILE.must_change_password && k !== "password") k = "password";
  if (!PAGES[k]) k = "home";
  if ((k === "report" || k === "agent" || k === "drivers") && !isMgr()) k = "home";
  document.querySelectorAll("#nav a").forEach((a) => a.toggleAttribute("aria-current", a.dataset.k === k) || a.setAttribute("aria-current", a.dataset.k === k ? "page" : "false"));
  document.querySelectorAll("#nav a, #side a").forEach((a) => { const on = a.dataset.sub ? raw === a.dataset.sub : a.dataset.k === k && !(k === "maint" && raw.includes("accident") && a.closest("#side") && document.querySelector('#side a[data-sub="maint/accident"]')); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  main().dataset.page = k;
  $("title").textContent = { home: "Smart Shuttle Bus EV", schedule: "ตารางปฏิบัติงาน", inspect: "ตรวจสภาพรถก่อนออกรถ", charge: "บันทึกการชาร์จไฟฟ้า", maint: "ประวัติการซ่อมบำรุง", vehicle: "ข้อมูลรถ", report: "รายงานการชาร์จไฟฟ้า", agent: "Manager Agent", alerts: "แจ้งเตือน", ai: "Smart AI ผู้ช่วย", drivers: "ข้อมูลคนขับ", pdf: "ตารางงาน (PDF)", trip: "รายงานรอบเดินรถ", tripstops: "บันทึกผู้โดยสาร", tripreport: "รายงานรอบเดินรถประจำเดือน", account: "บัญชีผู้ใช้", password: "ตั้งรหัสผ่านใหม่" }[k];
  scrollTo(0, 0);
  loading();
  PAGES[k]().catch((e) => { if (my === route.seq && !(e && e.message === STALE)) main().innerHTML = `<p class="err">${esc(errMsg(e))}</p>`; });
}
async function refreshMe() { ME = await q(sb.rpc("my_today")); VEH = await q(sb.from("vehicles").select("*").order("code")); }
function myVehicles() { return isMgr() || ["MAINTENANCE"].includes(role()) ? VEH : VEH.filter((v) => (ME.vehicles || []).some((x) => x.id === v.id)); }
function busPicker(list, sel, attr = "data-b") {
  return `<div class="buses">${list.map((v) => `<button class="busbtn" style="--c:${COLOR[v.code]}" aria-pressed="${v.id === sel}" ${attr}="${v.id}"><b>${v.code}</b><small class="num">${v.plate}</small></button>`).join("")}</div>`;
}
/* ---------- PDF ready sheet (all PDFs): open · share file · save ---------- */
// iPad/iPhone share sheets can hide LINE for files with Thai names → share an ASCII file name; the Thai title stays in the PDF.
const PDF_EN = [["รายงานตรวจรถประจำวัน", "Daily_Inspection"], ["รายงานการเดินรถและผู้โดยสาร", "Daily_Trips_Passengers"], ["ตารางคิวรถและพนักงานขับรถ", "Fleet_Schedule"], ["ตารางเข้าปฏิบัติงาน", "Timesheet"], ["ใบรับรองเวลาปฏิบัติงาน", "Work_Certificate"], ["รายงานรอบเดินรถ", "Monthly_Trips"], ["ตารางงาน", "Schedule"], ["รอบ", "P"]];
function pdfAscii(fname) { let s = fname; PDF_EN.forEach(([th, en]) => (s = s.split(th).join(en))); return s.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/_(\.pdf)$/i, "$1"); }
function pdfReady(blob, fname, title) {
  const name = pdfAscii(fname), url = URL.createObjectURL(blob), file = new File([blob], name, { type: "application/pdf" });
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const sh = $("sheet");
  sh.innerHTML = `<div class="in"><div class="sh"><b>${esc(title || "PDF พร้อมแล้ว")}</b><button class="lnk" id="shX">ปิด</button></div>
    <p class="sm" style="margin:0 0 10px">${esc(name)} · ${(blob.size / 1024).toFixed(0)} KB</p>
    <div style="display:grid;gap:8px"><a class="btn pri block" href="${url}" target="_blank" rel="noopener">เปิดดู PDF</a>
    ${canShare ? `<button class="btn block" id="pShare">แชร์ไฟล์ (LINE / อีเมล / ไฟล์)</button>` : ""}
    <a class="btn block" href="${url}" download="${esc(name)}">บันทึกไฟล์</a></div>
</div>`;
  sh.hidden = false; $("shX").onclick = () => (sh.hidden = true);
  if (canShare) $("pShare").onclick = () => navigator.share({ files: [file], title: name }).catch((e) => { if (e && e.name !== "AbortError") toast("แชร์ไฟล์ไม่ได้ ลองกด บันทึกไฟล์ แล้วแนบใน LINE"); });
}
/* ---------- copy / LINE sharing (works on Android Chrome, iPhone Safari and LINE's in-app browser) ---------- */
function copyFallback(t) {
  try { const ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
    document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, t.length); const ok = document.execCommand("copy"); ta.remove(); return ok; } catch (e) { return false; }
}
function copyText(t, quiet) {
  const done = () => { if (!quiet) toast("คัดลอกแล้ว วางในกลุ่ม LINE ได้เลย"); };
  if (copyFallback(t)) { done(); return; } // synchronous: keeps the tap gesture on Android
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, () => toast("คัดลอกไม่ได้ในเครื่องนี้ กดค้างที่ข้อความเพื่อคัดลอกเอง"));
  else toast("คัดลอกไม่ได้ในเครื่องนี้ กดค้างที่ข้อความเพื่อคัดลอกเอง");
}
const lineURL = (t) => "https://line.me/R/share?text=" + encodeURIComponent(t);
const lineBtn = (t, label = "📤 ส่งข้อความเข้ากลุ่ม LINE") => `<a class="btn pri block" href="${lineURL(t)}" target="_blank" rel="noopener">${label}</a>`;
/* share a photo: Web Share with the file only (LINE on Android drops or rejects file+text), else save it for manual attach */
function sharePhoto(file, text) {
  if (text) copyText(text, true);
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file] }).then(() => toast("วางข้อความต่อได้เลย (คัดลอกไว้แล้ว)")).catch((e) => { if (e && e.name !== "AbortError") savePhoto(file); });
  } else if (file) savePhoto(file);
}
function savePhoto(file) {
  const a = document.createElement("a"), u = URL.createObjectURL(file); a.href = u; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
  toast("บันทึกรูปลงเครื่องแล้ว เปิด LINE แล้วแนบรูปจากอัลบั้ม");
}

/* ================= HOME ================= */
async function home() {
  const d = ME.date, name = ME.employee?.name || PROFILE.display_name;
  let html;
  if (role() === "DRIVER") html = await homeDriver();
  else html = `<div class="z-head"><h1 class="hello">สวัสดี ${esc(name)}</h1><p class="sub">${bkLong(d)}</p></div>` + await homeFleet();
  main().innerHTML = `<div class="dash${role() === "DRIVER" ? " dh" : ""}">${html}</div>`;
  bindHome();
}
/* ---- Driver home (MRTA-UI-DRIVER-HOME-V1.1): profile hero · score/praise · my bus today · actions · main menu ---- */
const DI = {
  id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4M14 10h4.5M14 13.5h3"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c1-3.4 3.7-5.2 7-5.2s6 1.8 7 5.2"/>',
  phone: '<path d="M6.6 3.5h2.6l1.4 4-2 1.3a11 11 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.4 16.4 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  route: '<circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M8 16.5 16 7.5"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.4 3 7.8 7 9 4-1.2 7-4.6 7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  swap: '<path d="M4 9h14l-3.5-3.5M20 15H6l3.5 3.5"/>',
  clip: '<path d="M9 4h6v3H9z"/><rect x="5" y="5.5" width="14" height="15" rx="2"/><path d="M8.5 13l2.3 2.3L15.5 10.5"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  bus: '<rect x="4.5" y="4" width="15" height="13" rx="2.5"/><path d="M4.5 11h15M7.5 20v-3M16.5 20v-3"/>',
  map: '<path d="M12 21s-5.5-5-5.5-9.5a5.5 5.5 0 0 1 11 0C17.5 16 12 21 12 21z"/><circle cx="12" cy="11.5" r="2"/><path d="M4 20.5h16"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9.5 12h5M9.5 15.5h5M9.5 8.5h2"/>',
};
const dic = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DI[k]}</svg>`;
const DMENU = () => [
  ["#inspect", ACT_IC.inspect, "ตรวจสภาพรถ", "ก่อนออกเดินรถ"],
  ["#charge", ACT_IC.charge, "บันทึกการชาร์จ", "พลังงานรถ EV"],
  ["#maint", ACT_IC.maint, "ซ่อมบำรุง", "แจ้งปัญหารถ"],
  ["#maint/accident", ACT_IC.accident, "แจ้งอุบัติเหตุ", "เหตุการณ์ความปลอดภัย"],
  ["#schedule", ACT_IC.schedule, "ตารางงาน", "รอบการเดินรถ"],
  ["#pdf", DI.doc, "รายงาน", "สรุปผลการปฏิบัติงาน"],
  ["#vehicle", ACT_IC.vehicle, "ข้อมูลรถ", "ข้อมูลประจำรถ"],
  ["#ai", null, "Smart AI ผู้ช่วย", "สอบถามข้อมูล / คู่มือ"],
];
const dTile = ([href, icon, t, sub]) => `<a class="dm" href="${href}">${icon ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>` : `<img src="assets/img/smartai-96.png?v=2" alt="">`}<b>${t}</b><small>${sub}</small></a>`;
async function heroCard() {
  const P = window.myProfileData ? await window.myProfileData().catch(() => null) : null;
  const e = P?.e, p = P?.p, name = e?.full_name || ME.employee?.name || PROFILE.display_name;
  const hv = e?.home_vehicle_id ? vById(e.home_vehicle_id) : null, wait = `<span class="sm">รอข้อมูล</span>`;
  const row = (k, l, v) => `<div class="hr"><span class="hk">${dic(k)}${l}</span><span class="hv">${v}</span></div>`;
  return `<a class="dhero" href="#account" aria-label="ข้อมูลของฉัน">
    <span class="hero-ph">${P?.url ? `<img src="${P.url}" alt="">` : `<span class="pf-ini">${esc(String(name).trim().slice(0, 1))}</span>`}</span>
    <span class="hero-tx"><b class="hero-nm">${esc(name)}</b>
      <span class="hero-sub">${esc(P?.kindTh || "พนักงานขับรถ")}${hv ? ` · รถประจำ <b>${hv.code}</b>` : ""}</span></span>
      <span class="hero-kv">${row("id", "รหัสพนักงาน", e?.emp_no ? `<span class="num">${esc(e.emp_no)}</span>` : wait)}${row("user", "อายุ", P?.age != null ? `${P.age} ปี` : wait)}${row("phone", "เบอร์ติดต่อ", p?.phone ? `<u class="num">${esc(p.phone)}</u>` : wait)}${row("pin", "ที่อยู่", p?.address ? esc(p.address) : wait)}</span>
    <span class="hero-go">${dic("chev")}</span></a>
    <p class="sub hero-date">${bkLong(ME.date)}</p>`;
}
async function homeDriver() {
  const vs = myVehicles();
  const [claims, hero, score] = await Promise.all([q(sb.from("cover_claims").select("*").eq("work_date", ME.date)), heroCard(), window.lastWorkScore ? window.lastWorkScore().catch(() => null) : null]);
  let h = window.dayScoreCard ? await window.dayScoreCard(score) : "";
  h += window.alertsCard ? await window.alertsCard({ exclude: score?.date }) : "";
  h += window.shiftCard ? await window.shiftCard() : "";
  const pend = claims.filter((c) => c.status === "pending" && c.relief_employee_id === ME.employee?.id);
  if (pend.length) h += `<p class="notice" style="margin-top:12px">${pend[0].kind === "switch" ? `เปลี่ยนรถเป็น ${vById(pend[0].vehicle_id)?.code || ""} แล้ว` : "รับรถแทนแล้ว"} รอผู้จัดการอนุมัติ ใช้รถได้ตามปกติ</p>`;
  const absent = claims.find((c) => c.absent_employee_id === ME.employee?.id && c.status !== "rejected");
  if (absent) h += absent.kind === "switch" ? `<p class="notice" style="margin-top:12px">วันนี้มีการสลับรถกับคุณ (${esc(absent.reason)}) · คุณขับ <b>${vById(absent.from_vehicle_id)?.code || "รถคันใหม่"}</b> แทน ${vById(absent.vehicle_id)?.code || ""} ${absent.status === "pending" ? "· รออนุมัติ" : ""}</p>`
    : `<p class="notice" style="margin-top:12px">วันนี้มีผู้รับรถแทนคุณแล้ว (${esc(absent.reason)}) ${absent.status === "pending" ? "รออนุมัติ" : "อนุมัติแล้ว"}</p>`;
  h = `<div class="z-head">${hero}</div><div class="z-side">${h}</div><div class="z-main">`;
  if (vs.length) {
    const ids = vs.map((v) => v.id);
    const [queue, insp, jobs] = await Promise.all([
      q(sb.from("vehicle_queue").select("*").eq("work_date", ME.date).in("vehicle_id", ids)),
      q(sb.from("inspections").select("vehicle_id,result,inspected_at").in("vehicle_id", ids).gte("inspected_at", ME.date + "T00:00:00+07:00").order("inspected_at", { ascending: false })),
      q(sb.from("maintenance_jobs").select("vehicle_id,status,vehicle_stopped").in("vehicle_id", ids).lt("status", 2)).catch(() => []),
    ]);
    const canSwitch = ME.schedule?.status === "work" && !claims.some((c) => c.relief_employee_id === ME.employee?.id && c.status !== "rejected");
    h += `<section class="card mybus-wrap"><h2 class="mb-h">${dic("bus")}รถของฉันวันนี้</h2>` + vs.map((v) => {
      const qq = queue.find((x) => x.vehicle_id === v.id), ins = insp.find((x) => x.vehicle_id === v.id), stop = jobs.some((j) => j.vehicle_id === v.id && j.vehicle_stopped);
      // status from live data only: stopped for repair > abnormal inspection > not inspected yet > ready
      const st = stop ? ["หยุดซ่อม", "bad"] : !ins ? ["รอตรวจสภาพรถ", "warn"] : ins.result !== "normal" ? ["ตรวจพบไม่ปกติ", "bad"] : ["พร้อมให้บริการ", "ok"];
      return `<article class="mybus" style="--c:${COLOR[v.code]}">
        <img class="mb-img" src="${busImg(v.code)}" alt="${v.code}">
        <div class="mb-info"><div class="mb-top"><b class="mb-code">${v.code}</b><span class="mb-plate num">${esc(v.plate || "")}</span>
          ${ins ? `<span class="mb-ins ${ins.result === "normal" ? "ok" : "bad"}">${ins.result === "normal" ? "✓ ตรวจแล้ว ปกติ" : "! ตรวจแล้ว ไม่ปกติ"}</span>` : `<span class="mb-ins warn">ยังไม่ตรวจรถ</span>`}</div>
          <div class="mb-route">${ROUTE[v.route_code] || ""}</div></div>
        <div class="mb-stats">
          <div><span>${dic("clock")}รอบแรก</span><b class="num">${qq ? String(qq.first_time).slice(0, 5) : "–"}</b><small>${qq ? "จาก" + esc(qq.first_origin) : "ยังไม่มีคิววันนี้"}</small></div>
          <div><span>${dic("route")}แผนการเดินรถ</span><b class="num">${qq ? ((tripsOf(qq.queue_code).length || qq.planned_trips) + " เที่ยว") : "–"}</b><small>วันนี้</small></div>
          <div><span>${dic("shield")}สถานะรถ</span><b class="st ${st[1]}">${st[0]}</b></div>
        </div></article>`;
    }).join("") + `<div class="mb-acts${canSwitch ? "" : " one"}">
        <a class="mb-btn pri" href="#trip"><span class="mb-ic">${dic("clip")}</span><span><b>รายงานรอบเดินรถ</b><small>สแตนด์บายรับออก</small></span>${dic("chev")}</a>
        ${canSwitch ? `<button class="mb-btn" id="swBtn"><span class="mb-ic">${dic("swap")}</span><span><b>เปลี่ยนรถวันนี้</b><small>รถเสีย / สลับกับเพื่อน / ผู้จัดการสั่ง</small></span>${dic("chev")}</button>` : ""}
      </div></section>`;
  } else {
    const st = ME.schedule?.status;
    h += `<h2>วันนี้</h2><div class="empty"><b>${st === "off" ? "วันหยุดของคุณ" : st === "leave" ? "วันลา" : st === "standby" ? "วันนี้คุณเป็นคนขับสำรอง" : "วันนี้ยังไม่มีรถที่ได้รับมอบหมาย"}</b>${st === "standby" ? "พร้อมรับรถแทนเมื่อมีคนขับลาหรือขาด" : "ดูตารางงานของคุณได้ที่เมนูตารางงาน"}</div>`;
    if (["relief", "spare"].includes(ME.employee?.kind)) {
      const cl = await q(sb.rpc("claimable_today"));
      h += `<h2>รับรถแทน <small>รถที่คนขับประจำยังไม่เริ่มงาน</small></h2>` + (cl.length ? `<div class="list">${cl.map((c) => `<article class="bus" style="--c:${COLOR[c.code]}"><img src="${busImg(c.code)}" alt=""><div class="b"><div class="row1"><b>${c.code}</b><span class="plate num">${c.plate}</span></div><div class="sm">คนขับตามตาราง <b>${esc(c.driver_name || "ไม่มี")}</b></div><button class="btn" data-claim="${c.vehicle_id}" data-absent="${c.driver_id || ""}" data-name="${esc(c.driver_name || "")}" data-code="${c.code}">รับรถแทน</button></div></article>`).join("")}</div>` : `<div class="empty">ไม่มีรถที่ต้องรับแทนตอนนี้</div>`);
    }
  }
  return h + `</div><div class="z-menu"><h2>เมนูหลัก</h2><div class="dmenu">${DMENU().map(dTile).join("")}</div></div>`;
}
/* แจ้งเตือน (drivers / technicians): last work-day score + open alerts */
async function alerts() {
  const sc = window.lastWorkScore ? await window.lastWorkScore().catch(() => null) : null;
  const a = (window.dayScoreCard ? await window.dayScoreCard(sc) : "") + (window.alertsCard ? await window.alertsCard({ exclude: sc?.date }) : "");
  main().innerHTML = a || `<div class="empty" style="margin-top:16px"><b>ไม่มีการแจ้งเตือน</b>Manager Agent ตรวจทุกวันเวลา 08:00 · 12:00 · 16:00 · 20:45 น.</div>`;
  setBell();
}
async function setBell() {
  const b = $("bell"); if (!b) return;
  if (!["DRIVER", "MAINTENANCE"].includes(PROFILE.role) || !ME.employee?.id) { b.hidden = true; return; }
  b.hidden = false;
  const since = iso(new Date(dObj(today()).getTime() - 2 * 864e5));
  const { count } = await sb.from("compliance_alerts").select("id", { count: "exact", head: true }).eq("employee_id", ME.employee.id).is("resolved_at", null).is("ack_at", null).gte("work_date", since);
  const n = count || 0;
  b.classList.toggle("dot", n > 0); b.setAttribute("aria-label", n ? `แจ้งเตือน ${n} เรื่องที่ยังไม่รับทราบ` : "แจ้งเตือน");
  document.querySelectorAll('#nav a[data-k="alerts"]').forEach((a) => a.classList.toggle("dot", n > 0));
}
async function homeFleet() {
  const d = ME.date;
  const [ws, insp, claims, jobs, accs, queue] = await Promise.all([
    isMgr() ? q(sb.from("work_schedules").select("*, employees(full_name,kind)").eq("work_date", d)) : Promise.resolve([]),
    role() === "CUSTOMER" ? Promise.resolve([]) : q(sb.from("inspections").select("vehicle_id,result").gte("inspected_at", d + "T00:00:00+07:00")),
    isMgr() ? q(sb.from("cover_claims").select("*").eq("status", "pending")) : Promise.resolve([]),
    role() === "CUSTOMER" ? Promise.resolve([]) : q(sb.from("maintenance_jobs").select("id,status,vehicle_id").lt("status", 2)),
    role() === "CUSTOMER" ? Promise.resolve([]) : q(sb.from("accidents").select("id,status").lt("status", 2)),
    q(sb.from("vehicle_queue").select("*").eq("work_date", d)),
  ]);
  let top = `<section class="sum"><div class="tile"><small>รถให้บริการวันนี้</small><b class="num">${queue.length || "–"}/${VEH.length}</b><span>คัน</span></div>
    <div class="tile ${jobs.length ? "alert" : ""}"><small>งานซ่อมค้าง</small><b class="num">${jobs.length}</b><span>รายการ</span></div>
    <div class="tile ${accs.length ? "alert" : ""}"><small>อุบัติเหตุยังไม่ปิด</small><b class="num">${accs.length}</b><span>เรื่อง</span></div></section>`, h = "";
  if (claims.length) {
    const emp = await q(sb.from("employees").select("id,full_name"));
    const nm = (id) => emp.find((e) => e.id === id)?.full_name || "–";
    h += `<h2>รออนุมัติรับรถแทน / เปลี่ยนรถ <small>${claims.length} รายการ</small></h2><div class="list">${claims.map((c) => `<div class="card"><div class="row1"><b>${vById(c.vehicle_id)?.code || ""}</b><span class="pill warn">รออนุมัติ</span></div>
      <p class="sm" style="margin:4px 0 8px">${c.kind === "switch" ? `${esc(nm(c.relief_employee_id))} เปลี่ยนไปขับ ${vById(c.vehicle_id)?.code || ""}${c.absent_employee_id ? ` · ${esc(nm(c.absent_employee_id))} ได้ ${vById(c.from_vehicle_id)?.code || ""} แทน (สลับกัน)` : ""}` : `${esc(nm(c.relief_employee_id))} รับรถแทน ${esc(nm(c.absent_employee_id))}`} · ${esc(c.reason)} · ${bk(c.work_date)} ${tHM(c.claimed_at)} น.</p>
      <div class="acts"><button class="btn pri" data-decide="${c.id}" data-ok="1">อนุมัติ</button><button class="btn" data-decide="${c.id}" data-ok="0">ไม่อนุมัติ</button></div></div>`).join("")}</div>`;
  }
  if (isMgr()) h += await pendingAssignCard();
  if (isMgr() && window.agentHomeCard) h += await window.agentHomeCard();
  if (role() === "MAINTENANCE" && window.alertsCard) h = (await window.alertsCard()) + h;
  h = `<div class="z-top">${top}</div><div class="z-side">${h}`;
  if (isMgr()) h += await nextPeriodCard();
  if (queue.length === 0) h += `<p class="notice" style="margin-top:12px">ยังไม่มีคิวรถของวันนี้ในระบบ</p>`;
  h += `</div><div class="z-main"><h2>การเดินรถวันนี้ <small id="lvAt">แบบเรียลไทม์ · อัปเดตทุก 1 นาที</small></h2><section class="card live-card"><div id="liveChart"><p class="loading"><span class="spin"></span>กำลังโหลดกราฟ…</p></div></section><h2>รถวันนี้</h2><div class="list">` + VEH.map((v) => {
    const w = ws.find((x) => x.vehicle_id === v.id && x.status === "work"), qq = queue.find((x) => x.vehicle_id === v.id), ins = insp.find((x) => x.vehicle_id === v.id);
    return `<article class="bus" style="--c:${COLOR[v.code]}"><img src="${busImg(v.code)}" alt=""><div class="b">
      <div class="row1"><b>${v.code}</b><span class="plate num">${v.plate}</span>${role() === "CUSTOMER" ? "" : ins ? `<span class="pill ${ins.result === "normal" ? "ok" : "bad"}">${ins.result === "normal" ? "ตรวจแล้ว" : "ไม่ปกติ"}</span>` : `<span class="pill warn">ยังไม่ตรวจ</span>`}</div>
      <div class="sm">${ROUTE[v.route_code] || ""}</div>
      ${isMgr() ? `<div class="sm">คนขับ <b>${esc(w?.employees?.full_name || "ยังไม่จัด")}</b>${w?.note ? `<em class="sub2">${esc(w.note.includes("แทน") ? "ขับแทน" : w.note)}</em>` : ""}</div>` : ""}
      <div class="sm num">${qq ? `รอบแรก <b>${String(qq.first_time).slice(0, 5)}</b> · ${(tripsOf(qq.queue_code).length || qq.planned_trips) + " เที่ยว"}` : "ไม่มีคิว"}</div></div></article>`;
  }).join("") + `</div></div>`;
  h += `<div class="z-menu"><h2>เมนู</h2><div class="actions">${role() === "CUSTOMER" ? ACT.trip + ACT.schedule + ACT.vehicle : ACT.trip + ACT.inspect + ACT.charge + ACT.maint + ACT.schedule + ACT.vehicle + (isMgr() ? ACT.report + ACT.agent + ACT.drivers : ACT.accident)}</div></div>`;
  return h;
}
/* ---- Next-period schedule reminder (managers): schedule must be finished by the 23rd; it is used from the 26th ---- */
// Official Thai public holidays (ข้อมูลจากประกาศวันหยุดประจำปี 2569; ตรวจกับประกาศทางราชการอีกครั้งก่อนจัดตาราง). Add next year when announced.
const HOLIDAYS = { "2026-12-05": "วันพ่อแห่งชาติ", "2026-12-07": "วันหยุดชดเชยวันพ่อแห่งชาติ", "2026-12-10": "วันรัฐธรรมนูญ", "2026-12-31": "วันสิ้นปี" };
async function nextPeriodCard() {
  const cur = periodOf(today()), nxt = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  const [a, b] = periodRange(nxt), dl = new Date(cur.getFullYear(), cur.getMonth(), 23), dlIso = iso(dl);
  const { data: wd } = await sb.from("work_schedules").select("work_date").gte("work_date", a).lte("work_date", b);
  const nDays = Math.round((dObj(b) - dObj(a)) / 864e5) + 1, have = new Set((wd || []).map((r) => r.work_date)).size, count = have >= nDays;
  if (count) return `<p class="notice ok" style="margin-top:12px">ตาราง${periodLabel(nxt)} (${periodSpan(nxt)}) สร้างแล้ว · <a href="#pdf">ดู PDF</a></p>`;
  const left = Math.round((dObj(dlIso) - dObj(today())) / 864e5);
  const emps = await q(sb.from("employees").select("full_name,kind,home_vehicle_id,weekly_day_off").eq("kind", "regular"));
  const qs = [];
  Object.entries(HOLIDAYS).filter(([d]) => d >= a && d <= b).forEach(([d, n]) => {
    const w = dObj(d).getDay(), off = emps.find((e) => e.kind === "regular" && e.weekly_day_off === w);
    if (w === 0 || w === 6) qs.push(`<b>${bk(d)} ${n}</b> ตรงวัน${DOWL[w]} ใช้ตารางวันหยุดตามปกติ (วิ่ง 3 คัน) · ยืนยัน`);
    else if (off) qs.push(`<b>${bk(d)} ${n}</b> (วัน${DOWL[w]}) ${esc(off.full_name.split(" ")[0])} หยุดอยู่แล้ว → ${vcode(off.home_vehicle_id) || "รถประจำ"} จอด ไม่ต้องมีคนขับแทน · ยืนยัน`);
    else qs.push(`<b>${bk(d)} ${n}</b> (วัน${DOWL[w]}) ไม่มีคนขับประจำหยุด แต่วิ่งแค่ 3 คัน → <b>ให้คันไหนจอด</b> และคนขับคันนั้นลงวันหยุด H หรือไม่`);
  });
  const suns = []; for (let t = dObj(a); iso(t) <= b; t.setDate(t.getDate() + 1)) if (t.getDay() === 0) suns.push(`${t.getDate()} ${MS[t.getMonth()]}`);
  qs.push(`วันอาทิตย์ ${suns.join(", ")} เที่ยว <b>18:30 ออกจากสถานี รฟม.</b> ไม่มีรถรับ (STC-01 จอด) → ยกเลิก / เลื่อนเวลา / ให้รถวิ่งเปล่ากลับไปรับ`);
  qs.push(`มีคนขับขอลา หรือขอเปลี่ยนวันหยุดประจำสัปดาห์ในรอบนี้หรือไม่ (ลาป่วย S · ลากิจ P · ลาพักร้อน V · ลาไม่รับค่าจ้าง AB)`);
  qs.push(`ตรวจวันหยุดนักขัตฤกษ์ของรอบนี้กับประกาศทางราชการ (เพิ่ม/ยกเลิกวันหยุดพิเศษ)`);
  const urgent = left <= 3;
  return `<section class="card" style="margin-top:12px;border-color:${urgent ? "#ff8a8a" : "#ffd166"}">
    <div class="row1"><b>ตาราง${periodLabel(nxt)} ${have ? `สร้างแล้ว ${have}/${nDays} วัน` : "ยังไม่ได้สร้าง"}</b><span class="pill ${urgent ? "bad" : "warn"}">${left > 0 ? `เหลือ ${left} วัน` : left === 0 ? "ครบกำหนดวันนี้" : `เลยกำหนด ${-left} วัน`}</span></div>
    <p class="sm" style="margin:4px 0 8px">${periodSpan(nxt)} · ต้องเสร็จก่อน <b>${bk(dlIso)}</b> เพื่อใช้ตั้งแต่ ${bk(a)} · ตอบคำถามต่อไปนี้ก่อนจัดตาราง</p>
    <ol class="sm" style="margin:0;padding-left:20px;display:grid;gap:6px">${qs.map((x) => `<li>${x}</li>`).join("")}</ol></section>`;
}
const ACT_IC = {
  inspect: '<path d="M9 4h6v3H9z"/><rect x="5" y="5.5" width="14" height="15" rx="2"/><path d="M8.5 13l2.3 2.3L15.5 10.5"/>',
  charge: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3"/><path d="M11.5 8.5 9 12.5h3.5L10 15.5"/>',
  maint: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.6-.4-.4-2.6z"/>',
  accident: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17v.5"/>',
  schedule: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  vehicle: '<rect x="4.5" y="4" width="15" height="13" rx="2.5"/><path d="M4.5 11h15M7.5 20v-3M16.5 20v-3"/>',
};
const ic = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${p}</svg>`;
const ACT = {
  drivers: `<a class="act" href="#drivers">${ic('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.9-3 3-4.6 5.5-4.6s4.6 1.6 5.5 4.6"/><path d="M15 6.5h5M15 10h5M16.5 13.5h3.5"/>')}ข้อมูลคนขับ</a>`,
  ai: `<a class="act" href="#ai"><img src="assets/img/smartai-96.png?v=2" alt="" width="34" height="34" style="border-radius:50%">Smart AI ผู้ช่วย</a>`,
  agent: `<a class="act" href="#agent"><img src="assets/img/smartai-96.png?v=2" alt="" width="34" height="34" style="border-radius:50%">Manager Agent</a>`,
  trip: `<a class="act" href="#trip">${ic('<path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13.2" r="3.4"/>')}รายงานรอบเดินรถ</a>`,
  inspect: `<a class="act" href="#inspect">${ic('<path d="M9 4h6v3H9z"/><rect x="5" y="5.5" width="14" height="15" rx="2"/><path d="M8.5 13l2.3 2.3L15.5 10.5"/>')}ตรวจสภาพรถ</a>`,
  charge: `<a class="act" href="#charge">${ic('<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3"/><path d="M11.5 8.5 9 12.5h3.5L10 15.5"/>')}บันทึกการชาร์จ</a>`,
  maint: `<a class="act" href="#maint">${ic('<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.6-.4-.4-2.6z"/>')}ซ่อมบำรุง</a>`,
  accident: `<a class="act" href="#maint/accident">${ic('<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17v.5"/>')}แจ้งอุบัติเหตุ</a>`,
  schedule: `<a class="act" href="#schedule">${ic('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>')}ตารางงาน</a>`,
  vehicle: `<a class="act" href="#vehicle">${ic('<rect x="4.5" y="4" width="15" height="13" rx="2.5"/><path d="M4.5 11h15M7.5 20v-3M16.5 20v-3"/>')}ข้อมูลรถ</a>`,
  report: `<a class="act" href="#report">${ic('<path d="M4 19h16"/><path d="M6 15l4-5 3 3 5-7"/>')}รายงานการชาร์จ</a>`,
  account: `<a class="act" href="#account">${ic('<circle cx="12" cy="8" r="4"/><path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4"/>')}บัญชีผู้ใช้</a>`,
};
/* manager: schedule entries waiting for the manager to assign / confirm (e.g. weekend Siriraj cover) */
async function pendingAssignCard() {
  const end = iso(new Date(dObj(today()).getTime() + 21 * 864e5));
  const rows = await q(sb.from("work_schedules").select("id,work_date,vehicle_id,note,employees(full_name)").eq("approval", "pending").gte("work_date", today()).lte("work_date", end).order("work_date")).catch(() => []);
  if (!rows.length) return "";
  return `<section class="card" style="margin-top:12px;border-color:#ffd166"><div class="row1"><b>รอผู้จัดการมอบหมายคนขับ</b><span class="pill warn">${rows.length} วัน</span></div>
    <p class="sm" style="margin:4px 0 8px">ระบบใส่คนขับที่แนะนำไว้ให้ก่อน · กดยืนยัน หรือเปลี่ยนคนในตารางงาน</p>
    <div class="list">${rows.map((r) => `<div class="alrow" style="display:flex;gap:8px;align-items:center;justify-content:space-between;border-top:1px solid var(--line);padding-top:8px">
      <span class="sm"><b>${bk(r.work_date)} (${DOW[dObj(r.work_date).getDay()]})</b> · ${vById(r.vehicle_id)?.code || ""} · แนะนำ <b>${esc(r.employees?.full_name || "–")}</b><br>${esc(r.note || "")}</span>
      <span style="display:flex;gap:6px;flex:none"><button class="btn pri" data-pa="${r.id}">ยืนยัน</button><button class="btn" data-pchg="${r.work_date}">เปลี่ยนคน</button></span></div>`).join("")}</div></section>`;
}
function switchSheet() {
  const REASONS = ["รถเสีย / ชาร์จไม่ทัน", "สลับกับเพื่อน", "ผู้จัดการสั่ง", "อื่น ๆ"];
  let reason = REASONS[0], pick = null;
  const s = $("sheet");
  s.innerHTML = `<div class="in"><div class="sh"><b>เปลี่ยนรถวันนี้</b><button class="lnk" id="shX">ปิด</button></div><p class="loading"><span class="spin"></span>กำลังโหลด…</p></div>`; s.hidden = false;
  $("shX").onclick = () => (s.hidden = true);
  q(sb.rpc("switchable_today")).then((list) => {
    s.innerHTML = `<div class="in"><div class="sh"><b>เปลี่ยนรถวันนี้</b><button class="lnk" id="shX">ปิด</button></div>
      <p class="sm" style="margin:0">รถของคุณตามตาราง: <b>${myVehicles().map((v) => v.code).join(", ")}</b> · เลือกรถที่จะขับแทน</p>
      ${list.length ? `<div class="list" id="swList">${list.map((c) => `<button class="day" data-sw="${c.vehicle_id}" style="text-align:left;cursor:pointer;border-left:4px solid ${COLOR[c.code]}"><div class="d"><b>${c.code}</b><small class="num">${c.plate}</small></div><div class="sm">${c.driver_name ? `คนขับตามตาราง <b>${esc(c.driver_name)}</b> · จะได้รถของคุณไปแทน (สลับกัน)` : "ยังไม่มีคนขับ"}${c.started ? `<em class="sub2">ตรวจรถแล้ววันนี้</em>` : ""}</div></button>`).join("")}</div>` : `<div class="empty">ไม่มีรถที่เปลี่ยนได้วันนี้</div>`}
      <p class="lbl">เหตุผล</p><div class="chips" id="swR">${REASONS.map((r) => `<button class="chip" aria-pressed="${r === reason}" data-r="${r}">${r}</button>`).join("")}</div>
      <div class="fld full"><label for="swNote">รายละเอียด (ถ้ามี)</label><input id="swNote" placeholder="เช่น ไฟเตือนแบตเตอรี่ขึ้น"></div>
      <p class="notice">กดแล้วใช้รถคันใหม่ได้ทันที ระบบแจ้งผู้จัดการให้อนุมัติภายหลัง · ตรวจสภาพรถคันใหม่ก่อนออกรถ</p>
      <button class="btn pri block" id="swOk" disabled>ยืนยันเปลี่ยนรถ</button></div>`;
    $("shX").onclick = () => (s.hidden = true);
    s.querySelectorAll("[data-sw]").forEach((b) => (b.onclick = () => { pick = b.dataset.sw; s.querySelectorAll("[data-sw]").forEach((x) => x.classList.toggle("today", x === b)); $("swOk").disabled = false; }));
    $("swR").onclick = (e) => { const c = e.target.closest(".chip"); if (!c) return; reason = c.dataset.r; $("swR").querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c))); };
    $("swOk").onclick = async () => {
      $("swOk").disabled = true;
      try { const note = $("swNote").value.trim(); await q(sb.rpc("switch_vehicle", { p_vehicle: pick, p_reason: note ? `${reason}: ${note}` : reason }));
        s.hidden = true; toast(`เปลี่ยนเป็น ${vById(pick)?.code || ""} แล้ว`); await refreshMe(); home(); }
      catch (e) { toast(/switch_vehicle|function/.test(errMsg(e)) ? "ระบบเปลี่ยนรถยังไม่เปิดใช้ (รอรัน SQL)" : errMsg(e)); $("swOk").disabled = false; }
    };
  }).catch((e) => { s.querySelector(".in").innerHTML = `<p class="err">${/switchable_today|function/.test(errMsg(e)) ? "ระบบเปลี่ยนรถยังไม่เปิดใช้ (รอรัน SQL)" : esc(errMsg(e))}</p>`; });
}
function bindHome() {
  setBell();
  if ($("swBtn")) $("swBtn").onclick = switchSheet;
  main().querySelectorAll("[data-pa]").forEach((b) => (b.onclick = async () => { b.disabled = true;
    try { await q(sb.from("work_schedules").update({ approval: "approved", note: "ศิริราชแทน (ผู้จัดการมอบหมาย)", updated_at: new Date().toISOString() }).eq("id", b.dataset.pa)); toast("ยืนยันแล้ว"); home(); } catch (e) { b.disabled = false; toast(errMsg(e)); } }));
  main().querySelectorAll("[data-pchg]").forEach((b) => (b.onclick = () => { schedDay = b.dataset.pchg; location.hash = "#schedule"; }));
  if (window.bindShift) window.bindShift();
  if ($("liveChart") && window.liveTrips) window.liveTrips();
  main().querySelectorAll("[data-decide]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await q(sb.rpc("decide_cover", { p_claim: b.dataset.decide, p_approve: b.dataset.ok === "1" })); toast(b.dataset.ok === "1" ? "อนุมัติแล้ว" : "ไม่อนุมัติแล้ว"); home(); }
    catch (e) { toast(errMsg(e)); b.disabled = false; }
  }));
  main().querySelectorAll("[data-claim]").forEach((b) => (b.onclick = () => claimSheet(b.dataset)));
}
function claimSheet(dset) {
  const REASONS = ["ลาป่วย", "ลากิจ", "ติดต่อไม่ได้", "อื่น ๆ"];
  let reason = REASONS[0];
  const s = $("sheet");
  s.innerHTML = `<div class="in"><div class="sh"><b>รับรถแทน ${esc(dset.code)}</b><button class="lnk" id="shX">ปิด</button></div>
    <p class="sm">คนขับตามตาราง: <b>${esc(dset.name || "ไม่มี")}</b></p>
    <p class="lbl">เหตุผล</p><div class="chips" id="rs">${REASONS.map((r) => `<button class="chip" aria-pressed="${r === reason}" data-r="${r}">${r}</button>`).join("")}</div>
    <div class="fld full"><label for="rsNote">รายละเอียด (ถ้ามี)</label><input id="rsNote" placeholder="เช่น โทรแจ้งเวลา 05:40"></div>
    <p class="notice">กดแล้วใช้รถคันนี้ได้ทันที ระบบแจ้งผู้จัดการให้อนุมัติย้อนหลัง</p>
    <button class="btn pri block" id="doClaim">ยืนยันรับรถแทน</button></div>`;
  s.hidden = false;
  $("shX").onclick = () => (s.hidden = true);
  $("rs").onclick = (e) => { const c = e.target.closest(".chip"); if (!c) return; reason = c.dataset.r; $("rs").querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c))); };
  $("doClaim").onclick = async () => {
    $("doClaim").disabled = true;
    try {
      const note = $("rsNote").value.trim();
      await q(sb.rpc("claim_vehicle", { p_vehicle: dset.claim, p_absent: dset.absent || null, p_reason: note ? `${reason}: ${note}` : reason }));
      s.hidden = true; toast(`รับรถแทน ${dset.code} แล้ว`); await refreshMe(); home();
    } catch (e) { toast(errMsg(e)); $("doClaim").disabled = false; }
  };
}

/* ================= SCHEDULE ================= */
let schedMonth = null, schedDay = null;
/* Work period runs 26th of previous month – 25th of this month (as the legacy timesheet). m = first day of the period's named month. */
const MSH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const periodOf = (d) => { const t = dObj(d); return new Date(t.getFullYear(), t.getMonth() + (t.getDate() > 25 ? 1 : 0), 1); };
const periodRange = (m) => [iso(new Date(m.getFullYear(), m.getMonth() - 1, 26)), iso(new Date(m.getFullYear(), m.getMonth(), 25))];
const periodLabel = (m) => { const p = new Date(m.getFullYear(), m.getMonth() - 1, 1); return `รอบ ${MONTH[m.getMonth()]} ${m.getFullYear() + 543}`; };
const periodSpan = (m) => { const p = new Date(m.getFullYear(), m.getMonth() - 1, 1); return `26 ${MSH[p.getMonth()]} – 25 ${MSH[m.getMonth()]} ${m.getFullYear() + 543}`; };
async function schedule() {
  if (!schedMonth) schedMonth = periodOf(today());
  if (isMgr()) return scheduleManager();
  const [a, b] = periodRange(schedMonth);
  const rows = await q(sb.from("work_schedules").select("*").eq("employee_id", ME.employee?.id || "00000000-0000-0000-0000-000000000000").gte("work_date", a).lte("work_date", b).order("work_date"));
  const counts = { work: 0, off: 0, leave: 0, standby: 0 }; rows.forEach((r) => counts[r.status]++);
  main().innerHTML = `<div class="wk"><button id="mPrev" aria-label="รอบก่อน">‹</button><div>${periodLabel(schedMonth)}<small>${periodSpan(schedMonth)} · ${esc(ME.employee?.name || "")}</small></div><button id="mNext" aria-label="เดือนถัดไป">›</button></div>
   <section class="sum"><div class="tile"><small>วันทำงาน</small><b class="num">${counts.work}</b><span>วัน</span></div><div class="tile"><small>วันหยุด/ลา</small><b class="num">${counts.off + counts.leave}</b><span>วัน</span></div><div class="tile"><small>สำรอง</small><b class="num">${counts.standby}</b><span>วัน</span></div></section>
   <a class="btn block" href="#pdf" style="margin-top:12px">ดูตารางงานของฉันเป็น PDF</a>
   <h2>รายวัน</h2><div class="list">${rows.length ? rows.map(dayRow).join("") : `<div class="empty"><b>ยังไม่มีตารางรอบนี้</b>ผู้จัดการยังไม่ได้จัดตาราง</div>`}</div>`;
  $("mPrev").onclick = () => { schedMonth.setMonth(schedMonth.getMonth() - 1); schedule(); };
  $("mNext").onclick = () => { schedMonth.setMonth(schedMonth.getMonth() + 1); schedule(); };
}
function dayRow(r) {
  const x = dObj(r.work_date), v = vById(r.vehicle_id);
  const st = { work: v ? `<b>${v.code}</b> · รอบแรก ${String(r.first_time || "").slice(0, 5)} ${esc(r.first_origin || "")}` : "ทำงาน", off: "วันหยุด", leave: `ลา${r.leave_type ? " · " + esc(r.leave_type) : ""}`, standby: "สำรอง (พร้อมรับรถแทน)" }[r.status];
  return `<div class="day ${x.getDay() % 6 === 0 ? "we" : ""} ${r.work_date === today() ? "today" : ""}" style="${v ? `border-left:4px solid ${COLOR[v.code]}` : ""}"><div class="d"><b class="num">${x.getDate()}</b><small>${DOW[x.getDay()]}</small></div><div class="sm">${st}${r.note ? `<em class="sub2">${esc(r.note.includes("แทน") ? "ขับแทน" : r.note)}</em>` : ""}</div></div>`;
}
async function scheduleManager() {
  if (!schedDay) schedDay = today();
  const [rows, emps] = await Promise.all([
    q(sb.from("work_schedules").select("*").eq("work_date", schedDay)),
    q(sb.from("employees").select("*").in("kind", ["regular", "relief", "spare"]).order("code")),
  ]);
  main().innerHTML = `<div class="wk"><button id="dPrev" aria-label="วันก่อน">‹</button><div>${bkLong(schedDay)}<small>ตารางปฏิบัติงาน · แตะชื่อเพื่อแก้ไข</small></div><button id="dNext" aria-label="วันถัดไป">›</button></div>
   <a class="btn block" href="#pdf" style="margin-top:10px">ตารางงานประจำรอบ PDF · รวม / แยกรายคน</a>
   <div class="fld" style="margin-top:8px"><label for="dPick">ไปวันที่</label><input type="date" id="dPick" value="${schedDay}"></div>
   <h2>พนักงานขับรถ</h2><div class="list">${emps.map((e) => { const r = rows.find((x) => x.employee_id === e.id) || { status: null }; const v = vById(r.vehicle_id);
     return `<button class="day" style="text-align:left;cursor:pointer;${v ? `border-left:4px solid ${COLOR[v.code]}` : ""}" data-edit="${e.id}"><div class="d"><b style="font-size:.9rem">${esc(e.full_name.split(" ")[0])}</b><small>${{ regular: "ประจำ", relief: "ขับแทน", spare: "สแปร์", technician: "ช่างซ่อม" }[e.kind] || ""}</small></div><div class="sm">${r.status ? { work: v ? `<b>${v.code}</b> · ${String(r.first_time || "").slice(0, 5)} ${esc(r.first_origin || "")}` : "ทำงาน", off: "วันหยุด", leave: "ลา " + esc(r.leave_type || ""), standby: "สำรอง" }[r.status] : "ยังไม่จัด"}${r.note ? `<em class="sub2">${esc(r.note)}</em>` : ""}</div></button>`; }).join("")}</div>`;
  const go = (d) => { schedDay = d; scheduleManager(); };
  $("dPrev").onclick = () => { const x = dObj(schedDay); x.setDate(x.getDate() - 1); go(iso(x)); };
  $("dNext").onclick = () => { const x = dObj(schedDay); x.setDate(x.getDate() + 1); go(iso(x)); };
  $("dPick").onchange = (e) => e.target.value && go(e.target.value);
  main().querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => editSched(emps.find((e) => e.id === b.dataset.edit), rows.find((x) => x.employee_id === b.dataset.edit))));
}
function editSched(emp, row) {
  const s = $("sheet");
  s.innerHTML = `<div class="in"><div class="sh"><b>${esc(emp.full_name)} · ${bk(schedDay)}</b><button class="lnk" id="shX">ปิด</button></div>
   <div class="grid"><div class="fld"><label for="eSt">สถานะ</label><select id="eSt">${[["work", "ทำงาน"], ["off", "วันหยุด"], ["leave", "ลา"], ["standby", "สำรอง"]].map(([k, l]) => `<option value="${k}" ${row?.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
   <div class="fld"><label for="eV">รถ</label><select id="eV"><option value="">–</option>${VEH.map((v) => `<option value="${v.id}" ${row?.vehicle_id === v.id ? "selected" : ""}>${v.code}</option>`).join("")}</select></div>
   <div class="fld"><label for="eLt">ประเภทการลา</label><select id="eLt"><option value="">–</option>${["ลาป่วย", "ลากิจ", "ลาพักร้อน", "ลาไม่รับค่าจ้าง", "อื่น ๆ"].map((x) => `<option ${row?.leave_type === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
   <div class="fld"><label for="eT">รอบแรก</label><input id="eT" type="time" value="${String(row?.first_time || "").slice(0, 5)}"></div>
   <div class="fld full"><label for="eO">ต้นทางรอบแรก</label><select id="eO">${["", "ศูนย์วัฒนธรรมฯ", "สถานี รฟม.", "รฟม. สำนักงานใหญ่", "MRT อิสรภาพ"].map((o) => `<option ${row?.first_origin === o ? "selected" : ""} value="${o}">${o || "–"}</option>`).join("")}</select></div>
   <div class="fld full"><label for="eN">หมายเหตุ</label><input id="eN" value="${esc(row?.note || "")}"></div></div>
   <p class="err" id="eErr" hidden></p><button class="btn pri block" id="eSave">บันทึก</button></div>`;
  s.hidden = false; $("shX").onclick = () => (s.hidden = true);
  $("eSave").onclick = async () => {
    const st = $("eSt").value, vid = $("eV").value || null;
    if (st === "work" && !vid) { $("eErr").textContent = "สถานะทำงานต้องเลือกรถ"; $("eErr").hidden = false; return; }
    const rec = { work_date: schedDay, employee_id: emp.id, status: st, vehicle_id: st === "work" ? vid : null, leave_type: st === "leave" ? $("eLt").value || null : null, first_time: st === "work" && $("eT").value ? $("eT").value : null, first_origin: st === "work" ? $("eO").value || null : null, note: $("eN").value.trim() || null, approval: "approved", created_by: (await sb.auth.getUser()).data.user.id, updated_at: new Date().toISOString() };
    try { await q(sb.from("work_schedules").upsert(rec, { onConflict: "work_date,employee_id" })); s.hidden = true; toast("บันทึกตารางแล้ว"); scheduleManager(); }
    catch (e) { $("eErr").textContent = /one_driver_per_vehicle/.test(e.message) ? "รถคันนี้มีคนขับในวันนี้แล้ว เปลี่ยนคนเดิมก่อน" : errMsg(e); $("eErr").hidden = false; }
  };
}

/* ================= INSPECTION ================= */
const PHOTOS = [
  ["คนขับคู่กับรถ", "ถ่ายตัวเองให้เห็นรถด้านหลัง", ["ไม่ได้แต่งกายตามระเบียบ"]],
  ["ด้านหน้ารถ", "ป้ายทะเบียน เลขรถ กระจก ไฟหน้า ป้ายเส้นทาง", ["กระจกร้าว", "ไฟหน้าไม่ติด", "ป้ายเส้นทางไม่ตรง", "ตัวรถสกปรก"]],
  ["ด้านข้างรถ", "กระจกมองข้าง ประตู ยาง", ["รอยถลอก/บุบ", "กระจกมองข้างเสียหาย", "ยางอ่อน"]],
  ["หน้าปัด", "SOC เลขไมล์ อุณหภูมิ ไฟเตือน", ["มีไฟเตือน", "SOC ต่ำกว่าเกณฑ์", "อุณหภูมิผิดปกติ"]],
  ["ห้องโดยสารด้านหน้า", "เบาะ ราวจับ ถังดับเพลิง ความสะอาด", ["เบาะชำรุด", "ถังดับเพลิงไม่พร้อม", "ห้องโดยสารสกปรก"]],
  ["ห้องโดยสารด้านหลัง", "พื้นที่รถเข็น ทางลาด ประตูหลัง", ["ทางลาดใช้งานไม่ได้", "เข็มขัดรถเข็นชำรุด", "ประตูหลังขัดข้อง"]],
  ["ห้องเครื่องด้านซ้าย", "สายไฟแรงสูง ขั้วต่อ น้ำมันในกระปุก", ["สายไฟ/ขั้วต่อผิดปกติ", "ระดับน้ำมันต่ำ", "มีรอยรั่วซึม"]],
  ["ห้องเครื่องด้านขวา", "แบตเตอรี่ 12V น้ำหล่อเย็น ปั๊ม", ["น้ำหล่อเย็นต่ำ", "แบตเตอรี่ 12V มีคราบ", "มีรอยรั่วซึม"]],
  ["ด้านหลังรถ", "ภาพรวมท้ายรถเมื่อเปิดฝาห้องเครื่อง", ["ไฟท้าย/ไฟเบรกไม่ติด", "ฝาห้องเครื่องปิดไม่สนิท"]]];
const CHECKS = [["ระบบปรับอากาศ", ["แอร์ไม่เย็น", "แอร์มีเสียงดัง", "มีน้ำหยด"]], ["ประตูขึ้น-ลง", ["ประตูเปิดปิดช้า", "ประตูปิดไม่สนิท"]], ["ไฟหน้า ไฟเลี้ยว ไฟเบรก", ["ไฟเลี้ยวไม่ติด", "ไฟเบรกไม่ติด"]], ["เบรกและเบรกมือ", ["เบรกมีเสียง", "เบรกมือไม่อยู่"]], ["ยางและล้อ", ["ยางอ่อน", "ยางสึกมาก"]], ["ที่ปัดน้ำฝน แตร", ["ที่ปัดน้ำฝนไม่ทำงาน", "แตรไม่ดัง"]], ["จอ LED ป้ายเส้นทาง", ["จอ LED ไม่ติด", "แสดงเส้นทางผิด"]], ["กล้องและ GPS", ["กล้องไม่บันทึก", "GPS ไม่ส่งตำแหน่ง"]]];
let INS = null;
/* ---- inspection results (managers / technician / MRTA): what was checked, by whom, photos ---- */
let INSV = { mode: "view", date: null };
async function inspectResults() {
  const d = INSV.date || (INSV.date = today()), nx = iso(new Date(dObj(d).getTime() + 864e5));
  const [rows, emps] = await Promise.all([
    q(sb.from("inspections").select("*").gte("inspected_at", d + "T00:00:00+07:00").lt("inspected_at", nx + "T00:00:00+07:00").order("inspected_at")),
    isMgr() ? q(sb.from("employees").select("id,full_name")) : Promise.resolve([]),
  ]);
  const nm = (id) => (emps.find((e) => e.id === id) || {}).full_name || (id === ME.employee?.id ? ME.employee.name : "–");
  const done = VEH.filter((v) => rows.some((r) => r.vehicle_id === v.id)).length, bad = rows.filter((r) => r.result !== "normal").length;
  main().innerHTML = `${isMgr() || role() === "MAINTENANCE" ? `<div class="tabs2"><button aria-selected="true">ผลตรวจสภาพรถ</button><button id="iNew">ตรวจรถ (บันทึกใหม่)</button></div>` : ""}
    <div class="fld" style="margin-top:12px"><label for="iDate">วันที่</label><input type="date" id="iDate" value="${d}" max="${today()}"></div>
    <section class="sum"><div class="tile"><small>ตรวจแล้ว</small><b class="num">${done}/${VEH.length}</b><span>คัน</span></div>
      <div class="tile ${bad ? "alert" : ""}"><small>พบไม่ปกติ</small><b class="num">${bad}</b><span>ครั้ง</span></div>
      <div class="tile"><small>บันทึกทั้งหมด</small><b class="num">${rows.length}</b><span>ครั้ง</span></div></section>
    <button class="btn pri block" id="iPdf" style="margin-top:12px">📄 รายงานตรวจรถประจำวัน (PDF) · ดู / แชร์</button>
    <h2>${bk(d)} <small>แตะเพื่อดูภาพและรายการตรวจ</small></h2>
    <div class="list">${VEH.map((v) => { const rs = rows.filter((r) => r.vehicle_id === v.id);
      return `<article class="bus" style="--c:${COLOR[v.code]}"><img src="${busImg(v.code)}" alt=""><div class="b">
        <div class="row1"><b>${v.code}</b><span class="plate num">${v.plate}</span>${rs.length ? `<span class="pill ${rs.some((r) => r.result !== "normal") ? "bad" : "ok"}">${rs.some((r) => r.result !== "normal") ? "ไม่ปกติ" : "ปกติ"}</span>` : `<span class="pill warn">ยังไม่ตรวจ</span>`}</div>
        ${rs.length ? rs.map((r) => `<button class="lnk" style="text-align:left;padding:0" data-insp="${r.id}">🕒 <b class="num">${tHM(r.inspected_at)} น.</b> · ${esc(nm(r.employee_id))} · แบต <b class="num">${r.soc ?? "–"}%</b> · ไมล์ <b class="num">${r.odometer != null ? Number(r.odometer).toLocaleString("th-TH") : "–"}</b> ›</button>`).join("") : `<div class="sm">ยังไม่มีผลตรวจของวันนี้</div>`}
      </div></article>`; }).join("")}</div>`;
  $("iDate").onchange = (e) => { if (e.target.value) { INSV.date = e.target.value; inspectResults(); } };
  if ($("iNew")) $("iNew").onclick = () => { INSV.mode = "form"; inspect(); };
  $("iPdf").onclick = () => inspectPdf(d, rows, nm);
  main().querySelectorAll("[data-insp]").forEach((b) => (b.onclick = () => inspectSheet(rows.find((r) => r.id === b.dataset.insp), nm)));
}
/* ---- daily inspection report: one A4 page, all buses ---- */
async function toDataURL(u) {
  try { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000); const b = await (await fetch(u, { signal: ctl.signal })).blob(); clearTimeout(t);
    if (!/^image\/(jpeg|png|webp)/.test(b.type)) return null;
    return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(b); }); } catch (e) { return null; }
}
async function inspectPdf(d, rows, nm) {
  const btn = $("iPdf"); if (!window.html2pdf) { toast("โหลดตัวสร้าง PDF ไม่ได้ ตรวจสอบอินเทอร์เน็ต"); return; }
  btn.disabled = true; btn.innerHTML = `<span class="spin"></span> กำลังสร้างรายงาน…`;
  let stage = null;
  try {
    const qv = await q(sb.from("vehicle_queue").select("vehicle_id,first_time,first_origin,queue_code").eq("work_date", d));
    const HEX = { "STC-01": "#e5484d", "STC-02": "#e2a400", "STC-03": "#7048e8", "STC-04": "#2f9e44" };
    const cols = VEH.map((v) => { const rs = rows.filter((r) => r.vehicle_id === v.id); return { v, r: rs[0] || null, more: rs.length - 1, qq: qv.find((x) => x.vehicle_id === v.id) }; });
    // two evidence photos per bus (driver with bus, front) embedded as data URLs so the PDF never depends on links
    const want = cols.flatMap((c) => (c.r ? [0, 1].map((i) => ((c.r.items || []).filter((x) => x.group === "photo")[i] || {}).photo).filter(Boolean) : []));
    const { data: su } = want.length ? await sb.storage.from(CFG.bucket).createSignedUrls(want, 600) : { data: [] };
    const img = {}; await Promise.all(want.map(async (pth, i) => { const u = su && su[i] && su[i].signedUrl; img[pth] = u ? await toDataURL(u) : null; }));
    const itemOf = (c, name, grp) => (c.r ? (c.r.items || []).find((x) => x.group === grp && x.name === name) : null);
    const cell = (x) => !x ? `<td class="ic na">–</td>` : x.status === "ok" ? `<td class="ic ok">✓</td>` : `<td class="ic bd">✗ ${esc(x.note || "ไม่ปกติ")}</td>`;
    const late = (c) => c.r && c.qq && tHM(c.r.inspected_at) > String(c.qq.first_time).slice(0, 5);
    const done = cols.filter((c) => c.r).length, bads = cols.filter((c) => c.r && c.r.result !== "normal");
    const abn = cols.flatMap((c) => (c.r ? (c.r.items || []).filter((x) => x.status === "bad").map((x) => `<li><b>${c.v.code}</b> · ${esc(x.name)}: ${esc(x.note || "ไม่ปกติ")}</li>`) : []));
    const th = cols.map((c) => `<th style="border-top:4px solid ${HEX[c.v.code]}">${c.v.code}<br><span>${c.v.plate}</span></th>`).join("");
    const rowsInfo = [
      ["ผลตรวจ", (c) => (c.r ? `<b style="color:${c.r.result === "normal" ? "#2f9e44" : "#c92a2a"}">${c.r.result === "normal" ? "ปกติ พร้อมให้บริการ" : "ไม่ปกติ"}</b>` : c.qq ? `<b style="color:#c92a2a">ยังไม่ตรวจ</b>` : `<span class="na">ไม่มีคิว (จอด)</span>`)],
      ["ผู้ตรวจ", (c) => (c.r ? esc(nm(c.r.employee_id)) : "–")],
      ["เวลาตรวจ / รอบแรก", (c) => (c.r ? `${tHM(c.r.inspected_at)} น.` : "–") + (c.qq ? ` / ${String(c.qq.first_time).slice(0, 5)} น.` : "") + (late(c) ? ` <b style="color:#c92a2a">หลังรอบแรก</b>` : "") + (c.more > 0 ? `<br><span class="na">ตรวจซ้ำอีก ${c.more} ครั้ง</span>` : "")],
      ["แบตเตอรี่ (SOC)", (c) => (c.r && c.r.soc != null ? `<b>${c.r.soc}%</b>` + (+c.r.soc < 50 ? ` <span style="color:#c92a2a">ต่ำ</span>` : "") : "–")],
      ["เลขไมล์ (กม.)", (c) => (c.r && c.r.odometer != null ? Number(c.r.odometer).toLocaleString("th-TH") : "–")],
    ];
    const photos = cols.map((c) => { const ps = c.r ? (c.r.items || []).filter((x) => x.group === "photo").slice(0, 2) : [];
      return `<td class="ph">${[0, 1].map((i) => (ps[i] && img[ps[i].photo] ? `<img src="${img[ps[i].photo]}">` : `<div class="noimg">${c.r ? "ไม่มีภาพ" : "–"}</div>`)).join("")}</td>`; }).join("");
    const page = `${dHead("รายงานตรวจสภาพรถก่อนออกรถประจำวัน", `MRTA Shuttle Bus · ${bkLong(d)}`)}
      <div class="dcards">${[["ตรวจแล้ว", `${done}/${VEH.length}`, "คัน"], ["ปกติ", `${done - bads.length}`, "คัน"], ["ไม่ปกติ", `${bads.length}`, "คัน"], ["ยังไม่ตรวจ (มีคิว)", `${cols.filter((c) => !c.r && c.qq).length}`, "คัน"]].map(([a, b, u], i) => `<div class="dcard" style="--c:${["#0b2a6b", "#2f9e44", "#c92a2a", "#e2a400"][i]}"><span>${a}</span><strong>${b}</strong><span>${u}</span></div>`).join("")}</div>
      <table class="it"><thead><tr><th class="nm">รายการ</th>${th}</tr></thead><tbody>
      ${rowsInfo.map(([n, f]) => `<tr class="inf"><td class="nm">${n}</td>${cols.map((c) => `<td>${f(c)}</td>`).join("")}</tr>`).join("")}
      <tr class="sec"><td colspan="5">ภาพถ่าย 9 จุด</td></tr>
      ${PHOTOS.map(([n], i) => `<tr><td class="nm">${i + 1}. ${n}</td>${cols.map((c) => cell(itemOf(c, n, "photo"))).join("")}</tr>`).join("")}
      <tr class="sec"><td colspan="5">ตรวจการทำงาน</td></tr>
      ${CHECKS.map(([n]) => `<tr><td class="nm">${n}</td>${cols.map((c) => cell(itemOf(c, n, "check"))).join("")}</tr>`).join("")}
      <tr class="sec"><td colspan="5">ภาพหลักฐาน (คนขับคู่กับรถ · ด้านหน้ารถ)</td></tr>
      <tr><td class="nm"></td>${photos}</tr></tbody></table>
      <h2>รายการที่ไม่ปกติ / ต้องติดตาม</h2>${abn.length ? `<ol class="abn">${abn.join("")}</ol>` : `<p class="dnote" style="margin-top:2px">ไม่พบรายการไม่ปกติ</p>`}
      <p class="dnote">✓ ปกติ · ✗ ไม่ปกติ (พร้อมหมายเหตุของผู้ตรวจ) · – ไม่มีข้อมูล · เวลาตรวจเทียบกับรอบแรกตามคิวรถของวัน · ภาพทั้ง 9 จุดของทุกคันเก็บในระบบ ดูได้ที่เมนูตรวจสภาพรถ</p>
      ${dSign(["ผู้จัดทำ", "หัวหน้างาน / ผู้ตรวจสอบ", "ผู้จัดการโครงการ"])}
      <footer class="df"><span>MRTA Shuttle Bus · ข้อมูลจากระบบ ณ ${bk(today())} ${nowHM()} น.</span><span>หน้า 1/1</span></footer>`;
    const W = 794, H = 1123, fname = `MRTA_รายงานตรวจรถประจำวัน_${d}.pdf`;
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    stage = document.createElement("div"); stage.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;background:#fff`;
    stage.innerHTML = `<div class="doc"><section class="dpg insp" style="width:${W}px;height:${H}px;margin:0;box-shadow:none">${page}</section></div>`;
    document.body.appendChild(stage);
    const blob = await html2pdf().set({ margin: 0, image: { type: "jpeg", quality: 0.95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: Math.max(W, window.innerWidth), scrollX: 0, scrollY: 0 },
      jsPDF: { unit: "px", format: [W, H], orientation: "portrait", hotfixes: ["px_scaling"] }, pagebreak: { mode: [] } }).from(stage.firstElementChild).outputPdf("blob");
    pdfReady(blob, fname, `รายงานตรวจรถ ${bk(d)}`);
  } catch (e) { if (!(e && e.message === STALE)) toast("สร้างรายงานไม่สำเร็จ: " + errMsg(e)); }
  finally { if (stage) stage.remove(); if ($("iPdf")) { $("iPdf").disabled = false; $("iPdf").textContent = "📄 รายงานตรวจรถประจำวัน (PDF) · ดู / แชร์"; } }
}
async function inspectSheet(r, nm) {
  const v = vById(r.vehicle_id), items = r.items || [], ph = items.filter((x) => x.group === "photo"), ck = items.filter((x) => x.group === "check");
  const s = $("sheet");
  s.innerHTML = `<div class="in"><div class="sh"><b>${v.code} · ตรวจ ${tHM(r.inspected_at)} น.</b><button class="lnk" id="shX">ปิด</button></div>
    <p class="sm" style="margin:0">${bk(bkD(r.inspected_at))} · ${esc(nm(r.employee_id))} · แบต ${r.soc ?? "–"}% · ไมล์ ${r.odometer ?? "–"} · <span class="pill ${r.result === "normal" ? "ok" : "bad"}" style="margin:0">${r.result === "normal" ? "ปกติ" : "ไม่ปกติ"}</span></p>
    <h2 style="margin-top:8px">ภาพ ${ph.length} จุด</h2><div class="list" id="insPh">${ph.map((x, i) => `<div class="card" style="padding:8px"><div class="row1"><span class="sm"><b>${i + 1}. ${esc(x.name)}</b></span><span class="pill ${x.status === "ok" ? "ok" : "bad"}">${x.status === "ok" ? "ปกติ" : "ไม่ปกติ"}</span></div>${x.note ? `<p class="sm" style="margin:4px 0 0;color:var(--bad)">${esc(x.note)}</p>` : ""}<div class="ph" data-p="${esc(x.photo || "")}" style="margin-top:6px;min-height:40px"><span class="sm">กำลังโหลดภาพ…</span></div></div>`).join("")}</div>
    <h2>ตรวจการทำงาน</h2><section class="checks">${ck.map((x) => `<div class="ck"><div class="row1"><span>${esc(x.name)}</span><span class="pill ${x.status === "ok" ? "ok" : "bad"}">${x.status === "ok" ? "ปกติ" : "ไม่ปกติ"}</span></div>${x.note ? `<span class="sm" style="color:var(--bad)">${esc(x.note)}</span>` : ""}</div>`).join("")}</section></div>`;
  s.hidden = false; $("shX").onclick = () => (s.hidden = true);
  const boxes = [...s.querySelectorAll(".ph[data-p]")].filter((b) => b.dataset.p);
  const { data } = await sb.storage.from(CFG.bucket).createSignedUrls(boxes.map((b) => b.dataset.p), 3600);
  boxes.forEach((b, i) => { const u = data && data[i] && data[i].signedUrl; b.innerHTML = u ? (/\.(heic|heif)$/i.test(b.dataset.p) ? `<a class="lnk" href="${u}" target="_blank" rel="noopener">เปิดภาพต้นฉบับ (HEIC)</a>` : `<img src="${u}" data-view="${u}" alt="" style="width:100%;max-height:260px;object-fit:cover;border-radius:10px;cursor:zoom-in">`) : `<span class="sm">ไม่มีภาพ</span>`; });
}
async function inspect() {
  if ((isMgr() || role() === "MAINTENANCE") && INSV.mode !== "form") return inspectResults();
  INSV.mode = "view";
  const vs = myVehicles();
  if (!vs.length) { main().innerHTML = `<div class="empty" style="margin-top:16px"><b>วันนี้ไม่มีรถที่ได้รับมอบหมาย</b>ตรวจสภาพรถได้เมื่อมีรถในตารางงานของคุณ</div>`; return; }
  INS = { vid: vs[0].id, P: PHOTOS.map(() => ({ blob: null, url: null, st: null, note: "" })), C: CHECKS.map(() => ({ st: null, note: "" })) };
  drawInspect();
}
function segHTML(i, k, st) { return `<div class="seg2"><button class="okb" data-k="${k}" data-i="${i}" data-v="ok" aria-pressed="${st === "ok"}">ปกติ</button><button class="badb" data-k="${k}" data-i="${i}" data-v="bad" aria-pressed="${st === "bad"}">ไม่ปกติ</button></div>`; }
function noteHTML(i, k, chips, val) { return `<div class="note"><div class="chips">${chips.map((c) => `<button data-k="${k}" data-i="${i}" data-chip="${esc(c)}">${esc(c)}</button>`).join("")}</div><textarea id="${k}n${i}" data-k="${k}" data-i="${i}" placeholder="อธิบายสิ่งที่ผิดปกติ เช่น แอร์ไม่เย็น">${esc(val)}</textarea></div>`; }
function drawInspect() {
  const v = vById(INS.vid), list = myVehicles();
  main().innerHTML = `${list.length > 1 ? `<h2>รถที่ตรวจ</h2>${busPicker(list, INS.vid)}` : `<h2>รถที่ตรวจ</h2><article class="bus" style="--c:${COLOR[v.code]}"><img src="${busImg(v.code)}" alt=""><div class="b"><div class="row1"><b>${v.code}</b><span class="plate num">${v.plate}</span></div><div class="sm">${ROUTE[v.route_code] || ""}</div><div class="sm">ผู้ตรวจ <b>${esc(ME.employee?.name || PROFILE.display_name)}</b></div></div></article>`}
   <h2>ถ่ายภาพ 9 จุด <small>ทุกภาพต้องระบุ ปกติ / ไม่ปกติ</small></h2><section class="items">${PHOTOS.map(([n, h, chips], i) => { const x = INS.P[i];
     return `<article class="item ${x.st ? "done" : ""} ${x.st === "bad" ? "bad" : ""}"><label class="shot">${x.url ? `<img src="${x.url}" alt="">` : `${ic('<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>')}ถ่ายภาพ`}<input type="file" accept="image/*" capture="environment" data-ph="${i}" aria-label="ถ่ายภาพ ${n}"></label>
     <div class="ib"><span class="n">${i + 1}. ${n}</span><span class="h">${h}</span>${segHTML(i, "p", x.st)}</div>${x.st === "bad" ? noteHTML(i, "p", chips, x.note) : ""}</article>`; }).join("")}</section>
   <h2>ตรวจการทำงาน</h2><section class="checks">${CHECKS.map(([n, chips], i) => { const x = INS.C[i]; return `<div class="ck"><div class="r"><span>${n}</span>${segHTML(i, "c", x.st)}</div>${x.st === "bad" ? noteHTML(i, "c", chips, x.note) : ""}</div>`; }).join("")}</section>
   <h2>ค่าจากหน้าปัด</h2><div class="grid"><div class="fld"><label for="soc">แบตเตอรี่ (SOC %)</label><input id="soc" class="big num" inputmode="numeric" maxlength="3" value="${INS.soc ?? ""}"></div><div class="fld"><label for="odo">เลขไมล์ (กม.)</label><input id="odo" class="big num" inputmode="numeric" maxlength="7" value="${INS.odo ?? ""}"></div></div>
   <p class="err" id="iErr" hidden></p><p class="sm" id="iMiss" style="margin:10px 0 6px"></p><button class="btn pri block" id="iSend">ส่งผลตรวจ</button>`;
  bindInspect(); updInspect();
}
function missingIns() {
  const m = []; INS.P.forEach((x, i) => { if (!x.blob) m.push(`ภาพ ${i + 1}`); else if (!x.st) m.push(`สถานะภาพ ${i + 1}`); else if (x.st === "bad" && !x.note.trim()) m.push(`คำอธิบายภาพ ${i + 1}`); });
  INS.C.forEach((x, i) => { if (!x.st) m.push(CHECKS[i][0]); else if (x.st === "bad" && !x.note.trim()) m.push("คำอธิบาย" + CHECKS[i][0]); });
  if (!(INS.soc >= 0 && INS.soc <= 100 && INS.soc !== "")) m.push("SOC"); if (!INS.odo) m.push("เลขไมล์"); return m;
}
function updInspect() { const m = missingIns(); $("iSend").disabled = m.length > 0; $("iMiss").textContent = m.length ? `ยังขาด ${m.length} รายการ: ${m.slice(0, 3).join(", ")}${m.length > 3 ? " …" : ""}` : "ครบแล้ว พร้อมส่งผลตรวจ"; }
function bindInspect() {
  const M = main();
  M.querySelectorAll("[data-b]").forEach((b) => (b.onclick = () => { INS.vid = b.dataset.b; drawInspect(); }));
  M.querySelectorAll("[data-ph]").forEach((inp) => (inp.onchange = async () => { const f = inp.files[0]; if (!f) return; const i = +inp.dataset.ph; const blob = await shrink(f); if (!blob) { if (!isHeic(f)) toast("เปิดรูปนี้ไม่ได้ ลองถ่ายใหม่อีกครั้ง"); return; } if (INS.P[i].url) URL.revokeObjectURL(INS.P[i].url); INS.P[i].blob = blob; INS.P[i].url = URL.createObjectURL(blob); drawInspect(); }));
  M.querySelectorAll("button[data-k]").forEach((b) => (b.onclick = () => { const arr = b.dataset.k === "p" ? INS.P : INS.C, i = +b.dataset.i;
    if (b.dataset.v) { arr[i].st = b.dataset.v; if (b.dataset.v === "ok") arr[i].note = ""; keepNums(); drawInspect(); if (b.dataset.v === "bad") $(b.dataset.k + "n" + i)?.focus(); return; }
    if (b.dataset.chip) { const ta = $(b.dataset.k + "n" + i), v = ta.value.trim(); ta.value = v ? (v.includes(b.dataset.chip) ? v : v + ", " + b.dataset.chip) : b.dataset.chip; arr[i].note = ta.value; updInspect(); } }));
  M.querySelectorAll("textarea[data-k]").forEach((t) => (t.oninput = () => { (t.dataset.k === "p" ? INS.P : INS.C)[+t.dataset.i].note = t.value; updInspect(); }));
  ["soc", "odo"].forEach((id) => ($(id).oninput = (e) => { e.target.value = e.target.value.replace(/\D/g, ""); keepNums(); updInspect(); }));
  $("iSend").onclick = sendInspect;
}
function keepNums() { const s = $("soc"), o = $("odo"); if (s) INS.soc = s.value === "" ? "" : +s.value; if (o) INS.odo = o.value === "" ? "" : +o.value; }
async function sendInspect() {
  keepNums(); if (missingIns().length) return;
  const btn = $("iSend"); btn.disabled = true; btn.innerHTML = `<span class="spin"></span>กำลังอัปโหลดภาพ…`;
  try {
    const paths = []; for (let i = 0; i < INS.P.length; i++) paths.push(await upload(INS.vid, "inspection", INS.P[i].blob, i));
    const items = [...INS.P.map((x, i) => ({ group: "photo", name: PHOTOS[i][0], status: x.st, note: x.note.trim() || null, photo: paths[i] })), ...INS.C.map((x, i) => ({ group: "check", name: CHECKS[i][0], status: x.st, note: x.note.trim() || null }))];
    const bads = items.filter((x) => x.status === "bad");
    await q(sb.from("inspections").insert({ vehicle_id: INS.vid, employee_id: ME.employee?.id || null, result: bads.length ? "abnormal" : "normal", soc: INS.soc, odometer: INS.odo, items, photo_paths: paths }));
    const v = vById(INS.vid), when = `${bk(today())} ${nowHM()} น.`;
    const text = bads.length ? `${v.code} (${v.plate}) เช็ครถแล้ว พบสิ่งผิดปกติ ${bads.length} รายการ\n${bads.map((b) => `- ${b.name}: ${b.note}`).join("\n")}\nSOC ${INS.soc}% · เลขไมล์ ${INS.odo} กม.\n${ME.employee?.name || PROFILE.display_name} · ${when}` : `${v.code} (${v.plate}) เช็ครถภายนอกและภายใน พร้อมให้บริการ\nSOC ${INS.soc}% · เลขไมล์ ${INS.odo} กม.\n${ME.employee?.name || PROFILE.display_name} · ${when}`;
    main().innerHTML = `<section style="padding-top:20px;display:flex;flex-direction:column;gap:12px"><span class="pill ${bads.length ? "bad" : "ok"}" style="margin:0;align-self:flex-start">${bads.length ? "ไม่ปกติ " + bads.length + " รายการ" : "ปกติทุกรายการ"}</span>
      <h1 class="hello" style="margin:0">${bads.length ? `${v.code} ต้องแจ้งหัวหน้างานก่อนออกรถ` : `${v.code} พร้อมให้บริการ`}</h1>
      <div class="card"><pre id="lineTxt" style="margin:0;white-space:pre-wrap;font:inherit;line-height:1.6">${esc(text)}</pre></div>
      ${lineBtn(text)}<button class="btn block" id="cp">คัดลอกข้อความ</button>
      ${bads.length ? `<button class="btn danger block" id="mkJob">สร้างงานแจ้งซ่อมจากรายการที่ไม่ปกติ</button>` : ""}
      <p class="okbox">บันทึกผลตรวจและภาพ 9 ภาพเข้าระบบแล้ว</p><a class="btn block" href="#home">กลับหน้าหลัก</a></section>`;
    $("cp").onclick = () => copyText(text);
    if (bads.length) $("mkJob").onclick = async () => { try { await q(sb.from("maintenance_jobs").insert({ vehicle_id: INS.vid, job_type: "ซ่อมแก้ไข (CM)", description: bads.map((b) => `${b.name}: ${b.note}`).join(" · "), reported_on: today(), odometer: INS.odo, reported_by: ME.employee?.id || null, photo_paths: bads.filter((b) => b.photo).map((b) => b.photo) })); toast("สร้างงานแจ้งซ่อมแล้ว"); $("mkJob").remove(); } catch (e) { toast(errMsg(e)); } };
  } catch (e) { toast(errMsg(e)); btn.disabled = false; btn.textContent = "ส่งผลตรวจ"; }
}

/* ================= CHARGING ================= */
const RUNKEY = "mrta-charge-run";
const getRun = () => { try { return JSON.parse(localStorage.getItem(RUNKEY) || "null"); } catch (e) { return null; } };
const setRun = (r) => { try { r ? localStorage.setItem(RUNKEY, JSON.stringify(r)) : localStorage.removeItem(RUNKEY); } catch (e) {} };
let CH = { vid: null, blob: null, url: null };
async function charge() {
  const vs = myVehicles();
  const recent = await q(sb.from("charging_records").select("*").order("created_at", { ascending: false }).limit(isMgr() ? 30 : 20));
  CH.recent = recent; delete main().dataset.ocrWarn;
  CH.pend = await pendingReceipts();
  CH.dash = await chargeDash();
  if (!vs.length) { main().innerHTML = `${CH.dash}${pendHTML(CH.pend)}<div class="empty" style="margin-top:16px"><b>วันนี้ไม่มีรถที่ได้รับมอบหมาย</b>บันทึกการชาร์จได้เมื่อมีรถในตารางงานของคุณ · แนบใบเสร็จย้อนหลังได้ด้านบน</div>${recentHTML(recent)}`; bindPend(); bindRecent(); bindDash(); return; }
  const run = getRun();
  if (run && !vs.some((v) => v.id === run.vid)) setRun(null);
  CH.vid = getRun()?.vid || CH.vid || vs[0].id;
  drawCharge(vs, recent);
}
/* ---------- Charging dashboard (managers): per bus per day · main line vs Siriraj per day · monthly kWh / baht lines ---------- */
const CD = { day: null, rows: [], m: null };
const BUSES = ["STC-01", "STC-02", "STC-03", "STC-04"];
async function chargeDash() {
  if (!isMgr()) return "";
  CD.day = CD.day || today();
  const d = dObj(CD.day), a = iso(new Date(d.getFullYear(), d.getMonth(), 1)), b = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  if (CD.m !== a) { CD.rows = (await q(sb.from("charging_records").select("id,vehicle_id,receipt_date,started_at,ended_at,kwh,total,receipt_no,receipt_path,source").gte("receipt_date", a).lte("receipt_date", b).order("receipt_date")).catch(() => [])).map((r) => ({ ...r, bus: vById(r.vehicle_id)?.code || "ไม่ระบุ", line: vById(r.vehicle_id)?.route_code === "R2" ? "R2" : "R1", k: Number(r.kwh) || 0, t: Number(r.total) || 0 })); CD.m = a; }
  const R = CD.rows, day = R.filter((r) => r.receipt_date === CD.day), sum = (l, f) => l.reduce((x, r) => x + f(r), 0);
  const busTile = (c) => { const l = day.filter((r) => r.bus === c), wait = l.filter((r) => r.source === "app" && !r.receipt_path).length;
    return `<div class="cd-bus" style="--c:${SCOL[c]}"><b>${c}</b><span class="num"><em>${fmt(sum(l, (r) => r.k), 2)}</em> kWh</span><span class="num"><em>${fmt(sum(l, (r) => r.t))}</em> บาท</span><small>${l.length ? `${l.length} ครั้ง` : "ไม่มีการชาร์จ"}${wait ? ` · <i class="w">รอใบเสร็จ ${wait}</i>` : ""}</small></div>`; };
  const lineTile = (ln, name, sub) => { const l = day.filter((r) => r.line === ln); return `<div class="cd-line"><small>${name}</small><b class="num">${fmt(sum(l, (r) => r.t))}<span>บาท</span></b><span class="num">${fmt(sum(l, (r) => r.k), 2)} kWh · ${l.length} ครั้ง</span><small>${sub}</small></div>`; };
  // data checks for the month: receipt no. must be 12 digits · same bus, same kWh and amount within 2 days (double entry) · charging longer than 6 hours (forgot to stop)
  const flags = [];
  R.forEach((r, i) => {
    if (r.receipt_no && !/^\d{12}$/.test(r.receipt_no)) flags.push([r, `เลขที่ใบเสร็จ ${esc(r.receipt_no)} มี ${r.receipt_no.length} หลัก (ปกติ 12 หลัก)`]);
    const dup = R.find((x, j) => j < i && x.bus === r.bus && x.k && x.k === r.k && x.t === r.t && Math.abs(dObj(x.receipt_date) - dObj(r.receipt_date)) <= 2 * 864e5);
    if (dup) flags.push([r, `อาจบันทึกซ้ำกับรายการ ${bk(dup.receipt_date)} (${fmt(r.k, 2)} kWh · ${fmt(r.t)} บาท เท่ากัน)`]);
    if (r.started_at && r.ended_at && new Date(r.ended_at) - new Date(r.started_at) > 6 * 36e5) flags.push([r, `เวลาชาร์จ ${tHM(r.started_at)}–${tHM(r.ended_at)} น. นานเกิน 6 ชม. (อาจลืมกดบันทึกตอนชาร์จเสร็จ)`]);
  });
  const dayTot = sum(day, (r) => r.t);
  return `<section class="cdash"><div class="row1"><h2 style="margin:0">แดชบอร์ดการชาร์จไฟฟ้า</h2><span class="cd-nav"><button class="lnk" id="cdPrev" aria-label="วันก่อนหน้า">‹</button><input type="date" id="cdDay" value="${CD.day}" max="${today()}"><button class="lnk" id="cdNext" aria-label="วันถัดไป" ${CD.day >= today() ? "disabled" : ""}>›</button></span></div>
    <p class="sm" style="margin:4px 0 10px">${bkLong(CD.day)} · รวมทั้งวัน <b class="num">${fmt(dayTot)}</b> บาท · <b class="num">${fmt(sum(day, (r) => r.k), 2)}</b> kWh · ยอดรวมนับเฉพาะรายการที่มีใบเสร็จ/ยอดเงินแล้ว</p>
    <h3 class="cd-h">ค่าชาร์จแยกรายคัน</h3><div class="cd-buses">${BUSES.map(busTile).join("")}</div>
    <h3 class="cd-h">ยอดค่าชาร์จแยกตามสาย</h3><div class="cd-lines">${lineTile("R1", "สายหลัก ศูนย์วัฒนธรรมฯ – สถานี รฟม.", "STC-01 · STC-02 · STC-04")}${lineTile("R2", "สายศิริราช MRT อิสรภาพ – รพ.ศิริราช", "STC-03")}</div>
    <h3 class="cd-h">ประจำเดือน${MS ? " " + ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"][dObj(CD.day).getMonth()] + " " + (dObj(CD.day).getFullYear() + 543) : ""} <small>แตะกราฟเพื่อดูยอดรายวัน · แตะค้างเพื่อเลือกวัน</small></h3>
    <div class="cd-charts"><div class="card"><b class="cd-ct">พลังงาน (kWh) รายวัน</b><div class="legend" id="cdLegK"></div><div class="chart" id="cdK"></div></div>
      <div class="card"><b class="cd-ct">ค่าชาร์จ (บาท) รายวัน</b><div class="legend" id="cdLegB"></div><div class="chart" id="cdB"></div></div></div>
    ${flags.length ? `<details class="card cd-flags"><summary><b>⚠️ ข้อมูลที่ควรตรวจในเดือนนี้ ${flags.length} รายการ</b></summary><div class="list" style="margin-top:8px">${flags.map(([r, m]) => `<button class="alrow" data-cdf="${r.id}" style="text-align:left;background:none;border:0;border-top:1px solid var(--line);padding:8px 0 0;color:inherit;font:inherit;cursor:pointer;width:100%"><span class="sm"><b>${r.bus}</b> · ${bk(r.receipt_date)} · ${m} ›</span></button>`).join("")}</div></details>` : ""}
  </section>`;
}
function dashChart(boxId, legId, axis, ser, unit, dg) {
  const box = $(boxId); if (!box) return;
  const sum = (l) => l.reduce((x, v) => x + v, 0), W = 360, H = 220, ml = 44, mr = 12, mt = 14, mb = 28, pw = W - ml - mr, ph = H - mt - mb;
  const vmax = Math.max(1, ...ser.flatMap((s) => s.v)), raw = vmax / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), st = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= raw), ymax = Math.ceil((vmax * 1.08) / st) * st;
  const y = (v) => mt + ph - (v / ymax) * ph, X = (i) => ml + (axis.length === 1 ? pw / 2 : (i * pw) / (axis.length - 1));
  let g = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${unit} รายวันแยกรายคัน">`;
  for (let v = 0; v <= ymax + 1e-9; v += st) g += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${ml - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${Math.round(v).toLocaleString("th-TH")}</text>`;
  const skip = Math.ceil(axis.length / 8);
  const lastI = axis.length - 1;
  axis.forEach((d, i) => { if (i === lastI || (i % skip === 0 && lastI - i >= skip / 2)) g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${dObj(d).getDate()}</text>`; });
  const sel = axis.indexOf(CD.day);
  if (sel >= 0) g += `<rect x="${X(sel) - 5}" y="${mt}" width="10" height="${ph}" fill="rgba(31,194,255,.12)" rx="3"/>`;
  g += `<line class="cur" x1="0" x2="0" y1="${mt}" y2="${mt + ph}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/>`;
  ser.forEach((s) => { g += `<polyline points="${s.v.map((v, i) => `${X(i)},${y(v)}`).join(" ")}" fill="none" stroke="${SCOL[s.x]}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.v.forEach((v, i) => { if (v) g += `<circle cx="${X(i)}" cy="${y(v)}" r="2.8" fill="${SCOL[s.x]}" stroke="var(--card)" stroke-width="1.2"/>`; }); });
  box.innerHTML = g + `</svg><div class="tip" hidden></div>`;
  $(legId).innerHTML = ser.map((s) => `<span><i style="--c:${SCOL[s.x]}"></i>${s.x} <b class="num">${fmt(sum(s.v), dg)}</b></span>`).join("") + `<span>รวม <b class="num">${fmt(sum(ser.flatMap((s) => s.v)), dg)}</b> ${unit}</span>`;
  const svg = box.querySelector("svg"), tip = box.querySelector(".tip"), cur = box.querySelector(".cur");
  const idx = (ev) => { const r = svg.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W; return Math.max(0, Math.min(axis.length - 1, Math.round(axis.length === 1 ? 0 : ((px - ml) / pw) * (axis.length - 1)))); };
  const show = (ev) => { const i = idx(ev); cur.setAttribute("x1", X(i)); cur.setAttribute("x2", X(i)); cur.setAttribute("visibility", "visible");
    tip.innerHTML = `<b>${bk(axis[i])}</b>` + ser.map((s) => `<div class="r"><span><i style="--c:${SCOL[s.x]}"></i>${s.x}</span><span class="num">${s.v[i] ? fmt(s.v[i], dg) : "–"}</span></div>`).join("") + `<div class="r" style="border-top:1px solid #c9d3ea;margin-top:3px;padding-top:3px"><b>รวม</b><b class="num">${fmt(sum(ser.map((s) => s.v[i])), dg)} ${unit}</b></div>`;
    tip.hidden = false; const bx = box.getBoundingClientRect(), left = (X(i) / W) * bx.width; tip.style.left = Math.max(0, Math.min(bx.width - tip.offsetWidth, left - tip.offsetWidth / 2)) + "px"; tip.style.top = "0px"; };
  svg.addEventListener("pointermove", show); svg.addEventListener("pointerdown", show);
  svg.addEventListener("pointerleave", () => { tip.hidden = true; cur.setAttribute("visibility", "hidden"); });
  svg.addEventListener("dblclick", (ev) => { CD.day = axis[idx(ev)]; charge(); });
  let lp = null; svg.addEventListener("pointerdown", (ev) => { clearTimeout(lp); lp = setTimeout(() => { CD.day = axis[idx(ev)]; charge(); }, 650); });
  ["pointerup", "pointercancel", "pointerleave"].forEach((e) => svg.addEventListener(e, () => clearTimeout(lp)));
}
function bindDash() {
  if (!$("cdDay")) return;
  const go = (d) => { if (!d || d > today()) return; CD.day = d; charge(); };
  $("cdDay").onchange = (e) => go(e.target.value);
  $("cdPrev").onclick = () => go(iso(new Date(dObj(CD.day).getTime() - 864e5)));
  $("cdNext").onclick = () => go(iso(new Date(dObj(CD.day).getTime() + 864e5)));
  const d = dObj(CD.day), last = new Date(d.getFullYear(), d.getMonth() + 1, 0), axis = [];
  for (let t = new Date(d.getFullYear(), d.getMonth(), 1); t <= last && iso(t) <= today(); t.setDate(t.getDate() + 1)) axis.push(iso(t));
  if (!axis.length) axis.push(CD.day);
  const ser = (f) => BUSES.map((x) => ({ x, v: axis.map((dd) => CD.rows.filter((r) => r.bus === x && r.receipt_date === dd).reduce((s, r) => s + f(r), 0)) }));
  dashChart("cdK", "cdLegK", axis, ser((r) => r.k), "kWh", 1);
  dashChart("cdB", "cdLegB", axis, ser((r) => r.t), "บาท", 0);
  main().querySelectorAll("[data-cdf]").forEach((b) => (b.onclick = async () => { const r = (await q(sb.from("charging_records").select("*").eq("id", b.dataset.cdf)))[0]; if (r) chargeEdit(r); }));
}
/* receipts come from the charger the next day: records saved without a receipt wait here until attached */
async function pendingReceipts() {
  let qq = sb.from("charging_records").select("*").is("receipt_path", null).eq("source", "app").gte("receipt_date", iso(new Date(dObj(today()).getTime() - 30 * 864e5))).order("started_at");
  if (!isMgr()) qq = qq.eq("employee_id", ME.employee?.id || "00000000-0000-0000-0000-000000000000");
  const { data } = await qq; return data || [];
}
function pendHTML(rows) {
  if (!rows.length) return "";
  return `<section class="card" style="margin-top:12px;border-color:#ffd166"><div class="row1"><b>🧾 รอแนบใบเสร็จ</b><span class="pill warn">${rows.length} รายการ</span></div>
    <p class="sm" style="margin:4px 0 8px">ใบเสร็จจากตู้ชาร์จได้ในวันถัดไป · แนบภายในวันถัดไป ถ้าเกินกำหนด Manager Agent จะแจ้งเตือน</p>
    <div class="list">${rows.map((r) => { const v = vById(r.vehicle_id), late = (dObj(today()) - dObj(r.receipt_date)) / 864e5 >= 2;
      return `<div class="alrow" style="display:flex;gap:8px;align-items:center;justify-content:space-between;border-top:1px solid var(--line);padding-top:8px">
        <span class="sm"><b>${v?.code || ""}</b> · ${bk(r.receipt_date)} ${r.started_at ? tHM(r.started_at) + "–" + tHM(r.ended_at) + " น." : ""}${r.soc_before != null ? ` · แบต ${r.soc_before}% → ${r.soc_after}%` : ""}${late ? ` <span class="pill bad">เกินกำหนด</span>` : ""}</span>
        <button class="btn pri" data-attach="${r.id}" style="flex:none">แนบใบเสร็จ</button></div>`; }).join("")}</div></section>`;
}
function bindPend() { main().querySelectorAll("[data-attach]").forEach((b) => (b.onclick = () => attachSheet(CH.pend.find((r) => r.id === b.dataset.attach)))); }
function attachSheet(r) {
  const s = $("sheet"), v = vById(r.vehicle_id), g = (id) => s.querySelector("#" + id); let blob = null, isPdf = false; delete s.dataset.ocrWarn;
  s.innerHTML = `<div class="in"><div class="sh"><b>แนบใบเสร็จ · ${v?.code || ""} · ${bk(r.receipt_date)}</b><button class="lnk" id="shX">ปิด</button></div>
    <p class="sm" style="margin:0">ชาร์จเวลา ${r.started_at ? tHM(r.started_at) + "–" + tHM(r.ended_at) + " น." : "–"}${r.soc_before != null ? ` · แบต ${r.soc_before}% → ${r.soc_after}%` : ""} · ${esc(r.station || "")}</p>
    <div id="aPrev"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="btn block" style="min-height:60px;border-style:dashed">📷 ถ่ายภาพใบเสร็จ<input type="file" accept="image/*" capture="environment" id="aRc" hidden></label>
      <label class="btn block" style="min-height:60px;border-style:dashed">🖼️ เลือกรูป / PDF<input type="file" accept="image/*,application/pdf" id="aRf" hidden></label></div><p id="ocrNote" hidden></p>
    <div class="grid"><div class="fld"><label for="cNo">เลขที่ใบเสร็จ</label><input id="cNo" class="num" inputmode="numeric" placeholder="0069xxxxxxxx"></div>
      <div class="fld"><label for="cRef">เลขอ้างอิงการชาร์จ</label><input id="cRef" value="${esc(r.ev_ref || "")}" placeholder="EV69xxxxxxx"></div>
      <div class="fld"><label for="cK">พลังงาน (kWh)</label><input id="cK" class="big num" inputmode="decimal" value="${r.kwh ?? ""}"></div>
      <div class="fld"><label for="cSub">ค่าไฟก่อน VAT</label><input id="cSub" class="big num" inputmode="decimal" value="${r.subtotal ?? ""}"></div>
      <div class="fld"><label for="cVat">VAT 7%</label><input id="cVat" class="big num" inputmode="decimal" value="${r.vat ?? ""}"></div>
      <div class="fld"><label for="cTot">รวมทั้งสิ้น (บาท)</label><input id="cTot" class="big num" inputmode="decimal" value="${r.total ?? ""}"></div></div>
    <p class="sm num" id="cChk" style="margin:0"></p><p class="err" id="aErr" hidden></p><button class="btn pri block" id="aSave">บันทึกใบเสร็จ</button></div>`;
  s.hidden = false; $("shX").onclick = () => (s.hidden = true);
  const pick = async (e) => { const f = e.target.files[0]; if (!f) return; isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    if (isPdf) { if (f.size > 10 * 1024 * 1024) { toast("ไฟล์ PDF ใหญ่เกิน 10 MB"); return; } blob = f; } else { blob = await shrink(f, 1600, 0.8); if (!blob) { if (!isHeic(f)) toast("เปิดรูปนี้ไม่ได้ ลองถ่ายภาพใหม่"); return; } }
    $("aPrev").innerHTML = isPdf ? `<div class="card sm">📄 <b>${esc(f.name)}</b> · ${(f.size / 1024).toFixed(0)} KB</div>` : `<img src="${URL.createObjectURL(blob)}" alt="ใบเสร็จ" style="max-width:100%;max-height:260px;display:block;border-radius:10px">`;
    if (window.ocrFill) window.ocrFill(blob, isPdf, v, "ocrNote", s, { date: r.receipt_date, start: r.started_at, end: r.ended_at }); };
  $("aRc").onchange = pick; $("aRf").onchange = pick;
  ["cK", "cSub", "cVat", "cTot"].forEach((id) => (g(id).oninput = (e) => { e.target.value = e.target.value.replace(/[^\d.]/g, ""); chkCharge(s); })); chkCharge(s);
  $("aSave").onclick = async () => {
    const err = [], no = g("cNo").value.trim(), k = parseFloat(g("cK").value), tot = parseFloat(g("cTot").value);
    if (!blob) err.push("ภาพใบเสร็จ"); if (!no) err.push("เลขที่ใบเสร็จ"); else if (!/^\d{12}$/.test(no)) err.push("เลขที่ใบเสร็จต้องเป็นตัวเลข 12 หลัก"); if (!(k > 0)) err.push("kWh"); if (!(tot > 0)) err.push("รวมทั้งสิ้น");
    if (err.length) { $("aErr").textContent = "กรุณาตรวจ: " + err.join(", "); $("aErr").hidden = false; return; }
    if (!ocrGate(s, $("aSave"), (m) => { $("aErr").textContent = m; $("aErr").hidden = false; })) return;
    const b = $("aSave"); b.disabled = true; b.innerHTML = `<span class="spin"></span>กำลังบันทึก…`;
    try {
      const path = await upload(r.vehicle_id, "receipt", blob);
      await q(sb.rpc("attach_receipt", { p_id: r.id, p_path: path, p_no: no, p_ref: g("cRef").value.trim() || null, p_kwh: k, p_sub: parseFloat(g("cSub").value) || null, p_vat: parseFloat(g("cVat").value) || null, p_total: tot }));
      s.hidden = true; CD.m = null; toast("แนบใบเสร็จแล้ว"); charge();
    } catch (e) { b.disabled = false; b.textContent = "บันทึกใบเสร็จ"; $("aErr").textContent = /attach_receipt|function/.test(errMsg(e)) ? "ระบบแนบใบเสร็จภายหลังยังไม่เปิดใช้ (รอรัน SQL)" : errMsg(e); $("aErr").hidden = false; }
  };
}
/* view / edit / delete one charging record · driver: own record until the day after charging · manager: any time (rules enforced in edit_charge / delete_charge) */
/* receipt reader found a date/time/plate mismatch → the first tap on save only warns; a second tap saves */
function ocrGate(root, btn, err) { if (root.dataset.ocrWarn !== "1" || btn.dataset.ok === "1") return true; btn.dataset.ok = "1"; err("⚠️ ใบเสร็จไม่ตรงกับการชาร์จนี้ (ดูข้อความสีแดงด้านบน) · ถ้าตรวจแล้วถูกต้อง กดบันทึกอีกครั้งเพื่อยืนยัน"); return false; }
const canEditCharge = (r) => isMgr() || (r.source === "app" && r.employee_id && r.employee_id === ME.employee?.id && r.receipt_date >= iso(new Date(dObj(today()).getTime() - 864e5)));
async function chargeEdit(r, after) {
  const s = $("sheet"), v = vById(r.vehicle_id), g = (id) => s.querySelector("#" + id), can = canEditCharge(r); delete s.dataset.ocrWarn;
  let blob = null, isPdf = false;
  const hm = (t) => (t ? tHM(t) : "");
  const draw = () => {
    s.innerHTML = `<div class="in"><div class="sh"><b>การชาร์จ ${v?.code || ""} · ${bk(r.receipt_date)}</b><button class="lnk" id="shX">ปิด</button></div>
      ${can ? `<p class="sm" style="margin:0">${isMgr() ? "ผู้จัดการแก้ไข/ลบได้ทุกเวลา" : `แก้ไข/ลบได้ถึงสิ้นวันที่ ${bk(iso(new Date(dObj(r.receipt_date).getTime() + 864e5)))}`} · ระบบเก็บประวัติการแก้ไขทุกครั้ง</p>` : `<p class="notice" style="margin:0">ดูได้อย่างเดียว · เลยวันถัดไปแล้ว ถ้าข้อมูลผิดให้แจ้งผู้จัดการ</p>`}
      ${r.receipt_path ? `<button class="btn block" id="eView">${/\.pdf$/i.test(r.receipt_path) ? "📄 เปิดใบเสร็จ (PDF)" : "🧾 ดูรูปใบเสร็จ"}</button>` : `<p class="sm" style="margin:0">ยังไม่มีไฟล์ใบเสร็จ</p>`}
      <div id="ePrev"></div>
      ${can ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="btn block" style="min-height:52px;border-style:dashed">📷 ${r.receipt_path ? "ถ่ายใบเสร็จใหม่" : "ถ่ายภาพใบเสร็จ"}<input type="file" accept="image/*" capture="environment" id="eRc" hidden></label>
        <label class="btn block" style="min-height:52px;border-style:dashed">🖼️ ${r.receipt_path ? "เปลี่ยนไฟล์" : "เลือกรูป / PDF"}<input type="file" accept="image/*,application/pdf" id="eRf" hidden></label></div><p id="ocrNote" hidden></p>` : ""}
      <fieldset ${can ? "" : "disabled"} style="border:0;padding:0;margin:0;min-width:0"><div class="grid">
        <div class="fld"><label for="eS">เริ่มชาร์จ</label><input id="eS" type="time" value="${hm(r.started_at)}"></div>
        <div class="fld"><label for="eE">สิ้นสุด</label><input id="eE" type="time" value="${hm(r.ended_at)}"></div>
        <div class="fld full"><label for="cSt">สถานีชาร์จ</label><input id="cSt" value="${esc(r.station || "")}"></div>
        <div class="fld"><label for="cA">แบตก่อนชาร์จ (%)</label><input id="cA" class="big num" inputmode="numeric" maxlength="3" value="${r.soc_before ?? ""}"></div>
        <div class="fld"><label for="cB">แบตหลังชาร์จ (%)</label><input id="cB" class="big num" inputmode="numeric" maxlength="3" value="${r.soc_after ?? ""}"></div>
        <div class="fld"><label for="cNo">เลขที่ใบเสร็จ</label><input id="cNo" class="num" inputmode="numeric" value="${esc(r.receipt_no || "")}"></div>
        <div class="fld"><label for="cRef">เลขอ้างอิงการชาร์จ</label><input id="cRef" value="${esc(r.ev_ref || "")}"></div>
        <div class="fld"><label for="cK">พลังงาน (kWh)</label><input id="cK" class="big num" inputmode="decimal" value="${r.kwh ?? ""}"></div>
        <div class="fld"><label for="cSub">ค่าไฟก่อน VAT</label><input id="cSub" class="big num" inputmode="decimal" value="${r.subtotal ?? ""}"></div>
        <div class="fld"><label for="cVat">VAT 7%</label><input id="cVat" class="big num" inputmode="decimal" value="${r.vat ?? ""}"></div>
        <div class="fld"><label for="cTot">รวมทั้งสิ้น (บาท)</label><input id="cTot" class="big num" inputmode="decimal" value="${r.total ?? ""}"></div></div></fieldset>
      <p class="sm num" id="cChk" style="margin:0"></p><p class="err" id="eErr" hidden></p>
      ${can ? `<button class="btn pri block" id="eSave">บันทึกการแก้ไข</button><button class="btn danger block" id="eDel">ลบรายการนี้</button>` : ""}</div>`;
    s.hidden = false; $("shX").onclick = () => (s.hidden = true);
    if (g("eView")) g("eView").onclick = async () => { const win = /\.pdf$/i.test(r.receipt_path) ? window.open("", "_blank") : null; const [u] = await signed([r.receipt_path]);
      if (!u) { if (win) win.close(); toast("เปิดไฟล์ไม่ได้ ลองใหม่อีกครั้ง"); return; } if (win) win.location.href = u; else { $("vImg").src = u; $("viewer").hidden = false; } };
    chkCharge(s); if (!can) return;
    ["cA", "cB"].forEach((id) => (g(id).oninput = (e) => (e.target.value = e.target.value.replace(/\D/g, ""))));
    ["cK", "cSub", "cVat", "cTot"].forEach((id) => (g(id).oninput = (e) => { e.target.value = e.target.value.replace(/[^\d.]/g, ""); chkCharge(s); }));
    const pick = async (e) => { const f = e.target.files[0]; if (!f) return; isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      if (isPdf) { if (f.size > 10 * 1024 * 1024) { toast("ไฟล์ PDF ใหญ่เกิน 10 MB"); return; } blob = f; } else { blob = await shrink(f, 1600, 0.8); if (!blob) { if (!isHeic(f)) toast("เปิดรูปนี้ไม่ได้ ลองถ่ายภาพใหม่"); return; } }
      g("ePrev").innerHTML = isPdf ? `<div class="card sm">📄 ไฟล์ใหม่ <b>${esc(f.name)}</b></div>` : `<img src="${URL.createObjectURL(blob)}" alt="ใบเสร็จใหม่" style="max-width:100%;max-height:240px;display:block;border-radius:10px">`;
      if (window.ocrFill) window.ocrFill(blob, isPdf, v, "ocrNote", s, { date: r.receipt_date, start: r.started_at, end: r.ended_at }); };
    g("eRc").onchange = pick; g("eRf").onchange = pick;
    g("eSave").onclick = async () => {
      const err = (m) => { g("eErr").textContent = m; g("eErr").hidden = false; };
      const ts = (hhmm) => (hhmm ? new Date(`${r.receipt_date}T${hhmm}:00+07:00`).toISOString() : null);
      const st = ts(g("eS").value), en = ts(g("eE").value);
      if (st && en && en <= st) return err("เวลาสิ้นสุดต้องหลังเวลาเริ่มชาร์จ");
      if (g("cNo").value.trim() && !/^\d{12}$/.test(g("cNo").value.trim())) return err("เลขที่ใบเสร็จต้องเป็นตัวเลข 12 หลัก");
      if (!ocrGate(s, g("eSave"), err)) return;
      const b = g("eSave"); b.disabled = true; b.innerHTML = `<span class="spin"></span>กำลังบันทึก…`;
      try {
        const path = blob ? await upload(r.vehicle_id, "receipt", blob) : null;
        await q(sb.rpc("edit_charge", { p_id: r.id, p: { started_at: st, ended_at: en, station: g("cSt").value, soc_before: g("cA").value, soc_after: g("cB").value, receipt_no: g("cNo").value, ev_ref: g("cRef").value, kwh: g("cK").value, subtotal: g("cSub").value, vat: g("cVat").value, total: g("cTot").value, receipt_path: path } }));
        s.hidden = true; CD.m = null; toast("บันทึกการแก้ไขแล้ว"); (after || charge)();
      } catch (x) { b.disabled = false; b.textContent = "บันทึกการแก้ไข"; err(/edit_charge|function/.test(errMsg(x)) ? "ระบบแก้ไขยังไม่เปิดใช้ (รอรัน SQL)" : errMsg(x)); }
    };
    g("eDel").onclick = async (e) => {
      const b = e.currentTarget; if (b.dataset.c !== "1") { b.dataset.c = "1"; b.textContent = "แตะอีกครั้งเพื่อยืนยันการลบ"; return; }
      b.disabled = true;
      try { await q(sb.rpc("delete_charge", { p_id: r.id })); s.hidden = true; CD.m = null; toast("ลบรายการแล้ว"); (after || charge)(); }
      catch (x) { b.disabled = false; b.textContent = "ลบรายการนี้"; g("eErr").textContent = /delete_charge|function/.test(errMsg(x)) ? "ระบบลบยังไม่เปิดใช้ (รอรัน SQL)" : errMsg(x); g("eErr").hidden = false; }
    };
  };
  draw();
}
function bindRecent() { main().querySelectorAll("[data-chg]").forEach((c) => (c.onclick = () => { const r = (CH.recent || []).find((x) => x.id === c.dataset.chg); if (r) chargeEdit(r); })); }
function recentHTML(rows) { return `<h2>บันทึกล่าสุด <small>${isMgr() ? "ทุกคัน" : "ของคุณ"}</small></h2>` + (rows.length ? `<div class="list">${rows.map((r) => { const v = vById(r.vehicle_id); return `<button class="card" data-chg="${r.id}" style="border-left:4px solid ${v ? COLOR[v.code] : "var(--line)"};text-align:left;width:100%;font:inherit;color:inherit;cursor:pointer"><div class="row1"><b>${v?.code || "ไม่ระบุรถ"}</b><span class="sm">${bk(r.receipt_date || bkD(r.started_at))}${r.started_at ? " " + tHM(r.started_at) + "–" + tHM(r.ended_at) : ""}</span>${r.receipt_path || r.source !== "app" ? `<span class="pill info num">${fmt(r.total)} บาท</span>` : `<span class="pill warn">รอใบเสร็จ</span>`}</div><div class="sm num">${r.receipt_no ? "ใบเสร็จ " + r.receipt_no + " · " : ""}${r.kwh != null ? fmt(r.kwh, 2) + " kWh" : ""}${r.soc_before != null ? ` · แบต ${r.soc_before}% → ${r.soc_after}%` : ""}${r.source === "import" ? " · นำเข้า" : ""}</div><div class="sm" style="margin-top:2px;color:var(--blue)">${canEditCharge(r) ? "แตะเพื่อดู / แก้ไข / ลบ ›" : "แตะเพื่อดูรายละเอียด ›"}</div></button>`; }).join("")}</div>` : `<div class="empty">ยังไม่มีบันทึกการชาร์จ</div>`); }
function drawCharge(vs, recent) {
  const run = getRun(), v = vById(CH.vid);
  main().innerHTML = `${CH.dash || ""}${pendHTML(CH.pend || [])}<h2>เลือกรถเพื่อทำการชาร์จไฟฟ้า</h2>${busPicker(vs, CH.vid)}
   ${!run ? `<button class="btn go block" id="startBtn" style="margin-top:14px">${ic('<path d="M13 3 6 13h5l-1 8 7-10h-5z"/>')}เริ่มดำเนินการชาร์จ</button>` : `
   <section class="run" style="margin-top:14px"><div><span class="live"></span><b>กำลังชาร์จ ${v.code}</b></div>
    <dl class="rt num"><div><dt>เริ่มชาร์จ</dt><dd>${run.start} น.</dd></div><div><dt>สิ้นสุด</dt><dd>เมื่อกดบันทึก</dd></div><div><dt>ใช้เวลา</dt><dd id="dur">–</dd></div></dl>
    <div class="row1"><span class="sm" style="flex:1">เวลาสิ้นสุดบันทึกอัตโนมัติเมื่อกด "บันทึกการชาร์จ"</span><button class="lnk" id="cancelRun">ยกเลิก</button></div></section>
   <div class="grid" style="margin-top:12px"><div class="fld full"><label for="cSt">สถานีชาร์จ</label><input id="cSt" value="สถานีอัดประจุ กฟน. (MEA)"></div>
    <div class="fld"><label for="cA">แบตก่อนชาร์จ (%)</label><input id="cA" class="big num" inputmode="numeric" maxlength="3"></div>
    <div class="fld"><label for="cB">แบตหลังชาร์จ (%)</label><input id="cB" class="big num" inputmode="numeric" maxlength="3"></div></div>
   <h2>ใบเสร็จการชาร์จ <small>แนบภายหลังได้ (ได้ใบเสร็จวันถัดไป)</small></h2>
   <p class="sm" style="margin:0 0 8px">ยังไม่มีใบเสร็จ → กด "บันทึกการชาร์จ" ได้เลย แล้วมากด "แนบใบเสร็จ" ที่หน้านี้ในวันถัดไป</p>
   <div style="display:grid;gap:8px">${CH.url ? (CH.pdf ? `<div class="card" style="display:flex;align-items:center;gap:10px"><span style="font-size:1.8rem">📄</span><div class="sm"><b>${esc(CH.name || "ใบเสร็จ.pdf")}</b><br>${(CH.blob.size / 1024).toFixed(0)} KB</div></div>` : `<img src="${CH.url}" alt="ใบเสร็จ" style="max-width:100%;max-height:300px;display:block;border-radius:10px">`) : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="btn block" style="min-height:64px;border-style:dashed">📷 ถ่ายภาพใบเสร็จ<input type="file" accept="image/*" capture="environment" id="cRc" hidden></label>
      <label class="btn block" style="min-height:64px;border-style:dashed">🖼️ เลือกรูป / ไฟล์ PDF<input type="file" accept="image/*,application/pdf" id="cRf" hidden></label></div><p id="ocrNote" hidden></p></div>
   <div class="grid" style="margin-top:8px"><div class="fld"><label for="cNo">เลขที่ใบเสร็จ</label><input id="cNo" class="num" inputmode="numeric" placeholder="0069xxxxxxxx"></div>
    <div class="fld"><label for="cRef">เลขอ้างอิงการชาร์จ</label><input id="cRef" placeholder="EV69xxxxxxx"></div>
    <div class="fld"><label for="cK">พลังงาน (kWh)</label><input id="cK" class="big num" inputmode="decimal"></div>
    <div class="fld"><label for="cSub">ค่าไฟก่อน VAT</label><input id="cSub" class="big num" inputmode="decimal"></div>
    <div class="fld"><label for="cVat">VAT 7%</label><input id="cVat" class="big num" inputmode="decimal"></div>
    <div class="fld"><label for="cTot">รวมทั้งสิ้น (บาท)</label><input id="cTot" class="big num" inputmode="decimal"></div></div>
   <p class="sm num" id="cChk" style="margin:8px 0 0"></p><p class="err" id="cErr" hidden></p>
   <button class="btn pri block" id="cSave" style="margin-top:12px">บันทึกการชาร์จ</button>`}
   ${recentHTML(recent)}`;
  bindPend(); bindRecent(); bindDash();
  main().querySelectorAll("[data-b]").forEach((b) => (b.onclick = () => { CH.vid = b.dataset.b; const r = getRun(); if (r) { r.vid = CH.vid; setRun(r); } drawCharge(vs, recent); }));
  if (!run) { $("startBtn").onclick = () => { setRun({ vid: CH.vid, start: nowHM(), date: today(), ms: Date.now() }); toast(`เริ่มชาร์จ ${vById(CH.vid).code} เวลา ${nowHM()} น.`); drawCharge(vs, recent); }; return; }
  const tick = () => { const m = Math.round((Date.now() - run.ms) / 60000); const el = $("dur"); if (el) el.textContent = `${Math.floor(m / 60)} ชม. ${m % 60} น.`; }; tick(); clearInterval(drawCharge.t); drawCharge.t = setInterval(tick, 30000);
  $("cancelRun").onclick = (e) => { const b = e.currentTarget; if (b.dataset.c !== "1") { b.dataset.c = "1"; b.textContent = "แตะอีกครั้งเพื่อยกเลิก"; return; } setRun(null); CH.blob = null; CH.url = null; drawCharge(vs, recent); };
  const pick = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    let blob = null;
    if (isPdf) { if (f.size > 10 * 1024 * 1024) { toast("ไฟล์ PDF ใหญ่เกิน 10 MB"); return; } blob = f; }
    else { blob = await shrink(f, 1600, 0.8); if (!blob) { if (!isHeic(f)) toast("เปิดรูปนี้ไม่ได้ ลองถ่ายภาพใหม่ หรือเลือกรูปแบบ JPG/PNG"); return; } }
    if (CH.url) URL.revokeObjectURL(CH.url);
    CH.blob = blob; CH.pdf = isPdf; CH.name = f.name; CH.url = URL.createObjectURL(blob);
    const keep = readCharge(); drawCharge(vs, recent); writeCharge(keep);
    if (window.ocrFill) window.ocrFill(blob, isPdf, vById(CH.vid), "ocrNote", main(), { date: today(), start: new Date(getRun().ms).toISOString(), end: new Date().toISOString() });
  };
  $("cRc").onchange = pick; $("cRf").onchange = pick;
  ["cA", "cB"].forEach((id) => ($(id).oninput = (e) => (e.target.value = e.target.value.replace(/\D/g, ""))));
  ["cK", "cSub", "cVat", "cTot"].forEach((id) => ($(id).oninput = (e) => { e.target.value = e.target.value.replace(/[^\d.]/g, ""); chkCharge(); }));
  $("cSave").onclick = () => saveCharge(vs);
}
function readCharge() { const o = {}; ["cSt", "cA", "cB", "cNo", "cRef", "cK", "cSub", "cVat", "cTot"].forEach((id) => { const el = $(id); if (el) o[id] = el.value; }); return o; }
function writeCharge(o) { Object.entries(o).forEach(([k, v]) => { const el = $(k); if (el) el.value = v; }); chkCharge(); }
function chkCharge(root) {
  root = root || main(); const g = (id) => root.querySelector("#" + id); if (!g("cK")) return;
  const k = +g("cK").value, s = +g("cSub").value, v = +g("cVat").value, t = +g("cTot").value, L = [];
  if (k && s) L.push(Math.abs(k * 7.0093 - s) <= 0.05 ? "✓ kWh × 7.0093 ตรงกับค่าไฟก่อน VAT" : `! kWh × 7.0093 = ${fmt(k * 7.0093)} ไม่ตรงกับ ${fmt(s)}`);
  if (s && v) L.push(Math.abs(s * 0.07 - v) <= 0.02 ? "✓ VAT = 7%" : "! VAT ไม่เท่ากับ 7%");
  if (s && t) L.push(Math.abs(s + v - t) <= 0.02 ? "✓ ยอดรวมถูกต้อง" : "! ก่อน VAT + VAT ไม่เท่ากับยอดรวม");
  g("cChk").textContent = L.join(" · ");
}
async function saveCharge(vs) {
  const run = getRun(), o = readCharge(), err = [];
  const a = o.cA === "" ? null : +o.cA, b = o.cB === "" ? null : +o.cB, k = parseFloat(o.cK), tot = parseFloat(o.cTot);
  if (!o.cSt.trim()) err.push("สถานีชาร์จ"); if (a == null || b == null) err.push("แบตก่อนและหลังชาร์จ"); else if (a > 100 || b > 100 || b <= a) err.push("แบตหลังชาร์จต้องมากกว่าก่อนชาร์จ และไม่เกิน 100%");
  // receipt now: photo + number + kWh + total required · receipt later: only times and battery (kWh/amount optional)
  if (o.cNo.trim() && !/^\d{12}$/.test(o.cNo.trim())) err.push("เลขที่ใบเสร็จต้องเป็นตัวเลข 12 หลัก");
  if (CH.blob) { if (!o.cNo.trim()) err.push("เลขที่ใบเสร็จ"); if (!(k > 0)) err.push("kWh"); if (!(tot > 0)) err.push("รวมทั้งสิ้น"); }
  else if ((o.cK && !(k > 0)) || (o.cTot && !(tot > 0))) err.push("kWh / ยอดเงินไม่ถูกต้อง");
  if (err.length) { $("cErr").textContent = "กรุณาตรวจ: " + err.join(", "); $("cErr").hidden = false; return; }
  if (!ocrGate(main(), $("cSave"), (m) => { $("cErr").textContent = m; $("cErr").hidden = false; })) return;
  const btn = $("cSave"); btn.disabled = true; btn.innerHTML = `<span class="spin"></span>กำลังบันทึก…`;
  try {
    const later = !CH.blob, path = later ? null : await upload(CH.vid, "receipt", CH.blob);
    const startedAt = new Date(run.ms).toISOString(), endedAt = new Date().toISOString();
    const rec = { vehicle_id: CH.vid, employee_id: ME.employee?.id || null, started_at: startedAt, ended_at: endedAt, station: o.cSt.trim(), soc_before: a, soc_after: b, receipt_no: o.cNo.trim() || null, receipt_date: today(), ev_ref: o.cRef.trim() || null, kwh: k > 0 ? k : null, unit_price: 7.0093, subtotal: parseFloat(o.cSub) || null, vat: parseFloat(o.cVat) || null, total: tot > 0 ? tot : null, receipt_path: path, source: "app" };
    try { await q(sb.from("charging_records").insert(rec)); }
    catch (e) { if (later && /null value|not-null|23502/i.test(errMsg(e) + (e.code || ""))) throw new Error("ตอนนี้ยังต้องแนบใบเสร็จก่อนบันทึก (ระบบแนบภายหลังรอรัน SQL)"); throw e; }
    setRun(null); CH.blob = null; CH.url = null; CH.pdf = false; delete main().dataset.ocrWarn; CD.m = null;
    const v = vById(rec.vehicle_id), endHM = nowHM();
    const text = `${v.code} (${v.plate}) ชาร์จไฟฟ้าเรียบร้อย\n${bk(today())} เวลา ${run.start}–${endHM} น.\nแบต ${a}% → ${b}%${rec.kwh ? ` · ${fmt(k, 2)} kWh` : ""}\n${rec.total ? `ค่าไฟฟ้า ${fmt(tot)} บาท · ` : ""}${later ? "ใบเสร็จ: รอแนบวันถัดไป" : `ใบเสร็จ ${rec.receipt_no}`}\n${rec.station} · ${ME.employee?.name || PROFILE.display_name}`;
    main().innerHTML = `<section style="padding-top:20px;display:flex;flex-direction:column;gap:12px"><span class="pill ok" style="margin:0;align-self:flex-start">✓ บันทึกการชาร์จแล้ว</span>
     <div class="sum" style="grid-template-columns:1fr 1fr"><div class="tile"><small>เวลาชาร์จ</small><b class="num">${run.start}–${endHM}</b></div><div class="tile"><small>แบตเตอรี่</small><b class="num">${a}% → ${b}%</b></div><div class="tile"><small>พลังงาน</small><b class="num">${rec.kwh ? fmt(k, 2) + " kWh" : "รอใบเสร็จ"}</b></div><div class="tile"><small>ค่าไฟรวม VAT</small><b class="num">${rec.total ? fmt(tot) : "รอใบเสร็จ"}</b></div></div>
     ${later ? `<p class="notice">บันทึกแล้ว · รอแนบใบเสร็จ — เมื่อได้ใบเสร็จวันถัดไป เปิดเมนูบันทึกการชาร์จ แล้วกด "แนบใบเสร็จ"</p>` : ""}
     <div class="card"><pre style="margin:0;white-space:pre-wrap;font:inherit;line-height:1.6">${esc(text)}</pre></div>
     ${lineBtn(text)}<button class="btn block" id="cp">คัดลอกข้อความ</button><a class="btn block" href="#home">กลับหน้าหลัก</a><button class="lnk" id="again">เริ่มบันทึกการชาร์จครั้งถัดไป</button></section>`;
    $("cp").onclick = () => copyText(text); $("again").onclick = () => charge();
  } catch (e) { $("cErr").textContent = errMsg(e); $("cErr").hidden = false; btn.disabled = false; btn.textContent = "บันทึกการชาร์จ"; }
}

/* ================= MAINTENANCE + ACCIDENTS ================= */
const TYPES = ["PM ตามระยะ", "ซ่อมแก้ไข (CM)", "ระบบปรับอากาศ", "ยางและช่วงล่าง", "เบรก", "แบตเตอรี่/ไฟฟ้าแรงสูง", "ระบบไฟฟ้า 12V", "ประตู/ทางลาด", "ตัวถัง/กระจก", "อุบัติเหตุ", "อื่น ๆ"];
const STEPS = ["แจ้งซ่อม", "กำลังซ่อม", "ซ่อมเสร็จ"], AST = ["เปิดเรื่อง", "รอซ่อม/รอเคลม", "ปิดเรื่อง"];
const KINDS = ["ชนรถยนต์", "ชนรถจักรยานยนต์", "เฉี่ยวชน/ขูดขีด", "ชนคน/จักรยาน", "ชนวัตถุ/ขอบทาง", "ผู้โดยสารบาดเจ็บในรถ", "ถูกชนขณะจอด", "อื่น ๆ"];
const FAULT = { pending: "รอสรุปฝ่ายผิด", us: "ฝ่ายเราผิด", other: "คู่กรณีผิด", none: "ไม่มีฝ่ายผิด" };
let mTab = "M";
async function maint() {
  const canAct = isMgr() || role() === "MAINTENANCE";
  const [jobs, accs, costs, emps] = await Promise.all([
    q(sb.from("maintenance_jobs").select("*").order("reported_on", { ascending: false }).limit(100)),
    q(sb.from("accidents").select("*").order("occurred_at", { ascending: false }).limit(100)),
    isMgr() ? q(sb.from("maintenance_costs").select("*")) : Promise.resolve([]),
    isMgr() ? q(sb.from("employees").select("id,full_name")) : Promise.resolve([]),
  ]);
  const cost = (id) => costs.find((c) => c.job_id === id)?.cost;
  const name = (id) => emps.find((e) => e.id === id)?.full_name || (id === ME.employee?.id ? ME.employee.name : "");
  const pics = async (paths) => (await signed(paths)).map((u) => `<img src="${u}" data-view alt="รูปประกอบ">`).join("");
  const m = today().slice(0, 7);
  const jobHTML = async (j) => { const v = vById(j.vehicle_id) || { code: "", plate: "" }; const c = cost(j.id);
    return `<details class="job" style="--c:${COLOR[v.code]}"><summary><div class="row1"><b>${v.code}</b><span class="type">${esc(j.job_type)}</span><span class="pill ${["bad", "warn", "ok"][j.status]}">${STEPS[j.status]}</span></div><div class="desc">${esc(j.description)}</div><div class="meta num"><span>แจ้ง ${bk(j.reported_on)}</span>${j.vehicle_stopped ? "<span>รถหยุดวิ่ง</span>" : ""}${c != null ? `<span>${fmt(c)} บาท</span>` : ""}</div></summary>
     <div class="jb"><dl class="kv num"><dt>เลขไมล์</dt><dd>${j.odometer ? fmt(j.odometer, 0) + " กม." : "–"}</dd><dt>ผู้ซ่อม</dt><dd>${esc(j.shop) || "–"}</dd><dt>เริ่มซ่อม</dt><dd>${bk(j.started_on)}</dd><dt>ซ่อมเสร็จ</dt><dd>${bk(j.done_on)}</dd>${j.work_done ? `<dt>สิ่งที่ซ่อม</dt><dd>${esc(j.work_done)}</dd>` : ""}${isMgr() ? `<dt>ผู้แจ้ง</dt><dd>${esc(name(j.reported_by)) || "–"}</dd>` : ""}</dl>
     ${j.photo_paths?.length ? `<div class="pics">${await pics(j.photo_paths)}</div>` : ""}
     ${canAct && j.status < 2 ? `<div class="acts">${j.status === 0 ? `<button class="btn pri" data-jstart="${j.id}">เริ่มซ่อม</button>` : ""}<button class="btn" data-jclose="${j.id}">ปิดงานซ่อม</button></div>` : ""}</div></details>`; };
  const accHTML = async (a) => { const v = vById(a.vehicle_id) || { code: "" }; const inj = a.injured_passengers + a.injured_others;
    return `<details class="job" style="--c:${COLOR[v.code]}"><summary><div class="row1"><b>${v.code}</b><span class="type">${esc(a.kind)}</span><span class="pill ${a.severity === "serious" ? "bad" : "warn"}">${a.severity === "serious" ? "รุนแรง" : "เล็กน้อย"}</span><span class="pill ${["bad", "warn", "ok"][a.status]}" style="margin-left:0">${AST[a.status]}</span></div><div class="desc">${esc(a.description)}</div><div class="meta num"><span>${bk(bkD(a.occurred_at))} ${tHM(a.occurred_at)}</span><span>${esc(a.place)}</span><span>${inj ? `บาดเจ็บ ${inj} คน` : "ไม่มีผู้บาดเจ็บ"}</span></div></summary>
     <div class="jb"><dl class="kv"><dt>คู่กรณี</dt><dd>${a.has_counterparty ? "มี" + (a.counterparty_plate ? " · " + esc(a.counterparty_plate) : "") : "ไม่มี"}</dd><dt>ผู้บาดเจ็บ</dt><dd>ผู้โดยสาร ${a.injured_passengers} · คนขับ/คู่กรณี ${a.injured_others}</dd><dt>ฝ่ายผิด</dt><dd>${FAULT[a.fault]}</dd><dt>แจ้งความ</dt><dd>${esc(a.police_ref) || "–"}</dd><dt>เลขเคลม</dt><dd>${esc(a.claim_no) || "–"}</dd></dl>
     ${a.photo_paths?.length ? `<div class="pics">${await pics(a.photo_paths)}</div>` : ""}
     ${isMgr() && a.status < 2 ? `<div class="acts"><button class="btn" data-anext="${a.id}" data-s="${a.status + 1}">${a.status === 0 ? "เปลี่ยนเป็น รอซ่อม/รอเคลม" : "ปิดเรื่อง"}</button></div>` : ""}</div></details>`; };
  const openJ = jobs.filter((j) => j.status < 2), doneJ = jobs.filter((j) => j.status === 2), openA = accs.filter((a) => a.status < 2), doneA = accs.filter((a) => a.status === 2);
  const mm = accs.filter((a) => bkD(a.occurred_at).startsWith(m));
  main().innerHTML = `<div class="tabs2" role="tablist"><button id="tM" aria-selected="${mTab === "M"}">ซ่อมบำรุง</button><button id="tA" aria-selected="${mTab === "A"}">อุบัติเหตุ</button></div>
   <div id="pM" ${mTab === "M" ? "" : "hidden"}><section class="sum"><div class="tile ${openJ.length ? "alert" : ""}"><small>งานที่ยังไม่เสร็จ</small><b class="num">${openJ.length}</b><span>รายการ</span></div><div class="tile"><small>ค่าซ่อมเดือนนี้</small><b class="num">${isMgr() ? fmt(doneJ.filter((j) => (j.done_on || "").startsWith(m)).reduce((s, j) => s + (cost(j.id) || 0), 0), 0) : "–"}</b><span>${isMgr() ? "บาท" : "เฉพาะผู้จัดการ"}</span></div><div class="tile"><small>หยุดวิ่ง (ค้าง)</small><b class="num">${openJ.filter((j) => j.vehicle_stopped).length}</b><span>คัน</span></div></section>
    <h2>งานที่ยังไม่เสร็จ</h2><div class="list">${openJ.length ? (await Promise.all(openJ.map(jobHTML))).join("") : `<div class="empty"><b>ไม่มีงานค้าง</b>รถทุกคันพร้อมใช้งาน</div>`}</div>
    <h2>ประวัติ</h2><div class="list">${doneJ.length ? (await Promise.all(doneJ.map(jobHTML))).join("") : `<div class="empty"><b>ยังไม่มีประวัติการซ่อมบำรุง</b></div>`}</div>
    ${myVehicles().length ? `<button class="btn pri block" id="newJob" style="margin-top:16px">+ บันทึกงานซ่อมบำรุง</button>` : ""}</div>
   <div id="pA" ${mTab === "A" ? "" : "hidden"}><section class="sum"><div class="tile ${openA.length ? "alert" : ""}"><small>เรื่องที่ยังไม่ปิด</small><b class="num">${openA.length}</b><span>รายการ</span></div><div class="tile"><small>อุบัติเหตุเดือนนี้</small><b class="num">${mm.length}</b><span>ครั้ง</span></div><div class="tile"><small>ผู้บาดเจ็บเดือนนี้</small><b class="num">${mm.reduce((s, a) => s + a.injured_passengers + a.injured_others, 0)}</b><span>คน</span></div></section>
    <h2>เรื่องที่ยังไม่ปิด</h2><div class="list">${openA.length ? (await Promise.all(openA.map(accHTML))).join("") : `<div class="empty"><b>ไม่มีเรื่องค้าง</b></div>`}</div>
    <h2>ประวัติอุบัติเหตุ</h2><div class="list">${doneA.length ? (await Promise.all(doneA.map(accHTML))).join("") : `<div class="empty"><b>ยังไม่มีประวัติอุบัติเหตุ</b>เมื่อเกิดเหตุ ให้บันทึกทันทีพร้อมรูปที่เกิดเหตุ</div>`}</div>
    ${myVehicles().length ? `<button class="btn danger block" id="newAcc" style="margin-top:16px">+ บันทึกอุบัติเหตุ</button>` : ""}</div>`;
  $("tM").onclick = () => { mTab = "M"; history.replaceState(null, "", "#maint"); maint(); };
  $("tA").onclick = () => { mTab = "A"; history.replaceState(null, "", "#maint/accident"); maint(); };
  $("newJob") && ($("newJob").onclick = () => jobSheet());
  $("newAcc") && ($("newAcc").onclick = () => accSheet());
  main().querySelectorAll("[data-jstart]").forEach((b) => (b.onclick = async () => { try { await q(sb.from("maintenance_jobs").update({ status: 1, started_on: today() }).eq("id", b.dataset.jstart)); toast("เริ่มซ่อมแล้ว"); maint(); } catch (e) { toast(errMsg(e)); } }));
  main().querySelectorAll("[data-jclose]").forEach((b) => (b.onclick = () => closeSheet(b.dataset.jclose)));
  main().querySelectorAll("[data-anext]").forEach((b) => (b.onclick = async () => { const s = +b.dataset.s; try { await q(sb.from("accidents").update({ status: s, closed_on: s === 2 ? today() : null }).eq("id", b.dataset.anext)); toast(AST[s]); maint(); } catch (e) { toast(errMsg(e)); } }));
}
function picsInput(id, store) { return `<label class="btn block" style="border-style:dashed">+ แนบรูป<input type="file" accept="image/*" multiple id="${id}"></label><div class="pics" id="${id}Prev"></div>`; }
function bindPics(id, store) { $(id).onchange = async (e) => { let bad = 0; for (const f of e.target.files) { const b = await shrink(f); if (b) store.push(b); else bad++; } if (bad) toast(`เปิดรูปไม่ได้ ${bad} รูป (เช่น HEIC) ลองถ่ายใหม่หรือเลือกรูป JPG`); e.target.value = ""; $(id + "Prev").innerHTML = store.map((b) => `<img src="${URL.createObjectURL(b)}" alt="">`).join(""); }; }
function jobSheet() {
  const vs = myVehicles(); let vid = vs[0].id, type = TYPES[1]; const pics = [];
  const s = $("sheet");
  const draw = () => { s.innerHTML = `<div class="in"><div class="sh"><b>บันทึกงานซ่อมบำรุง</b><button class="lnk" id="shX">ปิด</button></div>${busPicker(vs, vid)}
    <p class="lbl">ประเภทงาน</p><div class="chips" id="jT">${TYPES.map((t) => `<button class="chip" aria-pressed="${t === type}" data-t="${t}">${t}</button>`).join("")}</div>
    <div class="grid"><div class="fld full" id="wD"><label for="jD">อาการ / รายละเอียดงาน</label><textarea id="jD" placeholder="เช่น แอร์ไม่เย็น ห้องโดยสารด้านหลัง"></textarea></div>
    <div class="fld"><label for="jOdo">เลขไมล์ (กม.)</label><input id="jOdo" inputmode="numeric"></div><div class="fld"><label for="jStop">รถหยุดวิ่ง</label><select id="jStop"><option value="0">ไม่หยุดวิ่ง</option><option value="1">หยุดวิ่ง</option></select></div>
    <div class="fld full"><label for="jShop">ผู้ซ่อม / ศูนย์บริการ</label><input id="jShop"></div><div class="fld full"><label for="jClaim">เคลมประกัน</label><select id="jClaim"><option value="no">ไม่เคลม</option><option value="yes">เคลมประกัน (ฟอลคอน)</option><option value="warranty">ประกันผู้ผลิต</option></select></div></div>
    ${picsInput("jP")}<p class="err" id="jErr" hidden></p><button class="btn pri block" id="jSave">บันทึกแจ้งซ่อม</button></div>`;
    s.hidden = false; $("shX").onclick = () => (s.hidden = true);
    s.querySelectorAll("[data-b]").forEach((b) => (b.onclick = () => { vid = b.dataset.b; draw(); }));
    $("jT").onclick = (e) => { const c = e.target.closest(".chip"); if (!c) return; type = c.dataset.t; $("jT").querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c))); };
    bindPics("jP", pics);
    $("jSave").onclick = async () => { const d = $("jD").value.trim(); if (!d) { $("wD").classList.add("err"); return; }
      $("jSave").disabled = true;
      try { const paths = []; for (let i = 0; i < pics.length; i++) paths.push(await upload(vid, "maintenance", pics[i], i));
        await q(sb.from("maintenance_jobs").insert({ vehicle_id: vid, job_type: type, description: d, reported_on: today(), odometer: +$("jOdo").value.replace(/\D/g, "") || null, shop: $("jShop").value.trim() || null, vehicle_stopped: $("jStop").value === "1", claim: $("jClaim").value, reported_by: ME.employee?.id || null, photo_paths: paths }));
        s.hidden = true; toast("บันทึกแจ้งซ่อมแล้ว"); mTab = "M"; maint();
      } catch (e) { $("jErr").textContent = errMsg(e); $("jErr").hidden = false; $("jSave").disabled = false; } };
  }; draw();
}
function closeSheet(id) {
  const s = $("sheet"), pics = [];
  s.innerHTML = `<div class="in"><div class="sh"><b>ปิดงานซ่อม</b><button class="lnk" id="shX">ปิด</button></div>
   <div class="grid"><div class="fld"><label for="xD">วันที่ซ่อมเสร็จ</label><input id="xD" type="date" value="${today()}"></div>${isMgr() ? `<div class="fld"><label for="xC">ค่าใช้จ่าย (บาท)</label><input id="xC" inputmode="decimal" placeholder="0.00"></div>` : ""}
   <div class="fld full"><label for="xW">สิ่งที่ซ่อม / อะไหล่ที่เปลี่ยน</label><textarea id="xW"></textarea></div></div>${picsInput("xP")}
   ${isMgr() ? "" : `<p class="sm">ค่าใช้จ่ายให้ผู้จัดการบันทึก</p>`}<p class="err" id="xErr" hidden></p><button class="btn pri block" id="xSave">ยืนยันซ่อมเสร็จ</button></div>`;
  s.hidden = false; $("shX").onclick = () => (s.hidden = true); bindPics("xP", pics);
  $("xSave").onclick = async () => {
    const c = isMgr() ? parseFloat($("xC").value) : null;
    if (isMgr() && !(c >= 0)) { $("xErr").textContent = "กรุณาระบุค่าใช้จ่าย ใส่ 0 ถ้าไม่มีค่าใช้จ่าย"; $("xErr").hidden = false; return; }
    $("xSave").disabled = true;
    try { const job = await q(sb.from("maintenance_jobs").select("vehicle_id,photo_paths,started_on").eq("id", id).single());
      const paths = [...(job.photo_paths || [])]; for (let i = 0; i < pics.length; i++) paths.push(await upload(job.vehicle_id, "maintenance", pics[i], i));
      await q(sb.from("maintenance_jobs").update({ status: 2, done_on: $("xD").value || today(), started_on: job.started_on || today(), work_done: $("xW").value.trim() || null, photo_paths: paths }).eq("id", id));
      if (isMgr()) await q(sb.from("maintenance_costs").upsert({ job_id: id, cost: c }));
      s.hidden = true; toast("ปิดงานซ่อมแล้ว"); maint();
    } catch (e) { $("xErr").textContent = errMsg(e); $("xErr").hidden = false; $("xSave").disabled = false; }
  };
}
function accSheet() {
  const vs = myVehicles(); let vid = vs[0].id, kind = KINDS[0], sev = "minor"; const pics = [];
  const s = $("sheet");
  const draw = () => { s.innerHTML = `<div class="in"><div class="sh"><b>บันทึกอุบัติเหตุ</b><button class="lnk" id="shX">ปิด</button></div>${busPicker(vs, vid)}
    <div class="grid"><div class="fld"><label for="aD">วันที่</label><input id="aD" type="date" value="${today()}"></div><div class="fld"><label for="aT">เวลา</label><input id="aT" type="time" value="${nowHM()}"></div>
    <div class="fld full" id="wP"><label for="aP">สถานที่เกิดเหตุ</label><input id="aP" placeholder="เช่น หน้าสถานี รฟม."></div></div>
    <p class="lbl">ลักษณะเหตุ</p><div class="chips" id="aK">${KINDS.map((k) => `<button class="chip" aria-pressed="${k === kind}" data-k="${k}">${k}</button>`).join("")}</div>
    <p class="lbl">ความรุนแรง</p><div class="chips" id="aS"><button class="chip" aria-pressed="${sev === "minor"}" data-s="minor">เล็กน้อย</button><button class="chip" aria-pressed="${sev === "serious"}" data-s="serious">รุนแรง</button></div>
    <div class="grid"><div class="fld full" id="wDe"><label for="aDe">เหตุการณ์โดยสรุป</label><textarea id="aDe" placeholder="เกิดอะไรขึ้น ความเสียหายของรถ และสิ่งที่ทำหลังเกิดเหตุ"></textarea></div>
    <div class="fld"><label for="aCp">คู่กรณี</label><select id="aCp"><option value="0">ไม่มี</option><option value="1">มี</option></select></div><div class="fld"><label for="aCpP">ทะเบียนคู่กรณี</label><input id="aCpP"></div>
    <div class="fld"><label for="aIp">บาดเจ็บ ผู้โดยสาร</label><input id="aIp" inputmode="numeric" value="0"></div><div class="fld"><label for="aIo">บาดเจ็บ คนขับ/คู่กรณี</label><input id="aIo" inputmode="numeric" value="0"></div>
    <div class="fld"><label for="aF">ฝ่ายผิด</label><select id="aF">${Object.entries(FAULT).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div><div class="fld"><label for="aSt">รถหยุดวิ่ง</label><select id="aSt"><option value="0">ไม่หยุด</option><option value="1">หยุดวิ่ง</option></select></div>
    <div class="fld"><label for="aPo">แจ้งความ/บันทึกประจำวัน</label><input id="aPo"></div><div class="fld"><label for="aCl">เลขเคลมประกัน</label><input id="aCl"></div></div>
    ${picsInput("aPx")}<label class="sm" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="aJob" checked style="width:20px;height:20px">สร้างงานซ่อมในเมนูซ่อมบำรุงให้ด้วย</label>
    <p class="err" id="aErr" hidden></p><button class="btn danger block" id="aSave">บันทึกอุบัติเหตุ</button></div>`;
    s.hidden = false; $("shX").onclick = () => (s.hidden = true);
    s.querySelectorAll("[data-b]").forEach((b) => (b.onclick = () => { vid = b.dataset.b; draw(); }));
    $("aK").onclick = (e) => { const c = e.target.closest(".chip"); if (!c) return; kind = c.dataset.k; $("aK").querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c))); };
    $("aS").onclick = (e) => { const c = e.target.closest(".chip"); if (!c) return; sev = c.dataset.s; $("aS").querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c))); };
    bindPics("aPx", pics);
    $("aSave").onclick = async () => { const place = $("aP").value.trim(), desc = $("aDe").value.trim(); $("wP").classList.toggle("err", !place); $("wDe").classList.toggle("err", !desc); if (!place || !desc) return;
      $("aSave").disabled = true;
      try { const paths = []; for (let i = 0; i < pics.length; i++) paths.push(await upload(vid, "accident", pics[i], i));
        const rec = { vehicle_id: vid, occurred_at: `${$("aD").value}T${$("aT").value || "00:00"}:00+07:00`, place, driver_employee_id: ME.employee?.id || null, kind, severity: sev, description: desc, has_counterparty: $("aCp").value === "1", counterparty_plate: $("aCpP").value.trim() || null, injured_passengers: +$("aIp").value || 0, injured_others: +$("aIo").value || 0, fault: $("aF").value, vehicle_stopped: $("aSt").value === "1", police_ref: $("aPo").value.trim() || null, claim_no: $("aCl").value.trim() || null, photo_paths: paths };
        const ins = await q(sb.from("accidents").insert(rec).select("id").single());
        if ($("aJob").checked) await q(sb.from("maintenance_jobs").insert({ vehicle_id: vid, job_type: "อุบัติเหตุ", description: `ซ่อมจากอุบัติเหตุ ${bk($("aD").value)}: ${desc}`, reported_on: today(), vehicle_stopped: rec.vehicle_stopped, claim: rec.claim_no ? "yes" : "no", accident_id: ins.id, reported_by: ME.employee?.id || null }));
        s.hidden = true; toast("บันทึกอุบัติเหตุแล้ว"); mTab = "A"; maint();
      } catch (e) { $("aErr").textContent = errMsg(e); $("aErr").hidden = false; $("aSave").disabled = false; } };
  }; draw();
}

/* ================= VEHICLE ================= */
async function vehicle() {
  const vs = myVehicles();
  if (!vs.length) { main().innerHTML = `<div class="empty" style="margin-top:16px"><b>วันนี้ไม่มีรถที่ได้รับมอบหมาย</b>ข้อมูลรถแสดงเฉพาะคันที่คุณขับในวันนั้น</div>`; return; }
  const [pols, prem] = await Promise.all([role() === "CUSTOMER" ? Promise.resolve([]) : q(sb.from("insurance_policies").select("*")), isMgr() ? q(sb.from("insurance_premiums").select("*")) : Promise.resolve([])]);
  const left = (p) => Math.round((new Date(p.period_to) - Date.now()) / 864e5);
  const totalPrem = prem.reduce((s, p) => s + Number(p.total), 0);
  main().innerHTML = `${isMgr() ? `<section class="sum"><div class="tile"><small>รถทั้งหมด</small><b class="num">${VEH.length}</b><span>คัน</span></div><div class="tile"><small>ประกันหมดอายุ</small><b class="num">${pols[0] ? left(pols[0]) + " วัน" : "–"}</b><span>${pols[0] ? bk(pols[0].period_to) : ""}</span></div><div class="tile"><small>เบี้ยประกันรวม/ปี</small><b class="num">${fmt(totalPrem, 0)}</b><span>บาท</span></div></section>` : ""}
   <h2>${vs.length > 1 ? "รถโดยสาร" : "รถของคุณ"} <small>แตะเพื่อดูรายละเอียด</small></h2><div class="list">${vs.map((v) => { const ps = pols.filter((p) => p.vehicle_id === v.id), vol = ps.find((p) => p.kind === "voluntary"), ctp = ps.find((p) => p.kind === "ctp"), pr = (p) => p && prem.find((x) => x.policy_id === p.id);
     return `<details class="job" style="--c:${COLOR[v.code]}"><summary style="display:grid;grid-template-columns:86px 1fr;gap:12px"><img src="${busImg(v.code)}" alt="" style="width:86px;height:86px;border-radius:12px;object-fit:cover"><div class="b" style="display:flex;flex-direction:column;gap:3px;min-width:0"><div class="row1"><b>${v.code}</b><span class="plate num">${v.plate}</span></div><div class="sm">${ROUTE[v.route_code] || ""}</div><div class="sm" style="font-family:ui-monospace,monospace">${v.chassis || ""}</div></div></summary>
     <div class="jb"><dl class="kv"><dt>ยี่ห้อ/รุ่น</dt><dd>${esc(v.brand_model)}</dd>${v.model_label ? `<dt>รุ่นตามป้ายในรถ</dt><dd>${esc(v.model_label)}</dd>` : ""}<dt>ปีรถ</dt><dd>${v.model_year}</dd><dt>ที่นั่ง / กำลัง</dt><dd>${v.seats} ที่นั่ง · ${v.hp} HP</dd><dt>ความจุแบตเตอรี่</dt><dd class="wait">${v.battery_kwh ? v.battery_kwh + " kWh" : "รอข้อมูล"}</dd><dt>การใช้รถ</dt><dd>${esc(v.use_type)}</dd></dl>
     ${vol ? `<p class="lbl">ประกันภัยรถยนต์ไฟฟ้า (ภาคสมัครใจ)</p><dl class="kv"><dt>เลขกรมธรรม์</dt><dd>${vol.policy_no}</dd><dt>บริษัทประกัน</dt><dd>${esc(vol.insurer)}</dd><dt>ระยะเวลา</dt><dd>${bk(vol.period_from)} – ${bk(vol.period_to)}</dd><dt>เหลือ</dt><dd>${left(vol)} วัน</dd>${isMgr() ? `<dt>ทุนประกัน</dt><dd class="num">${fmt(vol.sum_insured)} บาท</dd><dt>เบี้ยรวม</dt><dd class="num">${pr(vol) ? fmt(pr(vol).total) : "–"} บาท</dd><dt>ผู้รับประโยชน์</dt><dd>${esc(vol.beneficiary)}</dd>` : ""}</dl>` : ""}
     ${ctp ? `<p class="lbl">พ.ร.บ.</p><dl class="kv"><dt>เลขกรมธรรม์</dt><dd>${ctp.policy_no}</dd><dt>ระยะเวลา</dt><dd>${bk(ctp.period_from)} – ${bk(ctp.period_to)}</dd>${isMgr() ? `<dt>เบี้ยรวม</dt><dd class="num">${pr(ctp) ? fmt(pr(ctp).total) : "–"} บาท</dd>` : ""}</dl>` : ""}</div></details>`; }).join("")}</div>`;
}

/* ================= REPORT (managers) ================= */
let rpMode = "week", rpStart = null, rpA = null, rpB = null; // reimbursement range: defaults to the last 7 days
const monday = (d) => { const x = dObj(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
async function report() {
  if (!rpA) { const t = dObj(today()); rpB = iso(t); t.setDate(t.getDate() - 6); rpA = iso(t); }
  if (!rpStart) { const t = dObj(today()); rpStart = new Date(t.getFullYear(), t.getMonth(), 1); }
  let a, b, label;
  if (rpMode === "week") { a = rpA; b = rpB; label = `${bk(a)} – ${bk(b)}`; }
  else { a = iso(new Date(rpStart.getFullYear(), rpStart.getMonth(), 1)); b = iso(new Date(rpStart.getFullYear(), rpStart.getMonth() + 1, 0)); label = `${MONTH[rpStart.getMonth()]} ${rpStart.getFullYear() + 543}`; }
  const R = (await q(sb.from("charging_records").select("*").gte("receipt_date", a).lte("receipt_date", b).order("receipt_date"))).map((r) => ({ ...r, bus: vById(r.vehicle_id)?.code || "ไม่ระบุ", amt: Number(r.total), kwh: Number(r.kwh) }));
  const sum = (l, f) => l.reduce((s, x) => s + f(x), 0), T = sum(R, (r) => r.amt), K = sum(R, (r) => r.kwh);
  const buses = ["STC-01", "STC-02", "STC-03", "STC-04", "ไม่ระบุ"].filter((x) => R.some((r) => r.bus === x));
  const days = [...new Set(R.map((r) => r.receipt_date))];
  const noRc = R.filter((r) => r.source === "app" && !r.receipt_path);
  main().innerHTML = `${noRc.length ? `<p class="notice" style="margin-bottom:10px">รอแนบใบเสร็จ <b>${noRc.length}</b> รายการ (ยอดเงินยังไม่รวมในรายงานจนกว่าจะแนบ) · แนบได้ที่เมนูบันทึกการชาร์จ</p>` : ""}<a class="btn block" href="#tripreport" style="margin-bottom:10px">รายงานรอบเดินรถประจำเดือน →</a><a class="btn block" href="#agent" style="margin-bottom:10px"><img class="tf-ic" src="assets/img/smartai-96.png?v=2" alt="">Manager Agent สรุปการบันทึกรายวัน →</a><div class="tabs2"><button id="rW" aria-selected="${rpMode === "week"}">ช่วงเบิกเงินสำรอง</button><button id="rM" aria-selected="${rpMode === "month"}">รายเดือน</button></div>
   ${rpMode === "week" ? `<div class="grid" style="margin-top:12px"><div class="fld"><label for="rA">ตั้งแต่วันที่</label><input type="date" id="rA" value="${rpA}"></div><div class="fld"><label for="rB">ถึงวันที่</label><input type="date" id="rB" value="${rpB}"></div></div><p class="sm" style="margin:6px 0 0">ช่วงเบิกเงินสำรอง ${label}</p>` : `<div class="wk"><button id="rPrev" aria-label="เดือนก่อน">‹</button><div>${label}<small>สรุปค่าไฟฟ้าประจำเดือน · 1 – ${new Date(rpStart.getFullYear(), rpStart.getMonth() + 1, 0).getDate()} ${MS[rpStart.getMonth()]}</small></div><button id="rNext" aria-label="เดือนถัดไป">›</button></div>`}
   ${R.length ? `<section class="hero"><small>ค่าไฟฟ้ารวม (รวม VAT)</small><div class="big num">${fmt(T)}<span>บาท</span></div><div class="kpis num"><div><b>${fmt(K, 2)}</b><span>kWh</span></div><div><b>${R.length}</b><span>ครั้งที่ชาร์จ</span></div><div><b>${K ? fmt(T / K) : "–"}</b><span>บาท/kWh</span></div></div></section>
   <h2>ค่าไฟฟ้ารายวันแยกรายคัน <small>บาท · แตะกราฟเพื่อดูยอด</small></h2><section class="card"><div class="legend" id="rcLeg"></div><div class="chart" id="rc"></div></section>
   <h2>แยกรายคัน</h2><section class="card">${buses.map((x) => { const l = R.filter((r) => r.bus === x), aa = sum(l, (r) => r.amt), mx = Math.max(...buses.map((y) => sum(R.filter((r) => r.bus === y), (r) => r.amt))); return `<button class="busrow" data-bus="${x}" style="--c:${SCOL[x]};width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);color:inherit;font:inherit;cursor:pointer"><div class="n"><i></i>${x} ›</div><div><div class="fill" style="width:${(aa / mx) * 100}%"></div><div class="v num"><span><b>${fmt(aa)}</b> บาท</span><span>${l.length} ครั้ง</span><span>${fmt(sum(l, (r) => r.kwh), 1)} kWh</span><span>${fmt(sum(l, (r) => r.kwh) / l.length, 1)} kWh/ครั้ง</span></div></div></button>`; }).join("")}<p class="sm" style="margin:6px 0 0">แตะชื่อรถเพื่อดูรายละเอียดการชาร์จและใบเสร็จ</p></section>
   ${R.some((r) => r.bus === "ไม่ระบุ") ? `<h2>ต้องตรวจสอบ</h2><p class="notice">ใบเสร็จไม่ระบุทะเบียน ${R.filter((r) => r.bus === "ไม่ระบุ").length} ใบ รวม ${fmt(sum(R.filter((r) => r.bus === "ไม่ระบุ"), (r) => r.amt))} บาท ยังแยกไม่ได้ว่าเป็นรถคันไหน</p>` : ""}
   <h2>รายการใบเสร็จ</h2><section class="card" style="overflow-x:auto"><table class="t"><thead><tr><th>วันที่</th><th>เลขที่ใบเสร็จ</th><th>รถ</th><th class="r">kWh</th><th class="r">บาท</th></tr></thead><tbody>${R.map((r) => `<tr data-rec="${r.id}" style="cursor:pointer"><td class="num">${bk(r.receipt_date)}</td><td class="num">${r.receipt_no || "–"}</td><td>${r.bus}</td><td class="r num">${fmt(r.kwh, 2)}</td><td class="r num">${fmt(r.amt)}</td></tr>`).join("")}<tr><td colspan="3"><b>รวม</b></td><td class="r num"><b>${fmt(K, 2)}</b></td><td class="r num"><b>${fmt(T)}</b></td></tr></tbody></table></section>
   <button class="btn block" id="rCopy" style="margin-top:12px">คัดลอกสรุปส่งเบิก</button>` : `<div class="empty" style="margin-top:12px"><b>ไม่มีบันทึกการชาร์จในช่วงนี้</b>เลือกช่วงวันที่อื่น หรือรอคนขับบันทึกการชาร์จ</div>`}`;
  $("rW").onclick = () => { rpMode = "week"; report(); };
  $("rM").onclick = () => { rpMode = "month"; report(); };
  if (rpMode === "week") { $("rA").onchange = (e) => { if (e.target.value) { rpA = e.target.value; if (rpB < rpA) rpB = rpA; report(); } }; $("rB").onchange = (e) => { if (e.target.value) { rpB = e.target.value; if (rpB < rpA) rpA = rpB; report(); } }; }
  else { $("rPrev").onclick = () => { rpStart.setMonth(rpStart.getMonth() - 1); report(); }; $("rNext").onclick = () => { rpStart.setMonth(rpStart.getMonth() + 1); report(); }; }
  if (!R.length) return;
  main().querySelectorAll("[data-bus]").forEach((b) => (b.onclick = () => chargeSheet(b.dataset.bus, R.filter((r) => r.bus === b.dataset.bus), label)));
  main().querySelectorAll("[data-rec]").forEach((tr) => (tr.onclick = () => { const r = R.find((x) => x.id === tr.dataset.rec); chargeSheet(r.bus, [r], bk(r.receipt_date)); }));
  $("rCopy").onclick = () => copyText(`สรุปค่าไฟฟ้า MRTA Shuttle Bus ${label}\n` + buses.map((x) => { const l = R.filter((r) => r.bus === x); return `${x}: ${l.length} ครั้ง ${fmt(sum(l, (r) => r.kwh), 1)} kWh ${fmt(sum(l, (r) => r.amt))} บาท`; }).join("\n") + `\nรวม ${R.length} ครั้ง ${fmt(K, 1)} kWh ${fmt(T)} บาท · แนบใบเสร็จ ${R.length} ใบ`);
  // line chart: one line per bus (all four always shown; "ไม่ระบุ" only when such receipts exist)
  const LB = ["STC-01", "STC-02", "STC-03", "STC-04"].concat(R.some((r) => r.bus === "ไม่ระบุ") ? ["ไม่ระบุ"] : []);
  const axis = []; for (let t = dObj(a), e = dObj(b); t <= e && axis.length < 62; t.setDate(t.getDate() + 1)) axis.push(iso(t));
  const W = 360, H = 240, ml = 44, mr = 14, mt = 16, mb = 30, pw = W - ml - mr, ph = H - mt - mb;
  const ser = LB.map((x) => ({ x, v: axis.map((d) => sum(R.filter((r) => r.bus === x && r.receipt_date === d), (r) => r.amt)) }));
  const vmax = Math.max(1, ...ser.flatMap((s) => s.v)), st = vmax > 1500 ? 500 : vmax > 600 ? 250 : vmax > 200 ? 100 : 50, ymax = Math.ceil((vmax * 1.12) / st) * st;
  const y = (v) => mt + ph - (v / ymax) * ph, X = (i) => ml + (axis.length === 1 ? pw / 2 : (i * pw) / (axis.length - 1));
  let g = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="ค่าไฟฟ้ารายวันแยกรายคัน">`;
  for (let v = 0; v <= ymax; v += st) g += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${ml - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v.toLocaleString("th-TH")}</text>`;
  const skip = Math.ceil(axis.length / 7);
  axis.forEach((d, i) => { if (i % skip === 0 || i === axis.length - 1) { const x = dObj(d); g += `<text x="${X(i)}" y="${H - 9}" text-anchor="middle" font-size="11" fill="var(--muted)">${axis.length <= 7 ? DOW[x.getDay()] + " " : ""}${x.getDate()}</text>`; } });
  g += `<line id="rcCur" x1="0" x2="0" y1="${mt}" y2="${mt + ph}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/>`;
  ser.forEach((s) => {
    const c = SCOL[s.x], dash = s.x === "ไม่ระบุ" ? ` stroke-dasharray="5 4"` : "";
    g += `<polyline points="${s.v.map((v, i) => `${X(i)},${y(v)}`).join(" ")}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"${dash}/>`;
    if (axis.length <= 15) s.v.forEach((v, i) => { if (v) g += `<circle cx="${X(i)}" cy="${y(v)}" r="3.6" fill="${c}" stroke="var(--card)" stroke-width="1.5"/>`; });
  });
  $("rc").innerHTML = g + `</svg><div class="tip" id="rcTip" hidden></div>`;
  $("rcLeg").innerHTML = ser.map((s) => `<span><i style="--c:${SCOL[s.x]}"></i>${s.x} <b class="num">${fmt(sum(s.v, (v) => v), 0)}</b></span>`).join("");
  const box = $("rc"), svg = box.querySelector("svg"), tip = $("rcTip"), cur = $("rcCur");
  const show = (ev) => {
    const r = svg.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(axis.length - 1, Math.round(axis.length === 1 ? 0 : ((px - ml) / pw) * (axis.length - 1))));
    cur.setAttribute("x1", X(i)); cur.setAttribute("x2", X(i)); cur.setAttribute("visibility", "visible");
    const tot = sum(ser, (s) => s.v[i]);
    tip.innerHTML = `<b>${bk(axis[i])}</b>` + ser.map((s) => `<div class="r"><span><i style="--c:${SCOL[s.x]}"></i>${s.x}</span><span class="num">${s.v[i] ? fmt(s.v[i]) : "–"}</span></div>`).join("") + `<div class="r" style="border-top:1px solid #c9d3ea;margin-top:3px;padding-top:3px"><b>รวม</b><b class="num">${fmt(tot)}</b></div>`;
    tip.hidden = false; const bx = box.getBoundingClientRect(), left = (X(i) / W) * bx.width;
    tip.style.left = Math.max(0, Math.min(bx.width - tip.offsetWidth, left - tip.offsetWidth / 2)) + "px"; tip.style.top = "0px";
  };
  svg.addEventListener("pointermove", show); svg.addEventListener("pointerdown", show);
  svg.addEventListener("pointerleave", () => { tip.hidden = true; cur.setAttribute("visibility", "hidden"); });
}

/* charging details per vehicle (managers/admin): every charge with times, battery, kWh, amount, driver and the receipt file */
async function chargeSheet(bus, list, label) {
  const s = $("sheet");
  const emps = await q(sb.from("employees").select("id,full_name")).catch(() => []);
  const nm = (id) => (emps.find((e) => e.id === id)?.full_name || "–");
  const sum = (f) => list.reduce((t, r) => t + f(r), 0);
  s.innerHTML = `<div class="in" style="max-height:86vh;overflow:auto"><div class="sh"><b>การชาร์จ ${esc(bus)} · ${esc(label)}</b><button class="lnk" id="shX">ปิด</button></div>
    <section class="sum" style="margin-top:0"><div class="tile"><small>ครั้ง</small><b class="num">${list.length}</b></div><div class="tile"><small>kWh</small><b class="num">${fmt(sum((r) => r.kwh), 1)}</b></div><div class="tile"><small>บาท</small><b class="num">${fmt(sum((r) => r.amt))}</b></div></section>
    <div class="list" style="margin-top:10px">${list.map((r) => `<div class="card"><div class="row1"><b>${bk(r.receipt_date)}${r.started_at ? ` · ${tHM(r.started_at)}–${tHM(r.ended_at)} น.` : ""}</b><span class="pill ok">${fmt(r.amt)} บาท</span></div>
      <p class="sm" style="margin:6px 0 0;line-height:1.7">แบต <b>${r.soc_before ?? "–"}% → ${r.soc_after ?? "–"}%</b> · ${fmt(r.kwh, 2)} kWh${r.subtotal ? ` · ก่อน VAT ${fmt(r.subtotal)} · VAT ${fmt(r.vat)}` : ""}<br>
      ใบเสร็จ <b class="num">${esc(r.receipt_no || "–")}</b>${r.ev_ref ? ` · อ้างอิง ${esc(r.ev_ref)}` : ""}<br>${esc(r.station || "")}${r.employee_id ? ` · บันทึกโดย ${esc(nm(r.employee_id))}` : ""}${r.source !== "app" ? " · นำเข้า" : ""}</p>
      ${r.receipt_path ? `<button class="btn block" data-rcp="${esc(r.receipt_path)}" style="margin-top:8px">${/\.pdf$/i.test(r.receipt_path) ? "📄 เปิดใบเสร็จ (PDF)" : "🧾 ดูรูปใบเสร็จ"}</button>` : `<p class="sm" style="margin:8px 0 0">ไม่มีไฟล์ใบเสร็จแนบ</p>`}${isMgr() ? `<button class="btn block" data-cedit="${r.id}" style="margin-top:8px">✏️ แก้ไข / ลบ</button>` : ""}</div>`).join("")}</div></div>`;
  s.hidden = false; $("shX").onclick = () => (s.hidden = true);
  s.querySelectorAll("[data-cedit]").forEach((b) => (b.onclick = () => chargeEdit(list.find((x) => x.id === b.dataset.cedit), () => route())));
  s.querySelectorAll("[data-rcp]").forEach((b) => (b.onclick = async () => {
    const path = b.dataset.rcp, win = /\.pdf$/i.test(path) ? window.open("", "_blank") : null; // open the tab inside the tap (popup blockers)
    const [u] = await signed([path]);
    if (!u) { if (win) win.close(); toast("เปิดไฟล์ไม่ได้ ลองใหม่อีกครั้ง"); return; }
    if (win) win.location.href = u; else { $("vImg").src = u; $("viewer").hidden = false; }
  }));
}

/* ================= ACCOUNT / PASSWORD ================= */
async function account() {
  main().innerHTML = `<section class="card" style="margin-top:16px"><dl class="kv"><dt>ชื่อผู้ใช้</dt><dd>${esc(PROFILE.username)}</dd><dt>ชื่อ</dt><dd>${esc(PROFILE.display_name)}</dd><dt>บทบาท</dt><dd>${ROLE_TH[PROFILE.role]}</dd>${ME.employee ? `<dt>ประเภท</dt><dd>${{ regular: "คนขับประจำ", relief: "คนขับแทน", spare: "คนขับสำรอง", manager: "ผู้จัดการ", technician: "ช่าง", admin: "ผู้ดูแลระบบ", customer: "ลูกค้า" }[ME.employee.kind]}</dd>` : ""}</dl></section>
   ${["DRIVER", "MAINTENANCE"].includes(PROFILE.role) ? `<p class="sm" style="margin-top:12px">ลืมรหัสผ่าน ติดต่อผู้ดูแลระบบ</p>` : `<a class="btn block" href="#password" style="margin-top:12px">เปลี่ยนรหัสผ่าน</a>`}<button class="btn danger block" id="out" style="margin-top:10px">ออกจากระบบ</button>
   <p class="sm" style="margin-top:16px">เพิ่มแอปลงหน้าจอมือถือ: iPhone กด แชร์ → เพิ่มไปยังหน้าจอโฮม · Android กด ⋮ → เพิ่มลงในหน้าจอหลัก</p>`;
  $("out").onclick = async () => { await sb.auth.signOut(); location.replace("index.html"); };
  if (window.myProfileCard) { const h = await window.myProfileCard().catch(() => ""); if (h && location.hash.startsWith("#account")) main().insertAdjacentHTML("beforeend", h); }
}
async function password() {
  const forced = PROFILE.must_change_password;
  main().innerHTML = `${forced ? `<p class="notice" style="margin-top:16px">เข้าสู่ระบบครั้งแรก กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งาน</p>` : ""}
   <div class="grid" style="margin-top:14px"><div class="fld full" id="w1"><label for="p1">รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label><input id="p1" type="password" autocomplete="new-password"></div><div class="fld full" id="w2"><label for="p2">ยืนยันรหัสผ่านใหม่</label><input id="p2" type="password" autocomplete="new-password"></div></div>
   <p class="err" id="pErr" hidden></p><button class="btn pri block" id="pSave" style="margin-top:12px">บันทึกรหัสผ่าน</button>${forced ? "" : `<a class="lnk" href="#account">ยกเลิก</a>`}`;
  $("pSave").onclick = async () => {
    const a = $("p1").value, b = $("p2").value, e = $("pErr");
    if (a.length < 8) { e.textContent = "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"; e.hidden = false; return; }
    if (a !== b) { e.textContent = "รหัสผ่านทั้งสองช่องไม่ตรงกัน"; e.hidden = false; return; }
    if (a === PROFILE.display_name || a.toLowerCase() === PROFILE.username.toLowerCase()) { e.textContent = "ห้ามใช้ชื่อหรือชื่อผู้ใช้เป็นรหัสผ่าน"; e.hidden = false; return; }
    $("pSave").disabled = true;
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) { e.textContent = errMsg(error); e.hidden = false; $("pSave").disabled = false; return; }
    await sb.rpc("password_changed"); PROFILE.must_change_password = false; toast("ตั้งรหัสผ่านใหม่แล้ว"); location.hash = "#home";
  };
}

boot();
