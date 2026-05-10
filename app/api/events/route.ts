import { NextRequest } from 'next/server'
import { getPendingCounts } from '@/lib/database'
import { isAuthError, requireUser } from '@/lib/api-auth'
import { handleApiError, validationError } from '@/lib/api-errors'
import { subscribeToRequestEvents, type RequestEvent } from '@/lib/request-events'

// Store for connected clients - in production, use Redis pub/sub
const clients = new Set<ReadableStreamDefaultController>()
let pollingInterval: NodeJS.Timeout | null = null
let eventUnsubscribe: (() => void) | null = null
let lastCounts = { pendingOps: 0, pendingMm: 0 }
let isPolling = false
let hasLoadedCounts = false
const POLLING_INTERVAL_MS = 30000
const COUNT_REFRESH_DEBOUNCE_MS = 250
let countRefreshTimeout: NodeJS.Timeout | null = null

// Broadcast to all connected clients
export function broadcastUpdate(data: { type: string; payload: unknown }) {
  const message = `data: ${JSON.stringify(data)}\n\n`
  clients.forEach(controller => {
    try {
      controller.enqueue(new TextEncoder().encode(message))
    } catch {
      clients.delete(controller)
    }
  })
}

function broadcastRequestEvent(event: RequestEvent) {
  broadcastUpdate({
    type: 'request_event',
    payload: event,
  })
}

async function pollCounts(forceRefresh = false) {
  if (isPolling) return
  isPolling = true

  try {
    const counts = await getPendingCounts({ forceRefresh })
    
    // Only send if counts changed
    if (forceRefresh || counts.pendingOps !== lastCounts.pendingOps || counts.pendingMm !== lastCounts.pendingMm) {
      const hasNewOps = hasLoadedCounts && counts.pendingOps > lastCounts.pendingOps
      const hasNewMm = hasLoadedCounts && counts.pendingMm > lastCounts.pendingMm
      
      lastCounts = counts
      hasLoadedCounts = true
      
      broadcastUpdate({
        type: 'counts_update',
        payload: { 
          ...counts, 
          hasNewOps, 
          hasNewMm,
          timestamp: new Date().toISOString()
        }
      })
    }
  } catch (error) {
    console.error('SSE polling error:', error)
  } finally {
    isPolling = false
  }
}

function scheduleCountRefresh() {
  if (countRefreshTimeout) {
    clearTimeout(countRefreshTimeout)
  }

  countRefreshTimeout = setTimeout(() => {
    countRefreshTimeout = null
    pollCounts(true)
  }, COUNT_REFRESH_DEBOUNCE_MS)
}

function startPolling() {
  if (pollingInterval) return

  pollCounts()
  pollingInterval = setInterval(() => {
    pollCounts()
  }, POLLING_INTERVAL_MS)
}

function startEventSubscription() {
  if (eventUnsubscribe) return

  eventUnsubscribe = subscribeToRequestEvents((event) => {
    broadcastRequestEvent(event)
    scheduleCountRefresh()
  })
}

function stopBackgroundWorkIfIdle() {
  if (clients.size > 0) return

  if (eventUnsubscribe) {
    eventUnsubscribe()
    eventUnsubscribe = null
  }

  if (!pollingInterval) return

  clearInterval(pollingInterval)
  pollingInterval = null
}

export async function GET(request: NextRequest) {
  const user = requireUser(request)
  if (isAuthError(user)) return user

  const encoder = new TextEncoder()
  
  // Check for SSE support
  const accept = request.headers.get('accept')
  if (!accept?.includes('text/event-stream')) {
    return validationError('SSE not supported')
  }

  let controller: ReadableStreamDefaultController
  let heartbeatInterval: NodeJS.Timeout

  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl
      clients.add(controller)

      // Send initial connection message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`))

      // Heartbeat every 30 seconds to keep connection alive
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          clearInterval(heartbeatInterval)
          clients.delete(controller)
          stopBackgroundWorkIfIdle()
        }
      }, 30000)

      startPolling()
      startEventSubscription()

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'counts_update',
        payload: { ...lastCounts, hasNewOps: false, hasNewMm: false, timestamp: new Date().toISOString() }
      })}\n\n`))
    },
    cancel() {
      clearInterval(heartbeatInterval)
      clients.delete(controller)
      stopBackgroundWorkIfIdle()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}

// Endpoint to trigger immediate broadcast (call after creating/updating request)
export async function POST(request: NextRequest) {
  try {
    const user = requireUser(request)
    if (isAuthError(user)) return user

    const counts = await getPendingCounts({ forceRefresh: true })
    const hasNewOps = hasLoadedCounts && counts.pendingOps > lastCounts.pendingOps
    const hasNewMm = hasLoadedCounts && counts.pendingMm > lastCounts.pendingMm
    lastCounts = counts
    hasLoadedCounts = true

    broadcastUpdate({
      type: 'counts_update',
      payload: { 
        ...counts, 
        hasNewOps, 
        hasNewMm,
        timestamp: new Date().toISOString()
      }
    })
    return Response.json({ success: true })
  } catch (error) {
    console.error('Broadcast error:', error)
    return handleApiError(error, 'Failed to broadcast')
  }
}
