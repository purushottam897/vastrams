import axios from 'axios'
import { navigateToError } from './errorNavigation'

// Resolve production vs development API endpoint
export const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl && envUrl.trim() !== '' && envUrl.trim() !== '/api') {
    return envUrl.trim().replace(/\/+$/, '')
  }
  if (import.meta.env.PROD) {
    return 'https://vastrams.onrender.com/api'
  }
  return '/api'
}

export const API_BASE_URL = getApiBaseUrl()

// Token helpers for local storage
export const getAuthToken = () => {
  try {
    return localStorage.getItem('vastrams_access_token') || null
  } catch {
    return null
  }
}

export const getRefreshToken = () => {
  try {
    return localStorage.getItem('vastrams_refresh_token') || null
  } catch {
    return null
  }
}

export const setAuthToken = (token, refreshToken) => {
  try {
    if (token) {
      localStorage.setItem('vastrams_access_token', token)
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      localStorage.removeItem('vastrams_access_token')
      delete api.defaults.headers.common['Authorization']
    }
    if (refreshToken) {
      localStorage.setItem('vastrams_refresh_token', refreshToken)
    } else if (refreshToken === null) {
      localStorage.removeItem('vastrams_refresh_token')
    }
  } catch {}
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Also send cookies where supported
  headers: {
    'Content-Type': 'application/json',
  },
})

// Initialize Authorization header from existing storage immediately
const initialToken = getAuthToken()
if (initialToken) {
  api.defaults.headers.common['Authorization'] = `Bearer ${initialToken}`
}

// Request interceptor: attach Bearer token to all outgoing requests
api.interceptors.request.use(
  (config) => {
    const token = getAuthToken()
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Status codes that trigger navigation to a dedicated error screen
const ERROR_PAGE_CODES = new Set([403, 429, 500, 502, 503, 504])

let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

// Global response interceptor
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config || {}
    const status = error.response?.status
    const message = error.response?.data?.message || error.message || 'An unexpected error occurred'
    const requestUrl = originalRequest.url || ''

    // Skip retry logic for auth endpoints themselves to prevent recursion loops
    const isAuthEndpoint = requestUrl.includes('/auth/login') ||
                          requestUrl.includes('/auth/refresh') ||
                          requestUrl.includes('/auth/me') ||
                          requestUrl.includes('/auth/logout')

    // Handle 401 Unauthorized with token refresh retry
    if (status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        }).catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      const rfToken = getRefreshToken()
      try {
        const refreshRes = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          { refreshToken: rfToken },
          {
            withCredentials: true,
            headers: {
              'Content-Type': 'application/json',
              ...(rfToken ? { 'x-refresh-token': rfToken } : {})
            }
          }
        )

        if (refreshRes.data && refreshRes.data.success && refreshRes.data.accessToken) {
          const newAccess = refreshRes.data.accessToken
          const newRefresh = refreshRes.data.refreshToken || rfToken
          setAuthToken(newAccess, newRefresh)
          processQueue(null, newAccess)
          isRefreshing = false

          originalRequest.headers.Authorization = `Bearer ${newAccess}`
          return api(originalRequest)
        } else {
          throw new Error('Refresh failed')
        }
      } catch (refreshErr) {
        processQueue(refreshErr, null)
        isRefreshing = false
        setAuthToken(null, null)
        try { localStorage.removeItem('vastrams_user_cache') } catch {}
        return Promise.reject(new Error('Session expired. Please log in again.'))
      }
    }

    if (status === 403 && error.response?.data?.requiresSetup) {
      if (window.location.pathname !== '/setup') {
        window.location.href = '/setup'
      }
      return Promise.reject(new Error('Account setup required.'))
    }

    // Only navigate to dedicated error pages for non-auth endpoints if not already on a public/emergency page
    const currentPath = window.location.pathname.replace(/\/+$/, '') || '/'
    const isPublicPage =
      currentPath === '/login' ||
      currentPath === '/setup' ||
      currentPath.startsWith('/error') ||
      currentPath.startsWith('/down-town') ||
      currentPath.startsWith('/litt-up')

    const isLockdownEndpoint =
      requestUrl.includes('/down-town') ||
      requestUrl.includes('/litt-up') ||
      requestUrl.includes('/system/lockdown-status')

    if (status && ERROR_PAGE_CODES.has(status) && !isPublicPage && !isAuthEndpoint && !isLockdownEndpoint) {
      navigateToError(status)
    }

    return Promise.reject(new Error(message))
  }
)

export default api
export { api }
