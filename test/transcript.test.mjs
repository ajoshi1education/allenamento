import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSegments } from "../js/core/transcript.js";

test("Android-style growing pieces become one sentence", () => {
  assert.equal(mergeSegments(["si", "si gioca", "si gioca con una", "si gioca con una mazza"]), "si gioca con una mazza");
  assert.equal(mergeSegments(["Si gioca", "si gioca con una mazza."]), "si gioca con una mazza.");
});

test("the same piece sent several times is kept once", () => {
  assert.equal(mergeSegments(["penso che sia vero", "penso che sia vero", "penso che sia vero", "penso che sia vero", "penso che sia vero"]), "penso che sia vero");
});

test("separate sentences (desktop Chrome, or after a pause) are joined", () => {
  assert.equal(mergeSegments(["Si gioca con una mazza", "e si lancia la palla"]), "Si gioca con una mazza e si lancia la palla");
});

test("overlapping pieces add only the new words; genuine short repeats survive", () => {
  assert.equal(mergeSegments(["vorrei sapere se", "sapere se è possibile"]), "vorrei sapere se è possibile");
  assert.equal(mergeSegments(["no", "no, grazie"]), "no, grazie");
  assert.equal(mergeSegments(["è la casa", "la mia"]), "è la casa la mia");
  assert.equal(mergeSegments(["", "  ", "ciao"]), "ciao");
});
