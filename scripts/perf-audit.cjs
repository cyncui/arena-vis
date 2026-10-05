const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.AUDIT_OUTPUT || '/tmp/arena-vis-audit';
const urls = process.argv.slice(2);
if (!urls.length) throw new Error('pass one or more production server urls');
fs.mkdirSync(output, { recursive: true });
const nodes = Array.from({ length: 121 }, (_, i) => ({
  id: `channel-${i}`, name: `constellation ${i}`, type: 'channel', val: i ? 15 : 30,
  channelData: { id: i, slug: `constellation-${i}`, title: `constellation ${i}`, length: 12 },
}));
const graphData = { nodes, links: nodes.slice(1).map((node, i) => ({ source: `channel-${Math.floor(i / 4)}`, target: node.id })) };
let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (let run = 0; run < Number(process.env.AUDIT_RUNS || 5); run++) {
    for (const [side, url] of urls.entries()) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
      const errors = [];
      let apiRequests = 0;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/arena?*', route => {
        apiRequests++;
        return route.fulfill({ json: { graphData } });
      });
      await page.addInitScript(() => {
        let seed = 42;
        Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        window.audit = { indexedCalls: 0, indexedTriangles: 0, indexedLines: 0, frames: 0, frameTimes: [], last: 0 };
        const draw = WebGL2RenderingContext.prototype.drawElements;
        WebGL2RenderingContext.prototype.drawElements = function(mode, count, ...rest) {
          if (mode === this.TRIANGLES) window.audit.indexedTriangles += count / 3;
          if (mode === this.LINES) window.audit.indexedLines += count / 2;
          window.audit.indexedCalls++;
          return draw.call(this, mode, count, ...rest);
        };
        const raf = window.requestAnimationFrame;
        window.requestAnimationFrame = callback => raf.call(window, time => {
          window.audit.frames++;
          if (window.audit.last !== time) {
            if (window.audit.last) window.audit.frameTimes.push(time - window.audit.last);
            window.audit.last = time;
          }
          callback(time);
        });
      });
      await page.goto(`${url}/explore?slug=audit`, { waitUntil: 'networkidle' });
      await page.locator('.scene-container canvas').waitFor();
      await page.evaluate(() => {
        let element = document.querySelector('.scene-container canvas');
        while (element) {
          const key = Object.keys(element).find(key => key.startsWith('__reactFiber'));
          let fiber = key && element[key];
          while (fiber) {
            let hook = fiber.memoizedState;
            while (hook && typeof hook === 'object') {
              if (hook.memoizedState?.current?.scene && hook.memoizedState.current.renderer) { window.auditGraph = hook.memoizedState.current; return; }
              hook = hook.next;
            }
            fiber = fiber.return;
          }
          element = element.parentElement;
        }
        throw new Error('graph instance not found');
      });
      await page.waitForTimeout(18000);
      if (!run) await page.screenshot({ path: path.join(output, `side-${side}-desktop.png`) });
      await page.evaluate(() => { window.audit.indexedCalls = 0; window.audit.indexedTriangles = 0; window.audit.indexedLines = 0; window.audit.frames = 0; window.audit.frameTimes = []; window.audit.last = 0; });
      await page.waitForTimeout(2000);
      const sample = await page.evaluate(() => {
        const graph = { nodes: 0, links: 0 };
        window.auditGraph.scene().traverse(object => {
          if (object.__graphObjType === 'node') graph.nodes++;
          if (object.__graphObjType === 'link') graph.links++;
        });
        return ({
        ...window.audit,
        render: { ...window.auditGraph.renderer().info.render },
        memory: { ...window.auditGraph.renderer().info.memory },
        graph,
        resources: performance.getEntriesByType('resource').filter(r => r.initiatorType === 'script').reduce((bytes, r) => bytes + r.encodedBodySize, 0),
        canvas: { width: document.querySelector('.scene-container canvas').width, height: document.querySelector('.scene-container canvas').height },
      });
      });
      if (errors.length || apiRequests !== 1 || sample.graph.nodes !== nodes.length || sample.graph.links !== graphData.links.length || sample.render.triangles === 0) throw new Error(JSON.stringify({ errors, apiRequests, sample }));
      results.push({ side, run, url, apiRequests, errors, ...sample });
      await page.close();
    }
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ fixture: { nodes: nodes.length, links: graphData.links.length }, results }, null, 2));
  console.log(JSON.stringify(results.map(({ frameTimes, last, ...result }) => result), null, 2));
  await browser.close();
})().catch(async error => { console.error(error); if (browser) await browser.close(); process.exitCode = 1; });
