// Convos: spoken conversations with a tutor. The tutor speaks, you answer out loud (or type),
// and each reply is assessed: did you do the task, grammar, fluency, clarity. Then "repeat after me".
import { h, esc, md, toast } from "../ui.js";
import * as speech from "../speech.js";
import { assessTurn, wordMatch, band } from "../core/speechcheck.js";

const METER = [["taskScore", "Compito", "Did you do what was asked, with the target structures?"],
  ["accuracy", "Correttezza", "Grammar mistakes typical of spoken Italian"],
  ["fluency", "Fluidità", "Speaking speed and flow (voice answers only)"],
  ["clarity", "Chiarezza", "How confidently the recogniser understood you: a proxy for pronunciation (voice answers only)"]];

export async function render(view, ctx) {
  if (ctx.params[0]) return play(view, ctx, ctx.params[0]);
  const { store, content } = ctx;
  const results = new Map((await store.db.all("games")).filter(g => g.id.startsWith("CV-")).map(g => [g.id, g]));
  const list = content.convos || [];
  const micOk = speech.hasRecognition();
  view.replaceChildren(h(`<section class="page convo-list">
    <div class="hero card3d c-purple"><div class="hero-icon">🗣️</div>
      <div><h1>Convos</h1><p>Real conversations with a tutor. Listen, answer out loud, and get feedback on what you said and how you said it.</p></div></div>
    ${!micOk ? `<div class="card notice">🎤 This browser can't recognise speech. Use Chrome or Edge to answer by voice. You can still type your replies.</div>`
      : speech.getMode() !== "speak" ? `<div class="card notice">Tip: switch the top-bar audio button to <b>🎤 Speak</b> so the microphone starts automatically after the tutor talks.</div>` : ""}
    <div class="convo-grid">${list.map(cv => {
      const r = results.get(cv.id);
      return `<a class="convo-card card3d" href="#/convo/${esc(cv.id)}">
        <div class="cc-top"><span class="cc-avatar">${cv.tutor.avatar || "🧑‍🏫"}</span><span class="chip ${cv.level === "C1" ? "warn" : "info"}">${esc(cv.level)}</span></div>
        <h3>${esc(cv.title)}</h3><p class="small muted">${esc(cv.subtitle)}</p>
        <div class="c-meta"><span>with ${esc(cv.tutor.name)}</span><span>${cv.turns.length} exchanges</span>${r ? `<span class="ok-t">Best ${Math.round(r.best * 100)}%</span>` : ""}</div></a>`;
    }).join("")}</div>
  </section>`));
}

async function play(view, ctx, id) {
  const { store, content } = ctx;
  const cv = (content.convos || []).find(c => c.id === id);
  if (!cv) { view.replaceChildren(h(`<div class="page"><a class="back" href="#/convo">← Convos</a><div class="card">Conversation not found.</div></div>`)); return; }
  const tutor = cv.tutor;
  const tutorRate = cv.level === "C1" ? 1 : 0.92;
  view.replaceChildren(h(`<section class="page narrow convo">
    <a class="back" href="#/convo">← Convos</a>
    <div class="convo-head"><span class="cc-avatar big">${tutor.avatar || "🧑‍🏫"}</span><div><h1>${esc(cv.title)}</h1><p class="muted">${esc(cv.setting)}</p></div></div>
    <div class="chat" id="chat"></div>
    <div id="turn"></div>
  </section>`));
  const chat = view.querySelector("#chat"), turnHost = view.querySelector("#turn");
  let gone = false;
  const alive = () => !gone && document.body.contains(chat);
  window.addEventListener("hashchange", () => { gone = true; speech.stop(); speech.stopListening(); }, { once: true });

  const tutorSays = async (text, en) => {
    const b = h(`<div class="bubble-row"><span class="avatar">${tutor.avatar || "🧑‍🏫"}</span><div class="bubble"><b class="who">${esc(tutor.name)}</b>
      <span class="it">${esc(text)}</span>${en ? `<details class="gloss"><summary>English</summary>${esc(en)}</details>` : ""}
      <button class="say-mini" title="Listen again">🔊</button></div></div>`);
    chat.append(b); b.scrollIntoView({ behavior: "smooth", block: "end" });
    b.querySelector(".say-mini").onclick = () => speech.say(text, { rate: tutorRate });
    if (speech.canSpeak()) await speech.say(text, { rate: tutorRate }); else await new Promise(r => setTimeout(r, 400));
  };
  const meSays = text => { const b = h(`<div class="bubble-row mine"><div class="bubble"><span class="it">${esc(text)}</span></div></div>`); chat.append(b); b.scrollIntoView({ behavior: "smooth", block: "end" }); };

  const scores = [];
  for (const [ti, turn] of cv.turns.entries()) {
    if (!alive()) return;
    await tutorSays(turn.say, turn.en);
    if (!alive()) return;
    const a = await getReply(turnHost, turn, ti, cv.turns.length, alive);
    if (!a || !alive()) return;
    meSays(a.text);
    const assess = assessTurn(turn, a);
    scores.push(assess);
    await saveTurn(store, cv, turn, assess);
    const next = await showAssessment(turnHost, turn, assess, a.byVoice);
    if (!alive()) return;
    let final = assess;
    if (next === "retry") {
      // One more go at the same question; the better attempt counts for the score.
      const b = await getReply(turnHost, turn, ti, cv.turns.length, alive);
      if (!b || !alive()) return;
      meSays(b.text);
      const second = assessTurn(turn, b);
      await saveTurn(store, cv, turn, second);
      if (second.score >= assess.score) { scores[scores.length - 1] = second; final = second; }
      await showAssessment(turnHost, turn, second, b.byVoice, true);
      if (!alive()) return;
    }
    await tutorSays(final.taskScore >= 0.99 ? turn.followOk : (turn.followMiss || turn.followOk));
  }
  if (!alive()) return;
  if (cv.closing) await tutorSays(cv.closing);
  await finish(turnHost, store, cv, scores);
}

// Reply: microphone (auto-starts in Speak mode) or typing.
function getReply(host, turn, ti, n, alive) {
  return new Promise(resolve => {
    const micOk = speech.hasRecognition() && !speech.isSilent();
    host.replaceChildren(h(`<div class="card3d reply-card">
      <div class="rc-top"><span class="chip">Turn ${ti + 1} of ${n}</span><span class="small muted">Your task</span></div>
      <p class="task">${md(turn.task)}</p>
      <details class="hint"><summary>Need a start?</summary><p class="it">${md(turn.hint || "")}</p></details>
      ${micOk ? `<div class="mic-zone"><button class="mic-big" data-mic aria-label="Speak your answer">🎤</button><div class="live-transcript" hidden><span class="lt-dot"></span><span class="lt-text"></span></div><p class="small muted mic-help">Tap the microphone and answer out loud.</p></div>` : ""}
      <div class="type-zone" ${micOk ? "hidden" : ""}><textarea class="answer it" rows="2" placeholder="Scrivi la tua risposta…"></textarea>
        <div class="row-actions"><button class="btn3d primary" data-send>Send</button></div></div>
      ${micOk ? `<button class="linkish small" data-type>⌨️ Type instead</button>` : ""}
    </div>`));
    const live = host.querySelector(".live-transcript"), mic = host.querySelector("[data-mic]");
    const setLive = (t, cls = "") => { live.hidden = false; live.className = "live-transcript " + cls; live.querySelector(".lt-text").textContent = t; };
    async function listen() {
      if (!mic || mic.classList.contains("on")) { speech.stopListening(); return; }
      mic.classList.add("on"); setLive("Ti ascolto…", "listening");
      const r = await speech.listen({ onInterim: t => setLive(t || "Ti ascolto…", "listening"), silenceMs: 2200, maxMs: 30000 });
      mic.classList.remove("on");
      if (!alive()) return resolve(null);
      if (r.error) { setLive(speech.MIC_HELP[r.error] || "Didn't catch that. Tap 🎤 to try again.", "warn"); return; }
      resolve({ text: r.text, confidence: r.confidence, speechMs: r.speechMs, byVoice: true });
    }
    if (mic) {
      mic.onclick = listen;
      if (speech.getMode() === "speak") setTimeout(() => alive() && listen(), 200);
    }
    host.querySelector("[data-type]")?.addEventListener("click", e => { speech.stopListening(); host.querySelector(".type-zone").hidden = false; e.target.remove(); host.querySelector("textarea").focus(); });
    const send = () => { const t = host.querySelector("textarea").value.trim(); if (t) resolve({ text: t, confidence: null, speechMs: null, byVoice: false }); };
    host.querySelector("[data-send]").onclick = send;
    host.querySelector("textarea").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  });
}

function meters(a) {
  return `<div class="meters">${METER.map(([k, label, tip]) => {
    const v = a[k];
    return `<div class="meter ${v == null ? "na" : v >= 0.85 ? "g" : v >= 0.6 ? "o" : "r"}" title="${esc(tip)}"><span>${label}</span><div class="m-bar"><i style="width:${v == null ? 0 : Math.round(v * 100)}%"></i></div><b>${v == null ? "–" : band(v)}</b></div>`;
  }).join("")}</div>`;
}

function showAssessment(host, turn, a, byVoice, isRetry = false) {
  return new Promise(resolve => {
    const missed = a.task.checks.filter(c => !c.ok);
    host.replaceChildren(h(`<div class="card3d assess ${a.score >= 0.8 ? "good" : a.score >= 0.55 ? "mid" : "low"}">
      <div class="as-head"><b>${a.score >= 0.85 ? "Ottimo!" : a.score >= 0.65 ? "Bene!" : a.score >= 0.45 ? "Non male" : "Riproviamo"}</b>
        <span class="small muted">${byVoice ? `${a.words} words · ${a.wpm} words/min` : `${a.words} words · typed`}</span></div>
      ${meters(a)}
      ${a.grammar.length ? `<div class="fixes"><h4>Correzioni</h4>${a.grammar.map(g => `<div class="fix"><span class="wrong it">✗ ${esc(g.said)}</span>${g.fixed ? `<span class="right it">✓ ${esc(g.fixed)}</span>` : ""}<p class="small">${md(g.why)}</p></div>`).join("")}</div>` : ""}
      ${missed.length ? `<div class="fixes"><h4>To complete the task</h4>${missed.map(c => `<p class="small">• ${esc(c.label)}${c.hint ? `: ${md(c.hint)}` : ""}</p>`).join("")}${!a.task.lengthOk ? `<p class="small">• Say a bit more: aim for ${turn.expect.minWords}+ words.</p>` : ""}</div>` : ""}
      <div class="model"><h4>Come lo direbbe un italiano</h4><p class="it">${esc(turn.model)}</p>
        <div class="row-actions"><button class="btn small" data-hear>🔊 Ascolta</button>${speech.hasRecognition() && !speech.isSilent() ? `<button class="btn small" data-repeat>🔁 Repeat after me</button>` : ""}</div>
        <div class="repeat-out small" hidden></div></div>
      <div class="row-actions"><span class="grow"></span>${isRetry ? "" : `<button class="btn3d ghost" data-retry>Try again</button>`}<button class="btn3d primary" data-next>Continua</button></div>
    </div>`));
    host.querySelector("[data-hear]").onclick = () => speech.say(turn.model, { rate: 0.9 });
    host.querySelector("[data-repeat]")?.addEventListener("click", async e => {
      const out = host.querySelector(".repeat-out"); out.hidden = false;
      await speech.say(turn.model, { rate: 0.9 });
      e.target.disabled = true; out.textContent = "Now you: repeat the sentence…";
      const was = speech.getMode(); speech.setMode("speak");
      const r = await speech.listen({ onInterim: t => (out.textContent = "🎤 " + t) });
      speech.setMode(was); e.target.disabled = false;
      if (r.error) { out.textContent = speech.MIC_HELP[r.error] || "Didn't catch that."; return; }
      const m = wordMatch(turn.model, r.text);
      out.innerHTML = `<b class="${m.score >= 0.9 ? "ok-t" : m.score >= 0.7 ? "" : "bad-t"}">${Math.round(m.score * 100)}% understood</b> · I heard: “${esc(r.text)}”${m.missed.length ? `<br>Words I didn't catch: <span class="it">${m.missed.map(esc).join(", ")}</span>. Try saying them more clearly.` : " Perfetto!"}`;
    });
    const thinking = () => host.replaceChildren(h(`<div class="typing"><span></span><span></span><span></span></div>`));
    host.querySelector("[data-next]").onclick = () => { speech.stop(); thinking(); resolve("next"); };
    host.querySelector("[data-retry]")?.addEventListener("click", () => { speech.stop(); thinking(); resolve("retry"); });
    host.querySelector("[data-next]").focus({ preventScroll: true });
  });
}

// Every turn feeds skills (speaking, interaction) and the Error Bank.
async function saveTurn(store, cv, turn, a) {
  const firstConcept = (turn.expect.rubric.find(r => r.conceptId) || {}).conceptId || cv.conceptIds[0];
  const base = { skill: "speaking", interaction: true, instruction: turn.task };
  const ok = { verdict: "correct", correct: true, errorType: null, expected: turn.model, alternatives: [], why: "", note: "" };
  for (const g of a.grammar) {
    const item = { ...base, id: `${cv.id}.${turn.id}.${g.id}`, conceptId: g.conceptId, type: "transform", instruction: "Correct what you said in conversation.", prompt: g.said, answers: [g.fixed || turn.model], errorType: g.errorType, explanation: g.why };
    await store.recordAnswer({ item, response: a.text, result: { ...ok, verdict: "wrong", correct: false, errorType: g.errorType, expected: g.fixed || turn.model, note: g.why }, source: "convo:" + cv.id, mode: "convo" });
  }
  for (const c of a.task.checks.filter(c => !c.ok)) {
    const r = turn.expect.rubric.find(x => x.label === c.label) || {};
    const item = { ...base, id: `${cv.id}.${turn.id}.task.${(r.label || "").slice(0, 20).replace(/\W+/g, "-")}`, conceptId: r.conceptId || firstConcept, type: "speak", prompt: `${turn.say} (${turn.task})`, answers: [turn.model], errorType: c.errorType || "task-completion", explanation: c.hint || "" };
    await store.recordAnswer({ item, response: a.text, result: { ...ok, verdict: "wrong", correct: false, errorType: c.errorType || "task-completion", note: `${c.label}. ${c.hint || ""}` }, source: "convo:" + cv.id, mode: "convo" });
  }
  if (!a.grammar.length && a.taskScore >= 0.99) {
    const item = { ...base, id: `${cv.id}.${turn.id}`, conceptId: firstConcept, type: "speak", prompt: turn.say, answers: [turn.model], errorType: "fluency" };
    await store.recordAnswer({ item, response: a.text, result: ok, source: "convo:" + cv.id, mode: "convo" });
  }
}

async function finish(host, store, cv, scores) {
  const avg = k => { const v = scores.map(s => s[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const overall = { taskScore: avg("taskScore"), accuracy: avg("accuracy"), fluency: avg("fluency"), clarity: avg("clarity") };
  const total = avg("score") || 0;
  const r = (await store.db.get("games", cv.id)) || { id: cv.id, plays: 0, best: 0, history: [] };
  r.plays++; r.best = Math.max(r.best, total); r.last = store.clock(); r.history = [...r.history, { t: store.clock(), score: total }].slice(-20);
  await store.db.put("games", r);
  const { xp } = await store.completeNode(null, { kind: "convo", correct: scores.filter(s => s.score >= 0.8).length, total: scores.length, passed: true });
  const fixes = scores.flatMap(s => s.grammar);
  host.replaceChildren(h(`<div class="card3d summary convo-end">
    <div class="end-badge">🗣️</div><h2>${total >= 0.8 ? "Bravissimo!" : total >= 0.6 ? "Bella conversazione!" : "Buon allenamento!"}</h2>
    <div class="big-score ${total >= 0.8 ? "ok" : total >= 0.6 ? "warn" : "bad"}">${Math.round(total * 100)}%</div>
    ${meters(overall)}
    ${fixes.length ? `<div class="fixes left"><h4>To work on</h4>${fixes.map(g => `<div class="fix"><span class="wrong it">✗ ${esc(g.said)}</span>${g.fixed ? `<span class="right it">✓ ${esc(g.fixed)}</span>` : ""}</div>`).join("")}<p class="small muted">These are now in your Error Bank and will come back as exercises.</p></div>` : `<p>No grammar slips detected. Great!</p>`}
    <p class="xp-earned">⭐ +${xp} XP</p>
    <div class="row-actions"><a class="btn3d primary" href="#/convo">More conversations</a><a class="btn3d ghost" href="#/convo/${esc(cv.id)}" onclick="setTimeout(()=>location.reload(),0)">Again</a></div>
  </div>`));
  toast(`Conversation saved · +${xp} XP`);
}
