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
  let slotFilter = "";
  let editingId = null;
  let payingStudent = null;

  /* ---- selects ---- */
  cfg.timeSlots.forEach((s) => {
    $("eSlot").insertAdjacentHTML("beforeend", `<option value="${s}">${s}</option>`);
  });
  cfg.jerseySizes.forEach((s) => {
    $("eJerseySize").insertAdjacentHTML("beforeend", `<option value="${s}">${s}</option>`);
    $("jerseyFilter").insertAdjacentHTML("beforeend", `<option value="${s}">${s}</option>`);
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
    const [sRes, pRes] = await Promise.all([
      client.from("students").select("*").order("name", { ascending: true }),
      client.from("student_payments").select("student_id, payment_type, cycle_start_date, months_covered"),
    ]);
    if (sRes.error) return toast(sRes.error.message);
    loadedOnce = true;
    students = sRes.data || [];
    payments = pRes.data || [];
    renderSlots();
    render();
  }

  /* ---- slot chips ---- */
  function renderSlots() {
    const activeBySlot = {};
    students.filter((s) => !s.discontinued).forEach((s) => {
      activeBySlot[s.time_slot] = (activeBySlot[s.time_slot] || 0) + 1;
    });
    $("slotChips").innerHTML = cfg.timeSlots.map((s) =>
      `<button type="button" class="chip ${slotFilter === s ? "active" : ""}" data-slot="${s}">${s} · ${activeBySlot[s] || 0}</button>`
    ).join("");
  }
  $("slotChips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-slot]");
    if (!chip) return;
    slotFilter = slotFilter === chip.dataset.slot ? "" : chip.dataset.slot;
    renderSlots();
    render();
  });

  /* ---- filtering ---- */
  function filtered() {
    const q = $("searchInput").value.trim().toLowerCase();
    const status = $("statusFilter").value;
    const fee = $("feeFilter").value;
    const type = $("typeFilter").value;
    const jersey = $("jerseyFilter").value;
    const retIds = returningIds();
    return students.filter((s) => {
      if (q && !String(s.name || "").toLowerCase().includes(q)) return false;
      if (status === "active" && s.discontinued) return false;
      if (status === "discontinued" && !s.discontinued) return false;
      if (slotFilter && s.time_slot !== slotFilter) return false;
      if (jersey === "not-set" && s.jersey_size) return false;
      if (jersey !== "all" && jersey !== "not-set" && String(s.jersey_size) !== jersey) return false;
      if (type === "new" && retIds.has(s.id)) return false;
      if (type === "returning" && !retIds.has(s.id)) return false;
      const st = feeState(s);
      if (fee === "paid" && st.label !== "Paid") return false;
      if (fee === "not-paid" && st.label === "Paid") return false;
      if (fee === "overdue" && st.label !== "Renewal due") return false;
      return true;
    });
  }
  let shownCount = 30;
  ["searchInput", "statusFilter", "feeFilter", "typeFilter", "jerseyFilter"].forEach((id) =>
    $(id).addEventListener("input", () => { shownCount = 30; render(); })
  );
  $("showMoreBtn").addEventListener("click", () => { shownCount += 30; render(); });

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
        <td><span class="t-name" data-open="${s.id}">${esc(s.name)}</span></td>
        <td class="num">${esc(s.age ?? "—")}</td>
        <td>${esc(s.time_slot || "—")}</td>
        <td class="num">${fmtDate(s.join_date)}</td>
        <td><span class="pill ${st.cls}">${st.label}</span></td>
        <td class="num">${due ? fmtDate(due) : "—"}</td>
        <td class="num">${esc(s.jersey_size || "—")}${s.jersey_pairs ? ` ×${s.jersey_pairs}` : ""}</td>
        <td class="num">${esc(s.parent_contact_no || "—")}</td>
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
          <span class="rc-name t-name" data-open="${s.id}">${esc(s.name)}</span>
          <span class="pill ${st.cls}">${st.label}</span>
        </div>
        <div class="rc-meta">
          <span class="pill">${esc(s.time_slot || "—")}</span>
          <span class="pill">Age ${esc(s.age ?? "—")}</span>
          <span class="pill">Joined ${fmtDate(s.join_date)}</span>
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

  /* ---- realtime ---- */
  client.channel("roster-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => load())
    .on("postgres_changes", { event: "*", schema: "public", table: "student_payments" }, () => load())
    .subscribe();

  await load();
})();
