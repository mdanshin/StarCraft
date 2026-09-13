import { distance, RuleError } from './engine.js';

// A deterministic, introductory opponent. Only visible enemies affect its plan.
// Every proposed order is checked by the same engine used by the human player.
export function chooseBotAction(engine, state) {
  if (state.winner !== null) return null;
  const p = state.active, player = state.players[p], race = player.faction;
  const own = state.entities.filter(e => e.owner === p);
  const enemies = state.entities.filter(e => e.owner !== p && engine.visible(state, p, e));
  const units = own.filter(e => e.complete && engine.card(e).type === 'unit');
  const bases = own.filter(e => e.complete && engine.card(e).headquarters);
  const queues = state.queues.filter(q => q.owner === p);
  const has = id => own.some(e => e.cardId === id);
  const pending = id => queues.some(q => q.cardId === id);
  const count = id => own.filter(e => e.cardId === id).length + queues.filter(q => q.cardId === id).length;
  const home = bases[0]?.loc ?? own[0]?.loc ?? (p === 0 ? 0 : 8);
  const enemyHome = p === 0 ? 8 : 0;
  const supply = engine.cap(state, p) - engine.used(state, p);
  const queuedArmy = queues.filter(q => engine.byId[q.cardId]?.type === 'unit').length;
  const armySize = units.length + queuedArmy;
  const choices = [];
  const add = (score, action) => choices.push({ score, action });
  const build = (id, score, loc = home) => add(score, { type: 'build', cardId: id, loc });
  const tactic = (id, score, args = {}) => add(score, { type: 'tactic', cardId: id, ...args });

  for (const unit of units) {
    const c = engine.card(unit);
    const targets = enemies.filter(e => !engine.card(e).flying || c.targets === 'both');
    for (const target of targets) {
      const tc = engine.card(target);
      const damage = c.attack + (player.upgrades.includes(race + '-weapons') ? 1 : 0)
        + (c.bonusTag && tc.tags.includes(c.bonusTag) ? c.bonus : 0) + (unit.sieged ? 2 : 0);
      const lethal = damage >= target.hp + target.shield + tc.armor;
      const defense = bases.some(b => distance(b.loc, target.loc) <= 1) && tc.type === 'unit';
      add(180 + damage + (lethal ? 35 : 0) + (defense ? 25 : 0),
        { type: 'attack', unitId: unit.id, targetId: target.id });
    }
    if (unit.burrowed) tactic('zerg-burrow', 120, { unitId: unit.id });
    if (race === 'terran' && unit.acted && unit.hp > 2 && state.remaining[p] >= 2
      && targets.some(t => distance(unit.loc, t.loc) <= c.range)) {
      tactic('terran-stim', 140, { unitId: unit.id });
    }
    if (unit.sieged && !targets.some(t => distance(unit.loc, t.loc) > 0 && distance(unit.loc, t.loc) <= 2)) {
      add(75, { type: 'siege', unitId: unit.id });
    }
    const visibleTarget = [...targets].sort((a, b) => distance(unit.loc, a.loc) - distance(unit.loc, b.loc))[0];
    // The opposing starting corner is public map knowledge. After scouting it,
    // search unseen sectors if all currently visible enemy buildings are gone.
    const unseen = Array.from({ length: 9 }, (_, i) => i).filter(i => !engine.visibleCells(state, p).includes(i));
    const goal = visibleTarget?.loc ?? (unseen.includes(enemyHome) ? enemyHome
      : unseen.sort((a, b) => distance(unit.loc, a) - distance(unit.loc, b))[0] ?? enemyHome);
    for (let loc = 0; loc < 9; loc++) {
      const progress = distance(unit.loc, goal) - distance(loc, goal);
      if (progress > 0) add(65 + progress * 2, { type: 'move', unitId: unit.id, loc });
    }
  }

  if (race === 'protoss') {
    for (let loc = 0; loc < 9; loc++) {
      const enemyHits = enemies.filter(e => e.loc === loc && ['unit', 'support'].includes(engine.card(e).type));
      const friendHits = own.filter(e => e.loc === loc && ['unit', 'support'].includes(engine.card(e).type));
      const value = enemyHits.reduce((n, e) => n + Math.min(3, e.hp + e.shield), 0)
        - friendHits.reduce((n, e) => n + Math.min(3, e.hp + e.shield), 0);
      if (value >= 4) tactic('protoss-storm', 195 + value, { loc });
    }
    for (const q of queues.filter(q => q.kind === 'unit' && q.remaining >= 1)) {
      tactic('protoss-chrono', armySize < 3 ? 90 : 76, { queueId: q.id });
    }
  }
  if (race === 'terran') {
    for (const e of own.filter(e => e.complete && engine.card(e).hp - e.hp >= 4)) {
      tactic('terran-repair', engine.card(e).headquarters && e.hp < 15 ? 160 : 85, { unitId: e.id });
    }
    if (player.minerals < 18) add(85, { type: 'macro' });
  }
  if (race === 'zerg' && armySize < 5) {
    for (const b of bases.filter(b => b.larva <= 1 && !b.injectAt)) tactic('zerg-inject', 95, { unitId: b.id });
  }

  const initialProduction = { terran: 'terran-barracks', zerg: 'zerg-pool', protoss: 'protoss-gateway' }[race];
  if (!has(initialProduction)) build(initialProduction, 130);
  const needsPower = race === 'protoss' && own.some(e => !engine.powered(state, e));
  if (!pending(race + '-supply') && ((supply <= 3 && engine.cap(state, p) < 80) || needsPower || (race === 'protoss' && !has('protoss-supply')))) {
    const a = { type: race === 'zerg' ? 'train' : 'build', cardId: race + '-supply', loc: home };
    add(needsPower ? 145 : 120, a);
  }

  const expanding = own.some(e => engine.card(e).headquarters && !e.complete);
  const needExpand = bases.length > 0 && bases.reduce((n, b) => n + b.mineralLeft, 0) < 25 && !expanding;
  if (needExpand) {
    const locations = engine.visibleCells(state, p).filter(loc => !bases.some(b => b.loc === loc));
    for (const loc of locations) build(race + '-hq', 115 - distance(home, loc), loc);
  }
  const savingForBase = needExpand && player.minerals < engine.byId[race + '-hq'].mineral;
  const gasTarget = has(race + '-gas') ? Math.min(3, Math.max(0, player.workers - 4)) : 0;
  if (player.gasWorkers !== gasTarget) add(105, { type: 'allocate', count: gasTarget });
  const workerTarget = Math.min(11, 7 + gasTarget);
  if (player.workers + queues.filter(q => q.kind === 'worker').length < workerTarget && (!savingForBase || player.workers < 4)) {
    add(player.workers < 4 ? 150 : 79, { type: 'worker' });
  }

  if (!savingForBase) {
    if (has(initialProduction) && armySize > 0 && !has(race + '-gas')) build(race + '-gas', 83);
    const technology = {
      terran: ['terran-techlab', 'terran-factory', 'terran-starport'],
      zerg: ['zerg-den', 'zerg-spire', 'zerg-cavern'],
      protoss: ['protoss-core', 'protoss-robotics', 'protoss-stargate']
    }[race];
    if (armySize >= 2) for (const id of technology) if (!has(id)) build(id, 74);
    const roster = engine.cards.filter(c => c.faction === race && c.type === 'unit');
    const airThreat = enemies.some(e => engine.card(e).flying);
    for (const c of roster) {
      const variety = count(c.id) === 0 ? 5 : 0;
      const antiAir = airThreat && c.targets === 'both' ? 14 : 0;
      const quality = Math.min(5, c.gas);
      add((armySize < 5 ? 80 : 45) + variety + antiAir + quality - count(c.id), { type: 'train', cardId: c.id });
    }
    if (armySize >= 3) {
      add(75, { type: 'upgrade', cardId: race + '-weapons' });
      add(73, { type: 'upgrade', cardId: race + '-armor' });
    }
  }
  add(-1, { type: 'pass' });
  choices.sort((a, b) => b.score - a.score);
  for (const { action } of choices) {
    try { engine.act(state, action); return action; }
    catch (error) { if (!(error instanceof RuleError)) throw error; }
  }
  return { type: 'pass' };
}
