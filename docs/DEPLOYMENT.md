# MonsterBox Deployment Guide

## Overview

All animatronics have SSH keys configured for GitHub access. This allows each device to pull code directly from GitHub.

## Network Configuration

| Device | Hostname | IP Address | Character ID |
|--------|----------|------------|--------------|
| Orlok | orlok | 192.168.8.120 | 3 (Control Node) |
| PumpkinHead | pumpkinhead | 192.168.8.150 | 1 |
| Coffin Breaker | coffin | 192.168.8.140 | 2 |
| Skulltalker | skulltalker | 192.168.8.130 | 4 |
| Groundbreaker | groundbreaker | 192.168.8.200 | 5 |

## SSH Keys

All animatronics have SSH keys configured for GitHub:
- Each device can run: `ssh -T git@github.com` successfully
- Keys are registered with the MonsterBox GitHub repository
- Allows password-free `git pull` operations

## Deployment Methods

### Method 1: Update Script (Recommended)

Each animatronic has an update script that pulls from GitHub and restarts the service.

**From Orlok (or any development machine):**

1. Commit and push your changes:
```bash
git add -A
git commit -m "Your commit message"
git push origin main
```

2. SSH to the target animatronic and run the update script:
```bash
ssh remote@groundbreaker
cd ~/MonsterBox
./scripts/update-from-github.sh
```

**One-liner (if you have SSH access):**
```bash
ssh remote@groundbreaker 'cd ~/MonsterBox && ./scripts/update-from-github.sh'
```

### Method 2: Manual Deployment

If you prefer manual control:

1. Push to GitHub:
```bash
git push origin main
```

2. SSH to the animatronic:
```bash
ssh remote@groundbreaker
```

3. Pull and restart:
```bash
cd ~/MonsterBox
git pull origin main
pkill -f 'node.*server.js'
nohup npm start > /tmp/monsterbox.log 2>&1 &
```

### Method 3: Deploy to All Animatronics

Use the deploy-to-all script (requires SSH keys between devices):

```bash
./scripts/deploy-to-all.sh
```

Or deploy to specific devices:
```bash
./scripts/deploy-to-all.sh groundbreaker pumpkinhead
```

**Note:** This method requires SSH keys to be configured between Orlok and the other animatronics.

## Deployment Workflow

### Standard Workflow

1. **Develop on Orlok** (or local machine)
   - Make changes
   - Test locally
   - Run syntax validation: `npm run test:syntax`

2. **Commit and Push**
   ```bash
   git add -A
   git commit -m "Description of changes"
   git push origin main
   ```

3. **Deploy to Animatronics**
   - Option A: Run update script on each device
   - Option B: Use deploy-to-all script (if SSH configured)
   - Option C: Manual deployment

4. **Verify Deployment**
   - Check service is running: `pgrep -f 'node.*server.js'`
   - Check logs: `tail -50 /tmp/monsterbox.log`
   - Test in browser: `http://hostname:3000`

### Emergency Deployment

If an animatronic is having issues:

1. SSH to the device:
```bash
ssh remote@groundbreaker
```

2. Check service status:
```bash
pgrep -f 'node.*server.js'
```

3. Check logs:
```bash
tail -50 /tmp/monsterbox.log
```

4. Pull latest code and restart:
```bash
cd ~/MonsterBox
git pull origin main
pkill -f 'node.*server.js'
nohup npm start > /tmp/monsterbox.log 2>&1 &
```

## Troubleshooting

### Git Pull Fails

**Error:** `Permission denied (publickey)`

**Solution:**
1. Verify GitHub SSH key:
```bash
ssh -T git@github.com
```

2. Check git remote:
```bash
git remote -v
```

3. If needed, re-add SSH key to GitHub

### Service Won't Start

**Check logs:**
```bash
tail -100 /tmp/monsterbox.log
```

**Common issues:**
- Port 3000 already in use
- Missing dependencies: `npm install`
- Node version mismatch: `node --version` (should be 18.0+)

### Uncommitted Changes

If you have uncommitted changes on an animatronic:

**Option 1: Stash changes**
```bash
git stash
git pull origin main
```

**Option 2: Commit changes**
```bash
git add -A
git commit -m "Local changes on [hostname]"
git pull origin main
```

**Option 3: Discard changes**
```bash
git reset --hard HEAD
git pull origin main
```

## Pre-Deployment Checklist

Before deploying to production:

- [ ] All changes committed
- [ ] Syntax validation tests pass: `npm run test:syntax`
- [ ] Unit tests pass: `npm run test:unit`
- [ ] Tested locally on Orlok
- [ ] No console errors in browser
- [ ] Pushed to GitHub: `git push origin main`

## Post-Deployment Verification

After deploying to an animatronic:

- [ ] Service is running: `pgrep -f 'node.*server.js'`
- [ ] No errors in logs: `tail -50 /tmp/monsterbox.log`
- [ ] Web interface loads: `http://hostname:3000`
- [ ] Can navigate to calibration page
- [ ] Can add/edit parts (if that was the fix)

## Scripts Reference

### update-from-github.sh

**Location:** `scripts/update-from-github.sh`

**Purpose:** Pull latest code from GitHub and restart service

**Usage:** Run ON the animatronic device
```bash
cd ~/MonsterBox
./scripts/update-from-github.sh
```

**What it does:**
1. Checks current commit
2. Pulls latest code from GitHub
3. Stops MonsterBox service
4. Starts MonsterBox service
5. Verifies service is running

### deploy-to-groundbreaker.sh

**Location:** `scripts/deploy-to-groundbreaker.sh`

**Purpose:** Deploy to Groundbreaker from Orlok

**Usage:** Run FROM Orlok
```bash
./scripts/deploy-to-groundbreaker.sh
```

**Requirements:** SSH keys configured between Orlok and Groundbreaker

### deploy-to-all.sh

**Location:** `scripts/deploy-to-all.sh`

**Purpose:** Deploy to all or specific animatronics

**Usage:** Run FROM Orlok
```bash
./scripts/deploy-to-all.sh                    # Deploy to all
./scripts/deploy-to-all.sh groundbreaker      # Deploy to one
./scripts/deploy-to-all.sh groundbreaker pumpkinhead  # Deploy to multiple
```

**Requirements:** SSH keys configured between Orlok and target devices

## SSH Key Setup (Optional)

To enable direct deployment from Orlok to other animatronics:

1. **On Orlok**, generate SSH key (if not exists):
```bash
ssh-keygen -t ed25519 -C "orlok@monsterbox"
```

2. **Copy key to each animatronic:**
```bash
ssh-copy-id remote@groundbreaker
ssh-copy-id remote@pumpkinhead
ssh-copy-id remote@coffin
ssh-copy-id remote@skulltalker
```

3. **Test connection:**
```bash
ssh remote@groundbreaker "echo 'SSH OK'"
```

4. **Now you can use deploy-to-all.sh**

## Best Practices

1. **Always test locally first** on Orlok before deploying
2. **Run syntax validation** before committing: `npm run test:syntax`
3. **Commit with descriptive messages** explaining what changed
4. **Deploy during low-traffic times** (not during Halloween events!)
5. **Verify one device** before deploying to all
6. **Keep logs** of deployments for troubleshooting
7. **Have a rollback plan** (know the previous commit hash)

## Rollback Procedure

If a deployment causes issues:

1. **Find the previous working commit:**
```bash
git log --oneline -10
```

2. **On the affected animatronic:**
```bash
ssh remote@groundbreaker
cd ~/MonsterBox
git checkout <previous-commit-hash>
pkill -f 'node.*server.js'
nohup npm start > /tmp/monsterbox.log 2>&1 &
```

3. **Or revert on Orlok and redeploy:**
```bash
git revert <bad-commit-hash>
git push origin main
# Then deploy to animatronics
```

## Monitoring

### Check Service Status on All Devices

```bash
for host in groundbreaker pumpkinhead coffin skulltalker; do
  echo "=== $host ==="
  ssh remote@$host "pgrep -f 'node.*server.js' && echo 'Running' || echo 'NOT RUNNING'"
done
```

### Check Logs on All Devices

```bash
for host in groundbreaker pumpkinhead coffin skulltalker; do
  echo "=== $host ==="
  ssh remote@$host "tail -20 /tmp/monsterbox.log"
done
```

## Support

If you encounter issues:

1. Check this documentation
2. Check logs: `/tmp/monsterbox.log`
3. Check GitHub Actions for CI/CD failures
4. Review recent commits: `git log --oneline -10`
5. Test locally on Orlok first

---

**Last Updated:** October 4, 2025  
**MonsterBox Version:** 4.0+

