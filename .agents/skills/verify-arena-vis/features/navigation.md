# landing and random navigation

The landing page leads to exploration. Random selection loads a followed channel and preserves the current graph when lookup fails.

## Sub-features

- `navigation-landing` renders the custom font and responsive landing page.
- `navigation-random` loads a channel and reloads a repeated selection once.
- `navigation-loading` disables conflicting actions during random lookup.
- `navigation-error` displays the lookup error while retaining the graph.
- `navigation-responsive` keeps search, random, and controls usable at desktop, tablet, and mobile widths.

## How to get to it (user POV)

- Open `/`, then choose `Start Exploring`.
- Open `/explore` or a channel URL and choose `random` beside the search input.

## Driving it with Playwright

Preconditions:

- The skill's doctor passes and Chromium is installed.
- Use a fresh `random` evidence subdirectory.

Run `AUDIT_OUTPUT="$ARENA_VERIFY_OUTPUT/random" node scripts/verify-random-channel-browser.cjs "$ARENA_VERIFY_URL"`. Capture output and exit status. The script verifies the actual custom font, random loading states, repeated selection, lookup failure, and layout at 1440, 768, and 390 pixels. Require `result.json` with `passed: true`, no browser errors, three random requests, and two graph requests. Inspect the `runde-*.png` and `random-*.png` files.

Run `node scripts/verify-random-channel.mjs` separately for route logic. Capture its JSON stdout. It replaces upstream fetch and randomness and needs no credentials or server.

## Gotchas

- The browser flow opens exploration directly and does not click the landing CTA. For CTA changes, drive `page.getByRole('link', { name: 'Start Exploring', exact: true }).click()` from `/` and require `/explore` and its form.
- The browser flow mocks both random lookup and graph fetching. The node flow invokes transpiled route logic, so neither proves a live Are.na request.
- Do not run performance scripts to establish font or navigation correctness.
