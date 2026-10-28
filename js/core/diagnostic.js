// Placement test. Unit by unit: two B2 concepts first; C1 concepts in that unit only if a B2 one
// was right. Correct answers on harder items mark a concept as "known" (skippable, with check-ups later).

export function pickProbe(pool, target, rand = Math.random) {
  const ok = pool.filter(i => i.type !== "free" && !(i.audio && !i.silentPrompt) && i.type !== "order");
  if (!ok.length) return null;
  const best = Math.min(...ok.map(i => Math.abs((i.difficulty || 2) - target)));
  const c = ok.filter(i => Math.abs((i.difficulty || 2) - target) === best);
  return c[Math.floor(rand() * c.length)];
}

export function createDiagnostic(content, { rand = Math.random, perStrandB2 = 2, perStrandC1 = 1 } = {}) {
  const strands = (content.curriculum ? content.curriculum.strands : content.units.map(u => ({ id: u.id, concepts: u.conceptIds.map(id => ({ id, cefr: content.concepts.get(id).cefr })) })))
    .map(s => ({ id: s.id, title: s.title, b2: shuffle(s.concepts.filter(c => c.cefr === "B2" && content.concepts.has(c.id)), rand), c1: shuffle(s.concepts.filter(c => c.cefr === "C1" && content.concepts.has(c.id)), rand) }))
    .filter(s => s.b2.length || s.c1.length);
  const results = [];
  let si = 0, phase = "b2", asked = 0;
  function next() {
    while (si < strands.length) {
      const s = strands[si];
      if (phase === "b2" && asked < perStrandB2 && s.b2[asked]) {
        const c = s.b2[asked++];
        const item = pickProbe(content.poolFor(c.id), 3, rand);
        if (item) return { item, conceptId: c.id, cefr: "B2", strand: s.id };
        continue;
      }
      if (phase === "b2") {
        const b2 = results.filter(r => r.strand === s.id && r.cefr === "B2");
        phase = "c1"; asked = 0;
        if (b2.length && !b2.some(r => r.correct)) { s.c1Skipped = true; phase = "done"; }
        continue;
      }
      if (phase === "c1" && asked < perStrandC1 && s.c1[asked]) {
        const c = s.c1[asked++];
        const item = pickProbe(content.poolFor(c.id), 4, rand);
        if (item) return { item, conceptId: c.id, cefr: "C1", strand: s.id };
        continue;
      }
      si++; phase = "b2"; asked = 0;
    }
    return null;
  }
  return {
    next,
    record(probe, correct) { results.push({ ...probe, itemId: probe.item.id, difficulty: probe.item.difficulty || 2, correct }); },
    results,
    estimate: () => estimate(results, content)
  };
}

function shuffle(a, rand) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

export function levelFrom(b2acc, c1acc, c1n) {
  if (b2acc == null) return null;
  if (b2acc >= 0.8 && c1n && c1acc >= 0.7) return "C1";
  if (b2acc >= 0.8 && c1n && c1acc >= 0.35) return "B2+";
  if (b2acc >= 0.5) return "B2";
  return "B1+";
}

export function estimate(results, content) {
  const acc = rs => (rs.length ? rs.filter(r => r.correct).length / rs.length : null);
  const bySkill = {};
  for (const r of results) {
    const skill = content.concepts.get(r.conceptId)?.skill || "grammar";
    (bySkill[skill] ||= []).push(r);
  }
  const skills = Object.fromEntries(Object.entries(bySkill).map(([k, rs]) => {
    const b2 = rs.filter(r => r.cefr === "B2"), c1 = rs.filter(r => r.cefr === "C1");
    return [k, { level: levelFrom(acc(b2), acc(c1), c1.length), b2: acc(b2), c1: acc(c1), n: rs.length }];
  }));
  const b2 = results.filter(r => r.cefr === "B2"), c1 = results.filter(r => r.cefr === "C1");
  return {
    overall: levelFrom(acc(b2), acc(c1), c1.length),
    skills,
    known: results.filter(r => r.correct && r.difficulty >= 3).map(r => r.conceptId),
    toLearn: results.filter(r => !r.correct).map(r => r.conceptId),
    asked: results.length, correct: results.filter(r => r.correct).length
  };
}
