import supabase from './supabase'

export function approveFidelLetterRecording(letterId: string) {
  return supabase
    .from('fidel_letters')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', letterId)
}
