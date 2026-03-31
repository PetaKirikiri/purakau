import { useState, useRef, useEffect, Fragment, type CSSProperties, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDbConfirmation } from '../context/DbConfirmationContext'
import { TokenDisplay } from '../components/TokenDisplay'
import { SentenceRow } from '../components/SentenceRow'
import { PageBlock } from '../components/PageBlock'
import type { PageMediaQuestionHandlers } from '../components/PageMediaDisplay'
import { ImageEditModal } from '../components/ImageEditModal'
import { TokenPosSelector } from '../components/TokenPosSelector'
import { WordMetadataPopover } from '../components/WordMetadataPopover'
import { TokenHoverHighlight } from '../components/TokenHoverHighlight'
import { useTokenPosInteraction, sortPosTypesForHover } from '../hooks/useTokenPosInteraction'
import {
  getTokensForSentence,
  getTokensFromSentence,
  getTextFromTokens,
  splitIntoSentences,
  splitTokensIntoSentences,
  mergeTokenPos,
  stripPunctuationFromWord,
} from '../lib/tokens'
import { replaceTokenText, mergeTokensAndSetPos, mergeTokensAndSetPosPageMediaQuestion } from '../lib/saveTokenPos'
import { saveKiwaha } from '../lib/saveKiwaha'
import { applyAutoTagsForStory } from '../lib/applyAutoTags'
import { createStoryVersion } from '../lib/createStoryVersion'
import { ensureStoryVersionForTitle } from '../lib/ensureStoryVersion'
import { extractSentenceStructure, saveSentencePattern } from '../lib/saveSentencePattern'
import { findPatternRuns } from '../lib/patternMatch'
import {
  findMatchingPatternForGeneration,
  generatePageMediaQuestionTokenArrays,
  type PatternRowForGeneration,
} from '../lib/generateQuestionsFromPattern'
import { supabase } from '../lib/supabase'
import { formatError } from '../lib/formatError'
import { listR2Images, uploadR2Image } from '../lib/r2'
import { CenteredViewportPopup } from '../components/CenteredViewportPopup'
import type { PatternQuestionConfig, SentencePatternPhraseComponent, SentenceToken } from '../db/schema'
import type { TokenSource } from '../lib/saveTokenPos'
import type { StoryRow } from '../lib/storyModel'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type PosType = { id: number; code: string; label: string; description: string | null; color?: string | null }

function SortableStoryBlock({
  id,
  disabled,
  children,
}: {
  id: number
  disabled: boolean
  children: (handle: { listeners: DraggableSyntheticListeners }) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : undefined,
  }
  return (
    <div ref={setNodeRef} style={style} className="block mb-8" {...attributes}>
      {children({ listeners })}
    </div>
  )
}

export default function StoryEditor() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { show: showDbConfirmation } = useDbConfirmation()
  const selectionPopoverRef = useRef<HTMLDivElement>(null)
  const proseRef = useRef<HTMLDivElement>(null)
  const [selectionPopover, setSelectionPopover] = useState<{
    x: number
    y: number
    sentenceIds: number[]
  } | null>(null)
  const [selectionPage, setSelectionPage] = useState<string>('')
  const [selectionParagraph, setSelectionParagraph] = useState<string>('')
  const [selectionChapter, setSelectionChapter] = useState<string>('')
  const [insertMediaOpen, setInsertMediaOpen] = useState(false)
  const [insertForPage, setInsertForPage] = useState<number | null>(null)
  const [insertMediaUrl, setInsertMediaUrl] = useState('')
  const [insertMediaError, setInsertMediaError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedR2Image, setSelectedR2Image] = useState<{ key: string; url: string } | null>(null)
  const [editingText, setEditingText] = useState('')
  const [savePatternOpen, setSavePatternOpen] = useState(false)
  const [savePatternLabel, setSavePatternLabel] = useState('')
  const [patternBuilderContext, setPatternBuilderContext] = useState<{
    sentenceId: number | 'editor' | { questionId: number }
    baseName?: string
    isPartial?: boolean
  } | null>(null)
  const [makePhraseOpen, setMakePhraseOpen] = useState(false)
  const [makePhraseSentenceId, setMakePhraseSentenceId] = useState<number | 'editor' | { questionId: number } | null>(null)
  const [makePhraseSelected, setMakePhraseSelected] = useState<Set<number>>(new Set())
  const [makePhraseName, setMakePhraseName] = useState('')
  const [kiwahaSelection, setKiwahaSelection] = useState<
    | { sentenceId: number; indices: Set<number> }
    | { questionId: number; indices: Set<number> }
    | null
  >(null)
  const [orderPopover, setOrderPopover] = useState<{
    sentenceId: number
    x: number
    y: number
  } | null>(null)
  const [editingImage, setEditingImage] = useState<{
    id: number
    url: string
    image_id?: number
    tags: { id?: number; x: number; y: number; sort_order?: number; sentence_text?: string | null; tokens_array?: { index: number; text: string; pos_type_id: number | null; word_pos_entry_id: number | null }[] | null }[]
    usages?: { title_id?: number; version_id?: number; page_number: number }[]
  } | null>(null)
  const orderPopoverRef = useRef<HTMLDivElement>(null)
  const [activeDragSentenceId, setActiveDragSentenceId] = useState<number | null>(null)
  const [versionId, setVersionId] = useState<number | null>(null)
  const [draftTokens, setDraftTokens] = useState<SentenceToken[]>([])
  const [draftInsertIndex, setDraftInsertIndex] = useState(0)
  const [editingRowId, setEditingRowId] = useState<number | 'draft' | null>(null)
  const [pageEditOpen, setPageEditOpen] = useState<number | null>(null)
  const [pageEditText, setPageEditText] = useState('')
  const [sourceTextOpen, setSourceTextOpen] = useState(false)
  const [sourceText, setSourceText] = useState('')
  const skipNextUrlSyncRef = useRef(false)
  const [generateQuestionsModal, setGenerateQuestionsModal] = useState<{
    pageMediaId: number
    pageNumber: number
  } | null>(null)
  const [generateSentenceId, setGenerateSentenceId] = useState<number | null>(null)

  const { data: title, isLoading: titleLoading, error: titleError } = useQuery({
    queryKey: ['titles', id],
    queryFn: async () => {
      const numId = id ? Number(id) : NaN
      if (Number.isNaN(numId)) throw new Error('Invalid story ID')
      const { data, error } = await supabase
        .from('titles')
        .select('id, name, author, created_at')
        .eq('id', numId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id && !Number.isNaN(Number(id)),
  })

  const { data: versions = [], refetch: refetchVersions } = useQuery({
    queryKey: ['story_versions', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('story_versions')
        .select('id, version_number, label')
        .eq('title_id', Number(id!))
        .order('version_number', { ascending: true })
      if (error) throw error
      return (data ?? []) as { id: number; version_number: number; label: string }[]
    },
    enabled: !!id,
  })

  const ensureVersionMutation = useMutation({
    mutationFn: () => ensureStoryVersionForTitle(Number(id!)),
    onSuccess: async () => {
      await refetchVersions()
    },
  })

  const currentVersion = versionId != null ? versions.find((v) => v.id === versionId) : versions[versions.length - 1]
  const effectiveVersionId = currentVersion?.id ?? versionId

  useEffect(() => {
    if (versions.length === 0) return
    if (skipNextUrlSyncRef.current) {
      skipNextUrlSyncRef.current = false
      return
    }
    const vFromUrl = searchParams.get('version') ?? searchParams.get('v')
    const byLabel = vFromUrl ? versions.find((v) => v.label === vFromUrl) : null
    const byId = vFromUrl && /^\d+$/.test(vFromUrl) ? versions.find((v) => v.id === Number(vFromUrl)) : null
    const match = byLabel ?? byId
    if (vFromUrl) {
      if (match && match.id !== versionId) {
        setVersionId(match.id)
        setSearchParams((p) => {
          const next = new URLSearchParams(p)
          next.set('version', match.label)
          return next
        })
      }
    } else if (versionId == null) {
      const latest = versions[versions.length - 1]
      setVersionId(latest.id)
      setSearchParams((p) => {
        const next = new URLSearchParams(p)
        next.set('version', latest.label)
        return next
      })
    }
  }, [versions, versionId, searchParams, setSearchParams])

  const setVersionAndUrl = (vid: number) => {
    skipNextUrlSyncRef.current = true
    setVersionId(vid)
    const v = versions.find((x) => x.id === vid)
    if (v) {
      setSearchParams((p) => {
        const next = new URLSearchParams(p)
        next.set('version', v.label)
        return next
      })
    }
  }

  const { data: storySource, isLoading: storySourceLoading } = useQuery({
    queryKey: ['story_sources', id, effectiveVersionId],
    queryFn: async () => {
      let q = supabase
        .from('story_sources')
        .select('id, source_text')
        .eq('title_id', Number(id!))
        .eq('language', 'mi')
      if (effectiveVersionId) q = q.eq('version_id', effectiveVersionId)
      else q = q.is('version_id', null)
      const { data, error } = await q.maybeSingle()
      if (error) throw error
      return data as { id: number; source_text: string } | null
    },
    enabled: !!id && sourceTextOpen,
  })

  useEffect(() => {
    if (sourceTextOpen && storySource !== undefined) setSourceText(storySource?.source_text ?? '')
  }, [sourceTextOpen, storySource])

  const saveSourceTextMutation = useMutation({
    mutationFn: async (text: string) => {
      const titleId = Number(id!)
      const versionId = effectiveVersionId ?? null
      const sourceText = text.trim() || ''
      let q = supabase.from('story_sources').select('id').eq('title_id', titleId).eq('language', 'mi')
      if (versionId) q = q.eq('version_id', versionId)
      else q = q.is('version_id', null)
      const { data: existing } = await q.maybeSingle()
      if (existing) {
        const { error } = await supabase.from('story_sources').update({ source_text: sourceText }).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('story_sources').insert({
          title_id: titleId,
          version_id: versionId,
          source_text: sourceText,
          language: 'mi',
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['story_sources', id, effectiveVersionId] })
      showDbConfirmation({ tables: ['story_sources'], details: ['Source text saved'] })
      setSourceTextOpen(false)
    },
  })

  const { data: sentences, isLoading: sentencesLoading, error: sentencesError } = useQuery({
    queryKey: ['story_sentences', id, effectiveVersionId],
    queryFn: async () => {
      const titleId = Number(id!)
      if (effectiveVersionId) {
        const { data, error } = await supabase
          .from('story_sentences')
          .select('id, sentence_number, sentence_text, tokens_array, page_number, paragraph_number, chapter_number')
          .eq('version_id', effectiveVersionId)
          .order('sentence_number', { ascending: true })
          .limit(10000)
        if (!error && (data ?? []).length > 0) {
          return data ?? []
        }
      }
      const { data: byTitle, error: errTitle } = await supabase
        .from('story_sentences')
        .select('id, sentence_number, sentence_text, tokens_array, page_number, paragraph_number, chapter_number')
        .eq('title_id', titleId)
        .order('sentence_number', { ascending: true })
        .limit(10000)
      if (!errTitle && (byTitle ?? []).length > 0) {
        return byTitle ?? []
      }
      const { data: sources } = await supabase
        .from('story_sources')
        .select('id')
        .eq('title_id', titleId)
      const sourceIds = (sources ?? []).map((s) => s.id)
      if (sourceIds.length > 0) {
        const { data: bySource, error: errSource } = await supabase
          .from('story_sentences')
          .select('id, sentence_number, sentence_text, tokens_array, page_number, paragraph_number, chapter_number')
          .in('story_source_id', sourceIds)
          .order('sentence_number', { ascending: true })
          .limit(10000)
        if (!errSource && (bySource ?? []).length > 0) return bySource ?? []
      }
      if (errTitle) throw errTitle
      return []
    },
    enabled: !!id,
  })

  useEffect(() => {
    if (!sentences?.length || !id) return
    const versionId = effectiveVersionId ?? null
    const titleId = Number(id)
    applyAutoTagsForStory(versionId, titleId).then(({ applied }) => {
      if (applied > 0) {
        queryClient.refetchQueries({ queryKey: ['story_sentences', id, effectiveVersionId] })
      }
    })
  }, [effectiveVersionId, sentences?.length, id, queryClient])

  const { data: allTitles = [] } = useQuery({
    queryKey: ['titles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('titles').select('id, name')
      if (error) throw error
      return data ?? []
    },
    enabled: !!editingImage,
  })
  const titleNames = Object.fromEntries((allTitles as { id: number; name: string }[]).map((t) => [t.id, t.name]))

  const { data: posTypes = [] } = useQuery({
    queryKey: ['pos_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pos_types')
        .select('id, code, label, description, color')
        .order('label')
      if (error) throw error
      return data as PosType[]
    },
  })

  const { data: chunkPatternsRaw = [] } = useQuery({
    queryKey: ['pos_chunk_patterns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pos_chunk_patterns')
        .select('id, name, pos_pattern')
        .eq('is_active', true)
      if (error) throw error
      return data ?? []
    },
  })
  const chunkPatterns: { name: string; sequence: number[] }[] = chunkPatternsRaw.map((r) => {
    const seq = (r.pos_pattern as { sequence?: number[] })?.sequence
    return { name: r.name, sequence: Array.isArray(seq) ? seq : [] }
  })
  const draftPhrasePatternsForToolbar = chunkPatternsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    pos_pattern: { sequence: (p.pos_pattern as { sequence?: number[] })?.sequence ?? [] },
  }))

  const { data: sentencePatterns = [] } = useQuery({
    queryKey: ['sentence_patterns', id],
    queryFn: async () => {
      let query = supabase.from('sentence_patterns').select('*')
      const titleId = id ? Number(id) : NaN
      if (!Number.isNaN(titleId)) {
        query = query.or(`title_id.eq.${titleId},title_id.is.null`)
      }
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as {
        id: number
        name: string
        pos_blueprint: number[]
        phrase_components?: SentencePatternPhraseComponent[] | null
        question_config: PatternQuestionConfig | null
      }[]
    },
    enabled: !!id,
  })

  const { data: wordsByPosRaw } = useQuery({
    queryKey: ['word_registry', 'all_by_pos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('word_registry')
        .select('word_text, pos_types')
        .order('word_text')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
    gcTime: 24 * 60 * 60_000,
  })
  const wordsByPos: Record<number, string[]> = (() => {
    const map: Record<number, string[]> = {}
    for (const row of wordsByPosRaw ?? []) {
      const list = (row.pos_types as { pos_type_id?: number }[] ?? [])
      for (const p of list) {
        const id = p.pos_type_id
        if (id != null) {
          if (!map[id]) map[id] = []
          map[id].push(row.word_text as string)
        }
      }
    }
    return map
  })()

  const pageNumbers = [...new Set((sentences ?? []).map((s) => s.page_number).filter((n): n is number => n != null))].sort(
    (a, b) => a - b
  )
  const hasPages = pageNumbers.length > 0

  const { data: r2Images = [], isLoading: r2ImagesLoading, error: r2ImagesError } = useQuery({
    queryKey: ['r2_images'],
    queryFn: listR2Images,
    enabled: insertMediaOpen,
  })

  const { data: allPageMedia = [] } = useQuery({
    queryKey: ['page_media', id, effectiveVersionId],
    queryFn: async () => {
      const titleId = Number(id!)
      let items: { id: number; url?: string; image_id?: number; media_type?: string; sort_order?: number; page_number: number; images?: unknown }[] = []
      if (effectiveVersionId) {
        const { data, error } = await supabase
          .from('page_media')
          .select('id, url, image_id, media_type, sort_order, page_number, images(url, usages)')
          .eq('version_id', effectiveVersionId)
          .order('page_number', { ascending: true })
          .order('sort_order', { ascending: true })
        if (!error) items = data ?? []
      }
      if (items.length === 0) {
        const { data, error } = await supabase
          .from('page_media')
          .select('id, url, image_id, media_type, sort_order, page_number, images(url, usages)')
          .eq('title_id', titleId)
          .order('page_number', { ascending: true })
          .order('sort_order', { ascending: true })
        if (!error) items = data ?? []
      }
      const imageIds = [...new Set(items.map((m) => m.image_id).filter((mid): mid is number => mid != null))]
      let tagsByImage: Record<number, { id: number; x: number; y: number; sort_order: number; sentence_text: string | null; tokens_array: { index: number; text: string; pos_type_id: number | null; word_pos_entry_id: number | null }[] | null }[]> = {}
      if (imageIds.length > 0) {
        let tagsQuery = supabase
          .from('image_tags')
          .select('id, image_id, x, y, sort_order, sentence_text, tokens_array')
          .in('image_id', imageIds)
          .order('sort_order', { ascending: true })
        if (effectiveVersionId) {
          tagsQuery = tagsQuery.eq('version_id', effectiveVersionId)
        }
        const { data: tagsData, error: tagsError } = await tagsQuery
        if (!tagsError && tagsData) {
          for (const t of tagsData) {
            const imgId = t.image_id
            if (!tagsByImage[imgId]) tagsByImage[imgId] = []
            tagsByImage[imgId].push(t)
          }
        }
      }
      const mediaIds = items.map((m) => m.id)
      const questionsByMediaId: Record<
        number,
        { id: number; page_media_id: number; sort_order: number; tokens_array: SentenceToken[] | null }[]
      > = {}
      if (mediaIds.length > 0) {
        const { data: qrows, error: qErr } = await supabase
          .from('page_media_questions')
          .select('id, page_media_id, sort_order, tokens_array')
          .in('page_media_id', mediaIds)
          .order('sort_order', { ascending: true })
        if (!qErr && qrows) {
          for (const q of qrows) {
            const mid = q.page_media_id as number
            if (!questionsByMediaId[mid]) questionsByMediaId[mid] = []
            questionsByMediaId[mid].push({
              id: q.id as number,
              page_media_id: mid,
              sort_order: q.sort_order as number,
              tokens_array: (q.tokens_array as SentenceToken[] | null) ?? null,
            })
          }
        }
      }
      return items.map((m) => {
        const img = m.images as { url?: string; usages?: { title_id?: number; version_id?: number; page_number: number }[] } | null
        const tags = (m.image_id ? tagsByImage[m.image_id] ?? [] : []).sort((a, b) => a.sort_order - b.sort_order)
        return {
          ...m,
          url: img?.url ?? m.url ?? '',
          tags,
          usages: img?.usages ?? [],
          questions: questionsByMediaId[m.id] ?? [],
        }
      })
    },
    enabled: !!id,
  })

  const isEmptyStory = (sentences?.length ?? 0) === 0
  const pageMediaByPage = allPageMedia.reduce(
    (acc, m) => {
      const p = m.page_number ?? 0
      if (!acc[p]) acc[p] = []
      acc[p].push(m)
      return acc
    },
    {} as Record<number, typeof allPageMedia>
  )
  const insertMediaMutation = useMutation({
    mutationFn: async (url: string) => {
      const page = insertForPage ?? 1
      if (!id || page == null || !effectiveVersionId) throw new Error('No page selected')
      const titleId = Number(id)
      const { data: img, error: imgErr } = await supabase
        .from('images')
        .insert({ url: url.trim(), usages: [{ version_id: effectiveVersionId, page_number: page }] })
        .select('id')
        .single()
      if (imgErr || !img) throw imgErr ?? new Error('Failed to create image')
      const all = (queryClient.getQueryData(['page_media', id, effectiveVersionId]) as { page_number?: number; sort_order?: number }[]) ?? []
      const cached = all.filter((m) => m.page_number === page)
      const maxOrder = Math.max(0, ...cached.map((m) => m.sort_order ?? 0))
      const { data, error } = await supabase
        .from('page_media')
        .insert({
          title_id: titleId,
          version_id: effectiveVersionId,
          page_number: page,
          image_id: img.id,
          media_type: 'image',
          sort_order: maxOrder + 1,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page_media', id, effectiveVersionId] })
      setInsertMediaOpen(false)
      setInsertForPage(null)
      setInsertMediaUrl('')
      setInsertMediaError(null)
      setSelectedR2Image(null)
    },
    onError: (err: Error) => setInsertMediaError(err.message),
  })

  const deleteMediaMutation = useMutation({
    mutationFn: async (mediaId: number) => {
      const { data: row } = await supabase
        .from('page_media')
        .select('image_id, version_id, page_number')
        .eq('id', mediaId)
        .single()
      const { error } = await supabase.from('page_media').delete().eq('id', mediaId)
      if (error) throw error
      if (row?.image_id && row.version_id != null && row.page_number != null) {
        const { data: img } = await supabase.from('images').select('usages').eq('id', row.image_id).single()
        const usagesArr = (img?.usages as { version_id?: number; title_id?: number; page_number: number }[]) ?? []
        const usages = usagesArr.filter(
          (u) => !(u.version_id === row.version_id && u.page_number === row.page_number)
        )
        await supabase.from('images').update({ usages }).eq('id', row.image_id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page_media', id, effectiveVersionId] })
    },
  })

  const insertPageMediaQuestionMutation = useMutation({
    mutationFn: async (pageMediaId: number) => {
      const { data: existing } = await supabase
        .from('page_media_questions')
        .select('sort_order')
        .eq('page_media_id', pageMediaId)
      const maxOrder = Math.max(0, ...((existing ?? []).map((r) => r.sort_order ?? 0)))
      const { error } = await supabase.from('page_media_questions').insert({
        page_media_id: pageMediaId,
        sort_order: maxOrder + 1,
        tokens_array: [],
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page_media', id, effectiveVersionId] })
    },
  })

  const updatePageMediaQuestionTextMutation = useMutation({
    mutationFn: async ({ questionId, text }: { questionId: number; text: string }) => {
      const tokens = getTokensFromSentence(text)
      const { error } = await supabase.from('page_media_questions').update({ tokens_array: tokens }).eq('id', questionId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page_media', id, effectiveVersionId] })
    },
  })

  const deletePageMediaQuestionMutation = useMutation({
    mutationFn: async (questionId: number) => {
      const { error } = await supabase.from('page_media_questions').delete().eq('id', questionId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page_media', id, effectiveVersionId] })
    },
  })

  const generateQuestionsFromSentenceMutation = useMutation({
    mutationFn: async ({ pageMediaId, sentenceId }: { pageMediaId: number; sentenceId: number }) => {
      const sent = (sentences ?? []).find((s) => s.id === sentenceId)
      if (!sent) throw new Error('Sentence not found')
      const tokens = getTokensForSentence(sent)
      const patternsForGen: PatternRowForGeneration[] = sentencePatterns.map((p) => ({
        id: p.id,
        pos_blueprint: p.pos_blueprint,
        phrase_components: p.phrase_components ?? null,
        question_config: p.question_config ?? null,
      }))
      const pattern = findMatchingPatternForGeneration(tokens, patternsForGen)
      if (!pattern?.question_config?.variants?.length) {
        throw new Error('No pattern with question templates matches this sentence')
      }
      const arrays = generatePageMediaQuestionTokenArrays(tokens, pattern)
      if (arrays.length === 0) throw new Error('Could not build question tokens (check slot and templates)')
      const { data: existing } = await supabase
        .from('page_media_questions')
        .select('sort_order')
        .eq('page_media_id', pageMediaId)
      let next = Math.max(0, ...((existing ?? []).map((r) => r.sort_order ?? 0)))
      for (const tokArr of arrays) {
        next += 1
        const { error } = await supabase.from('page_media_questions').insert({
          page_media_id: pageMediaId,
          sort_order: next,
          tokens_array: tokArr,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page_media', id, effectiveVersionId] })
      setGenerateQuestionsModal(null)
      setGenerateSentenceId(null)
      showDbConfirmation({ tables: ['page_media_questions'], details: ['Generated picture questions from sentence'] })
    },
  })

  const updateImageTagsMutation = useMutation({
    mutationFn: async ({
      imageId,
      tags,
    }: {
      imageId: number
      tags: {
        id?: number
        x: number
        y: number
        tokens?: { index: number; text: string; pos_type_id: number | null; word_pos_entry_id: number | null }[]
      }[]
    }) => {
      const idsToKeep = tags.map((t) => t.id).filter((tid): tid is number => tid != null)
      const existing = await supabase
        .from('image_tags')
        .select('id')
        .eq('image_id', imageId)
        .eq('version_id', effectiveVersionId)
      const existingIds = (existing.data ?? []).map((r) => r.id)
      const toDelete = existingIds.filter((tid) => !idsToKeep.includes(tid))
      for (const tid of toDelete) {
        await supabase.from('image_tags').delete().eq('id', tid)
      }
      for (let i = 0; i < tags.length; i++) {
        const t = tags[i]
        const sentenceText = (t.tokens ?? []).map((tok) => tok.text).join(' ')
        const row = {
          x: t.x,
          y: t.y,
          sort_order: i,
          sentence_text: sentenceText || null,
          tokens_array: t.tokens ?? [],
        }
        if (t.id) {
          const { error } = await supabase.from('image_tags').update(row).eq('id', t.id)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('image_tags')
            .insert({ image_id: imageId, version_id: effectiveVersionId, ...row })
          if (error) throw error
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page_media', id, effectiveVersionId] })
    },
  })

  const assignPageMutation = useMutation({
    mutationFn: async (sentenceIds: number[]) => {
      const maxPage = Math.max(0, ...(sentences ?? []).map((s) => s.page_number ?? 0))
      const nextPage = maxPage + 1
      const { error } = await supabase
        .from('story_sentences')
        .update({ page_number: nextPage })
        .in('id', sentenceIds)
      if (error) throw error
      return { pageNumber: nextPage, count: sentenceIds.length }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['story_sentences', id, effectiveVersionId] })
      showDbConfirmation({
        tables: ['story_sentences'],
        details: [`${result.count} row(s) assigned same page_number: ${result.pageNumber}`],
      })
    },
  })

  const updateSelectionMutation = useMutation({
    mutationFn: async ({
      sentenceIds,
      updates,
    }: {
      sentenceIds: number[]
      updates: { page_number?: number | null; paragraph_number?: number | null; chapter_number?: number | null }
    }) => {
      const { error } = await supabase
        .from('story_sentences')
        .update(updates)
        .in('id', sentenceIds)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['story_sentences', id, effectiveVersionId] })
      setSelectionPopover(null)
      setEditingRowId(null)
      setEditingText('')
      showDbConfirmation({ tables: ['story_sentences'], details: ['Updated selection'] })
    },
  })

  const updateSentenceMutation = useMutation({
    mutationFn: async ({
      sentenceId,
      text,
      sentenceNumber,
      pageNumber,
      paragraphNumber,
      chapterNumber,
    }: {
      sentenceId: number
      text: string
      sentenceNumber?: number
      pageNumber?: number | null
      paragraphNumber?: number | null
      chapterNumber?: number | null
    }) => {
      const parts = splitIntoSentences(text.trim())
      if (parts.length === 0) throw new Error('Empty text')
      const newText = parts[0]
      const { data: row, error: rowError } = await supabase
        .from('story_sentences')
        .select('tokens_array, sentence_text, version_id, title_id')
        .eq('id', sentenceId)
        .single()
      if (rowError) throw rowError
      const oldTokens: SentenceToken[] = Array.isArray(row?.tokens_array)
        ? (row.tokens_array as SentenceToken[])
        : getTokensFromSentence(row?.sentence_text ?? '')
      const newTokens = getTokensFromSentence(newText)
      const mergedTokens = mergeTokenPos(oldTokens, newTokens)
      const { error: updError } = await supabase
        .from('story_sentences')
        .update({ sentence_text: newText, tokens_array: mergedTokens })
        .eq('id', sentenceId)
        .select('id')
      if (updError) throw updError
      let insertedCount = 0
      if (parts.length > 1) {
        const current = (sentences ?? []).find((x) => x.id === sentenceId)
        const baseNum = current?.sentence_number ?? sentenceNumber ?? 1
        const shiftBy = parts.length - 1
        const { data: afterRows } = await supabase
          .from('story_sentences')
          .select('id, sentence_number')
          .eq('version_id', effectiveVersionId!)
          .gt('sentence_number', baseNum)
          .order('sentence_number', { ascending: false })
        for (const row of afterRows ?? []) {
          await supabase
            .from('story_sentences')
            .update({ sentence_number: (row.sentence_number ?? 0) + shiftBy })
            .eq('id', row.id)
        }
        const titleId = id ? Number(id) : null
        if (titleId == null) throw new Error('Story ID required')
        const toInsert = parts.slice(1).map((sentenceText, i) => ({
          title_id: titleId,
          version_id: effectiveVersionId!,
          sentence_number: baseNum + i + 1,
          sentence_text: sentenceText,
          tokens_array: getTokensFromSentence(sentenceText),
          page_number: pageNumber ?? current?.page_number ?? null,
          paragraph_number: paragraphNumber ?? current?.paragraph_number ?? null,
          chapter_number: chapterNumber ?? current?.chapter_number ?? null,
        }))
        const { error: insError } = await supabase.from('story_sentences').insert(toInsert)
        if (insError) throw insError
        insertedCount = toInsert.length
      }
      return { sentenceId, insertedCount }
    },
    onSuccess: async (result) => {
      await queryClient.refetchQueries({ queryKey: ['story_sentences', id, effectiveVersionId] })
      queryClient.invalidateQueries({ queryKey: ['word_registry'] })
      setEditingRowId(null)
      const msg =
        result.insertedCount > 0
          ? `Saved. Added ${result.insertedCount} new sentence(s).`
          : `Saved sentence.`
      showDbConfirmation({ tables: ['story_sentences'], details: [msg] })
    },
    onError: (err) => {
      showDbConfirmation({ tables: ['story_sentences'], details: [err.message], type: 'error' })
    },
  })

  const deleteSentenceMutation = useMutation({
    mutationFn: async (sentenceIds: number[]) => {
      const { error: delError } = await supabase
        .from('story_sentences')
        .delete()
        .in('id', sentenceIds)
      if (delError) throw delError
      const { data: remaining } = await supabase
        .from('story_sentences')
        .select('id, sentence_number')
        .eq('version_id', effectiveVersionId!)
        .order('sentence_number', { ascending: true })
      if (!remaining?.length) return
      for (let i = remaining.length - 1; i >= 0; i--) {
        const { error: updError } = await supabase
          .from('story_sentences')
          .update({ sentence_number: i + 1 })
          .eq('id', remaining[i].id)
        if (updError) throw updError
      }
    },
    onSuccess: (_, sentenceIds) => {
      queryClient.invalidateQueries({ queryKey: ['story_sentences', id, effectiveVersionId] })
      queryClient.invalidateQueries({ queryKey: ['word_registry'] })
      setEditingRowId(null)
      setSelectionPopover(null)
      showDbConfirmation({ tables: ['story_sentences'], details: [`Deleted ${sentenceIds.length} sentence(s)`] })
    },
  })

  const moveToEndMutation = useMutation({
    mutationFn: async (sentenceId: number) => {
      const current = (sentences ?? []).find((x) => x.id === sentenceId)
      const currentNum = current?.sentence_number ?? 0
      const maxNum = Math.max(0, ...(sentences ?? []).map((s) => s.sentence_number ?? 0))
      if (currentNum >= maxNum) return
      const { data: afterRows } = await supabase
        .from('story_sentences')
        .select('id, sentence_number')
        .eq('version_id', effectiveVersionId!)
        .gt('sentence_number', currentNum)
        .order('sentence_number', { ascending: false })
      for (const row of afterRows ?? []) {
        await supabase
          .from('story_sentences')
          .update({ sentence_number: (row.sentence_number ?? 0) - 1 })
          .eq('id', row.id)
      }
      const { error } = await supabase
        .from('story_sentences')
        .update({ sentence_number: maxNum })
        .eq('id', sentenceId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['story_sentences', id, effectiveVersionId] })
      setOrderPopover(null)
      showDbConfirmation({ tables: ['story_sentences'], details: ['Moved sentence to end'] })
    },
  })

  const moveToTopMutation = useMutation({
    mutationFn: async (sentenceId: number) => {
      const current = (sentences ?? []).find((x) => x.id === sentenceId)
      const currentNum = current?.sentence_number ?? 0
      if (currentNum <= 1) return
      const { data: beforeRows } = await supabase
        .from('story_sentences')
        .select('id, sentence_number')
        .eq('version_id', effectiveVersionId!)
        .lt('sentence_number', currentNum)
        .order('sentence_number', { ascending: false })
      for (const row of beforeRows ?? []) {
        await supabase
          .from('story_sentences')
          .update({ sentence_number: (row.sentence_number ?? 0) + 1 })
          .eq('id', row.id)
      }
      const { error } = await supabase
        .from('story_sentences')
        .update({ sentence_number: 1 })
        .eq('id', sentenceId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['story_sentences', id, effectiveVersionId] })
      setOrderPopover(null)
      showDbConfirmation({ tables: ['story_sentences'], details: ['Moved sentence to top'] })
    },
  })

  const reorderSentencesMutation = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      if (!effectiveVersionId) throw new Error('No version')
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
          .from('story_sentences')
          .update({ sentence_number: i + 1 })
          .eq('version_id', effectiveVersionId)
          .eq('id', orderedIds[i]!)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['story_sentences', id, effectiveVersionId] })
      showDbConfirmation({ tables: ['story_sentences'], details: ['Reordered sentences'] })
    },
    onError: (err) => {
      showDbConfirmation({
        tables: ['story_sentences'],
        details: [(err as Error).message],
        type: 'error',
      })
    },
  })

  useEffect(() => {
    if (!sentences?.length || !id || updateSentenceMutation.isPending) return
    const needsSplit = sentences.find((s) => splitIntoSentences(s.sentence_text ?? '').length > 1)
    if (!needsSplit) return
    updateSentenceMutation.mutate({
      sentenceId: needsSplit.id,
      text: needsSplit.sentence_text ?? '',
      sentenceNumber: needsSplit.sentence_number,
      pageNumber: needsSplit.page_number,
      paragraphNumber: needsSplit.paragraph_number,
      chapterNumber: needsSplit.chapter_number,
    })
  }, [sentences, id, updateSentenceMutation.isPending])

  const saveSentencePatternMutation = useMutation({
    mutationFn: async ({
      sentenceId,
      label,
    }: {
      sentenceId: number | 'editor' | { questionId: number }
      label: string
    }) => {
      const sent =
        sentenceId === 'editor'
          ? { tokens_array: draftTokens, sentence_text: getTextFromTokens({ tokens_array: draftTokens }) }
          : typeof sentenceId === 'object' && sentenceId != null && 'questionId' in sentenceId
            ? (() => {
                const cache = queryClient.getQueryData(['page_media', id, effectiveVersionId]) as
                  | { questions?: { id: number; tokens_array?: SentenceToken[] | null }[] }[]
                  | undefined
                for (const m of cache ?? []) {
                  const q = m.questions?.find((x) => x.id === sentenceId.questionId)
                  if (q?.tokens_array) {
                    const ta = q.tokens_array
                    return { tokens_array: ta, sentence_text: getTextFromTokens({ tokens_array: ta }) }
                  }
                }
                return null
              })()
            : sentences?.find((x) => x.id === sentenceId)
      if (!sent) throw new Error('Sentence not found')
      const phrasePatternsWithId = chunkPatternsRaw.map((p) => ({
        id: p.id,
        name: p.name,
        sequence: (p.pos_pattern as { sequence?: number[] })?.sequence ?? [],
      }))
      const structure = extractSentenceStructure(sent, phrasePatternsWithId)
      if (!structure) throw new Error('Sentence has no POS-tagged tokens. Tag words first.')
      return saveSentencePattern(label, structure, id ? Number(id) : undefined)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sentence_patterns'] })
      setSavePatternOpen(false)
      setSavePatternLabel('')
      setPatternBuilderContext(null)
      setEditingRowId(null)
      setEditingText('')
      showDbConfirmation({
        tables: ['sentence_patterns'],
        details: ['Saved sentence pattern'],
      })
    },
  })

  const createPhraseMutation = useMutation({
    mutationFn: async ({
      name,
      sequence,
    }: {
      name: string
      sequence: number[]
    }) => {
      const { data: maxRow } = await supabase
        .from('pos_chunk_patterns')
        .select('id')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()
      const nextId = maxRow?.id != null ? Number(maxRow.id) + 1 : 1
      const { data, error } = await supabase
        .from('pos_chunk_patterns')
        .insert({
          id: nextId,
          name: name.trim(),
          description: null,
          pos_pattern: { sequence },
          is_active: true,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos_chunk_patterns'] })
      setMakePhraseOpen(false)
      setMakePhraseSentenceId(null)
      setMakePhraseSelected(new Set())
      setMakePhraseName('')
      showDbConfirmation({
        tables: ['pos_chunk_patterns'],
        details: ['Created phrase pattern'],
      })
    },
  })

  const mergeTokensMutation = useMutation({
    mutationFn: async ({ posTypeId }: { posTypeId: number }) => {
      if (!kiwahaSelection || kiwahaSelection.indices.size < 2) throw new Error('Select 2+ tokens')
      const indices = [...kiwahaSelection.indices].sort((a, b) => a - b)
      if ('questionId' in kiwahaSelection) {
        return mergeTokensAndSetPosPageMediaQuestion(
          kiwahaSelection.questionId,
          indices[0]!,
          indices[indices.length - 1]!,
          posTypeId
        )
      }
      return mergeTokensAndSetPos(
        kiwahaSelection.sentenceId,
        indices[0]!,
        indices[indices.length - 1]!,
        posTypeId
      )
    },
    onSuccess: (result) => {
      if (result.ok) {
        setKiwahaSelection(null)
        queryClient.invalidateQueries({ queryKey: ['story_sentences', id, effectiveVersionId] })
        queryClient.invalidateQueries({ queryKey: ['page_media', id, effectiveVersionId] })
        queryClient.invalidateQueries({ queryKey: ['word_registry'] })
        showDbConfirmation(result.dbConfirmation)
      }
    },
    onError: (err) => {
      showDbConfirmation({
        tables: ['story_sentences'],
        details: [err instanceof Error ? err.message : 'Merge failed'],
        type: 'error',
      })
    },
  })

  const saveKiwahaMutation = useMutation({
    mutationFn: async () => {
      if (!kiwahaSelection || kiwahaSelection.indices.size < 2) throw new Error('Select 2+ tokens')
      if ('questionId' in kiwahaSelection) throw new Error('Kīwaha applies to story sentences only')
      const sent = sentences?.find((s) => s.id === kiwahaSelection.sentenceId)
      if (!sent) throw new Error('Sentence not found')
      const indices = [...kiwahaSelection.indices].sort((a, b) => a - b)
      const tokenStart = indices[0]!
      const tokenEnd = indices[indices.length - 1]!
      return saveKiwaha(
        kiwahaSelection.sentenceId,
        tokenStart,
        tokenEnd,
        effectiveVersionId ?? null,
        undefined
      )
    },
    onSuccess: (result) => {
      if (result.ok) {
        setKiwahaSelection(null)
        queryClient.invalidateQueries({ queryKey: ['story_sentences', id, effectiveVersionId] })
        queryClient.invalidateQueries({ queryKey: ['word_registry'] })
        queryClient.invalidateQueries({ queryKey: ['kiwaha_instances', id, effectiveVersionId] })
        queryClient.invalidateQueries({ queryKey: ['kiwaha_phrases_library'] })
        showDbConfirmation({
          tables: ['kiwaha', 'story_sentences', 'word_registry'],
          details: [`Kīwaha saved: "${result.phraseText}" (POS Kīwaha)`],
        })
      }
    },
    onError: (err) => {
      showDbConfirmation({
        tables: ['kiwaha'],
        details: [err instanceof Error ? err.message : 'Failed to save kīwaha'],
        type: 'error',
      })
    },
  })

  const createVersionMutation = useMutation({
    mutationFn: () =>
      createStoryVersion(Number(id!), effectiveVersionId ?? currentVersion?.id ?? 0),
    onSuccess: (result) => {
      skipNextUrlSyncRef.current = true
      queryClient.invalidateQueries({ queryKey: ['story_versions', id] })
      queryClient.invalidateQueries({ queryKey: ['story_sentences', id, result.id] })
      queryClient.invalidateQueries({ queryKey: ['page_media', id, result.id] })
      setVersionId(result.id)
      setSearchParams((p) => {
        const next = new URLSearchParams(p)
        next.set('version', result.label)
        return next
      })
      showDbConfirmation({
        tables: ['story_versions', 'story_sentences', 'page_media', 'image_tags'],
        details: [`Created version ${result.label}`],
      })
    },
  })

  const processSourceMutation = useMutation({
    mutationFn: async (tokens: SentenceToken[]) => {
      const titleId = id ? Number(id) : null
      if (titleId == null) throw new Error('Story ID required')
      const versionId = effectiveVersionId!
      if (tokens.length === 0) throw new Error('No tokens. Use the dropdowns to insert tokens, phrases, or sentences.')
      const segments = splitTokensIntoSentences(tokens)
      if (segments.length === 0) throw new Error('No sentences found.')
      const { data: existing } = await supabase
        .from('story_sentences')
        .select('id, sentence_number')
        .eq('version_id', versionId)
        .order('sentence_number', { ascending: false })
        .limit(1)
      const maxNum = existing?.[0]?.sentence_number ?? 0
      const rows = segments.map((seg, i) => ({
        title_id: titleId,
        version_id: versionId,
        sentence_number: maxNum + i + 1,
        sentence_text: getTextFromTokens({ tokens_array: seg }),
        tokens_array: seg,
        page_number: 1,
      }))
      const BATCH_SIZE = 50
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const { error: insErr } = await supabase.from('story_sentences').insert(batch)
        if (insErr) throw insErr
      }
      return { count: rows.length }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['story_sentences', id, effectiveVersionId] })
      setDraftTokens([])
      showDbConfirmation({
        tables: ['story_sentences'],
        details: [`Added ${result.count} sentence(s)`],
      })
    },
  })

  const updatePageTextMutation = useMutation({
    mutationFn: async ({ pageNumber, text }: { pageNumber: number; text: string }) => {
      const titleId = id ? Number(id) : null
      if (titleId == null) throw new Error('Story ID required')
      if (effectiveVersionId == null) throw new Error('No version. Create a version first.')
      const versionId = effectiveVersionId
      const sentenceTexts = text
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      const pageSentences = (sentences ?? [])
        .filter((s) => s.page_number === pageNumber)
        .sort((a, b) => (a.sentence_number ?? 0) - (b.sentence_number ?? 0))
      for (let i = 0; i < Math.min(pageSentences.length, sentenceTexts.length); i++) {
        const newText = sentenceTexts[i]
        const rowToUpdate = pageSentences[i]
        const matchingOld = pageSentences.find(
          (s) => (s.sentence_text ?? '').trim() === newText.trim()
        )
        const oldTokens: SentenceToken[] = (matchingOld ?? rowToUpdate)
          ? Array.isArray((matchingOld ?? rowToUpdate).tokens_array)
            ? ((matchingOld ?? rowToUpdate).tokens_array as SentenceToken[])
            : getTokensFromSentence((matchingOld ?? rowToUpdate).sentence_text ?? '')
          : []
        const newTokens = getTokensFromSentence(newText)
        const mergedTokens = mergeTokenPos(oldTokens, newTokens)
        const { error } = await supabase
          .from('story_sentences')
          .update({
            sentence_text: newText,
            tokens_array: mergedTokens,
          })
          .eq('id', pageSentences[i].id)
        if (error) throw error
      }
      if (sentenceTexts.length > pageSentences.length) {
        const { data: maxRow } = await supabase
          .from('story_sentences')
          .select('sentence_number')
          .eq('version_id', versionId)
          .order('sentence_number', { ascending: false })
          .limit(1)
          .maybeSingle()
        const baseNum = pageSentences.length > 0
          ? (pageSentences[pageSentences.length - 1]?.sentence_number ?? 0)
          : (maxRow?.sentence_number ?? 0)
        const toInsert = sentenceTexts.slice(pageSentences.length).map((sentenceText, i) => ({
          title_id: titleId,
          version_id: versionId,
          sentence_number: baseNum + i + 1,
          sentence_text: sentenceText,
          tokens_array: getTokensFromSentence(sentenceText),
          page_number: pageNumber,
        }))
        const { data: afterRows } = await supabase
          .from('story_sentences')
          .select('id, sentence_number')
          .eq('version_id', versionId)
          .gt('sentence_number', baseNum)
          .order('sentence_number', { ascending: false })
        for (const row of afterRows ?? []) {
          await supabase
            .from('story_sentences')
            .update({ sentence_number: (row.sentence_number ?? 0) + toInsert.length })
            .eq('id', row.id)
        }
        const BATCH_SIZE = 50
        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
          const batch = toInsert.slice(i, i + BATCH_SIZE)
          const { error: insErr } = await supabase.from('story_sentences').insert(batch)
          if (insErr) throw insErr
        }
      } else if (sentenceTexts.length < pageSentences.length) {
        const toDelete = pageSentences.slice(sentenceTexts.length)
        const { error: delErr } = await supabase
          .from('story_sentences')
          .delete()
          .in('id', toDelete.map((s) => s.id))
        if (delErr) throw delErr
        const { data: remaining } = await supabase
          .from('story_sentences')
          .select('id, sentence_number')
          .eq('version_id', versionId)
          .order('sentence_number', { ascending: true })
        if (remaining?.length) {
          for (let i = remaining.length - 1; i >= 0; i--) {
            await supabase
              .from('story_sentences')
              .update({ sentence_number: i + 1 })
              .eq('id', remaining[i].id)
          }
        }
      }
      return { count: sentenceTexts.length }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['story_sentences', id, effectiveVersionId] })
      setPageEditOpen(null)
      setPageEditText('')
      showDbConfirmation({ tables: ['story_sentences'], details: [`Page text saved (${result.count} sentence(s))`] })
    },
    onError: (err: Error) => {
      showDbConfirmation({ tables: ['story_sentences'], details: [err.message], type: 'error' })
    },
  })

  useEffect(() => {
    if (!selectionPopover) return
    const handleClickOutside = (e: MouseEvent) => {
      if (selectionPopoverRef.current && !selectionPopoverRef.current.contains(e.target as Node)) {
        setSelectionPopover(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selectionPopover])

  useEffect(() => {
    if (!orderPopover) return
    const handleClickOutside = (e: MouseEvent) => {
      if (orderPopoverRef.current && !orderPopoverRef.current.contains(e.target as Node)) {
        setOrderPopover(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [orderPopover])

  useEffect(() => {
    if (pageEditOpen == null) return
    const pageSents = (sentences ?? [])
      .filter((s) => s.page_number === pageEditOpen)
      .sort((a, b) => (a.sentence_number ?? 0) - (b.sentence_number ?? 0))
    setPageEditText(pageSents.map((s) => s.sentence_text ?? '').join('\n'))
  }, [pageEditOpen, sentences])

  const sortedPosTypes = sortPosTypesForHover(posTypes)
  const modalUpdateTokenPosRef = useRef<
    ((imageTagId: number, tokenIndex: number, updatedToken: SentenceToken) => void) | null
  >(null)
  const tokenPosInteraction = useTokenPosInteraction({
    sortedPosTypes,
    showDbConfirmation,
    onAutoApplied: (source, wordNorm, posTypeId) => {
      if (source.type !== 'story_sentence') return
      const key = ['story_sentences', id, effectiveVersionId] as const
      const prev = queryClient.getQueryData(key) as { id: number; tokens_array?: unknown; sentence_text?: string }[] | undefined
      // #region agent log
      const prevLen = prev?.length ?? 0
      let sentencesChanged = 0
      const updated = prev?.length
        ? prev.map((s) => {
            let tokens = Array.isArray(s.tokens_array) ? (s.tokens_array as SentenceToken[]) : []
            if (tokens.length === 0 && s.sentence_text) tokens = getTokensFromSentence(String(s.sentence_text))
            if (!tokens.length) return s
            const changed = tokens.some((t) => t.pos_type_id == null && stripPunctuationFromWord(String(t.text ?? '').trim()) === wordNorm)
            if (changed) sentencesChanged++
            if (!changed) return s
            const newTokens = tokens.map((t) =>
              t.pos_type_id != null ? t : stripPunctuationFromWord(String(t.text ?? '').trim()) === wordNorm ? { ...t, pos_type_id: posTypeId } : t
            )
            return { ...s, tokens_array: newTokens }
          })
        : []
      fetch('http://127.0.0.1:7489/ingest/b001ac32-8358-43d0-a2cd-b6f88c884101',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5585d8'},body:JSON.stringify({sessionId:'5585d8',location:'StoryEditor.tsx:onAutoApplied',message:'cache optimistic update',data:{wordNorm,posTypeId,prevLen,sentencesChanged,bailedEarly:!prev?.length,key:[...key]},timestamp:Date.now(),hypothesisId:'onAutoApplied'})}).catch(()=>{});
      // #endregion
      if (!prev?.length) return
      queryClient.setQueryData(key, updated)
    },
    onSuccess: async (source) => {
      queryClient.invalidateQueries({ queryKey: ['word_registry'] })
      if (source.type === 'story_sentence') {
        await queryClient.refetchQueries({ queryKey: ['story_sentences', id, effectiveVersionId] })
      } else {
        await queryClient.refetchQueries({ queryKey: ['page_media', id, effectiveVersionId] })
      }
    },
    onAfterSave: (source: TokenSource, tokenIndex: number, token: SentenceToken) => {
      if (source.type === 'image_tag') {
        modalUpdateTokenPosRef.current?.(source.imageTagId, tokenIndex, token)
      }
    },
    onKiwahaTokenSelect: (source, tokenIndex) => {
      if (source.type === 'story_sentence') {
        setKiwahaSelection((prev) => {
          const next =
            prev && 'sentenceId' in prev && prev.sentenceId === source.sentenceId ? new Set(prev.indices) : new Set<number>()
          if (next.has(tokenIndex)) next.delete(tokenIndex)
          else next.add(tokenIndex)
          return next.size > 0 ? { sentenceId: source.sentenceId, indices: next } : null
        })
      } else if (source.type === 'page_media_question') {
        setKiwahaSelection((prev) => {
          const next =
            prev && 'questionId' in prev && prev.questionId === source.questionId ? new Set(prev.indices) : new Set<number>()
          if (next.has(tokenIndex)) next.delete(tokenIndex)
          else next.add(tokenIndex)
          return next.size > 0 ? { questionId: source.questionId, indices: next } : null
        })
      }
    },
  })

  useEffect(() => {
    if (!kiwahaSelection) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setKiwahaSelection(null)
        return
      }
      if (e.shiftKey) return
      const digitMatch = /^Digit([1-9])$/.exec(e.code)
      const n = digitMatch ? parseInt(digitMatch[1], 10) : (e.key >= '1' && e.key <= '9' ? parseInt(e.key, 10) : 0)
      if (n >= 1 && n <= sortedPosTypes.length && kiwahaSelection.indices.size >= 2) {
        e.preventDefault()
        mergeTokensMutation.mutate({ posTypeId: sortedPosTypes[n - 1].id })
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [kiwahaSelection, sortedPosTypes, mergeTokensMutation])

  const handleProseMouseUp = (e: React.MouseEvent) => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !proseRef.current) return
    const range = sel.getRangeAt(0)
    if (!proseRef.current.contains(range.commonAncestorContainer)) return

    const findSentenceEl = (node: Node): Element | null => {
      let n: Node | null = node
      while (n && n !== proseRef.current) {
        if (n.nodeType === Node.ELEMENT_NODE && (n as Element).hasAttribute?.('data-sentence-id'))
          return n as Element
        n = n.parentNode
      }
      return null
    }
    const startEl = findSentenceEl(range.startContainer)
    const endEl = findSentenceEl(range.endContainer)
    if (!startEl || !endEl) return

    const sentenceEls = [...proseRef.current.querySelectorAll('[data-sentence-id]')]
    const startIdx = sentenceEls.indexOf(startEl)
    const endIdx = sentenceEls.indexOf(endEl)
    if (startIdx === -1 || endIdx === -1) return

    let [lo, hi] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
    if (lo !== hi) {
      const endSentenceEl = sentenceEls[hi]
      try {
        const cmp = range.comparePoint(endSentenceEl, 0)
        if (cmp === 1) {
          hi = hi - 1
          if (hi < lo) return
        }
      } catch {
        /* comparePoint can throw if node not in same tree */
      }
    }
    const sentenceIds = [...new Set(
      sentenceEls
        .slice(lo, hi + 1)
        .map((el) => Number(el.getAttribute('data-sentence-id')))
        .filter((id) => !Number.isNaN(id))
    )]
    if (sentenceIds.length === 0) return
    const all = sentences ?? []
    const maxPage = Math.max(0, ...all.map((s) => s.page_number ?? 0))
    const maxParagraph = Math.max(0, ...all.map((s) => s.paragraph_number ?? 0))
    const maxChapter = Math.max(0, ...all.map((s) => s.chapter_number ?? 0))
    setSelectionPage(String(maxPage + 1))
    setSelectionParagraph(String(maxParagraph + 1))
    setSelectionChapter(String(maxChapter + 1))
    setSelectionPopover({ x: e.clientX, y: e.clientY, sentenceIds })
  }

  const displaySentences = sentences ?? []

  const storyRows: StoryRow[] = isEmptyStory
    ? [
        {
          id: null,
          version_id: effectiveVersionId ?? 0,
          chapter_number: 1,
          page_number: 1,
          paragraph_number: 1,
          sentence_number: 1,
          sentence_text: getTextFromTokens({ tokens_array: draftTokens }),
          tokens_array: draftTokens,
        },
      ]
    : (displaySentences ?? []).map((s) => ({
        id: s.id,
        version_id: effectiveVersionId ?? 0,
        chapter_number: s.chapter_number ?? null,
        page_number: s.page_number ?? null,
        paragraph_number: s.paragraph_number ?? null,
        sentence_number: s.sentence_number ?? 0,
        sentence_text: s.sentence_text ?? '',
        tokens_array: s.tokens_array as SentenceToken[] | null,
      }))

  const canReorder = !!effectiveVersionId && !isEmptyStory
  const reorderSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )
  const handleStoryDragStart = (event: DragStartEvent) => {
    setActiveDragSentenceId(Number(event.active.id))
  }
  const handleStoryDragEnd = (event: DragEndEvent) => {
    setActiveDragSentenceId(null)
    if (!effectiveVersionId) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = storyRows.findIndex((r) => r.id === Number(active.id))
    const newIndex = storyRows.findIndex((r) => r.id === Number(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const ids = storyRows.map((r) => r.id!)
    reorderSentencesMutation.mutate(arrayMove(ids, oldIndex, newIndex))
  }
  const handleStoryDragCancel = () => {
    setActiveDragSentenceId(null)
  }

  const pageMediaQuestionHandlers: PageMediaQuestionHandlers = {
    canEdit: !!effectiveVersionId,
    onAdd: (pageMediaId) => {
      insertPageMediaQuestionMutation.mutate(pageMediaId)
    },
    onDelete: (questionId) => {
      deletePageMediaQuestionMutation.mutate(questionId)
    },
    isAdding: insertPageMediaQuestionMutation.isPending,
    isDeleting: deletePageMediaQuestionMutation.isPending,
    onGenerateFromSentence: (pageMediaId) => {
      const pm = allPageMedia.find((m) => m.id === pageMediaId)
      const pn = pm?.page_number ?? 0
      const onPage = (sentences ?? []).filter((s) => (s.page_number ?? 0) === pn)
      if (onPage.length === 0) {
        window.alert('No sentences on this page.')
        return
      }
      setGenerateQuestionsModal({ pageMediaId, pageNumber: pn })
      setGenerateSentenceId(onPage[0]!.id)
    },
    isGeneratingFromSentence: generateQuestionsFromSentenceMutation.isPending,
    editor: {
      tokenPosInteraction: effectiveVersionId
        ? {
            handleWordClick: tokenPosInteraction.handleWordClick,
            handleWordHover: tokenPosInteraction.handleWordHover,
            handleWordHoverEnd: tokenPosInteraction.handleWordHoverEnd,
            handleCloseSelector: tokenPosInteraction.handleCloseSelector,
          }
        : undefined,
      sentencePatterns,
      chunkPatterns,
      connectorDesigns: [],
      onPatternClick: (baseName, isPartial, questionId) => {
        if (questionId != null) {
          setPatternBuilderContext({ sentenceId: { questionId }, baseName, isPartial })
          setSavePatternLabel(baseName ?? '')
          setSavePatternOpen(true)
        }
      },
      onMakePhraseClick: (questionId) => {
        setMakePhraseOpen(true)
        setMakePhraseSentenceId({ questionId })
        setMakePhraseSelected(new Set())
        setMakePhraseName('')
      },
      onSaveQuestionText: (questionId, text) =>
        updatePageMediaQuestionTextMutation.mutateAsync({ questionId, text }),
      isSavingText: updatePageMediaQuestionTextMutation.isPending,
      kiwahaSelectionIndicesForQuestion: (qid) =>
        kiwahaSelection && 'questionId' in kiwahaSelection && kiwahaSelection.questionId === qid
          ? kiwahaSelection.indices
          : undefined,
    },
  }

  const orderedStoryRows = isEmptyStory
    ? []
    : storyRows.map((row, sentIdx) => {
    const prevPage = sentIdx > 0 ? storyRows[sentIdx - 1]?.page_number : undefined
    const isNewPage = hasPages && row.id != null && (sentIdx === 0 || row.page_number !== prevPage)
    const sortableDisabled =
      sentencesLoading || reorderSentencesMutation.isPending || editingRowId === row.id

    const rowInner = (dragListeners?: DraggableSyntheticListeners) => (
      <>
        {isNewPage && (
          <PageBlock
            pageNumber={row.page_number ?? 1}
            mediaItems={pageMediaByPage[row.page_number ?? 0] ?? []}
            onEditPageText={() => setPageEditOpen(row.page_number ?? 1)}
            onAddPicture={() => {
              setInsertForPage(row.page_number ?? 1)
              setInsertMediaUrl('')
              setInsertMediaError(null)
              setInsertMediaOpen(true)
            }}
            onDeleteMedia={(mediaId) => deleteMediaMutation.mutate(mediaId)}
            onEditMedia={(item) => {
              if (item.image_id)
                setEditingImage({
                  id: item.id,
                  url: item.url,
                  image_id: item.image_id,
                  tags: item.tags ?? [],
                  usages: item.usages ?? [],
                })
            }}
            isDeletingMedia={deleteMediaMutation.isPending}
            posTypes={posTypes}
            chunkPatterns={chunkPatterns}
            canEdit={!!effectiveVersionId}
            isFirst={sentIdx === 0}
            pageMediaQuestionHandlers={pageMediaQuestionHandlers}
          />
        )}
        <SentenceRow
          row={row}
          posTypes={posTypes}
          chunkPatterns={chunkPatterns}
          sentencePatterns={sentencePatterns}
          connectorDesigns={[]}
          isEditing={editingRowId === row.id}
          editingText={editingText}
          onEditStart={() => {
            setEditingRowId(row.id!)
            setEditingText(getTextFromTokens(row))
          }}
          onEditChange={setEditingText}
          onSave={() => {
            updateSentenceMutation.mutate({
              sentenceId: row.id!,
              text: editingText,
              sentenceNumber: row.sentence_number,
              pageNumber: row.page_number,
              paragraphNumber: row.paragraph_number,
              chapterNumber: row.chapter_number,
            })
          }}
          onCancel={() => setEditingRowId(null)}
          onDelete={() => {
            if (confirm('Delete this sentence? It will be removed and ordering adjusted.')) {
              deleteSentenceMutation.mutate([row.id!])
            }
          }}
          onPatternClick={(baseName, isPartial) => {
            setPatternBuilderContext({
              sentenceId: row.id!,
              baseName,
              isPartial,
            })
            const label =
              baseName && isPartial
                ? (() => {
                    const prefix = `${baseName} 1.`
                    const nums = sentencePatterns
                      .filter((p) => p.name?.startsWith(prefix))
                      .map((p) => {
                        const suffix = p.name?.slice(prefix.length)
                        const n = parseInt(suffix, 10)
                        return /^\d+$/.test(suffix) ? n : 0
                      })
                      .filter((n) => n > 0)
                    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
                    return `${baseName} 1.${next}`
                  })()
                : baseName ?? ''
            setSavePatternLabel(label)
            setSavePatternOpen(true)
          }}
          onMakePhraseClick={() => {
            setMakePhraseOpen(true)
            setMakePhraseSentenceId(row.id!)
            setMakePhraseSelected(new Set())
            setMakePhraseName('')
          }}
          isSelected={selectionPopover?.sentenceIds.includes(row.id!)}
          isUpdating={updateSentenceMutation.isPending}
          isDeleting={deleteSentenceMutation.isPending}
          tokenPosInteraction={tokenPosInteraction}
          onReorderClick={(e) => setOrderPopover({ sentenceId: row.id!, x: e.clientX, y: e.clientY })}
          kiwahaSelectionIndices={
            kiwahaSelection && 'sentenceId' in kiwahaSelection && kiwahaSelection.sentenceId === row.id
              ? kiwahaSelection.indices
              : undefined
          }
          dragHandleListeners={dragListeners}
          dragHandleDisabled={sortableDisabled}
        />
      </>
    )

    if (!canReorder) {
      return (
        <div key={row.id} className="block mb-8">
          {rowInner(undefined)}
        </div>
      )
    }
    return (
      <SortableStoryBlock key={row.id} id={row.id!} disabled={sortableDisabled}>
        {(h) => rowInner(h.listeners)}
      </SortableStoryBlock>
    )
  })

  if (titleLoading || !id) return <div className="p-6">Loading...</div>
  if (titleError || !title) return <div className="p-6 text-red-600">Story not found</div>

  return (
    <div className="w-full min-w-0 overflow-x-hidden">
      <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">
        {title.name}
        {title.author && <span className="text-gray-500 font-normal"> by {title.author}</span>}
      </h1>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {versions.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => setSourceTextOpen(true)}
              className="px-3 py-1.5 text-sm border rounded bg-white hover:bg-gray-50"
            >
              Source text
            </button>
            <select
              value={effectiveVersionId ?? ''}
              onChange={(e) => {
                const val = e.target.value
                if (val === '__new__') {
                  createVersionMutation.mutate()
                  return
                }
                const vid = Number(val)
                if (!Number.isNaN(vid)) setVersionAndUrl(vid)
              }}
              className="px-3 py-1.5 text-sm border rounded bg-white hover:bg-gray-50"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
              <option value="__new__" disabled={createVersionMutation.isPending || !effectiveVersionId}>
                + New version
              </option>
            </select>
          </>
        ) : (
          <>
            <span className="text-sm text-gray-500">
              {ensureVersionMutation.isPending
                ? 'Setting up version 1.0…'
                : 'Showing legacy data. Run the versioning migration in Supabase, then click Migrate.'}
            </span>
            {!ensureVersionMutation.isPending && (
              <button
                type="button"
                onClick={() => ensureVersionMutation.mutate()}
                className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100"
              >
                Migrate to versioning
              </button>
            )}
            {ensureVersionMutation.isError && (
              <span className="text-sm text-red-600">
                {(ensureVersionMutation.error as Error)?.message ?? 'Failed'}
              </span>
            )}
          </>
        )}
      </div>
      <div
        ref={proseRef}
        className={`prose max-w-none leading-[2.25] select-text ${isEmptyStory ? 'prose-2xl' : ''}`}
        onMouseUp={handleProseMouseUp}
      >
        {sentencesLoading
          ? 'Loading text...'
          : sentencesError
            ? `Error: ${sentencesError.message}`
            : isEmptyStory ? (
                <Fragment>
                  <PageBlock
                    pageNumber={1}
                    mediaItems={pageMediaByPage[1] ?? []}
                    onEditPageText={() => setPageEditOpen(1)}
                    onAddPicture={() => {
                      setInsertForPage(1)
                      setInsertMediaUrl('')
                      setInsertMediaError(null)
                      setInsertMediaOpen(true)
                    }}
                    onDeleteMedia={(mediaId) => deleteMediaMutation.mutate(mediaId)}
                    onEditMedia={(item) => {
                      if (item.image_id) setEditingImage({ id: item.id, url: item.url, image_id: item.image_id, tags: item.tags ?? [], usages: item.usages ?? [] })
                    }}
                    isDeletingMedia={deleteMediaMutation.isPending}
                    posTypes={posTypes}
                    chunkPatterns={chunkPatterns}
                    canEdit={!!effectiveVersionId}
                    pageMediaQuestionHandlers={pageMediaQuestionHandlers}
                    isFirst
                  >
                  <span className="block mb-8">
                    <div className="flex items-baseline gap-1">
                      <sup>
                        <span className="text-[10px] text-gray-400 font-mono">[1]</span>
                      </sup>
                      <SentenceRow
                        row={storyRows[0]!}
                        posTypes={posTypes}
                        chunkPatterns={chunkPatterns}
                        sentencePatterns={sentencePatterns}
                        isEditing={editingRowId === 'draft'}
                        editingText={editingText}
                        onEditStart={() => {
                          setEditingRowId('draft')
                          setEditingText(getTextFromTokens({ tokens_array: draftTokens }))
                        }}
                        onEditChange={setEditingText}
                        onSave={() => {
                          const parts = splitIntoSentences(editingText.trim())
                          if (parts.length === 0) {
                            setDraftTokens([])
                            setEditingRowId(null)
                            setEditingText('')
                            return
                          }
                          const tokensForParts = parts.map((p) => getTokensFromSentence(p))
                          const firstMerged =
                            tokensForParts[0]?.length
                              ? mergeTokenPos(draftTokens, tokensForParts[0])
                              : draftTokens
                          const allTokens: SentenceToken[] = []
                          for (let i = 0; i < tokensForParts.length; i++) {
                            const seg = i === 0 ? firstMerged : tokensForParts[i]
                            allTokens.push(...seg)
                            if (i < tokensForParts.length - 1) {
                              allTokens.push({
                                index: allTokens.length + 1,
                                text: '.',
                                pos_type_id: null,
                                word_pos_entry_id: null,
                              })
                            }
                          }
                          setDraftTokens(allTokens)
                          setEditingRowId(null)
                          setEditingText('')
                          if (allTokens.length > 0 && effectiveVersionId) {
                            processSourceMutation.mutate(allTokens)
                          }
                        }}
                        onCancel={() => {
                          setEditingRowId(null)
                          setEditingText('')
                        }}
                        onDelete={() => {
                          setDraftTokens([])
                          setEditingRowId(null)
                          setEditingText('')
                        }}
                        onPatternClick={(baseName, isPartial) => {
                          setPatternBuilderContext({ sentenceId: 'editor', baseName, isPartial })
                          setSavePatternLabel(baseName ?? '')
                          setSavePatternOpen(true)
                        }}
                        onMakePhraseClick={() => {
                          setMakePhraseOpen(true)
                          setMakePhraseSentenceId('editor')
                          setMakePhraseSelected(new Set())
                          setMakePhraseName('')
                        }}
                        draftProps={{
                          insertIndex: draftInsertIndex,
                          onInsertIndexChange: setDraftInsertIndex,
                          onTokensChange: setDraftTokens,
                          onAddToPage: () => processSourceMutation.mutate(draftTokens),
                          isAddToPagePending: processSourceMutation.isPending,
                          isAddToPageDisabled: !effectiveVersionId,
                          phrasePatterns: draftPhrasePatternsForToolbar,
                          sentencePatterns,
                          wordsByPos,
                        }}
                      />
                    </div>
                  </span>
                  </PageBlock>
                  {processSourceMutation.isError && (
                    <p className="text-red-600 text-sm mt-1">{formatError(processSourceMutation.error)}</p>
                  )}
                </Fragment>
              ) : hasPages && storyRows.length === 0
                ? 'No sentences on this page.'
                : canReorder ? (
                    <DndContext
                      sensors={reorderSensors}
                      collisionDetection={closestCorners}
                      onDragStart={handleStoryDragStart}
                      onDragEnd={handleStoryDragEnd}
                      onDragCancel={handleStoryDragCancel}
                    >
                      <SortableContext
                        items={storyRows.map((r) => r.id!)}
                        strategy={verticalListSortingStrategy}
                      >
                        {orderedStoryRows}
                      </SortableContext>
                      <DragOverlay dropAnimation={null}>
                        {activeDragSentenceId != null ? (
                          <div className="pointer-events-none max-w-lg rounded border border-gray-200 bg-white px-3 py-2 text-sm shadow-lg">
                            <span className="font-mono text-[10px] text-gray-400">
                              [
                              {storyRows.find((r) => r.id === activeDragSentenceId)?.sentence_number ?? '—'}
                              ]{' '}
                            </span>
                            {(storyRows.find((r) => r.id === activeDragSentenceId)?.sentence_text ?? '').slice(0, 220)}
                            {(storyRows.find((r) => r.id === activeDragSentenceId)?.sentence_text?.length ?? 0) > 220
                              ? '…'
                              : ''}
                          </div>
                        ) : null}
                      </DragOverlay>
                    </DndContext>
                  ) : (
                    orderedStoryRows
                  )}
      </div>
      {selectionPopover && (
        <CenteredViewportPopup panelRef={selectionPopoverRef} zClassName="z-50">
          <div className="p-3 bg-white border rounded shadow-lg flex flex-col gap-2 min-w-[200px]">
          <p className="text-xs text-gray-600 mb-1">
            {selectionPopover.sentenceIds.length} sentence{selectionPopover.sentenceIds.length !== 1 ? 's' : ''} selected
          </p>
          <div className="flex items-center gap-2">
            <label className="text-xs w-16 shrink-0">Page</label>
            <input
              type="text"
              value={selectionPage}
              onChange={(e) => setSelectionPage(e.target.value)}
              placeholder="All"
              className="flex-1 border rounded px-2 py-1 text-sm w-12"
            />
            <button
              type="button"
              className="px-2 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50"
              disabled={updateSelectionMutation.isPending}
              onClick={() => {
                const val = selectionPage.trim().toLowerCase()
                const page = val === '' || val === 'all' ? null : parseInt(val, 10)
                if (val !== '' && val !== 'all' && Number.isNaN(page)) return
                updateSelectionMutation.mutate({
                  sentenceIds: selectionPopover.sentenceIds,
                  updates: { page_number: page },
                })
              }}
            >
              Apply
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50"
              disabled={assignPageMutation.isPending}
              onClick={() => assignPageMutation.mutate(selectionPopover.sentenceIds)}
            >
              New page
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs w-16 shrink-0">Paragraph</label>
            <input
              type="text"
              value={selectionParagraph}
              onChange={(e) => setSelectionParagraph(e.target.value)}
              placeholder="—"
              className="flex-1 border rounded px-2 py-1 text-sm w-12"
            />
            <button
              type="button"
              className="px-2 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50"
              disabled={updateSelectionMutation.isPending}
              onClick={() => {
                const val = selectionParagraph.trim()
                const paragraph = val === '' ? null : parseInt(val, 10)
                if (val !== '' && Number.isNaN(paragraph)) return
                updateSelectionMutation.mutate({
                  sentenceIds: selectionPopover.sentenceIds,
                  updates: { paragraph_number: paragraph },
                })
              }}
            >
              Apply
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs w-16 shrink-0">Chapter</label>
            <input
              type="text"
              value={selectionChapter}
              onChange={(e) => setSelectionChapter(e.target.value)}
              placeholder="—"
              className="flex-1 border rounded px-2 py-1 text-sm w-12"
            />
            <button
              type="button"
              className="px-2 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50"
              disabled={updateSelectionMutation.isPending}
              onClick={() => {
                const val = selectionChapter.trim()
                const chapter = val === '' ? null : parseInt(val, 10)
                if (val !== '' && Number.isNaN(chapter)) return
                updateSelectionMutation.mutate({
                  sentenceIds: selectionPopover.sentenceIds,
                  updates: { chapter_number: chapter },
                })
              }}
            >
              Apply
            </button>
          </div>
          <button
            type="button"
            className="mt-1 px-2 py-1 text-sm border rounded border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
            disabled={deleteSentenceMutation.isPending}
            onClick={() => {
              if (confirm(`Delete ${selectionPopover.sentenceIds.length} sentence(s)? Ordering will be adjusted.`)) {
                deleteSentenceMutation.mutate(selectionPopover.sentenceIds)
              }
            }}
          >
            Delete
          </button>
          <button
            type="button"
            className="mt-1 px-2 py-1 text-xs border rounded hover:bg-gray-100"
            onClick={() => setSelectionPopover(null)}
          >
            Close
          </button>
          </div>
        </CenteredViewportPopup>
      )}
      {kiwahaSelection && kiwahaSelection.indices.size >= 2 && (() => {
        const tokens =
          'questionId' in kiwahaSelection
            ? (() => {
                const cache = queryClient.getQueryData(['page_media', id, effectiveVersionId]) as
                  | { questions?: { id: number; tokens_array?: SentenceToken[] | null }[] }[]
                  | undefined
                for (const m of cache ?? []) {
                  const q = m.questions?.find((x) => x.id === kiwahaSelection.questionId)
                  if (q?.tokens_array) return q.tokens_array
                }
                return [] as SentenceToken[]
              })()
            : (() => {
                const sent = sentences?.find((s) => s.id === kiwahaSelection.sentenceId)
                return sent ? getTokensForSentence(sent) : []
              })()
        const indices = [...kiwahaSelection.indices].sort((a, b) => a - b)
        const phraseText = indices
          .map((i) => tokens[i]?.text ?? '')
          .filter(Boolean)
          .join(' ')
        const isQuestionMerge = 'questionId' in kiwahaSelection
        return (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg shadow-lg">
            <span className="text-sm text-amber-900">
              <strong>{kiwahaSelection.indices.size}</strong> tokens → <em>{phraseText || '…'}</em>
              <span className="ml-2 text-xs text-amber-700">Press 1-9 to merge + set POS</span>
              {isQuestionMerge ? (
                <span className="ml-2 text-xs text-amber-700">(picture question)</span>
              ) : null}
            </span>
            {!isQuestionMerge && (
            <button
              type="button"
              className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 disabled:opacity-50"
              disabled={saveKiwahaMutation.isPending}
              onClick={() => saveKiwahaMutation.mutate()}
            >
              {saveKiwahaMutation.isPending ? 'Saving…' : 'Save as kīwaha'}
            </button>
            )}
            <button
              type="button"
              className="px-2 py-1 text-sm border border-amber-300 rounded hover:bg-amber-100"
              onClick={() => setKiwahaSelection(null)}
            >
              Cancel
            </button>
          </div>
        )
      })()}
      {/* Hover path: hotkeys POS selector only */}
      {tokenPosInteraction.hoveredToken && !tokenPosInteraction.clickedToken && (() => {
        const active = tokenPosInteraction.hoveredToken!
        const src = active.source
        const tok = active
        let currentPosId: number | null = null
        if (src.type === 'story_sentence') {
          const sent = sentences?.find((s) => s.id === src.sentenceId)
          const arr = sent?.tokens_array as { pos_type_id?: number }[] | null
          currentPosId = arr?.[tok.tokenIndex]?.pos_type_id ?? null
        } else if (src.type === 'image_tag') {
          const tag = editingImage?.tags?.find((t) => t.id === src.imageTagId) as { tokens_array?: { pos_type_id?: number }[] } | undefined
          const arr = tag?.tokens_array
          currentPosId = arr?.[tok.tokenIndex]?.pos_type_id ?? null
        } else if (src.type === 'page_media_question') {
          const cache = queryClient.getQueryData(['page_media', id, effectiveVersionId]) as
            | { questions?: { id: number; tokens_array?: { pos_type_id?: number }[] | null }[] }[]
            | undefined
          for (const m of cache ?? []) {
            const q = m.questions?.find((x) => x.id === src.questionId)
            const arr = q?.tokens_array
            if (arr) {
              currentPosId = arr[tok.tokenIndex]?.pos_type_id ?? null
              break
            }
          }
        }
        return (
          <>
            <TokenHoverHighlight rect={active.rect} />
            <TokenPosSelector
              posTypes={sortedPosTypes}
              currentPosId={currentPosId}
              currentWord=""
              wordsByPos={{}}
              onSelect={tokenPosInteraction.handleQuickSetPos}
              mode="pos"
              onClose={tokenPosInteraction.handleCloseSelector}
            />
          </>
        )
      })()}
      {/* Click path without POS: TokenPosSelector so user can set POS */}
      {tokenPosInteraction.clickedToken && (() => {
        const active = tokenPosInteraction.clickedToken!
        const src = active.source
        const tok = active
        let currentPosId: number | null = null
        let currentWord = ''
        if (src.type === 'story_sentence') {
          const sent = sentences?.find((s) => s.id === src.sentenceId)
          const arr = sent?.tokens_array as { pos_type_id?: number; text?: string }[] | null
          currentPosId = arr?.[tok.tokenIndex]?.pos_type_id ?? null
          currentWord = arr?.[tok.tokenIndex]?.text ?? ''
        } else if (src.type === 'image_tag') {
          const tag = editingImage?.tags?.find((t) => t.id === src.imageTagId) as { tokens_array?: { pos_type_id?: number; text?: string }[] } | undefined
          const arr = tag?.tokens_array
          currentPosId = arr?.[tok.tokenIndex]?.pos_type_id ?? null
          currentWord = arr?.[tok.tokenIndex]?.text ?? ''
        } else if (src.type === 'page_media_question') {
          const cache = queryClient.getQueryData(['page_media', id, effectiveVersionId]) as
            | { questions?: { id: number; tokens_array?: { pos_type_id?: number; text?: string }[] | null }[] }[]
            | undefined
          for (const m of cache ?? []) {
            const q = m.questions?.find((x) => x.id === src.questionId)
            const arr = q?.tokens_array
            if (arr) {
              currentPosId = arr[tok.tokenIndex]?.pos_type_id ?? null
              currentWord = arr[tok.tokenIndex]?.text ?? ''
              break
            }
          }
        }
        if (currentPosId != null) {
          return (
            <div onMouseEnter={tokenPosInteraction.onSelectorMouseEnter} onMouseLeave={tokenPosInteraction.onSelectorMouseLeave}>
              <WordMetadataPopover
                posTypes={sortedPosTypes}
                currentPosId={currentPosId}
                currentWord={currentWord}
                wordsByPos={wordsByPos}
                onReplaceWord={
                  src.type !== 'editor'
                    ? async (word) => {
                        const result = await replaceTokenText(src, tok.tokenIndex, word)
                        if (result.ok) {
                          if (src.type === 'story_sentence') {
                            queryClient.invalidateQueries({ queryKey: ['story_sentences', id, effectiveVersionId] })
                          } else if (src.type === 'image_tag') {
                            queryClient.invalidateQueries({ queryKey: ['page_media', id, effectiveVersionId] })
                            modalUpdateTokenPosRef.current?.(src.imageTagId, tok.tokenIndex, { text: word, pos_type_id: currentPosId, word_pos_entry_id: null, index: tok.tokenIndex + 1 })
                          } else if (src.type === 'page_media_question') {
                            queryClient.invalidateQueries({ queryKey: ['page_media', id, effectiveVersionId] })
                          }
                        }
                      }
                    : undefined
                }
                onClose={tokenPosInteraction.handleCloseSelector}
                onMetadataChange={() => queryClient.invalidateQueries({ queryKey: ['word_registry'] })}
              />
            </div>
          )
        }
        return (
          <div onMouseEnter={tokenPosInteraction.onSelectorMouseEnter} onMouseLeave={tokenPosInteraction.onSelectorMouseLeave}>
            <TokenPosSelector
              posTypes={sortedPosTypes}
              currentPosId={currentPosId}
              currentWord={currentWord}
              wordsByPos={wordsByPos}
              onSelect={tokenPosInteraction.handleQuickSetPos}
              mode="pos"
              onClose={tokenPosInteraction.handleCloseSelector}
            />
          </div>
        )
      })()}
      {orderPopover && (
        <CenteredViewportPopup panelRef={orderPopoverRef} zClassName="z-50">
          <div className="p-2 bg-white border rounded shadow-lg flex flex-col gap-1 min-w-[140px]">
          <p className="text-xs text-gray-600 mb-1">Reorder sentence</p>
          <button
            type="button"
            className="px-2 py-1 text-sm text-left border rounded hover:bg-gray-100 disabled:opacity-50"
            disabled={moveToTopMutation.isPending || moveToEndMutation.isPending}
            onClick={() => moveToTopMutation.mutate(orderPopover.sentenceId)}
          >
            Move to top
          </button>
          <button
            type="button"
            className="px-2 py-1 text-sm text-left border rounded hover:bg-gray-100 disabled:opacity-50"
            disabled={moveToTopMutation.isPending || moveToEndMutation.isPending}
            onClick={() => moveToEndMutation.mutate(orderPopover.sentenceId)}
          >
            Move to end
          </button>
          <button
            type="button"
            className="px-2 py-1 text-sm text-left border rounded hover:bg-gray-100"
            onClick={() => setOrderPopover(null)}
          >
            Cancel
          </button>
          </div>
        </CenteredViewportPopup>
      )}
      {editingImage && editingImage.image_id && (
        <ImageEditModal
          url={editingImage.url}
          imageId={editingImage.image_id}
          tags={editingImage.tags}
          posTypes={posTypes}
          chunkPatterns={chunkPatterns}
          pageSentences={
            (() => {
              const pageNums = new Set(
                (editingImage.usages ?? []).filter(
                  (u) => (u.version_id != null && u.version_id === effectiveVersionId) ||
                    (u.title_id != null && u.title_id === Number(id) && effectiveVersionId == null)
                ).map((u) => u.page_number)
              )
              return (sentences ?? []).filter(
                (s): s is typeof s & { page_number: number } =>
                  s.page_number != null && pageNums.has(s.page_number)
              )
            })()
          }
          usages={editingImage.usages}
          currentTitleId={id ? Number(id) : undefined}
          currentVersionId={effectiveVersionId ?? undefined}
          titleNames={titleNames}
          versionLabels={Object.fromEntries(versions.map((v) => [v.id, v.label]))}
          onSave={async (tags) => {
            await updateImageTagsMutation.mutateAsync({ imageId: editingImage.image_id!, tags })
          }}
          onClose={() => {
            setEditingImage(null)
            modalUpdateTokenPosRef.current = null
          }}
          onRegisterTokenPosUpdate={(cb) => {
            modalUpdateTokenPosRef.current = cb
          }}
          onWordClick={(tagId, _tagIndex, tokenIndex, _word, e) =>
            tokenPosInteraction.handleWordClick({ type: 'image_tag', imageTagId: tagId }, tokenIndex, e)
          }
          onWordHover={(tagId, _tagIndex, tokenIndex, e) =>
            tokenPosInteraction.handleWordHover({ type: 'image_tag', imageTagId: tagId }, tokenIndex, e)
          }
          onWordHoverEnd={tokenPosInteraction.handleWordHoverEnd}
          onCloseSelector={tokenPosInteraction.handleCloseSelector}
        />
      )}
      {pageEditOpen != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white p-6 rounded shadow-lg max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
            <h3 className="text-lg font-semibold mb-2">Edit page {pageEditOpen} text</h3>
            <p className="text-sm text-gray-600 mb-2">
              One line per sentence. Edit freely.
            </p>
            <textarea
              value={pageEditText}
              onChange={(e) => setPageEditText(e.target.value)}
              className="flex-1 min-h-[12rem] w-full border rounded px-3 py-2 text-sm font-mono mb-4 resize-y"
              placeholder="Type or paste text here..."
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-1.5 border rounded hover:bg-gray-100 text-sm"
                onClick={() => {
                  setPageEditOpen(null)
                  setPageEditText('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                disabled={updatePageTextMutation.isPending}
                onClick={() =>
                  updatePageTextMutation.mutate({ pageNumber: pageEditOpen, text: pageEditText })
                }
              >
                {updatePageTextMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
            {updatePageTextMutation.isError && (
              <p className="text-red-600 text-sm mt-2">
                {(updatePageTextMutation.error as Error).message}
              </p>
            )}
          </div>
        </div>
      )}
      {sourceTextOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white p-6 rounded shadow-lg max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
            <h3 className="text-lg font-semibold mb-2">Source text</h3>
            <p className="text-sm text-gray-600 mb-2">
              Paste or type story text here. Use &quot;Process from source&quot; on Stories to turn it into sentences.
            </p>
            {storySourceLoading ? (
              <p className="text-sm text-gray-500 mb-4">Loading…</p>
            ) : (
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                className="flex-1 min-h-[12rem] w-full border rounded px-3 py-2 text-sm font-mono mb-4 resize-y"
                placeholder="Paste or type text here..."
                autoFocus
              />
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-1.5 border rounded hover:bg-gray-100 text-sm"
                onClick={() => {
                  setSourceTextOpen(false)
                  setSourceText('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                disabled={saveSourceTextMutation.isPending || storySourceLoading}
                onClick={() => saveSourceTextMutation.mutate(sourceText)}
              >
                {saveSourceTextMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
            {saveSourceTextMutation.isError && (
              <p className="text-red-600 text-sm mt-2">
                {(saveSourceTextMutation.error as Error).message}
              </p>
            )}
          </div>
        </div>
      )}
      {insertMediaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white p-6 rounded shadow-lg max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
            <h3 className="text-lg font-semibold mb-4">Insert image</h3>
            {insertMediaError && (
              <p className="text-sm text-red-600 mb-2">{insertMediaError}</p>
            )}
            <div className="flex-1 min-h-0 overflow-auto mb-4">
              {r2ImagesLoading ? (
                <p className="text-sm text-gray-500">Loading images from Cloudflare...</p>
              ) : r2ImagesError ? (
                <div className="text-sm text-red-600 mb-2 space-y-2">
                  <p className="font-medium">{(r2ImagesError as Error).message}</p>
                  {(r2ImagesError as Error & { status?: number }).status != null && (
                    <p className="text-xs">HTTP {(r2ImagesError as Error & { status?: number }).status}</p>
                  )}
                  {(r2ImagesError as Error & { detail?: string }).detail && (
                    <details className="text-xs bg-red-50 p-2 rounded overflow-auto max-h-32">
                      <summary className="cursor-pointer">Show debug</summary>
                      <pre className="mt-1 whitespace-pre-wrap break-all">
                        {(r2ImagesError as Error & { detail?: string }).detail}
                      </pre>
                    </details>
                  )}
                </div>
              ) : r2Images.length === 0 ? (
                <p className="text-sm text-gray-500 mb-2">No images in bucket. Upload to R2 first.</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {r2Images.map((img) => (
                    <button
                      key={img.key}
                      type="button"
                      onClick={() => setSelectedR2Image(img)}
                      className={`aspect-square rounded border-2 overflow-hidden hover:border-blue-400 ${
                        selectedR2Image?.key === img.key ? 'border-blue-600' : 'border-gray-200'
                      }`}
                    >
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                  </div>
                </>
              )}
              {!r2ImagesLoading && (
                <>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        e.target.value = ''
                        setInsertMediaError(null)
                        setUploading(true)
                        try {
                          const { url } = await uploadR2Image(file)
                          await insertMediaMutation.mutateAsync(url)
                        } catch (err) {
                          setInsertMediaError(err instanceof Error ? err.message : 'Upload failed')
                        } finally {
                          setUploading(false)
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100 disabled:opacity-50"
                      disabled={uploading || insertMediaMutation.isPending}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? 'Uploading...' : 'Upload photo'}
                    </button>
                    <span className="text-xs text-gray-500">or</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Paste URL:</p>
                  <input
                    type="url"
                    value={insertMediaUrl}
                    onChange={(e) => {
                      setInsertMediaUrl(e.target.value)
                      setSelectedR2Image(null)
                    }}
                    placeholder="https://..."
                    className="w-full border rounded px-3 py-2 mt-1 text-sm"
                  />
                </>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100"
                onClick={() => {
                  setInsertMediaOpen(false)
                  setInsertForPage(null)
                  setInsertMediaError(null)
                  setSelectedR2Image(null)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm border rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={(!selectedR2Image?.url && !insertMediaUrl.trim()) || insertMediaMutation.isPending}
                onClick={() => insertMediaMutation.mutate(selectedR2Image?.url ?? insertMediaUrl)}
              >
                {insertMediaMutation.isPending ? 'Saving...' : 'Insert'}
              </button>
            </div>
          </div>
        </div>
      )}
      {generateQuestionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white p-6 rounded shadow-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Generate questions from sentence</h3>
            <p className="text-sm text-gray-600 mb-3">
              Page {generateQuestionsModal.pageNumber}. Uses the matching sentence pattern’s question templates.
            </p>
            <label className="block text-xs text-gray-600 mb-1">Source sentence</label>
            <select
              className="w-full border rounded px-2 py-2 text-sm mb-4"
              value={generateSentenceId ?? ''}
              onChange={(e) => setGenerateSentenceId(Number(e.target.value))}
            >
              {(sentences ?? [])
                .filter((s) => (s.page_number ?? 0) === generateQuestionsModal.pageNumber)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.sentence_number}: {(s.sentence_text ?? '').slice(0, 80)}
                    {(s.sentence_text ?? '').length > 80 ? '…' : ''}
                  </option>
                ))}
            </select>
            {generateQuestionsFromSentenceMutation.isError && (
              <p className="text-sm text-red-600 mb-2">
                {(generateQuestionsFromSentenceMutation.error as Error).message}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100"
                onClick={() => {
                  setGenerateQuestionsModal(null)
                  setGenerateSentenceId(null)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                disabled={generateSentenceId == null || generateQuestionsFromSentenceMutation.isPending}
                onClick={() => {
                  if (generateSentenceId == null) return
                  generateQuestionsFromSentenceMutation.mutate({
                    pageMediaId: generateQuestionsModal.pageMediaId,
                    sentenceId: generateSentenceId,
                  })
                }}
              >
                {generateQuestionsFromSentenceMutation.isPending ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
      {makePhraseOpen && makePhraseSentenceId != null && (() => {
        const tokens =
          makePhraseSentenceId === 'editor'
            ? draftTokens
            : typeof makePhraseSentenceId === 'object' && 'questionId' in makePhraseSentenceId
              ? (() => {
                  const cache = queryClient.getQueryData(['page_media', id, effectiveVersionId]) as
                    | { questions?: { id: number; tokens_array?: SentenceToken[] | null }[] }[]
                    | undefined
                  for (const m of cache ?? []) {
                    const q = m.questions?.find((x) => x.id === makePhraseSentenceId.questionId)
                    if (q?.tokens_array) return q.tokens_array
                  }
                  return [] as SentenceToken[]
                })()
              : (() => {
                  const sent = sentences?.find((x) => x.id === makePhraseSentenceId)
                  return sent ? getTokensForSentence(sent) : []
                })()
        const runs = findPatternRuns(tokens, chunkPatterns)
        const inPhrase = new Set(runs.flatMap((r) => Array.from({ length: r.end - r.start }, (_, j) => r.start + j)))
        const selectedSequence = [...makePhraseSelected]
          .sort((a, b) => a - b)
          .map((i) => tokens[i]?.pos_type_id)
          .filter((id): id is number => id != null)
        const canCreate = selectedSequence.length >= 2 && makePhraseName.trim()
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-white rounded shadow-lg p-4 max-w-lg w-full mx-4 max-h-[90vh] overflow-auto">
              <h3 className="font-medium mb-3">Make phrase from sentence</h3>
              <p className="text-sm text-gray-600 mb-3">
                Click leftover tokens (not in existing phrases) to select. Select 2+ to create a phrase.
              </p>
              <div className="mb-4 p-2 border rounded bg-gray-50 min-h-[2.5rem]">
                <TokenDisplay
                  tokens={tokens}
                  posTypes={posTypes}
                  makePhraseMode={{
                    inPhraseIndices: inPhrase,
                    selectedIndices: makePhraseSelected,
                    onTokenSelect: (i) => {
                      setMakePhraseSelected((prev) => {
                        const next = new Set(prev)
                        if (next.has(i)) next.delete(i)
                        else next.add(i)
                        return next
                      })
                    },
                  }}
                />
              </div>
              <div className="mb-4">
                <label className="block text-xs text-gray-600 mb-1">Phrase name</label>
                <input
                  type="text"
                  value={makePhraseName}
                  onChange={(e) => setMakePhraseName(e.target.value)}
                  placeholder="e.g. Verb-Noun phrase"
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!canCreate || createPhraseMutation.isPending}
                  onClick={() =>
                    createPhraseMutation.mutate({
                      name: makePhraseName.trim(),
                      sequence: selectedSequence,
                    })
                  }
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {createPhraseMutation.isPending ? 'Creating...' : 'Create phrase'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMakePhraseOpen(false)
                    setMakePhraseSentenceId(null)
                    setMakePhraseSelected(new Set())
                    setMakePhraseName('')
                  }}
                  className="px-3 py-1.5 border rounded hover:bg-gray-100 text-sm"
                >
                  Cancel
                </button>
              </div>
              {createPhraseMutation.isError && (
                <p className="text-red-600 text-sm mt-2">{createPhraseMutation.error?.message}</p>
              )}
            </div>
          </div>
        )
      })()}
      {savePatternOpen && (patternBuilderContext ?? editingRowId != null) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded shadow-lg p-4 max-w-md w-full mx-4">
            <h3 className="font-medium mb-3">Save sentence pattern</h3>
            <p className="text-sm text-gray-600 mb-3">
              {patternBuilderContext?.isPartial
                ? 'Extension of base pattern — save as variant (e.g. Name 1.1, 1.2).'
                : 'Captures the POS blueprint and phrase components of this sentence.'}
            </p>
            <div className="mb-4">
              <label className="block text-xs text-gray-600 mb-1">Label</label>
              <input
                type="text"
                value={savePatternLabel}
                onChange={(e) => setSavePatternLabel(e.target.value)}
                placeholder={patternBuilderContext?.isPartial ? 'e.g. Verb-Noun 1.1' : 'e.g. Simple declarative'}
                className="w-full border rounded px-2 py-1 text-sm"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const sentenceId =
                    patternBuilderContext?.sentenceId ??
                    (editingRowId === 'draft' ? 'editor' : editingRowId!)
                  saveSentencePatternMutation.mutate({
                    sentenceId,
                    label: savePatternLabel.trim(),
                  })
                }}
                disabled={!savePatternLabel.trim() || saveSentencePatternMutation.isPending}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saveSentencePatternMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSavePatternOpen(false)
                  setSavePatternLabel('')
                  setPatternBuilderContext(null)
                }}
                className="px-3 py-1.5 border rounded hover:bg-gray-100 text-sm"
              >
                Cancel
              </button>
            </div>
            {saveSentencePatternMutation.isError && (
              <p className="text-red-600 text-sm mt-2">{saveSentencePatternMutation.error?.message}</p>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
