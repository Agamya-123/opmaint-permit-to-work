import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { useAuthStore } from '../store'
import { Permit, PermitStatus, PermitType, Area, Plant } from '../types'
import { StatusBadge } from '../components/permits'
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Shield,
  Layers,
  Search,
  Filter,
  Plus,
  ChevronRight,
  UserCheck,
  Building2,
  MapPin,
  RefreshCw,
  LogOut
} from 'lucide-react'
import { format, differenceInSeconds, parseISO } from 'date-fns'

const PERMIT_TYPES: { key: PermitType; label: string; color: string }[] = [
  { key: 'HOT_WORK', label: 'Hot Work', color: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  { key: 'CONFINED_SPACE', label: 'Confined Space', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  { key: 'WORKING_AT_HEIGHT', label: 'Working at Height', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { key: 'ELECTRICAL_LOTO', label: 'Electrical LOTO', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
]

function CountdownBadge({ targetDate }: { targetDate: string }) {
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    differenceInSeconds(parseISO(targetDate), new Date())
  )

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = differenceInSeconds(parseISO(targetDate), new Date())
      setSecondsLeft(diff)
    }, 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  if (secondsLeft <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/30">
        <Clock className="w-3 h-3 animate-pulse" /> Expired
      </span>
    )
  }

  const hours = Math.floor(secondsLeft / 3600)
  const mins = Math.floor((secondsLeft % 3600) / 60)
  const secs = secondsLeft % 60

  const isUrgent = secondsLeft <= 7200 // <= 2 hours

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-mono font-semibold px-2 py-0.5 rounded border ${
        isUrgent
          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      }`}
    >
      <Clock className="w-3 h-3" />
      {hours > 0 ? `${hours}h ${mins}m` : `${mins}m ${secs}s`}
    </span>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [areaFilter, setAreaFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [pendingMyApprovalOnly, setPendingMyApprovalOnly] = useState<boolean>(false)
  const [expiringSoonOnly, setExpiringSoonOnly] = useState<boolean>(false)

  // Fetch Master Data (Plants & Areas)
  const { data: masterData } = useQuery<{ plants: Plant[]; areas: Area[] }>({
    queryKey: ['masterData'],
    queryFn: async () => {
      const [plantsRes, areasRes] = await Promise.all([
        api.get('/master-data/plants'),
        api.get('/master-data/areas'),
      ])
      return { plants: plantsRes.data, areas: areasRes.data }
    },
  })

  // Fetch Permits
  const {
    data: permitsResponse,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<{ data: Permit[]; total: number }>({
    queryKey: [
      'permits',
      statusFilter,
      typeFilter,
      areaFilter,
      pendingMyApprovalOnly,
      expiringSoonOnly,
    ],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '100' }
      if (statusFilter) params.status = statusFilter
      if (typeFilter) params.type = typeFilter
      if (areaFilter) params.areaId = areaFilter
      if (pendingMyApprovalOnly) params.pendingMyApproval = 'true'
      if (expiringSoonOnly) params.expiringSoon = 'true'

      const res = await api.get('/permits', { params })
      return res.data
    },
  })

  const permits = permitsResponse?.data || []

  // Client side filtering for searchQuery
  const filteredPermits = permits.filter((p) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      p.permitNumber.toLowerCase().includes(q) ||
      p.workDescription.toLowerCase().includes(q) ||
      p.requester?.name.toLowerCase().includes(q) ||
      p.area?.name.toLowerCase().includes(q)
    )
  })

  // Metrics computation
  const activePermitsCount = permits.filter((p) => p.status === 'ACTIVE').length
  const pendingApprovalCount = permits.filter((p) => p.status === 'PENDING_APPROVAL').length
  const approvedCount = permits.filter((p) => p.status === 'APPROVED').length
  const expiringSoonCount = permits.filter((p) => {
    if (p.status !== 'ACTIVE' && p.status !== 'APPROVED') return false
    const diff = differenceInSeconds(parseISO(p.plannedEnd), new Date())
    return diff > 0 && diff <= 7200 // 2 hours
  }).length

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-800/80 p-6 rounded-2xl border border-slate-700/80 backdrop-blur-sm">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Shield className="w-7 h-7 text-brand-500" />
            Permit-to-Work Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time industrial permit monitoring, risk compliance, and approval workflows.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700/60 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-600/80 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin text-brand-400' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => navigate('/permits/new')}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-brand-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Create Permit
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => { setStatusFilter('ACTIVE'); setPendingMyApprovalOnly(false); setExpiringSoonOnly(false); }}
          className="cursor-pointer bg-slate-800/60 hover:bg-slate-800 p-5 rounded-xl border border-slate-700/80 transition-all hover:border-emerald-500/50 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Permits</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg group-hover:scale-110 transition-transform">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{activePermitsCount}</span>
            <span className="text-xs text-emerald-400 font-medium">In Progress</span>
          </div>
        </div>

        <div
          onClick={() => { setStatusFilter('PENDING_APPROVAL'); setPendingMyApprovalOnly(false); setExpiringSoonOnly(false); }}
          className="cursor-pointer bg-slate-800/60 hover:bg-slate-800 p-5 rounded-xl border border-slate-700/80 transition-all hover:border-amber-500/50 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending Approvals</span>
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg group-hover:scale-110 transition-transform">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{pendingApprovalCount}</span>
            <span className="text-xs text-amber-400 font-medium">Needs Review</span>
          </div>
        </div>

        <div
          onClick={() => { setExpiringSoonOnly(true); setStatusFilter(''); setPendingMyApprovalOnly(false); }}
          className="cursor-pointer bg-slate-800/60 hover:bg-slate-800 p-5 rounded-xl border border-slate-700/80 transition-all hover:border-rose-500/50 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Expiring Soon (&lt;2h)</span>
            <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg group-hover:scale-110 transition-transform">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{expiringSoonCount}</span>
            <span className="text-xs text-rose-400 font-medium">Urgent Action</span>
          </div>
        </div>

        <div
          onClick={() => { setStatusFilter('APPROVED'); setPendingMyApprovalOnly(false); setExpiringSoonOnly(false); }}
          className="cursor-pointer bg-slate-800/60 hover:bg-slate-800 p-5 rounded-xl border border-slate-700/80 transition-all hover:border-blue-500/50 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Approved (Ready)</span>
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg group-hover:scale-110 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{approvedCount}</span>
            <span className="text-xs text-blue-400 font-medium">Ready to Activate</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/80 space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Permit #, description, requester or area..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full md:w-44 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="EXPIRED">Expired</option>
            <option value="REJECTED">Rejected</option>
            <option value="CLOSED">Closed</option>
            <option value="CLOSED_VERIFIED">Closed & Verified</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full md:w-44 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All Types</option>
            <option value="HOT_WORK">Hot Work</option>
            <option value="CONFINED_SPACE">Confined Space</option>
            <option value="WORKING_AT_HEIGHT">Working at Height</option>
            <option value="ELECTRICAL_LOTO">Electrical LOTO</option>
          </select>

          {/* Area Filter */}
          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="w-full md:w-44 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All Areas</option>
            {masterData?.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Checkbox Quick Filters */}
        <div className="flex flex-wrap items-center gap-6 pt-1 text-xs font-medium text-slate-300">
          <label className="flex items-center gap-2 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={pendingMyApprovalOnly}
              onChange={(e) => setPendingMyApprovalOnly(e.target.checked)}
              className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-brand-600 focus:ring-brand-500"
            />
            <span>Pending My Approval</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={expiringSoonOnly}
              onChange={(e) => setExpiringSoonOnly(e.target.checked)}
              className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-amber-400">Expiring Within 2 Hours</span>
          </label>

          {(statusFilter || typeFilter || areaFilter || searchQuery || pendingMyApprovalOnly || expiringSoonOnly) && (
            <button
              onClick={() => {
                setStatusFilter('')
                setTypeFilter('')
                setAreaFilter('')
                setSearchQuery('')
                setPendingMyApprovalOnly(false)
                setExpiringSoonOnly(false)
              }}
              className="text-brand-400 hover:text-brand-300 underline ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Permits List */}
      <div className="bg-slate-800/80 rounded-2xl border border-slate-700/80 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-700/80 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-brand-400" />
            Permits ({filteredPermits.length})
          </h2>
          <span className="text-xs text-slate-400">Showing all matching records</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            <p>Loading permits...</p>
          </div>
        ) : filteredPermits.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileText className="w-12 h-12 mx-auto text-slate-600 mb-3" />
            <p className="text-base font-medium text-slate-300">No permits found</p>
            <p className="text-sm mt-1">Try adjusting your search query or filter settings.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/60">
            {filteredPermits.map((permit) => {
              const typeConfig = PERMIT_TYPES.find((t) => t.key === permit.type)
              return (
                <div
                  key={permit.id}
                  onClick={() => navigate(`/permits/${permit.id}`)}
                  className="p-4 hover:bg-slate-700/40 cursor-pointer transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-slate-100 group-hover:text-brand-400 transition-colors">
                        {permit.permitNumber}
                      </span>

                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                          typeConfig?.color || 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {typeConfig?.label || permit.type}
                      </span>

                      <StatusBadge status={permit.status} />

                      {['ACTIVE', 'APPROVED'].includes(permit.status) && (
                        <CountdownBadge targetDate={permit.plannedEnd} />
                      )}
                    </div>

                    <p className="text-sm font-medium text-slate-200 line-clamp-1">
                      {permit.workDescription}
                    </p>

                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        {permit.area?.name || 'Area'} ({permit.area?.plant?.code || 'Plant'})
                      </span>
                      <span className="flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                        Req: {permit.requester?.name || 'Requester'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        Window: {format(parseISO(permit.plannedStart), 'MMM d, HH:mm')} -{' '}
                        {format(parseISO(permit.plannedEnd), 'HH:mm')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/permits/${permit.id}`)
                      }}
                      className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-slate-700 group-hover:bg-brand-600 text-slate-200 group-hover:text-white rounded-lg transition-colors"
                    >
                      View Details
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
