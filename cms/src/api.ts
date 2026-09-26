import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Attach authorization token from localStorage if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ptw_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token on 401
      localStorage.removeItem('ptw_token')
      localStorage.removeItem('ptw_user')
    }
    return Promise.reject(error)
  }
)
