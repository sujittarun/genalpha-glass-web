/* Finance — revenue (student_payments) vs expenses (academy_expenses) */
(async function () {
  const { client, cfg, esc, fmtDate, fmtMoney, todayIso, toast, openModal, closeModal, managerEmail } = window.GA;
  const session = await window.GA.initManagerPage("finance");
  if (!session) return;
  const email = managerEmail(session);
  const $ = (id) => document.getElementById(id);

  let payments = [];
  let expenses = [];
  let rangeMode = "this-month";
  let finChartState = null;

  cfg.expenseTypes.forEach((t) => $("xType").insertAdjacentHTML("beforeend", `<option>${t}</option>`));
  cfg.expensePaidBy.forEach((p) => $("xPaidBy").insertAdjacentHTML("beforeend", `<option>${p}</option>`));
  $("xDate").value = todayIso();

  /* ---- range ---- */
  function isoOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  function currentRange() {
    const from = $("fromDate").value, to = $("toDate").value;
    if (from || to) return { start: from || "0000-01-01", end: to || "9999-12-31" };
    const now = new Date();
    if (rangeMode === "this-month") return { start: isoOf(new Date(now.getFullYear(), now.getMonth(), 1)), end: todayIso() };
    if (rangeMode === "last-month") return {
      start: isoOf(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end: isoOf(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
    if (rangeMode === "3m") return { start: isoOf(new Date(now.getFullYear(), now.getMonth() - 2, 1)), end: todayIso() };
    if (rangeMode === "year") return { start: `${now.getFullYear()}-01-01`, end: todayIso() };
    return { start: "0000-01-01", end: "9999-12-31" };
  }
  $("rangeChips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-range]");
    if (!chip) return;
    rangeMode = chip.dataset.range;
    $("fromDate").value = ""; $("toDate").value = "";
    [...$("rangeChips").children].forEach((c) => c.classList.toggle("active", c === chip));
    render();
  });
  ["fromDate", "toDate"].forEach((id) => $(id).addEventListener("change", () => {
    [...$("rangeChips").children].forEach((c) => c.classList.remove("active"));
    render();
  }));

  /* ---- revenue vs expenses chart (animated dual-series + tooltip) ---- */
  function drawFinChart(months) {
    const host = $("finChart");
    const W = 620, H = 240, pad = 14, padB = 26, n = months.length;
    const innerW = W - pad * 2, innerH = H - 14 - padB;
    const max = Math.max(1, ...months.map((m) => Math.max(m.rev, m.exp)));
    const X = (i) => pad + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
    const Y = (v) => 14 + innerH - (v / max) * innerH;
    // straight segments through the real data points — accurate, no overshoot
    const smooth = (vals) => "M " + vals.map((v, i) => `${X(i)} ${Y(v)}`).join(" L ");
    const revLine = smooth(months.map((m) => m.rev)), expLine = smooth(months.map((m) => m.exp));
    const revArea = `${revLine} L ${X(n - 1)} ${14 + innerH} L ${X(0)} ${14 + innerH} Z`;
    const grid = [0.5, 1].map((g) => `<line x1="${pad}" y1="${14 + innerH * g}" x2="${W - pad}" y2="${14 + innerH * g}"/>`).join("");
    const labels = months.map((m, i) => (i % 2 === 0 ? `<text class="chart-xlabel" x="${X(i)}" y="${H - 6}" text-anchor="middle">${m.label}</text>` : "")).join("");
    const dots = months.map((m, i) => `<circle class="fin-dot rev" data-i="${i}" cx="${X(i)}" cy="${Y(m.rev)}" r="4"/><circle class="fin-dot exp" data-i="${i}" cx="${X(i)}" cy="${Y(m.exp)}" r="4"/>`).join("");

    host.querySelector("svg")?.remove();
    host.insertAdjacentHTML("afterbegin",
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <g class="chart-grid">${grid}</g>
        <line class="area-guide" id="finGuide" x1="0" y1="14" x2="0" y2="${14 + innerH}"/>
        <path class="fin-rev-fill" d="${revArea}" fill="url(#gaRevArea)"/>
        <path class="fin-rev-line" d="${revLine}"/>
        <path class="fin-exp-line" d="${expLine}"/>
        ${dots}${labels}
      </svg>`);
    const fill = host.querySelector(".fin-rev-fill");
    host.querySelectorAll(".fin-rev-line, .fin-exp-line").forEach((p) => {
      const L = p.getTotalLength();
      p.style.strokeDasharray = L; p.style.strokeDashoffset = L;
      requestAnimationFrame(() => { p.style.transition = "stroke-dashoffset 1.4s ease"; p.style.strokeDashoffset = "0"; });
    });
    requestAnimationFrame(() => fill.classList.add("in"));
    finChartState = { months, X, Y, W, H, n };
  }
  $("finChart").addEventListener("pointermove", (e) => {
    const s = finChartState; if (!s) return;
    const host = $("finChart"), tip = $("finTip"), r = host.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const i = Math.round(frac * (s.n - 1)), m = s.months[i];
    host.querySelectorAll(".fin-dot").forEach((d) => d.classList.toggle("act", Number(d.dataset.i) === i));
    const guide = host.querySelector("#finGuide"); if (guide) { guide.setAttribute("x1", s.X(i)); guide.setAttribute("x2", s.X(i)); }
    tip.style.left = `${(s.X(i) / s.W) * r.width}px`;
    tip.style.top = `${(Math.min(s.Y(m.rev), s.Y(m.exp)) / s.H) * r.height}px`;
    tip.innerHTML = `<div style="margin-bottom:2px;">${m.label}</div><div><span class="tv gold">${fmtMoney(m.rev)}</span> revenue</div><div><span class="tv" style="color:var(--tx-red)">${fmtMoney(m.exp)}</span> expenses</div>`;
    tip.classList.add("show");
  });
  $("finChart").addEventListener("pointerleave", () => {
    $("finTip").classList.remove("show");
    $("finChart").querySelectorAll(".fin-dot").forEach((d) => d.classList.remove("act"));
  });

  /* ---- load ---- */
  async function load() {
    const [pRes, eRes] = await Promise.all([
      client.from("student_payments").select("*").order("paid_on", { ascending: false }),
      client.from("academy_expenses").select("*").order("expense_date", { ascending: false }),
    ]);
    if (pRes.error) toast(pRes.error.message);
    payments = pRes.data || [];
    expenses = eRes.data || [];
    render();
  }

  const payDate = (p) => String(p.paid_on || p.created_at || "").slice(0, 10);
  const expDate = (x) => String(x.expense_date || x.created_at || "").slice(0, 10);

  function render() {
    const { start, end } = currentRange();
    const inRange = (d) => d && d >= start && d <= end;
    const rPays = payments.filter((p) => inRange(payDate(p)));
    const rExps = expenses.filter((x) => inRange(expDate(x)));

    const revenue = rPays.reduce((a, p) => a + (Number(p.amount) || 0), 0);
    const joining = rPays.filter((p) => p.payment_type === "joining").reduce((a, p) => a + (Number(p.amount) || 0), 0);
    const renewal = rPays.filter((p) => p.payment_type === "renewal").reduce((a, p) => a + (Number(p.amount) || 0), 0);
    const spent = rExps.reduce((a, x) => a + (Number(x.amount) || 0), 0);

    $("mRevenue").textContent = fmtMoney(revenue);
    $("mJoining").textContent = fmtMoney(joining);
    $("mRenewal").textContent = fmtMoney(renewal);
    $("mExpenses").textContent = fmtMoney(spent);
    $("mExpenseCount").textContent = `${rExps.length} expense entries`;
    $("mNet").textContent = fmtMoney(revenue - spent);
    $("mPayments").textContent = rPays.length;

    /* trend: last 12 months regardless of range */
    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-IN", { month: "short" }), rev: 0, exp: 0 });
    }
    const idx = new Map(months.map((m, i) => [m.key, i]));
    payments.forEach((p) => { const k = payDate(p).slice(0, 7); if (idx.has(k)) months[idx.get(k)].rev += Number(p.amount) || 0; });
    expenses.forEach((x) => { const k = expDate(x).slice(0, 7); if (idx.has(k)) months[idx.get(k)].exp += Number(x.amount) || 0; });
    drawFinChart(months);

    /* expenses list */
    $("expEmpty").classList.toggle("hide", rExps.length > 0);
    $("expBody").innerHTML = rExps.map((x) => `
      <tr>
        <td class="num">${fmtDate(expDate(x))}</td>
        <td>${esc(x.expense_type)}</td>
        <td class="num" style="color:var(--red-400);font-weight:650;">${fmtMoney(x.amount)}</td>
        <td>${esc(x.paid_by || "—")}</td>
        <td class="faint">${esc(x.comment || "")}</td>
        <td><button class="btn btn-ghost btn-sm" data-del="${x.id}">Delete</button></td>
      </tr>`).join("");
    $("expCards").innerHTML = rExps.map((x) => `
      <article class="glass row-card">
        <div class="rc-top"><span class="rc-name">${esc(x.expense_type)}</span><span class="pill red num">${fmtMoney(x.amount)}</span></div>
        <div class="rc-meta"><span class="pill">${fmtDate(expDate(x))}</span><span class="pill">${esc(x.paid_by || "—")}</span></div>
        ${x.comment ? `<p class="faint" style="font-size:12.5px;">${esc(x.comment)}</p>` : ""}
        <div class="rc-actions"><button class="btn btn-glass btn-sm" data-del="${x.id}">Delete</button></div>
      </article>`).join("");
  }

  document.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del]");
    if (!del) return;
    if (!confirm("Delete this expense?")) return;
    del.disabled = true;
    const { error } = await client.from("academy_expenses").delete().eq("id", del.dataset.del);
    if (error) { toast(error.message); del.disabled = false; return; }
    toast("Expense deleted ✔");
    await load();
  });

  /* add expense */
  $("addExpenseBtn").addEventListener("click", () => { $("xMsg").textContent = ""; openModal("expenseModal"); });
  $("expenseForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("xSaveBtn").disabled = true;
    const { error } = await client.from("academy_expenses").insert({
      expense_type: $("xType").value,
      amount: Number($("xAmount").value) || 0,
      comment: $("xComment").value.trim(),
      paid_by: $("xPaidBy").value,
      created_by: email,
      expense_date: $("xDate").value || todayIso(),
    });
    $("xSaveBtn").disabled = false;
    if (error) { $("xMsg").textContent = error.message; $("xMsg").className = "form-msg error"; return; }
    $("expenseForm").reset();
    $("xDate").value = todayIso();
    closeModal("expenseModal");
    toast("Expense added ✔");
    await load();
  });

  /* realtime */
  client.channel("finance-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "academy_expenses" }, () => load())
    .on("postgres_changes", { event: "*", schema: "public", table: "student_payments" }, () => load())
    .subscribe();

  await load();
})();
