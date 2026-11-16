import React, { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import ProtectedRoute from '../components/ProtectedRoute'
import PublicRoute from '../components/PublicRoute'

// Lazy loaded page components
const Dashboard = lazy(() => import('../pages/Dashboard'))
const Vendors = lazy(() => import('../pages/Vendors'))
const PurchaseBills = lazy(() => import('../pages/PurchaseBills'))
const VendorPayments = lazy(() => import('../pages/VendorPayments'))
const Financiers = lazy(() => import('../pages/Financiers'))
const FinancierProfile = lazy(() => import('../pages/FinancierProfile'))
const Loans = lazy(() => import('../pages/Loans'))
const FinancierPayments = lazy(() => import('../pages/FinancierPayments'))
const ChequeRegistry = lazy(() => import('../pages/ChequeRegistry'))
const OutstandingStatement = lazy(() => import('../pages/OutstandingStatement'))
const RunningLedger = lazy(() => import('../pages/RunningLedger'))
const TransactionHistory = lazy(() => import('../pages/TransactionHistory'))
const Reports = lazy(() => import('../pages/Reports'))
const Settings = lazy(() => import('../pages/Settings').then(module => ({ default: module.Settings })))
const Login = lazy(() => import('../pages/Login'))
const Setup = lazy(() => import('../pages/Setup'))
const PrintDocument = lazy(() => import('../pages/PrintDocument'))
const Downtown = lazy(() => import('../pages/Downtown'))
const Littup = lazy(() => import('../pages/Littup'))

// Lazy loaded error pages
const Error400 = lazy(() => import('../pages/errors/Error400'))
const Error401 = lazy(() => import('../pages/errors/Error401'))
const Error403 = lazy(() => import('../pages/errors/Error403'))
const Error404 = lazy(() => import('../pages/errors/Error404'))
const Error429 = lazy(() => import('../pages/errors/Error429'))
const Error500 = lazy(() => import('../pages/errors/Error500'))
const Error503 = lazy(() => import('../pages/errors/Error503'))

// Lightweight Suspense loading placeholder
const PageLoader = () => (
  <div className="space-y-6 max-w-[1600px] mx-auto p-4 sm:p-6 animate-pulse">
    <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800">
      <div className="space-y-2">
        <div className="h-7 w-48 bg-slate-200 dark:bg-slate-700 rounded-md"></div>
        <div className="h-4 w-72 bg-slate-100 dark:bg-slate-800 rounded-md"></div>
      </div>
      <div className="h-9 w-28 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="h-24 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60"></div>
      <div className="h-24 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60"></div>
      <div className="h-24 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60"></div>
      <div className="h-24 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60"></div>
    </div>
    <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60"></div>
  </div>
)

const lazyLoad = (Component) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
)

const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <PublicRoute>
        {lazyLoad(Login)}
      </PublicRoute>
    ),
  },
  {
    path: '/print/:type/:id',
    element: (
      <ProtectedRoute>
        {lazyLoad(PrintDocument)}
      </ProtectedRoute>
    )
  },
  {
    path: '/setup',
    element: lazyLoad(Setup)
  },
  {
    path: '/down-town',
    element: lazyLoad(Downtown)
  },
  {
    path: '/down-town/',
    element: lazyLoad(Downtown)
  },
  {
    path: '/litt-up',
    element: lazyLoad(Littup)
  },
  {
    path: '/litt-up/',
    element: lazyLoad(Littup)
  },
  {
    path: '/error/400',
    element: lazyLoad(Error400)
  },
  {
    path: '/error/401',
    element: lazyLoad(Error401)
  },
  {
    path: '/error/403',
    element: lazyLoad(Error403)
  },
  {
    path: '/error/404',
    element: lazyLoad(Error404)
  },
  {
    path: '/error/429',
    element: lazyLoad(Error429)
  },
  {
    path: '/error/500',
    element: lazyLoad(Error500)
  },
  {
    path: '/error/503',
    element: lazyLoad(Error503)
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <ProtectedRoute permission="dashboard">{lazyLoad(Dashboard)}</ProtectedRoute> },
      { path: 'vendors', element: <ProtectedRoute permission="vendors">{lazyLoad(Vendors)}</ProtectedRoute> },
      { path: 'bills', element: <ProtectedRoute permission="purchase_bills">{lazyLoad(PurchaseBills)}</ProtectedRoute> },
      { path: 'payments', element: <ProtectedRoute permission="vendor_payments">{lazyLoad(VendorPayments)}</ProtectedRoute> },
      { path: 'financiers', element: <ProtectedRoute permission="finance">{lazyLoad(Financiers)}</ProtectedRoute> },
      { path: 'financiers/:id', element: <ProtectedRoute permission="finance">{lazyLoad(FinancierProfile)}</ProtectedRoute> },
      { path: 'loans', element: <ProtectedRoute permission="loans">{lazyLoad(Loans)}</ProtectedRoute> },
      { path: 'financier-payments', element: <ProtectedRoute permission="financial_repayments">{lazyLoad(FinancierPayments)}</ProtectedRoute> },
      { path: 'cheques', element: <ProtectedRoute permission="cheques">{lazyLoad(ChequeRegistry)}</ProtectedRoute> },
      { path: 'outstanding', element: <ProtectedRoute permission="outstanding">{lazyLoad(OutstandingStatement)}</ProtectedRoute> },
      { path: 'ledger', element: <ProtectedRoute permission="ledger">{lazyLoad(RunningLedger)}</ProtectedRoute> },
      { path: 'transaction-history', element: <ProtectedRoute permission="transactions">{lazyLoad(TransactionHistory)}</ProtectedRoute> },
      { path: 'reports', element: <ProtectedRoute permission="reports">{lazyLoad(Reports)}</ProtectedRoute> },
      { path: 'settings', element: <ProtectedRoute permission="settings">{lazyLoad(Settings)}</ProtectedRoute> },
    ]
  },
  {
    path: '*',
    element: lazyLoad(Error404)
  }
])

export default router
