// Vocabulary: searchable library (seed + your own cards) and spaced-repetition review.
import { h, esc, md, toast, fmtRel, runExercise, confirmDialog } from "../ui.js";
import * as speech from "../speech.js";

const SOURCES = { seed: "Biblioteca", lesson: "Salvate dalle lezioni", error: "Dai miei errori", import: "Google Translate", manual: "Aggiunte da me" };

export async function render(view, ctx) {
  if (ctx.params[0] === "review") return reviewSession(view, ctx);
  const { store, content, query } = ctx;
  const now = store.clock();
  const deck = new Map((await store.vocab()).map(v => [v.id, v]));
  const seed = (content.vocabSeed || []).map(v => ({ ...v, source: "seed" }));
  const all = [...seed.filter(s => !deck.has(s.id)), ...deck.values()];
  const due = [...deck.values()].filter(v => v.card && v.card.due <= now);
  const tags = [...new Set(all.flatMap(v => v.tags || []))].sort();

  view.replaceChildren(h(`<section class="page vocab">
    <div class="page-head"><div><h1>Vocabolario</h1><p class="muted">${seed.length} voci nella biblioteca, ${deck.size} nel tuo mazzo di ripasso. Le parole vengono dalle lezioni, dai tuoi errori e dalla cronologia di Google Translate.</p></div>
      <div class="head-actions"><a class="btn primary ${due.length ? "" : "disabled"}" href="#/vocab/review">Ripassa ora (${due.length})</a>
      <a class="btn" href="#/vocab/review?all=1">Esercitati con il mazzo</a><button class="btn ghost" id="addBtn">+ Aggiungi parola</button></div></div>
    <form class="card add-form" id="addForm" hidden>
      <div class="grid2"><input type="text" name="it" placeholder="Italiano (es. prendere atto di)" required class="it"><input type="text" name="en" placeholder="Significato in inglese" required></div>
      <input type="text" name="ex" placeholder="Frase d'esempio (facoltativa)" class="it">
      <div class="row-actions"><button class="btn primary">Salva nel mazzo</button></div></form>
    <div class="filters card">
      <input type="search" id="q" placeholder="Cerca in italiano, inglese, esempi…" value="${esc(query.q || "")}">
      <select id="fSrc"><option value="">Tutte le fonti</option><option value="deck">Nel mio mazzo</option>${Object.entries(SOURCES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <select id="fPos"><option value="">Qualsiasi tipo</option>${["noun", "verb", "adj", "adv", "expr", "idiom", "conn", "prep"].map(p => `<option>${p}</option>`).join("")}</select>
      <select id="fReg"><option value="">Qualsiasi registro</option><option>informal</option><option>neutral</option><option>formal</option></select>
      <select id="fTag"><option value="">Qualsiasi etichetta</option>${tags.map(t => `<option>${esc(t)}</option>`).join("")}</select>
    </div>
    <div id="list" class="vocab-list"></div>
  </section>`));
  const $ = s => view.querySelector(s);
  $("#addBtn").onclick = () => { $("#addForm").hidden = !$("#addForm").hidden; $("#addForm [name=it]").focus(); };
  $("#addForm").onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    await store.saveVocab({ it: f.get("it").trim(), en: f.get("en").trim(), pos: "expr", source: "manual", examples: f.get("ex") ? [{ it: f.get("ex"), en: "" }] : [] });
    toast("Aggiunta al mazzo"); render(view, ctx);
  };
  const paint = () => {
    const q = $("#q").value.trim().toLowerCase(), src = $("#fSrc").value, pos = $("#fPos").value, reg = $("#fReg").value, tag = $("#fTag").value;
    const list = all.filter(v => (!q || [v.it, v.en, v.def, ...(v.examples || []).map(x => x.it + " " + x.en), ...(v.collocations || [])].join(" ").toLowerCase().includes(q))
      && (!src || (src === "deck" ? deck.has(v.id) : (v.source === src || (v.sources || []).includes(src))))
      && (!pos || v.pos === pos) && (!reg || v.register === reg) && (!tag || (v.tags || []).includes(tag)));
    $("#list").replaceChildren(h(list.length ? `<div>${list.slice(0, 200).map(v => card(v, deck.get(v.id), content, now)).join("")}${list.length > 200 ? `<p class="muted small">Ne vedi 200 su ${list.length}. Affina la ricerca.</p>` : ""}</div>` : `<div class="card empty">Nessun risultato.</div>`));
  };
  view.querySelectorAll(".filters input, .filters select").forEach(el => el.addEventListener("input", paint));
  view.addEventListener("click", async e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.closest("[data-id]").dataset.id;
    if (b.dataset.act === "say") speech.say(b.dataset.text);
    if (b.dataset.act === "add") { const v = all.find(x => x.id === id); await store.saveVocab({ ...v, source: "seed" }); b.outerHTML = `<span class="chip ok">Nel mazzo</span>`; deck.set(id, v); }
    if (b.dataset.act === "del") { if (!(await confirmDialog({ title: "Vuoi toglierla dal mazzo?", ok: "Togli", cancel: "Tieni", danger: true }))) return; await store.deleteVocab(id); deck.delete(id); toast("Tolta dal mazzo"); paint(); }
  });
  paint();
}

function card(v, inDeck, content, now) {
  return `<div class="vcard card" data-id="${esc(v.id)}">
    <div class="v-main"><div class="v-it it">${esc(v.it)} ${speech.canSpeak() ? `<button class="say" data-act="say" data-text="${esc(v.it)}">🔊</button>` : ""}</div>
      <div class="v-en">${esc(v.en || "")}</div>
      ${v.def ? `<div class="small muted">${md(v.def)}</div>` : ""}
      ${(v.examples || []).filter(x => x.it).slice(0, 2).map(x => `<div class="v-ex"><span class="it">${md(x.it)}</span>${x.en ? ` <span class="muted small">${esc(x.en)}</span>` : ""}</div>`).join("")}
      ${v.collocations && v.collocations.length ? `<div class="small">${v.collocations.map(c => `<span class="chip">${esc(c)}</span>`).join(" ")}</div>` : ""}
    </div>
    <div class="v-side small">
      ${v.register ? `<span class="chip">${esc(v.register)}</span>` : ""}${v.pos ? `<span class="chip">${esc(v.pos)}</span>` : ""}
      <span class="muted">${esc(SOURCES[v.source] || v.source || "")}</span>
      ${(v.conceptIds || []).filter(c => content.concepts.has(c) && !["VOCAB", "MY-PHRASES"].includes(c)).slice(0, 2).map(c => `<a href="#/learn/${esc(c)}" class="cid">${esc(c)}</a>`).join(" ")}
      ${inDeck ? `<span class="${inDeck.card.due <= now ? "bad-t" : "ok-t"}">${inDeck.card.due <= now ? "da ripassare" : "prossimo ripasso " + fmtRel(inDeck.card.due, now)}</span><button class="linkish small" data-act="del">togli</button>`
        : `<button class="btn small" data-act="add">+ Mazzo</button>`}
    </div></div>`;
}

async function reviewSession(view, ctx) {
  const { store, content, query } = ctx;
  const now = store.clock();
  let cards = (await store.vocab()).filter(v => v.it && v.en);
  if (query.source) cards = cards.filter(v => v.source === query.source || (v.sources || []).includes(query.source));
  const due = cards.filter(v => v.card.due <= now).sort((a, b) => a.card.due - b.card.due);
  const list = (query.all || query.source ? (due.length ? due : cards.sort(() => Math.random() - 0.5)) : due).slice(0, 20);
  view.replaceChildren(h(`<section class="page narrow">
    <a class="back" href="#/vocab">← Vocabolario</a>
    ${list.length ? `<div class="session-bar"><span class="sb-title">Flashcards</span><div class="progress-dots">${list.map(() => "<span></span>").join("")}</div><span class="sb-count"></span></div>
    <div class="card dir-toggle small"><label class="toggle"><input type="radio" name="dir" value="en-it" checked> Inglese → scrivi l'italiano</label>
      <label class="toggle"><input type="radio" name="dir" value="it-en"> Italiano → ricorda il significato</label></div>` : `<div class="card empty"><h2>Niente da ripassare</h2><p>Il tuo mazzo è in pari. Aggiungi parole dalla biblioteca o dalla cronologia di Google Translate.</p><a class="btn primary" href="#/vocab">Sfoglia la biblioteca</a></div>`}
    <div id="ex"></div></section>`));
  if (!list.length) return;
  const host = view.querySelector("#ex"), dots = view.querySelectorAll(".progress-dots span");
  for (const [i, v] of list.entries()) {
    view.querySelector(".sb-count").textContent = `${i + 1}/${list.length}`;
    dots[i].classList.add("cur");
    const dir = view.querySelector("[name=dir]:checked").value;
    const grade = dir === "en-it" ? await typed(host, v, store, content) : await recall(host, v);
    dots[i].className = grade >= 3 ? "ok" : "bad";
    await store.reviewVocab(v.id, grade);
  }
  host.replaceChildren(h(`<div class="card summary"><div class="big-score ok">Fatto!</div><p>${list.length} carte ripassate. Torneranno quando sarà il momento.</p>
    <div class="row-actions"><a class="btn primary" href="#/vocab">Torna al vocabolario</a></div></div>`));
}

// Typed recall goes through the normal answer checker, so mistakes reach the Error Bank as well.
async function typed(host, v, store, content) {
  const conceptId = (v.conceptIds || []).find(c => content.concepts.has(c)) || "VOCAB";
  const item = { id: "vocab:" + v.id, conceptId, type: "translate", skill: "vocabulary", noVocabCard: true, difficulty: 2,
    instruction: "Say it in Italian.", prompt: v.en + (v.def && !/Google Translate/.test(v.def) ? ` (${v.def.replace(/\*/g, "")})` : ""), answers: [v.it.replace(/[()[\]|]/g, " ")],
    errorType: "vocabulary", explanation: (v.examples || [])[0]?.it ? "Example: " + v.examples[0].it : "" };
  const { result } = await runExercise(host, item, { store, source: "vocab", mode: "review", silent: speech.isSilent() });
  return result.verdict === "correct" ? 4 : result.correct ? 3 : 0;
}

function recall(host, v) {
  return new Promise(res => {
    host.replaceChildren(h(`<div class="card flash"><div class="it big-word">${esc(v.it)}</div>
      <button class="btn primary" data-show>Mostra il significato</button><div class="back-side" hidden><p class="v-en">${esc(v.en)}</p>
      ${(v.examples || []).slice(0, 1).map(x => `<p class="it small">${md(x.it)}</p>`).join("")}
      <p class="small muted">Quanto bene la sapevi?</p>
      <div class="row-actions"><button class="btn" data-g="0">Non la sapevo</button><button class="btn" data-g="3">Difficile</button><button class="btn primary" data-g="4">Bene</button><button class="btn" data-g="5">Facile</button></div></div></div>`));
    const c = host.querySelector(".flash");
    c.querySelector("[data-show]").onclick = e => { e.target.hidden = true; c.querySelector(".back-side").hidden = false; };
    c.addEventListener("click", e => { const b = e.target.closest("[data-g]"); if (b) res(Number(b.dataset.g)); });
  });
}
