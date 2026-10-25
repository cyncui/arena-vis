# hand back navigation research

verified 2026-10-25 against `main` at `cdb9d4f`. no code was changed. repo claims cite `path:line`; external claims link the primary source. no secondary write-ups were needed.

## how back works today

"back" is an in-memory selection stack, not a route. `/explore` renders one client component from the `slug` search param (`src/app/explore/page.tsx:3-11`). selecting a node pushes the previous selection onto `history` (`src/components/Arena3D.tsx:415-427`). the sidebar's back button calls `jumpToHistory(history.length - 1)`, which reselects that entry and truncates the stack (`Arena3D.tsx:429-439`, `:882-890`). the path breadcrumb jumps to any entry (`:846-877`). clear history empties it (`:964-975`). back changes only the selection and sidebar. it does not refetch, remove expanded nodes, or move the camera. that matches the prd's "accumulate, don't replace" (`PRD.md:113`). the prd lists "navigation history with breadcrumb trail" as built (`PRD.md:72`). no doc or prd mentions a hand back gesture.

url history changes only when the slug changes, through search or random (`Arena3D.tsx:383`, `:406`). a new slug calls `fetchData`, which clears selection and history (`:286-289`, `:333-341`). browser back therefore returns to the previous graph and loses its selection stack. no keyboard shortcut exists for back. the only global key listeners are the movement and shift keys (`src/lib/hand-controls/dom-input.ts:3`, `:12-16`). the browser flow already clicks the back button (`scripts/verify-particles.cjs:133`; `.agents/skills/verify-arena-vis/features/exploration.md:29`).

the stack has edge cases a gesture would make more frequent:

- right-click collapse removes nodes without pruning `history` (`Arena3D.tsx:513-561`). back can reselect a node that is no longer in the graph.
- collapsing the selected node clears `selectedNode` but keeps `history`. the back button lives inside the selection panel, so it disappears while a stack remains (`:559-561`, `:829`).
- "block → channel" is not a modeled relation. back returns to the previous selection, which may be another block.

## how hand tracking is wired

the worker runs `HandLandmarker` on the cpu with `numHands: 2`. it returns only `result.landmarks` and drops handedness (`public/hand-tracking/worker.js:12-16`, `:28-29`). the session submits at most one frame every 50 ms with one inference in flight (`src/lib/hand-controls/session.ts:103-115`). that is about 20 hz, so a 300 ms motion yields about six samples. `createHandInteraction` owns gesture and dwell state, manual handoff, the motion lease, and the published view (`src/lib/hand-controls/interaction.ts:60-285`). frames are ignored whenever focus is in the ui, manual input is held, the tab is hidden, or no graph is attached (`interaction.ts:78-87`, `:128-129`).

`HandGestureController.step` (`src/lib/hand-controls/gestures.ts:54-187`) produces these states (`src/lib/hand-controls/types.ts:8`):

| gesture | pose / rule | bound to |
| --- | --- | --- |
| `aiming` | open hand. the cursor is the mirrored index tip (`gestures.ts:68`, `:115-116`) | 650 ms hover dwell selects the node (`hover-selection.ts:3-23`, `interaction.ts:160-169`) |
| `pan` | fist: all four fingertips nearer the wrist than 0.9 × their pip distance (`gestures.ts:34-37`). confirmed over 2 frames (`:96`, `:103`) | camera and target translate together (`:127-141`) |
| `pinch` → `orbit` / `zoom` | thumb–index ratio ≤ 0.25 to close, ≥ 0.40 to release, 2-frame confirmation (`:38`, `:93-94`, `:107`). zoom starts at 3% palm-span change and orbit at 12 px (`:166-169`) | zoom gain `^0.65` (`:172`). orbit (`:175`) |
| `two-hand` | two confirmed pinches (`:154-156`) | midpoint pan and spread zoom (`:143-153`) |
| `locked` | stale data over 200 ms, lost or crossing hands, or a jump over 0.3 (`:56-59`, `:66`, `:72-89`) | blocks everything until two frames with all hands open (`:118-121`) |

a raw closure (fist, or ratio ≤ 0.25) hides the cursor and cancels dwell before confirmation (`gestures.ts:115-116`; `docs/hand-controls-arena.md:24`). picking ignores anything under `[data-hand-ui]`, so the hand cursor cannot reach the sidebar back button (`Arena3D.tsx:681-686`, `:786`). guidance is a status line plus a `gesture reference` list (`src/components/HandControlsPanel.tsx:16-24`, `:111-117`, `:133`, `:141-152`) and a hands paragraph in the flight guide (`src/components/NavigationGuide.tsx:76`). dwell progress drives the cursor ring (`Arena3D.tsx:701`, `:1008-1015`).

a back gesture must not collide with:

- **open hand.** it aims, selects, and rearms after a lock.
- **fist.** it pans. thumb-up, thumb-down, and thumb-sideways poses curl all four fingers, so `isFist` already classifies them as pan.
- **thumb–index pinch.** sideways pinch movement already means orbit.
- **two pinches.**

## what the stack can detect

**canned gestures.** mediapipe's gesture recognizer classifies `None`, `Closed_Fist`, `Open_Palm`, `Pointing_Up`, `Thumb_Down`, `Thumb_Up`, `Victory` and `ILoveYou`. it can allowlist or denylist categories and set a score threshold ([gesture recognizer guide](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer)). its web result includes landmarks, world landmarks, handedness and gestures per hand. it uses `recognizeForVideo` in video mode and a separate `gesture_recognizer.task` model ([web guide](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js)). adopting it means a new pinned asset and either replacing `HandLandmarker` or running two graphs. the docs do not say whether the two outputs are interchangeable, so that needs a check.

the [model card](https://storage.googleapis.com/mediapipe-assets/gesture_recognizer/model_card_hand_gesture_classification_with_faireness_2022.pdf) says the classifier runs on landmarks and handedness only, never pixels (p. 1). it lists two-hand gestures and "gestures involving motion" as out of scope (p. 2). it reports weighted specificity–sensitivity f1 of 95.5% across skin tones and 93.9% across gender expression on curated sets (p. 4). it notes the model has "not been tested in 'in-the-wild'" camera conditions (p. 3). it gives no per-class confusion. how often `Victory` or `Pointing_Up` fires during ordinary open-hand aiming is unknown.

**landmark heuristics.** the hand landmarker supplies 21 landmarks and handedness. in video mode it tracks between frames and reruns palm detection only when tracking fails ([hand landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)). the canned classifier consumes those same landmarks. a heuristic like the existing `isFist` can detect a two-finger pose (index and middle extended, ring and pinky curled) without a new model. its reliability would come from our tests, not from google's numbers. this mirrors the caveat in `docs/hand-controls-research.md:23`.

**swipes.** google ships no motion classifier, so a swipe would be application logic over palm velocity. at about 20 hz, distance, duration and direction thresholds rest on about 4–8 samples. the open hand also aims, so a lateral flick looks like a fast retarget.

**pinch and drag.** sideways pinch drag is already orbit (`gestures.ts:168-169`). using it for back would need a new latch.

## platform conventions

- **apple.** apple's gesture guidelines list swipe as the common gesture to "dismiss views". they say a hierarchy still needs a back button, and a swipe from the side should be a shortcut that supplements it. a custom gesture should be discoverable, distinct, and "not the only way" to perform an action. avoid gestures that require a specific hand, and weigh two-hand gestures carefully. visionos reserves the palm-up hand roll for system overlays. gestures should give feedback that communicates "the extent and type of movement required" ([hig: gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)).
- **meta.** meta's gesture guidance says to "limit use to a small number of very simple poses and gestures." it says to test continuously for accidental activation and to gate gestures, for example by hover or proximity ([gesture design](https://developers.meta.com/horizon/design/hands-gesture-design/)). the hands page asks for "immediate and clear visual and auditory cues" and alternative inputs ([hands](https://developers.meta.com/horizon/design/hands/)). quest microgestures map thumb swipes along the index finger to directions, and detection fires "at the end of the motion" ([unity microgestures](https://developers.meta.com/horizon/documentation/unity/unity-microgestures/)). that needs headset-grade tracking, not a webcam.
- **android predictive back.** the gesture streams progress, commits on release past a threshold, and reverts on cancel ([implementation](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture), [design](https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back)). this is the model for a held pose with a progress ring that cancels when the hand opens.
- **accessibility.** wcag 2.5.4 covers "explicit eye, face, or hand gestures to a camera". such functionality must also work through ui components ([understanding 2.5.4](https://www.w3.org/WAI/WCAG22/Understanding/motion-actuation.html)). the existing back button satisfies the alternative. it must stay visible whenever the gesture can act.

## history semantics

`router.back()` moves back in the browser history stack, and `router.push` adds an entry ([next.js useRouter](https://nextjs.org/docs/app/api-reference/functions/use-router)). `history.back()` is asynchronous, does nothing when there is no previous page, and may be throttled when called too often ([mdn](https://developer.mozilla.org/en-US/docs/Web/API/History/back)). `navigation.canGoBack` is "Baseline 2026, newly available" ([mdn](https://developer.mozilla.org/en-US/docs/Web/API/Navigation/canGoBack)).

block and channel selections never touch the url. a gesture that calls `router.back()` would leave the graph, wipe the stack, and could leave the site if the user arrived from are.na. it would also disagree with the visible back button. there is no parent route to target. the gesture should call the same `jumpToHistory(history.length - 1)` as the button. on an empty stack it should do nothing and say so. crossing slugs stays a browser action. if url-addressable selection is wanted later (the prd's sharing question, `PRD.md:102`), it becomes a separate routing change, and both the button and the gesture then move to `router.back()`.

## risks and open questions

- **accidental triggers.** a held pose or a swipe can fire during ordinary aiming, retargeting or rearm. gate the gesture to the `aiming` state with no motion lease. require hold progress, and require a release before the next back. reuse `reset(true)` locking (`gestures.ts:47-52`) so a held pose cannot repeat.
- **dwell ping-pong.** after back, the cursor may still sit over the node just left. the dwell latch clears when the cursor leaves (`hover-selection.ts:10`), so drifting back reselects it. a raw back pose must cancel aim the way closure does.
- **one hand or two.** apple and the model card both argue for one hand. handedness is discarded at `worker.js:29`, so "either hand" is the only option without changing the worker.
- **feedback.** the back pose needs a gesture label, a reference entry and flight-guide text (`HandControlsPanel.tsx:16-24`; `NavigationGuide.tsx:76`). it needs a visible progress cue: the cursor ring, or a ring on the back button. the `role="status"` line (`HandControlsPanel.tsx:133`) can announce the result and "nothing to go back to". back also needs a target name (the previous selection), the way dwell names its target.
- **reduced motion.** back is currently instant. if it later flies the camera to the restored node, honor `prefers-reduced-motion` ([mdn](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)). `globals.css:167-179` covers only css animations today.
- **stack correctness.** prune `history` on collapse, and keep a back affordance when the selection is cleared. otherwise the gesture exposes the existing edge cases above.
- **validation.** add pure cases to `scripts/test-hand-gestures.mjs`. cover pose recognition, no back from a fist or pinch, required release, cancellation on open hand, and no repeat. extend `scripts/verify-hand-navigation.cjs`, which injects scripted landmarks through a fake worker (`:15-26`). add boolean keys to `docs/hand-navigation-validation.json`, such as `backPoseRestoresPrevious`, `backRequiresRelease`, `backNoopAtRoot` and `backSuppressedDuringNavigation`. update `.agents/skills/verify-arena-vis/features/hand-controls.md`. real-hand false-positive rates stay a recorded manual check (`docs/hand-controls-validation.md:24-28`).

## recommendation and open questions

recommend a one-hand "two-finger" pose (index and middle up, ring and pinky curled, the shape of mediapipe's `Victory`). either hand works. holding it fills a progress ring, opening the hand cancels, and completion calls the same `jumpToHistory` as the button and then locks until release. thumb poses already read as fist (`gestures.ts:34-37`). `Pointing_Up` is nearly the aiming pose, since the cursor is the index tip. `ILoveYou` is harder to form. `Victory` is distinct from fist and pinch but currently reads as aiming, so a raw match must cancel aim. it uses the existing dwell, progress and release vocabulary, and it matches predictive back's progress, commit and cancel model. detect it with a landmark heuristic first, and add no model. a lateral open-palm swipe is the more familiar alternative, but it competes directly with aiming and has no google classifier behind it. prototype both with recorded real-hand sessions before committing. keep the visible back button as the required wcag 2.5.4 alternative. consider making it dwell-targetable, which today's `[data-hand-ui]` exclusion prevents.

open questions:

- should back mean "previous selection", as today, or "parent channel of this block", which would need a new graph query?
- should the gesture ever cross slugs through `router.back()`?
- what hold time works? reusing 650 ms is consistent, but a back that fires by mistake may need longer.
- is a recognizer model worth the extra asset and inference over a heuristic?
- what false-positive rate is acceptable in real-hand sessions, and how will it be recorded?
