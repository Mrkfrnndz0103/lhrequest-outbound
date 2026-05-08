import { NextRequest, NextResponse } from 'next/server'
import { updateRequest } from '@/lib/supabase-database'
import { isAuthError, requireUser } from '@/lib/api-auth'
import { publishRequestActionEvent } from '@/lib/request-events'
import { SupabaseRestError } from '@/lib/supabase'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, remarks, plateNumber, lhTrip, hubCluster, region, dockNumber, backlogs, lhType } = body

    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      )
    }

    if (!['approve', 'reject_ops', 'edit', 'assign', 'reject_mm'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      )
    }

    if (action === 'assign' && !plateNumber) {
      return NextResponse.json(
        { error: 'Plate number is required for assignment' },
        { status: 400 }
      )
    }

    if ((action === 'reject_ops' || action === 'reject_mm') && !remarks) {
      return NextResponse.json(
        { error: 'Remarks are required for rejection' },
        { status: 400 }
      )
    }

    const requiredRole = action === 'assign' || action === 'reject_mm' ? 'FTE_MM' : 'FTE_OPS'
    const user = requireUser(request, [requiredRole])
    if (isAuthError(user)) return user

    if (backlogs !== undefined && (!Number.isInteger(Number(backlogs)) || Number(backlogs) < 0)) {
      return NextResponse.json(
        { error: 'Backlogs must be a non-negative whole number' },
        { status: 400 }
      )
    }

    const updatedRequest = await updateRequest(id, {
      action,
      userName: user.name,
      remarks,
      plateNumber,
      lhTrip,
      hubCluster,
      region,
      dockNumber,
      backlogs: backlogs === undefined ? undefined : Number(backlogs),
      lhType,
    })

    await publishRequestActionEvent(action, {
      requestId: updatedRequest.id,
      status: updatedRequest.status,
      actorName: user.name,
      request: updatedRequest,
    })

    return NextResponse.json({ success: true, request: updatedRequest })
  } catch (error) {
    console.error('Error updating request:', error)
    if (error instanceof SupabaseRestError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update request' },
      { status: 500 }
    )
  }
}
