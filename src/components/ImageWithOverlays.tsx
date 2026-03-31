import { useLayoutEffect, useRef } from 'react'
import { TokenDisplay } from './TokenDisplay'
import { getTokensFromImageTag } from '../lib/tokens'
import type { ImageTag } from './PageMediaDisplay'
import type { PosTypeLike } from '../lib/tokens'
import type { PosPattern } from '../lib/patternMatch'

export function ImageWithOverlays({
  url,
  tags = [],
  posTypes = [],
  chunkPatterns = [],
  className = '',
  interactive = false,
  large = false,
  onWordClick,
  onWordHover,
  onWordHoverEnd,
}: {
  url: string
  tags?: ImageTag[]
  posTypes?: PosTypeLike[]
  chunkPatterns?: PosPattern[]
  className?: string
  interactive?: boolean
  /** When true, larger max size for story page view (~1.5× default cap) */
  large?: boolean
  onWordClick?: (tagIndex: number, tokenIndex: number, word: string, e: React.MouseEvent<HTMLSpanElement>) => void
  onWordHover?: (tagIndex: number, tokenIndex: number, e: React.MouseEvent<HTMLElement>) => void
  onWordHoverEnd?: () => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  /** Large: block + intrinsic height so flow matches paint (no transform scale — that shrinks layout vs visual). */
  const imgClass = large
    ? 'w-full h-auto max-h-[48rem] object-contain rounded border block mx-auto'
    : 'max-w-full max-h-64 object-contain rounded border block'
  const tagClass = 'absolute text-sm font-medium text-white px-1.5 py-0.5 whitespace-nowrap bg-black/30 rounded'

  // #region agent log
  useLayoutEffect(() => {
    if (!large || !wrapRef.current) return
    const el = wrapRef.current
    const layoutH = el.offsetHeight
    const visualH = el.getBoundingClientRect().height
    fetch('http://127.0.0.1:7489/ingest/b001ac32-8358-43d0-a2cd-b6f88c884101', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '5585d8' },
      body: JSON.stringify({
        sessionId: '5585d8',
        location: 'ImageWithOverlays.tsx:layout',
        message: 'large image layout vs visual height',
        data: { layoutH, visualH, delta: Math.round(visualH - layoutH), hypothesisId: 'A' },
        timestamp: Date.now(),
        runId: 'post-fix',
      }),
    }).catch(() => {})
  }, [large, url])
  // #endregion

  return (
    <div
      ref={wrapRef}
      className={`relative ${large ? 'block w-full' : 'inline-block'} ${className}`}
    >
      <img src={url} alt="" className={imgClass} />
      {tags.map((tag, tagIdx) => {
        const { x, y, tokens } = getTokensFromImageTag(tag)
        if (tokens.length === 0) return null
        const wrappedClick = onWordClick
          ? (_sid: number, wid: number, word: string, e: React.MouseEvent<HTMLSpanElement>) =>
              onWordClick(tagIdx, wid, word, e)
          : undefined
        const wrappedHover = onWordHover
          ? (_sid: number, wid: number, e: React.MouseEvent<HTMLElement>) => onWordHover(tagIdx, wid, e)
          : undefined
        const hasInteractivity = !!onWordClick || !!onWordHover
        return (
          <span
            key={tagIdx}
            className={`${tagClass} ${hasInteractivity ? 'pointer-events-auto' : 'pointer-events-none'}`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%, -50%)',
              textShadow: '0 1px 2px rgba(0,0,0,0.8), 0 0 1px black',
            }}
          >
            <TokenDisplay
              tokens={tokens}
              posTypes={posTypes}
              chunkPatterns={chunkPatterns}
              sentenceId={tagIdx}
              interactive={interactive}
              onWordClick={wrappedClick}
              onWordHover={wrappedHover}
              onWordHoverEnd={onWordHoverEnd}
            />
          </span>
        )
      })}
    </div>
  )
}
