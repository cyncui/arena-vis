# hand back navigation validation

## verified locally

- types pass (`npx tsc --noEmit`). `npm run lint` cannot run non-interactively because the repo has no eslint config, so `next lint` stops at its setup prompt. eslint 9 with `next/core-web-vitals` from a scratch config reports no new findings in changed files.
- selection-history cases cover select without duplicate pushes, jumping, back as a no-op on an empty stack, back from a cleared selection, collapse pruning history and clearing the selection, duplicate collapse after pruning, and clear.
- gesture cases cover one commit exactly `backHoldMs` after entry (default and 400 ms), rising progress, cancel on opening, no back from open, fist, pinch, index-only or three-finger poses, fist during the hold going to pan, no repeat until an open-hand release, a hidden cursor through the hold, and either hand. a removed release check makes the repeat case fail.
- interaction cases cover one `back` commit per hold, no commit with an empty stack, and cancellation by keys, ui focus or pointer input during the hold.
- `verify-hand-back.cjs` drives the real graph and sidebar with scripted landmarks through a fake worker. it covers dwell selection, the empty-stack no-op and its guidance text, the target named during the hold, partial ring progress on the Back button, cancel and ring reset on opening, restoring the previous selection, the release lock, no repeat while held, and the visible Back button after the camera stops. results are in `hand-back-navigation-validation.json`.
- `verify-hand-navigation.cjs` still passes, so existing aim, dwell, pinch, fist, two-hand and handoff behavior is unchanged.

the scripted cancel must open the hand in place. moving the scripted palm about 0.44 of the frame in one step trips the existing jump lock (`gestures.ts`, palm jump over 0.3). a real hand cannot teleport between 50 ms frames.

## current interaction

hold index and middle fingers up, with ring and pinky curled. either hand works. the pose hides the cursor, cancels any dwell, and fills a ring around the sidebar Back arrow. the status line names the target. at 650 ms (`backHoldMs`) the app runs the same back as the button, then locks until every visible hand is open. this matches the existing release rule, which now also refuses a held two-finger pose. opening early cancels with no change. with an empty stack the status says "nothing to go back to" and nothing changes. the visible Back button is unchanged and stays the non-gesture route (wcag 2.5.4). it now also appears when the selected node has been collapsed but history remains.

the ring updates per frame with no css transition, so reduced motion needs no override.

## real-hand evaluation

one person recorded 11 clips in chrome on a webcam on 2026-10-25. they stay local and are gitignored under `scripts/fixtures/hand-sessions/`, so only the summary is committed. `node scripts/eval-back-gesture.mjs --write` replays them through the shipped `HandGestureController` and writes `hand-back-gesture-eval.json`.

- **negatives.** 2.35 minutes across aim (two clips), dwell, pan, pinch-zoom-orbit, two-pinch, locked and mixed. the raw two-finger pose matched in 0 frames, including the aim clips, where the hand points with the index finger and curls the others. no hold from 400 to 1200 ms produced a false back. zero events in 2.35 minutes bounds the rate below about 1.3 per minute at 95% confidence (rule of three), so this is weak evidence. more mixed use would tighten it.
- **recall.** the two back-victory clips contain 19 distinct holds. the typed attempt counts (4 and 10) undercounted them, so the script counts holds over 150 ms instead. holds of 400–800 ms committed 16 of 19 (84%), and holds of 1000–1200 ms committed 15 of 19 (79%). natural holds lasted 1.0–3.6 s, with most from 1.4 to 2.1 s.
- **misses.** all 3 misses happened while input was locked, before the hold started. in two, the hand entered the frame already in the two-finger pose. in the third, the hand curled into a loose fist after the previous back instead of opening. the release rule needs two open-hand frames to re-arm, so these holds never entered `back`. this is the requested release-to-rearm behavior, and the status line asks the user to open their hand. none was a detector miss.
- **hold time.** 650 ms. zero false triggers holds at every tested length, and recall is flat up to 800 ms. 650 ms matches the hover dwell, so both rings fill at the same speed. the pose never appeared in normal use, so the hold adds little safety in this data.
- **swipe comparison.** an open-palm swipe left caught 9 of 10 at a 0.10 frame-width travel within 300 ms, with 0 false triggers in the non-swipe clips. it was not chosen. it is motion rather than a pose, it competes with aiming, and fast swipes tripped the jump lock in 130 of 382 frames. the swipe exists only in the evaluation script.

## pending acceptance checks

- **one person, one camera, one session.** the data covers no lighting variation, other hands, or safari and edge.
- **little negative time.** only 2.35 minutes of non-back use. a longer mixed session would tighten the false-trigger bound.
- **clips are not in the repo.** reproducing the numbers needs the original recordings or new ones made with `?record-hands`.
