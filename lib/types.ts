export type UserRole = 'OPS_PIC' | 'FTE_OPS' | 'FTE_MM'

export type RequestStatus = 
  | 'PENDING_OPS' 
  | 'APPROVED' 
  | 'REJECTED_OPS' 
  | 'PENDING_MM' 
  | 'CONFIRMED' 
  | 'REJECTED_MM'

export type LHType = '6W' | '10W' | '6WF' | '4WCV'

export interface User {
  name: string
  opsId: string | null
  email: string | null
  role: UserRole
}

export interface Cluster {
  name: string
  region: string
  hubName?: string
  cluster?: string
  dockNumber?: string
  backlogs?: number
  backlogsTs?: string
  columnD?: string
  columnE?: string
  columnF?: string
}

export interface LineHaulRequest {
  id: string
  requestTime: string
  hubCluster: string
  region: string
  dockNumber: string
  backlogs: number
  lhType: LHType
  opsPicName: string
  opsPicId: string
  status: RequestStatus
  fteOpsName?: string
  fteOpsTimestamp?: string
  fteOpsRemarks?: string
  plateNumber?: string
  fteMmName?: string
  fteMmTimestamp?: string
  fteMmRemarks?: string
  lhTrip?: string
  isDocked?: boolean
}

export interface CreateRequestPayload {
  hubCluster: string
  region: string
  dockNumber: string
  backlogs: number
  lhType: LHType
  opsPicName: string
  opsPicId: string
}

export interface UpdateRequestPayload {
  action: 'approve' | 'reject_ops' | 'edit' | 'assign' | 'reject_mm'
  userName: string
  remarks?: string
  plateNumber?: string
  lhTrip?: string
  // For edit action
  hubCluster?: string
  region?: string
  dockNumber?: string
  backlogs?: number
  lhType?: LHType
}

export interface PendingCount {
  pendingOps: number
  pendingMm: number
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
}
