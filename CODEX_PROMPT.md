# Codex Prompt: Improve `lhrequest-outbound` for Production-Ready Event-Driven Performance

## Project Context

This project is `lhrequest-outbound`, a Next.js 16 + React 19 web application for Shopee/SPX linehaul request management.

The app is currently using:

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS
- Radix UI components
- SWR for data fetching
- Supabase REST API as the backend data store
- Server-Sent Events through `/api/events`
- Event/outbox concept through `request_events`
- Role-based users:
  - `OPS_PIC`
  - `FTE_OPS`
  - `FTE_MM`

The current system already has a good foundation, but it needs to become more production-ready, faster, safer, and more scalable.

---

## Main Goal

Refactor and improve the project into a highly reliable, fast, event-driven linehaul request management system.

The final implementation should improve:

1. Performance
2. Speed
3. User experience
4. Event-driven reliability
5. Supabase query efficiency
6. Realtime update behavior
7. Polling fallback behavior
8. Security and role validation
9. Status transition safety
10. Optional Google Sheets fallback/mirror design

---

## Important Architecture Decision

Do **not** replace Supabase as the main database.

Supabase must remain the source of truth because this app needs:

- Fast filtering
- Concurrent writes
- Status updates
- Role-based views
- Request approval/rejection flow
- Assignment flow
- Auditable events
- Reliable timestamps
- Safe API access

Google Sheets may only be added as:

- Optional reporting mirror
- Optional backup/export target
- Optional lightweight fallback reader
- Optional admin/manual visibility sheet

Google Sheets must not become the transactional source of truth.

Recommended final architecture:

```txt
Browser UI
  ↓
Next.js API Routes
  ↓
Supabase Postgres
  ↓
Supabase Realtime or request_events outbox
  ↓
Browser live updates
```

Optional reporting mirror:

```txt
Supabase
  ↓
Scheduled sync / webhook / worker
  ↓
Google Sheets
```

---

## Existing Areas to Review

Review and improve these existing files:

```txt
lib/supabase.ts
lib/supabase-database.ts
lib/request-events.ts
lib/auth-session.ts
app/api/events/route.ts
app/api/supabase/requests/route.ts
app/api/supabase/requests/[id]/route.ts
app/api/supabase/pending-count/route.ts
hooks/use-requests.ts
hooks/use-realtime-updates.ts
hooks/use-adaptive-swr.ts
components/requests/requests-table.tsx
components/requests/request-form.tsx
components/requests/action-dialogs.tsx
app/(dashboard)/outbound/lh-request/page.tsx
app/(dashboard)/midmile/truck-request/page.tsx
app/(dashboard)/dashboard/page.tsx
supabase/schema.sql
README.md
```

---

# Required Improvements

## 1. Replace or Upgrade In-Memory Event Delivery

The current event system uses in-memory subscribers and in-memory SSE clients.

This is not safe for production when deployed on:

- Vercel
- serverless environments
- Render with multiple instances
- any multi-instance Node deployment

### Required task

Implement a production-safe realtime strategy.

Preferred option:

```txt
Use Supabase Realtime for request updates and/or request_events changes.
```

If Supabase Realtime is not practical, prepare the app for Redis pub/sub using a clean adapter interface.

### Desired design

Create an event adapter abstraction:

```ts
interface EventBus {
  publish(event: RequestEvent): Promise<void>
  subscribe(handler: (event: RequestEvent) => void): () => void
}
```

Then support at least:

```txt
localEventBus       // development fallback
supabaseRealtimeBus // recommended production option
```

If full Supabase Realtime implementation is too large, keep the existing local bus but clearly isolate it and document how to replace it.

### Acceptance criteria

- Existing request actions still publish events.
- Events are still persisted to `request_events`.
- UI still receives live updates.
- Local development still works.
- Production deployment should no longer depend only on process memory.

---

## 2. Improve Request Status Transition Safety

Current updates can patch a request without strongly validating the current status before changing it.

This can cause race conditions, for example:

- Two FTE Ops users approve the same request at the same time.
- MM assigns a truck after the request was already rejected.
- A stale browser tab performs an old action.

### Required task

Add strict status transition validation.

Allowed transitions:

```txt
PENDING_OPS  -> PENDING_MM
PENDING_OPS  -> REJECTED_OPS
PENDING_OPS  -> PENDING_OPS, only for edit
PENDING_MM   -> CONFIRMED
PENDING_MM   -> REJECTED_MM
CONFIRMED    -> no normal transition
REJECTED_OPS -> no normal transition
REJECTED_MM  -> no normal transition
```

### Required implementation

When updating a request, use conditional update logic:

```txt
PATCH requests
WHERE id = requestId
AND status = expectedCurrentStatus
```

If no rows are returned, respond with:

```json
{
  "error": "Request was already updated. Please refresh and try again."
}
```

Use an HTTP conflict status:

```txt
409 Conflict
```

### Acceptance criteria

- Approval only works when current status is `PENDING_OPS`.
- OPS rejection only works when current status is `PENDING_OPS`.
- Edit only works when current status is `PENDING_OPS`, unless admin support exists.
- MM assignment only works when current status is `PENDING_MM`.
- MM rejection only works when current status is `PENDING_MM`.
- Stale requests return a clear error.
- UI shows the conflict error to the user.

---

## 3. Improve Supabase Query Performance

### Required task

Review Supabase REST queries and add better indexes in `supabase/schema.sql`.

Add or confirm these indexes:

```sql
create index if not exists idx_requests_status_request_time
on public.requests (status, request_time desc);

create index if not exists idx_requests_ops_pic_id_request_time
on public.requests (ops_pic_id, request_time desc);

create index if not exists idx_requests_request_time
on public.requests (request_time desc);

create index if not exists idx_requests_plate_number
on public.requests (plate_number);

create index if not exists idx_request_events_request_id_occurred_at
on public.request_events (request_id, occurred_at desc);

create index if not exists idx_request_events_processed_at_occurred_at
on public.request_events (processed_at, occurred_at asc);
```

If `plate_number` search uses `ilike '%value%'`, consider adding trigram support if available:

```sql
create extension if not exists pg_trgm;

create index if not exists idx_requests_plate_number_trgm
on public.requests using gin (plate_number gin_trgm_ops);
```

### Acceptance criteria

- Requests by status are fast.
- Requests by OPS PIC are fast.
- Recent requests are fast.
- Pending count queries are fast.
- Request event lookup is fast.

---

## 4. Move More Filtering and Pagination to the Server

The table currently performs much of the filtering on the client after rows are fetched.

This is okay for small data but will slow down as data grows.

### Required task

Connect table filters to API query parameters.

Server/API should support:

```txt
status
from date
to date
plate number
hub cluster
region
opsPicId
limit
offset
```

Client should call:

```txt
/api/supabase/requests?status=PENDING_OPS&dateFrom=...&dateTo=...&plateNumber=...&limit=50&offset=0
```

### Required UI behavior

- Search input should be debounced.
- Date filters should trigger API fetch.
- Status filter should trigger API fetch.
- Pagination should be server-side.
- Export should support either current page or all filtered rows through an API endpoint.

### Acceptance criteria

- Browser does not need to fetch hundreds/thousands of rows just to filter locally.
- API returns only needed rows.
- Table remains fast even when request count grows.

---

## 5. Improve Polling Strategy

The app currently has SSE and SWR polling. This is good as a fallback, but polling should be reduced when realtime is connected.

### Required task

Modify hooks so polling behavior depends on realtime connection status.

Recommended behavior:

```txt
If realtime is connected:
  - Disable frequent polling
  - Use safety refresh every 60–120 seconds only

If realtime is disconnected:
  - Use adaptive polling
  - Start around 5 seconds
  - Back off to 15 seconds, then 30 seconds

If browser tab is hidden:
  - Pause polling

After create/update action:
  - Immediately mutate/revalidate affected data
```

### Acceptance criteria

- No unnecessary 3-second polling when realtime is healthy.
- Polling resumes if realtime fails.
- Hidden tabs do not keep aggressively polling.
- Manual actions still feel instant.

---

## 6. Improve UX for Request Actions

### Required task

Improve request action UX for:

- Create request
- Approve request
- Reject request
- Edit request
- Assign truck
- Reject by MM

### Required UI improvements

Add:

- Button loading states
- Disabled buttons while submitting
- Success toast
- Error toast
- Conflict/stale-data toast
- Optimistic UI where safe
- Clear empty states
- Last updated timestamp
- Realtime connection status indicator

Example status indicator:

```txt
Live Connected
Reconnecting...
Polling Mode
Offline
```

### Acceptance criteria

- Users get immediate feedback.
- Duplicate button clicks are prevented.
- Stale actions show a friendly error.
- The table clearly indicates whether data is live or fallback polling.

---

## 7. Improve Realtime Data Update Behavior

Currently, SSE request events trigger `mutate()` for the full request list.

### Required task

Optimize realtime updates so the UI can update only the affected request when possible.

For example:

```txt
request.created   -> prepend new request if it matches filters
request.approved  -> update request status locally
request.rejected  -> update request status locally
request.assigned  -> update request status and plate/lhTrip locally
```

Fallback to full `mutate()` if local update becomes complex.

### Acceptance criteria

- Most realtime updates do not require full list reload.
- Pending counts still refresh accurately.
- User sees request status changes quickly.

---

## 8. Improve API Error Handling

### Required task

Standardize API error responses.

Use a consistent response shape:

```ts
{
  error: string
  code?: string
  details?: unknown
}
```

Recommended error codes:

```txt
AUTH_REQUIRED
FORBIDDEN
VALIDATION_ERROR
REQUEST_NOT_FOUND
REQUEST_CONFLICT
SUPABASE_UNAVAILABLE
UNKNOWN_ERROR
```

### Acceptance criteria

- Frontend can display clear messages.
- Supabase failures are not exposed with sensitive details.
- Conflict errors are distinguishable from normal errors.

---

## 9. Improve Auth and Rate Limiting

The login route currently uses an in-memory rate limiter. That is fine for local development but not enough for multi-instance production.

### Required task

Keep the current in-memory limiter as a fallback, but prepare for shared rate limiting.

Preferred options:

- Upstash Redis
- Supabase table-based rate limit
- platform-native rate limit

### Acceptance criteria

- Local development still works.
- Production can be configured for shared rate limiting.
- Login attempts are not tracked only in one process when deployed on multiple instances.

---

## 10. Optional Google Sheets Reporting Mirror

Do not make Google Sheets the main DB.

Add documentation and optional API structure for Google Sheets mirror/fallback only.

### Optional design

```txt
Supabase requests table
  ↓
/api/admin/export-to-sheets or scheduled worker
  ↓
Google Sheets reporting tab
```

### Optional faster polling API for Sheets

If Google Sheets must be used for some dashboard/reporting page, implement it like this:

```txt
Google Sheet has Config!A1 = last_updated_version

Frontend polls:
GET /api/sheets/version

Only when version changes, frontend fetches:
GET /api/sheets/requests
```

Add server-side cache:

```ts
const SHEET_VERSION_TTL_MS = 5000
const SHEET_DATA_TTL_MS = 30000
```

### Acceptance criteria

- Google Sheets is clearly documented as reporting/fallback only.
- No client component calls Google Sheets directly.
- Sheet polling checks a small version endpoint first.
- Full sheet data is only fetched when version changed.

---

# Suggested New or Updated Files

Codex may create or update these files as needed:

```txt
lib/events/event-bus.ts
lib/events/local-event-bus.ts
lib/events/supabase-realtime-bus.ts
lib/events/index.ts
lib/request-status.ts
lib/api-errors.ts
lib/rate-limit.ts
lib/sheets/cache.ts
lib/sheets/client.ts
app/api/sheets/version/route.ts
app/api/sheets/requests/route.ts
app/api/admin/export-to-sheets/route.ts
components/realtime/realtime-status-badge.tsx
hooks/use-debounced-value.ts
hooks/use-request-filters.ts
```

Do not create Google Sheets files unless needed. Supabase improvements are higher priority.

---

# Specific Implementation Notes

## A. Status transition helper

Create a helper similar to:

```ts
import type { RequestStatus } from './types'

export type RequestAction = 'approve' | 'reject_ops' | 'edit' | 'assign' | 'reject_mm'

export function getExpectedStatusForAction(action: RequestAction): RequestStatus {
  switch (action) {
    case 'approve':
    case 'reject_ops':
    case 'edit':
      return 'PENDING_OPS'
    case 'assign':
    case 'reject_mm':
      return 'PENDING_MM'
  }
}

export function getNextStatusForAction(action: RequestAction): RequestStatus {
  switch (action) {
    case 'approve':
      return 'PENDING_MM'
    case 'reject_ops':
      return 'REJECTED_OPS'
    case 'edit':
      return 'PENDING_OPS'
    case 'assign':
      return 'CONFIRMED'
    case 'reject_mm':
      return 'REJECTED_MM'
  }
}
```

Use this in both API validation and database patching.

---

## B. Safer update pattern

When patching a request, include expected current status:

```ts
const expectedStatus = getExpectedStatusForAction(updates.action)

const rows = await supabaseRequest<RequestRow[]>(
  'requests',
  [
    ['id', `eq.${id}`],
    ['status', `eq.${expectedStatus}`],
    ['select', '*'],
  ],
  {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  }
)

if (!rows.length) {
  throw new RequestConflictError('Request was already updated. Please refresh and try again.')
}
```

---

## C. Server-side pagination response

Change request list response to include metadata:

```json
{
  "requests": [],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 128,
    "hasMore": true
  }
}
```

If full count is expensive, support `hasMore` by fetching `limit + 1` rows.

---

## D. Better client-side table flow

Recommended table data flow:

```txt
User changes filter
  ↓ debounce
URL/search params update or local filter state update
  ↓
useRequests({ status, dateFrom, dateTo, plateNumber, limit, offset })
  ↓
API returns filtered page
  ↓
Table renders only page rows
```

---

## E. Realtime-aware polling

Recommended hook behavior:

```ts
const realtime = useRealtimeUpdates(...)

const refreshInterval = realtime.isConnected
  ? 60_000
  : adaptiveInterval
```

If tab is hidden:

```ts
refreshInterval = 0
```

---

# Testing Requirements

Add or update tests if the project has a test setup. If not, at least manually verify the following:

## Manual test checklist

### Auth

- OPS PIC can log in.
- FTE Ops can log in.
- FTE MM can log in.
- Invalid user cannot log in.
- Unauthorized API calls fail.

### Request creation

- OPS PIC can create request.
- Request appears in OPS PIC My Requests.
- Request appears in FTE Ops pending queue.
- Pending OPS count increases.

### FTE Ops flow

- FTE Ops can approve pending request.
- FTE Ops can reject pending request with remarks.
- FTE Ops cannot approve already approved/rejected request.
- Conflict error appears on stale action.

### FTE MM flow

- FTE MM can assign plate number to `PENDING_MM` request.
- FTE MM can reject with remarks.
- FTE MM cannot assign already confirmed/rejected request.

### Realtime

- Open two browsers.
- Create request in browser A.
- Browser B receives update without manual refresh.
- Approve request in browser B.
- Browser A sees status update.
- Kill realtime connection and confirm fallback polling works.

### Performance

- Request list remains fast with hundreds of rows.
- Filters do not freeze the browser.
- Hidden tab does not aggressively poll.
- Counts update quickly after create/update.

---

# README Updates Required

Update `README.md` with:

1. Final architecture explanation
2. Supabase as source of truth
3. Realtime strategy
4. Polling fallback behavior
5. Google Sheets mirror/fallback guidance
6. Required environment variables
7. Deployment notes for Vercel/Render
8. Warning about in-memory fallback limitations

Add environment examples if new variables are introduced:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
AUTH_SESSION_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
EVENT_BUS_PROVIDER=supabase
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
GOOGLE_SHEETS_CLIENT_EMAIL=
GOOGLE_SHEETS_PRIVATE_KEY=
GOOGLE_SHEETS_SPREADSHEET_ID=
```

Only require Google Sheets env vars if optional Sheets integration is implemented.

---

# Do Not Do

Do not:

- Replace Supabase with Google Sheets as the main database.
- Expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- Put service role keys in client components.
- Keep production realtime dependent only on process memory.
- Allow stale status updates.
- Fetch thousands of rows just to filter in the browser.
- Poll every 3 seconds forever when realtime is connected.
- Break current role-based behavior.
- Remove the event outbox concept.

---

# Final Deliverables

After implementation, provide:

1. Summary of changed files
2. Explanation of architecture changes
3. Any new environment variables
4. Supabase SQL migration changes
5. Manual test checklist results
6. Known limitations, if any
7. Recommended next phase

---

# Priority Order

Implement in this order:

1. Status transition safety and conflict handling
2. Supabase indexes/schema improvements
3. Server-side filtering and pagination
4. Realtime/polling improvements
5. UX loading/error/toast improvements
6. Event bus abstraction
7. Optional Google Sheets mirror/fallback documentation
8. README updates

---

# Expected Result

The final app should feel fast and reliable for operations users.

Expected user experience:

```txt
OPS PIC submits request
  ↓ instantly appears in My Requests
FTE Ops sees new pending request live
  ↓ approves or rejects
OPS PIC sees status update live
FTE MM sees approved request live
  ↓ assigns plate and LH trip
All users see final status quickly
```

The system should remain stable even with multiple users and should avoid unnecessary database/API load.
