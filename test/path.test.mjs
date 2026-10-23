import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPath, nodeStates, planSession, xpSummary, sessionXp, unitProgress } from "../js/core/path.js";
import { buildIndex } from "../js/core/content.js";
import { loadAll } from "../scripts/validate-content.mjs";
import { evaluate, expand } from "../js/core/evaluate.js";

const all = loadAll();
const content = buildIndex(all);
content.curriculum = all.curriculum;
const def = JSON.parse(fs.readFileSync(new URL("../content/path.json", import.meta.url), "utf8"));
const path = buildPath(def, content);

test("path covers every curriculum concept exactly once, B2 before C1", () => {
  const planned = all.curriculum.strands.flatMap(s => s.concepts.map(c => c.id)).sort();
  const onPath = path.units.flatMap(u => u.conceptIds);
  assert.deepEqual([...onPath].sort(), planned);
  assert.equal(new Set(onPath).size, onPath.length);
  const firstC1 = onPath.findIndex(id => id.startsWith("C1"));
  assert.ok(onPath.slice(firstC1).every(id => id.startsWith("C1")));
});

test("every unit ends with a checkpoint; every content game is on the path once", () => {
  for (const u of path.units) assert.equal(u.nodes.at(-1).kind, "checkpoint");
  const games = path.nodes.filter(n => n.kind === "game").map(n => n.gameId);
  assert.equal(new Set(games).size, games.length);
  assert.deepEqual(games.sort(), [...content.games.keys()].sort());
});

test("states: first undone node is current, later ones locked; placement counts", () => {
  let s = nodeStates(path, new Map(), []);
  assert.equal(s.current, path.nodes[0].id);
  assert.equal(s.states.get(path.nodes[1].id), "locked");
  const done = new Map([[path.nodes[0].id, { t: 1 }]]);
  s = nodeStates(path, done, [{ conceptId: path.nodes[0].conceptId, status: "known" }]);
  assert.equal(s.current, path.nodes.find(n => n.conceptId !== path.nodes[0].conceptId).id, "a placed-out concept is skipped");
  assert.equal(unitProgress(path.units[0], s.states).done, 3);
});

test("every session on the path can be planned, and its exercises are valid", () => {
  for (const n of path.nodes) {
    if (n.kind === "game") continue;
    const plan = planSession(n, { content, path, rand: () => 0.42 });
    const ex = plan.steps.filter(s => s.type === "exercise");
    assert.ok(ex.length >= (n.kind === "learn" ? 2 : 5), `${n.id} has only ${ex.length} exercises`);
    for (const s of ex) {
      const it = s.item;
      if (it.type === "free") continue;
      const ans = it.type === "choice" ? [].concat(it.answer)[0] : expand(it.answers[0])[0];
      assert.ok(evaluate(it, ans).correct, `${it.id} rejects its own answer`);
    }
    if (n.kind === "learn") {
      assert.equal(plan.steps[0].card, "intro");
      assert.equal(plan.steps.at(-1).card, "recap");
    }
  }
});

test("practice weaves in due mistakes from earlier concepts", () => {
  const second = path.units[0].nodes.find(n => n.kind === "practice" && n.conceptId !== path.units[0].conceptIds[0]);
  const firstConcept = path.units[0].conceptIds[0];
  const item = content.poolFor(firstConcept)[0];
  const err = { id: item.id + "::x", itemId: item.id, conceptId: firstConcept, errorType: "x", status: "open", timesWrong: 2, relapses: 0, nextReview: 0, attempts: [] };
  const plan = planSession(second, { content, path, errors: [err], now: 1e12, rand: () => 0.3 });
  assert.ok(plan.steps.some(s => s.retestOf === err.id));
});

test("xp and streak", () => {
  const day = 864e5, now = new Date(2026, 9, 23, 12).getTime();
  const ev = [{ t: now, xp: 30 }, { t: now - day, xp: 20 }, { t: now - 2 * day, xp: 10 }];
  const x = xpSummary(ev, now, 50);
  assert.equal(x.todayXp, 30); assert.equal(x.streak, 3); assert.equal(x.goalMet, false); assert.equal(x.week.length, 7);
  assert.equal(sessionXp(8, 8, "practice"), 10 + 16 + 5);
});
