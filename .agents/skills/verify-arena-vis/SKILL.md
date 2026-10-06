---
name: verify-arena-vis
description: Verify arena-vis exploration, random navigation, and hand controls through the existing browser and node scripts. Use after behavior changes or when runtime evidence is needed.
---

# verify arena-vis

Read [the feature map](features/README.md), then the entry for the changed behavior. Run commands from the repository root. Reuse `scripts/`; do not replace a failing assertion with a weaker check.

## launch

Use the installed node and npm. If `node_modules` is missing, run `npm ci`. Browser scripts require Playwright, which is not declared in `package.json`. Try `node -p "require.resolve('playwright')"`. If unavailable in Codex, call `load_workspace_dependencies` and set `PLAYWRIGHT_MODULE` to `<returned node packages path>/playwright`. Confirm its Chromium executable exists with `node -e 'const p=require(process.env.PLAYWRIGHT_MODULE || "playwright"); console.log(p.chromium.executablePath()); console.log(require("node:fs").existsSync(p.chromium.executablePath()))'`. A missing browser needs installation through that package's CLI before driving.

Keep one server per checkout because Next shares `.next`. Check listener working directories with `lsof -a -p <pid> -d cwd -Fn`. If this checkout already has a server, use a separate checkout or coordinate access. Do not stop an unrelated server.

In a terminal, initialize a unique evidence directory and check that port 3101 is free. If occupied, choose another free port and change both the launch argument and `ARENA_VERIFY_URL`.

```sh
export ARENA_VERIFY_URL=http://127.0.0.1:3101
export ARENA_VERIFY_OUTPUT="$HOME/.codex/artifacts/arena-vis/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$ARENA_VERIFY_OUTPUT"
lsof -nP -iTCP:3101 -sTCP:LISTEN
npm run dev -- --hostname 127.0.0.1 --port 3101 > "$ARENA_VERIFY_OUTPUT/server.log" 2>&1
```

The final command runs in the foreground. In Codex, use a PTY and retain its session ID for teardown. Copy the output directory, URL, and Playwright environment into subsequent terminals. Wait for `Ready` in `server.log` and a successful doctor check. No credentials are required for the fixture browser flows. Live Are.na requests can depend on upstream access and optional `ARENA_USERNAME` and `ARENA_ACCESS_TOKEN` configuration.

## doctor

Run this read-only check before driving and whenever the instance looks wrong.

```sh
lsof -nP -iTCP:3101 -sTCP:LISTEN
lsof -a -p <listener-pid> -d cwd -Fn
curl --fail --silent --show-error "$ARENA_VERIFY_URL/explore" -o "$ARENA_VERIFY_OUTPUT/doctor.html"
```

Require the listener's working directory to match this checkout and the retained launch session to own it. The form mounts on the client, so an HTTP 200 alone does not prove readiness. Run the browser check below. Record the listener PID, checkout, URL, and `git rev-parse HEAD` in `instance.txt`. If a server started on a fallback port, stop that owned session and choose an explicit free port. A response from another app is not readiness.

```sh
node <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${process.env.ARENA_VERIFY_URL}/explore`);
    await page.getByPlaceholder('Enter Are.na channel or profile URL', { exact: true }).waitFor();
    fs.writeFileSync(path.join(process.env.ARENA_VERIFY_OUTPUT, 'doctor.aria.txt'), await page.locator('form').ariaSnapshot());
    await page.screenshot({ path: path.join(process.env.ARENA_VERIFY_OUTPUT, 'doctor.png') });
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
JS
```

## drive

Use `verify-particles.cjs` for the baseline exploration flow. It uses browser mouse clicks, search submission, random navigation, and mobile selection. Fixtures replace `/api/**` responses. The script probes the rendered graph and fixes node coordinates for repeatable clicks; this proves client behavior, not live Are.na integration or unconstrained physics.

```sh
mkdir -p "$ARENA_VERIFY_OUTPUT/particles"
AUDIT_OUTPUT="$ARENA_VERIFY_OUTPUT/particles" node scripts/verify-particles.cjs "$ARENA_VERIFY_URL" > "$ARENA_VERIFY_OUTPUT/particles/run.log" 2>&1
ARENA_VERIFY_STATUS=$?
printf '%s\n' "$ARENA_VERIFY_STATUS" > "$ARENA_VERIFY_OUTPUT/particles/exit-code.txt"
cat "$ARENA_VERIFY_OUTPUT/particles/run.log"
test "$ARENA_VERIFY_STATUS" -eq 0
```

Require `result.json` to report `passed: true`, empty `errors`, and the intended scenarios. Inspect all three screenshots. For other flows, use the mapped script and environment variables. Run browser scripts sequentially. Follow the cleanup section after failures too.

## evidence

Retain the evidence directory outside the checkout. Keep `server.log`, `doctor.html`, `instance.txt`, the executed command, exit code, script output, JSON results, and screenshots. Label the mapped feature IDs and entry points in a run note. Script results record requests and action assertions; screenshots alone do not establish the flow. Report fixture boundaries and skipped entry points explicitly.

Hand browser scripts write reports under tracked `docs/`. Preserve any pre-existing report bytes outside the checkout before running them. Copy the newly generated reports to the evidence directory, then restore the exact previous bytes. Do not use `git checkout` to erase local report changes. If the file did not exist before the run, remove only the generated file after preserving it.

## cleanup

Send Ctrl-C to the retained server PTY. Wait for it to exit. Confirm the recorded listener PID has exited and the port is no longer listening. If a child survives, verify its PID and working directory against `instance.txt` before sending SIGTERM. Never kill by process name or kill whatever now occupies the port.

Browser scripts close their browsers on success and failure. Confirm no browser children from this run remain if a script was interrupted. Preserve all evidence and verify `result.json` and the screenshots still exist after teardown. Recheck `git status --short` for unexpected report writes. Keep `.next` and existing dependencies.

## helpers

The feature map links the existing repo scripts. No additional executable helper is needed. For maintenance, use the installed `$maintain-verification-skill` when routes, controls, or script contracts change.
