/**
 * One-time import: clear `words` table, re-import from assets/Series_2/*.m4a
 *
 * DEFAULT (plain `npm run import:series2`):
 *   1) DELETE all rows from `words`
 *   2) Remove every object under prefix `{folderSlug}/` in bucket `voice-recordings`
 *      (folderSlug comes from IMPORT_SERIES_NAME, default "Series 2" → `Series_2/`)
 *      This is NOT the whole Supabase project — only that folder inside that bucket.
 *   3) Insert words + upload new audio files
 *
 * Optional skips (only if you set env): IMPORT_SKIP_WORDS_DELETE, IMPORT_SKIP_STORAGE_DELETE
 *
 * - Every parseable stem gets a **words** row.
 * - **Both** `_normal.m4a` + `_slow.m4a` → upload both, `status: recorded`, `recorded_at` set.
 * - **Only one** → insert row + upload that file only, missing URL stays null, `status: pending`.
 *
 * Naming: NN_Stem_normal.m4a + NN_Stem_slow.m4a (stem match case-insensitive).
 * "normal" → storage `..._fast.m4a` / `fast_audio_url` (matches app).
 *
 * Requires in .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: IMPORT_SERIES_NAME, IMPORT_LANGUAGE, IMPORT_DRY_RUN=1, IMPORT_VERBOSE=1
 */

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    const key = m[1].trim()
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

loadEnv()

function slugSegment(s) {
  const t = s
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s/]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)
  return t || 'series'
}

function stemToDisplayWord(stem) {
  return stem.replace(/_/g, ' ').trim()
}

function parseFilename(name) {
  const m = name.match(/^(\d+)_(.+)_(normal|slow)\.m4a$/i)
  if (!m) return null
  return {
    index: parseInt(m[1], 10),
    stem: m[2],
    speed: m[3].toLowerCase(),
  }
}

function truthy(v) {
  return v === '1' || v === 'true'
}

async function main() {
  const dryRun = truthy(process.env.IMPORT_DRY_RUN)
  const verbose = truthy(process.env.IMPORT_VERBOSE)
  const skipWordsDelete = truthy(process.env.IMPORT_SKIP_WORDS_DELETE)
  const skipStorageDelete = truthy(process.env.IMPORT_SKIP_STORAGE_DELETE)
  const seriesName = process.env.IMPORT_SERIES_NAME || 'Series 2'
  const language = process.env.IMPORT_LANGUAGE || 'afaan oromo'
  const bucket = 'voice-recordings'
  const assetsDir = path.join(__dirname, '..', 'assets', 'Series_2')

  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!fs.existsSync(assetsDir)) {
    console.error('Missing folder:', assetsDir)
    process.exit(1)
  }

  const names = fs.readdirSync(assetsDir).filter((n) => n.endsWith('.m4a'))
  const badNames = names.filter((n) => !parseFilename(n))
  if (badNames.length) {
    console.log(
      `[skip] ${badNames.length} file(s) not in format NN_Stem_normal.m4a / NN_Stem_slow.m4a:`,
    )
    badNames.forEach((n) => console.log('       ', n))
  }

  /** @type {Map<string, { index: number, stemKey: string, displayStem: string, normal?: string, slow?: string }>} */
  const groups = new Map()

  for (const name of names) {
    const parsed = parseFilename(name)
    if (!parsed) continue
    const stemKey = `${parsed.index}_${parsed.stem.toLowerCase()}`
    let g = groups.get(stemKey)
    if (!g) {
      g = {
        index: parsed.index,
        stemKey,
        displayStem: parsed.stem,
        normal: undefined,
        slow: undefined,
      }
      groups.set(stemKey, g)
    }
    if (parsed.speed === 'normal') {
      if (g.normal) console.warn('[dup] duplicate normal for', stemKey, '- keeping', g.normal)
      g.normal = name
    } else {
      if (g.slow) console.warn('[dup] duplicate slow for', stemKey, '- keeping', g.slow)
      g.slow = name
    }
  }

  const allGroups = Array.from(groups.values()).sort(
    (a, b) => a.index - b.index || a.stemKey.localeCompare(b.stemKey),
  )

  const withBoth = allGroups.filter((g) => g.normal && g.slow).length
  const partial = allGroups.length - withBoth

  console.log('\n--- Summary ---')
  console.log('Word rows to insert:', allGroups.length)
  console.log('  With both slow + normal (upload both → status recorded):', withBoth)
  console.log('  Missing one side (insert row + upload what exists → status pending):', partial)
  if (verbose && partial) {
    for (const g of allGroups) {
      if (g.normal && g.slow) continue
      const miss = [!g.normal && 'normal', !g.slow && 'slow'].filter(Boolean)
      console.log(
        `    #${g.index} "${g.displayStem}" — missing ${miss.join(', ')} | files: n=${g.normal || '—'} s=${g.slow || '—'}`,
      )
    }
  }

  if (dryRun) {
    console.log('\n[IMPORT_DRY_RUN] No database or storage changes.\n')
    for (const g of allGroups) {
      const tag = g.normal && g.slow ? '[recorded]' : '[pending]'
      const parts = [g.slow && `slow:${g.slow}`, g.normal && `fast:${g.normal}`].filter(Boolean)
      console.log(`  ${tag} ${g.index} ${stemToDisplayWord(g.displayStem)}  ${parts.join('  ')}`)
    }
    process.exit(0)
  }

  if (!supabaseUrl || !serviceKey) {
    console.error('\nSet SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const folderSlug = slugSegment(seriesName)
  const recordedAt = new Date().toISOString()

  if (skipWordsDelete) {
    console.log('\n--- Skipping words table delete (IMPORT_SKIP_WORDS_DELETE=1) ---')
    console.log('    Make sure `words` is empty (or you only want to append) before inserts run.')
  } else {
    console.log('\n--- Clearing words table ---')
    const { error: delErr } = await supabase
      .from('words')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (delErr) {
      console.error('Delete words failed:', delErr.message)
      process.exit(1)
    }
  }

  if (skipStorageDelete) {
    console.log('--- Skipping storage folder delete (IMPORT_SKIP_STORAGE_DELETE=1) ---')
  } else {
    console.log(
      `--- Clearing Storage: bucket "${bucket}" / prefix "${folderSlug}/" (not the whole bucket) ---`,
    )
    const { data: existing, error: listErr } = await supabase.storage.from(bucket).list(folderSlug, { limit: 1000 })
    if (listErr) {
      console.warn('List storage (ok if new bucket):', listErr.message)
    } else if (existing?.length) {
      const paths = existing.map((f) => `${folderSlug}/${f.name}`)
      const { error: rmErr } = await supabase.storage.from(bucket).remove(paths)
      if (rmErr) console.warn('Storage remove:', rmErr.message)
      else console.log('Removed', paths.length, 'objects')
    }
  }

  let n = 0
  for (const g of allGroups) {
    const wordLabel = stemToDisplayWord(g.displayStem)
    const hasBoth = Boolean(g.normal && g.slow)

    const { data: inserted, error: insErr } = await supabase
      .from('words')
      .insert({
        series: seriesName,
        language,
        word: wordLabel,
        status: 'pending',
        notes: null,
        slow_audio_url: null,
        fast_audio_url: null,
        recorded_at: null,
      })
      .select('id')
      .single()

    if (insErr || !inserted?.id) {
      console.error('Insert failed for', wordLabel, insErr?.message)
      process.exit(1)
    }

    const id = inserted.id
    const slowPath = `${folderSlug}/${id}_slow.m4a`
    const fastPath = `${folderSlug}/${id}_fast.m4a`

    let slowPublic = null
    let fastPublic = null

    if (g.slow) {
      const slowBuf = fs.readFileSync(path.join(assetsDir, g.slow))
      const { error: upSlow } = await supabase.storage.from(bucket).upload(slowPath, slowBuf, {
        contentType: 'audio/mp4',
        upsert: true,
      })
      if (upSlow) {
        console.error('Upload slow failed', wordLabel, upSlow.message)
        process.exit(1)
      }
      slowPublic = supabase.storage.from(bucket).getPublicUrl(slowPath).data.publicUrl
    }

    if (g.normal) {
      const fastBuf = fs.readFileSync(path.join(assetsDir, g.normal))
      const { error: upFast } = await supabase.storage.from(bucket).upload(fastPath, fastBuf, {
        contentType: 'audio/mp4',
        upsert: true,
      })
      if (upFast) {
        console.error('Upload fast failed', wordLabel, upFast.message)
        process.exit(1)
      }
      fastPublic = supabase.storage.from(bucket).getPublicUrl(fastPath).data.publicUrl
    }

    const { error: upRow } = await supabase
      .from('words')
      .update({
        slow_audio_url: slowPublic,
        fast_audio_url: fastPublic,
        status: hasBoth ? 'recorded' : 'pending',
        recorded_at: hasBoth ? recordedAt : null,
      })
      .eq('id', id)

    if (upRow) {
      console.error('Update failed', wordLabel, upRow.message)
      process.exit(1)
    }

    n += 1
    const state = hasBoth ? 'recorded' : 'pending (missing clip)'
    console.log(`[${n}/${allGroups.length}]`, wordLabel, '—', state)
  }

  console.log('\nDone. Inserted', n, 'words.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
