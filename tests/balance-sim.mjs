// CPU-only deterministic balance harness. Runs actual Game.update and combat methods.
// Rendering, sound, persistence and cosmetic particles are stubbed; guardian rocks use real Three meshes.
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === 'three'
    ? { url: new URL('../vendor/three.module.min.js', import.meta.url).href, shortCircuit: true }
    : nextResolve(specifier, context);
}});
const THREE = await import('three');
const { Game } = await import('../src/game.js');
const noop = () => {};
const element = () => ({ style: {}, classList: { add: noop, remove: noop }, remove: noop, textContent: '' });
function seeded(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let n = Math.imul(seed ^ seed >>> 15, 1 | seed); n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n; return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}
export function simulate({ level = 1, bot = true, seed = 12345, duration = 300, upgrades = {}, dt = 1 / 60 } = {}) {
  const originalRandom = Math.random;
  Math.random = seeded(seed);
  const game = Object.create(Game.prototype);
  const distances = [];
  let damageTaken = 0, hordeDamage = 0, guardianDamage = 0, peakNear = 0, nearSeconds = 0, peakEnemies = 0, outcome = 'timeout';
  try {
    Object.assign(game, {
      state: 'playing', opts: { bot }, keys: {},
      save: { level, best: level, coins: 0, tutorialDone: true, up: { recruits: 0, power: 0, rate: 0, ...upgrades } },
      scene: new THREE.Scene(), guardian: new THREE.Mesh(undefined, new THREE.MeshStandardMaterial()),
      slingMesh: {}, slingGeos: Array.from({ length: 5 }, () => new THREE.BufferGeometry()), bossMeshes: [],
      rockGeo: new THREE.IcosahedronGeometry(0.5), rockMat: new THREE.MeshBasicMaterial(), ringMat: new THREE.MeshBasicMaterial(),
      sound: new Proxy({}, { get: () => noop }),
      ui: new Proxy({ banner: noop, tutorial: noop, labels: element(), floats: element() }, { get: (target, key) => target[key] ??= element() }),
      burst: noop, floatText: noop, updateHud: noop, writeSave: noop,
      buildItem(lane, it) {
        if (it.kind === 'gate' || it.kind === 'guardian') {
          it.mesh = it.kind === 'guardian' ? this.guardian : new THREE.Mesh(undefined, new THREE.MeshStandardMaterial());
          it.icon = new THREE.Object3D();
          it.label = element();
        } else { it.scale = 1; it.y = 0.85; }
      },
      win() { this.ended = true; outcome = 'win'; },
      lose() { this.ended = true; outcome = 'lose'; },
      loseUnits(n, x, z) { damageTaken += Math.min(n, this.army.count); return Game.prototype.loseUnits.call(this, n, x, z); },
      updateEnemies(dt) { const before = damageTaken; Game.prototype.updateEnemies.call(this, dt); hordeDamage += damageTaken - before; },
      updateRocks(dt) { const before = damageTaken; Game.prototype.updateRocks.call(this, dt); guardianDamage += damageTaken - before; },
      killEnemy(i) { const e = this.enemies[i]; distances.push(Math.hypot(e.x - this.army.x, e.z)); return Game.prototype.killEnemy.call(this, i); },
    });
    game.prepareLevel(level);
    const steps = Math.ceil(duration / dt);
    for (let step = 0; step < steps && !game.ended; step++) {
      game.update(dt);
      const near = game.enemies.filter(e => e.z > -8).length;
      peakNear = Math.max(peakNear, near);
      if (near) nearSeconds += dt;
      peakEnemies = Math.max(peakEnemies, game.enemies.length);
    }
    const sorted = distances.sort((a, b) => a - b);
    const round = n => Math.round(n * 10) / 10;
    return {
      level, mode: bot ? 'bot' : 'idle', seed, outcome, duration: round(game.elapsed),
      damageTaken, hordeDamage, guardianDamage, peakNear, nearSeconds: round(nearSeconds), kills: game.kills, army: game.army.count, peakArmy: game.peakArmy, tier: game.tier,
      totalEnemies: game.totalEnemies, peakEnemies, pending: game.reinforcements.reduce((n, b) => n + b.remaining, 0),
      killDistanceMean: round(distances.reduce((a, b) => a + b, 0) / (distances.length || 1)),
      killDistanceP90: round(sorted[Math.floor((sorted.length - 1) * .9)] || 0),
      killDistanceMax: round(sorted.at(-1) || 0), killsBeyond30: distances.filter(n => n > 30).length,
    };
  } finally { Math.random = originalRandom; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const levels = (process.env.SIM_LEVELS || '1,3,5').split(',').map(Number);
  const seeds = (process.env.SIM_SEEDS || '12345').split(',').map(Number);
  const duration = Number(process.env.SIM_DURATION || 300);
  const modes = (process.env.SIM_MODES || 'bot,idle').split(',');
  for (const level of levels) for (const mode of modes) for (const seed of seeds) {
    console.log(JSON.stringify(simulate({ level, bot: mode === 'bot', seed, duration })));
  }
}
