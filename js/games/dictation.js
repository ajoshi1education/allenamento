// Dettato (dictation): hear a sentence, write it (or say it back). Sentences come from the course's own
// exercises for the game's concepts, so they are correct Italian; your weak topics come up more often.
import { h, esc } from "../ui.js";
import { runSession } from "../session.js";
import { sentenceOf, weakConcepts } from "../core/adaptive.js";
import * as speech from "../speech.js";

export function dictationItems(content, conceptIds, { n = 8, weak = new Map(), rand = Math.random } = {}) {
  const seen = new Set(), out = [];
  const pool = [];
  for (const cid of conceptIds) for (const it of content.poolFor(cid)) {
    if (it.source !== "lesson") continue;
    const s = sentenceOf(it);
    if (!s) continue;
    const words = s.split(/\s+/).length;
    if (words < 5 || words > 16 || /[()[\]|_]/.test(s)) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push({ it, s, w: 1 + (weak.get(cid) || 0) + rand() });
  }
  pool.sort((a, b) => b.w - a.w);
  for (const { it, s } of pool.slice(0, n)) {
    out.push({
      id: `${it.id}#dict`, conceptId: it.conceptId, skill: "listening", type: "transform", difficulty: it.difficulty || 3,
      instruction: "Dettato: scrivi (o ripeti) la frase che senti.", prompt: "🎧 Ascolta e scrivi.",
      audio: s, noTranscript: true, silentPrompt: "Modalità silenziosa: il dettato ha bisogno dell'audio. Attiva 🔊 in alto.",
      answers: [s.replace(/[.!?]+$/, "")], typoTolerance: true, errorType: "listening",
      explanation: it.en ? `Significato: ${it.en}` : ""
    });
  }
  return out.sort((a, b) => a.difficulty - b.difficulty);
}

export async function play(view, ctx) {
  const { game, store, content } = ctx;
  view.replaceChildren(h(`<section class="page narrow">
    <a class="back" href="#/play">← Giochi</a>
    <div class="card3d convo-start"><div class="end-badge">🎧</div><h1>${esc(game.title)}</h1><p class="muted">${esc(game.subtitle || "")}</p>
      ${speech.isSilent() ? `<p class="bad-t">Il dettato ha bisogno dell'audio: tocca 🔇 in alto per attivarlo.</p>` : `<p class="small muted">Ogni frase si può riascoltare (anche più lentamente). Puoi scrivere o rispondere col microfono.</p>`}
      <button class="btn3d primary big" data-go>Inizia</button></div></section>`));
  await new Promise(res => (view.querySelector("[data-go]").onclick = res));
  speech.unlock();
  const items = dictationItems(content, game.conceptIds || [], { n: game.sentences || 8, weak: weakConcepts(await store.errors()) });
  const res = await runSession({ title: "Dettato", subtitle: game.title, steps: items.map(item => ({ type: "exercise", item })) },
    { store, nodeId: `game:${game.id}`, kind: "game", accent: "teal" });
  if (!res.exited) {
    const r = (await store.db.get("games", game.id)) || { id: game.id, plays: 0, best: 0, history: [] };
    const score = res.total ? res.correct / res.total : 0;
    r.plays++; r.best = Math.max(r.best, score); r.last = store.clock(); r.history = [...r.history, { t: store.clock(), score }].slice(-20);
    await store.db.put("games", r);
  }
  location.hash = "#/play";
}
