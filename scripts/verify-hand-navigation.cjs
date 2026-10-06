const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.HAND_OUTPUT;
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    if (output) fs.mkdirSync(output, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    let selections = 0; const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const graphData = { nodes: [{ id: 'channel-1', name: 'hover selected channel', type: 'channel', val: 15, channelData: { id: 1, slug: 'selected', title: 'hover selected channel', length: 0 } }], links: [] };
    await page.route('**/api/arena?*', route => route.fulfill({ json: { graphData } }));
    await page.route('**/api/channel?*', route => { selections++; return route.fulfill({ json: { graphData: { nodes: [], links: [] } } }); });
    await page.addInitScript(() => {
      window.scriptedHand = null;
      window.Worker = class {
        postMessage(message) {
          if (message.type === 'init') setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 0);
          if (message.type === 'frame') {
            message.bitmap.close();
            setTimeout(() => this.onmessage?.({ data: { type: 'result', timestamp: message.timestamp, hands: window.scriptedHands ?? (window.scriptedHand ? [window.scriptedHand] : []) } }), 0);
          }
        }
        terminate() { this.onmessage = null; }
      };
    });
    await page.goto(`${process.env.HAND_URL || 'http://localhost:3101'}/explore?slug=navigation`, { waitUntil: 'networkidle' });
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
    const point = await page.evaluate(() => {
      let root; window.graphProbe.scene().traverse(object => { if (object.userData.handNodeId === 'channel-1') root = object; });
      return window.graphProbe.graph2ScreenCoords(root.position.x, root.position.y, root.position.z);
    });
    const focusGraph = () => page.locator('.scene-container canvas').first().evaluate(canvas => { canvas.tabIndex = 0; canvas.focus(); });
    const hand = async (ratio, dx = 0, width = 0.1) => page.evaluate(({ point, ratio, dx, width }) => {
      const x = 1 - point.x / innerWidth + dx, y = point.y / innerHeight;
      const hand = Array.from({ length: 21 }, () => ({ x, y: y + 0.1, z: 0 }));
      hand[5].x = x - width / 2; hand[17].x = x + width / 2;
      hand[8] = { x, y, z: 0 }; hand[4] = { x: x + ratio * width, y, z: 0 };
      window.scriptedHand = hand;
    }, { point, ratio, dx, width });
    await page.getByRole('button', { name: 'hand controls', exact: true }).click();
    await hand(0.7);
    await page.getByRole('button', { name: 'enable camera', exact: true }).click();
    await page.getByRole('button', { name: 'pause', exact: true }).waitFor();
    await focusGraph();
    await page.getByRole('status').filter({ hasText: 'hold over hover selected channel until the ring fills' }).waitFor();
    await page.waitForTimeout(300);
    assert.equal(selections, 0, 'brief hover must not select');
    await page.waitForTimeout(600);
    assert.equal(selections, 1, 'hover dwell invokes existing expansion once');
    await page.waitForTimeout(800);
    assert.equal(selections, 1, 'continued hovering must not repeat expansion');
    await page.getByText('gesture reference', { exact: true }).click();
    await focusGraph();
    await page.getByRole('status').filter({ hasText: 'hold over hover selected channel until the ring fills' }).waitFor();
    const tips = page.getByLabel('hand gestures', { exact: true });
    const selectColor = await tips.locator('div').filter({ has: page.getByText('select', { exact: true }) }).locator('dd').evaluate(element => getComputedStyle(element).color);
    const panColor = await tips.locator('div').filter({ has: page.getByText('pan', { exact: true }) }).locator('dd').evaluate(element => getComputedStyle(element).color);
    assert.notEqual(selectColor, panColor, 'the current gesture is visually distinguished from inactive gestures');
    if (output) await page.screenshot({ path: `${output}/aiming-reference.png` });
    await hand(0.1); await page.waitForTimeout(250);
    const oneZoomBefore = await page.evaluate(() => window.graphProbe.camera().position.distanceTo(window.graphProbe.controls().target));
    await hand(0.1, 0, 0.08); await page.waitForTimeout(350);
    const directZoomOut = await page.evaluate(() => window.graphProbe.camera().position.distanceTo(window.graphProbe.controls().target));
    assert.ok(directZoomOut > oneZoomBefore * 1.4, 'a fresh closed pinch can zoom out without first zooming in');
    await hand(0.1); await page.waitForTimeout(350);
    await hand(0.1, 0, 0.13); await page.waitForTimeout(350);
    const oneZoomAfter = await page.evaluate(() => window.graphProbe.camera().position.distanceTo(window.graphProbe.controls().target));
    assert.ok(oneZoomAfter < oneZoomBefore * 0.7, 'moving a held pinch toward the camera zooms in');
    assert.equal(selections, 1, 'zoom must suppress hover selection');
    await hand(0.1, 0, 0.08); await page.waitForTimeout(350);
    const oneZoomClosed = await page.evaluate(() => window.graphProbe.camera().position.distanceTo(window.graphProbe.controls().target));
    assert.ok(oneZoomClosed > oneZoomBefore * 1.4, 'moving the pinch away zooms past its initial distance');
    await hand(0.7, 0, 0.08); await page.waitForTimeout(150);
    await hand(0.7); await page.waitForTimeout(150);
    const before = await page.evaluate(() => window.graphProbe.camera().position.toArray());
    await hand(0.1); await page.waitForTimeout(440);
    await hand(0.1, 0.05); await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.graphProbe.camera().position.toArray());
    assert.notDeepEqual(after, before, 'held moving pinch orbits the actual graph camera');
    await hand(0.7, 0.05); await page.waitForTimeout(150);
    assert.equal(selections, 1, 'orbit release must not select');
    await hand(0.1, 0.05); await page.waitForTimeout(120);
    await focusGraph();
    await page.keyboard.down('w');
    const heldDistance = await page.evaluate(() => window.graphProbe.camera().position.distanceTo(window.graphProbe.controls().target));
    await hand(0.1, 0.1, 0.15); await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.graphProbe.controls().enabled), true, 'manual input restores mouse control while held');
    const heldAfter = await page.evaluate(() => window.graphProbe.camera().position.distanceTo(window.graphProbe.controls().target));
    assert.ok(Math.abs(heldAfter - heldDistance) < 1e-5, 'held movement blocks competing hand zoom');
    await page.getByText('gesture reference', { exact: true }).focus();
    const focusedCamera = await page.evaluate(() => window.graphProbe.camera().position.toArray());
    await page.waitForTimeout(250);
    assert.deepEqual(await page.evaluate(() => window.graphProbe.camera().position.toArray()), focusedCamera, 'panel focus clears held keyboard motion');
    await page.keyboard.up('w');
    await focusGraph();
    await hand(0.1, 0.14, 0.18); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.graphProbe.controls().enabled), true, 'a closed pinch cannot resume after manual release');
    await hand(0.7); await page.waitForTimeout(250);
    await hand(0.1); await page.waitForTimeout(250);
    await hand(0.1, 0.04); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.graphProbe.controls().enabled), false, 'rearmed moving pinch captures graph controls');
    const statusBounds = await page.getByRole('status').filter({ hasText: /pinch|orbit|zoom/ }).boundingBox();
    await page.mouse.move(statusBounds.x + 5, statusBounds.y + 5);
    const uiWheelDistance = await page.evaluate(() => window.graphProbe.camera().position.distanceTo(window.graphProbe.controls().target));
    await page.mouse.wheel(0, 80);
    await hand(0.1, 0.08, 0.16); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.graphProbe.controls().enabled), true, 'ui wheel releases hand controls');
    assert.ok(Math.abs(await page.evaluate(() => window.graphProbe.camera().position.distanceTo(window.graphProbe.controls().target)) - uiWheelDistance) < 1e-5, 'ui wheel cannot zoom graph or resume closed hands');
    await hand(0.7); await page.waitForTimeout(250);
    await hand(0.1); await page.waitForTimeout(250);
    await hand(0.1, 0.04); await page.waitForTimeout(200);
    await page.mouse.down();
    const uiHeldPosition = await page.evaluate(() => window.graphProbe.camera().position.toArray());
    await hand(0.1, 0.12); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.graphProbe.controls().enabled), true, 'ui pointer-down revokes before native handlers');
    assert.deepEqual(await page.evaluate(() => window.graphProbe.camera().position.toArray()), uiHeldPosition, 'ui pointer holds block hand motion without graph movement');
    await page.mouse.up();
    await focusGraph();
    const twoHands = (separation, ratio) => page.evaluate(({ separation, ratio }) => {
      window.scriptedHands = [0.5 - separation / 2, 0.5 + separation / 2].map(x => {
        const hand = Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 }));
        hand[5].x = x - 0.05; hand[17].x = x + 0.05;
        hand[8] = { x, y: 0.4, z: 0 }; hand[4] = { x: x + ratio * 0.1, y: 0.4, z: 0 };
        return hand;
      });
    }, { separation, ratio });
    await twoHands(0.3, 0.7); await page.waitForTimeout(250);
    await twoHands(0.3, 0.1); await page.waitForTimeout(180);
    const zoomBefore = await page.evaluate(() => window.graphProbe.camera().position.distanceTo(window.graphProbe.controls().target));
    await twoHands(0.36, 0.1); await page.waitForTimeout(350);
    const zoomAfter = await page.evaluate(() => window.graphProbe.camera().position.distanceTo(window.graphProbe.controls().target));
    assert.ok(zoomAfter < zoomBefore * 0.65, 'a small hand spread should zoom the actual camera substantially');
    await twoHands(0.3, 0.1); await page.waitForTimeout(350);
    const zoomReversed = await page.evaluate(() => window.graphProbe.camera().position.distanceTo(window.graphProbe.controls().target));
    assert.ok(Math.abs(zoomReversed / zoomBefore - 1) < 0.02, 'closing back to the starting separation should restore zoom');
    await page.evaluate(() => { window.scriptedHands = undefined; });
    await hand(0.7); await page.waitForTimeout(180);
    const fist = (dx = 0) => page.evaluate(dx => {
      const x = 0.5 + dx, y = 0.5;
      const points = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
      points[0] = { x, y: y + 0.12, z: 0 };
      for (const [index, offset] of [[5, -0.05], [9, -0.017], [13, 0.017], [17, 0.05]]) {
        points[index] = { x: x + offset, y, z: 0 };
        points[index + 1] = { x: x + offset, y: y - 0.05, z: 0 };
        points[index + 3] = { x: x + offset, y: y + 0.05, z: 0 };
      }
      points[4] = { ...points[8] };
      window.scriptedHand = points;
    }, dx);
    await fist(); await page.waitForTimeout(180);
    const panBefore = await page.evaluate(() => ({ camera: window.graphProbe.camera().position.toArray(), target: window.graphProbe.controls().target.toArray(), distance: window.graphProbe.camera().position.distanceTo(window.graphProbe.controls().target) }));
    await fist(0.06); await page.waitForTimeout(300);
    const panAfter = await page.evaluate(() => ({ camera: window.graphProbe.camera().position.toArray(), target: window.graphProbe.controls().target.toArray(), distance: window.graphProbe.camera().position.distanceTo(window.graphProbe.controls().target) }));
    assert.notDeepEqual(panAfter.target, panBefore.target, 'moving a closed fist pans the target');
    assert.ok(Math.abs(panAfter.distance - panBefore.distance) < 1e-5, 'fist pan preserves zoom distance');
    for (let index = 0; index < 3; index++) assert.ok(Math.abs((panAfter.camera[index] - panBefore.camera[index]) - (panAfter.target[index] - panBefore.target[index])) < 1e-5, 'fist pan translates camera and target together');
    const nativeBefore = await page.evaluate(() => window.graphProbe.camera().position.toArray());
    await page.mouse.move(500, 350);
    await page.mouse.down();
    assert.equal(await page.evaluate(() => window.graphProbe.controls().enabled), true, 'graph pointer-down restores controls before native drag');
    await page.mouse.move(570, 390, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    assert.notDeepEqual(await page.evaluate(() => window.graphProbe.camera().position.toArray()), nativeBefore, 'native graph drag works immediately after hand takeover');
    const clickedDistance = await page.evaluate(() => window.graphProbe.camera().position.distanceTo(window.graphProbe.controls().target));
    const clickedPosition = await page.evaluate(() => window.graphProbe.camera().position.toArray());
    await page.keyboard.down('q'); await page.waitForTimeout(160); await page.keyboard.up('q');
    assert.notDeepEqual(await page.evaluate(() => window.graphProbe.camera().position.toArray()), clickedPosition, 'keyboard movement follows a real graph click without synthetic focus');
    assert.ok(Math.abs(await page.evaluate(() => window.graphProbe.camera().position.distanceTo(window.graphProbe.controls().target)) - clickedDistance) < 1e-5, 'keyboard pan translates camera and target together after graph click');
    if (output) await page.screenshot({ path: `${output}/manual-handoff.png` });
    await page.getByRole('button', { name: 'stop camera', exact: true }).click();
    await page.setViewportSize({ width: 700, height: 900 });
    await page.waitForTimeout(300);
    await page.mouse.click(500, 350);
    const narrowBefore = await page.evaluate(() => window.graphProbe.camera().position.toArray());
    await page.keyboard.down('d'); await page.waitForTimeout(160); await page.keyboard.up('d');
    assert.notDeepEqual(await page.evaluate(() => window.graphProbe.camera().position.toArray()), narrowBefore, 'manual keyboard navigation works when hand camera is ineligible');
    assert.deepEqual(errors, []);
    const report = { syntheticLandmarks: true, actualGraphCamera: true, hoverSelections: selections, expansionReused: true, navigationSuppressesHoverSelection: true, oneHandDepthZoom: true, directZoomOutFromClosedPinch: true, closedFistPan: true, manualControlRestored: true, heldKeysBlockHandMotion: true, panelFocusStopsKeyboard: true, releaseRequiresOpenHands: true, uiWheelReleasesHands: true, uiPointerHoldsBlockHands: true, nativePointerTakeover: true, graphClickRestoresKeyboardFocus: true, narrowViewportKeyboard: true, responsiveTwoHandZoom: true, reversibleZoom: true, errors };
    fs.writeFileSync('docs/hand-navigation-validation.json', `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
