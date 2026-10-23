import { test } from "node:test";
import assert from "node:assert/strict";
import { captureMistake, recordSuccess, masteryProgress, relatedErrors, buildQuiz, pickRetestItem, patterns } from "../js/core/errors.js";
import { evaluate } from "../js/core/evaluate.js";
import { DAY } from "../js/core/srs.js";

const T0 = new Date(2026, 9, 1, 10).getTime();
const concept = { id: "C1", title: "Subj", skill: "grammar", rule: "rule text" };
const mk = (id, extra = {}) => ({ id, conceptId: "C1", type: "cloze", prompt: id + " ___", answers: ["sia"], focus: ["sia"], errorType: "verb-form",
  traps: [{ match: "è", errorType: "indicative-for-subjunctive", why: "w" }], ...extra });
const A = mk("A"), B = mk("B"), C = mk("C"), D = mk("D", { conceptId: "C2" });
const pool = [A, B, C, D];

function fail(existing, item, t, ans = "è") {
  const result = evaluate(item, ans);
  return captureMistake(existing, { item, concept, response: ans, result, source: "test", now: t });
}

test("captures the full error record", () => {
  const e = fail(null, A, T0);
  assert.equal(e.id, "A::indicative-for-subjunctive");
  assert.equal(e.userAnswer, "è");
  assert.equal(e.correctAnswer, "sia");
  assert.equal(e.explanation, "w");
  assert.equal(e.rule, "rule text");
  assert.equal(e.lessonLink, "#/learn/C1");
  assert.equal(e.status, "open");
  assert.equal(e.timesWrong, 1);
  assert.equal(e.attempts.length, 1);
});

test("repeat mistakes on the same item merge into one record", () => {
  let e = fail(null, A, T0);
  e = fail(e, A, T0 + DAY);
  assert.equal(e.timesWrong, 2);
  assert.equal(e.attempts.length, 2);
  assert.equal(e.userAnswer, "è", "original answer kept");
});

test("not mastered after one correct answer, or several on the same day", () => {
  let e = fail(null, A, T0);
  e = recordSuccess(e, { item: B, now: T0 + 1000 });
  assert.equal(e.status, "open", "same day as the mistake does not count");
  e = recordSuccess(e, { item: B, now: T0 + DAY });
  assert.equal(e.status, "improving");
  e = recordSuccess(e, { item: C, now: T0 + DAY + 2000 });
  e = recordSuccess(e, { item: B, now: T0 + DAY + 3000 });
  assert.equal(e.status, "improving");
  assert.equal(masteryProgress(e).days, 1);
});

test("same item on three days is not enough: needs new contexts", () => {
  let e = fail(null, A, T0);
  for (let d = 1; d <= 3; d++) e = recordSuccess(e, { item: A, now: T0 + d * DAY });
  assert.equal(e.status, "improving");
  assert.equal(masteryProgress(e).newContextDays, 0);
});

test("mastered after 3 different days with 2 new contexts; relapse reopens", () => {
  let e = fail(null, A, T0);
  e = recordSuccess(e, { item: B, now: T0 + 1 * DAY });
  e = recordSuccess(e, { item: A, now: T0 + 2 * DAY });
  assert.equal(e.status, "improving");
  e = recordSuccess(e, { item: C, now: T0 + 4 * DAY });
  assert.equal(e.status, "mastered");
  assert.ok(e.nextReview >= T0 + 4 * DAY + 14 * DAY, "still scheduled for occasional revision");
  e = fail(e, A, T0 + 30 * DAY);
  assert.equal(e.status, "open");
  assert.equal(e.relapses, 1);
  assert.equal(masteryProgress(e).days, 0, "progress resets after a new mistake");
});

test("a failure in between resets the streak", () => {
  let e = fail(null, A, T0);
  e = recordSuccess(e, { item: B, now: T0 + DAY });
  e = recordSuccess(e, { item: C, now: T0 + 2 * DAY });
  e = fail(e, A, T0 + 3 * DAY);
  e = recordSuccess(e, { item: B, now: T0 + 4 * DAY });
  assert.equal(e.status, "improving");
  assert.equal(masteryProgress(e).days, 1);
});

test("related errors: same concept and error type, not other concepts", () => {
  const e1 = fail(null, A, T0);
  const e2 = fail(null, D, T0);
  const rel = relatedErrors([e1, e2], B, T0 + DAY);
  assert.deepEqual(rel.map(e => e.id), [e1.id]);
});

test("retest picks a different item from the same concept", () => {
  const e = fail(null, A, T0);
  for (let i = 0; i < 20; i++) {
    const it = pickRetestItem(e, pool);
    assert.notEqual(it.id, "A");
    assert.equal(it.conceptId, "C1");
  }
});

test("quiz prioritises repeated errors and skips mastered ones that aren't due", () => {
  let rep = fail(null, A, T0); rep = fail(rep, A, T0 + 1); rep = fail(rep, A, T0 + 2);
  const once = fail(null, D, T0);
  let done = fail(null, B, T0);
  done = recordSuccess(done, { item: A, now: T0 + DAY });
  done = recordSuccess(done, { item: C, now: T0 + 2 * DAY });
  done = recordSuccess(done, { item: A, now: T0 + 3 * DAY });
  assert.equal(done.status, "mastered");
  const q = buildQuiz([once, rep, done], pool, T0 + 4 * DAY, { rand: () => 0 });
  assert.equal(q[0].error.id, rep.id);
  assert.ok(!q.some(x => x.error.id === done.id));
  assert.ok(q.every(x => x.item.id !== x.error.itemId || x.error.conceptId === "C2"), "new context when one exists");
});

test("patterns group by concept and type", () => {
  let a = fail(null, A, T0); a = fail(a, A, T0 + 1);
  const d = fail(null, D, T0);
  const p = patterns([a, d], T0 + DAY);
  assert.equal(p.byConcept[0].key, "C1");
  assert.equal(p.byType[0].key, "indicative-for-subjunctive");
  assert.equal(p.repeated, 1);
  assert.equal(p.last7, 3);
});

test("after mastery, several correct answers on one day move the revision date only once", () => {
  let e = fail(null, A, T0);
  e = recordSuccess(e, { item: B, now: T0 + 1 * DAY });
  e = recordSuccess(e, { item: C, now: T0 + 2 * DAY });
  e = recordSuccess(e, { item: B, now: T0 + 3 * DAY });
  assert.equal(e.status, "mastered");
  const next = e.nextReview;
  e = recordSuccess(e, { item: C, now: T0 + 3 * DAY + 1000 });
  assert.equal(e.nextReview, next);
  e = recordSuccess(e, { item: C, now: T0 + 20 * DAY });
  assert.ok(e.nextReview > next);
  assert.equal(e.masteryLevel, 1);
});
