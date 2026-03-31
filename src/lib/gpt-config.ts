/**
 * GPT/OpenAI configuration. Aligned with SmartSubs pattern.
 * Key sources: VITE_OPENAI_API_KEY (.env), OPENAI_API_KEY (Node/build)
 */

export function getOpenAIApiKey(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_API_KEY) {
    const k = import.meta.env.VITE_OPENAI_API_KEY
    if (k && typeof k === 'string' && k.trim()) return k.trim()
  }
  if (typeof process !== 'undefined' && process.env?.OPENAI_API_KEY) {
    const k = process.env.OPENAI_API_KEY
    if (k && typeof k === 'string' && k.trim()) return k.trim()
  }
  if (typeof process !== 'undefined' && process.env?.VITE_OPENAI_API_KEY) {
    const k = process.env.VITE_OPENAI_API_KEY
    if (k && typeof k === 'string' && k.trim()) return k.trim()
  }
  return ''
}
