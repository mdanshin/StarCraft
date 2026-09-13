// Save files are user input. Validate references and values before replacing a match.
const saveError = () => { throw new Error('Файл партии повреждён или имеет неподдерживаемый формат.'); };
const check = value => { if (!value) saveError(); };
const integer = (value, min = 0, max = 10000000) => Number.isSafeInteger(value) && value >= min && value <= max;
const cells = value => Array.isArray(value) && value.length <= 9 && new Set(value).size === value.length && value.every(n => integer(n, 0, 8));
const factions = ['terran', 'zerg', 'protoss'];
export const SAVE_KEY = 'koprulu-session-v2';
export const MAX_SAVE_BYTES = 2 * 1024 * 1024;

export function encodeSave(state, mode, fog) {
  return JSON.stringify({ format: 'koprulu-save', version: 1, mode, fog: Boolean(fog), state }, null, 2);
}

export function decodeSave(text, cards) {
  check(typeof text === 'string' && text.length <= MAX_SAVE_BYTES);
  let parsed;
  try { parsed = JSON.parse(text); } catch { saveError(); }
  check(parsed && typeof parsed === 'object');
  const wrapped = parsed.format === 'koprulu-save';
  if (wrapped) check(parsed.version === 1 && ['ai', 'hotseat'].includes(parsed.mode) && typeof parsed.fog === 'boolean');
  const s = wrapped ? parsed.state : parsed;
  const byId = Object.fromEntries(cards.map(c => [c.id, c]));
  check(s && s.version === 1 && integer(s.round, 1) && integer(s.active, 0, 1) && integer(s.initiative, 0, 1));
  check([null, 0, 1, 'draw'].includes(s.winner));
  check(Array.isArray(s.remaining) && s.remaining.length === 2 && s.remaining.every(n => integer(n, 0, 3)));
  check(s.winner !== null || s.remaining[s.active] > 0);
  check(integer(s.nextId, 1, 999999999));
  check(Array.isArray(s.players) && s.players.length === 2);
  for (const p of s.players) {
    check(p && factions.includes(p.faction));
    for (const k of ['minerals', 'gas', 'workers', 'gasWorkers']) check(integer(p[k]));
    check(p.gasWorkers <= p.workers && integer(p.energy, 0, 8) && cells(p.creep));
    check(Array.isArray(p.upgrades) && p.upgrades.length <= 48 && new Set(p.upgrades).size === p.upgrades.length);
    check(p.upgrades.every(id => byId[id]?.type === 'upgrade' && byId[id].faction === p.faction));
  }
  check(Array.isArray(s.entities) && s.entities.length <= 2000);
  const refs = new Map(), ids = new Set();
  function register(id, prefix) {
    check(typeof id === 'string' && new RegExp('^' + prefix + '[1-9][0-9]{0,8}$').test(id) && !ids.has(id));
    check(Number(id.slice(1)) < s.nextId);
    ids.add(id);
  }
  for (const e of s.entities) {
    check(e && integer(e.owner, 0, 1));
    const c = byId[e.cardId];
    check(c && c.faction === s.players[e.owner].faction && ['unit', 'support', 'building'].includes(c.type));
    register(e.id, 'e'); refs.set(e.id, e);
    check(integer(e.loc, 0, 8) && integer(e.hp, 1, c.hp) && integer(e.shield, 0, c.shield));
    for (const key of ['complete', 'acted', 'burrowed', 'sieged']) check(typeof e[key] === 'boolean');
    check(integer(e.damagedRound, -2, s.round));
    check(integer(e.larva, 0, 19) && integer(e.mineralLeft, 0, 80) && integer(e.gasLeft, 0, 60));
    check(!e.sieged || e.cardId === 'terran-siege-tank');
    check(!e.burrowed || c.faction === 'zerg' && c.type === 'unit' && !c.flying);
    if (e.injectAt !== undefined) check(c.headquarters && c.faction === 'zerg' && integer(e.injectAt, s.round + 1));
    if (e.stimRound !== undefined) check(integer(e.stimRound, 1, s.round));
  }
  check(Array.isArray(s.queues) && s.queues.length <= 2000);
  const buildingQueues = new Set();
  const occupied = new Set();
  for (const q of s.queues) {
    check(q && integer(q.owner, 0, 1) && ['building', 'unit', 'worker', 'upgrade'].includes(q.kind));
    register(q.id, 'q');
    const c = q.kind === 'worker' ? { id: 'worker', time: 1, mineral: 2, gas: 0 } : byId[q.cardId];
    check(c && c.id === q.cardId && (q.kind === 'worker' || c.faction === s.players[q.owner].faction));
    check(integer(q.loc, 0, 8) && integer(q.remaining, 1, c.time));
    check(q.mineral === c.mineral && q.gas === c.gas && typeof q.workerBusy === 'boolean');
    if (q.kind === 'building') {
      const building = refs.get(q.entityId);
      check(c.type === 'building' && building && !building.complete && building.owner === q.owner && building.cardId === q.cardId && building.loc === q.loc);
      check(q.producerId === null && !buildingQueues.has(q.entityId));
      check(q.workerBusy === (s.players[q.owner].faction === 'terran'));
      buildingQueues.add(q.entityId);
    } else {
      const producer = refs.get(q.producerId);
      check(producer && producer.owner === q.owner && producer.complete && q.entityId === null && !q.workerBusy);
      if (q.kind === 'unit') check(['unit', 'support'].includes(c.type) && producer.cardId === c.producer);
      if (q.kind === 'upgrade') check(c.type === 'upgrade' && producer.cardId === c.requires.at(-1));
      if (q.kind === 'worker') check(byId[producer.cardId].headquarters);
      if (s.players[q.owner].faction !== 'zerg') {
        check(!occupied.has(producer.id)); occupied.add(producer.id);
      }
    }
  }
  check(s.entities.every(e => e.complete || buildingQueues.has(e.id)));
  check(Array.isArray(s.scans) && s.scans.length === 2 && s.scans.every(cells));
  check(Array.isArray(s.log) && s.log.length <= 100 && s.log.every(line => typeof line === 'string' && line.length <= 1000));
  const alive = [0, 1].map(p => s.entities.some(e => e.owner === p && byId[e.cardId].type === 'building'));
  check(s.winner === (alive[0] ? (alive[1] ? null : 0) : (alive[1] ? 1 : 'draw')));
  return { state: s, mode: wrapped ? parsed.mode : 'hotseat', fog: wrapped ? parsed.fog : true };
}
