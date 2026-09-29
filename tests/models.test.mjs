import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === 'three'
    ? { url: new URL('../vendor/three.module.min.js', import.meta.url).href, shortCircuit: true }
    : nextResolve(specifier, context);
}});
const M = await import('../src/models.js');
const THREE = await import('three');

test('all five slings stretch the elastic while their rigid forks stay stationary', () => {
  for (let tier = 0; tier < 5; tier++) {
    const geometry = M.slingshotGeometry(tier);
    const draw = geometry.getAttribute('aDraw');
    const release = geometry.getAttribute('aRelease');
    assert.equal(draw.count, geometry.getAttribute('position').count);
    let stationary = 0, stretched = 0, snapped = 0;
    for (let i = 0; i < draw.count; i++) {
      assert.equal(draw.getX(i), 0);
      assert.equal(draw.getY(i), 0);
      assert.ok(Number.isFinite(draw.getZ(i)));
      if (draw.getZ(i) === 0) stationary++;
      if (Math.abs(draw.getZ(i) - 0.34) < 1e-6) stretched++;
      if (Math.abs(release.getZ(i) + 0.05) < 1e-6) snapped++;
    }
    assert.ok(stationary > 100, 'rigid fork vertices cannot follow the string');
    assert.ok(stretched > 100, 'pouch reaches the pulling hand');
    assert.ok(snapped > 100, 'pouch snaps forward when the hand releases');
    geometry.dispose();
  }
});

test('draw arm bends at the elbow and reaches the same pouch target', () => {
  const g = M.kidGeometry();
  const draw = g.getAttribute('aDraw');
  const release = g.getAttribute('aRelease');
  const position = g.getAttribute('position');
  let handVertices = 0, elbowVertices = 0;
  for (let i = 0; i < position.count; i++) {
    for (const a of [draw, release]) {
      assert.ok(Number.isFinite(a.getX(i)) && Number.isFinite(a.getY(i)) && Number.isFinite(a.getZ(i)));
    }
    if (Math.abs(draw.getZ(i) - 0.34) < 1e-6 && Math.abs(draw.getX(i)) < 1e-6 && Math.abs(draw.getY(i)) < 1e-6) {
      handVertices++;
      assert.ok(Math.abs(release.getZ(i) - 0.44) < 1e-6, 'released hand follows through backwards');
    }
    if (Math.abs(draw.getX(i) + 0.02) < 1e-6 && Math.abs(draw.getZ(i) - 0.32) < 1e-6) elbowVertices++;
    if (position.getY(i) < 0.3) assert.equal(draw.getZ(i), 0, 'legs retain their independent walking animation');
  }
  assert.ok(handVertices > 100);
  assert.ok(elbowVertices > 100);
  g.dispose();
});

test('body and shadow shaders share shooting deformation without changing other actors', () => {
  for (const material of [M.animate(new THREE.MeshStandardMaterial(), { shoot: true }), M.animDepth({ shoot: true })]) {
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>' };
    material.onBeforeCompile(shader);
    assert.match(shader.vertexShader, /attribute vec2 iShot/);
    assert.match(shader.vertexShader, /transformed \+= aDraw/);
    material.dispose();
  }
  const mat = M.animate(new THREE.MeshStandardMaterial());
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>' };
  mat.onBeforeCompile(shader);
  assert.doesNotMatch(shader.vertexShader, /iShot/);
  mat.dispose();
});
