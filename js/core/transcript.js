// Joins the pieces a speech recogniser sends into one sentence.
// Chrome on Android (and sometimes iOS) repeats itself: each "final" piece can contain everything
// said so far ("ciao", "ciao come", "ciao come stai"), or the same piece arrives several times.
// Naively joining them gives "ciao ciao come ciao come stai". This keeps each word once.
const norm = w => w.toLowerCase().replace(/[.,!?;:«»"“”]/g, "").replace(/’/g, "'");

export function mergeSegments(pieces) {
  let words = [];
  for (const piece of pieces) {
    const add = String(piece || "").trim().split(/\s+/).filter(Boolean);
    if (!add.length) continue;
    const a = words.map(norm), b = add.map(norm);
    const same = (i, j, n) => { for (let k = 0; k < n; k++) if (a[i + k] !== b[j + k]) return false; return true; };
    // 1. the new piece repeats everything so far, and maybe more: replace
    if (b.length >= a.length && same(0, 0, a.length)) { words = add; continue; }
    // 2. the new piece is already the end of what we have: skip it
    if (b.length <= a.length && same(a.length - b.length, 0, b.length)) continue;
    // 3. the new piece starts with the last few words we have: add only the new part
    let overlap = 0;
    for (let n = Math.min(a.length, b.length - 1); n >= 2; n--) if (same(a.length - n, 0, n)) { overlap = n; break; }
    words = words.concat(add.slice(overlap));
  }
  return words.join(" ");
}
