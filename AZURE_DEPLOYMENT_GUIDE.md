# Azure Migration And Deployment Guide

This guide switches Linehaul Manager from Supabase-hosted Postgres to Azure-hosted infrastructure.

Use **Azure Database for PostgreSQL Flexible Server** as the database. Do not use Azure SQL Database for this migration unless you want to rewrite the SQL schema and data-access layer for T-SQL. The existing app schema is PostgreSQL-native and uses `jsonb`, `timestamptz`, triggers, and `pg_trgm` indexes.

## Recommended Azure Resources

| Need | Azure resource | Recommended starting choice |
| --- | --- | --- |
| Web app and API routes | Azure App Service for Linux | Node.js 22 LTS, B1 for test, P0v3/P1v3 for production |
| Database | Azure Database for PostgreSQL Flexible Server | PostgreSQL 16 or 17, Burstable B1ms/B2s for test, General Purpose for production |
| Secrets | Azure Key Vault | Standard |
| App identity | App Service system-assigned managed identity | Enabled |
| Logs and metrics | Application Insights + Log Analytics | Workspace-based |
| Login rate limiter | Azure Managed Redis | Optional, recommended when scaling out |
| Edge/WAF | Azure Front Door | Optional for public production apps |
| Private networking | VNet integration + Private Endpoint | Optional for internal production apps |

Official docs used for these choices:

- Azure App Service Node.js: https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs
- Azure Database for PostgreSQL Flexible Server: https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/
- Azure PostgreSQL TLS/SSL: https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-connect-tls-ssl
- Azure Managed Redis: https://learn.microsoft.com/en-us/azure/redis/

## Target Architecture

```txt
Users
  -> Azure App Service for Linux
      -> Next.js pages
      -> Next.js API routes
      -> SSE endpoint /api/events
      -> PostgreSQL data-access module
  -> Azure Database for PostgreSQL Flexible Server
      -> clusters
      -> users
      -> requests
      -> request_events outbox
  -> Azure Monitor / Application Insights
```

## Important Code Change Required

This repo currently talks to Supabase through `lib/supabase.ts`, which calls the Supabase REST API. Azure Database for PostgreSQL does not expose the Supabase REST API.

To complete the database switch, replace the Supabase REST data layer with a direct PostgreSQL adapter:

```txt
Current:
lib/supabase.ts
lib/supabase-database.ts
  -> Supabase REST API

Target:
lib/postgres.ts
lib/postgres-database.ts or updated lib/supabase-database.ts
  -> Azure PostgreSQL connection string
```

Recommended npm package:

```txt
pg
@types/pg
```

Recommended environment variable:

```env
DATABASE_URL=postgresql://linehaul_app:<password>@<server>.postgres.database.azure.com:5432/linehaul?sslmode=require
```

Keep the public API routes the same. Only the server-side data-access implementation should change.

## Azure PostgreSQL Schema

Run this repo file against Azure PostgreSQL:

```txt
azure/postgres-schema.sql
```

It mirrors the Supabase schema but removes Supabase-specific RLS setup and uses:

```sql
create extension if not exists pg_trgm;
```

instead of creating the extension in Supabase's `extensions` schema.

## Environment Variables

After the migration, production should use:

```env
DATABASE_URL=postgresql://linehaul_app:<password>@<server>.postgres.database.azure.com:5432/linehaul?sslmode=require
AUTH_SESSION_SECRET=<long-random-secret>
EVENT_BUS_PROVIDER=postgres
EVENT_BUS_POLL_INTERVAL_MS=1000
AZURE_MANAGED_REDIS_URL=
AZURE_MANAGED_REDIS_TOKEN=
```

Keep these only during migration or rollback:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

`EVENT_BUS_PROVIDER=postgres` requires a small event bus adapter that polls `request_events` from Azure PostgreSQL. The current Supabase event bus polls the same table through Supabase REST, so the logic can be reused with direct SQL.

## Local Setup

Install tools:

```powershell
node --version
pnpm --version
az version
psql --version
```

Install project dependencies:

```powershell
pnpm install
```

Generate an auth secret:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Create `.env.local`:

```env
DATABASE_URL=postgresql://linehaul_app:<password>@localhost:5432/linehaul?sslmode=disable
AUTH_SESSION_SECRET=<generated-secret>
EVENT_BUS_PROVIDER=postgres
EVENT_BUS_POLL_INTERVAL_MS=1000
```

Run the app:

```powershell
pnpm dev
```

## Create Azure Resources

Set names:

```powershell
$RESOURCE_GROUP="rg-linehaul-prod"
$LOCATION="southeastasia"
$POSTGRES_NAME="psql-linehaul-prod"
$POSTGRES_DB="linehaul"
$POSTGRES_ADMIN="linehauladmin"
$APP_PLAN="asp-linehaul-prod"
$WEBAPP_NAME="app-linehaul-prod"
$LOG_WORKSPACE="log-linehaul-prod"
$APPINSIGHTS_NAME="appi-linehaul-prod"
$KEYVAULT_NAME="kv-linehaul-prod"
```

Create the resource group:

```powershell
az group create `
  --name $RESOURCE_GROUP `
  --location $LOCATION
```

Create PostgreSQL Flexible Server:

```powershell
az postgres flexible-server create `
  --resource-group $RESOURCE_GROUP `
  --location $LOCATION `
  --name $POSTGRES_NAME `
  --admin-user $POSTGRES_ADMIN `
  --admin-password "<strong-admin-password>" `
  --sku-name Standard_B2s `
  --tier Burstable `
  --version 16 `
  --storage-size 32 `
  --public-access 0.0.0.0
```

For production, restrict firewall access to the App Service outbound IPs or use private networking.

Create the database:

```powershell
az postgres flexible-server db create `
  --resource-group $RESOURCE_GROUP `
  --server-name $POSTGRES_NAME `
  --database-name $POSTGRES_DB
```

Create monitoring:

```powershell
az monitor log-analytics workspace create `
  --resource-group $RESOURCE_GROUP `
  --workspace-name $LOG_WORKSPACE `
  --location $LOCATION

az monitor app-insights component create `
  --app $APPINSIGHTS_NAME `
  --location $LOCATION `
  --resource-group $RESOURCE_GROUP `
  --workspace $LOG_WORKSPACE `
  --kind web `
  --application-type web
```

Create App Service:

```powershell
az appservice plan create `
  --name $APP_PLAN `
  --resource-group $RESOURCE_GROUP `
  --location $LOCATION `
  --is-linux `
  --sku B1

az webapp create `
  --resource-group $RESOURCE_GROUP `
  --plan $APP_PLAN `
  --name $WEBAPP_NAME `
  --runtime "NODE:22-lts"
```

Enable managed identity:

```powershell
az webapp identity assign `
  --resource-group $RESOURCE_GROUP `
  --name $WEBAPP_NAME
```

## Initialize The Database

Get the hostname:

```powershell
$POSTGRES_HOST="$POSTGRES_NAME.postgres.database.azure.com"
```

Run the schema:

```powershell
psql "host=$POSTGRES_HOST port=5432 dbname=$POSTGRES_DB user=$POSTGRES_ADMIN password=<strong-admin-password> sslmode=require" `
  -f azure/postgres-schema.sql
```

Create an app database user:

```sql
create user linehaul_app with password '<strong-app-password>';
grant connect on database linehaul to linehaul_app;
grant usage on schema public to linehaul_app;
grant select, insert, update, delete on all tables in schema public to linehaul_app;
grant usage, select on all sequences in schema public to linehaul_app;
alter default privileges in schema public grant select, insert, update, delete on tables to linehaul_app;
alter default privileges in schema public grant usage, select on sequences to linehaul_app;
```

Seed required data:

```sql
insert into public.users (id, name, ops_id, email, role)
values
  ('ops-pic-1', 'Test Ops PIC', 'TESTPIC', null, 'OPS_PIC'),
  ('fte-ops-1', 'Test FTE Ops', null, 'test.ops@example.com', 'FTE_OPS'),
  ('fte-mm-1', 'Test FTE MM', null, 'test.mm@example.com', 'FTE_MM')
on conflict (id) do nothing;
```

Import real `clusters`, `users`, `requests`, and `request_events` from Supabase using CSV export/import or `pg_dump` if you have direct Postgres access.

## Configure App Service Settings

```powershell
$DATABASE_URL="postgresql://linehaul_app:<strong-app-password>@$POSTGRES_HOST:5432/$POSTGRES_DB?sslmode=require"
$AUTH_SECRET="<generated-secret>"

az webapp config appsettings set `
  --resource-group $RESOURCE_GROUP `
  --name $WEBAPP_NAME `
  --settings `
    SCM_DO_BUILD_DURING_DEPLOYMENT=true `
    ENABLE_ORYX_BUILD=true `
    WEBSITE_NODE_DEFAULT_VERSION=~22 `
    DATABASE_URL="$DATABASE_URL" `
    AUTH_SESSION_SECRET="$AUTH_SECRET" `
    EVENT_BUS_PROVIDER="postgres" `
    EVENT_BUS_POLL_INTERVAL_MS="1000"
```

Set startup command:

```powershell
az webapp config set `
  --resource-group $RESOURCE_GROUP `
  --name $WEBAPP_NAME `
  --startup-file "corepack enable && pnpm start"
```

## Required App Refactor Checklist

Before removing Supabase:

- Add `pg` and `@types/pg`.
- Add `lib/postgres.ts` with a connection pool using `DATABASE_URL`.
- Replace `supabaseRequest()` calls with parameterized SQL queries.
- Replace `supabaseCount()` with `select count(*)`.
- Keep optimistic concurrency: update requests with `where id = $id and status = $expectedStatus`.
- Replace the Supabase event bus provider with a Postgres polling provider reading `request_events`.
- Change API error code `SUPABASE_UNAVAILABLE` to a neutral database code, or keep it only while Supabase fallback exists.
- Update README and `.env.local.example` after code is migrated.

Do not expose `DATABASE_URL` to the browser. It must stay server-side only.

## Suggested SQL Mapping

| Existing function | PostgreSQL query behavior |
| --- | --- |
| `validateUser()` | `select * from users where ops_id = $1 or email = $1 limit 1` |
| `getClusters()` | `select * from clusters order by name asc` |
| `getRequests()` | `select * from requests where ... order by request_time desc, id desc limit $limit + 1 offset $offset` |
| `createRequest()` | `insert into requests (...) values (...) returning *` |
| `updateRequest()` | `update requests set ... where id = $1 and status = $2 returning *` |
| `getPendingCounts()` | Two `count(*)` queries for `PENDING_OPS` and `PENDING_MM` |
| `publishRequestEvent()` | `insert into request_events (...) values (...)` |

## Deployment With GitHub Actions

Recommended workflow:

```yaml
name: Deploy to Azure App Service

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - run: corepack enable

      - uses: pnpm/action-setup@v4
        with:
          run_install: false

      - run: pnpm install --frozen-lockfile
      - run: pnpm build
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          AUTH_SESSION_SECRET: ${{ secrets.AUTH_SESSION_SECRET }}
          EVENT_BUS_PROVIDER: postgres
          EVENT_BUS_POLL_INTERVAL_MS: "1000"

      - uses: azure/webapps-deploy@v3
        with:
          app-name: app-linehaul-prod
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
          package: .
```

Required GitHub secrets:

```txt
AZURE_WEBAPP_PUBLISH_PROFILE
DATABASE_URL
AUTH_SESSION_SECRET
```

## Verification

Run locally:

```powershell
pnpm build
pnpm start
```

Production smoke test:

- Login works for `OPS_PIC`, `FTE_OPS`, and `FTE_MM`.
- Cluster dropdown loads from Azure PostgreSQL.
- OPS PIC can create a request.
- FTE Ops can approve, reject, and edit pending requests.
- FTE MM can assign and reject requested trucks.
- Conflicting stale updates return `409 REQUEST_CONFLICT`.
- Dashboard counts match database rows.
- `/api/events` connects and receives updates.
- Export route returns CSV.

## Cutover Plan

1. Freeze writes in Supabase or schedule downtime.
2. Export Supabase tables in this order:
   - `clusters`
   - `users`
   - `requests`
   - `request_events`
3. Import into Azure PostgreSQL.
4. Run validation counts on both databases.
5. Deploy app version using `DATABASE_URL`.
6. Smoke test all role workflows.
7. Point users to the Azure App Service/custom domain.
8. Keep Supabase read-only for rollback until production is stable.

## Rollback Plan

Keep Supabase env vars and the old Supabase adapter available until the Azure migration is stable.

Rollback steps:

1. Set app settings back to `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `EVENT_BUS_PROVIDER=supabase`.
2. Redeploy the last Supabase-backed build.
3. Verify login and request workflows.
4. Reconcile any writes made to Azure PostgreSQL before retrying migration.

## Production Hardening

- Use Key Vault references for `DATABASE_URL` and `AUTH_SESSION_SECRET`.
- Restrict PostgreSQL firewall rules.
- Prefer private endpoint/VNet integration for production.
- Enable PostgreSQL automatic backups and choose an appropriate retention period.
- Enable App Service Always On on paid production tiers.
- Enable HTTPS Only and minimum TLS 1.2.
- Use Azure Managed Redis for shared rate limiting when scaling out.
- Monitor App Service failures, database CPU, connections, storage, and slow queries.

## First Production Baseline

Use this baseline for first launch:

```txt
Region: Southeast Asia
App runtime: Azure App Service for Linux, Node.js 22 LTS
Database: Azure Database for PostgreSQL Flexible Server
PostgreSQL version: 16 or 17
Database tier: Burstable for test, General Purpose for production
Monitoring: Application Insights + Log Analytics
Secrets: App Service settings first, Key Vault before go-live
Event bus: request_events outbox polled from PostgreSQL
Deployment: GitHub Actions
```
