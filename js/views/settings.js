// Settings: audio mode and voices, theme, backup/restore, and a debug clock for testing day-based rules.
import { h, esc, toast, confirmDialog } from "../ui.js";
import { exportAll, importAll } from "../db.js";
import { getOffset, setOffset } from "../core/clock.js";
import * as speech from "../speech.js";
import * as inst from "../install.js";

export async function render(view, { store }) {
  const theme = await store.setting("theme", "auto");
  const counts = {};
  for (const s of ["errors", "attempts", "vocab", "progress", "imports"]) counts[s] = (await store.db.all(s)).length;
  view.replaceChildren(h(`<section class="page narrow">
    <h1>Impostazioni</h1>
    <div class="card"><h3>Audio</h3>
      <div class="mode-pick">
        <label><input type="radio" name="amode" value="silent"> <b>🔇 Muto</b><small>Solo testo, per i luoghi pubblici</small></label>
        <label><input type="radio" name="amode" value="listen"> <b>🔊 Audio</b><small>Domande e risposte lette ad alta voce; tu scrivi</small></label>
        <label ${speech.hasRecognition() ? "" : "class='dim'"}><input type="radio" name="amode" value="speak" ${speech.hasRecognition() ? "" : "disabled"}> <b>🎤 Parla</b><small>Lettura ad alta voce, e rispondi con la voce</small></label>
      </div>
      <div class="grid2" style="margin-top:.8rem">
        <label class="small">Voce italiana<select id="voiceIt"></select></label>
        <label class="small">Voce inglese (istruzioni)<select id="voiceEn"></select></label>
      </div>
      <div class="row-actions"><button class="btn small" id="testBeep">🔔 Prova l'audio</button><button class="btn small" id="testVoice">🔊 Prova la voce</button><button class="btn small" id="testMic" ${speech.hasRecognition() ? "" : "disabled"}>🎤 Prova il microfono</button></div>
      <p class="small muted" id="audioStatus">Voce italiana: ${speech.hasItalianVoice() ? "disponibile ✓" : "nessuna trovata. Chrome include 'Google italiano'; su Windows puoi aggiungere l'italiano in Impostazioni › Data/ora e lingua › Voce"} · Riconoscimento vocale: ${speech.hasRecognition() ? "disponibile ✓ (Chrome / Edge, serve internet)" : "non disponibile in questo browser. Usa Chrome o Edge"}</p></div>
    <div class="card" id="appCard"><h3>📲 App per telefono e computer</h3>
      ${inst.isInstalled() ? `<p>✓ Stai usando l'app installata.</p>` : `<p>Install Allenamento so it opens full screen from your home screen and works offline.</p>
      <div class="row-actions"><button class="btn3d primary" id="installBtn">Installa l'app</button></div>
      <p class="small muted" id="installHow"></p>`}
      <div class="qr-box"><img src="icons/qr.svg" alt="Codice QR con l'indirizzo dell'app" width="150" height="150">
        <div><b>Sul telefono</b><p class="small">Scan this with your phone camera to open Allenamento, then install it:</p>
        <ul class="small install-steps"><li>${inst.HOWTO.ios}</li><li>${inst.HOWTO.android}</li></ul>
        <p class="small muted">Your progress lives on each device. To have the same Error Bank on phone and computer, use <b>Sync</b> below, or <b>Export</b> here and <b>Import</b> there.</p></div></div></div>
    <div class="card"><h3>Obiettivo giornaliero</h3>
      <select id="goal"><option value="20">Leggero: 20 XP al giorno (circa 5–10 minuti)</option><option value="30">Regolare: 30 XP (circa 10–15 minuti)</option><option value="50">Impegnato: 50 XP (circa 20 minuti)</option><option value="100">Intenso: 100 XP (circa 40 minuti)</option></select></div>
    <div class="card"><h3>Aspetto</h3>
      <select id="theme"><option value="auto">Come il sistema</option><option value="light">Chiaro</option><option value="dark">Scuro</option></select></div>
    <div class="card"><h3>I tuoi dati</h3>
      <p>Stored in this browser's database (${esc(store.db.kind)}): ${counts.errors} errors, ${counts.attempts} answers, ${counts.vocab} vocabulary cards, ${counts.progress} concepts in progress, ${counts.imports} imports.</p>
      <p class="small muted">Download a backup now and then. It's one JSON file you can restore on any device.</p>
      <div class="row-actions"><button class="btn primary" id="export">Scarica il backup</button>
        <label class="btn">Ripristina un backup… <input type="file" id="import" accept="application/json,.json" hidden></label></div></div>
    <div class="card" id="syncCard"><h3>Sincronizza telefono e computer (facoltativo, gratis)</h3>
      ${window.__sync && window.__sync.signedIn() ? `
        <p>Accesso come <b>${esc(window.__sync.email())}</b>. ${window.__sync.lastSync() ? `Ultima sincronizzazione: ${new Date(window.__sync.lastSync().t).toLocaleString()} (↓${window.__sync.lastSync().pulled} ↑${window.__sync.lastSync().pushed}).` : "Non ancora sincronizzato."}</p>
        <div class="row-actions"><button class="btn primary" id="syncNow">Sincronizza ora</button><button class="btn ghost" id="syncOut">Esci dalla sincronizzazione</button></div>`
      : `<details ${window.__sync && window.__sync.configured() ? "open" : ""}><summary>Configura con un progetto Supabase gratuito (circa 5 minuti)</summary>
        <ol class="small"><li>Create a free project at supabase.com.</li><li>In <i>SQL Editor</i>, run the file <code>supabase/schema.sql</code> from this app.</li>
        <li>In <i>Authentication › URL Configuration</i>, add this app's address (<code>${esc(location.origin + location.pathname)}</code>) as a redirect URL.</li>
        <li>Copy the <i>Project URL</i> and the <i>anon public</i> key from <i>Project Settings › API</i> below. The anon key is designed to be public, and row-level security keeps your data private.</li></ol>
        <div class="grid2 sync-form"><input type="text" id="sUrl" placeholder="https://xxxx.supabase.co" value="${esc(window.__sync?.configured() ? JSON.parse(localStorage.getItem("allenamento.sync.cfg") || "{}").url || "" : "")}">
        <input type="text" id="sKey" placeholder="chiave anon public"><input type="text" id="sEmail" placeholder="la tua email"></div>
        <div class="row-actions"><button class="btn primary" id="sLink">Mandami un link di accesso</button></div></details>`}
      <p class="small muted">Without sync, everything stays in this browser. Use the backup file to move data.</p></div>
    <div class="card"><h3>Strumenti di test</h3>
      <p class="small muted">Shift the app's clock to check day-based rules such as Error Bank mastery and spaced repetition. Current shift: <b id="off">${getOffset()}</b> day(s).</p>
      <div class="row-actions"><button class="btn small" data-off="1">+1 giorno</button><button class="btn small" data-off="7">+7 giorni</button><button class="btn small" data-off="0">Torna a oggi</button></div></div>
  </section>`));
  view.querySelector("#theme").value = theme;
  const ib = view.querySelector("#installBtn");
  if (ib) ib.onclick = async () => {
    const r = await inst.install();
    const how = view.querySelector("#installHow");
    if (r === "accepted") toast("Installata! Trovi Allenamento nella schermata Home.");
    else if (r === "ios") how.innerHTML = inst.HOWTO.ios;
    else if (r === "unavailable") how.innerHTML = `${inst.HOWTO.android}<br>${inst.HOWTO.ios}<br>${inst.HOWTO.desktop}`;
  };
  view.querySelector("#goal").value = String(await store.setting("dailyGoal", 30));
  view.querySelector("#goal").onchange = async e => { await store.setSetting("dailyGoal", Number(e.target.value)); toast("Obiettivo giornaliero aggiornato"); };
  view.querySelector("#theme").onchange = async e => { await store.setSetting("theme", e.target.value); applyTheme(e.target.value); };
  // audio mode, voices, tests
  view.querySelectorAll("[name=amode]").forEach(r => { r.checked = r.value === speech.getMode(); r.onchange = async () => { speech.setMode(r.value); await store.setSetting("audioMode", r.value); window.__paintMode && window.__paintMode(); }; });
  const prefs = await store.setting("voices", {});
  const fillVoices = () => {
    const vs = speech.voiceList();
    for (const [id, lang] of [["#voiceIt", "it"], ["#voiceEn", "en"]]) {
      const sel = view.querySelector(id);
      const list = vs.filter(v => v.lang.toLowerCase().startsWith(lang));
      sel.innerHTML = `<option value="">Automatica (la migliore disponibile)</option>` + list.map(v => `<option ${prefs[lang] === v.name ? "selected" : ""}>${esc(v.name)}</option>`).join("");
      sel.onchange = async () => { prefs[lang] = sel.value; speech.setPreferredVoice(lang, sel.value); await store.setSetting("voices", { ...prefs }); };
    }
  };
  fillVoices();
  if (typeof speechSynthesis !== "undefined") speechSynthesis.addEventListener?.("voiceschanged", fillVoices);
  // A plain beep: if you can't hear this, Chrome or Windows is muting this site (not an app problem).
  view.querySelector("#testBeep").onclick = async () => {
    const st = view.querySelector("#audioStatus");
    try {
      const ac = new AudioContext(); await ac.resume();
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 660; g.gain.setValueAtTime(0.25, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.8);
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.8);
      st.innerHTML = "You should hear a beep. <b>No beep?</b> Sound is muted for this site: right-click this Chrome tab → <i>Unmute site</i>; or click the icon left of the address → <i>Site settings</i> → <i>Sound: Allow</i>; and check the Windows volume mixer (Chrome) and your output device.";
    } catch (e) { st.textContent = "Impossibile riprodurre il suono di prova: " + e.message; }
  };
  view.querySelector("#testVoice").onclick = async () => {
    const was = speech.getMode(); if (was === "silent") speech.setMode("listen");
    await speech.sayAll([{ text: "Ciao! Questa è la voce che sentirai durante le lezioni.", lang: "it-IT" }, { text: "And this is the English voice.", lang: "en-GB" }]);
    speech.setMode(was);
  };
  view.querySelector("#testMic").onclick = async e => {
    const st = view.querySelector("#audioStatus");
    const was = speech.getMode(); speech.setMode("speak");
    e.target.disabled = true; st.textContent = "Di' qualcosa in italiano… (es. 'Buongiorno, come stai?')";
    const r = await speech.listen({ onInterim: t => (st.textContent = "🎤 " + t), onStatus: s => (st.textContent = speech.MIC_STATUS[s] + (s === "listening" ? " Di' qualcosa in italiano…" : "")) });
    speech.setMode(was); e.target.disabled = false;
    st.textContent = r.error ? (speech.MIC_HELP[r.error] || "Errore: " + r.error) : `✓ Ho sentito: “${r.text}” (sicurezza ${Math.round((r.confidence || 0) * 100)}%)`;
  };
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
      if (!(await confirmDialog({ title: "Vuoi ripristinare questo backup?", text: "Verrà unito ai dati attuali. Le voci con lo stesso id vengono sovrascritte.", ok: "Ripristina", cancel: "Annulla" }))) return;
      await importAll(store.db, dump);
      toast("Backup ripristinato"); store.emit("import");
      render(view, { store });
    } catch (err) { toast("Ripristino non riuscito: " + err.message, "bad"); }
  };
  const S = window.__sync;
  view.querySelector("#syncNow")?.addEventListener("click", async e => {
    e.target.disabled = true; e.target.textContent = "Sincronizzazione…";
    try { const r = await S.sync(); toast(`Sincronizzato: ↓${r.pulled} ↑${r.pushed}`); store.emit("sync"); } catch (err) { toast("Sincronizzazione non riuscita: " + err.message, "bad"); }
    render(view, { store });
  });
  view.querySelector("#syncOut")?.addEventListener("click", () => { S.signOut(); toast("Sei uscito dalla sincronizzazione"); render(view, { store }); });
  view.querySelector("#sLink")?.addEventListener("click", async () => {
    const url = view.querySelector("#sUrl").value, key = view.querySelector("#sKey").value, email = view.querySelector("#sEmail").value;
    if (!/^https:\/\/.+/.test(url) || !key || !/@/.test(email)) { toast("Compila URL del progetto, chiave anon ed email"); return; }
    S.configure(url, key, email);
    try { await S.sendMagicLink(email, location.origin + location.pathname); toast("Controlla la tua email: ti è arrivato il link di accesso"); }
    catch (err) { toast("Invio del link non riuscito: " + err.message, "bad"); }
  });
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
