// Convos: hands-free spoken conversations with a tutor.
// Start → the tutor speaks → the mic listens (or hold 🎤 to talk) → your words appear with a small
// scorecard → a second later the tutor replies and asks the next question. 🔊 replays any line.
import { h, esc, md, toast } from "../ui.js";
import * as speech from "../speech.js";
import { bindMic } from "../mic.js";
import { assessTurn, wordMatch, band } from "../core/speechcheck.js";

const METER = [["taskScore", "Compito", "Did you do what was asked, with the target structures?"],
  ["accuracy", "Correttezza", "Grammar mistakes typical of spoken Italian"],
  ["fluency", "Fluidità", "Speaking speed and flow (voice answers only)"],
  ["clarity", "Chiarezza", "How confidently the recogniser understood you: a proxy for pronunciation (voice answers only)"]];
const THEMES = ["Vita quotidiana", "Lavoro e studio", "Società e attualità", "Cultura e tempo libero"];
const pause = ms => new Promise(r => setTimeout(r, ms));

export async function render(view, ctx) {
  if (ctx.params[0]) return play(view, ctx, ctx.params[0]);
  const { store, content, query } = ctx;
  const results = new Map((await store.db.all("games")).filter(g => g.id.startsWith("CV-")).map(g => [g.id, g]));
  const all = content.convos || [];
  const level = query.level || "", theme = query.theme || "";
  const list = all.filter(c => (!level || c.level === level) && (!theme || c.theme === theme));
  const micOk = speech.hasRecognition();
  const card = cv => {
    const r = results.get(cv.id);
    return `<a class="convo-card card3d" href="#/convo/${esc(cv.id)}">
      <div class="cc-top"><span class="cc-avatar">${cv.tutor.avatar || "🧑‍🏫"}</span><span class="chip ${cv.level === "C1" ? "warn" : "info"}">${esc(cv.level)}</span></div>
      <h3>${esc(cv.title)}</h3><p class="small muted">${esc(cv.subtitle)}</p>
      <div class="c-meta"><span>with ${esc(cv.tutor.name)}</span><span>${cv.turns.length} exchanges</span>${r ? `<span class="ok-t">Best ${Math.round(r.best * 100)}%</span>` : ""}</div></a>`;
  };
  const groups = THEMES.map(t => [t, list.filter(c => (c.theme || "Vita quotidiana") === t)]).filter(([, l]) => l.length);
  view.replaceChildren(h(`<section class="page convo-list">
    <div class="hero card3d c-purple"><div class="hero-icon">🗣️</div>
      <div><h1>Convos</h1><p>${all.length} conversations with a tutor. Press start, listen, and answer out loud: tap the mic, or hold it while you talk.</p></div></div>
    ${!micOk ? `<div class="card notice">🎤 This browser can't recognise speech. Use Chrome or Edge to answer by voice. You can still type your replies.</div>` : ""}
    <div class="filter-chips">
      ${["", "B2", "C1"].map(l => `<a class="fchip ${level === l ? "on" : ""}" href="#/convo?${new URLSearchParams({ ...(l ? { level: l } : {}), ...(theme ? { theme } : {}) })}">${l || "All levels"}</a>`).join("")}
      <span class="sep"></span>
      ${["", ...THEMES].map(t => `<a class="fchip ${theme === t ? "on" : ""}" href="#/convo?${new URLSearchParams({ ...(level ? { level } : {}), ...(t ? { theme: t } : {}) })}">${t || "All themes"}</a>`).join("")}
    </div>
    ${groups.map(([t, l]) => `<h2>${esc(t)}</h2><div class="convo-grid">${l.map(card).join("")}</div>`).join("") || `<div class="card empty">No conversations match.</div>`}
  </section>`));
}

async function play(view, ctx, id) {
  const { store, content } = ctx;
  const cv = (content.convos || []).find(c => c.id === id);
  if (!cv) { view.replaceChildren(h(`<div class="page"><a class="back" href="#/convo">← Convos</a><div class="card">Conversation not found.</div></div>`)); return; }
  const tutor = cv.tutor;
  const rate = cv.level === "C1" ? 1 : 0.92;
  const micOk = speech.hasRecognition() && !speech.isSilent();

  // 1. Start screen (the Start click also lets Chrome play audio)
  view.replaceChildren(h(`<section class="page narrow convo">
    <a class="back" href="#/convo">← Convos</a>
    <div class="card3d convo-start">
      <span class="cc-avatar big">${tutor.avatar || "🧑‍🏫"}</span>
      <h1>${esc(cv.title)}</h1><p class="muted">${esc(cv.setting)}</p>
      <p class="small">${cv.turns.length} exchanges with ${esc(tutor.name)} · ${esc(cv.level)}</p>
      ${micOk ? `<p class="small muted">After ${esc(tutor.name)} speaks, just answer. You can also <b>hold the 🎤</b> while you talk and let go to send.</p>` : `<p class="small muted">You'll type your answers${speech.isSilent() ? " (silent mode is on)" : ""}.</p>`}
      <button class="btn3d primary big" data-start>▶ Inizia</button>
    </div></section>`));
  await new Promise(res => { view.querySelector("[data-start]").onclick = res; });
  speech.unlock();

  // 2. Conversation screen: chat + bottom dock
  view.replaceChildren(h(`<section class="page narrow convo live">
    <div class="convo-bar"><a class="back" href="#/convo">← Convos</a><b>${esc(cv.title)}</b><span class="turn-count small muted"></span></div>
    <div class="chat" id="chat"></div>
    <div class="dock card3d">
      <div class="dock-task"><span class="chip">Your turn</span> <span class="task-text"></span> <details class="hint"><summary>Hint</summary><span class="it hint-text"></span></details></div>
      <div class="dock-row">
        <button class="dock-btn" data-replay title="Hear it again">🔁</button>
        ${micOk ? `<button class="mic-big" aria-label="Speak (tap, or hold while you talk)">🎤</button>` : ""}
        <button class="dock-btn" data-type title="Type instead">⌨️</button>
      </div>
      <div class="live-transcript" hidden><span class="lt-dot"></span><span class="lt-text"></span></div>
      <div class="type-row" ${micOk ? "hidden" : ""}><input type="text" class="it" placeholder="Scrivi la tua risposta…"><button class="btn3d primary small" data-send>Send</button></div>
    </div>
  </section>`));
  const chat = view.querySelector("#chat"), dock = view.querySelector(".dock");
  const live = dock.querySelector(".live-transcript"), mic = dock.querySelector(".mic-big"), input = dock.querySelector(".type-row input");
  const setLive = (t, cls = "") => { live.hidden = !t; live.className = "live-transcript " + cls; live.querySelector(".lt-text").textContent = t || ""; };
  let gone = false;
  const alive = () => !gone && document.body.contains(chat);
  window.addEventListener("hashchange", () => { gone = true; speech.stop(); speech.stopListening(); }, { once: true });

  let lastLine = "";
  const scrollDown = () => chat.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "end" });
  const tutorSays = async (text, en) => {
    if (!text || !alive()) return;
    lastLine = text;
    const b = h(`<div class="bubble-row"><span class="avatar">${tutor.avatar || "🧑‍🏫"}</span><div class="bubble"><b class="who">${esc(tutor.name)}</b>
      <span class="it">${esc(text)}</span>${en ? `<details class="gloss"><summary>English</summary>${esc(en)}</details>` : ""}
      <button class="say-mini" title="Listen again">🔊</button></div></div>`);
    chat.append(b); scrollDown();
    b.querySelector(".say-mini").onclick = () => { speech.stopListening(); speech.say(text, { rate }); };
    dock.classList.add("tutor-talking");
    if (speech.canSpeak()) await speech.say(text, { rate }); else await pause(500);
    dock.classList.remove("tutor-talking");
  };

  // Waiting for a reply: voice (auto-listen, tap or hold the mic) or typing.
  let deliver = null;
  const waitReply = () => new Promise(res => { deliver = v => { deliver = null; res(v); }; });
  async function listenOnce() {
    if (!micOk || !deliver || !alive()) return;
    mic.classList.add("on"); setLive("Ti ascolto…", "listening");
    const r = await speech.listen({ onInterim: t => alive() && setLive(t || "Ti ascolto…", "listening"), onStatus: st => alive() && setLive(speech.MIC_STATUS[st], st === "listening" ? "listening" : "warn"), silenceMs: 1600, maxMs: 25000 });
    mic.classList.remove("on");
    if (!alive() || !deliver) return;
    if (r.error) { setLive(r.error === "no-speech" ? "Tocca o tieni premuto 🎤 quando vuoi rispondere." : (speech.MIC_HELP[r.error] || "Didn't catch that."), "warn"); return; }
    setLive("");
    deliver({ text: r.text, confidence: r.confidence, speechMs: r.speechMs, byVoice: true });
  }
  if (mic) bindMic(mic, () => listenOnce());
  dock.querySelector("[data-replay]").onclick = async () => {
    const wasListening = speech.isListening();
    speech.stopListening();
    await speech.say(lastLine, { rate: rate * 0.9 });
    if (wasListening || deliver) listenOnce();
  };
  dock.querySelector("[data-type]").onclick = () => { speech.stopListening(); setLive(""); dock.querySelector(".type-row").hidden = false; input.focus(); };
  const send = () => { const t = input.value.trim(); if (t && deliver) { input.value = ""; deliver({ text: t, confidence: null, speechMs: null, byVoice: false }); } };
  dock.querySelector("[data-send]").onclick = send;
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); send(); } });

  // 3. The conversation itself
  const scores = [];
  for (const [ti, turn] of cv.turns.entries()) {
    if (!alive()) return;
    view.querySelector(".turn-count").textContent = `${ti + 1} / ${cv.turns.length}`;
    dock.querySelector(".task-text").innerHTML = md(turn.task);
    dock.querySelector(".hint-text").innerHTML = md(turn.hint || "");
    dock.querySelector(".hint").open = false;
    await tutorSays(turn.say, turn.en);
    if (!alive()) return;
    const replyP = waitReply();
    dock.classList.add("your-turn");
    if (micOk && dock.querySelector(".type-row").hidden) listenOnce();     // just start talking
    const a = await replyP;
    dock.classList.remove("your-turn");
    if (!alive()) return;
    speech.stopListening();
    const assess = assessTurn(turn, a);
    scores.push(assess);
    chat.append(meBubble(a.text, assess, turn, a.byVoice)); scrollDown();
    saveTurn(store, cv, turn, assess);                                   // in the background
    await pause(900);
    await tutorSays(assess.taskScore >= 0.99 ? turn.followOk : (turn.followMiss || turn.followOk));
    await pause(350);
  }
  if (!alive()) return;
  if (cv.closing) await tutorSays(cv.closing);
  dock.remove();
  await finish(chat, store, cv, scores);
}

// Your reply in the chat, with a compact scorecard you can open.
function meBubble(text, a, turn, byVoice) {
  const tone = a.score >= 0.85 ? "g" : a.score >= 0.6 ? "o" : "r";
  const issues = a.grammar.length + a.task.checks.filter(c => !c.ok).length + (a.task.lengthOk ? 0 : 1);
  const el = h(`<div class="bubble-row mine"><div class="bubble">
    <span class="it">${esc(text)}</span>
    <details class="mini-assess ${tone}"><summary><span class="dot"></span>${a.score >= 0.85 ? "Ottimo" : a.score >= 0.6 ? "Buono" : "Da migliorare"}${issues ? ` · ${issues} to improve` : ""}</summary>
      ${meters(a)}
      ${a.grammar.map(g => `<div class="fix"><span class="wrong it">✗ ${esc(g.said)}</span>${g.fixed ? `<span class="right it">✓ ${esc(g.fixed)}</span>` : ""}<p class="small">${md(g.why)}</p></div>`).join("")}
      ${a.task.checks.filter(c => !c.ok).map(c => `<p class="small">• ${esc(c.label)}${c.hint ? `: ${md(c.hint)}` : ""}</p>`).join("")}
      ${!a.task.lengthOk ? `<p class="small">• Say a bit more next time (${turn.expect.minWords}+ words).</p>` : ""}
      <div class="model"><b class="small">Come lo direbbe un italiano</b><p class="it">${esc(turn.model)}</p>
        <button class="btn small" data-hear>🔊 Ascolta</button>${speech.hasRecognition() && !speech.isSilent() ? `<button class="btn small" data-repeat>🔁 Repeat after me</button>` : ""}
        <div class="repeat-out small" hidden></div></div>
      <p class="small muted">${byVoice ? `${a.words} words · ${a.wpm} words/min` : `${a.words} words · typed`}</p>
    </details></div></div>`);
  el.querySelector("[data-hear]").onclick = () => { speech.stopListening(); speech.say(turn.model, { rate: 0.9 }); };
  el.querySelector("[data-repeat]")?.addEventListener("click", async e => {
    const out = el.querySelector(".repeat-out"); out.hidden = false;
    speech.stopListening();
    await speech.say(turn.model, { rate: 0.9 });
    e.target.disabled = true; out.textContent = "Now you: repeat the sentence…";
    const r = await speech.listen({ onInterim: t => (out.textContent = "🎤 " + t), onStatus: st => (out.textContent = speech.MIC_STATUS[st]) });
    e.target.disabled = false;
    if (r.error) { out.textContent = speech.MIC_HELP[r.error] || "Didn't catch that."; return; }
    const m = wordMatch(turn.model, r.text);
    out.innerHTML = `<b class="${m.score >= 0.9 ? "ok-t" : m.score >= 0.7 ? "" : "bad-t"}">${Math.round(m.score * 100)}% understood</b> · I heard: “${esc(r.text)}”${m.missed.length ? `<br>Not caught: <span class="it">${m.missed.map(esc).join(", ")}</span>` : " Perfetto!"}`;
  });
  return el;
}

function meters(a) {
  return `<div class="meters">${METER.map(([k, label, tip]) => {
    const v = a[k];
    return `<div class="meter ${v == null ? "na" : v >= 0.85 ? "g" : v >= 0.6 ? "o" : "r"}" title="${esc(tip)}"><span>${label}</span><div class="m-bar"><i style="width:${v == null ? 0 : Math.round(v * 100)}%"></i></div><b>${v == null ? "–" : band(v)}</b></div>`;
  }).join("")}</div>`;
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

async function finish(chat, store, cv, scores) {
  const avg = k => { const v = scores.map(s => s[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const overall = { taskScore: avg("taskScore"), accuracy: avg("accuracy"), fluency: avg("fluency"), clarity: avg("clarity") };
  const total = avg("score") || 0;
  const r = (await store.db.get("games", cv.id)) || { id: cv.id, plays: 0, best: 0, history: [] };
  r.plays++; r.best = Math.max(r.best, total); r.last = store.clock(); r.history = [...r.history, { t: store.clock(), score: total }].slice(-20);
  await store.db.put("games", r);
  const { xp } = await store.completeNode(null, { kind: "convo", correct: scores.filter(s => s.score >= 0.8).length, total: scores.length, passed: true });
  const fixes = scores.flatMap(s => s.grammar);
  const next = (store.content.convos || []).find(c => c.id > cv.id && c.level === cv.level) || (store.content.convos || []).find(c => c.id > cv.id);
  const el = h(`<div class="card3d summary convo-end">
    <div class="end-badge">🗣️</div><h2>${total >= 0.8 ? "Bravissimo!" : total >= 0.6 ? "Bella conversazione!" : "Buon allenamento!"}</h2>
    <div class="big-score ${total >= 0.8 ? "ok" : total >= 0.6 ? "warn" : "bad"}">${Math.round(total * 100)}%</div>
    ${meters(overall)}
    ${fixes.length ? `<div class="fixes left"><h4>To work on</h4>${fixes.map(g => `<div class="fix"><span class="wrong it">✗ ${esc(g.said)}</span>${g.fixed ? `<span class="right it">✓ ${esc(g.fixed)}</span>` : ""}</div>`).join("")}<p class="small muted">These are now in your Error Bank and will come back as exercises.</p></div>` : `<p>No grammar slips detected. Great!</p>`}
    <p class="xp-earned">⭐ +${xp} XP</p>
    <div class="row-actions">${next ? `<a class="btn3d primary" href="#/convo/${esc(next.id)}">Next: ${esc(next.title)}</a>` : ""}<a class="btn3d ghost" href="#/convo">All conversations</a></div>
  </div>`);
  chat.append(el); el.scrollIntoView({ behavior: "smooth", block: "start" });
  toast(`Conversation saved · +${xp} XP`);
}
