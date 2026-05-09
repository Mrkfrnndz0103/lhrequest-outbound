import type { EventBus } from './event-bus'
import type { RequestEvent } from '@/lib/request-events'

type EventSubscriber = (event: RequestEvent) => void

const subscribers = new Set<EventSubscriber>()

export const localEventBus: EventBus = {
  async publish(event) {
    subscribers.forEach((subscriber) => {
      try {
        subscriber(event)
      } catch (error) {
        console.error('Request event subscriber failed:', error)
      }
    })
  },
  subscribe(handler) {
    subscribers.add(handler)

    return () => {
      subscribers.delete(handler)
    }
  },
}
