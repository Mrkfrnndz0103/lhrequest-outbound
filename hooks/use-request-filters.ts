'use client'

import { useEffect, useMemo, useState } from 'react'
import { useDebouncedValue } from './use-debounced-value'
import type { RequestStatus } from '@/lib/types'

export type RequestTableFilters = {
  search?: string
  dateFrom?: string
  dateTo?: string
  status?: RequestStatus | 'all'
}

function normalizeFilters(filters: RequestTableFilters) {
  return {
    search: filters.search || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    status: filters.status || 'all',
  }
}

export function useRequestFilters(
  initialFilters: RequestTableFilters = {},
  delayMs = 250
) {
  const normalizedInitialFilters = useMemo(
    () => normalizeFilters(initialFilters),
    [initialFilters.dateFrom, initialFilters.dateTo, initialFilters.search, initialFilters.status]
  )
  const [filters, setFilters] = useState(normalizedInitialFilters)

  useEffect(() => {
    setFilters(normalizedInitialFilters)
  }, [normalizedInitialFilters])

  const debouncedFilters = useDebouncedValue(filters, delayMs)

  return {
    filters,
    debouncedFilters,
    setFilters,
    setFilter: <K extends keyof RequestTableFilters>(key: K, value: RequestTableFilters[K]) => {
      setFilters((current) => normalizeFilters({ ...current, [key]: value }))
    },
  }
}
