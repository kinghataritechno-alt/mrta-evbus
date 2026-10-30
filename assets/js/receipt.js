/* อ่านใบเสร็จค่าชาร์จไฟฟ้า กฟน. (MEA Receipt/Tax Invoice) แล้วเติมช่องที่ยังว่างให้ — ทำงานในเครื่อง ไม่ส่งรูปออกไปที่อื่น
   รูป: Tesseract.js (ภาษาอังกฤษ/ตัวเลข · ข้อมูลภาษาอยู่ใน assets/ocr) ลองหมุน 0/270/90/180 องศา เพราะใบเสร็จสแกนมักแนวนอน
   PDF: อ่านตัวหนังสือในไฟล์ด้วย pdf.js · ถ้าเป็น PDF สแกน (ไม่มีตัวหนังสือ) จะแปลงหน้าแรกเป็นรูปแล้วอ่านแบบรูป
   กันตัวเลขผิด: ยอดเงินคำนวณจาก kWh × 7.0093 แล้วต้องพบยอดนั้นบนใบเสร็จจริงจึงเติมให้ · คนขับต้องตรวจก่อนบันทึกเสมอ */
(function () {
  const TJS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", PDFW = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const RATE = 7.0093;
  const TMON = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const load = (src) => new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`) && (window.Tesseract || window.pdfjsLib)) return ok();
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("load")); document.head.appendChild(s); });
  let W = null;
  async function worker() {
    if (W) return W; await load(TJS);
    W = await Tesseract.createWorker("eng", 1, { langPath: new URL("assets/ocr", location.href).href, gzip: false });
    return W;
  }
  const r2 = (x) => Math.round(x * 100 + 1e-9) / 100;
  const dig = (x) => x.toFixed(2).replace(".", "");

  /* text → fields (only values the text supports) */
  function parse(raw) {
    const t = String(raw || "").replace(/[£€]/g, "E");
    const flat = t.replace(/(\d)[ ](?=\d)/g, "$1"), bare = flat.replace(/[.,]/g, "");
    const o = { score: 0 };
    const no = flat.match(/0069\d{8}/); if (no) { o.no = no[0]; o.score++; }
    const pr = t.match(/(\d{5})\s*[EF]\s?V\s?(\d{7,10})/i);
    if (pr) { o.plate = pr[1]; o.score++; if (pr[2].length === 8) o.ref = "EV" + pr[2]; }
    else { const p2 = t.match(/(?:ประจุ|ilsz|ประ)\D{0,6}(\d{5})/); if (p2) o.plate = p2[1]; }
    const k4 = (t.match(/\d{1,3}\.\d{4}/g) || []).map(Number).filter((x) => Math.abs(x - RATE) > 1e-6 && x > 0);
    if (k4.length) { o.kwh = k4[0]; o.score++; }
    if (o.kwh) {
      const sub = r2(o.kwh * RATE), vat = r2(sub * 0.07), tot = r2(sub + vat);
      // the computed amount must also be printed on the receipt (as 427.88 / 42788) before the money fields are filled
      if (bare.includes(dig(sub)) || bare.includes(dig(tot))) { o.sub = sub; o.vat = vat; o.tot = tot; o.score++; o.money = "kwh"; }
    }
    if (!o.sub) { // no kWh read: accept a printed before-VAT / VAT / total triple that adds up
      const am = [...new Set((t.match(/\d{1,3}(?:,\d{3})*\.\d{2}(?!\d)/g) || []).map((x) => +x.replace(/,/g, "")))];
      for (const a of am) { const v = r2(a * 0.07); if (am.includes(v) && am.includes(r2(a + v))) { o.sub = a; o.vat = v; o.tot = r2(a + v); o.score++; o.money = "triple"; break; } }
    }
    const tm = t.match(/\b([01]\d|2[0-3]):[0-5]\d:[0-5]\d\b/); if (tm) o.time = tm[0];
    // receipt date: full Thai date (PDF text) / dd/mm/25xx / day + Buddhist year only (photo OCR cannot read Thai month names)
    const pad = (n) => String(n).padStart(2, "0"), ok = (d, m) => d >= 1 && d <= 31 && m >= 1 && m <= 12;
    let dm = t.match(new RegExp(`(\\d{1,2})\\s*(${TMON.join("|")})\\s*(25\\d\\d)`));
    if (dm) { const mo = TMON.indexOf(dm[2]) + 1; if (ok(+dm[1], mo)) o.date = `${+dm[3] - 543}-${pad(mo)}-${pad(dm[1])}`; }
    if (!o.date && (dm = t.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](25\d\d)\b/)) && ok(+dm[1], +dm[2])) o.date = `${+dm[3] - 543}-${pad(dm[2])}-${pad(dm[1])}`;
    if (!o.date && (dm = t.match(/\b(\d{1,2})\s+[^\d\s]{2,14}\s+(25\d\d)\b/)) && +dm[1] >= 1 && +dm[1] <= 31) { o.day = +dm[1]; o.year = +dm[2] - 543; }
    return o;
  }
  window.parseReceipt = parse;

  async function canvasOf(src, deg) {
    const img = src instanceof HTMLCanvasElement ? src : await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(src); });
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, sc = Math.min(1, 2200 / Math.max(w, h));
    const c = document.createElement("canvas"), sw = deg % 180 ? h * sc : w * sc, sh = deg % 180 ? w * sc : h * sc;
    c.width = sw; c.height = sh; const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, sw, sh); x.translate(sw / 2, sh / 2); x.rotate((deg * Math.PI) / 180); x.drawImage(img, (-w * sc) / 2, (-h * sc) / 2, w * sc, h * sc);
    return c;
  }
  async function ocr(src, step) {
    const w = await worker(); let best = { score: -1 };
    for (const [i, deg] of [0, 270, 90, 180].entries()) {
      step && step(`กำลังอ่านใบเสร็จ… (มุม ${deg}°)`);
      const { data } = await w.recognize(await canvasOf(src, deg));
      const o = parse(data.text); if (o.score > best.score) best = o;
      if (best.score >= 4 || (best.score >= 3 && i >= 1)) break; // 4 = no. + plate + kWh + amount found
    }
    return best;
  }
  async function pdfText(file, step) {
    await load(PDFJS); pdfjsLib.GlobalWorkerOptions.workerSrc = PDFW;
    const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise, pg = await doc.getPage(1);
    const tc = await pg.getTextContent(), text = tc.items.map((i) => i.str).join(" ");
    const o = parse(text); if (o.score >= 2) return o;
    step && step("PDF เป็นภาพสแกน · กำลังอ่านจากภาพ…");
    const vp = pg.getViewport({ scale: 2 }), c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
    await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    return ocr(c, step);
  }
  window.readReceipt = (blob, isPdf, step) => (isPdf ? pdfText(blob, step) : ocr(blob, step));

  /* fill the charge form (ids cNo cRef cK cSub cVat cTot) — only empty fields; mismatches are reported, never overwritten */
  let seq = 0;
  window.ocrFill = async function (blob, isPdf, vehicle, noteId, root, ctx) {
    root = root || document; const byId = (id) => root.querySelector("#" + id);
    const my = ++seq, note = () => byId(noteId);
    const say = (h, cls) => { const n = note(); if (n) { n.className = "ocrnote " + (cls || ""); n.innerHTML = h; n.hidden = false; } };
    if (root && root.dataset) delete root.dataset.ocrWarn;
    say(`<span class="spin"></span>กำลังอ่านใบเสร็จ… (ครั้งแรกโหลดตัวอ่านประมาณ 5 MB)`);
    let o;
    try { o = await window.readReceipt(blob, isPdf, (m) => my === seq && say(`<span class="spin"></span>${m}`)); }
    catch (e) { if (my === seq) say(/load/.test(e.message) ? "อ่านใบเสร็จอัตโนมัติไม่ได้ (ต้องต่ออินเทอร์เน็ต) · กรอกเองได้ตามปกติ" : "อ่านใบเสร็จอัตโนมัติไม่สำเร็จ · กรอกเองได้ตามปกติ", "warn"); return; }
    if (my !== seq) return;
    const F = [["cNo", o.no, "เลขที่ใบเสร็จ"], ["cRef", o.ref, "เลขอ้างอิง"], ["cK", o.kwh != null ? o.kwh.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : null, "kWh"], ["cSub", o.sub?.toFixed(2), "ค่าไฟก่อน VAT"], ["cVat", o.vat?.toFixed(2), "VAT"], ["cTot", o.tot?.toFixed(2), "รวมทั้งสิ้น"]];
    const got = [], diff = [];
    F.forEach(([id, v, l]) => { const el = byId(id); if (!el || v == null) return;
      if (!el.value.trim()) { el.value = v; el.classList.add("ocr"); el.addEventListener("input", () => el.classList.remove("ocr"), { once: true }); got.push(l); }
      else if (parseFloat(el.value) !== parseFloat(v) && el.value.trim() !== v) diff.push(`${l}: ช่องนี้ ${esc(el.value)} · ใบเสร็จ ${esc(v)}`); });
    if (typeof chkCharge === "function") chkCharge(root === document ? undefined : root);
    const miss = F.filter(([id, v]) => v == null && !byId(id)?.value.trim()).map(([, , l]) => l);
    let h = got.length ? `🔍 ระบบอ่านจากใบเสร็จแล้ว: <b>${got.join(", ")}</b> (ช่องสีฟ้า) · <b>ตรวจให้ตรงกับใบเสร็จก่อนบันทึก</b>` : "🔍 อ่านค่าจากใบเสร็จไม่ได้ · กรอกเอง";
    if (miss.length && got.length) h += `<br>ยังต้องกรอกเอง: ${miss.join(", ")}`;
    const chk = window.receiptMatch ? window.receiptMatch(o, ctx) : null; // date / time of the receipt vs the charge
    if (chk) h += `<br>${chk.ok ? "✅" : "⚠️"} ${chk.msg}`; else if (o.time) h += `<br>เวลาบนใบเสร็จ ${o.time} น.`;
    if (diff.length) h += `<br>⚠️ ไม่ตรงกับที่กรอกไว้ — ${diff.join(" · ")}`;
    let cls = got.length ? "ok" : "warn"; let warn = chk && !chk.ok;
    if (warn) cls = "bad";
    if (vehicle && o.plate && vehicle.plate && o.plate !== String(vehicle.plate).replace(/\D/g, "")) {
      const ov = (typeof VEH !== "undefined" ? VEH : []).find((v) => String(v.plate).replace(/\D/g, "") === o.plate);
      warn = true;
      h = `⛔ ใบเสร็จนี้เป็นของรถทะเบียน <b>${o.plate}</b>${ov ? ` (${ov.code})` : ""} ไม่ใช่ ${vehicle.code} (${esc(vehicle.plate)}) · ตรวจว่าแนบใบเสร็จถูกใบหรือไม่<br>` + h; cls = "bad";
    }
    if (warn && root && root.dataset) root.dataset.ocrWarn = "1";
    say(h, cls);
  };
  /* receipt date/time vs charge: date = charge day (time inside start−30 min … end+90 min) · next day is accepted as the issue date */
  window.receiptMatch = function (o, ctx) {
    if (!ctx || !ctx.date || !(o.date || o.day)) return null;
    const d0 = ctx.date, d1 = (() => { const [y, m, d] = d0.split("-").map(Number), x = new Date(Date.UTC(y, m - 1, d + 1)); return x.toISOString().slice(0, 10); })();
    const same = (d) => (o.date ? o.date === d : +d.slice(8) === o.day && +d.slice(0, 4) === o.year);
    const th = (d) => (typeof bk === "function" ? bk(d) : d), hm = (x) => (x ? new Date(x).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }) : "–");
    const rd = o.date ? th(o.date) : `วันที่ ${o.day} ปี ${o.year + 543}`, cw = `ชาร์จ ${th(d0)} ${hm(ctx.start)}–${hm(ctx.end)} น.`;
    if (same(d0)) {
      if (o.time && ctx.start) {
        const t = new Date(`${d0}T${o.time}+07:00`).getTime(), a = new Date(ctx.start).getTime() - 30 * 6e4, b = new Date(ctx.end || ctx.start).getTime() + 90 * 6e4;
        if (t < a || t > b) return { ok: false, msg: `เวลาบนใบเสร็จ <b>${o.time.slice(0, 5)} น.</b> ไม่ตรงกับเวลาชาร์จ (${cw}) · ตรวจว่าแนบใบเสร็จถูกครั้งหรือไม่` };
        return { ok: true, msg: `วันที่และเวลาบนใบเสร็จตรงกับการชาร์จ (ใบเสร็จ ${rd} ${o.time.slice(0, 5)} น. · ${cw})` };
      }
      return { ok: true, msg: `วันที่บนใบเสร็จตรงกับวันที่ชาร์จ (${rd}) · อ่านเวลาไม่ได้ ตรวจเวลาเอง` };
    }
    if (same(d1)) return { ok: true, msg: `ใบเสร็จลงวันที่ถัดจากวันชาร์จ (${rd}) · ${cw} · ตรวจว่าเป็นการชาร์จครั้งเดียวกัน` };
    return { ok: false, msg: `วันที่บนใบเสร็จ <b>${rd}</b> ไม่ตรงกับวันที่ชาร์จ (${cw}) · ตรวจว่าแนบใบเสร็จถูกใบหรือไม่` };
  };
})();
