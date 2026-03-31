/**
 * Derives course definition (tokens, pos types, phrases, sentence structures) from the linked story.
 * Data is found by the story - no separate storage.
 */

import { supabase } from './supabase'
import { stripPunctuationFromWord } from './tokens'
import { findPatternRunsWithNames } from './patternMatch'
import type { SentenceToken } from '../db/schema'

export type UniqueToken = { word: string; posTypeId: number; posLabel: string }
export type PosTypeDef = { id: number; code: string; label: string; color: string | null }
export type PhraseDef = { id: number; name: string; sequence: number[]; posLabels: string[] }
export type SentenceStructureDef = { id: number; name: string; posBlueprint: number[]; posLabels: string[]; phraseComponents: unknown[] }

export type CourseDefinition = {
  uniqueTokens: UniqueToken[]
  posTypes: PosTypeDef[]
  phrases: PhraseDef[]
  sentenceStructures: SentenceStructureDef[]
}

type CourseRow = { id: number; title_id: number | null; version_id: number | null }

/** Resolves effective title_id and version_id for a course. */
async function resolveCourseStory(courseId: number): Promise<{ titleId: number; versionId: number } | null> {
  const { data: course, error: courseErr } = await supabase
    .from('courses')
    .select('title_id, version_id')
    .eq('id', courseId)
    .single()
  if (courseErr || !course) return null
  const c = course as CourseRow
  if (!c.title_id) return null

  let versionId = c.version_id
  if (!versionId) {
    const { data: ver } = await supabase
      .from('story_versions')
      .select('id')
      .eq('title_id', c.title_id)
      .eq('version_number', 10)
      .maybeSingle()
    versionId = ver?.id ?? null
  }
  if (!versionId) return null
  return { titleId: c.title_id, versionId }
}

/** Returns course definition derived from the story. */
export async function getCourseDefinition(courseId: number): Promise<CourseDefinition | null> {
  const resolved = await resolveCourseStory(courseId)
  if (!resolved) return null
  const { titleId, versionId } = resolved

  const { data: sentences } = await supabase
    .from('story_sentences')
    .select('id, sentence_text, tokens_array')
    .eq('version_id', versionId)
    .order('sentence_number')

  const { data: posTypesAll } = await supabase
    .from('pos_types')
    .select('id, code, label, color')
  const posById = new Map((posTypesAll ?? []).map((p) => [p.id, p]))

  if (!sentences?.length) {
    return {
      uniqueTokens: [],
      posTypes: [],
      phrases: [],
      sentenceStructures: await getSentencePatternsForTitle(titleId, posById),
    }
  }

  const tokenSet = new Map<string, number>()
  const posTypeIds = new Set<number>()
  for (const row of sentences) {
    const arr = row.tokens_array as SentenceToken[] | null
    if (!Array.isArray(arr)) continue
    for (const t of arr) {
      if (t.pos_type_id != null) posTypeIds.add(t.pos_type_id)
      const word = stripPunctuationFromWord(String(t.text ?? '').trim())
      if (word && t.pos_type_id != null) {
        const key = `${word}:${t.pos_type_id}`
        if (!tokenSet.has(key)) tokenSet.set(key, t.pos_type_id)
      }
    }
  }

  const uniqueTokens: UniqueToken[] = Array.from(tokenSet.entries()).map(([k, posTypeId]) => {
    const word = k.split(':')[0]
    const pos = posById.get(posTypeId)
    return { word, posTypeId, posLabel: pos?.label ?? pos?.code ?? String(posTypeId) }
  }
  ).sort((a, b) => a.word.localeCompare(b.word) || a.posLabel.localeCompare(b.posLabel))

  const posTypes: PosTypeDef[] = Array.from(posTypeIds)
    .sort((a, b) => (posById.get(a)?.label ?? '').localeCompare(posById.get(b)?.label ?? ''))
    .map((id) => {
      const p = posById.get(id)
      return p ? { id, code: p.code, label: p.label, color: p.color ?? null } : null
    })
    .filter((p): p is PosTypeDef => p != null)

  const { data: phrasePatterns } = await supabase
    .from('pos_chunk_patterns')
    .select('id, name, pos_pattern')
    .eq('is_active', true)
  const patterns = (phrasePatterns ?? []).map((p) => ({
    id: p.id,
    name: p.name ?? '',
    sequence: (p.pos_pattern as { sequence?: number[] })?.sequence ?? [],
  }))

  const matchedPhraseIds = new Set<number>()
  for (const sent of sentences) {
    const arr = sent.tokens_array as SentenceToken[] | null
    if (!Array.isArray(arr)) continue
    const runs = findPatternRunsWithNames(arr, patterns)
    for (const r of runs) matchedPhraseIds.add(r.patternId)
  }
  const phrases: PhraseDef[] = patterns
    .filter((p) => matchedPhraseIds.has(p.id))
    .map((p) => ({
      ...p,
      posLabels: p.sequence.map((id) => posById.get(id)?.label ?? posById.get(id)?.code ?? String(id)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const sentenceStructures = await getSentencePatternsForTitle(titleId, posById)

  return {
    uniqueTokens,
    posTypes,
    phrases,
    sentenceStructures,
  }
}

async function getSentencePatternsForTitle(
  titleId: number,
  posById: Map<number, { id: number; code: string; label: string; color?: string | null }>
): Promise<SentenceStructureDef[]> {
  const { data } = await supabase
    .from('sentence_patterns')
    .select('id, name, pos_blueprint, phrase_components')
    .eq('title_id', titleId)
    .order('name')
  return (data ?? []).map((r) => {
    const blueprint = (r.pos_blueprint ?? []) as number[]
    return {
      id: r.id,
      name: r.name ?? '',
      posBlueprint: blueprint,
      posLabels: blueprint.map((id) => posById.get(id)?.label ?? posById.get(id)?.code ?? String(id)),
      phraseComponents: (r.phrase_components ?? []) as unknown[],
    }
  })
}
