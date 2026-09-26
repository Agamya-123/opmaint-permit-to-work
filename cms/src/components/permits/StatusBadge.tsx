import { PermitStatus } from '../../types'

const STATUS_CONFIG: Record<PermitStatus, { label: string; bg: string; icon: string }> = {
  DRAFT: { label: 'Draft', bg: 'bg-gray-100 text-gray-700 border-gray-300', icon: '📝' },
  PENDING_APPROVAL: { label: 'Pending Approval', bg: 'bg-amber-50 text-amber-800 border-amber-300', icon: '⏳' },
  APPROVED: { label: 'Approved', bg: 'bg-blue-50 text-blue-800 border-blue-300', icon: '✅' },
  ACTIVE: { label: 'Active', bg: 'bg-emerald-100 text-emerald-800 border-emerald-400 font-bold animate-pulse-slow', icon: '⚡' },
  SUSPENDED: { label: 'Suspended', bg: 'bg-orange-100 text-orange-800 border-orange-400', icon: '⚠️' },
  EXPIRED: { label: 'Expired', bg: 'bg-red-100 text-red-800 border-red-300', icon: '🚨' },
  REJECTED: { label: 'Rejected', bg: 'bg-rose-100 text-rose-800 border-rose-300', icon: '❌' },
  CLOSED: { label: 'Closed', bg: 'bg-indigo-50 text-indigo-800 border-indigo-300', icon: '🔒' },
  CLOSED_VERIFIED: { label: 'Closure Verified', bg: 'bg-purple-100 text-purple-900 border-purple-300', icon: '🛡️' },
  CANCELLED: { label: 'Cancelled', bg: 'bg-slate-200 text-slate-700 border-slate-400', icon: '🚫' },
}

export function StatusBadge({ status, size = 'md' }: { status: PermitStatus; size?: 'sm' | 'md' | 'lg' }) {
  const config = STATUS_CONFIG[status] || { label: status, bg: 'bg-gray-100 text-gray-800 border-gray-300', icon: '•' }
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs font-semibold',
    lg: 'px-3.5 py-1.5 text-sm font-bold',
  }[size]

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${config.bg} ${sizeClasses}`}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  )
}
