import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="p-6 text-gray-600">Loading…</div>
  }
  if (!user) {
    return (
      <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />
    )
  }
  return <>{children}</>
}
