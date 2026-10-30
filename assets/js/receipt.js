/* อ่านใบเสร็จค่าชาร์จไฟฟ้า กฟน. (MEA Receipt/Tax Invoice) แล้วเติมช่องที่ยังว่างให้ — ทำงานในเครื่อง ไม่ส่งรูปออกไปที่อื่น
   รูป: Tesseract.js (ภาษาอังกฤษ/ตัวเลข · ข้อมูลภาษาอยู่ใน assets/ocr) ลองหมุน 0/270/90/180 องศา เพราะใบเสร็จสแกนมักแนวนอน
   PDF: อ่านตัวหนังสือในไฟล์ด้วย pdf.js · ถ้าเป็น PDF สแกน (ไม่มีตัวหนังสือ) จะแปลงหน้าแรกเป็นรูปแล้วอ่านแบบรูป
   กันตัวเลขผิด: ยอดเงินคำนวณจาก kWh × 7.0093 แล้วต้องพบยอดนั้นบนใบเสร็จจริงจึงเติมให้ · คนขับต้องตรวจก่อนบันทึกเสมอ */
(function () {
  const TJS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", PDFW = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const RATE = 7.0093;
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
  window.ocrFill = async function (blob, isPdf, vehicle, noteId) {
    const my = ++seq, note = () => document.getElementById(noteId);
    const say = (h, cls) => { const n = note(); if (n) { n.className = "ocrnote " + (cls || ""); n.innerHTML = h; n.hidden = false; } };
    say(`<span class="spin"></span>กำลังอ่านใบเสร็จ… (ครั้งแรกโหลดตัวอ่านประมาณ 5 MB)`);
    let o;
    try { o = await window.readReceipt(blob, isPdf, (m) => my === seq && say(`<span class="spin"></span>${m}`)); }
    catch (e) { if (my === seq) say(/load/.test(e.message) ? "อ่านใบเสร็จอัตโนมัติไม่ได้ (ต้องต่ออินเทอร์เน็ต) · กรอกเองได้ตามปกติ" : "อ่านใบเสร็จอัตโนมัติไม่สำเร็จ · กรอกเองได้ตามปกติ", "warn"); return; }
    if (my !== seq) return;
    const F = [["cNo", o.no, "เลขที่ใบเสร็จ"], ["cRef", o.ref, "เลขอ้างอิง"], ["cK", o.kwh != null ? o.kwh.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : null, "kWh"], ["cSub", o.sub?.toFixed(2), "ค่าไฟก่อน VAT"], ["cVat", o.vat?.toFixed(2), "VAT"], ["cTot", o.tot?.toFixed(2), "รวมทั้งสิ้น"]];
    const got = [], diff = [];
    F.forEach(([id, v, l]) => { const el = document.getElementById(id); if (!el || v == null) return;
      if (!el.value.trim()) { el.value = v; el.classList.add("ocr"); el.addEventListener("input", () => el.classList.remove("ocr"), { once: true }); got.push(l); }
      else if (parseFloat(el.value) !== parseFloat(v) && el.value.trim() !== v) diff.push(`${l}: ช่องนี้ ${esc(el.value)} · ใบเสร็จ ${esc(v)}`); });
    if (typeof chkCharge === "function") chkCharge();
    const miss = F.filter(([id, v]) => v == null && !document.getElementById(id)?.value.trim()).map(([, , l]) => l);
    let h = got.length ? `🔍 ระบบอ่านจากใบเสร็จแล้ว: <b>${got.join(", ")}</b> (ช่องสีฟ้า) · <b>ตรวจให้ตรงกับใบเสร็จก่อนบันทึก</b>` : "🔍 อ่านค่าจากใบเสร็จไม่ได้ · กรอกเอง";
    if (miss.length && got.length) h += `<br>ยังต้องกรอกเอง: ${miss.join(", ")}`;
    if (o.time) h += `<br>เวลาบนใบเสร็จ ${o.time} น.`;
    if (diff.length) h += `<br>⚠️ ไม่ตรงกับที่กรอกไว้ — ${diff.join(" · ")}`;
    let cls = got.length ? "ok" : "warn";
    if (vehicle && o.plate && vehicle.plate && o.plate !== String(vehicle.plate).replace(/\D/g, "")) {
      const ov = (typeof VEH !== "undefined" ? VEH : []).find((v) => String(v.plate).replace(/\D/g, "") === o.plate);
      h = `⛔ ใบเสร็จนี้เป็นของรถทะเบียน <b>${o.plate}</b>${ov ? ` (${ov.code})` : ""} ไม่ใช่ ${vehicle.code} (${esc(vehicle.plate)}) · ตรวจว่าแนบใบเสร็จถูกใบหรือไม่<br>` + h; cls = "bad";
    }
    say(h, cls);
  };
})();
