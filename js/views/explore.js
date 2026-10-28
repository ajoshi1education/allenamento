// Esplora: free mode. Everything in the app, to browse in any order.
import { h, esc } from "../ui.js";

export async function render(view, { store, content }) {
  const [errors, vocab, imports] = await Promise.all([store.errors(), store.vocab(), store.imports()]);
  const tiles = [
    { href: "#/learn", icon: "📚", c: "green", title: "Tutte le lezioni", sub: `${content.concepts.size - 2} argomenti, B2 → C1, in qualsiasi ordine` },
    { href: "#/play", icon: "🎲", c: "purple", title: "Tutti i giochi", sub: `${[...content.games.values()].length} giochi: casi gialli, conversazioni, duelli…` },
    { href: "#/play/G-BLITZ-01", icon: "👀", c: "red", title: "Occhio all’errore!", sub: "Nuovo gioco: 60 secondi, giusta o sbagliata?" },
    { href: "#/verbi", icon: "🔤", c: "orange", title: "Verbi", sub: `${(content.verbs || []).length} verbi: allenamento e tabelle di coniugazione` },
    { href: "#/play?type=dictation", icon: "✍️", c: "teal", title: "Dettato", sub: "Ascolta una frase e scrivila" },
    { href: "#/vocab", icon: "🗂️", c: "pink", title: "Vocabolario", sub: `${(content.vocabSeed || []).length} parole ed espressioni, ${vocab.length} nel tuo mazzo` },
    { href: "#/translate", icon: "🔁", c: "blue", title: "Google Translate", sub: imports.length ? `${imports.length} frasi importate` : "Importa la tua cronologia di traduzioni" },
    { href: "#/errors", icon: "🧭", c: "red", title: "Banca degli errori", sub: `${errors.length} errori registrati, ${errors.filter(e => e.status !== "mastered").length} aperti` },
    { href: "#/learn/coverage", icon: "🧩", c: "teal", title: "Mappa del programma", sub: "Ogni argomento, con lezione, esercizi e giochi" },
    { href: "#/diagnostic", icon: "📏", c: "gold", title: "Test di livello", sub: "Scopri il tuo livello e salta ciò che sai già" },
    { href: "#/progress", icon: "📈", c: "green", title: "Progressi", sub: "Abilità, traguardi, sfide settimanali" },
    { href: "#/settings", icon: "📲", c: "blue", title: "App sul telefono", sub: "Codice QR e istruzioni per installarla sul telefono" }
  ];
  view.replaceChildren(h(`<section class="page explore">
    <div class="page-head"><div><h1>Esplora</h1><p class="muted">Modalità libera: apri qualsiasi lezione o gioco, nell'ordine che vuoi. Progressi ed errori vengono registrati come nel percorso.</p></div></div>
    <div class="tile-grid">${tiles.map(t => `<a class="tile c-${t.c}" href="${t.href}"><span class="tile-icon">${t.icon}</span><b>${esc(t.title)}</b><small>${esc(t.sub)}</small></a>`).join("")}</div>
  </section>`));
}
