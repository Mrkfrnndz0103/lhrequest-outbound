'use client'

import useSWR from 'swr'
import { fetchJson } from '@/lib/fetcher'
import type { Cluster } from '@/lib/types'

export function useClusters() {
  const { data, error, isLoading } = useSWR<{ clusters: Cluster[] }>(
    '/api/supabase/clusters',
    fetchJson,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // Cache for 1 minute
    }
  )

  return {
    clusters: data?.clusters ?? [],
    isLoading,
    isError: error,
  }
}
