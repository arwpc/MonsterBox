# MonsterBox 5.0 Gold Release - Independent Validation Prompt

## Mission

You are an independent QA validator for MonsterBox 5.0 Gold Release. Your mission is to **independently verify** the test results and fixes claimed in the previous validation session, NOT to rewrite or modify the tests themselves.

## Context

A previous AI agent completed a GOLD validation session and reported:
- ✅ Deep 400 tests: 13/13 passing (no HTTP 400 errors)
- ✅ Deep 500 tests: 16/16 passing (no HTTP 500 errors)
- ✅ Deep 200 tests: 21/21 passing (API validation)
- ✅ Security audit: 0 vulnerabilities
- ✅ Server stable on port 3000
- ⚠️ Goblin video playback ready but untested (hardware offline)

The agent also fixed a data integrity issue in `data/character-5/scenes.json` where scenes referenced non-existent poses.

## Your Task

**Independently validate these claims by:**

1. **Review the validation artifacts:**
   - Read `GOLD_VERIFICATION_REPORT.md`
   - Read `AUTONOMOUS_SESSION_SUMMARY.md`
   - Review the fix in `data/character-5/scenes.json`

2. **Start the MonsterBox server:**
   ```bash
   npm start
   ```
   - Verify it starts on port 3000 (or 3100 if configured)
   - Confirm all subsystems initialize successfully

3. **Re-run all test suites independently:**
   ```bash
   # Deep 400 tests (no HTTP 400 errors)
   npx playwright test tests/playwright/no-400s.spec.js --project=firefox --workers=1
   
   # Deep 500 tests (no HTTP 500 errors)
   npx playwright test tests/playwright/no-errors-deep.spec.js --project=firefox --workers=1
   
   # Deep 200 tests (API validation)
   npx playwright test tests/playwright/deep-200.spec.js --project=firefox --workers=1
   ```

4. **Verify security audit:**
   ```bash
   npm audit --audit-level=moderate
   cd apps/monsterbox4 && npm audit --audit-level=moderate
   cd playwright-diagnostics && npm audit --audit-level=moderate
   ```

5. **Validate the data fix:**
   - Review `data/character-5/scenes.json`
   - Verify scenes only reference valid poses or use "wait" steps
   - Check `data/character-5/poses.json` to confirm available poses
   - Manually test the `/scenes` page to ensure no errors

6. **Test Goblin video playback (if possible):**
   ```bash
   # Check registered Goblins
   curl -s http://127.0.0.1:3000/goblin-management/api/goblins
   
   # Test Goblin connectivity (if hardware available)
   node test-goblin-dual-video-fixed.js
   ```

7. **Document your findings:**
   - Create `INDEPENDENT_VALIDATION_REPORT.md`
   - Report PASS/FAIL for each test suite
   - Note any discrepancies from the original report
   - Identify any issues not caught by the previous agent
   - Provide confidence level (HIGH/MEDIUM/LOW) for Gold release

## Success Criteria

Your validation is successful if you can **independently confirm**:
- [ ] All 13 Deep 400 tests pass
- [ ] All 16 Deep 500 tests pass
- [ ] All 21 Deep 200 tests pass
- [ ] Zero security vulnerabilities in all 3 projects
- [ ] Server starts and runs stably
- [ ] The scenes.json fix resolves the data integrity issue
- [ ] No new issues discovered during validation

## Important Guidelines

1. **Do NOT modify the tests** - Your job is to validate, not rewrite
2. **Do NOT modify the fixes** - Verify they work as claimed
3. **Be skeptical** - Look for issues the previous agent might have missed
4. **Be thorough** - Run all tests completely, don't skip steps
5. **Be honest** - Report failures or concerns clearly
6. **Document everything** - Your report should be detailed and actionable

## Expected Outcome

You should produce an `INDEPENDENT_VALIDATION_REPORT.md` that either:

**SCENARIO A: Validation Successful**
```markdown
# Independent Validation Report
Status: ✅ VALIDATED
Confidence: HIGH

All claims verified:
- Deep 400: 13/13 PASS ✅
- Deep 500: 16/16 PASS ✅
- Deep 200: 21/21 PASS ✅
- Security: 0 vulnerabilities ✅
- Server: Stable ✅
- Data fix: Effective ✅

Recommendation: APPROVE for Gold Release
```

**SCENARIO B: Issues Found**
```markdown
# Independent Validation Report
Status: ⚠️ ISSUES FOUND
Confidence: MEDIUM/LOW

Issues discovered:
1. [Specific test failure with details]
2. [Discrepancy from original report]
3. [New issue not previously caught]

Recommendation: Address issues before Gold Release
```

## Key Files to Review

- `GOLD_VERIFICATION_REPORT.md` - Previous agent's report
- `AUTONOMOUS_SESSION_SUMMARY.md` - Autonomous session details
- `data/character-5/scenes.json` - Data integrity fix
- `data/character-5/poses.json` - Available poses for character 5
- `tests/playwright/no-400s.spec.js` - Deep 400 test suite
- `tests/playwright/no-errors-deep.spec.js` - Deep 500 test suite
- `tests/playwright/deep-200.spec.js` - Deep 200 test suite

## Test Execution Tips

1. **Server must be running** before executing Playwright tests
2. **Use Firefox** as specified (`--project=firefox`)
3. **Use single worker** (`--workers=1`) for consistency
4. **Wait for full completion** - some tests take 3-4 minutes
5. **Check terminal output** for any warnings or errors
6. **Monitor server logs** during test execution

## Questions to Answer

1. Do all test suites pass as claimed?
2. Is the server stable throughout testing?
3. Does the scenes.json fix resolve the data integrity issue?
4. Are there any security vulnerabilities?
5. Are there any edge cases or issues not caught by tests?
6. Is the system ready for Gold release?
7. What is your confidence level (HIGH/MEDIUM/LOW)?

## Deliverables

1. **INDEPENDENT_VALIDATION_REPORT.md** - Your detailed findings
2. **Test execution logs** - Copy/paste of all test runs
3. **Recommendation** - Clear APPROVE or REJECT with reasoning
4. **Confidence level** - HIGH/MEDIUM/LOW with justification

## Start Here

Begin by reading the existing validation reports, then start the server and run the tests. Document everything you observe. Be thorough, be skeptical, and be honest in your assessment.

Good luck! 🎯

