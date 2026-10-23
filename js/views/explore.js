// Esplora: free mode. Everything in the app, to browse in any order.
import { h, esc } from "../ui.js";

export async function render(view, { store, content }) {
  const [errors, vocab, imports] = await Promise.all([store.errors(), store.vocab(), store.imports()]);
  const tiles = [
    { href: "#/learn", icon: "📚", c: "green", title: "All lessons", sub: `${content.concepts.size - 2} concepts, B2 → C1, in any order` },
    { href: "#/play", icon: "🎲", c: "purple", title: "All games", sub: `${[...content.games.values()].length} games: detective cases, conversations, duels…` },
    { href: "#/verbi", icon: "🔤", c: "orange", title: "Verbi", sub: `${(content.verbs || []).length} verbi: allenamento e tabelle di coniugazione` },
    { href: "#/play?type=dictation", icon: "✍️", c: "teal", title: "Dettato", sub: "Ascolta una frase e scrivila" },
    { href: "#/vocab", icon: "🗂️", c: "orange", title: "Vocabulary", sub: `${(content.vocabSeed || []).length} words and expressions, ${vocab.length} in your deck` },
    { href: "#/translate", icon: "🔁", c: "blue", title: "Google Translate", sub: imports.length ? `${imports.length} imported phrases` : "Import your translation history" },
    { href: "#/errors", icon: "🧭", c: "red", title: "Error Bank", sub: `${errors.length} mistakes recorded, ${errors.filter(e => e.status !== "mastered").length} open` },
    { href: "#/learn/coverage", icon: "🧩", c: "teal", title: "Curriculum map", sub: "Every concept, with its lesson, exercises and games" },
    { href: "#/diagnostic", icon: "📏", c: "gold", title: "Placement test", sub: "Find your level and skip what you know" },
    { href: "#/progress", icon: "📈", c: "green", title: "Progress", sub: "Skills, achievements, weekly challenges" },
    { href: "#/settings", icon: "📲", c: "blue", title: "App sul telefono", sub: "QR code and install steps for your phone" }
  ];
  view.replaceChildren(h(`<section class="page explore">
    <div class="page-head"><div><h1>Esplora</h1><p class="muted">Free mode: open any lesson or game in any order. Your progress and mistakes are tracked the same way as on the path.</p></div></div>
    <div class="tile-grid">${tiles.map(t => `<a class="tile c-${t.c}" href="${t.href}"><span class="tile-icon">${t.icon}</span><b>${esc(t.title)}</b><small>${esc(t.sub)}</small></a>`).join("")}</div>
  </section>`));
}
