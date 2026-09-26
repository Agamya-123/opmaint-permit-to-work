export type Role = 'REQUESTER' | 'TECHNICIAN' | 'CONTRACTOR' | 'AREA_OWNER' | 'SAFETY_OFFICER' | 'ADMIN'

export type ApprovalRole = 'AREA_OWNER' | 'SAFETY_OFFICER'

export type ApprovalDecision = 'PENDING' | 'APPROVED' | 'REJECTED'

export type PermitType = 'HOT_WORK' | 'CONFINED_SPACE' | 'WORKING_AT_HEIGHT' | 'ELECTRICAL_LOTO'

export type PermitStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'CLOSED'
  | 'CLOSED_VERIFIED'
  | 'CANCELLED'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  department?: string
}

export interface Plant {
  id: string
  name: string
  code: string
}

export interface Area {
  id: string
  name: string
  code: string
  plantId: string
  plant?: Plant
}

export interface Equipment {
  id: string
  name: string
  tag: string
  criticality?: string
}

export interface PermitApproval {
  id: string
  permitId: string
  role: ApprovalRole
  decision: ApprovalDecision
  approverId?: string | null
  approver?: {
    id: string
    name: string
    email: string
    role?: Role
  } | null
  comment?: string | null
  decidedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface AuditLog {
  id: string
  permitId: string
  actorId?: string | null
  actor?: {
    id: string
    name: string
    email: string
    role?: Role
  } | null
  event: string
  fromStatus?: PermitStatus | null
  toStatus?: PermitStatus | null
  reason?: string | null
  metadata?: Record<string, any>
  createdAt: string
}

export interface Permit {
  id: string
  permitNumber: string
  type: PermitType
  status: PermitStatus
  requesterId: string
  requester: {
    id: string
    name: string
    email: string
    role?: Role
    department?: string
  }
  contractorTeam?: string | null
  workDescription: string
  plantId: string
  areaId: string
  area: Area
  equipmentId?: string | null
  equipment?: Equipment | null
  plannedStart: string
  plannedEnd: string
  hazards: string[]
  ppe: string[]
  precautions: Array<{ label: string; checked: boolean }>
  typeData: Record<string, any>
  activatedAt?: string | null
  closedAt?: string | null
  closureNotes?: string | null
  verifiedAt?: string | null
  createdAt: string
  updatedAt: string
  approvals: PermitApproval[]
  auditLogs?: AuditLog[]
}

export interface ReadinessCheck {
  isReady: boolean
  canActivate: boolean
  reason?: string
  allApprovalsGranted: boolean
  now: string
}
