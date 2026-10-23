// Answer checking. Pure functions, shared by the browser and the Node tests.
//
// Answer patterns:  "(a|b)" = one of the options,  "[x]" = optional word(s).
//   "(Penso|Credo) che [lei] abbia ragione"  →  4 accepted sentences.
//
// Item fields used here:
//   type: cloze | transform | translate | choice | order | free
//   answers: [pattern, ...]       first one is shown as "the" correct answer
//   traps:   [{ match?: pattern|[pattern], contains?: [word], errorType, why, ok? }]
//            ok:true = acceptable alternative, shown as a note but not an error
//   focus:   [word]  words being tested: a difference here is never forgiven as a typo
//   errorType: default error category when the answer is simply wrong
//   options + answer (index) for choice items; optionWhy: { index: why }

const APOS = /[‘’ʼ`´]/g;
const QUOTES = /[“”„«»"]/g;

export function normalize(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(APOS, "'")
    .replace(QUOTES, "")
    .toLowerCase()
    .replace(/\s+'/g, "'")
    .replace(/'\s+(?=[aeiouhàèéìòù])/g, "'")   // "l' uomo" → "l'uomo", but keep "po' stanco"
    .replace(/[.,;:!?¡¿…()\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripAccents(s) {
  // Also treat "e'" / "perche'" (apostrophe used as an accent) like an unaccented vowel.
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/([aeiou])'(?=\s|$)/g, "$1");
}

export function expand(pattern, limit = 400) {
  const out = new Set();
  (function go(p) {
    if (out.size >= limit) return;
    const m = p.match(/\(([^()]*)\)|\[([^[\]]*)\]/);
    if (!m) { out.add(p.replace(/\s+/g, " ").trim()); return; }
    const opts = m[1] !== undefined ? m[1].split("|") : [m[2], ""];
    for (const o of opts) go(p.slice(0, m.index) + o + p.slice(m.index + m[0].length));
  })(String(pattern));
  return [...out];
}

export function tokens(s) { return normalize(s).split(" ").filter(Boolean); }

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Word-level diff (LCS) for showing what was different.
export function diffTokens(user, expected) {
  const a = tokens(user), b = tokens(expected);
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = stripAccents(a[i]) === stripAccents(b[j]) && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ t: a[i], op: "same" }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: a[i], op: "del" }); i++; }
    else { out.push({ t: b[j], op: "add" }); j++; }
  }
  while (i < a.length) out.push({ t: a[i++], op: "del" });
  while (j < b.length) out.push({ t: b[j++], op: "add" });
  return out;
}

const asList = x => (x == null ? [] : Array.isArray(x) ? x : [x]);

export function acceptedAnswers(item) {
  if (item.type === "choice") return asList(item.answer).map(i => item.options[i]);
  return asList(item.answers).flatMap(p => expand(p));
}

function trapHit(trap, r, rTokens, bestTokens) {
  if (trap.match) {
    const forms = asList(trap.match).flatMap(p => expand(p)).map(normalize);
    if (forms.includes(r) || forms.map(stripAccents).includes(stripAccents(r))) return true;
  }
  if (trap.contains) {
    const bestSet = new Set(bestTokens);
    return trap.contains.map(normalize).some(w => rTokens.includes(w) && !bestSet.has(w));
  }
  return false;
}

function closest(r, accepted) {
  let best = accepted[0], bestD = Infinity;
  for (const a of accepted) {
    const d = levenshtein(stripAccents(normalize(a)), stripAccents(r));
    if (d < bestD) { bestD = d; best = a; }
  }
  return { best, dist: bestD };
}

function result(item, verdict, extra) {
  const accepted = acceptedAnswers(item);
  const expected = item.display || accepted[0];
  const alternatives = item.type === "choice" ? [] :
    accepted.filter(a => normalize(a) !== normalize(expected)).slice(0, 5);
  return {
    verdict,
    correct: verdict === "correct" || verdict === "accent" || verdict === "typo" || verdict === "alternative",
    expected,
    alternatives,
    why: item.explanation || "",
    errorType: null,
    note: "",
    ...extra
  };
}

export function evaluate(item, response) {
  const raw = String(response ?? "").trim();
  if (!raw) return result(item, "empty", { correct: false, errorType: item.errorType || "no-answer", note: "No answer given." });

  if (item.type === "choice") {
    const idx = typeof response === "number" ? response : item.options.findIndex(o => normalize(o) === normalize(raw));
    const okIdx = asList(item.answer);
    if (okIdx.includes(idx)) return result(item, okIdx.length > 1 && idx !== okIdx[0] ? "alternative" : "correct", okIdx.length > 1 && item.optionWhy && item.optionWhy[idx] ? { note: item.optionWhy[idx] } : {});
    const why = (item.optionWhy && item.optionWhy[idx]) || "";
    const chosenNorm = normalize(item.options[idx] ?? raw);
    const trap = asList(item.traps).find(t => t.match && asList(t.match).flatMap(p => expand(p)).map(normalize).includes(chosenNorm));
    return result(item, "wrong", {
      errorType: (trap && trap.errorType) || item.errorType || "wrong-choice",
      note: why || (trap && trap.why) || "",
      chosen: item.options[idx]
    });
  }

  if (item.type === "free") return evaluateWriting(item, raw);

  const accepted = acceptedAnswers(item);
  const r = normalize(raw);
  const rTokens = r.split(" ");

  if (accepted.some(a => normalize(a) === r)) return result(item, "correct", { matched: r });

  const { best, dist } = closest(r, accepted);
  const bestTokens = tokens(best);

  // Known alternatives and known mistakes come before any leniency.
  for (const trap of asList(item.traps)) {
    if (!trapHit(trap, r, rTokens, bestTokens)) continue;
    if (trap.ok) return result(item, "alternative", { note: trap.why || "Also acceptable.", matched: r });
    return result(item, "wrong", { errorType: trap.errorType || item.errorType || "grammar", note: trap.why || "", best, diff: diffTokens(raw, best) });
  }

  if (accepted.some(a => stripAccents(normalize(a)) === stripAccents(r))) {
    const diff = diffTokens(raw, best);
    return result(item, "accent", { errorType: "accent", note: "Correct, but check the accents: " + accentHint(diff), best, diff });
  }

  // Typo leniency: only for longer answers, never on the words being tested.
  const allowTypos = item.typoTolerance ?? ["translate", "transform", "free", "speak"].includes(item.type);
  const len = stripAccents(normalize(best)).length;
  if (allowTypos && dist > 0 && dist <= Math.max(1, Math.floor(len / 15))) {
    const diff = diffTokens(raw, best);
    const changed = diff.filter(d => d.op !== "same").map(d => stripAccents(d.t));
    const focus = asList(item.focus).map(f => stripAccents(normalize(f)));
    const touchesFocus = changed.some(c => focus.includes(c));
    const sameLength = tokens(raw).length === bestTokens.length;
    if (!touchesFocus && sameLength) {
      return result(item, "typo", { errorType: "spelling", note: "Accepted with a small spelling slip.", best, diff });
    }
  }

  return result(item, "wrong", { errorType: item.errorType || "grammar", best, diff: diffTokens(raw, best) });
}

function accentHint(diff) {
  const adds = diff.filter(d => d.op === "add").map(d => d.t);
  return adds.length ? adds.join(", ") : "see the correct answer";
}

// Open writing: graded against the rubric checklist (no AI). Passing = every check met and length OK.
function evaluateWriting(item, text) {
  const w = checkWriting(item, text);
  const failed = w.checks.filter(c => !c.ok);
  const notes = [];
  if (!w.lengthOk) notes.push(`Length: ${w.words} words (aim for ${item.minWords || 0}${item.maxWords ? "–" + item.maxWords : "+"}).`);
  failed.forEach(c => notes.push(`Missing: ${c.label}.${c.hint ? " " + c.hint : ""}`));
  const pass = !failed.length && w.lengthOk;
  return {
    verdict: pass ? "correct" : "wrong", correct: pass,
    expected: item.model || "", alternatives: [], why: item.explanation || "",
    errorType: pass ? null : (failed[0] ? failed[0].errorType : "task-completion"),
    note: pass ? `All ${w.checks.length} checklist points met (${w.words} words).` : notes.join(" "),
    writing: w
  };
}

// Writing tasks without AI: check required structures and length, give a checklist.
// JavaScript's \b treats accented letters as non-word characters, so /\bperché\b/ never matches.
// Rubric patterns are compiled with \b replaced by a Unicode-aware word boundary.
const UB = "(?:(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_]))";
export function rubricRegex(p) {
  return new RegExp(String(p).replace(/\\\\/g, "\u0000").replace(/\\b/g, UB).replace(/\u0000/g, "\\\\"), "iu");
}
// Number of occurrences of a pattern (so "min: 3" means three uses, not three patterns).
function countMatches(p, text) {
  const re = new RegExp(rubricRegex(p).source, "giu");
  const seen = new Set();
  for (const m of text.matchAll(re)) seen.add(m.index);
  return seen.size;
}

export function checkWriting(task, text) {
  const t = normalize(text);
  const words = t ? t.split(" ").length : 0;
  const checks = (task.rubric || []).map(c => {
    const hits = asList(c.anyOf).reduce((n, p) => n + countMatches(p, String(text)), 0);
    return { label: c.label, ok: hits >= (c.min || 1), hits, errorType: c.errorType || "writing", hint: c.hint || "" };
  });
  const lengthOk = words >= (task.minWords || 0) && (!task.maxWords || words <= task.maxWords * 1.2);
  return { words, lengthOk, checks, score: (checks.filter(c => c.ok).length + (lengthOk ? 1 : 0)) / (checks.length + 1) };
}
