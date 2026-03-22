# Import Series 2 audio into Supabase

Bundled files in `assets/Series_2/` must follow this pattern **exactly**:

- `NN_WordStem_normal.m4a` → stored as **fast** (normal speed)
- `NN_WordStem_slow.m4a` → stored as **slow**

`NN` is a number; `WordStem` is the same for both files (matching is **case-insensitive**, e.g. `40_Kello_normal` + `40_kello_slow`).

Files that don’t match `NN_*_normal.m4a` / `NN_*_slow.m4a` are **skipped** (can’t infer a word label).

For each **stem** found:

- **Both** `_normal` and `_slow` → row gets **recorded**, both URLs uploaded.
- **Only one** → row is still created (**pending**), only the file(s) present are uploaded; add the other file later and re-run or fix in the app.

Repo filename fixes already applied: see git history / earlier notes (`28_…`, `45_…`, removed bad `41_…` duplicate name).

## 1. Env

Add to `.env` (use the **service role** key from Supabase → **Settings → API** — never put this in the mobile app):

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

`EXPO_PUBLIC_SUPABASE_URL` is also read if `SUPABASE_URL` is omitted.

Optional:

```env
IMPORT_SERIES_NAME=Series 2
IMPORT_LANGUAGE=afaan oromo
```

## 2. Dry run (no DB changes)

```bash
IMPORT_DRY_RUN=1 node scripts/import-series2-audio.cjs
```

Use `IMPORT_VERBOSE=1` to print each **ignored** stem (missing normal or slow).

## 3. Real import

**Default** (`npm run import:series2`):

1. **Deletes every row** in the `words` table  
2. **Deletes every file** in Storage under **`voice-recordings` → `Series_2/`** (the series slug from `IMPORT_SERIES_NAME`, default `"Series 2"` → folder `Series_2`).  
   Other buckets and other folders in `voice-recordings` are **not** touched.  
3. Inserts all words from `assets/Series_2` and uploads audio there.

```bash
npm run import:series2
```

**If you already cleared `words` yourself**, you can skip step 1:

```bash
IMPORT_SKIP_WORDS_DELETE=1 npm run import:series2
```

**If you want to keep existing files** in `Series_2/` in Storage (unusual):

```bash
IMPORT_SKIP_STORAGE_DELETE=1 npm run import:series2
```

Requires Storage policies that allow the **service role** to write (service role usually bypasses RLS; if it fails, fix bucket policies).

## 4. App

After import, open **Word Manager** → **Series 2** — you should see **Recorded** words with **▶ Slow** / **▶ Fast** playback.
