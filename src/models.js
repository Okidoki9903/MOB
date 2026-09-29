// Procedural, smooth low-poly models. Every model is merged into one
// vertex-coloured geometry so it can be drawn with an InstancedMesh.
// Parts can be tagged as "limbs": a vertex shader swings them around a pivot
// (legs, arms, wings) to animate walking and flying on the GPU.
import * as THREE from 'three';

const V2 = (x, y) => new THREE.Vector2(x, y);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

// ------------------------------------------------------------ primitives
export const Sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
export const Cap = (r, len, rad = 10) => new THREE.CapsuleGeometry(r, len, 4, rad);
export const Cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const Lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => V2(Math.max(0.0001, r), y)), seg);
export function Tube(points, r, seg = 12, rad = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V3(p[0], p[1], p[2])));
  return new THREE.TubeGeometry(curve, seg, r, rad, false);
}
// tapered tube (horns, branches): radius goes from r0 to r1
export function Horn(points, r0, r1, seg = 14, rad = 7) {
  const g = Tube(points, 1, seg, rad);
  const pos = g.attributes.position;
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V3(p[0], p[1], p[2])));
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const c = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= rad; j++) {
      const k = i * (rad + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

function hash3(x, y, z, s) {
  return Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + s * 4.1) * 43758.5453 % 1;
}
function noise3(x, y, z, s = 0) {
  return (
    Math.sin(x * 1.7 + s) * Math.sin(y * 2.3 + s * 1.3) * Math.sin(z * 1.9 + s * 0.7) * 0.6 +
    Math.sin(x * 4.1 + s * 2) * Math.sin(y * 3.7) * Math.sin(z * 4.3 + s) * 0.3 +
    hash3(Math.round(x * 3), Math.round(y * 3), Math.round(z * 3), s) * 0.05
  );
}

// recompute smooth normals on non-indexed geometry by welding by position
export function smoothNormals(g) {
  const pos = g.attributes.position;
  const map = new Map();
  const key = (i) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
  g.computeVertexNormals();
  const nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const a = map.get(k) || [0, 0, 0];
    a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i);
    map.set(k, a);
  }
  for (let i = 0; i < pos.count; i++) {
    const a = map.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    nor.setXYZ(i, a[0] / l, a[1] / l, a[2] / l);
  }
  return g;
}

// organic lumpy blob (foliage, rocks, hills)
export function Blob(r, detail = 2, amt = 0.18, seed = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const d = 1 + noise3(n.x * 2, n.y * 2, n.z * 2, seed) * amt;
    v.multiplyScalar(d);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return smoothNormals(g);
}

export function RoundedBox(w, h, d, r = 0.08, seg = 3) {
  const s = new THREE.Shape();
  const W = w - 2 * r, H = h - 2 * r;
  s.moveTo(-W / 2, -H / 2); s.lineTo(-W / 2, H / 2); s.lineTo(W / 2, H / 2); s.lineTo(W / 2, -H / 2); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: seg, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  g.deleteAttribute('uv');
  return g;
}

// ------------------------------------------------------------ builder
export class Builder {
  constructor() { this.parts = []; }
  // o: { limb:[x,z] swing weights, pivot:[x,y,z] }
  add(geo, color, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], o = {}) {
    const sc = typeof s === 'number' ? [s, s, s] : s;
    _m.compose(V3(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), V3(sc[0], sc[1], sc[2]));
    this.parts.push({ geo, color: new THREE.Color(color), m: _m.clone(), limb: o.limb || [0, 0], pivot: o.pivot || [0, 0, 0] });
    return this;
  }
  build() {
    const pos = [], nor = [], col = [], limb = [], piv = [];
    for (const { geo, color, m, limb: L, pivot: P } of this.parts) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(m);
      const pa = g.attributes.position.array;
      const na = g.attributes.normal.array;
      for (let i = 0; i < pa.length; i++) { pos.push(pa[i]); nor.push(na[i]); }
      for (let i = 0; i < pa.length / 3; i++) {
        col.push(color.r, color.g, color.b);
        limb.push(L[0], L[1]);
        piv.push(P[0], P[1], P[2]);
      }
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.setAttribute('aLimb', new THREE.Float32BufferAttribute(limb, 2));
    out.setAttribute('aPivot', new THREE.Float32BufferAttribute(piv, 3));
    out.computeBoundingSphere();
    return out;
  }
}

// ------------------------------------------------------------ animated material
// Instances carry iPhase (walk cycle) and iAnim (0 idle .. 1 full stride).
export function animate(material, { amp = 0.6, bob = 0.05, flap = 0 } = {}) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uAmp = { value: amp };
    sh.uniforms.uBob = { value: bob };
    sh.uniforms.uFlap = { value: flap };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aLimb; attribute vec3 aPivot;
        attribute float iPhase; attribute float iAnim;
        uniform float uAmp; uniform float uBob; uniform float uFlap;
        mat3 limbMat() {
          float sw = sin(iPhase) * uAmp * iAnim;
          float ax = aLimb.x * sw;
          float az = aLimb.y * (uFlap > 0.0 ? sin(iPhase) * uFlap : sw);
          float cx = cos(ax), sx = sin(ax), cz = cos(az), sz = sin(az);
          mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
          mat3 rz = mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0);
          return rz * rx;
        }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        objectNormal = limbMat() * objectNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed = limbMat() * (transformed - aPivot) + aPivot;
        transformed.y += abs(sin(iPhase)) * uBob * iAnim;`);
  };
  material.customProgramCacheKey = () => `anim-${amp}-${bob}-${flap}`;
  return material;
}

export function animDepth(opts) {
  return animate(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), opts);
}

// ------------------------------------------------------------ palette
export const PAL = {
  skin: 0x70412a,
  skinDark: 0x4d2b1a,
  hair: 0x2a180e,
  pagne: 0xe8622a,
  pagne2: 0xffd35a,
  eye: 0xffffff,
  pupil: 0x140b06,
  wood: 0x8b5a2b,
};

// ------------------------------------------------------------ kid
// A little slingshot kid, ~1 unit tall. Faces -Z (away from the camera).
export function kidGeometry() {
  const b = new Builder();
  const { skin, skinDark, pagne, pagne2 } = PAL;
  const hip = [0, 0.33, 0];
  for (const sx of [-1, 1]) {
    const o = { limb: [sx, 0], pivot: hip };
    b.add(Cap(0.058, 0.2, 8), skin, [sx * 0.075, 0.17, 0], [0, 0, 0], 1, o);
    b.add(Sph(0.062, 10, 8), skinDark, [sx * 0.075, 0.035, -0.035], [0, 0, 0], [1, 0.6, 1.6], o);
  }
  // pagne with a golden trim
  b.add(Lathe([[0.2, 0.2], [0.19, 0.25], [0.17, 0.32], [0.15, 0.38]], 18), pagne, [0, 0, 0]);
  b.add(Lathe([[0.205, 0.195], [0.205, 0.225]], 18), pagne2, [0, 0, 0]);
  // torso
  b.add(Lathe([[0.001, 0.34], [0.14, 0.35], [0.16, 0.43], [0.155, 0.52], [0.12, 0.61], [0.07, 0.66], [0.065, 0.7]], 16), skin, [0, 0, 0]);
  b.add(Sph(0.028, 8, 6), skinDark, [0, 0.44, -0.155]); // belly button
  // bead necklace
  const beadC = [0xd8261c, 0xf6ecd2, 0xffc53a];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.add(Sph(0.026, 8, 6), beadC[i % 3], [Math.sin(a) * 0.105, 0.62 - Math.cos(a) * 0.012, Math.cos(a) * 0.105 * -1]);
  }
  // head
  b.add(Sph(0.215, 22, 16), skin, [0, 0.85, 0], [0, 0, 0], [1, 1.04, 0.98]);
  b.add(new THREE.SphereGeometry(0.221, 22, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), PAL.hair, [0, 0.852, 0.01], [-0.35, 0, 0]);
  // feather tucked in the hair + leather pouch of stones on the back (readable from behind)
  b.add(Sph(0.05, 10, 8), 0xd8261c, [0.05, 1.12, 0.12], [-0.5, 0, -0.25], [0.5, 2.2, 0.25]);
  b.add(Sph(0.035, 8, 6), 0xffc53a, [0.08, 1.24, 0.18], [-0.5, 0, -0.25], [0.5, 1.6, 0.25]);
  b.add(Sph(0.1, 14, 10), 0xb07a45, [0.02, 0.48, 0.16], [0, 0, 0], [1.1, 1.2, 0.7]);
  b.add(Lathe([[0.075, 0.0], [0.06, 0.04]], 12), 0x7a4a24, [0.02, 0.58, 0.16]);
  for (const sx of [-1, 1]) b.add(Cyl(0.012, 0.012, 0.3, 5), 0xd8261c, [sx * 0.09, 0.56, 0.02], [0.3, 0, sx * 0.25]);
  for (const sx of [-1, 1]) {
    b.add(Sph(0.05, 10, 8), skin, [sx * 0.205, 0.84, 0.01], [0, 0, 0], [0.6, 1, 1]);
    b.add(Sph(0.047, 12, 10), PAL.eye, [sx * 0.078, 0.87, -0.176], [0, 0, 0], [1, 1.2, 0.55]);
    b.add(Sph(0.026, 10, 8), PAL.pupil, [sx * 0.074, 0.867, -0.2]);
    b.add(Sph(0.009, 6, 4), 0xffffff, [sx * 0.068, 0.878, -0.222]);
    b.add(Cap(0.011, 0.045, 5), PAL.hair, [sx * 0.08, 0.935, -0.18], [0, 0, Math.PI / 2 + sx * 0.25]);
  }
  b.add(Sph(0.034, 10, 8), skinDark, [0, 0.815, -0.205], [0, 0, 0], [1.2, 0.85, 1]);
  b.add(new THREE.TorusGeometry(0.045, 0.011, 6, 12, Math.PI), 0x5a1a10, [0, 0.77, -0.19], [0, 0, Math.PI]);
  // arms: left swings, right is raised holding the slingshot
  b.add(Cap(0.042, 0.2, 8), skin, [-0.19, 0.5, 0], [0, 0, 0.18], 1, { limb: [-0.8, 0], pivot: [0, 0.6, 0] });
  b.add(Sph(0.045, 8, 6), skin, [-0.21, 0.38, 0], [0, 0, 0], 1, { limb: [-0.8, 0], pivot: [0, 0.6, 0] });
  b.add(Cap(0.042, 0.28, 8), skin, [0.17, 0.76, -0.11], [-0.67, 0, 0]);
  b.add(Sph(0.048, 8, 6), skin, [0.17, 0.9, -0.22]);
  return b.build();
}

// Slingshot held in the right hand. `tier` 0..4 changes look.
export function slingshotGeometry(tier) {
  const b = new Builder();
  const wood = [0x9a6532, 0x6b6f78, 0xffc53a, 0xff6a2a, 0xa35cff][tier];
  const band = [0xc23b2a, 0x2a2a2a, 0xd8261c, 0xffe14d, 0x5cf6ff][tier];
  const s = [1, 1.1, 1.2, 1.3, 1.45][tier];
  const x = 0.17, y = 0.86, z = -0.24;
  const P = (dx, dy, dz = 0) => [x + dx * s, y + dy * s, z + dz * s];
  b.add(Tube([P(0, -0.02), P(0, 0.12)], 0.022 * s, 4, 8), wood);
  b.add(Tube([P(0, 0.11), P(-0.045, 0.17), P(-0.06, 0.25)], 0.019 * s, 8, 8), wood);
  b.add(Tube([P(0, 0.11), P(0.045, 0.17), P(0.06, 0.25)], 0.019 * s, 8, 8), wood);
  b.add(Tube([P(-0.06, 0.245), P(0, 0.2, 0.05), P(0.06, 0.245)], 0.008 * s, 10, 5), band);
  b.add(Sph(0.02 * s, 8, 6), 0x3a2a1a, P(0, 0.205, 0.05));
  if (tier >= 1) {
    b.add(Cyl(0.03 * s, 0.03 * s, 0.03 * s, 10), tier === 1 ? 0xc8ccd6 : 0xffffff, P(0, 0.03));
    b.add(Cyl(0.03 * s, 0.03 * s, 0.02 * s, 10), tier === 1 ? 0xc8ccd6 : 0xffffff, P(0, 0.09));
  }
  if (tier >= 2) b.add(Sph(0.035 * s, 12, 10), tier >= 3 ? band : 0xff3b3b, P(0, 0.13, -0.01));
  if (tier >= 4) {
    b.add(Sph(0.028 * s, 10, 8), band, P(-0.06, 0.26));
    b.add(Sph(0.028 * s, 10, 8), band, P(0.06, 0.26));
  }
  return b.build();
}

// ------------------------------------------------------------ enemies (face +Z)
// Fétiche imp: red body, carved ivory mask, raffia skirt.
export function impGeometry(boss = false) {
  const b = new Builder();
  const red = boss ? 0x8c1414 : 0xc7332a, redD = boss ? 0x5e0c0c : 0x8f2019;
  const hip = [0, 0.3, 0];
  for (const sx of [-1, 1]) {
    b.add(Cap(0.065, 0.2, 8), redD, [sx * 0.09, 0.16, 0], [0, 0, 0], 1, { limb: [sx, 0], pivot: hip });
    b.add(Sph(0.07, 10, 8), 0x2a0d0a, [sx * 0.09, 0.03, 0.03], [0, 0, 0], [1, 0.55, 1.4], { limb: [sx, 0], pivot: hip });
  }
  b.add(Lathe([[0.34, 0.12], [0.3, 0.2], [0.22, 0.33], [0.18, 0.38]], 22), 0xd8b25e);
  b.add(Lathe([[0.345, 0.115], [0.345, 0.14]], 22), 0xa8812e);
  b.add(Lathe([[0.001, 0.3], [0.2, 0.32], [0.24, 0.45], [0.22, 0.58], [0.15, 0.68], [0.08, 0.72]], 16), red);
  b.add(Sph(0.2, 18, 14), redD, [0, 0.86, -0.02]);
  // mask
  b.add(Sph(0.2, 20, 16), 0xf3e7cf, [0, 0.86, 0.1], [0, 0, 0], [0.9, 1.25, 0.5]);
  for (const sx of [-1, 1]) {
    b.add(Sph(0.045, 10, 8), 0x120605, [sx * 0.07, 0.9, 0.2], [0, 0, sx * 0.4], [1.4, 0.55, 0.5]);
    b.add(Sph(0.018, 6, 4), 0xffd23a, [sx * 0.07, 0.9, 0.215]);
    b.add(Cap(0.012, 0.16, 5), 0xc7332a, [sx * 0.12, 0.82, 0.19], [0, 0, sx * 0.1]);
    b.add(Horn([[sx * 0.12, 1.0, 0], [sx * 0.22, 1.12, 0], [sx * 0.2, 1.26, 0.04]], 0.05, 0.008), 0xefe3c4);
    b.add(Cap(0.05, 0.16, 8), redD, [sx * 0.27, 0.5, 0.03], [0.3, 0, sx * 0.3], 1, { limb: [-sx * 0.7, 0], pivot: [0, 0.62, 0] });
  }
  b.add(Cap(0.014, 0.06, 5), 0x120605, [0, 0.76, 0.205], [0, 0, Math.PI / 2]);
  b.add(Cap(0.012, 0.1, 5), 0xc7332a, [0, 0.95, 0.2], [0, 0, 0]);
  // spear
  b.add(Cyl(0.018, 0.018, 1.05, 8), PAL.wood, [0.32, 0.6, 0.12]);
  b.add(Sph(0.05, 10, 8), 0xd6d9de, [0.32, 1.18, 0.12], [0, 0, 0], [0.7, 2, 0.35]);
  if (boss) {
    for (const sx of [-1, 1]) b.add(Sph(0.1, 14, 10), 0xffc53a, [sx * 0.28, 0.66, 0], [0, 0, 0], [1, 0.7, 1]);
    b.add(new THREE.TorusGeometry(0.17, 0.035, 8, 20), 0xffc53a, [0, 0.66, 0], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.35;
      b.add(Sph(0.06, 10, 8), [0xe8622a, 0xffc53a, 0x2a8a4a][i % 3], [Math.sin(a) * 0.2, 1.12 + Math.cos(a) * 0.08, -0.05], [0, 0, -a], [0.5, 2.2, 0.3]);
    }
  }
  return b.build();
}

// Hyena: fast quadruped.
export function hyenaGeometry(boss = false) {
  const b = new Builder();
  const fur = boss ? 0x8a6a3a : 0xc3a06a, dark = 0x4f3e2a, belly = 0xe0c996;
  b.add(Cap(0.2, 0.42, 12), fur, [0, 0.55, 0], [Math.PI / 2 - 0.18, 0, 0]);
  b.add(Sph(0.16, 12, 10), belly, [0, 0.48, 0.02], [0, 0, 0], [1, 0.8, 2]);
  // mane
  for (let i = 0; i < 6; i++) b.add(Sph(0.06, 8, 6), dark, [0, 0.74 - i * 0.02, 0.28 - i * 0.1], [0, 0, 0], [0.6, 1.2, 1.2]);
  // spots
  for (const [x, y, z] of [[0.17, 0.6, 0.1], [-0.16, 0.58, -0.05], [0.14, 0.5, -0.2], [-0.15, 0.62, 0.18], [0.12, 0.66, -0.1]]) {
    b.add(Sph(0.045, 8, 6), dark, [x, y, z], [0, 0, 0], [0.4, 1, 1]);
  }
  // head
  b.add(Sph(0.16, 16, 12), fur, [0, 0.76, 0.42]);
  b.add(Cap(0.085, 0.14, 10), dark, [0, 0.7, 0.58], [Math.PI / 2, 0, 0]);
  b.add(Sph(0.035, 8, 6), 0x0d0805, [0, 0.72, 0.69]);
  for (const sx of [-1, 1]) {
    b.add(Sph(0.06, 10, 8), dark, [sx * 0.1, 0.92, 0.38], [0, 0, sx * -0.3], [0.8, 1.3, 0.4]);
    b.add(Sph(0.025, 8, 6), 0xffd23a, [sx * 0.07, 0.8, 0.54]);
  }
  b.add(Cap(0.015, 0.1, 5), 0xffffff, [0.03, 0.64, 0.62], [0.3, 0, 0]);
  // legs: diagonal pairs swing together
  const legs = [[0.12, 0.28, 1], [-0.12, 0.28, -1], [0.12, -0.25, -1], [-0.12, -0.25, 1]];
  for (const [x, z, ph] of legs) {
    const o = { limb: [ph, 0], pivot: [x, 0.55, z] };
    b.add(Cap(0.05, 0.36, 8), z > 0 ? fur : dark, [x, 0.3, z], [0, 0, 0], 1, o);
    b.add(Sph(0.055, 8, 6), dark, [x, 0.05, z + 0.03], [0, 0, 0], [1, 0.6, 1.4], o);
  }
  b.add(Horn([[0, 0.62, -0.38], [0, 0.55, -0.52], [0, 0.4, -0.58]], 0.05, 0.02), dark);
  if (boss) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.add(Horn([[Math.cos(a) * 0.1, 0.9, 0.42 + Math.sin(a) * 0.1], [Math.cos(a) * 0.12, 1.02, 0.42 + Math.sin(a) * 0.12]], 0.03, 0.005), 0xffc53a);
    }
    b.add(new THREE.TorusGeometry(0.11, 0.025, 8, 16), 0xffc53a, [0, 0.9, 0.42], [Math.PI / 2, 0, 0]);
  }
  return b.build();
}

// Buffalo brute: big, slow, hits hard.
export function bruteGeometry(boss = false) {
  const b = new Builder();
  const hide = boss ? 0x3a2b30 : 0x5a4841, hideD = 0x2e2320, paint = 0xd8261c;
  const hip = [0, 0.42, 0];
  for (const sx of [-1, 1]) {
    b.add(Cap(0.1, 0.26, 10), hideD, [sx * 0.15, 0.22, 0], [0, 0, 0], 1, { limb: [sx * 0.8, 0], pivot: hip });
    b.add(Sph(0.1, 10, 8), 0x1a1210, [sx * 0.15, 0.05, 0.04], [0, 0, 0], [1, 0.6, 1.4], { limb: [sx * 0.8, 0], pivot: hip });
  }
  b.add(Lathe([[0.3, 0.3], [0.33, 0.42], [0.28, 0.48]], 18), 0x7a4e2a);
  b.add(Lathe([[0.001, 0.4], [0.3, 0.44], [0.38, 0.62], [0.4, 0.8], [0.3, 0.95], [0.15, 1.0]], 18), hide);
  b.add(Lathe([[0.395, 0.72], [0.395, 0.76]], 18), paint);
  // head
  b.add(Sph(0.22, 18, 14), hide, [0, 1.08, 0.12], [0, 0, 0], [1.1, 1, 1]);
  b.add(Sph(0.15, 14, 10), 0x7d6a60, [0, 1.0, 0.3], [0, 0, 0], [1, 0.8, 0.9]);
  b.add(new THREE.TorusGeometry(0.05, 0.012, 6, 14), 0xffc53a, [0, 0.93, 0.4], [0.2, 0, 0]);
  for (const sx of [-1, 1]) {
    b.add(Horn([[sx * 0.14, 1.18, 0.08], [sx * 0.42, 1.2, 0.05], [sx * 0.52, 1.36, 0.14], [sx * 0.44, 1.46, 0.2]], 0.08, 0.012, 16, 8), 0xefe3c4);
    b.add(Sph(0.035, 8, 6), 0xff3b2a, [sx * 0.09, 1.12, 0.3]);
    b.add(Cap(0.08, 0.3, 10), hide, [sx * 0.46, 0.72, 0.05], [0, 0, sx * 0.25], 1, { limb: [-sx * 0.6, 0], pivot: [0, 0.92, 0] });
  }
  // club
  b.add(Cyl(0.035, 0.05, 0.8, 8), PAL.wood, [0.55, 0.6, 0.25], [0.6, 0, 0], 1, { limb: [0.6, 0], pivot: [0, 0.92, 0] });
  b.add(Blob(0.14, 1, 0.3, 3), 0x6b4a2a, [0.55, 0.8, 0.55], [0, 0, 0], 1, { limb: [0.6, 0], pivot: [0, 0.92, 0] });
  if (boss) {
    for (let i = 0; i < 7; i++) {
      const a = (i - 3) * 0.3;
      b.add(Sph(0.07, 10, 8), [0xe8622a, 0xffc53a, 0x2a8a4a][i % 3], [Math.sin(a) * 0.3, 1.34 + Math.cos(a) * 0.1, 0], [0, 0, -a], [0.5, 2.4, 0.3]);
    }
  }
  return b.build();
}

// Vulture: flies over the corridor.
export function vultureGeometry() {
  const b = new Builder();
  const feather = 0x3b302b, featherL = 0x5b4c42, neck = 0xd9907c;
  b.add(Sph(0.2, 14, 10), feather, [0, 0, 0], [0, 0, 0], [1, 0.8, 1.5]);
  b.add(Sph(0.12, 12, 10), 0xe8dccb, [0, 0.1, 0.22], [0, 0, 0], [1.2, 0.7, 0.8]);
  b.add(Cap(0.05, 0.12, 8), neck, [0, 0.14, 0.34], [1.1, 0, 0]);
  b.add(Sph(0.08, 12, 10), neck, [0, 0.19, 0.44]);
  b.add(Horn([[0, 0.18, 0.5], [0, 0.17, 0.58], [0, 0.12, 0.61]], 0.035, 0.008), 0xffc53a);
  for (const sx of [-1, 1]) {
    b.add(Sph(0.018, 6, 4), 0xff3b2a, [sx * 0.05, 0.22, 0.49]);
    const o = { limb: [0, sx], pivot: [sx * 0.12, 0.05, 0] };
    b.add(Sph(0.36, 14, 8), feather, [sx * 0.42, 0.05, 0], [0, 0, 0], [1, 0.12, 0.45], o);
    b.add(Sph(0.2, 12, 6), featherL, [sx * 0.72, 0.04, -0.05], [0, 0, 0], [1.2, 0.1, 0.5], o);
  }
  b.add(Sph(0.16, 12, 6), feather, [0, 0, -0.34], [0, 0, 0], [1, 0.15, 1]);
  return b.build();
}

// Right-lane guardian: a giant carved mask totem on a stone plinth. Faces +Z.
export function guardianGeometry() {
  const b = new Builder();
  b.add(RoundedBox(3.0, 1.2, 2.0, 0.15), 0x9a8e82, [0, 0.6, 0]);
  b.add(RoundedBox(3.2, 0.2, 2.2, 0.08), 0xb3a699, [0, 1.25, 0]);
  const wood = 0x6b3e1f, face = 0xd8a86a;
  b.add(Lathe([[0.85, 1.3], [0.95, 1.8], [0.9, 2.8], [0.8, 3.8], [0.6, 4.2], [0.001, 4.3]], 20), wood);
  b.add(Sph(1.0, 24, 18), face, [0, 3.0, 0.45], [0, 0, 0], [0.85, 1.35, 0.45]);
  b.add(Sph(0.5, 16, 12), 0x3a2010, [0, 3.62, 0.72], [0, 0, 0], [1.4, 0.25, 0.3]);
  for (const sx of [-1, 1]) {
    b.add(Sph(0.2, 14, 10), 0x140a05, [sx * 0.33, 3.3, 0.8], [0, 0, sx * -0.2], [1.4, 0.8, 0.5]);
    b.add(Sph(0.08, 10, 8), 0xffe45c, [sx * 0.33, 3.3, 0.9]);
    b.add(Cap(0.05, 1.2, 8), 0xc23b2a, [sx * 0.55, 2.9, 0.72], [0, 0, sx * 0.06]);
    b.add(Cap(0.04, 1.0, 8), 0xf3ead2, [sx * 0.43, 2.8, 0.8], [0, 0, sx * 0.06]);
    b.add(Horn([[sx * 0.9, 2.3, 0.1], [sx * 1.25, 2.5, 0.4], [sx * 1.2, 2.9, 0.8]], 0.2, 0.12), wood);
    b.add(Blob(0.45, 1, 0.25, sx + 5), 0x7d7066, [sx * 1.2, 3.1, 0.9]);
  }
  b.add(Sph(0.16, 12, 10), 0xb98a52, [0, 3.0, 0.95], [0, 0, 0], [0.8, 2.0, 0.8]);
  b.add(Sph(0.3, 14, 10), 0x140a05, [0, 2.35, 0.82], [0, 0, 0], [1.4, 0.45, 0.4]);
  for (let i = -3; i <= 3; i++) b.add(Sph(0.045, 8, 6), 0xffffff, [i * 0.09, 2.4, 0.92], [0, 0, 0], [0.8, 1.5, 0.6]);
  const feathers = [0xe8622a, 0xffc53a, 0x2a8a4a, 0xc23b2a, 0xffc53a, 0xe8622a, 0x2a8a4a, 0xc23b2a, 0xffc53a];
  feathers.forEach((c, i) => {
    const a = (i - 4) * 0.27;
    b.add(Sph(0.2, 12, 8), c, [Math.sin(a) * 1.0, 4.3 + Math.cos(a) * 0.5, 0.1], [0, 0, -a], [0.55, 2.4, 0.2]);
  });
  return b.build();
}

// Weapon plinth that gates the left lane.
export function plinthGeometry() {
  const b = new Builder();
  b.add(RoundedBox(2.7, 0.9, 1.3, 0.12), 0x9a8e82, [0, 0.45, 0]);
  b.add(RoundedBox(2.95, 0.18, 1.45, 0.07), 0xc0b3a5, [0, 0.95, 0]);
  b.add(RoundedBox(2.95, 0.14, 1.45, 0.06), 0x7d7166, [0, 0.07, 0]);
  for (const sx of [-1, 1]) b.add(Sph(0.1, 10, 8), 0xffc53a, [sx * 1.05, 0.5, 0.66], [0, 0, 0], [1, 1, 0.4]);
  return b.build();
}

// ------------------------------------------------------------ scenery
export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Sahel mud-brick walls: rounded tops, buttresses, bullet pinnacles, torons.
export function wallsGeometry(wallXs, zStart, zEnd) {
  const r = rng(5);
  const b = new Builder();
  const mud = 0xbf7440, mudL = 0xd48b52, mudD = 0xa1602f, stick = 0x5a3a1c;
  for (const x of wallXs) {
    for (let z = zStart; z > zEnd; z -= 4) {
      const len = 4.02;
      const h = 1.15 + r() * 0.1;
      b.add(RoundedBox(0.5, h, len, 0.12), mud, [x, h / 2, z - len / 2]);
      b.add(Cap(0.25, len - 0.5, 10), mudL, [x, h, z - len / 2], [Math.PI / 2, 0, 0], [1, 1, 0.55]);
      // buttress + pinnacle every segment
      b.add(Lathe([[0.3, 0], [0.28, 0.9], [0.22, 1.3], [0.12, 1.65], [0.001, 1.78]], 12), mudD, [x, 0, z - 2]);
      b.add(Sph(0.06, 8, 6), 0xf3ead2, [x, 1.8, z - 2]);
      for (let k = 0; k < 3; k++) {
        const zz = z - 0.7 - k * 1.3;
        b.add(Lathe([[0.12, 0], [0.1, 0.18], [0.05, 0.32], [0.001, 0.36]], 8), mudL, [x, h + 0.08, zz]);
        b.add(Cyl(0.03, 0.03, 0.8, 6), stick, [x, 0.75 + (k % 2) * 0.25, zz - 0.45], [0, 0, Math.PI / 2]);
      }
    }
    // big tower at the corridor mouth
    b.add(Lathe([[0.62, 0], [0.6, 0.8], [0.52, 1.8], [0.4, 2.3], [0.25, 2.65], [0.001, 2.8]], 18), mud, [x, 0, zStart + 0.1]);
    b.add(Lathe([[0.605, 0.95], [0.605, 1.05]], 18), mudL, [x, 0, zStart + 0.1]);
    b.add(Sph(0.11, 10, 8), 0xf6efe0, [x, 2.86, zStart + 0.1], [0, 0, 0], [1, 1.3, 1]);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      b.add(Cyl(0.03, 0.03, 0.4, 6), stick, [x + Math.cos(a) * 0.55, 1.4 + k * 0.2, zStart + 0.1 + Math.sin(a) * 0.55], [0, -a, Math.PI / 2]);
    }
  }
  return b.build();
}

function baobab(b, r, x, z, s) {
  b.add(Lathe([[1.0, 0], [0.95, 0.4], [1.05, 1.4], [0.85, 2.6], [0.55, 3.2], [0.4, 3.5]], 14), 0x8e7564, [x, 0, z], [0, r() * 3, 0], s);
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const ex = Math.cos(a) * (1.3 + r() * 0.5), ez = Math.sin(a) * (1.3 + r() * 0.5);
    b.add(Horn([[0, 3.3, 0], [ex * 0.5, 3.8, ez * 0.5], [ex, 4.2 + r() * 0.4, ez]], 0.2, 0.05, 8, 6), 0x806858, [x, 0, z], [0, 0, 0], s);
    b.add(Blob(0.75, 1, 0.3, i + x), i % 2 ? 0x6f9a3c : 0x86ad48, [x + ex * s, (4.4 + r() * 0.4) * s, z + ez * s], [0, 0, 0], [s, s * 0.6, s]);
  }
}
function acacia(b, r, x, z, s) {
  b.add(Horn([[0, 0, 0], [0.2, 1.4, 0.1], [0.5, 2.6, 0.2], [0.6, 3.1, 0.2]], 0.16, 0.08, 10, 7), 0x6b5140, [x, 0, z], [0, r() * 6, 0], s);
  for (let i = 0; i < 4; i++) {
    b.add(Blob(1.1, 1, 0.25, i * 3 + z), i % 2 ? 0x7a9a3a : 0x8fb04a, [x + (0.5 + (r() - 0.5) * 1.6) * s, (3.3 + r() * 0.3) * s, z + (r() - 0.5) * 1.6 * s], [0, 0, 0], [s * 1.2, s * 0.3, s * 1.2]);
  }
}
function hut(b, r, x, z, s) {
  const rot = r() * 6;
  b.add(Lathe([[1.0, 0], [1.02, 0.6], [0.98, 1.15]], 20), 0xc98b4f, [x, 0, z], [0, rot, 0], s);
  b.add(Lathe([[1.02, 0.35], [1.03, 0.45]], 20), 0x8f4a28, [x, 0, z], [0, 0, 0], s);
  b.add(Lathe([[1.55, 1.0], [1.35, 1.25], [0.9, 1.8], [0.35, 2.3], [0.08, 2.55], [0.001, 2.6]], 20), 0xd9b25f, [x, 0, z], [0, 0, 0], s);
  b.add(Lathe([[1.56, 0.98], [1.5, 1.08]], 20), 0xb88f3c, [x, 0, z], [0, 0, 0], s);
  const dx = Math.sin(rot), dz = Math.cos(rot);
  b.add(RoundedBox(0.5, 0.8, 0.2, 0.08), 0x3b2412, [x + dx * 0.95 * s, 0.4 * s, z + dz * 0.95 * s], [0, rot, 0], s);
}
function granary(b, r, x, z, s) {
  for (const [dx, dz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) b.add(Cyl(0.07, 0.08, 0.6, 6), 0x6b4a2a, [x + dx * s, 0.3 * s, z + dz * s], [0, 0, 0], s);
  b.add(Lathe([[0.6, 0], [0.75, 0.4], [0.7, 0.9], [0.45, 1.1]], 16), 0xc47a44, [x, 0.6 * s, z], [0, 0, 0], s);
  b.add(Lathe([[0.9, 0], [0.6, 0.35], [0.2, 0.7], [0.001, 0.8]], 16), 0xd9b25f, [x, 1.6 * s, z], [0, 0, 0], s);
}
function jar(b, r, x, z, s, c) {
  b.add(Lathe([[0.001, 0], [0.18, 0.02], [0.28, 0.2], [0.26, 0.38], [0.14, 0.5], [0.13, 0.58], [0.16, 0.6]], 14), c, [x, 0, z], [0, 0, 0], s);
}
function drum(b, x, z, s) {
  b.add(Lathe([[0.001, 0], [0.14, 0], [0.12, 0.15], [0.08, 0.3], [0.2, 0.55], [0.22, 0.62]], 14), 0x7a4a24, [x, 0, z], [0, 0, 0], s);
  b.add(Cyl(0.22, 0.22, 0.02, 14), 0xe8d6b0, [x, 0.63 * s, z], [0, 0, 0], s);
}

export function decorGeometry(seed = 7) {
  const r = rng(seed);
  const b = new Builder();
  for (const side of [-1, 1]) {
    for (let z = 14; z > -110; z -= 4.5 + r() * 3.5) {
      const x = side * (9.5 + r() * 14);
      const k = r();
      if (k < 0.2) baobab(b, r, x, z, 0.7 + r() * 0.4);
      else if (k < 0.42) acacia(b, r, x, z, 0.8 + r() * 0.4);
      else if (k < 0.66) hut(b, r, x, z, 0.8 + r() * 0.3);
      else if (k < 0.76) granary(b, r, x, z, 0.8 + r() * 0.3);
      else b.add(Blob(0.6 + r() * 0.6, 1, 0.35, z), r() < 0.5 ? 0xa39486 : 0x8f8274, [x, 0.15, z], [0, r() * 3, 0], [1.3, 0.6, 1]);
      if (r() < 0.6) b.add(Blob(0.5 + r() * 0.4, 1, 0.3, x), 0x7f9c43, [side * (7.6 + r() * 10), 0.3, z + r() * 3], [0, 0, 0], [1.2, 0.7, 1.2]);
      if (r() < 0.35) jar(b, r, side * (7.3 + r() * 2), z + r() * 2, 0.8 + r() * 0.5, [0xb8663a, 0x9a5230, 0xd08850][Math.floor(r() * 3)]);
    }
  }
  // village life around the plaza
  drum(b, -6.9, 2.5, 1.2); drum(b, -7.5, 3.4, 0.9);
  jar(b, r, 7.0, 2.0, 1.2, 0xb8663a); jar(b, r, 7.6, 3.0, 0.9, 0x9a5230); jar(b, r, 7.3, 4.0, 1.0, 0xd08850);
  for (let i = 0; i < 10; i++) {
    const x = (r() < 0.5 ? -1 : 1) * (7.2 + r() * 3), z = 4 + r() * 10;
    b.add(Blob(0.25 + r() * 0.3, 1, 0.3, i), 0xa39486, [x, 0.08, z], [0, r() * 3, 0], [1.3, 0.6, 1]);
  }
  // wooden fence around the plaza edge
  for (const side of [-1, 1]) {
    for (let z = -9; z < 12; z += 1.1) {
      b.add(Cyl(0.05, 0.06, 0.9, 6), 0x7a5634, [side * 6.9, 0.45, z], [0, 0, (r() - 0.5) * 0.1]);
    }
    b.add(Tube([[side * 6.9, 0.6, -9], [side * 6.92, 0.62, 1], [side * 6.9, 0.6, 12]], 0.035, 10, 5), 0x6b4a2a);
    b.add(Tube([[side * 6.9, 0.3, -9], [side * 6.92, 0.28, 1], [side * 6.9, 0.3, 12]], 0.035, 10, 5), 0x6b4a2a);
  }
  return b.build();
}

// distant mesas and hills
export function hillsGeometry() {
  const r = rng(99);
  const b = new Builder();
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (30 + r() * 40), z = -40 - r() * 90;
    const s = 6 + r() * 10;
    b.add(Blob(1, 2, 0.35, i), r() < 0.5 ? 0xb97a4e : 0xa86a44, [x, -s * 0.15, z], [0, r() * 3, 0], [s * 1.6, s * (0.5 + r() * 0.4), s]);
  }
  for (let i = 0; i < 6; i++) {
    const x = (r() - 0.5) * 80, z = -140 - r() * 30, s = 10 + r() * 10;
    b.add(Lathe([[1.2, 0], [1.05, 0.2], [0.95, 0.7], [0.9, 0.95], [0.001, 1.0]], 12), 0xc28a5c, [x, 0, z], [0, r() * 3, 0], [s, s * 0.5, s]);
  }
  return b.build();
}

export function cloudGeometry() {
  const b = new Builder();
  const r = rng(12);
  for (let i = 0; i < 7; i++) b.add(Blob(1, 1, 0.2, i), 0xffffff, [(r() - 0.5) * 4, r() * 0.8, (r() - 0.5) * 1.5], [0, 0, 0], [1 + r(), 0.7 + r() * 0.4, 1 + r() * 0.5]);
  return b.build();
}

export function birdGeometry() {
  const b = new Builder();
  b.add(Sph(0.12, 8, 6), 0x2a211c, [0, 0, 0], [0, 0, 0], [0.8, 0.6, 1.6]);
  for (const sx of [-1, 1]) b.add(Sph(0.35, 10, 6), 0x2a211c, [sx * 0.35, 0, 0], [0, 0, 0], [1, 0.08, 0.35], { limb: [0, sx], pivot: [sx * 0.05, 0, 0] });
  return b.build();
}

export function torchGeometry() {
  const b = new Builder();
  b.add(Cyl(0.05, 0.07, 1.6, 8), 0x5a3a1c, [0, 0.8, 0]);
  b.add(Lathe([[0.06, 0], [0.16, 0.12], [0.18, 0.22]], 10), 0x3a2a1a, [0, 1.55, 0]);
  return b.build();
}

// ------------------------------------------------------------ textures
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function groundTexture() {
  const [c, g] = canvas(1024, 1024);
  const r = rng(3);
  g.fillStyle = '#d99c5f';
  g.fillRect(0, 0, 1024, 1024);
  // large tonal patches
  for (let i = 0; i < 90; i++) {
    const x = r() * 1024, y = r() * 1024, rad = 40 + r() * 140;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const col = r() < 0.5 ? '200,120,70' : '236,180,120';
    grd.addColorStop(0, `rgba(${col},0.35)`);
    grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd;
    for (const ox of [-1024, 0, 1024]) for (const oy of [-1024, 0, 1024]) {
      g.save(); g.translate(ox, oy); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore();
    }
  }
  // grain
  for (let i = 0; i < 26000; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? `rgba(130,70,35,${0.08 + r() * 0.12})` : `rgba(255,225,180,${0.06 + r() * 0.1})`;
    const s = 1 + r() * 2.5;
    g.fillRect(r() * 1024, r() * 1024, s, s);
  }
  // pebbles with a little shading
  for (let i = 0; i < 520; i++) {
    const x = r() * 1024, y = r() * 1024, rx = 2 + r() * 6, ry = rx * (0.6 + r() * 0.4), a = r() * 3;
    g.fillStyle = 'rgba(90,50,25,0.3)';
    g.beginPath(); g.ellipse(x + 1.5, y + 1.5, rx, ry, a, 0, 7); g.fill();
    const shade = 150 + Math.floor(r() * 70);
    g.fillStyle = `rgb(${shade + 40},${shade - 10},${shade - 50})`;
    g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,240,210,0.45)';
    g.beginPath(); g.ellipse(x - rx * 0.3, y - ry * 0.3, rx * 0.4, ry * 0.35, a, 0, 7); g.fill();
  }
  // hairline cracks
  g.strokeStyle = 'rgba(110,55,25,0.35)';
  for (let i = 0; i < 40; i++) {
    let x = r() * 1024, y = r() * 1024;
    g.lineWidth = 0.8 + r() * 1.2;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function pathTexture() {
  const [c, g] = canvas(512, 512);
  const r = rng(8);
  g.fillStyle = '#e6b27a';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(160,95,50,${0.1 + r() * 0.1})` : `rgba(255,230,190,${0.1 + r() * 0.1})`;
    g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2);
  }
  // footprints / stripes worn in the middle
  for (let i = 0; i < 60; i++) {
    g.fillStyle = 'rgba(170,100,55,0.18)';
    g.beginPath(); g.ellipse(180 + r() * 150, r() * 512, 6, 11, 0, 0, 7); g.fill();
  }
  const edge = g.createLinearGradient(0, 0, 512, 0);
  edge.addColorStop(0, 'rgba(150,80,40,0.45)'); edge.addColorStop(0.12, 'rgba(150,80,40,0)');
  edge.addColorStop(0.88, 'rgba(150,80,40,0)'); edge.addColorStop(1, 'rgba(150,80,40,0.45)');
  g.fillStyle = edge; g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function grassTexture() {
  const [c, g] = canvas(128, 128);
  const r = rng(21);
  for (let i = 0; i < 26; i++) {
    const x = 20 + r() * 88, h = 50 + r() * 70, bend = (r() - 0.5) * 40;
    const col = r() < 0.5 ? [200, 170, 80] : r() < 0.5 ? [150, 160, 70] : [220, 190, 110];
    const grd = g.createLinearGradient(0, 128, 0, 128 - h);
    grd.addColorStop(0, `rgb(${col[0] - 35},${col[1] - 40},${col[2] - 25})`);
    grd.addColorStop(1, `rgb(${col[0]},${col[1]},${col[2]})`);
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x - 3, 128);
    g.quadraticCurveTo(x + bend * 0.5, 128 - h * 0.5, x + bend, 128 - h);
    g.quadraticCurveTo(x + bend * 0.5 + 1, 128 - h * 0.5, x + 3, 128);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(0x6fb1e8) }, mid: { value: new THREE.Color(0xf9d9a8) }, bot: { value: new THREE.Color(0xf4b77e) }, sun: { value: new THREE.Vector3(0.35, 0.28, -1).normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sun; varying vec3 vP;
      void main(){
        float h = vP.y;
        vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h*1.6,0.0,1.0), 0.7)) : mix(mid, bot, clamp(-h*4.0,0.0,1.0));
        float s = max(dot(normalize(vP), sun), 0.0);
        c += vec3(1.0,0.85,0.55) * (pow(s, 400.0) * 1.5 + pow(s, 12.0) * 0.35);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

export function tileTexture(label, kind) {
  const [c, g] = canvas(256, 180);
  const styles = {
    recruit: ['#6cc4ff', '#1d67e0', '#0a2f78'],
    big: ['#fff08a', '#f2a90f', '#7a4800'],
    boost: ['#8dff9a', '#1faa4a', '#0b5a24'],
  }[kind];
  const grd = g.createLinearGradient(0, 0, 0, 180);
  grd.addColorStop(0, styles[0]);
  grd.addColorStop(1, styles[1]);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 180);
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.beginPath(); g.ellipse(128, 20, 140, 45, 0, 0, 7); g.fill();
  g.font = `900 ${label.length > 4 ? 52 : 92}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 12;
  g.lineJoin = 'round';
  g.strokeStyle = styles[2];
  g.strokeText(label, 128, 96);
  g.fillStyle = '#fff';
  g.fillText(label, 128, 96);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function glowTexture() {
  const [c, g] = canvas(128, 128);
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

export function ringTexture() {
  const [c, g] = canvas(128, 128);
  g.strokeStyle = 'rgba(255,40,20,0.95)';
  g.lineWidth = 9;
  g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,60,20,0.28)';
  g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}
