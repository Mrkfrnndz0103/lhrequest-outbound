import { NextRequest, NextResponse } from 'next/server'
import { getCachedRequests, getRequests, createRequest } from '@/lib/database'
import { isAuthError, requireUser } from '@/lib/api-auth'
import { withTimeout } from '@/lib/api-timeout'
import { publishRequestEvent } from '@/lib/request-events'
import { handleApiError, validationError } from '@/lib/api-errors'
import { isRequestStatus } from '@/lib/request-status'
import type { RequestStatus, LHType } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const user = requireUser(request)
    if (isAuthError(user)) return user

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') as RequestStatus | null
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const search = searchParams.get('search')
    const plateNumber = searchParams.get('plateNumber')
    const hubCluster = searchParams.get('hubCluster')
    const region = searchParams.get('region')
    const opsPicId = searchParams.get('opsPicId')
    const limit = Number(searchParams.get('limit') || 200)
    const offset = Number(searchParams.get('offset') || 0)

    if (status && !isRequestStatus(status)) {
      return validationError('Invalid status filter')
    }

    if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
      return validationError('Limit must be between 1 and 200')
    }

    if (!Number.isFinite(offset) || offset < 0) {
      return validationError('Offset must be zero or greater')
    }

    const filters: {
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
    } = {}

    if (status) filters.status = status as RequestStatus
    if (dateFrom) filters.dateFrom = dateFrom
    if (dateTo) filters.dateTo = dateTo
    if (search) filters.search = search
    if (plateNumber) filters.plateNumber = plateNumber
    if (hubCluster) filters.hubCluster = hubCluster
    if (region) filters.region = region
    if (Number.isFinite(limit)) filters.limit = limit
    if (Number.isFinite(offset)) filters.offset = offset
    if (user.role === 'OPS_PIC') {
      filters.opsPicId = user.opsId || user.email || ''
    } else if (opsPicId) {
      filters.opsPicId = opsPicId
    }

    const requestFilters = Object.keys(filters).length > 0 ? filters : undefined
    const page = await withTimeout(
      getRequests(requestFilters),
      1200,
      () => getCachedRequests(requestFilters)
    )
    return NextResponse.json(
      page,
      { headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=30' } }
    )
  } catch (error) {
    console.error('Error fetching requests:', error)
    return handleApiError(error, 'Failed to fetch requests')
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = requireUser(request, ['OPS_PIC'])
    if (isAuthError(user)) return user

    const body = await request.json()
    const { hubCluster, region, dockNumber, backlogs, lhType } = body

    if (!hubCluster || !region || !dockNumber || backlogs === undefined || !lhType) {
      return validationError('All fields are required')
    }

    const parsedBacklogs = Number(backlogs)
    if (!Number.isInteger(parsedBacklogs) || parsedBacklogs < 0) {
      return validationError('Backlogs must be a non-negative whole number')
    }

    const newRequest = await createRequest({
      hubCluster: String(hubCluster).trim(),
      region: String(region).trim(),
      dockNumber: String(dockNumber).trim(),
      backlogs: parsedBacklogs,
      lhType: lhType as LHType,
      opsPicName: user.name,
      opsPicId: user.opsId || user.email || '',
    })

    await publishRequestEvent('request.created', {
      requestId: newRequest.id,
      status: newRequest.status,
      actorName: user.name,
      request: newRequest,
    })

    return NextResponse.json({ request: newRequest }, { status: 201 })
  } catch (error) {
    console.error('Error creating request:', error)
    return handleApiError(error, 'Failed to create request')
  }
}
