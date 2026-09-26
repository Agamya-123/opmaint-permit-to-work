import { create } from 'zustand'
import { User } from './types'

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  logout: () => void
}

const savedToken = localStorage.getItem('ptw_token')
const savedUser = localStorage.getItem('ptw_user')

export const useAuthStore = create<AuthState>((set) => ({
  token: savedToken,
  user: savedUser ? JSON.parse(savedUser) : null,
  setAuth: (token: string, user: User) => {
    localStorage.setItem('ptw_token', token)
    localStorage.setItem('ptw_user', JSON.stringify(user))
    set({ token, user })
  },
  logout: () => {
    localStorage.removeItem('ptw_token')
    localStorage.removeItem('ptw_user')
    set({ token: null, user: null })
  },
}))
