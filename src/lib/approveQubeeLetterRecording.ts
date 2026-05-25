import supabase from './supabase'

export function approveQubeeLetterRecording(letterId: string) {
  return supabase
    .from('qubee_letters')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', letterId)
}
