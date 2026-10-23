import { test } from "node:test";
import assert from "node:assert/strict";
globalThis.location = { hash: "#/learn/B2-SUBJ-01/practice" };
Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/156" }, configurable: true });
globalThis.matchMedia = () => ({ matches: true });
globalThis.innerWidth = 390;
const fb = await import("../js/feedback.js");

test("feedback becomes a pre-filled GitHub issue with context", () => {
  fb.noteItem({ id: "B2-SUBJ-01.e01", conceptId: "B2-SUBJ-01", type: "cloze", prompt: "Penso che Marco ___ (avere) ragione." });
  const ctx = fb.context();
  assert.equal(ctx.device, "Android");
  assert.equal(ctx.installed, true);
  const url = new URL(fb.issueUrl("My answer 'abbia' was marked wrong", ctx));
  assert.equal(url.origin + url.pathname, "https://github.com/ajoshi1education/allenamento/issues/new");
  assert.equal(url.searchParams.get("labels"), "app-feedback");
  assert.match(url.searchParams.get("title"), /^\[bug\] My answer/);
  assert.match(url.searchParams.get("body"), /B2-SUBJ-01\.e01/);
  assert.match(url.searchParams.get("body"), /#\/learn\/B2-SUBJ-01\/practice/);
  assert.equal(fb.kindOf("Can you add a dark mode for lessons?"), "idea");
  assert.equal(fb.kindOf("This Italian sounds unnatural"), "content");
});

test("answers that should be accepted count as content issues", () => {
  assert.equal(fb.kindOf("My answer 'ho saputo' should also be accepted here"), "content");
});
