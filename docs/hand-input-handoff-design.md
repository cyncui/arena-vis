# hand controls and input handoff with checkpoint

status: checkpoint approved and implemented locally. the caller example imports the actual implementation so typecheck detects contract drift. validation results are recorded with the implementation evidence.

## problem

handoff policy is split between `HandControlsPanel` gesture resets, `Arena3D` dwell/control refs and its keyboard loop. a keydown cancels hands once, while a held key can continue moving the camera on later frames. keyboard focus exclusions also differ: the panel ignores its descendants, while the graph excludes editable fields. the current navigation proof moves focus out of the panel before testing takeover. navigation keys remain the existing `w/a/s/d/q/e` plus `Shift`; this design adds no new shortcuts.

keep the proven gesture/session algorithms and graph navigation. consolidate arbitration so every hand frame checks the same manual ownership, focus and graph lifetime.

## usage first

```ts
const interaction = createHandInteraction({ tracking: trackingForVideo, now });
const detach = interaction.attach(graphSurface);
const input = bindManualInput(graphElement, interaction);
const unobserve = interaction.observe(renderPanel);
interaction.environment({ visible, eligible });
await interaction.camera('start');
```

callers never reset gestures, clear dwell or acquire/release controls themselves. the compiled caller example and signatures are in [the type sketch](design/hand-input-handoff.sketch.ts). the panel constructs one owner after its stable preview video exists. renderer attachments can change independently. mounting the preview must not start capture; only the camera action does.

## state and module boundaries

| module | owns | boundary |
| --- | --- | --- |
| new `hand-controls/interaction.ts` | session orchestration, manual holds, hand rearm, gesture/dwell instances, attachment validity, presentation | camera action, environment, graph attachment, manual facts, observation, disposal |
| existing `session.ts` | media tracks, worker, startup generation, packet validation, timestamp floor, one inference in flight | existing methods through a private tracking factory |
| existing `gestures.ts` and `hover-selection.ts` | pure gesture geometry/release and dwell calculations | internal dependencies of the interaction owner |
| new `hand-controls/dom-input.ts` | dom normalization and one focus classifier | reports facts before native handlers; retains no competing key state |
| renderer-local graph adapter | picking, aim/highlight/cursor drawing, camera math, keyboard raf/mouse mode, exact control restoration | `GraphSurface`, derived keyboard intent and a revocable motion lease |
| `HandControlsPanel` | panel visibility, preview rendering, semantic status and actions | observes view and calls camera commands |
| `Arena3D` | graph lifetime, keyboard motion math, selection/history, loading and async expansion | attaches surface, consumes navigation intent, existing selection handler |

start the graph adapter beside `Arena3D`; extract it only if it reduces that file's responsibilities without exposing three.js internals. this is a capability boundary, not a requirement for another forwarding module.

capture state and hand ownership are separate dimensions. paused capture keeps preview; it cannot keep a motion lease. hand state is one of unavailable, yielded, aiming or moving. manual holds are independent facts, not a competing gesture enum. gesture, dwell and lease internals stay private. renderer aim uses immediate refs; semantic panel state changes can update react without routing every cursor coordinate through it.

this applies model-the-domain to orthogonal state, boundary-discipline to renderer/tracker ports, and laziness-protocol to hiding coordinated cancellation from callers. reuse existing `HandFrame`, `HandMotion` and session types instead of inventing parallel wire/domain representations.

## handoff rules

| event | synchronous result | reacquisition |
| --- | --- | --- |
| movement/shift key down or any pointer down, including ui | revoke hand lease, clear cursor/highlight/dwell before native camera writes | all manual holds end, then fresh open-hand observations |
| wheel, including over ui | revoke hands; graph wheel behavior remains local to graph controls | fresh open-hand observations after the event |
| focus enters panel/ui/editable content | revoke hands and clear graph movement keys/modifier | focus returns to graph; new physical key press or fresh open hands |
| keyup, pointerup/cancel, window blur | clear holds even if focus/target changed | blur clears all holds and requires rearm |
| either hand begins pinch/fist closure | cancel aim on the first raw closure, before gesture confirmation | preserve existing gesture release rules |
| stale/empty frame | clear aim/dwell and revoke motion | fresh valid release observations |
| pause or resume | clear interactions; pause retains preview; resume rejects pre-pause inference | fresh release observations after resume |
| stop, hidden, ineligible, error or disposal | invalidate hand effects immediately, restore controls, stop capture | explicit camera action when eligible; never automatic restart |
| graph detach/replacement | clear interactions and release the old renderer lease; retain preview | new attachment and fresh release observations |

all focused ui suppresses graph keyboard motion, including non-editable panel buttons and the gesture disclosure. `data-hand-ui` and editable targets form the shared classification. clicking graph space restores graph scope. key repeats cannot restart movement cleared by ui focus; a release and new press are required. shift also blocks hands because it changes native mouse mode; it produces a keyboard intent with no movement keys. the owner synchronously publishes derived intent to `GraphSurface.keyboard`, whose renderer adapter updates mouse mode and schedules its existing keyboard raf. its cached projection is immutable; it does not interpret input or mutate a second key set. pointer holds are tracked by id, with release observed outside the original target. ui pointer holds block hands even when the element does not take focus, and never move the graph. the dom binding sends initial focus and later focus facts; environment updates contain only visibility/eligibility, so callers cannot overwrite focus with a stale snapshot.

open-hand observations while manual input is held do not count toward rearming. hand acquisition starts after the final blocker ends, using the existing release-window behavior. wheel has no invented delay. these are the approved focus/handoff rules.

## lifetimes and cancellation

an attachment identity represents a renderer lifetime, independent of channel slug. attaching replaces and revokes the previous attachment synchronously. detachers are idempotent and identity-bound: an old detacher cannot clear the new renderer. call the current detacher before destroying its renderer. graph-data replacement that invalidates targets also replaces the attachment; camera movement does not.

a motion lease captures the exact previous control flags, disables the relevant native movement, and restores those flags once. takeover releases it in capture-phase listeners before native control handlers run. owner checks attachment identity after renderer callbacks because selection can replace the graph synchronously. host setup returns cleanup synchronously, before permission/startup promises. host cleanup disposes the dom binding to remove listeners, detaches the graph before renderer teardown, then disposes the owner. owner disposal stops tracking and makes callbacks inert; it does not own dom listener registration. panel and arena effects perform this host-lifetime cleanup; camera actions do not coordinate it.

the tracking factory gives each capture lifetime callbacks bound to that lifetime. owner epochs reject old callbacks; the existing session still validates worker generations and packets. pause/resume fences inference using the session timestamp floor; handoff also rejects frames captured before its rearm boundary. repeated start while starting/running is a no-op, repeated stop/pause/dispose is safe. lifecycle calls revoke synchronously before awaiting startup; stop must never queue behind unresolved permission.

selection dispatches once to the current graph's existing `handleNodeClick`. this boundary cancels pending dwell, not async expansion already dispatched. request epochs/history changes are deliberately outside this design and need a separate grounded change if requested.

## synthesis decision

three independent inherited-model runners supplied packages; each compared whole-shape alternatives. this is independent comparison, not cross-model evidence.

choose candidate 1's owner-held manual state and tracking orchestration, candidate 3's separate capture/hand presentation and attachment identities, and candidate 2's explicit renderer lease. the final keyboard intent is published by the owner through the graph port so callers do not coordinate scheduling and the graph cannot maintain a second semantic key set. shift remains a blocker to preserve its native mouse-mode handoff. the panel cannot separately implement hidden/ineligible camera shutdown.

a reducer plus effect interpreter exposes ordering/epoch obligations to callers and adds a framework for a bounded policy. sampled independent inputs cannot revoke before native pointer mutation without a second emergency path. a unified camera-command controller would require replacing native controls and broadens the change. a lease-only gate leaves dwell/rearm resets split across callers. retain these as rejected alternatives, not future scaffolding.

## tradeoffs and risks

one interaction owner has more responsibility than a tracker-only service, but its scope is bounded to input policy and lifecycle. it does not own graph data, request state, camera math or worker transport. the interface hides reset choreography; implementation should delete the old competing paths in the same migration.

ui focus and wheel require fresh hand release. that favors predictable manual takeover but may feel more deliberate. preserve visible rearm guidance and verify it with synthetic input before evaluating physical hand ergonomics.

capture-phase ordering against the graph library is an implementation risk, not a proven guarantee. if handlers still mutate before revocation, change listener placement or the adapter; do not add caller-side reset workarounds. preview mounting and react strict-mode cleanup also need lifetime tests.

## implementation and proof

1. add owner tests with fake tracker, graph and clock; cover held input, focus/repeats, stale callbacks, reentrant attachment replacement and idempotent restoration. keep gesture/session test contracts.
2. migrate panel gesture state and graph dwell/lease state together; delete old reset listeners/refs. preserve visual controls and existing gesture thresholds.
3. wire one dom adapter and derived keyboard intent. prove native pointer/wheel ordering, off-target release, ui focus, window blur and multi-pointer holds.
4. run the existing verification skill and extend its navigation script for held-key competition, release-after-takeover, same-slug renderer replacement, pause/start races and reachable stop. preserve screenshots/results; stop only processes started for the proof.

acceptance requires no hand motion/dwell during manual holds, fresh rearm after the last hold, no stale effects after graph/capture replacement, exactly one selection per dwell, exact flags restored on every exit, and camera tracks stopped on hidden/ineligible/disposal. deterministic scripts and synthetic browser flows prove arbitration; physical recognition/ergonomics still require a camera check.

## checkpoint and implementation decisions

the user approved this shape before implementation. the stable preview video owns construction of the interaction owner and publishes it to the arena; renderer attachments have separate lifetimes. no extra hook was needed. a single key map records physical holds and whether each was admitted from graph scope. ui-origin holds block hands but never become graph movement on focus return.

the graph adapter remains beside `Arena3D`. it stores only immutable derived keyboard intent, draws the cursor directly and restores captured native flags. replacing a graph invalidates attachment when prior targets disappear; adding results preserves the completed dwell latch.

independent review required lifecycle identity checks around external callbacks and publication guards so an observer cannot restart disposed capture or deliver stale status after a newer nested update. these are covered by deterministic tests. real graph clicks establish keyboard focus before native control handlers.


manual keyboard navigation is independent of hand-camera eligibility. narrow viewports and coarse-pointer devices still receive graph keyboard intent when focused and visible.
