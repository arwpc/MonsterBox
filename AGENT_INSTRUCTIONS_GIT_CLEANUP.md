# Agent Instructions: Git Repository Cleanup & Verification

## 🎯 Mission
Clean up the MonsterBox git repository to remove large video files blocking git push operations, then verify all fixes are working correctly.

## 📋 Current Situation

### ✅ What's Already Fixed (Locally Committed):
1. **SMBus Import Fix** - `python_wrappers/pca9685_control.py` now handles both `smbus` and `smbus2` libraries
2. **Installation Script** - `install.sh` updated with `python3-smbus2` package and pip fallbacks
3. **Gitignore Protection** - `.gitignore` updated to prevent future large file commits
4. **Video Files Removed from Tracking** - 85 video files removed from git index via `git rm --cached`
5. **Test Videos Added** - Two small test files in `test-videos/` directory

### ❌ Current Problem:
- **Repository size**: 12.29 GiB (too large to push)
- **Root cause**: Large video files (up to 1.5GB each) embedded in git history across 2300+ commits
- **Symptom**: `git push` fails with "pack-objects died of signal 9" or timeout errors
- **Local commits ahead of origin**: 9 commits (including the 3 SMBus fix commits)

### 📁 Large Files Still in Git History:
- `data/video-library/` - Multiple large video files
- `goblin-system/media/` - Video and media files
- `docs/water.mp4` and `docs/fire.mp4` - Large demo videos
- `video/` directory - If it exists

## 🔧 Your Tasks

### Task 1: Clean Git Repository History
**Goal**: Remove all large video files from git history so the repository can be pushed to GitHub.

**Recommended Approach** (choose ONE):

#### Option A: BFG Repo-Cleaner (Fastest - Recommended)
```bash
cd /home/remote/MonsterBox

# Install BFG Repo-Cleaner
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar -O bfg.jar

# Remove all files larger than 50MB from history
java -jar bfg.jar --strip-blobs-bigger-than 50M .

# Clean up and repack
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Verify size reduction
git count-objects -vH
```

#### Option B: Git Filter-Repo (More Control)
```bash
cd /home/remote/MonsterBox

# Install git-filter-repo
pip3 install git-filter-repo

# Remove specific paths from history
git filter-repo --path data/video-library --invert-paths
git filter-repo --path goblin-system/media --invert-paths
git filter-repo --path docs/water.mp4 --invert-paths
git filter-repo --path docs/fire.mp4 --invert-paths
git filter-repo --path video --invert-paths

# Verify size reduction
git count-objects -vH
```

#### Option C: Fresh Repository (Nuclear Option - If Others Fail)
```bash
cd /home/remote/MonsterBox

# Backup current git history
mv .git .git.backup.$(date +%Y%m%d_%H%M%S)

# Create fresh repository with current state
git init
git add .
git commit -m "Fresh start: MonsterBox 4.0 with SMBus fixes and video cleanup

- Fixed SMBus import errors on fresh RPi4B installations
- Updated install.sh with python3-smbus2 package
- Added comprehensive .gitignore for media files
- Removed large video files from repository
- Added small test videos for testing

Previous history archived in .git.backup directory"

# Force push to GitHub (WARNING: This will overwrite remote history)
git remote add origin git@github.com:arwpc/MonsterBox.git
git push -f origin main
```

### Task 2: Push to GitHub
```bash
cd /home/remote/MonsterBox

# Verify repository size is reasonable (should be < 100MB)
git count-objects -vH

# Push to GitHub
git push origin main

# If push fails, increase buffer and retry
git config http.postBuffer 524288000
git push origin main
```

### Task 3: Verify GitHub Push Success
```bash
# Check that commits are on GitHub
git log origin/main --oneline -5

# Verify the 3 key commits are present:
# - af7cd262: Add test-videos directory with two small test files
# - 625b1b15: Remove large video files from git tracking
# - 70251f35: Fix SMBus import errors on fresh RPi4B installations
```

### Task 4: Verify SMBus Fix Works
```bash
cd /home/remote/MonsterBox

# Test 1: Verify Python import works
python3 -c "
import sys
sys.path.insert(0, 'python_wrappers')
from pca9685_control import pca9685_set_angle
print('✅ pca9685_control imported successfully!')
"

# Test 2: Check that both smbus libraries are available
python3 -c "
try:
    import smbus2
    print('✅ smbus2 is installed')
except ImportError:
    print('❌ smbus2 NOT installed')

try:
    import smbus
    print('✅ smbus is installed')
except ImportError:
    print('❌ smbus NOT installed')
"

# Test 3: Verify install.sh has the fixes
grep -A 5 "python3-smbus2" install.sh
grep -A 5 "smbus2" install.sh
```

### Task 5: Verify .gitignore Protection
```bash
cd /home/remote/MonsterBox

# Test that video files are ignored
echo "test" > test-video.mp4
git status | grep "test-video.mp4"
# Should show: nothing (file should be ignored)

# Clean up test file
rm test-video.mp4

# Verify .gitignore has video protection
grep -A 10 "# Ignore large media files" .gitignore
```

### Task 6: Test on Fresh RPi4B (If Available)
If you have access to a fresh Raspberry Pi 4B:

```bash
# Clone the repository
git clone git@github.com:arwpc/MonsterBox.git
cd MonsterBox

# Run installation
sudo ./install.sh

# Verify SMBus libraries are installed
python3 -c "import smbus2; print('✅ smbus2 works')"
python3 -c "import smbus; print('✅ smbus works')"

# Test servo control import
python3 -c "
import sys
sys.path.insert(0, 'python_wrappers')
from pca9685_control import pca9685_set_angle
print('✅ Servo control ready!')
"
```

## 📊 Success Criteria

### Must Have:
- [ ] Repository size < 100MB (check with `git count-objects -vH`)
- [ ] `git push origin main` succeeds without errors
- [ ] All 9 local commits are pushed to GitHub
- [ ] SMBus import test passes (Task 4, Test 1)
- [ ] .gitignore prevents video file commits (Task 5)

### Should Have:
- [ ] Both smbus and smbus2 libraries available (Task 4, Test 2)
- [ ] install.sh contains python3-smbus2 package (Task 4, Test 3)
- [ ] GitHub shows latest commit is af7cd262 or newer

### Nice to Have:
- [ ] Fresh RPi4B installation test passes (Task 6)
- [ ] MonsterBox server starts without SMBus errors
- [ ] Servo control works on actual hardware

## 🚨 Important Notes

### Files to Keep:
- **DO NOT DELETE** from disk: `data/video-library/`, `goblin-system/media/` - these are needed for the application
- **DO NOT DELETE**: `test-videos/` - small test files for testing
- **DO NOT DELETE**: Any `.ejs`, `.js`, `.py`, `.sh` files

### Files to Remove from Git History Only:
- Large video files (*.mp4, *.mov, *.avi) in git history
- Files > 50MB in git history
- The files should remain on disk but not be tracked by git

### Commit Messages:
The 3 key commits that must be preserved:
1. `70251f35` - "Fix SMBus import errors on fresh RPi4B installations"
2. `625b1b15` - "Remove large video files from git tracking"
3. `af7cd262` - "Add test-videos directory with two small test files"

## 🔍 Troubleshooting

### If git push still fails after cleanup:
```bash
# Check what's taking up space
git rev-list --objects --all | \
  git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | \
  awk '/^blob/ {if($3 > 1000000) print $3/1024/1024 " MB", $4}' | \
  sort -n | tail -20

# If large files still exist, identify and remove them specifically
```

### If BFG/filter-repo corrupts the repository:
```bash
# Restore from backup
cd /home/remote/MonsterBox
rm -rf .git
cp -r .git.backup.YYYYMMDD_HHMMSS .git

# Try Option C (Fresh Repository) instead
```

### If you lose the SMBus fix commits:
```bash
# The files are already fixed on disk, just commit them again
git add install.sh python_wrappers/pca9685_control.py .gitignore test-videos/
git commit -m "Fix SMBus import errors on fresh RPi4B installations

- Add python3-smbus2 package to install.sh
- Update pca9685_control.py to handle both smbus and smbus2
- Add comprehensive .gitignore for media files
- Add test-videos directory with small test files"
```

## 📝 Report Back

When complete, provide:
1. **Repository size** before and after cleanup
2. **Git push output** showing success
3. **Test results** from Tasks 4 and 5
4. **GitHub commit URL** for the latest commit
5. **Any issues encountered** and how you resolved them

## 🎓 Context

This work fixes a critical bug where fresh Raspberry Pi 4B installations running Debian Bookworm would fail with "Hardware Error: Error importing pca9685_control: invalid syntax (pca9685_control.py, line 6)" when trying to control servos. The error was misleading - it wasn't a syntax error but a missing SMBus library. The fix ensures both old (`smbus`) and new (`smbus2`) library versions work correctly.

The git cleanup is necessary because the repository accumulated large video files over time, making it impossible to push updates to GitHub. The video files are needed for the application but should not be in git history.

---

**Good luck! You've got this! 🚀**

