import type { PosPattern } from '../lib/patternMatch'
import type { TokenSource } from '../lib/saveTokenPos'

/** Props needed for page picture questions to use the same token / pattern / phrase behaviour as story sentences. */
export type PageMediaQuestionEditorContext = {
  tokenPosInteraction?: {
    handleWordClick: (source: TokenSource, tokenIndex: number, e: React.MouseEvent<HTMLElement>) => void
    handleWordHover: (source: TokenSource, tokenIndex: number, e: React.MouseEvent<HTMLElement>) => void
    handleWordHoverEnd: () => void
    handleCloseSelector: () => void
  }
  sentencePatterns: { id: number; name: string; pos_blueprint: number[] }[]
  chunkPatterns: PosPattern[]
  connectorDesigns: { pos_type_id: number; side: string; shape_config?: unknown }[]
  onPatternClick: (baseName?: string, isPartial?: boolean, questionId?: number) => void
  onMakePhraseClick: (questionId: number) => void
  onSaveQuestionText: (questionId: number, text: string) => void | Promise<void>
  isSavingText?: boolean
  kiwahaSelectionIndicesForQuestion?: (questionId: number) => Set<number> | undefined
}
