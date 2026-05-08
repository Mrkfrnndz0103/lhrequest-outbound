'use client'

import { useRef, useCallback, useMemo } from 'react'
import useSWR, { type SWRConfiguration, type Key } from 'swr'
import { usePageVisibility } from './use-page-visibility'
import { fetchJson } from '@/lib/fetcher'
import {
  POLLING_INTERVAL_MIN,
  POLLING_INTERVAL_MAX,
  POLLING_BACKOFF_MULTIPLIER,
} from '@/lib/constants'

interface UseAdaptiveSWROptions<T> extends Omit<SWRConfiguration<T>, 'refreshInterval'> {
  /** Enable adaptive polling (exponential backoff when data is static) */
  adaptivePolling?: boolean
  /** Pause polling when tab is hidden */
  pauseWhenHidden?: boolean
  /** Custom hash function to detect data changes */
  dataHashFn?: (data: T | undefined) => string
}

/**
 * Enhanced SWR hook with:
 * - Page visibility-aware polling (pauses when tab is hidden)
 * - Adaptive polling with exponential backoff when data is unchanged
 * - Automatic interval reset when new data arrives
 * - Proper cleanup on unmount
 */
export function useAdaptiveSWR<T>(
  key: Key,
  options: UseAdaptiveSWROptions<T> = {}
) {
  const {
    adaptivePolling = true,
    pauseWhenHidden = true,
    dataHashFn,
    ...swrOptions
  } = options

  const { isVisible } = usePageVisibility()
  const currentIntervalRef = useRef(POLLING_INTERVAL_MIN)
  const lastDataHashRef = useRef<string>('')
  const consecutiveNoChangeRef = useRef(0)

  // Default hash function - JSON stringify
  const hashData = useCallback((data: T | undefined): string => {
    if (dataHashFn) return dataHashFn(data)
    if (data === undefined) return ''
    try {
      return JSON.stringify(data)
    } catch {
      return String(data)
    }
  }, [dataHashFn])

  // Calculate refresh interval based on visibility and adaptive polling
  const refreshInterval = useMemo(() => {
    // Pause polling completely when tab is hidden
    if (pauseWhenHidden && !isVisible) {
      return 0
    }
    return currentIntervalRef.current
  }, [isVisible, pauseWhenHidden])

  const result = useSWR<T>(key, fetchJson, {
    refreshInterval,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 2000,
    ...swrOptions,
    onSuccess: (data, _key, _config) => {
      const newHash = hashData(data)
      
      if (adaptivePolling) {
        if (newHash === lastDataHashRef.current) {
          // Data unchanged - increase interval (exponential backoff)
          consecutiveNoChangeRef.current++
          const newInterval = Math.min(
            currentIntervalRef.current * POLLING_BACKOFF_MULTIPLIER,
            POLLING_INTERVAL_MAX
          )
          currentIntervalRef.current = newInterval
        } else {
          // Data changed - reset to minimum interval
          consecutiveNoChangeRef.current = 0
          currentIntervalRef.current = POLLING_INTERVAL_MIN
        }
      }
      
      lastDataHashRef.current = newHash
      
      // Call original onSuccess if provided
      swrOptions.onSuccess?.(data, _key, _config)
    },
  })

  // Reset interval to minimum (call when user submits a request)
  const resetPollingInterval = useCallback(() => {
    currentIntervalRef.current = POLLING_INTERVAL_MIN
    consecutiveNoChangeRef.current = 0
    // Trigger immediate revalidation
    result.mutate()
  }, [result])

  // Force immediate fetch (useful when returning to tab)
  const forceRefresh = useCallback(() => {
    currentIntervalRef.current = POLLING_INTERVAL_MIN
    result.mutate()
  }, [result])

  return {
    ...result,
    resetPollingInterval,
    forceRefresh,
    currentInterval: currentIntervalRef.current,
    isPollingPaused: pauseWhenHidden && !isVisible,
  }
}
