# MonsterBox Health Check

Perform a quick health check of the MonsterBox system:

1. **Git Status**: Run `git status` and `git log --oneline -5` to check repo state
2. **Test Baseline**: Run `npm run test:system && npm run test:unit` to verify core tests pass
3. **Config Check**: Read `config/app-config.json` to see selected character and theme
4. **Version Check**: Read `package.json` version field and compare with CLAUDE.md
5. **Service Status** (if on RPi): Check if monsterbox.service is running via `systemctl status monsterbox.service 2>/dev/null || echo "Not running as service"`

Report findings concisely: version, selected character, test status, any uncommitted changes, and any issues found.
