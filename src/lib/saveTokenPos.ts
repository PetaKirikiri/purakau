import { getTokensFromSentence, getTextFromTokens, stripPunctuationFromWord } from './tokens'
import { supabase } from './supabase'
import type { SentenceToken } from '../db/schema'

/**
 * Saves a POS assignment to the matching token in story_sentences.tokens_array
 * and upserts the word into word_registry.
 *
 * @example
 * const result = await saveTokenPos({ type: 'story_sentence', sentenceId }, tokenIndex, posTypeId)
 * if (result.ok) {
 *   queryClient.invalidateQueries({ queryKey: ['story_sentences', storyId] })
 * } else {
 *   setError(result.error)
 * }
 */

type PosTypeEntry = { pos_type_id: number; code: string; auto?: boolean }

async function upsertWordRegistry(
  wordText: string,
  posTypeId: number,
  posCode: string,
  language = 'mi'
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('word_registry')
    .select('pos_types')
    .eq('word_text', wordText)
    .maybeSingle()

  if (fetchError) throw fetchError

  const newEntry: PosTypeEntry = { pos_type_id: posTypeId, code: posCode }

  if (!existing) {
    const { error: insertError } = await supabase.from('word_registry').insert({
      word_text: wordText,
      pos_types: [newEntry],
      language,
    })
    if (insertError) throw insertError
    return
  }

  const posTypes = (existing.pos_types ?? []) as PosTypeEntry[]
  const alreadyHas = posTypes.some((p) => p.pos_type_id === posTypeId)
  if (alreadyHas) return

  const { error: updateError } = await supabase
    .from('word_registry')
    .update({ pos_types: [...posTypes, newEntry] })
    .eq('word_text', wordText)
  if (updateError) throw updateError
}

async function upsertWordRegistryWithAuto(
  wordText: string,
  posTypeId: number,
  posCode: string,
  language = 'mi'
): Promise<void> {
  const norm = stripPunctuationFromWord(wordText)
  if (!norm) return
  const { data: existing, error: fetchError } = await supabase
    .from('word_registry')
    .select('pos_types')
    .eq('word_text', norm)
    .maybeSingle()
  if (fetchError) throw fetchError
  const newEntry: PosTypeEntry = { pos_type_id: posTypeId, code: posCode, auto: true }
  if (!existing) {
    const { error: insertError } = await supabase.from('word_registry').insert({
      word_text: norm,
      pos_types: [newEntry],
      language,
    })
    if (insertError) throw insertError
    return
  }
  const posTypes = (existing.pos_types ?? []) as PosTypeEntry[]
  const idx = posTypes.findIndex((p) => p.pos_type_id === posTypeId)
  const updated = idx >= 0
    ? posTypes.map((p, i) => (i === idx ? { ...p, auto: true } : p))
    : [...posTypes, newEntry]
  const { error: updateError } = await supabase
    .from('word_registry')
    .update({ pos_types: updated })
    .eq('word_text', norm)
  if (updateError) throw updateError
}

/** Replace a token's text. Used when switching a token to another word from the POS word list. */
export async function replaceTokenText(
  source: TokenSource,
  tokenIndex: number,
  newText: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (source.type === 'story_sentence') {
    return replaceTokenTextForSentence(source.sentenceId, tokenIndex, newText)
  }
  if (source.type === 'image_tag') {
    return replaceTokenTextForImageTag(source.imageTagId, tokenIndex, newText)
  }
  if (source.type === 'page_media_question') {
    return replaceTokenTextForPageMediaQuestion(source.questionId, tokenIndex, newText)
  }
  return { ok: false, error: 'Cannot replace token in editor mode' }
}

async function replaceTokenTextForSentence(
  sentenceId: number,
  tokenIndex: number,
  newText: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row, error: fetchError } = await supabase
    .from('story_sentences')
    .select('id, tokens_array, sentence_text')
    .eq('id', sentenceId)
    .single()
  if (fetchError || !row) return { ok: false, error: 'Sentence not found' }
  let tokens: SentenceToken[] = Array.isArray(row.tokens_array) ? row.tokens_array : []
  if (tokens.length === 0 && row.sentence_text) {
    tokens = getTokensFromSentence(String(row.sentence_text))
  }
  const token = tokens.find((t) => t.index === tokenIndex + 1) ?? tokens[tokenIndex] ?? null
  if (!token) return { ok: false, error: `Token at index ${tokenIndex} not found` }
  const updatedToken: SentenceToken = { ...token, text: newText.trim() }
  const finalTokens = [...tokens]
  const idx = tokens.indexOf(token)
  if (idx >= 0) finalTokens[idx] = updatedToken
  else finalTokens[tokenIndex] = updatedToken
  const sentenceText = getTextFromTokens({ tokens_array: finalTokens })
  const { error: updateError } = await supabase
    .from('story_sentences')
    .update({ tokens_array: finalTokens, sentence_text: sentenceText })
    .eq('id', sentenceId)
  if (updateError) return { ok: false, error: updateError.message }
  return { ok: true }
}

async function replaceTokenTextForImageTag(
  imageTagId: number,
  tokenIndex: number,
  newText: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row, error: fetchError } = await supabase
    .from('image_tags')
    .select('id, tokens_array, sentence_text')
    .eq('id', imageTagId)
    .single()
  if (fetchError || !row) return { ok: false, error: 'Image tag not found' }
  let tokens: SentenceToken[] = Array.isArray(row.tokens_array) ? row.tokens_array : []
  if (tokens.length === 0 && row.sentence_text) {
    tokens = getTokensFromSentence(String(row.sentence_text))
  }
  const token = tokens[tokenIndex] ?? null
  if (!token) return { ok: false, error: `Token at index ${tokenIndex} not found` }
  const updatedToken: SentenceToken = { ...token, text: newText.trim() }
  const finalTokens = [...tokens]
  const idx = tokens.indexOf(token)
  if (idx >= 0) finalTokens[idx] = updatedToken
  else finalTokens[tokenIndex] = updatedToken
  const sentenceText = getTextFromTokens({ tokens_array: finalTokens })
  const { error: updateError } = await supabase
    .from('image_tags')
    .update({ tokens_array: finalTokens, sentence_text: sentenceText })
    .eq('id', imageTagId)
  if (updateError) return { ok: false, error: updateError.message }
  return { ok: true }
}

async function replaceTokenTextForPageMediaQuestion(
  questionId: number,
  tokenIndex: number,
  newText: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row, error: fetchError } = await supabase
    .from('page_media_questions')
    .select('id, tokens_array')
    .eq('id', questionId)
    .single()
  if (fetchError || !row) return { ok: false, error: 'Question not found' }
  let tokens: SentenceToken[] = Array.isArray(row.tokens_array) ? row.tokens_array : []
  const token = tokens[tokenIndex] ?? null
  if (!token) return { ok: false, error: `Token at index ${tokenIndex} not found` }
  const updatedToken: SentenceToken = { ...token, text: newText.trim() }
  const finalTokens = [...tokens]
  const idx = tokens.indexOf(token)
  if (idx >= 0) finalTokens[idx] = updatedToken
  else finalTokens[tokenIndex] = updatedToken
  const { error: updateError } = await supabase
    .from('page_media_questions')
    .update({ tokens_array: finalTokens })
    .eq('id', questionId)
  if (updateError) return { ok: false, error: updateError.message }
  return { ok: true }
}

/** Add a word to word_registry with the given POS type. Used when adding another word to an existing POS from the token popover. */
export async function addWordToPosType(
  wordText: string,
  posTypeId: number,
  language = 'mi'
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cleaned = stripPunctuationFromWord(wordText)
  if (!cleaned) return { ok: false, error: 'Word is empty after stripping punctuation' }
  const { data: posRow, error: posError } = await supabase
    .from('pos_types')
    .select('id, code')
    .eq('id', posTypeId)
    .single()
  if (posError || !posRow) return { ok: false, error: 'POS type not found' }
  try {
    await upsertWordRegistry(cleaned, posTypeId, posRow.code, language)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'Failed to add word' }
  }
}

export type { SentenceToken }
export type SaveTokenPosDbConfirmation = { tables: string[]; details: string[] }
export type SaveTokenPosResult =
  | { ok: true; token: SentenceToken; dbConfirmation: SaveTokenPosDbConfirmation }
  | { ok: false; error: string }

export type TokenSource =
  | { type: 'story_sentence'; sentenceId: number }
  | { type: 'image_tag'; imageTagId: number }
  | { type: 'page_media_question'; questionId: number }
  | { type: 'editor'; tokens: SentenceToken[]; onTokensChange: (tokens: SentenceToken[]) => void }

export async function saveTokenPos(
  source: TokenSource,
  tokenIndex: number,
  selectedPosTypeId: number
): Promise<SaveTokenPosResult> {
  if (source.type === 'story_sentence') {
    return saveTokenPosForSentence(source.sentenceId, tokenIndex, selectedPosTypeId)
  }
  if (source.type === 'image_tag') {
    return saveImageTagTokenPos(source.imageTagId, tokenIndex, selectedPosTypeId)
  }
  if (source.type === 'page_media_question') {
    return savePageMediaQuestionTokenPos(source.questionId, tokenIndex, selectedPosTypeId)
  }
  return applyTokenPosForEditor(source, tokenIndex, selectedPosTypeId)
}

/**
 * Merges selected tokens (tokenStart..tokenEnd) into a single token with the given POS.
 * Adds the merged phrase (e.g. "kei te") to word_registry.
 * Replaces the span in tokens_array with the single new token and reindexes.
 */
export async function mergeTokensAndSetPos(
  sentenceId: number,
  tokenStart: number,
  tokenEnd: number,
  posTypeId: number
): Promise<SaveTokenPosResult> {
  const { data: row, error: fetchError } = await supabase
    .from('story_sentences')
    .select('id, tokens_array, sentence_text')
    .eq('id', sentenceId)
    .single()
  if (fetchError || !row) return { ok: false, error: 'Sentence not found' }
  let tokens: SentenceToken[] = Array.isArray(row.tokens_array) ? row.tokens_array : []
  if (tokens.length === 0 && row.sentence_text) {
    tokens = getTokensFromSentence(String(row.sentence_text))
  }
  if (tokenStart < 0 || tokenEnd >= tokens.length || tokenStart > tokenEnd) {
    return { ok: false, error: 'Invalid token range' }
  }
  const slice = tokens.slice(tokenStart, tokenEnd + 1)
  const mergedText = getTextFromTokens({ tokens_array: slice }).trim()
  if (!mergedText) return { ok: false, error: 'No text to merge' }

  const { data: posRow, error: posError } = await supabase
    .from('pos_types')
    .select('id, code')
    .eq('id', posTypeId)
    .single()
  if (posError || !posRow) return { ok: false, error: 'POS type not found' }

  const mergedToken: SentenceToken = {
    index: tokenStart + 1,
    text: mergedText,
    pos_type_id: posRow.id,
    word_pos_entry_id: null,
  }
  const finalTokens = [
    ...tokens.slice(0, tokenStart),
    mergedToken,
    ...tokens.slice(tokenEnd + 1),
  ].map((t, i) => ({ ...t, index: i + 1 }))

  const sentenceText = getTextFromTokens({ tokens_array: finalTokens })
  const { error: updateError } = await supabase
    .from('story_sentences')
    .update({ tokens_array: finalTokens, sentence_text: sentenceText })
    .eq('id', sentenceId)
  if (updateError) return { ok: false, error: updateError.message }

  const wordNorm = stripPunctuationFromWord(mergedText)
  if (wordNorm) await upsertWordRegistry(wordNorm, posRow.id, posRow.code)

  return {
    ok: true,
    token: { ...mergedToken, index: tokenStart + 1 },
    dbConfirmation: {
      tables: ['story_sentences', 'word_registry'],
      details: [`Merged "${mergedText}" → ${posRow.code}`],
    },
  }
}

/** Merge token range on a page picture question (same behaviour as story sentence merge). */
export async function mergeTokensAndSetPosPageMediaQuestion(
  questionId: number,
  tokenStart: number,
  tokenEnd: number,
  posTypeId: number
): Promise<SaveTokenPosResult> {
  const { data: row, error: fetchError } = await supabase
    .from('page_media_questions')
    .select('id, tokens_array')
    .eq('id', questionId)
    .single()
  if (fetchError || !row) return { ok: false, error: 'Question not found' }
  let tokens: SentenceToken[] = Array.isArray(row.tokens_array) ? row.tokens_array : []
  if (tokenStart < 0 || tokenEnd >= tokens.length || tokenStart > tokenEnd) {
    return { ok: false, error: 'Invalid token range' }
  }
  const slice = tokens.slice(tokenStart, tokenEnd + 1)
  const mergedText = getTextFromTokens({ tokens_array: slice }).trim()
  if (!mergedText) return { ok: false, error: 'No text to merge' }

  const { data: posRow, error: posError } = await supabase
    .from('pos_types')
    .select('id, code')
    .eq('id', posTypeId)
    .single()
  if (posError || !posRow) return { ok: false, error: 'POS type not found' }

  const mergedToken: SentenceToken = {
    index: tokenStart + 1,
    text: mergedText,
    pos_type_id: posRow.id,
    word_pos_entry_id: null,
  }
  const finalTokens = [
    ...tokens.slice(0, tokenStart),
    mergedToken,
    ...tokens.slice(tokenEnd + 1),
  ].map((t, i) => ({ ...t, index: i + 1 }))

  const { error: updateError } = await supabase
    .from('page_media_questions')
    .update({ tokens_array: finalTokens })
    .eq('id', questionId)
  if (updateError) return { ok: false, error: updateError.message }

  const wordNorm = stripPunctuationFromWord(mergedText)
  if (wordNorm) await upsertWordRegistry(wordNorm, posRow.id, posRow.code)

  return {
    ok: true,
    token: { ...mergedToken, index: tokenStart + 1 },
    dbConfirmation: {
      tables: ['page_media_questions', 'word_registry'],
      details: [`Question merge "${mergedText}" → ${posRow.code}`],
    },
  }
}

/**
 * Sets the word to auto for the given POS and applies that POS to all untagged
 * instances of the word in the version. Only supports story_sentence.
 */
export async function saveTokenPosAsAuto(
  source: TokenSource,
  tokenIndex: number,
  selectedPosTypeId: number
): Promise<SaveTokenPosResult> {
  if (source.type !== 'story_sentence') {
    console.log('[Shift+auto] saveTokenPosAsAuto delegates (source not story_sentence)', source.type)
    return saveTokenPos(source, tokenIndex, selectedPosTypeId)
  }
  const { data: row, error: fetchError } = await supabase
    .from('story_sentences')
    .select('id, tokens_array, sentence_text, version_id')
    .eq('id', source.sentenceId)
    .single()
  if (fetchError || !row) {
    console.error('[Shift+auto] saveTokenPosAsAuto fetch err', fetchError?.message)
    return { ok: false, error: 'Sentence not found' }
  }
  let tokens: SentenceToken[] = Array.isArray(row.tokens_array) ? row.tokens_array : []
  if (tokens.length === 0 && row.sentence_text) {
    tokens = getTokensFromSentence(String(row.sentence_text))
  }
  const token = tokens.find((t) => t.index === tokenIndex + 1) ?? tokens[tokenIndex] ?? null
  if (!token) {
    console.error('[Shift+auto] token not found', { tokenIndex, tokensLen: tokens.length })
    return { ok: false, error: `Token at index ${tokenIndex} not found` }
  }
  const wordNorm = stripPunctuationFromWord(String(token.text ?? '').trim())
  if (!wordNorm) return { ok: false, error: 'Word is empty after stripping punctuation' }
  const { data: posRow, error: posError } = await supabase
    .from('pos_types')
    .select('id, code')
    .eq('id', selectedPosTypeId)
    .single()
  if (posError || !posRow) return { ok: false, error: 'POS type not found' }
  await upsertWordRegistryWithAuto(wordNorm, posRow.id, posRow.code)
  const versionId = row.version_id
  if (!versionId) {
    const updatedToken: SentenceToken = { ...token, pos_type_id: posRow.id }
    const finalTokens = [...tokens]
    const idx = tokens.indexOf(token)
    if (idx >= 0) finalTokens[idx] = updatedToken
    else finalTokens[tokenIndex] = updatedToken
    const { error: updErr } = await supabase
      .from('story_sentences')
      .update({ tokens_array: finalTokens })
      .eq('id', source.sentenceId)
    if (updErr) return { ok: false, error: updErr.message }
    console.log('[Shift+auto] saveTokenPosAsAuto success (no version)', wordNorm)
    return {
      ok: true,
      token: updatedToken,
      dbConfirmation: { tables: ['story_sentences', 'word_registry'], details: [`Auto: "${wordNorm}" → ${posRow.code}`] },
    }
  }
  const { data: sentences, error: sentError } = await supabase
    .from('story_sentences')
    .select('id, tokens_array, sentence_text')
    .eq('version_id', versionId)
  if (sentError) throw sentError
  let applied = 0
  for (const s of sentences ?? []) {
    let st: SentenceToken[] = Array.isArray(s.tokens_array) ? s.tokens_array : []
    if (st.length === 0 && s.sentence_text) st = getTokensFromSentence(String(s.sentence_text))
    let changed = false
    const updated = st.map((t) => {
      if (t.pos_type_id != null) return t
      const tNorm = stripPunctuationFromWord(String(t.text ?? '').trim())
      if (tNorm !== wordNorm) return t
      changed = true
      applied++
      return { ...t, pos_type_id: posRow.id }
    })
    if (!changed) continue
    const { error: updErr } = await supabase
      .from('story_sentences')
      .update({ tokens_array: updated })
      .eq('id', s.id)
    if (updErr) throw updErr
  }
  console.log('[Shift+auto] saveTokenPosAsAuto success', { wordNorm, applied, versionId })
  return {
    ok: true,
    token: { ...token, pos_type_id: posRow.id },
    dbConfirmation: {
      tables: ['story_sentences', 'word_registry'],
      details: [`Auto: "${wordNorm}" → ${posRow.code} (${applied} updated)`],
    },
  }
}

/** Applies POS to editor (in-memory) tokens. No DB persist. */
async function applyTokenPosForEditor(
  source: Extract<TokenSource, { type: 'editor' }>,
  tokenIndex: number,
  selectedPosTypeId: number
): Promise<SaveTokenPosResult> {
  const tokens = [...source.tokens]
  const token = tokens[tokenIndex] ?? tokens.find((t) => t.index === tokenIndex + 1) ?? null
  if (!token) {
    return { ok: false, error: `Token index ${tokenIndex} not found` }
  }
  const idx = tokens.indexOf(token)
  const updatedToken: SentenceToken = {
    ...token,
    pos_type_id: selectedPosTypeId,
  }
  tokens[idx >= 0 ? idx : tokenIndex] = updatedToken
  source.onTokensChange(tokens)
  return {
    ok: true,
    token: updatedToken,
    dbConfirmation: { tables: [], details: [] },
  }
}

async function saveTokenPosForSentence(
  storySentenceId: number,
  tokenIndex: number,
  selectedPosTypeId: number
): Promise<SaveTokenPosResult> {
  const { data: row, error: fetchError } = await supabase
    .from('story_sentences')
    .select('id, tokens_array, sentence_text')
    .eq('id', storySentenceId)
    .single()

  if (fetchError || !row) {
    return { ok: false, error: 'Sentence not found' }
  }

  let tokens: SentenceToken[] = Array.isArray(row.tokens_array) ? row.tokens_array : []

  if (tokens.length === 0 && row.sentence_text) {
    tokens = getTokensFromSentence(String(row.sentence_text))
  }

  if (!Array.isArray(tokens)) {
    return { ok: false, error: 'tokens_array is missing or not an array' }
  }

  const clickedIndex = tokenIndex + 1
  const token = tokens.find((t) => t.index === clickedIndex) ?? tokens[tokenIndex] ?? null
  if (!token) {
    return { ok: false, error: `Token index ${tokenIndex} not found` }
  }

  const { data: posRow, error: posError } = await supabase
    .from('pos_types')
    .select('id, code')
    .eq('id', selectedPosTypeId)
    .single()

  if (posError || !posRow) {
    return { ok: false, error: 'POS type not found' }
  }

  const updatedToken: SentenceToken = {
    index: token.index ?? tokenIndex + 1,
    text: token.text,
    pos_type_id: posRow.id,
    word_pos_entry_id: token.word_pos_entry_id ?? null,
  }

  const finalTokens = [...tokens]
  const idx = tokens.indexOf(token)
  if (idx >= 0) finalTokens[idx] = updatedToken
  else finalTokens[tokenIndex] = updatedToken

  const { error: updateError } = await supabase
    .from('story_sentences')
    .update({ tokens_array: finalTokens })
    .eq('id', storySentenceId)

  if (updateError) {
    return { ok: false, error: `Database update failed: ${updateError.message}` }
  }

  const tables = ['story_sentences']
  const details = [`story_sentences: updated tokens_array (row id=${storySentenceId}, token "${token.text}" → pos_type_id=${posRow.id})`]

  const wordText = stripPunctuationFromWord(String(token.text ?? '').trim())
  if (wordText) {
    await upsertWordRegistry(wordText, posRow.id, posRow.code)
    tables.push('word_registry')
    details.push(`word_registry: upserted "${wordText}" with pos ${posRow.code}`)
  }

  return {
    ok: true,
    token: updatedToken,
    dbConfirmation: { tables, details },
  }
}

async function savePageMediaQuestionTokenPos(
  questionId: number,
  tokenIndex: number,
  selectedPosTypeId: number
): Promise<SaveTokenPosResult> {
  const { data: row, error: fetchError } = await supabase
    .from('page_media_questions')
    .select('id, tokens_array')
    .eq('id', questionId)
    .single()

  if (fetchError || !row) {
    return { ok: false, error: 'Question not found' }
  }

  let tokens: SentenceToken[] = Array.isArray(row.tokens_array) ? row.tokens_array : []
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return { ok: false, error: 'tokens_array is missing or empty' }
  }

  const clickedIndex = tokenIndex + 1
  const token = tokens.find((t) => t.index === clickedIndex) ?? tokens[tokenIndex] ?? null
  if (!token) {
    return { ok: false, error: `Token index ${tokenIndex} not found` }
  }

  const { data: posRow, error: posError } = await supabase
    .from('pos_types')
    .select('id, code')
    .eq('id', selectedPosTypeId)
    .single()

  if (posError || !posRow) {
    return { ok: false, error: 'POS type not found' }
  }

  const updatedToken: SentenceToken = {
    index: token.index ?? tokenIndex + 1,
    text: token.text,
    pos_type_id: posRow.id,
    word_pos_entry_id: token.word_pos_entry_id ?? null,
  }

  const finalTokens = [...tokens]
  const idx = tokens.indexOf(token)
  if (idx >= 0) finalTokens[idx] = updatedToken
  else finalTokens[tokenIndex] = updatedToken

  const { error: updateError } = await supabase
    .from('page_media_questions')
    .update({ tokens_array: finalTokens })
    .eq('id', questionId)

  if (updateError) {
    return { ok: false, error: `Database update failed: ${updateError.message}` }
  }

  const tables = ['page_media_questions']
  const details = [
    `page_media_questions: updated tokens_array (row id=${questionId}, token "${token.text}" → pos_type_id=${posRow.id})`,
  ]

  const wordText = stripPunctuationFromWord(String(token.text ?? '').trim())
  if (wordText) {
    await upsertWordRegistry(wordText, posRow.id, posRow.code)
    tables.push('word_registry')
    details.push(`word_registry: upserted "${wordText}" with pos ${posRow.code}`)
  }

  return {
    ok: true,
    token: updatedToken,
    dbConfirmation: { tables, details },
  }
}

async function saveImageTagTokenPos(
  imageTagId: number,
  tokenIndex: number,
  selectedPosTypeId: number
): Promise<SaveTokenPosResult> {
  const { data: row, error: fetchError } = await supabase
    .from('image_tags')
    .select('id, tokens_array, sentence_text')
    .eq('id', imageTagId)
    .single()

  if (fetchError || !row) {
    return { ok: false, error: 'Image tag not found' }
  }

  let tokens: SentenceToken[] = Array.isArray(row.tokens_array) ? row.tokens_array : []
  if (tokens.length === 0 && row.sentence_text) {
    tokens = getTokensFromSentence(String(row.sentence_text))
  }

  const token = tokens[tokenIndex] ?? null
  if (!token) {
    return { ok: false, error: `Token index ${tokenIndex} not found` }
  }

  const { data: posRow, error: posError } = await supabase
    .from('pos_types')
    .select('id, code')
    .eq('id', selectedPosTypeId)
    .single()

  if (posError || !posRow) {
    return { ok: false, error: 'POS type not found' }
  }

  const updatedToken: SentenceToken = {
    index: token.index ?? tokenIndex + 1,
    text: token.text,
    pos_type_id: posRow.id,
    word_pos_entry_id: token.word_pos_entry_id ?? null,
  }

  const finalTokens = [...tokens]
  const idx = tokens.indexOf(token)
  if (idx >= 0) finalTokens[idx] = updatedToken
  else finalTokens[tokenIndex] = updatedToken

  const { error: updateError } = await supabase
    .from('image_tags')
    .update({ tokens_array: finalTokens })
    .eq('id', imageTagId)

  if (updateError) {
    return { ok: false, error: `Database update failed: ${updateError.message}` }
  }

  const tables = ['image_tags']
  const details = [`image_tags: updated tokens_array (row id=${imageTagId}, token "${token.text}" → pos_type_id=${posRow.id})`]

  const wordText = stripPunctuationFromWord(String(token.text ?? '').trim())
  if (wordText) {
    await upsertWordRegistry(wordText, posRow.id, posRow.code)
    tables.push('word_registry')
    details.push(`word_registry: upserted "${wordText}" with pos ${posRow.code}`)
  }

  return {
    ok: true,
    token: updatedToken,
    dbConfirmation: { tables, details },
  }
}
