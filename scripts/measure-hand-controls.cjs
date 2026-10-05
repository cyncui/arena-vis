const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.HAND_URL || 'http://localhost:3101';
const nodes = Array.from({ length: 121 }, (_, i) => ({ id: `channel-${i}`, name: `constellation ${i}`, type: 'channel', val: i ? 15 : 30, channelData: { id: i, slug: `constellation-${i}`, title: `constellation ${i}`, length: 12 } }));
const graphData = { nodes, links: nodes.slice(1).map((node, i) => ({ source: `channel-${Math.floor(i / 4)}`, target: node.id })) };
const percentile = (values, percent) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * percent) - 1)] : null;
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const results = [];
  try {
    for (let run = 0; run < 5; run++) for (const enabled of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/arena?*', route => route.fulfill({ json: { graphData } }));
      await page.addInitScript(() => {
        let seed = 42; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        window.handPerf = { measuring: false, draws: 0, triangleDraws: 0, latencies: [], results: 0, activeFrames: new Set() };
        const draw = WebGL2RenderingContext.prototype.drawElements;
        WebGL2RenderingContext.prototype.drawElements = function(mode, count, ...rest) {
          if (window.handPerf.measuring) { window.handPerf.draws++; if (mode === this.TRIANGLES && count) window.handPerf.triangleDraws++; window.handPerf.activeFrames.add(window.handPerf.lastTime); }
          return draw.call(this, mode, count, ...rest);
        };
        const raf = window.requestAnimationFrame;
        window.requestAnimationFrame = callback => raf.call(window, time => { window.handPerf.lastTime = time; callback(time); });
        const OriginalWorker = window.Worker;
        window.Worker = class extends OriginalWorker {
          constructor(...args) {
            super(...args);
            this.addEventListener('message', event => {
              if (event.data.type === 'result' && window.handPerf.measuring) { window.handPerf.results++; window.handPerf.latencies.push(performance.now() - event.data.timestamp); }
            });
          }
        };
      });
      await page.goto(`${url}/explore?slug=audit`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'hand controls', exact: true }).waitFor();
      if (enabled) {
        await page.getByRole('button', { name: 'hand controls', exact: true }).click();
        await page.getByRole('button', { name: 'enable camera', exact: true }).click();
        await page.getByRole('button', { name: 'pause', exact: true }).waitFor({ timeout: 20000 });
      }
      await page.waitForTimeout(3500);
      await page.evaluate(() => { window.handPerf.measuring = true; window.handPerf.started = performance.now(); });
      await page.waitForTimeout(3000);
      const result = await page.evaluate(() => ({ elapsedMs: performance.now() - window.handPerf.started, renderedFrames: window.handPerf.activeFrames.size, draws: window.handPerf.draws, triangleDraws: window.handPerf.triangleDraws, results: window.handPerf.results, latencies: window.handPerf.latencies, longTasks: performance.getEntriesByType('longtask').length }));
      assert.deepEqual(errors, []); assert.ok(result.triangleDraws > 0);
      if (enabled) assert.ok(result.results > 0, 'actual inference must run in the measured region');
      results.push({ run, enabled, errors, ...result, fps: result.renderedFrames / result.elapsedMs * 1000, captureToResultP95Ms: percentile(result.latencies, 0.95) });
      await page.close();
      console.log(`run ${run + 1} ${enabled ? 'on' : 'off'} complete`);
    }
  } finally { await browser.close(); }
  const summary = {};
  for (const enabled of [false, true]) {
    const samples = results.filter(result => result.enabled === enabled), fps = samples.map(result => result.fps);
    summary[enabled ? 'on' : 'off'] = { medianFps: percentile(fps, 0.5), fpsRange: [Math.min(...fps), Math.max(...fps)], captureToResultP95Ms: percentile(samples.flatMap(result => result.latencies), 0.95), inferenceResults: samples.reduce((count, sample) => count + sample.results, 0) };
  }
  fs.writeFileSync('docs/hand-controls-performance.json', `${JSON.stringify({ fixture: { nodes: nodes.length, links: graphData.links.length }, mode: 'production headless installed chrome, fake camera, actual cpu inference', claim: 'inconclusive for real-hand latency and visible desktop frame-rate acceptance; capture-to-result is measured, camera movement is not exercised', summary, results }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
