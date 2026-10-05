import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/lib/hand-controls/hover-selection.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { HoverSelectionController } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const cases = [];
function check(name, run) {
  run(new HoverSelectionController());
  cases.push(name);
}

check('hover selects at 650 ms and exposes dwell progress', controller => {
  assert.deepEqual(controller.step('a', 100), { select: null, progress: 0 });
  assert.deepEqual(controller.step('a', 425), { select: null, progress: 0.5 });
  assert.equal(controller.step('a', 749).select, null);
  assert.deepEqual(controller.step('a', 750), { select: 'a', progress: 1 });
});
check('continued hover emits exactly one selection', controller => {
  controller.step('a', 0);
  assert.equal(controller.step('a', 650).select, 'a');
  for (let timestamp = 700; timestamp <= 3000; timestamp += 50) {
    assert.deepEqual(controller.step('a', timestamp), { select: null, progress: 1 });
  }
});
check('changing nodes starts a full new dwell', controller => {
  controller.step('a', 0);
  controller.step('a', 600);
  assert.deepEqual(controller.step('b', 650), { select: null, progress: 0 });
  assert.equal(controller.step('b', 1299).select, null);
  assert.equal(controller.step('b', 1300).select, 'b');
});
check('empty space cancels pending dwell', controller => {
  controller.step('a', 0);
  assert.deepEqual(controller.step(null, 600), { select: null, progress: 0 });
  assert.equal(controller.step('a', 650).progress, 0);
  assert.equal(controller.step('a', 1299).select, null);
  assert.equal(controller.step('a', 1300).select, 'a');
});
check('leaving a selected node permits another visit', controller => {
  controller.step('a', 0);
  controller.step('a', 650);
  controller.step(null, 700);
  controller.step('a', 750);
  assert.equal(controller.step('a', 1400).select, 'a');
});
check('navigation cancels pending dwell', controller => {
  controller.step('a', 0);
  controller.cancel('a');
  assert.equal(controller.step('a', 700).progress, 0);
  assert.equal(controller.step('a', 1349).select, null);
  assert.equal(controller.step('a', 1350).select, 'a');
});
check('navigation over the selected node preserves the selection latch', controller => {
  controller.step('a', 0);
  controller.step('a', 650);
  controller.cancel('a');
  assert.deepEqual(controller.step('a', 2000), { select: null, progress: 1 });
});
check('navigation away from the selected node clears its latch', controller => {
  controller.step('a', 0);
  controller.step('a', 650);
  controller.cancel('b');
  controller.step('a', 2000);
  assert.equal(controller.step('a', 2650).select, 'a');
});
check('reset clears selected and pending visits', controller => {
  controller.step('a', 0);
  controller.step('a', 650);
  controller.reset();
  assert.equal(controller.step('a', 700).progress, 0);
  assert.equal(controller.step('a', 1350).select, 'a');
  controller.step('b', 1400);
  controller.reset();
  assert.equal(controller.step('b', 2000).progress, 0);
});
check('a reversed clock starts a fresh dwell', controller => {
  controller.step('a', 1000);
  assert.deepEqual(controller.step('a', 500), { select: null, progress: 0 });
  assert.equal(controller.step('a', 1150).select, 'a');
});

console.log(JSON.stringify({ passed: cases.length, cases }, null, 2));
