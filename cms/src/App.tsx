import React from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuthStore } from './store'
import { api } from './api'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CreatePermitPage from './pages/CreatePermitPage'
import PermitDetailPage from './components/permits/PermitDetail'
import {
  ShieldCheck,
  LayoutDashboard,
  PlusCircle,
  Clock,
  LogOut,
  User,
  ChevronDown,
  Layers,
  Sparkles
} from 'lucide-react'

const DEMO_ROLES = [
  { label: 'Requester', email: 'requester@opmaint.com', role: 'REQUESTER' },
  { label: 'Area Owner', email: 'area.owner@opmaint.com', role: 'AREA_OWNER' },
  { label: 'Safety Officer', email: 'safety.officer@opmaint.com', role: 'SAFETY_OFFICER' },
  { label: 'Admin', email: 'admin@opmaint.com', role: 'ADMIN' },
]

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()
  const location = useLocation()

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  const handleSwitchUser = async (targetEmail: string) => {
    try {
      const res = await api.post('/auth/login', {
        email: targetEmail,
        password: 'Opmaint@123',
      })
      const { token: newToken, user: newUser } = res.data
      setAuth(newToken, newUser)
      window.location.reload()
    } catch (err) {
      console.error('Failed to switch user:', err)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Header Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo & Navigation */}
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="flex items-center gap-2.5 group">
              <div className="bg-brand-600 p-2 rounded-xl text-white group-hover:bg-brand-500 transition-colors shadow-md shadow-brand-600/30">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <span className="font-bold text-lg tracking-tight text-white">OpMaint PTW</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <Link
                to="/dashboard"
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/dashboard' || location.pathname === '/'
                    ? 'bg-slate-800 text-brand-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Link>

              <Link
                to="/permits/new"
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/permits/new'
                    ? 'bg-slate-800 text-brand-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                New Permit
              </Link>
            </nav>
          </div>

          {/* User & Role Switcher */}
          <div className="flex items-center gap-3">
            {/* Quick Demo Switcher */}
            <div className="relative group">
              <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 rounded-lg text-xs text-slate-300 transition-colors">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Role:</span>
                <span className="font-semibold text-white">{user.role}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              <div className="absolute right-0 top-full mt-1 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-2 hidden group-hover:block z-50">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700/60">
                  Switch Active Role (Demo)
                </div>
                {DEMO_ROLES.map((r) => (
                  <button
                    key={r.email}
                    onClick={() => handleSwitchUser(r.email)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-700/60 transition-colors ${
                      user.role === r.role ? 'text-brand-400 font-bold bg-slate-700/40' : 'text-slate-300'
                    }`}
                  >
                    <span>{r.label}</span>
                    <span className="text-[10px] opacity-60 uppercase">{r.role}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Current User Badge */}
            <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700/80 text-xs">
              <User className="w-3.5 h-3.5 text-brand-400" />
              <span className="font-medium text-slate-200 hidden sm:inline">{user.name}</span>
            </div>

            {/* Logout Button */}
            <button
              onClick={() => {
                logout()
                navigate('/login')
              }}
              title="Logout"
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8">
        {children}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <ProtectedLayout>
            <DashboardPage />
          </ProtectedLayout>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedLayout>
            <DashboardPage />
          </ProtectedLayout>
        }
      />

      <Route
        path="/permits/new"
        element={
          <ProtectedLayout>
            <CreatePermitPage />
          </ProtectedLayout>
        }
      />

      <Route
        path="/permits/:id"
        element={
          <ProtectedLayout>
            <PermitDetailPage />
          </ProtectedLayout>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
