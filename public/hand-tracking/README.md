# hand tracking assets

runtime and wasm files are from `@mediapipe/tasks-vision` 1.0.1. the hand landmarker model is from google's mediapipe model distribution, as recorded in `assets.json`. upstream source: https://github.com/google-ai-edge/mediapipe. distributed under the apache 2.0 license in `LICENSE.txt`.

run `node scripts/prepare-hand-assets.mjs` after installing dependencies to verify the pinned runtime and model checksum. `worker.js` is the application's worker entry point. these assets contain no camera data.
