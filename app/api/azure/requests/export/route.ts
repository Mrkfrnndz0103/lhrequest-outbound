import { NextRequest } from 'next/server'
import { getRequests } from '@/lib/azure-database'
import { isAuthError, requireUser } from '@/lib/api-auth'
import { handleApiError, validationError } from '@/lib/api-errors'
import { REQUEST_STATUS_LABELS } from '@/lib/constants'
import { isRequestStatus } from '@/lib/request-status'
import type { LineHaulRequest, RequestStatus } from '@/lib/types'

const EXPORT_PAGE_SIZE = 200
const EXPORT_MAX_ROWS = 5000

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function toCsv(requests: LineHaulRequest[]) {
  const headers = [
    'ID',
    'Request Time',
    'Hub/Cluster',
    'Region',
    'Dock #',
    'Backlogs',
    'LH Type',
    'Status',
    'Plate #',
    'Ops PIC',
    'FTE Ops',
    'FTE MM',
    'LH Trip',
  ]

  const rows = requests.map((request) => [
    request.id,
    request.requestTime,
    request.hubCluster,
    request.region,
    request.dockNumber,
    request.backlogs,
    request.lhType,
    REQUEST_STATUS_LABELS[request.status],
    request.plateNumber || '',
    request.opsPicName,
    request.fteOpsName || '',
    request.fteMmName || '',
    request.lhTrip || '',
  ])

  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\n')
}

export async function GET(request: NextRequest) {
  try {
    const user = requireUser(request)
    if (isAuthError(user)) return user

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')

    if (status && !isRequestStatus(status)) {
      return validationError('Invalid status filter')
    }

    const baseFilters = {
      status: status as RequestStatus | undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      search: searchParams.get('search') || undefined,
      plateNumber: searchParams.get('plateNumber') || undefined,
      hubCluster: searchParams.get('hubCluster') || undefined,
      region: searchParams.get('region') || undefined,
      opsPicId: user.role === 'OPS_PIC'
        ? user.opsId || user.email || ''
        : searchParams.get('opsPicId') || undefined,
    }

    const requests: LineHaulRequest[] = []
    let offset = 0
    let hasMore = true

    while (hasMore && requests.length < EXPORT_MAX_ROWS) {
      const page = await getRequests({
        ...baseFilters,
        limit: EXPORT_PAGE_SIZE,
        offset,
      })

      requests.push(...page.requests)
      hasMore = page.pagination.hasMore
      offset += EXPORT_PAGE_SIZE
    }

    return new Response(toCsv(requests.slice(0, EXPORT_MAX_ROWS)), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="linehaul-requests-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Error exporting requests:', error)
    return handleApiError(error, 'Failed to export requests')
  }
}
