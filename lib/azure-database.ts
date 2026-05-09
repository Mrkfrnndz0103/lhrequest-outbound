import { query, normalizeLikePattern } from './postgres'
import { RequestConflictError, RequestNotFoundError } from './api-errors'
import { getExpectedStatusForAction, getNextStatusForAction, type RequestAction } from './request-status'
import type { Cluster, LHType, LineHaulRequest, RequestStatus, User, UserRole } from './types'

type RequestFilters = {
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
}

export type RequestsPage = {
  requests: LineHaulRequest[]
  pagination: {
    limit: number
    offset: number
    hasMore: boolean
  }
}

type UserRow = {
  name: string | null
  ops_id: string | null
  email: string | null
  role: UserRole | string | null
  is_active: boolean | null
}

type ClusterRow = {
  hub_name: string | null
  cluster: string | null
  region_gen: string | null
  dock_number: string | null
  backlogs: number | null
  backlogs_ts: Date | string | null
}

type RequestRow = {
  id: string
  request_time: Date | string | null
  hub_cluster: string | null
  region: string | null
  dock_number: string | null
  backlogs: number | null
  lh_type: LHType | string | null
  ops_pic_name: string | null
  ops_pic_id: string | null
  status: RequestStatus | string | null
  fte_ops_name: string | null
  fte_ops_timestamp: Date | string | null
  fte_ops_remarks: string | null
  plate_number: string | null
  fte_mm_name: string | null
  fte_mm_timestamp: Date | string | null
  fte_mm_remarks: string | null
  lh_trip: string | null
  is_docked: boolean | null
}

const READ_CACHE_TTL_MS = 10000
const STALE_READ_TTL_MS = 5 * 60 * 1000
const CLUSTER_CACHE_TTL_MS = 10 * 60 * 1000
const REQUEST_CACHE_TTL_MS = 5000
const REQUEST_COLUMNS = `
  id,
  request_time,
  hub_cluster,
  region,
  dock_number,
  backlogs,
  lh_type,
  ops_pic_name,
  ops_pic_id,
  status,
  fte_ops_name,
  fte_ops_timestamp,
  fte_ops_remarks,
  plate_number,
  fte_mm_name,
  fte_mm_timestamp,
  fte_mm_remarks,
  lh_trip,
  is_docked
`

let pendingCountsCache: { data: { pendingOps: number; pendingMm: number }; fetchedAt: number } | null = null
let pendingCountsPromise: Promise<{ pendingOps: number; pendingMm: number }> | null = null
let clustersCache: { data: Cluster[]; fetchedAt: number } | null = null
let clustersPromise: Promise<Cluster[]> | null = null
const requestsCache = new Map<string, { data: RequestsPage; fetchedAt: number }>()
const requestsPromises = new Map<string, Promise<RequestsPage>>()

function isCacheFresh(fetchedAt: number) {
  return Date.now() - fetchedAt < READ_CACHE_TTL_MS
}

function invalidateReadCaches() {
  pendingCountsCache = null
  requestsCache.clear()
}

function parseDateString(value: Date | string | null): string {
  if (!value) return ''

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

function optionalString(value: string | null): string | undefined {
  return value || undefined
}

function clusterDisplayName(row: ClusterRow): string {
  if (row.hub_name && row.cluster) return `${row.hub_name} - ${row.cluster}`
  return row.cluster || row.hub_name || ''
}

function likeValue(value: string) {
  return `%${normalizeLikePattern(value)}%`
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
  const result = await query<UserRow>(
    `select name, ops_id, email, role, "is active" as is_active
     from public.users
     where ${column} ilike $1 and "is active" is distinct from false
     limit 1`,
    [identifier]
  )

  const user = result.rows[0]
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

  clustersPromise ??= query<ClusterRow>(
    `select
       hub_name,
       cluster,
       "Region_gen" as region_gen,
       "dock_#" as dock_number,
       backlogs,
       backlogs_ts
     from public.clusters
     order by coalesce(hub_name || ' - ' || cluster, cluster, hub_name) asc`
  )
    .then((result) => {
      const seen = new Set<string>()
      const clusters: Cluster[] = []

      for (const row of result.rows) {
        const name = clusterDisplayName(row)
        if (!name || seen.has(name)) continue
        seen.add(name)
        clusters.push({
          name,
          region: row.region_gen || 'Unknown',
          hubName: optionalString(row.hub_name),
          cluster: optionalString(row.cluster),
          dockNumber: optionalString(row.dock_number),
          backlogs: row.backlogs ?? undefined,
          backlogsTs: parseDateString(row.backlogs_ts) || undefined,
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

function addWhere(
  clauses: string[],
  values: unknown[],
  sql: string,
  value: unknown
) {
  values.push(value)
  clauses.push(sql.replace('?', `$${values.length}`))
}

export async function getRequests(filters?: RequestFilters): Promise<RequestsPage> {
  const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 200)
  const offset = Math.max(filters?.offset ?? 0, 0)
  const cacheKey = JSON.stringify({ ...filters, limit, offset })
  const cached = requestsCache.get(cacheKey)

  if (cached && Date.now() - cached.fetchedAt < REQUEST_CACHE_TTL_MS) {
    return cached.data
  }

  const existingPromise = requestsPromises.get(cacheKey)
  if (existingPromise) return existingPromise

  const clauses: string[] = []
  const values: unknown[] = []

  if (filters?.status) addWhere(clauses, values, 'status = ?', filters.status)
  if (filters?.dateFrom) {
    const fromDate = new Date(filters.dateFrom)
    if (!Number.isNaN(fromDate.getTime())) addWhere(clauses, values, 'request_time >= ?', fromDate)
  }
  if (filters?.dateTo) {
    const toDate = new Date(filters.dateTo)
    if (!Number.isNaN(toDate.getTime())) {
      toDate.setHours(23, 59, 59, 999)
      addWhere(clauses, values, 'request_time <= ?', toDate)
    }
  }
  if (filters?.plateNumber) addWhere(clauses, values, "plate_number ilike ? escape '\\'", likeValue(filters.plateNumber))
  if (filters?.hubCluster) addWhere(clauses, values, "hub_cluster ilike ? escape '\\'", likeValue(filters.hubCluster))
  if (filters?.region) addWhere(clauses, values, 'region = ?', filters.region)
  if (filters?.opsPicId) addWhere(clauses, values, 'ops_pic_id = ?', filters.opsPicId)
  if (filters?.search) {
    const value = likeValue(filters.search)
    values.push(value)
    const index = values.length
    clauses.push(`(plate_number ilike $${index} escape '\\' or hub_cluster ilike $${index} escape '\\' or id ilike $${index} escape '\\')`)
  }

  values.push(limit + 1, offset)
  const whereSql = clauses.length ? `where ${clauses.join(' and ')}` : ''

  const promise = query<RequestRow>(
    `select ${REQUEST_COLUMNS}
     from public.requests
     ${whereSql}
     order by request_time desc nulls last, id desc
     limit $${values.length - 1}
     offset $${values.length}`,
    values
  )
    .then((result) => {
      const hasMore = result.rows.length > limit
      const page = {
        requests: result.rows.slice(0, limit).map(toRequest),
        pagination: { limit, offset, hasMore },
      }
      requestsCache.set(cacheKey, { data: page, fetchedAt: Date.now() })
      return page
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
  const requestTime = new Date()

  const result = await query<RequestRow>(
    `insert into public.requests (
       id, request_time, hub_cluster, region, dock_number, backlogs, lh_type,
       ops_pic_name, ops_pic_id, status, is_docked
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING_OPS', false)
     returning ${REQUEST_COLUMNS}`,
    [
      id,
      requestTime,
      data.hubCluster,
      data.region,
      data.dockNumber,
      data.backlogs,
      data.lhType,
      data.opsPicName,
      data.opsPicId,
    ]
  )

  invalidateReadCaches()
  return toRequest(result.rows[0])
}

export async function updateRequest(
  id: string,
  updates: {
    action: RequestAction
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
  const timestamp = new Date()
  const expectedStatus = getExpectedStatusForAction(updates.action)
  const assignments: string[] = []
  const values: unknown[] = []

  function set(column: string, value: unknown) {
    values.push(value)
    assignments.push(`${column} = $${values.length}`)
  }

  switch (updates.action) {
    case 'approve':
      set('status', getNextStatusForAction(updates.action))
      set('fte_ops_name', updates.userName)
      set('fte_ops_timestamp', timestamp)
      set('fte_ops_remarks', updates.remarks || '')
      break
    case 'reject_ops':
      set('status', getNextStatusForAction(updates.action))
      set('fte_ops_name', updates.userName)
      set('fte_ops_timestamp', timestamp)
      set('fte_ops_remarks', updates.remarks || '')
      break
    case 'edit':
      set('status', getNextStatusForAction(updates.action))
      if (updates.hubCluster !== undefined) set('hub_cluster', updates.hubCluster)
      if (updates.region !== undefined) set('region', updates.region)
      if (updates.dockNumber !== undefined) set('dock_number', updates.dockNumber)
      if (updates.backlogs !== undefined) set('backlogs', updates.backlogs)
      if (updates.lhType !== undefined) set('lh_type', updates.lhType)
      break
    case 'assign':
      set('status', getNextStatusForAction(updates.action))
      set('plate_number', updates.plateNumber || '')
      set('fte_mm_name', updates.userName)
      set('fte_mm_timestamp', timestamp)
      set('fte_mm_remarks', updates.remarks || '')
      set('lh_trip', updates.lhTrip || '')
      break
    case 'reject_mm':
      set('status', getNextStatusForAction(updates.action))
      set('fte_mm_name', updates.userName)
      set('fte_mm_timestamp', timestamp)
      set('fte_mm_remarks', updates.remarks || '')
      break
  }

  values.push(id, expectedStatus)
  const result = await query<RequestRow>(
    `update public.requests
     set ${assignments.join(', ')}
     where id = $${values.length - 1} and status = $${values.length}
     returning ${REQUEST_COLUMNS}`,
    values
  )

  if (!result.rows.length) {
    const existing = await query<{ id: string; status: RequestStatus }>(
      'select id, status from public.requests where id = $1 limit 1',
      [id]
    )

    if (!existing.rows.length) {
      throw new RequestNotFoundError()
    }

    throw new RequestConflictError()
  }

  invalidateReadCaches()
  return toRequest(result.rows[0])
}

export async function getPendingCounts(options: { forceRefresh?: boolean } = {}): Promise<{ pendingOps: number; pendingMm: number }> {
  if (!options.forceRefresh && pendingCountsCache && isCacheFresh(pendingCountsCache.fetchedAt)) {
    return pendingCountsCache.data
  }

  pendingCountsPromise ??= query<{ status: RequestStatus; count: string }>(
    `select status, count(*)::text as count
     from public.requests
     where status in ('PENDING_OPS', 'PENDING_MM')
     group by status`
  )
    .then((result) => {
      const data = { pendingOps: 0, pendingMm: 0 }
      for (const row of result.rows) {
        if (row.status === 'PENDING_OPS') data.pendingOps = Number(row.count)
        if (row.status === 'PENDING_MM') data.pendingMm = Number(row.count)
      }
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

  return requestsCache.get(cacheKey)?.data ?? {
    requests: [],
    pagination: { limit, offset, hasMore: false },
  }
}
