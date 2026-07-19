import type { RecordingStatus } from '../types'
import { backfillLessonWordIdsForSeries } from './backfillLessonWordIdsForSeries'
import supabase from './supabase'
import { normalizeRecordingStatus } from './wordStatus'
import {
  seriesKey,
  voiceBankLanguageSqlValues,
  VOICE_BANK_LANGUAGE,
  wordsBankSeriesLabelFromSeriesId,
} from './voiceBankLabels'

export type HarvestedWord = {
  word: string
  translation: string | null
  /** e.g. `(L1S3)(L2S5)` — lesson number + 1-based screen index in JSON. */
  sourceRefs?: string
}

export type VoiceBankHarvestHit = {
  word: string
  translation: string | null
  lessonNumber: number
  /** 1-based index in `screens` array. */
  screenIndex: number
}

const UUID_RE_FOR_WORD_ROW =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isWordRowUuid(s: unknown): boolean {
  return typeof s === 'string' && UUID_RE_FOR_WORD_ROW.test(s.trim().toLowerCase())
}

function isVaAudioCaptured(st: RecordingStatus): boolean {
  return st === 'recorded' || st === 'approved'
}

function compareSourceTagKeys(a: string, b: string): number {
  const pa = /^L(\d+)S(\d+)$/.exec(a)
  const pb = /^L(\d+)S(\d+)$/.exec(b)
  if (pa && pb) {
    const la = Number(pa[1])
    const sa = Number(pa[2])
    const lb = Number(pb[1])
    const sb = Number(pb[2])
    if (la !== lb) return la - lb
    return sa - sb
  }
  return a.localeCompare(b)
}

function formatSourceRefs(tags: Iterable<string>): string {
  const arr = [...tags].sort(compareSourceTagKeys)
  return arr.map((t) => `(${t})`).join('')
}

type LessonRowForHarvest = { id: string; lesson_number: number | null; content: unknown }

function sortLessonRowsForHarvest(rows: LessonRowForHarvest[]): LessonRowForHarvest[] {
  return [...rows].sort((a, b) => {
    const na = typeof a.lesson_number === 'number' && a.lesson_number > 0 ? a.lesson_number : 1e9
    const nb = typeof b.lesson_number === 'number' && b.lesson_number > 0 ? b.lesson_number : 1e9
    if (na !== nb) return na - nb
    return a.id.localeCompare(b.id)
  })
}

function lessonDisplayNumber(row: LessonRowForHarvest, sortedIndex: number): number {
  if (typeof row.lesson_number === 'number' && row.lesson_number > 0) return row.lesson_number
  return sortedIndex + 1
}

/**
 * Raw hits from Audio exposure, Repetition practice, and Speaking practice (one entry per token per screen).
 * `lessonNumber` should be the curriculum lesson number shown to admins (DB `lesson_number`, or sort rank).
 *
 * **Audio exposure:** counts every non-empty Afaan line (`word` / legacy `oromo` / `text`), not only rows already
 * linked to `public.words` with a UUID `word_id`. Draft lines (no bank id yet) still queue for insert on Approve Series.
 *
 * **Speaking practice:** counts the practice phrase when `word` / `prompt` is set, with or without `word_id`
 * (e.g. linked to exposure via `speakingDraftTokenId` before a bank row exists).
 */
export function collectVoiceBankHitsFromScreens(
  screens: unknown[],
  lessonNumber: number,
): VoiceBankHarvestHit[] {
  if (!Array.isArray(screens) || screens.length === 0) return []

  const out: VoiceBankHarvestHit[] = []

  for (let idx = 0; idx < screens.length; idx++) {
    const screenIndex = idx + 1
    const s = screens[idx]
    if (s == null || typeof s !== 'object' || Array.isArray(s)) continue
    const type = (s as Record<string, unknown>).type
    const c = (s as Record<string, unknown>).content
    if (typeof type !== 'string' || c == null || typeof c !== 'object' || Array.isArray(c)) continue
    const cr = c as Record<string, unknown>

    if (type === 'audioExposure') {
      const words = cr.words
      if (Array.isArray(words)) {
        for (const item of words) {
          if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
          const rec = item as Record<string, unknown>
          const afaan = String(rec.word ?? rec.oromo ?? rec.text ?? '').trim()
          if (!afaan) continue
          const english = String(rec.translation ?? rec.english ?? '').trim() || null
          out.push({ word: afaan, translation: english, lessonNumber, screenIndex })
        }
      }
    }

    if (type === 'repetitionPractice') {
      const pairs = cr.pairs
      if (Array.isArray(pairs)) {
        for (const pair of pairs) {
          if (pair == null || typeof pair !== 'object' || Array.isArray(pair)) continue
          const pr = pair as Record<string, unknown>
          for (const side of ['base', 'answer'] as const) {
            const item = pr[side]
            if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
            const rec = item as Record<string, unknown>
            const afaan = String(rec.oromo ?? rec.word ?? rec.text ?? '').trim()
            if (!afaan) continue
            const english = String(rec.english ?? rec.translation ?? '').trim() || null
            out.push({ word: afaan, translation: english, lessonNumber, screenIndex })
          }
        }
      }
    }

    if (type === 'speakingPractice') {
      const word = String(cr.word ?? cr.prompt ?? '').trim()
      if (!word) continue
      const gloss =
        String(cr.phraseEnglish ?? cr.translation ?? cr.english ?? '').trim() || null
      out.push({ word, translation: gloss, lessonNumber, screenIndex })
    }
  }

  return out
}

/**
 * Values that may appear in `words.series` for this curriculum (`lesson_series.id`).
 * Series 1 lessons use `content.series: "Mastering Greetings"` while new seeds use `"Series 1"` — both must match.
 */
export async function wordBankSeriesColumnValuesForLessonSeries(seriesId: string): Promise<string[]> {
  const id = seriesId.trim()
  if (!id) return []
  const out: string[] = []
  const add = (s: string) => {
    const t = s.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  add(wordsBankSeriesLabelFromSeriesId(id))
  add(id)

  const { data, error } = await supabase.from('lesson_series').select('title').eq('id', id).maybeSingle()
  if (!error && data && typeof (data as { title?: unknown }).title === 'string') {
    add((data as { title: string }).title)
  }

  return out
}

/**
 * All `words.series` values to try for a lesson: from `lesson_series` id (slug, "Series N", title) plus
 * `lesson.content.series` (e.g. "Mastering Greetings") when the row id alone is not enough.
 */
export async function buildWordBankLookupLabels(
  lessonSeriesId: string | null | undefined,
  lessonContentSeries: string | null | undefined,
): Promise<string[]> {
  const out: string[] = []
  const add = (s: string) => {
    const t = s.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  if (lessonSeriesId?.trim()) {
    for (const x of await wordBankSeriesColumnValuesForLessonSeries(lessonSeriesId.trim())) add(x)
  }
  if (lessonContentSeries?.trim()) add(lessonContentSeries.trim())
  return out
}

function mapWordsRowToConflictShape(row: Record<string, unknown>): {
  id: string
  translation: string | null
  english: string | null
} | null {
  if (typeof row.id !== 'string') return null
  const tr = row.translation
  const gloss = typeof tr === 'string' ? tr.trim() : ''
  return {
    id: row.id,
    translation: gloss || null,
    english: null,
  }
}

const WORD_BANK_LOOKUP_COLUMNS = 'id,word,translation'

/**
 * Find a voice-bank row for an Afaan token restricted to the given `words.series` labels.
 * Matches on `public.words.word` only (`word` + `translation` schema).
 */
export async function lookupWordBankRowWithSeriesLabels(
  seriesLabels: string[],
  afaan: string,
): Promise<{ id: string; translation: string | null; english: string | null } | null> {
  const o = afaan.trim()
  if (!o || seriesLabels.length === 0) return null
  const langVals = voiceBankLanguageSqlValues()

  const base = () => supabase.from('words').select(WORD_BANK_LOOKUP_COLUMNS).in('series', seriesLabels)

  const runners = [
    () => base().eq('word', o).in('language', langVals).limit(1),
    () => base().ilike('word', o).in('language', langVals).limit(1),
    () => base().eq('word', o).limit(1),
    () => base().ilike('word', o).limit(1),
  ]

  for (const run of runners) {
    const { data, error } = await run()
    if (error) {
      if (/column|Could not find|does not exist|PGRST100/i.test(error.message)) continue
      continue
    }
    const raw = Array.isArray(data) && data.length > 0 ? (data[0] as Record<string, unknown>) : null
    const mapped = raw ? mapWordsRowToConflictShape(raw) : null
    if (mapped) return mapped
  }

  return null
}

export async function fetchWordBankRowForLessonWord(
  lessonSeriesId: string | null | undefined,
  lessonContentSeries: string | null | undefined,
  afaan: string,
): Promise<{ id: string; translation: string | null; english: string | null } | null> {
  const labels = await buildWordBankLookupLabels(lessonSeriesId, lessonContentSeries)
  if (!labels.length) return null
  return lookupWordBankRowWithSeriesLabels(labels, afaan)
}

function parseContentIfJsonString(content: unknown): unknown {
  if (typeof content === 'string') {
    const t = content.trim()
    if (!t) return null
    try {
      return JSON.parse(t) as unknown
    } catch {
      return null
    }
  }
  return content
}

/** Resolve `screens` from lesson `content` (handles nested `content.screens` and JSON strings). */
export function extractLessonScreensForHarvest(content: unknown): unknown[] {
  const root = parseContentIfJsonString(content)
  if (root == null || typeof root !== 'object' || Array.isArray(root)) return []
  const r = root as Record<string, unknown>
  if (Array.isArray(r.screens)) return r.screens
  const inner = r.content
  if (inner != null && typeof inner === 'object' && !Array.isArray(inner)) {
    const c = inner as Record<string, unknown>
    if (Array.isArray(c.screens)) return c.screens
  }
  return []
}

function pushHarvestUnique(
  out: HarvestedWord[],
  seen: Set<string>,
  word: string,
  translation: string | null,
) {
  const w = word.trim()
  if (!w) return
  const k = w.toLowerCase()
  if (seen.has(k)) return
  seen.add(k)
  out.push({ word: w, translation: translation?.trim() || null })
}

/**
 * Tokens that sync to `words` / VA on **Approve Series**: **audioExposure** (`content.words[]`),
 * **repetitionPractice** (`pairs[].base` + `pairs[].answer`), and **speakingPractice** (`word` / `prompt`).
 * Draft rows without `word_id` are included so typed words can enter the voice-recording queue.
 */
export function harvestWordsForVoiceBank(content: unknown): HarvestedWord[] {
  const screens = extractLessonScreensForHarvest(content)
  const hits = collectVoiceBankHitsFromScreens(screens, 0)
  const out: HarvestedWord[] = []
  const seen = new Set<string>()
  for (const h of hits) {
    pushHarvestUnique(out, seen, h.word, h.translation)
  }
  return out
}

/**
 * Broad harvest for editor helpers (e.g. discrimination “word appears in lesson” checks).
 * For **voice bank / approve**, use {@link harvestWordsForVoiceBank} only.
 */
export function harvestWordsFromLessonContent(content: unknown): HarvestedWord[] {
  const screens = extractLessonScreensForHarvest(content)
  if (!Array.isArray(screens) || screens.length === 0) return []

  const out: HarvestedWord[] = []
  const seen = new Set<string>()

  for (const s of screens) {
    if (s == null || typeof s !== 'object' || Array.isArray(s)) continue
    const type = (s as Record<string, unknown>).type
    const c = (s as Record<string, unknown>).content
    if (typeof type !== 'string' || c == null || typeof c !== 'object' || Array.isArray(c)) continue
    const cr = c as Record<string, unknown>

    if (type === 'audioExposure') {
      const words = cr.words
      if (Array.isArray(words)) {
        for (const item of words) {
          if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
          const rec = item as Record<string, unknown>
          const afaan = String(rec.word ?? rec.oromo ?? rec.text ?? '').trim()
          if (!afaan) continue
          const english = String(rec.translation ?? rec.english ?? '').trim() || null
          pushHarvestUnique(out, seen, afaan, english)
        }
      }
    }

    if (type === 'repetitionPractice') {
      const pairs = cr.pairs
      if (Array.isArray(pairs)) {
        for (const pair of pairs) {
          if (pair == null || typeof pair !== 'object' || Array.isArray(pair)) continue
          const pr = pair as Record<string, unknown>
          for (const side of ['base', 'answer'] as const) {
            const item = pr[side]
            if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
            const rec = item as Record<string, unknown>
            const afaan = String(rec.oromo ?? rec.word ?? rec.text ?? '').trim()
            const english = String(rec.english ?? rec.translation ?? '').trim() || null
            if (afaan) pushHarvestUnique(out, seen, afaan, english)
          }
        }
      }
    }

    if (type === 'CelebrateScreen') {
      const learned = cr.learned
      if (Array.isArray(learned)) {
        for (const item of learned) {
          if (typeof item === 'string') pushHarvestUnique(out, seen, item, null)
        }
      }
    }

    if (type === 'match') {
      const pairs = cr.pairs
      if (Array.isArray(pairs)) {
        for (const p of pairs) {
          if (p == null || typeof p !== 'object' || Array.isArray(p)) continue
          const pr = p as Record<string, unknown>
          const left = String(pr.left ?? '').trim()
          const right = String(pr.right ?? '').trim()
          pushHarvestUnique(out, seen, left, right || null)
        }
      }
    }

    if (type === 'quiz') {
      const questions = Array.isArray(cr.questions) ? cr.questions : cr.question ? [cr] : []
      for (const q of questions) {
        if (q == null || typeof q !== 'object' || Array.isArray(q)) continue
        const qr = q as Record<string, unknown>
        const qu = String(qr.question ?? '').trim()
        if (qu) pushHarvestUnique(out, seen, qu, null)
        const opts = qr.options
        if (Array.isArray(opts)) {
          for (const o of opts) {
            if (typeof o === 'string') pushHarvestUnique(out, seen, o.trim(), null)
            else if (o != null && typeof o === 'object' && !Array.isArray(o)) {
              const or = o as Record<string, unknown>
              const ot = String(or.oromo ?? or.text ?? or.word ?? '').trim()
              const oe = or.english
              if (ot) pushHarvestUnique(out, seen, ot, typeof oe === 'string' ? oe.trim() || null : null)
            }
          }
        }
      }
    }

    if (type === 'speakingPractice') {
      const word = String(cr.word ?? cr.prompt ?? '').trim()
      if (!word) continue
      const gloss =
        String(cr.phraseEnglish ?? cr.translation ?? cr.english ?? '').trim() || null
      pushHarvestUnique(out, seen, word, gloss)
    }

    if (type === 'discriminationDrill' || type === 'wordDiscriminationQuiz') {
      const wlist = cr.words
      if (Array.isArray(wlist) && wlist.length >= 2) {
        for (const item of wlist) {
          if (item == null || typeof item !== 'object' || Array.isArray(item)) continue
          const wr = item as Record<string, unknown>
          const t = String(wr.oromo ?? wr.text ?? wr.word ?? '').trim()
          const gloss =
            String(wr.definition ?? wr.english ?? wr.translation ?? '').trim() || null
          if (t) pushHarvestUnique(out, seen, t, gloss)
        }
      } else {
        const wa = String(cr.wordA ?? cr.word_a ?? '').trim()
        const wb = String(cr.wordB ?? cr.word_b ?? '').trim()
        const da = String(cr.definitionA ?? '').trim() || null
        const db = String(cr.definitionB ?? '').trim() || null
        if (wa) pushHarvestUnique(out, seen, wa, da)
        if (wb) pushHarvestUnique(out, seen, wb, db)
      }
    }

    if (type === 'dialogue') {
      const dd = cr.dialogueData as Record<string, unknown> | undefined
      const sides: unknown[] = []
      if (dd && typeof dd === 'object' && dd.person1 != null && dd.person2 != null) {
        sides.push(dd.person1, dd.person2)
      }
      for (const p of sides) {
        if (p == null || typeof p !== 'object' || Array.isArray(p)) continue
        const pr = p as Record<string, unknown>
        const lines = Array.isArray(pr.lines) ? pr.lines : []
        const trans = Array.isArray(pr.translations) ? pr.translations : []
        for (let i = 0; i < lines.length; i++) {
          const line = typeof lines[i] === 'string' ? lines[i].trim() : ''
          if (!line) continue
          const tr = trans[i]
          const gloss = typeof tr === 'string' ? tr.trim() || null : null
          pushHarvestUnique(out, seen, line, gloss)
        }
      }
    }
  }

  return out
}

/** Harvest tokens from a `screens` array only (broad harvest for editors — not voice-bank sync). */
export function harvestWordsFromLessonScreens(screens: unknown[]): HarvestedWord[] {
  return harvestWordsFromLessonContent({ screens })
}

export type BlockedOtherSeries = { word: string; existingSeries: string }

export type SeedWordsResult = {
  inserted: number
  /** Existing rows in this series whose `translation`/`english` was updated from lesson content. */
  translationsUpdated: number
  skippedExisting: number
  totalHarvested: number
  /** Same word+language already lives under another `words.series` — not inserted here. */
  blockedOtherSeries: BlockedOtherSeries[]
  error?: string
  /** Lesson rows whose JSON was patched to add `word_id` on tokens matched to `public.words`. */
  lessonsWordIdsPatched?: number
  /** Lesson JSON backfill failed (words sync still applied). */
  backfillError?: string
}

type SeriesWordSyncPlan = {
  wordsSeriesLabel: string
  language: string
  targetKey: string
  harvested: HarvestedWord[]
  toInsert: HarvestedWord[]
  skippedExisting: number
  blockedOtherSeries: BlockedOtherSeries[]
  /** Rows returned from `lessons` for this series (for admin UI diagnostics). */
  lessonRowCount: number
}

async function buildSeriesWordSyncPlan(seriesId: string): Promise<{ plan: SeriesWordSyncPlan; error?: string } | { error: string }> {
  const id = seriesId.trim()
  const wordsSeriesLabel = wordsBankSeriesLabelFromSeriesId(id)
  const language = VOICE_BANK_LANGUAGE
  const targetKey = seriesKey(id)

  if (!id) {
    return { error: 'Missing series id.' }
  }

  const seriesColumnValues = await wordBankSeriesColumnValuesForLessonSeries(id)
  const targetKeySet = new Set(seriesColumnValues.map((l) => seriesKey(l)))

  const { data: lessons, error: lesErr } = await supabase
    .from('lessons')
    .select('id, lesson_number, content')
    .eq('series_id', id)

  if (lesErr) {
    return { error: lesErr.message }
  }

  const rawRows = (lessons ?? []) as LessonRowForHarvest[]
  const lessonRows = sortLessonRowsForHarvest(rawRows)
  const lessonRowCount = lessonRows.length

  const merged = new Map<
    string,
    { word: string; translation: string | null; tags: Set<string> }
  >()

  for (let i = 0; i < lessonRows.length; i++) {
    const row = lessonRows[i]
    const L = lessonDisplayNumber(row, i)
    const screens = extractLessonScreensForHarvest(row.content)
    for (const hit of collectVoiceBankHitsFromScreens(screens, L)) {
      const w = hit.word.trim()
      if (!w) continue
      const k = w.toLowerCase()
      const tag = `L${hit.lessonNumber}S${hit.screenIndex}`
      const ex = merged.get(k)
      if (!ex) {
        merged.set(k, {
          word: w,
          translation: hit.translation?.trim() || null,
          tags: new Set([tag]),
        })
      } else {
        ex.tags.add(tag)
        const ht = hit.translation?.trim() || null
        if (!ex.translation && ht) ex.translation = ht
      }
    }
  }

  const harvested: HarvestedWord[] = [...merged.values()].map((v) => ({
    word: v.word,
    translation: v.translation,
    sourceRefs: formatSourceRefs(v.tags),
  }))

  if (harvested.length === 0) {
    return {
      plan: {
        wordsSeriesLabel,
        language,
        targetKey,
        harvested,
        toInsert: [],
        skippedExisting: 0,
        blockedOtherSeries: [],
        lessonRowCount,
      },
    }
  }

  const langVals = voiceBankLanguageSqlValues()
  const { data: allLangRows, error: exErr } = await supabase
    .from('words')
    .select('word, series')
    .in('language', langVals)

  if (exErr) {
    return { error: exErr.message }
  }

  const rows = (allLangRows as { word: string; series: string | null }[] | null) ?? []
  const byWordLower = new Map<string, { series: string }[]>()
  for (const r of rows) {
    const w = r.word.trim().toLowerCase()
    if (!w) continue
    const list = byWordLower.get(w) ?? []
    list.push({ series: String(r.series ?? '') })
    byWordLower.set(w, list)
  }

  const blockedOtherSeries: BlockedOtherSeries[] = []
  let skippedExisting = 0
  const toInsert: HarvestedWord[] = []

  for (const h of harvested) {
    const wl = h.word.toLowerCase()
    const existing = byWordLower.get(wl) ?? []
    const inTarget = existing.some((e) => targetKeySet.has(seriesKey(e.series)))
    if (inTarget) {
      skippedExisting += 1
      continue
    }
    const foreign = existing.filter((e) => !targetKeySet.has(seriesKey(e.series)))
    if (foreign.length > 0) {
      const labels = [...new Set(foreign.map((e) => e.series.trim()).filter(Boolean))]
      blockedOtherSeries.push({
        word: h.word,
        existingSeries: labels.length ? labels.join(', ') : '(unknown series)',
      })
      continue
    }
    toInsert.push(h)
  }

  return {
    plan: {
      wordsSeriesLabel,
      language,
      targetKey,
      harvested,
      toInsert,
      skippedExisting,
      blockedOtherSeries,
      lessonRowCount,
    },
  }
}

function glossFromWordsRow(row: { translation?: string | null; english?: string | null }): string {
  return (row.translation ?? row.english ?? '').trim()
}

async function patchWordTranslationFromLesson(rowId: string, translation: string): Promise<{ error?: string }> {
  const e = translation.trim()
  const up1 = await supabase.from('words').update({ translation: e }).eq('id', rowId)
  if (!up1.error) return {}
  const msg = up1.error.message || ''
  if (/column .*translation.* does not exist/i.test(msg)) {
    const up2 = await supabase.from('words').update({ english: e }).eq('id', rowId)
    if (!up2.error) return {}
    return { error: up2.error.message }
  }
  return { error: up1.error.message }
}

/** @deprecated Prefer {@link fetchWordBankRowForLessonWord} with lesson JSON `content.series` when needed. */
export async function fetchWordBankRowForSeries(
  seriesId: string,
  afaan: string,
): Promise<{ id: string; translation: string | null; english: string | null } | null> {
  return fetchWordBankRowForLessonWord(seriesId, null, afaan)
}

export type SeriesWordBankReviewSummary = {
  newWords: { word: string; translation: string | null; sourceRefs?: string }[]
  /** Lesson vocabulary already in `words` for this series, but `status` is not recorded/approved yet. */
  needsVaRecording: { word: string; translation: string | null; sourceRefs?: string }[]
  pendingTranslationChanges: {
    word: string
    lessonTranslation: string
    databaseTranslation: string
  }[]
  blockedOtherSeries: BlockedOtherSeries[]
  /** Unique tokens harvested from lesson JSON (before comparing to `words`). */
  harvestedCount: number
  /** `lessons` rows for this `series_id`. */
  lessonRowCount: number
}

/**
 * What would change in `words` when this series is approved: new rows, translation patches, cross-series blocks.
 * Lesson JSON is the source of truth for text; DB is updated only on approve (see {@link seedWordsFromSeriesLessons}).
 */
export async function buildSeriesWordBankReviewSummary(seriesId: string): Promise<
  { summary: SeriesWordBankReviewSummary } | { error: string }
> {
  const sid = seriesId.trim()
  const built = await buildSeriesWordSyncPlan(sid)
  if (!('plan' in built)) return { error: built.error }
  const { plan } = built
  const { wordsSeriesLabel, harvested, toInsert, blockedOtherSeries, lessonRowCount } = plan
  const langVals = voiceBankLanguageSqlValues()
  const seriesColumnValues = await wordBankSeriesColumnValuesForLessonSeries(sid)
  const seriesInFilter =
    seriesColumnValues.length > 0 ? seriesColumnValues : [wordsSeriesLabel]

  const newWords = toInsert.map((h) => ({
    word: h.word,
    translation: h.translation,
    sourceRefs: h.sourceRefs,
  }))

  const toInsertLower = new Set(toInsert.map((h) => h.word.toLowerCase()))
  const blockedLower = new Set(blockedOtherSeries.map((b) => b.word.toLowerCase()))

  const pendingTranslationChanges: SeriesWordBankReviewSummary['pendingTranslationChanges'] = []
  const needsVaRecording: SeriesWordBankReviewSummary['needsVaRecording'] = []

  const inSeriesHarvested = harvested.filter(
    (h) => !toInsertLower.has(h.word.toLowerCase()) && !blockedLower.has(h.word.toLowerCase()),
  )

  if (inSeriesHarvested.length > 0) {
    const { data: seriesRows, error: wErr } = await supabase
      .from('words')
      .select('id,word,translation,series,status')
      .in('series', seriesInFilter)
      .in('language', langVals)

    if (wErr) return { error: wErr.message }

    type SumRow = {
      id: string
      translation: string | null
      english: string | null
      seriesLabel: string
      status: RecordingStatus
    }
    const byLower = new Map<string, SumRow>()
    for (const r of (seriesRows as {
      id?: string
      word?: string
      series?: string | null
      translation?: string | null
      english?: string | null
      status?: unknown
    }[] | null) ?? []) {
      const w = String(r.word ?? '').trim().toLowerCase()
      if (!w || typeof r.id !== 'string') continue
      const seriesLabel = String(r.series ?? '').trim()
      const candidate: SumRow = {
        id: r.id,
        translation: r.translation ?? null,
        english: r.english ?? null,
        seriesLabel,
        status: normalizeRecordingStatus(r.status),
      }
      const prev = byLower.get(w)
      if (!prev) {
        byLower.set(w, candidate)
        continue
      }
      const curCanonical = seriesLabel === wordsSeriesLabel
      const prevCanonical = prev.seriesLabel === wordsSeriesLabel
      if (curCanonical && !prevCanonical) byLower.set(w, candidate)
    }

    for (const h of inSeriesHarvested) {
      const row = byLower.get(h.word.toLowerCase())
      if (row && !isVaAudioCaptured(row.status)) {
        needsVaRecording.push({
          word: h.word,
          translation: h.translation,
          sourceRefs: h.sourceRefs,
        })
      }
    }

    for (const h of inSeriesHarvested) {
      const leGloss = (h.translation ?? '').trim()
      if (!leGloss) continue
      const row = byLower.get(h.word.toLowerCase())
      if (!row) continue
      const dbGloss = glossFromWordsRow(row)
      if (dbGloss === leGloss) continue
      pendingTranslationChanges.push({
        word: h.word,
        lessonTranslation: leGloss,
        databaseTranslation: dbGloss || '(empty)',
      })
    }
  }

  return {
    summary: {
      newWords,
      needsVaRecording,
      pendingTranslationChanges,
      blockedOtherSeries,
      harvestedCount: harvested.length,
      lessonRowCount,
    },
  }
}

export type SeriesWordsVaProgress = {
  totalLessonWords: number
  /** Every harvested lesson token already has a `words` row under this series (nothing new to insert as pending). */
  allLessonWordsInVoiceBank: boolean
  /** Lesson tokens not yet in `words` for this language — inserted as pending when curriculum is approved (or on next screen load after approval). */
  syncableNewRowCount: number
  /** Harvested tokens with no row under this series in the voice bank (need sync, conflict, or not loaded). */
  missingFromVoiceBankCount: number
  /** Among lesson tokens that already have a row under this series: uploaded / reviewed. */
  withRecording: number
  /** Among lesson tokens that already have a row under this series: still need VA takes (or re-record). */
  needRecording: number
  blockedOtherSeries: BlockedOtherSeries[]
}

/**
 * Lesson vocabulary vs voice bank: whether sync is needed, and recording progress for tokens already in `words`.
 */
export async function fetchSeriesWordsVaProgress(params: {
  seriesId: string
}): Promise<{ progress: SeriesWordsVaProgress; error?: string }> {
  const built = await buildSeriesWordSyncPlan(params.seriesId.trim())
  if (!('plan' in built)) {
    return {
      progress: {
        totalLessonWords: 0,
        allLessonWordsInVoiceBank: false,
        syncableNewRowCount: 0,
        missingFromVoiceBankCount: 0,
        withRecording: 0,
        needRecording: 0,
        blockedOtherSeries: [],
      },
      error: built.error,
    }
  }

  const { plan } = built
  const { harvested, toInsert, blockedOtherSeries, wordsSeriesLabel } = plan
  const totalLessonWords = harvested.length
  const syncableNewRowCount = toInsert.length
  const allLessonWordsInVoiceBank =
    totalLessonWords > 0 && syncableNewRowCount === 0 && blockedOtherSeries.length === 0

  let withRecording = 0
  let needRecording = 0

  if (totalLessonWords > 0) {
    const langVals = voiceBankLanguageSqlValues()
    const seriesColumnValues = await wordBankSeriesColumnValuesForLessonSeries(params.seriesId.trim())
    const seriesInFilter =
      seriesColumnValues.length > 0 ? seriesColumnValues : [wordsSeriesLabel]
    const { data: seriesRows, error: wErr } = await supabase
      .from('words')
      .select('word,status,series')
      .in('series', seriesInFilter)
      .in('language', langVals)

    if (wErr) {
      return {
        progress: {
          totalLessonWords,
          allLessonWordsInVoiceBank,
          syncableNewRowCount,
          missingFromVoiceBankCount: totalLessonWords,
          withRecording: 0,
          needRecording: 0,
          blockedOtherSeries,
        },
        error: wErr.message,
      }
    }

    const byLower = new Map<string, { st: RecordingStatus; seriesLabel: string }>()
    for (const r of (seriesRows as { word: string; status?: unknown; series?: string | null }[] | null) ?? []) {
      const w = r.word.trim().toLowerCase()
      if (!w) continue
      const seriesLabel = String(r.series ?? '').trim()
      const st = normalizeRecordingStatus(r.status)
      const prev = byLower.get(w)
      if (!prev) {
        byLower.set(w, { st, seriesLabel })
        continue
      }
      const curCanonical = seriesLabel === wordsSeriesLabel
      const prevCanonical = prev.seriesLabel === wordsSeriesLabel
      if (curCanonical && !prevCanonical) byLower.set(w, { st, seriesLabel })
    }

    for (const h of harvested) {
      const entry = byLower.get(h.word.toLowerCase())
      if (entry == null) continue
      if (isVaAudioCaptured(entry.st)) withRecording += 1
      else needRecording += 1
    }
  }

  const inVoiceBankLessonCount = withRecording + needRecording
  const missingFromVoiceBankCount = Math.max(0, totalLessonWords - inVoiceBankLessonCount)

  return {
    progress: {
      totalLessonWords,
      allLessonWordsInVoiceBank,
      syncableNewRowCount,
      missingFromVoiceBankCount,
      withRecording,
      needRecording,
      blockedOtherSeries,
    },
  }
}

/**
 * Apply lesson vocabulary to `words` when admin approves curriculum: insert missing rows and patch
 * translations for existing rows in this series when lesson text differs. Lesson edits before approval
 * only change JSON; this is the DB write path.
 */
export async function seedWordsFromSeriesLessons(params: { seriesId: string }): Promise<SeedWordsResult> {
  const seriesId = params.seriesId.trim()
  if (!seriesId) {
    return {
      inserted: 0,
      translationsUpdated: 0,
      skippedExisting: 0,
      totalHarvested: 0,
      blockedOtherSeries: [],
      error: 'Missing series id.',
    }
  }

  const built = await buildSeriesWordSyncPlan(seriesId)
  if (!('plan' in built)) {
    return {
      inserted: 0,
      translationsUpdated: 0,
      skippedExisting: 0,
      totalHarvested: 0,
      blockedOtherSeries: [],
      error: built.error,
    }
  }

  const { plan } = built
  const { wordsSeriesLabel, language, harvested, toInsert, skippedExisting, blockedOtherSeries } = plan

  if (harvested.length === 0) {
    return { inserted: 0, translationsUpdated: 0, skippedExisting: 0, totalHarvested: 0, blockedOtherSeries: [] }
  }

  let inserted = 0
  let translationsUpdated = 0

  if (toInsert.length > 0) {
    const insertRows = toInsert.map((h) => ({
      series: wordsSeriesLabel,
      word: h.word,
      language,
      translation: h.translation,
      status: 'pending' as const,
      slow_audio_url: null,
      fast_audio_url: null,
    }))

    const { error: insErr } = await supabase.from('words').insert(insertRows)

    if (insErr) {
      return {
        inserted: 0,
        translationsUpdated: 0,
        skippedExisting,
        totalHarvested: harvested.length,
        blockedOtherSeries,
        error: insErr.message,
      }
    }
    inserted = toInsert.length
  }

  const toInsertLower = new Set(toInsert.map((h) => h.word.toLowerCase()))
  const blockedLower = new Set(blockedOtherSeries.map((b) => b.word.toLowerCase()))
  const inSeriesHarvested = harvested.filter(
    (h) => !toInsertLower.has(h.word.toLowerCase()) && !blockedLower.has(h.word.toLowerCase()),
  )

  if (inSeriesHarvested.length > 0) {
    const langVals = voiceBankLanguageSqlValues()
    const seriesColumnValues = await wordBankSeriesColumnValuesForLessonSeries(seriesId)
    const seriesInFilter =
      seriesColumnValues.length > 0 ? seriesColumnValues : [wordsSeriesLabel]
    const { data: seriesRows, error: wErr } = await supabase
      .from('words')
      .select('id,word,translation,series')
      .in('series', seriesInFilter)
      .in('language', langVals)

    if (wErr) {
      return {
        inserted,
        translationsUpdated: 0,
        skippedExisting,
        totalHarvested: harvested.length,
        blockedOtherSeries,
        error: wErr.message,
      }
    }

    type RowPick = { id: string; translation: string | null; english: string | null; seriesLabel: string }
    const byLower = new Map<string, RowPick>()
    for (const r of (seriesRows as {
      id?: string
      word?: string
      series?: string | null
      translation?: string | null
      english?: string | null
    }[] | null) ?? []) {
      const w = String(r.word ?? '').trim().toLowerCase()
      if (!w || typeof r.id !== 'string') continue
      const seriesLabel = String(r.series ?? '').trim()
      const candidate: RowPick = {
        id: r.id,
        translation: r.translation ?? null,
        english: r.english ?? null,
        seriesLabel,
      }
      const prev = byLower.get(w)
      if (!prev) {
        byLower.set(w, candidate)
        continue
      }
      const curCanonical = seriesLabel === wordsSeriesLabel
      const prevCanonical = prev.seriesLabel === wordsSeriesLabel
      if (curCanonical && !prevCanonical) byLower.set(w, candidate)
    }

    for (const h of inSeriesHarvested) {
      const leGloss = (h.translation ?? '').trim()
      if (!leGloss) continue
      const row = byLower.get(h.word.toLowerCase())
      if (!row) continue
      const dbGloss = glossFromWordsRow(row)
      if (dbGloss === leGloss) continue
      const { error: patchErr } = await patchWordTranslationFromLesson(row.id, leGloss)
      if (patchErr) {
        return {
          inserted,
          translationsUpdated,
          skippedExisting,
          totalHarvested: harvested.length,
          blockedOtherSeries,
          error: patchErr,
        }
      }
      translationsUpdated += 1
    }
  }

  const bf = await backfillLessonWordIdsForSeries(seriesId)
  return {
    inserted,
    translationsUpdated,
    skippedExisting,
    totalHarvested: harvested.length,
    blockedOtherSeries,
    lessonsWordIdsPatched: bf.lessonsUpdated,
    ...(bf.error ? { backfillError: bf.error } : {}),
  }
}
