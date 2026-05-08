'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePageVisibility } from './use-page-visibility'
import type { RequestEvent } from '@/lib/request-events'
import type { PendingCount } from '@/lib/types'

type RealtimeUpdate = {
  type: 'connected'
} | {
  type: 'counts_update'
  payload: PendingCount & {
    hasNewOps: boolean
    hasNewMm: boolean
    timestamp: string
  }
} | {
  type: 'request_event'
  payload: RequestEvent
}

interface UseRealtimeUpdatesOptions {
  onNewOpsRequest?: () => void
  onNewMmRequest?: () => void
  onCountsUpdate?: (counts: PendingCount) => void
  onRequestEvent?: (event: RequestEvent) => void
  enabled?: boolean
}

/**
 * Hook for real-time updates via Server-Sent Events (SSE).
 * Falls back to adaptive polling if SSE connection fails.
 * Automatically reconnects when tab becomes visible.
 */
export function useRealtimeUpdates(options: UseRealtimeUpdatesOptions = {}) {
  const {
    onNewOpsRequest,
    onNewMmRequest,
    onCountsUpdate,
    onRequestEvent,
    enabled = true,
  } = options

  const { isVisible } = usePageVisibility()
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [counts, setCounts] = useState<PendingCount>({ pendingOps: 0, pendingMm: 0 })

  const connect = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    try {
      const eventSource = new EventSource('/api/events')
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        setIsConnected(true)
        setConnectionError(null)
        reconnectAttemptsRef.current = 0
      }

      eventSource.onmessage = (event) => {
        try {
          const data: RealtimeUpdate = JSON.parse(event.data)
          
          if (data.type === 'connected') {
            return
          }

          if (data.type === 'counts_update') {
            const newCounts = {
              pendingOps: data.payload.pendingOps,
              pendingMm: data.payload.pendingMm,
            }
            setCounts(newCounts)
            onCountsUpdate?.(newCounts)

            // Trigger callbacks for new requests
            if (data.payload.hasNewOps) {
              onNewOpsRequest?.()
            }
            if (data.payload.hasNewMm) {
              onNewMmRequest?.()
            }
            return
          }

          if (data.type === 'request_event') {
            onRequestEvent?.(data.payload)
          }
        } catch (error) {
          console.error('SSE message parse error:', error)
        }
      }

      eventSource.onerror = () => {
        setIsConnected(false)
        eventSource.close()
        eventSourceRef.current = null

        // Exponential backoff for reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
          reconnectAttemptsRef.current++
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isVisible) {
              connect()
            }
          }, delay)
        } else {
          setConnectionError('Connection failed. Using fallback polling.')
        }
      }
    } catch (error) {
      console.error('SSE connection error:', error)
      setConnectionError('SSE not supported. Using fallback polling.')
    }
  }, [enabled, isVisible, onCountsUpdate, onNewOpsRequest, onNewMmRequest, onRequestEvent])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsConnected(false)
  }, [])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (enabled && isVisible) {
      connect()
    } else {
      disconnect()
    }

    return () => {
      disconnect()
    }
  }, [enabled, isVisible, connect, disconnect])

  // Reconnect when tab becomes visible
  useEffect(() => {
    if (isVisible && enabled && !isConnected && !connectionError) {
      reconnectAttemptsRef.current = 0
      connect()
    }
  }, [isVisible, enabled, isConnected, connectionError, connect])

  // Trigger broadcast after submitting a request
  const triggerBroadcast = useCallback(async () => {
    try {
      await fetch('/api/events', { method: 'POST' })
    } catch (error) {
      console.error('Failed to trigger broadcast:', error)
    }
  }, [])

  return {
    isConnected,
    connectionError,
    counts,
    triggerBroadcast,
    reconnect: connect,
    disconnect,
  }
}
