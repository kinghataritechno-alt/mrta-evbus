/* Manager Agent — ตรวจว่าคนขับ / คนขับสำรอง / ช่างซ่อม บันทึกข้อมูลตามขั้นตอนครบหรือไม่
   ตัวตรวจอยู่ในฐานข้อมูล (public.run_compliance) ทำงานเองเวลา 08:00 12:00 16:00 20:45 และ 07:00 (ทบทวนเมื่อวาน)
   หน้านี้: แถบแจ้งเตือนของพนักงาน (alertsCard) + หน้าสรุปของผู้จัดการ (agentPage) */
(function () {
  const KIND = {
    clock_in: ["ลงเวลาเข้างาน", "#home"], clock_out: ["ลงเวลาออกงาน", "#home"],
    inspection: ["ตรวจสภาพรถ", "#inspect"], inspection_late: ["ตรวจรถช้า", "#inspect"],
    trips: ["รายงานรอบเดินรถ", "#trip"], pax: ["บันทึกผู้โดยสาร", "#trip"],
    receipt: ["ใบเสร็จชาร์จไฟ", "#charge"], defect_job: ["แจ้งซ่อม", "#maint"], job_stale: ["งานซ่อมค้าง", "#maint"],
  };
  const SEV = { high: ["สำคัญ", "bad", 20], medium: ["ควรแก้", "warn", 10], low: ["แนะนำ", "", 5] };
  const SEV_ORDER = { high: 0, medium: 1, low: 2 };
  const missing = (e) => /compliance_alerts|run_compliance|PGRST20[25]|42P01|42883|schema cache/i.test((e && (e.message || e.code)) || "") ;
  const SETUP = `<p class="notice">ยังไม่ได้ติดตั้งตัวตรวจในฐานข้อมูล · ให้ผู้ดูแลรันไฟล์ <b>MRTA_SQL_Manager_Agent.sql</b> ใน Supabase SQL Editor ก่อน</p>`;
  const vcodeOf = (id) => (vById(id) || {}).code || "";
  const sortA = (a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.kind.localeCompare(b.kind);

  /* ---------- พนักงาน: แถบแจ้งเตือนในหน้าหลัก ---------- */
  window.alertsCard = async function (opt) {
    const emp = ME && ME.employee && ME.employee.id;
    if (!emp) return "";
    const since = iso(new Date(dObj(today()).getTime() - 2 * 864e5));
    const { data: all, error } = await sb.from("compliance_alerts").select("*").eq("employee_id", emp).is("resolved_at", null).gte("work_date", since).order("work_date", { ascending: false });
    const data = (all || []).filter((a) => !(opt && opt.exclude && a.work_date === opt.exclude)); // that day is shown in the score card
    if (error || !data.length) return "";
    const open = data.filter((a) => !a.ack_at).length;
    return `<section class="card agentcard" style="margin-top:12px;border-color:${open ? "#ff8a8a" : "#ffd166"}">
      <div class="row1"><b><img class="tf-ic" src="assets/img/smartai-96.png?v=2" alt="">Manager Agent แจ้งเตือน</b><span class="pill ${open ? "bad" : "warn"}">${data.length} เรื่อง</span></div>
      <p class="sm" style="margin:4px 0 8px">ข้อมูลที่ยังบันทึกไม่ครบตามขั้นตอน · กดที่หัวข้อเพื่อไปบันทึก แล้วกด "รับทราบ" · ระบบตรวจซ้ำทุกรอบและจะลบออกเองเมื่อบันทึกครบ</p>
      <div class="list">${data.sort(sortA).map((a) => {
        const k = KIND[a.kind] || [a.kind, "#home"], s = SEV[a.severity] || SEV.low;
        return `<div class="alrow"><a href="${a.work_date === today() ? k[1] : "#home"}"><span class="pill ${s[1]}">${s[0]}</span> <b>${esc(k[0])}</b>${a.vehicle_id ? ` · ${vcodeOf(a.vehicle_id)}` : ""}${a.work_date !== today() ? ` · ${bk(a.work_date)}` : ""}<br><span class="sm">${esc(a.detail)}</span></a>
          ${a.ack_at ? `<span class="sm">✔ รับทราบ ${tHM(a.ack_at)}</span>` : `<button class="btn" data-ack="${a.id}">รับทราบ</button>`}</div>`;
      }).join("")}</div>
      ${data.some((a) => a.work_date !== today()) ? `<p class="sm" style="margin:8px 0 0">เรื่องของวันก่อนหน้าแก้ย้อนหลังเองไม่ได้ แจ้งผู้จัดการเพื่อแก้ไขข้อมูล</p>` : ""}</section>`;
  };
  /* ---------- พนักงาน: ผลคะแนนของวันทำงานล่าสุด (ก่อนวันนี้) ----------
     100 คะแนน = คำชมเชยจากผู้บริหาร · ต่ำกว่า 100 = คำเตือนตามที่ Manager Agent ตรวจพบ
     คะแนนคิดแบบเดียวกับหน้าผู้จัดการ: 100 − (สำคัญ 20 / ควรแก้ 10 / แนะนำ 5) ของเรื่องที่ยังไม่แก้ */
  const PRAISE = "ผมขอขอบคุณในความตั้งใจทำหน้าที่ในวันที่ผ่านมาโดยสมบูรณ์ และขอให้ทำตัวเป็นแบบอย่างเช่นนี้ตลอดไป";
  const AGENT_START = "2026-10-26"; // first day the checker ran
  window.lastWorkScore = async function () {
    const emp = ME && ME.employee && ME.employee.id; if (!emp) return null;
    const t = today();
    const [ws, cc] = await Promise.all([
      sb.from("work_schedules").select("work_date").eq("employee_id", emp).eq("status", "work").lt("work_date", t).gte("work_date", AGENT_START).order("work_date", { ascending: false }).limit(10),
      sb.from("cover_claims").select("work_date,kind,relief_employee_id,absent_employee_id,status").or(`relief_employee_id.eq.${emp},absent_employee_id.eq.${emp}`).lt("work_date", t).gte("work_date", AGENT_START).in("status", ["pending", "approved"]),
    ]);
    if (ws.error || cc.error) return null;
    const cl = cc.data || [];
    const coveredAway = (d) => cl.some((c) => c.work_date === d && c.absent_employee_id === emp && (c.kind || "cover") === "cover");
    const days = [...new Set([...(ws.data || []).map((r) => r.work_date).filter((d) => !coveredAway(d)), ...cl.filter((c) => c.relief_employee_id === emp).map((c) => c.work_date)])].filter(Boolean).sort().reverse();
    const d = days[0]; if (!d) return null;
    const { data, error } = await sb.from("compliance_alerts").select("*").eq("employee_id", emp).eq("work_date", d).is("resolved_at", null);
    if (error) return null;
    const list = (data || []).sort(sortA);
    return { date: d, list, score: Math.max(0, 100 - list.reduce((s, a) => s + (SEV[a.severity] || SEV.low)[2], 0)) };
  };
  window.dayScoreCard = async function (r) {
    r = r === undefined ? await window.lastWorkScore() : r; if (!r) return "";
    const when = `วัน${DOWL[dObj(r.date).getDay()]}ที่ ${bk(r.date)}`;
    if (r.score === 100) return `<section class="card praise">
      <div class="row1"><b><span class="praise-ic" aria-hidden="true">🏆</span>คำชมเชยจากผู้บริหาร</b><span class="pill ok num">100 คะแนน</span></div>
      <p class="sm" style="margin:2px 0 0">ผลตรวจของ Manager Agent ${when} · บันทึกครบทุกขั้นตอน</p>
      <blockquote>“${PRAISE}”</blockquote>
      <p class="sm praise-by">— ผู้บริหาร SMART TERMINAL</p></section>`;
    return `<section class="card warnc">
      <div class="row1"><b><img class="tf-ic" src="assets/img/smartai-96.png?v=2" alt="">ผลตรวจการปฏิบัติงาน</b><span class="pill ${r.score >= 70 ? "warn" : "bad"} num">${r.score} คะแนน</span></div>
      <p class="sm" style="margin:4px 0 8px">Manager Agent ตรวจพบว่า${when} ยังทำไม่ครบตามขั้นตอน <b>${r.list.length} เรื่อง</b> · ขอให้ทำให้ครบในวันนี้ เพื่อให้ได้ 100 คะแนน</p>
      <div class="list">${r.list.map((a) => { const k = KIND[a.kind] || [a.kind, "#home"], s = SEV[a.severity] || SEV.low;
        return `<div class="alrow"><span><span class="pill ${s[1]}">${s[0]}</span> <b>${esc(k[0])}</b>${a.vehicle_id ? ` · ${vcodeOf(a.vehicle_id)}` : ""}<br><span class="sm">${esc(a.detail)}</span></span>
          ${a.ack_at ? `<span class="sm">✔ รับทราบ ${tHM(a.ack_at)}</span>` : `<button class="btn" data-ack="${a.id}">รับทราบ</button>`}</div>`; }).join("")}</div>
      <p class="sm" style="margin:8px 0 0">เรื่องของวันก่อนหน้าแก้ย้อนหลังเองไม่ได้ หากบันทึกไว้แล้วแต่ระบบยังเตือน ให้แจ้งผู้จัดการ</p></section>`;
  };

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-ack]"); if (!b) return;
    b.disabled = true;
    const { error } = await sb.from("compliance_alerts").update({ ack_at: new Date().toISOString() }).eq("id", b.dataset.ack);
    if (error) { b.disabled = false; toast(errMsg(error)); return; }
    b.outerHTML = `<span class="sm">✔ รับทราบ ${nowHM()}</span>`;
  });

  /* ---------- ผู้จัดการ: สรุปรายวัน ---------- */
  let AD = null; // selected date
  window.agentPage = async function () {
    if (!isMgr()) { location.hash = "#home"; return; }
    AD = AD || today();
    const d = AD;
    const [res, ws, emps, claims] = await Promise.all([
      sb.from("compliance_alerts").select("*").eq("work_date", d),
      q(sb.from("work_schedules").select("employee_id,vehicle_id,status,queue_code").eq("work_date", d)),
      q(sb.from("employees").select("id,full_name,nickname,kind,active")),
      q(sb.from("cover_claims").select("vehicle_id,relief_employee_id,absent_employee_id,status").eq("work_date", d).in("status", ["pending", "approved"])),
    ]);
    let h = `<div class="fld"><label for="agD">วันที่ตรวจ</label><input type="date" id="agD" value="${d}" max="${today()}"></div>`;
    if (res.error) { main().innerHTML = h + (missing(res.error) ? SETUP : `<p class="err">${esc(errMsg(res.error))}</p>`); bindAgent(); return; }
    const alerts = res.data || [], openA = alerts.filter((a) => !a.resolved_at);
    const nm = (id) => { const e = emps.find((x) => x.id === id); return e ? e.full_name : "–"; };
    // ผู้รับผิดชอบของวัน: คนขับตามตาราง (ถูกแทนด้วยผู้รับรถแทน) + ช่างซ่อม
    const people = new Map();
    const add = (id, veh, role) => { if (!id) return; const p = people.get(id) || { id, veh: new Set(), role }; if (veh) p.veh.add(veh); people.set(id, p); };
    ws.filter((w) => w.status === "work" && w.vehicle_id && !claims.some((c) => c.vehicle_id === w.vehicle_id)).forEach((w) => add(w.employee_id, w.vehicle_id, "คนขับ"));
    claims.forEach((c) => add(c.relief_employee_id, c.vehicle_id, "ขับแทน"));
    emps.filter((e) => e.kind === "technician" && e.active !== false).forEach((e) => add(e.id, null, "ช่างซ่อม"));
    openA.forEach((a) => add(a.employee_id, a.vehicle_id, (emps.find((x) => x.id === a.employee_id) || {}).kind === "technician" ? "ช่างซ่อม" : "คนขับ"));
    const rows = [...people.values()].map((p) => {
      const mine = openA.filter((a) => a.employee_id === p.id).sort(sortA);
      const score = Math.max(0, 100 - mine.reduce((s, a) => s + (SEV[a.severity] || SEV.low)[2], 0));
      return { ...p, name: nm(p.id), mine, score, fixed: alerts.filter((a) => a.employee_id === p.id && a.resolved_at).length, acked: mine.filter((a) => a.ack_at).length };
    }).sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, "th"));
    const last = alerts.reduce((m, a) => (a.updated_at > m ? a.updated_at : m), "");
    const bad = rows.filter((r) => r.mine.length).length;
    h += `<section class="sum"><div class="tile ${bad ? "alert" : ""}"><small>มีเรื่องค้าง</small><b class="num">${bad}</b><span>คน</span></div>
      <div class="tile"><small>บันทึกครบ</small><b class="num">${rows.length - bad}</b><span>คน</span></div>
      <div class="tile ${openA.some((a) => a.severity === "high") ? "alert" : ""}"><small>เรื่องสำคัญ</small><b class="num">${openA.filter((a) => a.severity === "high").length}</b><span>เรื่อง</span></div></section>
      <p class="sm" style="margin:8px 0">${last ? `ตรวจล่าสุด ${bk(bkD(last))} ${tHM(last)} น.` : "ยังไม่ได้ตรวจวันนี้"} · ระบบตรวจเองเวลา 08:00 · 12:00 · 16:00 · 20:45 น. และทบทวนเมื่อวานตอน 07:00 น.</p>
      <div class="acts"><button class="btn pri" id="agRun">🔎 ตรวจตอนนี้</button>${rows.length ? `<button class="btn" id="agCopy">📋 คัดลอกสรุป</button><a class="btn" id="agLine" target="_blank" rel="noopener">📤 ส่ง LINE</a>` : ""}</div>`;
    h += await problemDash(d, alerts);
    h += rows.length ? `<h2>รายบุคคล <small>${bk(d)}</small></h2><div class="list">${rows.map((r) => `<article class="card">
        <div class="row1"><b>${esc(r.name)}</b><span class="sm">${r.role}${r.veh.size ? " · " + [...r.veh].map(vcodeOf).join(", ") : ""}</span><span class="pill ${r.score >= 90 ? "ok" : r.score >= 70 ? "warn" : "bad"} num">${r.score}</span></div>
        ${r.mine.length ? `<ul class="sm" style="margin:6px 0 0;padding-left:18px;display:grid;gap:4px">${r.mine.map((a) => `<li><span class="pill ${(SEV[a.severity] || SEV.low)[1]}">${(SEV[a.severity] || SEV.low)[0]}</span> <b>${esc((KIND[a.kind] || [a.kind])[0])}</b>${a.vehicle_id && r.veh.size > 1 ? ` (${vcodeOf(a.vehicle_id)})` : ""} — ${esc(a.detail)}${a.ack_at ? ` <em class="sub2">รับทราบ ${tHM(a.ack_at)}</em>` : ` <em class="sub2">ยังไม่รับทราบ</em>`}</li>`).join("")}</ul>` : `<p class="sm" style="margin:6px 0 0">✅ บันทึกครบตามขั้นตอน</p>`}
        ${r.fixed ? `<p class="sm" style="margin:6px 0 0">แก้ไขแล้ว ${r.fixed} เรื่อง</p>` : ""}</article>`).join("")}</div>`
      : `<div class="empty" style="margin-top:12px"><b>ไม่มีผู้ปฏิบัติงานตามตารางในวันนี้</b>ตรวจตารางงานของวันที่เลือก</div>`;
    h += `<p class="sm" style="margin-top:14px">หลักการตรวจ: ลงเวลาเข้างานก่อนรอบแรก · ตรวจสภาพรถก่อนรอบแรก · ถ่ายรูปรายงานทุกเที่ยวภายใน 15 นาทีหลังเวลาออก · บันทึกผู้โดยสารภายใน 30 นาที · ชาร์จไฟต้องแนบใบเสร็จ · ตรวจพบไม่ปกติต้องมีงานแจ้งซ่อม · งานซ่อมไม่เริ่มเกิน 2 วัน หรือซ่อมเกิน 7 วัน · ลงเวลาออกงานหลัง 20:30 น.</p>`;
    main().innerHTML = h;
    agentPage.text = summaryText(d, rows, last);
    bindAgent();
  };
  /* ---------- สรุปปัญหาประจำวัน (Dashboard): 1) เที่ยวล่าช้าของวัน 2) ยอดสะสมของเดือน 3) ปัญหาอื่น ๆ ----------
     ล่าช้า = ถ่ายรูปรายงานหลังเวลาออกตามตารางเกิน LATE_MIN นาที (เกณฑ์เดียวกับรายงานรอบเดินรถ) · ไม่รายงาน = เลยเวลาออก 15 นาทีแล้วไม่มีรูป/ไม่ยกเลิก */
  const R2_11_FROM = "2026-10-30"; // 11:00 MRT อิสรภาพ เป็นเที่ยวแยกตั้งแต่วันนี้
  const dirOf = (qc, o) => qc === QC_SIRIRAJ ? (o === ORIGIN.HQ ? "ศิริราช: รฟม.สนญ. → MRT อิสรภาพ" : "ศิริราช: MRT อิสรภาพ วนรอบ") : o === ORIGIN.C ? "ขา ศูนย์ฯ → สถานี รฟม." : "ขา สถานี รฟม. → ศูนย์ฯ";
  async function pageAll(build) { const out = []; for (let i = 0; i < 40000; i += 1000) { const { data, error } = await build().range(i, i + 999); if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) break; } return out; }
  function tripStatus(days, queues, logs, nowD, nowM) {
    const res = [];
    queues.forEach((qq) => {
      if (!days.includes(qq.work_date)) return;
      tripsOf(qq.queue_code).forEach((t) => {
        if (qq.queue_code === QC_SIRIRAJ && t.time === "11:00" && qq.work_date < R2_11_FROM) return;
        const l = logs.find((x) => x.vehicle_id === qq.vehicle_id && x.work_date === qq.work_date && String(x.scheduled_time).slice(0, 5) === t.time && x.origin === t.origin);
        const due = qq.work_date < nowD || (qq.work_date === nowD && minsOf(t.time) + 15 <= nowM);
        let st = "wait", late = 0;
        if (l && l.status === "cancelled") st = "cancel";
        else if (l && l.photo_path) { late = minsOf(tHM(l.taken_at)) - minsOf(t.time); st = late > LATE_MIN ? "late" : "ok"; }
        else if (due) st = "miss";
        res.push({ d: qq.work_date, vid: qq.vehicle_id, code: vcodeOf(qq.vehicle_id), qc: qq.queue_code, time: t.time, origin: t.origin, dir: dirOf(qq.queue_code, t.origin), st, late });
      });
    });
    return res;
  }
  async function problemDash(d, alerts) {
    try {
      const m0 = d.slice(0, 8) + "01", nowD = today(), nowM = minsOf(nowHM());
      const [queues, logs, stops] = await Promise.all([
        q(sb.from("vehicle_queue").select("work_date,vehicle_id,queue_code").gte("work_date", m0).lte("work_date", d)),
        pageAll(() => sb.from("trip_logs").select("vehicle_id,work_date,scheduled_time,origin,taken_at,status,photo_path").gte("work_date", m0).lte("work_date", d)),
        sb.from("trip_stops").select("trip_log_id,board,alight,vehicle_id").eq("work_date", d).then((r) => r.data || []),
      ]);
      const days = [...new Set(queues.map((x) => x.work_date))];
      const all = tripStatus(days, queues, logs, nowD, nowM), today_ = all.filter((x) => x.d === d);
      const cnt = (l, st) => l.filter((x) => x.st === st).length;
      const cars = [...new Set(all.map((x) => x.code))].sort();
      const lateT = today_.filter((x) => x.st === "late").sort((a, b) => a.code.localeCompare(b.code) || a.time.localeCompare(b.time));
      const missT = today_.filter((x) => x.st === "miss");
      // 1) today
      let h = `<h2 style="margin-top:18px">สรุปปัญหาประจำวัน <small>${bk(d)} · ล่าช้า = รายงานหลังเวลาออกเกิน ${LATE_MIN} นาที</small></h2>
        <section class="sum"><div class="tile ${lateT.length ? "alert" : ""}"><small>เที่ยวล่าช้า</small><b class="num">${lateT.length}</b><span>เที่ยว</span></div>
        <div class="tile ${missT.length ? "alert" : ""}"><small>ไม่รายงาน</small><b class="num">${missT.length}</b><span>เที่ยว</span></div>
        <div class="tile"><small>ตรงเวลา</small><b class="num">${cnt(today_, "ok")}/${today_.length}</b><span>เที่ยว</span></div></section>`;
      h += `<section class="card" style="margin-top:10px"><b>1. เที่ยวล่าช้ากว่ากำหนด</b>${lateT.length ? `<table class="t" style="margin-top:6px"><thead><tr><th>รถ</th><th>เวลาออก</th><th>เที่ยว</th><th class="r">ช้า</th></tr></thead><tbody>${lateT.map((x) => `<tr><td><b>${x.code}</b></td><td class="num">${x.time}</td><td class="sm">${esc(x.dir)}</td><td class="r num">${x.late} น.</td></tr>`).join("")}</tbody></table>` : `<p class="sm" style="margin:6px 0 0">✅ ไม่มีเที่ยวล่าช้า</p>`}
        ${missT.length ? `<p class="sm" style="margin:8px 0 0"><b>ไม่รายงาน ${missT.length} เที่ยว:</b> ${cars.map((c) => { const l = missT.filter((x) => x.code === c); return l.length ? `${c} ${l.map((x) => x.time).join(", ")}` : ""; }).filter(Boolean).join(" · ")}</p>` : ""}</section>`;
      // 2) month to date
      const byCar = cars.map((c) => { const l = all.filter((x) => x.code === c), lt = l.filter((x) => x.st === "late"); return { c, plan: l.filter((x) => x.st !== "wait" && x.st !== "cancel").length, late: lt.length, miss: cnt(l, "miss"), avg: lt.length ? Math.round(lt.reduce((s, x) => s + x.late, 0) / lt.length) : 0, max: lt.reduce((m, x) => Math.max(m, x.late), 0) }; });
      const dirs = [...new Set(all.map((x) => x.dir))], slot = {};
      all.filter((x) => x.st === "late").forEach((x) => { const k = `${x.code} ${x.time} (${x.dir.replace("ขา ", "")})`; slot[k] = (slot[k] || 0) + 1; });
      const top = Object.entries(slot).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const tot = byCar.reduce((s, x) => ({ plan: s.plan + x.plan, late: s.late + x.late, miss: s.miss + x.miss }), { plan: 0, late: 0, miss: 0 });
      h += `<section class="card" style="margin-top:10px"><b>2. ยอดสะสมเดือนนี้</b> <span class="sm">วันที่ 1–${dObj(d).getDate()} ${MS[dObj(d).getMonth()]} ${dObj(d).getFullYear() + 543}</span>
        <table class="t" style="margin-top:6px"><thead><tr><th>รถ</th><th class="r">ถึงเวลาแล้ว</th><th class="r">ล่าช้า</th><th class="r">ไม่รายงาน</th><th class="r">ช้าเฉลี่ย / สูงสุด</th></tr></thead><tbody>
        ${byCar.map((x) => `<tr><td><b>${x.c}</b></td><td class="r num">${x.plan}</td><td class="r num">${x.late}${x.plan ? ` <span class="sm">(${Math.round((x.late / x.plan) * 100)}%)</span>` : ""}</td><td class="r num">${x.miss}</td><td class="r num">${x.late ? `${x.avg} / ${x.max} น.` : "–"}</td></tr>`).join("")}
        <tr><td><b>รวม</b></td><td class="r num"><b>${tot.plan}</b></td><td class="r num"><b>${tot.late}</b></td><td class="r num"><b>${tot.miss}</b></td><td></td></tr></tbody></table>
        <p class="sm" style="margin:8px 0 0"><b>ล่าช้าแยกตามขา:</b> ${dirs.map((x) => `${esc(x)} <b>${all.filter((y) => y.dir === x && y.st === "late").length}</b>`).join(" · ")}</p>
        ${top.length ? `<p class="sm" style="margin:6px 0 0"><b>เที่ยวที่ช้าบ่อยที่สุด:</b> ${top.map(([k, n]) => `${esc(k)} ${n} ครั้ง`).join(" · ")}</p>` : ""}</section>`;
      // 3) other problems
      const other = (alerts || []).filter((a) => !a.resolved_at && a.kind !== "trips"), grp = {};
      other.forEach((a) => { const k = (KIND[a.kind] || [a.kind])[0]; (grp[k] = grp[k] || []).push(a); });
      const byTrip = {}; stops.forEach((x) => { const b = (byTrip[x.trip_log_id] = byTrip[x.trip_log_id] || { b: 0, a: 0, v: x.vehicle_id }); b.b += x.board || 0; b.a += x.alight || 0; });
      const unbal = Object.values(byTrip).filter((x) => x.b !== x.a);
      const items = Object.entries(grp).map(([k, l]) => `<li><b>${esc(k)}</b> ${l.length} เรื่อง — ${[...new Set(l.map((a) => (a.vehicle_id ? vcodeOf(a.vehicle_id) : "")).filter(Boolean))].join(", ") || "–"}<br><span class="sm">${l.slice(0, 3).map((a) => esc(a.detail)).join(" · ")}${l.length > 3 ? " · …" : ""}</span></li>`);
      if (unbal.length) items.push(`<li><b>ผู้โดยสารขึ้น–ลงไม่เท่ากัน</b> ${unbal.length} เที่ยว — ${[...new Set(unbal.map((x) => vcodeOf(x.v)))].join(", ")}</li>`);
      h += `<section class="card" style="margin-top:10px"><b>3. ปัญหาอื่น ๆ</b>${items.length ? `<ul style="margin:6px 0 0;padding-left:18px;display:grid;gap:6px">${items.join("")}</ul>` : `<p class="sm" style="margin:6px 0 0">✅ ไม่มีปัญหาอื่น</p>`}</section>`;
      problemDash.text = `\n\n⏱ เที่ยวล่าช้า ${lateT.length} เที่ยว${lateT.length ? ": " + lateT.map((x) => `${x.code} ${x.time} (+${x.late} น.)`).join(", ") : ""}\n❌ ไม่รายงาน ${missT.length} เที่ยว\n📊 สะสมเดือนนี้: ล่าช้า ${tot.late} · ไม่รายงาน ${tot.miss} จาก ${tot.plan} เที่ยว`;
      return h;
    } catch (e) { problemDash.text = ""; return `<p class="sm" style="margin-top:14px">สรุปปัญหาประจำวันโหลดไม่สำเร็จ: ${esc(errMsg(e))}</p>`; }
  }
  function summaryText(d, rows, last) {
    const bad = rows.filter((r) => r.mine.length);
    let t = `📋 สรุปการบันทึกข้อมูล Smart Shuttle Bus EV\n${bkLong(d)}${last ? ` (ตรวจล่าสุด ${tHM(last)} น.)` : ""}\nครบถ้วน ${rows.length - bad.length} คน · มีเรื่องค้าง ${bad.length} คน\n`;
    bad.forEach((r) => {
      t += `\n❗ ${r.name}${r.veh.size ? ` (${[...r.veh].map(vcodeOf).join(", ")})` : ""} ${r.score} คะแนน\n`;
      r.mine.forEach((a) => (t += `• ${(KIND[a.kind] || [a.kind])[0]}: ${a.detail}${a.ack_at ? " ✔รับทราบ" : ""}\n`));
    });
    const ok = rows.filter((r) => !r.mine.length);
    if (ok.length) t += `\n✅ ครบ: ${ok.map((r) => r.name.split(" ")[0]).join(", ")}`;
    return (t.trim() + (problemDash.text || "")).trim();
  }
  function bindAgent() {
    const di = $("agD"); if (di) di.onchange = () => { AD = di.value || today(); route(); };
    const run = $("agRun");
    if (run) run.onclick = async () => {
      run.disabled = true; run.textContent = "กำลังตรวจ…";
      const { data, error } = await sb.rpc("run_compliance", { p_date: AD });
      if (error) { run.disabled = false; run.textContent = "🔎 ตรวจตอนนี้"; toast(missing(error) ? "ยังไม่ได้ติดตั้งตัวตรวจ (รัน SQL ก่อน)" : errMsg(error)); return; }
      toast(`ตรวจแล้ว ถึง ${data && data.checked_until ? data.checked_until : nowHM()} น. · พบ ${data ? data.open_alerts : 0} เรื่อง`);
      route();
    };
    const cp = $("agCopy"); if (cp) cp.onclick = () => copyText(agentPage.text);
    const ln = $("agLine"); if (ln) ln.href = lineURL(agentPage.text);
  }

  /* ผู้จัดการ: การ์ดย่อในหน้าหลัก */
  window.agentHomeCard = async function () {
    const { data, error } = await sb.from("compliance_alerts").select("employee_id,severity").eq("work_date", today()).is("resolved_at", null);
    if (error) return `<a class="card agentlink" href="#agent" style="display:block;margin-top:12px"><b><img class="tf-ic" src="assets/img/smartai-96.png?v=2" alt="">Manager Agent</b><p class="sm" style="margin:4px 0 0">ยังไม่ได้ติดตั้งตัวตรวจ · แตะเพื่อดูวิธีติดตั้ง</p></a>`;
    const ppl = new Set(data.map((a) => a.employee_id)).size, hi = data.filter((a) => a.severity === "high").length;
    return `<a class="card agentlink" href="#agent" style="display:block;margin-top:12px;border-color:${hi ? "#ff8a8a" : data.length ? "#ffd166" : "var(--line)"}">
      <div class="row1"><b><img class="tf-ic" src="assets/img/smartai-96.png?v=2" alt="">Manager Agent วันนี้</b><span class="pill ${hi ? "bad" : data.length ? "warn" : "ok"}">${data.length ? `${ppl} คน · ${data.length} เรื่อง` : "ครบถ้วน"}</span></div>
      <p class="sm" style="margin:4px 0 0">${data.length ? `มีพนักงานบันทึกไม่ครบตามขั้นตอน${hi ? ` (สำคัญ ${hi} เรื่อง)` : ""} · แตะเพื่อดูรายบุคคลและส่งสรุป LINE` : "ยังไม่พบการละเลยการบันทึก · แตะเพื่อดูสรุปหรือสั่งตรวจตอนนี้"}</p></a>`;
  };
})();
