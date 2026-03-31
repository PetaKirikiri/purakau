/**
 * Interrogative options for the sentence-pattern question UI (single dropdown).
 * Add rows here for more surface forms.
 */
export type InterrogativeOption = {
  id: string
  label: string
  text: string
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

export const INTERROGATIVE_OPTIONS: InterrogativeOption[] = [
  { id: 'wai', label: 'wai', text: 'wai' },
  { id: 'hea', label: 'hea', text: 'hea' },
  { id: 'hia', label: 'hia', text: 'hia' },
  { id: 'aha', label: 'aha', text: 'aha' },
  { id: 'tokohia', label: 'tokohia', text: 'tokohia' },
  { id: 'tēhea', label: 'tēhea', text: 'tēhea' },
  { id: 'ia', label: 'ia', text: 'ia' },
  { id: 'ko_wai', label: 'ko wai', text: 'ko wai' },
  { id: 'he_aha', label: 'he aha', text: 'he aha' },
  { id: 'hei_hea', label: 'hei hea', text: 'hei hea' },
  { id: 'no_hea', label: 'nō hea', text: 'nō hea' },
  { id: 'e_hia', label: 'e hia', text: 'e hia' },
  { id: 'i_hea', label: 'i hea', text: 'i hea' },
]

export function getInterrogativeById(id: string): InterrogativeOption | undefined {
  return INTERROGATIVE_OPTIONS.find((o) => o.id === id)
}

export function interrogativeIdForText(text: string): string {
  const t = norm(text)
  const hit = INTERROGATIVE_OPTIONS.find((o) => norm(o.text) === t)
  return hit?.id ?? INTERROGATIVE_OPTIONS[0]!.id
}
