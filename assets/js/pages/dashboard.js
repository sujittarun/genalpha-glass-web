/* Manager dashboard — stats, fee alerts, student movement */
(async function () {
  const { client, esc, fmtDate, todayIso } = window.GA;
  const session = await window.GA.initManagerPage("dashboard");
  if (!session) return;

  const $ = (id) => document.getElementById(id);

  const [studentsRes, paymentsRes, pendingRes] = await Promise.all([
    client.from("students").select("*"),
    client.from("student_payments").select("student_id, payment_type, plan_type, cycle_start_date, months_covered, paid_on, amount"),
    client.from("admissions").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
  ]);

  const students = studentsRes.data || [];
  const payments = paymentsRes.data || [];
  const active = students.filter((s) => !s.discontinued);

  /* ---- stats ---- */
  $("statJoined").textContent = students.length;
  $("statActive").textContent = active.length;
  const renewedIds = new Set(payments.filter((p) => p.payment_type === "renewal").map((p) => p.student_id));
  $("statReturning").textContent = active.filter((s) => renewedIds.has(s.id)).length;
  $("statPending").textContent = pendingRes.count ?? 0;

  /* ---- due dates ---- */
  const byStudent = new Map();
  payments.forEach((p) => {
    if (p.payment_type !== "joining" && p.payment_type !== "renewal") return;
    const list = byStudent.get(p.student_id) || [];
    list.push(p);
    byStudent.set(p.student_id, list);
  });
  function addMonths(iso, m) {
    const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
    d.setMonth(d.getMonth() + m);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function nextDue(student) {
    const list = (byStudent.get(student.id) || []).filter((p) => p.cycle_start_date);
    if (!list.length) return student.join_date ? addMonths(student.join_date, 1) : null;
    let latestEnd = null;
    list.forEach((p) => {
      const end = addMonths(p.cycle_start_date, Math.max(1, Number(p.months_covered) || 1));
      if (!latestEnd || end > latestEnd) latestEnd = end;
    });
    return latestEnd;
  }

  const today = todayIso();
  const joiningPending = active.filter((s) => !s.fees_paid);
  const renewalDue = active
    .filter((s) => s.fees_paid)
    .map((s) => ({ s, due: nextDue(s) }))
    .filter((x) => x.due && x.due <= today)
    .sort((a, b) => (a.due < b.due ? -1 : 1));

  /* ---- render alert lists ---- */
  function rowHtml(s, right) {
    return `<div class="alert-row">
      <a href="player.html?id=${encodeURIComponent(s.id)}">${esc(s.name)}</a>
      <span class="faint num" style="font-size:12px;">${right}</span>
    </div>`;
  }
  $("feesDueCount").textContent = joiningPending.length;
  $("feesDueList").innerHTML = joiningPending.length
    ? joiningPending.map((s) => rowHtml(s, `joined ${fmtDate(s.join_date)}`)).join("")
    : `<p class="empty-state">No joining fees pending 🎉</p>`;

  $("renewalDueCount").textContent = renewalDue.length;
  $("renewalDueList").innerHTML = renewalDue.length
    ? renewalDue.map(({ s, due }) => rowHtml(s, `due ${fmtDate(due)}`)).join("")
    : `<p class="empty-state">No renewals overdue 🎉</p>`;

  /* ---- student movement (last 12 months) ---- */
  const now = new Date();
  const monthsArr = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthsArr.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), joined: 0, left: 0 });
  }
  const mIndex = new Map(monthsArr.map((m, i) => [m.key, i]));
  students.forEach((s) => {
    const jk = String(s.join_date || "").slice(0, 7);
    if (mIndex.has(jk)) monthsArr[mIndex.get(jk)].joined++;
    if (s.discontinued && s.discontinued_at) {
      const lk = String(s.discontinued_at).slice(0, 7);
      if (mIndex.has(lk)) monthsArr[mIndex.get(lk)].left++;
    }
  });
  const maxV = Math.max(1, ...monthsArr.map((m) => Math.max(m.joined, m.left)));
  $("movementChart").innerHTML = monthsArr.map((m) => `
    <div class="mv-col">
      <div class="mv-bars">
        <div class="mv-bar joined" style="height:${Math.round((m.joined / maxV) * 100)}%" title="${m.joined} joined"></div>
        <div class="mv-bar left" style="height:${Math.round((m.left / maxV) * 100)}%" title="${m.left} left"></div>
      </div>
      <span class="mv-label">${m.label}</span>
    </div>`).join("");
})();
