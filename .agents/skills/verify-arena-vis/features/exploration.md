# explore channels and blocks

Users search for channels or profiles, select graph nodes, follow connections, and return through selection history.

## Sub-features

- `explore-particles` renders spherical particles, curved stems, image cards, and distinct channel colors.
- `explore-selection` opens text and image previews and restores selection through history.
- `explore-branches` expands connecting channels and collapses a branch with a right click.
- `explore-search` loads a new graph through the search form.
- `explore-mobile` fits the canvas and controls and supports particle selection at mobile width.

## How to get to it (user POV)

- Choose `Start Exploring` on `/` to reach `/explore`.
- Open `/explore?slug=<channel>` directly.
- Submit a channel slug, Are.na URL, or `@username` through the exploration form.
- Select particles or image cards in the canvas. Use the back and `clear history` buttons to manage selection.

## Driving it with Playwright

Preconditions:

- The skill's doctor passes and Chromium is installed.
- `AUDIT_OUTPUT` points to a fresh evidence subdirectory.

Run `AUDIT_OUTPUT="$ARENA_VERIFY_OUTPUT/particles" node scripts/verify-particles.cjs "$ARENA_VERIFY_URL"` with output and exit status captured as shown in the skill.

The script opens `/explore?slug=particle-study`, clicks text particles, restores history with the back button, clears history, collapses a branch, and opens an image. It then clicks `random`, submits `new-particle-study`, and selects a particle at 390 × 844. Require `result.json` with `passed: true` and empty `errors`. Inspect `desktop-particles.png`, `mobile-particles.png`, and `mobile-selection.png`.

## Gotchas

- The baseline script routes all `/api/**` requests to fixtures and uses internal graph probes for coordinates and render assertions.
- Landing CTA, URL parsing, profile search, and live upstream fetching are separate entry points not proved by this script. For changes to those paths, drive them explicitly and record their resulting URL, requested endpoint, and rendered graph or error.
- `verify-galaxy.cjs` assumes an older straight-stem and galaxy rendering shape. Do not use it as the current particle rendering gate without reconciling its assertions with the intended product behavior.
