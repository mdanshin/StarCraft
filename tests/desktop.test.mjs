import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createEngine } from '../src/engine.js';
import { chooseBotAction } from '../src/bot.js';
import { encodeSave, decodeSave } from '../src/saves.js';
import { renderStandalone } from '../scripts/build-desktop.mjs';

const cards = JSON.parse(fs.readFileSync(new URL('../data/cards.json', import.meta.url)));
const engine = createEngine(cards);
const races = ['terran', 'zerg', 'protoss'];
function spawn(s, p, id, loc) {
  const c = engine.byId[id];
  const e = { ...structuredClone(s.entities[0]), id: 'e' + s.nextId++, owner: p, cardId: id, loc, hp: c.hp, shield: c.shield, larva: 0, mineralLeft: 0, gasLeft: 0 };
  s.entities.push(e); return e;
}

for (const race of races) {
  test(`computer ${race} develops an army and defeats a passive opponent`, () => {
    let s = engine.createGame([race, 'terran']), trained = false;
    for (let turn = 0; turn < 1800 && s.winner === null; turn++) {
      const before = JSON.stringify(s);
      const action = s.active === 0 ? chooseBotAction(engine, s) : { type: 'pass' };
      assert.equal(JSON.stringify(s), before, 'Planning must not mutate the match');
      if (s.active === 0 && action.type === 'train' && engine.byId[action.cardId].type === 'unit') trained = true;
      s = engine.act(s, action);
      if (turn % 40 === 0) assert.deepEqual(decodeSave(encodeSave(s, 'ai', true), cards).state, s);
    }
    assert.equal(trained, true);
    assert.equal(s.winner, 0, `No victory by cycle ${s.round}`);
  });
}

test('all nine race matchups produce legal orders and resumable saves', () => {
  for (const a of races) for (const b of races) {
    let s = engine.createGame([a, b]);
    for (let turn = 0; turn < 180 && s.winner === null; turn++) s = engine.act(s, chooseBotAction(engine, s));
    assert.ok(s.round > 5, `${a}/${b} stopped before developing`);
    assert.deepEqual(decodeSave(encodeSave(s, 'ai', false), cards).state, s);
  }
});

test('computer choices do not depend on hidden enemy economy or units', () => {
  const a = engine.createGame(['terran', 'zerg']);
  const b = structuredClone(a);
  b.players[1].minerals = 999; b.players[1].gas = 200; b.players[1].workers = 40;
  spawn(b, 1, 'zerg-mutalisk', 8);
  assert.deepEqual(chooseBotAction(engine, a), chooseBotAction(engine, b));
});

test('computer respects air targeting and takes a visible winning attack', () => {
  const s = engine.createGame(['protoss', 'zerg']);
  s.entities[1].hp = 1;
  const warrior = spawn(s, 0, 'protoss-zealot', 8);
  spawn(s, 1, 'zerg-mutalisk', 8);
  const action = chooseBotAction(engine, s);
  assert.equal(action.type, 'attack'); assert.equal(action.unitId, warrior.id);
  assert.equal(action.targetId, s.entities[1].id);
  assert.equal(engine.act(s, action).winner, 0);
});

test('legacy and current saves preserve a match, mode and fog', () => {
  const s = engine.act(engine.createGame(), { type: 'build', cardId: 'terran-barracks', loc: 0 });
  assert.deepEqual(decodeSave(encodeSave(s, 'ai', false), cards), { state: s, mode: 'ai', fog: false });
  assert.deepEqual(decodeSave(JSON.stringify(s), cards), { state: s, mode: 'hotseat', fog: true });
});

test('broken saves are rejected before they enter the engine', () => {
  for (const corrupt of [
    s => { s.players[0].minerals = -1; },
    s => { s.entities[0].cardId = 'not-a-card'; },
    s => { s.remaining = [0, 0]; },
    s => { s.entities[0].id = s.entities[1].id; },
    s => { s.nextId = 1; },
    s => { s.scans = [[42], []]; },
    s => { s.entities[0].complete = false; },
    s => { s.log = [{ html: '<script>' }]; }
  ]) {
    const s = engine.createGame(); corrupt(s);
    assert.throws(() => decodeSave(JSON.stringify(s), cards), /повреждён/);
  }
  const queued = engine.act(engine.createGame(), { type: 'worker' });
  queued.queues[0].producerId = 'e999';
  assert.throws(() => decodeSave(JSON.stringify(queued), cards), /повреждён/);
  assert.throws(() => decodeSave('{', cards), /повреждён/);
});

test('desktop entry is reproducible, has no external scripts and contains every card', () => {
  const html = renderStandalone();
  assert.equal(html, fs.readFileSync(new URL('../Play.html', import.meta.url), 'utf8'));
  assert.doesNotMatch(html, /<script[^>]+(?:src=|type="module")/);
  assert.doesNotMatch(html, /location\.replace/);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  new vm.Script(scripts[0][1]);
  for (const c of cards) assert.ok(html.includes('"id":"' + c.id + '"'));
  assert.doesNotMatch(html, /mdanshin\/StarCraft-/);
});
