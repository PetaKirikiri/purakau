import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  unique,
  jsonb,
  numeric,
  boolean,
  date,
  bigserial,
  primaryKey,
  bigint,
} from 'drizzle-orm/pg-core'

/** Token shape for story_sentences.tokens_array JSONB */
export type SentenceToken = {
  index: number
  text: string
  pos_type_id: number | null
  word_pos_entry_id: number | null
}

/** Stored on sentence_patterns.question_config — slot_index indexes non-punctuation tokens (same order as pos_blueprint). */
export type PatternQuestionWhen = {
  slot_pos?: { slot: number; pos_type_id: number }[]
  /** Case-insensitive match on token text (trimmed). */
  slot_text?: { slot: number; text: string }[]
  /** Focus content ordinal must lie in phrase_components span [start, end) for this name. */
  in_phrase_name?: string
}

export type PatternQuestionVariant = {
  id?: string
  label?: string
  /** Tokenized with getTokensFromSentence; replaces the focus span (replace_span or slot_index). */
  text: string
  when?: PatternQuestionWhen
  /** Per-variant replacement: inclusive content ordinals. Overrides PatternQuestionConfig.replace_span when set. */
  replace_span?: { start: number; end: number }
  /** Per-variant single-slot replacement. Overrides config slot_index when set (and variant replace_span unset). */
  slot_index?: number
}

export type PatternQuestionConfig = {
  slot_index: number
  /** Inclusive content ordinals; when set, replaces words start..end instead of only slot_index. */
  replace_span?: { start: number; end: number }
  variants: PatternQuestionVariant[]
}

/** Stored on sentence_patterns.phrase_components — start/end are content ordinals, [start, end) half-open. */
export type SentencePatternPhraseComponent = {
  pattern_id: number
  pattern_name: string
  start: number
  end: number
}

export const sentencePatterns = pgTable('sentence_patterns', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  posBlueprint: jsonb('pos_blueprint').notNull().$type<number[]>(),
  /** Surface forms aligned to pos_blueprint (saved from source sentence). */
  contentWords: jsonb('content_words').notNull().$type<string[]>().default([]),
  phraseComponents: jsonb('phrase_components')
    .notNull()
    .$type<SentencePatternPhraseComponent[]>()
    .default([]),
  questionConfig: jsonb('question_config').$type<PatternQuestionConfig | null>(),
  titleId: integer('title_id').references(() => titles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const posChunkPatterns = pgTable('pos_chunk_patterns', {
  id: numeric('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  posPattern: jsonb('pos_pattern').notNull(),
  shapeConfig: jsonb('shape_config').$type<ConnectorShapeConfig>().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const posTypes = pgTable('pos_types', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  label: text('label').notNull(),
  description: text('description'),
  color: text('color'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type ConnectorGender = 'male' | 'female' | 'none'

export type ConnectorShapeConfig = {
  type?: 'flat' | 'round' | 'bevel' | 'notch' | 'arrow' | 'koru' | 'wave'
  /** Male=bulge out, female=cavity, none=flat */
  gender?: ConnectorGender
  radius?: number
  inset?: number
  /** How far the endpoint extends beyond the bar (px) */
  tipLength?: number
  /** Tip width as fraction of bar height (0–1, 1=full) */
  tipWidth?: number
  /** Bevel cut angle in degrees (0=flat, 45=diagonal) */
  angle?: number
  /** Asymmetry: top vs bottom offset (-1 to 1) */
  asymmetry?: number
  /** Notch depth (px) */
  notchDepth?: number
  /** Round: arc control 0–1 (0.5=quarter circle) */
  arcControl?: number
}

export const connectorGridShapes = pgTable('connector_grid_shapes', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  lines: jsonb('lines').notNull().$type<{ x1: number; y1: number; x2: number; y2: number }[]>().default([]),
  circles: jsonb('circles').notNull().$type<{ cx: number; cy: number; r: number }[]>().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const connectorDesigns = pgTable(
  'connector_designs',
  {
    id: serial('id').primaryKey(),
    posTypeId: integer('pos_type_id')
      .notNull()
      .references(() => posTypes.id, { onDelete: 'cascade' }),
    side: text('side').notNull(),
    name: text('name'),
    shapeConfig: jsonb('shape_config').notNull().$type<ConnectorShapeConfig>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.posTypeId, t.side)]
)

export const titles = pgTable('titles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  author: text('author'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const storyVersions = pgTable(
  'story_versions',
  {
    id: serial('id').primaryKey(),
    titleId: integer('title_id')
      .notNull()
      .references(() => titles.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    label: text('label').notNull(),
    basedOnVersionId: integer('based_on_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.titleId, t.versionNumber)]
)

export const storySources = pgTable(
  'story_sources',
  {
    id: serial('id').primaryKey(),
    titleId: integer('title_id')
      .notNull()
      .references(() => titles.id, { onDelete: 'cascade' }),
    versionId: integer('version_id').references(() => storyVersions.id, { onDelete: 'cascade' }),
    sourceText: text('source_text').notNull(),
    language: text('language').notNull().default('mi'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.titleId, t.language, t.versionId)]
)

export const wordRegistry = pgTable('word_registry', {
  wordText: text('word_text').primaryKey(),
  posTypes: jsonb('pos_types').notNull().default([]),
  metadata: jsonb('metadata').notNull().default({}),
  language: text('language').notNull().default('mi'),
  /** Lower = more frequent (e.g. 1 = top of import list). */
  frequencyRank: integer('frequency_rank'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const subCategories = pgTable('sub_categories', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  slug: text('slug').notNull().unique(),
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const wordRegistrySubCategories = pgTable(
  'word_registry_sub_categories',
  {
    wordText: text('word_text')
      .notNull()
      .references(() => wordRegistry.wordText, { onDelete: 'cascade' }),
    subCategoryId: bigint('sub_category_id', { mode: 'number' })
      .notNull()
      .references(() => subCategories.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.wordText, t.subCategoryId] })]
)

export const wordMetadataFieldDefinitions = pgTable('word_metadata_field_definitions', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  type: text('type').notNull(),
  label: text('label'),
  /** JSON array of strings (labels for select / multi_select). */
  options: jsonb('options').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const storySentences = pgTable('story_sentences', {
  id: serial('id').primaryKey(),
  storySourceId: integer('story_source_id').references(() => storySources.id, { onDelete: 'cascade' }),
  titleId: integer('title_id').references(() => titles.id, { onDelete: 'cascade' }),
  versionId: integer('version_id').references(() => storyVersions.id, { onDelete: 'cascade' }),
  chapterNumber: integer('chapter_number'),
  pageNumber: integer('page_number'),
  paragraphNumber: integer('paragraph_number'),
  sentenceNumber: integer('sentence_number'),
  sentenceText: text('sentence_text').notNull(),
  tokensArray: jsonb('tokens_array'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type ImageUsage = { version_id?: number; title_id?: number; page_number: number }

export const images = pgTable('images', {
  id: serial('id').primaryKey(),
  url: text('url').notNull(),
  usages: jsonb('usages').$type<ImageUsage[]>().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

/** One row per tag; tokens_array matches story_sentences layout */
export const imageTags = pgTable('image_tags', {
  id: serial('id').primaryKey(),
  imageId: integer('image_id')
    .notNull()
    .references(() => images.id, { onDelete: 'cascade' }),
  versionId: integer('version_id').references(() => storyVersions.id, { onDelete: 'cascade' }),
  x: numeric('x').notNull().default('0'),
  y: numeric('y').notNull().default('0'),
  sortOrder: integer('sort_order').notNull().default(0),
  sentenceText: text('sentence_text'),
  tokensArray: jsonb('tokens_array'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type ImageTagRow = {
  id: number
  image_id: number
  x: number
  y: number
  sort_order: number
  sentence_text: string | null
  tokens_array: SentenceToken[] | null
}

export const pageMedia = pgTable('page_media', {
  id: serial('id').primaryKey(),
  titleId: integer('title_id')
    .notNull()
    .references(() => titles.id, { onDelete: 'cascade' }),
  versionId: integer('version_id').references(() => storyVersions.id, { onDelete: 'cascade' }),
  pageNumber: integer('page_number').notNull(),
  imageId: integer('image_id').references(() => images.id, { onDelete: 'set null' }),
  url: text('url'),
  mediaType: text('media_type').notNull().default('image'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

/** Comprehension / discussion questions for a picture (page_media row); tokens match story_sentences. */
export const pageMediaQuestions = pgTable(
  'page_media_questions',
  {
    id: serial('id').primaryKey(),
    pageMediaId: integer('page_media_id')
      .notNull()
      .references(() => pageMedia.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    tokensArray: jsonb('tokens_array').notNull().$type<SentenceToken[]>().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.pageMediaId, t.sortOrder)]
)

export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const courses = pgTable('courses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  titleId: integer('title_id').references(() => titles.id, { onDelete: 'set null' }),
  versionId: integer('version_id').references(() => storyVersions.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const courseWords = pgTable(
  'course_words',
  {
    id: serial('id').primaryKey(),
    courseId: integer('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    wordText: text('word_text')
      .notNull()
      .references(() => wordRegistry.wordText, { onDelete: 'cascade' }),
    posTypeId: integer('pos_type_id')
      .notNull()
      .references(() => posTypes.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.courseId, t.wordText, t.posTypeId)]
)

export const classes = pgTable('classes', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  courseId: integer('course_id').references(() => courses.id, { onDelete: 'set null' }),
  versionId: integer('version_id').references(() => storyVersions.id, { onDelete: 'set null' }),
  level: text('level'),
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const classSessions = pgTable(
  'class_sessions',
  {
    id: serial('id').primaryKey(),
    classId: integer('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    sessionNumber: integer('session_number').notNull(),
    sessionDate: date('session_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.classId, t.sessionNumber)]
)

export const appUsers = pgTable('app_users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  role: text('role').notNull().default('user'),
  authUserId: text('auth_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const students = pgTable('students', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  appUserId: integer('app_user_id').references(() => appUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const kiwaha = pgTable('kiwaha', {
  id: serial('id').primaryKey(),
  phraseText: text('phrase_text').notNull(),
  meaning: text('meaning'),
  versionId: integer('version_id').references(() => storyVersions.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const kiwahaInstances = pgTable('kiwaha_instances', {
  id: serial('id').primaryKey(),
  kiwahaId: integer('kiwaha_id')
    .notNull()
    .references(() => kiwaha.id, { onDelete: 'cascade' }),
  sentenceId: integer('sentence_id')
    .notNull()
    .references(() => storySentences.id, { onDelete: 'cascade' }),
  tokenStart: integer('token_start').notNull(),
  tokenEnd: integer('token_end').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const classEnrollments = pgTable(
  'class_enrollments',
  {
    id: serial('id').primaryKey(),
    studentId: integer('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    classId: integer('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.studentId, t.classId)]
)

/** Umbrella for capability frameworks (e.g. Te Whainga Amorangi). Extensible for future frameworks. */
export const capabilityFrameworks = pgTable('capability_frameworks', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

/** Core capability areas (six domains) per framework. */
export const capabilityRegistry = pgTable(
  'capability_registry',
  {
    id: serial('id').primaryKey(),
    frameworkId: integer('framework_id')
      .notNull()
      .references(() => capabilityFrameworks.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    domain: text('domain'),
    description: text('description'),
    sortOrder: integer('sort_order').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.frameworkId, t.code)]
)

/** Four rungs per area: unfamiliar → comfortable → confident → capable. */
export const capabilityLevels = pgTable(
  'capability_levels',
  {
    id: serial('id').primaryKey(),
    capabilityId: integer('capability_id')
      .notNull()
      .references(() => capabilityRegistry.id, { onDelete: 'cascade' }),
    levelCode: text('level_code').notNull(),
    levelOrder: integer('level_order').notNull(),
    officialStandardText: text('official_standard_text'),
    plainEnglishInterpretation: text('plain_english_interpretation'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.capabilityId, t.levelCode), unique().on(t.capabilityId, t.levelOrder)]
)

/** One current row per student per capability area. current_level_id must match capability_id in app logic. */
export const studentCapabilityProgress = pgTable(
  'student_capability_progress',
  {
    id: serial('id').primaryKey(),
    studentId: integer('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    capabilityId: integer('capability_id')
      .notNull()
      .references(() => capabilityRegistry.id, { onDelete: 'cascade' }),
    currentLevelId: integer('current_level_id')
      .notNull()
      .references(() => capabilityLevels.id, { onDelete: 'restrict' }),
    /** Optional 0–100 micro-progress; null if only discrete level is tracked. */
    progressScore: numeric('progress_score'),
    evidenceCount: integer('evidence_count').notNull().default(0),
    lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.studentId, t.capabilityId)]
)
