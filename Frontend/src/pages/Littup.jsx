import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../utils/api'
import { KeyRound, ShieldCheck, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, RefreshCw, Eye, EyeOff } from 'lucide-react'

export default function Littup() {
  const navigate = useNavigate()
  const [status, setStatus] = useState({ isActive: false, loading: true })
  const [recoveryKey, setRecoveryKey] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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

  const handleRestore = async (e) => {
    e.preventDefault()
    if (!recoveryKey.trim()) {
      setError('Please enter the recovery key.')
      return
    }

    setIsSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`${API_BASE_URL}/litt-up`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ recoveryKey: recoveryKey.trim() })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Invalid recovery key. Access denied.')
      }

      setSuccess(data?.message || 'Lockdown lifted and recovery key purged from database.')
      setStatus({ isActive: false, loading: false })
      setRecoveryKey('')
    } catch (err) {
      setError(err.message || 'Invalid recovery key. Access denied.')
    } finally {
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
            System Recovery &amp; Trace Elimination Console
          </p>
        </div>

        {/* Main Card in Vastrams Theme */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none transition-all">
          {/* Badge & Title */}
          <div className="flex items-center justify-between mb-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              Protocol // Litt-Up
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
            System Recovery Console
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
            Enter your recovery key to lift lockdown and restore the site. Validating this key permanently destroys all traces of it from the database.
          </p>

          {/* System Status Pill */}
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3.5 text-xs mb-6 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Current Status:</span>
              <span className={`font-bold inline-flex items-center gap-1.5 ${status.isActive ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                <span className={`w-2 h-2 rounded-full ${status.isActive ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                {status.loading ? 'Checking...' : status.isActive ? 'LOCKED DOWN (500 ACTIVE)' : 'ONLINE & OPERATIONAL'}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-400 dark:text-slate-500 text-[11px]">
              <span>Recovery Action:</span>
              <span>Purge DB trace &amp; restore traffic</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 mb-5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="p-4 mb-6 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm space-y-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold leading-relaxed">{success}</span>
              </div>
              <div className="pt-1">
                <button
                  onClick={() => navigate('/')}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm rounded-lg shadow-md transition flex items-center justify-center gap-1.5"
                >
                  <span>Return to Website</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {!status.isActive && !success ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-xs sm:text-sm text-emerald-700 dark:text-emerald-300">
                Website is currently <strong>fully operational</strong>. No lockdown is active.
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Link
                  to="/"
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm rounded-xl text-center shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-1.5"
                >
                  <span>Go to Website Home</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/down-town"
                  className="py-3 px-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm rounded-xl text-center transition"
                >
                  Go to /down-town
                </Link>
              </div>
            </div>
          ) : !success ? (
            <form onSubmit={handleRestore} className="space-y-4">
              <div>
                <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Enter Recovery Key
                </label>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value)}
                    placeholder="Enter key set during lockdown"
                    required
                    autoComplete="new-password"
                    data-lpignore="true"
                    spellCheck="false"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl pl-10 pr-10 py-3 text-sm text-slate-900 dark:text-slate-100 font-mono outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  Submitting the correct key will lift the 500 error page and permanently purge the key trace from MongoDB.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !recoveryKey.trim()}
                  className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isSubmitting ? 'Verifying & Purging Key...' : 'Execute Litt-Up (Restore Site)'}</span>
                </button>
              </div>
            </form>
          ) : null}

          {/* Footer Navigation */}
          <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
            <Link to="/down-town" className="inline-flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-300 transition">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Go to /down-town</span>
            </Link>
            <Link to="/login" className="hover:text-slate-600 dark:hover:text-slate-300 transition">
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
