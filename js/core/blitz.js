// "Occhio all'errore!": a fast true/false game. Each card is a full Italian sentence, either
// correct or carrying one classic mistake. Wrong sentences come from the course's own traps
// (answers the course already marks as wrong), so the game never calls correct Italian a mistake.
import { expand, evaluate } from "./evaluate.js";

// Only mistakes that are wrong in any context. (Register, tense choice and word choice depend on
// the situation, so a sentence with them can be fine on its own; those are left out.)
export const BLITZ_ERRORS = new Set([
  "agreement", "verb-form", "indicative-for-subjunctive", "subjunctive-for-indicative", "auxiliary",
  "spelling", "hypothetical", "pronoun-position", "ci-ne", "preposition", "article", "relative",
  "tense-sequence", "idiom", "collocation", "word-formation", "passive"
]);

const fill = (prompt, ans) => prompt.replace(/_{3,}/, ans).replace(/\s*\([^)]*\)/g, "").replace(/\s+([.,!?;:])/g, "$1").replace(/\s+/g, " ").trim();
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Cards { id, item, text, wrong, fix, why, response }. keep = the reviewed list (content/blitz-reviewed.json):
// only wrong sentences checked by hand to be wrong in any context are used. keep = null skips the check (tests).
export function blitzCards(content, conceptIds, keep = null) {
  const cards = [];
  for (const cid of conceptIds) for (const item of content.poolFor(cid)) {
    if (item.type !== "cloze" || item.passageOf || item.audio) continue;
    const gaps = (item.prompt.match(/_{3,}/g) || []).length;
    if (gaps !== 1 || /[[\]|]/.test(item.prompt)) continue;
    const right = expand(item.answers[0])[0];
    const good = cap(fill(item.prompt, right));
    const words = good.split(" ").length;
    if (words < 4 || words > 22) continue;
    const traps = (item.traps || []).filter(t => !t.ok && typeof t.match === "string" && BLITZ_ERRORS.has(t.errorType || item.errorType)
      && !/[[\]|()]/.test(t.match) && t.match.trim().toLowerCase() !== right.toLowerCase()
      && !evaluate(item, t.match).correct);
    const wrongs = traps.map(t => ({ id: item.id + "#" + t.match, item, text: cap(fill(item.prompt, t.match)), wrong: true, fix: good, why: t.why || item.explanation || "", response: t.match, errorType: t.errorType || item.errorType }))
      .filter(c => !keep || keep[c.id])
      .map(c => (keep && keep[c.id].why ? { ...c, why: keep[c.id].why } : c));
    if (!wrongs.length) continue;                      // correct cards only where a wrong twin exists (balanced topics)
    cards.push({ id: item.id + "#ok", item, text: good, wrong: false, fix: good }, ...wrongs);
  }
  return cards;
}

// A shuffled deck: half wrong, half right, never two cards from the same exercise in a row,
// your weak topics more often.
export function blitzDeck(cards, { n = 60, weak = new Map(), rand = Math.random } = {}) {
  const score = c => (weak.get(c.item.conceptId) || 0) * 0.6 + rand() * 3;
  const pick = arr => arr.map(c => ({ c, s: score(c) })).sort((a, b) => b.s - a.s).map(x => x.c);
  const wrong = pick(cards.filter(c => c.wrong)), ok = pick(cards.filter(c => !c.wrong));
  const deck = [], seenItem = new Set();
  let wi = 0, oi = 0;
  while (deck.length < n && (wi < wrong.length || oi < ok.length)) {
    const wantWrong = rand() < 0.5 ? wi < wrong.length : oi >= ok.length;
    const c = wantWrong ? wrong[wi++] : ok[oi++];
    if (!c || seenItem.has(c.item.id)) continue;       // one card per exercise per game
    seenItem.add(c.item.id);
    deck.push(c);
  }
  return deck;
}

// Points: 10 per right answer, times the combo multiplier (x2 after 3 in a row, x3 after 6, x4 after 10).
export const multiplier = streak => (streak >= 10 ? 4 : streak >= 6 ? 3 : streak >= 3 ? 2 : 1);
