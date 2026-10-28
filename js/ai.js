// Browser side of the optional AI helper. Everything degrades gracefully: if /api/ai is missing
// or switched off, these return null and the app uses curated content only.
import { evaluate } from "./core/evaluate.js";

let status = null;
export async function aiEnabled() {
  if (status !== null) return status;
  try { const r = await fetch("api/ai", { method: "GET" }); status = r.ok && (await r.json()).enabled === true; }
  catch { status = false; }
  return status;
}

async function call(body) {
  if (!(await aiEnabled())) return null;
  try {
    const r = await fetch("api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

// Turn generated items into app items, keeping only ones our own checker agrees with:
// every listed answer must be graded correct and every listed wrong answer graded wrong.
export function acceptGenerated(raw, error, now = Date.now()) {
  const out = [];
  (raw || []).forEach((g, i) => {
    if (!g || !Array.isArray(g.answers) || !g.answers.length || !g.prompt) return;
    if (g.type === "cloze" && (g.prompt.match(/_{3,}/g) || []).length !== 1) return;
    const item = {
      id: `ai:${error.id}:${now}:${i}`, conceptId: error.conceptId, skill: error.skill, type: g.type, difficulty: 3, origin: "AI",
      instruction: g.type === "cloze" ? "Complete with the correct form." : "Translate into Italian.",
      prompt: g.prompt, answers: g.answers.map(a => a.replace(/[()[\]|]/g, " ").trim()), en: g.en, explanation: g.explanation,
      errorType: error.errorType, focus: g.type === "cloze" ? g.answers : undefined,
      // Wrong answers become traps (cloze: exact match; translate: whole-sentence match).
      traps: (g.wrong || []).filter(w => w && !g.answers.includes(w)).map(w => ({ match: w.replace(/[()[\]|]/g, " ").trim(), errorType: error.errorType, why: g.explanation }))
    };
    const answersOk = item.answers.every(a => evaluate(item, a).verdict === "correct");
    const trapsOk = item.traps.every(t => !evaluate(item, t.match).correct);
    if (answersOk && trapsOk) out.push(item);
  });
  return out;
}

export async function generateRetests(error, concept) {
  const res = await call({ task: "retest", count: 3, concept: concept?.title, rule: concept?.rule, errorType: error.errorType,
    prompt: error.prompt, userAnswer: error.userAnswer, correctAnswer: error.correctAnswer });
  return res ? acceptGenerated(res.items, error) : null;
}

export async function writingFeedback(prompt, text) {
  return call({ task: "writing", prompt, text });
}
