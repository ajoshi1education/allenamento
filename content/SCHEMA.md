# Content authoring guide

The learner is an English speaker at about B2 who wants to reach C1. All explanations are in **English**. All target language is **natural, correct, contemporary standard Italian**. Accuracy matters more than quantity: never include an item whose correct answer is debatable unless every valid answer is listed.

After writing content, always run:

```
node scripts/validate-content.mjs
```

It must report **no ERROR lines**. It regenerates `content/index.json` itself, so never edit that file. The validator checks that every accepted answer is graded correct by the real answer checker, and that every `match` trap is graded wrong (or as an alternative, if `ok: true`).

Reference examples: `content/units/u01-congiuntivo.json` (concept + lesson + exercises) and `content/games/det-01-quadro.json` (detective game).

## Files
- `content/units/<unit-id-lowercase>-<slug>.json`: one unit, `{ "unit": "U02", "title": "...", "cefr": "B2", "concepts": [ concept, ... ] }`. A unit's concepts must all be in one file.
- `content/games/<slug>.json`: one game per file.
- `content/vocab/<slug>.json`: an array of vocabulary entries.
- `content/curriculum.json`: the planned concept map (ids and titles). Use exactly these concept ids. Don't edit it.
- `content/error-types.json`: allowed `errorType` values. Use only these. If something is truly missing, add it there with a label and skill.

## Concept
```json
{
  "id": "B2-SUBJ-02",              // from curriculum.json; format (B2|C1)-LETTERS-NN
  "title": "...",
  "cefr": "B2",
  "skill": "grammar",              // grammar | vocabulary | reading | listening | writing | speaking | interaction
  "prereqs": ["B2-SUBJ-01"],        // optional, concept ids
  "rule": "One or two sentences summarising the rule (shown in feedback and in the Error Bank).",
  "assessment": ["Can …", "Can …"],  // 3–5 observable criteria
  "lesson": {
    "intro": "Why this matters for an English speaker. 2–4 sentences.",
    "rules": [ { "title": "...", "text": "...", "examples": [ { "it": "...", "en": "..." } ], "table": { "head": [...], "rows": [[...]] } } ],
    "mistakes": [ { "wrong": "...", "right": "...", "why": "..." } ],
    "tips": ["..."]
  },
  "exercises": [ item, ... ]       // at least 12, difficulty spread 1→5, several item types
}
```
Text fields support `*italic*`, `**bold**` and `~~strike~~`. Use italics for Italian words inside English text.

## Items (exercises)
Common fields: `id` (globally unique: `<conceptId>.e01`, `.e02`…; in games `<gameId>.<x>`), `type`, `difficulty` (1–5), `instruction` (English), `prompt`, `explanation` (English: why the answer is right), `errorType` (the default category if wrong), optional `en` (English meaning of the full sentence), optional `traps`, optional `focus`.

Answer patterns: `(a|b)` means one of the options, and `[x]` means x is optional. Example: `"(Penso|Credo) che [lei] abbia ragione"`. List **every** natural correct formulation, including optional subject pronouns and alternative word orders. Matching ignores case, final punctuation and apostrophe styles. Accents matter: an accent slip is flagged but not failed.

`traps` link typical wrong answers to a diagnosis:
- `{ "match": "ha", "errorType": "indicative-for-subjunctive", "why": "English explanation" }`: the whole answer equals this (patterns allowed, or an array of patterns).
- `{ "contains": ["sei"], "errorType": "...", "why": "..." }`: the answer contains this word and the correct answer doesn't (good for sentences).
- `{ ..., "ok": true }`: an acceptable alternative. The note is shown, but it's not counted as an error.
Write traps for the mistakes English speakers really make: indicative instead of subjunctive, wrong auxiliary, calques, false friends, wrong preposition, wrong pronoun position. A good trap `why` is what a tutor would say.

`focus`: the words being tested. A typo on these words is never forgiven.

Types:
- `cloze`: `prompt` contains `___` once, usually with the base form in brackets: `"Penso che Marco ___ (avere) ragione."`. `answers` = what fills the gap. Make the gap unambiguous: if two forms fit, list both, or add context.
- `choice`: `options` (2–4), `answer` = index (or an array of indexes if several are correct). Add `optionWhy: { "2": "why option 2 is wrong" }` and/or traps with `match` equal to the option text.
- `transform`: an Italian sentence to rewrite following the instruction. `answers` are full sentences.
- `translate`: English `prompt` → Italian `answers` (full sentences, all valid variants).
- `order`: `tokens` = the words of the answer (exact, including capitals). `answers[0]` must use exactly those tokens. Other orders that are also correct can be further answers.
- `speak`: a spoken response (typed in silent mode). `prompt` = the English situation or cue, `answers` = acceptable Italian sentences. Keep it short and structured.
- `free`: open writing. Needs `rubric`, `minWords`, optional `maxWords`, and a `model` answer. Each rubric entry is `{ "label": "Uses a concessive connector", "anyOf": ["\\b(sebbene|benché|nonostante)\\b"], "min": 1, "errorType": "connector", "hint": "Try *sebbene* + subjunctive" }`. The `anyOf` values are JavaScript regex strings, case-insensitive, run against the raw text, so escape backslashes in JSON.

Optional on any item: `passage` (`{ "title": "...", "it": "Italian text" }`) shown above the question. `audio: "Italian text"` is spoken aloud when audio is on. For listening items, also give `silentPrompt`, a text-only version of the task used in silent mode. `interaction: true` counts the item towards the interaction skill as well.

## Games
Every game has `id` (`G-<TYPE>-NN`, unique), `type`, `title`, `subtitle` (one line, English), `conceptIds` (the concepts it tests: they must exist), `difficulty` (1–5) and `minutes`.

- **detective**: see `det-01-quadro.json`. `characters`, `intro` (Italian), `scenes[]` with `speaker`, `line` (Italian), `item` (an item with its own `conceptId`), `clue` and `clueBlurred` (Italian), then `accusation` with `question`, `options[{id,label}]`, `answer`, `solved` and `wrong`. The clues must make the mystery solvable only when read carefully.
- **dialogue** (branching conversation with a character):
  ```json
  { "type": "dialogue", "characters": {"anna": {"name": "Anna", "role": "...", "avatar": "👩‍💼"}}, "setting": "Italian, 1–2 sentences",
    "start": "G-DLG-01.n1",
    "nodes": [
      { "id": "G-DLG-01.n1", "speaker": "anna", "line": "Italian line", "item": { …item… }, "next": "G-DLG-01.n2", "nextFail": "G-DLG-01.n2b" },
      { "id": "G-DLG-01.n2", "speaker": "anna", "line": "…", "choices": [
          { "text": "Reply A (Italian)", "ok": true, "next": "G-DLG-01.n3" },
          { "text": "Reply B", "ok": false, "errorType": "register", "why": "Too familiar: you'd use Lei here.", "next": "G-DLG-01.n3b" } ] },
      { "id": "G-DLG-01.end1", "speaker": "anna", "line": "…", "end": true, "outcome": "English summary of how it went" }
    ] }
  ```
  Node ids are globally unique (prefix them with the game id). A node with `item` is graded and continues to `next` (or to `nextFail` when wrong, if given). A node with `choices` is a graded choice. Several choices may be `ok`, and wrong choices can lead to different branches where the character reacts. Every path must reach an `end` node. Aim for 8–14 nodes, with branches that matter.
- **gauntlet** (timed challenge), **builder** (sentence building), **duel** (translation race): built from the exercise pools of `conceptIds`, so they need no items. Optional: `seconds` (default 120), `lives` (default 3), `rival` (`{ "name": "...", "avatar": "..." }`, duel only).
- **reading** / **listening**: `passage: { "title": "...", "it": "Italian text 150–400 words", "source": "invented" }`, and `questions[]` = items (choice/cloze/translate/transform), each with an `id` and an `errorType` (usually `comprehension` or `listening`, or a grammar/vocabulary type for language-focus questions). For listening, the passage is read aloud and the text is hidden until the end (in silent mode it's shown as a transcript).
- **debate** / writing: `topic` (Italian), `stance` (the character's view, Italian), `opponent` `{name, avatar}`, and `prompts[]` = `free` items (with `id` and `rubric`) and/or `speak` / `transform` items. Optional `model` for each prompt.

## Vocabulary entries (`content/vocab/*.json`)
```json
[{ "id": "v-prendere-atto", "it": "prendere atto di", "en": "to acknowledge, take note of", "pos": "expr",
   "def": "Short English definition or usage note", "register": "formal",
   "examples": [{ "it": "Prendiamo atto della sua decisione.", "en": "We acknowledge your decision." }],
   "collocations": ["prendere atto di una decisione"], "tags": ["collocation", "C1"], "conceptIds": ["C1-VOC-03"] }]
```
`pos`: noun, verb, adj, adv, expr, idiom, conn (connector), prep. `register`: informal, neutral or formal. `id` is unique: `v-` plus a slug.
