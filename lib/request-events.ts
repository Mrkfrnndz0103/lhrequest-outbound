import { query } from './postgres'
import { getEventBus } from './events'
import type { LineHaulRequest, RequestStatus } from './types'

export type RequestEventType =
  | 'request.created'
  | 'request.approved'
  | 'request.rejected_ops'
  | 'request.edited'
  | 'request.assigned'
  | 'request.rejected_mm'

export type RequestEventPayload = {
  requestId: string
  status: RequestStatus
  previousStatus?: RequestStatus
  actorName?: string
  request?: LineHaulRequest
}

export type RequestEvent = {
  id: string
  type: RequestEventType
  payload: RequestEventPayload
  occurredAt: string
}

function createEventId() {
  return `evt_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
}

function toActionEventType(action: string): RequestEventType {
  switch (action) {
    case 'approve':
      return 'request.approved'
    case 'reject_ops':
      return 'request.rejected_ops'
    case 'edit':
      return 'request.edited'
    case 'assign':
      return 'request.assigned'
    case 'reject_mm':
      return 'request.rejected_mm'
    default:
      return 'request.edited'
  }
}

async function persistEvent(event: RequestEvent) {
  try {
    await query(
      `insert into public.request_events (
         id, event_type, request_id, payload, occurred_at, processed_at
       )
       values ($1, $2, $3, $4, $5, null)`,
      [
        event.id,
        event.type,
        event.payload.requestId,
        event.payload,
        event.occurredAt,
      ]
    )
    return true
  } catch (error) {
    console.error('Failed to persist request event:', error)
    return false
  }
}

export function subscribeToRequestEvents(subscriber: (event: RequestEvent) => void) {
  return getEventBus().subscribe(subscriber)
}

export async function publishRequestEvent(
  type: RequestEventType,
  payload: RequestEventPayload
) {
  const event: RequestEvent = {
    id: createEventId(),
    type,
    payload,
    occurredAt: new Date().toISOString(),
  }

  await persistEvent(event)
  await getEventBus().publish(event)
  return event
}

export async function publishRequestActionEvent(
  action: string,
  payload: RequestEventPayload
) {
  return publishRequestEvent(toActionEventType(action), payload)
}
