/**
 * Word metadata: custom fields per word in word_registry.
 * When VITE_WORD_METADATA_DRY_RUN=true, skips all persist (for testing).
 */

import { supabase } from './supabase'
import { stripPunctuationFromWord } from './tokens'

const DRY_RUN = import.meta.env.VITE_WORD_METADATA_DRY_RUN === 'true' || import.meta.env.VITE_WORD_METADATA_DRY_RUN === '1'

export const WORD_METADATA_FIELD_TYPES = [
  'text',
  'image',
  'link',
  'video',
  'single_select',
  'multi_select',
] as const

export type WordMetadataFieldType = (typeof WORD_METADATA_FIELD_TYPES)[number]

export function isWordMetadataFieldType(t: unknown): t is WordMetadataFieldType {
  return typeof t === 'string' && (WORD_METADATA_FIELD_TYPES as readonly string[]).includes(t)
}

export type WordMetadataFieldDef = {
  id: number
  key: string
  type: WordMetadataFieldType
  label: string | null
  /** Select options: JSON array of strings in DB. */
  options: unknown[]
}

export async function fetchWordMetadata(wordText: string): Promise<Record<string, unknown>> {
  const norm = stripPunctuationFromWord(wordText).toLowerCase()
  if (!norm) return {}
  const { data, error } = await supabase
    .from('word_registry')
    .select('metadata')
    .eq('word_text', norm)
    .maybeSingle()
  if (error || !data) return {}
  return (data.metadata as Record<string, unknown>) ?? {}
}

export async function upsertWordMetadata(
  wordText: string,
  updates: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const norm = stripPunctuationFromWord(wordText).toLowerCase()
  if (!norm) return { ok: false, error: 'Empty word' }
  if (DRY_RUN) return { ok: true }
  const { data: existing, error: fetchErr } = await supabase
    .from('word_registry')
    .select('pos_types, metadata')
    .eq('word_text', norm)
    .maybeSingle()
  if (fetchErr) return { ok: false, error: fetchErr.message }
  const current = (existing?.metadata as Record<string, unknown>) ?? {}
  const merged = { ...current, ...updates }
  if (existing) {
    const { error: updateErr } = await supabase
      .from('word_registry')
      .update({ metadata: merged })
      .eq('word_text', norm)
    if (updateErr) return { ok: false, error: updateErr.message }
  } else {
    const { error: insertErr } = await supabase.from('word_registry').insert({
      word_text: norm,
      pos_types: [],
      metadata: merged,
      language: 'mi',
    })
    if (insertErr) return { ok: false, error: insertErr.message }
  }
  return { ok: true }
}

function normalizeFieldDef(row: Record<string, unknown>): WordMetadataFieldDef {
  const o = row.options
  const rawType = row.type
  const normalizedType =
    rawType === 'select' ? 'single_select' : rawType
  return {
    id: row.id as number,
    key: String(row.key ?? ''),
    type: isWordMetadataFieldType(normalizedType) ? normalizedType : 'text',
    label: (row.label as string | null) ?? null,
    options: Array.isArray(o) ? o : [],
  }
}

export async function fetchFieldDefinitions(): Promise<WordMetadataFieldDef[]> {
  const { data, error } = await supabase
    .from('word_metadata_field_definitions')
    .select('id, key, type, label, options')
    .order('id')
  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(normalizeFieldDef)
}

export function parseOptionsCsv(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function addFieldDefinition(
  key: string,
  type: WordMetadataFieldType,
  label?: string,
  options?: string[]
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const k = key.trim().toLowerCase().replace(/\s+/g, '_')
  if (!k) return { ok: false, error: 'Key required' }
  if (type === 'single_select' || type === 'multi_select') {
    if (!options?.length) return { ok: false, error: 'Add at least one option (comma-separated)' }
  }
  if (DRY_RUN) return { ok: true, id: -1 }
  const { data, error } = await supabase
    .from('word_metadata_field_definitions')
    .insert({
      key: k,
      type,
      label: label?.trim() || null,
      options: type === 'single_select' || type === 'multi_select' ? options : [],
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data.id }
}
