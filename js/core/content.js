// Builds lookup tables from the content files. Pure; loading is done by the caller.

// Pull every gradable item out of a game, whatever its shape.
export function gameItems(game) {
  const out = [];
  const cid = (game.conceptIds || [])[0];
  (game.scenes || []).forEach(s => s.item && out.push(s.item));
  (game.nodes || []).forEach(n => {
    if (n.item) out.push(n.item);
    if (n.choices) out.push(choiceNodeItem(game, n));
  });
  (game.rounds || []).forEach(r => (r.item && out.push(r.item)));
  (game.items || []).forEach(i => out.push(i));
  // Reading / listening: questions share the game's passage.
  (game.questions || []).forEach(q => out.push({ conceptId: cid, ...q, passageOf: game.id }));
  (game.prompts || []).forEach(p => out.push({ conceptId: cid, ...p }));
  return out;
}

// A dialogue node with reply choices becomes a graded choice item (id = node id).
export function choiceNodeItem(game, n) {
  const okIdx = n.choices.map((c, i) => (c.ok ? i : -1)).filter(i => i >= 0);
  const optionWhy = {};
  const traps = [];
  n.choices.forEach((c, i) => {
    if (c.why) optionWhy[i] = c.why;
    if (!c.ok && c.errorType) traps.push({ match: c.text, errorType: c.errorType, why: c.why || "" });
  });
  return {
    id: n.id, conceptId: n.conceptId || (game.conceptIds || [])[0], type: "choice", interaction: true,
    instruction: n.instruction || "Choose the best reply.", prompt: n.prompt || n.line,
    options: n.choices.map(c => c.text), answer: okIdx.length === 1 ? okIdx[0] : okIdx,
    optionWhy, traps, errorType: n.errorType || "register", explanation: n.explanation || "", difficulty: n.difficulty || 2
  };
}

export function buildIndex({ units, games, errorTypes }) {
  const concepts = new Map(), items = new Map(), byConcept = new Map(), gamesById = new Map(), gamesByConcept = new Map();
  const unitList = [];
  const addItem = (it, concept, source) => {
    const item = { ...it, conceptId: it.conceptId || concept.id, skill: it.skill || concept.skill, source };
    items.set(item.id, item);
    if (!byConcept.has(item.conceptId)) byConcept.set(item.conceptId, []);
    byConcept.get(item.conceptId).push(item);
  };
  for (const u of units) {
    unitList.push({ id: u.unit, title: u.title, cefr: u.cefr, conceptIds: u.concepts.map(c => c.id) });
    for (const c of u.concepts) {
      concepts.set(c.id, { ...c, unit: u.unit });
      (c.exercises || []).forEach(e => addItem(e, c, "lesson"));
    }
  }
  for (const g of games) {
    gamesById.set(g.id, g);
    for (const it of gameItems(g)) {
      const c = concepts.get(it.conceptId);
      if (c) addItem(it, c, "game:" + g.id);
    }
    for (const cid of g.conceptIds || []) {
      if (!gamesByConcept.has(cid)) gamesByConcept.set(cid, []);
      gamesByConcept.get(cid).push(g.id);
    }
  }
  return {
    units: unitList, concepts, items, byConcept, games: gamesById, gamesByConcept, errorTypes: errorTypes || {},
    poolFor: cid => byConcept.get(cid) || [],
    allItems: () => [...items.values()]
  };
}

export async function loadContent(fetchJson) {
  const get = p => fetchJson("content/" + p);
  const index = await get("index.json");
  const [units, games, errorTypes, curriculum] = await Promise.all([
    Promise.all(index.units.map(get)),
    Promise.all(index.games.map(get)),
    get("error-types.json"),
    index.curriculum ? get(index.curriculum) : null
  ]);
  const extra = index.vocab ? await Promise.all(index.vocab.map(get)) : [];
  const built = buildIndex({ units, games, errorTypes });
  built.vocabSeed = extra.flat();
  built.curriculum = curriculum;
  return built;
}
