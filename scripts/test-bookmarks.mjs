import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/lib/bookmarks.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { toggleBookmark, parseBookmarks } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const node = (id, extra = {}) => ({ id, name: id, type: 'block', ...extra });
const ids = list => list.map(entry => entry.id);
const cases = [];
function check(name, test) {
  test();
  cases.push(name);
}
check('toggling adds newest first and toggling again removes', () => {
  const added = toggleBookmark(toggleBookmark([], node('a')), node('b'));
  assert.deepEqual(ids(added), ['b', 'a']);
  assert.deepEqual(ids(toggleBookmark(added, node('a'))), ['b']);
});
check('bookmarks drop force-graph runtime fields', () => {
  const [saved] = toggleBookmark([], node('a', { val: 4, blockData: { id: 1 }, x: 3, vx: 1, __threeObj: {}, index: 0 }));
  assert.deepEqual(saved, { id: 'a', name: 'a', type: 'block', val: 4, blockData: { id: 1 } });
  assert.doesNotThrow(() => JSON.stringify(saved));
});
check('stored bookmarks survive a round trip', () => {
  const list = toggleBookmark([], node('channel-1', { type: 'channel', channelData: { slug: 'x' } }));
  assert.deepEqual(parseBookmarks(JSON.parse(JSON.stringify(list))), list);
});
check('malformed stored values yield only valid bookmarks', () => {
  assert.deepEqual(parseBookmarks(null), []);
  assert.deepEqual(parseBookmarks({ id: 'a' }), []);
  assert.deepEqual(ids(parseBookmarks([node('a'), { id: 'b' }, null, node('c', { type: 'user' })])), ['a']);
});
console.log(JSON.stringify({ passed: true, cases }, null, 2));
