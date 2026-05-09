import { NextRequest, NextResponse } from 'next/server'
import { updateRequest } from '@/lib/azure-database'
import { isAuthError, requireUser } from '@/lib/api-auth'
import { publishRequestActionEvent } from '@/lib/request-events'
import { handleApiError, validationError } from '@/lib/api-errors'
import { getExpectedStatusForAction, isRequestAction } from '@/lib/request-status'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, remarks, plateNumber, lhTrip, hubCluster, region, dockNumber, backlogs, lhType } = body

    if (!action) {
      return validationError('Action is required')
    }

    if (!isRequestAction(action)) {
      return validationError('Invalid action')
    }

    if (action === 'assign' && !plateNumber) {
      return validationError('Plate number is required for assignment')
    }

    if ((action === 'reject_ops' || action === 'reject_mm') && !remarks) {
      return validationError('Remarks are required for rejection')
    }

    const expectedStatus = getExpectedStatusForAction(action)
    const requiredRole = expectedStatus === 'PENDING_MM' ? 'FTE_MM' : 'FTE_OPS'
    const user = requireUser(request, [requiredRole])
    if (isAuthError(user)) return user

    if (backlogs !== undefined && (!Number.isInteger(Number(backlogs)) || Number(backlogs) < 0)) {
      return validationError('Backlogs must be a non-negative whole number')
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
    return handleApiError(error, 'Failed to update request')
  }
}
