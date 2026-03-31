import { z } from 'zod'

export const storySchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
})
