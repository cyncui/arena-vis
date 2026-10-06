import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/lib/hand-controls/gestures.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { HandGestureController } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const hoverSource = readFileSync(new URL('../src/lib/hand-controls/hover-selection.ts', import.meta.url), 'utf8');
const hoverJavascript = ts.transpileModule(hoverSource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { HoverSelectionController } = await import(`data:text/javascript;base64,${Buffer.from(hoverJavascript).toString('base64')}`);
const viewport = { width: 1000, height: 800 };
const hand = (x = 0.5, ratio = 0.7, width = 0.1, y = 0.5) => {
  const points = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  points[5] = { x: x - width / 2, y, z: 0 };
  points[17] = { x: x + width / 2, y, z: 0 };
  points[8] = { x, y: y - 0.2, z: 0 };
  points[4] = { x: x + ratio * width, y: y - 0.2, z: 0 };
  return points;
};
const fixture = () => {
  const controller = new HandGestureController();
  let timestamp = 0;
  return {
    controller,
    frame(hands, dt = 50, age = 0) {
      timestamp += dt;
      return controller.step({ timestamp, hands }, viewport, timestamp + age);
    },
  };
};
const cases = [];
function check(name, run) {
  run();
  cases.push(name);
}
check('cursor mirrors source coordinates exactly once', () => {
  const f = fixture();
  assert.deepEqual(f.frame([hand(0.2)]).cursor, { x: 800, y: 240 });
});
check('closing from a wide opening arms without residual zoom', () => {
  for (const dt of [33, 50]) {
    const f = fixture();
    f.frame([hand(0.5, 1.6, 0.12)], dt);
    f.frame([hand(0.5, 0.1, 0.1)], dt);
    assert.equal(f.frame([hand(0.5, 0.1, 0.1)], dt).gesture, 'pinch');
    for (let index = 0; index < 4; index++) {
      const closed = f.frame([hand(0.5, 0.1)], dt);
      assert.equal(closed.gesture, 'pinch');
      assert.equal(closed.motion, null);
    }
  }
});
check('moving pinch becomes orbit and never selects on release', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  const moved = f.frame([hand(0.55, 0.1)]);
  assert.equal(moved.gesture, 'orbit');
  assert.equal(moved.motion.kind, 'orbit');
  assert(moved.motion.dx < 0);
  assert.equal(f.frame([hand(0.6)]).motion, null);
  assert.equal(f.frame([hand(0.6)]).gesture, 'aiming');
});
check('stationary held pinch emits no motion', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  for (let index = 0; index < 12; index++) {
    const held = f.frame([hand(0.5, 0.1)]);
    assert.equal(held.gesture, 'pinch');
    assert.equal(held.motion, null);
  }
});
check('a fresh closed pinch can zoom out directly', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  const away = f.frame([hand(0.5, 0.1, 0.08)]);
  assert.equal(away.gesture, 'zoom');
  assert.equal(away.motion.kind, 'transform');
  assert(away.motion.scale < 1);
  assert.equal(away.motion.dx, 0);
  assert.equal(away.motion.dy, 0);
});
check('toward camera zooms in and away reverses direction while still pinched', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  const toward = f.frame([hand(0.5, 0.1, 0.12)]);
  assert.equal(toward.gesture, 'zoom');
  assert(toward.motion.scale > 1);
  f.frame([hand(0.5, 0.1, 0.12)]);
  const away = f.frame([hand(0.5, 0.1, 0.08)]);
  assert.equal(away.gesture, 'zoom');
  assert(away.motion.scale < 1);
});
check('depth zoom takes priority over simultaneous lateral palm movement', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  const result = f.frame([hand(0.55, 0.1, 0.12)]);
  assert.equal(result.gesture, 'zoom');
  assert.equal(result.motion.dx, 0);
  assert.equal(result.motion.dy, 0);
});
check('opening the pinch stops zoom immediately and releases after two samples', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1, 0.12)]);
  assert.equal(f.frame([hand(0.5, 0.7, 0.14)]).motion, null);
  const released = f.frame([hand(0.5, 0.7, 0.16)]);
  assert.equal(released.gesture, 'aiming');
  assert.equal(released.motion, null);
});
check('finger aperture alone never zooms', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  for (const ratio of [0.2, 0.3, 0.7, 0.7]) assert.equal(f.frame([hand(0.5, ratio)]).motion, null);
});
check('palm rotation preserving normalized 3d span does not zoom', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  const turned = hand(0.5, 0.1, 0.08);
  turned[5].z = -0.03;
  turned[17].z = 0.03;
  const result = f.frame([turned]);
  assert.equal(result.gesture, 'pinch');
  assert.equal(result.motion, null);
});
check('tracking loss cancels zoom and reacquisition needs a fresh pinch', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1, 0.12)]);
  assert.equal(f.frame([]).gesture, 'locked');
  assert.equal(f.frame([hand(0.7, 0.1)]).motion, null);
  f.frame([hand(0.7, 0.7)]);
  assert.equal(f.frame([hand(0.7, 0.7)]).gesture, 'aiming');
  f.frame([hand(0.7, 0.1)]);
  assert.equal(f.frame([hand(0.7, 0.1)]).gesture, 'pinch');
  const moved = f.frame([hand(0.7, 0.1, 0.08)]);
  assert.equal(moved.gesture, 'zoom');
  assert.equal(moved.motion.dx, 0);
});
check('manual navigation and stale results cancel active zoom', () => {
  for (const cancel of ['manual', 'stale']) {
    const f = fixture();
    f.frame([hand(0.5, 0.1)]);
    f.frame([hand(0.5, 0.1)]);
    f.frame([hand(0.5, 0.1, 0.12)]);
    if (cancel === 'manual') f.controller.reset(true);
    const result = f.frame([hand(0.5, 0.1)], 50, cancel === 'stale' ? 201 : 0);
    assert.equal(result.gesture, 'locked');
    assert.equal(result.motion, null);
  }
});
check('depth zoom gain is independent of initial palm size', () => {
  const scales = [0.05, 0.1, 0.2].map(width => {
    const f = fixture();
    f.frame([hand(0.5, 0.1, width)]);
    f.frame([hand(0.5, 0.1, width)]);
    return f.frame([hand(0.5, 0.1, width * 1.2)]).motion.scale;
  });
  for (const scale of scales) assert(Math.abs(scale - scales[0]) < 1e-12);
});
const fist = (x = 0.5, y = 0.5, width = 0.1) => {
  const points = hand(x, 0.1, width, y);
  for (const tip of [8, 12, 16, 20]) {
    points[tip - 2] = { x, y: y - width, z: 0 };
    points[tip] = { x, y: y - width * 0.5, z: 0 };
  }
  points[4] = { ...points[8] };
  return points;
};
check('a closed fist pans with mirrored movement and preserves zoom', () => {
  const f = fixture();
  assert.equal(f.frame([fist()]).motion, null);
  const engaged = f.frame([fist()]);
  assert.equal(engaged.gesture, 'pan');
  assert.equal(engaged.motion, null);
  const moved = f.frame([fist(0.55, 0.55, 0.12)]);
  assert.equal(moved.gesture, 'pan');
  assert.equal(moved.motion.kind, 'transform');
  assert(moved.motion.dx < 0);
  assert(moved.motion.dy > 0);
  assert.equal(moved.motion.scale, 1);
});
check('closing a pinch cancels selection before navigation is confirmed', () => {
  const f = fixture();
  assert.deepEqual(f.frame([hand()]).cursor, { x: 500, y: 240 });
  const closing = f.frame([hand(0.5, 0.1)]);
  assert.deepEqual(closing, { cursor: null, gesture: 'aiming', motion: null });
  assert.deepEqual(f.frame([hand(0.5, 0.1)], 0), closing);
  assert.equal(f.frame([hand(0.5, 0.1)]).gesture, 'pinch');
  f.frame([hand()]);
  assert.deepEqual(f.frame([hand()]), { cursor: { x: 500, y: 240 }, gesture: 'aiming', motion: null });
});
check('a rejected pinch resumes selection from an open hand', () => {
  const f = fixture();
  f.frame([hand()]);
  assert.deepEqual(f.frame([hand(0.5, 0.1)]), { cursor: null, gesture: 'aiming', motion: null });
  assert.deepEqual(f.frame([hand()]), { cursor: { x: 500, y: 240 }, gesture: 'aiming', motion: null });
});
check('closing a fist cancels selection before pan is confirmed', () => {
  const f = fixture();
  assert.deepEqual(f.frame([hand()]).cursor, { x: 500, y: 240 });
  const closing = f.frame([fist()]);
  assert.deepEqual(closing, { cursor: null, gesture: 'aiming', motion: null });
  assert.deepEqual(f.frame([fist()], 0), closing);
  assert.equal(f.frame([fist()]).gesture, 'pan');
  f.frame([hand()]);
  assert.equal(f.frame([hand()]).gesture, 'aiming');
  assert.equal(f.frame([hand()]).cursor.x, 500);
});
check('either hand starting navigation cancels aiming on the primary hand', () => {
  for (const [closingHand, expectedGesture] of [[hand(0.7, 0.1), 'pinch'], [fist(0.7), 'pan']]) {
    const f = fixture();
    assert.deepEqual(f.frame([hand(0.3), hand(0.7)]).cursor, { x: 700, y: 240 });
    const closing = f.frame([hand(0.3), closingHand]);
    assert.deepEqual(closing, { cursor: null, gesture: 'aiming', motion: null });
    assert.deepEqual(f.frame([hand(0.3), closingHand], 0), closing);
    const confirmed = f.frame([hand(0.3), closingHand]);
    assert.equal(confirmed.gesture, expectedGesture);
    assert.equal(confirmed.motion, null);
  }
});
check('fist takes priority over thumb index contact', () => {
  const f = fixture();
  f.frame([fist()]);
  assert.equal(f.frame([fist()]).gesture, 'pan');
});
check('first closure cancels a nearly complete dwell and reopening starts a full dwell', () => {
  for (const closingHands of [[hand(0.3, 0.1), hand(0.7)], [hand(0.3), hand(0.7, 0.1)], [fist(0.3), hand(0.7)], [hand(0.3), fist(0.7)]]) {
    const f = fixture();
    const hover = new HoverSelectionController();
    const aim = (hands, now) => {
      const output = f.frame(hands);
      return hover.step(output.gesture === 'aiming' && output.cursor ? 'target' : null, now);
    };
    for (let now = 0; now <= 600; now += 50) assert.equal(aim([hand(0.3), hand(0.7)], now).select, null);
    assert.deepEqual(aim(closingHands, 650), { select: null, progress: 0 });
    assert.deepEqual(aim([hand(0.3), hand(0.7)], 700), { select: null, progress: 0 });
    for (let now = 750; now < 1350; now += 50) assert.equal(aim([hand(0.3), hand(0.7)], now).select, null);
    assert.deepEqual(aim([hand(0.3), hand(0.7)], 1350), { select: 'target', progress: 1 });
  }
});
check('open fingers and degenerate finger joints do not count as a fist', () => {
  for (const extended of [hand(), (() => {
    const points = fist();
    points[20].y = 0.3;
    return points;
  })()]) {
    const f = fixture();
    f.frame([extended]);
    assert.notEqual(f.frame([extended]).gesture, 'pan');
  }
});
check('fist release stops motion on the first sample', () => {
  const f = fixture();
  f.frame([fist()]);
  f.frame([fist()]);
  assert.equal(f.frame([hand(0.6)]).motion, null);
  const released = f.frame([hand(0.6)]);
  assert.equal(released.gesture, 'aiming');
  assert.equal(released.motion, null);
});
check('switching between pinch and fist establishes a fresh motion anchor', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  assert.equal(f.frame([fist(0.55)]).motion, null);
  const pan = f.frame([fist(0.55)]);
  assert.equal(pan.gesture, 'pan');
  assert.equal(pan.motion, null);
  f.frame([hand(0.55, 0.1)]);
  assert.equal(f.frame([hand(0.55, 0.1)]).motion, null);
  const pinch = f.frame([hand(0.55, 0.1)]);
  assert.equal(pinch.gesture, 'pinch');
  assert.equal(pinch.motion, null);
});
check('manual reset cannot be unlocked by a closed fist', () => {
  const f = fixture();
  f.controller.reset(true);
  for (let index = 0; index < 4; index++) assert.equal(f.frame([fist()]).gesture, 'locked');
  f.frame([hand()]);
  assert.equal(f.frame([hand()]).gesture, 'aiming');
  f.frame([fist()]);
  assert.equal(f.frame([fist()]).gesture, 'pan');
});
check('tracking loss cancels fist pan without reacquisition jumps', () => {
  const f = fixture();
  f.frame([fist()]);
  f.frame([fist()]);
  assert.equal(f.frame([]).gesture, 'locked');
  assert.equal(f.frame([fist(0.8)]).motion, null);
  f.frame([hand(0.8)]);
  assert.equal(f.frame([hand(0.8)]).gesture, 'aiming');
  f.frame([fist(0.8)]);
  assert.equal(f.frame([fist(0.8)]).motion, null);
});
check('two pinches pan and spread with normalized motion', () => {
  const f = fixture();
  f.frame([hand(0.3, 0.1), hand(0.7, 0.1)]);
  assert.equal(f.frame([hand(0.3, 0.1), hand(0.7, 0.1)]).gesture, 'two-hand');
  const moved = f.frame([hand(0.25, 0.1, 0.1, 0.55), hand(0.8, 0.1, 0.1, 0.55)]);
  assert.equal(moved.motion.kind, 'transform');
  assert(moved.motion.dx < 0);
  assert(moved.motion.dy > 0);
  assert(moved.motion.scale > 1);
});
check('two-hand release stays locked until both hands release', () => {
  const f = fixture();
  f.frame([hand(0.3, 0.1), hand(0.7, 0.1)]);
  f.frame([hand(0.3, 0.1), hand(0.7, 0.1)]);
  f.frame([hand(0.3), hand(0.7, 0.1)]);
  assert.equal(f.frame([hand(0.3), hand(0.7, 0.1)]).gesture, 'locked');
  assert.equal(f.frame([hand(0.3), hand(0.7, 0.1)]).motion, null);
  f.frame([hand(0.3), hand(0.7)]);
  assert.equal(f.frame([hand(0.3), hand(0.7)]).gesture, 'aiming');
});
check('switching a two-hand pinch into a fist locks until both hands open', () => {
  const f = fixture();
  f.frame([hand(0.3, 0.1), hand(0.7, 0.1)]);
  f.frame([hand(0.3, 0.1), hand(0.7, 0.1)]);
  assert.equal(f.frame([fist(0.3), hand(0.7, 0.1)]).gesture, 'locked');
  assert.equal(f.frame([fist(0.3), hand(0.7, 0.1)]).motion, null);
  f.frame([hand(0.3), hand(0.7)]);
  assert.equal(f.frame([hand(0.3), hand(0.7)]).gesture, 'aiming');
});
check('hover cursor stays on the same hand when open hands reorder', () => {
  const f = fixture();
  const first = f.frame([hand(0.3), hand(0.7)]);
  const reordered = f.frame([hand(0.7), hand(0.3)]);
  assert.deepEqual(reordered.cursor, first.cursor);
  assert.equal(reordered.gesture, 'aiming');
});
check('hand result order changes preserve identity and stationary camera', () => {
  const f = fixture();
  f.frame([hand(0.3, 0.1), hand(0.7, 0.1)]);
  f.frame([hand(0.3, 0.1), hand(0.7, 0.1)]);
  const reordered = f.frame([hand(0.7, 0.1), hand(0.3, 0.1)]);
  assert.equal(reordered.gesture, 'two-hand');
  assert.deepEqual(reordered.motion, { kind: 'transform', dx: 0, dy: 0, scale: 1 });
});
check('crossing hands cancel instead of producing camera jumps', () => {
  const f = fixture();
  f.frame([hand(0.4, 0.1), hand(0.6, 0.1)]);
  f.frame([hand(0.4, 0.1), hand(0.6, 0.1)]);
  const crossed = f.frame([hand(0.48, 0.1), hand(0.52, 0.1)]);
  assert.equal(crossed.gesture, 'locked');
  assert.equal(crossed.motion, null);
});
check('ambiguous arrival of a second hand cancels the existing pinch', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  const ambiguous = f.frame([hand(0.4, 0.1), hand(0.6, 0.1)]);
  assert.equal(ambiguous.gesture, 'locked');
  assert.equal(ambiguous.motion, null);
});
check('lost tracking requires release and reacquisition uses a fresh anchor', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  assert.equal(f.frame([]).gesture, 'locked');
  assert.equal(f.frame([hand(0.8, 0.1)]).gesture, 'locked');
  f.frame([hand(0.8)]);
  assert.equal(f.frame([hand(0.8)]).gesture, 'aiming');
  f.frame([hand(0.8, 0.1)]);
  const fresh = f.frame([hand(0.8, 0.1)]);
  assert.equal(fresh.gesture, 'pinch');
  assert.equal(fresh.motion, null);
  assert(Math.abs(fresh.cursor.x - 200) < 0.001);
});
check('loss of either hand during two-hand motion cancels the gesture', () => {
  const f = fixture();
  f.frame([hand(0.3, 0.1), hand(0.7, 0.1)]);
  f.frame([hand(0.3, 0.1), hand(0.7, 0.1)]);
  const lost = f.frame([hand(0.7, 0.1)]);
  assert.equal(lost.gesture, 'locked');
  assert.equal(lost.motion, null);
});
check('stale frames never move the camera or select', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  const stale = f.frame([hand(0.6, 0.1)], 50, 201);
  assert.deepEqual(stale, { cursor: null, gesture: 'locked', motion: null });
  assert.equal(f.frame([hand(0.6, 0.1)]).gesture, 'locked');
});
check('a long gap between fresh frames resets anchors', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  const gap = f.frame([hand(0.6, 0.1)], 250);
  assert.equal(gap.gesture, 'locked');
  assert.equal(gap.motion, null);
});
check('manual reset requires release before another pinch', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  f.controller.reset(true);
  assert.equal(f.frame([hand(0.5, 0.1)]).gesture, 'locked');
  f.frame([hand()]);
  assert.equal(f.frame([hand()]).gesture, 'aiming');
  f.frame([hand(0.5, 0.1)]);
  assert.equal(f.frame([hand(0.5, 0.1)]).gesture, 'pinch');
});
check('hysteresis and smoothing suppress threshold and position jitter', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  f.frame([hand(0.5, 0.1)]);
  const jitter = f.frame([hand(0.501, 0.2)]);
  assert.equal(jitter.gesture, 'pinch');
  assert.equal(jitter.motion, null);
  assert(jitter.cursor.x > 499 && jitter.cursor.x < 500);
  assert.equal(f.frame([hand(0.5, 0.25)]).gesture, 'pinch');
});
check('pinch ratios remain invariant across palm sizes', () => {
  for (const width of [0.05, 0.1, 0.2]) {
    const f = fixture();
    f.frame([hand(0.5, 0.2, width)]);
    assert.equal(f.frame([hand(0.5, 0.2, width)]).gesture, 'pinch');
  }
});
check('duplicate frame timestamps do not confirm a pinch', () => {
  const f = fixture();
  f.frame([hand(0.5, 0.1)]);
  assert.equal(f.frame([hand(0.5, 0.1)], 0).gesture, 'aiming');
  assert.equal(f.frame([hand(0.5, 0.1)]).gesture, 'pinch');
});
console.log(JSON.stringify({ passed: true, cases }, null, 2));
