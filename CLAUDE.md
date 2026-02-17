# MonsterBox — Animatronic Control Platform

## Project Identity
- **Application:** MonsterBox — RPi4b-based animatronic character control system
- **Version:** 6.1.2
- **Owner:** Aaron Warner, Coralville, Iowa
- **Stack:** Node.js, Express, EJS templates, Python hardware scripts, Raspberry Pi 4B
- **Repository:** Local git, commit frequently with descriptive messages

## Architecture Constraints — READ FIRST
- **DO NOT** replace Node.js, Express, or EJS with alternative frameworks
- **DO NOT** introduce WebSockets, GraphQL, or new transport layers
- **DO NOT** restructure the database schema or switch databases
- **DO NOT** add new npm dependencies without explicit approval
- **DO NOT** make changes that alter user-facing behavior unless fixing a bug
- **PRIORITIZE** reliability and performance over cleverness or complexity
- **PRESERVE** all existing API endpoints and their contracts
- When in doubt, make the smaller change. Conservative refactoring only.

## Key Concepts
- **Characters:** Animatronic personas (Orlok, etc.) stored in database with unique char_id
- **Character Independence:** ALL functionality must work for ANY selected character, never hardcoded to a specific char_id or character name
- **Known Issue:** Much code was originally built for Orlok (char_id=3). Hardcoded references to "Orlok", "orlok", char_id=3, or character_id=3 are bugs unless they are default/fallback values clearly marked as such
- **AI Services:** TTS (text-to-speech) and STT (speech-to-text) — must have ONE canonical implementation each, used everywhere
- **Hardware Layer:** Python scripts control servos, LEDs, audio on RPi GPIO pins via Node child_process calls
- **Animation Studio:** Unified scene/pose editor at `/scenes` — three-panel layout with timeline editor, drag-and-drop, and live preview. Replaces the separate Scenes and Poses pages (legacy routes redirect to `/scenes`)

## Common Commands
- `npm start` — Start the application server
- `npm test` — Run test suite
- `npm run lint` — Run linter
- `node app.js` — Direct start (development)
- `sudo systemctl status monsterbox` — Check service status on RPi
- `git log --oneline -20` — Recent commit history

## Code Style
- ES module syntax (import/export) where already used, CommonJS (require) where that's the existing pattern — don't mix within a file
- Use async/await over raw Promises or callbacks
- Error handling: always catch and log, never swallow silently
- Use descriptive variable names; no single-letter variables except loop counters
- Comments: explain WHY, not WHAT

## Version Management
- Version string MUST be defined in exactly ONE place: `package.json` version field
- All version displays in UI, logs, API responses, and documentation MUST read from package.json dynamically — never hardcoded
- Use `require('./package.json').version` or equivalent import pattern

## Testing Protocol
- Run existing tests before AND after every change
- If a test references hardcoded character data, fix the test to be character-independent
- Test each form and button with at least 2 different characters
- If tests don't exist for changed functionality, write them

## Git Workflow
- Commit after each logical unit of work (not at end of session)
- Commit message format: `v6.1.2: [phase] brief description`
- Example: `v6.1.2: [animation-studio] add jaw-animation step type to executor`
- Tag final version: `git tag -a v6.1.2 -m "MonsterBox 6.1.2 release"`

## Session Startup Checklist
1. Read `README.md` completely
2. Read `install.sh` completely  
3. Read this CLAUDE.md
4. Run `npm test` to establish baseline
5. Run `git status` to check for uncommitted work
6. Review any `CHANGELOG.md` or `docs/` directory for current state

## Session Cleanup Checklist
1. Run full test suite — all tests must pass
2. Update `README.md` to reflect any changes made this session
3. Update `install.sh` if any new dependencies or setup steps were added
4. Update any documentation in `docs/` that references changed functionality
5. Update `CHANGELOG.md` with summary of changes
6. Commit all changes with descriptive message
7. Run `git log --oneline -5` and confirm clean history