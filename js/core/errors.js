// Error Bank rules. Pure functions: storage happens in js/store.js.
import { dayKey, DAY } from "./srs.js";

// Mastered only after correct answers on 3 different days since the last mistake,
// at least 2 of those days on a different item (a new sentence or context).
export const MASTERY = { days: 3, newContextDays: 2 };
const LEARNING_LADDER = [1, 3, 7];               // days until next retest while improving
const MASTERED_LADDER = [14, 30, 60, 120, 240];  // occasional revision after mastery

export const errorId = (itemId, errorType) => `${itemId}::${errorType}`;

export function itemErrorTypes(item) {
  const s = new Set();
  if (item.errorType) s.add(item.errorType);
  (item.traps || []).forEach(t => { if (!t.ok && t.errorType) s.add(t.errorType); });
  return s;
}

export function captureMistake(existing, { item, concept, response, result, source, now }) {
  const e = existing ? { ...existing, attempts: [...existing.attempts] } : {
    id: errorId(item.id, result.errorType),
    itemId: item.id,
    conceptId: item.conceptId,
    skill: item.skill || (concept && concept.skill) || "grammar",
    errorType: result.errorType,
    source,
    instruction: item.instruction || "",
    prompt: item.prompt,
    userAnswer: String(response),
    correctAnswer: result.expected,
    alternatives: result.alternatives || [],
    explanation: [result.note, result.why].filter(Boolean).join(" "),
    rule: concept ? (concept.rule || concept.title) : "",
    lessonLink: "#/learn/" + item.conceptId,
    firstSeen: now,
    timesWrong: 0,
    relapses: 0,
    notes: "",
    reviewed: false,
    masteryLevel: 0,
    masteredAt: null,
    attempts: []
  };
  if (existing && existing.status === "mastered") e.relapses += 1;
  e.timesWrong += 1;
  e.status = "open";
  e.lastSeen = now;
  e.lastFailAt = now;
  e.lastAnswer = String(response);
  e.nextReview = now;                 // due straight away: retest whenever you like
  e.attempts.push({ t: now, correct: false, itemId: item.id, answer: String(response), source, newContext: item.id !== e.itemId });
  e.updatedAt = now;
  return e;
}

// Only successes on a later calendar day than the last mistake count: getting it right
// five minutes after the correction shows short-term memory, not learning.
export function masteryProgress(e) {
  const since = e.lastFailAt || 0;
  const failDay = since ? dayKey(since) : null;
  const wins = e.attempts.filter(a => a.correct && a.t > since && dayKey(a.t) !== failDay);
  const days = new Set(wins.map(a => dayKey(a.t)));
  const newDays = new Set(wins.filter(a => a.itemId !== e.itemId).map(a => dayKey(a.t)));
  return { days: days.size, newContextDays: newDays.size, needDays: MASTERY.days, needNew: MASTERY.newContextDays };
}

export function recordSuccess(error, { item, response, source, now }) {
  const e = { ...error, attempts: [...error.attempts] };
  e.attempts.push({ t: now, correct: true, itemId: item.id, answer: String(response ?? ""), source, newContext: item.id !== e.itemId });
  e.lastSeen = now;
  e.updatedAt = now;
  const p = masteryProgress(e);
  if (e.status === "mastered") {
    // A revision only moves the schedule once per day.
    const today = dayKey(now);
    if (error.attempts.some(a => a.correct && dayKey(a.t) === today)) return e;
    e.masteryLevel = (e.masteryLevel || 0) + 1;
    e.nextReview = now + MASTERED_LADDER[Math.min(e.masteryLevel, MASTERED_LADDER.length - 1)] * DAY;
  } else if (p.days >= MASTERY.days && p.newContextDays >= MASTERY.newContextDays) {
    e.status = "mastered";
    e.masteredAt = now;
    e.masteryLevel = 0;
    e.nextReview = now + MASTERED_LADDER[0] * DAY;
  } else if (p.days === 0) {
    // Right again on the same day as the mistake: logged, but it stays open until a later day.
    e.status = "open";                 // and it stays due, so it can be retested again any time
  } else {
    e.status = "improving";
    e.nextReview = now + LEARNING_LADDER[Math.min(p.days - 1, LEARNING_LADDER.length - 1)] * DAY;
  }
  return e;
}

// Which stored errors does a correct answer on `item` count towards?
// The same item, or another item that tests the same concept and the same kind of mistake.
export function relatedErrors(errors, item, now) {
  const types = itemErrorTypes(item);
  const today = dayKey(now);
  return errors.filter(e => {
    const related = e.itemId === item.id || (e.conceptId === item.conceptId && types.has(e.errorType));
    if (!related) return false;
    // At most one passive credit per error per day: only distinct days count towards mastery anyway.
    return !e.attempts.some(a => a.correct && dayKey(a.t) === today);
  });
}

export const isDue = (e, now) => (e.nextReview || 0) <= now;

export function priority(e, now) {
  const statusW = e.status === "open" ? 5 : e.status === "improving" ? 2 : 0;
  const overdue = Math.min(10, Math.max(0, (now - (e.nextReview || now)) / DAY));
  const p = e.timesWrong * 2 + (e.relapses || 0) * 4 + statusW + overdue;
  return isDue(e, now) ? p : p * 0.3;
}

function matchesError(item, e) {
  return item.errorType === e.errorType || itemErrorTypes(item).has(e.errorType);
}

// Choose a retest item: prefer a *different* item for the same concept and error type.
export function pickRetestItem(error, pool, { recent = new Set(), rand = Math.random } = {}) {
  const same = pool.filter(i => i.conceptId === error.conceptId && i.id !== error.itemId && i.type !== "free" && !recent.has(i.id));
  const tiers = [same.filter(i => matchesError(i, error)), same];
  for (const t of tiers) if (t.length) return t[Math.floor(rand() * t.length)];
  return pool.find(i => i.id === error.itemId) || null;
}

export function buildQuiz(errors, pool, now, { n = 10, filter = () => true, rand = Math.random, includeAll = false } = {}) {
  const ranked = errors
    .filter(filter)
    .filter(e => includeAll || e.status !== "mastered" || isDue(e, now))
    .map(e => ({ e, p: priority(e, now) + rand() * 0.5 }))
    .sort((a, b) => b.p - a.p);
  const used = new Set();
  const out = [];
  for (const { e } of ranked) {
    if (out.length >= n) break;
    const item = pickRetestItem(e, pool, { recent: used, rand });
    if (!item || used.has(item.id)) continue;
    used.add(item.id);
    out.push({ error: e, item });
  }
  return out;
}

export function patterns(errors, now) {
  const group = key => {
    const m = new Map();
    for (const e of errors) {
      const k = e[key];
      const g = m.get(k) || { key: k, errors: 0, timesWrong: 0, open: 0, mastered: 0, relapses: 0 };
      g.errors += 1; g.timesWrong += e.timesWrong; g.relapses += e.relapses || 0;
      if (e.status === "mastered") g.mastered += 1; else g.open += 1;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.timesWrong - a.timesWrong);
  };
  const wrongIn = (from, to) => errors.reduce((n, e) => n + e.attempts.filter(a => !a.correct && a.t >= from && a.t < to).length, 0);
  return {
    byConcept: group("conceptId"),
    byType: group("errorType"),
    bySkill: group("skill"),
    last7: wrongIn(now - 7 * DAY, now + 1),
    prev7: wrongIn(now - 14 * DAY, now - 7 * DAY),
    repeated: errors.filter(e => e.timesWrong >= 2).length,
    forgotten: errors.filter(e => (e.relapses || 0) > 0).length
  };
}
