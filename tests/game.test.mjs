import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === 'three'
    ? { url: new URL('../vendor/three.module.min.js', import.meta.url).href, shortCircuit: true }
    : nextResolve(specifier, context);
}});
const { Game, makeLevel, upgradeCost, WEAPONS } = await import('../src/game.js');
const noop = () => {};
function combat() {
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    state: 'playing', ended: false, ability: { cooldown: 0, duration: 0, totalCooldown: 16 },
    army: { x: 0, count: 25 }, tier: 0, dmgMult: 1, shake: 0,
    enemies: [], boss: null, bossDefeated: false, kills: 0, resolved: 0,
    earned: 0, save: { coins: 0 }, combo: 0, comboTime: 0, bestCombo: 0,
    elapsed: 12.6, peakArmy: 25, dying: [],
    sound: { shield: noop, hit: noop, crack: noop, pop: noop, combo: noop },
    ui: { banner: noop, bossBar: { classList: { add: noop } } },
    burst: noop, floatText: noop, updateHud: noop, pushDying: noop,
  });
  return game;
}
test('shockwave hits nearby enemies, preserves distant enemies, and cannot be spammed', () => {
  const g = combat();
  const near = { type: 'imp', hp: 5, x: 0, z: -5 };
  const far = { type: 'imp', hp: 5, x: 0, z: -20 };
  g.enemies = [near, far];
  assert.equal(g.activateAbility(), true);
  assert.deepEqual(g.enemies, [far]);
  assert.equal(g.kills, 1);
  assert.equal(g.save.coins, 1);
  assert.equal(g.ability.cooldown, 16);
  assert.equal(g.ability.duration, 4);
  assert.equal(g.activateAbility(), false);
  assert.equal(far.hp, 5);
});
test('shockwave is unavailable in menus, pause, and completed runs', () => {
  for (const state of ['menu', 'paused', 'win', 'lose']) {
    const g = combat(); g.state = state;
    assert.equal(g.activateAbility(), false);
    assert.equal(g.ability.cooldown, 0);
  }
  const g = combat(); g.ended = true;
  assert.equal(g.activateAbility(), false);
});
test('boss rewards are paid exactly once across repeated hits', () => {
  const g = combat();
  const boss = { isBoss: true, hp: 2, x: 0, z: -5, type: 'imp' };
  g.boss = boss;
  g.damageEnemy(boss, 3);
  g.damageEnemy(boss, 3);
  assert.equal(g.bossDefeated, true);
  assert.equal(g.boss, null);
  assert.equal(g.save.coins, 50);
  assert.equal(g.kills, 1);
  assert.equal(g.resolved, 1);
});
test('combos retain their record and completed games stop updating', () => {
  const g = combat();
  for (let i = 0; i < 12; i++) g.registerCombo();
  assert.equal(g.bestCombo, 12);
  g.combo = 0; g.registerCombo();
  assert.equal(g.bestCombo, 12);
  assert.deepEqual(g.runStats(), { kills: 0, bestCombo: 12, duration: 13, peakArmy: 25 });
  g.ended = true; g.time = 99;
  g.update(1);
  assert.equal(g.time, 99);
});
test('campaign offers increasing waves and rotates all three bosses', () => {
  const levels = [1, 2, 3, 4].map(makeLevel);
  assert.equal(new Set(levels.slice(0, 3).map(l => l.boss.name)).size, 3);
  assert.equal(levels[0].boss.name, levels[3].boss.name);
  for (const level of levels) {
    assert.equal(level.waves.length, 5);
    assert.ok(level.waves.every((w, i, a) => w.hp > 0 && (i === 0 || w.t > a[i - 1].t)));
    assert.ok(level.waves.at(-1).boss > 0);
  }
  assert.ok(upgradeCost('power', 1) > upgradeCost('power', 0));
});

test('invalid campaign inputs and damaged saves remain bounded', () => {
  for (const input of [Infinity, NaN, -8, 1e10, 'bad']) {
    const level = makeLevel(input);
    assert.ok(level.L >= 1 && level.L <= 99);
    assert.ok(Number.isFinite(level.waves.at(-1).boss));
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: () => JSON.stringify({ level: -1, best: -2, coins: -100, up: { power: 999, rate: 'bad', recruits: 1.5 } })
    }});
    const save = Game.prototype.loadSave();
    assert.equal(save.level, 1); assert.equal(save.best, 1); assert.equal(save.coins, 0);
    assert.deepEqual(save.up, { recruits: 1, power: 40, rate: 0 });
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('every campaign wave contains four times the previous fivefold horde count', () => {
  for (const L of [1, 3, 10]) {
    assert.deepEqual(makeLevel(L).waves.map(w => w.n), [18 + 6*L, 30 + 10*L, 45 + 14*L, 60 + 18*L, 50 + 16*L].map(n => n*20));
  }
});
test('reinforcements preserve enemies when the active pool is full and resume when space opens', () => {
  const g = combat();
  g.reinforcements = [{ wave: { hp: 1, mix: { imp: 1 } }, remaining: 12 }];
  g.spawnClock = 0;
  g.enemies = Array.from({ length: 520 }, () => ({ type: 'imp' }));
  g.updateReinforcements(1);
  assert.equal(g.enemies.length, 520);
  assert.equal(g.reinforcements[0].remaining, 12);
  g.enemies.splice(0, 12);
  g.updateReinforcements(1); g.updateReinforcements(1);
  assert.equal(g.enemies.length, 520);
  assert.equal(g.reinforcements.length, 0);
  assert.ok(g.enemies.slice(-12).every(e => e.hp > 0 && Number.isFinite(e.z)));
});


test('all weapons expire after fourteen metres instead of hitting enemies at spawn', () => {
  const g = combat(); g.proj = [];
  for (const weapon of WEAPONS) {
    g.fire(0, 1.3, 0, 0, -1, weapon.dmg, weapon);
    const projectile = g.proj.at(-1);
    assert.equal(projectile.life * weapon.speed, 14);
  }
});

test('regular enemies gain twenty-five percent health while boss health stays stable', () => {
  const waves = makeLevel(1).waves;
  assert.deepEqual(waves.map(w => w.hp), [1.5, 3, 6, 10, 14].map(hp => hp * 1.25));
  assert.equal(waves.at(-1).boss, 5000);
});


test('repeated splash impacts cannot accumulate unbounded knockback', () => {
  const g = combat();
  const target = { hp: 10000, x: 0, z: 0, kb: 0, mass: 1 };
  const grid = new Map([[(64 << 10) | 512, [target]]]);
  for (let i = 0; i < 100; i++) g.splash({ x: 0, z: 0, splash: 1, dmg: 1 }, grid, 1.6);
  assert.ok(target.kb <= 0.4);
  assert.ok(target.hp < 10000);
});

test('combo feedback is limited to milestones with a two-second cooldown', () => {
  const g = combat(); let displays = 0;
  g.floatText = () => displays++;
  for (let i = 0; i < 100; i++) g.registerCombo();
  assert.equal(displays, 1);
  g.elapsed += 2;
  for (let i = 0; i < 25; i++) g.registerCombo();
  assert.equal(displays, 2);
});
