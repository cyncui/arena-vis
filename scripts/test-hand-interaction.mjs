import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const modules = new Map();
function moduleUrl(name) {
  if (modules.has(name)) return modules.get(name);
  const source = readFileSync(new URL(`../src/lib/hand-controls/${name}.ts`, import.meta.url), 'utf8');
  let javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  javascript = javascript.replace(/from '\.\/([^']+)'/g, (_, dependency) => `from '${moduleUrl(dependency)}'`);
  const url = `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`;
  modules.set(name, url);
  return url;
}
const { createHandInteraction } = await import(moduleUrl('interaction'));
const { bindManualInput } = await import(moduleUrl('dom-input'));
const hand = (x = 0.5, ratio = 0.7) => {
  const points = Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 }));
  points[5].x -= 0.05;
  points[17].x += 0.05;
  points[8].y -= 0.2;
  points[4] = { x: x + ratio * 0.1, y: 0.3, z: 0 };
  return points;
};
function surface() {
  const state = { aim: null, keyboard: null, selected: [], motions: [], enabled: true, damping: false, releases: 0 };
  return { state, port: {
    viewport: () => ({ width: 1000, height: 800 }),
    pick: () => ({ id: 'a', name: 'alpha' }),
    aim: value => { state.aim = value; },
    select: id => state.selected.push(id),
    keyboard: intent => { state.keyboard = intent; },
    captureHandMotion() {
      const enabled = state.enabled;
      const damping = state.damping;
      state.enabled = false;
      state.damping = false;
      let released = false;
      return {
        apply: motion => { if (!released) state.motions.push(motion); },
        release() {
          if (released) return;
          released = true;
          state.enabled = enabled;
          state.damping = damping;
          state.releases++;
        },
      };
    },
  } };
}
function fixture({ deferred = false } = {}) {
  let now = 0;
  const sessions = [];
  const graph = surface();
  const owner = createHandInteraction({ now: () => now, tracking(callbacks) {
    const record = { callbacks, starts: 0, stops: 0, active: false, resolve: null };
    sessions.push(record);
    return {
      async start() {
        record.starts++;
        callbacks.state('idle');
        callbacks.state('starting');
        if (deferred) {
          await new Promise(resolve => { record.resolve = resolve; });
          if (record.stops) return;
        }
        record.active = true;
        callbacks.state('running');
      },
      stop() { record.active = false; record.stops++; callbacks.state('idle'); },
      pause() { callbacks.state('paused'); },
      resume() { callbacks.state('running'); },
    };
  } });
  let view;
  owner.observe(value => { view = value; });
  const detach = owner.attach(graph.port);
  return { owner, graph, sessions, detach, get view() { return view; },
    frame(hands = [hand()], dt = 50, timestamp) {
      now += dt;
      sessions.at(-1).callbacks.frame({ hands, timestamp: timestamp ?? now });
    },
    open() { this.frame(); this.frame(); },
    orbit() { this.open(); this.frame([hand(0.5, 0.1)]); this.frame([hand(0.5, 0.1)]); this.frame([hand(0.6, 0.1)]); },
    key(key, phase = 'down', scope = 'graph', repeat = false) { owner.manual({ kind: 'key', key, phase, scope, repeat }); },
    pointer(pointerId, phase = 'down') { owner.manual({ kind: 'pointer', pointerId, phase }); },
  };
}
const cases = [];
async function check(name, run) { await run(); cases.push(name); }

await check('open observations arm aiming and a continued dwell selects once', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.open();
  assert.deepEqual(f.graph.state.aim, { cursor: { x: 500, y: 240 }, target: { id: 'a', name: 'alpha' }, progress: 0 });
  for (let index = 0; index < 30; index++) f.frame();
  assert.deepEqual(f.graph.state.selected, ['a']);
});
await check('held navigation blocks every hand frame and rearm starts after final release', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.orbit();
  assert.equal(f.graph.state.enabled, false);
  assert.equal(f.graph.state.motions.at(-1).kind, 'orbit');
  f.key('w');
  assert.equal(f.graph.state.enabled, true);
  assert.deepEqual(f.graph.state.keyboard, { keys: ['w'], shift: false });
  for (let index = 0; index < 20; index++) f.frame();
  assert.deepEqual(f.graph.state.selected, []);
  assert.equal(f.view.hand.reason, 'manual');
  f.key('w', 'up');
  f.frame([hand(0.5, 0.1)]);
  assert.equal(f.view.hand.reason, 'release-required');
  f.frame();
  assert.equal(f.view.hand.phase, 'yielded');
  f.frame();
  assert.equal(f.view.hand.gesture, 'aiming');
});
await check('ui focus clears graph motion and repeats cannot reacquire it', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.key('w');
  assert.deepEqual(f.graph.state.keyboard.keys, ['w']);
  f.owner.manual({ kind: 'focus', scope: 'ui' });
  assert.equal(f.graph.state.keyboard, null);
  f.owner.manual({ kind: 'focus', scope: 'graph' });
  f.key('w', 'down', 'graph', true);
  assert.deepEqual(f.graph.state.keyboard.keys, []);
  f.key('w', 'up', 'ui');
  f.key('w');
  assert.deepEqual(f.graph.state.keyboard.keys, ['w']);
});
await check('ui-origin key holds never become graph motion on focus return', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.owner.manual({ kind: 'focus', scope: 'ui' });
  f.key('w', 'down', 'ui');
  f.owner.manual({ kind: 'focus', scope: 'graph' });
  assert.deepEqual(f.graph.state.keyboard, { keys: [], shift: false });
  f.open();
  assert.equal(f.view.hand.reason, 'manual');
  f.key('w', 'up', 'ui');
  f.key('w');
  assert.deepEqual(f.graph.state.keyboard.keys, ['w']);
});
await check('shift alone blocks hands and publishes native mouse modifier intent', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.open();
  f.key('Shift');
  assert.deepEqual(f.graph.state.keyboard, { keys: [], shift: true });
  f.open();
  assert.equal(f.view.hand.reason, 'manual');
  f.key('Shift', 'up');
  f.open();
  assert.equal(f.view.hand.gesture, 'aiming');
});
await check('all pointer holds including ui and off-target releases gate rearm', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.pointer(1);
  f.pointer(2, 'down');
  f.pointer(1, 'up');
  f.open();
  assert.equal(f.view.hand.reason, 'manual');
  f.pointer(2, 'cancel');
  f.frame();
  assert.equal(f.view.hand.phase, 'yielded');
  f.frame();
  assert.equal(f.view.hand.gesture, 'aiming');
});
await check('wheel over ui revokes motion synchronously and requires fresh opens', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.orbit();
  f.owner.manual({ kind: 'wheel' });
  assert.equal(f.graph.state.enabled, true);
  assert.equal(f.graph.state.damping, false);
  assert.deepEqual(f.graph.state.aim, { cursor: null, target: null, progress: 0 });
  f.frame([hand(0.6, 0.1)]);
  assert.equal(f.view.hand.reason, 'release-required');
  f.open();
  assert.equal(f.view.hand.gesture, 'aiming');
});
await check('blur clears keys and pointers then demands new observations', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.key('w'); f.pointer(1);
  f.owner.manual({ kind: 'blur' });
  assert.equal(f.graph.state.keyboard, null);
  f.open();
  assert.equal(f.view.hand.gesture, 'aiming');
});
await check('takeover discards captured pre-release frames', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.open();
  f.owner.manual({ kind: 'wheel' });
  f.frame([hand()], 50, 99);
  f.frame([hand()], 50, 99);
  assert.equal(f.graph.state.aim.cursor, null);
  f.open();
  assert.equal(f.graph.state.aim.cursor.x, 500);
});
await check('empty and aged frames cancel dwell and camera leases', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.orbit();
  f.frame([]);
  assert.equal(f.graph.state.enabled, true);
  assert.equal(f.view.hand.reason, 'release-required');
  f.open();
  assert.equal(f.graph.state.aim.cursor.x, 500);
  f.frame([hand()], 250, 400);
  assert.equal(f.graph.state.aim.cursor, null);
  f.open();
  assert.equal(f.graph.state.aim.cursor.x, 500);
});
await check('pause and resume retain tracker but reject old inference and require release', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.orbit();
  await f.owner.camera('pause');
  assert.equal(f.sessions[0].active, true);
  assert.equal(f.view.camera.phase, 'paused');
  assert.equal(f.graph.state.enabled, true);
  f.frame([hand(0.6, 0.1)]);
  await f.owner.camera('resume');
  f.frame([hand()], 50, 100);
  assert.equal(f.graph.state.aim.cursor, null);
  f.open();
  assert.equal(f.view.hand.gesture, 'aiming');
  assert.equal(f.sessions.length, 1);
});
await check('stop ignores old capture callbacks and disposal stops exact session once', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.orbit();
  const old = f.sessions[0];
  await f.owner.camera('stop');
  await f.owner.camera('start');
  old.callbacks.state('error', 'obsolete');
  old.callbacks.frame({ timestamp: 10000, hands: [hand()] });
  assert.equal(f.view.camera.phase, 'running');
  assert.equal(f.sessions[1].active, true);
  f.open();
  assert.equal(f.view.hand.gesture, 'aiming');
  f.owner.dispose(); f.owner.dispose(); f.detach();
  assert.equal(old.stops, 1);
  assert.equal(f.sessions[1].stops, 1);
  assert.equal(f.sessions[1].active, false);
});
await check('pending startup never blocks stop and a second start is not duplicated', async () => {
  const f = fixture({ deferred: true });
  const start = f.owner.camera('start');
  await f.owner.camera('start');
  assert.equal(f.sessions.length, 1);
  assert.equal(f.view.camera.phase, 'starting');
  await f.owner.camera('stop');
  assert.equal(f.view.camera.phase, 'idle');
  assert.equal(f.sessions[0].stops, 1);
  f.sessions[0].resolve();
  await start;
  assert.equal(f.sessions[0].active, false);
  assert.equal(f.view.camera.phase, 'idle');
  assert.equal(f.graph.state.aim.cursor, null);
});
await check('hidden or ineligible stops capture and never automatically restarts', async () => {
  for (const environment of [{ visible: false, eligible: true }, { visible: true, eligible: false }]) {
    const f = fixture();
    await f.owner.camera('start');
    f.orbit();
    f.owner.environment(environment);
    assert.equal(f.sessions[0].active, false);
    assert.equal(f.graph.state.enabled, true);
    f.owner.environment({ visible: true, eligible: true });
    assert.equal(f.view.camera.phase, 'idle');
    assert.equal(f.sessions.length, 1);
    await f.owner.camera('start');
    assert.equal(f.sessions[1].active, true);
  }
});
await check('camera eligibility never disables existing graph keyboard controls', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.key('w');
  f.owner.environment({ visible: true, eligible: false });
  assert.equal(f.sessions[0].active, false);
  assert.deepEqual(f.graph.state.keyboard, { keys: ['w'], shift: false });
  f.key('w', 'up');
  f.key('q');
  assert.deepEqual(f.graph.state.keyboard, { keys: ['q'], shift: false });
  f.owner.environment({ visible: false, eligible: false });
  assert.equal(f.graph.state.keyboard, null);
});
await check('graph detach restores exact flags without stopping preview and old detachers are inert', async () => {
  const f = fixture();
  f.graph.state.enabled = false;
  f.graph.state.damping = true;
  await f.owner.camera('start');
  f.orbit();
  const next = surface();
  const detachNext = f.owner.attach(next.port);
  assert.equal(f.graph.state.enabled, false);
  assert.equal(f.graph.state.damping, true);
  assert.equal(f.graph.state.releases, 1);
  f.detach(); f.detach();
  f.open();
  assert.equal(next.state.aim.cursor.x, 500);
  detachNext(); detachNext();
  assert.equal(f.sessions[0].active, true);
  assert.equal(f.view.hand.reason, 'graph');
});
await check('renderer replacement during pick cannot aim or select obsolete surface', async () => {
  const f = fixture();
  await f.owner.camera('start');
  const next = surface();
  f.graph.port.pick = () => { f.owner.attach(next.port); return { id: 'old', name: 'old' }; };
  f.open();
  assert.equal(f.graph.state.aim.cursor, null);
  f.open();
  assert.equal(next.state.aim.target.id, 'a');
  for (let index = 0; index < 14; index++) f.frame();
  assert.deepEqual(next.state.selected, ['a']);
  assert.deepEqual(f.graph.state.selected, []);
});
await check('manual takeover inside renderer callback cannot emit stale aim', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.graph.port.pick = () => { f.key('w'); return { id: 'a', name: 'alpha' }; };
  f.open();
  assert.equal(f.graph.state.aim.cursor, null);
  assert.equal(f.view.hand.reason, 'manual');
  f.key('w', 'up');
  f.graph.port.pick = () => ({ id: 'a', name: 'alpha' });
  f.open();
  assert.equal(f.graph.state.aim.cursor.x, 500);
});
await check('reentrant graph replacement during motion capture restores the obsolete lease', async () => {
  const f = fixture();
  await f.owner.camera('start');
  const next = surface();
  const capture = f.graph.port.captureHandMotion;
  f.graph.port.captureHandMotion = () => {
    const lease = capture();
    f.owner.attach(next.port);
    return lease;
  };
  f.orbit();
  assert.equal(f.graph.state.enabled, true);
  assert.equal(f.graph.state.releases, 1);
  assert.deepEqual(f.graph.state.motions, []);
  f.open();
  assert.equal(next.state.aim.cursor.x, 500);
});
await check('takeover during motion application cannot publish obsolete gesture state', async () => {
  const f = fixture();
  await f.owner.camera('start');
  const capture = f.graph.port.captureHandMotion;
  f.graph.port.captureHandMotion = () => {
    const lease = capture();
    return { ...lease, apply(motion) { lease.apply(motion); f.pointer(1); } };
  };
  f.orbit();
  assert.equal(f.graph.state.motions.at(-1).kind, 'orbit');
  assert.equal(f.graph.state.enabled, true);
  assert.equal(f.view.hand.reason, 'manual');
  f.pointer(1, 'up');
  f.open();
  assert.equal(f.view.hand.gesture, 'aiming');
});
await check('observer can stop during pause or resume without stale lifecycle writes', async () => {
  for (const phase of ['paused', 'running']) {
    const f = fixture();
    await f.owner.camera('start');
    if (phase === 'running') await f.owner.camera('pause');
    const unobserve = f.owner.observe(view => {
      if (view.camera.phase === phase) void f.owner.camera('stop');
    });
    await f.owner.camera(phase === 'paused' ? 'pause' : 'resume');
    assert.equal(f.view.camera.phase, 'idle');
    assert.equal(f.sessions[0].active, false);
    unobserve();
  }
});
await check('observer retry after an error cannot be invalidated by old capture cleanup', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.owner.observe(view => { if (view.camera.phase === 'error') void f.owner.camera('start'); });
  f.sessions[0].callbacks.state('error', 'retry');
  assert.equal(f.view.camera.phase, 'running');
  assert.equal(f.sessions[1].active, true);
  f.open();
  assert.equal(f.view.hand.gesture, 'aiming');
});
await check('observer stop or disposal during starting prevents resource startup', async () => {
  for (const action of ['stop', 'dispose']) {
    const f = fixture();
    f.owner.observe(view => {
      if (view.camera.phase === 'starting') {
        if (action === 'stop') void f.owner.camera('stop'); else f.owner.dispose();
      }
    });
    await f.owner.camera('start');
    assert.equal(f.sessions[0].starts, 0);
    assert.equal(f.sessions[0].active, false);
    assert.equal(f.sessions[0].stops, 1);
  }
});
await check('disposal cannot leak a reentrant observer restart', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.owner.observe(view => { if (view.camera.phase === 'idle') void f.owner.camera('start'); });
  f.owner.dispose();
  assert.equal(f.sessions.length, 1);
  assert.equal(f.sessions[0].active, false);
  await f.owner.camera('start');
  assert.equal(f.sessions.length, 1);
});
await check('nested publication never delivers a stale view after the replacement', async () => {
  const f = fixture();
  await f.owner.camera('start');
  f.owner.observe(view => { if (view.hand.phase === 'ready') void f.owner.camera('pause'); });
  const phases = [];
  f.owner.observe(view => phases.push(view.camera.phase));
  f.open();
  assert.deepEqual(phases, ['running', 'paused']);
  assert.equal(f.view.camera.phase, 'paused');
});

class Element {
  constructor(parent = null, ui = false) { this.parent = parent; this.ui = ui; }
  contains(element) { return element === this || !!element?.parent && this.contains(element.parent); }
  closest() { return this.ui ? this : this.parent?.closest() ?? null; }
}
class Window extends EventTarget {
  addEventListener(type, callback, options) {
    super.addEventListener(type, callback, typeof options === 'boolean' ? { capture: options } : options);
  }
  removeEventListener(type, callback, options) {
    super.removeEventListener(type, callback, typeof options === 'boolean' ? { capture: options } : options);
  }
}
function dom() {
  const window = new Window();
  window.Element = Element;
  const document = { defaultView: window, activeElement: null };
  const root = new Element();
  root.ownerDocument = document;
  root.focus = () => { document.activeElement = root; };
  const graph = new Element(root);
  const panel = new Element(root, true);
  const outside = new Element();
  document.activeElement = graph;
  return { window, document, root, graph, panel, outside,
    send(type, target, facts = {}) {
      const event = new Event(type, { cancelable: true });
      Object.defineProperty(event, 'target', { value: target });
      Object.assign(event, facts);
      window.dispatchEvent(event);
      return event;
    },
  };
}
await check('dom routes capture-phase input, shared ui scope and unconditional off-target release', async () => {
  const f = fixture(); const d = dom();
  const binding = bindManualInput(d.root, f.owner);
  await f.owner.camera('start');
  f.orbit();
  d.send('pointerdown', d.graph, { pointerId: 1 });
  assert.equal(f.graph.state.enabled, true);
  d.send('pointerup', d.outside, { pointerId: 1 });
  f.open();
  assert.equal(f.view.hand.gesture, 'aiming');
  d.send('keydown', d.graph, { key: 'W', repeat: false });
  assert.deepEqual(f.graph.state.keyboard.keys, ['w']);
  d.send('focusin', d.panel);
  assert.equal(f.graph.state.keyboard, null);
  d.send('keyup', d.outside, { key: 'W', repeat: false });
  d.send('pointerdown', d.graph, { pointerId: 2 });
  assert.equal(d.document.activeElement, d.root);
  d.send('keydown', d.document.activeElement, { key: 'q', repeat: false });
  assert.deepEqual(f.graph.state.keyboard.keys, ['q']);
  d.send('keyup', d.outside, { key: 'q', repeat: false });
  d.send('pointercancel', d.outside, { pointerId: 2 });
  f.open();
  assert.equal(f.view.hand.gesture, 'aiming');
  binding.dispose(); binding.dispose();
  d.send('keydown', d.graph, { key: 'w', repeat: false });
  assert.equal(f.graph.state.keyboard, null);
});
await check('dom ui wheel cancels motion and window blur releases all manual holds', async () => {
  const f = fixture(); const d = dom();
  const binding = bindManualInput(d.root, f.owner);
  await f.owner.camera('start');
  f.orbit();
  d.send('wheel', d.panel);
  assert.equal(f.graph.state.enabled, true);
  f.open();
  assert.equal(f.view.hand.gesture, 'aiming');
  d.send('keydown', d.graph, { key: 'Shift', repeat: false });
  d.send('pointerdown', d.graph, { pointerId: 1 });
  d.send('blur', d.window);
  assert.equal(f.graph.state.keyboard, null);
  f.open();
  assert.equal(f.view.hand.gesture, 'aiming');
  binding.dispose();
});

console.log(JSON.stringify({ passed: cases.length, cases }, null, 2));
