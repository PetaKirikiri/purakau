import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDbConfirmation } from '../context/DbConfirmationContext'
import { supabase } from '../lib/supabase'
import { formatError } from '../lib/formatError'
import { getPosTypeBackgroundColor } from '../lib/tokenStyling'
import type { PatternQuestionConfig, PatternQuestionVariant } from '../db/schema'
import {
  getInterrogativeById,
  INTERROGATIVE_OPTIONS,
  interrogativeIdForText,
} from '../lib/questionTemplates'

type PosType = { id: number; code: string; label: string; color: string | null }

type TabId = 'phrases' | 'sentences'

type PhraseSpan = { pattern_name: string; pattern_id?: number; start: number; end: number }

type PhraseRuleCtx = { name: string; start: number; end: number }

type ChunkPatternRow = { id: number | string; name: string; pos_pattern: unknown }

type SimpleRuleRow = {
  target: 'all' | number
  interrogativeId: string
}

function phraseSpanKey(p: PhraseSpan): string {
  return `${p.start}:${p.end}:${p.pattern_name}`
}

function spanFromKey(key: string, phraseSpans: PhraseSpan[]): PhraseSpan | null {
  return phraseSpans.find((p) => phraseSpanKey(p) === key) ?? null
}

/** POS type ids allowed in this phrase slot = sequence of the matched chunk pattern. */
function posTypeSetForPhraseTemplate(
  span: PhraseSpan,
  chunkPatterns: ChunkPatternRow[] | undefined
): Set<number> | null {
  if (!chunkPatterns?.length) return null
  const pid = span.pattern_id
  const byId = pid != null ? chunkPatterns.find((c) => Number(c.id) === Number(pid)) : undefined
  const byName = chunkPatterns.find((c) => c.name === span.pattern_name)
  const pat = byId ?? byName
  const seq = (pat?.pos_pattern as { sequence?: number[] })?.sequence
  if (!Array.isArray(seq) || seq.length === 0) return null
  return new Set(seq.map((n) => Number(n)))
}

function findPhraseSpanForVariant(
  v: PatternQuestionVariant,
  cfg: PatternQuestionConfig,
  phraseSpans: PhraseSpan[]
): PhraseSpan | null {
  if (!phraseSpans.length) return null
  const rep = v.replace_span ?? (v.slot_index != null ? { start: v.slot_index, end: v.slot_index } : null)
  const cfgRep =
    cfg.replace_span ?? (cfg.slot_index != null ? { start: cfg.slot_index, end: cfg.replace_span?.end ?? cfg.slot_index } : null)
  const effRep = rep ?? cfgRep
  const focus = effRep?.start ?? v.slot_index ?? cfg.slot_index
  const name = v.when?.in_phrase_name

  if (name) {
    const candidates = phraseSpans.filter((p) => p.pattern_name === name)
    if (candidates.length === 1) return candidates[0]!
    if (candidates.length > 1 && focus != null) {
      for (const c of candidates) {
        if (focus >= c.start && focus < c.end) return c
      }
    }
    if (candidates.length > 1) return candidates[0]!
  }
  if (focus != null) {
    for (const p of phraseSpans) {
      if (focus >= p.start && focus < p.end) return p
    }
  }
  return phraseSpans[0] ?? null
}

function variantToSimpleRow(
  v: PatternQuestionVariant,
  cfg: PatternQuestionConfig,
  ctx: PhraseRuleCtx,
  _maxOrdinal: number
): SimpleRuleRow {
  const interrogativeId = interrogativeIdForText(v.text ?? '')

  const rep = v.replace_span
  const vs = v.slot_index
  const effRep = rep ?? (vs != null ? { start: vs, end: vs } : cfg.replace_span ?? null)
  let useStart: number
  let useEnd: number
  if (effRep) {
    useStart = effRep.start
    useEnd = effRep.end
  } else if (vs != null) {
    useStart = vs
    useEnd = vs
  } else {
    useStart = cfg.slot_index
    useEnd = cfg.replace_span ? cfg.replace_span.end : cfg.slot_index
  }

  const when = v.when
  const st0 = when?.slot_text?.[0]
  const sp0 = when?.slot_pos?.[0]
  const slotCond = st0?.slot ?? sp0?.slot
  const inPhrase = when?.in_phrase_name

  const { start: ps, end: pe, name: phraseName } = ctx
  const endIncl = pe - 1
  if (useStart === ps && useEnd === endIncl && inPhrase === phraseName) {
    return { target: 'all', interrogativeId }
  }
  if (slotCond != null && inPhrase === phraseName) {
    return { target: slotCond, interrogativeId }
  }
  if (useStart === useEnd && inPhrase === phraseName) {
    return { target: useStart, interrogativeId }
  }
  if (useStart >= ps && useEnd <= endIncl) {
    if (useStart === ps && useEnd === endIncl) return { target: 'all', interrogativeId }
    return { target: useStart, interrogativeId }
  }
  return { target: 'all', interrogativeId }
}

function bucketVariantsIntoRules(
  cfg: PatternQuestionConfig | null,
  phraseSpans: PhraseSpan[],
  maxOrdinal: number
): Record<string, SimpleRuleRow[]> {
  const out: Record<string, SimpleRuleRow[]> = {}
  for (const p of phraseSpans) {
    out[phraseSpanKey(p)] = []
  }
  if (!cfg?.variants?.length) return out
  for (const v of cfg.variants) {
    const span = findPhraseSpanForVariant(v, cfg, phraseSpans)
    if (!span) continue
    const k = phraseSpanKey(span)
    if (!out[k]) out[k] = []
    const ctx: PhraseRuleCtx = { name: span.pattern_name, start: span.start, end: span.end }
    out[k]!.push(variantToSimpleRow(v, cfg, ctx, maxOrdinal))
  }
  return out
}

function simpleRowToVariant(
  row: SimpleRuleRow,
  posBlueprint: (number | null)[],
  ctx: PhraseRuleCtx
): PatternQuestionVariant | null {
  const iq = getInterrogativeById(row.interrogativeId) ?? INTERROGATIVE_OPTIONS[0]!
  const text = iq.text
  const label = iq.label

  let when: PatternQuestionVariant['when']
  let replace_span: PatternQuestionVariant['replace_span']
  let slot_index: number | undefined

  const { name, start: ps, end: pe } = ctx
  const endIncl = pe - 1
  if (row.target === 'all') {
    when = { in_phrase_name: name }
    replace_span = { start: ps, end: endIncl }
  } else {
    const k = row.target
    if (k < ps || k > endIncl) return null
    const posId = posBlueprint[k]
    if (posId == null) return null
    slot_index = k
    when = { in_phrase_name: name, slot_pos: [{ slot: k, pos_type_id: posId }] }
  }

  const out: PatternQuestionVariant = { text, label }
  if (when && Object.keys(when).length) out.when = when
  if (replace_span) out.replace_span = replace_span
  if (slot_index != null) out.slot_index = slot_index
  return out
}

function wordLabel(contentWords: string[], ordinal: number): string {
  const w = contentWords[ordinal]?.trim()
  return w && w.length > 0 ? w : `(${ordinal + 1})`
}

function SentencePatternQuestionForm({
  posBlueprint,
  phraseSpans,
  contentWords,
  chunkPatterns,
  initialQuestionConfig,
  onSave,
  isPending,
}: {
  posBlueprint: (number | null)[]
  phraseSpans: PhraseSpan[]
  contentWords: string[]
  chunkPatterns: ChunkPatternRow[]
  initialQuestionConfig: PatternQuestionConfig | null
  onSave: (cfg: PatternQuestionConfig | null) => void
  isPending: boolean
}) {
  const maxOrdinal = posBlueprint.filter((v) => v != null).length - 1

  const defaultRow = (): SimpleRuleRow => ({
    target: 'all',
    interrogativeId: INTERROGATIVE_OPTIONS[0]!.id,
  })

  const [activeSpanKey, setActiveSpanKey] = useState<string>(() =>
    phraseSpans.length > 0 ? phraseSpanKey(phraseSpans[0]!) : ''
  )

  const [rulesBySpan, setRulesBySpan] = useState<Record<string, SimpleRuleRow[]>>(() =>
    bucketVariantsIntoRules(initialQuestionConfig, phraseSpans, maxOrdinal)
  )

  const targetOptions = useMemo(() => {
    const span = spanFromKey(activeSpanKey, phraseSpans)
    if (!span) return []
    const allowed = posTypeSetForPhraseTemplate(span, chunkPatterns)
    const opts: { ordinal: number; label: string }[] = []
    for (let o = span.start; o < span.end; o++) {
      const pid = posBlueprint[o] ?? null
      if (pid == null) continue
      if (allowed && !allowed.has(pid)) continue
      opts.push({ ordinal: o, label: wordLabel(contentWords, o) })
    }
    if (opts.length === 0) {
      for (let o = span.start; o < span.end; o++) {
        const pid = posBlueprint[o] ?? null
        if (pid == null) continue
        opts.push({ ordinal: o, label: wordLabel(contentWords, o) })
      }
    }
    return opts
  }, [activeSpanKey, phraseSpans, contentWords, posBlueprint, chunkPatterns])

  const rawRules = rulesBySpan[activeSpanKey]
  const rules = rawRules === undefined ? [defaultRow()] : rawRules

  const setRules = (updater: (prev: SimpleRuleRow[]) => SimpleRuleRow[]) => {
    setRulesBySpan((prev) => {
      const cur = prev[activeSpanKey] !== undefined ? prev[activeSpanKey]! : [defaultRow()]
      return { ...prev, [activeSpanKey]: updater(cur) }
    })
  }

  if (!phraseSpans.length) {
    return (
      <p className="text-xs text-amber-800 mt-2">
        No phrase template on this sentence pattern. Save it again from the story editor so phrase chunks are detected.
      </p>
    )
  }

  const activeSpan = spanFromKey(activeSpanKey, phraseSpans) ?? phraseSpans[0]!
  const activeLabel = activeSpan.pattern_name

  return (
    <div className="mt-2 space-y-3 pl-1">
      <p className="text-xs text-gray-500">
        Pick the <strong>phrase slot</strong> (same template as the sentence). Then: <strong>All</strong> or one word whose{' '}
        <strong>POS is in that phrase pattern</strong>, and the <strong>interrogative</strong>.
      </p>

      <div className="flex flex-wrap gap-1">
        {phraseSpans.map((p) => {
          const k = phraseSpanKey(p)
          return (
            <button
              key={k}
              type="button"
              onClick={() => setActiveSpanKey(k)}
              className={`px-2 py-1 text-xs rounded border ${
                activeSpanKey === k
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white border-gray-300 text-gray-700'
              }`}
            >
              {p.pattern_name}
            </button>
          )
        })}
      </div>

      <div className="space-y-3">
        <span className="text-xs font-medium text-gray-600">Rules for “{activeLabel}”</span>
        {rules.map((row, i) => {
          const ordinals = new Set(targetOptions.map((s) => s.ordinal))
          const targetSafe =
            row.target === 'all'
              ? 'all'
              : ordinals.has(row.target as number)
                ? String(row.target)
                : 'all'
          return (
            <div key={i} className="border rounded p-3 space-y-2 bg-gray-50/50">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <label className="text-xs text-gray-600">All or word</label>
                  <select
                    value={targetSafe}
                    onChange={(e) => {
                      const v = e.target.value
                      setRules((prev) => {
                        const next = [...prev]
                        next[i] = {
                          ...next[i]!,
                          target: v === 'all' ? 'all' : Number(v),
                        }
                        return next
                      })
                    }}
                    className="border rounded px-2 py-1 text-sm w-full max-w-xs"
                  >
                    <option value="all">All</option>
                    {targetOptions.map(({ ordinal, label }) => (
                      <option key={ordinal} value={String(ordinal)}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <label className="text-xs text-gray-600">Interrogative</label>
                  <select
                    value={
                      INTERROGATIVE_OPTIONS.some((o) => o.id === row.interrogativeId)
                        ? row.interrogativeId
                        : INTERROGATIVE_OPTIONS[0]!.id
                    }
                    onChange={(e) => {
                      setRules((prev) => {
                        const next = [...prev]
                        next[i] = { ...next[i]!, interrogativeId: e.target.value }
                        return next
                      })
                    }}
                    className="border rounded px-2 py-1 text-sm max-w-[12rem]"
                  >
                    {INTERROGATIVE_OPTIONS.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="text-xs text-red-600 shrink-0 px-1 self-end"
                  onClick={() =>
                    setRules((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          )
        })}
        <button
          type="button"
          className="text-xs text-blue-600"
          onClick={() => setRules((prev) => [...prev, defaultRow()])}
        >
          + Add rule
        </button>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={isPending || !posBlueprint.some((id) => id != null)}
          className="px-2 py-1 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
          onClick={() => {
            const cleaned: PatternQuestionVariant[] = []
            for (const p of phraseSpans) {
              const key = phraseSpanKey(p)
              const rows = rulesBySpan[key]
              if (!rows?.length) continue
              const ctx: PhraseRuleCtx = { name: p.pattern_name, start: p.start, end: p.end }
              for (const r of rows) {
                const v = simpleRowToVariant(r, posBlueprint, ctx)
                if (v) cleaned.push(v)
              }
            }
            if (!cleaned.length) {
              onSave(null)
              return
            }
            const payload: PatternQuestionConfig = {
              slot_index: 0,
              variants: cleaned,
            }
            onSave(payload)
          }}
        >
          {isPending ? 'Saving…' : 'Save question config'}
        </button>
        <button
          type="button"
          disabled={isPending || !initialQuestionConfig}
          className="px-2 py-1 text-sm border rounded disabled:opacity-50"
          onClick={() => onSave(null)}
        >
          Clear
        </button>
      </div>
    </div>
  )
}

export default function Patterns() {
  const [activeTab, setActiveTab] = useState<TabId>('phrases')
  const [pattern, setPattern] = useState<number[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const queryClient = useQueryClient()
  const { show: showDbConfirmation } = useDbConfirmation()

  const { data: posTypes = [] } = useQuery({
    queryKey: ['pos_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pos_types')
        .select('id, code, label, color')
        .order('label')
      if (error) throw error
      return data as PosType[]
    },
  })

  const { data: patterns, isLoading, error } = useQuery({
    queryKey: ['pos_chunk_patterns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pos_chunk_patterns')
        .select('id, name, description, pos_pattern, is_active, created_at')
        .order('id')
      if (error) throw error
      return data
    },
  })

  const {
    data: sentencePatterns = [],
    isLoading: sentencesLoading,
    error: sentencePatternsError,
  } = useQuery({
    queryKey: ['sentence_patterns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sentence_patterns')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const insertMutation = useMutation({
    mutationFn: async () => {
      const { data: maxRow } = await supabase
        .from('pos_chunk_patterns')
        .select('id')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()
      const nextId = maxRow?.id != null ? Number(maxRow.id) + 1 : 1
      const pos_pattern = { sequence: pattern }
      const { data, error } = await supabase
        .from('pos_chunk_patterns')
        .insert({
          id: nextId,
          name: name.trim() || `Pattern ${pattern.map((id) => posTypes.find((p) => p.id === id)?.label ?? id).join('-')}`,
          description: description.trim() || null,
          pos_pattern,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos_chunk_patterns'] })
      showDbConfirmation({ tables: ['pos_chunk_patterns'], details: ['pos_chunk_patterns: inserted pattern'] })
      setPattern([])
      setName('')
      setDescription('')
    },
  })

  const saveSentenceQuestionConfigMutation = useMutation({
    mutationFn: async ({ id, question_config }: { id: number; question_config: PatternQuestionConfig | null }) => {
      const { error } = await supabase.from('sentence_patterns').update({ question_config }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sentence_patterns'] })
      showDbConfirmation({ tables: ['sentence_patterns'], details: ['Updated question generation config'] })
    },
  })

  const addToPattern = (posTypeId: number) => {
    setPattern((p) => [...p, posTypeId])
  }

  const removeFromPattern = (idx: number) => {
    setPattern((p) => p.filter((_, i) => i !== idx))
  }

  if (isLoading) return <div className="p-6">Loading...</div>
  if (error) return <div className="p-6 text-red-600">Error: {formatError(error)}</div>

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Patterns</h1>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab('phrases')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'phrases'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Phrases
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sentences')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'sentences'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Sentences
        </button>
      </div>

      {activeTab === 'phrases' && (
        <>
          <section className="mb-8">
            <p className="text-sm text-gray-500 mb-2">Add POS types to build a phrase pattern:</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {posTypes.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addToPattern(p.id)}
                  className="px-2 py-1 text-sm rounded border border-gray-300 hover:opacity-90"
                  style={{ backgroundColor: getPosTypeBackgroundColor(p.color) }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="border rounded p-2 min-h-[2.5rem] flex flex-wrap items-center gap-1">
              {pattern.length === 0 ? (
                <span className="text-gray-400 text-sm">Click buttons above to add...</span>
              ) : (
                pattern.map((id, idx) => {
                  const pt = posTypes.find((p) => p.id === id)
                  return (
                    <span
                      key={`${id}-${idx}`}
                      className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-sm"
                      style={{ backgroundColor: getPosTypeBackgroundColor(pt?.color) }}
                    >
                      {pt?.label ?? id}
                      <button
                        type="button"
                        onClick={() => removeFromPattern(idx)}
                        className="text-gray-500 hover:text-red-600"
                      >
                        ×
                      </button>
                    </span>
                  )
                })
              )}
            </div>

            {pattern.length >= 2 && (
              <div className="mt-4 space-y-3 p-3 border rounded bg-gray-50">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Verb-Noun phrase"
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional"
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => insertMutation.mutate()}
                  disabled={insertMutation.isPending}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {insertMutation.isPending ? 'Saving...' : 'Save pattern'}
                </button>
                {insertMutation.isError && (
                  <p className="text-red-600 text-sm">{(insertMutation.error as Error)?.message}</p>
                )}
              </div>
            )}
          </section>

          <p className="text-sm text-gray-500 mb-4">Saved phrase patterns:</p>
          {!patterns?.length ? (
            <p className="text-gray-500">No patterns yet.</p>
          ) : (
            <ul className="space-y-2">
              {patterns.map((p) => {
                const seq = (p.pos_pattern as { sequence?: number[] })?.sequence ?? []
                return (
                  <li key={p.id} className="border rounded p-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium">{p.name}</span>
                      {!p.is_active && (
                        <span className="text-xs text-gray-500">inactive</span>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-sm text-gray-600 mt-1">{p.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-4">
                      <span className="inline-flex flex-col items-center" title={p.name}>
                        <span className="inline-flex items-center gap-0">
                          {seq.map((id, idx) => {
                            const pt = posTypes.find((t) => t.id === id)
                            return (
                              <span
                                key={`${p.id}-${idx}`}
                                className="px-1 py-0.5 text-xs rounded shrink-0"
                                style={{ backgroundColor: getPosTypeBackgroundColor(pt?.color) }}
                              >
                                {pt?.label ?? id}
                              </span>
                            )
                          })}
                        </span>
                        <span className="text-[10px] text-blue-600 font-medium -mt-0.5">
                          {p.name}
                        </span>
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {activeTab === 'sentences' && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            Sentence patterns are saved from the story editor. When editing a sentence, use &quot;Save sentence pattern&quot; to capture its POS blueprint and phrase components.
          </p>
          {sentencePatternsError ? (
            <p className="text-red-600 text-sm">
              Could not load sentence patterns: {formatError(sentencePatternsError)}
            </p>
          ) : sentencesLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : !sentencePatterns.length ? (
            <p className="text-gray-500">No sentence patterns yet.</p>
          ) : (
            <ul className="space-y-2">
              {sentencePatterns.map((sp) => {
                const posBlueprint = (sp.pos_blueprint ?? []) as (number | null)[]
                const phraseComponents = (sp.phrase_components ?? []) as {
                  pattern_id?: number
                  pattern_name?: string
                  start?: number
                  end?: number
                }[]
                const hasSpans = phraseComponents.some((pc) => pc.start != null && pc.end != null)
                let sortedPhrases: { pattern_name?: string; pattern_id?: number; start: number; end: number }[] =
                  []
                if (hasSpans) {
                  sortedPhrases = phraseComponents
                    .filter((pc): pc is typeof pc & { start: number; end: number } =>
                      pc.start != null && pc.end != null
                    )
                    .map((pc) => ({
                      pattern_name: pc.pattern_name,
                      pattern_id: pc.pattern_id != null ? Number(pc.pattern_id) : undefined,
                      start: pc.start,
                      end: pc.end,
                    }))
                    .sort((a, b) => a.start - b.start)
                } else if (phraseComponents.length > 0 && patterns?.length) {
                  const nonNull = posBlueprint.map((v, i) => ({ v, i })).filter((p) => p.v != null)
                  let lastIdx = 0
                  for (const pc of phraseComponents) {
                    const name = pc.pattern_name ?? (pc as { name?: string }).name
                    if (!name) continue
                    const pat = patterns.find((p) => p.name === name)
                    const seq = (pat?.pos_pattern as { sequence?: number[] })?.sequence
                    if (!Array.isArray(seq) || seq.length < 2) continue
                    let found = false
                    for (let k = lastIdx; k <= nonNull.length - seq.length; k++) {
                      if (seq.every((s, j) => nonNull[k + j].v === s)) {
                        const start = nonNull[k].i
                        const end = nonNull[k + seq.length - 1].i + 1
                        sortedPhrases.push({
                          pattern_name: name,
                          pattern_id: pat?.id != null ? Number(pat.id) : undefined,
                          start,
                          end,
                        })
                        lastIdx = k + seq.length
                        found = true
                        break
                      }
                    }
                    if (!found) lastIdx = nonNull.length
                  }
                }
                if (sortedPhrases.length === 0 && patterns?.length) {
                  const bp = posBlueprint.filter((v): v is number => v != null)
                  const sorted = [...patterns]
                    .filter((p) => Array.isArray((p.pos_pattern as { sequence?: number[] })?.sequence) && ((p.pos_pattern as { sequence?: number[] })?.sequence?.length ?? 0) >= 2)
                    .sort((a, b) => ((b.pos_pattern as { sequence?: number[] })?.sequence?.length ?? 0) - ((a.pos_pattern as { sequence?: number[] })?.sequence?.length ?? 0))
                  let i = 0
                  while (i < bp.length) {
                    let matched: { len: number; name: string; patternId?: number } | null = null
                    for (const p of sorted) {
                      const seq = (p.pos_pattern as { sequence?: number[] })?.sequence
                      if (!Array.isArray(seq) || i + seq.length > bp.length) continue
                      if (seq.every((s, j) => bp[i + j] === s)) {
                        matched = {
                          len: seq.length,
                          name: p.name ?? '',
                          patternId: p.id != null ? Number(p.id) : undefined,
                        }
                        break
                      }
                    }
                    if (matched) {
                      sortedPhrases.push({
                        pattern_name: matched.name,
                        pattern_id: matched.patternId,
                        start: i,
                        end: i + matched.len,
                      })
                      i += matched.len
                    } else {
                      i += 1
                    }
                  }
                }
                type Seg = { type: 'phrase'; pc: { pattern_name?: string; start: number; end: number }; indices: number[] } | { type: 'ungrouped'; indices: number[] }
                const segments: Seg[] = []
                if (sortedPhrases.length > 0) {
                  let lastEnd = 0
                  for (const pc of sortedPhrases) {
                    if (pc.start > lastEnd) {
                      segments.push({ type: 'ungrouped', indices: Array.from({ length: pc.start - lastEnd }, (_, i) => lastEnd + i) })
                    }
                    segments.push({ type: 'phrase', pc, indices: Array.from({ length: pc.end - pc.start }, (_, i) => pc.start + i) })
                    lastEnd = pc.end
                  }
                  if (lastEnd < posBlueprint.length) {
                    segments.push({ type: 'ungrouped', indices: Array.from({ length: posBlueprint.length - lastEnd }, (_, i) => lastEnd + i) })
                  }
                }
                return (
                  <li key={sp.id} className="border rounded p-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium">{sp.name}</span>
                    </div>
                    {sp.description && (
                      <p className="text-sm text-gray-600 mt-1">{sp.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-4">
                      {segments.length > 0 ? (
                        segments.map((seg, sIdx) =>
                          seg.type === 'phrase' ? (
                            <span
                              key={`${sp.id}-seg-${sIdx}`}
                              className="inline-flex flex-col items-center"
                              title={seg.pc.pattern_name}
                            >
                              <span className="inline-flex items-center gap-0">
                                {seg.indices
                                  .filter((idx) => posBlueprint[idx] != null)
                                  .map((idx) => {
                                    const id = posBlueprint[idx]
                                    const pt = posTypes.find((t) => t.id === id)
                                    return (
                                      <span
                                        key={`${sp.id}-pos-${idx}`}
                                        className="px-1 py-0.5 text-xs rounded shrink-0"
                                        style={{ backgroundColor: getPosTypeBackgroundColor(pt?.color) }}
                                      >
                                        {pt?.label ?? id}
                                      </span>
                                    )
                                  })}
                              </span>
                              <span className="text-[10px] text-blue-600 font-medium -mt-0.5">
                                {seg.pc.pattern_name}
                              </span>
                            </span>
                          ) : (
                            <span key={`${sp.id}-seg-${sIdx}`} className="inline-flex gap-0 items-center">
                              {seg.indices
                                .filter((idx) => posBlueprint[idx] != null)
                                .map((idx) => {
                                  const id = posBlueprint[idx]
                                  const pt = posTypes.find((t) => t.id === id)
                                  return (
                                    <span
                                      key={`${sp.id}-pos-${idx}`}
                                      className="px-1 py-0.5 text-xs rounded shrink-0"
                                      style={{ backgroundColor: getPosTypeBackgroundColor(pt?.color) }}
                                    >
                                      {pt?.label ?? id}
                                    </span>
                                  )
                                })}
                            </span>
                          )
                        )
                      ) : (
                        <span className="inline-flex gap-0 items-center">
                          {posBlueprint
                            .map((id, idx) => (id != null ? { id, idx } : null))
                            .filter((p): p is { id: number; idx: number } => p != null)
                            .map(({ id, idx }) => {
                              const pt = posTypes.find((t) => t.id === id)
                              return (
                                <span
                                  key={`${sp.id}-pos-${idx}`}
                                  className="px-1 py-0.5 text-xs rounded shrink-0"
                                  style={{ backgroundColor: getPosTypeBackgroundColor(pt?.color) }}
                                >
                                  {pt?.label ?? id}
                                </span>
                              )
                            })}
                          {phraseComponents.length > 0 && (
                            <span className="text-xs text-gray-500 ml-1">
                              ({phraseComponents.map((pc) => pc.pattern_name).join(' → ')})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <details className="mt-2">
                      <summary className="text-xs font-medium text-gray-600 cursor-pointer select-none">
                        Question generation
                      </summary>
                      <SentencePatternQuestionForm
                        posBlueprint={posBlueprint}
                        phraseSpans={sortedPhrases
                          .filter((pc): pc is typeof pc & { pattern_name: string } => !!pc.pattern_name)
                          .map((pc) => ({
                            pattern_name: pc.pattern_name,
                            pattern_id: pc.pattern_id,
                            start: pc.start,
                            end: pc.end,
                          }))}
                        contentWords={(sp.content_words ?? []) as string[]}
                        chunkPatterns={(patterns ?? []) as ChunkPatternRow[]}
                        initialQuestionConfig={(sp.question_config as PatternQuestionConfig | null) ?? null}
                        onSave={(cfg) => saveSentenceQuestionConfigMutation.mutate({ id: sp.id, question_config: cfg })}
                        isPending={saveSentenceQuestionConfigMutation.isPending}
                      />
                    </details>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
