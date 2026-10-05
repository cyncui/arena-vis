# hand controls research

verified 2026-10-05. the implementation pins `@mediapipe/tasks-vision` to `1.0.1` and hosts its runtime and wasm beside the official float16 hand-landmarker model. no new server endpoint is required.

## tracking and worker boundary

hand landmarker returns 21 normalized landmarks per hand. pinch distance can therefore be derived from thumb and index tips and normalized by palm width. normalized landmark depth is relative to the wrist, so it is not a measurement of distance from the webcam. [official hand-landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js).

`detectForVideo` runs synchronously. the dedicated worker accepts transferred image bitmaps, runs cpu inference, returns landmarks, and closes each bitmap. cpu is an implementation choice to avoid sharing the graph's gpu workload. google publishes a worker implementation using this same transfer and detection boundary. [official worker example](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/hand-landmarker.worker.ts).

the package's result arrays do not supply persistent hand identifiers. proximity association and ambiguity cancellation are application responsibilities. the gesture interpreter uses prior palm positions instead of trusting array order. [official result type](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/hand_landmarker/hand_landmarker_result.d.ts).

## camera and navigation

camera access requires permission and a secure context. localhost is suitable for development; production needs https. request video only after explicit activation, stop tracks when leaving or hiding the page, and clean up streams that arrive after startup was cancelled. [camera api](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [capture specification](https://w3c.github.io/mediacapture-main/).

orbit uses the existing controls target. pan translates the camera and target together, while zoom changes their separation. this preserves the renderer, graph simulation, and existing selection handler. [orbit controls documentation](https://threejs.org/docs/pages/OrbitControls.html).

## application decisions and release checks

pinch thresholds of 0.25 and 0.40, two-sample confirmation, 60 ms smoothing, a 12 px drag threshold, and 18 px particle tolerance are starting values from the approved product plan. subsequent usability feedback replaced pinch-tap selection with a 650 ms hover dwell. a closed fist now pans. a held thumb–index pinch zooms from changes in apparent 3d palm span: toward the camera zooms in, away zooms out, and releasing stops movement. a 3% size change starts zoom; sideways pinch movement still orbits. the original hold-to-orbit timer was removed so a stationary pinch stays armed.

palm span is a relative size proxy, not measured camera distance. its z component reduces simple rotation effects in synthetic cases, but pose changes and tracking noise may still affect it. fist recognition compares four fingertip distances to their pip joints relative to the wrist. these heuristics need real-hand validation and are not reliability guarantees from mediapipe.

capture is capped at 20 inferences per second with one frame in flight. results older than 200 ms cancel the gesture. the preview is mirrored independently from the interpreter's single coordinate mirror. stopping releases the worker and camera; pause retains video but suspends detection.

camera frames and landmarks remain transient in browser memory. the implementation must not upload, record, persist, or log them. downloaded javascript, wasm, and model assets are separate from camera data.

synthetic gesture tests and actual worker initialization do not establish real-hand usability. chrome, safari, edge, lighting, crossings, selection accuracy, and manual-to-hand transitions need their own recorded checks. the performance targets are capture-to-camera-update p95 below 150 ms and at least 85% of feature-off frame rate on the same representative graph. report measured outcomes and untested cases separately.
