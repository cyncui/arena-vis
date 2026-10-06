# hand controls arena

three independent candidates received the same brief. improve discovery and predictable use while preserving gestures, explicit camera activation, privacy, manual fallback, and desktop availability. each used a separate checkout. the independent judge inherited the chat model.

## selection

| criterion, scored 0–5 | candidate 1 | candidate 2 | candidate 3 |
| --- | --- | --- | --- |
| discovery and feedback | 4 | 4 | 5 |
| reliability and cancellation | 4 | 4 | 4 |
| evidence and tests | 3 | 4 | 3 |
| maintenance cost | 5 | 4 | 5 |
| existing behavior compatibility | 5 | 3 | 5 |

candidate 3 is the base. its native disclosure keeps help compact, camera actions precede the reference, and feedback names the hovered target and highlights the current action. the parent initially favored candidate 2 for its regression evidence, then accepted the judge's ui base after reviewing the second-hand gap and always-expanded layout. all three agreed that recognition tuning lacked real-hand evidence.

## grafts and rejections

- candidate 1 supplied explicit thumb/index posture, release guidance, and privacy text before camera activation.
- candidate 2 supplied immediate cursor suppression during pending navigation and literal regression tests. review reproduced the same gap on the second hand, so synthesis covers either hand and duplicate frames.
- recovery names all visible hands. two-hand instructions explain both spreading and closing.
- rejected always-expanded help above camera actions, new gesture modes, and threshold tuning. no candidates dropped out.

the existing `HandOutput`, `GestureState`, and `HandSessionState` remain the data shapes. gesture confirmation thresholds stay unchanged. a raw closure now cancels dwell eligibility immediately. a noisy one-frame closure can restart dwell, which favors avoiding accidental selection over retaining progress through that noise.

## verification

reproduce with the project-local `verify-arena-vis` skill. run the four `test-hand-*.mjs` suites and the hand lifecycle and navigation browser scripts. `HAND_OUTPUT` preserves lifecycle screenshots and the navigation reference screenshot. back up and restore tracked browser reports as the skill specifies.

the synthesized controller passes 40 gesture cases, including near-complete dwell cancellation by either hand and a full new dwell after reopening. hover, session, and graph suites pass 10, 7, and 16 cases respectively. browser checks exercise keyboard disclosure, pre-permission guidance, reachable camera actions at 1024 × 600, lifecycle cleanup, and graph navigation with synthetic landmarks. screenshots and final outcomes are preserved under `/Users/cozycloud/.codex/artifacts/arena-vis/20261006-hands-arena/`.

type checking and the production build pass. independent final review found no actionable source defects or comment deletion candidates. the navigation script now moves focus outside the hand panel before testing keyboard handoff. its first expanded-reference run left focus on the disclosure, where the panel deliberately ignores hand-reset keys. the final run passes. tracked browser reports were restored from their exact pre-run copies. the verification server stopped, port 3101 closed, and candidate patches were preserved before removing temporary worktrees.

## principles

experience first put actionable help beside the camera. exhaust the design space required three concrete candidates. separate before serializing shared state gave each writer its own checkout. model the domain retained the existing gesture and session unions. laziness protocol avoided a new output contract or recognition mode. redesign from first principles kept the selected panel and grafted behavior coherent. test behavior, not implementation required controller outputs to cancel an actual hover dwell. build the lever reused the browser scripts and added rerunnable checks. prove it works required runtime proof and preserved evidence after cleanup.

the tests use fixture graph responses and generated media or synthetic landmarks. they establish the scripted behavior, not real-hand comfort, recognition quality, lighting tolerance, or native safari compatibility.
