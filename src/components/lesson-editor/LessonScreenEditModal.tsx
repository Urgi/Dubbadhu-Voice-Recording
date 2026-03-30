import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { LessonScreen } from '../../lib/lessonEditor'
import { SCREEN_TYPE_OPTIONS } from '../../lib/lessonEditor'
import supabase from '../../lib/supabase'

type Props = {
  visible: boolean
  screen: LessonScreen | null
  /** Same draft as the lesson editor; used to derive Celebrate `learned` from Audio exposure words. */
  lessonScreens?: LessonScreen[]
  onClose: () => void
  onApply: (next: LessonScreen) => void
}

/** Normalize pattern practice / legacy option entries to display text (no audio refs persisted). */
function patternOptionString(x: unknown): string {
  if (typeof x === 'string') return x.trim()
  if (x != null && typeof x === 'object' && !Array.isArray(x)) {
    const t = (x as Record<string, unknown>).text
    if (typeof t === 'string') return t.trim()
  }
  return String(x ?? '').trim()
}

/** Order: lesson screen order, then word order within each Audio exposure; deduped by Afaan string. */
function celebrateExposureWordRows(screens: LessonScreen[]): { afaan: string; english: string }[] {
  const out: { afaan: string; english: string }[] = []
  const seen = new Set<string>()
  for (const s of screens) {
    if (s.type !== 'audioExposure') continue
    const words = (s.content as Record<string, unknown>).words
    if (!Array.isArray(words)) continue
    for (const w of words) {
      if (w == null || typeof w !== 'object' || Array.isArray(w)) continue
      const rec = w as Record<string, unknown>
      const afaan = String(rec.oromo ?? rec.word ?? '').trim()
      const english = String(rec.english ?? rec.translation ?? '').trim()
      if (!afaan) continue
      if (seen.has(afaan)) continue
      seen.add(afaan)
      out.push({ afaan, english })
    }
  }
  return out
}

/** Row from `public.words`. Production uses `word` + `translation`; optional fields support alternate schemas. */
type WordBankRow = {
  id: string
  word?: string | null
  oromo?: string | null
  translation?: string | null
  english?: string | null
  slow_audio_url?: string | null
  fast_audio_url?: string | null
}

function rowAfaanText(r: WordBankRow): string {
  return (r.word ?? r.oromo ?? '').trim()
}

function rowTranslationText(r: WordBankRow): string {
  return (r.translation ?? r.english ?? '').trim()
}

/** Dubbadhu quiz `audioRef`: prefer fast recording URL, then slow, when present on `words`. */
function audioRefFromWordRow(row: WordBankRow): string | undefined {
  const fast = row.fast_audio_url?.trim()
  const slow = row.slow_audio_url?.trim()
  return fast || slow || undefined
}

type QuizOptionDraft = {
  text: string
  english: string
  word_id?: string
  audioRef?: string
}

function serializeQuizOption(x: QuizOptionDraft): Record<string, unknown> {
  const o: Record<string, unknown> = { text: x.text, english: x.english }
  if (x.word_id) o.word_id = x.word_id
  if (x.audioRef?.trim()) o.audioRef = x.audioRef.trim()
  return o
}

function quizContentWithAudioOptionsFlag(content: Record<string, unknown>): Record<string, unknown> {
  const qs = content.questions
  if (!Array.isArray(qs) || qs.length === 0) return { ...content, audioOptions: false }
  const q0 = qs[0] as Record<string, unknown> | undefined
  const opts = q0?.options
  if (!Array.isArray(opts)) return { ...content, audioOptions: false }
  const hasAudio = opts.some((item) => {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) return false
    const ar = (item as Record<string, unknown>).audioRef
    return typeof ar === 'string' && ar.trim().length > 0
  })
  return { ...content, audioOptions: hasAudio }
}

async function ensureWordExistsInBank(afaan: string, translation: string): Promise<void> {
  const o = afaan.trim()
  const e = translation.trim()
  if (!o || !e) throw new Error('Audio exposure words require both Afaan Oromo text and translation.')

  const existing = await supabase.from('words').select('id').ilike('word', o).limit(1).maybeSingle()
  if (!existing.error && existing.data && (existing.data as { id?: unknown }).id) return

  const ins1 = await supabase.from('words').insert({ word: o, translation: e }).select('id').maybeSingle()
  if (!ins1.error) return

  const msg = ins1.error.message || ''
  if (/column .*translation.* does not exist/i.test(msg)) {
    const ins2 = await supabase.from('words').insert({ word: o, english: e }).select('id').maybeSingle()
    if (!ins2.error) return
    throw new Error(ins2.error.message)
  }
  throw new Error(ins1.error.message)
}

function wordLabel(row: WordBankRow): string {
  const a = rowAfaanText(row)
  const b = rowTranslationText(row)
  if (a && b) return `${a} — ${b}`
  return a || b || row.id
}

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

function screenTypeTitle(type: string): string {
  return SCREEN_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

async function fetchWordBankRows(
  query: string,
  searchMode: 'both' | 'oromo',
): Promise<{ data: WordBankRow[] | null; error: Error | null }> {
  const isUuid = isUuidLike(query)
  const variants = [
    'id,word,translation,slow_audio_url,fast_audio_url',
    'id,oromo,english,slow_audio_url,fast_audio_url',
  ] as const

  let lastMsg = ''
  for (const cols of variants) {
    let q = supabase.from('words').select(cols).limit(25)
    if (isUuid) q = q.eq('id', query)
    else if (searchMode === 'oromo') {
      q = cols.startsWith('id,word') ? q.ilike('word', `%${query}%`) : q.ilike('oromo', `%${query}%`)
    } else {
      q = cols.startsWith('id,word')
        ? q.or(`word.ilike.%${query}%,translation.ilike.%${query}%`)
        : q.or(`oromo.ilike.%${query}%,english.ilike.%${query}%`)
    }

    const res = await q
    if (!res.error) {
      return {
        data: ((res.data as WordBankRow[] | null) ?? []).filter((r) => typeof r?.id === 'string'),
        error: null,
      }
    }
    lastMsg = res.error.message
    if (!/column .* does not exist|Could not find/i.test(res.error.message)) {
      return { data: null, error: new Error(res.error.message) }
    }
  }
  return { data: null, error: new Error(lastMsg || 'words search failed') }
}

function WordBankPicker({
  label,
  value,
  onPick,
  placeholder = 'Search word bank…',
  searchMode = 'both',
}: {
  label: string
  value: WordBankRow | null
  onPick: (row: WordBankRow) => void
  placeholder?: string
  searchMode?: 'both' | 'oromo'
}) {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<WordBankRow[]>([])
  const [err, setErr] = useState('')
  const lastReq = useRef(0)

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setRows([])
      setErr('')
      return
    }
    const reqId = ++lastReq.current
    setLoading(true)
    setErr('')
    const t = setTimeout(() => {
      void (async () => {
        const isUuid = isUuidLike(query)
        const base = supabase
          .from('words')
          .select('id,word,translation,slow_audio_url,fast_audio_url')
          .limit(25)
        const res = isUuid
          ? await base.eq('id', query)
          : searchMode === 'oromo'
            ? await base.ilike('word', `%${query}%`)
            : await base.or(`word.ilike.%${query}%,translation.ilike.%${query}%`)
        if (reqId !== lastReq.current) return
        setLoading(false)
        if (res.error) {
          setErr(res.error.message)
          setRows([])
          return
        }
        setRows(((res.data as WordBankRow[] | null) ?? []).filter((r) => typeof r?.id === 'string'))
      })()
    }, 250)
    return () => clearTimeout(t)
  }, [q, searchMode])

  return (
    <View style={styles.wordPicker}>
      <Text style={styles.label}>{label}</Text>
      {value ? <Text style={styles.wordPicked}>{wordLabel(value)}</Text> : <Text style={styles.wordNone}>None</Text>}
      <TextInput
        style={styles.input}
        value={q}
        onChangeText={setQ}
        placeholder={placeholder}
        placeholderTextColor="#52525b"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {loading ? <Text style={styles.hint}>Searching…</Text> : null}
      {err ? <Text style={styles.jsonErr}>{err}</Text> : null}
      {rows.length ? (
        <View style={styles.wordResults}>
          {rows.map((r) => (
            <Pressable
              key={r.id}
              style={styles.wordResultRow}
              onPress={() => {
                onPick(r)
                setQ('')
                setRows([])
              }}
            >
              <View style={styles.wordResultTextCol}>
                <Text style={styles.wordResultTextTop}>{rowAfaanText(r) || r.id}</Text>
                {rowTranslationText(r) ? (
                  <Text style={styles.wordResultTextSub}>{rowTranslationText(r)}</Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function cloneScreen(s: LessonScreen): LessonScreen {
  return JSON.parse(JSON.stringify(s)) as LessonScreen
}

export function LessonScreenEditModal({
  visible,
  screen,
  lessonScreens = [],
  onClose,
  onApply,
}: Props) {
  const [draft, setDraft] = useState<LessonScreen | null>(null)
  const [jsonFallback, setJsonFallback] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [quizCorrectOpen, setQuizCorrectOpen] = useState(false)
  const [patternCorrectOpen, setPatternCorrectOpen] = useState(false)
  const draftRef = useRef<LessonScreen | null>(null)
  draftRef.current = draft

  useEffect(() => {
    if (visible && screen) {
      const c = cloneScreen(screen)
      setDraft(c)
      try {
        setJsonFallback(JSON.stringify(c.content, null, 2))
      } catch {
        setJsonFallback('{}')
      }
      setJsonError('')
    }
  }, [visible, screen])

  if (!visible || !screen || !draft) return null

  const applyJsonFallback = () => {
    try {
      const parsed = JSON.parse(jsonFallback) as Record<string, unknown>
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setJsonError('Content must be a JSON object.')
        return
      }
      setJsonError('')
      const d = draftRef.current
      if (!d) return
      onApply({ type: d.type, content: parsed })
      onClose()
    } catch {
      setJsonError('Invalid JSON.')
    }
  }

  const saveStructured = (content: Record<string, unknown>) => {
    const d = draftRef.current
    if (!d) return
    onApply({ type: d.type, content })
    onClose()
  }

  const structuredForm = () => {
    const c = draft.content
    const setContent = (next: Record<string, unknown>) => setDraft({ ...draft, content: next })

    switch (draft.type) {
      case 'intro':
        return (
          <View style={styles.form}>
            <Field label="Goal" value={String(c.goal ?? '')} onChangeText={(t) => setContent({ ...c, goal: t })} />
            <Field label="Heading (optional)" value={String(c.heading ?? '')} onChangeText={(t) => setContent({ ...c, heading: t })} />
            <Field label="Body (optional)" value={String(c.body ?? '')} multiline onChangeText={(t) => setContent({ ...c, body: t })} />
            <SaveRow
              onPress={() => {
                const d = draftRef.current
                if (!d) return
                const next = { ...(d.content as Record<string, unknown>) }
                if (typeof next.goal !== 'string') next.goal = String(next.goal ?? '')
                saveStructured(next)
              }}
            />
          </View>
        )
      case 'concept': {
        const bulletsArr = Array.isArray(c.bullets) ? (c.bullets as string[]) : null
        const hasLegacySections = Array.isArray(c.sections)
        const isBulletsFormat = Array.isArray(bulletsArr)
        const bullets = isBulletsFormat ? bulletsArr : ['']
        const setBullets = (next: string[]) => setContent({ ...c, bullets: next })

        const moveBullet = (idx: number, dir: -1 | 1) => {
          const j = idx + dir
          if (j < 0 || j >= bullets.length) return
          const next = [...bullets]
          ;[next[idx], next[j]] = [next[j], next[idx]]
          setBullets(next)
        }

        const removeBullet = (idx: number) => {
          if (bullets.length <= 1) return
          setBullets(bullets.filter((_, i) => i !== idx))
        }

        const addBullet = () => setBullets([...bullets, ''])

        const convertLegacyToBullets = () => {
          const parts: string[] = []
          if (typeof c.heading === 'string') parts.push(c.heading)
          if (typeof c.title === 'string' && !parts.length) parts.push(c.title)
          const heading = parts[0] ?? 'Concept'

          const sections = Array.isArray(c.sections) ? (c.sections as Record<string, unknown>[]) : []
          const converted = sections
            .map((s) => {
              const t = typeof s.title === 'string' ? s.title : ''
              const body = typeof s.content === 'string' ? s.content : typeof s.text === 'string' ? s.text : ''
              const both = [t, body].filter(Boolean).join(' — ')
              return both.trim()
            })
            .filter(Boolean)

          setContent({
            heading,
            bullets: converted.length ? converted : [''],
            note: typeof c.note === 'string' ? c.note : undefined,
          })
        }

        return (
          <View style={styles.form}>
            {!isBulletsFormat && hasLegacySections ? (
              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>This concept uses an older format (sections[])</Text>
                <Text style={styles.warningBody}>
                  The visual editor expects bullets format. You can convert it (and still edit JSON below if needed).
                </Text>
                <Pressable style={styles.convertBtn} onPress={convertLegacyToBullets}>
                  <Text style={styles.convertBtnText}>Convert to bullets format</Text>
                </Pressable>
              </View>
            ) : null}

            <Field
              label="Heading"
              value={String(c.heading ?? c.title ?? '')}
              onChangeText={(t) => setContent({ ...c, heading: t, title: t })}
            />
            <Text style={styles.label}>Bullets</Text>
            {bullets.map((b, i) => (
              <View key={i} style={styles.bulletRow}>
                <TextInput
                  style={styles.bulletInput}
                  value={String(b ?? '')}
                  onChangeText={(t) => {
                    const next = bullets.map((x, j) => (j === i ? t : x))
                    setBullets(next)
                  }}
                  placeholder={`Bullet ${i + 1}`}
                  placeholderTextColor="#52525b"
                />
                <Pressable
                  style={styles.bulletMiniBtn}
                  onPress={() => moveBullet(i, -1)}
                  disabled={i === 0}
                >
                  <Text style={[styles.bulletMiniBtnText, i === 0 && styles.bulletMiniDisabled]}>↑</Text>
                </Pressable>
                <Pressable
                  style={styles.bulletMiniBtn}
                  onPress={() => moveBullet(i, 1)}
                  disabled={i === bullets.length - 1}
                >
                  <Text
                    style={[
                      styles.bulletMiniBtnText,
                      i === bullets.length - 1 && styles.bulletMiniDisabled,
                    ]}
                  >
                    ↓
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.bulletMiniBtn}
                  onPress={() => removeBullet(i)}
                  disabled={bullets.length <= 1}
                >
                  <Text
                    style={[
                      styles.bulletMiniBtnTextDanger,
                      bullets.length <= 1 && styles.bulletMiniDisabled,
                    ]}
                  >
                    ✕
                  </Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.addBtn} onPress={addBullet}>
              <Text style={styles.addBtnText}>+ Add bullet</Text>
            </Pressable>
            <Field label="Note (optional)" value={String(c.note ?? '')} multiline onChangeText={(t) => setContent({ ...c, note: t })} />
            <SaveRow
              onPress={() => {
                const cleaned = bullets.map((x) => String(x ?? '').trim()).filter(Boolean)
                if (cleaned.length < 1) {
                  setJsonError('Concept needs at least 1 bullet.')
                  return
                }
                setJsonError('')
                saveStructured({ ...draft.content, bullets: cleaned })
              }}
            />
          </View>
        )
      }
      case 'dialogue': {
        const dd = (c.dialogueData as Record<string, unknown> | undefined) ?? {}
        let people = (dd.people as Record<string, unknown>[] | undefined) ?? []
        if (!Array.isArray(people) || people.length === 0) {
          people = [{ name: 'A', lines: [''] }]
        }
        const updatePerson = (i: number, patch: Record<string, unknown>) => {
          const next = people.map((p, j) => (j === i ? { ...p, ...patch } : p))
          setContent({ ...c, dialogueData: { ...dd, people: next } })
        }
        const addPerson = () => {
          setContent({ ...c, dialogueData: { ...dd, people: [...people, { name: '', lines: [''] }] } })
        }
        const removePerson = (i: number) => {
          if (people.length <= 1) return
          setContent({ ...c, dialogueData: { ...dd, people: people.filter((_, j) => j !== i) } })
        }
        return (
          <View style={styles.form}>
            {people.map((p, i) => (
              <View key={i} style={styles.personCard}>
                <Text style={styles.personTitle}>Speaker {i + 1}</Text>
                <Field
                  label="Name"
                  value={String(p.name ?? '')}
                  onChangeText={(t) => updatePerson(i, { name: t })}
                />
                <Field
                  label="Lines (one per line)"
                  value={Array.isArray(p.lines) ? (p.lines as string[]).join('\n') : ''}
                  multiline
                  onChangeText={(t) =>
                    updatePerson(i, {
                      lines: t.split('\n').length ? t.split('\n') : [''],
                    })
                  }
                />
                <Field
                  label="Translations (optional, one per line)"
                  value={Array.isArray(p.translations) ? (p.translations as string[]).join('\n') : ''}
                  multiline
                  onChangeText={(t) =>
                    updatePerson(i, {
                      translations: t.split('\n').map((x) => x.trim() || null),
                    })
                  }
                />
                <Pressable style={styles.removeBtn} onPress={() => removePerson(i)}>
                  <Text style={styles.removeBtnText}>Remove speaker</Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.addBtn} onPress={addPerson}>
              <Text style={styles.addBtnText}>+ Add speaker</Text>
            </Pressable>
            <SaveRow onPress={() => saveStructured({ ...draft.content })} />
          </View>
        )
      }
      case 'match': {
        let pairs = (c.pairs as Record<string, unknown>[] | undefined) ?? []
        if (!Array.isArray(pairs) || pairs.length === 0) pairs = [{ left: '', right: '' }]
        const setPairs = (next: Record<string, unknown>[]) => setContent({ ...c, pairs: next })
        return (
          <View style={styles.form}>
            {pairs.map((p, i) => (
              <View key={i} style={styles.pairCard}>
                <Text style={styles.personTitle}>Pair {i + 1}</Text>
                {String(p.left ?? '').trim() ? (
                  <View style={styles.matchSelectedBox}>
                    <Text style={styles.matchSelectedTop}>{String(p.left ?? '').trim()}</Text>
                    <Text style={styles.matchSelectedSub}>{String(p.right ?? '').trim() || '—'}</Text>
                  </View>
                ) : (
                  <>
                    <WordBankPicker
                      label="Word (Oromo)"
                      value={null}
                      onPick={(row) => {
                        const next = pairs.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                word_id: row.id,
                                left_word_id: row.id,
                                left: rowAfaanText(row),
                                right: rowTranslationText(row),
                              }
                            : x,
                        )
                        setPairs(next)
                        setContent({ ...c, pairs: next })
                      }}
                      placeholder="Search Oromo word…"
                      searchMode="oromo"
                    />
                    <Text style={styles.matchRightPreviewLabel}>Right option (English)</Text>
                    <Text style={styles.matchRightPreview}>—</Text>
                  </>
                )}
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => {
                    if (pairs.length <= 1) return
                    const next = pairs.filter((_, j) => j !== i)
                    setContent({ ...c, pairs: next })
                  }}
                >
                  <Text style={styles.removeBtnText}>Remove pair</Text>
                </Pressable>
              </View>
            ))}
            <Pressable
              style={styles.addBtn}
              onPress={() => setContent({ ...c, pairs: [...pairs, { left: '', right: '' }] })}
            >
              <Text style={styles.addBtnText}>+ Add pair</Text>
            </Pressable>
            <SaveRow onPress={() => saveStructured({ ...draft.content })} />
          </View>
        )
      }
      case 'quiz': {
        let questions = (c.questions as Record<string, unknown>[] | undefined) ?? []
        if (!Array.isArray(questions) || questions.length === 0) {
          if (typeof c.question === 'string') {
            questions = [
              {
                question: c.question,
                options: Array.isArray(c.options) ? c.options : ['', ''],
                correctAnswer: typeof c.correctAnswer === 'number' ? c.correctAnswer : 0,
              },
            ]
          } else {
            questions = [{ question: '', options: ['', ''], correctAnswer: 0 }]
          }
        }
        const q0 = questions[0] ?? { question: '', options: ['', ''], correctAnswer: 0 }
        const optionsRaw = Array.isArray(q0.options) ? (q0.options as unknown[]) : []
        const options: QuizOptionDraft[] = optionsRaw
          .map((o) => {
            if (typeof o === 'string') return { text: o, english: '' }
            if (o && typeof o === 'object' && !Array.isArray(o)) {
              const ro = o as Record<string, unknown>
              const ar = ro.audioRef
              return {
                text: typeof ro.text === 'string' ? ro.text : String(ro.text ?? ''),
                english: typeof ro.english === 'string' ? ro.english : '',
                word_id: typeof ro.word_id === 'string' ? ro.word_id : undefined,
                audioRef: typeof ar === 'string' && ar.trim() ? ar.trim() : undefined,
              }
            }
            return { text: String(o ?? ''), english: '' }
          })
          .filter((x) => x.text.trim() !== '')
        const correctIdx = typeof q0.correctAnswer === 'number' ? q0.correctAnswer : 0
        const correctLabel = options[correctIdx]?.text?.trim() || (options.length ? `Option ${correctIdx + 1}` : '—')
        return (
          <View style={styles.form}>
            <Field label="Question" value={String(q0.question ?? '')} multiline onChangeText={(t) => {
              questions = [{ ...q0, question: t }]
              setContent({ ...c, questions })
            }} />
            <Text style={styles.label}>Options (pick from word bank)</Text>
            <Text style={styles.hint}>Search Oromo; English shows for context. No custom options.</Text>
            {options.map((opt, i) => (
              <View key={`${opt.word_id ?? opt.text}-${i}`} style={styles.quizOptionCard}>
                <View style={styles.quizOptionTextCol}>
                  <Text style={styles.quizOptionTop}>{opt.text}</Text>
                  {opt.english?.trim() ? <Text style={styles.quizOptionSub}>{opt.english.trim()}</Text> : null}
                  {opt.audioRef?.trim() ? (
                    <Text style={styles.quizOptionAudioHint}>Audio from word bank</Text>
                  ) : null}
                </View>
                <Pressable
                  style={styles.quizOptionRemoveBtn}
                  onPress={() => {
                    const nextOpts = options.filter((_, j) => j !== i).map((x) => ({ ...x }))
                    const serial = nextOpts.map(serializeQuizOption)
                    const nextCorrect = Math.max(0, Math.min(correctIdx, Math.max(0, serial.length - 1)))
                    const hasAudio = nextOpts.some((x) => Boolean(x.audioRef?.trim()))
                    questions = [
                      {
                        ...q0,
                        options: serial.length ? serial : [{ text: '', english: '' }, { text: '', english: '' }],
                        correctAnswer: nextCorrect,
                      },
                    ]
                    setContent({ ...c, questions, audioOptions: hasAudio })
                  }}
                >
                  <Text style={styles.quizOptionRemoveText}>Remove</Text>
                </Pressable>
              </View>
            ))}
            <WordBankPicker
              label="Add option (Oromo)"
              value={null}
              onPick={(row) => {
                const ar = audioRefFromWordRow(row)
                const nextOpts: QuizOptionDraft[] = [
                  ...options,
                  {
                    text: rowAfaanText(row),
                    english: rowTranslationText(row),
                    word_id: row.id,
                    ...(ar ? { audioRef: ar } : {}),
                  },
                ]
                const serial = nextOpts.map(serializeQuizOption)
                const nextCorrect = Math.max(0, Math.min(correctIdx, serial.length - 1))
                const hasAudio = nextOpts.some((x) => Boolean(x.audioRef?.trim()))
                questions = [{ ...q0, options: serial, correctAnswer: nextCorrect }]
                setContent({ ...c, questions, audioOptions: hasAudio })
              }}
              placeholder="Search Oromo word…"
              searchMode="oromo"
            />
            <Pressable
              style={styles.quizCorrectBtn}
              onPress={() => setQuizCorrectOpen(true)}
              disabled={options.length < 2}
            >
              <Text style={styles.quizCorrectBtnLabel}>Correct answer</Text>
              <Text style={styles.quizCorrectBtnValue}>{correctLabel}</Text>
            </Pressable>
            <Field label="Explanation (optional)" value={String(q0.explanation ?? '')} multiline onChangeText={(t) => {
              questions = [{ ...q0, explanation: t }]
              setContent({ ...c, questions })
            }} />
            <SaveRow
              onPress={() =>
                saveStructured(quizContentWithAudioOptionsFlag({ ...(draft.content as Record<string, unknown>) }))
              }
            />

            <Modal visible={quizCorrectOpen} transparent animationType="fade" onRequestClose={() => setQuizCorrectOpen(false)}>
              <Pressable style={styles.quizCorrectOverlay} onPress={() => setQuizCorrectOpen(false)}>
                <Pressable style={styles.quizCorrectSheet} onPress={() => {}}>
                  <Text style={styles.personTitle}>Select correct answer</Text>
                  {options.length < 2 ? (
                    <Text style={styles.hint}>Add at least 2 options first.</Text>
                  ) : (
                    options.map((opt, idx) => (
                      <Pressable
                        key={`${opt.word_id ?? opt.text}-${idx}`}
                        style={styles.quizCorrectChoice}
                        onPress={() => {
                          questions = [{ ...q0, correctAnswer: idx }]
                          setContent({ ...c, questions })
                          setQuizCorrectOpen(false)
                        }}
                      >
                        <Text style={styles.quizCorrectChoiceText}>
                          {idx === correctIdx ? '✓ ' : ''}
                          {opt.text}
                        </Text>
                        {opt.english?.trim() ? <Text style={styles.quizCorrectChoiceSub}>{opt.english.trim()}</Text> : null}
                      </Pressable>
                    ))
                  )}
                </Pressable>
              </Pressable>
            </Modal>
          </View>
        )
      }
      case 'speakingPractice':
        return (
          <View style={styles.form}>
            {String(c.prompt ?? c.phrase ?? '').trim() ? (
              <View style={styles.matchSelectedBox}>
                <Text style={styles.matchSelectedTop}>{String(c.prompt ?? c.phrase ?? '').trim()}</Text>
                <Text style={styles.matchSelectedSub}>{String(c.expectedAnswer ?? c.phraseEnglish ?? '').trim() || '—'}</Text>
                <Pressable
                  style={styles.changeWordBtn}
                  onPress={() =>
                    setContent({
                      ...c,
                      speaking_word_id: null,
                      prompt: '',
                      phrase: '',
                      expectedAnswer: '',
                      phraseEnglish: '',
                    })
                  }
                >
                  <Text style={styles.changeWordBtnText}>Change word</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <WordBankPicker
                  label="Word (Oromo)"
                  value={null}
                  onPick={(row) =>
                    setContent({
                      ...c,
                      speaking_word_id: row.id,
                      prompt: rowAfaanText(row),
                      phrase: rowAfaanText(row),
                      expectedAnswer: rowTranslationText(row),
                      phraseEnglish: rowTranslationText(row),
                    })
                  }
                  placeholder="Search Oromo word…"
                  searchMode="oromo"
                />
                <Text style={styles.matchRightPreviewLabel}>Translation (English)</Text>
                <Text style={styles.matchRightPreview}>—</Text>
              </>
            )}
            <Field
              label="Hint (optional)"
              value={String(c.hint ?? c.tip ?? '')}
              onChangeText={(t) => setContent({ ...c, hint: t, tip: t })}
            />
            <SaveRow
              onPress={() => {
                const d = draftRef.current
                if (!d) return
                const content = { ...(d.content as Record<string, unknown>) }
                delete content.showAnswerAfterRecording
                saveStructured(content)
              }}
            />
          </View>
        )
      case 'audioExposure': {
        let words = (c.words as Record<string, unknown>[] | undefined) ?? []
        if (!Array.isArray(words) || words.length === 0) words = [{ oromo: '', english: '' }]
        return (
          <View style={styles.form}>
            {words.map((w, i) => (
              <View key={i} style={styles.pairCard}>
                <Text style={styles.personTitle}>Word {i + 1}</Text>
                <Field label="Afaan Oromo" value={String(w.oromo ?? '')} onChangeText={(t) => {
                  const next = words.map((x, j) => (j === i ? { ...x, oromo: t } : x))
                  setContent({ ...c, words: next })
                }} />
                <Field label="Translation" value={String(w.english ?? '')} onChangeText={(t) => {
                  const next = words.map((x, j) => (j === i ? { ...x, english: t } : x))
                  setContent({ ...c, words: next })
                }} />
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => {
                    if (words.length <= 1) return
                    setContent({ ...c, words: words.filter((_, j) => j !== i) })
                  }}
                >
                  <Text style={styles.removeBtnText}>Remove word</Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.addBtn} onPress={() => setContent({ ...c, words: [...words, { oromo: '', english: '' }] })}>
              <Text style={styles.addBtnText}>+ Add word</Text>
            </Pressable>
            <SaveRow
              onPress={() => {
                void (async () => {
                  try {
                    setJsonError('')
                    const current = draftRef.current
                    if (!current) return
                    const c2 = current.content as Record<string, unknown>
                    const ws = (c2.words as Record<string, unknown>[] | undefined) ?? []
                    if (!Array.isArray(ws) || ws.length < 1) throw new Error('Audio exposure needs at least 1 word.')
                    for (const item of ws) {
                      const o = String((item as Record<string, unknown>).oromo ?? '').trim()
                      const e = String((item as Record<string, unknown>).english ?? '').trim()
                      await ensureWordExistsInBank(o, e)
                    }
                    saveStructured({ ...c2 })
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e)
                    setJsonError(msg)
                  }
                })()
              }}
            />
          </View>
        )
      }
      case 'CelebrateScreen': {
        const exposureRows = celebrateExposureWordRows(lessonScreens)
        const learnedPreview = exposureRows.map((r) => r.afaan)
        return (
          <View style={styles.form}>
            <Field label="Message" value={String(c.message ?? '')} multiline onChangeText={(t) => setContent({ ...c, message: t })} />
            <View style={styles.learnedBlock}>
              <Text style={styles.label}>Words shown as learned</Text>
              <Text style={styles.hint}>
                These come from every Audio exposure screen in this lesson (read-only). Edit those screens to change the list.
              </Text>
              {exposureRows.length ? (
                <View style={styles.learnedList}>
                  {exposureRows.map((row) => (
                    <View key={row.afaan} style={styles.learnedReadOnlyRow}>
                      <Text style={styles.learnedText}>{row.afaan}</Text>
                      {row.english ? <Text style={styles.learnedReadOnlySub}>{row.english}</Text> : null}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.hint}>No words yet. Add words on Audio exposure screens in this lesson.</Text>
              )}
            </View>
            <SaveRow
              onPress={() => {
                const d = draftRef.current
                if (!d) return
                const base = { ...(d.content as Record<string, unknown>) }
                delete base.learned_words
                delete base.title
                saveStructured({ ...base, learned: learnedPreview })
              }}
            />
          </View>
        )
      }
      case 'animatedConcept': {
        const bullets = Array.isArray(c.bullets) ? (c.bullets as string[]) : ['']
        const limited = bullets.slice(0, 3)
        const setBullets = (next: string[]) => setContent({ ...c, bullets: next.slice(0, 3) })
        return (
          <View style={styles.form}>
            <Field label="Target word" value={String(c.targetWord ?? '')} onChangeText={(t) => setContent({ ...c, targetWord: t })} />
            <Text style={styles.label}>Bullets (max 3)</Text>
            {limited.map((b, i) => (
              <View key={i} style={styles.bulletRow}>
                <TextInput
                  style={styles.bulletInput}
                  value={String(b ?? '')}
                  onChangeText={(t) => {
                    const next = limited.map((x, j) => (j === i ? t : x))
                    setBullets(next)
                  }}
                  placeholder={`Bullet ${i + 1}`}
                  placeholderTextColor="#52525b"
                />
                <Pressable
                  style={styles.bulletMiniBtn}
                  onPress={() => {
                    if (limited.length <= 1) return
                    setBullets(limited.filter((_, j) => j !== i))
                  }}
                  disabled={limited.length <= 1}
                >
                  <Text
                    style={[
                      styles.bulletMiniBtnTextDanger,
                      limited.length <= 1 && styles.bulletMiniDisabled,
                    ]}
                  >
                    ✕
                  </Text>
                </Pressable>
              </View>
            ))}
            {limited.length < 3 ? (
              <Pressable style={styles.addBtn} onPress={() => setBullets([...limited, ''])}>
                <Text style={styles.addBtnText}>+ Add bullet</Text>
              </Pressable>
            ) : (
              <Text style={styles.hint}>Only the first 3 bullets display in the app.</Text>
            )}
            <SaveRow
              onPress={() => {
                const cleaned = limited.map((x) => String(x ?? '').trim()).filter(Boolean)
                if (cleaned.length < 1) {
                  setJsonError('Animated concept needs at least 1 bullet.')
                  return
                }
                setJsonError('')
                saveStructured({ ...draft.content, bullets: cleaned })
              }}
            />
          </View>
        )
      }
      case 'patternPractice': {
        let exercises = (c.exercises as Record<string, unknown>[] | undefined) ?? []
        if (!Array.isArray(exercises) || exercises.length === 0) {
          exercises = [{ prompt: '', options: [], correctSuffix: '' }]
        }
        const ex0 = { ...(exercises[0] as Record<string, unknown>) }
        const optionsRaw = Array.isArray(ex0.options) ? (ex0.options as unknown[]) : []
        const options = optionsRaw.map(patternOptionString).filter(Boolean)
        const correctSuffix = String(ex0.correctSuffix ?? '').trim()
        const correctOk = Boolean(correctSuffix && options.includes(correctSuffix))

        const setEx0 = (nextEx: Record<string, unknown>) => {
          setContent({ ...c, exercises: [nextEx, ...exercises.slice(1)] })
        }

        return (
          <View style={styles.form}>
            <Field label="Prompt" value={String(ex0.prompt ?? '')} multiline onChangeText={(t) => setEx0({ ...ex0, prompt: t })} />
            <Text style={styles.label}>Options (pick from word bank)</Text>
            <Text style={styles.hint}>Same flow as quiz options, but stored as plain text (no audio).</Text>
            {options.map((opt, i) => (
              <View key={`${opt}-${i}`} style={styles.quizOptionCard}>
                <View style={styles.quizOptionTextCol}>
                  <Text style={styles.quizOptionTop}>{opt}</Text>
                </View>
                <Pressable
                  style={styles.quizOptionRemoveBtn}
                  onPress={() => {
                    const nextOpts = options.filter((_, j) => j !== i)
                    let nextCorrect = String(ex0.correctSuffix ?? '').trim()
                    if (!nextOpts.includes(nextCorrect)) nextCorrect = nextOpts[0] ?? ''
                    setEx0({ ...ex0, options: nextOpts, correctSuffix: nextCorrect })
                  }}
                >
                  <Text style={styles.quizOptionRemoveText}>Remove</Text>
                </Pressable>
              </View>
            ))}
            <WordBankPicker
              label="Add option (Oromo)"
              value={null}
              onPick={(row) => {
                const text = rowAfaanText(row)
                if (!text || options.includes(text)) return
                const nextOpts = [...options, text]
                let nextCorrect = String(ex0.correctSuffix ?? '').trim()
                if (!nextCorrect || !nextOpts.includes(nextCorrect)) nextCorrect = nextOpts[0] ?? ''
                setEx0({ ...ex0, options: nextOpts, correctSuffix: nextCorrect })
              }}
              placeholder="Search Oromo word…"
              searchMode="oromo"
            />
            <Pressable
              style={styles.quizCorrectBtn}
              onPress={() => setPatternCorrectOpen(true)}
              disabled={options.length < 2}
            >
              <Text style={styles.quizCorrectBtnLabel}>Correct answer</Text>
              <Text style={styles.quizCorrectBtnValue}>{correctOk ? correctSuffix : options.length >= 2 ? 'Tap to choose' : '—'}</Text>
            </Pressable>
            <Field
              label="Explanation (optional)"
              value={String(ex0.explanation ?? '')}
              multiline
              onChangeText={(t) => setEx0({ ...ex0, explanation: t })}
            />
            <SaveRow
              onPress={() => {
                setJsonError('')
                const d = draftRef.current
                if (!d) return
                const content = { ...(d.content as Record<string, unknown>) }
                const ex = (content.exercises as Record<string, unknown>[] | undefined) ?? []
                const e0 = ex[0] as Record<string, unknown> | undefined    
                const opts = Array.isArray(e0?.options)
                  ? (e0.options as unknown[]).map(patternOptionString).filter(Boolean)
                  : []
                if (opts.length < 2) {
                  setJsonError('Pattern practice needs at least 2 options.')
                  return
                }
                const cs = String(e0?.correctSuffix ?? '').trim()
                if (!opts.includes(cs)) {
                  setJsonError('Correct answer must be one of the options.')
                  return
                }
                saveStructured(content)
              }}
            />

            <Modal visible={patternCorrectOpen} transparent animationType="fade" onRequestClose={() => setPatternCorrectOpen(false)}>
              <Pressable style={styles.quizCorrectOverlay} onPress={() => setPatternCorrectOpen(false)}>
                <Pressable style={styles.quizCorrectSheet} onPress={() => {}}>
                  <Text style={styles.personTitle}>Select correct answer</Text>
                  {options.length < 2 ? (
                    <Text style={styles.hint}>Add at least 2 options first.</Text>
                  ) : (
                    options.map((opt, idx) => (
                      <Pressable
                        key={`${idx}-${opt}`}
                        style={styles.quizCorrectChoice}
                        onPress={() => {
                          setEx0({ ...ex0, options, correctSuffix: opt })
                          setPatternCorrectOpen(false)
                        }}
                      >
                        <Text style={styles.quizCorrectChoiceText}>
                          {opt === correctSuffix ? '✓ ' : ''}
                          {opt}
                        </Text>
                      </Pressable>
                    ))
                  )}
                </Pressable>
              </Pressable>
            </Modal>
          </View>
        )
      }
      default:
        return null
    }
  }

  const hasStructured = [
    'intro',
    'concept',
    'dialogue',
    'match',
    'quiz',
    'speakingPractice',
    'audioExposure',
    'CelebrateScreen',
    'animatedConcept',
    'patternPractice',
  ].includes(draft.type)

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.modalTitle} numberOfLines={1}>
            {screenTypeTitle(draft.type)}
          </Text>
          <View style={{ width: 56 }} />
        </View>
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.screenHeader}>
            <Text style={styles.screenHeaderTitle}>{screenTypeTitle(draft.type)}</Text>
            <Text style={styles.screenHeaderSubtitle}>
              Adjust inputs below to modify/create screen.
            </Text>
          </View>
          {hasStructured ? (
            structuredForm()
          ) : (
            <Text style={styles.hint}>No simple form for this type yet — edit JSON below.</Text>
          )}
          <Text style={styles.advancedLabel}>Screen content (JSON)</Text>
          {jsonError ? <Text style={styles.jsonErr}>{jsonError}</Text> : null}
          <TextInput
            style={styles.jsonInput}
            multiline
            value={jsonFallback}
            onChangeText={(t) => {
              setJsonFallback(t)
              setJsonError('')
            }}
            textAlignVertical="top"
          />
          <Pressable style={styles.applyJsonBtn} onPress={applyJsonFallback}>
            <Text style={styles.applyJsonText}>Apply JSON & close</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  )
}

function Field(props: {
  label: string
  value: string
  onChangeText: (t: string) => void
  multiline?: boolean
  keyboardType?: 'default' | 'number-pad'
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.multiline && styles.inputMulti]}
        value={props.value}
        onChangeText={props.onChangeText}
        multiline={props.multiline}
        keyboardType={props.keyboardType}
        placeholderTextColor="#52525b"
      />
    </View>
  )
}

function Row(props: { label: string; children: ReactNode }) {
  return (
    <View style={styles.rowSwitch}>
      <Text style={styles.label}>{props.label}</Text>
      {props.children}
    </View>
  )
}

function SaveRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.saveStructured} onPress={onPress}>
      <Text style={styles.saveStructuredTextSave}>Save screen</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: '#0a0a0a' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  modalCancel: { color: '#a78bfa', fontSize: 16, fontWeight: '600' },
  modalTitle: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center' },
  modalScroll: { flex: 1 },
  modalScrollContent: { padding: 16, paddingBottom: 40 },
  screenHeader: { marginBottom: 12 },
  screenHeaderTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'left' },
  screenHeaderSubtitle: { color: '#a1a1aa', fontSize: 13, marginTop: 6, textAlign: 'left', lineHeight: 18 },
  hint: { color: '#a1a1aa', fontSize: 14, marginBottom: 12 },
  form: { marginBottom: 20 },
  field: { marginBottom: 14 },
  label: { color: '#d4d4d8', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
  },
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },
  rowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  personCard: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  personTitle: { color: '#e4e4e7', fontWeight: '700', marginBottom: 8 },
  pairCard: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  removeBtn: { marginTop: 8, alignSelf: 'flex-start' },
  removeBtnText: { color: '#f87171', fontSize: 14, fontWeight: '600' },
  addBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#27272a',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  addBtnText: { color: '#fff', fontWeight: '600' },
  wordPicker: { marginBottom: 14 },
  wordPicked: { color: '#e4e4e7', fontSize: 14, marginBottom: 8 },
  wordNone: { color: '#71717a', fontSize: 14, marginBottom: 8 },
  wordResults: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  wordResultRow: { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#27272a' },
  wordResultTextCol: { gap: 2 },
  wordResultTextTop: { color: '#e4e4e7', fontSize: 14, fontWeight: '700' },
  wordResultTextSub: { color: '#a1a1aa', fontSize: 13 },
  matchRightPreviewLabel: { color: '#d4d4d8', fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  matchRightPreview: {
    color: '#a1a1aa',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 10,
  },
  matchSelectedBox: {
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  matchSelectedTop: { color: '#e4e4e7', fontSize: 15, fontWeight: '800' },
  matchSelectedSub: { color: '#a1a1aa', fontSize: 13, marginTop: 4, lineHeight: 18 },
  changeWordBtn: { marginTop: 10, alignSelf: 'flex-start' },
  changeWordBtnText: { color: '#a78bfa', fontSize: 14, fontWeight: '700' },
  learnedBlock: { marginTop: 8, marginBottom: 6 },
  learnedList: { marginTop: 8, gap: 8 },
  learnedReadOnlyRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    backgroundColor: '#111',
  },
  learnedText: { color: '#e4e4e7', fontSize: 14 },
  learnedReadOnlySub: { color: '#a1a1aa', fontSize: 13, marginTop: 4 },
  quizOptionCard: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  quizOptionTextCol: { flex: 1, minWidth: 0 },
  quizOptionTop: { color: '#e4e4e7', fontSize: 15, fontWeight: '800' },
  quizOptionSub: { color: '#a1a1aa', fontSize: 13, marginTop: 4, lineHeight: 18 },
  quizOptionAudioHint: { color: '#34c759', fontSize: 11, fontWeight: '600', marginTop: 6 },
  quizOptionRemoveBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#27272a' },
  quizOptionRemoveText: { color: '#f87171', fontSize: 13, fontWeight: '800' },
  quizCorrectBtn: {
    marginTop: 8,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3f3f46',
    backgroundColor: '#18181b',
  },
  quizCorrectBtnLabel: { color: '#d4d4d8', fontSize: 13, fontWeight: '700' },
  quizCorrectBtnValue: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 6 },
  quizCorrectOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  quizCorrectSheet: {
    backgroundColor: '#0a0a0a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 14,
  },
  quizCorrectChoice: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    backgroundColor: '#111',
    marginTop: 10,
  },
  quizCorrectChoiceText: { color: '#e4e4e7', fontSize: 14, fontWeight: '800' },
  quizCorrectChoiceSub: { color: '#a1a1aa', fontSize: 13, marginTop: 4, lineHeight: 18 },
  warningBox: {
    backgroundColor: '#2a1a00',
    borderWidth: 1,
    borderColor: '#a16207',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  warningTitle: { color: '#fbbf24', fontSize: 13, fontWeight: '800', marginBottom: 6 },
  warningBody: { color: '#fde68a', fontSize: 12, lineHeight: 16, marginBottom: 10 },
  convertBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#a16207',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  convertBtnText: { color: '#111', fontWeight: '800' },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  bulletInput: {
    flex: 1,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
  },
  bulletMiniBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletMiniBtnText: { color: '#fff', fontWeight: '800' },
  bulletMiniBtnTextDanger: { color: '#f87171', fontWeight: '900' },
  bulletMiniDisabled: { opacity: 0.35 },
  saveStructured: {
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  saveStructuredTextSave: { color: '#0a0a0a', fontWeight: '800', fontSize: 16 },
  advancedLabel: { color: '#fbbf24', fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  jsonInput: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 8,
    padding: 12,
    color: '#e4e4e7',
    fontSize: 12,
    minHeight: 120,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  jsonErr: { color: '#f87171', marginBottom: 8 },
  applyJsonBtn: {
    marginTop: 12,
    backgroundColor: '#7c3aed',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  applyJsonText: { color: '#fff', fontWeight: '700' },
})
