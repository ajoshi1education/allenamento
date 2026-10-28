// Full-screen session player: one card or exercise at a time, progress bar on top, action bar at the bottom.
// Used for path lessons, practice, challenges, checkpoints and reviews.
import { h, esc, md, runExercise, confirmDialog } from "./ui.js";
import * as speech from "./speech.js";
import { CHECKPOINT_PASS } from "./core/path.js";

const CHEERS = ["Fantastico!", "Che bravura!", "Ottimo lavoro!", "Continua così!", "Grande!"];

let active = null;   // only one session may be open (guards against double taps)

export function runSession(plan, opts) {
  if (active) return active;
  active = startSession(plan, opts).finally(() => { active = null; });
  return active;
}

function startSession(plan, { store, nodeId, kind, accent = "green", onFinish }) {
  return new Promise(resolve => {
    const total = plan.steps.length;
    const ov = h(`<div class="session-overlay accent-${accent}" role="dialog" aria-label="${esc(plan.title)}">
      <header class="session-top">
        <button class="icon-x" aria-label="Esci" data-exit>✕</button>
        <div class="session-progress"><span></span></div>
        <div class="combo" hidden>🔥 <b>0</b></div>
      </header>
      <main class="session-stage"></main>
      <footer class="session-footer"></footer>
    </div>`);
    document.body.append(ov);
    document.body.classList.add("in-session");
    const stage = ov.querySelector(".session-stage"), footer = ov.querySelector(".session-footer");
    const bar = ov.querySelector(".session-progress span"), comboEl = ov.querySelector(".combo");
    let i = 0, correct = 0, graded = 0, combo = 0, saved = 0, exited = false;
    const results = [];                     // per exercise, so exams can score each section

    let asking = false;
    const exit = async () => {
      if (asking || exited) return;
      if (i > 0 && i < total) {
        asking = true;
        const leave = await confirmDialog({ title: "Vuoi uscire dalla sessione?", text: "Le risposte date finora restano nella Banca degli errori, ma questo passo non risulterà completato.", ok: "Esci", cancel: "Continua", danger: true });
        asking = false;
        if (!leave) return;
      }
      exited = true; close(); resolve({ exited: true });
    };
    ov.querySelector("[data-exit]").onclick = exit;
    const onKey = e => { if (e.key === "Escape" && !document.querySelector(".modal-back")) exit(); };
    document.addEventListener("keydown", onKey);
    function close() { speech.stop(); speech.stopListening(); document.removeEventListener("keydown", onKey); ov.remove(); document.body.classList.remove("in-session"); }
    const setBar = () => { bar.style.width = `${Math.round(100 * i / total)}%`; };

    (async () => {
      setBar();
      for (i = 0; i < total && !exited; i++) {
        setBar();
        const step = plan.steps[i];
        stage.scrollTop = 0;
        if (step.type === "card") await showCard(stage, footer, step);
        else {
          const { result, outcome } = await runExercise(stage, step.item, {
            store, footer, source: nodeId ? "path:" + nodeId : "session", mode: step.retestOf ? "retest" : "path", retestOf: step.retestOf,
            silent: speech.isSilent(), banner: step.tag ? `🔁 ${esc(step.tag)}: un tuo errore di prima, in una frase nuova` : ""
          });
          if (exited) return;
          graded++;
          results.push({ section: step.section || null, correct: !!result.correct });
          if (result.correct) { correct++; combo++; } else combo = 0;
          if (outcome.captured) saved++;
          comboEl.hidden = combo < 3; comboEl.querySelector("b").textContent = combo;
          if (combo >= 3) { comboEl.classList.remove("pop"); void comboEl.offsetWidth; comboEl.classList.add("pop"); }
        }
      }
      if (exited) return;
      i = total; setBar();
      const passMark = plan.passMark ?? CHECKPOINT_PASS;
      const passed = !(plan.checkpoint || plan.passMark != null) || (graded ? correct / graded : 1) >= passMark;
      const res = await store.completeNode(nodeId, { kind, correct, total: graded, passed });
      await endScreen(stage, footer, { plan, correct, graded, saved, xp: res.xp, passed });
      close();
      const out = { correct, total: graded, passed, xp: res.xp, results };
      onFinish && onFinish(out);
      resolve(out);
    })();
  });
}

function showCard(stage, footer, step) {
  const c = step.concept;
  let html = "";
  if (step.card === "intro") {
    html = `<div class="lcard intro"><div class="lc-kicker">${esc(c.cefr)} · Nuova lezione</div><h1>${esc(c.title)}</h1>
      <p class="lead">${md(c.lesson ? c.lesson.intro : c.rule || "")}</p>
      ${c.rule ? `<div class="key-rule"><span>In breve</span>${md(c.rule)}</div>` : ""}</div>`;
  } else if (step.card === "rule") {
    const r = step.rule;
    html = `<div class="lcard"><div class="lc-kicker">Regola ${step.index + 1} di ${step.of}</div><h2>${md(r.title)}</h2><p>${md(r.text)}</p>
      ${r.table ? `<div class="table-wrap"><table class="forms"><thead><tr>${r.table.head.map(x => `<th>${esc(x)}</th>`).join("")}</tr></thead>
        <tbody>${r.table.rows.map(row => `<tr>${row.map((x, k) => (k ? `<td class="it">${esc(x)}</td>` : `<th>${esc(x)}</th>`)).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
      ${(r.examples || []).map(e => `<div class="ex-line"><div><div class="it">${md(e.it)}</div><div class="en">${esc(e.en)}</div></div>${speech.canSpeak() ? `<button class="say-btn" data-say="${esc(e.it.replace(/\*/g, ""))}" aria-label="Ascolta">🔊</button>` : ""}</div>`).join("")}</div>`;
  } else if (step.card === "mistakes") {
    html = `<div class="lcard"><div class="lc-kicker">Occhio!</div><h2>Errori comuni</h2>
      ${c.lesson.mistakes.map(m => `<div class="mistake-card"><div class="wrong it">✗ ${md(m.wrong)}</div><div class="right it">✓ ${md(m.right)}</div><p>${md(m.why)}</p></div>`).join("")}
      ${(c.lesson.tips || []).length ? `<div class="tip">💡 ${md(c.lesson.tips[0])}</div>` : ""}</div>`;
  } else if (step.card === "html") {
    html = `<div class="lcard">${step.html}</div>`;
  } else if (step.card === "recap") {
    html = `<div class="lcard recap"><div class="lc-kicker">Riepilogo</div><h2>Ora sai…</h2>
      <ul class="can-do">${(c.assessment || []).map(a => `<li>${esc(a)}</li>`).join("")}</ul>
      ${c.rule ? `<div class="key-rule"><span>La regola</span>${md(c.rule)}</div>` : ""}</div>`;
  }
  stage.replaceChildren(h(`<div class="stage-inner">${html}</div>`));
  stage.querySelectorAll("[data-say]").forEach(b => (b.onclick = () => speech.say(b.dataset.say)));
  if (step.onShow) step.onShow(stage);
  footer.className = "session-footer";
  footer.replaceChildren(h(`<div class="footer-row"><span class="grow"></span><button class="btn3d primary big" data-next>Continua</button></div>`));
  footer.onclick = null;
  return new Promise(res => {
    const b = footer.querySelector("[data-next]"); b.focus();
    b.onclick = res;
  });
}

function endScreen(stage, footer, { plan, correct, graded, saved, xp, passed }) {
  const acc = graded ? Math.round(100 * correct / graded) : 100;
  const title = !passed ? "Quasi!" : CHEERS[Math.floor(Math.random() * CHEERS.length)];
  stage.replaceChildren(h(`<div class="stage-inner end ${passed ? "won" : "lost"}">
    ${passed ? `<div class="confetti">${Array.from({ length: 28 }, (_, k) => `<i style="--k:${k}"></i>`).join("")}</div>` : ""}
    <div class="end-badge">${passed ? (plan.checkpoint ? "🏆" : "🎉") : "💪"}</div>
    <h1>${title}</h1>
    <p class="muted">${esc(plan.title)} · ${esc(plan.subtitle || "")}</p>
    ${!passed ? `<p>Serve il ${Math.round((plan.passMark ?? CHECKPOINT_PASS) * 100)}% per superarlo. Gli errori sono nel Ripasso: ripassali e riprova.</p>` : ""}
    <div class="end-stats">
      <div class="es gold"><span>XP</span><b>+${xp}</b></div>
      <div class="es ${acc >= 80 ? "green" : acc >= 50 ? "orange" : "red"}"><span>Precisione</span><b>${acc}%</b></div>
      <div class="es blue"><span>Esercizi</span><b>${correct}/${graded}</b></div>
    </div>
    ${saved ? `<p class="small muted">${saved} ${saved > 1 ? "errori salvati" : "errore salvato"} nella Banca degli errori. ${saved > 1 ? "Torneranno" : "Tornerà"} in frasi nuove.</p>` : ""}
  </div>`));
  footer.className = "session-footer";
  footer.replaceChildren(h(`<div class="footer-row"><span class="grow"></span><button class="btn3d primary big" data-next>Continua</button></div>`));
  footer.onclick = null;
  return new Promise(res => { const b = footer.querySelector("[data-next]"); b.focus(); b.onclick = res; });
}
