import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { from?: string } | null | undefined
  const redirectTo =
    state?.from && state.from !== '/login' ? state.from : '/stories'
  const { user, loading, signIn, signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (loading) {
    return <div className="p-6 text-gray-600">Loading…</div>
  }
  if (user) {
    return <Navigate to={redirectTo} replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    const { error: err } = isSignUp
      ? await signUp(email.trim(), password)
      : await signIn(email.trim(), password)
    setPending(false)
    if (err) {
      setError(err.message)
      return
    }
    navigate(redirectTo, { replace: true })
  }

  return (
    <div className="max-w-sm mx-auto p-6 mt-16">
      <h1 className="text-2xl font-bold mb-6">
        {isSignUp ? 'Sign up' : 'Sign in'}
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border rounded px-3 py-2"
            autoComplete="email"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full border rounded px-3 py-2"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? 'Please wait...' : isSignUp ? 'Sign up' : 'Sign in'}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setIsSignUp((v) => !v)
          setError(null)
        }}
        className="mt-4 text-sm text-gray-600 hover:text-blue-600"
      >
        {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
      </button>
    </div>
  )
}
