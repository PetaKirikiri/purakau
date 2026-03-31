import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { formatError } from '../lib/formatError'
import { splitIntoSentences, getTokensFromSentence } from '../lib/tokens'

export default function AddStory() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [sourceText, setSourceText] = useState('')

  const { data: maxId = 0 } = useQuery({
    queryKey: ['titles', 'maxId'],
    queryFn: async () => {
      const { data } = await supabase
        .from('titles')
        .select('id')
        .order('id', { ascending: false })
        .limit(1)
        .single()
      return data?.id ?? 0
    },
  })

  const insertMutation = useMutation({
    mutationFn: async (payload: { name: string; author: string; sourceText: string }) => {
      const { data: title, error: titleError } = await supabase
        .from('titles')
        .insert({ name: payload.name, author: payload.author || null })
        .select()
        .single()
      if (titleError) throw titleError
      const { data: version, error: versionError } = await supabase
        .from('story_versions')
        .insert({ title_id: title.id, version_number: 10, label: '1.0' })
        .select('id')
        .single()
      if (versionError) throw versionError
      if (version) {
        const sourceText = payload.sourceText?.trim() ?? ''
        const { error: sourceError } = await supabase
          .from('story_sources')
          .insert({
            title_id: title.id,
            version_id: version.id,
            source_text: sourceText,
            language: 'mi',
          })
        if (sourceError) throw sourceError
        if (sourceText) {
          const sentences = splitIntoSentences(sourceText)
          const rows = sentences.map((sentenceText, i) => ({
            title_id: title.id,
            version_id: version.id,
            sentence_number: i + 1,
            sentence_text: sentenceText,
            tokens_array: getTokensFromSentence(sentenceText),
          }))
          const BATCH_SIZE = 50
          for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE)
            const { error: insErr } = await supabase.from('story_sentences').insert(batch)
            if (insErr) throw insErr
          }
        }
      }
      return title
    },
    onSuccess: (title) => navigate(`/stories/${title.id}`),
  })

  const nextId = maxId + 1

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    insertMutation.mutate({ name, author, sourceText })
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Add New Story</h1>
      <p className="text-sm text-gray-500 mb-6">Next ID: {nextId}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Author (optional)</label>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Source text (optional)</label>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="Paste or type story text here..."
            rows={6}
            className="w-full border rounded px-3 py-2 resize-y"
          />
        </div>
        <button
          type="submit"
          disabled={insertMutation.isPending}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {insertMutation.isPending ? 'Saving...' : 'Add Story'}
        </button>
        {insertMutation.isError && (
          <p className="text-red-600 text-sm">{formatError(insertMutation.error)}</p>
        )}
      </form>
    </div>
  )
}
