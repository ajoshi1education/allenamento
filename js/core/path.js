// The guided path: units → steps (lesson, practice, challenge per concept; games; unit checkpoint).
// Pure functions: build the path, work out what's done / current / locked, and plan each session.
import { buildQuiz } from "./errors.js";
import { dayKey } from "./srs.js";

export const STEP_KINDS = ["learn", "practice", "challenge"];
export const STEP_LABEL = { learn: "Lezione", practice: "Pratica", challenge: "Sfida", game: "Gioco", checkpoint: "Traguardo" };
export const CHECKPOINT_PASS = 0.75;

export function buildPath(def, content) {
  const nodes = [], units = [], sections = [];
  const placedGames = new Set();
  for (const s of def.sections) {
    const sec = { id: s.id, title: s.title, subtitle: s.subtitle, units: [] };
    for (const u of s.units) {
      const unit = { id: u.id, title: u.title, desc: u.desc, color: u.color, sectionId: s.id, conceptIds: u.concepts.filter(c => content.concepts.has(c)), nodes: [] };
      const pos = new Map(unit.conceptIds.map((c, i) => [c, i]));
      // a game goes after the last concept (in this unit) that it tests
      const gamesAfter = new Map();
      for (const g of content.games.values()) {
        if (g.importOnly || placedGames.has(g.id)) continue;
        const idx = (g.conceptIds || []).map(c => pos.get(c)).filter(i => i !== undefined);
        if (!idx.length) continue;
        const allPlacedHere = (g.conceptIds || []).every(c => pos.has(c) || !laterUnitHas(def, u.id, c));
        if (!allPlacedHere) continue;
        const at = Math.max(...idx);
        if (!gamesAfter.has(at)) gamesAfter.set(at, []);
        gamesAfter.get(at).push(g);
        placedGames.add(g.id);
      }
      unit.conceptIds.forEach((cid, i) => {
        const c = content.concepts.get(cid);
        for (const kind of STEP_KINDS) unit.nodes.push({ id: `${cid}:${kind}`, kind, conceptId: cid, unitId: u.id, title: c.title, cefr: c.cefr, skill: c.skill });
        for (const g of (gamesAfter.get(i) || []).sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2)))
          unit.nodes.push({ id: `game:${g.id}`, kind: "game", gameId: g.id, unitId: u.id, title: g.title, gameType: g.type });
      });
      unit.nodes.push({ id: `${u.id}:checkpoint`, kind: "checkpoint", unitId: u.id, title: `Traguardo: ${u.title}` });
      unit.nodes.forEach(n => nodes.push(n));
      units.push(unit);
      sec.units.push(unit);
    }
    sections.push(sec);
  }
  return { sections, units, nodes, byId: new Map(nodes.map(n => [n.id, n])), unitById: new Map(units.map(u => [u.id, u])) };
}

// Is concept c also in a unit *after* unitId? (Then the game belongs to that later unit.)
function laterUnitHas(def, unitId, c) {
  let seen = false;
  for (const s of def.sections) for (const u of s.units) {
    if (u.id === unitId) { seen = true; continue; }
    if (seen && u.concepts.includes(c)) return true;
  }
  return false;
}

// done: Map nodeId → {t, score}. Concepts placed out of / skipped count as done for their three steps.
export function nodeStates(path, done, progress) {
  const known = new Set(progress.filter(p => ["known", "skipped"].includes(p.status)).map(p => p.conceptId));
  const isDone = n => done.has(n.id) || (n.conceptId && known.has(n.conceptId));
  const states = new Map();
  let current = null;
  for (const n of path.nodes) {
    if (isDone(n)) states.set(n.id, "done");
    else if (!current) { current = n.id; states.set(n.id, "current"); }
    else states.set(n.id, "locked");
  }
  return { states, current, doneCount: [...states.values()].filter(s => s === "done").length, total: path.nodes.length };
}

export function unitProgress(unit, states) {
  const d = unit.nodes.filter(n => states.get(n.id) === "done").length;
  return { done: d, total: unit.nodes.length, complete: d === unit.nodes.length };
}

// ---- Session plans --------------------------------------------------------------
const usable = i => !i.passageOf || i.type === "choice";
function shuffle(a, rand) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
const byDiff = (lo, hi) => i => (i.difficulty || 2) >= lo && (i.difficulty || 2) <= hi;

function pickVaried(pool, n, rand, used = new Set()) {
  const out = [], types = new Map();
  for (const it of shuffle(pool, rand)) {
    if (out.length >= n || used.has(it.id)) continue;
    const t = types.get(it.type) || 0;
    if (t >= Math.ceil(n / 2)) continue;     // keep a mix of exercise types
    types.set(it.type, t + 1); out.push(it); used.add(it.id);
  }
  for (const it of shuffle(pool, rand)) { if (out.length >= n) break; if (!used.has(it.id)) { out.push(it); used.add(it.id); } }
  return out;
}

export function planSession(node, { content, path, errors = [], now = Date.now(), rand = Math.random }) {
  if (node.kind === "learn") return planLesson(node, content, rand);
  if (node.kind === "practice") {
    const pool = content.poolFor(node.conceptId).filter(i => usable(i) && i.type !== "free" && i.source === "lesson");
    const used = new Set();
    const items = [...pickVaried(pool.filter(byDiff(1, 2)), 4, rand, used), ...pickVaried(pool.filter(byDiff(2, 3)), 4, rand, used)];
    while (items.length < 8 && pool.length > items.length) items.push(...pickVaried(pool, 8 - items.length, rand, used));
    items.sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2));
    // weave in up to 2 due mistakes from earlier concepts (spaced review inside the flow)
    const earlier = new Set(path.nodes.slice(0, path.nodes.findIndex(n => n.id === node.id)).map(n => n.conceptId).filter(Boolean));
    const review = buildQuiz(errors.filter(e => earlier.has(e.conceptId)), content.allItems(), now, { n: 2, rand });
    const steps = items.map(item => ({ type: "exercise", item }));
    review.forEach((r, k) => steps.splice(Math.min(steps.length, 3 + k * 3), 0, { type: "exercise", item: r.item, retestOf: r.error.id, tag: "Ripasso" }));
    return { title: "Pratica", subtitle: content.concepts.get(node.conceptId).title, steps };
  }
  if (node.kind === "challenge") {
    const pool = content.poolFor(node.conceptId).filter(i => usable(i) && i.source === "lesson");
    const hard = pool.filter(byDiff(3, 5));
    const items = pickVaried(hard.length >= 6 ? hard : pool, 6, rand).sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2));
    return { title: "Sfida", subtitle: content.concepts.get(node.conceptId).title, steps: items.map(item => ({ type: "exercise", item })) };
  }
  if (node.kind === "checkpoint") {
    const unit = path.unitById.get(node.unitId);
    const per = Math.max(2, Math.ceil(12 / unit.conceptIds.length));
    const used = new Set(), items = [];
    for (const cid of unit.conceptIds) items.push(...pickVaried(content.poolFor(cid).filter(i => usable(i) && i.type !== "free" && byDiff(2, 5)(i)), per, rand, used));
    return { title: "Traguardo", subtitle: unit.title, checkpoint: true, steps: shuffle(items, rand).slice(0, 12).map(item => ({ type: "exercise", item })) };
  }
  return null;
}

function planLesson(node, content, rand) {
  const c = content.concepts.get(node.conceptId);
  const L = c.lesson || { intro: c.rule || c.title, rules: [] };
  const pool = content.poolFor(c.id).filter(i => i.source === "lesson" && usable(i) && !["free", "speak"].includes(i.type));
  const easy = shuffle(pool.filter(byDiff(1, 2)), rand).sort((a, b) => rank(a) - rank(b));
  const used = new Set();
  const take = list => { const it = list.find(i => !used.has(i.id)); if (it) used.add(it.id); return it; };
  const steps = [{ type: "card", card: "intro", concept: c }];
  (L.rules || []).forEach((rule, i) => {
    steps.push({ type: "card", card: "rule", concept: c, rule, index: i, of: L.rules.length });
    const it = take(easy) || take(pool);
    if (it) steps.push({ type: "exercise", item: it, quick: true });
  });
  if ((L.mistakes || []).length) steps.push({ type: "card", card: "mistakes", concept: c });
  for (let k = 0; k < 2; k++) { const it = take(pool.filter(byDiff(2, 3))) || take(pool); if (it) steps.push({ type: "exercise", item: it }); }
  steps.push({ type: "card", card: "recap", concept: c });
  return { title: "Lezione", subtitle: c.title, steps };
}
// recognition first (choice, order), production later
const rank = i => ({ choice: 0, order: 1, cloze: 2, transform: 3, translate: 4 }[i.type] ?? 5);

// ---- XP, daily goal, streak --------------------------------------------------------
export function sessionXp(correct, total, kind) {
  const base = { learn: 10, practice: 10, challenge: 15, checkpoint: 20, game: 15, review: 10 }[kind] || 10;
  return base + correct * 2 + (total && correct === total ? 5 : 0);
}

export function xpSummary(events, now, goal = 50) {
  const today = dayKey(now);
  const todayXp = events.filter(e => dayKey(e.t) === today).reduce((s, e) => s + (e.xp || 0), 0);
  const total = events.reduce((s, e) => s + (e.xp || 0), 0);
  const days = new Set(events.map(e => dayKey(e.t)));
  let streak = 0, t = now;
  if (!days.has(dayKey(t))) t -= 864e5;
  while (days.has(dayKey(t))) { streak++; t -= 864e5; }
  const week = [];
  for (let i = 6; i >= 0; i--) { const k = dayKey(now - i * 864e5); week.push({ day: k, xp: events.filter(e => dayKey(e.t) === k).reduce((s, e) => s + (e.xp || 0), 0) }); }
  return { todayXp, total, goal, goalMet: todayXp >= goal, streak, week };
}
