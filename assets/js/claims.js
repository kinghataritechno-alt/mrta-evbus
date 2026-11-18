/* การเบิก-จ่ายค่าชาร์จ (18 พ.ย. 2569) — driver reserve money, 3-day rounds from 17 พ.ย. 2569
   manager page #claims: close round → transfer back to drivers (slip optional) → claim pack PDF → submitted → company paid
   driver home: reserve card (received / spent per day / balance) — own data only (RLS)
   tables & functions: sql/MRTA_SQL_เบิกจ่ายค่าชาร์จ.sql */
(function () {
  const START = "2026-11-17";
  const addD = (d, n) => { const x = dObj(d); x.setDate(x.getDate() + n); return iso(x); };
  const earlier = (d) => { while (HOLIDAYS[d]) d = addD(d, -1); return d; }; // due on a public holiday → one day earlier
  const roundOf = (d) => Math.floor((dObj(d) - dObj(START)) / 864e5 / 3) + 1;
  const R3 = (n) => { const f = addD(START, 3 * (n - 1)), t = addD(f, 2), tr = earlier(addD(t, 1)), sub = earlier(addD(t, 2));
    return { n, f, t, transfer: tr, submit: sub, receive: addD(sub, 4) }; };
  const wday = (r) => (typeof vcDay === "function" ? vcDay(r) : r.receipt_date);
  const DOWS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
  const dd = (d) => `${DOWS[dObj(d).getDay()]} ${bk(d)}`;
  const baht = (n) => `${fmt(n)} บาท`;
  const missing = (e) => /reserve_|claim_|does not exist|schema cache|function/i.test(errMsg(e)) && !/[ก-๙]/.test(errMsg(e));
  const sgn = async (path) => { try { const { data } = await sb.storage.from("profiles").createSignedUrl(path, 3600); return data && data.signedUrl; } catch (e) { return null; } };

  /* ---------- driver: my reserve ---------- */
  async function myLedger(empId) {
    const acc = (await q(sb.from("reserve_accounts").select("*").eq("employee_id", empId)))[0];
    if (!acc || !acc.active) return null;
    const [ch, tr] = await Promise.all([
      q(sb.from("charging_records").select("id,vehicle_id,receipt_no,receipt_date,started_at,total,receipt_path,claim_round").eq("employee_id", empId).gte("receipt_date", addD(acc.start_date, -1)).order("receipt_date")),
      q(sb.from("reserve_transfers").select("*").eq("employee_id", empId).order("transferred_on")),
    ]);
    const C = ch.filter((r) => wday(r) >= acc.start_date);
    const rows = [{ d: acc.start_date, k: 0, t: "เงินสำรองตั้งต้น", inn: Number(acc.credit) }]
      .concat(C.map((r) => ({ d: wday(r), k: 1, t: `ชาร์จ ${vById(r.vehicle_id)?.code || ""}${r.receipt_no ? ` · ${r.receipt_no}` : ""}`, out: r.receipt_path && Number(r.total) > 0 ? Number(r.total) : null, wait: !(r.receipt_path && Number(r.total) > 0), r })))
      .concat(tr.map((x) => ({ d: x.transferred_on, k: 2, t: `ได้รับโอนคืน${x.round_no ? ` รอบที่ ${x.round_no}` : ""}`, inn: Number(x.amount), x })))
      .sort((a, b) => a.d.localeCompare(b.d) || a.k - b.k);
    let bal = 0; rows.forEach((x) => { bal += (x.inn || 0) - (x.out || 0); x.bal = bal; });
    const waitAmt = C.filter((r) => !r.receipt_path).length;
    const owed = C.filter((r) => r.receipt_path && Number(r.total) > 0).reduce((s, r) => s + Number(r.total), 0) - tr.reduce((s, x) => s + Number(x.amount), 0);
    return { acc, rows, bal, waitN: waitAmt, owed: Math.max(0, Math.round(owed * 100) / 100) };
  }
  window.reserveCard = async function () {
    if (!ME.employee?.id) return "";
    let L; try { L = await myLedger(ME.employee.id); } catch (e) { return ""; }
    if (!L) return "";
    const nxt = R3(roundOf(today()) >= 1 ? roundOf(today()) : 1);
    const low = L.bal < Number(L.acc.credit) * 0.2;
    const last = L.rows.slice(-6).reverse();
    return `<div class="card rv" id="rvCard"><div class="rv-h"><b>💵 เงินสำรองค่าชาร์จของฉัน</b><small>วงเงิน ${fmt(L.acc.credit, 0)} บาท</small></div>
      <div class="rv-k"><div><small>คงเหลือ</small><b class="${low ? "bad" : ""}">${fmt(L.bal)}</b></div><div><small>รอโอนคืน</small><b>${fmt(L.owed)}</b></div><div><small>โอนรอบถัดไป</small><b style="font-size:.95rem">${dd(nxt.transfer)}</b></div></div>
      ${L.waitN ? `<p class="notice" style="margin:8px 0 0">มี ${L.waitN} รายการยังไม่แนบใบเสร็จ · แนบก่อนวันโอนคืนเพื่อรับเงินรอบนี้</p>` : ""}
      ${low ? `<p class="err" style="margin:8px 0 0">เงินสำรองเหลือน้อย แจ้งผู้จัดการถ้าไม่พอชาร์จ</p>` : ""}
      <table class="t rv-t"><thead><tr><th>วันที่</th><th>รายการ</th><th class="r">รับ</th><th class="r">จ่าย</th><th class="r">คงเหลือ</th></tr></thead><tbody>${last.map((x) => `<tr><td class="num">${bk(x.d).replace(/ 25\d\d$/, "")}</td><td>${esc(x.t)}</td><td class="r">${x.inn ? fmt(x.inn) : ""}</td><td class="r">${x.out ? fmt(x.out) : x.wait ? `<span class="sm">รอใบเสร็จ</span>` : ""}</td><td class="r">${fmt(x.bal)}</td></tr>`).join("")}</tbody></table>
      <button class="btn block" id="rvAll" style="margin-top:8px">ดูทั้งหมด (${L.rows.length} รายการ)</button></div>`;
  };
  window.bindReserveCard = function () {
    const b = $("rvAll"); if (!b) return;
    b.onclick = async () => { const L = await myLedger(ME.employee.id); ledgerSheet(ME.employee.name || "", L); };
  };
  function ledgerSheet(name, L) {
    const s = $("sheet");
    s.innerHTML = `<div class="in"><div class="sh"><b>เงินสำรองค่าชาร์จ ${esc(name)}</b><button class="lnk" id="shX">ปิด</button></div>
      <p class="sm" style="margin:0">วงเงิน ${baht(L.acc.credit)} · คงเหลือ <b>${baht(L.bal)}</b> · รอโอนคืน ${baht(L.owed)}</p>
      <table class="t"><thead><tr><th>วันที่</th><th>รายการ</th><th class="r">รับ</th><th class="r">จ่าย</th><th class="r">คงเหลือ</th></tr></thead><tbody>${L.rows.map((x, i) => `<tr><td class="num">${bk(x.d)}</td><td>${esc(x.t)}${x.x && x.x.slip_path ? ` <button class="lnk" data-slip="${i}">สลิป</button>` : ""}</td><td class="r">${x.inn ? fmt(x.inn) : ""}</td><td class="r">${x.out ? fmt(x.out) : x.wait ? `<span class="sm">รอใบเสร็จ</span>` : ""}</td><td class="r">${fmt(x.bal)}</td></tr>`).join("")}</tbody></table></div>`;
    s.hidden = false; $("shX").onclick = () => (s.hidden = true);
    s.querySelectorAll("[data-slip]").forEach((b) => (b.onclick = async () => { const u = await sgn(L.rows[+b.dataset.slip].x.slip_path); if (u) window.open(u, "_blank"); else toast("เปิดสลิปไม่ได้"); }));
  }

  /* ---------- manager: การเบิก-จ่ายค่าชาร์จ ---------- */
  async function claimsPage() {
    if (!isMgr()) { location.hash = "#home"; return; }
    main().innerHTML = `<p class="sm" style="margin-top:12px"><span class="spin"></span> กำลังโหลด…</p>`;
    let acc, tr, rounds, ch, emps;
    try {
      [acc, tr, rounds, ch, emps] = await Promise.all([
        q(sb.from("reserve_accounts").select("*")), q(sb.from("reserve_transfers").select("*").order("transferred_on")),
        q(sb.from("claim_rounds").select("*").order("round_no")),
        typeof qAll === "function" ? qAll(() => sb.from("charging_records").select("*").gte("receipt_date", addD(START, -1))) : q(sb.from("charging_records").select("*").gte("receipt_date", addD(START, -1))),
        q(sb.from("employees").select("id,full_name")),
      ]);
    } catch (e) {
      main().innerHTML = `<div class="empty" style="margin-top:14px"><b>${missing(e) ? "เมนูนี้ยังไม่เปิดใช้" : "โหลดข้อมูลไม่สำเร็จ"}</b>${missing(e) ? "รอรัน SQL ไฟล์ MRTA_SQL_เบิกจ่ายค่าชาร์จ.sql" : esc(errMsg(e))}</div>`; return;
    }
    const nm = (id) => (emps.find((e) => e.id === id) || {}).full_name || "–";
    const C = ch.filter((r) => wday(r) >= START).map((r) => ({ ...r, wd: wday(r), amt: Number(r.total) || 0, ok: !!r.receipt_path && Number(r.total) > 0 }));
    const closed = rounds.map((r) => r.round_no), nOpen = (closed.length ? Math.max(...closed) : 0) + 1, cur = R3(nOpen), t = today();
    const due = cur.t < t, waitOpen = C.filter((r) => !r.claim_round && !r.ok && r.wd <= cur.t);
    const openOk = C.filter((r) => !r.claim_round && r.ok && r.wd <= cur.t);
    // per-driver balance
    const people = acc.filter((a) => a.active).map((a) => {
      const mine = C.filter((r) => r.employee_id === a.employee_id), got = tr.filter((x) => x.employee_id === a.employee_id).reduce((s, x) => s + Number(x.amount), 0);
      const spent = mine.filter((r) => r.ok).reduce((s, r) => s + r.amt, 0);
      return { a, name: nm(a.employee_id), bal: Number(a.credit) + got - spent, owed: Math.max(0, spent - got), wait: mine.filter((r) => !r.ok).length, n: mine.length };
    });
    const totTr = tr.reduce((s, x) => s + Number(x.amount), 0), totRc = rounds.reduce((s, r) => s + Number(r.received_amount || 0), 0), seed = acc.filter((a) => a.active).reduce((s, a) => s + Number(a.credit), 0);
    const step = (i, on, done, label, d, who) => `<div class="cl-s ${done ? "done" : on ? "on" : ""}"><i>${done ? "✓" : i}</i><div><b>${label}</b><small>${d}</small><small>${who}</small></div></div>`;
    const roundCard = (r) => {
      const n = r.round_no, P = R3(n), recs = C.filter((x) => x.claim_round === n), tot = recs.reduce((s, x) => s + x.amt, 0);
      const by = {}; recs.forEach((x) => { (by[x.employee_id] = by[x.employee_id] || { n: 0, amt: 0 }); by[x.employee_id].n++; by[x.employee_id].amt += x.amt; });
      const rows = Object.entries(by).map(([id, v]) => { const paid = tr.filter((x) => x.round_no === n && x.employee_id === id).reduce((s, x) => s + Number(x.amount), 0); return { id, ...v, paid, left: Math.round((v.amt - paid) * 100) / 100 }; });
      const allPaid = rows.every((x) => x.left <= 0.004), late = recs.filter((x) => x.wd < P.f).length;
      return `<div class="card cl-r" data-r="${n}"><div class="cl-rh"><b>รอบที่ ${n} · ค่าไฟ ${bk(P.f).replace(/ 25\d\d$/, "")}–${bk(P.t)}</b><span class="pill ${r.received_on ? "ok" : ""}">${r.received_on ? "เงินบริษัทเข้าแล้ว" : r.submitted_on ? "ยื่นเบิกแล้ว · รอเงินเข้า" : allPaid ? "โอนคืนครบ · รอยื่นเบิก" : "รอโอนคืนคนขับ"}</span></div>
        <p class="sm" style="margin:2px 0 8px">${recs.length} ใบเสร็จ · <b>${baht(tot)}</b>${late ? ` · ใบเสร็จแนบช้าจากรอบก่อน ${late} ใบ` : ""}</p>
        <table class="t"><thead><tr><th>คนขับ</th><th class="r">ใบ</th><th class="r">ยอดเบิก</th><th class="r">โอนแล้ว</th><th></th></tr></thead><tbody>${rows.map((x) => `<tr><td>${esc(nm(x.id))}</td><td class="r">${x.n}</td><td class="r">${fmt(x.amt)}</td><td class="r">${x.paid ? fmt(x.paid) : "–"}</td><td class="r">${x.left > 0.004 ? `<button class="btn sm pri" data-tr="${n}|${x.id}|${x.left}">โอนคืน ${fmt(x.left)}</button>` : `<span class="okc">✓ ครบ</span>`}</td></tr>`).join("")}</tbody></table>
        <div class="cl-act"><button class="btn" data-pdf="${n}">📄 ชุดเอกสารเบิก</button>
          ${r.submitted_on ? `<span class="sm">ยื่นเบิก ${bk(r.submitted_on)}</span>` : `<button class="btn" data-sub="${n}">ยื่นเบิกแล้ว (กำหนด ${dd(P.submit)})</button>`}
          ${r.received_on ? `<span class="sm">เงินเข้า ${bk(r.received_on)} · ${baht(r.received_amount)}</span>` : r.submitted_on ? `<button class="btn" data-rcv="${n}|${tot}">เงินบริษัทเข้าแล้ว (คาด ${dd(P.receive)})</button>` : ""}
          ${r.submitted_on || r.received_on ? `<button class="lnk" data-clr="${n}">แก้ไขวันที่</button>` : ""}</div></div>`;
    };
    const active = rounds.filter((r) => !r.received_on).reverse(), done = rounds.filter((r) => r.received_on).reverse();
    main().innerHTML = `<p class="sm" style="margin:12px 0 0">คนขับสำรองจ่ายค่าชาร์จ → ผู้จัดการโอนคืนตามยอดจริงทุก 3 วัน → ยื่นเบิกบริษัทวันถัดไป → เงินบริษัทเข้า +4 วัน · เริ่ม ${bk(START)}</p>
      <div class="card cl-cur"><div class="cl-rh"><b>รอบที่ ${cur.n} · ค่าไฟ ${bk(cur.f).replace(/ 25\d\d$/, "")}–${bk(cur.t)}</b><span class="pill ${due ? "warn" : ""}">${due ? "ครบรอบแล้ว · ปิดรอบได้" : `สะสมถึง ${dd(cur.t)}`}</span></div>
        <div class="cl-steps">${step(1, !due, due, "ชาร์จ · จ่ายเงินสำรอง", `ถึง ${dd(cur.t)}`, "คนขับ")}${step(2, !due, due && !waitOpen.length, "แนบใบเสร็จ กฟน.", waitOpen.length ? `ยังไม่แนบ ${waitOpen.length} รายการ` : "ครบแล้ว", "คนขับ")}${step(3, due, false, "โอนคืนคนขับ", dd(cur.transfer), "ผู้จัดการ")}${step(4, false, false, "ยื่นเบิกบริษัท", dd(cur.submit), "ผู้จัดการ")}${step(5, false, false, "เงินบริษัทเข้า", dd(cur.receive), "บัญชี")}</div>
        <p class="sm" style="margin:8px 0">พร้อมเบิกตอนนี้ ${openOk.length} ใบ · ${baht(openOk.reduce((s, r) => s + r.amt, 0))}${waitOpen.length ? ` · <span style="color:var(--warn)">รอใบเสร็จ: ${[...new Set(waitOpen.map((r) => nm(r.employee_id).split(" ")[0]))].join(", ")}</span>` : ""}</p>
        <button class="btn pri block" id="clClose" ${due ? "" : "disabled"}>${due ? `ปิดรอบที่ ${cur.n} และดูยอดโอนคืน` : `ปิดรอบได้ตั้งแต่ ${dd(addD(cur.t, 1))}`}</button></div>
      ${active.map(roundCard).join("")}
      <h2>เงินสำรองคนขับ</h2>
      <div class="cl-ppl">${people.map((p) => `<button class="card cl-p" data-led="${p.a.employee_id}"><b>${esc(p.name)}</b><small>วงเงิน ${fmt(p.a.credit, 0)}</small><span class="${p.bal < Number(p.a.credit) * 0.2 ? "bad" : ""}">คงเหลือ ${fmt(p.bal)}</span><small>รอโอนคืน ${fmt(p.owed)}${p.wait ? ` · รอใบเสร็จ ${p.wait}` : ""}</small></button>`).join("")}</div>
      <h2>เงินกลางของผู้จัดการ</h2>
      <div class="card"><table class="t"><tbody>
        <tr><td>เงินสำรองตั้งต้นที่ให้คนขับ</td><td class="r">${fmt(seed)}</td></tr>
        <tr><td>โอนคืนคนขับรวม</td><td class="r">${fmt(totTr)}</td></tr>
        <tr><td>เงินบริษัทเข้ารวม</td><td class="r">− ${fmt(totRc)}</td></tr>
        <tr><td><b>เงินกลางที่ใช้อยู่ตอนนี้</b></td><td class="r"><b>${fmt(seed + totTr - totRc)}</b></td></tr></tbody></table>
        <p class="sm" style="margin:6px 0 0">ควรเตรียมเงินกลางประมาณ 30,000 บาท (เงินสำรอง 16,000 + โอนคืนล่วงหน้า 2 รอบระหว่างรอเงินบริษัท)</p></div>
      ${done.length ? `<h2>รอบที่เสร็จแล้ว</h2><div class="card"><table class="t"><thead><tr><th>รอบ</th><th>ค่าไฟวันที่</th><th class="r">ยอดเบิก</th><th class="r">เงินเข้า</th><th></th></tr></thead><tbody>${done.map((r) => { const tot = C.filter((x) => x.claim_round === r.round_no).reduce((s, x) => s + x.amt, 0); return `<tr><td>${r.round_no}</td><td>${bk(r.period_from).replace(/ 25\d\d$/, "")}–${bk(r.period_to)}</td><td class="r">${fmt(tot)}</td><td class="r">${fmt(r.received_amount)} <small>${bk(r.received_on)}</small></td><td class="r"><button class="lnk" data-pdf="${r.round_no}">PDF</button></td></tr>`; }).join("")}</tbody></table></div>` : ""}`;

    const re = () => claimsPage();
    $("clClose").onclick = () => closeSheet(cur, re);
    main().querySelectorAll("[data-tr]").forEach((b) => (b.onclick = () => { const [n, id, left] = b.dataset.tr.split("|"); transferSheet(+n, id, nm(id), +left, re); }));
    main().querySelectorAll("[data-pdf]").forEach((b) => (b.onclick = () => { const n = +b.dataset.pdf, recs = C.filter((x) => x.claim_round === n).map((r) => ({ ...r, bus: vById(r.vehicle_id)?.code || "ไม่ระบุ", amt: Number(r.total), kwh: Number(r.kwh) }));
      if (!recs.length) return toast("รอบนี้ไม่มีรายการ"); const ds = recs.map((r) => r.receipt_date).sort(); voucherSheet(recs, ds[0], ds[ds.length - 1], `รอบที่ ${n}`); }));
    main().querySelectorAll("[data-sub]").forEach((b) => (b.onclick = () => markSheet(+b.dataset.sub, "sub", 0, re)));
    main().querySelectorAll("[data-rcv]").forEach((b) => (b.onclick = () => { const [n, tot] = b.dataset.rcv.split("|"); markSheet(+n, "rcv", +tot, re); }));
    main().querySelectorAll("[data-clr]").forEach((b) => (b.onclick = async () => { if (!confirmTap(b, "แตะอีกครั้งเพื่อล้างวันที่ยื่น/เงินเข้า")) return; try { await q(sb.rpc("claim_mark", { p_round: +b.dataset.clr, p_clear: true })); toast("ล้างวันที่แล้ว"); re(); } catch (e) { toast(errMsg(e)); } }));
    main().querySelectorAll("[data-led]").forEach((b) => (b.onclick = async () => { const L = await myLedger(b.dataset.led); if (L) ledgerSheet(nm(b.dataset.led), L); }));
  }
  const thaiDates = (root) => root.querySelectorAll(".thd").forEach((sm) => { const i = $(sm.dataset.for); if (i) i.addEventListener("change", () => (sm.textContent = i.value ? dd(i.value) : "")); });
  const confirmTap = (b, msg) => { if (b.dataset.armed) return true; b.dataset.armed = "1"; toast(msg); setTimeout(() => delete b.dataset.armed, 4000); return false; };

  async function closeSheet(P, after) {
    const s = $("sheet");
    s.innerHTML = `<div class="in"><div class="sh"><b>ปิดรอบที่ ${P.n}</b><button class="lnk" id="shX">ปิด</button></div><p class="sm"><span class="spin"></span> กำลังตรวจ…</p></div>`; s.hidden = false; $("shX").onclick = () => (s.hidden = true);
    let r; try { r = await q(sb.rpc("claim_close", { p_round: P.n, p_dry: true })); } catch (e) { s.querySelector(".in").innerHTML = `<div class="sh"><b>ปิดรอบไม่ได้</b><button class="lnk" id="shX">ปิด</button></div><p class="err">${esc(missing(e) ? "รอรัน SQL ไฟล์ MRTA_SQL_เบิกจ่ายค่าชาร์จ.sql" : errMsg(e))}</p>`; $("shX").onclick = () => (s.hidden = true); return; }
    s.querySelector(".in").innerHTML = `<div class="sh"><b>ปิดรอบที่ ${P.n} · ค่าไฟ ${bk(P.f).replace(/ 25\d\d$/, "")}–${bk(P.t)}</b><button class="lnk" id="shX">ปิด</button></div>
      <p style="margin:0">ใบเสร็จที่แนบแล้ว <b>${r.count} ใบ · ${baht(r.total)}</b>${r.late ? ` (รวมใบที่แนบช้าจากรอบก่อน ${r.late} ใบ)` : ""}</p>
      <table class="t"><thead><tr><th>คนขับ</th><th class="r">ใบ</th><th class="r">ยอดโอนคืน</th></tr></thead><tbody>${(r.people || []).map((p) => `<tr><td>${esc(p.name)}</td><td class="r">${p.count}</td><td class="r">${fmt(p.total)}</td></tr>`).join("")}</tbody></table>
      ${(r.waiting || []).length ? `<p class="notice">ยังไม่แนบใบเสร็จ ${r.waiting.length} รายการ จะยกไปรอบถัดไป: ${r.waiting.map((w) => `${esc(w.name.split(" ")[0])} ${w.bus || ""} ${bk(w.date).replace(/ 25\d\d$/, "")}`).join(" · ")}</p>` : ""}
      <p class="sm">ปิดรอบแล้ว รายการเหล่านี้จะผูกกับรอบที่ ${P.n} เบิกซ้ำไม่ได้ และคนขับแก้ไขไม่ได้</p>
      <p class="err" id="clE" hidden></p><button class="btn pri block" id="clGo" ${r.count ? "" : "disabled"}>ยืนยันปิดรอบที่ ${P.n}</button><button class="btn block" id="clCx">ยกเลิก</button>`;
    $("shX").onclick = $("clCx").onclick = () => (s.hidden = true);
    $("clGo").onclick = async () => { const b = $("clGo"); b.disabled = true; b.innerHTML = `<span class="spin"></span>กำลังปิดรอบ…`;
      try { await q(sb.rpc("claim_close", { p_round: P.n, p_dry: false })); s.hidden = true; toast(`ปิดรอบที่ ${P.n} แล้ว · โอนคืนคนขับได้เลย`); after(); }
      catch (e) { b.disabled = false; b.textContent = `ยืนยันปิดรอบที่ ${P.n}`; $("clE").textContent = errMsg(e); $("clE").hidden = false; } };
  }

  function transferSheet(n, empId, name, left, after) {
    const s = $("sheet");
    s.innerHTML = `<div class="in"><div class="sh"><b>โอนคืน ${esc(name)} · รอบที่ ${n}</b><button class="lnk" id="shX">ปิด</button></div>
      <div class="grid"><div class="fld"><label for="tA">ยอดโอน (บาท)</label><input id="tA" inputmode="decimal" value="${left.toFixed(2)}"></div><div class="fld"><label for="tD">วันที่โอน</label><input id="tD" type="date" max="${today()}" value="${today()}"><small class="sm thd" data-for="tD">${dd(today())}</small></div></div>
      <div class="fld"><label>สลิปโอนเงิน (ไม่บังคับ)</label><label class="btn block" for="tS" style="margin:0">📎 <span id="tSn">แนบรูปสลิป</span></label><input id="tS" type="file" accept="image/*" hidden></div>
      <div class="fld"><label for="tN">หมายเหตุ</label><input id="tN" placeholder="เช่น โอนผ่าน K PLUS"></div>
      <p class="err" id="tE" hidden></p><button class="btn pri block" id="tGo">บันทึกโอนคืน</button></div>`;
    s.hidden = false; $("shX").onclick = () => (s.hidden = true);
    thaiDates(s);
    $("tS").onchange = () => { const f = $("tS").files[0]; $("tSn").textContent = f ? `แนบแล้ว: ${f.name}` : "แนบรูปสลิป"; };
    $("tGo").onclick = async () => { const b = $("tGo"), err = $("tE"), amt = parseFloat(String($("tA").value).replace(/,/g, ""));
      if (!(amt > 0)) { err.textContent = "ใส่ยอดโอน"; err.hidden = false; return; }
      b.disabled = true; b.innerHTML = `<span class="spin"></span>กำลังบันทึก…`;
      try { let path = null; const f = $("tS").files[0];
        if (f) { const blob = await shrink(f, 1600, 0.8); if (!blob) throw new Error("เปิดรูปสลิปไม่ได้"); path = `${empId}/slip/${Date.now()}.jpg`;
          const { error } = await sb.storage.from("profiles").upload(path, blob, { contentType: "image/jpeg" }); if (error) throw error; }
        await q(sb.rpc("claim_transfer", { p_round: n, p_employee: empId, p_amount: amt, p_date: $("tD").value || today(), p_slip: path, p_note: $("tN").value.trim() || null }));
        s.hidden = true; toast(`บันทึกโอนคืน ${name.split(" ")[0]} ${fmt(amt)} บาทแล้ว`); after(); }
      catch (e) { b.disabled = false; b.textContent = "บันทึกโอนคืน"; err.textContent = errMsg(e); err.hidden = false; } };
  }

  function markSheet(n, kind, tot, after) {
    const s = $("sheet"), rcv = kind === "rcv";
    s.innerHTML = `<div class="in"><div class="sh"><b>${rcv ? "เงินบริษัทเข้า" : "ยื่นเบิกบริษัท"} · รอบที่ ${n}</b><button class="lnk" id="shX">ปิด</button></div>
      <div class="grid"><div class="fld"><label for="mD">${rcv ? "วันที่เงินเข้า" : "วันที่ยื่นเบิก"}</label><input id="mD" type="date" max="${today()}" value="${today()}"><small class="sm thd" data-for="mD">${dd(today())}</small></div>
      ${rcv ? `<div class="fld"><label for="mA">ยอดที่ได้รับ (บาท)</label><input id="mA" inputmode="decimal" value="${tot.toFixed(2)}"></div>` : ""}</div>
      <p class="err" id="mE" hidden></p><button class="btn pri block" id="mGo">บันทึก</button></div>`;
    s.hidden = false; $("shX").onclick = () => (s.hidden = true); thaiDates(s);
    $("mGo").onclick = async () => { const b = $("mGo"); b.disabled = true;
      try { await q(sb.rpc("claim_mark", rcv ? { p_round: n, p_received: $("mD").value, p_amount: parseFloat(String($("mA").value).replace(/,/g, "")) || tot } : { p_round: n, p_submitted: $("mD").value }));
        s.hidden = true; toast("บันทึกแล้ว"); after(); }
      catch (e) { b.disabled = false; $("mE").textContent = errMsg(e); $("mE").hidden = false; } };
  }
  window.claimsPage = claimsPage;
})();
