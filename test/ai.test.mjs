import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptGenerated } from "../js/ai.js";

const error = { id: "x::indicative-for-subjunctive", conceptId: "B2-SUBJ-01", skill: "grammar", errorType: "indicative-for-subjunctive" };

test("AI-generated items are only used when our own checker agrees with them", () => {
  const items = acceptGenerated([
    { type: "cloze", prompt: "Credo che Luca ___ (essere) in ufficio.", answers: ["sia"], wrong: ["è"], en: "I think Luca is in the office.", explanation: "Opinion → subjunctive." },
    { type: "cloze", prompt: "No gap here.", answers: ["sia"], wrong: [], en: "", explanation: "" },
    { type: "cloze", prompt: "Bad ___ item", answers: ["sia"], wrong: ["sia"], en: "", explanation: "" },
    { type: "translate", prompt: "I hope it's true.", answers: ["Spero che sia vero"], wrong: ["Spero che è vero"], en: "", explanation: "Hope → subjunctive." }
  ], error, 1);
  assert.equal(items.length, 3);  // "wrong" equal to answer is filtered out of traps, item kept
  assert.equal(items[0].conceptId, "B2-SUBJ-01");
  assert.equal(items[0].traps[0].match, "è");
  assert.ok(items.every(i => i.origin === "AI"));
});
