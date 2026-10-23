// Checks every content file: unique IDs, links resolve, each item accepts its own answers and
// catches its own traps, and each concept has a lesson, enough exercises, a game and assessment criteria.
// Usage: node scripts/validate-content.mjs [--strict]   (exit code 1 on errors)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildIndex, gameItems } = await import(pathToFileURL(path.join(ROOT, "js/core/content.js")));
const { detectErrors } = await import(pathToFileURL(path.join(ROOT, "js/core/speechcheck.js")));
const { evaluate, expand, rubricRegex, checkWriting } = await import(pathToFileURL(path.join(ROOT, "js/core/evaluate.js")));
const BI = await import(pathToFileURL(path.join(ROOT, "scripts/build-index.mjs")));

export const MIN_EXERCISES = 8;
export const TYPES = ["cloze", "transform", "translate", "choice", "order", "free", "speak"];
export const SKILLS = ["grammar", "vocabulary", "reading", "listening", "writing", "speaking", "interaction"];
export const GAME_TYPES = ["detective", "dialogue", "gauntlet", "builder", "duel", "reading", "listening", "debate", "exam", "dictation"];
export const EXAM_SECTIONS = ["reading", "listening", "grammar", "vocabulary", "writing", "speaking"];
export const TENSES = ["presente", "imperfetto", "futuro", "condizionale", "congiuntivo", "congiuntivo_imperfetto", "passato_remoto"];
const path_ = p => path.join(ROOT, "content", p);
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, "content", p), "utf8"));

export function loadAll() {
  const { buildIndexFile } = BI;
  const index = buildIndexFile();
  const units = index.units.map(read), games = index.games.map(read);
  const curriculum = fs.existsSync(path.join(ROOT, "content/curriculum.json")) ? read("curriculum.json") : null;
  const vocab = (index.vocab || []).flatMap(read);
  const convos = (index.convos || []).map(read);
  const verbs = index.verbs ? read(index.verbs).verbs : [];
  const pathDef = index.path && fs.existsSync(path_(index.path)) ? read(index.path) : null;
  return { index, units, games, curriculum, vocab, convos, verbs, path: pathDef, errorTypes: read("error-types.json") };
}

// Regular conjugation, used to double-check verbs marked "regular" (incl. -care/-gare, -ciare/-giare, -isc-).
export function regularForms(v) {
  const inf = v.inf; const m = inf.match(/^(.*)(are|ere|ire)$/); if (!m) return null;
  let [, st, cl] = m; const isc = !!v.isc;
  const hard = cl === "are" && /[cg]$/.test(st);                 // cercare → cerchi, pagare → paghi
  const soft = cl === "are" && /[cg]i$/.test(st);                // mangiare → mangerò
  const dropI = cl === "are" && /i$/.test(st);                    // mangiare/studiare → mangi, studi (no double i)
  const sti = hard ? st + "h" : dropI ? st.slice(0, -1) : st;     // stem before i
  const fut = cl === "are" ? (hard ? st + "her" : soft ? st.slice(0, -1) + "er" : st + "er") : cl === "ere" ? st + "er" : st + "ir";
  const P = { are: ["o", "i", "a", "iamo", "ate", "ano"], ere: ["o", "i", "e", "iamo", "ete", "ono"], ire: ["o", "i", "e", "iamo", "ite", "ono"] }[cl];
  const pres = P.map((e, i) => (cl === "ire" && isc && [0, 1, 2, 5].includes(i) ? st + "isc" + e : (e[0] === "i" ? sti : (hard && e[0] === "e") ? st + "h" : st) + e));
  const vow = { are: "a", ere: "e", ire: "i" }[cl];
  const imp = ["vo", "vi", "va", "vamo", "vate", "vano"].map(e => st + vow + e);
  const futuro = ["ò", "ai", "à", "emo", "ete", "anno"].map(e => fut + e);
  const cond = ["ei", "esti", "ebbe", "emmo", "este", "ebbero"].map(e => fut + e);
  const csub = cl === "are" ? ["i", "i", "i", "iamo", "iate", "ino"].map((e, i) => (i < 3 || i === 5 ? sti : sti) + e) : ["a", "a", "a", "iamo", "iate", "ano"].map((e, i) => (isc && [0, 1, 2, 5].includes(i) ? st + "isc" : (e[0] === "i" ? sti : st)) + e);
  const cimp = ["ssi", "ssi", "sse", "ssimo", "ste", "ssero"].map(e => st + vow + e);
  const rem = cl === "are" ? ["ai", "asti", "ò", "ammo", "aste", "arono"] : cl === "ere" ? ["ei", "esti", "é", "emmo", "este", "erono"] : ["ii", "isti", "ì", "immo", "iste", "irono"];
  const remoto = rem.map(e => st + e);
  // noi/voi of congiuntivo for -care/-gare keep the h: cerchiamo, cerchiate
  return { presente: pres, imperfetto: imp, futuro, condizionale: cond, congiuntivo: csub, congiuntivo_imperfetto: cimp, passato_remoto: remoto };
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
    if (!TYPES.includes(it.type)) errors.push(`${it.id}: unknown type ${it.type}`);
    if (!it.prompt) errors.push(`${it.id}: no prompt`);
    if (it.type === "free") {
      if (!it.rubric || !it.rubric.length) errors.push(`${it.id}: free item needs a rubric`);
      for (const r of it.rubric || []) for (const p of [].concat(r.anyOf || [])) { try { rubricRegex(p); } catch { errors.push(`${it.id}: bad rubric regex ${p}`); } }
      if (!it.model) warnings.push(`${it.id}: free item has no model answer`);
      else {
        const w = checkWriting(it, it.model);
        const missed = w.checks.filter(c => !c.ok).map(c => c.label);
        if (missed.length) errors.push(`${it.id}: model answer fails its own rubric: ${missed.join("; ")}`);
        if (!w.lengthOk) warnings.push(`${it.id}: model answer length ${w.words} outside ${it.minWords}-${it.maxWords}`);
      }
      return;
    }
    if (it.type === "choice") {
      const ans = [].concat(it.answer);
      if (!Array.isArray(it.options) || !ans.length || ans.some(a => it.options[a] == null)) errors.push(`${it.id}: bad choice answer`);
      else if (!ans.every(a => evaluate(it, a).correct)) errors.push(`${it.id}: own answer rejected`);
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
    if (!SKILLS.includes(c.skill)) errors.push(`${c.id}: unknown skill ${c.skill}`);
    if (!/^(B2|C1)-[A-Z]+-\d\d$/.test(c.id)) errors.push(`${c.id}: id should look like B2-SUBJ-01`);
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
    if (!GAME_TYPES.includes(g.type)) errors.push(`${g.id}: unknown game type ${g.type}`);
    if (!g.conceptIds || !g.conceptIds.length) errors.push(`${g.id}: no conceptIds`);
    if (g.type === "exam") {
      if (!Array.isArray(g.sections) || g.sections.length < 4) errors.push(`${g.id}: an exam needs at least 4 sections`);
      for (const s of g.sections || []) {
        if (!EXAM_SECTIONS.includes(s.kind)) errors.push(`${g.id}: unknown section kind ${s.kind}`);
        if ((s.kind === "reading" || s.kind === "listening") && !(s.passage && s.passage.it)) errors.push(`${g.id}: ${s.kind} section needs passage.it`);
        if (!Array.isArray(s.items) || !s.items.length) errors.push(`${g.id}: section ${s.kind} has no items`);
      }
      if (typeof g.passMark !== "number") errors.push(`${g.id}: needs passMark (0-1)`);
    }
    if ((g.type === "reading" || g.type === "listening") && (!g.passage || !g.passage.it)) errors.push(`${g.id}: needs passage.it`);
    if (g.type === "dialogue") {
      const ids = new Set((g.nodes || []).map(n => n.id));
      if (!ids.has(g.start)) errors.push(`${g.id}: start node ${g.start} missing`);
      for (const n of g.nodes || []) {
        const nexts = [n.next, n.nextFail, ...(n.choices || []).map(c => c.next)].filter(Boolean);
        for (const x of nexts) if (!ids.has(x)) errors.push(`${g.id}: node ${n.id} points to missing ${x}`);
        if (!n.end && !nexts.length) errors.push(`${g.id}: node ${n.id} is a dead end (add end:true or next)`);
      }
      if (!(g.nodes || []).some(n => n.end)) errors.push(`${g.id}: no end node`);
    }
    if (["gauntlet", "builder", "duel"].includes(g.type)) for (const cid of g.conceptIds || []) if (idx.poolFor(cid).length < 4) warnings.push(`${g.id}: concept ${cid} has few items for a pool game`);
    for (const cid of g.conceptIds || []) if (!idx.concepts.has(cid)) errors.push(`${g.id}: unknown concept ${cid}`);
    gameItems(g).forEach(it => checkItem(it, "game " + g.id));
  }
  // Conversations (Convos tab): every rubric compiles, every model answer passes its own rubric,
  // and the spoken-mistake detectors never fire on the tutor's lines or the model answers.
  for (const cv of all.convos || []) {
    dup(cv.id, "convo");
    if (!/^CV-\d\d$/.test(cv.id)) errors.push(`${cv.id}: convo id should look like CV-01`);
    for (const c of cv.conceptIds || []) if (!idx.concepts.has(c)) errors.push(`${cv.id}: unknown concept ${c}`);
    if (!cv.tutor || !cv.tutor.name) errors.push(`${cv.id}: needs tutor.name`);
    if (!Array.isArray(cv.turns) || cv.turns.length < 4) errors.push(`${cv.id}: needs at least 4 turns`);
    const spoken = [cv.closing, ...(cv.turns || []).flatMap(t => [t.say, t.followOk, t.followMiss])].filter(Boolean);
    for (const line of spoken) { const h = detectErrors(line); if (h.length) errors.push(`${cv.id}: tutor line flagged as a mistake (${h.map(x => x.id)}): "${line}"`); }
    for (const t of cv.turns || []) {
      const where = `${cv.id}.${t.id}`;
      for (const k of ["id", "say", "en", "task", "model"]) if (!t[k]) errors.push(`${where}: missing ${k}`);
      if (!t.expect || !Array.isArray(t.expect.rubric) || !t.expect.rubric.length) { errors.push(`${where}: needs expect.rubric`); continue; }
      for (const r of t.expect.rubric) {
        if (r.errorType && !types[r.errorType]) errors.push(`${where}: unknown errorType ${r.errorType}`);
        if (r.conceptId && !idx.concepts.has(r.conceptId)) errors.push(`${where}: unknown concept ${r.conceptId}`);
        for (const p of [].concat(r.anyOf || [])) { try { rubricRegex(p); } catch { errors.push(`${where}: bad regex ${p}`); } }
      }
      const w = checkWriting(t.expect, t.model || "");
      const missed = w.checks.filter(c => !c.ok).map(c => c.label);
      if (missed.length) errors.push(`${where}: model answer fails its own rubric: ${missed.join("; ")}`);
      if (!w.lengthOk) errors.push(`${where}: model answer shorter than minWords`);
      const h = detectErrors(t.model || "");
      if (h.length) errors.push(`${where}: model answer flagged as a mistake (${h.map(x => x.id)})`);
    }
  }
  // Verb tables: complete, unique, and regular verbs match the regular pattern exactly.
  const seenV = new Set();
  for (const v of all.verbs || []) {
    const w = v.inf || "?";
    if (seenV.has(w)) errors.push(`verbs: ${w} twice`); seenV.add(w);
    for (const k of ["inf", "en", "aux", "participio", "gerundio"]) if (!v[k]) errors.push(`verbs ${w}: missing ${k}`);
    if (v.aux && !["avere", "essere", "avere/essere"].includes(v.aux)) errors.push(`verbs ${w}: aux must be avere, essere or avere/essere`);
    for (const t of TENSES) if (!Array.isArray(v.tempi?.[t]) || v.tempi[t].length !== 6 || v.tempi[t].some(f => !f || typeof f !== "string")) errors.push(`verbs ${w}: tense ${t} needs 6 forms`);
    if (!v.imperativo || ["tu", "lei", "noi", "voi"].some(p => !v.imperativo[p])) errors.push(`verbs ${w}: imperativo needs tu, lei, noi, voi`);
    if (v.regular) {
      const exp = regularForms(v);
      if (!exp) errors.push(`verbs ${w}: marked regular but the pattern is unknown`);
      else for (const t of TENSES.filter(t => !(t === "passato_remoto" && /ere$/.test(v.inf)))) (v.tempi?.[t] || []).forEach((f, i) => { if (exp[t] && exp[t][i] && f !== exp[t][i]) errors.push(`verbs ${w}: ${t}[${i}] is "${f}", regular pattern gives "${exp[t][i]}"`); });
    }
  }
  // Vocabulary seed
  const POS = ["noun", "verb", "adj", "adv", "expr", "idiom", "conn", "prep"];
  for (const v of all.vocab) {
    if (!v.id || !v.it || !v.en) { errors.push(`vocab entry missing id/it/en: ${JSON.stringify(v).slice(0, 80)}`); continue; }
    dup(v.id, "vocab");
    if (v.pos && !POS.includes(v.pos)) errors.push(`${v.id}: unknown pos ${v.pos}`);
    for (const c of v.conceptIds || []) if (!idx.concepts.has(c) && !(all.curriculum && all.curriculum.strands.some(s => s.concepts.some(x => x.id === c)))) errors.push(`${v.id}: unknown concept ${c}`);
  }
  // Guided path: every curriculum concept exactly once, every id real.
  if (all.path && all.curriculum) {
    const onPath = all.path.sections.flatMap(s => s.units.flatMap(u => u.concepts));
    const planned = new Set(all.curriculum.strands.flatMap(s => s.concepts.map(c => c.id)));
    const seenP = new Set();
    for (const id of onPath) { if (!planned.has(id)) errors.push(`path.json: unknown concept ${id}`); if (seenP.has(id)) errors.push(`path.json: ${id} appears twice`); seenP.add(id); }
    for (const id of planned) if (!seenP.has(id)) errors.push(`path.json: ${id} is missing from the path`);
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
