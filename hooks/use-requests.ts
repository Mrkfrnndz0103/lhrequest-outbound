'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { fetchJson } from '@/lib/fetcher'
import { REALTIME_SAFETY_REFRESH_INTERVAL } from '@/lib/constants'
import { useRealtimeUpdates } from './use-realtime-updates'
import { usePageVisibility } from './use-page-visibility'
import type { LineHaulRequest, RequestStatus } from '@/lib/types'
import type { RequestEvent } from '@/lib/request-events'

interface UseRequestsOptions {
  status?: RequestStatus
  dateFrom?: string
  dateTo?: string
  search?: string
  plateNumber?: string
  hubCluster?: string
  region?: string
  opsPicId?: string
  limit?: number
  offset?: number
  enabled?: boolean
}

type RequestsResponse = {
  requests: LineHaulRequest[]
  pagination?: {
    limit: number
    offset: number
    hasMore: boolean
  }
}

type RealtimeMode = 'connected' | 'reconnecting' | 'polling' | 'offline'

function requestMatchesFilters(request: LineHaulRequest, options?: UseRequestsOptions) {
  if (options?.status && request.status !== options.status) return false
  if (options?.search) {
    const search = options.search.toLowerCase()
    const matchesSearch =
      request.plateNumber?.toLowerCase().includes(search) ||
      request.hubCluster.toLowerCase().includes(search) ||
      request.id.toLowerCase().includes(search)

    if (!matchesSearch) return false
  }
  if (options?.plateNumber && !request.plateNumber?.toLowerCase().includes(options.plateNumber.toLowerCase())) return false
  if (options?.hubCluster && !request.hubCluster.toLowerCase().includes(options.hubCluster.toLowerCase())) return false
  if (options?.region && request.region !== options.region) return false
  if (options?.opsPicId && request.opsPicId !== options.opsPicId) return false
  if (options?.dateFrom && new Date(request.requestTime) < new Date(options.dateFrom)) return false
  if (options?.dateTo) {
    const toDate = new Date(options.dateTo)
    toDate.setHours(23, 59, 59, 999)
    if (new Date(request.requestTime) > toDate) return false
  }
  return true
}

function applyRequestToPage(
  current: RequestsResponse | undefined,
  request: LineHaulRequest,
  options?: UseRequestsOptions,
  eventType?: RequestEvent['type']
) {
  if (!current) return current

  const matchesFilters = requestMatchesFilters(request, options)
  const existingIndex = current.requests.findIndex((item) => item.id === request.id)

  if (!matchesFilters) {
    if (existingIndex === -1) return current
    return {
      ...current,
      requests: current.requests.filter((item) => item.id !== request.id),
    }
  }

  if (existingIndex === -1) {
    if ((options?.offset ?? 0) > 0) return current
    const limit = current.pagination?.limit
    const requests = [request, ...current.requests]
    return {
      ...current,
      requests: limit ? requests.slice(0, limit) : requests,
    }
  }

  return {
    ...current,
    requests: current.requests.map((item) => item.id === request.id ? request : item),
  }
}

export function useRequests(options?: UseRequestsOptions) {
  const enabled = options?.enabled ?? true
  const { isVisible } = usePageVisibility()
  const [realtimeState, setRealtimeState] = useState<{ isConnected: boolean; error: string | null }>({
    isConnected: false,
    error: null,
  })
  const [fallbackInterval, setFallbackInterval] = useState(5_000)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const lastDataHashRef = useRef('')
  const params = new URLSearchParams()
  
  if (options?.status) params.append('status', options.status)
  if (options?.dateFrom) params.append('dateFrom', options.dateFrom)
  if (options?.dateTo) params.append('dateTo', options.dateTo)
  if (options?.search) params.append('search', options.search)
  if (options?.plateNumber) params.append('plateNumber', options.plateNumber)
  if (options?.hubCluster) params.append('hubCluster', options.hubCluster)
  if (options?.region) params.append('region', options.region)
  if (options?.opsPicId) params.append('opsPicId', options.opsPicId)
  if (options?.limit) params.append('limit', String(options.limit))
  if (options?.offset) params.append('offset', String(options.offset))

  const queryString = params.toString()
  const url = enabled ? `/api/azure/requests${queryString ? `?${queryString}` : ''}` : null

  const refreshInterval = useMemo(() => {
    if (!isOnline) return 0
    if (!isVisible) return 0
    if (realtimeState.isConnected) return REALTIME_SAFETY_REFRESH_INTERVAL
    return fallbackInterval
  }, [fallbackInterval, isOnline, isVisible, realtimeState.isConnected])

  const { data, error, isLoading, mutate } = useSWR<RequestsResponse>(
    url,
    fetchJson,
    {
      refreshInterval,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
      onSuccess: (nextData) => {
        setLastUpdated(new Date())
        if (realtimeState.isConnected) return

        const nextHash = JSON.stringify(nextData?.requests?.map((request) => [
          request.id,
          request.status,
          request.plateNumber,
          request.lhTrip,
        ]) ?? [])

        if (nextHash === lastDataHashRef.current) {
          setFallbackInterval((current) => current >= 15_000 ? 30_000 : 15_000)
        } else {
          setFallbackInterval(5_000)
        }

        lastDataHashRef.current = nextHash
      },
      onError: () => {
        setFallbackInterval((current) => current >= 15_000 ? 30_000 : 15_000)
      },
    }
  )

  const { isConnected, connectionError } = useRealtimeUpdates({
    onRequestEvent: useCallback((event: RequestEvent) => {
      const request = event.payload.request
      if (!request) {
        return
      }

      mutate((current) => applyRequestToPage(current, request, options, event.type), { revalidate: false })
      setLastUpdated(new Date(event.occurredAt))
    }, [options, mutate]),
    enabled,
  })

  const applyRequestUpdate = useCallback((request: LineHaulRequest, revalidate = false) => {
    setLastUpdated(new Date())
    return mutate((current) => applyRequestToPage(current, request, options), { revalidate })
  }, [mutate, options])

  useEffect(() => {
    setRealtimeState({ isConnected, error: connectionError })
  }, [connectionError, isConnected])

  useEffect(() => {
    if (typeof window === 'undefined') return

    setIsOnline(window.navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return {
    requests: data?.requests ?? [],
    pagination: data?.pagination ?? { limit: options?.limit ?? 100, offset: options?.offset ?? 0, hasMore: false },
    realtime: {
      isConnected,
      mode: (!isOnline ? 'offline' : isConnected ? 'connected' : connectionError ? 'polling' : 'reconnecting') as RealtimeMode,
      error: connectionError,
    },
    isLoading,
    isError: error,
    lastUpdated,
    applyRequestUpdate,
    mutate,
  }
}
