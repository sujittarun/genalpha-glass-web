# Gen Alpha Cricket Academy — Glass Web App (v2 rebuild)

Multi-page vanilla web app (no build step) deployed on GitHub Pages.
Repo: https://github.com/sujittarun/genalpha-glass-web · Live: https://sujittarun.github.io/genalpha-glass-web/
Production domain genalphaacademy.in still points at the OLD repo (sujittarun/cricket-academy-manager) — do not touch its CNAME until the user asks to cut over.

## FIRST TASK if git is broken
The .git folder may contain stale lock files / divergent history (the repo on GitHub was
populated via web uploads). To reset local git to track GitHub while KEEPING local files
as the source of truth:

```bash
cd "/Users/jiths/Documents/New project/genalpha-glass-web"
rm -rf .git
git init -b main
git remote add origin git@github.com:sujittarun/genalpha-glass-web.git
git add -A && git commit -m "v5: liquid glass surfaces"
git push -u origin main --force   # local files are newer than GitHub — force is intended (confirm with user first)
```

## Deploy workflow
GitHub Pages serves from `main` branch root. `git push` = deploy (~1 min build + up to
10 min CDN cache). When changing CSS/JS, bump the `?v=N` query in ALL html files
(`sed -i '' 's/?v=4/?v=5/g' *.html`) to bust caches.

## Architecture
- `assets/css/glass.css` — entire design system. Light-first liquid glass with
  `[data-theme="dark"]` token overrides. KEY RECIPE (from bubbbly reference):
  glass = low-opacity white fill (10–22%) + `backdrop-filter: blur(22px) saturate(1.2–1.4)`
  + `border: 1px solid rgba(255,255,255,.3–.55)` + `inset 0 1px 0 rgba(255,255,255,.35–.6)`
  rim light, over a VIVID saturated animated background (.ga-bg). Never make glass milky/opaque.
- `assets/js/config.js` — supabase url/anon key, payment config, slots/sizes/expense lists.
- `assets/js/fees.js` — fee constants: monthly 3500, admission 500, 3mo 9975, 6mo 18900,
  special 10000, jersey 750/pair.
- `assets/js/core.js` — `window.GA`: supabase client, theme manager (localStorage `ga-theme`,
  default light), nav shell (manager: Dashboard/Players/Attendance/Finance/Admissions+badge;
  public: Admission/Attendance/Pay Fees), toast/modal, glass datepicker (year/month jump),
  global tel-input sanitizer, formatters.
- `assets/js/pages/*.js` — one controller per page. Plain scripts (no modules) on purpose.

## Pages
index.html (public admission form) · pay.html (UPI QR) · attendance.html (public+manager,
kid-friendly tap-to-mark) · login.html · dashboard.html · roster.html (Players: skeleton
loading, paging, payment modal with plan chips + due preview) · finance.html ·
review.html (Admissions queue) · player.html?id= (profile + merged activity feed).

## Supabase contracts (LIVE prod DB — same as old web app and Android app)
- RPCs: `submit_admission_form(p_*)`, `peek_next_admission_reg_no` (returns
  `[{next_reg_no}]`), `approve_admission(p_admission_id,p_reviewed_by,p_review_notes)`,
  `mark_player_attendance` / `unmark_player_attendance` (p_student_id, p_attendance_date).
- Tables: students, admissions (review_status='pending'), attendance, student_payments
  (payment_type joining|renewal|jersey, plan_type, cycle_start_date, months_covered,
  amount, paid_on, recorded_by), academy_expenses, student_timeline.
- Realtime enabled: students, attendance, student_payments, academy_expenses.

## Business rules (do not violate)
- Public landing = admission form only; manager pages behind Supabase email login.
- Parent payments are NEVER auto-marked paid — pending until manager verifies.
- Renewal cycles follow the joining-day, not payment date (cycle_start + months_covered).
- Reject admission = delete row from admissions table.
- All UI must work at mobile (<768, bottom dock), tablet (768–1099, icon tabs), desktop.
- Both themes must stay consistent — only use tokens from glass.css, never hardcoded colors.

## Sibling projects (in parent folder "New project")
- `web-app-repo/` = OLD live web app (keep untouched, it serves genalphaacademy.in).
- `android-app/` + root = Android app sharing the same Supabase backend.
- `PROJECT_CONTEXT.md` in parent folder = full business context. Read it for any
  feature/logic work.
