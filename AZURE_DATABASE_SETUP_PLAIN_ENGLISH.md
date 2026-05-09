# Azure Database Setup, Plain English

This app now stores its data in Azure Database for PostgreSQL.

## What You Need

- An Azure account.
- Permission to create an Azure Database for PostgreSQL flexible server.
- A database tool such as Azure Data Studio, pgAdmin, DBeaver, or `psql`.
- This project on your computer.

## 1. Create the Database Server

1. Open the Azure Portal.
2. Search for `Azure Database for PostgreSQL flexible server`.
3. Create a new flexible server.
4. Choose PostgreSQL 16 if Azure offers it. PostgreSQL 15 is also fine.
5. Pick a server name, admin username, and admin password.
6. Choose a region close to where the app will run.
7. For local testing, the smallest development size is enough.

Keep the admin username and password. You will need them to connect.

## 2. Create the App Database

Inside the PostgreSQL server, create a database named:

```txt
linehaul
```

You can create it from the Azure Portal or from a database tool.

## 3. Allow Your Computer to Connect

Azure blocks outside connections by default.

1. Open the PostgreSQL server in Azure.
2. Go to `Networking`.
3. Add your current public IP address to the firewall rules.
4. Save the change.

If your internet provider changes your IP address later, you may need to update this rule.

## 4. Run the App Tables Script

Connect to the `linehaul` database with your database tool.

Run this file:

```txt
azure/postgres-schema.sql
```

That creates the app tables:

```txt
clusters
users
requests
request_events
```

It also creates indexes and update-time triggers.

## 5. Add Login Users

The app reads logins from the `users` table.

Example users:

```sql
insert into public.users (name, ops_id, email, role, "is active", update_as_of)
values
  ('Ops PIC User', 'OPSPIC001', null, 'OPS_PIC', true, now()),
  ('FTE Ops User', null, 'fte.ops@example.com', 'FTE_OPS', true, now()),
  ('FTE MM User', null, 'fte.mm@example.com', 'FTE_MM', true, now())
on conflict do nothing;
```

Backroom users log in with `ops_id`. FTE users log in with `email`.
Set `"is active"` to `false` to disable a login without deleting the row.

## 6. Add Clusters

The request form needs cluster rows.

Example:

```sql
insert into public.clusters (
  hub_name,
  cluster,
  "Region_gen",
  "dock_#",
  backlogs,
  backlogs_ts
)
values
  ('North Hub', 'Cluster A', 'North', 'DAC 1', 2000, now()),
  ('South Hub', 'Cluster B', 'South', 'DAC 2', 1500, now());
```

Use these column names in DBeaver if you import from CSV:

```txt
hub_name
cluster
Region_gen
dock_#
backlogs
backlogs_ts
```

The app shows `hub_name - cluster` in the Hub/Cluster dropdown.
When `dock_#` and `backlogs` are filled in the cluster row, the request form auto-fills them after the user selects the hub/cluster.

## 7. Put the Connection String in `.env.local`

In this project, create or update `.env.local`:

```env
AZURE_POSTGRES_CONNECTION_STRING=postgresql://YOUR_USER:YOUR_PASSWORD@YOUR_SERVER.postgres.database.azure.com:5432/linehaul?sslmode=require
POSTGRES_SSL=require
POSTGRES_SSL_REJECT_UNAUTHORIZED=false
POSTGRES_POOL_MAX=10
AUTH_SESSION_SECRET=replace-this-with-a-long-random-value
EVENT_BUS_PROVIDER=local
EVENT_BUS_POLL_INTERVAL_MS=1000
```

Replace the server, username, and password with your Azure PostgreSQL values.

For local testing, keep:

```env
EVENT_BUS_PROVIDER=local
```

For production with more than one app instance, use:

```env
EVENT_BUS_PROVIDER=azure-postgres
```

## 8. Start the App

Install dependencies:

```bash
pnpm install
```

Start local development:

```bash
pnpm dev
```

Open:

```txt
http://localhost:3000
```

## Common Problems

If the app says the database is unavailable, check the connection string and Azure firewall.

If login fails, check that the `users` table contains the email or OPS ID you are trying to use.

If cluster dropdowns are empty, add rows to the `clusters` table.
