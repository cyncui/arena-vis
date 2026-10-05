import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const originalFetch = globalThis.fetch;
const originalRandom = Math.random;
const originalUsername = process.env.ARENA_USERNAME;
const originalToken = process.env.ARENA_ACCESS_TOKEN;
process.env.ARENA_USERNAME = 'cynthia';
delete process.env.ARENA_ACCESS_TOKEN;
const channel = slug => ({ id: 123, type: 'Channel', slug, title: slug });
const page = (count, items = [channel('first-followed')]) => ({ data: items, meta: { total_count: count } });
const cases = [];
try {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const source = readFileSync(new URL('../src/app/api/random-channel/route.ts', import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { GET } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
  async function check(name, random, responses, expectedStatus, expectedSlug, expectedPages) {
    const requests = [];
    Math.random = () => random;
    globalThis.fetch = async (input, init) => {
      const url = new URL(input);
      assert.equal(url.hostname, 'api.are.na');
      assert.equal(url.pathname, '/v3/users/cynthia/following');
      assert.equal(url.searchParams.get('type'), 'Channel');
      assert.equal(url.searchParams.get('per'), '1');
      assert.equal(url.searchParams.get('sort'), 'created_at_desc');
      requests.push({ page: Number(url.searchParams.get('page')), cache: init?.cache });
      const response = responses.shift();
      assert(response, 'unexpected extra upstream request');
      if (response instanceof Error) throw response;
      return response instanceof Response ? response : Response.json(response);
    };
    const response = await GET(new Request('http://localhost/api/random-channel'));
    const body = await response.json();
    assert.equal(response.status, expectedStatus, name);
    if (expectedSlug) assert.equal(body.channel.slug, expectedSlug, name);
    else assert.equal(typeof body.error, 'string', name);
    if (expectedPages) assert.deepEqual(requests.map(request => request.page), expectedPages, name);
    assert(requests.length <= 4, 'selection does not enumerate the following list');
    cases.push({ name, status: response.status, requests: requests.length });
  }
  await check('first followed channel', 0, [page(92)], 200, 'first-followed', [1]);
  await check('last followed channel', 1 - Number.EPSILON, [page(92), page(92, [channel('last-followed')])], 200, 'last-followed', [1, 92]);
  await check('empty following list', 0, [page(0, [])], 404);
  await check('upstream rate limit', 0, [Response.json({ error: 'limited' }, { status: 429 })], 429);
  await check('unexpected mixed following item', 0, [page(1, [{ id: 9, type: 'User', slug: 'not-a-channel', title: 'user' }])], 502);
  await check('network failure', 0, [new Error('network unavailable')], 502);
  await check('following count changed', 1 - Number.EPSILON, [page(5), page(4, []), page(4), page(4, [channel('updated-last')])], 200, 'updated-last', [1, 5, 1, 4]);
  console.log(JSON.stringify({ passed: true, cases }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  Math.random = originalRandom;
  if (originalUsername === undefined) delete process.env.ARENA_USERNAME;
  else process.env.ARENA_USERNAME = originalUsername;
  if (originalToken === undefined) delete process.env.ARENA_ACCESS_TOKEN;
  else process.env.ARENA_ACCESS_TOKEN = originalToken;
}
