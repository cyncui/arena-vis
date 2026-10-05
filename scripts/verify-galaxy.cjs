const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.argv[2] || 'http://localhost:3101';
const output = process.env.AUDIT_OUTPUT || '/tmp/arena-vis-audit/verification';
fs.mkdirSync(output, { recursive: true });
const graphData = {
  nodes: [
    { id: 'channel-0', name: 'orbital notes', type: 'channel', val: 30, channelData: { id: 0, slug: 'orbital', title: 'orbital notes', length: 2 } },
    { id: 'block-1', name: 'a fragment of starlight', type: 'block', val: 20, blockData: { id: 1, type: 'Text', content: 'a fragment of starlight' } },
    { id: 'block-2', name: 'image study', type: 'block', val: 20, imageUrl: '/images/opengraph.jpg', blockData: { id: 2, type: 'Image', title: 'image study', image: { src: '/images/opengraph.jpg' } } },
  ],
  links: [{ source: 'channel-0', target: 'block-1' }, { source: 'channel-0', target: 'block-2' }],
};
async function attachProbe(page) {
  await page.waitForFunction(() => {
    let element = document.querySelector('.scene-container canvas');
    while (element) {
      const key = Object.keys(element).find(key => key.startsWith('__reactFiber'));
      let fiber = key && element[key];
      while (fiber) {
        let hook = fiber.memoizedState;
        while (hook && typeof hook === 'object') {
          if (hook.memoizedState?.current?.scene && hook.memoizedState.current.renderer && hook.memoizedState.current.renderer().domElement === document.querySelector('.scene-container canvas')) { window.graphProbe = hook.memoizedState.current; return true; }
          hook = hook.next;
        }
        fiber = fiber.return;
      }
      element = element.parentElement;
    }
    return false;
  });
  await page.waitForFunction(() => window.graphProbe.renderer().info.render.triangles > 0);
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
    let found;
    window.graphProbe.scene().traverse(object => { if (object.__graphObjType === 'node' && object.__data.id === id) found = object.__data; });
    if (!found) throw new Error(`missing node ${id}`);
    return window.graphProbe.graph2ScreenCoords(found.x, found.y, found.z);
  }, id);
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(100);
  await page.mouse.click(point.x, point.y, { button });
}
let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    if (url.pathname === '/api/block-connections') {
      return route.fulfill({ json: { graphData: { nodes: [{ id: 'channel-3', name: 'distant connections', type: 'channel', val: 15, channelData: { id: 3, slug: 'distant', title: 'distant connections' } }], links: [{ source: 'block-1', target: 'channel-3' }] } } });
    }
    return route.fulfill({ json: { graphData } });
  });
  await page.goto(`${baseUrl}/explore?slug=orbital`, { waitUntil: 'networkidle' });
  await attachProbe(page);
  await page.waitForTimeout(3000);
  const stems = await page.evaluate(() => {
    const links = [];
    window.graphProbe.scene().traverse(object => { if (object.__graphObjType === 'link') links.push({ type: object.type, opacity: object.material.opacity, transparent: object.material.transparent }); });
    return links;
  });
  assert.equal(stems.length, 2);
  assert(stems.every(link => link.type === 'Line' && link.opacity === 1 && !link.transparent));
  const galaxyCount = () => page.evaluate(() => window.graphProbe.scene().children.filter(object => object.type === 'Points').length);
  assert.equal(await galaxyCount(), 1);
  await clickNode(page, 'block-1');
  await page.locator('p').filter({ hasText: /^a fragment of starlight$/ }).waitFor();
  await page.waitForTimeout(1000);
  const expanded = await page.evaluate(() => { let found = false; window.graphProbe.scene().traverse(object => { if (object.__data?.id === 'channel-3') found = true; }); return found; });
  assert(expanded, 'clicking a text block expands its connecting channels');
  await clickNode(page, 'channel-3', 'right');
  await page.waitForTimeout(500);
  assert(await page.evaluate(() => { let found = false; window.graphProbe.scene().traverse(object => { if (object.__data?.id === 'channel-3') found = true; }); return !found; }), 'right click collapses the new branch');
  await clickNode(page, 'block-2');
  await page.locator('a img').waitFor();
  assert(await page.locator('a img').evaluate(image => image.complete && image.naturalWidth > 0), 'sidebar image loads');
  await page.screenshot({ path: path.join(output, 'desktop-explore.png') });
  await page.getByRole('button', { name: 'clear history', exact: true }).click();
  const cameraBefore = await page.evaluate(() => window.graphProbe.camera().position.toArray());
  await page.locator('.scene-container canvas').click({ position: { x: 900, y: 700 } });
  await page.keyboard.down('w');
  await page.waitForTimeout(200);
  await page.keyboard.up('w');
  const cameraAfter = await page.evaluate(() => window.graphProbe.camera().position.toArray());
  assert.notDeepEqual(cameraAfter, cameraBefore, 'keyboard moves the camera');
  await page.keyboard.down('w');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const stopped = await page.evaluate(() => window.graphProbe.camera().position.toArray());
  await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(() => window.graphProbe.camera().position.toArray()), stopped, 'blur stops held-key movement');
  await page.keyboard.up('w');
  const form = page.locator('form');
  const beforeSearch = requests.length;
  await form.locator('input').fill('new-channel');
  await form.getByRole('button', { name: /^explore$/i }).click();
  await page.waitForURL('**slug=new-channel');
  await attachProbe(page);
  await page.waitForTimeout(500);
  assert.equal(requests.length - beforeSearch, 1, 'new search makes one data request');
  assert.equal(await galaxyCount(), 1, 'new search attaches one galaxy');
  const beforeReload = requests.length;
  await form.getByRole('button', { name: /^explore$/i }).click();
  await page.waitForTimeout(500);
  await attachProbe(page);
  assert.equal(requests.length - beforeReload, 1, 'same-slug search reloads once');
  assert.equal(await galaxyCount(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(2500);
  const canvasBounds = await page.locator('.scene-container canvas').boundingBox();
  assert.equal(canvasBounds.width, 390, 'canvas resizes with the mobile viewport');
  const controlsBounds = await page.getByRole('button', { name: /^controls$/i }).boundingBox();
  const submitBounds = await form.getByRole('button', { name: /^explore$/i }).boundingBox();
  assert(controlsBounds.y >= submitBounds.y + submitBounds.height, 'mobile controls do not cover submit');
  const formBounds = await form.boundingBox();
  assert(formBounds.x >= 0 && formBounds.x + formBounds.width <= 390, 'mobile search fits the viewport');
  await page.screenshot({ path: path.join(output, 'mobile-explore.png') });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(output, 'mobile-landing.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.star').first().waitFor();
  await page.locator('.star').nth(0).click();
  await page.locator('.star').nth(1).click();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('svg line').count(), 1, 'landing stars connect');
  await page.screenshot({ path: path.join(output, 'desktop-landing.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.landing-title').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await page.locator('.star').first().evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(errors.length, 0, errors.join('\n'));
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, requests, stems, errors, scenarios: ['text expansion', 'branch collapse', 'image preview', 'keyboard movement', 'blur cancellation', 'new search', 'same-slug reload', 'galaxy remount', 'mobile canvas resize', 'mobile form and controls', 'landing connections', 'reduced motion'] }, null, 2));
  console.log('passed browser behavior checks');
  await browser.close();
})().catch(async error => { console.error(error); if (browser) await browser.close(); process.exitCode = 1; });
