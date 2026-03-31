/**
 * Run: npx tsx src/lib/generateQuestionsFromPattern.test.ts
 */
import type { PatternQuestionConfig } from '../db/schema'
import {
  contentIndexForBlueprintSlot,
  contentSpanToTokenRange,
  evaluateWhen,
  findMatchingPatternForGeneration,
  generatePageMediaQuestionTokenArrays,
  type PatternRowForGeneration,
} from './generateQuestionsFromPattern'
import type { SentenceToken } from '../db/schema'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

function run(): void {
  const t1: SentenceToken = { index: 1, text: 'He', pos_type_id: 1, word_pos_entry_id: null }
  const t2: SentenceToken = { index: 2, text: ' ', pos_type_id: null, word_pos_entry_id: null }
  const t3: SentenceToken = { index: 3, text: 'runs', pos_type_id: 2, word_pos_entry_id: null }
  const tokens: SentenceToken[] = [t1, t2, t3]

  assert(contentIndexForBlueprintSlot(tokens, 0) === 0, 'slot 0 → first content index')
  assert(contentIndexForBlueprintSlot(tokens, 1) === 2, 'slot 1 → second content index')
  assert(contentIndexForBlueprintSlot(tokens, 2) === null, 'slot 2 out of range')

  const range = contentSpanToTokenRange(tokens, 0, 1)
  assert(range?.start === 0 && range?.end === 2, 'span covers two content tokens')

  const cfg: PatternQuestionConfig = {
    slot_index: 1,
    variants: [{ label: 'q', text: 'does' }],
  }
  const pattern: PatternRowForGeneration = {
    id: 1,
    pos_blueprint: [1, 2],
    question_config: cfg,
  }
  const out = generatePageMediaQuestionTokenArrays(tokens, pattern)
  assert(out.length === 1, 'one variant')
  const q = out[0]!
  const text = q.map((x) => x.text).join('')
  assert(text.includes('does'), 'replaced second word')
  assert(!text.includes('runs'), 'removed original verb')

  const patterns: PatternRowForGeneration[] = [
    { id: 10, pos_blueprint: [1, 2], question_config: null },
    { id: 20, pos_blueprint: [1, 2], question_config: { slot_index: 0, variants: [{ text: 'X' }] } },
  ]
  const picked = findMatchingPatternForGeneration(tokens, patterns)
  assert(picked?.id === 20, 'prefers pattern with question_config')

  const patternsNoCfg: PatternRowForGeneration[] = [
    { id: 1, pos_blueprint: [9, 9], question_config: { slot_index: 0, variants: [{ text: 'a' }] } },
    { id: 2, pos_blueprint: [1, 2], question_config: null },
  ]
  const picked2 = findMatchingPatternForGeneration(tokens, patternsNoCfg)
  assert(picked2?.id === 2, 'falls back to first blueprint match without usable config')

  /** Conditional variants: only matching when applies */
  const tokKo: SentenceToken[] = [
    { index: 1, text: 'Ko', pos_type_id: 10, word_pos_entry_id: null },
    { index: 2, text: ' ', pos_type_id: null, word_pos_entry_id: null },
    { index: 3, text: 'Hemi', pos_type_id: 11, word_pos_entry_id: null },
  ]
  const cfgWhen: PatternQuestionConfig = {
    slot_index: 1,
    variants: [
      {
        text: 'ko wai',
        when: { slot_text: [{ slot: 0, text: 'ko' }] },
      },
      {
        text: 'he aha',
        when: { slot_text: [{ slot: 0, text: 'he' }] },
      },
    ],
  }
  const patWhen: PatternRowForGeneration = {
    id: 3,
    pos_blueprint: [10, 11],
    question_config: cfgWhen,
  }
  const outKo = generatePageMediaQuestionTokenArrays(tokKo, patWhen)
  assert(outKo.length === 1 && outKo[0]!.some((x) => x.text === 'wai'), 'ko → ko wai only')

  /** in_phrase_name */
  const cfgPhrase: PatternQuestionConfig = {
    slot_index: 0,
    variants: [
      { text: 'ONLY_PHRASE', when: { in_phrase_name: 'Nom' } },
      { text: 'ANY' },
    ],
  }
  const patPhrase: PatternRowForGeneration = {
    id: 4,
    pos_blueprint: [1, 2],
    phrase_components: [{ pattern_id: 1, pattern_name: 'Nom', start: 0, end: 2 }],
    question_config: cfgPhrase,
  }
  const outPhrase = generatePageMediaQuestionTokenArrays(tokens, patPhrase)
  assert(outPhrase.length === 2 && outPhrase.some((a) => a.some((t) => t.text === 'ONLY_PHRASE')), 'phrase variant')
  assert(
    evaluateWhen(tokens, { in_phrase_name: 'Nom' }, patPhrase.phrase_components, 0),
    'focus 0 in Nom'
  )
  assert(
    !evaluateWhen(tokens, { in_phrase_name: 'Nom' }, patPhrase.phrase_components, 5),
    'invalid focus out of phrase'
  )

  /** replace_span: two tokens → one word */
  const cfgSpan: PatternQuestionConfig = {
    slot_index: 0,
    replace_span: { start: 0, end: 1 },
    variants: [{ text: 'tokohia' }],
  }
  const patSpan: PatternRowForGeneration = {
    id: 5,
    pos_blueprint: [1, 2],
    question_config: cfgSpan,
  }
  const outSpan = generatePageMediaQuestionTokenArrays(tokens, patSpan)
  assert(outSpan.length === 1, 'span one output')
  const joined = outSpan[0]!.map((x) => x.text).join(' ')
  assert(joined.includes('tokohia'), 'span merged to tokohia')
  assert(!joined.includes('He') && !joined.includes('runs'), 'original content words removed')

  const cfgPerVariant: PatternQuestionConfig = {
    slot_index: 0,
    variants: [{ text: 'Z', slot_index: 1 }],
  }
  const outSlot = generatePageMediaQuestionTokenArrays(tokens, {
    id: 6,
    pos_blueprint: [1, 2],
    question_config: cfgPerVariant,
  })
  assert(outSlot.length === 1 && outSlot[0]!.some((x) => x.text === 'Z'), 'variant slot_index overrides config')

  // eslint-disable-next-line no-console
  console.log('generateQuestionsFromPattern tests passed')
}

run()
