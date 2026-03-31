import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDbConfirmation } from '../context/DbConfirmationContext'
import { getTokensFromSentence, splitIntoSentences } from '../lib/tokens'
import { supabase } from '../lib/supabase'
import { formatError } from '../lib/formatError'

export default function StoriesList() {
  const queryClient = useQueryClient()
  const { show: showDbConfirmation } = useDbConfirmation()

  const { data: titles, isLoading, error } = useQuery({
    queryKey: ['titles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('titles')
        .select('id, name, author, created_at')
        .order('id', { ascending: true })
      if (error) throw error
      return data
    },
  })

  const processMutation = useMutation({
    mutationFn: async (titleId: number) => {
      let { data: versions } = await supabase
        .from('story_versions')
        .select('id')
        .eq('title_id', titleId)
        .order('version_number', { ascending: true })
      if (!versions?.length) {
        const { data: v, error: vErr } = await supabase
          .from('story_versions')
          .insert({ title_id: titleId, version_number: 10, label: '1.0' })
          .select('id')
          .single()
        if (vErr) throw vErr
        versions = v ? [v] : []
      }
      const versionId = versions[0]?.id
      if (!versionId) throw new Error('No version found')

      let { data: sources, error: srcError } = await supabase
        .from('story_sources')
        .select('id, source_text, version_id')
        .eq('title_id', titleId)
      if (srcError) throw srcError
      if (!sources?.length) throw new Error('No source text found')
      const srcRow = sources[0]
      if (!srcRow.version_id) {
        await supabase
          .from('story_sources')
          .update({ version_id: versionId })
          .eq('id', srcRow.id)
      }
      const source = srcRow
      const sentences = splitIntoSentences(source.source_text)

      const { data: existingRows, error: existingError } = await supabase
        .from('story_sentences')
        .select('id, sentence_number, sentence_text, tokens_array')
        .eq('version_id', versionId)
        .order('sentence_number', { ascending: true })
      if (existingError) throw existingError

      const hasTokensArray = (r: { tokens_array?: unknown }) =>
        Array.isArray(r.tokens_array) && r.tokens_array.length > 0

      if (existingRows?.length) {
        const allHaveData = existingRows.every(hasTokensArray)
        if (allHaveData) {
          throw new Error('Story already processed. All sentences have tokens_array.')
        }
        const toUpdate = existingRows.filter((r) => !hasTokensArray(r))
        for (const row of toUpdate) {
          const tokens_array = getTokensFromSentence(row.sentence_text ?? '')
          const { error: updError } = await supabase
            .from('story_sentences')
            .update({ tokens_array })
            .eq('id', row.id)
          if (updError) throw updError
        }
        return {
          count: toUpdate.length,
          updated: true,
          dbConfirmation: {
            tables: ['story_sentences'],
            details: [`story_sentences: updated ${toUpdate.length} row(s) with tokens_array`],
          },
        }
      }

      const rows = sentences.map((sentenceText, i) => ({
        title_id: titleId,
        version_id: versionId,
        sentence_number: i + 1,
        sentence_text: sentenceText,
        tokens_array: getTokensFromSentence(sentenceText),
      }))

      const BATCH_SIZE = 50
      const allInserted: { id: number; tokens_array: unknown }[] = []
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const { data: inserted, error: insertError } = await supabase
          .from('story_sentences')
          .insert(batch, { defaultToNull: false })
          .select('id, tokens_array')
        if (insertError) throw insertError
        if (!inserted?.length || inserted.length !== batch.length) {
          throw new Error(
            `Insert batch failed: expected ${batch.length} rows, got ${inserted?.length ?? 0} (batch ${Math.floor(i / BATCH_SIZE) + 1})`
          )
        }
        allInserted.push(...inserted)
      }
      return {
        count: rows.length,
        inserted: allInserted,
        dbConfirmation: {
          tables: ['story_sentences'],
          details: [`story_sentences: inserted ${rows.length} row(s) with tokens_array`],
        },
      }
    },
    onSuccess: (data, titleId) => {
      if (data?.dbConfirmation) showDbConfirmation(data.dbConfirmation)
      queryClient.invalidateQueries({ queryKey: ['titles'] })
      queryClient.invalidateQueries({ queryKey: ['story_versions', String(titleId)] })
      queryClient.invalidateQueries({ queryKey: ['story_sentences', String(titleId)] })
    },
  })

  if (isLoading) return <div className="p-6">Loading...</div>
  if (error) return <div className="p-6 text-red-600">Error: {formatError(error)}</div>

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Stories</h1>
        <Link
          to="/add"
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Make new story
        </Link>
      </div>
      <ul className="space-y-3">
        {titles?.map((t) => (
          <li key={t.id} className="border rounded p-4 hover:bg-gray-50 flex items-center justify-between gap-4">
            <Link to={`/stories/${t.id}`} className="flex-1 min-w-0">
              <span className="font-medium text-blue-600 hover:underline">{t.name}</span>
              {t.author && (
                <span className="text-gray-500 text-sm ml-2">by {t.author}</span>
              )}
            </Link>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                processMutation.mutate(t.id)
              }}
              disabled={processMutation.isPending}
              className="shrink-0 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
            >
              {processMutation.isPending && processMutation.variables === t.id
                ? 'Processing...'
                : 'Process'}
            </button>
          </li>
        ))}
      </ul>
      {!titles?.length && <p className="text-gray-500">No stories yet.</p>}
      {processMutation.isSuccess && processMutation.data && (
        <p className="mt-4 text-green-600 text-sm">
          {processMutation.data.updated
            ? `Updated ${processMutation.data.count} sentence(s) with empty tokens_array.`
            : `Inserted ${processMutation.data.count} sentences with tokens_array.`}
        </p>
      )}
      {processMutation.isError && (
        <div className="mt-4 text-red-600 text-sm space-y-2">
          <p>{formatError(processMutation.error)}</p>
          {formatError(processMutation.error).includes('null value') && formatError(processMutation.error).includes('id') && (
            <p className="text-xs mt-2 p-2 bg-amber-50 rounded">
              Fix: Run <code className="bg-amber-100 px-1">scripts/fix-story-sentences-id.sql</code> in Supabase Dashboard → SQL Editor
            </p>
          )}
        </div>
      )}
    </div>
  )
}
