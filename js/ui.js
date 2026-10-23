// Shared UI: tiny DOM helpers, light markdown, and the exercise + feedback component
// used by lessons, games, quizzes and Error Bank retests.
import { evaluate } from "./core/evaluate.js";
import { masteryProgress } from "./core/errors.js";
import * as speech from "./speech.js";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// *italic*, **bold**, ~~strike~~ on escaped text
export function md(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.childElementCount === 1 ? t.content.firstElementChild : t.content;
}

export function shuffle(a, rand = Math.random) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

export function toast(msg, kind = "") {
  const el = h(`<div class="toast ${kind}">${msg}</div>`);
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3200);
}

export const fmtDate = t => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
export const fmtRel = (t, now) => {
  const d = Math.round((t - now) / 864e5);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
};

const ACCENTS = ["à", "è", "é", "ì", "ò", "ù"];
const TYPE_LABEL = { cloze: "Fill the gap", transform: "Transform", translate: "Translate", choice: "Choose", order: "Build the sentence", free: "Write", listen: "Listen" };

export function errorLabel(content, type) { return (content.errorTypes[type] && content.errorTypes[type].label) || type; }

// Replace ___ in a cloze prompt with the given answer (for read-aloud and display).
export const fillCloze = (prompt, ans) => prompt.replace(/_{3,}/, ans).replace(/\s*\([^)]*\)/, "");

/**
 * Render one exercise. Resolves with { result, outcome } once the learner presses Continue.
 * opts: { store, source, mode, retestOf, banner, silent, onAnswered }
 */
export function runExercise(host, item, opts) {
  const { store } = opts;
  const content = store.content;
  const concept = content.concepts.get(item.conceptId);
  return new Promise(resolve => {
    const el = h(`<div class="exercise card" data-item="${esc(item.id)}">
      ${opts.banner ? `<div class="ex-banner">${opts.banner}</div>` : ""}
      <div class="ex-head"><span class="chip">${esc(TYPE_LABEL[item.type] || item.type)}</span>
        <span class="muted small">${esc(concept ? concept.title : "")}</span>
        <span class="stars" title="difficulty ${item.difficulty || 1}/5">${"●".repeat(item.difficulty || 1)}<span class="dim">${"●".repeat(5 - (item.difficulty || 1))}</span></span></div>
      ${item.instruction ? `<p class="ex-instr">${md(item.instruction)}</p>` : ""}
      <div class="ex-body"></div>
      <div class="ex-actions">
        <div class="accents" ${["choice", "order"].includes(item.type) ? "hidden" : ""}>${ACCENTS.map(a => `<button type="button" class="key" data-acc="${a}">${a}</button>`).join("")}</div>
        <span class="grow"></span>
        <button type="button" class="btn ghost" data-act="dontknow">Show answer</button>
        <button type="button" class="btn primary" data-act="check">Check</button>
      </div>
      <div class="feedback" hidden></div>
    </div>`);
    host.replaceChildren(el);
    const body = el.querySelector(".ex-body");
    let getResponse = () => "";
    let lastInput = null;

    if (item.type === "cloze") {
      const [before, after = ""] = item.prompt.split(/_{3,}/);
      body.append(h(`<p class="ex-prompt it">${md(before)}<input class="gap" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="answer">${md(after)}</p>`));
      const inp = body.querySelector("input");
      inp.size = Math.max(6, String(item.answers?.[0] || "").length + 2);
      getResponse = () => inp.value;
      lastInput = inp;
    } else if (item.type === "choice") {
      body.append(h(`<p class="ex-prompt it">${md(item.prompt)}</p>`));
      const opts2 = h(`<div class="choices">${item.options.map((o, i) => `<button type="button" class="choice" data-i="${i}">${md(o)}</button>`).join("")}</div>`);
      body.append(opts2);
      let picked = null;
      opts2.addEventListener("click", e => {
        const b = e.target.closest(".choice"); if (!b || el.classList.contains("done")) return;
        picked = Number(b.dataset.i);
        opts2.querySelectorAll(".choice").forEach(x => x.classList.toggle("picked", x === b));
        check();
      });
      getResponse = () => picked;
    } else if (item.type === "order") {
      body.append(h(`<p class="ex-prompt">${md(item.prompt)}</p>`));
      const line = h(`<div class="order-line it" aria-label="your sentence"></div>`);
      const bank = h(`<div class="order-bank it"></div>`);
      shuffle(item.tokens).forEach(tk => bank.append(h(`<button type="button" class="token">${esc(tk)}</button>`)));
      body.append(line, bank);
      const move = e => { const b = e.target.closest(".token"); if (!b || el.classList.contains("done")) return; (b.parentElement === bank ? line : bank).append(b); };
      line.addEventListener("click", move); bank.addEventListener("click", move);
      getResponse = () => [...line.querySelectorAll(".token")].map(b => b.textContent).join(" ");
    } else {
      const isIt = item.type === "transform";
      body.append(h(`<p class="ex-prompt ${isIt ? "it" : ""}">${md(item.prompt)}</p>`));
      const ta = h(`<textarea class="answer it" rows="2" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="Scrivi in italiano…"></textarea>`);
      body.append(ta);
      getResponse = () => ta.value;
      lastInput = ta;
    }
    if (item.en && item.type === "cloze") body.append(h(`<p class="muted small hint" hidden>${esc(item.en)}</p>`));
    if (item.en && item.type === "cloze") body.append(h(`<button type="button" class="linkish small" data-act="hint">Show English meaning</button>`));

    el.addEventListener("focusin", e => { if (e.target.matches("input,textarea")) lastInput = e.target; });
    el.querySelector(".accents").addEventListener("mousedown", e => e.preventDefault());
    el.querySelector(".accents").addEventListener("click", e => {
      const k = e.target.closest("[data-acc]"); if (!k || !lastInput) return;
      const { selectionStart: s, selectionEnd: f, value } = lastInput;
      lastInput.value = value.slice(0, s) + k.dataset.acc + value.slice(f);
      lastInput.selectionStart = lastInput.selectionEnd = s + 1;
      lastInput.focus();
    });
    el.addEventListener("keydown", e => {
      if (e.key !== "Enter" || e.shiftKey) return;
      e.preventDefault();
      if (el.classList.contains("done")) el.querySelector("[data-act=next]")?.click(); else check();
    });
    el.addEventListener("click", e => {
      const a = e.target.closest("[data-act]"); if (!a) return;
      if (a.dataset.act === "check") check();
      if (a.dataset.act === "dontknow") check(true);
      if (a.dataset.act === "hint") { body.querySelector(".hint").hidden = false; a.remove(); }
    });
    setTimeout(() => (lastInput || el.querySelector("button.choice, .token"))?.focus(), 30);

    let busy = false;
    async function check(giveUp = false) {
      if (busy || el.classList.contains("done")) return;
      const resp = giveUp ? "" : getResponse();
      if (!giveUp && (resp === "" || resp === null)) { lastInput?.focus(); el.querySelector(".ex-actions").classList.add("shake"); setTimeout(() => el.querySelector(".ex-actions").classList.remove("shake"), 400); return; }
      busy = true;
      const result = evaluate(item, resp);
      if (giveUp) { result.verdict = "empty"; result.correct = false; result.errorType = item.errorType || "no-answer"; result.note = "You asked to see the answer."; }
      const outcome = await store.recordAnswer({ item, response: item.type === "choice" && resp !== "" && resp != null ? item.options[resp] : resp, result, source: opts.source, mode: opts.mode, retestOf: opts.retestOf });
      el.classList.add("done", result.correct ? "is-correct" : "is-wrong");
      el.querySelectorAll("input,textarea").forEach(i => (i.readOnly = true));
      if (item.type === "choice") el.querySelectorAll(".choice").forEach((b, i) => { if (i === item.answer) b.classList.add("right"); else if (i === resp) b.classList.add("wrong"); });
      el.querySelector(".ex-actions").hidden = true;
      showFeedback(el.querySelector(".feedback"), item, resp, result, outcome, concept, opts);
      opts.onAnswered && opts.onAnswered(result, outcome);
      el.querySelector("[data-act=next]").addEventListener("click", () => resolve({ result, outcome }));
      el.querySelector("[data-act=next]").focus();
    }
  });
}

function showFeedback(fb, item, resp, result, outcome, concept, opts) {
  const content = opts.store.content;
  const V = {
    correct: ["✓", "Corretto!", "ok"], alternative: ["✓", "Accepted: a natural alternative", "ok"],
    typo: ["✓", "Accepted, with a small slip", "ok"], accent: ["≈", "Almost: check the accents", "warn"],
    wrong: ["✗", "Not quite", "bad"], empty: ["•", "Here's the answer", "bad"]
  }[result.verdict];
  const userText = item.type === "choice" ? (resp != null && resp !== "" ? item.options[resp] : "") : String(resp ?? "");
  const diff = result.diff && userText ? `<div class="diff it">${result.diff.map(d => `<span class="d-${d.op}">${esc(d.t)}</span>`).join(" ")}</div>` : "";
  const full = item.type === "cloze" ? fillCloze(item.prompt, `<b>${esc(result.expected)}</b>`) : null;
  const speakText = item.type === "cloze" ? fillCloze(item.prompt, result.expected) : item.type === "choice" ? fillCloze(item.prompt, item.options[item.answer]) : result.expected;
  const eb = [];
  if (outcome.captured) eb.push(`<a class="eb-chip bad" href="#/errors/${encodeURIComponent(outcome.captured.id)}">Saved to Error Bank · ${esc(errorLabel(content, outcome.captured.errorType))}${outcome.captured.timesWrong > 1 ? ` · ${outcome.captured.timesWrong}× now` : ""}</a>`);
  if (outcome.reopened) eb.push(`<span class="eb-chip warn">You had mastered this one. It's back in active review.</span>`);
  for (const e of outcome.mastered) eb.push(`<span class="eb-chip ok">★ Mastered: "${esc(e.correctAnswer)}" (${esc(errorLabel(content, e.errorType))})</span>`);
  const prog = outcome.credited.filter(e => e.status !== "mastered");
  if (prog.length) {
    const p = masteryProgress(prog[0]);
    const n = `${prog.length} related error${prog.length > 1 ? "s" : ""}`;
    eb.push(p.days === 0
      ? `<span class="eb-chip ok">Right this time (${n}). It starts counting towards mastery tomorrow.</span>`
      : `<span class="eb-chip ok">Error Bank progress (${n}): ${p.days}/${p.needDays} days, ${p.newContextDays}/${p.needNew} new contexts</span>`);
  }
  fb.innerHTML = `
    <div class="verdict ${V[2]}"><span class="v-icon">${V[0]}</span> ${V[1]}</div>
    ${!result.correct || result.verdict !== "correct" ? `
      ${userText && result.verdict !== "correct" ? `<div class="fb-row"><span class="lbl">You wrote</span>${diff || `<span class="it">${esc(userText)}</span>`}</div>` : ""}
      <div class="fb-row"><span class="lbl">Correct</span><span class="it strong">${full || esc(result.expected)}</span></div>` : full ? `<div class="fb-row"><span class="it">${full}</span></div>` : ""}
    ${result.note ? `<p class="fb-note">${md(result.note)}</p>` : ""}
    ${result.why ? `<p class="fb-why">${md(result.why)}</p>` : ""}
    ${concept && concept.rule ? `<details class="fb-rule"><summary>The rule</summary><p>${md(concept.rule)}</p><a href="#/learn/${esc(concept.id)}">Open the lesson →</a></details>` : ""}
    ${result.alternatives && result.alternatives.length ? `<p class="fb-alt"><span class="lbl">Also accepted</span> ${result.alternatives.map(a => `<span class="it">${esc(a)}</span>`).join(" · ")}</p>` : ""}
    ${item.en && item.type !== "translate" ? `<p class="muted small">${esc(item.en)}</p>` : ""}
    ${eb.length ? `<div class="eb-row">${eb.join("")}</div>` : ""}
    <div class="fb-actions">
      ${speech.canSpeak() && !opts.silent ? `<button type="button" class="btn ghost small" data-say>🔊 Hear it</button>` : ""}
      <span class="grow"></span>
      <button type="button" class="btn primary" data-act="next">Continue ↵</button>
    </div>`;
  fb.hidden = false;
  fb.querySelector("[data-say]")?.addEventListener("click", () => speech.say(speakText));
}
