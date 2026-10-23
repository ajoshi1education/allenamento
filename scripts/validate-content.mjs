// Checks every content file: unique IDs, links resolve, each item accepts its own answers and
// catches its own traps, and each concept has a lesson, enough exercises, a game and assessment criteria.
// Usage: node scripts/validate-content.mjs [--strict]   (exit code 1 on errors)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildIndex, gameItems } = await import(pathToFileURL(path.join(ROOT, "js/core/content.js")));
const { evaluate, expand } = await import(pathToFileURL(path.join(ROOT, "js/core/evaluate.js")));

export const MIN_EXERCISES = 8;
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, "content", p), "utf8"));

export function loadAll() {
  const index = read("index.json");
  const units = index.units.map(read), games = index.games.map(read);
  const curriculum = fs.existsSync(path.join(ROOT, "content/curriculum.json")) ? read("curriculum.json") : null;
  const vocab = (index.vocab || []).flatMap(read);
  return { index, units, games, curriculum, vocab, errorTypes: read("error-types.json") };
}

export function validate(all) {
  const errors = [], warnings = [];
  const ids = new Set();
  const dup = (id, where) => { if (ids.has(id)) errors.push(`Duplicate id ${id} (${where})`); ids.add(id); };
  const idx = buildIndex(all);
  const types = all.errorTypes;

  const checkItem = (it, where) => {
    dup(it.id, where);
    if (!it.conceptId && !where.startsWith("concept")) errors.push(`${it.id}: missing conceptId`);
    if (it.conceptId && !idx.concepts.has(it.conceptId)) errors.push(`${it.id}: unknown concept ${it.conceptId}`);
    if (it.errorType && !types[it.errorType]) errors.push(`${it.id}: unknown errorType ${it.errorType}`);
    if (it.type === "free") return;
    if (it.type === "choice") {
      if (!Array.isArray(it.options) || it.options[it.answer] == null) errors.push(`${it.id}: bad choice answer`);
      else if (!evaluate(it, it.answer).correct) errors.push(`${it.id}: own answer rejected`);
    } else {
      if (!it.answers || !it.answers.length) { errors.push(`${it.id}: no answers`); return; }
      for (const a of it.answers.flatMap(p => expand(p))) {
        const r = evaluate(it, a);
        if (r.verdict !== "correct") errors.push(`${it.id}: accepted answer "${a}" evaluates as ${r.verdict}`);
      }
      if (it.type === "order") {
        const want = [...it.tokens].map(t => t.toLowerCase()).sort().join(" ");
        const got = expand(it.answers[0])[0].toLowerCase().replace(/[.,!?]/g, "").split(/\s+/).sort().join(" ");
        if (want !== got) errors.push(`${it.id}: tokens don't match the answer`);
      }
    }
    for (const t of it.traps || []) {
      if (t.errorType && !types[t.errorType]) errors.push(`${it.id}: trap has unknown errorType ${t.errorType}`);
      if (!t.match) continue;
      for (const f of (Array.isArray(t.match) ? t.match : [t.match]).flatMap(p => expand(p))) {
        if (it.type === "choice") continue;
        const r = evaluate(it, f);
        const want = t.ok ? "alternative" : "wrong";
        if (r.verdict !== want && !(t.ok && r.verdict === "correct")) errors.push(`${it.id}: trap "${f}" evaluates as ${r.verdict}, expected ${want}`);
      }
    }
  };

  for (const u of all.units) for (const c of u.concepts) {
    dup(c.id, "concept");
    if (!c.lesson || !c.lesson.intro) errors.push(`${c.id}: no lesson`);
    if (!c.assessment || !c.assessment.length) errors.push(`${c.id}: no assessment criteria`);
    if (!c.rule) warnings.push(`${c.id}: no one-line rule`);
    const ex = c.exercises || [];
    if (ex.length < MIN_EXERCISES) warnings.push(`${c.id}: only ${ex.length} exercises (want ${MIN_EXERCISES})`);
    if (!(idx.gamesByConcept.get(c.id) || []).length) warnings.push(`${c.id}: no linked game`);
    for (const p of c.prereqs || []) if (!all.units.some(u2 => u2.concepts.some(c2 => c2.id === p))) errors.push(`${c.id}: unknown prereq ${p}`);
    ex.forEach(e => checkItem({ ...e, conceptId: e.conceptId || c.id }, "concept " + c.id));
  }
  for (const g of all.games) {
    dup(g.id, "game");
    for (const cid of g.conceptIds || []) if (!idx.concepts.has(cid)) errors.push(`${g.id}: unknown concept ${cid}`);
    gameItems(g).forEach(it => checkItem(it, "game " + g.id));
  }
  // Curriculum map: every planned concept should eventually have content.
  const coverage = [];
  if (all.curriculum) {
    for (const strand of all.curriculum.strands) for (const c of strand.concepts) {
      const has = idx.concepts.get(c.id);
      coverage.push({ id: c.id, strand: strand.id, built: !!has, exercises: has ? (has.exercises || []).length : 0, games: (idx.gamesByConcept.get(c.id) || []).length });
    }
    for (const id of idx.concepts.keys()) if (!coverage.some(c => c.id === id)) errors.push(`${id}: has content but is not in curriculum.json`);
  }
  return { errors, warnings, coverage, concepts: idx.concepts.size, items: idx.items.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = validate(loadAll());
  r.warnings.forEach(w => console.log("warn  " + w));
  r.errors.forEach(e => console.log("ERROR " + e));
  const built = r.coverage.filter(c => c.built).length;
  console.log(`${r.concepts} concepts, ${r.items} items` + (r.coverage.length ? `, curriculum coverage ${built}/${r.coverage.length}` : ""));
  if (r.errors.length || (process.argv.includes("--strict") && r.warnings.length)) process.exit(1);
}
