// End-to-end workflow on the real content, using the in-memory database:
// learn → game mistake → Error Bank → retest in a new context over several days → mastered.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAll } from "../scripts/validate-content.mjs";
import { buildIndex } from "../js/core/content.js";
import { createMemoryDb, exportAll, importAll } from "../js/db.js";
import { createStore } from "../js/store.js";
import { evaluate } from "../js/core/evaluate.js";
import { buildQuiz } from "../js/core/errors.js";
import { DAY } from "../js/core/srs.js";

const content = buildIndex(loadAll());
let t = new Date(2026, 9, 1, 9).getTime();
const clock = () => t;

async function answer(store, itemId, response, extra = {}) {
  const item = content.items.get(itemId);
  const result = evaluate(item, response);
  return { result, ...(await store.recordAnswer({ item, response, result, source: extra.source || "test", ...extra })) };
}

test("full loop: mistake in the detective game → retested with new sentences → mastered only after 3 days", async () => {
  const db = createMemoryDb();
  const store = createStore(db, content, clock);

  // Lesson practice, correct
  const ok = await answer(store, "B2-SUBJ-01.e01", "abbia");
  assert.equal(ok.result.verdict, "correct");
  assert.equal(ok.captured, null);

  // Detective game: indicative instead of subjunctive
  const bad = await answer(store, "G-DET-01.s2", "è", { source: "game:G-DET-01" });
  assert.equal(bad.result.verdict, "wrong");
  assert.equal(bad.captured.errorType, "indicative-for-subjunctive");
  assert.equal(bad.captured.source, "game:G-DET-01");
  assert.match(bad.captured.explanation, /subjunctive/);
  let errs = await store.errors();
  assert.equal(errs.length, 1);

  // Persistence: export → fresh database → import
  const dump = await exportAll(db);
  const db2 = createMemoryDb();
  await importAll(db2, JSON.parse(JSON.stringify(dump)));
  const store2 = createStore(db2, content, clock);
  errs = await store2.errors();
  assert.equal(errs.length, 1);

  // Retest quiz uses a different item from the same concept
  const quiz = buildQuiz(errs, content.poolFor("B2-SUBJ-01"), t, { rand: () => 0.3 });
  assert.equal(quiz.length, 1);
  assert.notEqual(quiz[0].item.id, "G-DET-01.s2");
  assert.equal(quiz[0].item.conceptId, "B2-SUBJ-01");

  // Day 1: correct on a new item → improving, not mastered
  t += DAY;
  let r = await answer(store2, "B2-SUBJ-01.e02", "sia", { mode: "retest", retestOf: errs[0].id });
  assert.equal(r.credited[0].status, "improving");

  // Day 2: correct on another new item
  t += DAY;
  r = await answer(store2, "B2-SUBJ-01.e11", "siate", { mode: "retest", retestOf: errs[0].id });
  assert.equal(r.credited[0].status, "improving");

  // Day 3: third distinct day → mastered
  t += DAY;
  r = await answer(store2, "B2-SUBJ-01.e05", "stia", { mode: "retest", retestOf: errs[0].id });
  assert.equal(r.mastered.length, 1);
  assert.equal((await store2.getError(errs[0].id)).status, "mastered");

  // Weeks later the learner slips again → reopened
  t += 20 * DAY;
  r = await answer(store2, "G-DET-01.s2", "è");
  assert.equal(r.reopened, true);
  const e = await store2.getError(errs[0].id);
  assert.equal(e.status, "open");
  assert.equal(e.relapses, 1);
  assert.equal(e.timesWrong, 2);
});

test("failing a retest on a new item updates the original error", async () => {
  const store = createStore(createMemoryDb(), content, clock);
  const bad = await answer(store, "B2-SUBJ-01.e01", "ha");
  t += DAY;
  await answer(store, "B2-SUBJ-01.e08", "puoi", { mode: "retest", retestOf: bad.captured.id });
  const e = await store.getError(bad.captured.id);
  assert.equal(e.timesWrong, 2);
  assert.equal(e.attempts.at(-1).itemId, "B2-SUBJ-01.e08");
  assert.equal(e.attempts.at(-1).newContext, true);
  assert.equal((await store.errors()).length, 1, "same error type → no duplicate record");
});

test("notes, reviewed flag and delete", async () => {
  const store = createStore(createMemoryDb(), content, clock);
  const bad = await answer(store, "B2-SUBJ-01.e04", "sanno");
  await store.updateError(bad.captured.id, { notes: "sapere → sappia!", reviewed: true });
  const e = await store.getError(bad.captured.id);
  assert.equal(e.notes, "sapere → sappia!");
  assert.equal(e.reviewed, true);
  await store.deleteError(bad.captured.id);
  assert.equal((await store.errors()).length, 0);
});

test("skill and concept progress are tracked", async () => {
  const store = createStore(createMemoryDb(), content, clock);
  for (const [id, a] of [["B2-SUBJ-01.e01", "abbia"], ["B2-SUBJ-01.e02", "sei"]]) await answer(store, id, a);
  const p = await store.getProgress("B2-SUBJ-01");
  assert.equal(p.seen, 2); assert.equal(p.correct, 1); assert.equal(p.status, "learning");
  const g = (await store.skills()).find(s => s.skill === "grammar");
  assert.equal(g.attempts, 2);
});

test("concurrent updates to one error don't overwrite each other", async () => {
  const store = createStore(createMemoryDb(), content, clock);
  const bad = await answer(store, "B2-SUBJ-01.e04", "sanno");
  await Promise.all([store.updateError(bad.captured.id, { notes: "n1" }), store.updateError(bad.captured.id, { reviewed: true })]);
  const e = await store.getError(bad.captured.id);
  assert.equal(e.notes, "n1");
  assert.equal(e.reviewed, true);
});
