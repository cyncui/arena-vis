import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/lib/hand-controls/session.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { HandTrackingSession } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
let now = 1000;
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
globalThis.window = { isSecureContext: true };
globalThis.OffscreenCanvas = class {};
let interval;
globalThis.setInterval = callback => { interval = callback; return 1; };
globalThis.clearInterval = () => { interval = null; };
let workers;
class FakeWorker {
  constructor() { workers.push(this); this.messages = []; }
  postMessage(message) { this.messages.push(message); if (message.type === 'init') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } })); }
  terminate() { this.terminated = true; }
  result(timestamp, hands = []) { this.onmessage?.({ data: { type: 'result', timestamp, hands } }); }
}
globalThis.Worker = FakeWorker;
let closed = 0;
globalThis.createImageBitmap = async () => ({ close: () => closed++ });
const stream = () => {
  const track = { stopped: false, stop() { this.stopped = true; } };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
};
const fixture = camera => {
  workers = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: camera } } });
  const states = [], frames = [];
  const video = { readyState: 2, srcObject: null, play: async () => {}, pause() {} };
  const session = new HandTrackingSession(video, frame => frames.push(frame), (state, message) => states.push({ state, message }));
  return { session, states, frames, video };
};
const passed = [];
const check = async (name, test) => { await test(); passed.push(name); };
await check('camera permission failure remains recoverable', async () => {
  const f = fixture(async () => { throw new DOMException('denied', 'NotAllowedError'); });
  await f.session.start();
  assert.equal(f.states.at(-1).state, 'error');
  assert.match(f.states.at(-1).message, /permission was denied/);
  assert.equal(workers[0].terminated, true);
});
await check('cancelled startup stops a late camera stream', async () => {
  let resolve;
  const camera = new Promise(done => { resolve = done; });
  const f = fixture(() => camera);
  const start = f.session.start();
  f.session.stop();
  const media = stream(); resolve(media);
  await start;
  assert.equal(media.track.stopped, true);
  assert.equal(f.video.srcObject, null);
  assert.equal(f.states.at(-1).state, 'idle');
});
await check('one inference in flight and pause keeps camera running', async () => {
  const media = stream(), f = fixture(async () => media);
  await f.session.start();
  now += 50; interval(); await tick();
  const worker = workers[0];
  interval(); await tick();
  assert.equal(worker.messages.filter(message => message.type === 'frame').length, 1);
  const timestamp = worker.messages.at(-1).timestamp;
  f.session.pause();
  assert.equal(media.track.stopped, false);
  now += 50; f.session.resume();
  const count = f.frames.length;
  worker.result(timestamp, []);
  assert.equal(f.frames.length, count);
  f.session.stop();
  assert.equal(media.track.stopped, true);
  assert.equal(worker.terminated, true);
  assert.equal(interval, null);
});
await check('stale and invalid results clear navigation', async () => {
  const f = fixture(async () => stream());
  await f.session.start();
  now += 250; workers[0].result(now - 210, []);
  assert.deepEqual(f.frames.at(-1).hands, []);
  workers[0].result(now + 1, [[{ x: NaN, y: 0, z: 0 }]]);
  assert.deepEqual(f.frames.at(-1).hands, []);
  f.session.stop();
});
await check('worker failure releases camera and allows retry', async () => {
  const media = stream(), f = fixture(async () => media);
  await f.session.start(); workers[0].onerror();
  assert.equal(f.states.at(-1).state, 'error');
  assert.equal(media.track.stopped, true);
  await f.session.start();
  assert.equal(f.states.at(-1).state, 'running');
  f.session.stop();
});
await check('camera disconnection releases worker', async () => {
  const media = stream(), f = fixture(async () => media);
  await f.session.start(); media.track.onended();
  assert.equal(f.states.at(-1).state, 'error');
  assert.equal(workers[0].terminated, true);
});
await check('unsupported worker leaves camera permission untouched', async () => {
  let called = false;
  const f = fixture(async () => { called = true; return stream(); });
  globalThis.Worker = undefined;
  await f.session.start(); globalThis.Worker = FakeWorker;
  assert.equal(called, false);
  assert.match(f.states.at(-1).message, /does not support/);
});
console.log(JSON.stringify({ passed: passed.length, cases: passed }, null, 2));
