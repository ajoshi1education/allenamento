// Pool games built from the exercise bank of the game's concepts:
//  gauntlet: beat the clock with 3 lives, difficulty adapts as you go
//  builder:  build sentences from word tiles, with decoy words
//  duel:     translation race against a rival
import { h, esc, runExercise, shuffle } from "../ui.js";
import { saveGameResult } from "../views/play.js";
import { nextItem, adjustLevel, weakConcepts, toBuilder } from "../core/adaptive.js";
import * as speech from "../speech.js";

export async function play(view, ctx) {
  const { game } = ctx;
  if (game.type === "builder") return builder(view, ctx);
  if (game.type === "duel") return duel(view, ctx);
  return gauntlet(view, ctx);
}

function poolFor(ctx, filter) {
  const { game, content } = ctx;
  return (game.importOnly ? (content.importItems || []) : (game.conceptIds || []).flatMap(c => content.poolFor(c))).filter(i => !i.passageOf && i.type !== "free" && !i.audio && filter(i));
}

async function intro(view, game, rules) {
  view.replaceChildren(h(`<section class="page narrow game-page">
    <a class="back" href="#/play">← Games</a>
    <h1>${esc(game.title)}</h1><p class="muted">${esc(game.subtitle || "")}</p>
    <div class="card"><ul>${rules.map(r => `<li>${r}</li>`).join("")}</ul><button class="btn primary" data-go>Via!</button></div>
    <div class="hud" hidden></div><div id="ex"></div></section>`));
  await new Promise(res => { const b = view.querySelector("[data-go]"); b.focus(); b.onclick = res; });
  view.querySelector(".card").remove();
  return { hud: view.querySelector(".hud"), host: view.querySelector("#ex") };
}

async function finish(view, ctx, score, html) {
  const r = await saveGameResult(ctx.store, ctx.game.id, score);
  view.querySelector("#ex").replaceChildren(h(`<div class="card summary">${html}
    <p class="small muted">Best: ${Math.round(r.best * 100)}% · played ${r.plays}×</p>
    <div class="row-actions"><a class="btn primary" href="#/play/${esc(ctx.game.id)}" onclick="location.reload()">Play again</a>
    <a class="btn" href="#/errors/quiz?concept=${esc(ctx.game.conceptIds[0])}">Retest my mistakes</a><a class="btn ghost" href="#/play">More games</a></div></div>`));
  view.querySelector(".hud").hidden = true;
}

async function gauntlet(view, ctx) {
  const { game, store } = ctx;
  const total = game.seconds || 120, livesMax = game.lives || 3;
  const pool = poolFor(ctx, () => true);
  const weak = weakConcepts(await store.errors());
  const { hud, host } = await intro(view, game, [`${total} seconds and ${livesMax} lives.`, "The clock pauses while you read the feedback.", "Questions get harder as you string correct answers together, and concepts you often get wrong come up more."]);
  hud.hidden = false;
  let left = total, lives = livesMax, score = 0, streak = 0, level = 2, answered = 0, right = 0, running = true;
  const used = new Set();
  const paint = () => { hud.innerHTML = `<span>⏱ <b>${Math.ceil(left)}</b>s</span><span>${"♥".repeat(lives)}<span class="dim">${"♥".repeat(livesMax - lives)}</span></span><span>Level ${level}</span><span>Streak ${streak}</span><span class="grow"></span><span>Score <b>${score}</b></span>`; };
  paint();
  let tick = null;
  const startClock = () => { let last = performance.now(); tick = setInterval(() => { const n = performance.now(); left -= (n - last) / 1000; last = n; if (left <= 0) { left = 0; running = false; } paint(); }, 200); };
  const stopClock = () => clearInterval(tick);
  while (running && lives > 0) {
    const item = nextItem(pool, { level, used, weak });
    if (!item) break;
    used.add(item.id);
    startClock();
    const timeUp = new Promise(res => { const iv = setInterval(() => { if (!running) { clearInterval(iv); res("timeout"); } }, 200); });
    const answerP = runExercise(host, item, { store, source: "game:" + game.id, mode: "game", silent: speech.isSilent(), onAnswered: () => stopClock() });
    const first = await Promise.race([answerP, timeUp]);
    if (first === "timeout") { stopClock(); break; }
    stopClock();
    const { result } = first;
    answered++;
    if (result.correct) { right++; streak++; score += 10 * (item.difficulty || 1) + Math.min(streak, 5) * 2; } else { streak = 0; lives--; }
    level = adjustLevel(level, result.correct, streak);
    paint();
  }
  stopClock();
  await finish(view, ctx, answered ? right / answered : 0, `<div class="big-score ${lives > 0 ? "ok" : "warn"}">${score}</div>
    <p>${right}/${answered} correct${lives === 0 ? ". Out of lives" : left <= 0 ? ". Time's up" : ""}. Highest level reached: ${level}.</p>`);
}

async function builder(view, ctx) {
  const { game, store } = ctx;
  const puzzles = shuffle(poolFor(ctx, () => true).map(toBuilder).filter(Boolean)).slice(0, 8);
  const { hud, host } = await intro(view, game, ["Build each sentence from the word tiles.", "Some puzzles hide a decoy: a tempting wrong form you must leave out.", `${puzzles.length} sentences.`]);
  hud.hidden = false;
  let right = 0;
  for (const [i, p] of puzzles.entries()) {
    hud.innerHTML = `<span>Sentence ${i + 1}/${puzzles.length}</span><span class="grow"></span><span>✓ ${right}</span>`;
    const { result } = await runExercise(host, p, { store, source: "game:" + game.id, mode: "game", silent: speech.isSilent() });
    if (result.correct) right++;
  }
  await finish(view, ctx, puzzles.length ? right / puzzles.length : 0, `<div class="big-score ${right / puzzles.length >= 0.8 ? "ok" : "warn"}">${right}/${puzzles.length}</div><p>Sentences built correctly.</p>`);
}

async function duel(view, ctx) {
  const { game, store } = ctx;
  const rival = game.rival || { name: "Rivale", avatar: "🤺" };
  const pool = poolFor(ctx, i => ["translate", "transform", "cloze", "choice"].includes(i.type));
  const weak = weakConcepts(await store.errors());
  const target = 5;
  const { hud, host } = await intro(view, game, [`Race ${esc(rival.name)} ${rival.avatar}: first to ${target} points.`, "Answer correctly before their bar fills to win the point.", "A wrong or slow answer gives them the point."]);
  hud.hidden = false;
  let me = 0, them = 0, level = 2, streak = 0;
  const used = new Set();
  while (me < target && them < target) {
    const item = nextItem(pool, { level, used, weak });
    if (!item) break;
    used.add(item.id);
    const rivalSecs = (item.type === "translate" ? 14 : item.type === "transform" ? 12 : 8) + (item.difficulty || 2) * 3;
    hud.innerHTML = `<span>Tu <b>${me}</b></span><div class="rival-bar"><span></span></div><span>${rival.avatar} ${esc(rival.name)} <b>${them}</b></span>`;
    const bar = hud.querySelector(".rival-bar span");
    const t0 = performance.now();
    let elapsed = 0, stopped = false;
    const iv = setInterval(() => { if (stopped) return; elapsed = (performance.now() - t0) / 1000; bar.style.width = Math.min(100, 100 * elapsed / rivalSecs) + "%"; }, 100);
    const { result } = await runExercise(host, item, { store, source: "game:" + game.id, mode: "game", silent: speech.isSilent(), onAnswered: () => { stopped = true; } });
    clearInterval(iv);
    const fast = elapsed <= rivalSecs;
    if (result.correct && fast) { me++; streak++; } else { them++; streak = 0; }
    level = adjustLevel(level, result.correct && fast, streak);
  }
  const won = me > them;
  await finish(view, ctx, me / Math.max(1, me + them), `<div class="big-score ${won ? "ok" : "bad"}">${won ? "Hai vinto!" : `${esc(rival.name)} vince`}</div><p>${me} – ${them}</p>`);
}
