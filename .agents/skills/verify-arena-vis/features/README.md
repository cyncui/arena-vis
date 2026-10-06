# arena-vis verification map

Use the launch and doctor steps in [the skill](../SKILL.md) before each browser flow. Commands run from the repo root with `ARENA_VERIFY_URL`, `ARENA_VERIFY_OUTPUT`, and, if needed, `PLAYWRIGHT_MODULE` set. Use a separate output subdirectory for each script so `result.json` files cannot overwrite each other.

- [exploration](exploration.md) covers particle rendering, selection, history, expansion, search, and mobile behavior.
- [landing and random navigation](navigation.md) covers the landing page, random selection, loading states, errors, and responsive controls.
- [hand controls](hand-controls.md) covers camera lifecycle, scripted gestures, navigation, and worker behavior.

Prefer browser roles and names. Canvas helpers may read graph coordinates before a real mouse click. Do not invoke application handlers directly to claim user-path coverage. Capture script output and exit status even on failure. Report entry points the chosen script does not exercise.

The browser scripts use fixture responses at api boundaries. They do not prove live upstream authorization, data compatibility, or camera recognition quality. Node tests check isolated logic; they do not replace browser proof. Performance scripts need `$benchmark-checklist` before reporting a performance verdict.
