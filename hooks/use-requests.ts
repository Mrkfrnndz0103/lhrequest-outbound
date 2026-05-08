'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { POLLING_INTERVAL } from '@/lib/constants'
import { fetchJson } from '@/lib/fetcher'
import { useRealtimeUpdates } from './use-realtime-updates'
import type { LineHaulRequest, RequestStatus } from '@/lib/types'

interface UseRequestsOptions {
  status?: RequestStatus
  dateFrom?: string
  dateTo?: string
  plateNumber?: string
  enabled?: boolean
}

export function useRequests(options?: UseRequestsOptions) {
  const enabled = options?.enabled ?? true
  const params = new URLSearchParams()
  
  if (options?.status) params.append('status', options.status)
  if (options?.dateFrom) params.append('dateFrom', options.dateFrom)
  if (options?.dateTo) params.append('dateTo', options.dateTo)
  if (options?.plateNumber) params.append('plateNumber', options.plateNumber)

  const queryString = params.toString()
  const url = enabled ? `/api/supabase/requests${queryString ? `?${queryString}` : ''}` : null

  const { data, error, isLoading, mutate } = useSWR<{ requests: LineHaulRequest[] }>(
    url,
    fetchJson,
    {
      refreshInterval: POLLING_INTERVAL * 3,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    }
  )

  useRealtimeUpdates({
    onRequestEvent: useCallback(() => {
      mutate()
    }, [mutate]),
    enabled,
  })

  return {
    requests: data?.requests ?? [],
    isLoading,
    isError: error,
    mutate,
  }
}
