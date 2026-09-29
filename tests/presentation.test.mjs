import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return s === 'three' ? { url: new URL('../vendor/three.module.min.js', import.meta.url).href, shortCircuit: true } : next(s, c); } });
const { Game } = await import('../src/game.js');
const { upgradeAvailable, emergence } = await import('../src/presentation.js');

test('late weapons require their battle stage and the elapsed delay', () => {
  const gold = { kind: 'gate', tier: 2 };
  assert.equal(upgradeAvailable(gold, 100, 1), false);
  assert.equal(upgradeAvailable(gold, 0, 5), false);
  assert.equal(upgradeAvailable(gold, 100, 5), true);
  assert.equal(upgradeAvailable({ kind: 'tile' }, 0, 0), true);
  assert.equal(emergence(0), 0); assert.equal(emergence(1), 1);
});
test('buried and distant upgrades cannot intercept shots or give a weapon early', () => {
  const gate = { kind: 'gate', tier: 3, alive: true, hp: 100, z: -19, reveal: 0 };
  const g = Object.create(Game.prototype);
  g.elapsed = 0; g.waveIdx = 0;
  const lane = { items: [gate] };
  assert.equal(g.frontBlocker(lane), null);
  g.damageBlocker(lane, gate, { dmg: 1000 });
  assert.equal(gate.hp, 100);
  g.elapsed = 100; g.waveIdx = 5; gate.z = -80;
  assert.equal(g.frontBlocker(lane), null);
});
