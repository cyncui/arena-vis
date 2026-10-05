const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.HAND_URL || 'http://localhost:3101';
(async () => {
  const results = [];
  const fixtureUrl = 'https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg';
  const fixtureResponse = await fetch(fixtureUrl);
  if (!fixtureResponse.ok) throw new Error('official hand fixture unavailable');
  const fixture = Buffer.from(await fixtureResponse.arrayBuffer());
  for (const [name, engine, options] of [
    ['chrome', chromium, { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }],
    ['webkit', webkit, {}],
  ]) {
    let browser;
    try {
      browser = await engine.launch({ headless: true, ...options });
      const page = await browser.newPage();
      await page.route('**/__hand-test.jpg', route => route.fulfill({ body: fixture, contentType: 'image/jpeg' }));
      await page.goto(url);
      const result = await page.evaluate(async () => {
        const worker = new Worker('/hand-tracking/worker.js');
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        canvas.getContext('2d').fillRect(0, 0, 640, 480);
        const start = performance.now();
        let blankHands = null;
        try {
          const message = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('worker timed out')), 20000);
            worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
            worker.onmessage = async event => {
              if (event.data.type === 'error') { clearTimeout(timeout); reject(new Error('worker initialization/inference failed')); }
              if (event.data.type === 'ready') {
                const bitmap = await createImageBitmap(canvas);
                worker.postMessage({ type: 'frame', bitmap, timestamp: performance.now() }, [bitmap]);
              }
              if (event.data.type === 'result') {
                if (blankHands === null) {
                  blankHands = event.data.hands.length;
                  const bitmap = await createImageBitmap(await (await fetch('/__hand-test.jpg')).blob());
                  worker.postMessage({ type: 'frame', bitmap, timestamp: performance.now() }, [bitmap]);
                } else { clearTimeout(timeout); resolve(event.data); }
              }
            };
            worker.postMessage({ type: 'init' });
          });
          return { initialized: true, inference: true, blankHands, hands: message.hands.length, landmarkCounts: message.hands.map(hand => hand.length), elapsedMs: performance.now() - start };
        } finally { worker.terminate(); }
      });
      assert.equal(result.inference, true);
      assert.equal(result.blankHands, 0);
      assert.equal(result.hands, 1);
      assert.deepEqual(result.landmarkCounts, [21]);
      results.push({ browser: name, status: 'passed', fixtureUrl, ...result });
    } catch (error) {
      results.push({ browser: name, status: 'unavailable or failed', error: error.message });
    } finally { await browser?.close(); }
  }
  fs.writeFileSync('docs/hand-worker-validation.json', `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
  if (!results.some(result => result.browser === 'chrome' && result.status === 'passed')) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
