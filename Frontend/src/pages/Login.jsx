import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext'
import { API_BASE_URL } from '../utils/api'
import { Mail, Lock, Eye, EyeOff, BarChart3, FileText, CreditCard, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react'

// ── Feature list shown on desktop left panel ───────────────────────────────────
const FEATURES = [
  { icon: FileText,     title: 'Purchase Bills & Invoices', text: 'Accurate FIFO tracking and payables aging' },
  { icon: CreditCard,   title: 'Payment Settlements',       text: 'Multi-mode vendor & financier reconciliation' },
  { icon: BarChart3,    title: 'Real-Time Financials',      text: 'Running ledger, statement, and exportable reports' },
  { icon: CheckCircle2, title: 'Cheque Lifecycle',          text: 'Complete register from issue to bank clearance' },
]

export function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState('')
  const [shake, setShake]               = useState(false)
  const [fieldErrors, setFieldErrors]   = useState({ email: '', password: '' })
  const emailRef = useRef(null)

  const from = location.state?.from?.pathname || '/'

  useEffect(() => {
    emailRef.current?.focus()

    // If site is in lockdown, immediately show Cloudflare 504 error page
    const checkLockdown = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/system/lockdown-status`)
        if (res.ok) {
          const data = await res.json()
          if (data.isActive) {
            navigate('/error/500', { replace: true })
          }
        }
      } catch {}
    }
    checkLockdown()
  }, [navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return

    // Manual field validation
    const newFieldErrors = { email: '', password: '' }
    if (!email.trim())    newFieldErrors.email    = 'Email is required'
    if (!password.trim()) newFieldErrors.password = 'Password is required'
    if (newFieldErrors.email || newFieldErrors.password) {
      setFieldErrors(newFieldErrors)
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const result = await login(email, password)
      if (result?.success) {
        if (result?.requiresSetup) {
          navigate('/setup', { replace: true, state: { setupToken: result.setupToken } })
        } else {
          navigate(from, { replace: true })
        }
      } else if (result?.lockdown || result?.status === 504 || result?.status === 500) {
        navigate('/error/500', { replace: true })
      } else {
        const msg = result?.message || 'Invalid email or password. Please try again.'
        setError(msg)
        setShake(true)
        setTimeout(() => setShake(false), 500)
      }
    } catch (err) {
      if (err?.response?.status === 504 || err?.response?.status === 500 || err?.response?.data?.lockdown) {
        navigate('/error/500', { replace: true })
        return
      }
      const msg = err?.response?.data?.message || err?.message || 'Invalid email or password. Please try again.'
      setError(msg)
      setShake(true)
      setTimeout(() => setShake(false), 500)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen min-h-dvh flex w-full bg-slate-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 selection:bg-emerald-500 selection:text-white">

      {/* ── Left Feature Panel (Desktop >= lg only) ─────────────────────────── */}
      <div className="hidden lg:flex w-[42%] max-w-lg min-h-screen bg-slate-900 text-white flex-col justify-between p-10 xl:p-12 relative overflow-hidden shrink-0 border-r border-slate-800">
        {/* Subtle decorative dot pattern */}
        <div 
          className="absolute inset-0 opacity-[0.15] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Ambient emerald glow */}
        <div 
          className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-20 pointer-events-none blur-3xl"
          style={{ background: 'radial-gradient(circle, #10B981 0%, transparent 70%)' }}
        />
        <div 
          className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full opacity-10 pointer-events-none blur-3xl"
          style={{ background: 'radial-gradient(circle, #059669 0%, transparent 70%)' }}
        />

        {/* Top Brand Header */}
        <div className="relative z-10">
          <div className="flex items-center gap-3.5 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white shadow-lg shadow-emerald-900/40 border border-emerald-400/30">
              <span className="font-extrabold text-2xl tracking-tight font-display">V</span>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white font-display">
                VASTRAMS
              </h1>
              <p className="text-xs text-slate-400 font-medium tracking-wide">
                Vendor &amp; Finance Management
              </p>
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-2 mt-12 mb-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              Enterprise Platform
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight text-white font-display leading-snug">
              Smart finance, settlements &amp; ledger control
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Designed specifically for fast-paced commercial operations, transparent invoice settlements, and rigorous audit trails.
            </p>
          </div>

          {/* Feature List */}
          <div className="space-y-4">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <div key={i} className="flex items-start gap-3.5 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-100">{title}</p>
                  <p className="text-xs text-slate-400 leading-relaxed mt-0.5">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop Left Footer */}
        <div className="relative z-10 pt-8 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
          <span>&copy; {new Date().getFullYear()} Vastrams</span>
          <span>End-to-End Secure</span>
        </div>
      </div>

      {/* ── Main Login Panel (Full width on mobile, right column on desktop) ─── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:px-6 md:px-8 min-h-screen min-h-dvh pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-[440px] flex flex-col items-center my-auto">

          {/* Mobile Header: Brand Logo & Title (Hidden on desktop lg+) */}
          <div className="lg:hidden flex flex-col items-center text-center mb-6 sm:mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white shadow-lg shadow-emerald-600/20 border border-emerald-400/30 mb-3.5">
              <span className="font-black text-2xl tracking-tight font-display">V</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 font-display">
              VASTRAMS
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Vendor &amp; Finance Management
            </p>
          </div>

          {/* Login Card */}
          <div 
            className="w-full bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl p-5 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none transition-all"
            style={{ animation: shake ? 'login-shake 0.45s ease' : 'none' }}
          >
            {/* Card Heading */}
            <div className="mb-6 text-left">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
                Sign in to your account
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Enter your credentials to continue
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <div 
                role="alert" 
                className="flex items-start gap-2.5 p-3.5 mb-5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-medium"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate>

              {/* Email Address */}
              <div>
                <label 
                  htmlFor="login-email"
                  className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                  <input
                    id="login-email"
                    ref={emailRef}
                    type="email"
                    autoComplete="email"
                    data-lpignore="true"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); setFieldErrors(fe => ({ ...fe, email: '' })) }}
                    placeholder="name@company.com"
                    className={`w-full h-12 sm:h-[50px] pl-10 pr-4 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border text-slate-900 dark:text-slate-100 text-sm font-medium placeholder:text-slate-400 outline-none focus:bg-white dark:focus:bg-slate-900 transition-all ${
                      fieldErrors.email 
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' 
                        : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
                    }`}
                  />
                </div>
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label 
                  htmlFor="login-password"
                  className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); setFieldErrors(fe => ({ ...fe, password: '' })) }}
                    placeholder="••••••••"
                    className={`w-full h-12 sm:h-[50px] pl-10 pr-12 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border text-slate-900 dark:text-slate-100 text-sm font-medium placeholder:text-slate-400 outline-none focus:bg-white dark:focus:bg-slate-900 transition-all ${
                      fieldErrors.password 
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' 
                        : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-10 w-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 sm:h-[50px] rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-sm sm:text-base shadow-sm shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      <span>Signing In…</span>
                    </>
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Mobile bottom subtle copyright */}
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-6">
            &copy; {new Date().getFullYear()} Vastrams · Vendor &amp; Finance Management
          </p>
        </div>
      </div>

      <style>{`
        @keyframes login-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  )
}

export default Login
