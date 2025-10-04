# Git Push Instructions

## Status
✅ All changes have been committed to the local git repository on Orlok (192.168.8.120)
❌ Push to GitHub remote failed due to SSH key authentication

## Current Situation

**Local Orlok has TWO commits ahead of GitHub:**

1. **Commit Hash**: `4228ac6e`
   **Commit Message**: "Phase 1: Orlok Bring-Up - Per-Character TTS and Deployment System"
   **Files Changed**: 19 files, 1979 insertions, 31 deletions
   **Author**: AI Agent

2. **Commit Hash**: `8ea38a35` (HEAD)
   **Commit Message**: "Final Push - fixes and all bots talking"
   **Author**: You (arwpc)

**GitHub is at**: `c345b99b` - "Security Checking Fixes"

So Orlok's main branch is 2 commits ahead of GitHub's main branch.

## What's in the Commit

### Core Services Modified
- `services/elevenLabsConfigService.js` - File-first key reading
- `services/aiConfigStore.js` - Per-character TTS config function
- `services/elevenLabsTTSService.js` - Debug logging (optional)
- `routes/api/elevenLabsApiRoutes.js` - Generate-and-play uses per-character config

### Configuration Files
- `data/characters.json` - Added ElevenLabs agent IDs for all characters
- `data/character-1/ai-config/tts-config.json` - Evil Witch voice (PumpkinHead)
- `data/character-2/ai-config/tts-config.json` - Ancient Monster voice (Coffin Breaker)
- `data/character-4/ai-config/tts-config.json` - Goblin voice (Skulltalker)

### Documentation Created
- `COMMIT_MESSAGE.txt` - Detailed commit message
- `DEPLOYMENT_COMPLETE.md` - Full completion summary
- `DEPLOYMENT_STATUS.md` - Status report
- `docs/ORLOK_DEPLOYMENT.md` - Complete deployment guide
- `docs/PHASE1_SUMMARY.md` - Phase 1 detailed summary
- `docs/QUICK_REFERENCE.md` - Quick command reference
- `README.md` - Updated with Orlok deployment section

### Scripts Created
- `scripts/deploy-to-animatronic.sh` - Deployment automation (executable)
- `scripts/orlok-bringup-test.sh` - Comprehensive testing (executable)
- `scripts/test-all-animatronics.sh` - Multi-device testing (executable)
- `scripts/deploy-key-to-all.sh` - Key deployment helper

## How to Push to GitHub

### RECOMMENDED: Option 1 - Force Push from Orlok Terminal
Since you're already on Orlok and have made commits, the simplest way is to force push:

```bash
# On Orlok (you're already here)
cd ~/MonsterBox

# Force push to overwrite GitHub with your local commits
git push -f origin main
```

**Note**: This requires setting up authentication first. See options below.

### Option 2: Set up GitHub SSH Key on Orlok (One-time setup)

```bash
# On Orlok
ssh-keygen -t ed25519 -C "orlok@monsterbox" -f ~/.ssh/id_ed25519_github -N ""
cat ~/.ssh/id_ed25519_github.pub
```

Then:
1. Copy the public key output
2. Go to https://github.com/settings/keys
3. Click "New SSH key"
4. Paste the key and save

Then configure git to use it:
```bash
# On Orlok
cat >> ~/.ssh/config << 'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_github
EOF

# Test connection
ssh -T git@github.com

# Set remote to SSH
git remote set-url origin git@github.com:arwpc/MonsterBox.git

# Force push
git push -f origin main
```

### Option 3: Use GitHub Personal Access Token

```bash
# On Orlok
# Create a token at: https://github.com/settings/tokens
# Then:
git remote set-url origin https://YOUR_TOKEN@github.com/arwpc/MonsterBox.git
git push -f origin main
```

### Option 4: From Your Development Machine

If you have the repo cloned elsewhere with GitHub access:

```bash
# Pull the latest from Orlok
git remote add orlok ssh://remote@192.168.8.120/home/remote/MonsterBox/.git
git fetch orlok
git reset --hard orlok/main

# Force push to GitHub
git push -f origin main
```

## Verification

After pushing, verify on GitHub that the commit `4228ac6e` appears in the main branch with all 19 files changed.

## Important Notes

1. **All animatronics already have the updated code** - They were deployed via rsync
2. **The commit is safe on Orlok** - Even if not pushed to GitHub yet, it's in the local git history
3. **No data loss risk** - All changes are committed and can be pushed anytime
4. **Other animatronics will sync** - When you pull from GitHub to other animatronics, they'll get these changes

## Current State

- ✅ Orlok: Has all changes committed locally
- ✅ PumpkinHead: Has all changes deployed (not from git)
- ✅ Coffin Breaker: Has all changes deployed (not from git)
- ✅ Skulltalker: Has all changes deployed (not from git)
- ❌ GitHub: Needs the commit pushed

## Recommendation

Push from your development machine (Option 1) or set up a GitHub token on Orlok (Option 2). This ensures the changes are in the GitHub repository for future deployments and version control.

