// Progress summary, recommendations, achievements and weekly challenges. Pure: give it the data, get a report.
import { dayKey, DAY } from "./srs.js";
import { patterns } from "./errors.js";

export const SKILLS = ["grammar", "vocabulary", "reading", "listening", "writing", "speaking", "interaction"];

export function weekStart(now) {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;      // Monday = 0
  return d.getTime() - dow * DAY;
}

export function streakDays(attempts, now) {
  const days = new Set(attempts.map(a => dayKey(a.t)));
  let n = 0, t = now;
  if (!days.has(dayKey(t))) t -= DAY;   // today not done yet: streak still alive from yesterday
  while (days.has(dayKey(t))) { n++; t -= DAY; }
  return n;
}

export function skillReport(skills, attempts) {
  const by = new Map(skills.map(s => [s.skill, s]));
  return SKILLS.map(k => {
    const s = by.get(k);
    const recent = attempts.filter(a => a.skill === k).slice(-40);
    const acc = recent.length ? recent.filter(a => a.correct).length / recent.length : null;
    return { skill: k, attempts: s ? s.attempts : 0, score: s ? s.ewma : null, recentAccuracy: acc, enough: !!s && s.attempts >= 8 };
  });
}

const ACHIEVEMENTS = [
  { id: "first-10", title: "Primi passi", desc: "Rispondi a 10 domande", test: s => s.answers >= 10 },
  { id: "answers-250", title: "Costanza", desc: "Rispondi a 250 domande", test: s => s.answers >= 250 },
  { id: "answers-1000", title: "Mille risposte", desc: "Rispondi a 1.000 domande", test: s => s.answers >= 1000 },
  { id: "first-mastered", title: "Errore corretto", desc: "Correggi per sempre il tuo primo errore (3 giorni diversi)", test: s => s.mastered >= 1 },
  { id: "mastered-25", title: "Cacciatore di errori", desc: "Correggi per sempre 25 errori", test: s => s.mastered >= 25 },
  { id: "comeback", title: "Ritorno", desc: "Ricorreggi un errore che avevi dimenticato", test: s => s.remastered >= 1 },
  { id: "streak-7", title: "Una settimana", desc: "Allenati 7 giorni di fila", test: s => s.bestStreak >= 7 },
  { id: "streak-30", title: "Abitudine", desc: "Allenati 30 giorni di fila", test: s => s.bestStreak >= 30 },
  { id: "detective", title: "Commissario", desc: "Risolvi un caso giallo", test: s => s.detectiveSolved >= 1 },
  { id: "game-types", title: "Eclettico", desc: "Gioca a 5 tipi di gioco diversi", test: s => s.gameTypes >= 5 },
  { id: "unit-done", title: "Unità completata", desc: "Completa tutti i concetti di un’unità", test: s => s.unitsDone >= 1 },
  { id: "c1-50", title: "Verso il C1", desc: "50 risposte giuste di livello C1", test: s => s.c1Right >= 50 },
  { id: "writer", title: "Penna fine", desc: "Supera 5 prove di scrittura", test: s => s.writingPassed >= 5 },
  { id: "importer", title: "Il mio lessico", desc: "Importa 50 frasi da Google Traduttore", test: s => s.imports >= 50 },
  { id: "deck-100", title: "Cento parole", desc: "Arriva a 100 carte nel tuo mazzo", test: s => s.deck >= 100 }
];

const CHALLENGES = [
  { id: "ans", title: "Rispondi a 150 domande", goal: 150, measure: w => w.answers },
  { id: "mst", title: "Correggi per sempre 5 errori", goal: 5, measure: w => w.mastered },
  { id: "gms", title: "Gioca a 3 tipi di gioco diversi", goal: 3, measure: w => w.gameTypes },
  { id: "c1", title: "25 risposte giuste di livello C1", goal: 25, measure: w => w.c1Right },
  { id: "wri", title: "Supera 2 prove di scrittura", goal: 2, measure: w => w.writingPassed },
  { id: "cpt", title: "Allenati su 5 concetti diversi", goal: 5, measure: w => w.concepts },
  { id: "rtst", title: "Fai 20 ripassi della Banca degli errori", goal: 20, measure: w => w.retests },
  { id: "days", title: "Allenati 5 giorni questa settimana", goal: 5, measure: w => w.days }
];

function stats(d, from = 0) {
  const { attempts, errors, games, content } = d;
  const A = attempts.filter(a => a.t >= from);
  const cefr = id => content.concepts.get(id)?.cefr;
  const gameIds = new Set(A.filter(a => String(a.source).startsWith("game:")).map(a => a.source.slice(5)));
  return {
    answers: A.length,
    mastered: errors.filter(e => e.masteredAt && e.masteredAt >= from).length,
    c1Right: A.filter(a => a.correct && cefr(a.conceptId) === "C1").length,
    writingPassed: A.filter(a => a.correct && content.items.get(a.itemId)?.type === "free").length,
    gameTypes: new Set([...gameIds].map(g => content.games.get(g)?.type).filter(Boolean)).size,
    concepts: new Set(A.map(a => a.conceptId)).size,
    retests: A.filter(a => a.mode === "retest").length,
    days: new Set(A.map(a => dayKey(a.t))).size,
    detectiveSolved: Object.values(games).filter(g => g.id.startsWith("G-DET") && g.best >= 0.6).length
  };
}

function bestStreak(attempts) {
  const days = [...new Set(attempts.map(a => dayKey(a.t)))].sort();
  let best = 0, run = 0, prev = null;
  for (const k of days) {
    const t = new Date(k + "T12:00:00").getTime();
    run = prev !== null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = t;
  }
  return best;
}

export function buildReport(d, now) {
  const { attempts, errors, progress, skills, vocab, imports, content } = d;
  const all = stats(d);
  const P = new Map(progress.map(p => [p.conceptId, p]));
  const units = content.curriculum ? content.curriculum.strands : [];
  const unitsDone = units.filter(u => u.concepts.every(c => ["mastered", "known", "skipped"].includes(P.get(c.id)?.status))).length;
  const S = { ...all, unitsDone, bestStreak: bestStreak(attempts), remastered: errors.filter(e => e.status === "mastered" && e.relapses > 0).length,
    imports: imports.length, deck: vocab.length };
  const achievements = ACHIEVEMENTS.map(a => ({ id: a.id, title: a.title, desc: a.desc, done: a.test(S) }));

  const ws = weekStart(now);
  const week = stats(d, ws);
  const weekNo = Math.floor(ws / (7 * DAY));
  const picks = [0, 1, 2].map(i => CHALLENGES[(weekNo * 3 + i * 5) % CHALLENGES.length]).filter((c, i, a) => a.indexOf(c) === i);
  const challenges = picks.map(c => ({ id: c.id, title: c.title, goal: c.goal, value: Math.min(c.goal, c.measure(week)), done: c.measure(week) >= c.goal }));

  const sk = skillReport(skills, attempts);
  const rated = sk.filter(s => s.enough).sort((a, b) => b.score - a.score);
  const pat = patterns(errors, now);

  // Recommendations, most useful first.
  const recs = [];
  const dueErr = errors.filter(e => (e.nextReview || 0) <= now).length;
  if (dueErr) recs.push({ text: `Retest ${dueErr} due mistake${dueErr > 1 ? "s" : ""} from your Error Bank`, href: "#/errors/quiz?due=1", kind: "errors" });
  const checkups = progress.filter(p => ["skipped", "known", "mastered"].includes(p.status) && p.card && p.card.due <= now);
  if (checkups.length) recs.push({ text: `Check-up due: ${content.concepts.get(checkups[0].conceptId)?.title || checkups[0].conceptId}${checkups.length > 1 ? ` (+${checkups.length - 1} more)` : ""}`, href: `#/learn/${checkups[0].conceptId}/practice`, kind: "checkup" });
  const dueVocab = vocab.filter(v => v.card && v.card.due <= now).length;
  if (dueVocab) recs.push({ text: `Review ${dueVocab} vocabulary card${dueVocab > 1 ? "s" : ""}`, href: "#/vocab/review", kind: "vocab" });
  if (pat.byConcept[0] && pat.byConcept[0].open >= 2) recs.push({ text: `Revisit the lesson on your weakest topic: ${content.concepts.get(pat.byConcept[0].key)?.title || pat.byConcept[0].key}`, href: `#/learn/${pat.byConcept[0].key}`, kind: "weak" });
  const weakest = rated[rated.length - 1];
  if (weakest && rated.length > 1) {
    const g = [...content.games.values()].find(g => (g.conceptIds || []).some(c => content.concepts.get(c)?.skill === weakest.skill));
    recs.push({ text: `Work on ${weakest.skill}, your weakest skill${g ? `: try "${g.title}"` : ""}`, href: g ? `#/play/${g.id}` : "#/learn", kind: "skill" });
  }
  const order = units.flatMap(u => u.concepts.map(c => c.id)).filter(id => content.concepts.has(id));
  const nextC = order.find(id => !P.get(id) || P.get(id).status === "new") || order.find(id => P.get(id)?.status === "learning");
  if (nextC) recs.push({ text: `Continue the curriculum: ${content.concepts.get(nextC).title}`, href: `#/learn/${nextC}`, kind: "next" });
  const untried = SKILLS.filter(k => !sk.find(s => s.skill === k).attempts);
  if (untried.length && attempts.length > 30) recs.push({ text: `You haven't practised ${untried.join(", ")} yet`, href: "#/play", kind: "variety" });

  return {
    totals: S, streak: streakDays(attempts, now), skills: sk,
    strengths: rated.slice(0, 2).map(s => s.skill), weaknesses: rated.length > 2 ? rated.slice(-2).reverse().map(s => s.skill) : [],
    recurring: pat.byType.slice(0, 3), achievements, challenges, recommendations: recs,
    concepts: { total: content.concepts.size, started: progress.filter(p => p.seen).length, mastered: progress.filter(p => ["mastered", "known", "skipped"].includes(p.status)).length }
  };
}
