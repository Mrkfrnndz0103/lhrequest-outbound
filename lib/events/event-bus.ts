import type { RequestEvent } from '@/lib/request-events'

export interface EventBus {
  publish(event: RequestEvent): Promise<void>
  subscribe(handler: (event: RequestEvent) => void): () => void
}
