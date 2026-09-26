import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'
import { api } from '../api'
import { ShieldCheck, LogIn, UserCheck, AlertCircle } from 'lucide-react'

const DEMO_USERS = [
  { label: 'Requester', email: 'requester@opmaint.com', role: 'REQUESTER', desc: 'Can create and submit permits' },
  { label: 'Area Owner', email: 'area.owner@opmaint.com', role: 'AREA_OWNER', desc: 'Approves permits for assigned areas' },
  { label: 'Safety Officer', email: 'safety.officer@opmaint.com', role: 'SAFETY_OFFICER', desc: 'Safety review & verifies closures' },
  { label: 'Admin', email: 'admin@opmaint.com', role: 'ADMIN', desc: 'Full administrative access' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (loginEmail: string, loginPass: string) => {
    setError(null)
    setLoading(true)
    try {
      const res = await api.post('/auth/login', {
        email: loginEmail,
        password: loginPass,
      })
      const { token, user } = res.data
      setAuth(token, user)
      navigate('/dashboard')
    } catch (err: any) {
      console.error('Login error:', err)
      setError(err.response?.data?.message || 'Login failed. Please check credentials.')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleLogin(email, password)
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center gap-3">
          <div className="bg-brand-500 p-3 rounded-xl text-white shadow-lg shadow-brand-500/30">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-white">OpMaint PTW</span>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-100">
          Sign in to Permit-to-Work
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          Industrial Safety & Permit Management System
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-800 py-8 px-4 shadow-xl rounded-xl sm:px-10 border border-slate-700">
          {error && (
            <div className="mb-4 p-3 bg-red-900/40 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-200 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-6" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-300">Email address</label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@opmaint.com"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300">Password</label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-slate-800 text-slate-400 font-medium">Quick Demo Login</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {DEMO_USERS.map((user) => (
                <button
                  key={user.email}
                  onClick={() => handleLogin(user.email, 'Opmaint@123')}
                  disabled={loading}
                  className="flex flex-col text-left p-2.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-700/80 rounded-lg hover:border-brand-500/50 transition-all group"
                >
                  <div className="flex items-center gap-1.5 font-medium text-xs text-brand-400 group-hover:text-brand-300">
                    <UserCheck className="w-3.5 h-3.5" />
                    {user.label}
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 line-clamp-1">{user.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
