const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.HAND_OUTPUT;
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    if (output) fs.mkdirSync(output, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const channel = (id, name) => ({ id, name, type: 'channel', val: 15, channelData: { id: Number(id.slice(-1)), slug: id, title: name, length: 0 } });
    const graphData = { nodes: [channel('channel-1', 'first channel'), channel('channel-2', 'second channel')], links: [] };
    await page.route('**/api/arena?*', route => route.fulfill({ json: { graphData } }));
    await page.route('**/api/channel?*', route => route.fulfill({ json: { graphData: { nodes: [], links: [] } } }));
    await page.addInitScript(() => {
      window.scriptedHand = null;
      window.Worker = class {
        postMessage(message) {
          if (message.type === 'init') setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 0);
          if (message.type === 'frame') {
            message.bitmap.close();
            setTimeout(() => this.onmessage?.({ data: { type: 'result', timestamp: message.timestamp, hands: window.scriptedHand ? [window.scriptedHand] : [] } }), 0);
          }
        }
        terminate() { this.onmessage = null; }
      };
    });
    await page.goto(`${process.env.HAND_URL || 'http://localhost:3101'}/explore?slug=back`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'hand controls', exact: true }).waitFor();
    await page.evaluate(() => {
      let element = document.querySelector('.scene-container canvas');
      while (element) {
        const key = Object.keys(element).find(key => key.startsWith('__reactFiber'));
        let fiber = key && element[key];
        while (fiber) {
          let hook = fiber.memoizedState;
          while (hook && typeof hook === 'object') {
            if (hook.memoizedState?.current?.scene && hook.memoizedState.current.renderer) { window.graphProbe = hook.memoizedState.current; return; }
            hook = hook.next;
          }
          fiber = fiber.return;
        }
        element = element.parentElement;
      }
      throw new Error('graph instance not found');
    });
    await page.waitForTimeout(2500);
    const screenOf = id => page.evaluate(id => {
      let root; window.graphProbe.scene().traverse(object => { if (object.userData.handNodeId === id) root = object; });
      return window.graphProbe.graph2ScreenCoords(root.position.x, root.position.y, root.position.z);
    }, id);
    const openHand = point => page.evaluate(point => {
      const x = 1 - point.x / innerWidth, y = point.y / innerHeight;
      const hand = Array.from({ length: 21 }, () => ({ x, y: y + 0.1, z: 0 }));
      hand[5].x = x - 0.05; hand[17].x = x + 0.05;
      hand[8] = { x, y, z: 0 }; hand[4] = { x: x + 0.07, y, z: 0 };
      window.scriptedHand = hand;
    }, point);
    const backPose = () => page.evaluate(() => {
      const x = 0.5, y = 0.5;
      const points = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
      points[0] = { x, y: y + 0.12, z: 0 };
      for (const [index, offset, extended] of [[5, -0.05, true], [9, -0.017, true], [13, 0.017, false], [17, 0.05, false]]) {
        points[index] = { x: x + offset, y, z: 0 };
        points[index + 1] = { x: x + offset, y: y - 0.05, z: 0 };
        points[index + 3] = { x: x + offset, y: extended ? y - 0.15 : y + 0.05, z: 0 };
      }
      points[4] = { x: x + 0.017, y: y + 0.03, z: 0 };
      window.scriptedHand = points;
    });
    const status = () => page.getByRole('status').first().innerText();
    const selected = () => page.locator('div.w-80 button[aria-expanded]').first().innerText();
    const focusGraph = () => page.locator('.scene-container canvas').first().evaluate(canvas => { canvas.tabIndex = 0; canvas.focus(); });

    const first = await screenOf('channel-1');
    await page.getByRole('button', { name: 'hand controls', exact: true }).click();
    await openHand(first);
    await page.getByRole('button', { name: 'enable camera', exact: true }).click();
    await page.getByRole('button', { name: 'pause', exact: true }).waitFor();
    await focusGraph();
    await page.waitForTimeout(1100);
    assert.match(await selected(), /first channel/i, 'dwell selects the first channel');

    await backPose(); await page.waitForTimeout(500);
    assert.match(await status(), /nothing to go back to/, 'empty stack shows guidance');
    await page.waitForTimeout(1200);
    assert.match(await selected(), /first channel/i, 'empty stack back is a no-op');
    await openHand({ x: 720, y: 360 }); await page.waitForTimeout(300);

    await openHand(await screenOf('channel-2')); await page.waitForTimeout(1100);
    assert.match(await selected(), /second channel/i, 'dwell selects the second channel');
    assert.ok(await page.getByRole('button', { name: /^back$/i }).isVisible(), 'visible back button is present');

    await backPose(); await page.waitForTimeout(450);
    assert.match(await status(), /keep holding to go back to first channel/, 'hold names the back target');
    const partial = await page.evaluate(() => Number(document.querySelector('button circle[style]')?.style.strokeDashoffset));
    assert.ok(partial > 0 && partial < 56.55, `back ring shows partial progress (${partial})`);
    if (output) await page.screenshot({ path: `${output}/back-hold.png` });
    await openHand({ x: 720, y: 360 }); await page.waitForTimeout(400);
    assert.match(await selected(), /second channel/i, 'opening the hand cancels back');
    assert.equal(await page.evaluate(() => document.querySelector('button circle[style]')?.style.strokeDashoffset), '56.55', 'cancel resets the ring');

    await backPose();
    await page.waitForTimeout(1400);
    assert.match(await selected(), /first channel/i, 'held pose goes back to the previous selection');
    assert.match(await status(), /open all visible hands/, 'commit requires release');
    await page.waitForTimeout(1500);
    assert.match(await selected(), /first channel/i, 'held pose does not repeat');

    assert.equal(await page.getByRole('button', { name: /^back$/i }).count(), 0, 'back button hides once the stack is empty');
    await openHand({ x: 720, y: 360 }); await page.waitForTimeout(300);
    await openHand(await screenOf('channel-2')); await page.waitForTimeout(1100);
    assert.match(await selected(), /second channel/i, 'dwell reselects the second channel after release');
    await page.evaluate(() => { window.scriptedHand = null; });
    await page.getByRole('button', { name: 'stop camera', exact: true }).click();
    await page.getByRole('button', { name: /^back$/i }).click();
    const buttonStillWorks = /first channel/i.test(await selected());
    assert.deepEqual(errors, []);
    const report = {
      syntheticLandmarks: true,
      actualGraphCamera: true,
      backPoseRestoresPrevious: true,
      backHoldNamesTarget: true,
      backRingShowsProgress: true,
      backCancelsOnOpenHand: true,
      backRequiresRelease: true,
      backDoesNotRepeat: true,
      backNoopAtRoot: true,
      visibleBackButtonWorks: buttonStillWorks,
      errors,
    };
    fs.writeFileSync('docs/hand-back-navigation-validation.json', `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
