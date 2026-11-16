import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { API_BASE_URL, setAuthToken, getAuthToken, getRefreshToken } from '../utils/api'

const AuthContext = createContext(null)

// Dedicated axios instance for auth actions targeting the backend API URL
const authApi = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Attach Bearer token to authApi requests if available
authApi.interceptors.request.use(
  (config) => {
    const token = getAuthToken()
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const cached = localStorage.getItem('vastrams_user_cache')
      if (cached) return JSON.parse(cached)
    } catch {}
    return null
  })
  const [loading, setLoading] = useState(!user)

  const logout = useCallback(async () => {
    try {
      await authApi.post('/auth/logout')
    } catch (err) {
      console.error('Logout request failed:', err)
    } finally {
      setUser(null)
      setAuthToken(null, null)
      try {
        localStorage.removeItem('vastrams_user_cache')
        localStorage.removeItem('vastrams_access_token')
        localStorage.removeItem('vastrams_refresh_token')
      } catch {}
    }
  }, [])

  const silentRefresh = useCallback(async () => {
    try {
      const rfToken = getRefreshToken()
      const token = getAuthToken()
      
      const res = await authApi.post('/auth/refresh', 
        { refreshToken: rfToken },
        { 
          headers: { 
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...(rfToken ? { 'x-refresh-token': rfToken } : {})
          } 
        }
      )

      if (res.data && res.data.success) {
        const { accessToken, refreshToken: newRfToken, user: u } = res.data
        if (accessToken) {
          setAuthToken(accessToken, newRfToken || rfToken)
        }
        if (u) {
          setUser(u)
          try { localStorage.setItem('vastrams_user_cache', JSON.stringify(u)) } catch {}
          return true
        }
        const meRes = await authApi.get('/auth/me')
        if (meRes.data && meRes.data.success && meRes.data.user) {
          setUser(meRes.data.user)
          try { localStorage.setItem('vastrams_user_cache', JSON.stringify(meRes.data.user)) } catch {}
          return true
        }
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setUser(null)
        setAuthToken(null, null)
        try {
          localStorage.removeItem('vastrams_user_cache')
          localStorage.removeItem('vastrams_access_token')
          localStorage.removeItem('vastrams_refresh_token')
        } catch {}
      }
    }
    return false
  }, [])

  // On mount: sync initial auth header and attempt initial silent refresh
  useEffect(() => {
    let isMounted = true
    const initAuth = async () => {
      const path = (window.location.pathname || '').replace(/\/+$/, '')
      if (path.startsWith('/down-town') || path.startsWith('/litt-up') || path.startsWith('/error')) {
        if (isMounted) setLoading(false)
        return
      }
      const currentToken = getAuthToken()
      if (currentToken) {
        setAuthToken(currentToken, getRefreshToken())
      }
      await silentRefresh()
      if (isMounted) {
        setLoading(false)
      }
    }
    initAuth()
    return () => { isMounted = false }
  }, [silentRefresh])

  // Set up token refresh timer (every 10 minutes before 15-minute token expiration)
  useEffect(() => {
    if (!user) return

    const interval = setInterval(async () => {
      await silentRefresh()
    }, 10 * 60 * 1000)

    return () => clearInterval(interval)
  }, [user, silentRefresh])

  const login = async (email, password) => {
    try {
      const res = await authApi.post('/auth/login', { email, password })
      if (res.data && res.data.success) {
        if (res.data.requiresSetup) {
          return { success: true, requiresSetup: true, setupToken: res.data.setupToken }
        }
        const { accessToken, refreshToken, user: u } = res.data
        if (accessToken) {
          setAuthToken(accessToken, refreshToken)
        }
        if (u) {
          setUser(u)
          try { localStorage.setItem('vastrams_user_cache', JSON.stringify(u)) } catch {}
        }
        return { success: true }
      }
      return { success: false, message: 'Invalid server response' }
    } catch (err) {
      if (err.response?.status === 504 || err.response?.status === 500 || err.response?.data?.lockdown) {
        return { success: false, lockdown: true, status: err.response?.status || 504 }
      }
      const errMsg = err.response?.data?.message || err.message || 'Login failed'
      return { success: false, message: errMsg }
    }
  }

  const completeSetup = (_token, userObj) => {
    if (userObj) {
      setUser(userObj)
    } else {
      silentRefresh()
    }
  }

  const value = {
    user,
    loading,
    login,
    logout,
    silentRefresh,
    completeSetup
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
