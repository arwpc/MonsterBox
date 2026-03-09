Run MonsterBox browser tests using the appropriate mode for the current environment.

## Steps

1. Check if the MonsterBox test server is running on port 3200. If not, note it will be auto-started.
2. Detect environment:
   - If running in VS Code IDE (VSCODE_PID set): use MCP mode
   - If running in CLI/SSH: use CLI mode
   - User can override with argument: `cli` or `mcp`
3. Run the tests:
   - **CLI mode**: `cd /home/remote/MonsterBox && npm run test:browser`
   - **MCP mode**: `cd /home/remote/MonsterBox && npm run test:mcp`
4. Report results with pass/fail counts.

## Arguments

- No args: auto-detect mode and run all browser tests
- `quick`: run quick smoke test (2 specs)
- `cli`: force CLI mode
- `mcp`: force MCP mode
- `live`: test against live server (port 3000)
- A spec file path: run specific test file

## Notes

- CLI mode: headless Chromium on RPi, no display needed
- MCP mode: same headless tests but with enhanced tracing/screenshots
- Both modes use the same test files in `tests/browser/`
- The `@playwright/mcp` server in `.claude/settings.json` provides interactive browser tools
