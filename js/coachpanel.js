// The Coach chat: a floating button on every screen. Ask in plain English (typed or spoken):
// "I'm struggling with the subjunctive and prepositions", "what should I do next?", "my weakest topics",
// "a conversation about work". It answers with lessons, practice, games and conversations to open.
import { h, esc, md } from "./ui.js";
import * as speech from "./speech.js";
import { bindMic } from "./mic.js";
import { findConcepts, parseIntent, resourcesFor, weakest, findConvos } from "./core/coach.js";
import { buildReport } from "./core/progress.js";
import { buildPath } from "./core/path.js";
import * as fb from "./feedback.js";

const SUGGEST = ["💡 Suggerisci un miglioramento", "I'm struggling with the subjunctive", "Prepositions or pronouns?", "What should I practise next?", "Show my weakest topics", "A conversation about work"];

export function mountCoach(store) {
  const content = store.content;
  let path = null;
  const fab = h(`<button class="coach-fab" title="Chiedi al coach" aria-label="Chiedi al coach">💬<span>Coach</span></button>`);
  const panel = h(`<div class="coach-panel" hidden role="dialog" aria-label="Coach">
    <div class="cp-head"><span class="cp-avatar">🧑‍🏫</span><div><b>Coach</b><small>Tell me what you find hard, and I'll find the right practice.</small></div><button class="icon-x" data-close aria-label="Chiudi">✕</button></div>
    <div class="cp-chat"></div>
    <div class="cp-suggest">${SUGGEST.map(s => `<button class="fchip">${esc(s)}</button>`).join("")}</div>
    <form class="cp-input"><input type="text" placeholder="e.g. I'm struggling with if clauses…" aria-label="Chiedi al coach">
      ${speech.hasRecognition() ? `<button type="button" class="mic-btn small" title="Parla (tocca, o tieni premuto)">🎤</button>` : ""}<button class="btn3d primary small">Chiedi</button></form>
  </div>`);
  document.body.append(fab, panel);
  const chat = panel.querySelector(".cp-chat"), input = panel.querySelector("input");
  const say = (html, who = "bot") => { const b = h(`<div class="cp-msg ${who}">${html}</div>`); chat.append(b); b.scrollIntoView({ block: "end", behavior: "smooth" }); return b; };
  const open = () => {
    panel.hidden = false; fab.hidden = true;
    if (!chat.children.length) say("Ciao! What would you like to work on? Tell me a topic you find hard, for example <i>the subjunctive</i>, <i>ci and ne</i> or <i>if clauses</i>, and I'll point you to the right lessons, games and conversations.");
    setTimeout(() => input.focus(), 50);
  };
  const close = () => { panel.hidden = true; fab.hidden = false; speech.stopListening(); feedbackFor = null; };
  // Feedback mode: the next message is a suggestion for the app (optionally about a specific exercise).
  let feedbackFor = null;
  function startFeedback(item = null) {
    feedbackFor = { item };
    say(item ? `What's wrong with this exercise (<span class="it">${esc(String(item.prompt || "").slice(0, 80))}</span>)? E.g. "my answer … should be accepted", "the explanation is unclear", "this Italian sounds unnatural".`
      : "Tell me what you'd like changed: something broken, confusing or missing, or an idea. Be as specific as you like. I'll turn it into a request that your Claude Code picks up and builds automatically.");
    input.placeholder = "Descrivi il problema o l'idea…";
    input.focus();
  }
  function sendFeedback(text) {
    const ctx = fb.context({ item: feedbackFor && feedbackFor.item });
    const url = fb.issueUrl(text, ctx);
    feedbackFor = null;
    input.placeholder = "e.g. I'm struggling with if clauses…";
    const m = say(`Got it. Here's your request:<div class="cp-card"><b>${esc(text)}</b><small>Screen ${esc(ctx.screen)}${ctx.exercise ? " · exercise " + esc(ctx.exercise.id) : ""} · ${esc(ctx.device)}/${esc(ctx.browser)}</small></div>
      <div class="cp-actions"><a class="btn3d primary small" href="${url}" target="_blank" rel="noopener" data-send-fb>Invia a GitHub ↗</a><button class="btn3d small" data-cancel-fb>Annulla</button></div>
      <p class="small muted">GitHub opens with everything filled in: just press <b>Submit new issue</b> (sign in as ajoshi1education the first time). Your Claude Code checks for new requests every few hours, builds the change, tests it, publishes the app and replies on the issue.</p>`);
    m.querySelector("[data-send-fb]").onclick = () => { fb.remember(text, url); setTimeout(() => say("Sent to GitHub. Once you press Submit there, it's in the queue. You can see all your requests at <a href=\"https://github.com/" + fb.REPO + "/issues\" target=\"_blank\" rel=\"noopener\">github.com/" + fb.REPO + "/issues</a>."), 400); };
    m.querySelector("[data-cancel-fb]").onclick = () => say("OK, annullato.");
  }
  fab.onclick = open;
  panel.querySelector("[data-close]").onclick = close;
  panel.addEventListener("click", e => { if (e.target.closest("a[href^='#/']")) close(); });
  panel.querySelectorAll(".cp-suggest .fchip").forEach(b => (b.onclick = () => (b.textContent.startsWith("💡") ? startFeedback() : ask(b.textContent))));
  panel.querySelector("form").onsubmit = e => { e.preventDefault(); const q = input.value.trim(); if (q) { input.value = ""; ask(q); } };
  const mic = panel.querySelector(".mic-btn");
  if (mic) bindMic(mic, async () => {
    mic.classList.add("on"); input.placeholder = "Ti ascolto…";
    const r = await speech.listen({ lang: "en-GB", onInterim: t => (input.value = t), onStatus: st => (input.placeholder = speech.MIC_STATUS[st]) });
    mic.classList.remove("on"); input.placeholder = "e.g. I'm struggling with if clauses…";
    if (r.text) { input.value = ""; ask(r.text); }
  });

  async function ask(q) {
    say(esc(q), "me");
    if (feedbackFor) { sendFeedback(q); return; }
    // Messages that are clearly suggestions about the app itself go straight to feedback.
    if (/^(💡|suggest|feedback|bug|report|it would be (nice|good|better)|can you (add|change|make|fix|remove)|could you (add|change|make|fix|remove)|please (add|change|make|fix|remove)|the app should|i wish|add an? |make the )/i.test(q.trim())) { feedbackFor = { item: null }; sendFeedback(q); return; }
    const [errors, progress] = await Promise.all([store.errors(), store.allProgress()]);
    path = path || (content.pathDef ? buildPath(content.pathDef, content) : null);
    const intent = parseIntent(q);
    if (intent === "next") {
      const [attempts, skills, vocab, imports, gamesArr] = await Promise.all([store.attempts(), store.skills(), store.vocab(), store.imports(), store.db.all("games")]);
      const r = buildReport({ attempts, errors, progress, skills, vocab, imports, games: Object.fromEntries(gamesArr.map(g => [g.id, g])), content }, store.clock());
      say(`Here's what I'd do now:<ol class="cp-list">${r.recommendations.slice(0, 4).map(x => `<li><a href="${x.href}">${esc(x.text)}</a></li>`).join("")}</ol>`);
      return;
    }
    if (intent === "convo") {
      const cvs = findConvos(q, content);
      say(cvs.length ? `Try one of these conversations:${cvs.map(cv => `<a class="cp-card" href="#/convo/${esc(cv.id)}"><b>🗣️ ${esc(cv.title)}</b><small>${esc(cv.subtitle)} · ${esc(cv.level)}</small></a>`).join("")}`
        : `I couldn't find a conversation on that. <a href="#/convo">Browse all conversations</a>.`);
      return;
    }
    let ids = intent === "weak" ? weakest(errors) : findConcepts(q, content).map(x => x.id);
    if (!ids.length && intent === "weak") { say("You don't have open mistakes yet. Do a few lessons first and I'll be able to spot your weak points."); return; }
    if (!ids.length) {
      say(`I'm not sure which topic you mean. Try naming it, e.g. <i>subjunctive</i>, <i>conditional</i>, <i>passato prossimo vs imperfetto</i>, <i>pronouns</i>, <i>prepositions</i>, <i>passive</i>, <i>idioms</i>, <i>formal emails</i> or <i>listening</i>.${weakest(errors).length ? ` Or ask for <b>my weakest topics</b>.` : ""}`);
      return;
    }
    const cards = ids.map(id => card(resourcesFor(id, { content, errors, progress, path }))).join("");
    say(`${intent === "weak" ? "These are the topics where you've made the most mistakes recently:" : ids.length > 1 ? "Here's where to practise each one:" : "Here's where to practise it:"}${cards}`);
  }

  function card(r) {
    const c = r.concept;
    const stats = [r.seen ? `${Math.round(r.accuracy * 100)}% di risposte giuste finora` : "non ancora esercitato", r.openErrors ? `${r.openErrors} ${r.openErrors > 1 ? "errori aperti" : "errore aperto"}` : ""].filter(Boolean).join(" · ");
    return `<div class="cp-card concept">
      <b>${esc(c.title)}</b><small>${esc(c.cefr)} · ${esc(stats)}</small>
      ${c.rule ? `<p class="small">${md(c.rule.length > 180 ? c.rule.slice(0, 177) + "…" : c.rule)}</p>` : ""}
      <div class="cp-actions">
        <a class="btn3d small" href="#/learn/${esc(c.id)}">📖 Lezione</a>
        <a class="btn3d primary small" href="#/learn/${esc(c.id)}/practice">✏️ Esercitati</a>
        ${r.openErrors ? `<a class="btn3d blue small" href="#/errors/quiz?concept=${esc(c.id)}">🎯 Riprova i miei errori</a>` : ""}
      </div>
      ${r.games.length ? `<div class="cp-sub">🎲 Giochi: ${r.games.slice(0, 4).map(g => `<a href="#/play/${esc(g.id)}">${esc(g.title)}</a>`).join(" · ")}</div>` : ""}
      ${r.convos.length ? `<div class="cp-sub">🗣️ Conversazioni: ${r.convos.slice(0, 3).map(cv => `<a href="#/convo/${esc(cv.id)}">${esc(cv.title)}</a>`).join(" · ")}</div>` : ""}
    </div>`;
  }
  return { open, ask, feedback: item => { open(); startFeedback(item); } };
}
