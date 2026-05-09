import { query } from '@/lib/postgres'
import type { EventBus } from './event-bus'
import type { RequestEvent, RequestEventPayload, RequestEventType } from '@/lib/request-events'

type RequestEventRow = {
  id: string
  event_type: RequestEventType | string
  payload: RequestEventPayload
  occurred_at: Date | string
}

type EventSubscriber = (event: RequestEvent) => void

const subscribers = new Set<EventSubscriber>()
const seenEventIds = new Set<string>()
const MAX_SEEN_EVENT_IDS = 1000
const POLL_INTERVAL_MS = Math.max(Number(process.env.EVENT_BUS_POLL_INTERVAL_MS || 1000), 500)
const POLL_LIMIT = 100

let pollInterval: NodeJS.Timeout | null = null
let isPolling = false
let cursor = new Date()

function rememberEventId(id: string) {
  seenEventIds.add(id)

  if (seenEventIds.size <= MAX_SEEN_EVENT_IDS) return

  const first = seenEventIds.values().next().value
  if (first) {
    seenEventIds.delete(first)
  }
}

function toRequestEvent(row: RequestEventRow): RequestEvent {
  const occurredAt = row.occurred_at instanceof Date
    ? row.occurred_at.toISOString()
    : new Date(row.occurred_at).toISOString()

  return {
    id: row.id,
    type: row.event_type as RequestEventType,
    payload: row.payload,
    occurredAt,
  }
}

function notify(event: RequestEvent) {
  subscribers.forEach((subscriber) => {
    try {
      subscriber(event)
    } catch (error) {
      console.error('Azure PostgreSQL event subscriber failed:', error)
    }
  })
}

async function pollRequestEvents() {
  if (isPolling || subscribers.size === 0) return
  isPolling = true

  try {
    const result = await query<RequestEventRow>(
      `select id, event_type, payload, occurred_at
       from public.request_events
       where occurred_at >= $1
       order by occurred_at asc, id asc
       limit $2`,
      [cursor, POLL_LIMIT]
    )

    for (const row of result.rows) {
      cursor = row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at)

      if (seenEventIds.has(row.id)) {
        continue
      }

      rememberEventId(row.id)
      notify(toRequestEvent(row))
    }
  } catch (error) {
    console.error('Failed to poll Azure PostgreSQL request events:', error)
  } finally {
    isPolling = false
  }
}

function startPolling() {
  if (pollInterval) return

  void pollRequestEvents()
  pollInterval = setInterval(() => {
    void pollRequestEvents()
  }, POLL_INTERVAL_MS)
}

function stopPollingIfIdle() {
  if (subscribers.size > 0 || !pollInterval) return

  clearInterval(pollInterval)
  pollInterval = null
}

export const azurePostgresBus: EventBus = {
  async publish() {
    // Cross-instance delivery happens through the durable request_events table.
  },
  subscribe(handler) {
    subscribers.add(handler)
    startPolling()

    return () => {
      subscribers.delete(handler)
      stopPollingIfIdle()
    }
  },
}
