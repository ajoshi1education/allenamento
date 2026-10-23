import { test } from "node:test";
import assert from "node:assert/strict";
import { createDiagnostic, levelFrom } from "../js/core/diagnostic.js";
import { buildIndex } from "../js/core/content.js";

function fakeContent() {
  const mk = (id, cefr, skill = "grammar") => ({ id, cefr, skill, title: id, lesson: {}, assessment: ["x"],
    exercises: [1, 2, 3, 4].map(d => ({ id: `${id}.e${d}`, type: "cloze", prompt: "a ___ b", answers: ["x"], difficulty: d })) });
  const units = [
    { unit: "U1", title: "A", concepts: [mk("B2-A-01", "B2"), mk("B2-A-02", "B2"), mk("C1-A-03", "C1"), mk("C1-A-04", "C1")] },
    { unit: "U2", title: "B", concepts: [mk("B2-B-01", "B2", "vocabulary"), mk("B2-B-02", "B2", "vocabulary"), mk("C1-B-03", "C1", "vocabulary")] }
  ];
  const c = buildIndex({ units, games: [], errorTypes: {} });
  c.curriculum = { strands: units.map(u => ({ id: u.unit, title: u.title, concepts: u.concepts.map(x => ({ id: x.id, cefr: x.cefr })) })) };
  return c;
}

function runWith(answer) {
  const d = createDiagnostic(fakeContent(), { rand: () => 0.4 });
  let p, asked = [];
  while ((p = d.next())) { asked.push(p); d.record(p, answer(p)); }
  return { d, asked, est: d.estimate() };
}

test("strong at B2, weak at C1 → B2, C1 still probed, only correct hard items skippable", () => {
  const { asked, est } = runWith(p => p.cefr === "B2");
  assert.ok(asked.some(p => p.cefr === "C1"));
  assert.equal(est.overall, "B2");
  assert.ok(est.known.every(id => id.startsWith("B2")));
  assert.ok(asked.filter(p => p.cefr === "B2").every(p => p.item.difficulty === 3), "B2 probes use difficulty 3");
  assert.ok(asked.filter(p => p.cefr === "C1").every(p => p.item.difficulty === 4), "C1 probes use difficulty 4");
});

test("all B2 wrong in a unit → its C1 concepts are not asked", () => {
  const { asked } = runWith(() => false);
  assert.equal(asked.filter(p => p.cefr === "C1").length, 0);
});

test("everything right → C1, per-skill levels", () => {
  const { est } = runWith(() => true);
  assert.equal(est.overall, "C1");
  assert.equal(est.skills.vocabulary.level, "C1");
  assert.equal(levelFrom(0.4, null, 0), "B1+");
});
