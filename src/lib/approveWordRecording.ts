import supabase from './supabase'

/**
 * Approve a word take and queue waveform extraction (same RMS envelope as Dubbadhu `gen:waveforms`).
 * Run locally or in CI: `npm run compute:word-waveforms` (Dubbadhu repo) — requires ffmpeg + service role in .env.
 */
export function approveWordRecording(wordId: string) {
  return supabase
    .from('words')
    .update({ status: 'approved', waveform_pending: true })
    .eq('id', wordId)
}
