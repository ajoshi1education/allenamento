// Convos: hands-free spoken conversations with a tutor.
// Start → the tutor speaks → the mic listens (or hold 🎤 to talk) → your words appear with a small
// scorecard → a second later the tutor replies and asks the next question. 🔊 replays any line.
import { h, esc, md, toast } from "../ui.js";
import * as speech from "../speech.js";
import { assessTurn, wordMatch, band } from "../core/speechcheck.js";

const METER = [["taskScore", "Compito", "Hai fatto quello che ti era chiesto, con le strutture richieste?"],
  ["accuracy", "Correttezza", "Errori di grammatica tipici dell'italiano parlato"],
  ["fluency", "Fluidità", "Velocità e scorrevolezza (solo risposte a voce)"],
  ["clarity", "Chiarezza", "Quanto bene il riconoscimento vocale ti ha capito: un indizio della pronuncia (solo risposte a voce)"]];
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
      <div class="c-meta"><span>con ${esc(cv.tutor.name)}</span><span>${cv.turns.length} scambi</span>${r ? `<span class="ok-t">Record ${Math.round(r.best * 100)}%</span>` : ""}</div></a>`;
  };
  const groups = THEMES.map(t => [t, list.filter(c => (c.theme || "Vita quotidiana") === t)]).filter(([, l]) => l.length);
  view.replaceChildren(h(`<section class="page convo-list">
    <div class="hero card3d c-purple"><div class="hero-icon">🗣️</div>
      <div><h1>Dialoghi</h1><p>${all.length} conversazioni con un tutor. Premi Inizia, ascolta e rispondi ad alta voce: tocca il microfono, o tienilo premuto mentre parli.</p></div></div>
    ${!micOk ? `<div class="card notice">🎤 Questo browser non riconosce la voce. Usa Chrome o Edge per rispondere a voce. Puoi comunque scrivere le risposte.</div>` : ""}
    <div class="filter-chips">
      ${["", "B2", "C1"].map(l => `<a class="fchip ${level === l ? "on" : ""}" href="#/convo?${new URLSearchParams({ ...(l ? { level: l } : {}), ...(theme ? { theme } : {}) })}">${l || "Tutti i livelli"}</a>`).join("")}
      <span class="sep"></span>
      ${["", ...THEMES].map(t => `<a class="fchip ${theme === t ? "on" : ""}" href="#/convo?${new URLSearchParams({ ...(level ? { level } : {}), ...(t ? { theme: t } : {}) })}">${t || "Tutti i temi"}</a>`).join("")}
    </div>
    ${groups.map(([t, l]) => `<h2>${esc(t)}</h2><div class="convo-grid">${l.map(card).join("")}</div>`).join("") || `<div class="card empty">Nessuna conversazione corrisponde.</div>`}
  </section>`));
}

async function play(view, ctx, id) {
  const { store, content } = ctx;
  const cv = (content.convos || []).find(c => c.id === id);
  if (!cv) { view.replaceChildren(h(`<div class="page"><a class="back" href="#/convo">← Dialoghi</a><div class="card">Conversazione non trovata.</div></div>`)); return; }
  const tutor = cv.tutor;
  const baseRate = cv.level === "C1" ? 1 : 0.92;
  const SPEEDS = [{ v: 0.8, icon: "🐢", label: "Lento" }, { v: 1, icon: "1×", label: "Normale" }, { v: 1.12, icon: "🐇", label: "Veloce" }];
  let speed = Number(await store.setting("convoSpeed", 1));
  let hideText = !!(await store.setting("convoHideText", false));
  let rate = baseRate * speed;
  const micOk = speech.hasRecognition() && !speech.isSilent();

  // 1. Start screen (the Start click also lets Chrome play audio)
  view.replaceChildren(h(`<section class="page narrow convo">
    <a class="back" href="#/convo">← Dialoghi</a>
    <div class="card3d convo-start">
      <span class="cc-avatar big">${tutor.avatar || "🧑‍🏫"}</span>
      <h1>${esc(cv.title)}</h1><p class="muted">${esc(cv.setting)}</p>
      <p class="small">${cv.turns.length} scambi con ${esc(tutor.name)} · ${esc(cv.level)}</p>
      ${micOk ? `<p class="small muted">When ${esc(tutor.name)} has finished, tap <b>🎤</b>, take your time, and tap <b>⏹</b> when you're done. Pauses won't cut you off.</p>` : `<p class="small muted">Scriverai le risposte${speech.isSilent() ? " (la modalità muta è attiva)" : ""}.</p>`}
      <button class="btn3d primary big" data-start>▶ Inizia</button>
    </div></section>`));
  await new Promise(res => { view.querySelector("[data-start]").onclick = res; });
  speech.unlock();

  // 2. Conversation screen: chat + bottom dock
  view.replaceChildren(h(`<section class="page narrow convo live">
    <div class="convo-bar"><a class="back" href="#/convo">← Dialoghi</a><b>${esc(cv.title)}</b><span class="turn-count small muted"></span></div>
    <div class="chat" id="chat"></div>
    <div class="dock card3d">
      <div class="dock-task"><span class="chip">Tocca a te</span> <span class="task-text"></span> <details class="hint"><summary>Suggerimento</summary><span class="it hint-text"></span></details></div>
      <div class="dock-row">
        <button class="dock-btn" data-replay title="Riascolta">🔁</button>
        ${micOk ? `<div class="mic-wrap"><button class="mic-big" aria-label="Parla">🎤</button><span class="mic-label small">Tocca per parlare</span></div>` : ""}
        <button class="dock-btn" data-type title="Scrivi invece di parlare">⌨️</button>
      </div>
      <div class="dock-opts"><button class="opt-btn" data-speed></button><button class="opt-btn" data-hide></button></div>
      <div class="live-transcript" hidden><span class="lt-dot"></span><span class="lt-text"></span></div>
      <div class="type-row" ${micOk ? "hidden" : ""}><input type="text" class="it" placeholder="Scrivi la tua risposta…"><button class="btn3d primary small" data-send>Invia</button></div>
    </div>
  </section>`));
  const chat = view.querySelector("#chat"), dock = view.querySelector(".dock");
  const live = dock.querySelector(".live-transcript"), mic = dock.querySelector(".mic-big"), input = dock.querySelector(".type-row input");
  const setLive = (t, cls = "") => { live.hidden = !t; live.className = "live-transcript " + cls; live.querySelector(".lt-text").textContent = t || ""; };
  let gone = false;
  const alive = () => !gone && document.body.contains(chat);
  window.addEventListener("hashchange", () => { gone = true; speech.stop(); speech.stopListening(); }, { once: true });

  const speedBtn = dock.querySelector("[data-speed]"), hideBtn = dock.querySelector("[data-hide]");
  const paintOpts = () => {
    const s = SPEEDS.find(x => x.v === speed) || SPEEDS[1];
    speedBtn.textContent = `${s.icon} Velocità: ${s.label}`;
    hideBtn.textContent = hideText ? "🙈 Testo nascosto finché non rispondi" : "👁 Testo visibile";
    hideBtn.classList.toggle("on", hideText);
  };
  paintOpts();
  speedBtn.onclick = async () => { const i = SPEEDS.findIndex(x => x.v === speed); speed = SPEEDS[(i + 1) % SPEEDS.length].v; rate = baseRate * speed; paintOpts(); await store.setSetting("convoSpeed", speed); };
  hideBtn.onclick = async () => { hideText = !hideText; paintOpts(); const canVeil = speech.canSpeak() && !speech.isSilent(); pending.forEach(b => b.classList.toggle("veiled", hideText && canVeil)); await store.setSetting("convoHideText", hideText); };
  let pending = [];                                      // tutor lines since your last reply
  const unveil = () => { pending.forEach(b => b.classList.remove("veiled")); pending = []; };
  let lastLine = "";
  // The dock floats over the page: keep enough space below the chat so the newest line is never hidden under it.
  const page = view.querySelector(".convo.live");
  const fit = () => { if (!alive()) return; const top = dock.getBoundingClientRect().top; page.style.paddingBottom = Math.max(160, innerHeight - top + 24) + "px"; };
  new ResizeObserver(fit).observe(dock);
  window.addEventListener("resize", fit);
  fit();
  const scrollDown = () => { fit(); requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })); };
  const tutorSays = async (text, en) => {
    if (!text || !alive()) return;
    lastLine = text;
    const b = h(`<div class="bubble-row"><span class="avatar">${tutor.avatar || "🧑‍🏫"}</span><div class="bubble${hideText && speech.canSpeak() && !speech.isSilent() ? " veiled" : ""}"><b class="who">${esc(tutor.name)}</b>
      <span class="veil-note small">🎧 Ascolta… (tocca per vedere il testo)</span><span class="it">${esc(text)}</span>${en ? `<details class="gloss"><summary>Inglese</summary>${esc(en)}</details>` : ""}
      <button class="say-mini" title="Riascolta">🔊</button></div></div>`);
    chat.append(b); scrollDown();
    pending.push(b.querySelector(".bubble"));
    b.querySelector(".veil-note").onclick = () => b.querySelector(".bubble").classList.remove("veiled");
    b.querySelector(".say-mini").onclick = () => { speech.stopListening(); speech.say(text, { rate }); };
    dock.classList.add("tutor-talking");
    if (speech.canSpeak()) await speech.say(text, { rate }); else await pause(500);
    dock.classList.remove("tutor-talking");
  };

  // Waiting for a reply: tap the mic to start, speak at your own pace, tap again when you've finished. Or type.
  let deliver = null;
  const waitReply = () => new Promise(res => { deliver = v => { deliver = null; res(v); }; });
  async function listenOnce() {
    if (!micOk || !deliver || !alive()) return;
    recording = true; paintMic();
    setLive("Ti ascolto… parla con calma, poi tocca ⏹ quando hai finito.", "listening");
    const r = await speech.listen({ hold: true, maxMs: 300000, onInterim: t => alive() && setLive(t || "Ti ascolto…", "listening"), onStatus: st => alive() && setLive(st === "listening" ? "Ti ascolto… parla con calma, poi tocca ⏹ quando hai finito." : speech.MIC_STATUS[st], st === "listening" ? "listening" : "warn") });
    recording = false; paintMic();
    if (!alive() || !deliver) return;
    if (r.error === "aborted") { setLive(""); return; }
    if (r.error) { setLive(r.error === "no-speech" ? "Non ho sentito niente. Tocca 🎤 e riprova." : (speech.MIC_HELP[r.error] || "Non ho capito."), "warn"); return; }
    setLive("");
    deliver({ text: r.text, confidence: r.confidence, speechMs: r.speechMs, byVoice: true });
  }
  let recording = false;
  const paintMic = () => {
    if (!mic) return;
    mic.classList.toggle("on", recording);
    mic.textContent = recording ? "⏹" : "🎤";
    mic.setAttribute("aria-label", recording ? "Ho finito: invia" : "Parla");
    dock.querySelector(".mic-label").textContent = recording ? "Tocca quando hai finito" : "Tocca per parlare";
  };
  if (mic) mic.onclick = () => {
    if (recording) { speech.releaseListening(); setLive("Un attimo…", "listening"); }
    else listenOnce();
  };
  dock.querySelector("[data-replay]").onclick = async () => {
    speech.stopListening();                                // cancels a recording in progress; tap 🎤 again to answer
    await speech.say(lastLine, { rate: rate * 0.9 });
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
    const a = await replyP;
    dock.classList.remove("your-turn");
    if (!alive()) return;
    speech.stopListening();
    unveil();
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
    <details class="mini-assess ${tone}"><summary><span class="dot"></span>${a.score >= 0.85 ? "Ottimo" : a.score >= 0.6 ? "Buono" : "Da migliorare"}${issues ? ` · ${issues} da migliorare` : ""}</summary>
      ${meters(a)}
      ${a.grammar.map(g => `<div class="fix"><span class="wrong it">✗ ${esc(g.said)}</span>${g.fixed ? `<span class="right it">✓ ${esc(g.fixed)}</span>` : ""}<p class="small">${md(g.why)}</p></div>`).join("")}
      ${a.task.checks.filter(c => !c.ok).map(c => `<p class="small">• ${esc(c.label)}${c.hint ? `: ${md(c.hint)}` : ""}</p>`).join("")}
      ${!a.task.lengthOk ? `<p class="small">• La prossima volta di' qualcosa in più (${turn.expect.minWords}+ parole).</p>` : ""}
      <div class="model"><b class="small">Come lo direbbe un italiano</b><p class="it">${esc(turn.model)}</p>
        <button class="btn small" data-hear>🔊 Ascolta</button>${speech.hasRecognition() && !speech.isSilent() ? `<button class="btn small" data-repeat>🔁 Ripeti dopo di me</button>` : ""}
        <div class="repeat-out small" hidden></div></div>
      <p class="small muted">${byVoice ? `${a.words} parole · ${a.wpm} parole/min` : `${a.words} parole · scritte`}</p>
    </details></div></div>`);
  el.querySelector("[data-hear]").onclick = () => { speech.stopListening(); speech.say(turn.model, { rate: 0.9 }); };
  el.querySelector("[data-repeat]")?.addEventListener("click", async e => {
    const out = el.querySelector(".repeat-out");
    const btn = e.target, label = btn.textContent;
    if (speech.isListening()) { speech.releaseListening(); return; }   // second tap = done
    speech.stopListening(); out.hidden = false;
    await speech.say(turn.model, { rate: 0.9 });
    btn.textContent = "⏹ Ho finito"; out.textContent = "Ora tu: ripeti la frase, poi tocca ⏹.";
    const r = await speech.listen({ hold: true, maxMs: 120000, onInterim: t => (out.textContent = "🎤 " + t), onStatus: st => (out.textContent = st === "listening" ? "Ora tu: ripeti la frase, poi tocca ⏹." : speech.MIC_STATUS[st]) });
    btn.textContent = label;
    if (r.error === "aborted") { out.hidden = true; return; }
    if (r.error) { out.textContent = speech.MIC_HELP[r.error] || "Non ho capito."; return; }
    const m = wordMatch(turn.model, r.text);
    out.innerHTML = `<b class="${m.score >= 0.9 ? "ok-t" : m.score >= 0.7 ? "" : "bad-t"}">${Math.round(m.score * 100)}% capito</b> · Ho sentito: “${esc(r.text)}”${m.missed.length ? `<br>Non capito: <span class="it">${m.missed.map(esc).join(", ")}</span>` : " Perfetto!"}`;
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
    ${fixes.length ? `<div class="fixes left"><h4>Da migliorare</h4>${fixes.map(g => `<div class="fix"><span class="wrong it">✗ ${esc(g.said)}</span>${g.fixed ? `<span class="right it">✓ ${esc(g.fixed)}</span>` : ""}</div>`).join("")}<p class="small muted">Ora sono nella tua Banca degli errori e torneranno come esercizi.</p></div>` : `<p>Nessun errore di grammatica. Ottimo!</p>`}
    <p class="xp-earned">⭐ +${xp} XP</p>
    <div class="row-actions">${next ? `<a class="btn3d primary" href="#/convo/${esc(next.id)}">Prossima: ${esc(next.title)}</a>` : ""}<a class="btn3d ghost" href="#/convo">Tutte le conversazioni</a></div>
  </div>`);
  chat.append(el); el.scrollIntoView({ behavior: "smooth", block: "start" });
  toast(`Conversazione salvata · +${xp} XP`);
}
