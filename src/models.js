// Procedural low-poly models, built from primitives and merged into single
// vertex-coloured geometries so they can be drawn with InstancedMesh.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Builder {
  constructor() { this.parts = []; }
  add(geo, color, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
    _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
    this.parts.push({ geo, color: new THREE.Color(color), m: _m.clone() });
    return this;
  }
  build() {
    const pos = [], nor = [], col = [];
    for (const { geo, color, m } of this.parts) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(m);
      const pa = g.attributes.position.array;
      const na = g.attributes.normal.array;
      for (let i = 0; i < pa.length; i++) { pos.push(pa[i]); nor.push(na[i]); }
      for (let i = 0; i < pa.length / 3; i++) col.push(color.r, color.g, color.b);
      g.dispose();
      geo.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }
}

const Cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const Sph = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const Box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const Cone = (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg);

export const PAL = {
  skin: 0x7a4a2c,
  band: 0xd8261c,
  skinDark: 0x4a2c1a,
  hair: 0x24150b,
  pagne: 0xe4602a,
  bead: 0xf3ead2,
  beadRed: 0xd23a2a,
  eye: 0xffffff,
  pupil: 0x111111,
  wood: 0x8b5a2b,
};

// ---------------------------------------------------------------- kid
// A little slingshot kid. Faces -Z (away from the camera, toward the enemy).
export function kidGeometry() {
  const b = new Builder();
  const { skin, skinDark, hair, pagne } = PAL;
  // legs + feet
  b.add(Cyl(0.065, 0.06, 0.3, 6), skin, [-0.08, 0.15, 0]);
  b.add(Cyl(0.065, 0.06, 0.3, 6), skin, [0.08, 0.15, 0]);
  b.add(Box(0.1, 0.05, 0.17), skinDark, [-0.08, 0.025, -0.03]);
  b.add(Box(0.1, 0.05, 0.17), skinDark, [0.08, 0.025, -0.03]);
  // pagne (loincloth)
  b.add(Cyl(0.17, 0.2, 0.14, 9), pagne, [0, 0.33, 0]);
  b.add(Box(0.15, 0.14, 0.03), pagne, [0, 0.25, -0.17], [0.15, 0, 0]);
  b.add(Box(0.15, 0.12, 0.03), pagne, [0, 0.26, 0.17], [-0.15, 0, 0]);
  // torso
  b.add(Cyl(0.13, 0.16, 0.26, 9), skin, [0, 0.5, 0]);
  // bead necklace
  b.add(new THREE.TorusGeometry(0.125, 0.026, 5, 12), PAL.bead, [0, 0.61, 0], [Math.PI / 2, 0, 0]);
  b.add(Sph(0.035, 6, 4), PAL.beadRed, [0, 0.57, -0.125]);
  // head (big, chibi)
  b.add(Sph(0.22, 12, 10), skin, [0, 0.84, 0]);
  b.add(new THREE.SphereGeometry(0.232, 12, 4, 0, Math.PI * 2, 0, Math.PI * 0.17), hair, [0, 0.845, 0.01]);
  b.add(Sph(0.055, 6, 5), skin, [-0.225, 0.83, 0]);
  b.add(Sph(0.055, 6, 5), skin, [0.225, 0.83, 0]);
  // eyes (front)
  b.add(Sph(0.045, 6, 5), PAL.eye, [-0.075, 0.85, -0.19], [0, 0, 0], [1, 1.15, 0.6]);
  b.add(Sph(0.045, 6, 5), PAL.eye, [0.075, 0.85, -0.19], [0, 0, 0], [1, 1.15, 0.6]);
  b.add(Sph(0.024, 5, 4), PAL.pupil, [-0.075, 0.85, -0.215]);
  b.add(Sph(0.024, 5, 4), PAL.pupil, [0.075, 0.85, -0.215]);
  b.add(Box(0.07, 0.018, 0.02), 0x3a1a0c, [0, 0.76, -0.205]);
  // arms: left relaxed, right extended forward to hold the slingshot
  b.add(Cyl(0.045, 0.04, 0.27, 5), skin, [-0.19, 0.49, 0], [0, 0, 0.25]);
  b.add(Cyl(0.045, 0.04, 0.36, 5), skin, [0.17, 0.76, -0.11], [-0.67, 0, 0]);
  b.add(Sph(0.045, 5, 4), skin, [0.17, 0.9, -0.22]);
  return b.build();
}

// Slingshot held in the right hand. `tier` 0..4 changes look.
export function slingshotGeometry(tier) {
  const b = new Builder();
  const colors = [0x8b5a2b, 0x5f5f66, 0xffc53a, 0xff5a1f, 0xb44bff];
  const band = [0xc23b2a, 0x2a2a2a, 0xd63a2a, 0xffe14d, 0x57ffef][tier];
  const c = colors[tier];
  const s = [1, 1.1, 1.2, 1.3, 1.5][tier];
  const hx = 0.17, hy = 0.94, hz = -0.24;
  b.add(Cyl(0.024 * s, 0.028 * s, 0.17 * s, 5), c, [hx, hy, hz]);
  b.add(Cyl(0.02 * s, 0.022 * s, 0.13 * s, 5), c, [hx - 0.04 * s, hy + 0.13 * s, hz], [0, 0, 0.45]);
  b.add(Cyl(0.02 * s, 0.022 * s, 0.13 * s, 5), c, [hx + 0.04 * s, hy + 0.13 * s, hz], [0, 0, -0.45]);
  b.add(Box(0.15 * s, 0.018, 0.018), band, [hx, hy + 0.18 * s, hz + 0.02]);
  if (tier >= 1) b.add(Box(0.06 * s, 0.04 * s, 0.06 * s), tier === 1 ? 0xb8b8c2 : 0xffffff, [hx, hy + 0.02, hz]);
  if (tier >= 3) b.add(Sph(0.045 * s, 6, 5), band, [hx, hy + 0.08 * s, hz - 0.03]);
  return b.build();
}

// ---------------------------------------------------------------- enemies
// "Fétiche" minion: red body, white mask, faces +Z (toward the player).
export function fetishGeometry(big = false) {
  const b = new Builder();
  const body = big ? 0x8e1717 : 0xc8322b;
  const head = big ? 0x6e1010 : 0xa52822;
  const mask = 0xf4ead5;
  b.add(Cyl(0.3, 0.36, 0.16, 9), 0xd9b25f, [0, 0.1, 0]); // raffia skirt
  b.add(Cyl(0.14, 0.3, 0.62, 8), body, [0, 0.4, 0]);
  b.add(Sph(0.21, 10, 8), head, [0, 0.82, 0]);
  b.add(Cyl(0.17, 0.15, 0.06, 9), mask, [0, 0.8, 0.17], [Math.PI / 2, 0, 0]);
  b.add(Box(0.07, 0.03, 0.02), 0x111111, [-0.065, 0.84, 0.205]);
  b.add(Box(0.07, 0.03, 0.02), 0x111111, [0.065, 0.84, 0.205]);
  b.add(Box(0.03, 0.14, 0.02), big ? 0xd21f1f : 0xc8322b, [0, 0.75, 0.205]);
  b.add(Cone(0.05, 0.24, 5), 0xe8dcc0, [-0.15, 1.02, 0], [0, 0, 0.5]);
  b.add(Cone(0.05, 0.24, 5), 0xe8dcc0, [0.15, 1.02, 0], [0, 0, -0.5]);
  // spear
  b.add(Cyl(0.02, 0.02, 1.0, 4), PAL.wood, [0.28, 0.55, 0.05]);
  b.add(Cone(0.05, 0.16, 4), 0xcfcfcf, [0.28, 1.12, 0.05]);
  if (big) {
    b.add(Sph(0.12, 6, 5), 0xffd23a, [-0.3, 0.62, 0]);
    b.add(Sph(0.12, 6, 5), 0xffd23a, [0.3, 0.62, 0]);
    b.add(new THREE.TorusGeometry(0.2, 0.04, 5, 10), 0xffd23a, [0, 0.62, 0], [Math.PI / 2, 0, 0]);
  }
  return b.build();
}

// Right-lane guardian: a giant carved mask totem on a stone plinth. Faces +Z.
export function guardianGeometry() {
  const b = new Builder();
  b.add(Box(3.0, 1.2, 2.0), 0x8f8479, [0, 0.6, 0]);
  b.add(Box(3.2, 0.18, 2.2), 0xa99c90, [0, 1.25, 0]);
  const wood = 0x6b3e1f, face = 0xd8a86a;
  b.add(Cyl(0.9, 0.75, 3.0, 9), wood, [0, 2.85, 0]);
  b.add(Box(1.45, 2.5, 0.35), face, [0, 2.95, 0.72]);
  // brow, eyes, nose, mouth
  b.add(Box(1.3, 0.16, 0.2), 0x3a2010, [0, 3.55, 0.95]);
  b.add(Box(0.34, 0.2, 0.1), 0x111111, [-0.35, 3.3, 0.92]);
  b.add(Box(0.34, 0.2, 0.1), 0x111111, [0.35, 3.3, 0.92]);
  b.add(Box(0.18, 0.08, 0.06), 0xffe45c, [-0.35, 3.3, 0.98]);
  b.add(Box(0.18, 0.08, 0.06), 0xffe45c, [0.35, 3.3, 0.98]);
  b.add(Box(0.22, 0.6, 0.3), 0xb98a52, [0, 2.95, 1.0]);
  b.add(Box(0.8, 0.26, 0.1), 0x111111, [0, 2.3, 0.92]);
  b.add(Box(0.7, 0.07, 0.05), 0xffffff, [0, 2.36, 0.98]);
  // stripes
  for (const x of [-0.58, 0.58]) {
    b.add(Box(0.08, 1.8, 0.05), 0xc23b2a, [x, 2.9, 0.92]);
    b.add(Box(0.08, 1.8, 0.05), 0xf3ead2, [x * 0.8, 2.9, 0.92]);
  }
  // crest of feathers
  const feathers = [0xe4602a, 0xffc53a, 0x2a8a4a, 0xc23b2a, 0xffc53a, 0xe4602a, 0x2a8a4a];
  feathers.forEach((c, i) => {
    const a = (i - 3) * 0.32;
    b.add(Cone(0.18, 1.1, 5), c, [Math.sin(a) * 0.9, 4.55 + Math.cos(a) * 0.2, 0.1], [0, 0, -a]);
  });
  // arms holding a boulder club
  b.add(Cyl(0.18, 0.15, 1.4, 6), wood, [-1.05, 2.6, 0.2], [0, 0, 0.6]);
  b.add(Cyl(0.18, 0.15, 1.4, 6), wood, [1.05, 2.6, 0.2], [0, 0, -0.6]);
  return b.build();
}

// Weapon plinth that gates the left lane.
export function plinthGeometry() {
  const b = new Builder();
  b.add(Box(2.9, 0.95, 1.3), 0x938679, [0, 0.475, 0]);
  b.add(Box(3.1, 0.16, 1.45), 0xb3a699, [0, 1.0, 0]);
  b.add(Box(2.9, 0.08, 1.32), 0x7a6e62, [0, 0.2, 0]);
  return b.build();
}

// ---------------------------------------------------------------- scenery
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Sahel-style mud-brick walls with pointed merlons and "toron" sticks.
export function wallsGeometry(wallXs, zStart, zEnd) {
  const b = new Builder();
  const mud = 0xb86f3c, mudLight = 0xcf8a52, stick = 0x5a3a1c;
  const len = zStart - zEnd;
  for (const x of wallXs) {
    b.add(Box(0.5, 1.3, len), mud, [x, 0.65, (zStart + zEnd) / 2]);
    b.add(Box(0.6, 0.12, len), mudLight, [x, 1.33, (zStart + zEnd) / 2]);
    for (let z = zStart - 0.6; z > zEnd; z -= 1.3) {
      b.add(Cone(0.17, 0.42, 4), mudLight, [x, 1.58, z], [0, Math.PI / 4, 0]);
      b.add(Cyl(0.035, 0.035, 0.85, 4), stick, [x, 0.95, z - 0.4], [0, 0, Math.PI / 2]);
    }
    // tower at the corridor mouth
    b.add(Cyl(0.5, 0.62, 2.1, 10), mud, [x, 1.05, zStart - 0.1]);
    b.add(Cone(0.52, 0.9, 10), mudLight, [x, 2.55, zStart - 0.1]);
    b.add(Cyl(0.035, 0.035, 1.3, 4), stick, [x, 1.5, zStart - 0.1], [0, 0, Math.PI / 2]);
    b.add(Cyl(0.035, 0.035, 1.3, 4), stick, [x, 1.0, zStart - 0.1], [Math.PI / 2, 0, 0]);
  }
  return b.build();
}

export function decorGeometry(seed = 7) {
  const r = rng(seed);
  const b = new Builder();
  const baobab = (x, z, s) => {
    b.add(Cyl(0.55 * s, 0.95 * s, 3.2 * s, 8), 0x8a7060, [x, 1.6 * s, z]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + r();
      b.add(Cyl(0.08 * s, 0.18 * s, 1.4 * s, 5), 0x7d6454, [x + Math.cos(a) * 0.6 * s, 3.6 * s, z + Math.sin(a) * 0.6 * s], [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7]);
      b.add(Sph(0.75 * s, 7, 5), i % 2 ? 0x6f8f3a : 0x7fa243, [x + Math.cos(a) * 1.15 * s, 4.2 * s, z + Math.sin(a) * 1.15 * s], [0, 0, 0], [1, 0.55, 1]);
    }
  };
  const hut = (x, z, s) => {
    b.add(Cyl(1.0 * s, 1.05 * s, 1.1 * s, 10), 0xc98b4f, [x, 0.55 * s, z]);
    b.add(Cone(1.45 * s, 1.2 * s, 10), 0xd9b25f, [x, 1.7 * s, z]);
    b.add(Box(0.45 * s, 0.7 * s, 0.1), 0x3b2412, [x, 0.35 * s, z + 1.0 * s]);
  };
  for (const side of [-1, 1]) {
    for (let z = 12; z > -100; z -= 5 + r() * 4) {
      const x = side * (8.8 + r() * 12);
      const k = r();
      if (k < 0.35) baobab(x, z, 0.8 + r() * 0.5);
      else if (k < 0.65) hut(x, z, 0.8 + r() * 0.35);
      else b.add(Sph(0.5 + r() * 0.6, 6, 4), 0xa39486, [x, 0.2, z], [0, r() * 3, 0], [1.2, 0.6, 1]);
      for (let g = 0; g < 4; g++) {
        b.add(Cone(0.18, 0.55 + r() * 0.3, 4), r() < 0.5 ? 0xc9a94a : 0xa8a040, [side * (7.2 + r() * 14), 0.25, z + r() * 5]);
      }
    }
  }
  // tufts of grass near the plaza
  for (let i = 0; i < 40; i++) {
    const x = (r() * 2 - 1) * 7.5, z = 2 + r() * 12;
    b.add(Cone(0.12, 0.4, 4), 0xc9a94a, [x, 0.2, z]);
  }
  return b.build();
}

// ---------------------------------------------------------------- textures
export function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d99c5f';
  g.fillRect(0, 0, 256, 256);
  const r = rng(3);
  for (let i = 0; i < 1400; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? 'rgba(160,90,45,0.18)' : 'rgba(255,220,170,0.16)';
    const s = 1 + r() * 5;
    g.fillRect(r() * 256, r() * 256, s, s);
  }
  for (let i = 0; i < 18; i++) {
    g.fillStyle = 'rgba(190,120,70,0.25)';
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 8 + r() * 18, 5 + r() * 9, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function tileTexture(label, kind) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 112;
  const g = c.getContext('2d');
  const styles = {
    recruit: ['#4fb3ff', '#1d5fd6', '#0b2f7a'],
    big: ['#ffe26a', '#f0a90f', '#8a5200'],
    boost: ['#7dff8a', '#1faa4a', '#0b5a24'],
  }[kind];
  const grd = g.createLinearGradient(0, 0, 0, 112);
  grd.addColorStop(0, styles[0]);
  grd.addColorStop(1, styles[1]);
  g.fillStyle = styles[2];
  roundRect(g, 2, 2, 252, 108, 18); g.fill();
  g.fillStyle = grd;
  roundRect(g, 8, 8, 240, 96, 14); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.25)';
  roundRect(g, 14, 12, 228, 30, 10); g.fill();
  g.font = `900 ${label.length > 4 ? 44 : 64}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = styles[2];
  g.strokeText(label, 128, 60);
  g.fillStyle = '#fff';
  g.fillText(label, 128, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,230,150,0.6)');
  grd.addColorStop(1, 'rgba(255,200,80,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(60,25,5,0.55)');
  grd.addColorStop(1, 'rgba(60,25,5,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,40,20,0.95)';
  g.lineWidth = 9;
  g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,60,20,0.28)';
  g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
