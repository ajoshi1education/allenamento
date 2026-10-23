// Verbi: conjugation drills (choose tenses) and a searchable conjugation table.
import { h, esc, toast } from "../ui.js";
import { runSession } from "../session.js";
import { TENSES, PERSONS, formsFor, buildDrill, wrongCounts } from "../core/verbs.js";
import * as speech from "../speech.js";

export async function render(view, ctx) {
  const { store, content, params } = ctx;
  const verbs = content.verbs || [];
  if (params[0]) return table(view, ctx, params[0]);
  const saved = await store.setting("verbDrill", { tenses: ["congiuntivo", "condizionale", "passato_remoto"], onlyIrregular: true });
  const wrong = wrongCounts(await store.errors());
  view.replaceChildren(h(`<section class="page narrow verbs">
    <div class="hero card3d c-orange"><div class="hero-icon">🔤</div>
      <div><h1>Verbi</h1><p>${verbs.length} verbi: allenati sulle coniugazioni che contano di più. I verbi che sbagli tornano più spesso.</p></div></div>
    <div class="card3d">
      <h3>Quali tempi?</h3>
      <div class="tense-pick">${TENSES.map(t => `<label class="fchip ${saved.tenses.includes(t.id) ? "on" : ""}"><input type="checkbox" value="${t.id}" ${saved.tenses.includes(t.id) ? "checked" : ""}>${esc(t.label)}</label>`).join("")}</div>
      <label class="toggle" style="margin-top:.7rem"><input type="checkbox" id="irr" ${saved.onlyIrregular ? "checked" : ""}> Solo verbi irregolari</label>
      <div class="row-actions"><button class="btn3d primary big" data-go>▶ Allenati (12 verbi)</button></div>
      ${wrong.size ? `<p class="small muted">Da ripassare: ${[...wrong.keys()].slice(0, 8).map(esc).join(", ")}</p>` : ""}
    </div>
    <div class="card3d"><h3>Tabella dei verbi</h3><input type="search" id="vq" placeholder="Cerca un verbo (es. andare, porre, cogliere)…">
      <div class="verb-list">${verbs.map(v => `<a class="fchip" href="#/verbi/${esc(v.inf)}" data-v="${esc(v.inf)} ${esc(v.en)}">${esc(v.inf)}</a>`).join("")}</div></div>
  </section>`));
  view.querySelectorAll(".tense-pick input").forEach(i => (i.onchange = () => i.parentElement.classList.toggle("on", i.checked)));
  view.querySelector("#vq").oninput = e => { const q = e.target.value.trim().toLowerCase(); view.querySelectorAll(".verb-list a").forEach(a => (a.hidden = q && !a.dataset.v.toLowerCase().includes(q))); };
  view.querySelector("[data-go]").onclick = async () => {
    const tenses = [...view.querySelectorAll(".tense-pick input:checked")].map(i => i.value);
    if (!tenses.length) { toast("Scegli almeno un tempo"); return; }
    const onlyIrregular = view.querySelector("#irr").checked;
    await store.setSetting("verbDrill", { tenses, onlyIrregular });
    const items = buildDrill(verbs, { tenses, onlyIrregular, n: 12, wrong: wrongCounts(await store.errors()) });
    const res = await runSession({ title: "Verbi", subtitle: tenses.map(t => TENSES.find(x => x.id === t).label).join(" · "), steps: items.map(item => ({ type: "exercise", item })) },
      { store, nodeId: null, kind: "practice", accent: "orange" });
    if (!res.exited) render(view, ctx);
  };
}

function table(view, ctx, inf) {
  const v = (ctx.content.verbs || []).find(x => x.inf === inf);
  if (!v) { view.replaceChildren(h(`<div class="page"><a class="back" href="#/verbi">← Verbi</a><div class="card">Verbo non trovato.</div></div>`)); return; }
  const rows = TENSES.filter(t => t.id !== "imperativo").map(t => `<div class="vt-tense card3d"><h4>${esc(t.label)}</h4>
    ${PERSONS.map((p, i) => { const f = formsFor(v, t.id, i); return `<div class="vt-row"><span class="muted">${t.che ? "che " : ""}${p}</span><b class="it">${esc(f[0])}</b>${f.length > 1 ? `<span class="small muted">${esc(f.slice(1).join(", "))}</span>` : ""}</div>`; }).join("")}</div>`).join("");
  view.replaceChildren(h(`<section class="page verb-table">
    <a class="back" href="#/verbi">← Verbi</a>
    <div class="page-head"><div><h1 class="it">${esc(v.inf)} ${speech.canSpeak() ? `<button class="say-btn" data-say>🔊</button>` : ""}</h1>
      <p class="muted">${esc(v.en)} · ausiliare <b>${esc(v.aux)}</b> · participio <b class="it">${esc(v.participio)}</b> · gerundio <b class="it">${esc(v.gerundio)}</b> ${v.regular ? `<span class="chip ok">regolare</span>` : `<span class="chip warn">irregolare</span>`}</p></div></div>
    <div class="vt-grid">${rows}
      <div class="vt-tense card3d"><h4>Imperativo</h4>${["tu", "lei", "noi", "voi"].map((k, i) => `<div class="vt-row"><span class="muted">${k === "lei" ? "Lei" : k}</span><b class="it">${esc(formsFor(v, "imperativo", i).join(" / "))}</b></div>`).join("")}</div>
    </div></section>`));
  view.querySelector("[data-say]")?.addEventListener("click", () => speech.say(`${v.inf}. ${v.tempi.presente.join(", ")}`));
}
