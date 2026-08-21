Run the MonsterBox Playwright suite.

The working invocation on this fleet is:

```bash
MB_USE_RUNNING_SERVER=1 BASE_URL=http://localhost:3100 npx playwright test tests/browser --reporter=list
```

Three things make that specific and not interchangeable with the obvious alternatives:

- **`npm run test:browser` does not work here.** It starts its own server on port 3200, which
  trips `server.js`'s single-instance PID guard. Playwright then reports a *config* failure that
  reads exactly like a test failure, and more than one session has chased a regression that did
  not exist.
- **`node scripts/test-runner.mjs --suite browser` has the same problem** — it drives Playwright
  through `playwright.config.js` and never sets `MB_USE_RUNNING_SERVER`. The unified runner is
  fine for unit and system suites; it is not a path to the browser suite.
- **Port 3100 runs `NODE_ENV=production` with `MB_TEST_MODE` unset.** A test that hits a hardware
  endpoint drives *real hardware* unless `dryRun` is on the **query string** — the play route only
  short-circuits on `?dryRun=1`, not a body field. Check this before running anything that touches
  scenes, poses or calibration.

The full suite takes roughly 50 minutes on an RPi4B. Scope it to what changed — pass a spec path
or a `--grep` — unless the operator asked for a release pass.

Report real regressions separately from the known-flaky set (VU meter, jaw-animation save-config,
calibration timeout) and from failures that are environmental on a node without the hardware
attached. Re-run a suspected flake once before reporting it.

Deeper detail on suite selection, the gate, and hardware tests lives in the `monsterbox-testing`
skill — load it rather than restating it here.
