import { useState, useEffect, useCallback, useRef } from 'react'
import { saveTokenPos, saveTokenPosAsAuto } from '../lib/saveTokenPos'
import { stripPunctuationFromWord } from '../lib/tokens'
import type { TokenSource } from '../lib/saveTokenPos'
import type { SentenceToken } from '../db/schema'

const HOVER_POS_ORDER = ['TAM', 'VERB', 'DETERMINER', 'NOUN', 'OBJECTMARKER']

/** Dwell time before the hover POS UI opens (avoids flashing when moving past tokens). */
const HOVER_OPEN_DELAY_MS = 420

export function sortPosTypesForHover<T extends { code?: string }>(types: T[]): T[] {
  const orderMap = new Map(HOVER_POS_ORDER.map((c, i) => [c.toUpperCase(), i]))
  orderMap.set('OBJECT_MARKER', 4)
  return [...types].sort((a, b) => {
    const aCode = (a.code ?? '').toUpperCase()
    const bCode = (b.code ?? '').toUpperCase()
    const ai = orderMap.get(aCode) ?? orderMap.get(aCode.replace(/_/g, '')) ?? 999
    const bi = orderMap.get(bCode) ?? orderMap.get(bCode.replace(/_/g, '')) ?? 999
    return ai - bi
  })
}

export type HoveredToken = {
  source: TokenSource
  tokenIndex: number
  rect: DOMRect
}

export function useTokenPosInteraction({
  sortedPosTypes,
  onSuccess,
  onAfterSave,
  onAutoApplied,
  showDbConfirmation,
  onKiwahaTokenSelect,
}: {
  posTypes?: { id: number; code?: string; label?: string; color?: string | null }[]
  sortedPosTypes: { id: number; code?: string; label?: string; color?: string | null }[]
  onSuccess?: (source: TokenSource) => void
  onAfterSave?: (source: TokenSource, tokenIndex: number, token: SentenceToken) => void
  /** Called when auto is applied - use to optimistically update cache for instant render. */
  onAutoApplied?: (source: TokenSource, wordNorm: string, posTypeId: number) => void
  showDbConfirmation?: (confirmation: { tables: string[]; details: string[]; type?: 'success' | 'error' }) => void
  /** When shift+click: add token to kīwaha selection instead of opening POS selector. */
  onKiwahaTokenSelect?: (source: TokenSource, tokenIndex: number) => void
}) {
  const [hoveredToken, setHoveredToken] = useState<HoveredToken | null>(null)
  const [clickedToken, setClickedToken] = useState<HoveredToken | null>(null)

  const onSuccessRef = useRef(onSuccess)
  const onAfterSaveRef = useRef(onAfterSave)
  const onAutoAppliedRef = useRef(onAutoApplied)
  const showDbConfirmationRef = useRef(showDbConfirmation)
  const hoverCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingHoverRef = useRef<HoveredToken | null>(null)
  onSuccessRef.current = onSuccess
  onAfterSaveRef.current = onAfterSave
  onAutoAppliedRef.current = onAutoApplied
  showDbConfirmationRef.current = showDbConfirmation

  const cancelHoverClose = useCallback(() => {
    if (hoverCloseTimeoutRef.current) {
      clearTimeout(hoverCloseTimeoutRef.current)
      hoverCloseTimeoutRef.current = null
    }
  }, [])

  const cancelHoverOpen = useCallback(() => {
    if (hoverOpenTimeoutRef.current) {
      clearTimeout(hoverOpenTimeoutRef.current)
      hoverOpenTimeoutRef.current = null
    }
    pendingHoverRef.current = null
  }, [])

  const scheduleHoverClose = useCallback(() => {
    cancelHoverClose()
    hoverCloseTimeoutRef.current = setTimeout(() => setHoveredToken(null), 600)
  }, [cancelHoverClose])

  const handleWordHover = useCallback(
    (source: TokenSource, tokenIndex: number, e: React.MouseEvent<HTMLElement>) => {
      cancelHoverClose()
      cancelHoverOpen()
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      pendingHoverRef.current = { source, tokenIndex, rect }
      hoverOpenTimeoutRef.current = setTimeout(() => {
        hoverOpenTimeoutRef.current = null
        const p = pendingHoverRef.current
        if (!p) return
        setHoveredToken(p)
      }, HOVER_OPEN_DELAY_MS)
    },
    [cancelHoverClose, cancelHoverOpen]
  )

  const handleWordHoverEnd = useCallback(() => {
    cancelHoverOpen()
    cancelHoverClose()
    setHoveredToken(null)
  }, [cancelHoverClose, cancelHoverOpen])

  const onKiwahaTokenSelectRef = useRef(onKiwahaTokenSelect)
  onKiwahaTokenSelectRef.current = onKiwahaTokenSelect

  const handleWordClick = useCallback(
    (source: TokenSource, tokenIndex: number, e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation()
      cancelHoverOpen()
      cancelHoverClose()
      if (
        e.shiftKey &&
        onKiwahaTokenSelectRef.current &&
        (source.type === 'story_sentence' || source.type === 'page_media_question')
      ) {
        onKiwahaTokenSelectRef.current(source, tokenIndex)
        return
      }
      setClickedToken({ source, tokenIndex, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })
    },
    [cancelHoverClose, cancelHoverOpen]
  )

  const handleCloseSelector = useCallback(() => {
    cancelHoverOpen()
    cancelHoverClose()
    setHoveredToken(null)
    setClickedToken(null)
  }, [cancelHoverClose, cancelHoverOpen])

  const activeToken = hoveredToken ?? clickedToken

  const handleQuickSetPos = useCallback(
    async (posTypeId: number, asAuto = false) => {
      if (!activeToken) return
      const result = asAuto
        ? await saveTokenPosAsAuto(activeToken.source, activeToken.tokenIndex, posTypeId)
        : await saveTokenPos(activeToken.source, activeToken.tokenIndex, posTypeId)
      const wordNorm = result.ok ? stripPunctuationFromWord(String(result.token.text ?? '').trim()) : null
      if (result.ok) {
        showDbConfirmationRef.current?.(result.dbConfirmation)
        if (asAuto && activeToken.source.type === 'story_sentence') {
          if (wordNorm) onAutoAppliedRef.current?.(activeToken.source, wordNorm, result.token.pos_type_id!)
        }
        onSuccessRef.current?.(activeToken.source)
        onAfterSaveRef.current?.(activeToken.source, activeToken.tokenIndex, result.token)
      } else {
        showDbConfirmationRef.current?.({ tables: ['story_sentences'], details: [result.error], type: 'error' })
      }
      setHoveredToken(null)
      setClickedToken(null)
    },
    [activeToken]
  )

  useEffect(() => {
    if (!activeToken || !sortedPosTypes.length) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelHoverOpen()
        setHoveredToken(null)
        setClickedToken(null)
        return
      }
      const digitMatch = /^Digit([1-9])$/.exec(e.code)
      const n = digitMatch ? parseInt(digitMatch[1], 10) : (e.key >= '1' && e.key <= '9' ? parseInt(e.key, 10) : 0)
      if (n >= 1 && n <= sortedPosTypes.length) {
        e.preventDefault()
        const asAuto = !!e.shiftKey
        handleQuickSetPos(sortedPosTypes[n - 1].id, asAuto)
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [activeToken, sortedPosTypes, handleQuickSetPos, cancelHoverOpen])

  return {
    hoveredToken,
    clickedToken,
    handleWordHover,
    handleWordHoverEnd,
    handleWordClick,
    handleCloseSelector,
    handleQuickSetPos,
    onSelectorMouseEnter: cancelHoverClose,
    onSelectorMouseLeave: scheduleHoverClose,
  }
}
