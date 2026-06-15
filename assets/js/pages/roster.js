/* Roster — list/filter/edit players, record payments. Live Supabase. */
(async function () {
  const { client, cfg, esc, fmtDate, fmtMoney, todayIso, toast, openModal, closeModal, managerEmail } = window.GA;
  const { FEES, joiningBreakdown, renewalAmount } = window.GA_FEES;
  const session = await window.GA.initManagerPage("roster");
  if (!session) return;
  const email = managerEmail(session);

  const $ = (id) => document.getElementById(id);
  let students = [];
  let payments = [];
  let attendance = [];
  let slotFilter = "";
  let riskFilter = false;
  let editingId = null;
  let payingStudent = null;
  const lastSeenMap = new Map();
  // sort + filter state (replaces the old native-select filter row)
  let sortKey = "name", sortDir = "asc";
  let fStatus = "active", fFee = "all", fJersey = "all";
  const slotCounts = {};

  /* ---- edit-modal selects ---- */
  cfg.timeSlots.forEach((s) => {
    $("eSlot").insertAdjacentHTML("beforeend", `<option value="${s}">${s}</option>`);
  });
  cfg.jerseySizes.forEach((s) => {
    $("eJerseySize").insertAdjacentHTML("beforeend", `<option value="${s}">${s}</option>`);
  });

  /* ---- due-date helpers (cycle-day based, mirrors v1 rule) ---- */
  function addMonths(iso, m) {
    const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
    d.setMonth(d.getMonth() + m);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function paymentsFor(id) {
    return payments.filter((p) => p.student_id === id && (p.payment_type === "joining" || p.payment_type === "renewal"));
  }
  function nextDue(s) {
    const list = paymentsFor(s.id).filter((p) => p.cycle_start_date);
    if (!list.length) return s.join_date ? addMonths(s.join_date, 1) : null;
    let end = null;
    list.forEach((p) => {
      const e = addMonths(p.cycle_start_date, Math.max(1, Number(p.months_covered) || 1));
      if (!end || e > end) end = e;
    });
    return end;
  }
  function feeState(s) {
    if (s.discontinued) return { label: "Discontinued", cls: "" };
    if (!s.fees_paid) return { label: "Joining pending", cls: "red" };
    const due = nextDue(s);
    if (due && due <= todayIso()) return { label: "Renewal due", cls: "red" };
    return { label: "Paid", cls: "green" };
  }
  const returningIds = () => new Set(payments.filter((p) => p.payment_type === "renewal").map((p) => p.student_id));

  /* ---- attendance / retention helpers ---- */
  function buildAttendance() {
    lastSeenMap.clear();
    attendance.forEach((a) => {
      const d = String(a.attendance_date || "").slice(0, 10);
      if (!d) return;
      const cur = lastSeenMap.get(a.student_id);
      if (!cur || d > cur) lastSeenMap.set(a.student_id, d);
    });
  }
  function daysSince(iso) {
    if (!iso) return null;
    const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
    const t = new Date(`${todayIso()}T00:00:00`);
    return Math.round((t - d) / 86400000);
  }
  // at-risk: active, joined > 2 weeks ago, and no attendance in the last 2 weeks
  function isAtRisk(s) {
    if (s.discontinued) return false;
    const jd = daysSince(s.join_date);
    if (jd != null && jd <= 14) return false;
    const since = daysSince(lastSeenMap.get(s.id));
    return since == null || since > 14;
  }
  function attCell(s) {
    const since = daysSince(lastSeenMap.get(s.id));
    if (since == null) return `<span class="pill att-pill">—</span>`;
    const cls = since <= 7 ? "green" : since <= 14 ? "gold" : "red";
    return `<span class="pill ${cls} att-pill">${since === 0 ? "today" : since + "d"}</span>`;
  }
  function attMeta(s) {
    const since = daysSince(lastSeenMap.get(s.id));
    if (since == null) return `<span class="pill">Not marked</span>`;
    const cls = since <= 7 ? "green" : since <= 14 ? "gold" : "red";
    return `<span class="pill ${cls}">Seen ${since === 0 ? "today" : since + "d ago"}</span>`;
  }

  /* ---- roster pulse + birthdays ---- */
  function renderPulse() {
    const active = students.filter((s) => !s.discontinued);
    const ym = todayIso().slice(0, 7);
    const newThis = students.filter((s) => String(s.join_date || "").slice(0, 7) === ym).length;
    const churn = students.filter((s) => s.discontinued && String(s.discontinued_at || "").slice(0, 7) === ym).length;
    const needs = active.filter((s) => feeState(s).label !== "Paid").length;
    const risk = active.filter(isAtRisk).length;
    $("kActive").textContent = active.length;
    $("kActiveSub").textContent = churn > 0 ? `${churn} left this month` : "Currently training";
    $("kNew").textContent = newThis;
    $("kNeeds").textContent = needs;
    $("kRisk").textContent = risk;
  }
  function renderBirthdays() {
    const banner = $("bdayBanner");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const list = [];
    students.filter((s) => !s.discontinued && s.date_of_birth).forEach((s) => {
      const d = new Date(`${String(s.date_of_birth).slice(0, 10)}T00:00:00`);
      if (isNaN(d)) return;
      let next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
      if (next < today) next = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
      const diff = Math.round((next - today) / 86400000);
      if (diff >= 0 && diff <= 14) list.push({ name: s.name, diff });
    });
    list.sort((a, b) => a.diff - b.diff);
    banner.hidden = !list.length;
    if (list.length) banner.innerHTML = `<span class="bt">🎂 Birthdays</span>` +
      list.slice(0, 6).map((b) => `<span class="bd">${esc(b.name)} · ${b.diff === 0 ? "today" : b.diff === 1 ? "tomorrow" : "in " + b.diff + "d"}</span>`).join("");
  }
  function updatePulseActive() {
    document.querySelector('#rosterPulse [data-jump="atrisk"]')?.classList.toggle("on", riskFilter);
  }

  /* ---- load (with skeleton on first paint) ---- */
  let loadedOnce = false;
  function renderSkeleton() {
    const skRow = `<tr><td colspan="9" style="padding:0;"><div class="sk-row">
      <span class="skeleton" style="width:18%;"></span><span class="skeleton" style="width:6%;"></span>
      <span class="skeleton" style="width:9%;"></span><span class="skeleton" style="width:11%;"></span>
      <span class="skeleton" style="width:12%;"></span><span class="skeleton" style="width:11%;"></span>
      <span class="skeleton" style="width:8%;"></span><span class="skeleton" style="width:12%;"></span>
    </div></td></tr>`;
    $("tableBody").innerHTML = skRow.repeat(8);
    $("cardsList").innerHTML = Array.from({ length: 5 }, () =>
      `<div class="glass row-card"><span class="skeleton" style="height:16px;width:55%;"></span><span class="skeleton" style="height:12px;width:80%;"></span></div>`
    ).join("");
  }
  async function load() {
    if (!loadedOnce) renderSkeleton();
    // order most-recent-first + raise the limit so Supabase's 1000-row default
    // cap can't drop a student's latest payment/attendance (which corrupted
    // "Last seen" and fee status on larger datasets).
    const [sRes, pRes, aRes] = await Promise.all([
      client.from("students").select("*").order("name", { ascending: true }),
      client.from("student_payments").select("student_id, payment_type, cycle_start_date, months_covered").order("cycle_start_date", { ascending: false }).limit(5000),
      client.from("attendance").select("student_id, attendance_date").order("attendance_date", { ascending: false }).limit(5000),
    ]);
    if (sRes.error) return toast(sRes.error.message);
    loadedOnce = true;
    students = sRes.data || [];
    payments = pRes.data || [];
    attendance = aRes.data || [];
    buildAttendance();
    renderSlots();
    renderPulse();
    renderBirthdays();
    render();
  }

  /* ---- slot counts (feed the Slot column filter) ---- */
  function renderSlots() {
    cfg.timeSlots.forEach((s) => { slotCounts[s] = 0; });
    students.filter((s) => !s.discontinued).forEach((s) => {
      if (s.time_slot in slotCounts) slotCounts[s.time_slot]++;
    });
  }

  /* ---- filtering + sorting ---- */
  function filtered() {
    const q = $("searchInput").value.trim().toLowerCase();
    const list = students.filter((s) => {
      if (q && !String(s.name || "").toLowerCase().includes(q)) return false;
      if (riskFilter && !isAtRisk(s)) return false;
      if (fStatus === "active" && s.discontinued) return false;
      if (fStatus === "discontinued" && !s.discontinued) return false;
      if (slotFilter && s.time_slot !== slotFilter) return false;
      if (fJersey === "not-set" && s.jersey_size) return false;
      const st = feeState(s);
      if (fFee === "paid" && st.label !== "Paid") return false;
      if (fFee === "not-paid" && st.label === "Paid") return false;
      if (fFee === "overdue" && st.label !== "Renewal due") return false;
      return true;
    });
    return sortList(list);
  }
  function sortList(list) {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (s) => {
      switch (sortKey) {
        case "age": return Number(s.age) || 0;
        case "join": return String(s.join_date || "");
        case "due": { const d = s.fees_paid && !s.discontinued ? nextDue(s) : null; return d || "9999-99-99"; }
        case "seen": { const v = daysSince(lastSeenMap.get(s.id)); return v == null ? 1e9 : v; }
        default: return String(s.name || "").toLowerCase();
      }
    };
    return [...list].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  }
  let shownCount = 30;
  $("searchInput").addEventListener("input", () => { shownCount = 30; render(); });
  $("showMoreBtn").addEventListener("click", () => { shownCount += 30; render(); });

  function syncStatusSeg() {
    [...$("statusSeg").children].forEach((c) => c.classList.toggle("on", c.dataset.st === fStatus));
  }

  /* ---- status segmented control ---- */
  $("statusSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-st]"); if (!b) return;
    fStatus = b.dataset.st; riskFilter = false; updatePulseActive(); syncStatusSeg();
    shownCount = 30; render();
  });

  /* ---- sortable headers ---- */
  function updateHeader() {
    document.querySelectorAll("th.th-sort").forEach((th) => {
      const on = th.dataset.sort === sortKey;
      th.classList.toggle("sorted", on);
      const ar = th.querySelector(".ar");
      if (ar) ar.textContent = on ? (sortDir === "asc" ? "▲" : "▼") : "▲";
    });
    document.querySelectorAll("th.th-filter").forEach((th) => {
      const f = th.dataset.filter;
      const active = (f === "slot" && slotFilter) || (f === "fee" && fFee !== "all") || (f === "jersey" && fJersey !== "all");
      th.classList.toggle("filtered", !!active);
    });
  }
  document.querySelectorAll("th.th-sort").forEach((th) => {
    th.addEventListener("click", () => {
      const k = th.dataset.sort;
      if (sortKey === k) sortDir = sortDir === "asc" ? "desc" : "asc";
      else { sortKey = k; sortDir = "asc"; }
      updateHeader(); render();
    });
  });

  /* ---- column filter popover ---- */
  const POP = $("thPop");
  let popCol = null;
  function buildOpts() {
    if (popCol === "fee") return [["all", "All"], ["paid", "Paid"], ["not-paid", "Unpaid"], ["overdue", "Overdue"]].map(([v, l]) => ({ v, l, sel: fFee === v }));
    if (popCol === "jersey") return [["all", "All"], ["not-set", "Not set"]].map(([v, l]) => ({ v, l, sel: fJersey === v }));
    return [{ v: "", l: "All slots", sel: !slotFilter }].concat(cfg.timeSlots.map((s) => ({ v: s, l: s, ct: slotCounts[s] || 0, sel: slotFilter === s })));
  }
  function openPop(th) {
    popCol = th.dataset.filter;
    POP.innerHTML = buildOpts().map((o) => `<button type="button" data-v="${o.v}" class="${o.sel ? "sel" : ""}">${esc(o.l)}${o.ct != null ? `<span class="ct">${o.ct}</span>` : ""}</button>`).join("");
    const r = th.getBoundingClientRect();
    POP.style.left = `${Math.min(r.left, window.innerWidth - 210)}px`;
    POP.style.top = `${r.bottom + 6}px`;
    POP.classList.add("open");
  }
  function closePop() { POP.classList.remove("open"); popCol = null; }
  document.querySelectorAll("th.th-filter").forEach((th) => {
    th.addEventListener("click", () => { if (popCol === th.dataset.filter) closePop(); else openPop(th); });
  });
  POP.addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]"); if (!b) return;
    const v = b.dataset.v;
    if (popCol === "fee") fFee = v; else if (popCol === "jersey") fJersey = v; else slotFilter = v;
    riskFilter = false; updatePulseActive(); updateHeader(); closePop(); shownCount = 30; render();
  });
  document.addEventListener("mousedown", (e) => {
    if (POP.classList.contains("open") && !POP.contains(e.target) && !e.target.closest("th.th-filter")) closePop();
  });
  window.addEventListener("resize", closePop);

  /* ---- mobile sort & filter sheet ---- */
  const chip = (active, label, attrs) => `<button type="button" class="chip ${active ? "active" : ""}" ${attrs}>${label}</button>`;
  function renderSheet() {
    const sortOpts = [["name", "Name"], ["age", "Age"], ["join", "Joined"], ["due", "Next due"], ["seen", "Last seen"]];
    $("sheetBody").innerHTML =
      `<div class="sheet-grp"><div class="lbl">Sort by</div><div class="sheet-chips">${sortOpts.map(([k, l]) => chip(sortKey === k, l, `data-sk="${k}"`)).join("")}</div></div>` +
      `<div class="sheet-grp"><div class="lbl">Order</div><div class="sheet-chips">${chip(sortDir === "asc", "Ascending", 'data-sd="asc"')}${chip(sortDir === "desc", "Descending", 'data-sd="desc"')}</div></div>` +
      `<div class="sheet-grp"><div class="lbl">Status</div><div class="sheet-chips">${chip(fStatus === "active", "Active", 'data-fs="active"')}${chip(fStatus === "all", "All", 'data-fs="all"')}${chip(fStatus === "discontinued", "Past", 'data-fs="discontinued"')}</div></div>` +
      `<div class="sheet-grp"><div class="lbl">Fee</div><div class="sheet-chips">${[["all", "All"], ["paid", "Paid"], ["not-paid", "Unpaid"], ["overdue", "Overdue"]].map(([v, l]) => chip(fFee === v, l, `data-ff="${v}"`)).join("")}</div></div>` +
      `<div class="sheet-grp"><div class="lbl">Slot</div><div class="sheet-chips">${chip(!slotFilter, "All", 'data-fsl=""')}${cfg.timeSlots.map((s) => chip(slotFilter === s, `${s} · ${slotCounts[s] || 0}`, `data-fsl="${s}"`)).join("")}</div></div>` +
      `<div class="sheet-grp"><div class="lbl">Jersey</div><div class="sheet-chips">${chip(fJersey === "all", "All", 'data-fj="all"')}${chip(fJersey === "not-set", "Not set", 'data-fj="not-set"')}</div></div>`;
  }
  $("mSortFilter").addEventListener("click", () => { renderSheet(); openModal("filterSheet"); });
  $("sheetBody").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sk],button[data-sd],button[data-fs],button[data-ff],button[data-fsl],button[data-fj]");
    if (!b) return;
    const d = b.dataset;
    if (d.sk != null) sortKey = d.sk;
    else if (d.sd != null) sortDir = d.sd;
    else if (d.fs != null) { fStatus = d.fs; syncStatusSeg(); }
    else if (d.ff != null) fFee = d.ff;
    else if (d.fsl != null) slotFilter = d.fsl;
    else if (d.fj != null) fJersey = d.fj;
    riskFilter = false; updatePulseActive(); updateHeader(); renderSheet(); shownCount = 30; render();
  });

  /* ---- pulse KPI quick-filters ---- */
  $("rosterPulse").addEventListener("click", (e) => {
    const card = e.target.closest("[data-jump]"); if (!card) return;
    const j = card.dataset.jump;
    if (j === "atrisk") {
      riskFilter = !riskFilter;
      if (riskFilter) { fStatus = "active"; fFee = "all"; }
    } else {
      riskFilter = false;
      fStatus = "active"; $("searchInput").value = ""; slotFilter = ""; fJersey = "all";
      fFee = j === "needs" ? "not-paid" : "all";
    }
    syncStatusSeg(); updatePulseActive(); updateHeader();
    shownCount = 30; render();
    $("tableWrap").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  updateHeader();

  /* ---- render (paged) ---- */
  function render() {
    const fullList = filtered();
    const list = fullList.slice(0, shownCount);
    const activeCount = students.filter((s) => !s.discontinued).length;
    $("rosterCountSub").textContent = `${list.length} of ${fullList.length} shown · ${activeCount} active of ${students.length} registered`;
    $("emptyState").classList.toggle("hide", fullList.length > 0);
    $("showMoreRow").classList.toggle("hide", fullList.length <= shownCount);
    $("showMoreBtn").textContent = `Show more players (${fullList.length - list.length} remaining)`;

    $("tableBody").innerHTML = list.map((s) => {
      const st = feeState(s);
      const due = s.fees_paid && !s.discontinued ? nextDue(s) : null;
      return `<tr>
        <td><span class="t-name" data-open="${s.id}">${esc(s.name)}</span>${isAtRisk(s) ? '<span class="t-risk">AT&nbsp;RISK</span>' : ""}</td>
        <td class="num">${esc(s.age ?? "—")}</td>
        <td>${esc(s.time_slot || "—")}</td>
        <td class="num">${fmtDate(s.join_date)}</td>
        <td><span class="pill ${st.cls}">${st.label}</span></td>
        <td class="num">${due ? fmtDate(due) : "—"}</td>
        <td>${attCell(s)}</td>
        <td class="num">${esc(s.jersey_size || "—")}${s.jersey_pairs ? ` ×${s.jersey_pairs}` : ""}</td>
        <td><div class="flex" style="gap:6px;justify-content:flex-end;">
          <button class="btn btn-glass btn-sm" data-edit="${s.id}">Edit</button>
          <button class="btn btn-glass btn-sm" data-pay="${s.id}">₹</button>
        </div></td>
      </tr>`;
    }).join("");

    $("cardsList").innerHTML = list.map((s) => {
      const st = feeState(s);
      return `<article class="glass row-card">
        <div class="rc-top">
          <span class="rc-name t-name" data-open="${s.id}">${esc(s.name)}${isAtRisk(s) ? '<span class="t-risk">AT&nbsp;RISK</span>' : ""}</span>
          <span class="pill ${st.cls}">${st.label}</span>
        </div>
        <div class="rc-meta">
          <span class="pill">${esc(s.time_slot || "—")}</span>
          <span class="pill">Age ${esc(s.age ?? "—")}</span>
          ${attMeta(s)}
          ${s.jersey_size ? `<span class="pill">Jersey ${esc(s.jersey_size)}</span>` : ""}
        </div>
        <div class="rc-actions">
          <button class="btn btn-glass btn-sm grow" data-open="${s.id}">Profile</button>
          <button class="btn btn-glass btn-sm grow" data-edit="${s.id}">Edit</button>
          <button class="btn btn-primary btn-sm grow" data-pay="${s.id}">Payment</button>
        </div>
      </article>`;
    }).join("");
  }

  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open) return (location.href = `player.html?id=${encodeURIComponent(open.dataset.open)}`);
    const edit = e.target.closest("[data-edit]");
    if (edit) return openEdit(students.find((s) => String(s.id) === String(edit.dataset.edit)));
    const pay = e.target.closest("[data-pay]");
    if (pay) return openPay(students.find((s) => String(s.id) === String(pay.dataset.pay)));
  });

  /* ---- add / edit ---- */
  $("addPlayerBtn").addEventListener("click", () => openEdit(null));
  $("eStatus").addEventListener("change", () => {
    $("eDiscDateField").classList.toggle("hide", $("eStatus").value !== "discontinued");
  });

  function openEdit(s) {
    editingId = s?.id ?? null;
    $("editKicker").textContent = s ? "Edit player" : "New player";
    $("editTitle").textContent = s ? s.name : "Add an academy kid";
    $("eName").value = s?.name || "";
    $("eAge").value = s?.age ?? "";
    $("eSlot").value = s?.time_slot || "";
    $("eJoinDate").value = s?.join_date || todayIso();
    $("eGuardian").value = s?.father_guardian_name || "";
    $("eMobile").value = s?.parent_contact_no || "";
    $("eAltMobile").value = s?.alternate_contact_no || "";
    $("eSchool").value = s?.school_college || "";
    $("eGrade").value = s?.grade || "";
    $("eJerseySize").value = s?.jersey_size || "";
    $("eJerseyPairs").value = s?.jersey_pairs ?? "";
    $("eStatus").value = s?.discontinued ? "discontinued" : "active";
    $("eDiscDate").value = s?.discontinued_at ? String(s.discontinued_at).slice(0, 10) : "";
    $("eDiscDateField").classList.toggle("hide", !s?.discontinued);
    $("eAddress").value = s?.address || "";
    $("editMsg").textContent = "";
    openModal("editModal");
  }

  $("editForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("editMsg");
    const mobile = $("eMobile").value.replace(/\D/g, "");
    const alt = $("eAltMobile").value.replace(/\D/g, "");
    if (mobile && mobile.length !== 10) { msg.textContent = "Mobile number must be 10 digits."; msg.className = "form-msg error"; return; }
    if (alt && alt.length !== 10) { msg.textContent = "Alternate number must be 10 digits."; msg.className = "form-msg error"; return; }

    const discontinued = $("eStatus").value === "discontinued";
    const payload = {
      name: $("eName").value.trim(),
      age: Number($("eAge").value) || null,
      time_slot: $("eSlot").value,
      join_date: $("eJoinDate").value,
      father_guardian_name: $("eGuardian").value.trim(),
      parent_contact_no: mobile,
      alternate_contact_no: alt,
      school_college: $("eSchool").value.trim(),
      grade: $("eGrade").value.trim(),
      jersey_size: $("eJerseySize").value,
      jersey_pairs: Math.max(0, Math.floor(Number($("eJerseyPairs").value) || 0)),
      discontinued,
      discontinued_at: discontinued ? ($("eDiscDate").value || todayIso()) : null,
      address: $("eAddress").value.trim(),
      updated_by: email,
    };

    $("editSaveBtn").disabled = true;
    msg.textContent = "Saving…"; msg.className = "form-msg";
    let error;
    if (editingId) {
      ({ error } = await client.from("students").update(payload).eq("id", editingId));
    } else {
      payload.fees_paid = false;
      ({ error } = await client.from("students").insert(payload));
    }
    $("editSaveBtn").disabled = false;
    if (error) { msg.textContent = error.message; msg.className = "form-msg error"; return; }
    closeModal("editModal");
    toast(editingId ? "Player updated ✔" : "Player added ✔");
    await load();
  });

  /* ---- record payment (v2: segmented type, plan chips, due preview) ---- */
  let prTypeVal = "renewal";
  let prPlanVal = "monthly";
  function planMonths(k) { return (FEES.plans[k] || FEES.plans.monthly).months; }
  function addM(iso, m) { return addMonths(iso, m); }

  function defaultAmount() {
    if (prPlanVal === "custom") return "";
    if (prTypeVal === "joining") return joiningBreakdown(prPlanVal, payingStudent?.jersey_pairs || 0).total;
    return renewalAmount(prPlanVal);
  }
  function cycleStart() {
    if (!payingStudent) return todayIso();
    if (prTypeVal === "joining") return payingStudent.join_date || todayIso();
    return nextDue(payingStudent) || todayIso();
  }
  function renderPlanChips() {
    const plans = [
      { k: "monthly", l: "Monthly", a: prTypeVal === "joining" ? joiningBreakdown("monthly", payingStudent?.jersey_pairs || 0).total : 3500 },
      { k: "quarterly", l: "3 months · 5% off", a: prTypeVal === "joining" ? joiningBreakdown("quarterly", payingStudent?.jersey_pairs || 0).total : 9975 },
      { k: "halfyearly", l: "6 months · 10% off", a: prTypeVal === "joining" ? joiningBreakdown("halfyearly", payingStudent?.jersey_pairs || 0).total : 18900 },
      { k: "special", l: "Special training", a: prTypeVal === "joining" ? joiningBreakdown("special", payingStudent?.jersey_pairs || 0).total : 10000 },
      { k: "custom", l: "Custom amount", a: null },
    ];
    $("prPlanChips").innerHTML = plans.map((p) => `
      <button type="button" class="plan-chip ${p.k === prPlanVal ? "active" : ""}" data-plan="${p.k}">
        <span class="pl">${p.l}</span>
        <span class="pa num">${p.a === null ? "Enter amount" : fmtMoney(p.a)}</span>
      </button>`).join("");
  }
  function refreshPayForm() {
    [...$("prTypeSeg").children].forEach((b) => b.classList.toggle("active", b.dataset.type === prTypeVal));
    renderPlanChips();
    const amt = defaultAmount();
    if (amt !== "") $("prAmount").value = amt;
    const start = cycleStart();
    const months = planMonths(prPlanVal);
    const newDue = addM(start, months);
    $("prPreview").innerHTML = prTypeVal === "joining"
      ? `Records the <strong>joining fee</strong> (coaching + ₹500 admission${payingStudent?.jersey_pairs ? " + jersey" : ""}). Cycle starts on the join date <strong>${fmtDate(start)}</strong> · next fee due <strong>${fmtDate(newDue)}</strong>.`
      : `Covers <strong>${fmtDate(start)} → ${fmtDate(newDue)}</strong> (${months} month${months > 1 ? "s" : ""}). New due date <strong>${fmtDate(newDue)}</strong> — follows the joining-day cycle, not the payment date.`;
  }
  $("prTypeSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]");
    if (!b) return;
    prTypeVal = b.dataset.type;
    refreshPayForm();
  });
  $("prPlanChips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-plan]");
    if (!chip) return;
    prPlanVal = chip.dataset.plan;
    refreshPayForm();
    if (prPlanVal === "custom") { $("prAmount").value = ""; $("prAmount").focus(); }
  });

  function openPay(s) {
    payingStudent = s;
    $("prTitle").textContent = "Record payment";
    $("prWho").textContent = s.name;
    const st = feeState(s);
    const due = s.fees_paid && !s.discontinued ? nextDue(s) : null;
    $("prCurrentDue").textContent = !s.fees_paid ? "Joining fee pending" : due ? `Current due ${fmtDate(due)}` : "No due on record";
    $("prCurrentDue").className = `pill ${st.cls}`;
    prTypeVal = s.fees_paid ? "renewal" : "joining";
    prPlanVal = "monthly";
    $("prDate").value = todayIso();
    $("prComment").value = "";
    $("prMsg").textContent = "";
    refreshPayForm();
    openModal("payRecordModal");
  }

  $("payRecordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!payingStudent) return;
    const msg = $("prMsg");
    const isJoining = prTypeVal === "joining";
    const plan = prPlanVal;
    $("prSaveBtn").disabled = true;
    msg.textContent = "Saving payment…"; msg.className = "form-msg";

    const { error: payError } = await client.from("student_payments").insert({
      student_id: payingStudent.id,
      payment_type: isJoining ? "joining" : "renewal",
      plan_type: plan,
      cycle_start_date: cycleStart(),
      months_covered: planMonths(plan),
      amount: Number($("prAmount").value) || 0,
      paid_on: $("prDate").value || todayIso(),
      comment: $("prComment").value.trim() || (isJoining ? "Joining fee recorded by manager." : "Renewal recorded by manager."),
      recorded_by: email,
    });
    if (payError) {
      $("prSaveBtn").disabled = false;
      msg.textContent = payError.message; msg.className = "form-msg error";
      return;
    }

    const update = { updated_by: email, discontinued: false };
    if (isJoining) {
      update.fees_paid = true;
      update.amount_paid = Number($("prAmount").value) || 0;
    }
    const { error: stuError } = await client.from("students").update(update).eq("id", payingStudent.id);
    $("prSaveBtn").disabled = false;
    if (stuError) { msg.textContent = stuError.message; msg.className = "form-msg error"; return; }

    closeModal("payRecordModal");
    toast("Payment recorded ✔");
    await load();
  });

  /* ---- pending admissions (review queue moved here from its own tab) ---- */
  async function loadAdmissions() {
    const sec = $("pendingAdmissions");
    const { data, error } = await client
      .from("admissions").select("*").eq("review_status", "pending").order("created_at", { ascending: true });
    if (error) { sec.hidden = true; return; }
    const rows = data || [];
    $("pendingPill").textContent = `${rows.length} pending`;
    sec.hidden = rows.length === 0;
    $("pendingList").innerHTML = rows.map((a) => `
      <article class="pa-item">
        <div class="pa-main">
          <div class="pa-name">${esc(a.applicant_name)} <span class="faint" style="font-weight:500;font-size:12px;">Reg ${esc(a.registration_no || a.id)}</span></div>
          <div class="pa-meta">${esc(a.age ?? "—")} yrs · ${esc(a.time_slot || "—")} · ${esc(a.fee_plan || "monthly")} · ${fmtMoney(a.total_fee_amount || 0)}${a.amount_paid > 0 ? ` · claims paid ${fmtMoney(a.amount_paid)}` : ""}${a.father_guardian_name ? ` · ${esc(a.father_guardian_name)}` : ""}</div>
        </div>
        <div class="pa-actions">
          <button class="btn btn-primary btn-sm" data-approve="${a.id}">Approve</button>
          <button class="btn btn-ghost btn-sm" data-reject="${a.id}">Reject</button>
        </div>
      </article>`).join("");
  }
  document.addEventListener("click", async (e) => {
    const approve = e.target.closest("[data-approve]");
    const reject = e.target.closest("[data-reject]");
    if (!approve && !reject) return;
    const btn = approve || reject;
    const id = btn.dataset.approve || btn.dataset.reject;
    if (reject && !confirm("Reject and remove this admission request?")) return;
    btn.disabled = true;
    btn.textContent = approve ? "Approving…" : "Rejecting…";
    let error;
    if (approve) {
      ({ error } = await client.rpc("approve_admission", { p_admission_id: id, p_reviewed_by: email, p_review_notes: "" }));
    } else {
      ({ error } = await client.from("admissions").delete().eq("id", id));
    }
    if (error) {
      toast(error.message || "Unable to update admission.");
      btn.disabled = false;
      btn.textContent = approve ? "Approve" : "Reject";
      return;
    }
    toast(approve ? "Admission approved — player added to roster ✔" : "Admission rejected.");
    await Promise.all([loadAdmissions(), load()]);
  });

  /* ---- realtime ---- */
  client.channel("roster-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => load())
    .on("postgres_changes", { event: "*", schema: "public", table: "student_payments" }, () => load())
    .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => load())
    .on("postgres_changes", { event: "*", schema: "public", table: "admissions" }, () => loadAdmissions())
    .subscribe();

  await load();
  await loadAdmissions();
})();
