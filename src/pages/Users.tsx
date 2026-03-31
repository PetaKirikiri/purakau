import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invokeAuthFunction } from '../lib/invokeFunction'
import { formatError } from '../lib/formatError'
import { useAuth } from '../context/AuthContext'

type AuthUser = {
  id: string
  email: string | undefined
  created_at: string
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  invited_at: string | null
  user_metadata: Record<string, unknown>
}

export default function Users() {
  const queryClient = useQueryClient()
  const { user, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('user')

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['auth_users'],
    queryFn: async () => {
      const body = await invokeAuthFunction<{ users?: AuthUser[] }>('list-auth-users')
      return body.users ?? []
    },
    enabled: !!user,
  })

  const deleteMutation = useMutation({
    mutationFn: async (authUserId: string) => {
      await invokeAuthFunction('delete-user', { body: { id: authUserId } })
    },
    onSuccess: (_data, authUserId) => {
      queryClient.invalidateQueries({ queryKey: ['auth_users'] })
      if (user?.id === authUserId) signOut()
    },
  })

  const inviteMutation = useMutation({
    mutationFn: async (payload: { email: string; displayName: string; role: string }) => {
      const body = await invokeAuthFunction<{ user?: unknown }>('invite-user', {
        body: {
          email: payload.email.trim().toLowerCase(),
          displayName: payload.displayName.trim() || null,
          role: payload.role,
        },
      })
      return body.user
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth_users'] })
      setEmail('')
      setDisplayName('')
      setRole('user')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedEmail = email.trim()
    if (trimmedEmail) {
      inviteMutation.mutate({ email: trimmedEmail, displayName: displayName.trim(), role })
    }
  }

  if (!user) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Users</h1>
        <p className="text-gray-600">Sign in to view and manage users.</p>
      </div>
    )
  }
  if (isLoading) return <div className="p-6">Loading...</div>
  if (error) {
    const err = error as Error & { hint?: string }
    return (
      <div className="p-6 text-red-600">
        <p>Error: {err.message}</p>
        {err.hint && <p className="text-sm text-gray-600 mt-1">{err.hint}</p>}
        <p className="text-sm mt-2">
          If your Supabase project was paused, unpause it in the dashboard. Then try again.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Users</h1>

      <form onSubmit={handleSubmit} className="mb-8 p-4 border rounded bg-gray-50">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Invite user</h2>
        {!user && (
          <p className="text-amber-700 text-sm mb-3 bg-amber-50 p-2 rounded">
            Sign in to invite users. Invited users receive an email to set their password.
          </p>
        )}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Optional"
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="border rounded px-3 py-2"
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={inviteMutation.isPending || !email.trim() || !user}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {inviteMutation.isPending ? 'Sending invite...' : 'Send invite'}
          </button>
        </div>
        {inviteMutation.isError && (
          <p className="text-red-600 text-sm mt-2">
            {formatError(inviteMutation.error)}
            {(inviteMutation.error as Error & { hint?: string })?.hint && (
              <span className="block text-gray-600 mt-1">
                {(inviteMutation.error as Error & { hint?: string }).hint}
              </span>
            )}
          </p>
        )}
      </form>

      <p className="text-sm text-gray-600 mb-4">
        Users from Supabase Auth. Deleting removes them from auth — they can no longer sign in.
      </p>
      <ul className="space-y-3">
        {users?.map((u) => (
          <li key={u.id} className="border rounded p-4 hover:bg-gray-50 flex justify-between items-start gap-4">
            <div>
              <div className="font-medium">{u.email ?? '(no email)'}</div>
              {(u.user_metadata?.display_name as string) && (
                <div className="text-sm text-gray-600">{u.user_metadata.display_name as string}</div>
              )}
              <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                <span>Created {new Date(u.created_at).toLocaleDateString()}</span>
                {u.last_sign_in_at && (
                  <span>· Last sign in {new Date(u.last_sign_in_at).toLocaleString()}</span>
                )}
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    u.email_confirmed_at ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {u.email_confirmed_at ? 'Confirmed' : u.invited_at ? 'Invited' : 'Pending'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Remove ${u.email ?? 'this user'}? They will be deleted from Supabase Auth and cannot sign in again.`)) {
                  deleteMutation.mutate(u.id)
                }
              }}
              disabled={deleteMutation.isPending}
              className="shrink-0 px-2 py-1 text-xs border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {deleteMutation.isError && (
        <p className="text-red-600 text-sm mt-2">
          {formatError(deleteMutation.error)}
          {(deleteMutation.error as Error & { hint?: string })?.hint && (
            <span className="block text-gray-600 mt-1">
              {(deleteMutation.error as Error & { hint?: string }).hint}
            </span>
          )}
        </p>
      )}
      {!users?.length && (
        <p className="text-gray-500">No users yet. Add one above.</p>
      )}
    </div>
  )
}
