// Home: the guided path. Units in learning order, each a winding trail of steps that unlock one by one.
import { h, esc, md, toast, confirmDialog } from "../ui.js";
import { buildPath, nodeStates, planSession, unitProgress, xpSummary, STEP_LABEL } from "../core/path.js";
import { isDue } from "../core/errors.js";
import { runSession } from "../session.js";

const KIND_ICON = { learn: "📖", practice: "✏️", challenge: "⚡", checkpoint: "🏆" };
const GAME_ICON = { detective: "🕵️", dialogue: "💬", gauntlet: "⏱️", builder: "🧩", duel: "⚔️", reading: "📰", listening: "🎧", debate: "🎤" };
const OFFSETS = [0, 52, 84, 52, 0, -52, -84, -52];

let cachedPath = null;
export function getPath(content) {
  if (!cachedPath || cachedPath.content !== content) cachedPath = { content, path: buildPath(content.pathDef, content) };
  return cachedPath.path;
}

export async function render(view, ctx) {
  const { store, content } = ctx;
  const path = getPath(content);
  const [done, progress, errors, events, vocab, goal, diagDone] = await Promise.all([
    store.pathDone(), store.allProgress(), store.errors(), store.events(), store.vocab(), store.setting("dailyGoal", 50), store.setting("diagnosticDone", false)]);
  const { states, current, doneCount, total } = nodeStates(path, done, progress);
  const now = store.clock();
  const xp = xpSummary(events, now, goal);
  const dueErr = errors.filter(e => isDue(e, now)).length;
  const dueVocab = vocab.filter(v => v.card && v.card.due <= now).length;
  const started = doneCount > 0 || events.length > 0;
  const curNode = path.byId.get(current);

  view.replaceChildren(h(`<section class="path-page">
    <div class="path-col">
      ${!started ? `<div class="welcome card3d">
        <div class="welcome-art">☕</div>
        <div><h2>Benvenuto! Ready to go from B2 to C1?</h2>
        <p>Follow the path one step at a time: a short lesson, then practice, then a challenge, with games and a checkpoint at the end of each unit. Mistakes are saved and come back until you've mastered them.</p>
        <div class="row-actions"><button class="btn3d primary" data-start-first>Start the first lesson</button>
        ${!diagDone ? `<a class="btn3d ghost" href="#/diagnostic">I'm not a beginner: place me</a>` : ""}</div></div></div>` : ""}
      ${path.sections.map(sec => `<div class="section-head"><span>${esc(sec.id === "S1" ? "Sezione 1" : "Sezione 2")}</span><h2>${esc(sec.title)}</h2><p>${esc(sec.subtitle)}</p></div>
        ${sec.units.map((u, ui) => unitHtml(u, path, states, current, content, path.units.indexOf(u))).join("")}`).join("")}
      <div class="path-end">🏁 <b>C1</b>: end of the path. Complimenti!</div>
    </div>
    <aside class="side-col">
      <div class="card3d stats-card">
        <div class="stat-pill fire"><span>🔥</span><b>${xp.streak}</b><small>day streak</small></div>
        <div class="stat-pill gold"><span>⭐</span><b>${xp.total}</b><small>total XP</small></div>
        <div class="stat-pill green"><span>🗺️</span><b>${Math.round(100 * doneCount / total)}%</b><small>of the path</small></div>
      </div>
      <div class="card3d goal-card">
        <div class="goal-head"><h3>Daily goal</h3><span>${Math.min(xp.todayXp, xp.goal)}/${xp.goal} XP</span></div>
        <div class="goal-bar"><span style="width:${Math.min(100, 100 * xp.todayXp / xp.goal)}%"></span></div>
        <div class="week">${xp.week.map(d => `<div class="wd ${d.xp >= xp.goal ? "hit" : d.xp ? "some" : ""}" title="${d.day}: ${d.xp} XP"><i></i><small>${"LMMGVSD"[(new Date(d.day + "T12:00").getDay() + 6) % 7]}</small></div>`).join("")}</div>
      </div>
      <div class="card3d review-card ${dueErr || dueVocab ? "has-due" : ""}">
        <h3>🔁 Ripasso</h3>
        ${dueErr || dueVocab ? `<p>${dueErr ? `<b>${dueErr}</b> mistake${dueErr > 1 ? "s" : ""} to retest` : ""}${dueErr && dueVocab ? " · " : ""}${dueVocab ? `<b>${dueVocab}</b> flashcard${dueVocab > 1 ? "s" : ""} due` : ""}</p>
          <a class="btn3d blue" href="#/review">Start review</a>` : `<p class="muted">Nothing due. Your mistakes come back here on a schedule.</p>`}
      </div>
      ${curNode ? `<div class="card3d next-card"><h3>Up next</h3><p><b>${esc(STEP_LABEL[curNode.kind])}</b>: ${esc(curNode.title)}</p><button class="btn3d primary" data-go-current>Continue</button></div>` : ""}
    </aside>
  </section>`));

  // Node popover
  const pop = h(`<div class="node-pop" hidden></div>`);
  view.append(pop);
  view.onclick = e => {
    const n = e.target.closest(".node");
    if (!n) { if (!e.target.closest(".node-pop")) pop.hidden = true; return; }
    const node = path.byId.get(n.dataset.id);
    const st = states.get(node.id);
    const unit = path.unitById.get(node.unitId);
    const r = n.getBoundingClientRect(), vr = view.getBoundingClientRect();
    pop.className = `node-pop c-${unit.color} ${st}`;
    pop.innerHTML = `<div class="pop-kicker">${esc(STEP_LABEL[node.kind])}${node.cefr ? " · " + esc(node.cefr) : ""}</div>
      <div class="pop-title">${esc(node.title)}</div>
      <div class="pop-desc">${esc(stepDesc(node))}</div>
      ${st === "locked" ? `<p class="pop-note">Complete the steps before this one to unlock it, or start it anyway.</p>` : ""}
      <button class="btn3d ${st === "locked" ? "ghost" : "white"}" data-start="${esc(node.id)}">${st === "done" ? "Ripeti (+XP)" : st === "locked" ? "Start anyway" : "Inizia"}</button>
      ${node.conceptId ? `<a class="pop-link" href="#/learn/${esc(node.conceptId)}">Open the full guide</a>` : ""}`;
    pop.style.top = `${r.bottom - vr.top + 12}px`;
    pop.style.left = `${Math.max(8, Math.min(vr.width - 300, r.left - vr.left + r.width / 2 - 150))}px`;
    pop.hidden = false;
  };
  pop.addEventListener("click", e => { const b = e.target.closest("[data-start]"); if (b) { pop.hidden = true; start(path.byId.get(b.dataset.start)); } });
  view.querySelector("[data-go-current]")?.addEventListener("click", () => start(curNode));
  view.querySelector("[data-start-first]")?.addEventListener("click", () => start(curNode));
  view.querySelectorAll("[data-jump]").forEach(b => b.addEventListener("click", () => jump(path.unitById.get(b.dataset.jump))));

  let starting = false;
  async function start(node) {
    if (!node || starting) return;
    starting = true; setTimeout(() => (starting = false), 800);
    if (node.kind === "game") { location.hash = `#/play/${node.gameId}`; return; }
    const plan = planSession(node, { content, path, errors: await store.errors(), now: store.clock() });
    if (!plan || !plan.steps.length) { toast("Nothing to practise here yet."); return; }
    const unit = path.unitById.get(node.unitId);
    const res = await runSession(plan, { store, nodeId: node.id, kind: node.kind, accent: unit.color });
    if (!res.exited) { await render(view, ctx); scrollToCurrent(view, true); }
  }

  // "Jump here": pass this unit's checkpoint to skip everything before it.
  async function jump(unit) {
    if (!(await confirmDialog({ title: `Jump ahead to after "${unit.title}"?`, text: "Take this unit's checkpoint. Pass it (75%+) and every step up to the end of the unit is marked complete.", ok: "Take the test", cancel: "Not now" }))) return;
    const cp = unit.nodes.at(-1);
    const plan = planSession(cp, { content, path, errors: [], now: store.clock() });
    plan.title = "Salta qui";
    const res = await runSession(plan, { store, nodeId: null, kind: "checkpoint", accent: unit.color });
    if (res.exited) return;
    if (res.passed) {
      const upTo = path.nodes.slice(0, path.nodes.indexOf(cp) + 1).map(n => n.id);
      await store.jumpTo(upTo);
      toast(`Jumped ahead to after "${unit.title}"!`);
    } else toast("Not this time. Keep going step by step!");
    await render(view, ctx); scrollToCurrent(view, true);
  }

  if (started) scrollToCurrent(view, false);
}

function scrollToCurrent(view, smooth) {
  const cur = view.querySelector(".node.current");
  if (cur) setTimeout(() => cur.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" }), 50);
}

function stepDesc(n) {
  return {
    learn: "A short lesson: the rules in bite-size cards, each followed by a quick check.",
    practice: "8 exercises, easy to medium, plus any earlier mistakes that are due.",
    challenge: "6 harder exercises: translation, rewriting and production.",
    checkpoint: "A 12-question test across the whole unit. Pass with 75% to complete it.",
    game: "Put the unit into practice in a game."
  }[n.kind];
}

function unitHtml(u, path, states, current, content, idx) {
  const p = unitProgress(u, states);
  const hasCurrent = u.nodes.some(n => n.id === current);
  const allLocked = u.nodes.every(n => states.get(n.id) === "locked");
  let conceptSeen = new Set();
  return `<div class="unit-block c-${u.color}">
    <div class="unit-banner">
      <div><div class="ub-kicker">Unità ${idx + 1}</div><h3>${esc(u.title)}</h3><p>${esc(u.desc)}</p></div>
      <div class="ub-side">
        <div class="ub-ring" style="--p:${p.done / p.total}"><span>${p.complete ? "✓" : Math.round(100 * p.done / p.total) + "%"}</span></div>
        ${allLocked ? `<button class="btn3d white small" data-jump="${esc(u.id)}">⏩ Salta qui</button>` : ""}
      </div>
    </div>
    <div class="trail">${u.nodes.map((n, k) => {
      const st = states.get(n.id);
      const icon = n.kind === "game" ? GAME_ICON[n.gameType] || "🎲" : KIND_ICON[n.kind];
      const label = n.kind === "learn" && !conceptSeen.has(n.conceptId) ? (conceptSeen.add(n.conceptId), `<div class="concept-label ${OFFSETS[k % 8] > 0 ? "left" : "right"}">${esc(content.concepts.get(n.conceptId).title)}</div>`) : "";
      return `<div class="node-row" style="--x:${OFFSETS[k % 8]}px">${label}
        <button class="node ${st} k-${n.kind}" data-id="${esc(n.id)}" aria-label="${esc(STEP_LABEL[n.kind] + ": " + n.title)}">
          <span class="node-icon">${st === "locked" ? (n.kind === "checkpoint" ? "🏆" : "🔒") : icon}</span>
          ${st === "done" ? `<span class="node-check">✓</span>` : ""}
          ${st === "current" ? `<span class="start-tag">INIZIA</span>` : ""}
        </button></div>`;
    }).join("")}</div>
  </div>`;
}
