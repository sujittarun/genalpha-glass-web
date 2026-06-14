/* Finance — compact tracker: KPIs (with MoM trend + outstanding), revenue mix
   by type, expense categories, partner split, monthly flow with drill-down. */
(async function () {
  const { client, cfg, esc, fmtDate, fmtMoney, todayIso, toast, openModal, closeModal, managerEmail } = window.GA;
  const { FEES } = window.GA_FEES;
  const session = await window.GA.initManagerPage("finance");
  if (!session) return;
  const email = managerEmail(session);
  const $ = (id) => document.getElementById(id);

  let students = [], payments = [], expenses = [];
  let rangeMode = "this-month";
  let months = [], selMonth = 5;

  cfg.expenseTypes.forEach((t) => $("xType").insertAdjacentHTML("beforeend", `<option>${t}</option>`));
  cfg.expensePaidBy.forEach((p) => $("xPaidBy").insertAdjacentHTML("beforeend", `<option>${p}</option>`));
  $("xDate").value = todayIso();

  /* ---------- date helpers ---------- */
  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const payDate = (p) => String(p.paid_on || p.created_at || "").slice(0, 10);
  const expDate = (x) => String(x.expense_date || x.created_at || "").slice(0, 10);
  const num = (v) => Number(v) || 0;

  function currentRange() {
    const from = $("fromDate").value, to = $("toDate").value;
    if (from || to) return { start: from || "0000-01-01", end: to || "9999-12-31" };
    const now = new Date();
    if (rangeMode === "this-month") return { start: isoOf(new Date(now.getFullYear(), now.getMonth(), 1)), end: todayIso() };
    if (rangeMode === "last-month") return { start: isoOf(new Date(now.getFullYear(), now.getMonth() - 1, 1)), end: isoOf(new Date(now.getFullYear(), now.getMonth(), 0)) };
    if (rangeMode === "3m") return { start: isoOf(new Date(now.getFullYear(), now.getMonth() - 2, 1)), end: todayIso() };
    if (rangeMode === "year") return { start: `${now.getFullYear()}-01-01`, end: todayIso() };
    return { start: "0000-01-01", end: "9999-12-31" };
  }
  function prevRange(r) {
    if (r.start === "0000-01-01") return null; // all-time has no comparison
    const s = new Date(`${r.start}T00:00:00`), e = new Date(`${r.end}T00:00:00`);
    const lenDays = Math.round((e - s) / 86400000) + 1;
    const pe = new Date(s); pe.setDate(pe.getDate() - 1);
    const ps = new Date(pe); ps.setDate(ps.getDate() - lenDays + 1);
    return { start: isoOf(ps), end: isoOf(pe) };
  }

  /* ---------- due-date (for outstanding) ---------- */
  function addMonths(iso, m) { const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`); d.setMonth(d.getMonth() + m); return isoOf(d); }
  function nextDue(s) {
    const list = payments.filter((p) => p.student_id === s.id && p.cycle_start_date && (p.payment_type === "joining" || p.payment_type === "renewal"));
    if (!list.length) return s.join_date ? addMonths(s.join_date, 1) : null;
    let end = null;
    list.forEach((p) => { const e = addMonths(p.cycle_start_date, Math.max(1, num(p.months_covered) || 1)); if (!end || e > end) end = e; });
    return end;
  }

  /* ---------- range chips ---------- */
  $("rangeChips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-range]"); if (!chip) return;
    rangeMode = chip.dataset.range; $("fromDate").value = ""; $("toDate").value = "";
    [...$("rangeChips").children].forEach((c) => c.classList.toggle("active", c === chip));
    render();
  });
  ["fromDate", "toDate"].forEach((id) => $(id).addEventListener("change", () => {
    [...$("rangeChips").children].forEach((c) => c.classList.remove("active"));
    render();
  }));

  /* ---------- load ---------- */
  async function load() {
    const [sRes, pRes, eRes] = await Promise.all([
      client.from("students").select("id, name, join_date, fees_paid, discontinued"),
      client.from("student_payments").select("*").order("paid_on", { ascending: false }),
      client.from("academy_expenses").select("*").order("expense_date", { ascending: false }),
    ]);
    if (pRes.error) toast(pRes.error.message);
    students = sRes.data || []; payments = pRes.data || []; expenses = eRes.data || [];
    render();
  }

  /* ---------- trend pill ---------- */
  function setTrend(el, pct, goodUp) {
    if (pct === null || !isFinite(pct)) { el.className = "trend flat"; el.textContent = ""; return; }
    const up = pct >= 0, good = goodUp ? up : !up;
    el.className = "trend " + (Math.abs(pct) < 0.5 ? "flat" : good ? "up" : "down");
    el.textContent = `${up ? "▲" : "▼"} ${Math.abs(Math.round(pct))}%`;
  }
  const pctChange = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : null);

  /* ---------- render ---------- */
  function render() {
    const r = currentRange();
    const inR = (d) => d && d >= r.start && d <= r.end;
    const rPays = payments.filter((p) => inR(payDate(p)));
    const rExps = expenses.filter((x) => inR(expDate(x)));

    const revenue = rPays.reduce((a, p) => a + num(p.amount), 0);
    const rt = { joining: 0, renewal: 0, jersey: 0 }, rc = { joining: 0, renewal: 0, jersey: 0 };
    rPays.forEach((p) => { const t = ["renewal", "jersey"].includes(p.payment_type) ? p.payment_type : "joining"; rt[t] += num(p.amount); rc[t]++; });
    const spent = rExps.reduce((a, x) => a + num(x.amount), 0);
    const net = revenue - spent, margin = revenue > 0 ? Math.round((net / revenue) * 100) : 0;

    // MoM vs previous equal period
    const pr = prevRange(r);
    let revPct = null, expPct = null;
    if (pr) {
      const inP = (d) => d && d >= pr.start && d <= pr.end;
      revPct = pctChange(revenue, payments.filter((p) => inP(payDate(p))).reduce((a, p) => a + num(p.amount), 0));
      expPct = pctChange(spent, expenses.filter((x) => inP(expDate(x))).reduce((a, x) => a + num(x.amount), 0));
    }

    // KPIs
    $("mRevenue").textContent = fmtMoney(revenue);
    $("mExpenses").textContent = fmtMoney(spent);
    $("mNet").textContent = fmtMoney(net);
    $("mNet").classList.toggle("neg", net < 0);
    $("mPaymentsCopy").textContent = `${rPays.length} payment${rPays.length === 1 ? "" : "s"} received`;
    $("mExpenseCount").textContent = `${rExps.length} expense entr${rExps.length === 1 ? "y" : "ies"}`;
    setTrend($("revTrend"), revPct, true);
    setTrend($("expTrend"), expPct, false);
    $("marginPill").className = "trend " + (net >= 0 ? "up" : "down");
    $("marginPill").textContent = net >= 0 ? `${margin}% margin` : "Loss";

    // Outstanding (current state)
    const active = students.filter((s) => !s.discontinued);
    const today = todayIso();
    const joinPend = active.filter((s) => !s.fees_paid);
    const renewDue = active.filter((s) => s.fees_paid && (() => { const d = nextDue(s); return d && d <= today; })());
    const outstanding = joinPend.length * (FEES.monthlyBase + FEES.admissionOneTime) + renewDue.length * FEES.monthlyBase;
    $("mOutstanding").textContent = fmtMoney(outstanding);
    $("mOutstandingCopy").textContent = `${joinPend.length} joining · ${renewDue.length} renewals due`;

    // Revenue mix
    const seg = [["joining", "Joining", "var(--c-join)"], ["renewal", "Renewals", "var(--c-renew)"], ["jersey", "Jersey", "var(--c-jersey)"]];
    $("revSeg").innerHTML = seg.map(([k, , c]) => `<span data-k="${k}" style="background:${c}"></span>`).join("");
    requestAnimationFrame(() => seg.forEach(([k]) => { const el = $("revSeg").querySelector(`[data-k="${k}"]`); if (el) el.style.width = `${revenue > 0 ? (rt[k] / revenue) * 100 : 0}%`; }));
    $("revLegend").innerHTML = seg.map(([k, label, c]) =>
      `<div class="row"><span class="dot" style="background:${c}"></span><span class="nm">${label}</span><span class="ct">${rc[k]}×</span><span class="amt num">${fmtMoney(rt[k])}</span></div>`).join("");

    // Expense categories
    const catMap = {};
    rExps.forEach((x) => { const t = x.expense_type || "Other"; catMap[t] = (catMap[t] || 0) + num(x.amount); });
    const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxCat = Math.max(1, ...cats.map((c) => c[1]));
    $("expCats").innerHTML = cats.length
      ? cats.map(([t, v]) => `<div class="cat"><span class="lbl">${esc(t)}</span><span class="track"><span class="fill" data-w="${(v / maxCat) * 100}"></span></span><span class="amt">${fmtMoney(v)}</span></div>`).join("")
      : `<p class="faint" style="font-size:13px;">No expenses in this range.</p>`;
    requestAnimationFrame(() => $("expCats").querySelectorAll(".fill").forEach((f) => { f.style.width = `${f.dataset.w}%`; }));

    // Paid by (partner contributions)
    const paidMap = {};
    rExps.forEach((x) => { const p = x.paid_by || "—"; paidMap[p] = (paidMap[p] || 0) + num(x.amount); });
    const paid = Object.entries(paidMap).sort((a, b) => b[1] - a[1]);
    $("paidBy").innerHTML = paid.length
      ? paid.map(([p, v]) => `<div class="partner"><span class="pn">${esc(p)}</span><span class="pa num">${fmtMoney(v)}</span></div>`).join("")
      : `<p class="faint" style="font-size:13px;">—</p>`;

    // Monthly flow (last 6) — revenue by type + expenses
    const now = new Date();
    months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-IN", { month: "short" }), joining: 0, renewal: 0, jersey: 0, exp: 0 }); }
    if (selMonth >= months.length) selMonth = months.length - 1;
    const idx = new Map(months.map((m, i) => [m.key, i]));
    payments.forEach((p) => { const k = payDate(p).slice(0, 7); if (idx.has(k)) { const t = ["renewal", "jersey"].includes(p.payment_type) ? p.payment_type : "joining"; months[idx.get(k)][t] += num(p.amount); } });
    expenses.forEach((x) => { const k = expDate(x).slice(0, 7); if (idx.has(k)) months[idx.get(k)].exp += num(x.amount); });
    const maxV = Math.max(1, ...months.map((m) => Math.max(m.joining + m.renewal + m.jersey, m.exp)));
    const h = (v) => Math.round((v / maxV) * 150);
    $("monthChart").innerHTML = months.map((m, i) => `
      <div class="mcol${i === selMonth ? " sel" : ""}" data-i="${i}">
        <div class="mbars">
          <div class="mrev" style="height:${h(m.joining + m.renewal + m.jersey)}px">
            <i style="height:${h(m.joining)}px;background:var(--c-join)"></i>
            <i style="height:${h(m.renewal)}px;background:var(--c-renew)"></i>
            <i style="height:${h(m.jersey)}px;background:var(--c-jersey)"></i>
          </div>
          <div class="mexp" style="height:${h(m.exp)}px"></div>
        </div>
        <span class="mlbl">${m.label}</span>
      </div>`).join("");
    renderMonthDetail();
  }

  function renderMonthDetail() {
    const m = months[selMonth]; if (!m) return;
    const rev = m.joining + m.renewal + m.jersey, net = rev - m.exp;
    $("monthDetail").innerHTML =
      `<span class="mn">${m.label}</span>` +
      `<span class="seg-amt">Revenue <b>${fmtMoney(rev)}</b></span>` +
      `<span class="seg-amt" style="color:var(--c-join)">Join <b>${fmtMoney(m.joining)}</b></span>` +
      `<span class="seg-amt" style="color:var(--tx-blue)">Renew <b>${fmtMoney(m.renewal)}</b></span>` +
      `<span class="seg-amt" style="color:#0f9b8e">Jersey <b>${fmtMoney(m.jersey)}</b></span>` +
      `<span class="seg-amt" style="color:var(--tx-red)">Spend <b>${fmtMoney(m.exp)}</b></span>` +
      `<span class="net ${net >= 0 ? "pos" : "neg"}">Net <b>${fmtMoney(net)}</b></span>`;
  }
  // Tap a month → filter the whole page (KPIs, mix, categories, list) to it.
  $("monthChart").addEventListener("click", (e) => {
    const col = e.target.closest("[data-i]"); if (!col) return;
    selMonth = Number(col.dataset.i);
    const m = months[selMonth]; if (!m) return;
    const [y, mo] = m.key.split("-").map(Number);
    $("fromDate").value = `${m.key}-01`;
    $("toDate").value = isoOf(new Date(y, mo, 0));
    [...$("rangeChips").children].forEach((c) => c.classList.remove("active"));
    render();
  });

  /* ---------- expenses list ---------- */
  function renderExpenses() {
    const r = currentRange();
    const rExps = expenses.filter((x) => { const d = expDate(x); return d && d >= r.start && d <= r.end; });
    $("expEmpty").classList.toggle("hide", rExps.length > 0);
    $("expBody").innerHTML = rExps.map((x) => `
      <tr><td class="num">${fmtDate(expDate(x))}</td><td>${esc(x.expense_type)}</td>
      <td class="num" style="color:var(--tx-red);font-weight:650;">${fmtMoney(x.amount)}</td>
      <td>${esc(x.paid_by || "—")}</td><td class="faint">${esc(x.comment || "")}</td>
      <td><button class="btn btn-ghost btn-sm" data-del="${x.id}">Delete</button></td></tr>`).join("");
    $("expCards").innerHTML = rExps.map((x) => `
      <article class="glass row-card"><div class="rc-top"><span class="rc-name">${esc(x.expense_type)}</span><span class="pill red num">${fmtMoney(x.amount)}</span></div>
      <div class="rc-meta"><span class="pill">${fmtDate(expDate(x))}</span><span class="pill">${esc(x.paid_by || "—")}</span></div>
      ${x.comment ? `<p class="faint" style="font-size:12.5px;">${esc(x.comment)}</p>` : ""}
      <div class="rc-actions"><button class="btn btn-glass btn-sm" data-del="${x.id}">Delete</button></div></article>`).join("");
  }
  const _origRender = render;
  render = function () { _origRender(); renderExpenses(); };

  $("toggleExp").addEventListener("click", () => {
    const w = $("expWrap"), hidden = w.classList.toggle("collapsed");
    $("toggleExp").textContent = hidden ? "Show list" : "Hide list";
  });

  document.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del]"); if (!del) return;
    if (!confirm("Delete this expense?")) return;
    del.disabled = true;
    const { error } = await client.from("academy_expenses").delete().eq("id", del.dataset.del);
    if (error) { toast(error.message); del.disabled = false; return; }
    toast("Expense deleted ✔"); await load();
  });

  /* add expense */
  $("addExpenseBtn").addEventListener("click", () => { $("xMsg").textContent = ""; openModal("expenseModal"); });
  $("expenseForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("xSaveBtn").disabled = true;
    const { error } = await client.from("academy_expenses").insert({
      expense_type: $("xType").value, amount: num($("xAmount").value), comment: $("xComment").value.trim(),
      paid_by: $("xPaidBy").value, created_by: email, expense_date: $("xDate").value || todayIso(),
    });
    $("xSaveBtn").disabled = false;
    if (error) { $("xMsg").textContent = error.message; $("xMsg").className = "form-msg error"; return; }
    $("expenseForm").reset(); $("xDate").value = todayIso(); closeModal("expenseModal"); toast("Expense added ✔"); await load();
  });

  /* realtime */
  client.channel("finance-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "academy_expenses" }, () => load())
    .on("postgres_changes", { event: "*", schema: "public", table: "student_payments" }, () => load())
    .subscribe();

  await load();
})();
