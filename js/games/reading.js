// Reading and listening: a passage, then questions. Listening hides the text while audio is on;
// in silent mode (or without an Italian voice) it becomes a reading task using the transcript.
import { h, esc, md, runExercise } from "../ui.js";
import { saveGameResult } from "../views/play.js";
import * as speech from "../speech.js";

export async function play(view, ctx) {
  const { game, store, content } = ctx;
  const listening = game.type === "listening";
  const audioOn = listening && speech.canSpeak();
  const p = game.passage;
  view.replaceChildren(h(`<section class="page game-page reading">
    <a class="back" href="#/play">← Giochi</a>
    <h1>${esc(game.title)}</h1><p class="muted">${esc(game.subtitle || "")}</p>
    <div class="read-layout">
      <div class="card passage-card">
        ${p.title ? `<h3 class="it">${esc(p.title)}</h3>` : ""}
        ${listening ? `<div class="audio-box">${audioOn
          ? `<button class="btn primary small" data-rate="1">▶ Ascolta</button><button class="btn small ghost" data-rate="0.8">🐢 Più lento</button><button class="btn small ghost" data-stop>■ Stop</button>
             <p class="small muted">Prima ascolta. La trascrizione compare dopo le domande, oppure <button class="linkish small" data-show>mostrala ora</button>.</p>`
          : `<p class="small muted">Modalità muta: leggi la trascrizione, poi rispondi.</p>`}</div>` : ""}
        <div class="passage-text it" ${audioOn ? "hidden" : ""}>${p.it.split(/\n+/).map(par => `<p>${md(par)}</p>`).join("")}</div>
        ${p.source ? `<p class="small muted">${esc(p.source === "invented" ? "Testo originale scritto per questa app." : p.source)}</p>` : ""}
      </div>
      <div id="ex"></div>
    </div></section>`));
  const text = view.querySelector(".passage-text");
  view.querySelector(".audio-box")?.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.rate) speech.say(p.it.replace(/^\s*([—-]|[A-ZÀ-Ý]{2,}:)\s*/gm, ""), { rate: Number(b.dataset.rate) * 0.95 });
    if (b.hasAttribute("data-stop")) speech.stop();
    if (b.hasAttribute("data-show")) text.hidden = false;
  });
  const host = view.querySelector("#ex");
  const qs = game.questions.map(q => content.items.get(q.id) || q);
  let right = 0;
  for (const [i, q] of qs.entries()) {
    const { result } = await runExercise(host, q, {
      store, source: "game:" + game.id, mode: "game", silent: speech.isSilent(), autoplay: false, hidePassage: true,
      banner: `Domanda ${i + 1} di ${qs.length}`
    });
    if (result.correct) right++;
  }
  speech.stop();
  text.hidden = false;
  const score = qs.length ? right / qs.length : 0;
  await saveGameResult(store, game.id, score);
  host.replaceChildren(h(`<div class="card summary"><div class="big-score ${score >= 0.75 ? "ok" : "warn"}">${right}/${qs.length}</div>
    <p>${listening ? "Ora vedi la trascrizione: controlla cosa ti è sfuggito." : "Rileggi il testo per trovare le risposte che hai sbagliato."}</p>
    <div class="row-actions"><a class="btn ghost" href="#/play">Altri giochi</a>${right < qs.length ? `<a class="btn" href="#/errors">Banca degli errori</a>` : ""}</div></div>`));
}
