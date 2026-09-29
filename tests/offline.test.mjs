import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
function worker() {
  const handlers = {}, stored = new Map(), deleted = [], pending = [];
  const cache = {
    addAll: async assets => assets.forEach(asset => stored.set(asset, { asset })),
    put: async (key, value) => stored.set(key, value),
    match: async key => stored.get(typeof key === 'string' ? key : new URL(key.url).pathname.replace('/MOB/', './')),
  };
  const context = {
    URL, Response, fetch: async () => { throw Error('offline'); },
    self: { location: { origin: 'https://example.test' }, addEventListener: (name, fn) => handlers[name] = fn, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async () => cache, keys: async () => ['plp-v3', 'plp-v4', 'another-app'], delete: async key => deleted.push(key) },
  };
  vm.runInNewContext(source, context);
  return { handlers, stored, deleted, pending, event: { waitUntil: promise => pending.push(promise) } };
}
test('offline installation caches every local file and only removes old game caches', async () => {
  const w = worker();
  w.handlers.install(w.event); await Promise.all(w.pending);
  for (const file of w.stored.keys()) {
    if (file !== './') await readFile(new URL('../' + file, import.meta.url));
  }
  assert.ok(w.stored.has('./src/game.js'));
  assert.ok(w.stored.has('./vendor/three.module.min.js'));
  w.handlers.activate(w.event); await Promise.all(w.pending);
  assert.deepEqual(w.deleted, ['plp-v3']);
});
test('offline navigation resolves query URLs to the cached app', async () => {
  const w = worker();
  w.handlers.install(w.event); await Promise.all(w.pending);
  let result;
  w.handlers.fetch({ ...w.event, request: { method: 'GET', url: 'https://example.test/MOB/?level=3', mode: 'navigate' }, respondWith: value => result = value });
  assert.ok(await result);
});
