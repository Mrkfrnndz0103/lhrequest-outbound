import { NextRequest, NextResponse } from 'next/server'
import { getCachedRequests, getRequests, createRequest } from '@/lib/supabase-database'
import { isAuthError, requireUser } from '@/lib/api-auth'
import { withTimeout } from '@/lib/api-timeout'
import { publishRequestEvent } from '@/lib/request-events'
import { SupabaseRestError } from '@/lib/supabase'
import type { RequestStatus, LHType } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const user = requireUser(request)
    if (isAuthError(user)) return user

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') as RequestStatus | null
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const plateNumber = searchParams.get('plateNumber')
    const limit = Number(searchParams.get('limit') || 200)
    const offset = Number(searchParams.get('offset') || 0)

    const filters: {
      status?: RequestStatus
      dateFrom?: string
      dateTo?: string
      plateNumber?: string
      opsPicId?: string
      limit?: number
      offset?: number
    } = {}

    if (status) filters.status = status
    if (dateFrom) filters.dateFrom = dateFrom
    if (dateTo) filters.dateTo = dateTo
    if (plateNumber) filters.plateNumber = plateNumber
    if (Number.isFinite(limit)) filters.limit = limit
    if (Number.isFinite(offset)) filters.offset = offset
    if (user.role === 'OPS_PIC') filters.opsPicId = user.opsId || user.email || ''

    const requestFilters = Object.keys(filters).length > 0 ? filters : undefined
    const requests = await withTimeout(
      getRequests(requestFilters),
      1200,
      () => getCachedRequests(requestFilters)
    )
    return NextResponse.json(
      { requests },
      { headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=30' } }
    )
  } catch (error) {
    console.error('Error fetching requests:', error)
    if (error instanceof SupabaseRestError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { error: 'Failed to fetch requests' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = requireUser(request, ['OPS_PIC'])
    if (isAuthError(user)) return user

    const body = await request.json()
    const { hubCluster, region, dockNumber, backlogs, lhType } = body

    if (!hubCluster || !region || !dockNumber || backlogs === undefined || !lhType) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }

    const parsedBacklogs = Number(backlogs)
    if (!Number.isInteger(parsedBacklogs) || parsedBacklogs < 0) {
      return NextResponse.json(
        { error: 'Backlogs must be a non-negative whole number' },
        { status: 400 }
      )
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
    if (error instanceof SupabaseRestError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create request' },
      { status: 500 }
    )
  }
}
