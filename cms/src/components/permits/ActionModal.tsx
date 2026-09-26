import { useState } from 'react'

interface ActionModalProps {
  isOpen: boolean
  title: string
  actionName: string
  requireReason?: boolean
  reasonLabel?: string
  isWorkLog?: boolean
  onClose: () => void
  onSubmit: (data: { reason?: string; notes?: string; hoursLogged?: number }) => Promise<void>
}

export function ActionModal({
  isOpen,
  title,
  actionName,
  requireReason = true,
  reasonLabel = 'Reason / Comments',
  isWorkLog = false,
  onClose,
  onSubmit,
}: ActionModalProps) {
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [hoursLogged, setHoursLogged] = useState<number | string>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (isWorkLog) {
      if (!notes.trim()) {
        setError('Work progress notes are required.')
        return
      }
    } else if (requireReason && !reason.trim()) {
      setError(`${reasonLabel} is required to complete this action.`)
      return
    }

    try {
      setLoading(true)
      if (isWorkLog) {
        await onSubmit({ notes, hoursLogged: Number(hoursLogged) || 0 })
      } else {
        await onSubmit({ reason })
      }
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-gray-200">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 font-bold text-lg"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {isWorkLog ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Progress Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe the work completed or current status..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hours Logged
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={hoursLogged}
                  onChange={(e) => setHoursLogged(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {reasonLabel} {requireReason && <span className="text-red-500">*</span>}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Provide justification or detailed comment..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                required={requireReason}
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Processing...' : actionName}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
