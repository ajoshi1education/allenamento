// Coach: answers "I'm struggling with X or Y, where should I practise?" without AI.
// Matches the question against concept titles, rules and a dictionary of grammar terms
// (English and Italian), then gathers lessons, games, conversations and your own mistakes for each match.
import { stripAccents } from "./evaluate.js";

// keyword (lowercase, no accents) → concept ids or id prefixes it points to
export const TOPICS = {
  "subjunctive": ["B2-SUBJ", "C1-SUBJ"], "congiuntivo": ["B2-SUBJ", "C1-SUBJ"], "subjuntive": ["B2-SUBJ"], "subj": ["B2-SUBJ"],
  "che + subjunctive": ["B2-SUBJ-01"], "penso che": ["B2-SUBJ-01"], "benche": ["B2-SUBJ-04"], "affinche": ["B2-SUBJ-04"], "conjunctions": ["B2-SUBJ-04", "B2-CONN-01"],
  "imperfect subjunctive": ["B2-SUBJ-03"], "congiuntivo imperfetto": ["B2-SUBJ-03"], "come se": ["B2-SUBJ-03"], "chiunque": ["C1-SUBJ-06"], "qualunque": ["C1-SUBJ-06"],
  "conditional": ["B2-COND", "B2-HYP", "C1-HYP"], "condizionale": ["B2-COND"], "would": ["B2-COND-01", "B2-SEQ-01"], "would have": ["B2-COND-02", "B2-HYP-02"], "should have": ["B2-COND-02"],
  "if": ["B2-HYP", "C1-HYP"], "if clause": ["B2-HYP", "C1-HYP"], "if clauses": ["B2-HYP", "C1-HYP"], "hypothetical": ["B2-HYP", "C1-HYP"], "ipotetico": ["B2-HYP", "C1-HYP"], "periodo ipotetico": ["B2-HYP", "C1-HYP"], "qualora": ["C1-HYP-04"],
  "past": ["B2-PAST"], "past tense": ["B2-PAST"], "past tenses": ["B2-PAST"], "passato prossimo": ["B2-PAST-01"], "imperfect": ["B2-PAST-01"], "imperfetto": ["B2-PAST-01"], "pluperfect": ["B2-PAST-02"], "trapassato": ["B2-PAST-02", "C1-PAST-04"],
  "passato remoto": ["C1-PAST-03"], "remote past": ["C1-PAST-03"], "literary": ["C1-PAST-03", "C1-READ-03"], "future": ["B2-FUT-01"], "futuro": ["B2-FUT-01"], "future perfect": ["B2-FUT-01"],
  "tenses": ["B2-PAST", "B2-FUT-01", "B2-SEQ-01", "C1-SEQ-02"], "sequence of tenses": ["B2-SEQ-01", "C1-SEQ-02"], "concordanza": ["B2-SEQ-01", "C1-SEQ-02"],
  "reported speech": ["C1-SEQ-03"], "indirect speech": ["C1-SEQ-03"], "discorso indiretto": ["C1-SEQ-03"],
  "pronouns": ["B2-PRON", "C1-PRON"], "pronoun": ["B2-PRON", "C1-PRON"], "pronomi": ["B2-PRON", "C1-PRON"], "combined pronouns": ["B2-PRON-01"], "double pronouns": ["B2-PRON-01"], "glielo": ["B2-PRON-01"],
  "ci": ["B2-PRON-02"], "ne": ["B2-PRON-02"], "ci and ne": ["B2-PRON-02"], "pronominal verbs": ["C1-PRON-03"], "andarsene": ["C1-PRON-03"], "farcela": ["C1-PRON-03"], "pronoun position": ["B2-PRON-04"], "imperative": ["B2-PRON-04"],
  "relative": ["B2-REL-01", "C1-SUBJ-05"], "relative pronouns": ["B2-REL-01"], "cui": ["B2-REL-01"], "il quale": ["B2-REL-01"],
  "prepositions": ["B2-PREP", "C1-PREP"], "preposition": ["B2-PREP", "C1-PREP"], "preposizioni": ["B2-PREP", "C1-PREP"], "a or di": ["B2-PREP-01"], "da": ["B2-PREP-02"],
  "passive": ["B2-PASS-01", "C1-PASS-02", "B2-SI-01"], "passivo": ["B2-PASS-01", "C1-PASS-02"], "si": ["B2-SI-01"], "impersonal": ["B2-SI-01"],
  "gerund": ["B2-INF-01"], "gerundio": ["B2-INF-01"], "participle": ["C1-PART-01"], "participio": ["C1-PART-01"], "infinitive": ["C1-INF-02"], "causative": ["B2-INF-03"], "fare + infinitive": ["B2-INF-03"],
  "connectors": ["B2-CONN-01", "C1-CONN-02"], "linking words": ["B2-CONN-01", "C1-CONN-02"], "connettivi": ["B2-CONN-01", "C1-CONN-02"], "sebbene": ["C1-CONN-02", "B2-SUBJ-04"], "nonostante": ["C1-CONN-02"],
  "word order": ["C1-SYN-01"], "cleft": ["C1-SYN-01"], "dislocation": ["C1-SYN-01"], "formal style": ["C1-SYN-02", "C1-REG-02"], "nominalisation": ["C1-SYN-02"],
  "vocabulary": ["B2-VOC", "C1-VOC"], "vocab": ["B2-VOC", "C1-VOC"], "words": ["B2-VOC", "C1-VOC"], "false friends": ["B2-VOC-01"], "collocations": ["B2-VOC-02", "C1-VOC-03"],
  "idioms": ["B2-IDIOM-01", "C1-IDIOM-02"], "expressions": ["B2-IDIOM-01", "C1-IDIOM-02"], "proverbs": ["C1-IDIOM-02"], "modi di dire": ["B2-IDIOM-01", "C1-IDIOM-02"],
  "suffixes": ["B2-VOC-04"], "word formation": ["B2-VOC-04"], "phrasal verbs": ["B2-VOC-06"], "academic": ["C1-VOC-05"], "arguments": ["C1-VOC-05", "C1-WRIT-02"],
  "formal": ["B2-REG-01", "C1-REG-02"], "lei": ["B2-REG-01"], "register": ["B2-REG-01", "C1-REG-02"], "emails": ["B2-REG-01", "B2-WRIT-01"], "email": ["B2-REG-01", "B2-WRIT-01"],
  "conversation": ["B2-INT-01", "C1-INT-02", "B2-SPEAK-01"], "discourse markers": ["B2-INT-01"], "fillers": ["B2-INT-01"], "agreeing": ["C1-INT-02"], "disagreeing": ["C1-INT-02"], "negotiating": ["C1-INT-02"], "debate": ["C1-SPEAK-02", "C1-INT-02"],
  "speaking": ["B2-SPEAK-01", "C1-SPEAK-02"], "pronunciation": ["B2-SPEAK-01"], "listening": ["B2-LIST-01", "C1-LIST-02"], "reading": ["B2-READ-01", "C1-READ-02", "C1-READ-03"],
  "writing": ["B2-WRIT-01", "C1-WRIT-02", "C1-WRIT-03"], "essay": ["C1-WRIT-02"], "summary": ["C1-WRIT-03"], "comprehension": ["B2-READ-01", "B2-LIST-01"]
};

const norm = s => stripAccents(String(s).toLowerCase()).replace(/[^a-z0-9+' ]+/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set("i im i'm am is are the a an and or with of on in to my me it feel think really struggling struggle hard difficult find help can you point game games which where what practise practice please some more about any for at be have having still dont don't understand get confused confusing".split(" "));

export function parseIntent(q) {
  const n = norm(q);
  if (/\b(what|where).*(next|should i)|\bnext\b|consigli|cosa (devo|faccio)/.test(n)) return "next";
  if (/\b(my )?(weak|weakest|mistakes|errors|worst|struggling most)\b|\bdove sbaglio\b/.test(n) && !Object.keys(TOPICS).some(k => new RegExp(`\\b${k}\\b`).test(n))) return "weak";
  if (/\b(conversation|convo|talk|speak|dialogue)s?\b/.test(n) && /\b(about|on)\b/.test(n)) return "convo";
  return "topic";
}

// Score every concept against the question.
export function findConcepts(q, content, max = 3) {
  const n = " " + norm(q) + " ";
  const scores = new Map();
  const add = (id, s) => scores.set(id, (scores.get(id) || 0) + s);
  const ids = [...content.concepts.keys()].filter(id => /^(B2|C1)-/.test(id));
  // dictionary phrases (longest first so "imperfect subjunctive" beats "subjunctive")
  const keys = Object.keys(TOPICS).sort((a, b) => b.length - a.length);
  let rest = n;
  for (const k of keys) {
    const re = new RegExp(`(^|\\s)${k.replace(/[+]/g, "\\+")}(\\s|$)`);
    if (!re.test(rest)) continue;
    rest = rest.replace(re, " ");
    for (const pref of TOPICS[k]) for (const id of ids) if (id === pref || id.startsWith(pref + "-")) add(id, k.includes(" ") ? 6 : 4);
  }
  // free words against titles and rules
  const words = norm(rest).split(" ").filter(w => w.length > 2 && !STOP.has(w));
  if (words.length) for (const id of ids) {
    const c = content.concepts.get(id);
    const hay = norm(`${c.title} ${c.rule || ""}`);
    for (const w of words) if (new RegExp(`\\b${w}`).test(hay)) add(id, 1.5);
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).filter(([, s]) => s >= 1.5).slice(0, max).map(([id, score]) => ({ id, score }));
}

// Everything that helps with one concept.
export function resourcesFor(conceptId, { content, errors = [], progress = [], path = null }) {
  const c = content.concepts.get(conceptId);
  const games = (content.gamesByConcept.get(conceptId) || []).map(g => content.games.get(g)).filter(Boolean);
  const convos = (content.convos || []).filter(cv => (cv.conceptIds || []).includes(conceptId) || cv.turns.some(t => (t.expect?.rubric || []).some(r => r.conceptId === conceptId)));
  const open = errors.filter(e => e.conceptId === conceptId && e.status !== "mastered");
  const p = progress.find(x => x.conceptId === conceptId);
  const node = path ? path.nodes.find(nd => nd.conceptId === conceptId && nd.kind === "practice") : null;
  return { concept: c, games, convos, openErrors: open.length, accuracy: p && p.seen ? p.correct / p.seen : null, seen: p ? p.seen : 0, pathNode: node };
}

export function weakest(errors, n = 3) {
  const m = new Map();
  for (const e of errors) if (e.status !== "mastered") m.set(e.conceptId, (m.get(e.conceptId) || 0) + e.timesWrong + 1);
  return [...m.entries()].filter(([id]) => /^(B2|C1)-/.test(id)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}

export function findConvos(q, content, max = 4) {
  const words = norm(q).split(" ").filter(w => w.length > 3 && !STOP.has(w) && !["conversation", "convo", "talk", "speak", "about"].includes(w));
  return (content.convos || []).map(cv => {
    const hay = norm(`${cv.title} ${cv.subtitle} ${cv.setting} ${cv.theme || ""}`);
    return { cv, s: words.filter(w => hay.includes(w)).length };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, max).map(x => x.cv);
}
