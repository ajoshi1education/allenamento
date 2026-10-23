# Allenamento: Italian B2 → C1

An adaptive Italian trainer for an English speaker at about B2 who is aiming for C1. It has six areas:

- **Learn**: 61 lessons across the B2→C1 curriculum.
- **Play / Test**: 28 games linked to those lessons.
- **Vocabulary**: a 308-entry library plus spaced-repetition flashcards.
- **Google Translate import**: turns your translation history into flashcards, exercises and games.
- **Error Bank**: a permanent record of your mistakes, retested until mastered.
- **Progress**: per-skill progress, recommended next steps, achievements and weekly challenges.

Everything works as silent text, so you can use it in public. Audio (text-to-speech) and speaking (speech recognition) are used when the browser supports them.

## Run it locally

```
powershell -ExecutionPolicy Bypass -File tools/serve.ps1 -Port 8010
```

Open http://localhost:8010. No install is needed. Your data is saved in the browser's IndexedDB database. In **Settings** you can download a backup file and restore it on any device.

## How it works

| Part | Where |
|---|---|
| Curriculum map (61 concept IDs, CEFR) | `content/curriculum.json` |
| Lessons + exercises per unit | `content/units/*.json` |
| Games (detective, dialogue, gauntlet, builder, duel, reading, listening, debate) | `content/games/*.json` |
| Vocabulary library | `content/vocab/core.json` |
| Authoring rules for content | `content/SCHEMA.md` |
| Answer checker (alternatives, accents, typos, known mistakes, writing checklists) | `js/core/evaluate.js` |
| Error Bank rules (capture, mastery, retest in new contexts, patterns) | `js/core/errors.js` |
| Spaced repetition | `js/core/srs.js` |
| Placement test | `js/core/diagnostic.js` |
| Google Translate parsers | `js/core/importer.js` |
| Progress, achievements, challenges | `js/core/progress.js` |
| Database (IndexedDB) + backup | `js/db.js`, `js/store.js` |
| Optional sync (Supabase) | `js/sync.js`, `supabase/schema.sql` |
| Optional AI helper (off by default) | `netlify/functions/ai.mjs`, `js/ai.js` |

**Mastery rule:** an Error Bank entry only counts as mastered after correct answers on 3 different days, 2 of them in a different sentence from the original. A correct answer on the same day as the mistake doesn't count. Mastered entries still come back for occasional revision, and a new slip reopens them.

## Checks

```
npm test
```

```
node scripts/validate-content.mjs
```

The validator runs every accepted answer through the real answer checker. It also confirms that every "known mistake" is graded wrong, that model answers pass their own writing checklist, that IDs are unique and links resolve, and it reports curriculum coverage.

## Getting your Google Translate history in

There's no API for personal history. These are the routes that work:

1. **translate.google.com → Saved → Export to Google Sheets**, then *File › Download › CSV*. This has both the phrase and its translation. Star history items first to move them into Saved.
2. **Google Takeout → My Activity → Translate** (JSON or HTML). This usually contains only the text you looked up.
3. Paste lines into the Translate tab.

## Deploy (free)

The app deploys to Netlify like the cricket site: `netlify.toml` runs `node scripts/build.mjs` and publishes `dist/`.

- **Sync between phone and PC (optional, free):** create a Supabase project, run `supabase/schema.sql`, then fill in the URL and anon key in Settings.
- **AI helper (optional, paid per use):** set `ANTHROPIC_API_KEY` in Netlify's environment variables. It adds fresh retest sentences and detailed writing corrections. Without it, the app uses only its own content.
