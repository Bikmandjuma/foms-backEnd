# Field Operation MS — Backend

Multi-tenant research-operations backend. Node.js/Express/TypeScript + Prisma
(MySQL) + Socket.io. This started as the Huska Survey backend and has been
extended in place — nothing existing was renamed or broken.

## What's new in this pass

- **Real per-role permissions.** `Role.permissions` is now an actual JSON
  array of permission keys (see `src/utils/permissions.ts` for the catalog),
  enforced server-side via `requirePermission()` middleware on every
  sensitive route — not just hidden in the frontend.
- **Replacement Requests** (`/api/replacement-requests`) — the PRD's
  replacement-engine module. An enumerator raises a request, a
  `replacements:manage`-permitted user approves/rejects it, and both people
  get notified.
- **Field Check-ins** (`/api/field-checkins`) — duty-of-care monitoring: who's
  currently in the field, since when, optionally with GPS + a project link.
- **Activity Logs** (`/api/activity-logs`) — a full audit trail. Login,
  logout, every create/update/delete on users/roles/programs/beneficiaries,
  every assignment, every replacement decision — all logged and queryable.
- **Notifications** (`/api/notifications`) — real notifications, not a
  decorative bell. Assigning someone to a program or as a beneficiary's
  caseworker creates a notification for them; replacement request
  creation/decisions notify the relevant people too. Pushed live over
  Socket.io if they're connected, otherwise sitting in `GET /notifications`
  for next time.
- **Socket.io** — JWT-authenticated sockets, joined into per-tenant and
  per-user rooms. Powers: live "online users" presence (`presence:update`),
  live activity feed (`activity:new`), live notification push
  (`notification:new`).
- **Dashboard summary** (`/api/dashboard/summary`) — real aggregate counts and
  chart-ready series (respondent outcomes, program status breakdown, 7-day
  check-in volume) computed straight from the DB.
- `Program` gained `scenarioType`, `status`, `targetSampleSize`, `startDate`,
  `endDate`. `Beneficiary` gained `consentGiven`, `consentAt`, `outcome`.
  All additive/optional — existing rows remain valid.

## Setup (same as before, plus one new step)

```bash
npm install
cp .env.example .env        # fill in DB + JWT_SECRET as before
npm run prisma:migrate      # will pick up the new columns/tables automatically
npm run prisma:seed         # unchanged — seeds the platform admin
npx tsx scripts/backfill-permissions.ts   # NEW — see below
npm run dev
```

### Why the backfill script

If you already had a tenant (created via `POST /api/tenants`) **before** this
change, its auto-created "admin" role has `permissions: null` in the DB,
because that column didn't exist yet. Newly created tenants get the full
permission set automatically (see `tenantController.createTenant`), but
existing ones need a one-time backfill:

```bash
npx tsx scripts/backfill-permissions.ts
```

This grants every role literally named "admin" (case-insensitive) with no
permissions yet the full tenant permission set. Safe to run more than once —
it skips roles that already have permissions.

## New endpoints at a glance

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/api/replacement-requests` | list/create — any tenant user |
| POST | `/api/replacement-requests/:id/decide` | requires `replacements:manage` |
| DELETE | `/api/replacement-requests/:id` | requires `replacements:manage` |
| GET/POST | `/api/field-checkins` | list requires `monitoring:view`; check-in is self-serve |
| POST | `/api/field-checkins/:id/end` | check yourself out |
| GET | `/api/activity-logs` | requires `activity:view` |
| GET | `/api/notifications` | your own notifications + unread count |
| POST | `/api/notifications/:id/read`, `/read-all` | mark read |
| GET | `/api/dashboard/summary` | counts + chart series |
| GET | `/api/meta/permissions` | permission catalog, grouped, for building the Roles UI |

## Socket.io

Clients connect with `io(baseUrl, { auth: { token } })` using the same JWT
returned by login. Events:

- `presence:update` — `{ onlineUserIds, count }`, broadcast to everyone in
  your tenant whenever anyone connects/disconnects a socket.
- `activity:new` — a fresh `ActivityLog` row, broadcast tenant-wide.
- `notification:new` — a fresh `Notification`, sent only to its recipient.
