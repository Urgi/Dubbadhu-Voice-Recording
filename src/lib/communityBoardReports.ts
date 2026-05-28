import supabase from './supabase'

export type CommunityBoardReportRow = {
  report_id: string
  post_id: string
  lesson_id: string | null
  post_message: string
  post_created_at: string
  post_is_deleted: boolean
  post_moderation_status: string | null
  post_hidden_at: string | null
  post_author_first_name: string | null
  reporter_user_id: string
  reporter_first_name: string | null
  report_created_at: string
}

export async function fetchOpenCommunityBoardReportsCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_community_board_open_reports_count')
  if (error) {
    console.warn('[communityBoardReports] count:', error.message)
    return 0
  }
  return typeof data === 'number' ? data : 0
}

export async function fetchOpenCommunityBoardReports(): Promise<{
  data: CommunityBoardReportRow[] | null
  error: string | null
}> {
  const { data, error } = await supabase.rpc('get_community_board_reports_admin')
  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data ?? []) as CommunityBoardReportRow[], error: null }
}

export async function dismissCommunityBoardReport(
  reportId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('dismiss_community_board_report', {
    p_report_id: reportId,
  })
  if (error) return { ok: false, error: error.message }
  const payload = (data ?? {}) as { ok?: boolean; error?: string }
  return payload.ok ? { ok: true } : { ok: false, error: payload.error ?? 'failed' }
}

export async function removeCommunityBoardPostAdmin(
  postId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('remove_community_board_post_admin', {
    p_post_id: postId,
  })
  if (error) return { ok: false, error: error.message }
  const payload = (data ?? {}) as { ok?: boolean; error?: string }
  return payload.ok ? { ok: true } : { ok: false, error: payload.error ?? 'failed' }
}
