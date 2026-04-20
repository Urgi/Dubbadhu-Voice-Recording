/**
 * Re-run `sanitizeLessonScreensForSave` on every lesson (same rules as admin save).
 * Strips redundant keys / values that match learner defaults so `lessons.content` is smaller.
 *
 * Env: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (recommended; anon often cannot update all rows).
 * Loads `Dubbadhu/.env` when present (ecosystem layout).
 *
 * Dry-run (default): `npx tsx scripts/prune-lesson-json-defaults.ts`
 * Apply updates:        `npx tsx scripts/prune-lesson-json-defaults.ts --write`
 */
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { sanitizeLessonScreensForSave, type LessonScreen } from '../src/lib/lessonEditor'

function loadEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!fs.existsSync(filePath)) return out
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 1) continue
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[t.slice(0, eq).trim()] = v
  }
  return out
}

async function main() {
  const write = process.argv.includes('--write')
  const here = path.dirname(fileURLToPath(import.meta.url))
  const vrRoot = path.join(here, '..')
  const ecoRoot = path.join(vrRoot, '..')
  const env = {
    ...loadEnvFile(path.join(ecoRoot, 'Dubbadhu', '.env')),
    ...process.env,
  } as Record<string, string | undefined>
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY')
    process.exit(1)
  }
  if (!write) {
    console.error('Dry-run: no DB writes. Pass --write to apply changes.\n')
  }

  const supabase = createClient(url, key)
  let offset = 0
  const page = 100
  let examined = 0
  let changed = 0
  let updated = 0

  for (;;) {
    const { data: rows, error } = await supabase
      .from('lessons')
      .select('id, content')
      .order('id', { ascending: true })
      .range(offset, offset + page - 1)
    if (error) throw error
    if (!rows?.length) break

    for (const row of rows) {
      examined += 1
      const id = String(row.id ?? '')
      const content = row.content
      if (content == null || typeof content !== 'object' || Array.isArray(content)) continue
      const c = content as Record<string, unknown>
      const screens = c.screens
      if (!Array.isArray(screens)) continue
      const before = JSON.stringify(screens)
      const next = sanitizeLessonScreensForSave(screens as LessonScreen[])
      const after = JSON.stringify(next)
      if (before === after) continue
      changed += 1
      console.log(`${write ? 'UPDATE' : 'would update'} lesson ${id} (screens pruned)`)
      if (write) {
        const nextContent = { ...c, screens: next }
        const { error: upErr } = await supabase.from('lessons').update({ content: nextContent }).eq('id', id)
        if (upErr) throw upErr
        updated += 1
      }
    }

    if (rows.length < page) break
    offset += page
  }

  console.log(
    JSON.stringify(
      { examined, lessonsWithScreenChanges: changed, rowsUpdated: write ? updated : 0, dryRun: !write },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
