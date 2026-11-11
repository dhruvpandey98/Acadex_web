import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from './hooks/useApp.js'

const LandingPage = lazy(() => import('./pages/landing/LandingPage.jsx'))
const AuthPage = lazy(() => import('./pages/auth/AuthPage.jsx'))
const PortalLayout = lazy(() => import('./components/layout/PortalLayout.jsx'))
const PortalPage = lazy(() => import('./pages/portal/PortalPage.jsx'))
const DatasetInsights = lazy(() => import('./pages/portal/DatasetInsights.jsx'))

function ProtectedPortal() {
  const { user, authLoading } = useApp()
  const location = useLocation()
  if (authLoading) return <div className="route-loading">Checking your Acadex session…</div>
  return user ? <PortalLayout /> : <Navigate to="/login" replace state={{ from: location }} />
}

function AdminDatasetInsights() {
  const { user } = useApp()
  return user?.role === 'Admin' ? <DatasetInsights /> : <Navigate to="/portal" replace />
}

export default function App() {
  const { user, authLoading } = useApp()
  if (authLoading) return <div className="route-loading">Opening your school day…</div>
  return <Suspense fallback={<div className="route-loading">Opening your school day…</div>}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={user ? <Navigate to="/portal" replace /> : <AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
      <Route path="/reset-password" element={<AuthPage mode="reset" />} />
      <Route path="/portal" element={<ProtectedPortal />}>
        <Route index element={<PortalPage />} />
        <Route path="dataset-insights" element={<AdminDatasetInsights />} />
        <Route path=":section" element={<PortalPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>
}
