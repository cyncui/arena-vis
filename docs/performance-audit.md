# performance audit

the graph now loads less javascript and renders less triangle geometry. the five alternating production runs show no clear frame-rate improvement in headless chromium. the remaining draw-call count is unchanged.

the recorded measurements precede the later particle styling and hand-controls revisions. the current background contains 350 points; the table records the earlier 1,400-point implementation.

## measured workload

the fixture contains 121 channel nodes and 120 links. each run uses a fresh browser page at 1440 by 900 css pixels and device pixel ratio 2. the harness seeds randomness, intercepts the initial api response, waits 18 seconds for layout, and observes rendering for 2 seconds. all ten runs rendered the full graph, made one initial data request, and reported no page errors.

| measurement | baseline | galaxy implementation | change |
| --- | ---: | ---: | ---: |
| loaded script bytes | 647,700 | 478,028 | 26.2% fewer |
| triangles per frame | 136,464 | 20,328 | 85.1% fewer |
| background points | 2,000 | 1,400 | 30% fewer |
| draw calls per frame | 363 | 363 | unchanged |
| geometry objects | 243 | 363 | 120 more |

these measurements precede the final mobile resize fix. the final production smoke comparison is recorded separately in `performance-final-smoke.json`. it confirms 478,102 loaded script bytes and the same 20,328 triangles per frame after that follow-up.

native lines each allocate a small geometry. the old cylinders share their geometry, which explains the higher geometry-object count. that count measures objects rather than allocated bytes. reduced sphere resolution and removal of link cylinders explain the lower triangle count. esm imports remove the separate commonjs three.js engine path and explain the lower loaded script bytes.

the channel-only fixture does not represent thumbnail-heavy browsing. it also excludes live are.na latency. retained resource bytes are workload measurements, not a prediction of elapsed load time. the headless frame counts overlap across versions, and separate cpu profiles are dominated by native browser work. the profiler does not establish a javascript bottleneck. no frame-rate speedup is claimed.

## changes and tradeoffs

the existing graph model still owns research nodes and links. a separate static points object owns the galaxy background. a seeded spiral distribution provides depth during camera movement without bloom, animated particles, or added dependencies. its geometry and material are removed and disposed on graph replacement.

channel spheres use fewer segments and basic materials. they lose glossy physical shading. image previews and channel brackets remain. stems use the library's native line renderer with full opacity. their screen-space thickness stays constant during zoom.

keyboard animation runs only while movement keys are held and stops on blur. hidden documents pause graph rendering. url changes now own search loading, while submitting the current slug still reloads it. simulation work stops after 120 ticks. the large fixture remains readable, and browser checks confirm that expanding a block still adds its connecting channels.

the landing uses static gradients and stars instead of its 508,521-byte background png. it also removes perpetual glyph animations. constellation connections are solid strokes. reduced-motion settings disable entrance and pulse animations.

## verification and remaining costs

the production build and type check pass. `verify-galaxy.cjs` drives text expansion, branch collapse, image previews, keyboard movement, blur cancellation, changed and repeated searches, galaxy remounts, mobile resizing, landing connections, and reduced motion. desktop and mobile screenshots were inspected. the final mobile follow-up moves controls below the search form and resizes the canvas with the viewport.

draw calls still grow with the number of nodes and links. instancing spheres and batching brackets could reduce that count, but it would require a larger rendering change. existing texture-cache retention and the graph library's root text-mesh disposal behavior remain. this change only establishes explicit ownership for the added galaxy resources.

the x profile could not be fetched. the visual direction is an interpretation of the requested galaxy and thin-stem aesthetic, rather than verified visual parity with a specific post.

## repeat the checks

use production servers for both versions. the scripts require playwright from an installed tooling environment. `PLAYWRIGHT_MODULE` selects that module without adding an application dependency. this workspace used the bundled runtime.

```sh
export PLAYWRIGHT_MODULE=/Users/cozycloud/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright
AUDIT_OUTPUT=/tmp/arena-vis-audit/comparison node scripts/perf-audit.cjs http://localhost:3100 http://localhost:3101
node scripts/verify-galaxy.cjs http://localhost:3101
```

the renderer's `info.render` values are the total draw and primitive counts. the `indexedCalls`, `indexedTriangles`, and `indexedLines` instrumentation covers only indexed draws and must not be used as total rendering cost. the harness uses react fiber only to locate the current renderer for instrumentation. behavior checks operate through browser inputs and visible output.

`performance-audit.json` retains the baseline revision, run method, all five samples per version, and limitations. raw screenshots and cpu profiles are local under `/tmp/arena-vis-audit`. the scripts regenerate screenshots and measurements.

laziness protocol selected native lines and removed redundant loading and idle work. model the domain kept decorative particles separate from graph data and viewport dimensions together. separate before serializing shared state gave the shared graph files one implementation writer. prove it works required production builds and browser checks. explain the number restricted the performance claims to measurements supported by the fixture.
