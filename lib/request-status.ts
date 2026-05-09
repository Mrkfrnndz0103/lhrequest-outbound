import type { RequestStatus } from './types'

export type RequestAction = 'approve' | 'reject_ops' | 'edit' | 'assign' | 'reject_mm'
export const REQUEST_STATUSES: RequestStatus[] = [
  'PENDING_OPS',
  'APPROVED',
  'REJECTED_OPS',
  'PENDING_MM',
  'CONFIRMED',
  'REJECTED_MM',
]

export function isRequestAction(action: unknown): action is RequestAction {
  return (
    action === 'approve' ||
    action === 'reject_ops' ||
    action === 'edit' ||
    action === 'assign' ||
    action === 'reject_mm'
  )
}

export function isRequestStatus(status: unknown): status is RequestStatus {
  return typeof status === 'string' && REQUEST_STATUSES.includes(status as RequestStatus)
}

export function getExpectedStatusForAction(action: RequestAction): RequestStatus {
  switch (action) {
    case 'approve':
    case 'reject_ops':
    case 'edit':
      return 'PENDING_OPS'
    case 'assign':
    case 'reject_mm':
      return 'PENDING_MM'
  }
}

export function getNextStatusForAction(action: RequestAction): RequestStatus {
  switch (action) {
    case 'approve':
      return 'PENDING_MM'
    case 'reject_ops':
      return 'REJECTED_OPS'
    case 'edit':
      return 'PENDING_OPS'
    case 'assign':
      return 'CONFIRMED'
    case 'reject_mm':
      return 'REJECTED_MM'
  }
}
