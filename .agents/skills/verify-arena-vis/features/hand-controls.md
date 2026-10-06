# navigate with hand controls

Users enable the camera explicitly, pause or resume tracking, and use hand gestures to navigate and select graph nodes.

## Sub-features

- `hands-camera` defers camera and tracking assets until enablement and stops streams on disablement.
- `hands-pause` pauses frame submission and resumes tracking.
- `hands-layout` keeps camera and navigation controls usable across viewports.
- `hands-navigation` selects nodes and moves the graph using scripted hand results.
- `hands-handoff` gives held keys, panel focus, pointer holds and wheel input priority over hands until fresh rearming.
- `hands-worker` initializes tracking and handles worker lifecycle behavior.
- `hands-reference` teaches gestures before camera permission and highlights the current action beside the preview.

## How to get to it (user POV)

- Open a channel in `/explore?slug=<channel>`.
- Choose `hand controls`, then `enable camera`.
- Choose `pause`, `resume`, or the disable control in the panel.

## Driving it with Playwright

Preconditions:

- The skill's doctor passes. Set `HAND_URL="$ARENA_VERIFY_URL"`.
- For `verify-hand-controls.cjs` and `verify-hand-worker.cjs`, Google Chrome must exist at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- Back up the tracked reports named below before running, following the skill's evidence instructions.
- Worker verification fetches `https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg` and needs network access. WebKit coverage needs the Playwright WebKit browser.

Run the matching command and capture stdout, stderr, and exit status:

- `HAND_URL="$ARENA_VERIFY_URL" HAND_OUTPUT="$ARENA_VERIFY_OUTPUT/hands" node scripts/verify-hand-controls.cjs` proves camera lifecycle and responsive panel behavior. Preserve screenshots and `docs/hand-controls-browser-validation.json` outside the checkout.
- `HAND_URL="$ARENA_VERIFY_URL" HAND_OUTPUT="$ARENA_VERIFY_OUTPUT/hand-navigation" node scripts/verify-hand-navigation.cjs` proves scripted gesture navigation, target feedback, and selection. Preserve `docs/hand-navigation-validation.json` and `aiming-reference.png`.
- `HAND_URL="$ARENA_VERIFY_URL" node scripts/verify-hand-worker.cjs` checks worker behavior. Preserve `docs/hand-worker-validation.json`. Require `status: 'passed'` for each browser you claim. Exit code zero requires only Chrome to pass and can hide unavailable or failed WebKit coverage.

For isolated logic, run `node scripts/test-hand-gestures.mjs`, `node scripts/test-hand-session.mjs`, `node scripts/test-hand-hover.mjs`, `node scripts/test-hand-graph.mjs`, or `node scripts/test-hand-interaction.mjs`. Record each outcome separately.

The lifecycle script opens and closes `gesture reference` with the keyboard before enabling the camera. It also captures `before-camera.png` and `short-desktop-active.png`, verifying stop controls remain reachable with expanded help at 1024 × 600. The gesture suite covers first-closure cancellation of a nearly completed dwell by either hand.

## Gotchas

- Browser scripts use fake media, fixture graph data, and, for navigation, scripted worker results. They do not prove real-hand recognition quality or actual permission prompts.
- These browser scripts overwrite tracked JSON reports. Copy new reports into evidence and restore pre-run bytes after both success and failure.
- `measure-hand-controls.cjs` measures performance and writes a report. Read it and apply `$benchmark-checklist` before using it for a performance verdict.

The navigation browser script also proves held-key competition, panel focus stopping movement, closed hands remaining locked after takeover, ui wheel/pointer cancellation, immediate native graph drag, and keyboard movement after a real graph click. Preserve `manual-handoff.png` beside `aiming-reference.png`. The interaction suite covers lifetime and callback ordering without a browser.

The lifecycle script also delays the camera result until after stop, then verifies every late track ends and capture stays idle. The navigation script checks manual keyboard movement below the hand-camera breakpoint.
