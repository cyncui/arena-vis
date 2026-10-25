import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/lib/selection-history.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { selectionReducer } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const node = id => ({ id, name: id });
const empty = { selected: null, history: [] };
const run = (...actions) => actions.reduce(selectionReducer, empty);
const select = id => ({ type: 'select', node: node(id) });
const ids = state => ({ selected: state.selected?.id ?? null, history: state.history.map(entry => entry.id) });
const cases = [];
function check(name, test) {
  test();
  cases.push(name);
}
check('selecting pushes the previous selection once', () => {
  assert.deepEqual(ids(run(select('a'))), { selected: 'a', history: [] });
  assert.deepEqual(ids(run(select('a'), select('b'), select('c'))), { selected: 'c', history: ['a', 'b'] });
  assert.deepEqual(ids(run(select('a'), select('a'))), { selected: 'a', history: [] });
});
check('jump restores an entry and truncates the stack at it', () => {
  assert.deepEqual(ids(run(select('a'), select('b'), select('c'), { type: 'jump', index: 0 })), { selected: 'a', history: [] });
  assert.deepEqual(ids(run(select('a'), select('b'), select('c'), { type: 'jump', index: 1 })), { selected: 'b', history: ['a'] });
});
check('back restores the previous selection', () => {
  const state = run(select('a'), select('b'), select('c'), { type: 'back' });
  assert.deepEqual(ids(state), { selected: 'b', history: ['a'] });
  assert.deepEqual(ids(selectionReducer(state, { type: 'back' })), { selected: 'a', history: [] });
});
check('back on an empty stack is a no-op', () => {
  assert.deepEqual(ids(run({ type: 'back' })), { selected: null, history: [] });
  assert.deepEqual(ids(run(select('a'), { type: 'back' })), { selected: 'a', history: [] });
});
check('back works after the selection was cleared by a removal', () => {
  const removed = run(select('a'), select('b'), { type: 'remove', ids: new Set(['b']) });
  assert.deepEqual(ids(removed), { selected: null, history: ['a'] });
  assert.deepEqual(ids(selectionReducer(removed, { type: 'back' })), { selected: 'a', history: [] });
});
check('remove prunes history, clears the selection, and collapses duplicates', () => {
  const state = run(select('a'), select('b'), select('a'), select('c'), { type: 'remove', ids: new Set(['b', 'c']) });
  assert.deepEqual(ids(state), { selected: null, history: ['a'] });
});
check('remove drops a top entry equal to the kept selection', () => {
  const state = run(select('a'), select('b'), select('a'), select('c'), select('a'), { type: 'remove', ids: new Set(['c']) });
  assert.deepEqual(ids(state), { selected: 'a', history: ['a', 'b'] });
});
check('clear empties selection and history', () => {
  assert.deepEqual(ids(run(select('a'), select('b'), { type: 'clear' })), { selected: null, history: [] });
});
console.log(JSON.stringify({ passed: true, cases }, null, 2));
