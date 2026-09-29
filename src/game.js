import * as THREE from 'three';
import * as M from './models.js';
import { Sound } from './audio.js';
import { REVEAL_Z, upgradeAvailable, emergence } from './presentation.js';

// ------------------------------------------------------------------ layout
const LANES = { left: -4.2, mid: 0, right: 4.2 };
const WALLS = [-6.35, -2.1, 2.1, 6.35];
const MOUTH_Z = -11;           // where corridors open onto the plaza
const ARMY_Z = 0;
const SPAWN_Z = -58;
const FAR_Z = -95;
const ARMY_LIMIT = 5.5;
const MAX_KIDS = 120;
const MAX_DYING_KIDS = 40;
const MAX_PROJ = 1600;
const MAX_PART = 900;
const CONVEYOR_SPEED = 4.6;
const KID_SCALE = 1.35;
const KID_SPACING = 0.37;
const MAX_LEVEL = 99;
const boundedNumber = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
const TILE_GAP = 0.5;          // half pitch between tiles on a conveyor

export const WEAPONS = [
  { name: 'Lance-pierre', dmg: 1, rate: 1.25, splash: 0, stone: 0x9e958a, size: 0.085, speed: 26 },
  { name: 'Lance-pierre renforcé', dmg: 2, rate: 1.45, splash: 0, stone: 0x8fa6c0, size: 0.095, speed: 28 },
  { name: "Lance-pierre d'or", dmg: 3.5, rate: 1.65, splash: 0, stone: 0xffd23a, size: 0.105, speed: 30 },
  { name: 'Pierres de feu', dmg: 6, rate: 1.85, splash: 0.9, stone: 0xff6a1f, size: 0.12, speed: 30 },
  { name: 'Calebasse tonnerre', dmg: 13, rate: 1.3, splash: 1.9, stone: 0xffe066, size: 0.12, speed: 24 },
];

// Monster families. hp is a multiplier of the wave's base hp.
// Four times the previous fivefold hordes; excess troops wait in the reinforcement queue.
export const HORDE_MULTIPLIER = 20;

export const ETYPES = {
  imp: { name: 'Fétiche', hp: 1, speed: 2.6, power: 1, r: 0.34, scale: 1.15, coin: 1, max: 520, freq: 9, anim: { amp: 0.7, bob: 0.06 } },
  hyena: { name: 'Hyène', hp: 0.55, speed: 6.4, power: 1, r: 0.38, scale: 1.1, coin: 1, max: 320, freq: 15, anim: { amp: 0.75, bob: 0.05 } },
  brute: { name: 'Buffle', hp: 5, speed: 1.8, power: 3, r: 0.6, scale: 1.3, coin: 4, max: 140, freq: 6, anim: { amp: 0.5, bob: 0.08 } },
  vulture: { name: 'Vautour', hp: 0.7, speed: 3.5, power: 1, r: 0.45, scale: 1.25, coin: 2, max: 160, freq: 11, fly: true, anim: { amp: 0, bob: 0, flap: 0.75 } },
};
const TYPE_KEYS = Object.keys(ETYPES);

const BOSSES = [
  { type: 'imp', name: 'Grand Fétiche', scale: 3.3, speed: 1.9, geo: () => M.impGeometry(true) },
  { type: 'brute', name: 'Buffle Géant', scale: 2.3, speed: 1.6, geo: () => M.bruteGeometry(true) },
  { type: 'hyena', name: 'Reine Hyène', scale: 2.7, speed: 2.4, geo: () => M.hyenaGeometry(true) },
];

export const UPGRADES = {
  recruits: { label: 'Recrues', desc: '+2 enfants au départ', base: 80, grow: 1.6, max: 30 },
  power: { label: 'Force', desc: '+15% de dégâts', base: 100, grow: 1.6, max: 40 },
  rate: { label: 'Cadence', desc: '+8% de tirs', base: 120, grow: 1.65, max: 30 },
};

export function upgradeCost(key, lvl) {
  const u = UPGRADES[key];
  return Math.round(u.base * Math.pow(u.grow, lvl));
}

// ------------------------------------------------------------------ levels
// Lots of small bonuses (+1, +3…) and big, mixed hordes.
function waveMix(L, w) {
  const mix = { imp: 1 };
  if (L >= 1 && w >= 1) mix.hyena = 0.35 + 0.05 * L;
  if (L >= 2 && w >= 2) mix.brute = 0.08 + 0.01 * L;
  if (L >= 3 && w >= 1) mix.vulture = 0.18 + 0.02 * L;
  return mix;
}

export function makeLevel(L) {
  L = Math.floor(boundedNumber(L, 1, 1, MAX_LEVEL));
  const n = L - 1;
  const e = Math.pow(1.17, n);
  const left = [];
  const gate = (tier, hp) => left.push({ kind: 'gate', tier, hp: Math.round(hp) });
  const tiles = (k, v) => { for (let i = 0; i < k; i++) left.push({ kind: 'tile', value: v }); };
  const boost = (b) => left.push({ kind: 'boost', boost: b });
  gate(1, 3 + n); tiles(12, 1);
  gate(2, 28 * (1 + 0.3 * n)); tiles(18, 1); boost('rate');
  gate(3, 130 * Math.pow(1.2, n)); tiles(24, 1); boost('dmg');
  gate(4, 520 * Math.pow(1.24, n)); tiles(30, 1); boost('rate'); tiles(30, 1 + Math.floor(n / 4));
  const bigVal = 3 + Math.floor(n / 2);
  const right = [{ kind: 'guardian', hp: Math.round(1600 * Math.pow(1.25, n)) }];
  for (let i = 0; i < 40; i++) right.push({ kind: 'big', value: bigVal });
  const waves = [
    { t: 4, n: 18 + 6 * L, hp: 1.5 * e },
    { t: 16, n: 30 + 10 * L, hp: 3 * e },
    { t: 29, n: 45 + 14 * L, hp: 6 * e },
    { t: 43, n: 60 + 18 * L, hp: 10 * e },
    { t: 58, n: 50 + 16 * L, hp: 14 * e, boss: Math.round(5000 * Math.pow(1.28, n)) },
  ].map((w, i) => ({ ...w, n: w.n * HORDE_MULTIPLIER, hp: w.hp * 1.25, mix: waveMix(L, i) }));
  return { left, right, waves, L, boss: BOSSES[n % BOSSES.length] };
}

// ------------------------------------------------------------------ helpers
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

function setInst(mesh, i, x, y, z, rx, ry, rz, sx, sy = sx, sz = sx) {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz));
  tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
  mesh.setMatrixAt(i, tmpM);
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmt = (n) => {
  n = Math.max(0, Math.ceil(n));
  if (n >= 100000) return (n / 1000).toFixed(0) + 'k';
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
};

function pick(mix) {
  let tot = 0;
  for (const k in mix) tot += mix[k];
  let r = Math.random() * tot;
  for (const k in mix) { r -= mix[k]; if (r <= 0) return k; }
  return 'imp';
}

// ================================================================== Game
export class Game {
  constructor(container, ui, opts = {}) {
    this.container = container;
    this.ui = ui;
    this.opts = opts;
    this.sound = new Sound();
    this.state = 'menu';
    this.timeScale = boundedNumber(opts.speed, 1, 0.25, 8);
    this.save = this.loadSave();
    this.gtime = { value: 0 };
    this.initRenderer();
    this.initScene();
    this.initActors();
    this.initInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    this.clock = new THREE.Clock();
    this.frameTimes = [];
    this.prepareLevel(this.save.level);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- save
  loadSave() {
    const def = { level: 1, coins: 0, best: 1, up: { recruits: 0, power: 0, rate: 0 } };
    try {
      const s = JSON.parse(localStorage.getItem('pl_save') || 'null');
      if (s && typeof s === 'object' && !Array.isArray(s)) {
        const up = {};
        for (const key of Object.keys(UPGRADES)) up[key] = Math.floor(boundedNumber(s.up?.[key], 0, 0, UPGRADES[key].max));
        const level = Math.floor(boundedNumber(s.level, 1, 1, MAX_LEVEL));
        return { level, coins: Math.floor(boundedNumber(s.coins, 0, 0, Number.MAX_SAFE_INTEGER)), best: Math.max(level, Math.floor(boundedNumber(s.best, 1, 1, MAX_LEVEL))), up, tutorialDone: s.tutorialDone === true };
      }
    } catch (e) { /* ignore */ }
    return def;
  }
  writeSave() {
    try { localStorage.setItem('pl_save', JSON.stringify(this.save)); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- setup
  initRenderer() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const r = new THREE.WebGLRenderer({ antialias: dpr < 1.5, powerPreference: 'high-performance' });
    r.setPixelRatio(dpr);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(r.domElement);
    this.renderer = r;
    this.mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || Math.min(screen.width, screen.height) < 600;
  }

  initScene() {
    const scene = new THREE.Scene();
    this.scene = scene;
    const haze = new THREE.Color(0xf6cf9c);
    scene.background = haze;
    scene.fog = new THREE.Fog(haze, 45, 150);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), M.skyMaterial());
    sky.renderOrder = -1;
    scene.add(sky);

    scene.add(new THREE.HemisphereLight(0xfff1dc, 0xb7784a, 1.15));
    const sun = new THREE.DirectionalLight(0xffe0b0, 2.6);
    sun.position.set(9, 18, 7);
    sun.target.position.set(0, 0, -8);
    sun.castShadow = true;
    const sm = this.mobile ? 1024 : 2048;
    sun.shadow.mapSize.set(sm, sm);
    const sc = sun.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 22; sc.bottom = -18; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    this.sun = sun;

    // ground
    const gt = M.groundTexture();
    gt.repeat.set(14, 44);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 280), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -60;
    ground.receiveShadow = true;
    scene.add(ground);
    const pt = M.pathTexture();
    pt.repeat.set(1, 18);
    const floorMat = new THREE.MeshStandardMaterial({ map: pt, roughness: 0.95 });
    for (const x of Object.values(LANES)) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(3.7, MOUTH_Z - FAR_Z), floorMat);
      f.rotation.x = -Math.PI / 2;
      f.position.set(x, 0.012, (MOUTH_Z + FAR_Z) / 2);
      f.receiveShadow = true;
      scene.add(f);
    }
    const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide });
    this.vmat = vmat;
    const walls = new THREE.Mesh(M.wallsGeometry(WALLS, MOUTH_Z, FAR_Z), vmat);
    walls.castShadow = walls.receiveShadow = true;
    scene.add(walls);
    const decor = new THREE.Mesh(M.decorGeometry(11), vmat);
    decor.castShadow = decor.receiveShadow = true;
    scene.add(decor);
    scene.add(new THREE.Mesh(M.hillsGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));

    this.initGrass();
    this.initAmbient();
  }

  initGrass() {
    const tex = M.grassTexture();
    const a = new THREE.PlaneGeometry(0.9, 0.7); a.translate(0, 0.35, 0);
    const b = a.clone(); b.rotateY(Math.PI / 2);
    const geo = new THREE.BufferGeometry();
    const merged = [a, b].map((g) => g.toNonIndexed());
    const cat = (name, n) => {
      const arrs = merged.map((g) => g.attributes[name].array);
      const out = new Float32Array(arrs.reduce((s, x) => s + x.length, 0));
      let o = 0; for (const x of arrs) { out.set(x, o); o += x.length; }
      geo.setAttribute(name, new THREE.BufferAttribute(out, n));
    };
    cat('position', 3); cat('normal', 3); cat('uv', 2);
    geo.attributes.normal.array.fill(0);
    for (let i = 1; i < geo.attributes.normal.array.length; i += 3) geo.attributes.normal.array[i] = 1;
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 });
    const gt = this.gtime;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = gt;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wp0 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uTime * 1.8 + wp0.x * 0.45 + wp0.z * 0.3) + 0.4 * sin(uTime * 3.7 + wp0.z);
          transformed.x += sway * 0.09 * position.y;
          transformed.z += sway * 0.04 * position.y;`);
    };
    const count = this.mobile ? 900 : 1600;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const r = M.rng(77);
    let i = 0;
    while (i < count) {
      const x = (r() - 0.5) * 60, z = 16 - r() * 120;
      const ax = Math.abs(x);
      const inCorridor = ax < 6.7 && z < MOUTH_Z + 0.5;
      const inPlaza = ax < 6.6 && z >= MOUTH_Z + 0.5 && z < 8;
      if (inCorridor) continue;
      if (inPlaza && r() < 0.93) continue;
      const s = 0.7 + r() * 0.9;
      setInst(mesh, i, x, 0, z, 0, r() * 3, 0, s, s * (0.8 + r() * 0.5), s);
      const v = 0.85 + r() * 0.3;
      mesh.setColorAt(i, tmpC.setRGB(v, v * (0.95 + r() * 0.1), v * 0.9));
      i++;
    }
    this.scene.add(mesh);
  }

  initAmbient() {
    // drifting clouds
    const cg = M.cloudGeometry();
    const cm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: 0x6a5a4a, fog: false });
    this.clouds = [];
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(cg, cm);
      c.position.set(-80 + i * 32 + Math.random() * 10, 32 + Math.random() * 18, -150 - Math.random() * 60);
      c.scale.setScalar(5 + Math.random() * 5);
      this.clouds.push(c);
      this.scene.add(c);
    }
    // circling birds
    const bm = M.animate(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), { amp: 0, bob: 0, flap: 0.6 });
    const bg = M.birdGeometry();
    this.birdPhase = new THREE.InstancedBufferAttribute(new Float32Array(8), 1);
    this.birdAnim = new THREE.InstancedBufferAttribute(new Float32Array(8).fill(1), 1);
    bg.setAttribute('iPhase', this.birdPhase);
    bg.setAttribute('iAnim', this.birdAnim);
    this.birds = new THREE.InstancedMesh(bg, bm, 8);
    this.birds.frustumCulled = false;
    this.scene.add(this.birds);
    // torches around the plaza
    const tg = M.torchGeometry();
    this.flames = [];
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa12a });
    const flameCore = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
    const glowMat = new THREE.SpriteMaterial({ map: M.glowTexture(), color: 0xff9a3a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 });
    this.glowTex = glowMat.map;
    for (const [x, z] of [[-7.1, -9.6], [7.1, -9.6], [-7.1, 6], [7.1, 6]]) {
      const t = new THREE.Mesh(tg, this.vmat);
      t.position.set(x, 0, z);
      t.castShadow = true;
      this.scene.add(t);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), flameMat);
      f.position.set(x, 1.95, z);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), flameCore);
      core.position.set(x, 1.9, z);
      const g = new THREE.Sprite(glowMat);
      g.position.set(x, 2.0, z);
      g.scale.set(1.8, 1.8, 1);
      this.scene.add(f, core, g);
      this.flames.push({ f, core, g, seed: Math.random() * 10 });
    }
    // floating dust motes
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 26; pos[i * 3 + 1] = Math.random() * 6; pos[i * 3 + 2] = 8 - Math.random() * 45; }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xfff0d0, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false }));
    this.scene.add(this.dust);
  }

  animatedMesh(geo, cap, anim, color = true) {
    const mat = M.animate(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), anim);
    const phase = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    const amt = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    phase.setUsage(THREE.DynamicDrawUsage); amt.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPhase', phase);
    geo.setAttribute('iAnim', amt);
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.customDepthMaterial = M.animDepth(anim);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.count = 0;
    if (color) for (let i = 0; i < cap; i++) mesh.setColorAt(i, tmpC.setRGB(1, 1, 1));
    mesh.userData = { phase, amt };
    this.scene.add(mesh);
    return mesh;
  }

  initActors() {
    const kidAnim = { amp: 0.75, bob: 0.05, shoot: true };
    const kcap = MAX_KIDS + MAX_DYING_KIDS;
    this.kidMesh = this.animatedMesh(M.kidGeometry(), kcap, kidAnim, false);
    for (let i = 0; i < kcap; i++) {
      const v = 0.88 + Math.random() * 0.24;
      this.kidMesh.setColorAt(i, tmpC.setRGB(v, v * 0.97, v * 0.95));
    }
    const shot = new THREE.InstancedBufferAttribute(new Float32Array(kcap * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.kidMesh.geometry.setAttribute('iShot', shot);
    this.kidMesh.userData.shot = shot;
    // slingshots share the kids' phase so they bob together
    const { phase, amt } = this.kidMesh.userData;
    this.slingGeos = WEAPONS.map((_, i) => {
      const g = M.slingshotGeometry(i);
      g.setAttribute('iPhase', phase);
      g.setAttribute('iAnim', amt);
      g.setAttribute('iShot', shot);
      return g;
    });
    const smat = M.animate(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 }), kidAnim);
    this.slingMesh = new THREE.InstancedMesh(this.slingGeos[0], smat, kcap);
    this.slingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.slingMesh.frustumCulled = false;
    this.slingMesh.count = 0;
    this.scene.add(this.slingMesh);

    const geos = { imp: M.impGeometry(false), hyena: M.hyenaGeometry(false), brute: M.bruteGeometry(false), vulture: M.vultureGeometry() };
    this.enemyMeshes = {};
    for (const k of TYPE_KEYS) this.enemyMeshes[k] = this.animatedMesh(geos[k], ETYPES[k].max + 60, ETYPES[k].anim);

    this.bossMeshes = BOSSES.map((b) => {
      const m = this.animatedMesh(b.geo(), 1, ETYPES[b.type].anim);
      return m;
    });

    this.guardian = new THREE.Mesh(M.guardianGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
    this.guardian.castShadow = true;
    this.scene.add(this.guardian);

    this.plinthGeo = M.plinthGeometry();
    this.plinthMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.iconMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3, emissive: 0x3a2a00 });

    // projectiles (stretched along their velocity = motion streak)
    this.projMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: 0x332211 }), MAX_PROJ);
    this.projMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projMesh.frustumCulled = false;
    this.projMesh.count = 0;
    this.projMesh.setColorAt(0, tmpC.set(0xffffff));
    this.scene.add(this.projMesh);

    // particles
    this.partMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ emissive: 0x221100 }), MAX_PART);
    this.partMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.partMesh.frustumCulled = false;
    this.partMesh.count = 0;
    this.partMesh.setColorAt(0, tmpC.set(0xffffff));
    this.scene.add(this.partMesh);
    this.parts = [];
    this.abilityRing = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), new THREE.MeshBasicMaterial({ color: 0x75ffe0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.abilityRing.rotation.x = -Math.PI / 2;
    this.abilityRing.visible = false;
    this.scene.add(this.abilityRing);

    this.glowMat = new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffd060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

    // bonus signs: one InstancedMesh per label
    const shape = new THREE.Shape();
    const w = 1.6, h = 1.0, rr = 0.2;
    shape.moveTo(-w / 2 + rr, -h / 2);
    shape.lineTo(w / 2 - rr, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + rr);
    shape.lineTo(w / 2, h / 2 - rr); shape.quadraticCurveTo(w / 2, h / 2, w / 2 - rr, h / 2);
    shape.lineTo(-w / 2 + rr, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - rr);
    shape.lineTo(-w / 2, -h / 2 + rr); shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + rr, -h / 2);
    this.tileGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 6 });
    this.tileGeo.translate(0, 0, -0.05);
    this.tileMeshes = {};

    this.ringMat = new THREE.MeshBasicMaterial({ map: M.ringTexture(), transparent: true, depthWrite: false });
    this.rocks = [];
    this.rockGeo = M.Blob(0.55, 1, 0.3, 4);
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x8b7d6b, roughness: 0.9 });
  }

  tileMeshFor(kind, label) {
    const key = kind + label;
    if (!this.tileMeshes[key]) {
      const sideC = { recruit: 0x1d67e0, big: 0xe09a0a, boost: 0x1faa4a }[kind];
      const tex = M.tileTexture(label, kind);
      tex.repeat.set(1 / 1.68, 1 / 1.08);
      tex.offset.set(0.5, 0.5);
      const front = new THREE.MeshBasicMaterial({ map: tex });
      const side = new THREE.MeshStandardMaterial({ color: sideC, roughness: 0.4, metalness: 0.2 });
      const m = new THREE.InstancedMesh(this.tileGeo, [front, side], 90);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      this.scene.add(m);
      this.tileMeshes[key] = m;
    }
    return this.tileMeshes[key];
  }

  initInput() {
    const el = this.container;
    let dragging = false, lastX = 0;
    el.addEventListener('pointerdown', (e) => {
      this.sound.unlock();
      dragging = true;
      lastX = e.clientX;
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging || this.state !== 'playing') return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      const k = (ARMY_LIMIT * 2.4) / Math.min(el.clientWidth, 700);
      this.army.targetX = clamp(this.army.targetX + dx * k, -ARMY_LIMIT, ARMY_LIMIT);
      this.moved += Math.abs(dx);
    });
    const up = () => { dragging = false; };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    this.keys = {};
    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key) && this.state === 'playing') e.preventDefault();
      this.keys[e.key.toLowerCase()] = true;
      this.keys[e.key] = true;
      if (e.code === 'Space' && !e.repeat) this.activateAbility();
      if (e.key === 'Escape' || e.key === 'p') {
        if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume();
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key] = false; this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { this.keys = {}; dragging = false; if (this.state === 'playing') this.pause(); });
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    const portrait = aspect < 1;
    const vfov = portrait ? 58 : 50;
    this.camera.fov = vfov;
    const target = new THREE.Vector3(0, 0, portrait ? -7.2 : -10.5);
    const dir = new THREE.Vector3(0, 0.66, 0.75).normalize();
    this.camDir = dir;
    const tanH = Math.tan(THREE.MathUtils.degToRad(vfov / 2)) * aspect;
    const dist = portrait ? clamp(5.3 / tanH, 14, 34) : 27;
    this.camBase = target.clone().addScaledVector(dir, dist);
    this.camTarget = target;
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  }

  // ---------------------------------------------------------------- level
  prepareLevel(L) {
    clearTimeout(this.endTimer);
    this.clearLevel();
    const lv = makeLevel(L);
    this.level = lv;
    this.time = 0;
    this.elapsed = 0;
    this.combo = 0;
    this.comboTime = 0;
    this.bestCombo = 0;
    this.lastComboFeedback = -Infinity;
    this.ability = { cooldown: 0, duration: 0, totalCooldown: 16 };
    this.abilityPulse = 0;
    this.peakArmy = 1 + 2 * this.save.up.recruits;
    this.runId = (this.runId || 0) + 1;
    this.kills = 0;
    this.resolved = 0;
    this.earned = 0;
    this.tier = 0;
    this.rateMult = 1 + 0.08 * this.save.up.rate;
    this.dmgMult = 1 + 0.15 * this.save.up.power;
    this.army = { x: 0, vx: 0, targetX: 0, count: 1 + 2 * this.save.up.recruits, r: 0.4 };
    this.kids = [];
    this.dyingKids = [];
    this.syncKids(true);
    this.slingMesh.geometry = this.slingGeos[0];
    this.enemies = [];
    this.reinforcements = [];
    this.spawnClock = 0;
    this.dying = [];
    this.boss = null;
    this.bossDefeated = false;
    this.bossDef = lv.boss;
    this.ui.bossName.textContent = lv.boss.name;
    this.waveIdx = 0;
    this.totalEnemies = lv.waves.reduce((a, w) => a + w.n + (w.boss ? 1 : 0), 0);
    this.proj = [];
    this.moved = 0;
    this.shake = 0;
    this.guardianCd = 3;
    this.ended = false;

    this.lanes = [];
    for (const [key, items] of [['left', lv.left], ['right', lv.right]]) {
      const lane = { key, x: LANES[key], items: [] };
      let z = MOUTH_Z;
      for (const it of items) {
        const item = { ...it, maxHp: it.hp, alive: true, bob: Math.random() * 6, reveal: 0 };
        if (it.kind === 'gate' || it.kind === 'guardian') {
          const depth = it.kind === 'guardian' ? 1.1 : 0.7;
          item.halfDepth = depth;
          z -= depth;
          item.z = z;
          z -= depth + 0.6;
        } else {
          z -= TILE_GAP;
          item.z = z;
          z -= TILE_GAP;
        }
        this.buildItem(lane, item);
        lane.items.push(item);
      }
      this.lanes.push(lane);
    }
    this.updateHud(true);
  }

  clearLevel() {
    if (this.lanes) for (const lane of this.lanes) for (const it of lane.items) this.disposeItem(it);
    if (this.rocks) for (const r of this.rocks) { this.scene.remove(r.mesh, r.ring); r.ring.geometry.dispose(); }
    this.rocks = [];
    this.parts = [];
    this.ui.labels.innerHTML = '';
    this.ui.floats.innerHTML = '';
    for (const m of this.bossMeshes) m.count = 0;
    this.ui.bossBar.classList.add('hidden');
  }

  buildItem(lane, it) {
    const x = lane.x;
    if (it.kind === 'gate') {
      const g = new THREE.Group();
      const plinth = new THREE.Mesh(this.plinthGeo, this.plinthMat);
      plinth.castShadow = plinth.receiveShadow = true;
      g.add(plinth);
      const icon = new THREE.Mesh(this.slingGeos[it.tier], this.iconMat);
      icon.scale.setScalar(3.4);
      icon.position.set(-0.58, -3.4, 0.82);
      icon.castShadow = true;
      const holder = new THREE.Group();
      holder.position.set(0, 1.9, 0);
      holder.add(icon);
      g.add(holder);
      const glow = new THREE.Sprite(this.glowMat);
      glow.scale.set(2.8, 2.8, 1);
      glow.position.set(0, 1.9, 0.2);
      g.add(glow);
      g.position.set(x, 0, it.z);
      g.visible = false;
      it.mesh = g;
      it.icon = holder;
      this.scene.add(g);
      it.label = this.makeLabel('gate-label', fmt(it.hp));
    } else if (it.kind === 'guardian') {
      this.guardian.position.set(x, 0, it.z);
      this.guardian.visible = true;
      it.mesh = this.guardian;
      it.label = this.makeLabel('gate-label big', fmt(it.hp));
    } else {
      const kind = it.kind === 'tile' ? 'recruit' : it.kind === 'big' ? 'big' : 'boost';
      const label = it.kind === 'boost' ? (it.boost === 'rate' ? 'CADENCE' : 'FORCE') : '+' + it.value;
      it.tmesh = this.tileMeshFor(kind, label);
      it.scale = 1;
      it.y = 0.85;
    }
  }

  disposeItem(it) {
    if (it.mesh && it.mesh !== this.guardian) this.scene.remove(it.mesh);
    if (it.mesh === this.guardian) this.guardian.visible = false;
    if (it.label) it.label.remove();
    it.label = null;
  }

  makeLabel(cls, text) {
    const d = document.createElement('div');
    d.className = 'wlabel ' + cls;
    d.textContent = text;
    this.ui.labels.appendChild(d);
    return d;
  }

  // ---------------------------------------------------------------- flow
  start() {
    this.sound.unlock();
    this.sound.startMusic();
    this.state = 'playing';
    this.clock.getDelta();
    this.ui.onState('playing');
    if (this.level.L === 1 && !this.save.tutorialDone) this.ui.tutorial(true);
  }
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.sound.stopMusic();
    this.ui.onState('paused');
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.clock.getDelta();
    this.sound.startMusic();
    this.ui.onState('playing');
  }
  restart() {
    this.prepareLevel(this.save.level);
    this.start();
  }
  nextLevel() {
    this.prepareLevel(this.save.level);
    this.state = 'menu';
    this.ui.onState('menu');
  }

  win() {
    if (this.ended) return;
    this.ended = true;
    const L = this.level.L;
    const bonus = 25 * L + Math.floor(this.army.count / 5);
    this.earned += bonus;
    this.save.coins += bonus;
    this.save.level = Math.min(MAX_LEVEL, L + 1);
    this.save.best = Math.max(this.save.best, this.save.level);
    this.writeSave();
    this.sound.win();
    this.sound.stopMusic();
    const runId = this.runId;
    this.endTimer = setTimeout(() => {
      if (this.runId !== runId) return;
      this.state = 'win';
      this.ui.onState('win', { level: L, earned: this.earned, army: this.army.count, ...this.runStats() });
    }, 1400);
  }
  lose() {
    if (this.ended) return;
    this.ended = true;
    this.writeSave();
    this.sound.lose();
    this.sound.stopMusic();
    const runId = this.runId;
    this.endTimer = setTimeout(() => {
      if (this.runId !== runId) return;
      this.state = 'lose';
      this.ui.onState('lose', { level: this.level.L, earned: this.earned, ...this.runStats() });
    }, 1100);
  }

  buyUpgrade(key) {
    const lvl = this.save.up[key];
    if (lvl >= UPGRADES[key].max) return false;
    const c = upgradeCost(key, lvl);
    if (this.save.coins < c) return false;
    this.save.coins -= c;
    this.save.up[key]++;
    this.writeSave();
    this.prepareLevel(this.save.level);
    this.sound.upgrade();
    return true;
  }

  runStats() {
    return { kills: this.kills, bestCombo: this.bestCombo, duration: Math.round(this.elapsed), peakArmy: this.peakArmy };
  }

  registerCombo() {
    this.combo++;
    this.comboTime = 3.5;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    if (this.combo % 25 === 0 && this.elapsed - (this.lastComboFeedback ?? -Infinity) >= 2) {
      this.lastComboFeedback = this.elapsed;
      this.floatText(this.combo + ' ÉLIMINATIONS !', this.army.x, 3, ARMY_Z, 'big');
      this.sound.combo?.(this.combo);
    }
  }

  activateAbility() {
    if (this.state !== 'playing' || this.ended || this.ability.cooldown > 0) return false;
    this.ability.cooldown = this.ability.totalCooldown;
    this.ability.duration = 4;
    this.abilityPulse = 0.65;
    this.abilityX = this.army.x;
    this.shake = Math.max(this.shake, 0.45);
    this.sound.shield?.();
    this.burst(this.army.x, 0.3, ARMY_Z, 0x75ffe0, 36, 10, 0.16, 4);
    const damage = WEAPONS[this.tier].dmg * this.dmgMult * Math.max(5, Math.sqrt(this.army.count) * 2);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (Math.hypot(e.x - this.army.x, e.z - ARMY_Z) > 12) continue;
      this.damageEnemy(e, damage);
      e.kb = 7;
      e.z -= 1.4;
      if (e.hp <= 0) this.killEnemy(i);
    }
    if (this.boss && Math.hypot(this.boss.x - this.army.x, this.boss.z - ARMY_Z) <= 12) this.damageEnemy(this.boss, damage * 3);
    this.ui.banner('ONDE DES ANCÊTRES', 'Repousse la horde · cadence +60% pendant 4 s');
    this.updateHud();
    return true;
  }

  // ---------------------------------------------------------------- army
  slot(i) {
    const r = KID_SPACING * Math.sqrt(i + 0.3);
    const a = i * 2.39996;
    return [Math.cos(a) * r, Math.sin(a) * r * 0.9];
  }

  syncKids(instant = false, spawnX = null, spawnZ = null) {
    const want = Math.min(this.army.count, MAX_KIDS);
    while (this.kids.length < want) {
      const i = this.kids.length;
      const [sx, sz] = this.slot(i);
      const jump = spawnX !== null;
      this.kids.push({
        x: jump ? spawnX : this.army.x + sx, z: jump ? spawnZ : ARMY_Z + sz,
        y: jump ? 0.8 : 0, vx: 0, vz: 0, vy: jump ? 4.5 + Math.random() * 2 : 0,
        s: instant ? 1 : 0.3, cd: Math.random() * 0.8, phase: Math.random() * 6.28, recoil: 0, draw: 0, lean: 0,
      });
    }
    while (this.kids.length > want) this.killKid(this.kids.pop());
    this.army.r = KID_SPACING * Math.sqrt(Math.max(1, this.kids.length)) + 0.3;
  }

  killKid(k, fromX = null, fromZ = null) {
    if (this.dyingKids.length >= MAX_DYING_KIDS) this.dyingKids.shift();
    const dx = fromX === null ? (Math.random() - 0.5) : k.x - fromX;
    const dz = fromZ === null ? 0.5 : k.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    this.dyingKids.push({ x: k.x, y: k.y, z: k.z, vx: (dx / l) * 3, vz: (dz / l) * 3, vy: 4 + Math.random() * 2, rx: 0, rz: 0, sx: (Math.random() - 0.5) * 14, sz: (Math.random() - 0.5) * 14, t: 0, phase: k.phase });
    this.burst(k.x, 0.6, k.z, 0xffffff, 3, 2.5, 0.07);
  }

  addUnits(n, x, z) {
    this.army.count += n;
    this.peakArmy = Math.max(this.peakArmy, this.army.count);
    this.syncKids(false, x, z);
  }

  loseUnits(n, fromX = null, fromZ = null) {
    if (n <= 0 || this.army.count <= 0) return;
    this.combo = 0;
    this.comboTime = 0;
    this.army.count = Math.max(0, this.army.count - n);
    const want = Math.min(this.army.count, MAX_KIDS);
    // the kids closest to the hit fall first
    if (fromX !== null && this.kids.length > want) {
      const order = this.kids.map((k, i) => [i, (k.x - fromX) ** 2 + (k.z - fromZ) ** 2]).sort((a, b) => a[1] - b[1]);
      const drop = new Set(order.slice(0, this.kids.length - want).map((o) => o[0]));
      const keep = [];
      this.kids.forEach((k, i) => { if (drop.has(i)) this.killKid(k, fromX, fromZ); else keep.push(k); });
      this.kids = keep;
    }
    this.syncKids();
    this.sound.hurt();
    if (navigator.vibrate && n > 2) navigator.vibrate(15);
    if (this.army.count <= 0) this.lose();
  }

  // ---------------------------------------------------------------- fx
  burst(x, y, z, color, n = 8, speed = 4, size = 0.12, grav = 12) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_PART) this.parts.shift();
      const a = Math.random() * 6.283;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({
        x, y, z,
        vx: Math.cos(a) * s, vy: speed * (0.5 + Math.random()), vz: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.4, t: 0, size: size * (0.6 + Math.random() * 0.8),
        color, grav, rot: Math.random() * 3,
      });
    }
  }

  floatText(text, x, y, z, cls = '') {
    const p = this.project(x, y, z);
    const d = document.createElement('div');
    d.className = 'ftext ' + cls;
    d.textContent = text;
    d.style.left = p.x + 'px';
    d.style.top = p.y + 'px';
    this.ui.floats.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  }

  project(x, y, z) {
    tmpV.set(x, y, z).project(this.camera);
    return { x: (tmpV.x * 0.5 + 0.5) * this.w, y: (-tmpV.y * 0.5 + 0.5) * this.h };
  }

  // ---------------------------------------------------------------- loop
  frame() {
    let dt = Math.min(this.clock.getDelta(), 0.05);
    this.trackPerf(dt);
    if (this.state === 'playing') {
      dt *= this.timeScale;
      const steps = Math.ceil(dt / 0.034);
      for (let i = 0; i < steps; i++) this.update(dt / steps);
    }
    this.render(dt);
  }

  trackPerf(dt) {
    // adaptive quality: shadows go first, then resolution
    this.frameTimes.push(dt);
    if (this.frameTimes.length >= 90) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.frameTimes.length = 0;
      if (avg > 0.026 && !this.opts.bot) {
        if (this.sun.castShadow) {
          this.sun.castShadow = false;
        } else if (this.dpr > 1) {
          this.dpr = Math.max(1, this.dpr - 0.25);
          this.renderer.setPixelRatio(this.dpr);
          this.resize();
        }
      }
    }
  }

  update(dt) {
    if (this.ended) return;
    this.time += dt;
    this.elapsed += dt;
    this.ability.cooldown = Math.max(0, this.ability.cooldown - dt);
    this.ability.duration = Math.max(0, this.ability.duration - dt);
    this.comboTime = Math.max(0, this.comboTime - dt);
    if (!this.comboTime) this.combo = 0;
    const lv = this.level;
    if (this.opts.bot) this.botThink();
    const kx = (this.keys.ArrowLeft || this.keys.a || this.keys.q ? -1 : 0) + (this.keys.ArrowRight || this.keys.d ? 1 : 0);
    if (kx) { this.army.targetX = clamp(this.army.targetX + kx * 10 * dt, -ARMY_LIMIT, ARMY_LIMIT); this.moved += 10; }
    // critically damped spring: snappy but never teleports
    const A = this.army;
    A.vx += ((A.targetX - A.x) * 90 - A.vx * 19) * dt;
    A.x += A.vx * dt;
    if (this.moved > 60 && !this.save.tutorialDone) {
      this.save.tutorialDone = true;
      this.writeSave();
      this.ui.tutorial(false);
    }

    // waves
    while (this.waveIdx < lv.waves.length && this.time >= lv.waves[this.waveIdx].t) {
      this.spawnWave(lv.waves[this.waveIdx]);
      this.waveIdx++;
    }
    if (this.waveIdx < lv.waves.length && this.enemies.length === 0 && this.reinforcements.length === 0 && !this.boss) {
      const next = lv.waves[this.waveIdx].t;
      if (next - this.time > 3) this.time = next - 3;
    }

    this.updateReinforcements(dt);
    this.updateKids(dt);
    this.updateProjectiles(dt);
    for (const lane of this.lanes) this.updateLane(lane, dt);
    this.updateEnemies(dt);
    this.updateGuardian(dt);
    this.updateRocks(dt);

    if (!this.ended && this.waveIdx >= lv.waves.length && this.enemies.length === 0 && this.reinforcements.length === 0 && this.bossDefeated) this.win();
    this.updateHud();
  }

  updateKids(dt) {
    const W = WEAPONS[this.tier];
    const interval = 1 / (W.rate * this.rateMult * (this.ability.duration > 0 ? 1.6 : 1));
    const mult = this.army.count / Math.max(1, this.kids.length);
    const dmg = W.dmg * this.dmgMult * mult;
    const aim = this.findPlazaTarget();
    let fired = 0;
    for (let i = 0; i < this.kids.length; i++) {
      const k = this.kids[i];
      const [sx, sz] = this.slot(i);
      const tx = this.army.x + sx, tz = ARMY_Z + sz;
      // spring to formation slot; outer kids are a bit laggier (crowd feel)
      const K = 55 / (1 + Math.hypot(sx, sz) * 0.35);
      const D = 2 * Math.sqrt(K) * 0.85;
      k.vx += ((tx - k.x) * K - k.vx * D) * dt;
      k.vz += ((tz - k.z) * K - k.vz * D) * dt;
      k.x += k.vx * dt; k.z += k.vz * dt;
      if (k.y > 0 || k.vy > 0) {
        k.vy -= 18 * dt; k.y += k.vy * dt;
        if (k.y <= 0) { k.y = 0; k.vy = 0; this.burst(k.x, 0.05, k.z, 0xd9a066, 2, 1.5, 0.06, 6); }
      }
      k.s = Math.min(1, k.s + dt * 3);
      const sp = Math.hypot(k.vx, k.vz);
      k.phase += dt * (7 + sp * 2.2);
      k.anim = clamp(0.25 + sp * 0.35, 0, 1);
      k.lean = lerp(k.lean, clamp(-k.vx * 0.05, -0.35, 0.35), Math.min(1, dt * 10));
      k.recoil = Math.max(0, k.recoil - dt * 6);
      k.cd -= dt;
      k.draw = k.recoil > 0.72 ? (k.recoil - 0.72) / 0.28 : clamp(1 - k.cd / Math.min(0.24, interval * 0.65), 0, 1);
      if (k.cd <= 0) {
        k.cd += interval * (0.85 + Math.random() * 0.3);
        k.recoil = 1;
        k.draw = 1;
        let dx = (Math.random() - 0.5) * 0.05, dz = -1;
        if (aim) {
          const ax = aim.x - k.x, az = aim.z - k.z;
          const l = Math.hypot(ax, az) || 1;
          dx = ax / l; dz = az / l;
        }
        this.fire(k.x + 0.17 * KID_SCALE, 1.065 * KID_SCALE + k.y, k.z - 0.24 * KID_SCALE, dx, dz, dmg, W);
        fired++;
      }
    }
    if (fired) this.sound.shoot();
    for (let i = this.dyingKids.length - 1; i >= 0; i--) {
      const d = this.dyingKids[i];
      d.t += dt;
      d.vy -= 16 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.rx += d.sx * dt; d.rz += d.sz * dt;
      if (d.y < 0) { d.y = 0; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; d.sx *= 0.5; d.sz *= 0.5; }
      if (d.t > 1.1) this.dyingKids.splice(i, 1);
    }
  }

  findPlazaTarget() {
    let best = null, bd = 9 * 9;
    const test = (e) => {
      if (e.z < MOUTH_Z + 0.5) return;
      const dx = e.x - this.army.x, dz = e.z - ARMY_Z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = e; }
    };
    for (const e of this.enemies) test(e);
    if (this.boss) test(this.boss);
    return best;
  }

  fire(x, y, z, dx, dz, dmg, W) {
    // A physical 14 m lifetime keeps impacts in the visible battlefield for every weapon.
    if (this.proj.length >= MAX_PROJ) return;
    this.proj.push({ x, y, z, vx: dx * W.speed, vz: dz * W.speed, vy: 1.4, dmg, splash: W.splash, color: W.stone, size: W.size, life: 14 / W.speed });
  }

  buildGrid() {
    const grid = new Map();
    const cell = 1.6;
    for (const e of this.enemies) {
      const key = ((Math.floor(e.x / cell) + 64) << 10) | (Math.floor(e.z / cell) + 512);
      let b = grid.get(key);
      if (!b) grid.set(key, (b = []));
      b.push(e);
    }
    this.grid = grid;
    this.cell = cell;
    return grid;
  }

  updateProjectiles(dt) {
    const grid = this.buildGrid();
    const cell = this.cell;
    const leftGate = this.frontBlocker(this.lanes[0]);
    const rightGate = this.frontBlocker(this.lanes[1]);
    const P = this.proj;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.vy -= 2.2 * dt; p.y = Math.max(0.25, p.y + p.vy * dt);
      p.life -= dt;
      let dead = p.life <= 0 || p.z < FAR_Z + 20;
      if (!dead && p.z < MOUTH_Z + 0.2) {
        const ax = Math.abs(p.x);
        if ((ax > 1.86 && ax < 2.36) || ax > 6.1) {
          dead = true;
          if (Math.random() < 0.25) this.burst(p.x, p.y, p.z, 0xcf8a52, 2, 2, 0.06);
        } else if (p.x < -2.1) {
          if (leftGate && p.z <= leftGate.z + leftGate.halfDepth) { this.damageBlocker(this.lanes[0], leftGate, p); dead = true; }
        } else if (p.x > 2.1) {
          if (rightGate && p.z <= rightGate.z + rightGate.halfDepth) { this.damageBlocker(this.lanes[1], rightGate, p); dead = true; }
        }
      }
      if (!dead && this.boss) {
        const b = this.boss;
        const dx = p.x - b.x, dz = p.z - b.z;
        if (dx * dx + dz * dz < b.r * b.r) {
          this.damageEnemy(b, p.dmg, p);
          this.burst(p.x, 1.5, p.z, p.color, 2, 3, 0.08);
          if (p.splash) this.splash(p, grid, cell);
          dead = true;
        }
      }
      if (!dead) {
        const cx = Math.floor(p.x / cell), cz = Math.floor(p.z / cell);
        outer: for (let ox = -1; ox <= 1; ox++) {
          for (let oz = -1; oz <= 1; oz++) {
            const b = grid.get(((cx + ox + 64) << 10) | (cz + oz + 512));
            if (!b) continue;
            for (const e of b) {
              if (e.hp <= 0) continue;
              const dx = p.x - e.x, dz = p.z - e.z, rr = e.r + 0.08;
              if (dx * dx + dz * dz < rr * rr) {
                this.damageEnemy(e, p.dmg, p);
                this.burst(p.x, e.fly ? 2.2 : 0.8, p.z, p.splash ? p.color : 0xffffff, 2, 2.5, 0.06);
                if (p.splash) this.splash(p, grid, cell, e);
                dead = true;
                break outer;
              }
            }
          }
        }
      }
      if (dead) { P[i] = P[P.length - 1]; P.pop(); }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].hp <= 0) this.killEnemy(i);
    }
  }

  splash(p, grid, cell, skip) {
    const r = p.splash;
    this.burst(p.x, 0.6, p.z, p.color, 6, 5, 0.12);
    if (r > 1.5) { this.sound.boom(); this.burst(p.x, 0.6, p.z, 0xffffff, 4, 6, 0.08); }
    const cx = Math.floor(p.x / cell), cz = Math.floor(p.z / cell);
    const n = Math.ceil(r / cell);
    for (let ox = -n; ox <= n; ox++) for (let oz = -n; oz <= n; oz++) {
      const b = grid.get(((cx + ox + 64) << 10) | (cz + oz + 512));
      if (!b) continue;
      for (const e of b) {
        if (e === skip || e.hp <= 0) continue;
        const dx = p.x - e.x, dz = p.z - e.z;
        if (dx * dx + dz * dz < r * r) {
          const falloff = 1 - Math.hypot(dx, dz) / r;
          this.damageEnemy(e, p.dmg * (0.2 + 0.4 * falloff));
          e.kb = Math.min(0.4, e.kb + 0.12 / e.mass);
        }
      }
    }
  }

  damageEnemy(e, d, p) {
    if (e.hp <= 0) return;
    e.hp -= d;
    e.flash = 0.1;
    if (p && !e.isBoss) e.kb = Math.min(e.kb + 0.9 / e.mass, 4);
    this.sound.hit();
    if (e.isBoss && e.hp <= 0 && !this.bossDefeated) {
      this.bossDefeated = true;
      this.boss = null;
      this.ui.bossBar.classList.add('hidden');
      this.kills++;
      this.registerCombo();
      this.resolved++;
      this.earned += 50; this.save.coins += 50;
      this.sound.crack();
      this.shake = 1.2;
      for (let i = 0; i < 4; i++) this.burst(e.x, 1.5, e.z, [0x8e1717, 0xffd23a, 0xf4ead5, 0x3a2a20][i], 18, 8, 0.22);
      this.floatText('+50', e.x, 3, e.z, 'coin');
      this.dying.push({ type: e.type, boss: e.bossIdx, x: e.x, y: 0, z: e.z, vx: 0, vy: 7, vz: -4, rx: 0, spin: -5, t: 0, phase: e.phase, scale: e.scale });
    }
  }

  killEnemy(i) {
    const e = this.enemies[i];
    this.enemies[i] = this.enemies[this.enemies.length - 1];
    this.enemies.pop();
    this.kills++;
    this.registerCombo();
    this.resolved++;
    const c = ETYPES[e.type].coin;
    this.earned += c; this.save.coins += c;
    this.pushDying(e, 1);
    this.sound.pop();
  }

  pushDying(e, force) {
    if (this.dying.length > 260) this.dying.shift();
    this.dying.push({
      type: e.type, x: e.x, y: e.y, z: e.z,
      vx: (Math.random() - 0.5) * 3 * force, vy: 3 + Math.random() * 3, vz: -(2 + Math.random() * 3) * force,
      rx: 0, spin: -(6 + Math.random() * 8), t: 0, phase: e.phase, scale: ETYPES[e.type].scale, fly: e.fly,
    });
    const col = { imp: 0xc7332a, hyena: 0xc3a06a, brute: 0x5a4841, vulture: 0x3b302b }[e.type];
    this.burst(e.x, e.y + 0.6, e.z, col, 4, 3);
  }

  frontBlocker(lane) {
    for (const it of lane.items) {
      if (!it.alive) continue;
      if (it.kind === 'gate' && (!upgradeAvailable(it, this.elapsed, this.waveIdx) || it.z < REVEAL_Z)) return null;
      if (it.kind === 'gate' || it.kind === 'guardian') return it;
    }
    return null;
  }

  damageBlocker(lane, it, p) {
    if (it.kind === 'gate' && (!upgradeAvailable(it, this.elapsed, this.waveIdx) || it.reveal < 0.5)) return;
    it.hp -= p.dmg;
    it.hit = 0.1;
    this.sound.thud();
    if (Math.random() < 0.4) this.burst(p.x, 1.0, it.z + it.halfDepth, it.kind === 'guardian' ? 0xd8a86a : 0xb3a699, 2, 3, 0.08);
    if (it.hp <= 0 && it.alive) {
      it.alive = false;
      this.shake = 0.8;
      this.sound.crack();
      const x = lane.x;
      for (let k = 0; k < 3; k++) this.burst(x, 1, it.z, [0x938679, 0xb3a699, 0xffd23a][k], 16, 7, 0.2);
      if (it.kind === 'gate') {
        if (it.tier > this.tier) {
          this.tier = it.tier;
          this.slingMesh.geometry = this.slingGeos[this.tier];
          this.ui.banner(WEAPONS[this.tier].name + ' !', 'Dégâts ×' + WEAPONS[this.tier].dmg + (WEAPONS[this.tier].splash ? ' · explosion' : ''));
          this.sound.upgrade();
          for (const k of this.kids) this.burst(k.x, 1.3, k.z, 0xffd23a, 1, 3, 0.08);
        }
      } else {
        this.earned += 30; this.save.coins += 30;
        this.floatText('+30', x, 4, it.z, 'coin');
        this.ui.banner('Gardien vaincu !', 'Les renforts arrivent');
        this.sound.upgrade();
      }
      this.disposeItem(it);
      lane.items.splice(lane.items.indexOf(it), 1);
    }
  }

  updateLane(lane, dt) {
    let limit = Infinity;
    for (let i = 0; i < lane.items.length; i++) {
      const it = lane.items[i];
      if (it.kind === 'gate' && !upgradeAvailable(it, this.elapsed, this.waveIdx)) {
        limit = it.z - it.halfDepth - 0.6;
        it.mesh.visible = false;
        continue;
      }
      if (it.kind === 'gate' || it.kind === 'guardian') {
        const stop = MOUTH_Z - it.halfDepth;
        it.z = Math.min(it.z + CONVEYOR_SPEED * dt, stop, limit - it.halfDepth);
        limit = it.z - it.halfDepth - 0.6;
        const sh = it.hit > 0 ? (Math.random() - 0.5) * 0.14 : 0;
        if (it.kind === 'gate') {
          if (it.z >= REVEAL_Z) {
            if (!it.reveal) this.burst(lane.x, 0.12, it.z, 0xd9bc87, 14, 3.5, 0.11, 8);
            it.reveal = Math.min(1, (it.reveal || 0) + dt / 0.65);
          }
          it.mesh.visible = it.reveal > 0;
          it.mesh.position.set(lane.x + sh, -3.2 * (1 - emergence(it.reveal)), it.z);
          it.icon.rotation.y += dt * 1.8;
          it.icon.position.y = 1.9 + Math.sin(this.time * 3) * 0.12;
        } else {
          it.mesh.position.set(lane.x + sh, 0, it.z);
          it.mesh.rotation.y = Math.sin(this.time * 1.3) * 0.1;
          it.mesh.material.emissive.setRGB(it.hit > 0 ? 0.35 : 0, it.hit > 0 ? 0.18 : 0, 0);
        }
        it.hit = Math.max(0, (it.hit || 0) - dt);
        if (it.label) it.label.textContent = fmt(it.hp);
      } else {
        it.z = Math.min(it.z + CONVEYOR_SPEED * dt, limit - TILE_GAP);
        if (it.z >= REVEAL_Z) it.reveal = Math.min(1, (it.reveal || 0) + dt / 0.45);
        limit = it.z - TILE_GAP;
        if (!it.collected && it.z > ARMY_Z - this.army.r * 0.7 - 0.3 && it.z < ARMY_Z + 1.5) {
          if (Math.abs(this.army.x - lane.x) < 1.3 + this.army.r * 0.5) this.collect(lane, it);
        }
        if (it.collected) { it.scale *= Math.pow(0.02, dt); it.y += dt * 4; }
        if (it.z > 9 || it.scale < 0.05) it.dead = true;
      }
    }
    for (let i = lane.items.length - 1; i >= 0; i--) {
      if (lane.items[i].dead) { this.disposeItem(lane.items[i]); lane.items.splice(i, 1); }
    }
  }

  collect(lane, it) {
    it.collected = true;
    const x = lane.x;
    if (it.kind === 'boost') {
      if (it.boost === 'rate') { this.rateMult *= 1.2; this.ui.banner('CADENCE +20%', ''); }
      else { this.dmgMult *= 1.2; this.ui.banner('FORCE +20%', ''); }
      this.sound.upgrade();
      this.burst(this.army.x, 1, ARMY_Z, 0x7dff8a, 18, 6, 0.12);
      return;
    }
    this.addUnits(it.value, x, it.z);
    this.floatText('+' + it.value, x, 1.6, it.z, it.kind === 'big' ? 'big' : 'plus');
    this.burst(x, 0.9, it.z, it.kind === 'big' ? 0xffd23a : 0x4fb3ff, it.kind === 'big' ? 10 : 6, 4, 0.09);
    if (it.kind === 'big') this.sound.big(); else this.sound.collect(this.army.count);
  }

  spawnWave(w) {
    // Reserve every requested enemy; bounded active pools never discard recruits.
    this.reinforcements.push({ wave: w, remaining: w.n });
    if (w.mix.hyena && this.waveIdx > 0) this.sound.laugh();
    if (w.mix.brute) this.sound.roar();
    if (w.boss) {
      const B = this.bossDef;
      const bi = BOSSES.indexOf(B);
      this.boss = {
        type: B.type, isBoss: true, bossIdx: bi, x: 0, y: 0, z: SPAWN_Z + 1.5, hp: w.boss, maxHp: w.boss,
        flash: 0, speed: B.speed, phase: 0, atk: 0, scale: B.scale, r: 0.42 * B.scale, kb: 0, mass: 99,
      };
      this.ui.banner(B.name + ' arrive !', 'Tiens bon au milieu');
      this.ui.bossBar.classList.remove('hidden');
      this.sound.boss?.();
      this.sound.roar();
    } else if (this.waveIdx === 0) {
      this.ui.banner('La horde arrive !', 'Vise le couloir du milieu');
    }
  }

  updateReinforcements(dt) {
    if (!this.reinforcements.length) { this.spawnClock = 0; return; }
    this.spawnClock -= dt;
    if (this.spawnClock > 0) return;
    // Give early recruits time to arrive before the sustained late-wave assault.
    this.spawnClock = this.waveIdx < 3 ? 0.28 : 0.06;
    const counts = {};
    for (const e of this.enemies) counts[e.type] = (counts[e.type] || 0) + 1;
    const batch = this.reinforcements[0], w = batch.wave;
    for (let col = 0; col < (this.waveIdx < 3 ? 6 : 18) && batch.remaining > 0; col++) {
      const type = pick(w.mix), T = ETYPES[type];
      if ((counts[type] || 0) >= T.max) break;
      counts[type] = (counts[type] || 0) + 1;
      this.enemies.push({
        type, fly: !!T.fly, r: T.r, mass: T.hp > 2 ? 3 : 1, power: T.power, scale: T.scale,
        x: ((col % 6) - 2.5) * 0.5 + (Math.random() - 0.5) * 0.2,
        z: (this.waveIdx < 3 ? SPAWN_Z : -32) - Math.floor(col / 6) * 0.6 - Math.random() * 0.3,
        y: T.fly ? 2.4 : 0, hp: w.hp * T.hp, flash: 0, kb: 0, vx: 0, vz: 0,
        phase: Math.random() * 6.28, speed: T.speed * (0.92 + Math.random() * 0.16),
        ox: Math.random() - 0.5, oz: Math.random() - 0.5,
      });
      batch.remaining--;
    }
    if (!batch.remaining) this.reinforcements.shift();
  }

  updateEnemies(dt) {
    const ax = this.army.x, ar = this.army.r;
    const E = this.enemies;
    // separation: enemies push each other apart so the horde reads as a crowd
    const grid = this.grid, cell = this.cell;
    for (const e of E) {
      if (e.fly) continue;
      const cx = Math.floor(e.x / cell), cz = Math.floor(e.z / cell);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const b = grid.get(((cx + ox + 64) << 10) | (cz + oz + 512));
        if (!b) continue;
        for (const o of b) {
          if (o === e || o.fly) continue;
          const dx = e.x - o.x, dz = e.z - o.z, rr = (e.r + o.r) * 0.85;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && d2 > 1e-6) {
            const d = Math.sqrt(d2), push = (rr - d) * 0.5 * Math.min(1, dt * 12) / d;
            const wE = o.mass / (e.mass + o.mass);
            e.x += dx * push * wE * 2; e.z += dz * push * wE * 2;
          }
        }
      }
    }
    let hits = [];
    for (let i = E.length - 1; i >= 0; i--) {
      const e = E[i];
      e.flash = Math.max(0, e.flash - dt);
      e.kb = Math.max(0, e.kb - dt * 6);
      let sp;
      if (e.z < MOUTH_Z) {
        e.vx = lerp(e.vx, 0, dt * 3);
        e.vz = lerp(e.vz, e.speed, dt * 4);
        e.x = clamp(e.x + e.vx * dt, -1.45, 1.45);
        e.z += (e.vz - e.kb * 2.5) * dt;
      } else {
        const tx = ax + e.ox * ar, tz = ARMY_Z + e.oz * ar * 0.6;
        const dx = tx - e.x, dz = tz - e.z;
        const l = Math.hypot(dx, dz) || 1;
        const s = e.speed * 1.2;
        e.vx = lerp(e.vx, (dx / l) * s, Math.min(1, dt * 5));
        e.vz = lerp(e.vz, (dz / l) * s, Math.min(1, dt * 5));
        e.x += e.vx * dt;
        e.z += (e.vz - e.kb * 2.5) * dt;
        const cx = e.x - ax, cz = e.z - ARMY_Z;
        const reach = ar + e.r * 0.4;
        if (cx * cx + cz * cz < reach * reach && this.army.count > 0) {
          hits.push([e.power, e.x, e.z]);
          this.resolved++;
          this.pushDying(e, -0.6);
          E[i] = E[E.length - 1];
          E.pop();
          continue;
        }
      }
      sp = Math.hypot(e.vx, e.vz);
      e.phase += dt * ETYPES[e.type].freq * clamp(sp / e.speed, 0.4, 1.3);
      if (e.fly) e.y = 2.3 + Math.sin(e.phase * 0.35) * 0.25;
    }
    for (const [p, x, z] of hits) this.loseUnits(p, x, z);
    const b = this.boss;
    if (b) {
      b.flash = Math.max(0, b.flash - dt);
      b.phase += dt * ETYPES[b.type].freq * 0.55;
      if (b.z < MOUTH_Z) { b.z += b.speed * dt; b.vx = 0; b.vz = b.speed; }
      else {
        const dx = ax - b.x, dz = ARMY_Z - b.z;
        const d = Math.hypot(dx, dz);
        const reach = ar + b.r * 0.8;
        if (d > reach) {
          b.x += (dx / d) * b.speed * 1.3 * dt;
          b.z += (dz / d) * b.speed * 1.3 * dt;
        } else {
          b.atk -= dt;
          if (b.atk <= 0) {
            b.atk = 0.55;
            this.shake = Math.max(this.shake, 0.45);
            this.sound.boom();
            const hx = b.x + dx * 0.6, hz = b.z + dz * 0.6;
            this.burst(hx, 0.3, hz, 0xcf8a52, 12, 5, 0.13);
            this.loseUnits(3 + Math.floor(this.level.L * 0.8), hx, hz);
          }
        }
      }
      this.ui.bossFill.style.width = (100 * Math.max(0, b.hp) / b.maxHp) + '%';
    }
    // dying bodies
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      d.vy -= 18 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.rx += d.spin * dt;
      if (d.y < 0 && !d.fly) { d.y = 0; d.vy *= -0.25; d.vx *= 0.5; d.vz *= 0.5; d.spin *= 0.4; }
      if (d.t > (d.boss !== undefined ? 1.6 : 0.8)) this.dying.splice(i, 1);
    }
  }

  updateGuardian(dt) {
    const lane = this.lanes[1];
    const g = lane.items.find((it) => it.kind === 'guardian');
    if (!g) return;
    this.guardianCd -= dt;
    if (this.guardianCd <= 0) {
      this.guardianCd = 2.6;
      if (this.army.x > 1.6 && this.army.count > 0) {
        const tx = this.army.x, tz = ARMY_Z;
        const mesh = new THREE.Mesh(this.rockGeo, this.rockMat);
        mesh.castShadow = true;
        const ring = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2), this.ringMat);
        ring.position.set(tx, 0.05, tz);
        this.scene.add(mesh, ring);
        this.rocks.push({ mesh, ring, sx: lane.x, sz: g.z + 0.5, tx, tz, t: 0, dur: 1.25 });
      }
    }
  }

  updateRocks(dt) {
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      r.mesh.position.set(lerp(r.sx, r.tx, k), 4.5 + Math.sin(k * Math.PI) * 5 - k * 4.5, lerp(r.sz, r.tz, k));
      r.mesh.rotation.x += dt * 6;
      r.ring.material.opacity = 0.5 + 0.5 * Math.sin(r.t * 20);
      r.ring.scale.setScalar(0.7 + k * 0.3);
      if (k >= 1) {
        this.scene.remove(r.mesh, r.ring);
        r.ring.geometry.dispose();
        this.rocks.splice(i, 1);
        this.shake = Math.max(this.shake, 0.6);
        this.sound.boom();
        this.burst(r.tx, 0.4, r.tz, 0x8b7d6b, 14, 7, 0.18);
        this.burst(r.tx, 0.2, r.tz, 0xcf8a52, 10, 5, 0.13);
        let hit = 0;
        for (const kid of this.kids) {
          const dx = kid.x - r.tx, dz = kid.z - r.tz;
          if (dx * dx + dz * dz < 1.7 * 1.7) { hit++; kid.vy = 5; }
        }
        const mult = this.army.count / Math.max(1, this.kids.length);
        if (hit) this.loseUnits(Math.ceil(hit * mult * 0.5), r.tx, r.tz);
      }
    }
  }

  // ---------------------------------------------------------------- bot
  botThink() {
    const lanes = this.lanes;
    const threat = this.enemies.some((e) => e.z > -7) || (this.boss && this.boss.z > -18);
    const leftBlock = this.frontBlocker(lanes[0]);
    const leftTiles = lanes[0].items.some((it) => it.kind !== 'gate' && !it.collected && it.z > -20);
    const guardian = lanes[1].items.find((it) => it.kind === 'guardian');
    const rightTiles = lanes[1].items.some((it) => it.kind === 'big' && !it.collected);
    let tx = 0;
    if (threat) tx = 0;
    else if (leftBlock || leftTiles) tx = LANES.left;
    else if (guardian && this.tier >= 3) tx = LANES.right - 0.8;
    else if (!guardian && rightTiles) tx = LANES.right;
    if (this.enemies.filter((e) => e.z > -10).length > 8 || (this.boss && this.boss.z > -10)) this.activateAbility();
    this.army.targetX = tx;
    this.moved = 999;
  }

  // ---------------------------------------------------------------- hud
  updateHud(force) {
    const u = this.ui;
    if (force || this._c !== this.army.count) { this._c = this.army.count; u.count.textContent = fmt(this.army.count); }
    if (force || this._coins !== this.save.coins) { this._coins = this.save.coins; u.coins.textContent = fmt(this.save.coins); }
    if (force || this._lvl !== this.level.L) { this._lvl = this.level.L; u.level.textContent = 'Niveau ' + this.level.L; }
    const nextWave = this.level.waves[this.waveIdx];
    const threatCount = this.enemies.reduce((n, e) => n + (e.z > -8 ? 1 : 0), 0);
    u.updateCombat?.({ enemyCount: this.enemies.length, threatCount, threatLevel: clamp(threatCount / 30, 0, 1), kills: this.kills, combo: this.combo, bestCombo: this.bestCombo, wave: this.waveIdx, waves: this.level.waves.length, nextWave: nextWave ? Math.max(0, Math.ceil(nextWave.t - this.time)) : null, abilityReady: this.ability.cooldown <= 0, abilityCooldown: Math.ceil(this.ability.cooldown), abilityActive: this.ability.duration > 0, abilityProgress: 1 - this.ability.cooldown / this.ability.totalCooldown, elapsed: this.elapsed, peakArmy: this.peakArmy });
    this.sound.setIntensity?.(this.boss ? 1 : Math.min(0.85, this.enemies.length / 100));
    u.progress.style.width = (Math.min(1, this.resolved / this.totalEnemies) * 100) + '%';
  }

  // ---------------------------------------------------------------- render
  render(dt) {
    const t = performance.now() / 1000;
    this.gtime.value = t;
    this.renderKids();
    this.renderEnemies();
    this.renderTiles(t);
    this.renderFx(dt);
    this.renderAmbient(t, dt);

    // camera: shake, sideways follow, pull back as the troop grows
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const s = this.shake * this.shake * 0.4;
    const follow = this.w < this.h ? 0.5 : 0.25;
    this.camX = lerp(this.camX || 0, this.army.x * follow, Math.min(1, dt * 5));
    this.camZoom = lerp(this.camZoom || 0, Math.max(0, this.army.r - 1.2) * 1.6, Math.min(1, dt * 2));
    const cz = this.camZoom;
    this.camera.position.set(this.camBase.x + this.camX + (Math.random() - 0.5) * s, this.camBase.y + this.camDir.y * cz + (Math.random() - 0.5) * s, this.camBase.z + this.camDir.z * cz);
    tmpV.copy(this.camTarget); tmpV.x += this.camX;
    this.camera.lookAt(tmpV);
    // keep the shadow frustum centred on the action
    this.sun.position.set(9 + this.camX, 18, 7);
    this.sun.target.position.set(this.camX, 0, -8);

    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  }

  renderKids() {
    const km = this.kidMesh, sm = this.slingMesh;
    const { phase, amt, shot } = km.userData;
    let n = 0;
    for (const k of this.kids) {
      const sc = k.s * KID_SCALE;
      setInst(km, n, k.x, k.y, k.z + k.recoil * 0.06, -k.recoil * 0.12, 0, k.lean, sc);
      setInst(sm, n, k.x, k.y, k.z + k.recoil * 0.06, -k.recoil * 0.12, 0, k.lean, sc);
      phase.array[n] = k.phase;
      amt.array[n] = k.y > 0 ? 1 : k.anim;
      shot.array[n * 2] = k.draw || 0;
      shot.array[n * 2 + 1] = k.recoil * (1 - (k.draw || 0));
      n++;
    }
    sm.count = n;
    for (const d of this.dyingKids) {
      const sc = KID_SCALE * (d.t > 0.8 ? Math.max(0.01, 1 - (d.t - 0.8) / 0.3) : 1);
      setInst(km, n, d.x, d.y, d.z, d.rx, 0, d.rz, sc);
      phase.array[n] = d.phase; amt.array[n] = 1;
      shot.array[n * 2] = shot.array[n * 2 + 1] = 0;
      n++;
    }
    km.count = n;
    km.instanceMatrix.needsUpdate = sm.instanceMatrix.needsUpdate = true;
    phase.needsUpdate = amt.needsUpdate = shot.needsUpdate = true;
  }

  renderEnemies() {
    const counts = {};
    for (const k of TYPE_KEYS) counts[k] = 0;
    const put = (e, ry, rx, sc, flash) => {
      const m = this.enemyMeshes[e.type];
      const i = counts[e.type]++;
      if (i >= m.instanceMatrix.count) return;
      setInst(m, i, e.x, e.y, e.z, rx, ry, 0, sc);
      m.userData.phase.array[i] = e.phase;
      m.userData.amt.array[i] = 1;
      const f = flash ? 2.6 : 1;
      m.setColorAt(i, tmpC.setRGB(f, f, f));
    };
    for (const e of this.enemies) {
      const ry = e.z > MOUTH_Z ? Math.atan2(e.vx, e.vz) : 0;
      put(e, ry, e.fly ? 0.15 : Math.min(0.25, e.kb * 0.1) * -1, e.scale, e.flash > 0);
    }
    for (const d of this.dying) {
      if (d.boss !== undefined) continue;
      const sc = d.scale * (d.t > 0.55 ? Math.max(0.01, 1 - (d.t - 0.55) / 0.25) : 1);
      put(d, 0, d.rx, sc, false);
    }
    for (const k of TYPE_KEYS) {
      const m = this.enemyMeshes[k];
      m.count = Math.min(counts[k], m.instanceMatrix.count);
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
      m.userData.phase.needsUpdate = m.userData.amt.needsUpdate = true;
    }
    // boss
    this.bossMeshes.forEach((m) => { m.count = 0; });
    const b = this.boss;
    const db = this.dying.find((d) => d.boss !== undefined);
    const draw = (x, y, z, rx, ry, sc, idx, ph, flash) => {
      const m = this.bossMeshes[idx];
      setInst(m, 0, x, y, z, rx, ry, 0, sc);
      m.userData.phase.array[0] = ph; m.userData.amt.array[0] = 1;
      const f = flash ? 2.2 : 1;
      m.setColorAt(0, tmpC.setRGB(f, f, f));
      m.count = 1;
      m.instanceMatrix.needsUpdate = m.instanceColor.needsUpdate = true;
      m.userData.phase.needsUpdate = m.userData.amt.needsUpdate = true;
    };
    if (b) draw(b.x, 0, b.z, 0, b.z > MOUTH_Z ? Math.atan2(this.army.x - b.x, ARMY_Z - b.z) : 0, b.scale, b.bossIdx, b.phase, b.flash > 0);
    if (db) draw(db.x, db.y, db.z, db.rx, 0, db.scale * Math.max(0.01, 1 - Math.max(0, db.t - 1.2) / 0.4), db.boss, db.phase, false);
  }

  renderTiles(t) {
    for (const m of Object.values(this.tileMeshes)) m.userData.n = 0;
    for (const lane of this.lanes) {
      for (const it of lane.items) {
        if (!it.tmesh || it.z < REVEAL_Z || !it.reveal) continue;
        const m = it.tmesh;
        const i = m.userData.n++;
        if (i >= 90) continue;
        const bob = Math.sin(t * 3 + it.bob) * 0.08;
        const rise = emergence(it.reveal);
        const sc = it.scale * (it.kind === 'boost' ? 1.15 : 1) * (0.7 + rise * 0.3);
        setInst(m, i, lane.x, it.y + bob - (1 - rise) * 1.5, it.z, -0.5, Math.sin(t * 2 + it.bob) * 0.12, 0, sc);
      }
    }
    for (const m of Object.values(this.tileMeshes)) {
      m.count = Math.min(90, m.userData.n);
      m.instanceMatrix.needsUpdate = true;
    }
  }

  renderFx(dt) {
    this.abilityPulse = Math.max(0, this.abilityPulse - dt);
    this.abilityRing.visible = this.abilityPulse > 0;
    if (this.abilityPulse > 0) {
      const phase = 1 - this.abilityPulse / 0.65;
      this.abilityRing.position.set(this.abilityX, 0.09, ARMY_Z);
      this.abilityRing.scale.setScalar(0.5 + phase * 12);
      this.abilityRing.material.opacity = (1 - phase) * 0.85;
    }
    const pm = this.projMesh;
    for (let i = 0; i < this.proj.length; i++) {
      const p = this.proj[i];
      const yaw = Math.atan2(p.vx, p.vz);
      setInst(pm, i, p.x, p.y, p.z, 0, yaw, 0, p.size, p.size, p.size * 2.0);
      pm.setColorAt(i, tmpC.set(p.color));
    }
    pm.count = this.proj.length;
    pm.instanceMatrix.needsUpdate = true;
    if (pm.instanceColor) pm.instanceColor.needsUpdate = true;

    const P = this.parts, qm = this.partMesh;
    let n = 0;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.t += dt;
      if (q.t >= q.life) { P[i] = P[P.length - 1]; P.pop(); continue; }
      q.vy -= q.grav * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.05) { q.y = 0.05; q.vy *= -0.3; q.vx *= 0.7; q.vz *= 0.7; }
      const s = q.size * (1 - q.t / q.life);
      setInst(qm, n, q.x, q.y, q.z, q.rot + q.t * 8, q.rot, 0, s);
      qm.setColorAt(n, tmpC.set(q.color));
      n++;
    }
    qm.count = n;
    qm.instanceMatrix.needsUpdate = true;
    if (qm.instanceColor) qm.instanceColor.needsUpdate = true;
  }

  renderAmbient(t, dt) {
    for (const c of this.clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > 110) c.position.x = -110;
    }
    const bm = this.birds;
    for (let i = 0; i < 8; i++) {
      const a = t * 0.25 + i * 0.8;
      const rad = 14 + (i % 3) * 5;
      const x = Math.cos(a) * rad, z = -45 + Math.sin(a) * rad * 0.6;
      setInst(bm, i, x, 13 + (i % 4) * 2 + Math.sin(t + i) * 0.5, z, 0, Math.atan2(-Math.sin(a), Math.cos(a) * 0.6), 0, 1.3);
      this.birdPhase.array[i] = t * 7 + i;
    }
    bm.instanceMatrix.needsUpdate = true;
    this.birdPhase.needsUpdate = true;
    for (const f of this.flames) {
      const k = 1 + Math.sin(t * 17 + f.seed) * 0.12 + Math.sin(t * 29 + f.seed * 2) * 0.08;
      f.f.scale.set(k, k * 1.6, k);
      f.core.scale.set(k, k * 1.3, k);
      f.g.material.opacity = 0.65 + Math.sin(t * 13 + f.seed) * 0.15;
    }
    const dp = this.dust.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      let y = dp.getY(i) + dt * 0.15;
      if (y > 6) y = 0;
      dp.setY(i, y);
      dp.setX(i, dp.getX(i) + Math.sin(t * 0.5 + i) * dt * 0.1);
    }
    dp.needsUpdate = true;
    if (this.guardian.visible) this.guardian.scale.y = 1 + Math.sin(t * 2) * 0.015;
  }

  updateLabels() {
    for (const lane of this.lanes) {
      for (const it of lane.items) {
        if (!it.label) continue;
        const y = it.kind === 'guardian' ? 1.3 : 0.5;
        const p = this.project(lane.x, y, it.z + it.halfDepth + 0.1);
        it.label.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
        it.label.style.opacity = it.kind === 'gate' ? (it.mesh.visible ? Math.min(1, (it.reveal || 0) * 2) : 0) : (it.z > -30 ? 1 : 0);
      }
    }
    const p = this.project(this.army.x, 1.6 + this.army.r * 0.4, ARMY_Z - this.army.r);
    this.ui.bubble.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
  }
}
