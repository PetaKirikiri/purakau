import { isPunctuationOnlyToken } from './tokens'

export type SentencePatternDef = { id: number; name: string; pos_blueprint: number[] }

export function matchSentencePattern(
  tokens: { pos_type_id: number | null; text?: string | null }[],
  patterns: SentencePatternDef[]
): { name: string } | null {
  const blueprint = tokens
    .filter((t) => !isPunctuationOnlyToken(t))
    .map((t) => t.pos_type_id)
    .filter((id): id is number => id != null)
  if (blueprint.length === 0) return null
  const match = patterns.find((p) => {
    const b = (p.pos_blueprint ?? []).filter((id): id is number => id != null)
    return b.length === blueprint.length && b.every((v, i) => v === blueprint[i])
  })
  return match ? { name: match.name ?? '' } : null
}

export function matchSentencePatternPartial(
  tokens: { pos_type_id: number | null; text?: string | null }[],
  patterns: SentencePatternDef[]
): { name: string } | null {
  const blueprint = tokens
    .filter((t) => !isPunctuationOnlyToken(t))
    .map((t) => t.pos_type_id)
    .filter((id): id is number => id != null)
  if (blueprint.length === 0) return null
  const match = patterns.find((p) => {
    const b = (p.pos_blueprint ?? []).filter((id): id is number => id != null)
    return b.length > 0 && blueprint.length > b.length && b.every((v, i) => v === blueprint[i])
  })
  return match ? { name: match.name ?? '' } : null
}
