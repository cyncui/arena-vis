const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.argv[2] || 'http://localhost:3101';
const output = process.env.AUDIT_OUTPUT || '/tmp/arena-vis-particle/verification';
fs.mkdirSync(output, { recursive: true });
const channel = (id, name, x, y) => ({ id: `channel-${id}`, name, type: 'channel', val: 30, fx: x, fy: y, fz: 0, channelData: { id, slug: name.replaceAll(' ', '-'), title: name, length: 3 } });
const text = (id, name, x, y) => ({ id: `block-${id}`, name, type: 'block', val: 20, fx: x, fy: y, fz: 0, blockData: { id, type: 'Text', content: name } });
const graphData = {
  nodes: [
    channel(0, 'orbital notes', -150, 20), channel(2, 'violet archive', 30, 50), channel(1, 'distant studies', 180, -40),
    text(1, 'a fragment of starlight', -210, 80), text(3, 'a second fragment', -170, -75),
    text(5, 'violet fragment', 45, 125), text(6, 'another violet fragment', 100, 30),
    text(7, 'distant fragment', 205, 45), text(8, 'another distant fragment', 220, -115),
    { id: 'block-10', name: 'image study', type: 'block', val: 20, fx: -65, fy: -70, fz: 0, imageUrl: '/images/opengraph.jpg', blockData: { id: 10, type: 'Image', title: 'image study', image: { src: '/images/opengraph.jpg' } } },
  ],
  links: [
    { source: 'channel-0', target: 'channel-2' }, { source: 'channel-0', target: 'channel-1' },
    { source: 'channel-0', target: 'block-1' }, { source: 'channel-0', target: 'block-3' }, { source: 'channel-0', target: 'block-10' },
    { source: 'channel-2', target: 'block-5' }, { source: 'channel-2', target: 'block-6' },
    { source: 'channel-1', target: 'block-7' }, { source: 'channel-1', target: 'block-8' },
  ],
};
for (const [clusterIndex, owner] of graphData.nodes.filter(node => node.type === 'channel').entries()) {
  for (let index = 0; index < 4; index++) {
    const angle = index * Math.PI / 2 + 0.3;
    const child = text(20 + clusterIndex * 4 + index, `${owner.name} particle ${index + 1}`, owner.fx + Math.cos(angle) * 80, owner.fy + Math.sin(angle) * 80);
    child.fz = index % 2 ? 35 : -35;
    graphData.nodes.push(child);
    graphData.links.push({ source: owner.id, target: child.id });
  }
}
async function attachProbe(page) {
  await page.waitForFunction(() => {
    let element = document.querySelector('.scene-container canvas');
    while (element) {
      const key = Object.keys(element).find(key => key.startsWith('__reactFiber'));
      let fiber = key && element[key];
      while (fiber) {
        let hook = fiber.memoizedState;
        while (hook && typeof hook === 'object') {
          const graph = hook.memoizedState?.current;
          if (graph?.scene && graph.renderer && graph.renderer().domElement === document.querySelector('.scene-container canvas')) { window.graphProbe = graph; return true; }
          hook = hook.next;
        }
        fiber = fiber.return;
      }
      element = element.parentElement;
    }
    return false;
  });
  await page.waitForFunction(expectedLinks => {
    let links = 0;
    window.graphProbe.scene().traverse(object => {
      if (object.__graphObjType === 'link') links++;
    });
    return links === expectedLinks && window.graphProbe.renderer().info.render.triangles > 0;
  }, graphData.links.length);
}
async function clickNode(page, id, button = 'left') {
  await page.evaluate(() => window.graphProbe.scene().traverse(object => {
    if (object.__graphObjType === 'node') {
      const node = object.__data;
      node.fx = node.x; node.fy = node.y; node.fz = node.z;
    }
  }));
  await page.waitForTimeout(100);
  const point = await page.evaluate(id => {
    let node;
    window.graphProbe.scene().traverse(object => { if (object.__graphObjType === 'node' && object.__data.id === id) node = object.__data; });
    if (!node) throw new Error(`missing node ${id}`);
    return window.graphProbe.graph2ScreenCoords(node.x, node.y, node.z);
  }, id);
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(100);
  await page.mouse.click(point.x, point.y, { button });
}
async function snapshot(page) {
  return page.evaluate(() => {
    const nodes = {};
    const links = [];
    window.graphProbe.scene().traverse(object => {
      if (object.__graphObjType === 'node') {
        const meshes = [];
        object.traverse(child => { if (child.isMesh) meshes.push({ shape: child.geometry.type, color: child.material.color?.getHexString(), opacity: child.material.opacity, transparent: child.material.transparent }); });
        nodes[object.__data.id] = meshes;
      }
      if (object.__graphObjType === 'link') links.push({ type: object.type, points: object.geometry?.attributes?.position?.count, opacity: object.material.opacity, transparent: object.material.transparent });
    });
    return { nodes, links };
  });
}
let browser;
let page;
const errors = [];
const requests = [];
(async () => {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    if (url.pathname === '/api/random-channel') return route.fulfill({ json: { channel: { slug: 'random-particle-study', title: 'random particle study' } } });
    if (url.pathname === '/api/block-connections') return route.fulfill({ json: { graphData: url.searchParams.get('id') === '1' ? { nodes: [channel(9, 'expanded branch', -275, 15)], links: [{ source: 'block-1', target: 'channel-9' }] } : { nodes: [], links: [] }, allExplored: true } });
    if (url.pathname === '/api/channel') return route.fulfill({ json: { graphData: { nodes: [], links: [] } } });
    return route.fulfill({ json: { graphData } });
  });
  await page.goto(`${baseUrl}/explore?slug=particle-study`, { waitUntil: 'networkidle' });
  await attachProbe(page);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.graphProbe.zoomToFit(0, 180));
  await page.waitForTimeout(300);
  const initial = await snapshot(page);
  assert.equal(initial.links.length, graphData.links.length, 'all fixture connections render');
  assert(initial.links.every(link => link.type === 'Line' && link.points > 2 && link.opacity === 1 && !link.transparent), 'stems render as opaque native curves');
  const particleIds = graphData.nodes.filter(node => !node.imageUrl).map(node => node.id);
  for (const id of particleIds) assert(initial.nodes[id].some(mesh => mesh.shape === 'SphereGeometry'), `${id} renders as a particle`);
  assert(particleIds.every(id => initial.nodes[id].every(mesh => mesh.shape !== 'BoxGeometry')), 'text particles replace cubes');
  const color = id => initial.nodes[id].find(mesh => mesh.shape === 'SphereGeometry').color;
  assert.equal(new Set(['channel-0', 'channel-2', 'channel-1'].map(color)).size, 3, 'channel clusters remain visually distinct');
  for (const [owner, child] of [['channel-0', 'block-1'], ['channel-0', 'block-3'], ['channel-2', 'block-5'], ['channel-2', 'block-6'], ['channel-1', 'block-7'], ['channel-1', 'block-8']]) assert.equal(color(owner), color(child), `${child} inherits its channel color`);
  assert(initial.nodes['block-10'].some(mesh => mesh.shape === 'PlaneGeometry'), 'image cards retain their image surface');
  await page.screenshot({ path: path.join(output, 'desktop-particles.png') });
  await clickNode(page, 'block-1');
  await page.locator('p').filter({ hasText: /^a fragment of starlight$/ }).waitFor();
  await page.waitForFunction(() => { let found = false; window.graphProbe.scene().traverse(object => { if (object.__data?.id === 'channel-9') found = true; }); return found; });
  const highlighted = await snapshot(page);
  assert.notEqual(highlighted.nodes['block-1'][0].color, color('block-1'), 'selected particle highlights');
  await clickNode(page, 'block-3');
  await page.locator('p').filter({ hasText: /^a second fragment$/ }).waitFor();
  await page.getByRole('button', { name: /back/i, exact: false }).click();
  await page.locator('p').filter({ hasText: /^a fragment of starlight$/ }).waitFor();
  const historySelected = await snapshot(page);
  assert.equal(historySelected.nodes['block-1'][0].color, highlighted.nodes['block-1'][0].color, 'history target receives the selection highlight');
  assert.equal(historySelected.nodes['block-3'][0].color, color('block-3'), 'history leaves the previous particle in its cluster color');
  await page.getByRole('button', { name: 'clear history', exact: true }).click();
  await page.getByRole('button', { name: 'clear history', exact: true }).waitFor({ state: 'hidden' });
  const restored = await snapshot(page);
  assert.equal(restored.nodes['block-1'][0].color, color('block-1'), 'clearing selection restores the cluster color');
  assert.equal(restored.nodes['block-3'][0].color, color('block-3'), 'history navigation restores the previous particle color');
  await clickNode(page, 'channel-9', 'right');
  await page.waitForFunction(() => { let found = false; window.graphProbe.scene().traverse(object => { if (object.__data?.id === 'channel-9') found = true; }); return !found; });
  await clickNode(page, 'block-10');
  await page.locator('a img').waitFor();
  await page.waitForFunction(() => { const image = document.querySelector('a img'); return image?.complete && image.naturalWidth > 0; });
  await page.getByRole('button', { name: 'clear history', exact: true }).click();
  await page.getByRole('button', { name: /^random$/i }).click();
  await page.waitForURL('**slug=random-particle-study');
  await attachProbe(page);
  assert.equal((await snapshot(page)).links.length, graphData.links.length, 'random channel renders the graph');
  const form = page.locator('form');
  await form.locator('input').fill('new-particle-study');
  await form.getByRole('button', { name: /^explore$/i }).click();
  await page.waitForURL('**slug=new-particle-study');
  await attachProbe(page);
  assert.equal((await snapshot(page)).links.length, graphData.links.length, 'search renders the new graph');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.graphProbe.zoomToFit(0, 70));
  const canvas = await page.locator('.scene-container canvas').boundingBox();
  assert.equal(canvas.width, 390, 'graph canvas fits mobile width');
  const random = await page.getByRole('button', { name: /^random$/i }).boundingBox();
  const controls = await page.getByRole('button', { name: /^controls$/i }).boundingBox();
  assert(random.x + random.width <= controls.x || random.y + random.height <= controls.y || controls.y + controls.height <= random.y, 'mobile controls leave random usable');
  await page.screenshot({ path: path.join(output, 'mobile-particles.png') });
  await clickNode(page, 'block-1');
  await page.locator('p').filter({ hasText: /^a fragment of starlight$/ }).waitFor();
  await page.screenshot({ path: path.join(output, 'mobile-selection.png') });
  assert.equal(errors.length, 0, errors.join('\n'));
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, initial, requests, errors, scenarios: ['opaque curved stems', 'spherical particles', 'cluster colors', 'selection and history restore', 'expansion and collapse', 'image preview', 'random channel', 'new search', 'mobile canvas', 'mobile particle selection'] }, null, 2));
  console.log('passed particle browser checks');
  await browser.close();
})().catch(async error => {
  console.error(error);
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: false, message: error.message, requests, errors }, null, 2));
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(output, 'failure.html'), await page.content().catch(() => ''));
  }
  if (browser) await browser.close();
  process.exitCode = 1;
});
