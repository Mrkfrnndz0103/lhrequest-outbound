import { supabaseRequest } from './supabase'
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

type EventSubscriber = (event: RequestEvent) => void

const subscribers = new Set<EventSubscriber>()

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
    await supabaseRequest(
      'request_events',
      undefined,
      {
        method: 'POST',
        body: JSON.stringify([{
          id: event.id,
          event_type: event.type,
          request_id: event.payload.requestId,
          payload: event.payload,
          occurred_at: event.occurredAt,
          processed_at: null,
        }]),
      }
    )
  } catch (error) {
    console.error('Failed to persist request event:', error)
  }
}

export function subscribeToRequestEvents(subscriber: EventSubscriber) {
  subscribers.add(subscriber)

  return () => {
    subscribers.delete(subscriber)
  }
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

  subscribers.forEach((subscriber) => {
    try {
      subscriber(event)
    } catch (error) {
      console.error('Request event subscriber failed:', error)
    }
  })

  void persistEvent(event)
  return event
}

export async function publishRequestActionEvent(
  action: string,
  payload: RequestEventPayload
) {
  return publishRequestEvent(toActionEventType(action), payload)
}
