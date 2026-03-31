import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { TokenDisplay } from './TokenDisplay'
import { getTokensFromSentence, getTextFromTokens, getTokensFromImageTag, stripPunctuationFromTokens } from '../lib/tokens'
import { findDraggableChunks } from '../lib/patternMatch'
import type { ImageTag } from './PageMediaDisplay'
import type { SentenceToken } from '../db/schema'
import type { PosPattern } from '../lib/patternMatch'

type PageSentence = { id: number; tokens_array?: unknown; sentence_text?: string }

export function ImageEditModal({
  url,
  imageId: _imageId,
  tags: initialTags,
  posTypes = [],
  chunkPatterns = [],
  pageSentences = [],
  usages = [],
  currentTitleId,
  currentVersionId,
  titleNames,
  versionLabels,
  onSave,
  onClose,
  onRegisterTokenPosUpdate,
  onWordClick,
  onWordHover,
  onWordHoverEnd,
  onCloseSelector,
}: {
  url: string
  imageId: number
  tags: ImageTag[]
  posTypes?: { id: number; code?: string; label?: string; color?: string | null }[]
  chunkPatterns?: PosPattern[]
  pageSentences?: PageSentence[]
  usages?: { title_id?: number; version_id?: number; page_number: number }[]
  currentTitleId?: number
  currentVersionId?: number
  titleNames?: Record<number, string>
  versionLabels?: Record<number, string>
  onSave: (tags: ImageTag[]) => Promise<void>
  onClose: () => void
  onRegisterTokenPosUpdate?: (cb: (imageTagId: number, tokenIndex: number, updatedToken: SentenceToken) => void) => void
  onWordClick?: (tagId: number, tagIndex: number, tokenIndex: number, word: string, e: React.MouseEvent<HTMLSpanElement>) => void
  onWordHover?: (tagId: number, tagIndex: number, tokenIndex: number, e: React.MouseEvent<HTMLElement>) => void
  onWordHoverEnd?: () => void
  onCloseSelector?: () => void
}) {
  const [tags, setTags] = useState<ImageTag[]>(() =>
    initialTags.map((t) => {
      const { x, y, tokens } = getTokensFromImageTag(t)
      return { id: (t as { id?: number }).id, x, y, tokens }
    })
  )
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [newTagAt, setNewTagAt] = useState<{ x: number; y: number } | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const justDraggedRef = useRef(false)

  useEffect(() => {
    if (!onRegisterTokenPosUpdate) return
    onRegisterTokenPosUpdate((imageTagId, tokenIndex, updatedToken) => {
      setTags((prev) => {
        const idx = prev.findIndex((t) => t.id === imageTagId)
        if (idx < 0) return prev
        const tag = prev[idx]
        if (!tag?.tokens) return prev
        const next = [...prev]
        next[idx] = {
          ...tag,
          tokens: tag.tokens.map((t, i) => (i === tokenIndex ? updatedToken : t)),
        }
        return next
      })
    })
    return () => {
      onRegisterTokenPosUpdate?.(() => {})
    }
  }, [onRegisterTokenPosUpdate])

  const coordToPercent = useCallback((clientX: number, clientY: number) => {
    const img = imgRef.current
    if (!img) return null
    const rect = img.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100))
    return { x, y }
  }, [])

  const handleContainerMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggingIndex == null) return
      const pos = coordToPercent(e.clientX, e.clientY)
      if (pos) setTags((prev) => prev.map((t, i) => (i === draggingIndex ? { ...t, ...pos } : t)))
    },
    [draggingIndex, coordToPercent]
  )

  const handleContainerMouseUp = useCallback(() => {
    if (draggingIndex != null) {
      justDraggedRef.current = true
      setTimeout(() => { justDraggedRef.current = false }, 0)
    }
    setDraggingIndex(null)
  }, [draggingIndex])

  useEffect(() => {
    if (draggingIndex == null) return
    const onUp = () => {
      justDraggedRef.current = true
      setTimeout(() => { justDraggedRef.current = false }, 0)
      setDraggingIndex(null)
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [draggingIndex])

  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const img = imgRef.current
      if (!img) return
      const rect = img.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      setNewTagAt({ x, y })
      setEditingIndex(null)
    },
    []
  )

  const addTag = (text: string) => {
    if (!newTagAt || !text.trim()) return
    const tokens = getTokensFromSentence(text.trim())
    setTags((prev) => [...prev, { ...newTagAt, tokens }])
    setNewTagAt(null)
  }

  const addTagAtPosition = useCallback((x: number, y: number, tokens: SentenceToken[]) => {
    if (tokens.length === 0) return
    setTags((prev) => [...prev, { x, y, tokens }])
    setNewTagAt(null)
  }, [])

  const draggableChunks = useMemo(
    () => findDraggableChunks(pageSentences, chunkPatterns),
    [pageSentences, chunkPatterns]
  )

  const updateTag = (index: number, text: string) => {
    if (!text.trim()) {
      setTags((prev) => prev.filter((_, i) => i !== index))
      setEditingIndex(null)
      return
    }
    const tokens = getTokensFromSentence(text.trim())
    setTags((prev) => prev.map((t, i) => (i === index ? { ...t, tokens } : t)))
    setEditingIndex(null)
  }

  const removeTag = (index: number) => {
    setTags((prev) => prev.filter((_, i) => i !== index))
    setEditingIndex(null)
  }

  const tagsForSave = tags.map((t) => ({
    id: t.id,
    x: t.x,
    y: t.y,
    tokens: t.tokens ?? [],
  }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(tagsForSave)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded shadow-xl max-w-4xl max-h-[90vh] w-full mx-4 flex flex-col">
        <div className="p-3 border-b flex justify-between items-center flex-wrap gap-2">
          <div>
            <h3 className="font-semibold">Edit image – Add text</h3>
            {usages.length > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                Used in: {usages.map((u) => {
                  const isCurrent = (u.version_id != null && u.version_id === currentVersionId) ||
                    (u.title_id != null && u.title_id === currentTitleId && currentVersionId == null)
                  return isCurrent ? `Page ${u.page_number}` : `${versionLabels?.[u.version_id ?? 0] ?? titleNames?.[u.title_id ?? 0] ?? 'Other'}, Page ${u.page_number}`
                }).join('; ')}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              disabled={saving}
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>
        <div className="p-4 flex-1 min-h-0 overflow-auto flex gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-600 mb-2">Click on the image to place text. Drag existing text or chunks from the right to move/add.</p>
            <div
              className="relative inline-block cursor-crosshair"
              onClick={handleImageClick}
              onMouseMove={handleContainerMouseMove}
              onMouseUp={handleContainerMouseUp}
              onMouseLeave={handleContainerMouseUp}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }}
              onDrop={(e) => {
                e.preventDefault()
                const raw = e.dataTransfer.getData('application/x-purākau-chunk')
                if (!raw) return
                try {
                  const { tokens } = JSON.parse(raw) as { tokens: SentenceToken[] }
                  const pos = coordToPercent(e.clientX, e.clientY)
                  if (pos && Array.isArray(tokens) && tokens.length > 0) {
                    const cleaned = stripPunctuationFromTokens(tokens)
                    if (cleaned.length > 0) addTagAtPosition(pos.x, pos.y, cleaned)
                  }
                } catch {
                  /* ignore */
                }
              }}
            >
            <img
              ref={imgRef}
              src={url}
              alt=""
              className="max-w-full max-h-[60vh] object-contain rounded border block"
              draggable={false}
            />
            <div className="absolute inset-0 pointer-events-none [&>*]:pointer-events-auto">
            {tags.map((tag, i) => {
              const tokens = tag.tokens ?? []
              const displayText = tokens.length > 0 ? getTextFromTokens({ tokens_array: tokens }) : ''
              return (
                <span
                  key={i}
                  className="absolute text-sm font-medium text-white px-1.5 py-0.5 whitespace-nowrap bg-black/30 rounded pointer-events-auto select-none"
                  style={{
                    left: `${tag.x}%`,
                    top: `${tag.y}%`,
                    transform: 'translate(-50%, -50%)',
                    textShadow: '0 1px 2px rgba(0,0,0,0.8), 0 0 1px black',
                    cursor: draggingIndex === i ? 'grabbing' : editingIndex === i ? 'text' : 'grab',
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => {
                    if (editingIndex === i) return
                    e.stopPropagation()
                    onCloseSelector?.()
                    setDraggingIndex(i)
                    setEditingIndex(null)
                    setNewTagAt(null)
                  }}
                >
                  {editingIndex === i ? (
                    <input
                      autoFocus
                      defaultValue={displayText}
                      className="bg-transparent border-none outline-none min-w-[2ch] text-white w-full"
                      onBlur={(e) => updateTag(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur()
                        }
                        if (e.key === 'Escape') {
                          setEditingIndex(null)
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (draggingIndex != null) return
                        if (justDraggedRef.current) {
                          justDraggedRef.current = false
                          return
                        }
                        setEditingIndex(i)
                        setNewTagAt(null)
                      }}
                    >
                      <TokenDisplay
                        tokens={tokens}
                        posTypes={posTypes}
                        chunkPatterns={chunkPatterns}
                        sentenceId={i}
                        interactive={!!(onWordClick || onWordHover)}
                        onWordClick={
                          onWordClick && tag.id && draggingIndex == null
                            ? (_sid, wid, word, ev) => {
                                ev.stopPropagation()
                                onWordClick(tag.id!, i, wid, word, ev)
                              }
                            : undefined
                        }
                        onWordHover={
                          onWordHover && tag.id && draggingIndex == null
                            ? (_sid, wid, ev) => onWordHover(tag.id!, i, wid, ev)
                            : undefined
                        }
                        onWordHoverEnd={onWordHoverEnd}
                      />
                    </span>
                  )}
                  {editingIndex !== i && (
                    <button
                      type="button"
                      className="ml-1 text-red-300 hover:text-white"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeTag(i)
                      }}
                    >
                      ×
                    </button>
                  )}
                </span>
              )
            })}
            {newTagAt && (
              <span
                className="absolute text-sm font-medium text-white px-1.5 py-0.5 whitespace-nowrap bg-black/30 rounded pointer-events-auto"
                style={{
                  left: `${newTagAt.x}%`,
                  top: `${newTagAt.y}%`,
                  transform: 'translate(-50%, -50%)',
                  textShadow: '0 1px 2px rgba(0,0,0,0.8), 0 0 1px black',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  autoFocus
                  placeholder="Type..."
                  className="bg-transparent border-none outline-none min-w-[4ch] text-inherit text-white placeholder:text-white/70 w-full"
                  onBlur={(e) => {
                    addTag(e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addTag(e.currentTarget.value)
                    }
                    if (e.key === 'Escape') {
                      setNewTagAt(null)
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </span>
            )}
            </div>
          </div>
          </div>
          {draggableChunks.length > 0 && (
            <div className="w-56 shrink-0 border-l pl-3 flex flex-col">
              <p className="text-xs font-medium text-gray-500 mb-2">Drag onto image</p>
              <div className="flex-1 min-h-0 overflow-auto space-y-1">
                {draggableChunks.map((chunk, idx) => {
                  const cleaned = stripPunctuationFromTokens(chunk.tokens)
                  if (cleaned.length === 0) return null
                  const text = cleaned.map((t) => t.text ?? '').join(' ')
                  return (
                    <div
                      key={`${chunk.sentenceId}-${chunk.start}-${idx}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-purākau-chunk', JSON.stringify({ tokens: cleaned }))
                        e.dataTransfer.effectAllowed = 'copy'
                        const ghost = document.createElement('div')
                        ghost.className = 'text-sm font-medium text-white px-1.5 py-0.5 whitespace-nowrap bg-black/30 rounded'
                        ghost.style.cssText = 'text-shadow: 0 1px 2px rgba(0,0,0,0.8), 0 0 1px black; pointer-events: none; position: absolute; top: -9999px;'
                        ghost.textContent = text
                        document.body.appendChild(ghost)
                        const rect = ghost.getBoundingClientRect()
                        e.dataTransfer.setDragImage(ghost, Math.round(rect.width / 2), Math.round(rect.height / 2))
                        requestAnimationFrame(() => ghost.remove())
                      }}
                      className="text-sm py-1 px-2 rounded border border-gray-200 bg-gray-50 cursor-grab active:cursor-grabbing hover:bg-gray-100 overflow-x-hidden overflow-y-visible"
                      title={`${chunk.patternName}: ${text}`}
                    >
                      <span className="text-[10px] text-gray-400 uppercase block">{chunk.patternName}</span>
                      <span className="block overflow-x-hidden overflow-y-visible pb-1">
                        <TokenDisplay
                          tokens={cleaned}
                          posTypes={posTypes}
                          chunkPatterns={chunkPatterns}
                          sentenceId={chunk.sentenceId}
                        />
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
