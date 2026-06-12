# Gen Alpha Cricket Academy — Glass Web App (v2)

Ultra-modern liquid-glass rebuild of the Gen Alpha Cricket Academy manager.
Multi-page vanilla web app — no build step, deploys directly to GitHub Pages.

Live domain: https://genalphaacademy.in (currently served by the v1 repo; switch the
CNAME + Pages settings to this repo when ready to go live).

## Pages

| Page | Audience | Purpose |
|---|---|---|
| `index.html` | Public | Parent admission form + academy hero/moments |
| `pay.html` | Public | UPI fee payment (QR + deep link, WhatsApp flow aware) |
| `attendance.html` | Public + manager | Kid-friendly attendance marking, realtime sync |
| `login.html` | Manager | Supabase email/password sign-in |
| `dashboard.html` | Manager | Stats, fee alerts, student movement chart |
| `roster.html` | Manager | Players table (desktop) / cards (mobile), edit, record payments |
| `finance.html` | Manager | Revenue vs expenses, range filters, expense management |
| `review.html` | Manager | Admission review queue (approve / reject) |
| `player.html?id=…` | Manager | Player profile: details, payments, attendance, timeline |

## Architecture

- `assets/css/glass.css` — the liquid-glass design system (tokens, glass primitives,
  nav/dock, buttons, forms, tables, modals, 3-tier responsive rules). All pages share it.
- `assets/js/config.js` — Supabase URL/anon key, payment config, slots/sizes lists.
- `assets/js/fees.js` — fee constants and calculators (single source of truth).
- `assets/js/core.js` — `window.GA`: supabase client, auth guard, nav shell renderer,
  toast/modal helpers, formatters.
- `assets/js/pages/*.js` — one controller per page.

Plain `<script>` files (no ES modules) so every page also works from `file://` and any
static host. Supabase JS v2 is loaded from the jsDelivr CDN.

## Backend (shared with v1 + Android app)

Same live Supabase project. Key contracts used:
- RPCs: `submit_admission_form`, `peek_next_admission_reg_no`, `approve_admission`,
  `mark_player_attendance`, `unmark_player_attendance`
- Tables: `students`, `admissions`, `attendance`, `student_payments`,
  `academy_expenses`, `student_timeline`
- Realtime: `students`, `attendance`, `student_payments`, `academy_expenses`

No schema changes are required — this app is a pure frontend replacement.

## Deploy (GitHub Pages)

Settings → Pages → Deploy from branch `main` / root. Add the custom-domain CNAME file
only when cutting over from the v1 repo.

## Business rules carried over from v1

- Landing page is admission-only; roster/finance/dashboard require manager login.
- Parent payments are never auto-marked paid — always pending manager verification.
- Renewal cycles follow the joining-day, not the payment date.
- Fees: monthly ₹3,500 + ₹500 one-time admission; 3 months ₹9,975; 6 months ₹18,900;
  special ₹10,000/month; jerseys ₹750/pair.
