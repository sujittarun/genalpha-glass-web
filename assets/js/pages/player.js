/* Player profile — details, attendance stats, payments, timeline */
(async function () {
  const { client, esc, fmtDate, fmtMoney, todayIso } = window.GA;
  const session = await window.GA.initManagerPage("roster");
  if (!session) return;
  const $ = (id) => document.getElementById(id);

  const id = new URLSearchParams(location.search).get("id");
  if (!id) { $("pName").textContent = "No player selected."; return; }

  const [sRes, aRes, pRes, tRes] = await Promise.all([
    client.from("students").select("*").eq("id", id).single(),
    client.from("attendance").select("attendance_date").eq("student_id", id).order("attendance_date", { ascending: false }).limit(500),
    client.from("student_payments").select("*").eq("student_id", id).order("paid_on", { ascending: false }),
    client.from("student_timeline").select("*").eq("student_id", id).order("created_at", { ascending: false }).limit(40),
  ]);

  if (sRes.error || !sRes.data) { $("pName").textContent = "Player not found."; return; }
  const s = sRes.data;
  const att = aRes.data || [];
  const pays = pRes.data || [];
  const timeline = tRes.data || [];

  /* hero */
  document.title = `${s.name} — Gen Alpha Manager`;
  $("avatar").textContent = String(s.name || "?").trim().slice(0, 1).toUpperCase();
  $("pName").textContent = s.name;
  const renewals = pays.filter((p) => p.payment_type === "renewal").length;
  $("pMeta").innerHTML = [
    `<span class="pill ${s.discontinued ? "red" : "green"}">${s.discontinued ? `Discontinued ${fmtDate(s.discontinued_at)}` : "Active"}</span>`,
    `<span class="pill blue">${esc(s.time_slot || "—")}</span>`,
    `<span class="pill">Age ${esc(s.age ?? "—")}</span>`,
    `<span class="pill">Joined ${fmtDate(s.join_date)}</span>`,
    renewals ? `<span class="pill gold">${renewals} renewal${renewals > 1 ? "s" : ""}</span>` : "",
  ].join("");

  /* stats */
  $("sDays").textContent = att.length;
  $("sDaysLast").textContent = att.length ? `Last attended ${fmtDate(att[0].attendance_date)}` : "No attendance yet";

  function monthsBetween(a, b) {
    const d1 = new Date(`${a}T00:00:00`), d2 = new Date(`${b}T00:00:00`);
    return Math.max(0, (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()));
  }
  const endDate = s.discontinued && s.discontinued_at ? String(s.discontinued_at).slice(0, 10) : todayIso();
  $("sMonths").textContent = s.join_date ? monthsBetween(s.join_date, endDate) : "—";

  const totalPaid = pays.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  $("sPaid").textContent = fmtMoney(totalPaid);
  $("sPaidCount").textContent = `${pays.length} payment${pays.length === 1 ? "" : "s"} recorded`;

  function addMonths(iso, m) {
    const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
    d.setMonth(d.getMonth() + m);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  let due = null;
  const cyclePays = pays.filter((p) => p.cycle_start_date && (p.payment_type === "joining" || p.payment_type === "renewal"));
  if (cyclePays.length) {
    cyclePays.forEach((p) => {
      const e = addMonths(p.cycle_start_date, Math.max(1, Number(p.months_covered) || 1));
      if (!due || e > due) due = e;
    });
  } else if (s.join_date) due = addMonths(s.join_date, 1);
  if (s.discontinued) {
    $("sDue").textContent = "—"; $("sDueState").textContent = "Tracking paused";
  } else if (!s.fees_paid) {
    $("sDue").textContent = "Joining"; $("sDueState").textContent = "Joining fee pending";
  } else {
    $("sDue").textContent = due ? fmtDate(due) : "—";
    $("sDueState").textContent = due && due <= todayIso() ? "⚠ Renewal overdue" : "On track";
  }

  /* details */
  const tel = (n) => (n ? `<a class="v num" href="tel:${esc(n)}">${esc(n)}</a>` : `<span class="v">—</span>`);
  $("detailGrid").innerHTML = [
    ["Father / guardian", `<span class="v">${esc(s.father_guardian_name || "—")}</span>`],
    ["Parent contact", tel(s.parent_contact_no)],
    ["Alternate contact", tel(s.alternate_contact_no)],
    ["School", `<span class="v">${esc(s.school_college || "—")}${s.grade ? ` · ${esc(s.grade)}` : ""}</span>`],
    ["Jersey", `<span class="v">${esc(s.jersey_size || "Not set")}${s.jersey_pairs ? ` × ${s.jersey_pairs} pair(s)` : ""}</span>`],
    ["Fee plan", `<span class="v">${esc(s.fee_plan || "monthly")}</span>`],
    ["Joining amount", `<span class="v num">${fmtMoney(s.amount_paid || 0)}</span>`],
    ["Address", `<span class="v">${esc(s.address || "—")}</span>`],
    ["Last updated by", `<span class="v">${esc(s.updated_by || "—")}</span>`],
  ].map(([l, v]) => `<div class="d-item"><span class="l">${l}</span>${v}</div>`).join("");

  /* ---- activity feed: payments + timeline merged chronologically ---- */
  const PAY_LABEL = { joining: "Joining fee", renewal: "Renewal payment", jersey: "Jersey payment", jersey_refund: "Jersey refund" };
  function eventKind(t) {
    const k = String(t.event_type || t.title || "").toLowerCase();
    if (/payment|fee|paid|renew/.test(k)) return "pay";
    if (/attend|present|training/.test(k)) return "att";
    if (/fail|overdue|alert|discontinu|reject/.test(k)) return "alert";
    return "msg";
  }
  const feedItems = [
    ...pays.map((p) => ({
      kind: "pay", isPayment: true,
      date: String(p.paid_on || p.created_at || "").slice(0, 10),
      title: PAY_LABEL[p.payment_type] || p.payment_type || "Payment",
      desc: `${p.plan_type ? p.plan_type + " · " : ""}cycle ${fmtDate(p.cycle_start_date)} +${p.months_covered || 1}m${p.recorded_by ? " · by " + p.recorded_by : ""}`,
      amount: Number(p.amount) || 0,
    })),
    ...timeline.map((t) => ({
      kind: eventKind(t), isPayment: false,
      date: String(t.created_at || "").slice(0, 10),
      title: t.title || t.event_type || "Event",
      desc: t.description || "",
      amount: null,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const ICO = {
    pay: "₹",
    att: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    alert: "!",
    msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.6 8.6 0 0 1-3.7-.8L3 20l1-5.5a8.2 8.2 0 0 1-.9-3.7A8.4 8.4 0 0 1 11.6 2.5h.9a8.4 8.4 0 0 1 8.5 8.1z"/></svg>',
  };

  let feedFilterKey = "all";
  let feedShown = 12;
  function renderFeed() {
    const list = feedItems.filter((f) =>
      feedFilterKey === "all" ? true : feedFilterKey === "pay" ? f.isPayment : !f.isPayment
    );
    const visible = list.slice(0, feedShown);
    $("feed").innerHTML = visible.length ? visible.map((f) => `
      <div class="feed-item">
        <span class="feed-ico ${f.kind}">${ICO[f.kind] || ICO.msg}</span>
        <div class="feed-body">
          <div class="feed-title">${esc(f.title)}</div>
          ${f.desc ? `<div class="feed-desc">${esc(f.desc)}</div>` : ""}
        </div>
        <div class="feed-side">
          ${f.amount !== null ? `<div class="feed-amt num">${fmtMoney(f.amount)}</div>` : ""}
          <div class="feed-date">${fmtDate(f.date)}</div>
        </div>
      </div>`).join("") : `<p class="empty-state">No activity yet.</p>`;
    $("feedMore").classList.toggle("hide", list.length <= feedShown);
  }
  $("feedFilter").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-feed]");
    if (!chip) return;
    feedFilterKey = chip.dataset.feed;
    feedShown = 12;
    [...$("feedFilter").children].forEach((c) => c.classList.toggle("active", c === chip));
    renderFeed();
  });
  $("feedMore").addEventListener("click", () => { feedShown += 20; renderFeed(); });
  renderFeed();
})();
