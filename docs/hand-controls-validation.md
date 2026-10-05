# hand controls validation

## verified locally

- production build and types pass.
- 35 gesture cases cover single mirroring, closed-pinch drag orbit, held-pinch size zoom in both directions, direct zoom out from a closed pinch, stationary pinch, release without drift, fist priority and mirrored pan, fist/pinch transitions with fresh anchors, two-hand release locking, stable aiming across hand-array reordering, hand identity, lost/stale tracking, reacquisition, manual cancellation, jitter, scaled palms, and constant-span palm rotation. pinch release does not select.
- 10 hover cases cover the 650 ms dwell, progress, one selection per visit, target changes, empty space, cancellation during navigation, selected-node latching, resets, and clock reversal.
- 7 session cases cover permission denial, cancelled startup with a late stream, one inference in flight, pause preserving capture, stale/invalid packets, worker errors and retry, camera disconnect, and unsupported workers.
- 16 graph cases cover orbit target and radius, pan translation, spread zoom, minimum distance, thumbnail priority, 18 px tolerance, hidden ancestors/meshes, viewport and camera clipping, and empty hits.
- chrome runs the actual pinned cpu worker and model. an official thumb-up fixture produces one hand with 21 landmarks, and a blank frame produces none. the browser lifecycle test uses a generated camera, so it does not establish webcam recognition quality.
- synthetic landmarks exercise the real graph adapter and existing channel expansion handler. one hover dwell produces one expansion request and continued hovering does not repeat it. changing the size of a held pinch changes the actual camera distance in both directions, starting directly with zoom out. a closed fist translates camera and target together without changing their separation. navigation suppresses dwell selection, and manual input restores mouse controls.
- keyboard activation, pause/resume, stop, channel changes, tab-hiding cleanup, permission failures, and desktop/mobile panel layout pass, including landscape phones and stopping an active camera when narrowing the viewport. the flight guide scrolls above the camera.

reproduction scripts are `test-hand-gestures.mjs`, `test-hand-hover.mjs`, `test-hand-session.mjs`, `test-hand-graph.mjs`, `verify-hand-worker.cjs`, `verify-hand-controls.cjs`, and `verify-hand-navigation.cjs` in `scripts/`. browser scripts use `PLAYWRIGHT_MODULE` if playwright is supplied by the host rather than the project.

## performance evidence

the measurements below precede the hover and one-hand gesture revision. `hand-controls-performance.json` records five alternating feature-off/on production runs on this apple m5 pro mac. the fixture is the existing 121-node, 120-link graph at 1440 × 900 with device scale 2. installed chrome runs headless, and the active side uses generated video with actual cpu inference. there were no page errors; triangle draw calls and 300 inference results confirm work ran during measurement.

median rendered frame rate was 59.95 fps off and 59.97 fps on. the ranges were 59.93–59.97 and 59.97–60.28 fps. both sides follow the roughly 60 hz animation-frame scheduler. this frame-paced headless workload cannot establish visible desktop rendering headroom or real-hand performance. no speedup is claimed.

capture-to-worker-result p95 was 22.9 ms across the active runs. this includes bitmap creation, transfer, inference, and worker return, starting at the session capture timestamp. generated video contains no hands, so there was no camera movement in these samples. it is not the requested capture-to-camera-update latency. the below-150-ms movement target and 85% baseline retention release checks remain inconclusive for real hands.

## pending acceptance checks

safari is installed, but webdriver reports that remote automation is disabled. its settings were left unchanged. playwright webkit is not installed and would not prove native safari compatibility. edge is not installed. both native browser checks remain unverified; initialization failures have a recoverable unsupported/error state and no main-thread fallback.

real-hand usability in chrome and safari, edge smoke testing, both-hand crossings, lighting variation, small particles and thumbnails, and manual-to-hand transitions still require a person using a webcam. recording these results is a release check. no camera frames or landmarks were saved by the app or included in validation output.

## independent review

reviewed by gpt-6-astra. the review found two concrete defects. narrowing the viewport hid controls while capture remained active; the session now stops below desktop width. thumbnail raycasts bypassed camera clipping; intersections now respect the camera depth range. regression checks cover both findings. hand zoom now applies cubic gain to the spacing ratio, so smaller spreads produce more camera travel. adapter tests check reversible zoom without target drift, and the browser test exercises spreading and closing against the actual graph camera.

## current interaction

hover for 650 ms to select, using the cursor ring as progress. make a closed fist and move it to pan; opening the hand stops movement. pinch thumb and index with the other fingers open, then move toward the camera to zoom in or away to zoom out. release to stop, reposition, and pinch again for more travel. sideways movement of a closed pinch orbits. zoom and orbit latch separately until release, preventing lateral drift during zoom. two pinches retain the alternative midpoint pan and spread zoom, requiring both hands to release before restarting. hover selection is suspended during navigation.

these directions use apparent palm size as a depth proxy. the latest revision passes synthetic tests, but its comfort and recognition accuracy with real hands remain unverified.
