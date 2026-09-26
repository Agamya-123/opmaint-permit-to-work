import { AuditLog } from '../../types'
import { StatusBadge } from './StatusBadge'
import { format } from 'date-fns'

const EVENT_LABELS: Record<string, { title: string; color: string; icon: string }> = {
  CREATED: { title: 'Permit Draft Created', color: 'bg-gray-400', icon: '📝' },
  UPDATED: { title: 'Permit Details Updated', color: 'bg-blue-400', icon: '✏️' },
  SUBMITTED: { title: 'Submitted for Dual Approval', color: 'bg-amber-500', icon: '📤' },
  APPROVED: { title: 'Permit Approved', color: 'bg-blue-600', icon: '👍' },
  REJECTED: { title: 'Permit Rejected', color: 'bg-rose-600', icon: '👎' },
  ACTIVATED: { title: 'Permit Activated (Work Started)', color: 'bg-emerald-600', icon: '⚡' },
  SUSPENDED: { title: 'Work Suspended', color: 'bg-orange-500', icon: '⚠️' },
  RESUMED: { title: 'Work Resumed', color: 'bg-emerald-500', icon: '▶️' },
  CLOSED: { title: 'Permit Closed by Requester', color: 'bg-indigo-600', icon: '🏁' },
  CLOSURE_VERIFIED: { title: 'Closure Verified by Safety Officer', color: 'bg-purple-600', icon: '🛡️' },
  CANCELLED: { title: 'Permit Cancelled', color: 'bg-slate-500', icon: '🚫' },
  EXPIRED: { title: 'Permit Expired Automatically', color: 'bg-red-500', icon: '⏰' },
  WORK_LOGGED: { title: 'Work Progress Logged', color: 'bg-teal-500', icon: '📋' },
}

export function AuditTimeline({ auditLogs }: { auditLogs?: AuditLog[] }) {
  if (!auditLogs || auditLogs.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500 text-sm">
        No audit entries recorded yet.
      </div>
    )
  }

  return (
    <div className="flow-root">
      <ul role="list" className="-mb-8">
        {auditLogs.map((log, index) => {
          const isLast = index === auditLogs.length - 1
          const eventMeta = EVENT_LABELS[log.event] || {
            title: log.event.replace(/_/g, ' '),
            color: 'bg-gray-400',
            icon: '📌',
          }

          const formattedTime = log.createdAt
            ? format(new Date(log.createdAt), 'MMM d, yyyy HH:mm:ss')
            : 'Unknown time'

          return (
            <li key={log.id || index}>
              <div className="relative pb-8">
                {!isLast && (
                  <span
                    className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                    aria-hidden="true"
                  />
                )}
                <div className="relative flex items-start space-x-3">
                  {/* Event Node Icon */}
                  <div>
                    <span
                      className={`h-8 w-8 rounded-full ${eventMeta.color} flex items-center justify-center text-white text-xs ring-4 ring-white shadow-sm`}
                    >
                      {eventMeta.icon}
                    </span>
                  </div>

                  {/* Event Details */}
                  <div className="min-w-0 flex-1 bg-gray-50 border border-gray-100 rounded-lg p-3.5 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <span>{eventMeta.title}</span>
                        {log.actor && (
                          <span className="text-xs font-normal text-gray-500 bg-gray-200/60 px-2 py-0.5 rounded">
                            by {log.actor.name} ({log.actor.role || 'User'})
                          </span>
                        )}
                      </div>
                      <time className="text-xs text-gray-400 font-mono">
                        {formattedTime}
                      </time>
                    </div>

                    {/* From / To status badges */}
                    {(log.fromStatus || log.toStatus) && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                        <span className="font-medium">Status Change:</span>
                        {log.fromStatus ? (
                          <StatusBadge status={log.fromStatus} size="sm" />
                        ) : (
                          <span className="text-gray-400 italic">None</span>
                        )}
                        <span>→</span>
                        {log.toStatus ? (
                          <StatusBadge status={log.toStatus} size="sm" />
                        ) : (
                          <span className="text-gray-400 italic">None</span>
                        )}
                      </div>
                    )}

                    {/* Comment / Reason */}
                    {log.reason && (
                      <div className="mt-2 text-xs text-gray-700 bg-white border border-gray-200 rounded p-2 italic">
                        <span className="font-semibold not-italic text-gray-900 mr-1">
                          Comment/Reason:
                        </span>
                        "{log.reason}"
                      </div>
                    )}

                    {/* Human readable metadata formatting (e.g. Work logged notes, hours, approval role) */}
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div className="mt-2 text-xs text-gray-600 bg-white border border-gray-100 rounded p-2">
                        {log.metadata.notes && (
                          <div>
                            <span className="font-semibold text-gray-800">Notes: </span>
                            {log.metadata.notes}
                          </div>
                        )}
                        {log.metadata.hours !== undefined && log.metadata.hours !== null && (
                          <div>
                            <span className="font-semibold text-gray-800">Hours Logged: </span>
                            {log.metadata.hours} hr(s)
                          </div>
                        )}
                        {log.metadata.role && (
                          <div>
                            <span className="font-semibold text-gray-800">Approval Slot: </span>
                            {log.metadata.role.replace(/_/g, ' ')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
