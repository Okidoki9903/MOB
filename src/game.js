import * as THREE from 'three';
import {
  kidGeometry, slingshotGeometry, fetishGeometry, guardianGeometry, plinthGeometry,
  wallsGeometry, decorGeometry, groundTexture, tileTexture, glowTexture, shadowTexture, ringTexture,
} from './models.js';
import { Sound } from './audio.js';

// ------------------------------------------------------------------ layout
const LANES = { left: -4.2, mid: 0, right: 4.2 };
const LANE_HW = 1.72;          // half width of a corridor
const WALLS = [-6.35, -2.1, 2.1, 6.35];
const MOUTH_Z = -11;           // where corridors open onto the plaza
const ARMY_Z = 0;
const SPAWN_Z = -58;
const FAR_Z = -95;
const ARMY_LIMIT = 5.5;
const MAX_KIDS = 120;
const MAX_ENEMIES = 360;
const MAX_PROJ = 1600;
const MAX_PART = 700;
const CONVEYOR_SPEED = 4.2;
const KID_SCALE = 1.35;
const KID_SPACING = 0.37;
const TILE_GAP = 0.55; // half spacing between tiles on a conveyor

export const WEAPONS = [
  { name: 'Lance-pierre', dmg: 1, rate: 1.25, splash: 0, stone: 0x9e958a, size: 0.09, speed: 26 },
  { name: 'Lance-pierre renforcé', dmg: 2, rate: 1.45, splash: 0, stone: 0x7e8ea0, size: 0.1, speed: 28 },
  { name: "Lance-pierre d'or", dmg: 3.5, rate: 1.65, splash: 0, stone: 0xffd23a, size: 0.11, speed: 30 },
  { name: 'Pierres de feu', dmg: 6, rate: 1.85, splash: 0.9, stone: 0xff6a1f, size: 0.13, speed: 30 },
  { name: 'Calebasse tonnerre', dmg: 13, rate: 1.3, splash: 1.9, stone: 0xffa21f, size: 0.17, speed: 24 },
];

export const UPGRADES = {
  recruits: { label: 'Recrues', desc: '+1 enfant au départ', base: 40, grow: 1.55, max: 30 },
  power: { label: 'Force', desc: '+15% de dégâts', base: 50, grow: 1.5, max: 40 },
  rate: { label: 'Cadence', desc: '+8% de tirs', base: 60, grow: 1.55, max: 30 },
};

export function upgradeCost(key, lvl) {
  const u = UPGRADES[key];
  return Math.round(u.base * Math.pow(u.grow, lvl));
}

// ------------------------------------------------------------------ levels
export function makeLevel(L) {
  const n = L - 1;
  const e = Math.pow(1.24, n);       // enemy toughness
  const tv = 1 + Math.floor(n / 3);  // value of the +N recruit tiles
  const left = [];
  const gate = (tier, hp) => left.push({ kind: 'gate', tier, hp: Math.round(hp) });
  const tiles = (k, v) => { for (let i = 0; i < k; i++) left.push({ kind: 'tile', value: v }); };
  const boost = (b) => left.push({ kind: 'boost', boost: b });
  // early gates scale gently so a run can always get going; late ones bite
  gate(1, 3 + n); tiles(6, tv);
  gate(2, 30 * (1 + 0.3 * n)); tiles(8, tv); boost('rate');
  gate(3, 150 * Math.pow(1.2, n)); tiles(10, tv); boost('dmg');
  gate(4, 600 * Math.pow(1.26, n)); tiles(12, tv); boost('rate'); tiles(12, tv + 1);
  const bigVal = Math.round(30 * Math.pow(1.18, n));
  const right = [{ kind: 'guardian', hp: Math.round(1800 * Math.pow(1.27, n)) }];
  for (let i = 0; i < 7; i++) right.push({ kind: 'big', value: bigVal });
  const waves = [
    { t: 4, n: 8 + L, hp: 1.5 * e },
    { t: 16, n: 16 + 2 * L, hp: 4 * e },
    { t: 29, n: 28 + 3 * L, hp: 9 * e },
    { t: 43, n: 40 + 4 * L, hp: 16 * e },
    { t: 58, n: 30 + 4 * L, hp: 24 * e, boss: Math.round(5000 * Math.pow(1.3, n)) },
  ];
  return { left, right, waves, L };
}

// ------------------------------------------------------------------ helpers
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function setInst(mesh, i, x, y, z, ry, s, sy = s) {
  tmpQ.setFromAxisAngle(UP, ry);
  tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(s, sy, s));
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

// ================================================================== Game
export class Game {
  constructor(container, ui, opts = {}) {
    this.container = container;
    this.ui = ui;
    this.opts = opts;
    this.sound = new Sound();
    this.state = 'menu';
    this.timeScale = opts.speed || 1;
    this.save = this.loadSave();
    this.initRenderer();
    this.initScene();
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
      if (s && s.up) return { ...def, ...s, up: { ...def.up, ...s.up } };
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
    r.toneMappingExposure = 1.05;
    this.container.appendChild(r.domElement);
    this.renderer = r;
  }

  initScene() {
    const scene = new THREE.Scene();
    this.scene = scene;
    const sky = new THREE.Color(0xf4c58e);
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, 38, 92);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 200);

    scene.add(new THREE.HemisphereLight(0xfff0d6, 0xb06a3a, 1.25));
    const sun = new THREE.DirectionalLight(0xffe2b0, 2.0);
    sun.position.set(6, 12, 6);
    scene.add(sun);

    // ground
    const gt = groundTexture();
    gt.repeat.set(10, 36);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 250), new THREE.MeshLambertMaterial({ map: gt }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -60;
    scene.add(ground);
    // corridor floors (slightly lighter packed earth)
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xe8b886, map: gt });
    for (const x of Object.values(LANES)) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(LANE_HW * 2, MOUTH_Z - FAR_Z), floorMat);
      f.rotation.x = -Math.PI / 2;
      f.position.set(x, 0.01, (MOUTH_Z + FAR_Z) / 2);
      scene.add(f);
    }
    const vmat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.vmat = vmat;
    scene.add(new THREE.Mesh(wallsGeometry(WALLS, MOUTH_Z, FAR_Z), vmat));
    scene.add(new THREE.Mesh(decorGeometry(11), vmat));

    // instanced actors
    this.kidMesh = new THREE.InstancedMesh(kidGeometry(), vmat, MAX_KIDS);
    this.kidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.kidMesh.count = 0;
    this.kidMesh.frustumCulled = false;
    for (let i = 0; i < MAX_KIDS; i++) {
      const v = 0.85 + Math.random() * 0.3;
      this.kidMesh.setColorAt(i, tmpC.setRGB(v, v, v));
    }
    scene.add(this.kidMesh);
    this.slingGeos = WEAPONS.map((_, i) => slingshotGeometry(i));
    this.slingMesh = new THREE.InstancedMesh(this.slingGeos[0], vmat, MAX_KIDS);
    this.slingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.slingMesh.count = 0;
    this.slingMesh.frustumCulled = false;
    scene.add(this.slingMesh);

    this.enemyMesh = new THREE.InstancedMesh(fetishGeometry(false), vmat, MAX_ENEMIES);
    this.enemyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyMesh.count = 0;
    this.enemyMesh.frustumCulled = false;
    for (let i = 0; i < MAX_ENEMIES; i++) this.enemyMesh.setColorAt(i, tmpC.setRGB(1, 1, 1));
    scene.add(this.enemyMesh);

    this.bossMesh = new THREE.Mesh(fetishGeometry(true), vmat.clone());
    this.bossMesh.material.emissive = new THREE.Color(0x000000);
    this.bossMesh.visible = false;
    scene.add(this.bossMesh);

    this.guardian = new THREE.Mesh(guardianGeometry(), vmat.clone());
    this.guardian.material.emissive = new THREE.Color(0x000000);
    scene.add(this.guardian);

    this.plinthGeo = plinthGeometry();

    // soft blob shadows
    const shMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
    const shGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.shadowMesh = new THREE.InstancedMesh(shGeo, shMat, MAX_KIDS + MAX_ENEMIES);
    this.shadowMesh.frustumCulled = false;
    this.shadowMesh.renderOrder = 1;
    scene.add(this.shadowMesh);

    // projectiles
    const pg = new THREE.IcosahedronGeometry(1, 1);
    this.projMesh = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x222222 }), MAX_PROJ);
    this.projMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projMesh.frustumCulled = false;
    this.projMesh.count = 0;
    this.projMesh.setColorAt(0, tmpC.set(0xffffff));
    scene.add(this.projMesh);

    // particles
    this.partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_PART);
    this.partMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.partMesh.frustumCulled = false;
    this.partMesh.count = 0;
    this.partMesh.setColorAt(0, tmpC.set(0xffffff));
    scene.add(this.partMesh);
    this.parts = [];

    // glow sprite material for upgrades on plinths
    this.glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

    // tile materials
    const side = (c) => new THREE.MeshLambertMaterial({ color: c });
    this.tileGeo = new THREE.BoxGeometry(2.7, 0.14, 1.0);
    this.tileMats = {};
    this.tileMatFor = (kind, label) => {
      const key = kind + label;
      if (!this.tileMats[key]) {
        const sideC = { recruit: 0x1d5fd6, big: 0xe09a0a, boost: 0x1faa4a }[kind];
        const top = new THREE.MeshBasicMaterial({ map: tileTexture(label, kind) });
        this.tileMats[key] = [side(sideC), side(sideC), top, side(sideC), side(sideC), side(sideC)];
      }
      return this.tileMats[key];
    };

    // telegraphed boulder ring
    this.ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false });
    this.rocks = [];
    this.rockGeo = new THREE.DodecahedronGeometry(0.55, 0);
    this.rockMat = new THREE.MeshLambertMaterial({ color: 0x8b7d6b });
  }

  initInput() {
    const el = this.container;
    let dragging = false, lastX = 0;
    const down = (e) => {
      this.sound.unlock();
      dragging = true;
      lastX = e.clientX;
    };
    const move = (e) => {
      if (!dragging || this.state !== 'playing') return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      const w = el.clientWidth;
      // one full screen swipe ~ moves across the whole field
      const k = (ARMY_LIMIT * 2.4) / Math.min(w, 700);
      this.army.targetX = clamp(this.army.targetX + dx * k, -ARMY_LIMIT, ARMY_LIMIT);
      this.moved += Math.abs(dx);
    };
    const up = () => { dragging = false; };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    this.keys = {};
    window.addEventListener('keydown', (e) => {
      this.keys[e.key] = true;
      if (e.key === 'Escape' || e.key === 'p') {
        if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume();
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key] = false; });
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Frame the three corridors: fit the plaza width in portrait, and keep a
    // comfortable view angle in landscape.
    const portrait = aspect < 1;
    const vfov = portrait ? 58 : 50;
    this.camera.fov = vfov;
    const target = new THREE.Vector3(0, 0, portrait ? -7.2 : -10.5);
    const dir = new THREE.Vector3(0, 0.66, 0.75).normalize();
    this.camDir = dir;
    // world half-width to keep visible around the army line
    const halfW = 5.3;
    const tanH = Math.tan(THREE.MathUtils.degToRad(vfov / 2)) * aspect;
    let dist = portrait ? clamp(halfW / tanH, 14, 34) : 27;
    this.camDist = dist;
    this.camBase = target.clone().addScaledVector(dir, dist);
    this.camTarget = target;
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  }

  // ---------------------------------------------------------------- level
  prepareLevel(L) {
    this.clearLevel();
    const lv = makeLevel(L);
    this.level = lv;
    this.time = 0;
    this.kills = 0;
    this.resolved = 0;
    this.earned = 0;
    this.tier = 0;
    this.rateMult = 1 + 0.08 * this.save.up.rate;
    this.dmgMult = 1 + 0.15 * this.save.up.power;
    this.army = { x: 0, targetX: 0, count: 1 + this.save.up.recruits, r: 0.4 };
    this.kids = [];
    this.syncKids(true);
    this.slingMesh.geometry = this.slingGeos[0];
    this.enemies = [];
    this.boss = null;
    this.bossDefeated = false;
    this.waveIdx = 0;
    this.totalEnemies = lv.waves.reduce((a, w) => a + w.n + (w.boss ? 1 : 0), 0);
    this.proj = [];
    this.moved = 0;
    this.shake = 0;
    this.guardianCd = 3;
    this.ended = false;

    // lanes
    this.lanes = [];
    for (const [key, items] of [['left', lv.left], ['right', lv.right]]) {
      const lane = { key, x: LANES[key], items: [] };
      let z = MOUTH_Z;
      for (const it of items) {
        const item = { ...it, maxHp: it.hp, alive: true };
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
    if (this.lanes) {
      for (const lane of this.lanes) for (const it of lane.items) this.disposeItem(it);
    }
    if (this.rocks) for (const r of this.rocks) { this.scene.remove(r.mesh, r.ring); }
    this.rocks = [];
    this.parts = [];
    this.ui.labels.innerHTML = '';
    this.ui.floats.innerHTML = '';
    this.bossMesh.visible = false;
    this.ui.bossBar.classList.add('hidden');
  }

  buildItem(lane, it) {
    const x = lane.x;
    if (it.kind === 'gate') {
      const g = new THREE.Group();
      const plinth = new THREE.Mesh(this.plinthGeo, this.vmat);
      g.add(plinth);
      const icon = new THREE.Mesh(this.slingGeos[it.tier], this.vmat);
      icon.scale.setScalar(3.4);
      icon.position.set(-0.58, -3.45, 0.82); // recentre: slingshot geometry sits at the hand
      const iconHolder = new THREE.Group();
      iconHolder.position.set(0, 1.9, 0);
      iconHolder.add(icon);
      g.add(iconHolder);
      const glow = new THREE.Sprite(this.glowMat);
      glow.scale.set(2.6, 2.6, 1);
      glow.position.set(0, 1.9, 0.2);
      g.add(glow);
      g.position.set(x, 0, it.z);
      it.mesh = g;
      it.icon = iconHolder;
      this.scene.add(g);
      it.label = this.makeLabel('gate-label', fmt(it.hp));
    } else if (it.kind === 'guardian') {
      this.guardian.position.set(x, 0, it.z);
      this.guardian.visible = true;
      this.guardian.scale.setScalar(1);
      it.mesh = this.guardian;
      it.label = this.makeLabel('gate-label big', fmt(it.hp));
    } else {
      const kind = it.kind === 'tile' ? 'recruit' : it.kind === 'big' ? 'big' : 'boost';
      const label = it.kind === 'boost' ? (it.boost === 'rate' ? 'CADENCE' : 'FORCE') : '+' + it.value;
      const m = new THREE.Mesh(this.tileGeo, this.tileMatFor(kind, label));
      m.rotation.x = 0.35;
      m.position.set(x, 0.4, it.z);
      it.mesh = m;
      this.scene.add(m);
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
    this.save.level = L + 1;
    this.save.best = Math.max(this.save.best, L + 1);
    this.writeSave();
    this.sound.win();
    this.sound.stopMusic();
    setTimeout(() => {
      this.state = 'win';
      this.ui.onState('win', { level: L, earned: this.earned, army: this.army.count });
    }, 1200);
  }
  lose() {
    if (this.ended) return;
    this.ended = true;
    this.writeSave();
    this.sound.lose();
    this.sound.stopMusic();
    setTimeout(() => {
      this.state = 'lose';
      this.ui.onState('lose', { level: this.level.L, earned: this.earned });
    }, 900);
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
      const k = {
        x: spawnX ?? this.army.x + sx, z: spawnZ ?? ARMY_Z + sz,
        s: instant ? 1 : 0.01, cd: Math.random() * 0.8, bob: Math.random() * 6.28, recoil: 0,
      };
      this.kids.push(k);
    }
    while (this.kids.length > want) {
      const k = this.kids.pop();
      this.burst(k.x, 0.5, k.z, 0x5a3622, 5, 3);
      this.burst(k.x, 0.5, k.z, 0xe4602a, 3, 3);
    }
    this.army.r = KID_SPACING * Math.sqrt(Math.max(1, this.kids.length)) + 0.3;
  }

  addUnits(n, x, z) {
    this.army.count += n;
    this.syncKids(false, x, z);
  }

  loseUnits(n) {
    if (n <= 0 || this.army.count <= 0) return;
    this.army.count = Math.max(0, this.army.count - n);
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
    return { x: (tmpV.x * 0.5 + 0.5) * this.w, y: (-tmpV.y * 0.5 + 0.5) * this.h, vis: tmpV.z < 1 };
  }

  // ---------------------------------------------------------------- loop
  frame() {
    let dt = Math.min(this.clock.getDelta(), 0.05);
    this.trackPerf(dt);
    if (this.state === 'playing') {
      dt *= this.timeScale;
      // sub-step when time-scaled (bot/testing)
      const steps = Math.ceil(dt / 0.034);
      for (let i = 0; i < steps; i++) this.update(dt / steps);
    } else {
      this.idle(dt);
    }
    this.render(dt);
  }

  trackPerf(dt) {
    // adaptive resolution: drop pixel ratio if the device struggles
    this.frameTimes.push(dt);
    if (this.frameTimes.length >= 90) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.frameTimes.length = 0;
      if (avg > 0.024 && this.dpr > 1) {
        this.dpr = Math.max(1, this.dpr - 0.25);
        this.renderer.setPixelRatio(this.dpr);
        this.resize();
      }
    }
  }

  idle(dt) {
    // gentle life on menu screens
    this.idleT = (this.idleT || 0) + dt;
    for (const k of this.kids) k.bob += dt * 3;
  }

  update(dt) {
    this.time += dt;
    const lv = this.level;
    // --- input / bot
    if (this.opts.bot) this.botThink();
    const kx = (this.keys.ArrowLeft || this.keys.a || this.keys.q ? -1 : 0) + (this.keys.ArrowRight || this.keys.d ? 1 : 0);
    if (kx) { this.army.targetX = clamp(this.army.targetX + kx * 10 * dt, -ARMY_LIMIT, ARMY_LIMIT); this.moved += 10; }
    const prevX = this.army.x;
    this.army.x = lerp(this.army.x, this.army.targetX, Math.min(1, dt * 12));
    const vx = (this.army.x - prevX) / Math.max(dt, 1e-4);
    if (this.moved > 60 && !this.save.tutorialDone) {
      this.save.tutorialDone = true;
      this.writeSave();
      this.ui.tutorial(false);
    }

    // --- waves
    while (this.waveIdx < lv.waves.length && this.time >= lv.waves[this.waveIdx].t) {
      this.spawnWave(lv.waves[this.waveIdx]);
      this.waveIdx++;
    }
    // keep the pace up: if the field is empty, bring the next wave forward
    if (this.waveIdx < lv.waves.length && this.enemies.length === 0 && !this.boss) {
      const next = lv.waves[this.waveIdx].t;
      if (next - this.time > 3) this.time = next - 3;
    }

    // --- kids
    const W = WEAPONS[this.tier];
    const interval = 1 / (W.rate * this.rateMult);
    const mult = this.army.count / Math.max(1, this.kids.length);
    const dmg = W.dmg * this.dmgMult * mult;
    const aim = this.findPlazaTarget();
    let fired = 0;
    for (let i = 0; i < this.kids.length; i++) {
      const k = this.kids[i];
      const [sx, sz] = this.slot(i);
      const tx = this.army.x + sx, tz = ARMY_Z + sz;
      k.x = lerp(k.x, tx, Math.min(1, dt * 7));
      k.z = lerp(k.z, tz, Math.min(1, dt * 7));
      k.s = Math.min(1, k.s + dt * 4);
      k.bob += dt * (6 + Math.abs(vx) * 0.6);
      k.recoil = Math.max(0, k.recoil - dt * 6);
      k.cd -= dt;
      if (k.cd <= 0) {
        k.cd += interval * (0.85 + Math.random() * 0.3);
        k.recoil = 1;
        let dx = (Math.random() - 0.5) * 0.06, dz = -1;
        if (aim) {
          const ax = aim.x - k.x, az = aim.z - k.z;
          const l = Math.hypot(ax, az) || 1;
          dx = ax / l; dz = az / l;
        }
        this.fire(k.x + 0.2, 1.1, k.z - 0.4, dx, dz, dmg, W);
        fired++;
      }
    }
    if (fired) this.sound.shoot();

    // --- projectiles
    this.updateProjectiles(dt);

    // --- lanes (conveyors)
    for (const lane of this.lanes) this.updateLane(lane, dt);

    // --- enemies
    this.updateEnemies(dt);

    // --- guardian attacks
    this.updateGuardian(dt);
    this.updateRocks(dt);

    // --- win check
    if (!this.ended && this.waveIdx >= lv.waves.length && this.enemies.length === 0 && this.bossDefeated) this.win();

    this.updateHud();
  }

  findPlazaTarget() {
    // closest enemy that already left the corridors and is near the army
    let best = null, bd = 9 * 9;
    const list = this.boss && this.boss.z > MOUTH_Z ? [...this.enemies, this.boss] : this.enemies;
    for (const e of list) {
      if (e.z < MOUTH_Z + 0.5) continue;
      const dx = e.x - this.army.x, dz = e.z - ARMY_Z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  fire(x, y, z, dx, dz, dmg, W) {
    if (this.proj.length >= MAX_PROJ) return;
    this.proj.push({ x, y, z, vx: dx * W.speed, vz: dz * W.speed, dmg, splash: W.splash, color: W.stone, size: W.size, life: 3.2, vy: 1.2 });
  }

  updateProjectiles(dt) {
    // spatial hash of enemies for fast lookup
    const grid = new Map();
    const cell = 1.6;
    const all = this.enemies;
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      const key = ((Math.floor(e.x / cell) + 64) << 10) | (Math.floor(e.z / cell) + 512);
      let b = grid.get(key);
      if (!b) grid.set(key, (b = []));
      b.push(e);
    }
    const leftGate = this.frontBlocker(this.lanes[0]);
    const rightGate = this.frontBlocker(this.lanes[1]);
    const P = this.proj;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.vy -= 2.4 * dt; p.y = Math.max(0.2, p.y + p.vy * dt);
      p.life -= dt;
      let dead = p.life <= 0 || p.z < FAR_Z + 20;
      if (!dead && p.z < MOUTH_Z + 0.2) {
        // inside corridor band: walls stop stones
        const ax = Math.abs(p.x);
        if ((ax > 1.86 && ax < 2.36) || ax > 6.1) {
          dead = true;
          if (Math.random() < 0.2) this.burst(p.x, p.y, p.z, 0xcf8a52, 2, 2, 0.08);
        } else if (p.x < -2.1) {
          if (leftGate && p.z <= leftGate.z + leftGate.halfDepth) {
            this.damageBlocker(this.lanes[0], leftGate, p);
            dead = true;
          }
        } else if (p.x > 2.1) {
          if (rightGate && p.z <= rightGate.z + rightGate.halfDepth) {
            this.damageBlocker(this.lanes[1], rightGate, p);
            dead = true;
          }
        }
      }
      if (!dead && this.boss) {
        const b = this.boss;
        const dx = p.x - b.x, dz = p.z - b.z;
        if (dx * dx + dz * dz < 1.1 * 1.1) {
          this.damageEnemy(b, p.dmg);
          this.burst(p.x, 1.2, p.z, p.color, 2, 3, 0.1);
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
              const dx = p.x - e.x, dz = p.z - e.z;
              if (dx * dx + dz * dz < 0.36 * 0.36 + 0.1) {
                this.damageEnemy(e, p.dmg);
                this.burst(p.x, 0.7, p.z, p.splash ? p.color : 0xffffff, 2, 2.5, 0.07);
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
    // cull dead enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hp <= 0) this.killEnemy(i);
    }
  }

  splash(p, grid, cell, skip) {
    const r = p.splash;
    this.burst(p.x, 0.6, p.z, p.color, 6, 5, 0.14);
    if (r > 1.5) { this.sound.boom(); this.burst(p.x, 0.6, p.z, 0xffffff, 4, 6, 0.1); }
    const cx = Math.floor(p.x / cell), cz = Math.floor(p.z / cell);
    const n = Math.ceil(r / cell);
    for (let ox = -n; ox <= n; ox++) for (let oz = -n; oz <= n; oz++) {
      const b = grid.get(((cx + ox + 64) << 10) | (cz + oz + 512));
      if (!b) continue;
      for (const e of b) {
        if (e === skip || e.hp <= 0) continue;
        const dx = p.x - e.x, dz = p.z - e.z;
        if (dx * dx + dz * dz < r * r) this.damageEnemy(e, p.dmg * 0.6);
      }
    }
  }

  damageEnemy(e, d) {
    e.hp -= d;
    e.flash = 0.12;
    this.sound.hit();
    if (e.isBoss && e.hp <= 0 && !this.bossDefeated) {
      this.bossDefeated = true;
      this.boss = null;
      this.bossMesh.visible = false;
      this.ui.bossBar.classList.add('hidden');
      this.kills++;
      this.resolved++;
      this.earned += 50; this.save.coins += 50;
      this.sound.crack();
      this.shake = 1;
      for (let i = 0; i < 4; i++) this.burst(e.x, 1.5, e.z, [0x8e1717, 0xffd23a, 0xf4ead5, 0x111111][i], 16, 8, 0.25);
      this.floatText('+50', e.x, 3, e.z, 'coin');
    }
  }

  killEnemy(i) {
    const e = this.enemies[i];
    this.enemies[i] = this.enemies[this.enemies.length - 1];
    this.enemies.pop();
    this.kills++;
    this.resolved++;
    this.earned++; this.save.coins++;
    this.burst(e.x, 0.6, e.z, 0xc8322b, 5, 3.5);
    this.burst(e.x, 0.8, e.z, 0xf4ead5, 2, 3);
    this.sound.pop();
  }

  frontBlocker(lane) {
    for (const it of lane.items) {
      if (!it.alive) continue;
      if (it.kind === 'gate' || it.kind === 'guardian') return it;
    }
    return null;
  }

  damageBlocker(lane, it, p) {
    it.hp -= p.dmg;
    it.hit = 0.1;
    this.sound.thud();
    if (Math.random() < 0.4) this.burst(p.x, 1.0, it.z + it.halfDepth, it.kind === 'guardian' ? 0xd8a86a : 0xb3a699, 2, 3, 0.1);
    if (it.hp <= 0 && it.alive) {
      it.alive = false;
      this.shake = 0.7;
      this.sound.crack();
      const x = lane.x;
      for (let k = 0; k < 3; k++) this.burst(x, 1, it.z, [0x938679, 0xb3a699, 0xffd23a][k], 14, 7, 0.22);
      if (it.kind === 'gate') {
        if (it.tier > this.tier) {
          this.tier = it.tier;
          this.slingMesh.geometry = this.slingGeos[this.tier];
          this.ui.banner(WEAPONS[this.tier].name + ' !', 'Dégâts ×' + WEAPONS[this.tier].dmg + (WEAPONS[this.tier].splash ? ' · explosion' : ''));
          this.sound.upgrade();
          for (const k of this.kids) this.burst(k.x, 1, k.z, 0xffd23a, 1, 3, 0.1);
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
      if (it.kind === 'gate' || it.kind === 'guardian') {
        const stop = MOUTH_Z - it.halfDepth;
        it.z = Math.min(it.z + CONVEYOR_SPEED * dt, stop, limit - it.halfDepth);
        limit = it.z - it.halfDepth - 0.6;
        if (it.kind === 'gate') {
          it.mesh.position.z = it.z;
          it.icon.rotation.y += dt * 1.8;
          it.icon.position.y = 1.9 + Math.sin(this.time * 3) * 0.12;
          const sh = it.hit > 0 ? (Math.random() - 0.5) * 0.12 : 0;
          it.mesh.position.x = lane.x + sh;
        } else {
          const sh = it.hit > 0 ? (Math.random() - 0.5) * 0.15 : 0;
          it.mesh.position.set(lane.x + sh, 0, it.z);
          it.mesh.rotation.y = Math.sin(this.time * 1.3) * 0.12;
          it.mesh.material.emissive.setRGB(it.hit > 0 ? 0.35 : 0, it.hit > 0 ? 0.2 : 0, 0);
        }
        it.hit = Math.max(0, (it.hit || 0) - dt);
        if (it.label) it.label.textContent = fmt(it.hp);
      } else {
        it.z = Math.min(it.z + CONVEYOR_SPEED * dt, limit - TILE_GAP);
        limit = it.z - TILE_GAP;
        it.mesh.position.z = it.z;
        if (!it.collected && it.z > ARMY_Z - this.army.r * 0.7 - 0.3 && it.z < ARMY_Z + 1.5) {
          if (Math.abs(this.army.x - lane.x) < 1.5 + this.army.r * 0.5) this.collect(lane, it);
        }
        if (it.collected) {
          it.mesh.scale.multiplyScalar(0.8);
          it.mesh.position.y += dt * 3;
        }
        if (it.z > 9) it.dead = true;
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
      this.floatText(it.boost === 'rate' ? 'CADENCE +20%' : 'FORCE +20%', this.army.x, 1.8, ARMY_Z, 'boost');
      this.sound.upgrade();
      this.burst(this.army.x, 1, ARMY_Z, 0x7dff8a, 18, 6, 0.14);
      return;
    }
    this.addUnits(it.value, x, it.z);
    this.floatText('+' + it.value, x, 1.4, it.z, it.kind === 'big' ? 'big' : 'plus');
    this.burst(x, 0.8, it.z, it.kind === 'big' ? 0xffd23a : 0x4fb3ff, it.kind === 'big' ? 20 : 8, 5, 0.12);
    if (it.kind === 'big') this.sound.big(); else this.sound.collect(this.army.count);
  }

  spawnWave(w) {
    const per = 5;
    for (let i = 0; i < w.n; i++) {
      if (this.enemies.length >= MAX_ENEMIES) break;
      const row = Math.floor(i / per), col = i % per;
      this.enemies.push({
        x: (col - (per - 1) / 2) * 0.62 + (Math.random() - 0.5) * 0.15,
        z: SPAWN_Z - row * 0.72 - (w.boss ? 4 : 0),
        hp: w.hp, maxHp: w.hp, flash: 0, bob: Math.random() * 6,
        ox: (Math.random() - 0.5), oz: (Math.random() - 0.5), speed: 2.7 + Math.random() * 0.3,
      });
    }
    if (w.boss) {
      this.boss = { x: 0, z: SPAWN_Z + 1.5, hp: w.boss, maxHp: w.boss, flash: 0, isBoss: true, speed: 1.9, bob: 0, atk: 0 };
      this.bossMesh.visible = true;
      this.ui.bossBar.classList.remove('hidden');
      this.ui.banner('Le Grand Fétiche arrive !', 'Tiens bon au milieu');
    } else if (this.waveIdx === 0) {
      this.ui.banner('La horde arrive !', 'Vise le couloir du milieu');
    }
  }

  updateEnemies(dt) {
    const ax = this.army.x, ar = this.army.r;
    let lost = 0;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.bob += dt * 8;
      e.flash = Math.max(0, e.flash - dt);
      if (e.z < MOUTH_Z) {
        e.z += e.speed * dt;
        e.x = clamp(e.x, -1.4, 1.4);
      } else {
        const tx = ax + e.ox * ar, tz = ARMY_Z + e.oz * ar * 0.6;
        const dx = tx - e.x, dz = tz - e.z;
        const l = Math.hypot(dx, dz) || 1;
        const sp = e.speed * 1.2;
        e.x += (dx / l) * sp * dt;
        e.z += (dz / l) * sp * dt;
        const cx = e.x - ax, cz = e.z - ARMY_Z;
        if (cx * cx + cz * cz < (ar + 0.15) * (ar + 0.15) && this.army.count > 0) {
          lost++;
          this.resolved++;
          this.burst(e.x, 0.6, e.z, 0xc8322b, 4, 3);
          this.enemies[i] = this.enemies[this.enemies.length - 1];
          this.enemies.pop();
        }
      }
    }
    if (lost) this.loseUnits(lost);
    const b = this.boss;
    if (b) {
      b.bob += dt * 4;
      b.flash = Math.max(0, b.flash - dt);
      if (b.z < MOUTH_Z) b.z += b.speed * dt;
      else {
        const dx = ax - b.x, dz = ARMY_Z - b.z;
        const d = Math.hypot(dx, dz);
        const reach = ar + 0.9;
        if (d > reach) {
          b.x += (dx / d) * b.speed * 1.3 * dt;
          b.z += (dz / d) * b.speed * 1.3 * dt;
        } else {
          b.atk -= dt;
          if (b.atk <= 0) {
            b.atk = 0.5;
            this.shake = Math.max(this.shake, 0.35);
            this.sound.boom();
            this.burst(b.x + dx * 0.5, 0.3, b.z + dz * 0.5, 0xcf8a52, 10, 5, 0.15);
            this.loseUnits(3 + Math.floor(this.level.L * 0.8));
          }
        }
      }
      this.ui.bossFill.style.width = (100 * Math.max(0, b.hp) / b.maxHp) + '%';
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
        // telegraphed boulder: lands where the army is now
        const tx = this.army.x, tz = ARMY_Z;
        const mesh = new THREE.Mesh(this.rockGeo, this.rockMat);
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
        this.burst(r.tx, 0.4, r.tz, 0x8b7d6b, 14, 7, 0.2);
        this.burst(r.tx, 0.2, r.tz, 0xcf8a52, 10, 5, 0.15);
        let hit = 0;
        for (const kid of this.kids) {
          const dx = kid.x - r.tx, dz = kid.z - r.tz;
          if (dx * dx + dz * dz < 1.7 * 1.7) hit++;
        }
        const mult = this.army.count / Math.max(1, this.kids.length);
        if (hit) this.loseUnits(Math.ceil(hit * mult * 0.5));
      }
    }
  }

  // ---------------------------------------------------------------- bot
  botThink() {
    // simple autoplayer, used for automated balance checks (?bot=1)
    const lanes = this.lanes;
    const threat = this.enemies.some((e) => e.z > -24) || (this.boss && this.boss.z > -30);
    const leftBlock = this.frontBlocker(lanes[0]);
    const leftTiles = lanes[0].items.some((it) => it.kind !== 'gate' && !it.collected && it.z > -20);
    const guardian = lanes[1].items.find((it) => it.kind === 'guardian');
    const rightTiles = lanes[1].items.some((it) => it.kind === 'big' && !it.collected);
    let tx = 0;
    if (threat) tx = 0;
    else if (leftBlock || leftTiles) tx = LANES.left;
    else if (guardian && this.tier >= 3) tx = LANES.right - 0.8;
    else if (!guardian && rightTiles) tx = LANES.right;
    this.army.targetX = tx;
    this.moved = 999;
  }

  // ---------------------------------------------------------------- hud
  updateHud(force) {
    const u = this.ui;
    if (force || this._c !== this.army.count) { this._c = this.army.count; u.count.textContent = fmt(this.army.count); }
    if (force || this._coins !== this.save.coins) { this._coins = this.save.coins; u.coins.textContent = fmt(this.save.coins); }
    if (force || this._lvl !== this.level.L) { this._lvl = this.level.L; u.level.textContent = 'Niveau ' + this.level.L; }
    const prog = Math.min(1, this.resolved / this.totalEnemies);
    u.progress.style.width = (prog * 100) + '%';
  }

  // ---------------------------------------------------------------- render
  render(dt) {
    const t = performance.now() / 1000;
    // kids
    const km = this.kidMesh, sm = this.slingMesh, shm = this.shadowMesh;
    let si = 0;
    for (let i = 0; i < this.kids.length; i++) {
      const k = this.kids[i];
      const hop = Math.abs(Math.sin(k.bob)) * 0.06;
      const s = k.s * KID_SCALE;
      const rz = k.recoil * 0.06;
      setInst(km, i, k.x, hop, k.z + rz, Math.sin(k.bob * 0.5) * 0.08, s);
      setInst(sm, i, k.x, hop, k.z + rz, Math.sin(k.bob * 0.5) * 0.08, s);
      setInst(shm, si++, k.x, 0.02, k.z, 0, 0.8 * KID_SCALE * k.s);
    }
    km.count = sm.count = this.kids.length;
    km.instanceMatrix.needsUpdate = sm.instanceMatrix.needsUpdate = true;

    // enemies
    const em = this.enemyMesh;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const hop = Math.abs(Math.sin(e.bob)) * 0.07;
      const face = e.z > MOUTH_Z ? Math.atan2(this.army.x - e.x, ARMY_Z - e.z) : 0;
      setInst(em, i, e.x, hop, e.z, face, 1);
      const f = e.flash > 0 ? 3 : 1;
      em.setColorAt(i, tmpC.setRGB(f, f, f));
      setInst(shm, si++, e.x, 0.02, e.z, 0, 0.8);
    }
    em.count = this.enemies.length;
    em.instanceMatrix.needsUpdate = true;
    if (em.instanceColor) em.instanceColor.needsUpdate = true;
    shm.count = si;
    shm.instanceMatrix.needsUpdate = true;

    // boss
    if (this.boss) {
      const b = this.boss;
      this.bossMesh.position.set(b.x, Math.abs(Math.sin(b.bob)) * 0.15, b.z);
      this.bossMesh.scale.setScalar(3.2);
      this.bossMesh.rotation.y = b.z > MOUTH_Z ? Math.atan2(this.army.x - b.x, ARMY_Z - b.z) : 0;
      this.bossMesh.material.emissive.setRGB(b.flash > 0 ? 0.4 : 0, b.flash > 0 ? 0.3 : 0, b.flash > 0 ? 0.2 : 0);
    }

    // projectiles
    const pm = this.projMesh;
    for (let i = 0; i < this.proj.length; i++) {
      const p = this.proj[i];
      setInst(pm, i, p.x, p.y, p.z, 0, p.size);
      pm.setColorAt(i, tmpC.set(p.color));
    }
    pm.count = this.proj.length;
    pm.instanceMatrix.needsUpdate = true;
    if (pm.instanceColor) pm.instanceColor.needsUpdate = true;

    // particles
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
      tmpQ.setFromEuler(tmpE.set(q.rot + q.t * 8, q.rot, 0));
      tmpM.compose(tmpV.set(q.x, q.y, q.z), tmpQ, tmpS.set(s, s, s));
      qm.setMatrixAt(n, tmpM);
      qm.setColorAt(n, tmpC.set(q.color));
      n++;
    }
    qm.count = n;
    qm.instanceMatrix.needsUpdate = true;
    if (qm.instanceColor) qm.instanceColor.needsUpdate = true;

    // guardian idle
    if (this.guardian.visible) {
      this.guardian.scale.y = 1 + Math.sin(t * 2) * 0.02;
    }

    // camera shake
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const s = this.shake * this.shake * 0.4;
    // follow the army sideways a little so the outer lanes stay in view
    const follow = this.w < this.h ? 0.5 : 0.25;
    this.camX = lerp(this.camX || 0, (this.army ? this.army.x : 0) * follow, Math.min(1, dt * 5));
    // pull back as the troop grows
    this.camZoom = lerp(this.camZoom || 0, this.army ? Math.max(0, this.army.r - 1.2) * 1.6 : 0, Math.min(1, dt * 2));
    const cz = this.camZoom;
    this.camera.position.set(this.camBase.x + this.camX + (Math.random() - 0.5) * s, this.camBase.y + this.camDir.y * cz + (Math.random() - 0.5) * s, this.camBase.z + this.camDir.z * cz);
    tmpV.copy(this.camTarget); tmpV.x += this.camX;
    this.camera.lookAt(tmpV);

    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  }

  updateLabels() {
    for (const lane of this.lanes) {
      for (const it of lane.items) {
        if (!it.label) continue;
        const y = it.kind === 'guardian' ? 1.3 : 0.5;
        const p = this.project(lane.x, y, it.z + it.halfDepth + 0.1);
        const show = it.z > -40;
        it.label.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
        it.label.style.opacity = show ? 1 : 0;
      }
    }
    const p = this.project(this.army.x, 1.2 + this.army.r * 0.5, ARMY_Z - this.army.r);
    this.ui.bubble.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
  }
}
