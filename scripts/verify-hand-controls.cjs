const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.HAND_URL || 'http://localhost:3101';
const output = process.env.HAND_OUTPUT || '/tmp/arena-vis-hands';
const fixture = { nodes: Array.from({ length: 21 }, (_, index) => ({ id: `channel-${index}`, name: `hand fixture ${index}`, type: 'channel', val: 15, channelData: { id: index, slug: `hand-${index}`, title: `hand fixture ${index}`, length: 0 } })), links: Array.from({ length: 20 }, (_, index) => ({ source: 'channel-0', target: `channel-${index + 1}` })) };
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => {
      window.handTest = { cameraCalls: 0, framePosts: 0, results: 0, terminated: 0, assetRequests: [], streams: [] };
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async options => {
        window.handTest.cameraCalls++;
        const stream = await original(options); window.handTest.streams.push(stream); return stream;
      };
      const WorkerOriginal = window.Worker;
      window.Worker = class extends WorkerOriginal {
        constructor(...args) { super(...args); this.addEventListener('message', event => { if (event.data.type === 'result') window.handTest.results++; }); }
        postMessage(message, ...args) { if (message.type === 'frame') window.handTest.framePosts++; return super.postMessage(message, ...args); }
        terminate() { window.handTest.terminated++; return super.terminate(); }
      };
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/arena?*', route => route.fulfill({ json: { graphData: fixture } }));
    await page.goto(`${url}/explore?slug=hands`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'hand controls', exact: true }).click();
    assert.equal(await page.evaluate(() => window.handTest.cameraCalls), 0);
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/hand-tracking/')).length), 0);
    await page.getByRole('button', { name: 'enable camera', exact: true }).click();
    await page.getByRole('button', { name: 'pause', exact: true }).waitFor({ timeout: 25000 });
    await page.waitForFunction(() => window.handTest.results > 3);
    await page.getByRole('button', { name: /^controls$/i }).click();
    const layout = await page.evaluate(() => {
      const guide = document.querySelector('[aria-label="exploration controls"]').parentElement.getBoundingClientRect();
      const video = document.querySelector('video').getBoundingClientRect();
      return { guideBottom: guide.bottom, videoTop: video.top, videoWidth: video.width, videoHeight: video.height, fits: video.bottom <= innerHeight };
    });
    assert.ok(layout.guideBottom <= layout.videoTop, JSON.stringify(layout));
    assert.ok(layout.fits);
    await page.screenshot({ path: `${output}/desktop-active.png` });
    await page.getByRole('button', { name: 'pause', exact: true }).click();
    await page.waitForTimeout(100);
    const beforePause = await page.evaluate(() => window.handTest.framePosts);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.handTest.framePosts), beforePause);
    assert.equal(await page.evaluate(() => window.handTest.streams.at(-1).getTracks()[0].readyState), 'live');
    await page.getByRole('button', { name: 'resume', exact: true }).click();
    await page.waitForFunction(count => window.handTest.framePosts > count, beforePause);
    const calls = await page.evaluate(() => window.handTest.cameraCalls);
    await page.getByRole('textbox').first().fill('another-channel');
    await page.getByRole('textbox').first().press('Enter');
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.handTest.cameraCalls), calls);
    assert.equal(await page.getByRole('button', { name: 'pause', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'stop camera', exact: true }).click();
    assert.equal(await page.evaluate(() => window.handTest.streams.at(-1).getTracks()[0].readyState), 'ended');
    assert.ok(await page.evaluate(() => window.handTest.terminated > 0));
    await page.getByRole('button', { name: 'enable camera', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'pause', exact: true }).waitFor();
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.evaluate(() => window.handTest.streams.at(-1).getTracks()[0].readyState), 'ended');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.getByRole('button', { name: 'enable camera', exact: true }).count(), 1);
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.screenshot({ path: `${output}/short-desktop.png` });
    await page.getByRole('button', { name: 'enable camera', exact: true }).click();
    await page.getByRole('button', { name: 'pause', exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => window.handTest.streams.at(-1).getTracks()[0].readyState === 'ended');
    assert.equal(await page.getByRole('button', { name: 'hand controls', exact: true }).count(), 0);
    assert.ok(await page.locator('video').isHidden());
    await page.screenshot({ path: `${output}/mobile.png` });
    assert.deepEqual(errors, []);
    const denied = await context.newPage();
    await denied.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
    await denied.route('**/api/arena?*', route => route.fulfill({ json: { graphData: fixture } }));
    await denied.goto(`${url}/explore?slug=denied`, { waitUntil: 'networkidle' });
    await denied.getByRole('button', { name: 'hand controls', exact: true }).click();
    await denied.getByRole('button', { name: 'enable camera', exact: true }).click();
    await denied.getByRole('alert').filter({ hasText: 'camera permission was denied' }).waitFor();
    const phone = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    await phone.route('**/api/arena?*', route => route.fulfill({ json: { graphData: fixture } }));
    await phone.goto(`${url}/explore?slug=phone`, { waitUntil: 'networkidle' });
    assert.equal(await phone.getByRole('button', { name: 'hand controls', exact: true }).count(), 0);
    const report = { landscapePhoneCameraHidden: true, actualWorkerAndFakeCamera: true, lazyActivation: true, pauseKeepsCamera: true, stopReleasesCamera: true, hiddenPageStopsCamera: true, channelChangePreservesCamera: true, keyboardActivation: true, permissionFailure: true, mobileCameraHidden: true, resizeStopsActiveCamera: true, layout, errors };
    fs.writeFileSync('docs/hand-controls-browser-validation.json', `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
