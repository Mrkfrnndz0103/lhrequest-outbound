import type { EventBus } from './event-bus'
import { localEventBus } from './local-event-bus'
import { azurePostgresBus } from './azure-postgres-bus'

export function getEventBus(): EventBus {
  if (process.env.EVENT_BUS_PROVIDER === 'azure-postgres') {
    return azurePostgresBus
  }

  return localEventBus
}
