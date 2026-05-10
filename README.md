# Linehaul Manager

A Next.js 16 + React 19 dispatch management system for linehaul requests backed by PostgreSQL.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- SWR
- PostgreSQL
- `pg` PostgreSQL client
- `pnpm` package manager

## Environment Setup

Create `.env.local` in the project root:

```env
DATABASE_URL=postgresql://app_user:password@localhost:5432/linehaul
POSTGRES_SSL=disable
POSTGRES_SSL_REJECT_UNAUTHORIZED=false
POSTGRES_POOL_MAX=10
AUTH_SESSION_SECRET=replace-with-a-long-random-secret
EVENT_BUS_PROVIDER=local
EVENT_BUS_POLL_INTERVAL_MS=1000
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

`EVENT_BUS_PROVIDER=local` keeps the development SSE bridge in process memory. Use `EVENT_BUS_PROVIDER=postgres` when multiple app instances need to receive request events through the durable `request_events` table.

Upstash variables are optional. Without them, login rate limiting uses an in-memory local fallback.

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

- `lib/postgres.ts` owns the PostgreSQL connection pool and query wrapper.
- `lib/database.ts` maps PostgreSQL rows to app types and exposes:
  - `validateUser()`
  - `getClusters()`
  - `getRequests()`
  - `createRequest()`
  - `updateRequest()`
  - `getPendingCounts()`
- `lib/request-events.ts` persists request events to `request_events`.
- `lib/events/*` isolates the event bus. Local mode is best for development; PostgreSQL polling mode is available for multi-instance deployments.

## API Routes

- `app/api/auth/login/route.ts` validates against the `users` table.
- `app/api/clusters/route.ts` returns cluster data.
- `app/api/requests/route.ts` lists and creates requests.
- `app/api/requests/[id]/route.ts` updates requests.
- `app/api/requests/export/route.ts` exports requests as CSV.
- `app/api/pending-count/route.ts` counts pending requests.
- `app/api/events/route.ts` exposes the SSE update stream.

## Request API Filtering

`GET /api/requests` supports these query parameters:

```txt
status
dateFrom
dateTo
search
plateNumber
hubCluster
region
limit
offset
```

## Troubleshooting

- If startup fails with a database configuration error, check `DATABASE_URL`.
- If authentication fails, verify that the `users` table contains the expected email or OPS ID.
- If reads return empty data, confirm the database schema was applied and the tables contain data.
