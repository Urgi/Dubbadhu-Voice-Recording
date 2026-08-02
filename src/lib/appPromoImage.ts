import * as FileSystem from 'expo-file-system/legacy'

import supabase from './supabase'

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = globalThis.atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export const APP_PROMO_IMAGES_BUCKET = 'app-promo-images'

/** Aspect for admin picker (tall promo card image). */
export const APP_PROMO_IMAGE_ASPECT: [number, number] = [4, 5]

export async function uploadAppPromoImage(
  localUri: string,
  promoId: string,
): Promise<{ publicUrl: string } | { error: string }> {
  const safeId = promoId.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'draft'
  const path = `${safeId.toLowerCase()}/promo.jpg`
  try {
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
    const { error: upErr } = await supabase.storage
      .from(APP_PROMO_IMAGES_BUCKET)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true })
    if (upErr) return { error: upErr.message }
    const { data } = supabase.storage.from(APP_PROMO_IMAGES_BUCKET).getPublicUrl(path)
    return { publicUrl: `${data.publicUrl}?t=${Date.now()}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: msg }
  }
}
