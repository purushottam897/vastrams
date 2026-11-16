import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from '../utils/api'
import { ShieldAlert, KeyRound, Sparkles, Copy, Check, ArrowRight, ArrowLeft, RefreshCw, AlertTriangle } from 'lucide-react'

export default function Downtown() {
  const [status, setStatus] = useState({ isActive: false, loading: true })
  const [recoveryCode, setRecoveryCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchStatus()
  }, [])

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/system/lockdown-status`)
      const data = await res.json()
      setStatus({ isActive: !!data.isActive, loading: false })
    } catch {
      setStatus({ isActive: false, loading: false })
    }
  }

  const generateCode = () => {
    const part1 = Math.random().toString(36).substring(2, 8).toUpperCase()
    const part2 = Math.random().toString(36).substring(2, 8).toUpperCase()
    const code = `RCV-${part1}-${part2}`
    setRecoveryCode(code)
    setCopied(false)
  }

  const copyCode = () => {
    if (!recoveryCode) return
    navigator.clipboard.writeText(recoveryCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleActivate = async (e) => {
    e.preventDefault()
    if (!recoveryCode.trim()) {
      setError('A recovery code is required before initiating lockdown.')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const res = await fetch(`${API_BASE_URL}/down-town`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ recoveryCode: recoveryCode.trim() })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to initiate lockdown.')
      }

      // Immediately wipe key from React state - stored in MongoDB only, not browser
      setRecoveryCode('')

      // Wait 2.5s to simulate authentic upstream gateway timeout
      await new Promise(r => setTimeout(r, 2500))

      // Lockdown is active! Redirect to the catastrophic failure page
      window.location.href = '/error/500'
    } catch (err) {
      setError(err.message || 'Failed to initiate lockdown.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-canvas dark:bg-slate-900 text-slate-800 dark:text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 transition-colors font-sans">
      <div className="w-full max-w-[480px]">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6 sm:mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white shadow-lg shadow-emerald-600/20 border border-emerald-400/30 mb-3.5">
            <span className="font-black text-2xl tracking-tight font-display">V</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 font-display">
            VASTRAMS
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Emergency Infrastructure Control
          </p>
        </div>

        {/* Main Card in Vastrams Theme */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none transition-all">
          {/* Badge & Title */}
          <div className="flex items-center justify-between mb-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              <ShieldAlert className="w-3.5 h-3.5" />
              Protocol // Down-Town
            </span>

            <button
              onClick={fetchStatus}
              title="Refresh Status"
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${status.loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display mb-2">
            Initiate Emergency Lockdown
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
            Renders the entire website and API inaccessible to the public by rolling out the Cloudflare <strong className="text-rose-600 dark:text-rose-400">504 Gateway time-out</strong> page.
          </p>

          {/* System Status Pill */}
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3.5 text-xs mb-6 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Current Status:</span>
              <span className={`font-bold inline-flex items-center gap-1.5 ${status.isActive ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                <span className={`w-2 h-2 rounded-full ${status.isActive ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                {status.loading ? 'Checking...' : status.isActive ? 'LOCKED DOWN (504 ACTIVE)' : 'ONLINE & OPERATIONAL'}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-400 dark:text-slate-500 text-[11px]">
              <span>Target Scope:</span>
              <span>All public routes &amp; backend services</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 mb-5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {status.isActive ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-xs sm:text-sm text-rose-700 dark:text-rose-300">
                Lockdown is <strong>currently active</strong>. Public traffic is seeing the Cloudflare Error 500 page.
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Link
                  to="/litt-up"
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm rounded-xl text-center shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-1.5"
                >
                  <span>Go to /litt-up to Restore</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/error/500"
                  className="py-3 px-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm rounded-xl text-center transition"
                >
                  Preview 500 Page
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleActivate} className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Set Recovery Code
                  </label>
                  <button
                    type="button"
                    onClick={generateCode}
                    className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                  >
                    <Sparkles className="w-3 h-3" />
                    Generate Key
                  </button>
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value)}
                    placeholder="e.g. VASTRAMS-RECOVERY-KEY"
                    required
                    autoComplete="new-password"
                    data-lpignore="true"
                    spellCheck="false"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 rounded-xl pl-10 pr-20 py-3 text-sm text-slate-900 dark:text-slate-100 font-mono outline-none transition"
                  />
                  {recoveryCode && (
                    <button
                      type="button"
                      onClick={copyCode}
                      className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  Save this key carefully. You will need it on <code className="font-mono font-bold text-slate-700 dark:text-slate-300">/litt-up</code> to revive the site.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !recoveryCode.trim()}
                  className="w-full py-3.5 px-4 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl uppercase tracking-wider shadow-lg shadow-rose-600/20 transition flex items-center justify-center gap-2"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>{isSubmitting ? 'Simulating Gateway Timeout...' : 'Trigger Down-Town (Roll Out 504)'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Footer Navigation */}
          <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
            <Link to="/login" className="inline-flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-300 transition">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Login</span>
            </Link>
            <Link to="/litt-up" className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline font-semibold">
              <span>Go to /litt-up</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
