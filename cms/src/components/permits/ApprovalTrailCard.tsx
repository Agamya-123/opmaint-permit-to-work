import { PermitApproval } from '../../types'
import { format } from 'date-fns'

export function ApprovalTrailCard({ approvals }: { approvals: PermitApproval[] }) {
  const roles = [
    { key: 'AREA_OWNER', label: 'Area Owner Approval', icon: '🏭' },
    { key: 'SAFETY_OFFICER', label: 'Safety Officer Approval', icon: '🎛️' },
  ] as const

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {roles.map(({ key, label, icon }) => {
        const approval = approvals.find((a) => a.role === key)
        const decision = approval?.decision || 'PENDING'
        const isApproved = decision === 'APPROVED'
        const isRejected = decision === 'REJECTED'

        const badgeColor = isApproved
          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
          : isRejected
          ? 'bg-rose-100 text-rose-800 border-rose-300'
          : 'bg-amber-100 text-amber-800 border-amber-300'

        return (
          <div
            key={key}
            className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <span>{icon}</span>
                  <span>{label}</span>
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeColor}`}>
                  {decision}
                </span>
              </div>

              {approval?.approver ? (
                <div className="text-xs text-gray-600 space-y-1 mt-2">
                  <div className="font-medium text-gray-900">{approval.approver.name}</div>
                  <div className="text-gray-500">{approval.approver.email}</div>
                  {approval.decidedAt && (
                    <div className="text-gray-400 font-mono text-[11px] mt-1">
                      {format(new Date(approval.decidedAt), 'MMM d, yyyy HH:mm')}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic mt-2">
                  Awaiting decision from assigned {key === 'AREA_OWNER' ? 'Area Owner' : 'Safety Officer'}
                </div>
              )}
            </div>

            {approval?.comment && (
              <div className="mt-3 pt-2.5 border-t border-gray-100 text-xs text-gray-700 bg-gray-50 rounded p-2 italic">
                "{approval.comment}"
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
