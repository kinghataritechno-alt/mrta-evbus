/* ข้อมูลคนขับ (ผู้จัดการ/ผู้ดูแลระบบ): ชื่อ-สกุล · ที่อยู่ · เบอร์ติดต่อ · รูปโปรไฟล์ · อายุ · รหัสพนักงาน
   ข้อมูลส่วนบุคคลอยู่ในตาราง employee_profiles (RLS: ผู้จัดการ และเจ้าของข้อมูลเท่านั้น) · รูปอยู่ใน bucket ส่วนตัว "profiles" */
(function () {
  const KTH = { regular: "พนักงานขับรถประจำ", relief: "พนักงานขับรถ (ขับแทน)", spare: "พนักงานขับรถสำรอง (สแปร์)", technician: "ช่างซ่อมบำรุง" };
  const SETUP = `<p class="notice" style="margin-top:12px">ยังไม่ได้เปิดใช้ข้อมูลคนขับในฐานข้อมูล · ให้ผู้ดูแลรันไฟล์ <b>MRTA_SQL_เปลี่ยนรถ_ข้อมูลคนขับ.sql</b> ก่อน</p>`;
  const missing = (e) => /employee_profiles|PGRST20[25]|42P01|schema cache/i.test((e && (e.message || e.code)) || "");
  const ageOf = (b) => { if (!b) return null; const t = dObj(today()), d = dObj(b); let a = t.getFullYear() - d.getFullYear(); if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--; return a; };
  // age: exact from birth date; otherwise the stated age plus whole years since it was given
  const ageNow = (p) => { if (!p) return null; if (p.birth_date) return ageOf(p.birth_date); if (p.age_years == null) return null;
    const a = dObj(p.age_as_of || today()), t = dObj(today()); let y = t.getFullYear() - a.getFullYear(); if (t.getMonth() < a.getMonth() || (t.getMonth() === a.getMonth() && t.getDate() < a.getDate())) y--; return p.age_years + Math.max(0, y); };
  const initials = (n) => esc(String(n || "?").trim().slice(0, 1));
  async function photos(paths) {
    const ps = paths.filter(Boolean); if (!ps.length) return {};
    const { data } = await sb.storage.from("profiles").createSignedUrls(ps, 3600);
    const m = {}; (data || []).forEach((x, i) => { if (x && x.signedUrl) m[ps[i]] = x.signedUrl; }); return m;
  }
  const avatar = (p, url, name, big) => url ? `<img class="pf-av${big ? " big" : ""}" src="${url}" data-view="${url}" alt="">` : `<span class="pf-av${big ? " big" : ""} pf-ini">${initials(name)}</span>`;
  const card = (e, p, url, edit) => {
    const age = ageNow(p), hv = e.home_vehicle_id ? vById(e.home_vehicle_id) : null;
    return `<article class="card pf">
      <div class="pf-top">${avatar(p, url, e.full_name)}<div style="min-width:0"><b>${esc(e.full_name)}</b><div class="sm">${KTH[e.kind] || ""}${hv ? ` · รถประจำ <b>${hv.code}</b>` : ""}</div></div>${edit ? `<button class="btn" data-pe="${e.id}" style="margin-left:auto">แก้ไข</button>` : ""}</div>
      <dl class="kv" style="margin-top:8px">
        <dt>รหัสพนักงาน</dt><dd class="num">${e.emp_no ? esc(e.emp_no) : `<span class="sm">รอข้อมูล</span>`}</dd>
        <dt>อายุ</dt><dd>${age != null ? `${age} ปี${p.birth_date ? ` <span class="sm">(เกิด ${bk(p.birth_date)})</span>` : ""}` : `<span class="sm">รอข้อมูล</span>`}</dd>
        <dt>เบอร์ติดต่อ</dt><dd>${p && p.phone ? `<a href="tel:${esc(p.phone.replace(/[^0-9+]/g, ""))}" style="color:var(--blue)">${esc(p.phone)}</a>` : `<span class="sm">รอข้อมูล</span>`}</dd>
        <dt>ที่อยู่</dt><dd>${p && p.address ? esc(p.address) : `<span class="sm">รอข้อมูล</span>`}</dd>
      </dl></article>`;
  };

  window.driversPage = async function () {
    if (!isMgr()) { location.hash = "#home"; return; }
    const [emps, pr] = await Promise.all([
      q(sb.from("employees").select("*").in("kind", ["regular", "relief", "spare"]).order("code")),
      sb.from("employee_profiles").select("*"),
    ]);
    if (pr.error) { main().innerHTML = missing(pr.error) ? SETUP : `<p class="err">${esc(errMsg(pr.error))}</p>`; return; }
    const P = pr.data || [], pOf = (id) => P.find((x) => x.employee_id === id) || null, urls = await photos(P.map((x) => x.photo_path));
    const filled = emps.filter((e) => { const p = pOf(e.id); return e.emp_no && p && p.phone && p.address && ageNow(p) != null && p.photo_path; }).length;
    main().innerHTML = `<section class="sum"><div class="tile"><small>พนักงานขับรถ</small><b class="num">${emps.length}</b><span>คน</span></div>
      <div class="tile ${filled < emps.length ? "alert" : ""}"><small>ข้อมูลครบ</small><b class="num">${filled}/${emps.length}</b><span>คน</span></div></section>
      <p class="sm" style="margin:8px 0 0">ข้อมูลส่วนบุคคล เห็นเฉพาะผู้จัดการ/ผู้ดูแลระบบ และเจ้าของข้อมูล · แตะรูปเพื่อขยาย · แตะเบอร์เพื่อโทร</p>
      <div class="list" style="margin-top:10px">${emps.map((e) => card(e, pOf(e.id), urls[pOf(e.id)?.photo_path], true)).join("")}</div>`;
    main().querySelectorAll("[data-pe]").forEach((b) => (b.onclick = () => { const e = emps.find((x) => x.id === b.dataset.pe); editProfile(e, pOf(e.id), urls[pOf(e.id)?.photo_path]); }));
  };

  function editProfile(e, p, url) {
    const s = $("sheet"); let blob = null;
    s.innerHTML = `<div class="in"><div class="sh"><b>แก้ไขข้อมูล · ${esc(e.full_name.split(" ")[0])}</b><button class="lnk" id="shX">ปิด</button></div>
      <div class="pf-top" style="gap:12px">${avatar(p, url, e.full_name, true).replace('class="pf-av', 'id="pfImg" class="pf-av')}
        <div style="display:grid;gap:6px;flex:1"><label class="btn">📷 ถ่ายรูป<input type="file" id="pfCam" accept="image/*" capture="user" hidden></label><label class="btn">🖼️ เลือกรูป<input type="file" id="pfGal" accept="image/*" hidden></label></div></div>
      <div class="grid" style="margin-top:10px">
        <div class="fld full"><label for="pfN">ชื่อ-นามสกุล</label><input id="pfN" value="${esc(e.full_name)}"></div>
        <div class="fld"><label for="pfC">รหัสพนักงาน</label><input id="pfC" autocapitalize="characters" value="${esc(e.emp_no || "")}" placeholder="เช่น 690902 · สำรอง SP690001"></div>
        <div class="fld"><label for="pfB">วันเกิด (ถ้าทราบ)</label><input id="pfB" type="date" value="${p?.birth_date || ""}" max="${today()}"></div>
        <div class="fld"><label for="pfY">อายุ (ปี) ถ้าไม่ทราบวันเกิด</label><input id="pfY" inputmode="numeric" maxlength="2" value="${p && !p.birth_date && ageNow(p) != null ? ageNow(p) : ""}"></div>
        <div class="fld full"><label for="pfT">เบอร์ติดต่อ</label><input id="pfT" type="tel" inputmode="tel" value="${esc(p?.phone || "")}" placeholder="08x-xxx-xxxx"></div>
        <div class="fld full"><label for="pfA">ที่อยู่</label><textarea id="pfA" rows="3">${esc(p?.address || "")}</textarea></div>
      </div>
      <p class="err" id="pfErr" hidden></p><button class="btn pri block" id="pfSave">บันทึก</button></div>`;
    s.hidden = false; $("shX").onclick = () => (s.hidden = true);
    const pickPhoto = async (inp) => { const f = inp.files[0]; if (!f) return; blob = await shrink(f, 640, 0.82); if (!blob) return;
      const u = URL.createObjectURL(blob), el = $("pfImg"); if (el.tagName === "IMG") el.src = u; else el.outerHTML = `<img id="pfImg" class="pf-av big" src="${u}" alt="">`; };
    $("pfCam").onchange = (ev) => pickPhoto(ev.target); $("pfGal").onchange = (ev) => pickPhoto(ev.target);
    $("pfSave").onclick = async () => {
      const err = (m) => { $("pfErr").textContent = m; $("pfErr").hidden = false; };
      const name = $("pfN").value.trim().replace(/\s+/g, " "), code = $("pfC").value.trim() || null, phone = $("pfT").value.trim() || null;
      if (!name) return err("กรุณากรอกชื่อ-นามสกุล");
      const ay = $("pfY").value.trim() ? +$("pfY").value.replace(/\D/g, "") : null;
      if (ay != null && (ay < 15 || ay > 90)) return err("อายุต้องอยู่ระหว่าง 15–90 ปี");
      if (phone && phone.replace(/\D/g, "").length < 9) return err("เบอร์ติดต่อไม่ครบ");
      const b = $("pfSave"); b.disabled = true; b.innerHTML = `<span class="spin"></span> กำลังบันทึก…`;
      try {
        let photo_path = p?.photo_path || null;
        if (blob) { const ext = blob.type === "image/heic" ? "heic" : "jpg"; photo_path = `${e.id}/${Date.now()}.${ext}`;
          const { error } = await sb.storage.from("profiles").upload(photo_path, blob, { contentType: blob.type === "image/heic" ? "image/heic" : "image/jpeg", upsert: false }); if (error) throw error; }
        if (name !== e.full_name || code !== (e.emp_no || null)) await q(sb.from("employees").update({ full_name: name, emp_no: code }).eq("id", e.id));
        await q(sb.from("employee_profiles").upsert({ employee_id: e.id, address: $("pfA").value.trim() || null, phone, birth_date: $("pfB").value || null, age_years: $("pfB").value ? null : ay, age_as_of: $("pfB").value || ay == null ? null : today(), photo_path, updated_at: new Date().toISOString() }, { onConflict: "employee_id" }));
        s.hidden = true; toast("บันทึกข้อมูลแล้ว"); window.driversPage();
      } catch (x) { b.disabled = false; b.textContent = "บันทึก"; err(/employees_emp_no_key|duplicate/.test(errMsg(x)) ? "รหัสพนักงานนี้มีคนใช้แล้ว" : missing(x) ? "ยังไม่ได้เปิดใช้ข้อมูลคนขับ (รอรัน SQL)" : errMsg(x)); }
    };
  }

  /* driver home hero: own employee row + profile + signed photo URL (profile part empty until the SQL is run) */
  window.myProfileData = async function () {
    if (!ME.employee?.id) return null;
    const [e, pr] = await Promise.all([q(sb.from("employees").select("*").eq("id", ME.employee.id).single()).catch(() => null), sb.from("employee_profiles").select("*").eq("employee_id", ME.employee.id)]);
    if (!e) return null;
    const p = (!pr.error && (pr.data || [])[0]) || null, urls = p?.photo_path ? await photos([p.photo_path]).catch(() => ({})) : {};
    return { e, p, url: urls[p?.photo_path] || null, age: ageNow(p), kindTh: KTH[e.kind] || "" };
  };

  /* own profile (account page) — read only */
  window.myProfileCard = async function () {
    if (!ME.employee?.id) return "";
    const [e, pr] = await Promise.all([q(sb.from("employees").select("*").eq("id", ME.employee.id).single()).catch(() => null), sb.from("employee_profiles").select("*").eq("employee_id", ME.employee.id)]);
    if (!e || pr.error || !["regular", "relief", "spare", "technician"].includes(e.kind)) return "";
    const p = (pr.data || [])[0] || null, urls = await photos([p?.photo_path]);
    return `<h2>ข้อมูลของฉัน <small>แก้ไขได้ที่ผู้จัดการ</small></h2>${card(e, p, urls[p?.photo_path], false)}`;
  };
})();
