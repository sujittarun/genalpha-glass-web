/* Public admission page — wired to submit_admission_form RPC (same contract as v1) */
(function () {
  const { client, cfg, toast, fmtMoney, todayIso, openModal } = window.GA;
  const { joiningBreakdown } = window.GA_FEES;
  window.GA.initPublicPage("admission");

  const $ = (id) => document.getElementById(id);

  /* ---- populate selects ---- */
  cfg.timeSlots.forEach((s) => $("timeSlot").insertAdjacentHTML("beforeend", `<option value="${s}">${s}</option>`));
  cfg.jerseySizes.forEach((s) => $("jerseySize").insertAdjacentHTML("beforeend", `<option value="${s}">${s}${s === "38" ? " — Medium" : ""}</option>`));

  // DOB limits: players aged ~4 to 25 years
  const yearNow = new Date().getFullYear();
  $("dob").min = `${yearNow - 25}-01-01`;
  $("dob").max = todayIso();
  $("joinDate").value = todayIso();

  /* ---- registration number preview ---- */
  function extractRegNo(data) {
    if (data == null) return "";
    if (Array.isArray(data)) data = data[0];
    if (typeof data === "object") return data.next_reg_no ?? data.registration_no ?? data.reg_no ?? "";
    return data;
  }
  client.rpc("peek_next_admission_reg_no").then(({ data, error }) => {
    const reg = extractRegNo(data);
    $("regNo").textContent = error || reg === "" ? "Available on submit" : reg;
  });

  /* ---- DOB / age ---- */
  function dobIso() {
    return $("dob").value || "";
  }
  function calcAge(iso) {
    if (!iso) return null;
    const dob = new Date(`${iso}T00:00:00`), now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const beforeBirthday = now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
    if (beforeBirthday) age -= 1;
    return age >= 0 && age < 100 ? age : null;
  }
  $("dob").addEventListener("change", () => {
    const a = calcAge(dobIso());
    $("ageValue").textContent = a === null ? "—" : a;
  });

  /* ---- fee calculator ---- */
  function currentBreakdown() {
    return joiningBreakdown($("feePlan").value, $("jerseyPairs").value, $("customAmount").value);
  }
  function renderFees() {
    const b = currentBreakdown();
    $("feeCoaching").textContent = fmtMoney(b.coachingFee);
    $("feeAdmission").textContent = fmtMoney(b.admissionFee);
    $("feeJersey").textContent = fmtMoney(b.jerseyAmount);
    $("feeTotal").textContent = fmtMoney(b.total);
    $("customAmountField").classList.toggle("hide", $("feePlan").value !== "custom");
  }
  ["feePlan", "jerseyPairs", "customAmount"].forEach((id) => $(id).addEventListener("input", renderFees));
  renderFees();

  /* ---- skills toggle ---- */
  $("readyToStart").addEventListener("change", () => {
    const off = $("readyToStart").checked;
    $("styleOptions").style.opacity = off ? "0.35" : "1";
    $("styleOptions").style.pointerEvents = off ? "none" : "auto";
    if (off) {
      $("styleOptions").querySelectorAll("input").forEach((i) => (i.checked = false));
    }
  });

  /* ---- UPI payment modal ---- */
  let qr = null;
  function upiUrl(amount) {
    const p = cfg.payment;
    const note = encodeURIComponent(`${p.notePrefix} ${$("applicantName").value || ""}`.trim());
    return `upi://pay?pa=${encodeURIComponent(p.upiId)}&pn=${encodeURIComponent(p.payeeName)}&am=${amount}&cu=INR&tn=${note}`;
  }
  $("payNowBtn").addEventListener("click", () => {
    const total = currentBreakdown().total;
    $("payAmount").textContent = fmtMoney(total);
    $("payUpiId").textContent = cfg.payment.upiId;
    const url = upiUrl(total);
    $("payUpiLink").href = url;
    $("payQr").innerHTML = "";
    qr = new QRCode($("payQr"), { text: url, width: 190, height: 190, correctLevel: QRCode.CorrectLevel.M });
    openModal("payModal");
  });

  /* ---- submit ---- */
  const msg = $("admissionMsg");
  function setMsg(text, cls) { msg.textContent = text; msg.className = `form-msg ${cls || ""}`; }

  $("resetBtn").addEventListener("click", () => {
    $("admissionForm").reset();
    $("joinDate").value = todayIso();
    $("ageValue").textContent = "—";
    renderFees();
    setMsg("", "");
  });

  $("admissionForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = $("admissionForm");

    const dob = dobIso();
    const age = calcAge(dob);
    const parentContact = $("parentContact").value.replace(/\D/g, "");
    const alternateContact = $("alternateContact").value.replace(/\D/g, "");

    if (!form.reportValidity()) return;
    if (!dob || age === null) return setMsg("Please complete the date of birth properly.", "error");
    if (parentContact.length !== 10 || alternateContact.length !== 10)
      return setMsg("Parent and alternate contact numbers must be exactly 10 digits.", "error");
    if (!$("consentAccepted").checked || !$("termsAccepted").checked)
      return setMsg("Please accept both consent checkboxes.", "error");

    const b = currentBreakdown();
    const paidForVerification = $("feesPaid").value === "yes";
    const jerseySize = $("jerseySize").value.trim();

    const payload = {
      p_applicant_name: $("applicantName").value.trim(),
      p_nationality: $("nationality").value.trim(),
      p_date_of_birth: dob,
      p_age: age,
      p_gender: $("gender").value,
      p_father_guardian_name: $("guardianName").value.trim(),
      p_alternate_contact_no: alternateContact,
      p_parent_contact_no: parentContact,
      p_city: $("city").value.trim(),
      p_address: $("address").value.trim(),
      p_school_college: $("schoolCollege").value.trim(),
      p_parent_aadhaar_no: $("aadhaar").value.trim(),
      p_time_slot: $("timeSlot").value,
      p_join_date: $("joinDate").value,
      p_fees_paid: false,
      p_amount_paid: paidForVerification ? b.total : 0,
      p_fee_plan: b.planKey,
      p_coaching_fee: b.coachingFee,
      p_admission_fee: b.admissionFee,
      p_jersey_amount: b.jerseyAmount,
      p_total_fee_amount: b.total,
      p_grade: $("grade").value.trim(),
      p_jersey_size: jerseySize,
      p_jersey_pairs: jerseySize ? Math.max(0, Math.floor(Number($("jerseyPairs").value) || 0)) : 0,
      p_payment_method: "UPI",
      p_payment_upi_id: cfg.payment.upiId,
      p_payment_reference: "",
      p_filled_by: $("filledBy").value,
      p_comments: $("comments").value.trim(),
      p_batsman_style: form.querySelector('input[name="batsmanStyle"]:checked')?.value || "",
      p_bowling_styles: [...form.querySelectorAll('input[name="bowlingStyles"]:checked')].map((i) => i.value),
      p_ready_to_start: $("readyToStart").checked,
      p_consent_accepted: true,
      p_terms_accepted: true,
    };

    $("submitBtn").disabled = true;
    setMsg("Submitting admission form…", "");

    const { data, error } = await client.rpc("submit_admission_form", payload);
    $("submitBtn").disabled = false;

    if (error) {
      setMsg(error.message || "Something went wrong. Please try again.", "error");
      return;
    }

    const regNo = extractRegNo(data) || "";
    setMsg(`Admission submitted successfully${regNo ? ` — registration no. ${regNo}` : ""}. The academy will review and confirm shortly. Thank you!`, "ok");
    toast("Admission submitted — pending academy review ✔");
    form.reset();
    $("joinDate").value = todayIso();
    $("ageValue").textContent = "—";
    renderFees();
    client.rpc("peek_next_admission_reg_no").then(({ data: next }) => { const r = extractRegNo(next); if (r) $("regNo").textContent = r; });
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
})();
