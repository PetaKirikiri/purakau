import OpenAI from 'openai'
import { getOpenAIApiKey } from './gpt-config'

export const openai = new OpenAI({
  apiKey: getOpenAIApiKey() || undefined,
})
