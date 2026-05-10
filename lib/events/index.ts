import type { EventBus } from './event-bus'
import { localEventBus } from './local-event-bus'
import { postgresEventBus } from './postgres-event-bus'

export function getEventBus(): EventBus {
  if (process.env.EVENT_BUS_PROVIDER === 'postgres') {
    return postgresEventBus
  }

  return localEventBus
}
