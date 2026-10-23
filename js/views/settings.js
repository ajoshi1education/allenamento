// Settings: silent mode, theme, backup/restore, and a debug clock for testing day-based rules.
import { h, esc, toast } from "../ui.js";
import { exportAll, importAll } from "../db.js";
import { getOffset, setOffset } from "../core/clock.js";
import * as speech from "../speech.js";

export async function render(view, { store }) {
  const theme = await store.setting("theme", "auto");
  const counts = {};
  for (const s of ["errors", "attempts", "vocab", "progress", "imports"]) counts[s] = (await store.db.all(s)).length;
  view.replaceChildren(h(`<section class="page narrow">
    <h1>Settings</h1>
    <div class="card"><h3>Use in public</h3>
      <label class="toggle"><input type="checkbox" id="silent" ${speech.isSilent() ? "checked" : ""}> Silent mode: no audio and no microphone. Listening and speaking tasks switch to text versions.</label>
      <p class="small muted">Italian voice on this device: ${speech.hasItalianVoice() ? "available ✓" : "not found (listening tasks will show text instead)"} · Speech recognition: ${globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition ? "available ✓" : "not available in this browser"}</p></div>
    <div class="card"><h3>Appearance</h3>
      <select id="theme"><option value="auto">Match system</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
    <div class="card"><h3>Your data</h3>
      <p>Stored in this browser's database (${esc(store.db.kind)}): ${counts.errors} errors, ${counts.attempts} answers, ${counts.vocab} vocabulary cards, ${counts.progress} concepts in progress, ${counts.imports} imports.</p>
      <p class="small muted">Download a backup now and then. It's one JSON file you can restore on any device.</p>
      <div class="row-actions"><button class="btn primary" id="export">Download backup</button>
        <label class="btn">Restore backup… <input type="file" id="import" accept="application/json,.json" hidden></label></div></div>
    <div class="card"><h3>Testing tools</h3>
      <p class="small muted">Shift the app's clock to check day-based rules such as Error Bank mastery and spaced repetition. Current shift: <b id="off">${getOffset()}</b> day(s).</p>
      <div class="row-actions"><button class="btn small" data-off="1">+1 day</button><button class="btn small" data-off="7">+7 days</button><button class="btn small" data-off="0">Reset to today</button></div></div>
  </section>`));
  view.querySelector("#theme").value = theme;
  view.querySelector("#theme").onchange = async e => { await store.setSetting("theme", e.target.value); applyTheme(e.target.value); };
  view.querySelector("#silent").onchange = async e => { speech.setSilent(e.target.checked); await store.setSetting("silent", e.target.checked); document.getElementById("silentBtn").textContent = e.target.checked ? "🔇" : "🔊"; };
  view.querySelector("#export").onclick = async () => {
    const dump = await exportAll(store.db);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(dump)], { type: "application/json" }));
    a.download = `allenamento-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  view.querySelector("#import").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const dump = JSON.parse(await f.text());
      if (!confirm("Merge this backup into your current data? Entries with the same id will be overwritten.")) return;
      await importAll(store.db, dump);
      toast("Backup restored"); store.emit("import");
      render(view, { store });
    } catch (err) { toast("Could not restore: " + err.message, "bad"); }
  };
  view.querySelectorAll("[data-off]").forEach(b => b.onclick = () => {
    const d = Number(b.dataset.off);
    setOffset(d === 0 ? 0 : getOffset() + d);
    location.reload();
  });
}

export function applyTheme(t) {
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}
