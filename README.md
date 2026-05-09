# Linehaul Manager

A Next.js 16 + React 19 dispatch management system for linehaul requests. The app uses Azure Database for PostgreSQL as its backend data store.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- SWR
- Azure Database for PostgreSQL
- `pg` PostgreSQL client
- `pnpm` package manager

## Environment Setup

Create `.env.local` in the project root:

```env
AZURE_POSTGRES_CONNECTION_STRING=postgresql://app_user:password@your-server.postgres.database.azure.com:5432/linehaul?sslmode=require
POSTGRES_SSL=require
POSTGRES_SSL_REJECT_UNAUTHORIZED=false
POSTGRES_POOL_MAX=10
AUTH_SESSION_SECRET=replace-with-a-long-random-secret
EVENT_BUS_PROVIDER=local
EVENT_BUS_POLL_INTERVAL_MS=1000
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

`EVENT_BUS_PROVIDER=local` keeps the development SSE bridge in process memory. Use `EVENT_BUS_PROVIDER=azure-postgres` when multiple app instances need to receive request events through the durable `request_events` table.

Upstash variables are optional. Without them, login rate limiting uses an in-memory local fallback.

## Azure Database Setup

1. Create an Azure Database for PostgreSQL flexible server.
2. Create a database for the app, for example `linehaul`.
3. Allow your local IP address through the Azure database firewall.
4. Run `azure/postgres-schema.sql` against the app database.
5. Add seed rows to `public.users` and `public.clusters`.
6. Put the Azure PostgreSQL connection string in `.env.local`.

See `AZURE_DATABASE_SETUP_PLAIN_ENGLISH.md` for a non-technical setup walkthrough.

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
- `lib/azure-database.ts` maps PostgreSQL rows to app types and exposes:
  - `validateUser()`
  - `getClusters()`
  - `getRequests()`
  - `createRequest()`
  - `updateRequest()`
  - `getPendingCounts()`
- `lib/request-events.ts` persists request events to `request_events`.
- `lib/events/*` isolates the event bus. Local mode is best for development; Azure PostgreSQL polling mode is available for multi-instance deployments.

## API Routes

- `app/api/auth/login/route.ts` validates against the `users` table.
- `app/api/azure/clusters/route.ts` returns cluster data.
- `app/api/azure/requests/route.ts` lists and creates requests.
- `app/api/azure/requests/[id]/route.ts` updates requests.
- `app/api/azure/requests/export/route.ts` exports requests as CSV.
- `app/api/azure/pending-count/route.ts` counts pending requests.
- `app/api/events/route.ts` exposes the SSE update stream.

## Request API Filtering

`GET /api/azure/requests` supports these query parameters:

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

- If startup fails with a database configuration error, check `AZURE_POSTGRES_CONNECTION_STRING`.
- If database calls time out locally, confirm the Azure firewall allows your current IP address.
- If authentication fails, verify that the `users` table contains the expected email or OPS ID.
- If reads return empty data, confirm `azure/postgres-schema.sql` was applied and the tables contain data.
