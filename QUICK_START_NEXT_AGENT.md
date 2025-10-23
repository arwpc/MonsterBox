# Quick Start for Next Agent

## TL;DR Mission
1. ✅ Deploy CLI fix to Goblin Two
2. ✅ Test returnToQueue behavior  
3. ✅ Test all 10 pages with Browser MCP (zero console errors)
4. ✅ Commit & tag as v5.4.0
5. ✅ Deploy to 5 animatronics
6. ✅ Report results

## Quick Commands

### Check Goblin Status
```bash
# Use node fetch, NOT curl with pipes
node -e "fetch('http://localhost:3000/goblin-management/api/goblins').then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2)))"
```

### Deploy to Goblin Two
```bash
./scripts/deploy-goblin-stability-fix.sh 192.168.8.160
```

### Test Pages (use Browser MCP)
```javascript
// For each of 10 pages:
await browser_navigate({ url: 'http://localhost:3000/page' });
const errors = await browser_console_messages({ onlyErrors: true });
// Assert errors.length === 0
```

### Commit & Tag
```bash
git add -A
git commit -m "Release v5.4: Goblin standardization + console blanker + video dropdown"
git tag -a v5.4.0 -m "MonsterBox 5.4 - Goblin System Complete"
git push origin main v5.4.0
```

### Deploy to Animatronics
```bash
# For each: Orlok, Coffin, Groundbreaker, Pumpkinhead, Skulltalker
ssh remote@IP "cd MonsterBox && git fetch && git checkout v5.4.0 && pkill node; nohup node server.js &"
```

## Critical: NO CURL WITH PIPES
❌ `curl http://... | jq`  
✅ Use Browser MCP or node fetch

## Success = Zero Console Errors
Every page must load with:
- 0 console errors
- 0 network failures  
- All elements render correctly

## Full Details
See: `AGENT_HANDOFF.md`
