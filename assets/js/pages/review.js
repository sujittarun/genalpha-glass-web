/* Admission review queue — approve_admission RPC / reject (delete) */
(async function () {
  const { client, esc, fmtDate, fmtMoney, toast, managerEmail } = window.GA;
  const session = await window.GA.initManagerPage("review");
  if (!session) return;
  const email = managerEmail(session);
  const $ = (id) => document.getElementById(id);

  async function load() {
    const { data, error } = await client
      .from("admissions")
      .select("*")
      .eq("review_status", "pending")
      .order("created_at", { ascending: true });
    if (error) { $("reviewList").innerHTML = `<p class="empty-state">${esc(error.message)}</p>`; return; }
    const rows = data || [];
    $("pendingPill").textContent = `${rows.length} pending`;
    if (!rows.length) {
      $("reviewList").innerHTML = `<p class="empty-state">No admissions waiting for review 🎉</p>`;
      return;
    }
    $("reviewList").innerHTML = rows.map((a) => `
      <article class="glass review-card">
        <div class="rv-head">
          <div>
            <span class="rv-name">${esc(a.applicant_name)}</span>
            <span class="faint" style="font-size:12px;margin-left:8px;">Reg ${esc(a.registration_no || a.id)}</span>
          </div>
          <div class="flex">
            ${a.amount_paid > 0 ? `<span class="pill gold num">Claims paid ${fmtMoney(a.amount_paid)}</span>` : `<span class="pill">Not paid yet</span>`}
            <span class="pill blue">${esc(a.time_slot || "—")}</span>
          </div>
        </div>
        <div class="rv-grid">
          <div class="rv-item"><span class="l">Age / gender</span><span class="v">${esc(a.age ?? "—")} · ${esc(a.gender || "—")}</span></div>
          <div class="rv-item"><span class="l">Guardian</span><span class="v">${esc(a.father_guardian_name || "—")}</span></div>
          <div class="rv-item"><span class="l">Contact</span><span class="v num">${esc(a.parent_contact_no || "—")}</span></div>
          <div class="rv-item"><span class="l">School</span><span class="v">${esc(a.school_college || "—")}${a.grade ? ` · ${esc(a.grade)}` : ""}</span></div>
          <div class="rv-item"><span class="l">Join date</span><span class="v num">${fmtDate(a.join_date)}</span></div>
          <div class="rv-item"><span class="l">Plan / total</span><span class="v num">${esc(a.fee_plan || "monthly")} · ${fmtMoney(a.total_fee_amount || 0)}</span></div>
          <div class="rv-item"><span class="l">Jersey</span><span class="v">${esc(a.jersey_size || "Not set")}${a.jersey_pairs ? ` ×${a.jersey_pairs}` : ""}</span></div>
          <div class="rv-item"><span class="l">Filled by</span><span class="v">${esc(a.filled_by || "Parent / Guardian")}</span></div>
        </div>
        ${a.comments ? `<p class="muted" style="font-size:13px;">“${esc(a.comments)}”</p>` : ""}
        <div class="rv-actions">
          <button class="btn btn-primary" data-approve="${a.id}">Approve to roster</button>
          <button class="btn btn-danger" data-reject="${a.id}">Reject</button>
        </div>
      </article>`).join("");
  }

  document.addEventListener("click", async (e) => {
    const approve = e.target.closest("[data-approve]");
    const reject = e.target.closest("[data-reject]");
    if (!approve && !reject) return;
    const btn = approve || reject;
    const id = btn.dataset.approve || btn.dataset.reject;
    if (reject && !confirm("Reject and remove this admission submission?")) return;
    btn.disabled = true;
    btn.textContent = approve ? "Approving…" : "Rejecting…";

    let error;
    if (approve) {
      ({ error } = await client.rpc("approve_admission", {
        p_admission_id: id,
        p_reviewed_by: email,
        p_review_notes: "",
      }));
    } else {
      ({ error } = await client.from("admissions").delete().eq("id", id));
    }
    if (error) {
      toast(error.message || "Unable to update admission review.");
      btn.disabled = false;
      btn.textContent = approve ? "Approve to roster" : "Reject";
      return;
    }
    toast(approve ? "Admission approved — player added to roster ✔" : "Admission rejected.");
    await load();
  });

  client.channel("review-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "admissions" }, () => load())
    .subscribe();

  await load();
})();
