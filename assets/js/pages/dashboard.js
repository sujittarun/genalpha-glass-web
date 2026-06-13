/* Manager dashboard — KPIs, animated growth area chart, fee-collection donut,
   sparklines and a compact "needs attention" card. */
(async function () {
  const { client, esc, fmtMoney, todayIso } = window.GA;
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

  /* ---------- KPIs ---------- */
  const renewedIds = new Set(payments.filter((p) => p.payment_type === "renewal").map((p) => p.student_id));
  const returning = active.filter((s) => renewedIds.has(s.id)).length;
  $("statActive").textContent = active.length;
  $("statJoined").textContent = students.length;
  $("statReturning").textContent = returning;
  $("statPending").textContent = pendingRes.count ?? 0;
  $("returnRate").textContent = active.length ? `${Math.round((returning / active.length) * 100)}% of active` : "—";

  /* ---------- monthly series (last 12 months) ---------- */
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-IN", { month: "short" }), joined: 0 });
  }
  const mIndex = new Map(months.map((m, i) => [m.key, i]));
  const firstKey = months[0].key;
  let baseCount = 0; // players registered before the window
  students.forEach((s) => {
    const k = String(s.join_date || "").slice(0, 7);
    if (mIndex.has(k)) months[mIndex.get(k)].joined++;
    else if (k && k < firstKey) baseCount++;
  });
  let run = baseCount;
  const cumulative = months.map((m) => (run += m.joined));
  $("growthTotal").textContent = `${students.length} total`;

  /* ---------- growth area chart (animated + interactive) ---------- */
  function renderGrowth() {
    const host = $("growthHost"), tip = $("growthTip");
    const W = 620, H = 240, pad = 14, padB = 26, n = cumulative.length;
    const innerW = W - pad * 2, innerH = H - 14 - padB;
    const max = Math.max(...cumulative), min = Math.min(...cumulative);
    const span = Math.max(1, max - min);
    const lo = Math.max(0, min - span * 0.25), hi = max + span * 0.15;
    const X = (i) => pad + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
    const Y = (v) => 14 + innerH - ((v - lo) / Math.max(1, hi - lo)) * innerH;

    // smooth path via quadratic midpoints
    let d = `M ${X(0)} ${Y(cumulative[0])}`;
    for (let i = 1; i < n; i++) {
      const xc = (X(i - 1) + X(i)) / 2, yc = (Y(cumulative[i - 1]) + Y(cumulative[i])) / 2;
      d += ` Q ${X(i - 1)} ${Y(cumulative[i - 1])} ${xc} ${yc}`;
    }
    d += ` T ${X(n - 1)} ${Y(cumulative[n - 1])}`;
    const area = `${d} L ${X(n - 1)} ${14 + innerH} L ${X(0)} ${14 + innerH} Z`;

    const grid = [0.5, 1].map((g) => `<line class="g" x1="${pad}" y1="${14 + innerH * g}" x2="${W - pad}" y2="${14 + innerH * g}"/>`).join("");
    const dots = cumulative.map((v, i) => `<circle class="area-dot" data-i="${i}" cx="${X(i)}" cy="${Y(v)}" r="4.5"/>`).join("");
    const labels = months.map((m, i) => (i % 2 === 0 ? `<text class="chart-xlabel" x="${X(i)}" y="${H - 6}" text-anchor="middle">${m.label}</text>` : "")).join("");

    host.insertAdjacentHTML("afterbegin",
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <g class="chart-grid">${grid}</g>
        <line class="area-guide" id="gGuide" x1="0" y1="14" x2="0" y2="${14 + innerH}"/>
        <path class="area-fill" d="${area}" fill="url(#gaAreaGrad)"/>
        <path class="area-line" d="${d}"/>
        ${dots}${labels}
      </svg>`);

    const line = host.querySelector(".area-line");
    const fill = host.querySelector(".area-fill");
    const guide = host.querySelector("#gGuide");
    const dotEls = [...host.querySelectorAll(".area-dot")];
    const L = line.getTotalLength();
    line.style.strokeDasharray = L; line.style.strokeDashoffset = L;
    requestAnimationFrame(() => { line.style.transition = "stroke-dashoffset 1.5s ease"; line.style.strokeDashoffset = "0"; fill.classList.add("in"); });

    const rect = () => host.getBoundingClientRect();
    host.addEventListener("pointermove", (e) => {
      const r = rect(), frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const i = Math.round(frac * (n - 1));
      const xFrac = X(i) / W, yFrac = Y(cumulative[i]) / H;
      dotEls.forEach((dt, j) => dt.classList.toggle("act", j === i));
      guide.setAttribute("x1", X(i)); guide.setAttribute("x2", X(i));
      tip.style.left = `${xFrac * r.width}px`;
      tip.style.top = `${yFrac * r.height}px`;
      tip.innerHTML = `<span class="tv">${cumulative[i]}</span> players · ${months[i].label}`;
      tip.classList.add("show");
    });
    host.addEventListener("pointerleave", () => { tip.classList.remove("show"); dotEls.forEach((dt) => dt.classList.remove("act")); });
  }
  renderGrowth();

  /* ---------- sparklines ---------- */
  function spark(id, values, color) {
    const el = $(id); if (!el) return;
    const n = values.length, max = Math.max(1, ...values), bw = 120 / n;
    el.innerHTML = values.map((v, i) =>
      `<rect x="${i * bw + 1}" y="${34 - (v / max) * 32}" width="${bw - 2}" height="${(v / max) * 32}" rx="1.5" fill="${color}" style="animation-delay:${i * 0.04}s"/>`
    ).join("");
  }
  spark("sparkJoined", months.map((m) => m.joined), "var(--gold-500)");
  spark("sparkActive", cumulative, "var(--blue-300)");

  /* ---------- fee collection (compact pill, no chart) ---------- */
  const paid = active.filter((s) => s.fees_paid).length;
  const pct = active.length ? Math.round((paid / active.length) * 100) : 0;
  $("collectedPill").textContent = `${pct}% fees collected`;

  /* ---------- needs attention ---------- */
  const byStudent = new Map();
  payments.forEach((p) => {
    if (p.payment_type !== "joining" && p.payment_type !== "renewal") return;
    if (!byStudent.has(p.student_id)) byStudent.set(p.student_id, []);
    byStudent.get(p.student_id).push(p);
  });
  function addMonths(iso, m) {
    const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
    d.setMonth(d.getMonth() + m);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function nextDue(student) {
    const list = (byStudent.get(student.id) || []).filter((p) => p.cycle_start_date);
    if (!list.length) return student.join_date ? addMonths(student.join_date, 1) : null;
    let latest = null;
    list.forEach((p) => { const end = addMonths(p.cycle_start_date, Math.max(1, Number(p.months_covered) || 1)); if (!latest || end > latest) latest = end; });
    return latest;
  }
  const today = todayIso();
  const joiningPending = active.filter((s) => !s.fees_paid);
  const renewalDue = active.filter((s) => s.fees_paid).map((s) => ({ s, due: nextDue(s) })).filter((x) => x.due && x.due <= today).map((x) => x.s);

  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  function avatars(list) {
    const shown = list.slice(0, 4).map((s) => `<span class="av" title="${esc(s.name)}">${esc(initials(s.name))}</span>`).join("");
    const more = list.length > 4 ? `<span class="av more">+${list.length - 4}</span>` : "";
    return shown + more || '<span class="faint" style="font-size:12.5px;">All clear 🎉</span>';
  }
  $("joiningCount").textContent = joiningPending.length;
  $("renewalCount").textContent = renewalDue.length;
  $("joiningAvatars").innerHTML = avatars(joiningPending);
  $("renewalAvatars").innerHTML = avatars(renewalDue);
})();
