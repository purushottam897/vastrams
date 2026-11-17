import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CLOUDFLARE_500_HTML } from '../../utils/cloudflareErrorTemplate'
import { API_BASE_URL } from '../../utils/api'

export default function Error500() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const wasLockedRef = useRef(null)

  const safeRedirect = () => {
    // Loop guard: prevent redirecting more than once every 15 seconds
    const now = Date.now()
    const lastRedirect = Number(sessionStorage.getItem('vastrams_last_error_redirect') || 0)
    if (now - lastRedirect < 15000) {
      return
    }

    sessionStorage.setItem('vastrams_last_error_redirect', String(now))

    let target = '/'
    try {
      const saved = sessionStorage.getItem('vastrams_last_route')
      if (saved && !saved.startsWith('/error') && !saved.startsWith('/down-town') && !saved.startsWith('/litt-up')) {
        target = saved
      }
      sessionStorage.removeItem('vastrams_last_route')
    } catch {}

    navigate(target, { replace: true })
  }

  useEffect(() => {
    document.title = '504: Catastrophic infrastructure failure'
    let isMounted = true

    // Show realistic connecting arc for 2.5s before displaying Cloudflare 504 page
    const timer = setTimeout(() => {
      if (isMounted) setIsLoading(false)
    }, 2500)

    // Check status: only redirect if we observed an active lockdown that is now lifted!
    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/system/lockdown-status`)
        if (res.ok) {
          const data = await res.json()
          const currentlyActive = !!data.isActive

          // If we had recorded that the site was actively locked down and now it's lifted:
          if (wasLockedRef.current === true && !currentlyActive) {
            wasLockedRef.current = false
            safeRedirect()
            return
          }

          // Initial record of state
          if (wasLockedRef.current === null) {
            wasLockedRef.current = currentlyActive
            // If the user refreshed the tab and there was a pending return route from before lockdown:
            const savedRoute = sessionStorage.getItem('vastrams_last_route')
            if (!currentlyActive && savedRoute && !savedRoute.startsWith('/error')) {
              safeRedirect()
              return
            }
          }
        }
      } catch {
        // Backend unreachable or in gateway timeout
      }
    }

    checkStatus()

    // Periodically poll (every 6 seconds): auto-restore if /litt-up unlocked the site
    const pollInterval = setInterval(() => {
      if (isMounted) checkStatus()
    }, 6000)

    return () => {
      isMounted = false
      clearTimeout(timer)
      clearInterval(pollInterval)
    }
  }, [navigate])

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center select-none font-sans">
        {/* Animated Circular Arc (Gateway Connecting State) */}
        <div className="relative w-16 h-16 mb-5">
          <svg className="w-full h-full animate-spin" viewBox="0 0 50 50">
            <circle
              className="text-slate-200"
              strokeWidth="4"
              stroke="currentColor"
              fill="transparent"
              r="20"
              cx="25"
              cy="25"
            />
            <circle
              className="text-slate-500"
              strokeWidth="4"
              strokeDasharray="80, 200"
              strokeDashoffset="0"
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
              r="20"
              cx="25"
              cy="25"
            />
          </svg>
        </div>

        <p className="text-sm font-medium text-slate-600 tracking-tight">
          Connecting to vastrams.vercel.app...
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Awaiting gateway response
        </p>
      </div>
    )
  }

  // Pure Cloudflare 504 Page - no floating overlays or toolbars
  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-white select-none">
      <iframe
        title="Catastrophic infrastructure failure"
        srcDoc={CLOUDFLARE_500_HTML}
        className="w-full h-full border-none block"
      />
    </div>
  )
}
