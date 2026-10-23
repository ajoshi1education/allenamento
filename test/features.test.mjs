// Verb trainer, Dettato and mock exams.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildIndex } from "../js/core/content.js";
import { loadAll } from "../scripts/validate-content.mjs";
import { evaluate } from "../js/core/evaluate.js";
import { TENSES, formsFor, drillItem, buildDrill, wrongCounts } from "../js/core/verbs.js";
import { dictationItems } from "../js/games/dictation.js";
import { examSteps, sectionScores } from "../js/games/exam.js";
import { buildPath } from "../js/core/path.js";

const all = loadAll();
const content = buildIndex(all);
const verbs = all.verbs;
const V = inf => verbs.find(v => v.inf === inf);
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test("verb forms: passato prossimo agreement, alternatives, no imperative for modals", () => {
  assert.deepEqual(formsFor(V("andare"), "passato_prossimo", 0), ["sono andato", "sono andata"]);
  assert.deepEqual(formsFor(V("andare"), "passato_prossimo", 3), ["siamo andati", "siamo andate"]);
  assert.deepEqual(formsFor(V("fare"), "passato_prossimo", 1), ["hai fatto"]);
  assert.deepEqual(formsFor(V("andare"), "imperativo", 0), ["va'", "vai"]);
  assert.deepEqual(formsFor(V("potere"), "imperativo", 0), []);
  assert.equal(formsFor(V("dare"), "passato_remoto", 0)[0], "diedi");
});

test("verb drill items are gradable and accept every listed form", () => {
  const it = drillItem(V("andare"), "imperativo", 0);
  assert.equal(evaluate(it, "va'").correct, true);
  assert.equal(evaluate(it, "vai").correct, true);
  assert.equal(evaluate(it, "vada").correct, false);
  const c = drillItem(V("essere"), "congiuntivo", 0);
  assert.match(c.prompt, /^che io/);
  assert.equal(evaluate(c, "sia").correct, true);
  // every cell of every verb grades its own main form as correct
  for (const v of verbs) for (const t of TENSES) for (let p = 0; p < (t.id === "imperativo" ? 4 : 6); p++) {
    const f = formsFor(v, t.id, p);
    if (!f.length) continue;
    const r = evaluate(drillItem(v, t.id, p), f[0]);
    assert.equal(r.correct, true, `${v.inf} ${t.id} ${p}: ${f[0]}`);
  }
});

test("buildDrill respects filters, never asks modals' imperative, and favours verbs you got wrong", () => {
  const d = buildDrill(verbs, { tenses: ["imperativo"], n: 40, rand });
  assert.ok(d.length > 10);
  assert.ok(d.every(i => !/^verb:(potere|dovere):/.test(i.id)));
  const irr = buildDrill(verbs, { tenses: ["futuro"], onlyIrregular: true, n: 12, rand });
  assert.ok(irr.every(i => !V(i.id.split(":")[1]).regular));
  const wrong = wrongCounts([{ itemId: "verb:cogliere:futuro:0", timesWrong: 5, status: "open" }]);
  const w = buildDrill(verbs, { tenses: ["presente"], n: 12, wrong, rand });
  assert.ok(w.some(i => i.id.startsWith("verb:cogliere:")));
});

test("Dettato: sentences come from lessons, the transcript stays hidden, the sentence itself is accepted", () => {
  for (const g of all.games.filter(g => g.type === "dictation")) {
    const items = dictationItems(content, g.conceptIds, { n: 8, rand });
    assert.equal(items.length, 8, g.id);
    for (const it of items) {
      assert.equal(it.noTranscript, true);
      assert.equal(evaluate(it, it.audio).correct, true, it.audio);
      assert.equal(evaluate(it, it.audio.toLowerCase().replace(/[.!?,]/g, "")).correct, true, it.audio);
    }
  }
});

test("mock exams: every section scored, listening hides the text unless silent, exam closes each path section", () => {
  const exams = all.games.filter(g => g.type === "exam");
  for (const g of exams) {
    const steps = examSteps(g);
    const ex = steps.filter(s => s.type === "exercise");
    assert.equal(ex.length, g.sections.reduce((a, s) => a + s.items.length, 0));
    assert.ok(ex.filter(s => s.section === "listening").every(s => !s.item.passage));
    assert.ok(examSteps(g, { silent: true }).filter(s => s.section === "listening").every(s => s.item.passage));
    const scores = sectionScores(ex.map(s => ({ section: s.section, correct: true })));
    assert.equal(scores.length, g.sections.length);
  }
  const def = JSON.parse(fs.readFileSync(new URL("../content/path.json", import.meta.url), "utf8"));
  const path = buildPath(def, content);
  for (const s of def.sections) if (s.exam && content.games.has(s.exam)) {
    const sec = path.sections.find(x => x.id === s.id);
    assert.equal(sec.units.at(-1).nodes.at(-1).id, `exam:${s.exam}`);
  }
});
