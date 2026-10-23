// Offline support: precache the app and content; network-first for content so updates arrive.
const VERSION = "202610231737";
const PRECACHE = ["./","content/convos/cv-01-weekend.json","content/convos/cv-02-cercare-casa.json","content/convos/cv-03-dal-medico.json","content/convos/cv-04-viaggio.json","content/convos/cv-05-film.json","content/convos/cv-06-reclamo.json","content/convos/cv-07-colloquio.json","content/convos/cv-08-avresti-fatto.json","content/convos/cv-09-notizie.json","content/convos/cv-10-dibattito.json","content/convos/cv-11-ristorante.json","content/convos/cv-12-stazione.json","content/convos/cv-13-mercato.json","content/convos/cv-14-vicino.json","content/convos/cv-15-invito.json","content/convos/cv-16-abitudini.json","content/convos/cv-17-infanzia.json","content/convos/cv-18-riunione.json","content/convos/cv-19-in-banca.json","content/convos/cv-20-consiglio-collega.json","content/convos/cv-21-trattare-affitto.json","content/convos/cv-22-presentare-progetto.json","content/convos/cv-23-esame-orale.json","content/convos/cv-24-volontariato.json","content/convos/cv-25-libro.json","content/convos/cv-26-cucina.json","content/convos/cv-27-social.json","content/convos/cv-28-ambiente.json","content/convos/cv-29-famiglia.json","content/convos/cv-30-museo.json","content/convos/cv-31-voci.json","content/convos/cv-32-cliente-preoccupato.json","content/convos/cv-33-analisi-trimestrale.json","content/convos/cv-34-banca-d-affari.json","content/convos/cv-35-aperitivo-networking.json","content/convos/cv-36-collega-smart-working.json","content/convos/cv-37-spiegare-investimento.json","content/convos/cv-38-notizie-borsa.json","content/convos/cv-39-partita.json","content/convos/cv-40-cricket.json","content/convos/cv-41-enoteca.json","content/convos/cv-42-sicilia.json","content/convos/cv-43-cinema.json","content/convos/cv-44-cantautori.json","content/convos/cv-45-firenze.json","content/convos/cv-46-unita.json","content/curriculum.json","content/error-types.json","content/games/bld-u08.json","content/games/dbt-01-smartworking.json","content/games/dbt-02-turismo.json","content/games/dbt-03-riassunto.json","content/games/det-01-quadro.json","content/games/det-02-testamento.json","content/games/det-03-alibi.json","content/games/det-04-biblioteca.json","content/games/dict-01.json","content/games/dict-02.json","content/games/dict-03.json","content/games/dlg-01-pettegolezzi.json","content/games/dlg-02-trasloco.json","content/games/dlg-03-colloquio.json","content/games/dlg-04-reclamo.json","content/games/dlg-05-cena.json","content/games/duel-u06.json","content/games/duel-v01.json","content/games/exam-b2.json","content/games/exam-c1.json","content/games/gnt-u01.json","content/games/gnt-u02.json","content/games/gnt-u03.json","content/games/gnt-u04.json","content/games/gnt-u05.json","content/games/gnt-u07.json","content/games/gnt-u09.json","content/games/gnt-v01.json","content/games/lst-01-dialogo.json","content/games/lst-02-podcast.json","content/games/lst-03-pizza.json","content/games/lst-04-neorealismo.json","content/games/lst-05-borsa.json","content/games/lst-06-roma.json","content/games/rdg-01-leggenda.json","content/games/rdg-02-notizia.json","content/games/rdg-03-opinione.json","content/games/rdg-04-medici.json","content/games/rdg-05-dante.json","content/games/rdg-06-miracolo.json","content/games/rdg-07-calcio.json","content/games/rdg-08-vino.json","content/index.json","content/path.json","content/units/r01-registro.json","content/units/s01-comprensione-scrittura.json","content/units/s02-parlato.json","content/units/u01-congiuntivo.json","content/units/u02-concordanza.json","content/units/u03-ipotetico.json","content/units/u04-passato-futuro.json","content/units/u05-pronomi.json","content/units/u06-preposizioni.json","content/units/u07-passivo-si.json","content/units/u08-forme-implicite.json","content/units/u09-connettivi-sintassi.json","content/units/v01-lessico.json","content/verbs.json","content/vocab/core.json","content/vocab/interessi.json","css/app.css","icons/apple-touch-icon.png","icons/favicon-32.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/icon.svg","icons/qr.svg","index.html","js/ai.js","js/app.js","js/coachpanel.js","js/core/adaptive.js","js/core/clock.js","js/core/coach.js","js/core/content.js","js/core/diagnostic.js","js/core/errors.js","js/core/evaluate.js","js/core/importer.js","js/core/path.js","js/core/progress.js","js/core/speechcheck.js","js/core/srs.js","js/core/transcript.js","js/core/verbs.js","js/db.js","js/feedback.js","js/games/debate.js","js/games/detective.js","js/games/dialogue.js","js/games/dictation.js","js/games/exam.js","js/games/gauntlet.js","js/games/reading.js","js/install.js","js/mic.js","js/session.js","js/speech.js","js/store.js","js/sync.js","js/ui.js","js/views/convo.js","js/views/coverage.js","js/views/diagnostic.js","js/views/errors.js","js/views/explore.js","js/views/learn.js","js/views/path.js","js/views/play.js","js/views/progress.js","js/views/review.js","js/views/settings.js","js/views/translate.js","js/views/verbs.js","js/views/vocab.js","manifest.webmanifest"];
const CACHE = "allenamento-" + VERSION;

self.addEventListener("install", e => {
  // Fetch each file fresh (bypassing the browser cache and, via ?v=, the CDN cache) so a new
  // version never stores an old copy of a file.
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRECACHE.map(async u => {
    const r = await fetch(u + (u.includes("?") ? "&" : "?") + "v=" + VERSION, { cache: "reload" });
    if (!r.ok) throw new Error("precache failed: " + u);
    await c.put(u, r);
  }))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  const networkFirst = url.pathname.includes("/content/");
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (networkFirst) {
      try { const r = await fetch(e.request); if (r.ok) cache.put(e.request, r.clone()); return r; }
      catch { return (await cache.match(e.request, { ignoreSearch: true })) || Response.error(); }
    }
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    const r = await fetch(e.request);
    if (r.ok) cache.put(e.request, r.clone());
    return r;
  })());
});
