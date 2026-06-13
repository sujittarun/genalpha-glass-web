/* ============================================================
   Gen Alpha Academy — shared core v3
   supabase client, theme manager (light-first), navigation
   shell, toast, modal, glass date picker (year/month jump),
   formatting helpers, global field niceties.
   Loaded on every page after config.js and the supabase CDN.
   ============================================================ */
(function () {
  const cfg = window.GA_CONFIG;
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  /* ---------- formatting ---------- */
  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const fmtMoney = (n) => inr.format(Number(n) || 0);
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };
  const addMonthsIso = (iso, m) => {
    const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
    d.setMonth(d.getMonth() + m);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- theme (light default) ---------- */
  const THEME_KEY = "ga-theme";
  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A8.6 8.6 0 1 1 11.2 3a6.8 6.8 0 0 0 9.8 9.8z"/></svg>';

  const currentTheme = () => localStorage.getItem(THEME_KEY) || "light";
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === "dark" ? "#060b1c" : "#e8eef8";
    document.querySelectorAll(".theme-toggle").forEach((b) => {
      b.innerHTML = t === "dark" ? SUN : MOON;
      b.setAttribute("aria-label", t === "dark" ? "Switch to light mode" : "Switch to dark mode");
      b.title = t === "dark" ? "Light mode" : "Dark mode";
    });
  }
  function toggleTheme() {
    const t = currentTheme() === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
  }
  function themeToggleHtml(extra = "") {
    return `<button type="button" class="theme-toggle ${extra}" aria-label="Toggle theme"></button>`;
  }
  function mountThemeToggle() {
    if (!document.querySelector(".theme-toggle")) {
      document.body.insertAdjacentHTML("beforeend", themeToggleHtml("floating"));
    }
    applyTheme(currentTheme());
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest?.(".theme-toggle")) toggleTheme();
  });
  applyTheme(currentTheme());

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(message, ms = 3400) {
    let el = document.querySelector(".ga-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "ga-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), ms);
  }

  /* ---------- modal helpers ---------- */
  function openModal(id) {
    const b = document.getElementById(id);
    if (b) { b.classList.add("open"); document.body.style.overflow = "hidden"; }
  }
  function closeModal(id) {
    const b = document.getElementById(id);
    if (b) { b.classList.remove("open"); document.body.style.overflow = ""; }
  }
  document.addEventListener("click", (e) => {
    if (e.target.classList?.contains("ga-modal-backdrop")) {
      e.target.classList.remove("open");
      document.body.style.overflow = "";
    }
    const closer = e.target.closest?.("[data-close-modal]");
    if (closer) closeModal(closer.dataset.closeModal);
  });

  /* ---------- auth ---------- */
  async function getSession() {
    const { data } = await client.auth.getSession();
    return data?.session || null;
  }
  async function requireManager() {
    const session = await getSession();
    if (!session) {
      const next = encodeURIComponent(location.pathname.split("/").pop() + location.search);
      location.replace(`login.html?next=${next}`);
      return null;
    }
    return session;
  }
  async function logout() {
    await client.auth.signOut();
    location.href = "index.html";
  }
  const managerEmail = (session) => session?.user?.email || "manager";

  /* ---------- icons ---------- */
  const I = {
    admission: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    players: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    attendance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    finance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>',
    pay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  };

  /* Navigation IA:
     Manager: Dashboard · Players · Attendance · Finance · Admissions(badge)
     Public:  Admission · Attendance · Pay Fees                    */
  // Admissions review now lives on the Players page (pending panel above the
  // table), so it is no longer a top-level tab.
  const MANAGER_TABS = [
    { key: "dashboard", label: "Dashboard", href: "dashboard.html", icon: I.dashboard },
    { key: "roster", label: "Players", href: "roster.html", icon: I.players },
    { key: "attendance", label: "Attendance", href: "attendance.html", icon: I.attendance },
    { key: "finance", label: "Finance", href: "finance.html", icon: I.finance },
  ];
  const PUBLIC_TABS = [
    { key: "admission", label: "Admission", href: "index.html", icon: I.admission },
    { key: "attendance", label: "Attendance", href: "attendance.html", icon: I.attendance },
    { key: "pay", label: "Pay Fees", href: "pay.html", icon: I.pay },
  ];

  /* ---------- shell (nav + dock + background) ---------- */
  function renderShell({ active, mode }) {
    if (!document.querySelector(".ga-bg")) {
      const bg = document.createElement("div");
      bg.className = "ga-bg";
      document.body.prepend(bg);
    }

    const tabs = mode === "manager" ? MANAGER_TABS : PUBLIC_TABS;
    const tabHtml = tabs.map((t) =>
      `<a class="nav-tab ${t.key === active ? "active" : ""}" data-tab="${t.key}" href="${t.href}">${t.icon}<span>${t.label}</span>${t.badge ? '<i class="nav-badge hide" data-badge="' + t.key + '"></i>' : ""}</a>`
    ).join("");

    const action = mode === "manager"
      ? `${themeToggleHtml()}<span class="pill gold hide-mobile" id="navManagerEmail">manager</span>
         <button class="btn btn-glass btn-sm" id="navLogout">${I.logout}<span class="hide-mobile">Logout</span></button>`
      : `${themeToggleHtml()}<a class="btn btn-glass btn-sm" href="login.html">Manager Login</a>`;

    const nav = document.createElement("nav");
    nav.className = "ga-nav glass";
    nav.innerHTML = `
      <a class="nav-brand" href="${mode === "manager" ? "dashboard.html" : "index.html"}">
        <img src="assets/img/gen-alpha-favicon-512.png" alt="Gen Alpha Cricket Academy" />
        <div class="t"><strong>Gen Alpha Cricket Academy</strong><span>${mode === "manager" ? "Manager Console" : "Hyderabad · Admissions Open"}</span></div>
      </a>
      <div class="nav-tabs">${tabHtml}</div>
      <div class="nav-actions">${action}</div>`;
    document.body.prepend(nav);

    const dock = document.createElement("nav");
    dock.className = "ga-dock glass";
    dock.innerHTML = tabs.map((t) =>
      `<a class="dock-tab ${t.key === active ? "active" : ""}" href="${t.href}">${t.icon}<span>${t.label}</span>${t.badge ? '<i class="nav-badge dock hide" data-badge="' + t.key + '"></i>' : ""}</a>`
    ).join("");
    document.body.appendChild(dock);

    document.getElementById("navLogout")?.addEventListener("click", logout);
    applyTheme(currentTheme());
  }

  async function refreshReviewBadge() {
    try {
      const { count } = await client.from("admissions").select("id", { count: "exact", head: true }).eq("review_status", "pending");
      document.querySelectorAll('[data-badge="review"]').forEach((b) => {
        b.textContent = count > 99 ? "99+" : String(count || 0);
        b.classList.toggle("hide", !count);
      });
    } catch { /* non-critical */ }
  }

  async function initManagerPage(activeTab) {
    renderShell({ active: activeTab, mode: "manager" });
    const session = await requireManager();
    if (!session) return null;
    const emailEl = document.getElementById("navManagerEmail");
    if (emailEl) emailEl.textContent = managerEmail(session);
    refreshReviewBadge();
    return session;
  }
  function initPublicPage(activeTab) {
    renderShell({ active: activeTab, mode: "public" });
  }

  /* ---------- glass date picker (days / months / years views) ---------- */
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const MONTHS_S = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const DOW = ["Mo","Tu","We","Th","Fr","Sa","Su"];
  let dpEl = null, dpInput = null, dpView = null, dpMode = "days", dpYearBase = 0;

  const isoFrom = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  function dpClose() {
    if (dpEl) { dpEl.classList.remove("open"); dpInput = null; }
  }
  function dpLimits() {
    return {
      min: dpInput?.min || "",
      max: dpInput?.max || "",
      minY: dpInput?.min ? Number(dpInput.min.slice(0, 4)) : -Infinity,
      maxY: dpInput?.max ? Number(dpInput.max.slice(0, 4)) : Infinity,
    };
  }
  function dpRender() {
    const y = dpView.getFullYear(), m = dpView.getMonth();
    const sel = dpInput?.value || "";
    const today = todayIso();
    const lim = dpLimits();

    let title = "", body = "", foot = "";
    if (dpMode === "days") {
      const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
      const days = new Date(y, m + 1, 0).getDate();
      let cells = "";
      for (let i = 0; i < firstDow; i++) cells += `<span class="dp-cell empty"></span>`;
      for (let d = 1; d <= days; d++) {
        const iso = isoFrom(y, m, d);
        const dis = (lim.min && iso < lim.min) || (lim.max && iso > lim.max);
        cells += `<button type="button" class="dp-cell${iso === sel ? " sel" : ""}${iso === today ? " today" : ""}" data-iso="${iso}" ${dis ? "disabled" : ""}>${d}</button>`;
      }
      title = `${MONTHS[m]} ${y}`;
      body = `<div class="dp-dow">${DOW.map((d) => `<span>${d}</span>`).join("")}</div><div class="dp-grid">${cells}</div>`;
      foot = `<div class="dp-foot"><button type="button" class="dp-today" data-today>Today</button></div>`;
    } else if (dpMode === "months") {
      title = String(y);
      body = `<div class="dp-grid wide">` + MONTHS_S.map((lbl, i) => {
        const selM = sel && Number(sel.slice(0, 4)) === y && Number(sel.slice(5, 7)) === i + 1;
        return `<button type="button" class="dp-cell${selM ? " sel" : ""}" data-month="${i}">${lbl}</button>`;
      }).join("") + `</div>`;
    } else {
      const start = dpYearBase;
      title = `${start} – ${start + 11}`;
      let cells = "";
      for (let yy = start; yy < start + 12; yy++) {
        const dis = yy < lim.minY || yy > lim.maxY;
        const selY = sel && Number(sel.slice(0, 4)) === yy;
        cells += `<button type="button" class="dp-cell${selY ? " sel" : ""}" data-year="${yy}" ${dis ? "disabled" : ""}>${yy}</button>`;
      }
      body = `<div class="dp-grid wide">${cells}</div>`;
    }

    dpEl.innerHTML = `
      <div class="dp-head">
        <button type="button" class="dp-nav" data-nav="-1" aria-label="Previous">‹</button>
        <button type="button" class="dp-title" data-mode-cycle>${title}</button>
        <button type="button" class="dp-nav" data-nav="1" aria-label="Next">›</button>
      </div>${body}${foot}`;
  }
  function dpOpen(input) {
    if (!dpEl) {
      dpEl = document.createElement("div");
      dpEl.className = "ga-datepicker glass";
      document.body.appendChild(dpEl);
      dpEl.addEventListener("click", (e) => {
        const nav = e.target.closest("[data-nav]");
        if (nav) {
          const dir = Number(nav.dataset.nav);
          if (dpMode === "days") dpView.setMonth(dpView.getMonth() + dir);
          else if (dpMode === "months") dpView.setFullYear(dpView.getFullYear() + dir);
          else dpYearBase += dir * 12;
          dpRender();
          return;
        }
        if (e.target.closest("[data-mode-cycle]")) {
          dpMode = dpMode === "days" ? "years" : dpMode === "years" ? "months" : "days";
          if (dpMode === "years") dpYearBase = dpView.getFullYear() - 5;
          dpRender();
          return;
        }
        const yearBtn = e.target.closest("[data-year]");
        if (yearBtn) {
          dpView.setFullYear(Number(yearBtn.dataset.year));
          dpMode = "months";
          dpRender();
          return;
        }
        const monthBtn = e.target.closest("[data-month]");
        if (monthBtn) {
          dpView.setMonth(Number(monthBtn.dataset.month));
          dpMode = "days";
          dpRender();
          return;
        }
        if (e.target.closest("[data-today]")) { dpPick(todayIso()); return; }
        const cell = e.target.closest("[data-iso]");
        if (cell) dpPick(cell.dataset.iso);
      });
    }
    dpInput = input;
    dpMode = "days";
    const base = input.value ? new Date(`${input.value}T00:00:00`) : new Date();
    dpView = new Date(base.getFullYear(), base.getMonth(), 1);
    dpRender();
    const r = input.getBoundingClientRect();
    dpEl.classList.add("open");
    const w = 286, h = 350;
    const left = Math.min(Math.max(10, r.left), window.innerWidth - w - 10);
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 10) top = Math.max(10, r.top - h - 8);
    dpEl.style.left = `${left}px`;
    dpEl.style.top = `${top}px`;
  }
  function dpPick(iso) {
    if (!dpInput) return;
    dpInput.value = iso;
    dpInput.dispatchEvent(new Event("input", { bubbles: true }));
    dpInput.dispatchEvent(new Event("change", { bubbles: true }));
    dpClose();
  }
  document.addEventListener("mousedown", (e) => {
    if (dpEl?.classList.contains("open") && !dpEl.contains(e.target) && e.target !== dpInput) dpClose();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") dpClose(); });
  window.addEventListener("resize", dpClose);

  function enhanceDateInputs(root = document) {
    root.querySelectorAll('input[type="date"]:not([data-ga-dp])').forEach((input) => {
      input.dataset.gaDp = "1";
      input.setAttribute("inputmode", "none");
      input.addEventListener("click", (e) => { e.preventDefault(); dpOpen(input); });
      input.addEventListener("focus", () => dpOpen(input));
      input.addEventListener("keydown", (e) => { if (e.key !== "Tab" && e.key !== "Escape") e.preventDefault(); });
    });
  }
  document.addEventListener("DOMContentLoaded", () => enhanceDateInputs());
  if (document.readyState !== "loading") enhanceDateInputs();

  /* ---------- global field niceties ---------- */
  // Phone fields: digits only, max 10 — applies app-wide.
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t?.matches?.('input[type="tel"]')) {
      const v = t.value.replace(/\D/g, "").slice(0, 10);
      if (v !== t.value) t.value = v;
    }
  });

  /* ---------- motion: scroll reveal ---------- */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.add("ga-js");
  let revealIO = null;
  function initReveal(root = document) {
    const els = [...root.querySelectorAll(".reveal:not([data-seen])")];
    if (reduceMotion || !("IntersectionObserver" in window)) {
      els.forEach((el) => { el.classList.add("in"); el.setAttribute("data-seen", "1"); });
      return;
    }
    if (!revealIO) {
      revealIO = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { en.target.classList.add("in"); revealIO.unobserve(en.target); }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -7% 0px" });
    }
    els.forEach((el) => { el.setAttribute("data-seen", "1"); revealIO.observe(el); });
  }

  /* ---------- motion: count-up numbers ---------- */
  // Opt-in via [data-countup]; preserves prefix/suffix (₹, +, etc.) and Indian grouping.
  const COUNT_RE = /-?[\d,]*\.?\d+/;
  function runCount(el, toText) {
    const m = String(toText).match(COUNT_RE);
    if (!m) { el.textContent = toText; return; }
    const target = parseFloat(m[0].replace(/,/g, ""));
    if (!isFinite(target)) { el.textContent = toText; return; }
    const prefix = toText.slice(0, m.index);
    const suffix = toText.slice(m.index + m[0].length);
    const decimals = (m[0].split(".")[1] || "").length;
    const from = parseFloat(el.getAttribute("data-count-cur") || "0") || 0;
    const fmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    el.setAttribute("data-count-cur", String(target));
    el.__gaBusy = true;
    const dur = 950, t0 = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + fmt.format(from + (target - from) * eased) + suffix;
      if (p < 1) requestAnimationFrame(frame);
      else { el.textContent = toText; el.__gaBusy = false; }
    }
    requestAnimationFrame(frame);
  }
  function initCountUp(root = document) {
    if (reduceMotion) return;
    root.querySelectorAll("[data-countup]").forEach((el) => {
      if (el.__gaCount) return;
      el.__gaCount = true;
      const mo = new MutationObserver(() => {
        if (el.__gaBusy) return;
        const txt = el.textContent.trim();
        if (!COUNT_RE.test(txt) || txt === el.getAttribute("data-count-done")) return;
        el.setAttribute("data-count-done", txt);
        runCount(el, txt);
      });
      mo.observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  /* ---------- motion: cursor-following glass highlight ---------- */
  if (!reduceMotion && window.matchMedia("(hover: hover)").matches) {
    document.addEventListener("pointermove", (e) => {
      const card = e.target.closest?.(".glass-hover");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    }, { passive: true });
  }

  /* ---------- cricket-themed animated backdrop ---------- */
  // Drifting seamed cricket balls flying along curved "shot" trajectories,
  // plus a dashed ball-path arc — layered behind the glass on every page.
  function decorateBg() {
    const bg = document.querySelector(".ga-bg");
    if (!bg || bg.querySelector(".ga-cricket") || reduceMotion) return;
    const wrap = document.createElement("div");
    wrap.className = "ga-cricket";
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML =
      '<span class="cb cb1"></span><span class="cb cb2"></span><span class="cb cb3"></span>' +
      '<svg class="cb-arc" viewBox="0 0 1440 900" preserveAspectRatio="none">' +
      '<path d="M -40 760 Q 560 120 1480 520" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 14" stroke-linecap="round"/>' +
      '</svg>' +
      // wickets (stumps + bails) bottom-right
      '<svg class="ga-stumps" viewBox="0 0 90 130" fill="none" stroke="currentColor">' +
      '<g stroke-width="6" stroke-linecap="round"><line x1="20" y1="34" x2="20" y2="120"/>' +
      '<line x1="45" y1="34" x2="45" y2="120"/><line x1="70" y1="34" x2="70" y2="120"/></g>' +
      '<g class="bails" stroke-width="5" stroke-linecap="round"><line x1="16" y1="32" x2="49" y2="32"/>' +
      '<line x1="41" y1="32" x2="74" y2="32"/></g></svg>' +
      // batsman silhouette playing a drive, bottom-left
      '<svg class="ga-batsman" viewBox="0 0 160 200" fill="currentColor">' +
      '<circle cx="78" cy="34" r="13"/>' +
      '<path d="M68 48 Q62 92 58 132 L74 132 Q80 96 88 60 Z"/>' +
      '<path d="M58 130 L46 188 56 190 70 134 Z"/><path d="M76 130 L86 188 96 186 84 132 Z"/>' +
      '<g class="bat-arm"><path d="M74 58 q26 6 40 24" stroke="currentColor" stroke-width="9" stroke-linecap="round" fill="none"/>' +
      '<rect class="bat" x="108" y="74" width="11" height="68" rx="5" transform="rotate(34 113 108)"/></g></svg>';
    bg.appendChild(wrap);
  }

  function initMotion(root = document) { decorateBg(); initReveal(root); initCountUp(root); }
  document.addEventListener("DOMContentLoaded", () => initMotion());
  if (document.readyState !== "loading") initMotion();

  /* ---------- exports ---------- */
  window.GA = {
    client, cfg,
    fmtMoney, fmtDate, todayIso, addMonthsIso, esc,
    toast, openModal, closeModal,
    getSession, requireManager, logout, managerEmail,
    initManagerPage, initPublicPage, enhanceDateInputs,
    toggleTheme, mountThemeToggle, currentTheme,
    refreshReviewBadge,
    initReveal, initCountUp,
    icons: I,
  };
})();
