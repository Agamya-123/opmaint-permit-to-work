import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import { useAuthStore } from '../../store'
import { StatusBadge, AuditTimeline, ApprovalTrailCard, TypeDataCard, ActionModal } from '.'
import { Permit, PermitStatus, ReadinessCheck, User } from '../../types'
import { format, differenceInSeconds } from 'date-fns'

const PERMIT_TYPE_LABELS: Record<string, string> = {
  HOT_WORK: 'Hot Work',
  CONFINED_SPACE: 'Confined Space',
  WORKING_AT_HEIGHT: 'Working at Height',
  ELECTRICAL_LOTO: 'Electrical LOTO',
}

const HAZARD_LABELS: Record<string, string> = {
  SPARKS: 'Sparks / Fire Risk',
  HIGH_HEAT: 'High Heat',
  CHEMICAL: 'Chemical Exposure',
  DUST: 'Dust / Airborne Particles',
  NOISE: 'High Noise',
  FALL_RISK: 'Fall Risk',
  CRUSHING: 'Crushing / Pinching',
  ELECTRICAL: 'Electrical Hazard',
  CONFINED_SPACE: 'Confined Space',
  GRINDING: 'Grinding',
  CUTTING: 'Cutting',
  PRESSURIZED: 'Pressurized System',
  TOXIC: 'Toxic Substances',
  ASBESTOS: 'Asbestos',
  HEIGHT: 'Working at Height',
}

const PPE_LABELS: Record<string, string> = {
  SAFETY_GLASSES: 'Safety Glasses',
  SAFETY_HELMET: 'Safety Helmet',
  SAFETY_GLOVES: 'Safety Gloves',
  SAFETY_BOOTS: 'Safety Boots',
  FIRE_SUIT: 'Fire Resistant Suit',
  HEAR_PROTECTION: 'Hearing Protection',
  FALL_ARREST: 'Fall Arrest Harness',
  GAS_DETECTOR: 'Gas Detector',
  CONFINEMENT_BREATHING: 'Self-Contained Breathing Apparatus',
  VOLTAGE_TESTER: 'Voltage Tester / Non-Contact Tester',
  INSULATED_TOOLS: 'Insulated Tools',
  SAFETY_FALL_ARREST: 'Fall Arrest System',
}

interface PermitAction {
  id: string
  label: string
  confirmLabel: string
  requireReason: boolean
  requireConfirmation?: boolean
  isWorkLog: boolean
}

// Compute available actions based on current user + permit state
function computeAvailableActions(
  permit: Permit,
  user: User | null,
): PermitAction[] {
  const actions: PermitAction[] = []
  const status: PermitStatus = permit.status
  const currentUserId = user?.id
  const currentUserRole = user?.role
  const isRequester = permit.requesterId === currentUserId

  const hasAreaOwnerApproved = permit.approvals.some((a) => a.role === 'AREA_OWNER' && a.decision === 'APPROVED')
  const hasSafetyApproved = permit.approvals.some((a) => a.role === 'SAFETY_OFFICER' && a.decision === 'APPROVED')

  // Check if current user owns this permit's area (if ownedAreas list is present)
  const isAreaOwnerForThisArea = currentUserRole === 'AREA_OWNER' && (
    !user?.ownedAreas || user.ownedAreas.length === 0 || user.ownedAreas.some((oa: { areaId: string }) => oa.areaId === permit.areaId)
  )

  if (status === 'DRAFT' && isRequester) {
    actions.push({ id: 'SUBMIT', label: 'Submit for Approval', confirmLabel: 'Submit', requireReason: false, requireConfirmation: false, isWorkLog: false })
  }

  if (status === 'PENDING_APPROVAL') {
    // Rule: Requester cannot approve their own permit!
    if (!isRequester) {
      if (currentUserRole === 'AREA_OWNER' && isAreaOwnerForThisArea && !hasAreaOwnerApproved) {
        actions.push({ id: 'APPROVE_AREA', label: 'Approve (Area Owner)', confirmLabel: 'Approve', requireReason: false, requireConfirmation: true, isWorkLog: false })
        actions.push({ id: 'REJECT_AREA', label: 'Reject', confirmLabel: 'Reject', requireReason: true, requireConfirmation: false, isWorkLog: false })
      }
      if (currentUserRole === 'SAFETY_OFFICER' && !hasSafetyApproved) {
        actions.push({ id: 'APPROVE_SAFETY', label: 'Approve (Safety Officer)', confirmLabel: 'Approve', requireReason: false, requireConfirmation: true, isWorkLog: false })
        actions.push({ id: 'REJECT_SAFETY', label: 'Reject', confirmLabel: 'Reject', requireReason: true, requireConfirmation: false, isWorkLog: false })
      }
      if (currentUserRole === 'ADMIN') {
        actions.push(
          { id: 'APPROVE_ADMIN', label: 'Approve (Admin Override)', confirmLabel: 'Approve', requireReason: false, requireConfirmation: true, isWorkLog: false },
          { id: 'REJECT_ADMIN', label: 'Reject (Admin Override)', confirmLabel: 'Reject', requireReason: true, requireConfirmation: false, isWorkLog: false }
        )
      }
    }
  }

  if (status === 'APPROVED' && (isRequester || currentUserRole === 'ADMIN')) {
    actions.push({ id: 'ACTIVATE', label: 'Activate Permit', confirmLabel: 'Activate', requireReason: false, requireConfirmation: false, isWorkLog: false })
  }

  if (status === 'ACTIVE' && (isRequester || currentUserRole === 'AREA_OWNER' || currentUserRole === 'ADMIN')) {
    actions.push({ id: 'SUSPEND', label: 'Suspend Work', confirmLabel: 'Suspend', requireReason: true, requireConfirmation: false, isWorkLog: false })
    actions.push({ id: 'CLOSE', label: 'Close Permit', confirmLabel: 'Close', requireReason: true, requireConfirmation: false, isWorkLog: false })
  }

  if (status === 'SUSPENDED' && (isRequester || currentUserRole === 'AREA_OWNER' || currentUserRole === 'ADMIN')) {
    actions.push({ id: 'RESUME', label: 'Resume Work', confirmLabel: 'Resume', requireReason: true, requireConfirmation: false, isWorkLog: false })
  }

  if (status === 'CLOSED' && currentUserRole === 'SAFETY_OFFICER' && !permit.verifiedAt) {
    actions.push({ id: 'VERIFY_CLOSURE', label: 'Verify Closure', confirmLabel: 'Verify Closure', requireReason: true, requireConfirmation: false, isWorkLog: false })
  }

  // Work logging available for ACTIVE permits (requester, technician, contractor, area owner, safety officer, admin)
  if (status === 'ACTIVE' && (isRequester || currentUserRole === 'TECHNICIAN' || currentUserRole === 'CONTRACTOR' || currentUserRole === 'AREA_OWNER' || currentUserRole === 'SAFETY_OFFICER' || currentUserRole === 'ADMIN')) {
    actions.push({ id: 'LOG_WORK', label: 'Log Work Progress', confirmLabel: 'Log Work', requireReason: false, requireConfirmation: false, isWorkLog: true })
  }

  // Cancellation available from non-terminal statuses
  if (!['CLOSED_VERIFIED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(status) && (isRequester || currentUserRole === 'ADMIN')) {
    actions.push({ id: 'CANCEL', label: 'Cancel Permit', confirmLabel: 'Cancel', requireReason: true, requireConfirmation: false, isWorkLog: false })
  }

  return actions
}

export default function PermitDetailPage() {
  const { id: permitId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore((state) => ({ user: state.user }))

  const [actionModal, setActionModal] = useState<{
    open: boolean
    actionId: string | null
  }>({ open: false, actionId: null })

  const {
    data: permit,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Permit>({
    queryKey: ['permit', permitId],
    queryFn: async () => {
      const res = await api.get(`/permits/${permitId}`)
      return res.data
    },
    enabled: !!permitId,
  })

  const actionMutation = useMutation({
    mutationFn: async ({ actionId, reason }: { actionId: string; reason?: string }) => {
      let action: string
      switch (actionId) {
        case 'SUBMIT': action = 'SUBMIT'; break
        case 'APPROVE_AREA': action = 'APPROVE'; break
        case 'APPROVE_SAFETY': action = 'APPROVE'; break
        case 'APPROVE_ADMIN': action = 'APPROVE'; break
        case 'REJECT_AREA': action = 'REJECT'; break
        case 'REJECT_SAFETY': action = 'REJECT'; break
        case 'REJECT_ADMIN': action = 'REJECT'; break
        case 'ACTIVATE': action = 'ACTIVATE'; break
        case 'SUSPEND': action = 'SUSPEND'; break
        case 'RESUME': action = 'RESUME'; break
        case 'CLOSE': action = 'CLOSE'; break
        case 'VERIFY_CLOSURE': action = 'VERIFY_CLOSURE'; break
        case 'CANCEL': action = 'CANCEL'; break
        default: throw new Error(`Unknown action: ${actionId}`)
      }

      const body: any = { action }
      if (reason) body.reason = reason
      const res = await api.post(`/permits/${permitId}/action`, body)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permit', permitId] })
    },
  })

  const workLogMutation = useMutation({
    mutationFn: async ({ notes, hours }: { notes: string; hours: number }) => {
      const res = await api.post(`/permits/${permitId}/work-logs`, { notes, hoursLogged: hours })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permit', permitId] })
    },
  })

  const timeRemaining = permit && ['ACTIVE', 'APPROVED', 'PENDING_APPROVAL', 'SUSPENDED'].includes(permit.status)
    ? differenceInSeconds(new Date(permit.plannedEnd), new Date())
    : null

  const isExpiringSoon = timeRemaining !== null && timeRemaining < 7200 && timeRemaining > 0 // within 2 hours

  const handleActionClick = (actionId: string) => {
    setActionModal({ open: true, actionId })
  }

  const closeActionModal = () => {
    setActionModal({ open: false, actionId: null })
  }

  const handleActionSubmit = async (data: { reason?: string; notes?: string; hoursLogged?: number }) => {
    if (!actionModal.actionId) return

    if (actionModal.actionId === 'LOG_WORK') {
      await workLogMutation.mutateAsync({ notes: data.notes || '', hours: data.hoursLogged || 0 })
    } else {
      await actionMutation.mutateAsync({ actionId: actionModal.actionId, reason: data.reason })
    }
    closeActionModal()
  }

  const getActionConfig = (actionId: string | null) => {
    switch (actionId) {
      case 'SUBMIT': return { title: 'Submit for Approval', actionName: 'Submit', requireReason: false, requireConfirmation: false }
      case 'APPROVE_AREA':
      case 'APPROVE_SAFETY':
      case 'APPROVE_ADMIN': return { title: 'Approve Permit', actionName: 'Approve', requireReason: false, requireConfirmation: true }
      case 'REJECT_AREA':
      case 'REJECT_SAFETY':
      case 'REJECT_ADMIN': return { title: 'Reject Permit', actionName: 'Reject', requireReason: true, requireConfirmation: false }
      case 'ACTIVATE': return { title: 'Activate Permit', actionName: 'Activate', requireReason: false, requireConfirmation: false }
      case 'SUSPEND': return { title: 'Suspend Permit', actionName: 'Suspend', requireReason: true, requireConfirmation: false }
      case 'RESUME': return { title: 'Resume Permit', actionName: 'Resume', requireReason: true, requireConfirmation: false }
      case 'CLOSE': return { title: 'Close Permit', actionName: 'Close Permit', requireReason: true, requireConfirmation: false }
      case 'VERIFY_CLOSURE': return { title: 'Verify Closure', actionName: 'Verify Closure', requireReason: true, requireConfirmation: false }
      case 'CANCEL': return { title: 'Cancel Permit', actionName: 'Cancel', requireReason: true, requireConfirmation: false }
      case 'LOG_WORK': return { title: 'Log Work Progress', actionName: 'Log Work', isWorkLog: true, requireReason: false, requireConfirmation: false }
      default: return { title: '', actionName: 'Submit', requireReason: false, requireConfirmation: false }
    }
  }

  if (isLoading) {
    return (
      <div className="p-8 animate-pulse">
        <div className="h-12 bg-gray-200 rounded w-3/4 mb-4"></div>
        <div className="space-y-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-6 bg-gray-200 rounded w-full"></div>
          ))}
        </div>
      </div>
    )
  }

  if (isError || !permit) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-500 mb-2">⚠️</div>
        <p className="text-gray-600">
          {isError ? (error as Error)?.message : 'Permit not found'}
        </p>
        <button
          onClick={() => navigate('/permits')}
          className="mt-4 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  const availableActions = computeAvailableActions(permit, user)
  const actionConfig = getActionConfig(actionModal.actionId)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Permit Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <span className="text-3xl">📋</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">
                {permit.permitNumber}
              </h1>
              <span className="text-sm text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded">
                {PERMIT_TYPE_LABELS[permit.type] || permit.type}
          </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">{permit.workDescription}</p>
          </div>
        </div>
        <StatusBadge status={permit.status} size="lg" />
      </div>

      {/* Expiring Soon Banner */}
      {isExpiringSoon && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 animate-pulse">
          <span className="text-2xl">🚨</span>
          <div>
            <span className="font-bold text-red-900">Permit Expiring Soon!</span>
            <span className="text-red-700 block text-sm mt-0.5">
              This {permit.type.replace('_', ' ').toLowerCase()} permit ends in{' '}
              {Math.floor(timeRemaining! / 60)} minutes. Take immediate action.
            </span>
          </div>
        </div>
      )}

      {/* Pending Approval Banner */}
      {permit.status === 'PENDING_APPROVAL' && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⏳</span>
            <div>
              <h3 className="font-bold text-amber-900">
                {availableActions.some((a) => a.id.startsWith('APPROVE'))
                  ? 'Your Review & Approval is Required'
                  : 'Permit is Awaiting Approval Decisions'}
              </h3>
              <p className="text-xs text-amber-800 mt-1">
                This permit requires dual sign-off from both the Area Owner and Safety Officer before work can be activated.
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs font-medium text-amber-900">
                <span className="flex items-center gap-1.5">
                  {permit.approvals.some((a) => a.role === 'AREA_OWNER' && a.decision === 'APPROVED') ? '✅' : '⏳'} Area Owner Sign-off
                </span>
                <span className="flex items-center gap-1.5">
                  {permit.approvals.some((a) => a.role === 'SAFETY_OFFICER' && a.decision === 'APPROVED') ? '✅' : '⏳'} Safety Officer Sign-off
                </span>
              </div>
            </div>
          </div>
          {availableActions.some((a) => a.id.startsWith('APPROVE')) && (
            <div className="flex items-center gap-2 shrink-0">
              {availableActions
                .filter((a) => a.id.startsWith('REJECT'))
                .map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleActionClick(action.id)}
                    className="px-3.5 py-2 text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                  >
                    Reject
                  </button>
                ))}
              {availableActions
                .filter((a) => a.id.startsWith('APPROVE'))
                .map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleActionClick(action.id)}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-xs transition-colors"
                  >
                    Approve Permit
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Key Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span>📍</span> Location & Equipment
          </h3>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-gray-500">Plant / Area</dt>
              <dd className="font-medium text-gray-900">{permit.area.plant?.name ?? '—'} / {permit.area.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Equipment</dt>
              <dd className="font-medium text-gray-900">{permit.equipment?.name ?? 'N/A'} ({permit.equipment?.tag ?? '—'})</dd>
            </div>
            <div>
              <dt className="text-gray-500">Contractor / Team</dt>
              <dd className="font-medium text-gray-900">{permit.contractorTeam || '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span>⏱️</span> Schedule
          </h3>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-gray-500">Planned Start</dt>
              <dd className="font-medium text-gray-900">{format(new Date(permit.plannedStart), 'PPpp')}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Planned End</dt>
              <dd className="font-medium text-gray-900">{format(new Date(permit.plannedEnd), 'PPpp')}</dd>
            </div>
            {permit.activatedAt && (
              <div>
                <dt className="text-gray-500">Activated At</dt>
                <dd className="font-medium text-gray-900">{format(new Date(permit.activatedAt), 'PPpp')}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Requester Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span>👤</span> Requester
        </h3>
        <p className="text-sm font-medium text-gray-900">{permit.requester.name}</p>
        <p className="text-xs text-gray-500">{permit.requester.email}</p>
      </div>

      {/* Type-Specific Details */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
          Type-Specific Information ({PERMIT_TYPE_LABELS[permit.type]})
        </h3>
        <TypeDataCard type={permit.type} typeData={permit.typeData} />
      </div>

      {/* Hazards & PPE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3 text-red-700">
            Hazards
          </h3>
          {permit.hazards.length ? (
            <ul className="flex flex-col gap-1.5">
              {permit.hazards.map((h, i) => (
                <li key={i} className="text-sm text-gray-800 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
                  🔥 {HAZARD_LABELS[h] ?? h}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400 italic">No hazards listed</p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3 text-blue-700">
            Required PPE
          </h3>
          {permit.ppe.length ? (
            <ul className="flex flex-col gap-1.5">
              {permit.ppe.map((p, i) => (
                <li key={i} className="text-sm text-gray-800 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                  🧤 {PPE_LABELS[p] ?? p}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400 italic">No PPE specified</p>
          )}
        </div>
      </div>

      {/* Precautions Checklist */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
          Precautions Checklist
        </h3>
        {permit.precautions.length ? (
          <ul className="space-y-2">
            {permit.precautions.map((pc, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className={pc.checked ? 'text-emerald-600 font-bold' : 'text-gray-400'}>
                  {pc.checked ? '✓' : '◦'}
                </span>
                <span className={pc.checked ? 'text-gray-800 line-through' : 'text-gray-500'}>
                  {pc.label}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-400 italic">No precautions defined</p>
        )}
      </div>

      {/* Approval Trail */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
          Approval Trail
        </h3>
        <ApprovalTrailCard approvals={permit.approvals} />
      </div>

      {/* Available Actions Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
          Available Actions
        </h3>
        {availableActions.length ? (
          <div className="flex flex-wrap gap-3">
            {availableActions.map((a) => (
              <button
                key={a.id}
                onClick={() => handleActionClick(a.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  a.id === 'SUBMIT' || a.id === 'ACTIVATE' || a.id.startsWith('APPROVE')
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : a.id === 'CLOSE'
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : a.id === 'CANCEL' || a.id.startsWith('REJECT')
                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                    : a.id === 'LOG_WORK'
                    ? 'bg-teal-600 text-white hover:bg-teal-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">
            No actions available for your role / permit status.
          </p>
        )}
      </div>

      {/* Audit Timeline */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
          Audit Timeline
        </h3>
        <AuditTimeline auditLogs={permit.auditLogs} />
      </div>

      {/* Action Modal */}
      <ActionModal
        isOpen={actionModal.open}
        title={actionConfig.title}
        actionName={actionConfig.actionName}
        requireReason={actionConfig.requireReason}
        reasonLabel={actionConfig.actionName === 'Verify Closure' ? 'Verification Notes' : 'Reason / Comments'}
        isWorkLog={actionConfig.isWorkLog ?? false}
        onClose={closeActionModal}
        onSubmit={handleActionSubmit}
      />
    </div>
  )
}
