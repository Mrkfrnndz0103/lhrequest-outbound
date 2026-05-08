# Linehaul Manager

A Next.js 16 + React 19 dispatch management system for Shopee linehaul requests. The app uses Supabase as its backend data store.

## Key Features

- Role-based authentication for OPS PIC, FTE Ops, and FTE MM users
- Supabase-backed request, user, and cluster tables
- Request creation, FTE Ops approval/rejection, FTE MM assignment/rejection
- Real-time pending request updates using Server-Sent Events
- Event-driven request updates with a durable Supabase outbox table
- Dashboard counts, recent activity, request filtering, and SWR polling

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- SWR
- Supabase REST API
- Radix UI components
- `pnpm` package manager

## Environment Setup

Create `.env.local` in the project root:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
AUTH_SESSION_SECRET=replace-with-a-long-random-secret
```

## Supabase Setup

1. Open the Supabase SQL editor.
2. Run `supabase/schema.sql`.
3. Confirm these tables exist in the `public` schema:
   - `clusters`
   - `users`
   - `requests`
   - `request_events`

The schema enables row level security and does not add public policies. The app API routes should use `SUPABASE_SERVICE_ROLE_KEY` server-side.

## Install and Run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

For production:

```bash
pnpm build
pnpm start
```

## Data Layer

- `lib/supabase.ts` builds authenticated Supabase REST requests.
- `lib/supabase-database.ts` maps Supabase rows to the existing app types and exposes:
  - `validateUser()`
  - `getClusters()`
  - `getRequests()`
  - `createRequest()`
  - `updateRequest()`
  - `getPendingCounts()`
- `lib/request-events.ts` publishes request domain events to the local event bus and persists them to `request_events`.

## Scalability and Event Flow

- Request creation and updates publish explicit events such as `request.created`, `request.approved`, and `request.assigned`.
- `/api/events` exposes one SSE stream for connected browsers, broadcasts request events, and debounces pending-count refreshes after bursts of writes.
- Request list polling is kept as a fallback, but successful SSE events trigger immediate SWR revalidation.
- The `request_events` table acts as an outbox/audit log so a background worker, queue, or notification service can process request events independently.
- For multi-instance production deployments, replace the in-memory subscriber set in `lib/request-events.ts` with Redis, Supabase Realtime, or a managed pub/sub adapter while keeping the same publish/subscribe interface.

## Operational Quality

- Performance: request list reads are capped and cacheable, count refreshes are debounced, SWR polling backs off behind SSE, and production builds no longer depend on downloading external Google font files.
- Security: login sets a signed HTTP-only session cookie, API routes enforce authentication and role authorization, OPS PIC request reads are scoped to their own `opsPicId`, and global security headers are applied.
- Usability: fetch failures now surface as real SWR errors instead of malformed successful responses, while development quick-login still creates a valid dev-only session.
- Reliability: Supabase calls keep timeout/retry handling, SSE keeps heartbeat and polling fallback behavior, and event persistence is decoupled from the user-facing write response.
- Scalability: the event outbox, request indexes, capped pagination, and SSE-driven revalidation reduce repeated database work as usage grows.
- Maintainability: auth/session checks, JSON fetching, event publishing, and Supabase data mapping are centralized in small reusable modules.
## API Routes

- `app/api/auth/login/route.ts` validates against the `users` table.
- `app/api/supabase/clusters/route.ts` returns Supabase cluster data.
- `app/api/supabase/requests/route.ts` lists and creates Supabase requests.
- `app/api/supabase/requests/[id]/route.ts` updates Supabase requests.
- `app/api/supabase/pending-count/route.ts` counts pending Supabase requests.
- `app/api/events/route.ts` keeps the existing SSE update stream.

## Troubleshooting

- If authentication fails, verify the `users` table values and login identifier format.
- If API routes fail with `Supabase URL or service role key not configured`, check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- If reads return empty data, confirm `supabase/schema.sql` was applied and the Supabase tables contain data.
- If real-time count updates do not appear, check browser SSE connectivity to `/api/events`.
