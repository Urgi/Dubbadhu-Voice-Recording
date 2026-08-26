import * as FileSystem from 'expo-file-system/legacy'

import supabase from './supabase'

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = globalThis.atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Speak tab locked-series strip — keep `DISPLAY_SQUASH` in sync with Dubbadhu
 * `features/LessonTab/seriesCoverAssets.js` (`SERIES_LIST_COVER_DISPLAY_SQUASH`).
 */
export const SERIES_LIST_COVER_ASPECT_WIDTH = 961
export const SERIES_LIST_COVER_ASPECT_HEIGHT = 726

export const SERIES_LIST_COVER_DISPLAY_SQUASH = 1.1

/** Width÷height of the learner strip + admin preview (not the legacy bundled 961∶726 PNG ratio alone). */
export const SERIES_LIST_COVER_DISPLAY_ASPECT_RATIO =
  (SERIES_LIST_COVER_ASPECT_WIDTH / SERIES_LIST_COVER_ASPECT_HEIGHT) *
  SERIES_LIST_COVER_DISPLAY_SQUASH

const SERIES_LIST_COVER_PICKER_HEIGHT = Math.round(
  SERIES_LIST_COVER_ASPECT_HEIGHT / SERIES_LIST_COVER_DISPLAY_SQUASH,
)

/** expo-image-picker `aspect` — same frame as learner strip (WYSIWYG vs preview). */
export const SERIES_LIST_COVER_ASPECT: [number, number] = [
  SERIES_LIST_COVER_ASPECT_WIDTH,
  SERIES_LIST_COVER_PICKER_HEIGHT,
]

export const SERIES_LIST_COVERS_BUCKET = 'series-list-covers'

export async function uploadSeriesListCoverImage(
  localUri: string,
  seriesId: string,
): Promise<{ publicUrl: string } | { error: string }> {
  const safeId = seriesId.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  /** Match learner/catalog ids (`series1`, …) — avoids duplicate `Series1` vs `series1` objects in Storage. */
  const folder = safeId.toLowerCase()
  const path = `${folder}/list-cover.jpg`
  return uploadSeriesCoverJpeg(localUri, path)
}

export async function uploadSeriesHomeCoverImage(
  localUri: string,
  seriesId: string,
): Promise<{ publicUrl: string } | { error: string }> {
  const safeId = seriesId.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  const folder = safeId.toLowerCase()
  const path = `${folder}/home-cover.jpg`
  return uploadSeriesCoverJpeg(localUri, path)
}

async function uploadSeriesCoverJpeg(
  localUri: string,
  path: string,
): Promise<{ publicUrl: string } | { error: string }> {
  try {
    /** RN `fetch(file://…)` often yields an empty `Blob` — read bytes via expo-file-system instead. */
    const b64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    if (!b64?.length) {
      return { error: 'Could not read the image file (empty). Try choosing the photo again.' }
    }
    const bytes = base64ToUint8Array(b64)
    if (bytes.length === 0) {
      return { error: 'Image data was empty after reading the file.' }
    }
    const contentType = 'image/jpeg'
    const { error: upErr } = await supabase.storage
      .from(SERIES_LIST_COVERS_BUCKET)
      .upload(path, bytes, { contentType, upsert: true })
    if (upErr) return { error: upErr.message }
    const { data } = supabase.storage.from(SERIES_LIST_COVERS_BUCKET).getPublicUrl(path)
    return { publicUrl: data.publicUrl }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: msg }
  }
}
