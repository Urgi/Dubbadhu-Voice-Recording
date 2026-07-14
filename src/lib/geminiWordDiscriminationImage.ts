import { getExpoPublicGeminiKey } from './expoPublicEnv'
import supabase from './supabase'
import { slugSegment } from './voiceUpload'
import {
  WORD_DISCRIMINATION_SCENE_GEMINI_ASPECT,
  wordDiscriminationScenePromptSuffix,
} from './wordDiscriminationSceneSpec'

/** Image model that returns `inlineData` image parts when `responseModalities` includes IMAGE. */
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image'

const WORD_COMPARISON_IMAGES_BUCKET = 'word-comparison-images'

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = globalThis.atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function buildImagePrompt(userDescription: string): string {
  const d = userDescription.trim()
  return [
    'Generate one single image for a language-learning multiple-choice quiz.',
    'Clear, realistic or clean illustration; suitable for learners; no text, letters, numbers, or watermarks in the image.',
    wordDiscriminationScenePromptSuffix(),
    'Subject and scene:',
    d,
  ].join(' ')
}

type GeminiGenerateBody = {
  candidates?: Array<{
    content?: { parts?: unknown[] }
    finishReason?: string
  }>
  error?: { message?: string; code?: number }
}

function extractFirstImagePart(body: GeminiGenerateBody): { mimeType: string; data: string } | null {
  const candidates = body.candidates
  if (!Array.isArray(candidates)) return null
  for (const c of candidates) {
    const parts = c?.content?.parts
    if (!Array.isArray(parts)) continue
    for (const p of parts) {
      if (!p || typeof p !== 'object' || !('inlineData' in p)) continue
      const id = (p as { inlineData?: { mimeType?: string; data?: string } }).inlineData
      const mime = id?.mimeType?.trim() ?? ''
      const data = id?.data?.trim() ?? ''
      if (mime.startsWith('image/') && data.length > 0) {
        return { mimeType: mime, data }
      }
    }
  }
  return null
}

/** Wide hero for lesson Image screens (matches learner ~16:10 frame; Gemini nearest is 16:9). */
export const LESSON_IMAGE_SCREEN_GEMINI_ASPECT = '16:9' as const
export const LESSON_IMAGE_SCREEN_PREVIEW_ASPECT = 16 / 9

async function requestGeminiImage(
  apiKey: string,
  prompt: string,
  aspectRatio: string = WORD_DISCRIMINATION_SCENE_GEMINI_ASPECT,
): Promise<{ mimeType: string; data: string } | { error: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio,
          },
        },
      }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: msg || 'Network error calling Gemini' }
  }

  let body: GeminiGenerateBody
  try {
    body = (await res.json()) as GeminiGenerateBody
  } catch {
    return { error: `Gemini returned non-JSON (HTTP ${res.status})` }
  }

  if (!res.ok) {
    const apiMsg = body?.error?.message?.trim()
    return { error: apiMsg || `Gemini error (HTTP ${res.status})` }
  }

  const image = extractFirstImagePart(body)
  if (!image) {
    return {
      error:
        'No image in the model response (safety block or unsupported output). Try a different description or check the Gemini model is enabled for your API key.',
    }
  }
  return image
}

export type WordDiscriminationImageDraft = {
  mimeType: string
  base64: string
  dataUrl: string
}

/**
 * Generate an image draft with Gemini, but do NOT upload it yet.
 * This lets the user preview and decide whether to use it (and only then upload/insert).
 */
export async function generateWordDiscriminationImageDraft(
  userDescription: string,
): Promise<WordDiscriminationImageDraft | { error: string }> {
  const apiKey = getExpoPublicGeminiKey().trim()
  if (!apiKey) {
    return { error: 'Missing EXPO_PUBLIC_GEMINI_API_KEY. Add it to .env and restart Metro.' }
  }

  const prompt = buildImagePrompt(userDescription)
  const gen = await requestGeminiImage(apiKey, prompt)
  if ('error' in gen) return gen

  const mimeType = gen.mimeType.trim()
  const base64 = gen.data.trim()
  if (!mimeType.startsWith('image/') || !base64) {
    return { error: 'Gemini returned an invalid image payload.' }
  }

  // React Native <Image> can preview base64 via a data URL.
  const dataUrl = `data:${mimeType};base64,${base64}`
  return { mimeType, base64, dataUrl }
}

/** Safe storage file base name (no extension, no folder). */
export function wordDiscriminationImageStorageBaseName(raw: string): string {
  return slugSegment(raw.trim(), 80) || 'image'
}

/**
 * Upload a previously generated draft image to public `word-comparison-images` storage.
 * This is the "insert" step (storage.objects) and should only happen after user confirmation.
 */
export async function uploadWordDiscriminationImageDraft(
  draft: Pick<WordDiscriminationImageDraft, 'mimeType' | 'base64'>,
  storageBaseName: string,
): Promise<{ publicUrl: string } | { error: string }> {
  let bytes: Uint8Array
  try {
    bytes = base64ToUint8Array(draft.base64)
  } catch {
    return { error: 'Could not decode image data for upload.' }
  }
  if (bytes.length === 0) {
    return { error: 'Decoded image was empty.' }
  }

  const base = wordDiscriminationImageStorageBaseName(storageBaseName)
  if (!base) {
    return { error: 'Enter a file name (letters, numbers, underscores).' }
  }

  const mime = draft.mimeType.trim().toLowerCase()
  const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png'
  const contentType = ext === 'jpg' ? 'image/jpeg' : 'image/png'
  const path = `${base}.${ext}`

  const { error: upErr } = await supabase.storage
    .from(WORD_COMPARISON_IMAGES_BUCKET)
    .upload(path, bytes, { contentType, upsert: false })

  if (upErr) {
    const hint =
      upErr.message.toLowerCase().includes('row-level security') ||
      upErr.message.toLowerCase().includes('policy')
        ? ' Add an INSERT policy on storage.objects for bucket word-comparison-images (see sql/storage_word_comparison_images_anon_upload.sql).'
        : ''
    return { error: `${upErr.message}.${hint}` }
  }

  const { data } = supabase.storage.from(WORD_COMPARISON_IMAGES_BUCKET).getPublicUrl(path)
  const publicUrl = data.publicUrl?.trim()
  if (!publicUrl) {
    return { error: 'Upload succeeded but public URL was missing.' }
  }
  return { publicUrl }
}

/**
 * Generate a quiz image with Gemini and upload it to public `word-comparison-images` storage.
 * Requires `EXPO_PUBLIC_GEMINI_API_KEY` and Supabase storage INSERT policy for this bucket (see sql/).
 */
export async function generateAndUploadWordDiscriminationImage(
  userDescription: string,
  storageBaseName?: string,
): Promise<{ publicUrl: string } | { error: string }> {
  const draft = await generateWordDiscriminationImageDraft(userDescription)
  if ('error' in draft) return draft
  const base =
    storageBaseName?.trim() ||
    wordDiscriminationImageStorageBaseName(userDescription)
  return await uploadWordDiscriminationImageDraft(draft, base)
}

function buildLessonImageScreenPrompt(userDescription: string): string {
  const d = userDescription.trim()
  return [
    'Generate one single image for a language-learning lesson hero screen.',
    'Clear, warm, educational illustration or photo-realistic scene; suitable for adult language learners;',
    'no text, letters, numbers, logos, or watermarks in the image.',
    'Composition: wide landscape 16:9 frame for a mobile lesson hero; one clear focal subject; simple uncluttered background.',
    'Subject and scene:',
    d,
  ].join(' ')
}

/**
 * Generate a lesson Image-screen draft with Gemini (preview only; not uploaded yet).
 */
export async function generateLessonImageScreenDraft(
  userDescription: string,
): Promise<WordDiscriminationImageDraft | { error: string }> {
  const apiKey = getExpoPublicGeminiKey().trim()
  if (!apiKey) {
    return { error: 'Missing EXPO_PUBLIC_GEMINI_API_KEY. Add it to .env and restart Metro.' }
  }

  const prompt = buildLessonImageScreenPrompt(userDescription)
  const gen = await requestGeminiImage(apiKey, prompt, LESSON_IMAGE_SCREEN_GEMINI_ASPECT)
  if ('error' in gen) return gen

  const mimeType = gen.mimeType.trim()
  const base64 = gen.data.trim()
  if (!mimeType.startsWith('image/') || !base64) {
    return { error: 'Gemini returned an invalid image payload.' }
  }

  const dataUrl = `data:${mimeType};base64,${base64}`
  return { mimeType, base64, dataUrl }
}

/**
 * Upload a lesson Image-screen draft under `lesson-screen/` in `word-comparison-images`.
 */
export async function uploadLessonImageScreenDraft(
  draft: Pick<WordDiscriminationImageDraft, 'mimeType' | 'base64'>,
  storageBaseName: string,
): Promise<{ publicUrl: string } | { error: string }> {
  let bytes: Uint8Array
  try {
    bytes = base64ToUint8Array(draft.base64)
  } catch {
    return { error: 'Could not decode image data for upload.' }
  }
  if (bytes.length === 0) {
    return { error: 'Decoded image was empty.' }
  }

  const base = wordDiscriminationImageStorageBaseName(storageBaseName)
  if (!base) {
    return { error: 'Enter a file name (letters, numbers, underscores).' }
  }

  const mime = draft.mimeType.trim().toLowerCase()
  const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png'
  const contentType = ext === 'jpg' ? 'image/jpeg' : 'image/png'
  const path = `lesson-screen/${base}.${ext}`

  const { error: upErr } = await supabase.storage
    .from(WORD_COMPARISON_IMAGES_BUCKET)
    .upload(path, bytes, { contentType, upsert: false })

  if (upErr) {
    const hint =
      upErr.message.toLowerCase().includes('row-level security') ||
      upErr.message.toLowerCase().includes('policy')
        ? ' Add an INSERT policy on storage.objects for bucket word-comparison-images (see sql/storage_word_comparison_images_anon_upload.sql).'
        : ''
    return { error: `${upErr.message}.${hint}` }
  }

  const { data } = supabase.storage.from(WORD_COMPARISON_IMAGES_BUCKET).getPublicUrl(path)
  const publicUrl = data.publicUrl?.trim()
  if (!publicUrl) {
    return { error: 'Upload succeeded but public URL was missing.' }
  }
  return { publicUrl }
}
