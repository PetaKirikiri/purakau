/**
 * Word metadata popover - shown on click when token has POS set.
 * Contains: Te Aka (built-in), Other words, extensible custom fields.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { CenteredViewportPopup } from './CenteredViewportPopup'
import { stripPunctuationFromWord } from '../lib/tokens'
import {
  lookupTeAka,
  resolveTeAkaPlayableUrl,
  teAkaAudioUrlFromWordId,
  teAkaLookupQueryKey,
} from '../lib/lookupTeAka'
import {
  fetchWordMetadata,
  fetchFieldDefinitions,
  upsertWordMetadata,
  addFieldDefinition,
  parseOptionsCsv,
  WORD_METADATA_FIELD_TYPES,
  type WordMetadataFieldDef,
  type WordMetadataFieldType,
} from '../lib/wordMetadata'
import { useQuery } from '@tanstack/react-query'
import { HiSpeakerWave } from 'react-icons/hi2'
import { listR2Images, uploadR2Image } from '../lib/r2'

type PosTypeLike = { id: number; code?: string; label?: string; color?: string | null }

function stringOptionsFromDef(def: WordMetadataFieldDef): string[] {
  const o = def.options
  if (!Array.isArray(o)) return []
  return o.map((x) => (typeof x === 'string' ? x : String(x))).filter(Boolean)
}

/** Try Supabase te-aka-audio first; if invalid/missing, play public Te Aka GCS MP3. */
function playTeAkaPrimaryThenGcs(primaryUrl: string, gcsFallback: string) {
  if (!primaryUrl) return
  const fb = gcsFallback && gcsFallback !== primaryUrl ? gcsFallback : ''
  return new Audio(primaryUrl).play().catch(() => (fb ? new Audio(fb).play() : undefined))
}

export function WordMetadataPopover({
  currentPosId,
  currentWord,
  wordsByPos = {},
  onReplaceWord,
  onClose,
  onMetadataChange,
}: {
  posTypes: PosTypeLike[]
  currentPosId: number | null
  currentWord?: string
  wordsByPos?: Record<number, string[]>
  onReplaceWord?: (word: string) => void
  onClose: () => void
  onMetadataChange?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hiddenTeAkaIndices, setHiddenTeAkaIndices] = useState<Set<number>>(new Set())
  const [metadata, setMetadata] = useState<Record<string, unknown>>({})
  const [fieldDefs, setFieldDefs] = useState<WordMetadataFieldDef[]>([])
  const [addFieldKey, setAddFieldKey] = useState('')
  const [addFieldType, setAddFieldType] = useState<WordMetadataFieldType>('text')
  const [addFieldOptions, setAddFieldOptions] = useState('')
  const [addFieldError, setAddFieldError] = useState<string | null>(null)
  const [addingField, setAddingField] = useState(false)

  const wordNorm = currentWord ? stripPunctuationFromWord(currentWord).toLowerCase() : ''

  const { data: teAkaData, isPending: teAkaPending } = useQuery({
    queryKey: teAkaLookupQueryKey(wordNorm),
    queryFn: () => lookupTeAka(wordNorm),
    enabled: !!wordNorm,
    staleTime: 86_400_000,
    gcTime: 7 * 86_400_000,
  })

  useEffect(() => {
    setHiddenTeAkaIndices(new Set())
  }, [wordNorm])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  useEffect(() => {
    if (!wordNorm) return
    fetchWordMetadata(wordNorm).then(setMetadata)
    fetchFieldDefinitions().then(setFieldDefs)
  }, [wordNorm])

  const posIdForWords = currentPosId
  const words = posIdForWords != null ? (wordsByPos[posIdForWords] ?? []) : []
  const currentNorm = currentWord ? stripPunctuationFromWord(currentWord).toLowerCase() : ''
  const otherWords = words.filter((w) => stripPunctuationFromWord(w).toLowerCase() !== currentNorm)

  const rawPronunciationUrl =
    (typeof metadata.pronunciation_url === 'string' && metadata.pronunciation_url) ||
    (teAkaData
      ? teAkaData.audioUrl ?? (teAkaData.wordId != null ? teAkaAudioUrlFromWordId(teAkaData.wordId) : '')
      : '')
  const pronunciationPlayUrl = resolveTeAkaPlayableUrl({
    wordId: teAkaData?.wordId ?? undefined,
    storedOrDirectUrl: rawPronunciationUrl,
  })
  const teAkaGcsAudioUrl =
    teAkaData && teAkaData.wordId != null ? teAkaAudioUrlFromWordId(teAkaData.wordId) : ''

  const dryRun = import.meta.env.VITE_WORD_METADATA_DRY_RUN === 'true' || import.meta.env.VITE_WORD_METADATA_DRY_RUN === '1'
  const handleAddField = async () => {
    if (!addFieldKey.trim()) return
    setAddFieldError(null)
    setAddingField(true)
    const opts = parseOptionsCsv(addFieldOptions)
    const r = await addFieldDefinition(addFieldKey.trim(), addFieldType, undefined, opts)
    setAddingField(false)
    if (!r.ok) {
      setAddFieldError(r.error)
      return
    }
    if (dryRun) {
      const k = addFieldKey.trim().toLowerCase().replace(/\s+/g, '_')
      setFieldDefs((prev) => [
        ...prev,
        {
          id: -1,
          key: k,
          type: addFieldType,
          label: null,
          options: addFieldType === 'single_select' || addFieldType === 'multi_select' ? opts : [],
        },
      ])
    } else {
      const fresh = await fetchFieldDefinitions()
      setFieldDefs(fresh)
    }
    setAddFieldKey('')
    setAddFieldOptions('')
  }

  const handleSaveMetadata = useCallback(
    async (key: string, value: unknown) => {
      const r = await upsertWordMetadata(wordNorm, { [key]: value })
      if (r.ok) {
        setMetadata((prev) => ({ ...prev, [key]: value }))
        if (!dryRun) onMetadataChange?.()
      }
    },
    [wordNorm, dryRun, onMetadataChange]
  )

  useEffect(() => {
    if (!teAkaData) return
    if (typeof metadata.pronunciation_url === 'string' && metadata.pronunciation_url.trim()) return
    const url =
      teAkaData.audioUrl ?? (teAkaData.wordId != null ? teAkaAudioUrlFromWordId(teAkaData.wordId) : '')
    if (url) void handleSaveMetadata('pronunciation_url', url)
  }, [teAkaData, metadata.pronunciation_url, handleSaveMetadata])

  return (
    <CenteredViewportPopup panelRef={ref} zClassName="z-[9999]">
      <div className="flex flex-col gap-2 p-2 bg-white border rounded shadow-lg min-w-[220px]">
      {dryRun && (
        <p className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">DRY RUN – no save</p>
      )}
      {/* Te Aka */}
      <div className="border-b pb-1.5">
        {wordNorm && teAkaPending && <p className="text-xs text-gray-400 italic">Loading…</p>}
        {wordNorm && !teAkaPending && teAkaData === null && (
          <p className="text-xs text-gray-400 italic">No definition found.</p>
        )}
        {wordNorm && teAkaData && (
          <div>
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  title={pronunciationPlayUrl ? 'Play pronunciation' : 'No playable URL'}
                  className={`shrink-0 inline-flex items-center justify-center min-h-10 min-w-10 -ml-0.5 rounded-md border border-transparent hover:border-gray-200 hover:bg-gray-50 ${
                    pronunciationPlayUrl ? 'text-gray-800 hover:text-gray-950' : 'text-gray-400 cursor-pointer'
                  }`}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!pronunciationPlayUrl) return
                    playTeAkaPrimaryThenGcs(pronunciationPlayUrl, teAkaGcsAudioUrl)
                  }}
                >
                  <HiSpeakerWave className="w-6 h-6 pointer-events-none" aria-hidden />
                </button>
                <span className="text-base font-semibold text-gray-900">{teAkaData.word}</span>
              </div>
              <a
                href={teAkaData.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="View full entry on Te Aka"
                className="shrink-0"
              >
                <img src="/te-aka-logo.jpg" alt="Te Aka" className="h-5 w-auto object-contain hover:opacity-80" />
              </a>
            </div>
            {teAkaData.entries.filter((_, i) => !hiddenTeAkaIndices.has(i)).length === 0 ? (
              <p className="text-xs text-gray-400 italic">All entries removed.</p>
            ) : (
            <div className="space-y-2">
              {teAkaData.entries
                .map((e, origIdx) => ({ e, origIdx }))
                .filter(({ origIdx }) => !hiddenTeAkaIndices.has(origIdx))
                .map(({ e, origIdx }) => {
                  const posTags = e.pos.match(/\([^)]+\)/g) ?? [e.pos]
                  const stripPosTags = (t: string) => t.replace(/^\s*(?:\([^)]+\)\s*)+/, '').trim().replace(/\s+/g, ' ')
                  const definitionClean = stripPosTags(e.definition)
                  const shortGloss = definitionClean.includes(' - ') ? definitionClean.split(' - ')[0]?.trim() : null
                  const exampleEnglish = e.example?.includes('—') ? e.example.split('—')[1]?.trim() : null
                  const englishLine = shortGloss ?? exampleEnglish
                  const exampleClean = e.example ? stripPosTags(e.example) : null
                  return (
                    <div key={origIdx} className="flex gap-1 group py-1.5 px-1.5 border border-gray-200 rounded">
                      <div className="flex-1 min-w-0 space-y-1">
                        {englishLine && (
                          <p className="text-xs font-medium text-gray-700">{englishLine}</p>
                        )}
                        <p className="text-xs text-gray-600">{definitionClean}</p>
                        {exampleClean && (
                          <details className="mt-0.5">
                            <summary className="text-[10px] text-blue-600 cursor-pointer hover:underline list-none [&::-webkit-details-marker]:hidden">
                              + example
                            </summary>
                            <p className="text-[11px] text-gray-600 italic mt-0.5">{exampleClean}</p>
                          </details>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1 justify-end">
                          {posTags.map((p) => (
                            <button
                              key={p}
                              type="button"
                              className="px-2 py-0.5 text-[10px] border rounded bg-gray-50 hover:bg-gray-100 text-gray-600"
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        title="Remove entry"
                        className="shrink-0 text-gray-400 hover:text-red-600 text-[10px] leading-none self-start"
                        onClick={() => setHiddenTeAkaIndices((prev) => new Set([...prev, origIdx]))}
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
            </div>
            )}
          </div>
        )}
      </div>

      {/* Pronunciation (from Te Aka scrape, auto-saved) */}
      {pronunciationPlayUrl && (
        <div className="border-b pb-1.5">
          <PronunciationRow
            playUrl={pronunciationPlayUrl}
            gcsFallbackUrl={teAkaGcsAudioUrl}
            linkUrl={rawPronunciationUrl || pronunciationPlayUrl}
          />
        </div>
      )}

      {/* Other words */}
      {currentPosId != null && otherWords.length > 0 && onReplaceWord && (
        <div className="border-b pb-1.5">
          <p className="text-[10px] text-gray-500 mb-1">Other words</p>
          <div className="flex flex-wrap gap-1">
            {otherWords.slice(0, 20).map((w) => (
              <button
                key={w}
                type="button"
                className="px-2 py-0.5 text-xs border rounded hover:bg-gray-100"
                onClick={() => {
                  onReplaceWord(w)
                  onClose()
                }}
              >
                {w}
              </button>
            ))}
            {otherWords.length > 20 && (
              <span className="text-[10px] text-gray-400 self-center">+{otherWords.length - 20} more</span>
            )}
          </div>
        </div>
      )}

      {/* Custom fields */}
      <div>
        <p className="text-[10px] text-gray-500 mb-1">Custom fields</p>
        <div className="space-y-1.5">
          {fieldDefs.map((fd) => (
            <CustomFieldRow
              key={fd.id}
              def={fd}
              value={metadata[fd.key]}
              onSave={(v) => handleSaveMetadata(fd.key, v)}
            />
          ))}
        </div>
        <div className="mt-1.5 space-y-1">
          <div className="flex flex-wrap gap-1 items-center">
            <input
              type="text"
              value={addFieldKey}
              onChange={(e) => setAddFieldKey(e.target.value)}
              placeholder="Key (e.g. picture)"
              className="border rounded px-2 py-0.5 text-xs w-24"
            />
            <select
              value={addFieldType}
              onChange={(e) => setAddFieldType(e.target.value as WordMetadataFieldType)}
              className="border rounded px-2 py-0.5 text-xs max-w-[11rem]"
            >
              {WORD_METADATA_FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            {(addFieldType === 'single_select' || addFieldType === 'multi_select') && (
              <input
                type="text"
                value={addFieldOptions}
                onChange={(e) => setAddFieldOptions(e.target.value)}
                placeholder="Options (comma-separated)"
                className="border rounded px-2 py-0.5 text-xs flex-1 min-w-[8rem]"
              />
            )}
            <button
              type="button"
              className="px-2 py-0.5 text-xs border rounded hover:bg-gray-100 disabled:opacity-50"
              disabled={addingField || !addFieldKey.trim()}
              onClick={handleAddField}
            >
              Add field
            </button>
          </div>
          {addFieldError ? <p className="text-[10px] text-red-600">{addFieldError}</p> : null}
        </div>
      </div>
    </div>
    </CenteredViewportPopup>
  )
}

function PronunciationRow({
  playUrl,
  gcsFallbackUrl,
  linkUrl,
}: {
  playUrl: string
  gcsFallbackUrl: string
  linkUrl: string
}) {
  if (!playUrl) return null
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-gray-600 w-20 shrink-0">Pronunciation</span>
      <button
        type="button"
        title="Play"
        className="text-gray-600 hover:text-gray-800 shrink-0"
        onClick={() => playTeAkaPrimaryThenGcs(playUrl, gcsFallbackUrl)}
      >
        <HiSpeakerWave className="w-4 h-4" aria-hidden />
      </button>
      <a
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-600 hover:underline truncate flex-1 min-w-0"
      >
        {linkUrl.replace(/^https?:\/\//, '').slice(0, 40)}
        {linkUrl.length > 50 ? '…' : ''}
      </a>
    </div>
  )
}

function CustomFieldRow({ def, value, onSave }: { def: WordMetadataFieldDef; value: unknown; onSave: (v: unknown) => void }) {
  const [editing, setEditing] = useState(false)
  const [textVal, setTextVal] = useState(String(value ?? ''))
  const [uploading, setUploading] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (def.type === 'text') {
    if (editing) {
      return (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-600 w-16 shrink-0">{def.label ?? def.key}</span>
          <input
            type="text"
            value={textVal}
            onChange={(e) => setTextVal(e.target.value)}
            className="flex-1 border rounded px-1.5 py-0.5 text-xs"
            autoFocus
          />
          <button
            type="button"
            className="text-xs text-blue-600 hover:underline"
            onClick={() => {
              onSave(textVal)
              setEditing(false)
            }}
          >
            Save
          </button>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-600 w-16 shrink-0">{def.label ?? def.key}</span>
        <span className="text-xs flex-1 truncate">{String(value ?? '—')}</span>
        <button type="button" className="text-[10px] text-blue-600 hover:underline" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
    )
  }

  if (def.type === 'image') {
    const url = typeof value === 'string' ? value : ''
    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (!f) return
      setUploading(true)
      try {
        const { url: u } = await uploadR2Image(f)
        onSave(u)
      } finally {
        setUploading(false)
        e.target.value = ''
      }
    }
    return (
      <div className="flex items-start gap-1">
        <span className="text-[10px] text-gray-600 w-16 shrink-0">{def.label ?? def.key}</span>
        <div className="flex-1 min-w-0">
          {url && <img src={url} alt="" className="max-h-16 rounded border object-contain" />}
          <div className="flex gap-1 mt-0.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            <button
              type="button"
              className="text-[10px] px-1.5 py-0.5 border rounded hover:bg-gray-100 disabled:opacity-50"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? '…' : 'Upload'}
            </button>
            <ImageSelectPopup
              open={selecting}
              onClose={() => setSelecting(false)}
              onSelect={(u) => {
                onSave(u)
                setSelecting(false)
              }}
            />
            <button
              type="button"
              className="text-[10px] px-1.5 py-0.5 border rounded hover:bg-gray-100"
              onClick={() => setSelecting(true)}
            >
              Select
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (def.type === 'link') {
    if (editing) {
      return (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-600 w-16 shrink-0">{def.label ?? def.key}</span>
          <input
            type="url"
            value={textVal}
            onChange={(e) => setTextVal(e.target.value)}
            className="flex-1 border rounded px-1.5 py-0.5 text-xs"
            placeholder="https://"
            autoFocus
          />
          <button
            type="button"
            className="text-xs text-blue-600 hover:underline"
            onClick={() => {
              onSave(textVal)
              setEditing(false)
            }}
          >
            Save
          </button>
        </div>
      )
    }
    const href = typeof value === 'string' ? value : ''
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-600 w-16 shrink-0">{def.label ?? def.key}</span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline truncate flex-1 min-w-0"
          >
            {href.replace(/^https?:\/\//, '').slice(0, 48)}
            {href.length > 52 ? '…' : ''}
          </a>
        ) : (
          <span className="text-xs flex-1 text-gray-400">—</span>
        )}
        <button type="button" className="text-[10px] text-blue-600 hover:underline" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
    )
  }

  if (def.type === 'video') {
    const url = typeof value === 'string' ? value : ''
    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (!f) return
      setUploading(true)
      try {
        const { url: u } = await uploadR2Image(f)
        onSave(u)
      } finally {
        setUploading(false)
        e.target.value = ''
      }
    }
    return (
      <div className="flex items-start gap-1">
        <span className="text-[10px] text-gray-600 w-16 shrink-0">{def.label ?? def.key}</span>
        <div className="flex-1 min-w-0">
          {url ? (
            <video src={url} className="max-h-20 rounded border w-full max-w-[200px]" controls muted />
          ) : null}
          <div className="flex flex-wrap gap-1 mt-0.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFile}
            />
            <button
              type="button"
              className="text-[10px] px-1.5 py-0.5 border rounded hover:bg-gray-100 disabled:opacity-50"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? '…' : 'Upload'}
            </button>
            <input
              key={url || 'no-url'}
              type="url"
              defaultValue={url}
              placeholder="Or paste URL"
              className="flex-1 min-w-0 border rounded px-1.5 py-0.5 text-[10px]"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v) onSave(v)
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (def.type === 'single_select') {
    const opts = stringOptionsFromDef(def)
    const cur = typeof value === 'string' ? value : ''
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-600 w-16 shrink-0">{def.label ?? def.key}</span>
        <select
          value={cur}
          onChange={(e) => onSave(e.target.value)}
          className="flex-1 border rounded px-1.5 py-0.5 text-xs min-w-0"
        >
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (def.type === 'multi_select') {
    const opts = stringOptionsFromDef(def)
    const cur = new Set(
      Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
    )
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-gray-600">{def.label ?? def.key}</span>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {opts.map((o) => (
            <label key={o} className="inline-flex items-center gap-1 text-[10px] cursor-pointer">
              <input
                type="checkbox"
                checked={cur.has(o)}
                onChange={() => {
                  const next = new Set(cur)
                  if (next.has(o)) next.delete(o)
                  else next.add(o)
                  onSave([...next])
                }}
              />
              {o}
            </label>
          ))}
        </div>
      </div>
    )
  }

  return null
}

function ImageSelectPopup({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (url: string) => void }) {
  const { data: images = [], isLoading } = useQuery({
    queryKey: ['r2_images'],
    queryFn: listR2Images,
    enabled: open,
  })
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[10000] bg-black/20 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded shadow-lg p-2 max-h-48 overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs mb-2">Select image</p>
        {isLoading ? <p className="text-xs text-gray-500">Loading…</p> : null}
        <div className="grid grid-cols-3 gap-2">
          {images.map((img) => (
            <button
              key={img.key}
              type="button"
              className="aspect-square rounded border overflow-hidden hover:border-blue-400"
              onClick={() => onSelect(img.url)}
            >
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
        <button type="button" className="mt-2 text-xs text-blue-600 hover:underline" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
