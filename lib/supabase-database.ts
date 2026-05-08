import { supabaseCount, supabaseRequest } from './supabase'
import type { Cluster, LHType, LineHaulRequest, RequestStatus, User, UserRole } from './types'

type RequestFilters = {
  status?: RequestStatus
  dateFrom?: string
  dateTo?: string
  plateNumber?: string
  opsPicId?: string
  limit?: number
  offset?: number
}

type UserRow = {
  id: string
  name: string | null
  ops_id: string | null
  email: string | null
  role: UserRole | string | null
}

type ClusterRow = {
  id: string
  name: string | null
  region: string | null
  column_d: string | null
  column_e: string | null
  column_f: string | null
}

type RequestRow = {
  id: string
  request_time: string | null
  hub_cluster: string | null
  region: string | null
  dock_number: string | null
  backlogs: number | null
  lh_type: LHType | string | null
  ops_pic_name: string | null
  ops_pic_id: string | null
  status: RequestStatus | string | null
  fte_ops_name: string | null
  fte_ops_timestamp: string | null
  fte_ops_remarks: string | null
  plate_number: string | null
  fte_mm_name: string | null
  fte_mm_timestamp: string | null
  fte_mm_remarks: string | null
  lh_trip: string | null
  is_docked: boolean | null
}

type RequestInsert = Omit<RequestRow,
  | 'fte_ops_name'
  | 'fte_ops_timestamp'
  | 'fte_ops_remarks'
  | 'plate_number'
  | 'fte_mm_name'
  | 'fte_mm_timestamp'
  | 'fte_mm_remarks'
  | 'lh_trip'
>

const READ_CACHE_TTL_MS = 10000
const STALE_READ_TTL_MS = 5 * 60 * 1000
const CLUSTER_CACHE_TTL_MS = 10 * 60 * 1000
const REQUEST_CACHE_TTL_MS = 5000
const REQUEST_COLUMNS = [
  'id',
  'request_time',
  'hub_cluster',
  'region',
  'dock_number',
  'backlogs',
  'lh_type',
  'ops_pic_name',
  'ops_pic_id',
  'status',
  'fte_ops_name',
  'fte_ops_timestamp',
  'fte_ops_remarks',
  'plate_number',
  'fte_mm_name',
  'fte_mm_timestamp',
  'fte_mm_remarks',
  'lh_trip',
  'is_docked',
].join(',')

let pendingCountsCache: { data: { pendingOps: number; pendingMm: number }; fetchedAt: number } | null = null
let pendingCountsPromise: Promise<{ pendingOps: number; pendingMm: number }> | null = null
let clustersCache: { data: Cluster[]; fetchedAt: number } | null = null
let clustersPromise: Promise<Cluster[]> | null = null
const requestsCache = new Map<string, { data: LineHaulRequest[]; fetchedAt: number }>()
const requestsPromises = new Map<string, Promise<LineHaulRequest[]>>()

function isCacheFresh(fetchedAt: number) {
  return Date.now() - fetchedAt < READ_CACHE_TTL_MS
}

function invalidateReadCaches() {
  pendingCountsCache = null
  requestsCache.clear()
}

function parseDateString(dateStr: string | null): string {
  if (!dateStr) return ''

  const date = new Date(dateStr)
  return Number.isNaN(date.getTime()) ? dateStr : date.toISOString()
}

function optionalString(value: string | null): string | undefined {
  return value || undefined
}

function safeIlikePattern(value: string) {
  return value.replaceAll('*', '').replaceAll('%', '').replaceAll(',', '')
}

function toRequest(row: RequestRow): LineHaulRequest {
  return {
    id: row.id,
    requestTime: parseDateString(row.request_time),
    hubCluster: row.hub_cluster || '',
    region: row.region || '',
    dockNumber: row.dock_number || '',
    backlogs: row.backlogs || 0,
    lhType: (row.lh_type || '6W') as LHType,
    opsPicName: row.ops_pic_name || '',
    opsPicId: row.ops_pic_id || '',
    status: (row.status || 'PENDING_OPS') as RequestStatus,
    fteOpsName: optionalString(row.fte_ops_name),
    fteOpsTimestamp: parseDateString(row.fte_ops_timestamp),
    fteOpsRemarks: optionalString(row.fte_ops_remarks),
    plateNumber: optionalString(row.plate_number),
    fteMmName: optionalString(row.fte_mm_name),
    fteMmTimestamp: parseDateString(row.fte_mm_timestamp),
    fteMmRemarks: optionalString(row.fte_mm_remarks),
    lhTrip: optionalString(row.lh_trip),
    isDocked: row.is_docked || false,
  }
}

export async function validateUser(identifier: string, loginType: 'fte' | 'backroom'): Promise<User | null> {
  const column = loginType === 'backroom' ? 'ops_id' : 'email'
  const users = await supabaseRequest<UserRow[]>('users', {
    select: 'id,name,ops_id,email,role',
    [column]: `ilike.${safeIlikePattern(identifier)}`,
    limit: 1,
  })

  const user = users[0]
  if (!user) return null

  if (loginType === 'backroom') {
    return {
      name: user.name || 'Unknown',
      opsId: user.ops_id,
      email: user.email,
      role: 'OPS_PIC',
    }
  }

  return {
    name: user.name || 'Unknown',
    opsId: user.ops_id,
    email: user.email,
    role: user.role?.toUpperCase() === 'FTE_MM' ? 'FTE_MM' : 'FTE_OPS',
  }
}

export async function getClusters(): Promise<Cluster[]> {
  if (clustersCache && Date.now() - clustersCache.fetchedAt < CLUSTER_CACHE_TTL_MS) {
    return clustersCache.data
  }

  clustersPromise ??= supabaseRequest<ClusterRow[]>('clusters', {
    select: 'id,name,region,column_d,column_e,column_f',
    order: 'name.asc',
  })
    .then((rows) => {
      const seen = new Set<string>()
      const clusters: Cluster[] = []

      for (const row of rows) {
        if (!row.name || seen.has(row.name)) continue
        seen.add(row.name)
        clusters.push({
          name: row.name,
          region: row.region || 'Unknown',
          columnD: optionalString(row.column_d),
          columnE: optionalString(row.column_e),
          columnF: optionalString(row.column_f),
        })
      }

      clustersCache = { data: clusters, fetchedAt: Date.now() }
      return clusters
    })
    .catch((error) => {
      if (clustersCache && Date.now() - clustersCache.fetchedAt < STALE_READ_TTL_MS) {
        return clustersCache.data
      }

      throw error
    })
    .finally(() => {
      clustersPromise = null
    })

  return clustersPromise
}

export async function getRequests(filters?: RequestFilters): Promise<LineHaulRequest[]> {
  const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 200)
  const offset = Math.max(filters?.offset ?? 0, 0)
  const cacheKey = JSON.stringify({ ...filters, limit, offset })
  const cached = requestsCache.get(cacheKey)

  if (cached && Date.now() - cached.fetchedAt < REQUEST_CACHE_TTL_MS) {
    return cached.data
  }

  const existingPromise = requestsPromises.get(cacheKey)
  if (existingPromise) return existingPromise

  const query: [string, string][] = [
    ['select', REQUEST_COLUMNS],
    ['order', 'request_time.desc.nullslast,id.desc'],
    ['limit', String(limit)],
    ['offset', String(offset)],
  ]

  if (filters?.status) {
    query.push(['status', `eq.${filters.status}`])
  }

  if (filters?.dateFrom) {
    const fromDate = new Date(filters.dateFrom)
    if (!Number.isNaN(fromDate.getTime())) {
      query.push(['request_time', `gte.${fromDate.toISOString()}`])
    }
  }

  if (filters?.dateTo) {
    const toDate = new Date(filters.dateTo)
    if (!Number.isNaN(toDate.getTime())) {
      toDate.setHours(23, 59, 59, 999)
      query.push(['request_time', `lte.${toDate.toISOString()}`])
    }
  }

  if (filters?.plateNumber) {
    query.push(['plate_number', `ilike.*${safeIlikePattern(filters.plateNumber)}*`])
  }

  if (filters?.opsPicId) {
    query.push(['ops_pic_id', `eq.${safeIlikePattern(filters.opsPicId)}`])
  }

  const promise = supabaseRequest<RequestRow[]>('requests', query)
    .then((rows) => {
      const requests = rows.map(toRequest)
      requestsCache.set(cacheKey, { data: requests, fetchedAt: Date.now() })
      return requests
    })
    .catch((error) => {
      if (cached && Date.now() - cached.fetchedAt < STALE_READ_TTL_MS) {
        return cached.data
      }

      throw error
    })
    .finally(() => {
      requestsPromises.delete(cacheKey)
    })

  requestsPromises.set(cacheKey, promise)
  return promise
}

export async function createRequest(data: {
  hubCluster: string
  region: string
  dockNumber: string
  backlogs: number
  lhType: LHType
  opsPicName: string
  opsPicId: string
}): Promise<LineHaulRequest> {
  const id = `LH-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
  const requestTime = new Date().toISOString()

  const row: RequestInsert = {
    id,
    request_time: requestTime,
    hub_cluster: data.hubCluster,
    region: data.region,
    dock_number: data.dockNumber,
    backlogs: data.backlogs,
    lh_type: data.lhType,
    ops_pic_name: data.opsPicName,
    ops_pic_id: data.opsPicId,
    status: 'PENDING_OPS',
    is_docked: false,
  }

  const inserted = await supabaseRequest<RequestRow[]>(
    'requests',
    { select: '*' },
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([row]),
    }
  )

  invalidateReadCaches()
  return toRequest(inserted[0])
}

export async function updateRequest(
  id: string,
  updates: {
    action: 'approve' | 'reject_ops' | 'edit' | 'assign' | 'reject_mm'
    userName: string
    remarks?: string
    plateNumber?: string
    lhTrip?: string
    hubCluster?: string
    region?: string
    dockNumber?: string
    backlogs?: number
    lhType?: LHType
  }
): Promise<LineHaulRequest> {
  const timestamp = new Date().toISOString()
  const patch: Partial<RequestRow> = {}

  switch (updates.action) {
    case 'approve':
      patch.status = 'PENDING_MM'
      patch.fte_ops_name = updates.userName
      patch.fte_ops_timestamp = timestamp
      patch.fte_ops_remarks = updates.remarks || ''
      break
    case 'reject_ops':
      patch.status = 'REJECTED_OPS'
      patch.fte_ops_name = updates.userName
      patch.fte_ops_timestamp = timestamp
      patch.fte_ops_remarks = updates.remarks || ''
      break
    case 'edit':
      if (updates.hubCluster !== undefined) patch.hub_cluster = updates.hubCluster
      if (updates.region !== undefined) patch.region = updates.region
      if (updates.dockNumber !== undefined) patch.dock_number = updates.dockNumber
      if (updates.backlogs !== undefined) patch.backlogs = updates.backlogs
      if (updates.lhType !== undefined) patch.lh_type = updates.lhType
      break
    case 'assign':
      patch.status = 'CONFIRMED'
      patch.plate_number = updates.plateNumber || ''
      patch.fte_mm_name = updates.userName
      patch.fte_mm_timestamp = timestamp
      patch.fte_mm_remarks = updates.remarks || ''
      patch.lh_trip = updates.lhTrip || ''
      break
    case 'reject_mm':
      patch.status = 'REJECTED_MM'
      patch.fte_mm_name = updates.userName
      patch.fte_mm_timestamp = timestamp
      patch.fte_mm_remarks = updates.remarks || ''
      break
  }

  const rows = await supabaseRequest<RequestRow[]>(
    'requests',
    [
      ['id', `eq.${id}`],
      ['select', '*'],
    ],
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    }
  )

  if (!rows.length) {
    throw new Error('Request not found')
  }

  invalidateReadCaches()
  return toRequest(rows[0])
}

export async function getPendingCounts(options: { forceRefresh?: boolean } = {}): Promise<{ pendingOps: number; pendingMm: number }> {
  if (!options.forceRefresh && pendingCountsCache && isCacheFresh(pendingCountsCache.fetchedAt)) {
    return pendingCountsCache.data
  }

  pendingCountsPromise ??= Promise.all([
    supabaseCount('requests', [['status', 'eq.PENDING_OPS']]),
    supabaseCount('requests', [['status', 'eq.PENDING_MM']]),
  ])
    .then(([pendingOps, pendingMm]) => {
      const data = { pendingOps, pendingMm }
      pendingCountsCache = { data, fetchedAt: Date.now() }
      return data
    })
    .catch((error) => {
      if (pendingCountsCache && Date.now() - pendingCountsCache.fetchedAt < STALE_READ_TTL_MS) {
        return pendingCountsCache.data
      }

      throw error
    })
    .finally(() => {
      pendingCountsPromise = null
    })

  return pendingCountsPromise
}

export function getCachedPendingCounts() {
  return pendingCountsCache?.data ?? { pendingOps: 0, pendingMm: 0 }
}

export function getCachedClusters() {
  return clustersCache?.data ?? []
}

export function getCachedRequests(filters?: RequestFilters) {
  const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 200)
  const offset = Math.max(filters?.offset ?? 0, 0)
  const cacheKey = JSON.stringify({ ...filters, limit, offset })

  return requestsCache.get(cacheKey)?.data ?? []
}
