// Builds lookup tables from the content files. Pure; loading is done by the caller.

// Pull every gradable item out of a game, whatever its shape.
export function gameItems(game) {
  const out = [];
  (game.scenes || []).forEach(s => s.item && out.push(s.item));
  (game.nodes || []).forEach(n => (n.item && out.push(n.item)));
  (game.rounds || []).forEach(r => (r.item && out.push(r.item)));
  (game.items || []).forEach(i => out.push(i));
  (game.questions || []).forEach(i => out.push(i));
  return out;
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
