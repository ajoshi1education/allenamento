import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, streakDays, weekStart } from "../js/core/progress.js";
import { buildIndex } from "../js/core/content.js";
import { loadAll } from "../scripts/validate-content.mjs";
import { DAY } from "../js/core/srs.js";

const content = buildIndex(loadAll());
const now = new Date(2026, 9, 22, 18).getTime();   // a Thursday

test("streak counts consecutive days, tolerating today not done yet", () => {
  const a = [1, 2, 3].map(d => ({ t: now - d * DAY }));
  assert.equal(streakDays(a, now), 3);
  assert.equal(streakDays([...a, { t: now }], now), 4);
  assert.equal(streakDays([{ t: now - 3 * DAY }], now), 0);
  assert.equal(new Date(weekStart(now)).getDay(), 1, "weeks start on Monday");
});

test("report: skills, recommendations, achievements, challenges", () => {
  const attempts = Array.from({ length: 12 }, (_, i) => ({ t: now - i * 3600e3, skill: "grammar", correct: i % 3 !== 0, conceptId: "B2-SUBJ-01", itemId: "B2-SUBJ-01.e01", source: "game:G-DET-01", mode: "game" }));
  const errors = [{ id: "e1", conceptId: "B2-SUBJ-01", errorType: "indicative-for-subjunctive", status: "open", timesWrong: 2, relapses: 0, nextReview: now - 1, attempts: [{ t: now, correct: false }] },
                  { id: "e2", conceptId: "B2-SUBJ-01", errorType: "verb-form", status: "open", timesWrong: 1, relapses: 0, nextReview: now - 1, attempts: [] }];
  const r = buildReport({ attempts, errors, progress: [{ conceptId: "B2-SUBJ-01", status: "learning", seen: 12 }], skills: [{ skill: "grammar", attempts: 12, ewma: 0.66 }],
    vocab: [], imports: [], games: { "G-DET-01": { id: "G-DET-01", best: 0.8 } }, content }, now);
  assert.equal(r.recommendations[0].href, "#/errors/quiz?due=1");
  assert.ok(r.recommendations.some(x => x.kind === "weak"));
  assert.ok(r.achievements.find(a => a.id === "first-10").done);
  assert.ok(r.achievements.find(a => a.id === "detective").done);
  assert.ok(!r.achievements.find(a => a.id === "first-mastered").done);
  assert.equal(r.challenges.length, 3);
  assert.equal(r.skills.find(s => s.skill === "grammar").enough, true);
  assert.equal(r.recurring[0].key, "indicative-for-subjunctive");
});
