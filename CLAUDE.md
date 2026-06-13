# Badminton Club Night — Claude Context

## Project Overview
A PWA for managing badminton club nights. Admin manages a permanent member roster and starts nightly sessions. Players check in on arrival and join the queue. Courts are managed by the admin who picks 4 players per court to start matches.

## Tech Stack
- **Client**: React 18 + TypeScript + Vite PWA, Tailwind CSS v3, Framer Motion, Zustand (persist middleware), Lucide icons
- **Server**: Node.js + Express + better-sqlite3 (SQLite), runs on port 3000
- **Dev preview**: Vite on port 5173
- **Node version**: v20 via nvm — always use `/Users/sakthimuruganv/.nvm/versions/node/v20.20.2/bin/node`
- **DB path**: `server/data/club.db`

## Running Locally
```bash
# Server
cd server && npm run dev   # port 3000

# Client
cd client && npm run dev   # port 5173
```

## Architecture

### User Flow
```
ADMIN SETUP (one-time):
  /admin → Settings drawer → set club name, venue, night timings, WhatsApp

EACH NIGHT:
  /admin (no session) → SessionSetup
    → Enter club name + number of courts (1–20) → "Start Night!"

  /admin (active session) → AdminSessionView (3-panel kiosk layout):
    LEFT:   CheckInPanel — member list, check in / remove, + Add Guest Player
    CENTRE: CourtsView   — courts grid, Go button → PlayerPicker modal
    RIGHT:  Leaderboard  — match history + stats

  Player arrives → admin checks them in → they join end of queue
  Admin clicks "Go" on a free court → PlayerPicker → pick 4 → Start Match
  Match ends → admin marks result → players return to queue
```

### Member Types
- `male` → blue avatar (`bg-blue-500`)
- `female` → pink avatar (`bg-pink-500`)
- `guest` → purple avatar (`bg-purple-500`), **not** shown in permanent roster

### Key Files
```
client/src/
  pages/
    AdminView.tsx           — Routes: no session → SessionSetup, session → AdminSessionView
    AdminSessionView.tsx    — Full 3-panel layout, slide-over drawers (Members/Settings)
  components/
    admin/
      SessionSetup.tsx      — Club name + courts number input (1–20) → Start Night
      CheckInPanel.tsx      — Check-in list, guest add, queue position display
      MemberManagement.tsx  — Permanent roster: add/edit/delete (no guests)
      ClubSettings.tsx      — Club name, venue, night day/times, WhatsApp link
    courts/
      CourtsView.tsx        — Courts grid
      CourtCard.tsx         — Individual court with Go button
    queue/
      PlayerPicker.tsx      — Modal: pick 4 from queue → start match
      QueueList.tsx         — Queue display
    leaderboard/
      Leaderboard.tsx       — Stats and match history
    shared/
      Avatar.tsx            — Colour-coded by member_type
      Button.tsx
      ShuttlecockIcon.tsx
  store/index.ts            — Zustand stores (Session, Member, Queue, Match, Sync)
  services/api.ts           — All API calls
  types/index.ts            — TypeScript interfaces

server/src/
  routes/
    members.ts              — GET / POST / PATCH /:id / DELETE /:id
    sessions.ts             — POST /start, GET /current, POST /:id/end
    queue.ts                — GET /:sessionId, POST /checkin, DELETE /:sessionId/:memberId
    matches.ts              — GET /:sessionId, POST /start, POST /:id/result
  db/schema.sql             — SQLite schema
  index.ts                  — Express app setup
```

### Database Schema (SQLite)
```sql
members (id, name, email, avatar_url, member_type TEXT DEFAULT 'male', created_at)
sessions (id, club_name, date, num_courts, status, created_at)
queue_entries (id, session_id, member_id, position, checked_in_at)
matches (id, session_id, court_id, team_a, team_b, result, created_at)
```

### Zustand Stores
- **SessionStore** (persisted): `session`, `courts`, `clubName`, `clubConfig` (ClubConfig)
  - `ClubConfig`: `{ name, venue, nightDay, nightStart, nightEnd, whatsapp }`
  - Deep-merge persist strategy so new fields survive old localStorage state
- **MemberStore** (persisted): `members` (Record<string, Member>)
- **QueueStore** (not persisted): `queue`, `activeMemberIds`, `picker` (PickerState)
- **MatchStore** (persisted): `matches`
- **SyncStore**: `sync` (pending_changes, status)

### API Base URL
`http://localhost:3000/api` (proxied via Vite in dev)

## Key Design Decisions
- Guests use `member_type = 'guest'` — appear in check-in/queue but NOT in Members roster
- `CheckInPanel` is the session-night view; `MemberManagement` is the permanent roster
- AdminSessionView bootstraps all data fresh from API on mount (avoids stale Zustand state)
- PlayerPicker must call `addMatch`, `updateCourtStatus`, `removeFromQueue`, `setActiveMemberIds` after API call — not just `closePicker`
- Courts number input supports 1–20 (not just 1–6)

## Friends Groups (prototype — Splitwise-style casual play)
A second mode alongside clubs, for friends who organise ad-hoc games.
- **Entry**: `ModeChooser` (shown when `useGroupStore.appMode === null`) → "Run a Club" or "Play with Friends".
- **Model**: one logged-in person → many groups → each group has its own `GroupMember[]`. Persisted in `useGroupStore` ("group-store"). No fixed night; sessions are ad-hoc.
- **Pages**: `pages/GroupsHomeView.tsx` (group list + create), `pages/GroupDetailView.tsx` (members, invite link, Start Session). Routes `/groups`, `/groups/:id`.
- **Persistence (dual path)**: a signed-in **group account** (`account_type: 'group'` in Supabase user metadata) persists groups/members to Supabase via `services/groups.ts` (`groupsApi`). A **guest** (`localStorage 'friends-guest' === 'true'`, no account) stays on the local `useGroupStore`. Pages branch on `isGuest()`.
- **Session re-scoping**: a group session is a normal `Session` carrying `group_id`. `api.ts isOffline()` returns true whenever the active session has a `group_id`, so the *entire* queue/court/match engine runs on local Zustand for groups. Start Session hydrates `useMemberStore` from the group's members, then opens the session.
- **Invite / join**: `GroupDetailView` shows an invite link → `/groups/join/:token` (`JoinView`, a **public** route mounted outside `AuthGuard` in `App.tsx`). Join uses the `get_group_by_invite` / `join_group` SECURITY DEFINER RPCs; anon name-only joins are allowed.
- **Backend**: migrations **003_groups.sql** (tables + RLS + RPCs) and **004_fix_group_rls.sql** (fixes 42P17 recursion via `is_group_owner`/`is_group_member` SECURITY DEFINER helpers) are **APPLIED**. Group RLS is owner-scoped + member-read.
- **v1 roadmap** (agreed): Core loop ✅ → Supabase + invite/join ✅ → Splitwise expenses (next) → RSVP + reminders.

## Preview Server
- Preview server ID: `bd895075-0b59-409b-b439-2a42c3139835` (port 5173)
- Routes: `/admin`, `/kiosk`, `/mobile`, `/leaderboard`

## Known Issues / Watch Out For
- Always use nvm node path when running server commands
- Old localStorage can be missing `clubConfig` — the persist merge strategy handles this
- Guests should never appear in `MemberManagement` (filter `member_type !== 'guest'`)
- After `matchesApi.start()`, always update Zustand state (match, court, queue, activeIds)
