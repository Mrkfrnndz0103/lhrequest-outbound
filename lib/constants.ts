import type { LHType, RequestStatus } from './types'

export const LH_TYPES: LHType[] = ['6W', '10W', '6WF', '4WCV']

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING_OPS: 'Pending',
  APPROVED: 'Requested',
  REJECTED_OPS: 'Rejected by FTE Ops',
  PENDING_MM: 'Requested',
  CONFIRMED: 'For Docking',
  REJECTED_MM: 'Rejected by MM',
}

export const REQUEST_STATUS_COLORS: Record<RequestStatus, string> = {
  PENDING_OPS: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  APPROVED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  REJECTED_OPS: 'bg-red-500/20 text-red-400 border-red-500/30',
  PENDING_MM: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  CONFIRMED: 'bg-green-500/20 text-green-400 border-green-500/30',
  REJECTED_MM: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export const POLLING_INTERVAL = 3000 // 3 seconds base interval
export const POLLING_INTERVAL_MIN = 3000 // 3 seconds minimum
export const POLLING_INTERVAL_MAX = 30000 // 30 seconds maximum (backoff cap)
export const POLLING_BACKOFF_MULTIPLIER = 1.5 // Increase interval by 50% when no changes
export const REALTIME_SAFETY_REFRESH_INTERVAL = 60000 // 60 seconds when realtime is healthy

export const LOGIN_DELAY = 5000 // 5 seconds before login modal appears
