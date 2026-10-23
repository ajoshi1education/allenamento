// Google Translate History: import → preview → library → personalised vocab, grammar exercises and games.
import { h, esc, md, toast, fmtDate } from "../ui.js";
import { detectAndParse, detectGrammar } from "../core/importer.js";

export async function render(view, ctx) {
  const { store, content } = ctx;
  const rows = (await store.imports()).sort((a, b) => b.importedAt - a.importedAt);
  const complete = rows.filter(r => r.it && !r.incomplete);
  const incomplete = rows.filter(r => r.incomplete);
  const byConcept = new Map();
  complete.forEach(r => (r.grammar || []).forEach(g => byConcept.set(g.conceptId, [...(byConcept.get(g.conceptId) || []), r])));
  const games = ["G-MINE-01", "G-MINE-02", "G-MINE-03"].map(id => content.games.get(id)).filter(Boolean);

  view.replaceChildren(h(`<section class="page translate">
    <div class="page-head"><div><h1>Cronologia di Google Translate</h1>
      <p class="muted">Trasforma le parole e le frasi che hai cercato in flashcard, esercizi di grammatica e giochi.</p></div></div>

    <div class="card how">
      <h3>Come esportare i tuoi dati da Google Translate</h3>
      <p class="small muted">Google offers no API for your personal history. These are the export routes that exist:</p>
      <ol class="small">
        <li><b>Saved translations (best: has both sides).</b> On a computer, open translate.google.com signed in → <i>Saved</i> → <i>Export to Google Sheets</i>. In Sheets: <i>File › Download › Comma-separated values (.csv)</i>. History entries only appear in Saved if you star them, so star the useful ones first.</li>
        <li><b>Google Takeout.</b> takeout.google.com → select only <i>My Activity</i> → <i>All activity data included</i> → choose <i>Translate</i> → JSON format. Upload <code>MyActivity.json</code> (or the .html). This usually contains only what you typed, not the translation. English-only lookups are listed below so you can add the Italian.</li>
        <li><b>Copy and paste.</b> One phrase per line, optionally with a translation: <code>non vedo l'ora	I can't wait</code> (tab, " = " or " — " also work).</li>
      </ol>
    </div>

    <div class="card">
      <h3>Importa</h3>
      <div class="import-row">
        <label class="btn">Scegli un file… <input type="file" id="file" accept=".csv,.tsv,.txt,.json,.html,.htm" hidden></label>
        <span class="small muted" id="fname">CSV / TSV da Fogli, JSON / HTML da Takeout, o testo</span>
      </div>
      <textarea id="paste" rows="4" placeholder="…oppure incolla qui le righe"></textarea>
      <div class="row-actions"><button class="btn" id="preview">Anteprima</button></div>
      <div id="previewBox"></div>
    </div>

    ${rows.length ? `
    <div class="stat-row">
      <div class="stat card"><b>${complete.length}</b><span>frasi</span></div>
      <div class="stat card"><b>${content.importItems ? content.importItems.length : 0}</b><span>esercizi generati</span></div>
      <div class="stat card"><b>${byConcept.size}</b><span>argomenti di grammatica trovati</span></div>
      <div class="stat card ${incomplete.length ? "warn" : ""}"><b>${incomplete.length}</b><span>senza italiano</span></div>
    </div>
    <div class="card"><h3>Esercitati con le tue frasi</h3>
      ${games.length ? `<div class="game-links">${games.map(g => `<a class="btn ${g.id === "G-MINE-01" ? "primary" : ""}" href="#/play/${g.id}">${esc(g.title)}</a>`).join("")}<a class="btn ghost" href="#/vocab/review?source=import">Flashcards</a></div>` : `<p class="small muted">Importa almeno 4 frasi con traduzione per sbloccare i giochi.</p>`}
      ${byConcept.size ? `<h4 style="margin-top:1rem">La grammatica nelle tue frasi</h4><div class="gram-groups">${[...byConcept].map(([cid, rs]) => `<div class="gram-group"><a href="#/learn/${esc(cid)}"><b>${esc(content.concepts.get(cid)?.title || cid)}</b></a> <span class="chip">${rs.length}</span>
        <div class="small it">${rs.slice(0, 3).map(r => esc(r.it)).join(" · ")}</div>
        <a class="small" href="#/learn/${esc(cid)}/practice">Esercitati (con le tue frasi) →</a></div>`).join("")}</div>` : ""}
    </div>
    ${incomplete.length ? `<div class="card"><h3>Ricerche senza traduzione italiana</h3><p class="small muted">Aggiungi l'italiano che hai imparato, e diventeranno anche flashcard ed esercizi.</p>
      <div class="incomplete">${incomplete.slice(0, 30).map(r => `<div class="inc-row" data-id="${esc(r.id)}"><span>${esc(r.en)}</span><input type="text" class="it" placeholder="in italiano…"><button class="btn small" data-fill>Salva</button></div>`).join("")}</div></div>` : ""}
    <div class="card"><div class="lib-head"><h3>La tua biblioteca</h3><input type="search" id="q" placeholder="Cerca…"></div>
      <div class="table-wrap"><table class="coverage-table" id="lib"><thead><tr><th>Italiano</th><th>Inglese</th><th>Grammatica</th><th>Importata</th><th></th></tr></thead><tbody></tbody></table></div></div>` : ""}
  </section>`));

  const $ = s => view.querySelector(s);
  let fileText = null, fileName = "";
  $("#file").onchange = async e => { const f = e.target.files[0]; if (!f) return; fileText = await f.text(); fileName = f.name; $("#fname").textContent = `${f.name} (${Math.round(f.size / 1024)} KB)`; preview(); };
  $("#preview").onclick = () => { fileText = null; fileName = ""; preview(); };

  function preview() {
    const text = fileText ?? $("#paste").value;
    if (!text.trim()) { toast("Prima scegli un file o incolla del testo."); return; }
    const { format, rows: parsed } = detectAndParse(text, fileName);
    const box = $("#previewBox");
    if (!parsed.length) { box.innerHTML = `<p class="bad-t">Nessuna voce italiano ↔ inglese trovata (formato rilevato: ${esc(format)}). Controlla che il file sia il CSV delle traduzioni salvate o un export di Translate da Takeout.</p>`; return; }
    const known = new Set(rows.map(r => r.id));
    box.innerHTML = `<p><b>${parsed.length}</b> voci trovate · formato <span class="chip">${esc(format)}</span></p>
      <div class="table-wrap"><table class="coverage-table"><thead><tr><th>Italiano</th><th>Inglese</th><th>Direzione</th><th>Grammatica trovata</th></tr></thead><tbody>
      ${parsed.slice(0, 15).map(r => `<tr><td class="it">${esc(r.it || "—")}</td><td>${esc(r.en || "—")}</td><td class="small">${esc(r.direction)}</td><td class="small">${r.it ? detectGrammar(r.it).map(g => esc(g.label)).join(", ") : ""}</td></tr>`).join("")}</tbody></table></div>
      ${parsed.length > 15 ? `<p class="small muted">…e altre ${parsed.length - 15}</p>` : ""}
      <div class="row-actions"><button class="btn primary" id="doImport">Importa ${parsed.length} voci</button></div>`;
    $("#doImport").onclick = async () => {
      const res = await store.importRows(parsed, { file: fileName, format });
      toast(`${res.added} voci nuove importate${res.dupes ? `, ${res.dupes} già presenti` : ""}`);
      render(view, ctx);
    };
    void known;
  }

  view.querySelectorAll("[data-fill]").forEach(b => b.onclick = async () => {
    const row = b.closest(".inc-row"), it = row.querySelector("input").value.trim();
    if (!it) return;
    await store.updateImport(row.dataset.id, { it });
    toast("Salvata: ora fa parte delle tue frasi"); render(view, ctx);
  });

  const lib = $("#lib");
  if (lib) {
    const paint = () => {
      const q = $("#q").value.trim().toLowerCase();
      const list = complete.filter(r => !q || (r.it + " " + r.en).toLowerCase().includes(q));
      lib.querySelector("tbody").innerHTML = list.slice(0, 300).map(r => `<tr data-id="${esc(r.id)}"><td class="it">${esc(r.it)}</td><td>${esc(r.en)}</td>
        <td class="small">${(r.grammar || []).map(g => `<a href="#/learn/${esc(g.conceptId)}">${esc(g.label)}</a>`).join(", ")}</td>
        <td class="small muted">${fmtDate(r.importedAt)}</td><td><button class="linkish small" data-del>togli</button></td></tr>`).join("") || `<tr><td colspan="5" class="muted">Nessun risultato.</td></tr>`;
    };
    $("#q").oninput = paint;
    lib.addEventListener("click", async e => {
      if (!e.target.matches("[data-del]")) return;
      await store.deleteImport(e.target.closest("tr").dataset.id);
      toast("Tolta"); render(view, ctx);
    });
    paint();
  }
  void md;
}
