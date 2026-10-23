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
    <div class="page-head"><div><h1>Google Translate history</h1>
      <p class="muted">Turn the words and sentences you've looked up into flashcards, grammar exercises and games.</p></div></div>

    <div class="card how">
      <h3>How to get your data out of Google Translate</h3>
      <p class="small muted">Google offers no API for your personal history. These are the export routes that exist:</p>
      <ol class="small">
        <li><b>Saved translations (best: has both sides).</b> On a computer, open translate.google.com signed in → <i>Saved</i> → <i>Export to Google Sheets</i>. In Sheets: <i>File › Download › Comma-separated values (.csv)</i>. History entries only appear in Saved if you star them, so star the useful ones first.</li>
        <li><b>Google Takeout.</b> takeout.google.com → select only <i>My Activity</i> → <i>All activity data included</i> → choose <i>Translate</i> → JSON format. Upload <code>MyActivity.json</code> (or the .html). This usually contains only what you typed, not the translation. English-only lookups are listed below so you can add the Italian.</li>
        <li><b>Copy and paste.</b> One phrase per line, optionally with a translation: <code>non vedo l'ora	I can't wait</code> (tab, " = " or " — " also work).</li>
      </ol>
    </div>

    <div class="card">
      <h3>Import</h3>
      <div class="import-row">
        <label class="btn">Choose file… <input type="file" id="file" accept=".csv,.tsv,.txt,.json,.html,.htm" hidden></label>
        <span class="small muted" id="fname">CSV / TSV from Sheets, Takeout JSON / HTML, or text</span>
      </div>
      <textarea id="paste" rows="4" placeholder="…or paste lines here"></textarea>
      <div class="row-actions"><button class="btn" id="preview">Preview</button></div>
      <div id="previewBox"></div>
    </div>

    ${rows.length ? `
    <div class="stat-row">
      <div class="stat card"><b>${complete.length}</b><span>phrases</span></div>
      <div class="stat card"><b>${content.importItems ? content.importItems.length : 0}</b><span>exercises generated</span></div>
      <div class="stat card"><b>${byConcept.size}</b><span>grammar topics spotted</span></div>
      <div class="stat card ${incomplete.length ? "warn" : ""}"><b>${incomplete.length}</b><span>need Italian</span></div>
    </div>
    <div class="card"><h3>Practise your phrases</h3>
      ${games.length ? `<div class="game-links">${games.map(g => `<a class="btn ${g.id === "G-MINE-01" ? "primary" : ""}" href="#/play/${g.id}">${esc(g.title)}</a>`).join("")}<a class="btn ghost" href="#/vocab/review?source=import">Flashcards</a></div>` : `<p class="small muted">Import at least 4 phrases with translations to unlock the games.</p>`}
      ${byConcept.size ? `<h4 style="margin-top:1rem">Grammar in your own phrases</h4><div class="gram-groups">${[...byConcept].map(([cid, rs]) => `<div class="gram-group"><a href="#/learn/${esc(cid)}"><b>${esc(content.concepts.get(cid)?.title || cid)}</b></a> <span class="chip">${rs.length}</span>
        <div class="small it">${rs.slice(0, 3).map(r => esc(r.it)).join(" · ")}</div>
        <a class="small" href="#/learn/${esc(cid)}/practice">Practise (includes your phrases) →</a></div>`).join("")}</div>` : ""}
    </div>
    ${incomplete.length ? `<div class="card"><h3>Lookups without an Italian translation</h3><p class="small muted">Add the Italian you learned, and these become flashcards and exercises too.</p>
      <div class="incomplete">${incomplete.slice(0, 30).map(r => `<div class="inc-row" data-id="${esc(r.id)}"><span>${esc(r.en)}</span><input type="text" class="it" placeholder="in italiano…"><button class="btn small" data-fill>Save</button></div>`).join("")}</div></div>` : ""}
    <div class="card"><div class="lib-head"><h3>Your library</h3><input type="search" id="q" placeholder="Search…"></div>
      <div class="table-wrap"><table class="coverage-table" id="lib"><thead><tr><th>Italian</th><th>English</th><th>Grammar</th><th>Imported</th><th></th></tr></thead><tbody></tbody></table></div></div>` : ""}
  </section>`));

  const $ = s => view.querySelector(s);
  let fileText = null, fileName = "";
  $("#file").onchange = async e => { const f = e.target.files[0]; if (!f) return; fileText = await f.text(); fileName = f.name; $("#fname").textContent = `${f.name} (${Math.round(f.size / 1024)} KB)`; preview(); };
  $("#preview").onclick = () => { fileText = null; fileName = ""; preview(); };

  function preview() {
    const text = fileText ?? $("#paste").value;
    if (!text.trim()) { toast("Choose a file or paste some text first."); return; }
    const { format, rows: parsed } = detectAndParse(text, fileName);
    const box = $("#previewBox");
    if (!parsed.length) { box.innerHTML = `<p class="bad-t">No Italian ↔ English entries found (format detected: ${esc(format)}). Check the file is the Saved-translations CSV or a Takeout Translate export.</p>`; return; }
    const known = new Set(rows.map(r => r.id));
    box.innerHTML = `<p><b>${parsed.length}</b> entries found · format <span class="chip">${esc(format)}</span></p>
      <div class="table-wrap"><table class="coverage-table"><thead><tr><th>Italian</th><th>English</th><th>Direction</th><th>Grammar spotted</th></tr></thead><tbody>
      ${parsed.slice(0, 15).map(r => `<tr><td class="it">${esc(r.it || "—")}</td><td>${esc(r.en || "—")}</td><td class="small">${esc(r.direction)}</td><td class="small">${r.it ? detectGrammar(r.it).map(g => esc(g.label)).join(", ") : ""}</td></tr>`).join("")}</tbody></table></div>
      ${parsed.length > 15 ? `<p class="small muted">…and ${parsed.length - 15} more</p>` : ""}
      <div class="row-actions"><button class="btn primary" id="doImport">Import ${parsed.length} entries</button></div>`;
    $("#doImport").onclick = async () => {
      const res = await store.importRows(parsed, { file: fileName, format });
      toast(`Imported ${res.added} new entries${res.dupes ? `, ${res.dupes} already there` : ""}`);
      render(view, ctx);
    };
    void known;
  }

  view.querySelectorAll("[data-fill]").forEach(b => b.onclick = async () => {
    const row = b.closest(".inc-row"), it = row.querySelector("input").value.trim();
    if (!it) return;
    await store.updateImport(row.dataset.id, { it });
    toast("Saved: now part of your phrases"); render(view, ctx);
  });

  const lib = $("#lib");
  if (lib) {
    const paint = () => {
      const q = $("#q").value.trim().toLowerCase();
      const list = complete.filter(r => !q || (r.it + " " + r.en).toLowerCase().includes(q));
      lib.querySelector("tbody").innerHTML = list.slice(0, 300).map(r => `<tr data-id="${esc(r.id)}"><td class="it">${esc(r.it)}</td><td>${esc(r.en)}</td>
        <td class="small">${(r.grammar || []).map(g => `<a href="#/learn/${esc(g.conceptId)}">${esc(g.label)}</a>`).join(", ")}</td>
        <td class="small muted">${fmtDate(r.importedAt)}</td><td><button class="linkish small" data-del>remove</button></td></tr>`).join("") || `<tr><td colspan="5" class="muted">No matches.</td></tr>`;
    };
    $("#q").oninput = paint;
    lib.addEventListener("click", async e => {
      if (!e.target.matches("[data-del]")) return;
      await store.deleteImport(e.target.closest("tr").dataset.id);
      toast("Removed"); render(view, ctx);
    });
    paint();
  }
  void md;
}
