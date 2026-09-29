# BaddyClubNight — Club Management Plan

Branch: `feature/committee-admin` (never merged to `main` without approval).
Backend: Supabase only for everything below (no Pi/SQLite mirror — admin work needs connectivity).

## Vision

Today the app is a **club-night tool** (check-in, courts, queue, matches, tournaments).
It becomes **club management software** — members, guests, money, committee, comms —
with the night tool as one part. Built for the committee first; a members' side later.

## Decisions so far

| Topic | Decision |
|---|---|
| Payments | Manual tracking (cash / bank / UPI). Stripe later (phase 4). |
| Membership | Billed per period — cadence set per club (monthly / quarterly / half-yearly / yearly). Default quarterly. |
| Tiers | Full / Student / Social, each with its own fee. |
| Guests | Pay per night they play. Can be converted to a member. |
| Pause | Members can be paused (injury, travel) — no dues while paused. |
| Reminders | Email, or free WhatsApp tap-to-send per member. No SMS/Twilio. |
| Admin logins | One login per admin with roles (phase 2). Today: one shared login per club. |
| Layout | Full pages, not side drawers (drawers stay only inside a live night). |

## Pages

| Page | Route | Purpose |
|---|---|---|
| Home | `/` | Hub: start night / tournament, links to everything below |
| Members | `/members` | Club CRM: search, filter by status/tier, add, import |
| Member profile | `/members/:id` | Tabs: Details · Payments · Attendance · Notes |
| Guests | `/guests` | Everyone who played as a guest, visit counts, fees, **Make member** |
| Finance | `/finance` | Dues by period, guest fees, ledger, income summary, CSV export |
| Committee | `/committee` | Admin logins & roles, invites, activity log (phase 2) |
| Comms | `/comms` | Announcements & reminders (phase 3) |
| Settings | `/settings` | Club profile, nights, membership plans & fees, theme |
| Club Night / Tournaments / History / Analytics | existing | unchanged |

## Phase 1 — Members, guests & money  ✅ built (2026-09-25)

1. ✅ **Full pages** for Members, Guests, Finance, Settings replacing the home-screen drawers.
2. ✅ **Membership plans** in Settings: Full / Student / Social — name, fee, cadence, active. Each member is on a plan.
3. ✅ **Member lifecycle**: `guest → trial → active → paused → lapsed → archived`. Status badge on roster; check-in warns if paused/lapsed.
4. ✅ **Richer profile**: phone, emergency contact, joined date, plan, level, gender.
5. ✅ **Notes** timeline on the profile (author + date).
6. ✅ **Pause**: from / until / reason. No dues while paused; auto-resume on end date.
7. ✅ **Guests page**: visit counts, "ask to join after N visits", **Convert to member** (keeps history; first period full / pro-rata / none).
8. ✅ **Billing**: bill a plan for a period (skips paused); mark paid / waived / unpaid; per-member ledger; income by month; CSV export.
9. ✅ **Overdue flag**: unpaid dues past the period end are listed in the Ledger with one-click "Mark lapsed". (Not-seen-for-X-weeks shows on the profile's Attendance tab; no automatic flag yet.)

Migrations applied to Supabase: `018_payments.sql`, `019_membership.sql`. Tests: `cd client && npm test`.

## Phase 2 — Committee

10. One login per admin: owner, treasurer (finance), secretary (members), read-only. Email invites, revoke.
11. Activity log ("Priya marked J. Smith paid £30, 25 Sep").
    - `club_admins` table + `is_club_admin()` RLS helper; `members` and payment tables re-scoped. Session/queue/match tables untouched (owner runs nights).
    - Invite = Supabase Edge Function (Express server is Pi-only, unreachable from the web app).

## Phase 3 — Comms

12. Email reminders (payment due — single or "remind all unpaid"; session reminders; announcements) via Resend Edge Function, with a send log.
13. WhatsApp tap-to-send per member (`wa.me/<phone>?text=…`) — free, manual, no provider.

## Phase 4 — Members' side & online payments

14. Stripe payment links on each due; webhook marks it paid. Guests pay the night fee by link.
15. Member portal / app: own balance & pay, RSVP to nights, update details, request a pause.
16. Push notifications (needs the portal to have recipients).

## Later / nice-to-have

- Dashboard: active / paused / outstanding / guest visits / attendance trend
- Expenses (court hire, shuttles — shuttle budget exists) → simple P&L
- Waiver / consent on joining; GDPR export & delete

## Data model (Supabase)

- `members` + `status`, `phone`, `emergency_contact`, `joined_at`, `plan_id`, `paused_from`, `paused_until`, `pause_reason`
- `membership_plans` (club_id, name, fee, cadence, active)
- `member_notes` (member_id, author, body, created_at)
- `membership_dues` (exists) + `plan_id`; `session_fees` (exists, guests)
- Guest visits derived from `queue_entries` — no new table
- Phase 2: `club_admins`, `activity_log` · Phase 3: `notification_log`

## Build order within phase 1

1. Routes + full pages (Members, Finance, Settings) — replace drawers
2. Membership plans in Settings (absorbs the cadence/fee settings)
3. Member status + pause + notes on the profile page
4. Guests page + convert-to-member
5. Billing tied to plans, pause-aware; ledger, lapse flags, CSV export

One commit per step. Migrations numbered from `019_…`.

## Prerequisites the user owns

- Resend account + verified sending domain (before phase 3)
- Stripe account (before phase 4)
