// Error Bank: permanent record of mistakes. Search, filter, patterns, notes, retest in new contexts.
import { h, esc, md, runExercise, toast, fmtDate, fmtRel, errorLabel } from "../ui.js";
import { buildQuiz, masteryProgress, patterns, pickRetestItem, isDue } from "../core/errors.js";
import * as speech from "../speech.js";
import { aiEnabled, generateRetests } from "../ai.js";

const ST = { open: ["Open", "bad"], improving: ["Improving", "warn"], mastered: ["Mastered", "ok"] };

export async function render(view, ctx) {
  const [a] = ctx.params;
  if (a === "quiz") return quiz(view, ctx);
  if (a) return detail(view, ctx, a);
  return list(view, ctx);
}

async function list(view, ctx) {
  const { store, content, query } = ctx;
  const errors = await store.errors();
  const now = store.clock();
  const pat = patterns(errors, now);
  const due = errors.filter(e => isDue(e, now));
  const counts = { open: 0, improving: 0, mastered: 0 };
  errors.forEach(e => counts[e.status]++);
  const conceptTitle = id => content.concepts.get(id)?.title || id;
  const types = [...new Set(errors.map(e => e.errorType))];
  const concepts = [...new Set(errors.map(e => e.conceptId))];
  const skills = [...new Set(errors.map(e => e.skill))];

  view.replaceChildren(h(`<section class="page errorbank">
    <div class="page-head"><div><h1>Error Bank</h1><p class="muted">Every meaningful mistake, kept permanently. An error is mastered only after correct answers on 3 different days, 2 of them in new sentences. After that it still comes back now and then.</p></div>
      <div class="head-actions">
        <a class="btn primary ${due.length ? "" : "disabled"}" href="#/errors/quiz?due=1">Retest due (${due.length})</a>
        <a class="btn" href="#/errors/quiz">Personalised quiz</a></div></div>
    <div class="stat-row">
      <div class="stat card"><b>${errors.length}</b><span>recorded</span></div>
      <div class="stat card bad"><b>${counts.open}</b><span>open</span></div>
      <div class="stat card warn"><b>${counts.improving}</b><span>improving</span></div>
      <div class="stat card ok"><b>${counts.mastered}</b><span>mastered</span></div>
      <div class="stat card"><b>${pat.repeated}</b><span>repeated 2×+</span></div>
      <div class="stat card"><b>${pat.last7}</b><span>mistakes this week ${pat.prev7 || pat.last7 ? `<em class="${pat.last7 <= pat.prev7 ? "ok-t" : "bad-t"}">${pat.last7 <= pat.prev7 ? "▼" : "▲"} vs ${pat.prev7}</em>` : ""}</span></div>
    </div>
    ${errors.length ? `<div class="card patterns"><h3>Patterns in your mistakes</h3><div class="pat-cols">
      <div><h4>By concept</h4>${pat.byConcept.slice(0, 5).map(g => bar(conceptTitle(g.key), g.timesWrong, pat.byConcept[0].timesWrong, `#/errors?concept=${encodeURIComponent(g.key)}`, g.open)).join("")}</div>
      <div><h4>By type of mistake</h4>${pat.byType.slice(0, 5).map(g => bar(errorLabel(content, g.key), g.timesWrong, pat.byType[0].timesWrong, `#/errors?type=${encodeURIComponent(g.key)}`, g.open)).join("")}</div>
      <div><h4>Insights</h4><ul class="insights">${insights(pat, content, conceptTitle).map(i => `<li>${i}</li>`).join("")}</ul></div>
    </div></div>` : ""}
    <div class="filters card">
      <input type="search" id="q" placeholder="Search your answers, corrections, notes…" value="${esc(query.q || "")}">
      <select id="fStatus"><option value="">All statuses</option>${Object.keys(ST).map(s => `<option value="${s}" ${query.status === s ? "selected" : ""}>${ST[s][0]}</option>`).join("")}<option value="due" ${query.status === "due" ? "selected" : ""}>Due now</option><option value="unreviewed" ${query.status === "unreviewed" ? "selected" : ""}>Not reviewed</option></select>
      <select id="fType"><option value="">All mistake types</option>${types.map(t => `<option value="${esc(t)}" ${query.type === t ? "selected" : ""}>${esc(errorLabel(content, t))}</option>`).join("")}</select>
      <select id="fConcept"><option value="">All concepts</option>${concepts.map(c => `<option value="${esc(c)}" ${query.concept === c ? "selected" : ""}>${esc(conceptTitle(c))}</option>`).join("")}</select>
      <select id="fSkill"><option value="">All skills</option>${skills.map(s => `<option ${query.skill === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <select id="fSort"><option value="recent">Most recent</option><option value="count">Most repeated</option><option value="due">Due first</option><option value="old">Oldest</option></select>
      <button class="btn small" id="quizFiltered">Quiz these</button>
    </div>
    <div id="rows"></div>
  </section>`));

  const $ = s => view.querySelector(s);
  const paint = () => {
    const q = $("#q").value.trim().toLowerCase(), st = $("#fStatus").value, ty = $("#fType").value, co = $("#fConcept").value, sk = $("#fSkill").value, so = $("#fSort").value;
    let rows = errors.filter(e => (!st || (st === "due" ? isDue(e, now) : st === "unreviewed" ? !e.reviewed : e.status === st))
      && (!ty || e.errorType === ty) && (!co || e.conceptId === co) && (!sk || e.skill === sk)
      && (!q || [e.prompt, e.userAnswer, e.correctAnswer, e.notes, e.explanation, conceptTitle(e.conceptId)].join(" ").toLowerCase().includes(q)));
    const sorters = { recent: (a, b) => b.lastSeen - a.lastSeen, count: (a, b) => b.timesWrong - a.timesWrong || b.lastSeen - a.lastSeen, due: (a, b) => a.nextReview - b.nextReview, old: (a, b) => a.firstSeen - b.firstSeen };
    rows.sort(sorters[so]);
    $("#rows").replaceChildren(h(rows.length ? `<div class="err-list">${rows.map(e => row(e, content, now)).join("")}</div>`
      : `<div class="card empty">${errors.length ? "No errors match these filters." : "No mistakes recorded yet. They'll appear here automatically as you do lessons and games."}</div>`));
    $("#quizFiltered").onclick = () => { sessionStorage.setItem("quizIds", JSON.stringify(rows.map(r => r.id))); location.hash = "#/errors/quiz?list=1"; };
    $("#quizFiltered").disabled = !rows.length;
  };
  view.querySelectorAll(".filters input, .filters select").forEach(el => el.addEventListener("input", paint));
  paint();
}

function bar(label, n, max, href, open) {
  return `<a class="pbar" href="${href}"><span class="pl">${esc(label)}</span><span class="pt"><span style="width:${Math.max(6, 100 * n / max)}%"></span></span><span class="pn">${n}${open ? "" : " ✓"}</span></a>`;
}

function insights(p, content, title) {
  const out = [];
  if (p.byType[0]) out.push(`Your most frequent mistake type is <b>${esc(errorLabel(content, p.byType[0].key))}</b> (${p.byType[0].timesWrong}×).`);
  if (p.byConcept[0] && p.byConcept[0].open) out.push(`Weakest concept right now: <a href="#/learn/${esc(p.byConcept[0].key)}">${esc(title(p.byConcept[0].key))}</a>.`);
  if (p.forgotten) out.push(`${p.forgotten} error${p.forgotten > 1 ? "s" : ""} came back after being mastered. These get extra priority in quizzes.`);
  if (p.repeated) out.push(`${p.repeated} mistake${p.repeated > 1 ? "s have" : " has"} happened more than once.`);
  if (p.last7 < p.prev7) out.push(`Fewer mistakes this week than last (${p.last7} vs ${p.prev7}). Bene!`);
  return out.length ? out : ["Not enough data yet."];
}

function row(e, content, now) {
  const [lbl, cls] = ST[e.status];
  const p = masteryProgress(e);
  return `<a class="err-row card" href="#/errors/${encodeURIComponent(e.id)}">
    <div class="er-main">
      <div class="er-top"><span class="chip ${cls}">${lbl}</span><span class="chip">${esc(errorLabel(content, e.errorType))}</span>
        ${e.timesWrong > 1 ? `<span class="chip bad">${e.timesWrong}×</span>` : ""}${e.relapses ? `<span class="chip warn">forgotten ${e.relapses}×</span>` : ""}
        ${e.reviewed ? `<span class="chip info">reviewed</span>` : ""}${e.notes ? `<span class="chip">📝</span>` : ""}</div>
      <div class="er-prompt it">${md(e.prompt)}</div>
      <div class="er-ans"><span class="wrong it">✗ ${esc(e.userAnswer || "(no answer)")}</span><span class="right it">✓ ${esc(e.correctAnswer)}</span></div>
    </div>
    <div class="er-side small muted">
      <div>${esc(content.concepts.get(e.conceptId)?.title || e.conceptId)}</div>
      <div>${e.status === "mastered" ? "Revision" : "Retest"} ${isDue(e, now) ? "<b>due now</b>" : fmtRel(e.nextReview, now)}</div>
      ${e.status !== "mastered" ? `<div class="mini-prog" title="days / new contexts">${"●".repeat(p.days)}${"○".repeat(Math.max(0, p.needDays - p.days))}</div>` : ""}
    </div></a>`;
}

async function detail(view, ctx, id) {
  const { store, content } = ctx;
  const e = await store.getError(id);
  if (!e) { view.replaceChildren(h(`<div class="page"><a class="back" href="#/errors">← Error Bank</a><div class="card">This entry was removed.</div></div>`)); return; }
  const now = store.clock();
  const c = content.concepts.get(e.conceptId);
  const p = masteryProgress(e);
  const [lbl, cls] = ST[e.status];
  const similar = content.poolFor(e.conceptId).filter(i => i.id !== e.itemId).slice(0, 4);
  view.replaceChildren(h(`<section class="page narrow err-detail">
    <a class="back" href="#/errors">← Error Bank</a>
    <div class="card">
      <div class="er-top"><span class="chip ${cls}">${lbl}</span><span class="chip">${esc(errorLabel(content, e.errorType))}</span><span class="chip">${esc(e.skill)}</span><span class="cid">${esc(e.conceptId)}</span></div>
      ${e.instruction ? `<p class="muted small">${md(e.instruction)}</p>` : ""}
      <p class="er-prompt it big">${md(e.prompt)}</p>
      <div class="fb-row"><span class="lbl">You wrote</span><span class="wrong it">${esc(e.userAnswer || "(no answer)")}</span></div>
      <div class="fb-row"><span class="lbl">Correct</span><span class="right it strong">${esc(e.correctAnswer)}</span></div>
      ${e.alternatives && e.alternatives.length ? `<div class="fb-row"><span class="lbl">Also OK</span><span class="it">${e.alternatives.map(esc).join(" · ")}</span></div>` : ""}
      <p class="fb-why">${md(e.explanation)}</p>
      ${e.rule ? `<div class="rule-box"><b>Rule.</b> ${md(e.rule)}</div>` : ""}
      <div class="row-actions">
        <button class="btn primary" data-retest>Retest now, in a new sentence</button>
        <a class="btn ghost" href="${esc(e.lessonLink)}">Lesson: ${esc(c ? c.title : e.conceptId)}</a>
      </div>
    </div>
    <div id="retest"></div>
    <div class="card">
      <h3>Progress towards mastery</h3>
      <div class="mastery"><div><b>${p.days}/${p.needDays}</b><span>different days correct</span></div><div><b>${p.newContextDays}/${p.needNew}</b><span>days in a new context</span></div>
        <div><b>${e.timesWrong}</b><span>times wrong</span></div><div><b>${e.relapses || 0}</b><span>times forgotten</span></div></div>
      <p class="small muted">First seen ${fmtDate(e.firstSeen)} · source ${esc(e.source)} · next ${e.status === "mastered" ? "revision" : "retest"} ${isDue(e, now) ? "due now" : fmtRel(e.nextReview, now)}</p>
      <h4>History</h4>
      <ol class="history">${[...e.attempts].reverse().map(a => `<li class="${a.correct ? "ok-t" : "bad-t"}">${a.correct ? "✓" : "✗"} ${fmtDate(a.t)} · <span class="it">${esc(a.answer || "-")}</span> <span class="muted small">${a.newContext ? "new context" : "original item"}${a.source ? " · " + esc(a.source) : ""}</span></li>`).join("")}</ol>
    </div>
    <div class="card">
      <h3>Notes</h3>
      <textarea id="notes" rows="3" placeholder="Your own memory hook, e.g. 'sapere → sappia: double p!'">${esc(e.notes || "")}</textarea>
      <div class="row-actions">
        <button class="btn small" data-save>Save note</button>
        <label class="toggle"><input type="checkbox" id="reviewed" ${e.reviewed ? "checked" : ""}> Marked as reviewed</label>
        <span class="grow"></span>
        <button class="btn danger small" data-delete>Delete entry</button>
      </div>
    </div>
    ${similar.length ? `<div class="card"><h3>Similar exercises</h3><ul class="similar">${similar.map(i => `<li class="it">${md(i.prompt)}</li>`).join("")}</ul><a href="#/learn/${esc(e.conceptId)}/practice">Practise this concept →</a></div>` : ""}
  </section>`));
  view.querySelector("[data-save]").onclick = async () => { await store.updateError(id, { notes: view.querySelector("#notes").value }); toast("Note saved"); };
  view.querySelector("#reviewed").onchange = async ev => { await store.updateError(id, { reviewed: ev.target.checked }); toast(ev.target.checked ? "Marked as reviewed" : "Unmarked"); };
  view.querySelector("[data-delete]").onclick = async () => {
    if (!confirm("Delete this entry permanently? Its history will be lost.")) return;
    await store.deleteError(id); toast("Entry deleted"); location.hash = "#/errors";
  };
  view.querySelector("[data-retest]").onclick = async () => {
    let item = pickRetestItem(e, content.allItems());
    const host = view.querySelector("#retest");
    if (item.id === e.itemId && await aiEnabled()) {
      host.replaceChildren(h(`<div class="card muted">Writing a new sentence for you…</div>`));
      const gen = await generateRetests(e, content.concepts.get(e.conceptId));
      if (gen && gen.length) item = gen[0];
    }
    await runExercise(host, item, { store, source: "errorbank", mode: "retest", retestOf: e.id, silent: speech.isSilent(),
      banner: item.id === e.itemId ? "Retest: same item (no other sentence exists yet for this concept)" : "Retest in a new context" });
    detail(view, ctx, id);
  };
}

async function quiz(view, ctx) {
  const { store, content, query } = ctx;
  const now = store.clock();
  let errors = await store.errors();
  let title = "Personalised quiz";
  let filter = () => true;
  if (query.due) { filter = e => isDue(e, now); title = "Due retests"; }
  if (query.concept) { filter = e => e.conceptId === query.concept; title = "Retest: " + (content.concepts.get(query.concept)?.title || query.concept); }
  if (query.list) { const ids = new Set(JSON.parse(sessionStorage.getItem("quizIds") || "[]")); filter = e => ids.has(e.id); title = "Quiz: filtered errors"; }
  const plan = buildQuiz(errors, content.allItems(), now, { n: Number(query.n) || 10, filter, includeAll: !!(query.list || query.concept) });
  if (!plan.length) {
    view.replaceChildren(h(`<section class="page narrow"><a class="back" href="#/errors">← Error Bank</a><div class="card empty">
      <h2>Nothing to retest</h2><p>${errors.length ? "No errors are due right now. Mastered ones come back on their own schedule." : "Your Error Bank is empty. Do a lesson or a game first."}</p>
      <a class="btn primary" href="#/play">Play a game</a></div></section>`));
    return;
  }
  view.replaceChildren(h(`<section class="page narrow">
    <a class="back" href="#/errors">← Error Bank</a>
    <div class="session-bar"><span class="sb-title">${esc(title)}</span><div class="progress-dots">${plan.map(() => "<span></span>").join("")}</div><span class="sb-count"></span></div>
    <div id="ex"></div></section>`));
  const host = view.querySelector("#ex"), dots = view.querySelectorAll(".progress-dots span");
  let right = 0, mastered = 0;
  const useAi = await aiEnabled();
  for (let [i, { error, item }] of plan.entries()) {
    // No other sentence exists for this mistake: ask the optional AI for a fresh, self-checked one.
    if (useAi && item.id === error.itemId) {
      const gen = await generateRetests(error, content.concepts.get(error.conceptId));
      if (gen && gen.length) item = gen[0];
    }
    view.querySelector(".sb-count").textContent = `${i + 1}/${plan.length}`;
    dots[i].classList.add("cur");
    const banner = `Targets your mistake: <b>${esc(errorLabel(content, error.errorType))}</b>, originally on <span class="it">“${esc(error.correctAnswer)}”</span>${item.id === error.itemId ? "" : " · new sentence"}`;
    const { result, outcome } = await runExercise(host, item, { store, source: "quiz", mode: "retest", retestOf: error.id, banner, silent: speech.isSilent() });
    dots[i].className = result.correct ? "ok" : "bad";
    if (result.correct) right++;
    mastered += outcome.mastered.length;
  }
  host.replaceChildren(h(`<div class="card summary">
    <div class="big-score ${right === plan.length ? "ok" : "warn"}">${right}/${plan.length}</div>
    <p>${mastered ? `★ ${mastered} error${mastered > 1 ? "s" : ""} reached mastery. ` : ""}Correct answers count towards mastery once per day. Come back tomorrow to keep the streak going.</p>
    <div class="row-actions"><a class="btn primary" href="#/errors">Back to the Error Bank</a><a class="btn ghost" href="#/play">Play</a></div></div>`));
}
