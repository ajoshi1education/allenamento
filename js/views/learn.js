// Learn tab: curriculum overview → concept lesson → graded practice.
import { h, esc, md, runExercise, toast, shuffle } from "../ui.js";
import * as speech from "../speech.js";

const STATUS = {
  new: ["Not started", ""], learning: ["Learning", "warn"], mastered: ["Mastered", "ok"],
  known: ["Known (placement)", "ok"], skipped: ["Skipped: check-up later", "info"]
};

export async function render(view, ctx) {
  const [id, sub] = ctx.params;
  if (id && sub === "practice") return practice(view, ctx, id);
  if (id) return lesson(view, ctx, id);
  return overview(view, ctx);
}

async function overview(view, { store, content }) {
  const [progress, errors] = await Promise.all([store.allProgress(), store.errors()]);
  const P = new Map(progress.map(p => [p.conceptId, p]));
  const openBy = c => errors.filter(e => e.conceptId === c && e.status !== "mastered").length;
  const now = store.clock();
  const dueChecks = progress.filter(p => (p.status === "skipped" || p.status === "known" || p.status === "mastered") && p.card && p.card.due <= now);
  const next = content.units.flatMap(u => u.conceptIds).find(c => !P.get(c) || P.get(c).status === "new" || P.get(c).status === "learning");

  view.replaceChildren(h(`<section class="page">
    <div class="page-head"><div><h1>Learn</h1><p class="muted">B2 → C1 curriculum. Every concept links to its lesson, exercises, games and assessment criteria.</p></div>
      <div class="head-actions">${next ? `<a class="btn primary" href="#/learn/${esc(next)}">Continue: ${esc(content.concepts.get(next).title.split(" after ")[0])}</a>` : ""}
      <a class="btn ghost" href="#/learn/coverage">Curriculum coverage</a></div></div>
    ${dueChecks.length ? `<div class="card notice">🔁 ${dueChecks.length} concept${dueChecks.length > 1 ? "s" : ""} you skipped or mastered ${dueChecks.length > 1 ? "are" : "is"} due a quick check-up:
      ${dueChecks.map(p => `<a href="#/learn/${esc(p.conceptId)}/practice">${esc(content.concepts.get(p.conceptId)?.title || p.conceptId)}</a>`).join(", ")}</div>` : ""}
    ${content.units.map(u => `<div class="unit">
      <h2><span class="unit-id">${esc(u.id)}</span> ${esc(u.title)} <span class="chip">${esc(u.cefr)}</span></h2>
      <div class="concept-grid">${u.conceptIds.map(cid => {
        const c = content.concepts.get(cid), p = P.get(cid) || { status: "new", seen: 0, correct: 0 };
        const [label, cls] = STATUS[p.status] || STATUS.new;
        const acc = p.seen ? Math.round(100 * p.correct / p.seen) : null;
        const open = openBy(cid);
        return `<a class="concept card" href="#/learn/${esc(cid)}">
          <div class="c-top"><span class="cid">${esc(cid)}</span><span class="chip ${cls}">${label}</span></div>
          <h3>${esc(c.title)}</h3>
          <div class="c-meta"><span>${(content.poolFor(cid)).length} exercises</span><span>${(content.gamesByConcept.get(cid) || []).length} games</span>
            ${acc !== null ? `<span>${acc}% accuracy</span>` : ""}${open ? `<span class="bad-t">${open} open errors</span>` : ""}</div>
          ${p.seen ? `<div class="bar"><span style="width:${acc}%"></span></div>` : ""}
        </a>`;
      }).join("")}</div></div>`).join("")}
  </section>`));
}

async function lesson(view, ctx, id) {
  const { store, content } = ctx;
  if (id === "coverage") return (await import("./coverage.js")).render(view, ctx);
  const c = content.concepts.get(id);
  if (!c) { view.replaceChildren(h(`<div class="card">Unknown concept ${esc(id)}. <a href="#/learn">Back</a></div>`)); return; }
  const p = await store.getProgress(id);
  const errors = (await store.errors()).filter(e => e.conceptId === id);
  const games = (content.gamesByConcept.get(id) || []).map(g => content.games.get(g));
  const L = c.lesson;
  const say = t => `${speech.canSpeak() ? `<button class="say" data-say="${esc(t.replace(/\*/g, ""))}" title="Listen">🔊</button>` : ""}`;

  view.replaceChildren(h(`<article class="page lesson">
    <a class="back" href="#/learn">← All concepts</a>
    <div class="page-head"><div><span class="cid">${esc(c.id)} · ${esc(c.cefr)} · ${esc(c.skill)}</span><h1>${esc(c.title)}</h1></div>
      <div class="head-actions"><a class="btn primary" href="#/learn/${esc(id)}/practice">Practise (${content.poolFor(id).length})</a>
      ${p.status === "skipped" || p.status === "known" ? "" : `<button class="btn ghost" data-skip>I already know this</button>`}</div></div>
    <p class="lead">${md(L.intro)}</p>
    ${L.rules.map(r => `<section class="card rule"><h3>${md(r.title)}</h3><p>${md(r.text)}</p>
      ${r.table ? `<div class="table-wrap"><table class="forms"><thead><tr>${r.table.head.map(x => `<th>${esc(x)}</th>`).join("")}</tr></thead>
        <tbody>${r.table.rows.map(row => `<tr>${row.map((x, i) => i ? `<td class="it">${esc(x)}</td>` : `<th>${esc(x)}</th>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
      ${(r.examples || []).map(e => `<div class="example"><span class="it">${md(e.it)}</span> ${say(e.it)}<span class="en">${esc(e.en)}</span></div>`).join("")}
    </section>`).join("")}
    ${L.mistakes && L.mistakes.length ? `<section class="card"><h3>Common mistakes</h3>${L.mistakes.map(m => `<div class="mistake"><span class="wrong it">✗ ${md(m.wrong)}</span><span class="right it">✓ ${md(m.right)}</span><p class="small">${md(m.why)}</p></div>`).join("")}</section>` : ""}
    ${L.tips && L.tips.length ? `<section class="card tips"><h3>Tips</h3><ul>${L.tips.map(t => `<li>${md(t)}</li>`).join("")}</ul></section>` : ""}
    <section class="card"><h3>You can do this when you…</h3><ul class="checks">${c.assessment.map(a => `<li>${esc(a)}</li>`).join("")}</ul></section>
    ${games.length ? `<section class="card"><h3>Linked games</h3><div class="game-links">${games.map(g => `<a class="btn ghost" href="#/play/${esc(g.id)}">${esc(g.title)}</a>`).join("")}</div></section>` : ""}
    ${errors.length ? `<section class="card"><h3>Your mistakes on this concept</h3><p>${errors.length} recorded, ${errors.filter(e => e.status !== "mastered").length} still open. <a href="#/errors?concept=${esc(id)}">See them in the Error Bank →</a></p></section>` : ""}
  </article>`));
  view.addEventListener("click", e => { const b = e.target.closest("[data-say]"); if (b) speech.say(b.dataset.say); });
  view.querySelector("[data-skip]")?.addEventListener("click", async () => {
    await store.setKnown(id, "skipped", 21);
    toast("Marked as known. You'll get a short check-up in 3 weeks.");
    location.hash = "#/learn";
  });
}

async function practice(view, ctx, id) {
  const { store, content } = ctx;
  const c = content.concepts.get(id);
  const all = content.poolFor(id).filter(i => i.type !== "free");
  // Lesson items first; game items only top up a short pool (so games stay fresh).
  const lessonItems = all.filter(i => i.source === "lesson");
  const pool = lessonItems.length >= 10 ? lessonItems : all;
  // Progressive: easy → hard, random within each level, at most 12.
  const picked = shuffle(pool).slice(0, 12);
  const items = picked.sort((a, b) => (a.difficulty || 1) - (b.difficulty || 1));
  let i = 0, right = 0;
  const wrongs = [];
  view.replaceChildren(h(`<section class="page narrow">
    <a class="back" href="#/learn/${esc(id)}">← ${esc(c.title)}</a>
    <div class="session-bar"><span class="sb-title">Practice</span><div class="progress-dots">${items.map(() => "<span></span>").join("")}</div><span class="sb-count"></span></div>
    <div id="ex"></div></section>`));
  const host = view.querySelector("#ex"), dots = view.querySelectorAll(".progress-dots span"), count = view.querySelector(".sb-count");
  for (const item of items) {
    count.textContent = `${i + 1}/${items.length}`;
    dots[i].classList.add("cur");
    const { result } = await runExercise(host, item, { store, source: "lesson:" + id, mode: "practice", silent: ctx.silent });
    dots[i].className = result.correct ? "ok" : "bad";
    if (result.correct) right++; else wrongs.push(item);
    i++;
  }
  const pct = Math.round(100 * right / items.length);
  const games = content.gamesByConcept.get(id) || [];
  host.replaceChildren(h(`<div class="card summary">
    <div class="big-score ${pct >= 80 ? "ok" : pct >= 50 ? "warn" : "bad"}">${pct}%</div>
    <p>${right} of ${items.length} correct.${wrongs.length ? ` ${wrongs.length} mistake${wrongs.length > 1 ? "s" : ""} saved to your Error Bank, where they'll come back in new sentences.` : " Nothing new for the Error Bank."}</p>
    <div class="row-actions">
      ${games.length ? `<a class="btn primary" href="#/play/${esc(games[0])}">Play: ${esc(content.games.get(games[0]).title)}</a>` : ""}
      ${wrongs.length ? `<a class="btn" href="#/errors/quiz?concept=${esc(id)}">Retest my mistakes</a>` : ""}
      <a class="btn ghost" href="#/learn/${esc(id)}/practice" onclick="location.reload()">Practise again</a>
      <a class="btn ghost" href="#/learn">Back to Learn</a>
    </div></div>`));
}
