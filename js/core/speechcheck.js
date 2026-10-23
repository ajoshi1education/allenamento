// Spoken answers: turning recognised speech into answers, and assessing how you speak.
// Pure functions (tested in Node). The browser only gives us words, confidence and timing,
// so "pronunciation" is measured as intelligibility: did the recogniser understand what you meant?
import { normalize, stripAccents, levenshtein, evaluate, checkWriting, expand, rubricRegex } from "./evaluate.js";

const toks = s => normalize(s).split(" ").filter(Boolean);
const loose = s => stripAccents(normalize(s));

// Cloze by voice: people say either the missing word or the whole sentence. Strip the known context.
export function extractGap(prompt, transcript) {
  const [before = "", after = ""] = String(prompt).replace(/\s*\([^)]*\)/g, " ").split(/_{3,}/);
  let t = toks(transcript);
  const b = toks(before), a = toks(after);
  // strip the longest matching prefix of "before" (allowing the speaker to start mid-sentence)
  for (let n = b.length; n > 0; n--) {
    const tail = b.slice(b.length - n).map(stripAccents);
    if (t.length > n && tail.every((w, i) => stripAccents(t[i]) === w)) { t = t.slice(n); break; }
  }
  for (let n = a.length; n > 0; n--) {
    const head = a.slice(0, n).map(stripAccents);
    if (t.length > n && head.every((w, i) => stripAccents(t[t.length - n + i]) === w)) { t = t.slice(0, t.length - n); break; }
  }
  return t.join(" ");
}

export function similarity(a, b) {
  const x = loose(a), y = loose(b);
  if (!x || !y) return 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

// Choice by voice: the option that sounds closest to what was said.
export function matchOption(options, transcript, min = 0.55) {
  let best = -1, score = 0;
  options.forEach((o, i) => {
    const s = Math.max(similarity(o, transcript), ...toks(transcript).length > toks(o).length ? [similarity(o, transcript.split(/\s+/).slice(-toks(o).length).join(" "))] : [0]);
    if (s > score) { score = s; best = i; }
  });
  return score >= min ? best : -1;
}

// Try every recognised alternative; prefer one that is correct (recognisers often get one of them right).
export function bestSpokenAnswer(item, alts) {
  const cands = [];
  for (const a of alts) {
    if (!a || !a.text) continue;
    if (item.type === "cloze") { cands.push(extractGap(item.prompt, a.text)); cands.push(a.text); }
    else if (item.type === "choice") { const i = matchOption(item.options, a.text); if (i >= 0) cands.push(i); }
    else cands.push(a.text);
  }
  const uniq = [...new Set(cands.filter(c => c !== "" && c != null))];
  if (!uniq.length) return null;
  let fallback = null;
  for (const c of uniq) {
    const r = evaluate(item, c);
    if (r.correct) return { response: c, result: r };
    if (!fallback) fallback = { response: c, result: r };
  }
  return fallback;
}

// ---- assessment ---------------------------------------------------------------------
// Share of the target's words heard, in order (LCS). Used for "repeat after me".
export function wordMatch(target, heard) {
  const a = toks(target).map(stripAccents), b = toks(heard).map(stripAccents);
  if (!a.length) return 0;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const lcs = dp[a.length][b.length];
  const missed = [];
  let i = a.length, j = b.length;
  const hit = new Set();
  while (i > 0 && j > 0) { if (a[i - 1] === b[j - 1]) { hit.add(i - 1); i--; j--; } else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--; }
  toks(target).forEach((w, k) => { if (!hit.has(k)) missed.push(w); });
  return { score: lcs / a.length, missed };
}

export function fluency({ text, speechMs }) {
  const words = toks(text).length;
  const wpm = speechMs ? words / (speechMs / 60000) : 0;
  // Natural conversational Italian for learners: ~90–170 words/min. Short answers can't be judged.
  let score = null;
  // timings outside a humanly possible range (e.g. the recogniser missed the start of speech) are ignored
  if (words >= 4 && speechMs && wpm <= 300) score = wpm >= 90 && wpm <= 180 ? 1 : wpm < 90 ? Math.max(0.2, wpm / 90) : Math.max(0.5, 1 - (wpm - 180) / 150);
  return { words, wpm: Math.round(wpm), score };
}

// High-precision detectors for errors English speakers typically make in spoken Italian.
// Each must never fire on correct Italian (the validator runs them against every model answer).
export const DETECTORS = [
  { id: "subj-after-opinion", conceptId: "B2-SUBJ-01", errorType: "indicative-for-subjunctive",
    re: /\b(penso|credo|spero|immagino|dubito|temo|voglio|preferisco|mi sembra|mi pare|è possibile|è importante|è meglio|bisogna|sono contento|sono contenta|mi dispiace)\s+che\s+(?:(?!che\b|e\b|ma\b|perché\b|quando\b|se\b)[\p{L}']+\s+){0,3}(è|ha|sono|hanno|può|possono|vuole|vogliono|va|vanno|fa|fanno|sa|sanno|deve|devono|viene|vengono|sta|stanno|hai|sei|puoi|vuoi|vai|fai|sai|devi|stai|vieni)\b/i,
    label: "Indicative after an opinion/feeling verb", why: "After *penso che, spero che, è possibile che…* Italian needs the subjunctive: *sia, abbia, possa, vada, faccia…*",
    fix: m => m.replace(/(\S+)$/, w => SUBJ[w.toLowerCase()] || w) },
  { id: "cond-in-if", conceptId: "B2-HYP-02", errorType: "hypothetical",
    re: /\bse\s+(?:(?:io|tu|lui|lei|noi|voi|loro|non|lo|la|ci|mi|ti)\s+){0,2}(sarei|saresti|sarebbe|saremmo|sareste|sarebbero|avrei|avresti|avrebbe|avremmo|avreste|avrebbero|potrei|potresti|potrebbe|vorrei|vorresti|vorrebbe|andrei|farei|dovrei)\b/i,
    label: "Conditional after se", why: "Never *se + condizionale*. Use the congiuntivo after *se*: *se fossi, se avessi, se potessi…*" },
  { id: "aux-avere-motion", conceptId: "B2-PAST-01", errorType: "auxiliary",
    re: /\b(ho|hai|ha|abbiamo|avete|hanno)\s+(andato|andata|andati|venuto|venuta|venuti|partito|partita|partiti|arrivato|arrivata|arrivati|uscito|uscita|usciti|tornato|tornata|tornati|nato|nata|rimasto|rimasta|diventato|diventata|caduto|caduta|stato|stata|stati|entrato|entrata)\b/i,
    label: "Avere instead of essere", why: "Verbs of movement and change of state (*andare, venire, partire, arrivare, uscire, tornare, restare, diventare, essere*) take *essere*: *sono andato/a*.",
    fix: m => m.replace(/^(ho|hai|ha|abbiamo|avete|hanno)\b/i, w => ({ ho: "sono", hai: "sei", ha: "è", abbiamo: "siamo", avete: "siete", hanno: "sono" })[w.toLowerCase()]) },
  { id: "aux-essere-transitive", conceptId: "B2-PAST-01", errorType: "auxiliary",
    re: /\b(sono|sei|siamo|siete)\s+(mangiato|visto|fatto|detto|preso|comprato|letto|scritto|parlato|lavorato|studiato|bevuto|dormito|chiesto|messo|sentito|capito|avuto)\b/i,
    label: "Essere instead of avere", why: "Transitive and most other verbs take *avere*: *ho mangiato, ho visto, ho lavorato*." },
  { id: "dipende-di", conceptId: "B2-PREP-01", errorType: "preposition", re: /\bdipende\s+di\b/i, label: "dipende di", why: "It's *dipende **da***.", fix: m => m.replace(/di$/i, "da") },
  { id: "fare-decisione", conceptId: "B2-VOC-02", errorType: "collocation", re: /\b(fare|faccio|fatto|fai|fa|facciamo)\s+(una|la|questa)\s+decisione\b/i, label: "fare una decisione", why: "In Italian you *prendere* a decision: *prendere una decisione, ho preso una decisione*." },
  { id: "in-city", conceptId: "B2-PREP-02", errorType: "preposition", re: /\b(in)\s+(roma|milano|londra|parigi|firenze|venezia|napoli|torino|bologna|genova|palermo|madrid|berlino|new york)\b/i, label: "in + city", why: "With cities, use *a*: *a Roma, a Londra* (*in* is for countries and regions).", fix: m => m.replace(/^in/i, "a") },
  { id: "sono-anni", conceptId: "B2-VOC-02", errorType: "collocation", re: /\b(sono|è|siamo)\s+(\d{1,3}|venti|trenta|quaranta|cinquanta|sessanta|settanta|ottanta)\s+anni\b/i, label: "essere … anni (age)", why: "Age uses *avere*: *ho trent'anni*." },
  { id: "realizzare-che", conceptId: "B2-VOC-01", errorType: "false-friend", re: /\b(ho realizzato|realizzo|hai realizzato|ha realizzato)\s+che\b/i, label: "realizzare = to realise?", why: "In careful Italian *realizzare* means to make something happen. 'To realise' is *rendersi conto*: *mi sono reso conto che…*" },
  { id: "piu-meglio", conceptId: "B2-VOC-02", errorType: "grammar", re: /\bpiù\s+(meglio|peggio|migliore|peggiore)\b/i, label: "più meglio", why: "*Meglio / migliore* are already comparatives: drop *più*.", fix: m => m.replace(/^più\s+/i, "") },
  { id: "gente-plural", conceptId: "B2-VOC-02", errorType: "agreement", re: /\b(la\s+)?gente\s+(sono|hanno|pensano|dicono|vogliono|fanno|vanno|possono)\b/i, label: "la gente + plural verb", why: "*La gente* is singular in Italian: *la gente è, la gente pensa*." },
  { id: "studio-per-anni", conceptId: "B2-PREP-02", errorType: "preposition", re: /\b(studio|lavoro|vivo|abito|insegno)\s+(?:\w+\s+){0,2}per\s+(\w+\s+)?(anni|mesi|settimane)\b/i, label: "per with an ongoing period", why: "For something still going on, Italian uses the present + *da*: *studio l'italiano **da** tre anni*." }
];
const SUBJ = { "è": "sia", ha: "abbia", sono: "siano", hanno: "abbiano", "può": "possa", possono: "possano", vuole: "voglia", vogliono: "vogliano", va: "vada", vanno: "vadano", fa: "faccia", fanno: "facciano", sa: "sappia", sanno: "sappiano", deve: "debba", devono: "debbano", viene: "venga", vengono: "vengano", sta: "stia", stanno: "stiano", hai: "abbia", sei: "sia", puoi: "possa", vuoi: "voglia", vai: "vada", fai: "faccia", sai: "sappia", devi: "debba", stai: "stia", vieni: "venga" };

export function detectErrors(text) {
  const hits = [];
  for (const d of DETECTORS) {
    // compiled with an accent-aware word boundary (plain  fails next to è, à, ò…)
    d.compiled = d.compiled || rubricRegex(d.re.source);
    const m = String(text).match(d.compiled);
    if (m) hits.push({ id: d.id, conceptId: d.conceptId, errorType: d.errorType, label: d.label, why: d.why, said: m[0], fixed: d.fix ? d.fix(m[0]) : null });
  }
  return hits;
}

// One conversation turn: what was said, against what the tutor asked for.
export function assessTurn(turn, spoken) {
  const text = spoken.text || "";
  const fl = fluency(spoken);
  const task = checkWriting({ rubric: turn.expect ? turn.expect.rubric : [], minWords: turn.expect ? turn.expect.minWords || 0 : 0 }, text);
  const grammar = detectErrors(text);
  const clarity = spoken.confidence ? Math.min(1, spoken.confidence / 0.9) : null;
  const taskScore = task.score;
  const accuracy = grammar.length ? Math.max(0, 1 - 0.34 * grammar.length) : 1;
  const parts = [taskScore, accuracy, fl.score, clarity].filter(x => x != null);
  return { text, words: fl.words, wpm: fl.wpm, fluency: fl.score, clarity, task, taskScore, grammar, accuracy, score: parts.reduce((a, b) => a + b, 0) / parts.length };
}

export const band = s => (s == null ? "–" : s >= 0.85 ? "Ottimo" : s >= 0.65 ? "Buono" : s >= 0.45 ? "Discreto" : "Da migliorare");
export { expand };
