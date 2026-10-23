// Domain layer: every answer from every activity goes through recordAnswer(),
// which logs it, updates skill and concept progress, and feeds the Error Bank.
import { captureMistake, recordSuccess, relatedErrors, errorId } from "./core/errors.js";
import { newCard, review, DAY } from "./core/srs.js";

export const SKILLS = ["grammar", "vocabulary", "reading", "listening", "writing", "speaking", "interaction"];

export function createStore(db, content, clock) {
  const listeners = new Set();
  const emit = what => listeners.forEach(fn => fn(what));
  // All writes go through one queue so read-modify-write updates never overwrite each other
  // (e.g. saving a note while toggling "reviewed").
  let chain = Promise.resolve();
  const serial = fn => (...args) => { const p = chain.then(() => fn(...args)); chain = p.catch(() => {}); return p; };

  async function updateSkill(skill, correct, weight = 1) {
    const s = (await db.get("skills", skill)) || { skill, attempts: 0, correct: 0, ewma: 0.5, lastT: 0 };
    s.attempts += 1;
    if (correct) s.correct += 1;
    const alpha = 0.12 * weight;
    s.ewma = s.ewma * (1 - alpha) + (correct ? 1 : 0) * alpha;
    s.lastT = clock();
    await db.put("skills", s);
  }

  async function getProgress(conceptId) {
    return (await db.get("progress", conceptId)) || { conceptId, status: "new", seen: 0, correct: 0, wrong: 0, recent: [], card: null, lastSeen: 0 };
  }

  async function updateProgress(conceptId, correct) {
    const p = await getProgress(conceptId);
    const now = clock();
    p.seen += 1;
    if (correct) p.correct += 1; else p.wrong += 1;
    p.recent = [...(p.recent || []), correct ? 1 : 0].slice(-12);
    p.lastSeen = now;
    if (p.status === "new") p.status = "learning";
    const acc = p.recent.reduce((a, b) => a + b, 0) / p.recent.length;
    if (p.recent.length >= 8 && acc >= 0.85 && p.status === "learning") {
      p.status = "mastered";
      p.card = review(p.card || newCard(now), 4, now);
    } else if (!correct && (p.status === "mastered" || p.status === "known" || p.status === "skipped") && acc < 0.6) {
      p.status = "learning";          // forgotten: back into active learning
    }
    await db.put("progress", p);
    return p;
  }

  // Mark a concept as already known (skip it). It will come back for a check-up later.
  const setKnown = serial(async function setKnown(conceptId, status = "skipped", days = 21) {
    const p = await getProgress(conceptId);
    const now = clock();
    p.status = status;
    p.card = { ...newCard(now), reps: 1, interval: days, due: now + days * DAY };
    await db.put("progress", p);
    emit("progress");
  });

  const recordAnswer = serial(async function recordAnswer({ item, response, result, source, mode = "practice", retestOf = null }) {
    const now = clock();
    const concept = content.concepts.get(item.conceptId);
    const skill = item.skill || (concept && concept.skill) || "grammar";
    await db.put("attempts", {
      t: now, itemId: item.id, conceptId: item.conceptId, skill, source, mode,
      response: String(response ?? ""), verdict: result.verdict, correct: result.correct, errorType: result.errorType || null
    });
    await updateSkill(skill, result.correct && result.verdict !== "accent");
    if (item.interaction) await updateSkill("interaction", result.correct);
    await updateProgress(item.conceptId, result.correct);

    const out = { captured: null, credited: [], mastered: [], reopened: false };
    const meaningfulMistake = !result.correct || result.verdict === "accent";

    if (retestOf) {
      const target = await db.get("errors", retestOf);
      if (target && !result.correct) {
        const updated = captureMistake(target, { item, concept, response, result, source, now });
        await db.put("errors", updated);
        out.captured = updated;
        out.reopened = target.status === "mastered";
      }
    }
    if (meaningfulMistake && !(out.captured && out.captured.errorType === result.errorType)) {
      const id = errorId(item.id, result.errorType);
      const existing = await db.get("errors", id);
      const e = captureMistake(existing, { item, concept, response, result, source, now });
      await db.put("errors", e);
      out.captured = out.captured || e;
      if (existing && existing.status === "mastered") out.reopened = true;
    }
    if (result.correct) {
      const all = await db.all("errors");
      const targets = relatedErrors(all, item, now).filter(e => !(result.verdict === "accent" && e.errorType === "accent"));
      if (retestOf && !targets.some(e => e.id === retestOf)) {
        const t = all.find(e => e.id === retestOf);
        if (t) targets.push(t);
      }
      for (const e of targets) {
        const u = recordSuccess(e, { item, response, source, now });
        await db.put("errors", u);
        out.credited.push(u);
        if (u.status === "mastered" && e.status !== "mastered") out.mastered.push(u);
      }
    }
    emit("answer");
    return out;
  });

  return {
    db, content, clock, serial,
    on: fn => (listeners.add(fn), () => listeners.delete(fn)),
    emit,
    recordAnswer, getProgress, setKnown,
    allProgress: () => db.all("progress"),
    skills: () => db.all("skills"),
    errors: () => db.all("errors"),
    getError: id => db.get("errors", id),
    updateError: serial(async (id, patch) => {
      const e = await db.get("errors", id);
      if (!e) return null;
      Object.assign(e, patch, { updatedAt: clock() });
      await db.put("errors", e);
      emit("errors");
      return e;
    }),
    deleteError: serial(async id => { await db.del("errors", id); emit("errors"); }),
    attempts: () => db.all("attempts"),
    async setting(key, fallback) { const s = await db.get("settings", key); return s ? s.value : fallback; },
    async setSetting(key, value) { await db.put("settings", { key, value }); emit("settings"); }
  };
}
