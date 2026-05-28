import supabase from './supabase'

export type DiscussionReviewQueueRow = {
  queue_id: string
  user_id: string
  lesson_id: string
  message: string
  lesson_prompt: string | null
  is_anonymous: boolean
  moderation_result: Record<string, unknown>
  created_at: string
  author_first_name: string | null
}

export async function fetchPendingDiscussionReviewCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_discussion_review_queue_pending_count')
  if (error) {
    console.warn('[discussionReviewQueue] count:', error.message)
    return 0
  }
  return typeof data === 'number' ? data : 0
}

export async function fetchPendingDiscussionReviews(): Promise<{
  data: DiscussionReviewQueueRow[] | null
  error: string | null
}> {
  const { data, error } = await supabase.rpc('get_discussion_review_queue_admin')
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as DiscussionReviewQueueRow[], error: null }
}

export async function approveDiscussionReview(
  queueId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('approve_discussion_review_queue_item', {
    p_queue_id: queueId,
  })
  if (error) return { ok: false, error: error.message }
  const payload = (data ?? {}) as { ok?: boolean; error?: string }
  return payload.ok ? { ok: true } : { ok: false, error: payload.error ?? 'failed' }
}

export async function rejectDiscussionReview(
  queueId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('reject_discussion_review_queue_item', {
    p_queue_id: queueId,
  })
  if (error) return { ok: false, error: error.message }
  const payload = (data ?? {}) as { ok?: boolean; error?: string }
  return payload.ok ? { ok: true } : { ok: false, error: payload.error ?? 'failed' }
}
