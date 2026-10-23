// Adaptive selection: difficulty follows performance, and concepts with open errors come up more often.
import { expand } from "./evaluate.js";

export function adjustLevel(level, correct, streak) {
  if (!correct) return Math.max(1, level - 1);
  if (streak >= 2) return Math.min(5, level + 1);
  return level;
}

export function nextItem(pool, { level = 2, used = new Set(), weak = new Map(), rand = Math.random } = {}) {
  let best = null, bestScore = -Infinity;
  for (const it of pool) {
    if (used.has(it.id)) continue;
    const s = -Math.abs((it.difficulty || 2) - level) * 2 + (weak.get(it.conceptId) || 0) + rand() * 1.5;
    if (s > bestScore) { bestScore = s; best = it; }
  }
  return best;
}

// Weight per concept from open errors (more open, repeated errors → more practice).
export function weakConcepts(errors) {
  const m = new Map();
  for (const e of errors) if (e.status !== "mastered") m.set(e.conceptId, Math.min(4, (m.get(e.conceptId) || 0) + 0.5 + 0.5 * e.timesWrong));
  return m;
}

const fill = (prompt, ans) => prompt.replace(/_{3,}/, ans).replace(/\s*\([^)]*\)/, "");

export function sentenceOf(item) {
  if (!item.answers || !item.answers.length) return null;
  const first = expand(item.answers[0])[0];
  if (item.type === "cloze") return fill(item.prompt, first);
  if (["translate", "transform", "speak"].includes(item.type)) return first;
  return null;
}

// Turn an exercise into a sentence-building puzzle, with the classic wrong form as a decoy word.
export function toBuilder(item) {
  if (item.type === "order") return item;
  const s = sentenceOf(item);
  if (!s) return null;
  const toks = s.replace(/[.!?;:,]+(?=\s|$)/g, "").split(/\s+/).filter(Boolean);
  if (toks.length < 3 || toks.length > 14) return null;
  const decoyTrap = (item.traps || []).find(t => !t.ok && typeof t.match === "string" && !/\s|[()[\]]/.test(t.match));
  const traps = decoyTrap ? [{ contains: [decoyTrap.match], errorType: decoyTrap.errorType, why: decoyTrap.why }] : [];
  return {
    id: item.id + "#build", conceptId: item.conceptId, skill: item.skill, type: "order", difficulty: item.difficulty,
    instruction: decoyTrap ? "Build the sentence. One word is a decoy." : "Build the sentence.",
    prompt: item.type === "translate" ? item.prompt : (item.en || "Put the words in order."),
    tokens: decoyTrap ? [...toks, decoyTrap.match] : toks,
    answers: [toks.join(" ")], explanation: item.explanation, errorType: "word-order", traps, derivedFrom: item.id
  };
}
