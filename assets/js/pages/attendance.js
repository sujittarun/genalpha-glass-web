/* Attendance — public-friendly marking via mark/unmark RPCs, realtime sync */
(async function () {
  const { client, cfg, esc, todayIso, toast, getSession } = window.GA;
  const $ = (id) => document.getElementById(id);

  // Attendance is usable without login (kids mark themselves) — shell adapts to session.
  const session = await getSession();
  if (session) {
    await window.GA.initManagerPage("attendance");
    const emailEl = document.getElementById("navManagerEmail");
    if (emailEl) emailEl.textContent = session.user?.email || "manager";
  } else {
    window.GA.initPublicPage("attendance");
  }

  let students = [];
  let presentIds = new Set();
  let slotFilter = "";
  let date = todayIso();
  $("attDate").value = date;
  $("attDate").max = todayIso();

  function renderSlots() {
    $("slotChips").innerHTML = cfg.timeSlots.map((s) =>
      `<button type="button" class="chip ${slotFilter === s ? "active" : ""}" data-slot="${s}">${s}</button>`
    ).join("");
  }
  $("slotChips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-slot]");
    if (!chip) return;
    slotFilter = slotFilter === chip.dataset.slot ? "" : chip.dataset.slot;
    renderSlots(); render();
  });

  function filtered() {
    const q = $("searchInput").value.trim().toLowerCase();
    return students.filter((s) => {
      if (q && !String(s.name || "").toLowerCase().includes(q)) return false;
      if (slotFilter && s.time_slot !== slotFilter) return false;
      return true;
    });
  }
  $("searchInput").addEventListener("input", render);

  function render() {
    const list = filtered();
    $("emptyState").classList.toggle("hide", list.length > 0);
    $("attGrid").innerHTML = list.map((s) => `
      <div class="att-card ${presentIds.has(s.id) ? "present" : ""}" data-id="${s.id}" role="button" tabindex="0">
        <div><div class="nm">${esc(s.name)}</div><div class="sl">${esc(s.time_slot || "")}</div></div>
        <div class="mark">✓</div>
      </div>`).join("");
    $("presentPill").textContent = `${list.filter((s) => presentIds.has(s.id)).length} present`;
    $("totalPill").textContent = `${list.length} players`;
  }

  async function load() {
    const [sRes, aRes] = await Promise.all([
      client.from("students").select("id, name, time_slot, discontinued").eq("discontinued", false).order("name"),
      client.from("attendance").select("student_id").eq("attendance_date", date),
    ]);
    students = sRes.data || [];
    presentIds = new Set((aRes.data || []).map((r) => r.student_id));
    renderSlots();
    render();
  }

  $("attDate").addEventListener("change", () => {
    date = $("attDate").value || todayIso();
    load();
  });

  async function toggle(studentId) {
    const isNowPresent = !presentIds.has(studentId);
    // optimistic
    if (isNowPresent) presentIds.add(studentId); else presentIds.delete(studentId);
    render();
    const rpc = isNowPresent ? "mark_player_attendance" : "unmark_player_attendance";
    const { error } = await client.rpc(rpc, { p_student_id: studentId, p_attendance_date: date });
    if (error) {
      // revert
      if (isNowPresent) presentIds.delete(studentId); else presentIds.add(studentId);
      render();
      toast(`⚠ Attendance update failed: ${error.message}`);
    }
  }
  $("attGrid").addEventListener("click", (e) => {
    const card = e.target.closest("[data-id]");
    if (card) toggle(card.dataset.id);
  });
  $("attGrid").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest("[data-id]");
    if (card) { e.preventDefault(); toggle(card.dataset.id); }
  });

  /* realtime sync with Android app */
  client.channel("attendance-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, (payload) => {
      const row = payload.new || payload.old;
      if (!row || row.attendance_date !== date) return;
      if (payload.eventType === "INSERT") presentIds.add(row.student_id);
      if (payload.eventType === "DELETE") presentIds.delete(row.student_id);
      render();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => load())
    .subscribe();

  await load();
})();
