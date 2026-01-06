# Coffin Breaker Disk Space Fix
**Date**: October 26, 2025  
**Issue**: MonsterBox service failing to start with ENOSPC errors

## Problem
Coffin Breaker's disk was 100% full (15GB used / 15GB total), causing MonsterBox service to crash-loop with:
- `ENOSPC: no space left on device, write`
- `exit code=228/SECCOMP` 
- Service restart counter at 186+ attempts

## Root Cause
Journal logs had grown to 315MB, plus 16MB monsterbox.log and 8.6MB monsterbox.err

## Solution
1. Vacuumed systemd journal logs: `journalctl --vacuum-size=50M` → Freed 276.6MB
2. Truncated MonsterBox logs: `truncate -s 0 /var/log/monsterbox.{log,err}` → Freed 24.6MB
3. Total freed: ~300MB
4. Restarted MonsterBox service → **SUCCESS**

## Result
- ✅ Disk usage reduced from 100% to 98% (287MB free)
- ✅ MonsterBox service running successfully
- ✅ All 5 animatronics now ONLINE (PumpkinHead, Coffin Breaker, Orlok, Skulltalker, Groundbreaker)
- ✅ Web interface responding on port 3000

## Recommendation
Set up log rotation for:
- `/var/log/monsterbox.log`
- `/var/log/monsterbox.err`
- Systemd journal (limit to 50-100MB max)
