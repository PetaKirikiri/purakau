import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { formatError } from '../lib/formatError'

export default function Clients() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')

  const { data: clients, isLoading, error } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, created_at')
        .order('name')
      if (error) throw error
      return data
    },
  })

  const insertMutation = useMutation({
    mutationFn: async (clientName: string) => {
      const { data, error } = await supabase
        .from('clients')
        .insert({ name: clientName.trim() })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      setName('')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) insertMutation.mutate(trimmed)
  }

  if (isLoading) return <div className="p-6">Loading...</div>
  if (error) return <div className="p-6 text-red-600">Error: {formatError(error)}</div>

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Clients</h1>

      <form onSubmit={handleSubmit} className="mb-8 p-4 border rounded bg-gray-50">
        <h2 className="text-sm font-medium text-gray-700 mb-3">New client</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. MOE - Policy Group"
            className="flex-1 border rounded px-3 py-2"
          />
          <button
            type="submit"
            disabled={insertMutation.isPending || !name.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {insertMutation.isPending ? 'Adding...' : 'Add'}
          </button>
        </div>
        {insertMutation.isError && (
          <p className="text-red-600 text-sm mt-2">{formatError(insertMutation.error)}</p>
        )}
      </form>

      <ul className="space-y-3">
        {clients?.map((c) => (
          <li key={c.id} className="border rounded p-4 hover:bg-gray-50">
            <div className="font-medium">{c.name}</div>
          </li>
        ))}
      </ul>
      {!clients?.length && (
        <p className="text-gray-500">No clients yet. Add one above.</p>
      )}
    </div>
  )
}
