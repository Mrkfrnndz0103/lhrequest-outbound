'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAdaptiveSWR } from './use-adaptive-swr'
import { useRealtimeUpdates } from './use-realtime-updates'
import type { PendingCount } from '@/lib/types'

/**
 * Hook to fetch pending request counts with efficient polling.
 * 
 * Features:
 * - Pauses polling when tab is hidden (Page Visibility API)
 * - Adaptive polling with exponential backoff when data is static
 * - Real-time updates via SSE with fallback to polling
 * - Resets to fast polling when new data arrives
 * - Proper cleanup on unmount
 */
export function usePendingCount() {
  const prevCountsRef = useRef<PendingCount>({ pendingOps: 0, pendingMm: 0 })
  const [sseConnectedState, setSseConnectedState] = useState(false)
  
  const { 
    data, 
    error, 
    isLoading, 
    mutate,
    resetPollingInterval,
    isPollingPaused,
  } = useAdaptiveSWR<PendingCount>(
    '/api/pending-count',
    {
      adaptivePolling: true,
      pauseWhenHidden: true,
      realtimeConnected: sseConnectedState,
      // Custom hash to detect count changes
      dataHashFn: (data) => data ? `${data.pendingOps}-${data.pendingMm}` : '',
    }
  )

  // Use SSE for real-time updates
  const { isConnected: sseConnected, counts: sseCounts } = useRealtimeUpdates({
    onCountsUpdate: useCallback((newCounts: PendingCount) => {
      // Update SWR cache when SSE receives new data
      mutate(newCounts, false)
    }, [mutate]),
  })

  useEffect(() => {
    setSseConnectedState(sseConnected)
  }, [sseConnected])

  // Determine counts - prefer SSE if connected, fall back to SWR
  const pendingOps = sseConnected ? sseCounts.pendingOps : (data?.pendingOps ?? 0)
  const pendingMm = sseConnected ? sseCounts.pendingMm : (data?.pendingMm ?? 0)

  // Track if counts increased
  const hasNewOpsRequests = pendingOps > prevCountsRef.current.pendingOps
  const hasNewMmRequests = pendingMm > prevCountsRef.current.pendingMm

  useEffect(() => {
    prevCountsRef.current = { pendingOps, pendingMm }
  }, [pendingOps, pendingMm])

  return {
    pendingOps,
    pendingMm,
    hasNewOpsRequests,
    hasNewMmRequests,
    isLoading,
    isError: error,
    isPollingPaused,
    sseConnected,
    mutate,
    resetPollingInterval,
  }
}
