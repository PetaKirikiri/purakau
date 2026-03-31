/**
 * Leaf component for rendering a single word/token with optional underline.
 * Used by TokenDisplay and Words. Do not use directly for sentence rendering.
 */

import {
  splitWordAndPunctuation,
  TOKEN_CLASS_BASE,
  TOKEN_CLASS_INTERACTIVE,
} from '../lib/tokenStyling'
import { TokenUnderline } from './TokenUnderline'

type TokenWordProps = {
  text: string
  underlineColor?: string | null
  interactive?: boolean
  title?: string
  onClick?: (e: React.MouseEvent<HTMLSpanElement>) => void
  className?: string
  /** When true, suppress underline (used when inside TokenDisplay chunk) */
  inChunk?: boolean
}

export function TokenWord({
  text,
  underlineColor,
  interactive,
  title,
  onClick,
  className = '',
  inChunk = false,
}: TokenWordProps) {
  const classes = [
    TOKEN_CLASS_BASE,
    interactive && TOKEN_CLASS_INTERACTIVE,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const hasUnderline = !inChunk && underlineColor

  if (hasUnderline && text) {
    const { leading, word, trailing } = splitWordAndPunctuation(text)
    if (leading || trailing) {
      const outerClasses = [interactive && TOKEN_CLASS_INTERACTIVE, className].filter(Boolean).join(' ')
      return (
        <span onClick={onClick} className={outerClasses} title={title} role={interactive ? 'button' : undefined}>
          {leading}{word ? <TokenUnderline underlineColor={underlineColor}>{word}</TokenUnderline> : null}{trailing}
        </span>
      )
    }
  }

  if (hasUnderline) {
    return (
      <span onClick={onClick} className={classes} title={title} role={interactive ? 'button' : undefined}>
        <TokenUnderline underlineColor={underlineColor}>{text}</TokenUnderline>
      </span>
    )
  }

  return (
    <span
      onClick={onClick}
      className={classes}
      title={title}
      role={interactive ? 'button' : undefined}
    >
      {text}
    </span>
  )
}
