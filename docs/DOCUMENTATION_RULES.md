# 📋 MonsterBox Documentation Rules

**Effective Date**: 2025-10-01  
**Status**: MANDATORY

---

## 🎯 Core Rule

**ALL documentation files (*.md) MUST be stored in the `/docs` directory or its subdirectories.**

❌ **NEVER** create `.md` files in the project root (except `README.md`)  
✅ **ALWAYS** place documentation in the appropriate `/docs` subdirectory

---

## 📁 Directory Structure

```
/docs
├── goblin/              # Goblin system documentation
├── releases/            # Release notes and validation reports
├── security/            # Security documentation
├── hardware/            # Hardware setup and configuration
├── setup/               # Setup guides
├── testing/             # Testing documentation
├── api/                 # API documentation
├── development/         # Development guides
├── integration/         # Integration guides
├── troubleshooting/     # Troubleshooting guides
└── animatronics/        # Animatronic-specific docs
```

---

## 📝 File Naming Conventions

### Use Descriptive Names
- ✅ `goblin-deployment-guide.md`
- ✅ `stepper-motor-quick-start.md`
- ❌ `TEMP.md`
- ❌ `notes.md`

### Use Lowercase with Hyphens
- ✅ `video-library-fixes.md`
- ⚠️ `VIDEO_LIBRARY_FIXES.md` (acceptable for reports)
- ❌ `VideoLibraryFixes.md`

### Include Dates for Reports
- ✅ `security-fixes-2025-10-01.md`
- ✅ `GOLD_RELEASE_PROGRESS_REPORT.md`

---

## 🗂️ Where to Place Documentation

### Goblin System
**Location**: `/docs/goblin/`
- Deployment guides
- Production readiness reports
- Validation reports
- Quick reference guides

### Release Documentation
**Location**: `/docs/releases/`
- Release notes
- Validation reports
- Progress reports
- Version documentation

### Security Documentation
**Location**: `/docs/security/`
- Security fixes
- Authentication guides
- Authorization documentation
- Security reports

### Hardware Documentation
**Location**: `/docs/hardware/`
- Hardware setup guides
- Calibration procedures
- GPIO assignments
- Motor/servo documentation

### Setup Guides
**Location**: `/docs/setup/`
- Installation guides
- Configuration guides
- Initial setup procedures

### Testing Documentation
**Location**: `/docs/testing/`
- Test reports
- Testing guides
- Test organization
- Validation reports

### API Documentation
**Location**: `/docs/api/`
- API reference
- Endpoint documentation
- API testing reports

### Development Documentation
**Location**: `/docs/development/`
- Architecture documentation
- Development processes
- Task management
- Git/cleanup reports

### Integration Documentation
**Location**: `/docs/integration/`
- Third-party integrations
- Service integrations
- Integration guides

### Troubleshooting
**Location**: `/docs/troubleshooting/`
- Troubleshooting guides
- Common issues
- FAQ documents

---

## 🚫 What NOT to Do

### ❌ Don't Create Root-Level MD Files
```bash
# BAD - Don't do this
touch GOBLIN_FIXES.md
touch TEMP_NOTES.md
touch WORK_SUMMARY.md
```

### ❌ Don't Create Temporary Documentation
- No `TEMP_*.md` files
- No `NOTES_*.md` files
- No `WORK_SUMMARY.md` files
- Use proper locations instead

### ❌ Don't Duplicate Documentation
- Check if documentation already exists
- Update existing docs instead of creating new ones
- Consolidate related documentation

---

## ✅ What TO Do

### ✅ Create Well-Organized Documentation
```bash
# GOOD - Do this
touch docs/goblin/deployment-guide.md
touch docs/releases/gold-5.0-release-notes.md
touch docs/security/authentication-guide.md
```

### ✅ Update Existing Documentation
- Keep documentation current
- Add dates to updates
- Maintain version history

### ✅ Create Index Files
- Each subdirectory should have a `README.md`
- Index files should list all documentation
- Include quick links and summaries

---

## 📋 Documentation Checklist

Before creating new documentation:

- [ ] Is this documentation needed long-term?
- [ ] Does similar documentation already exist?
- [ ] Which `/docs` subdirectory is appropriate?
- [ ] Does the filename follow naming conventions?
- [ ] Is the content well-organized and clear?
- [ ] Does the subdirectory have an index/README?

---

## 🔄 Migration Process

When finding root-level `.md` files:

1. **Identify the category** (goblin, release, security, etc.)
2. **Move to appropriate `/docs` subdirectory**
3. **Update any references** to the old location
4. **Update index files** in the subdirectory
5. **Remove the root-level file**

---

## 🎯 Enforcement

**AI Agents and Developers MUST:**
- Follow these rules for all new documentation
- Move any root-level `.md` files to `/docs`
- Update documentation in place rather than creating duplicates
- Maintain the directory structure

**Exceptions:**
- `README.md` in project root (only)
- `CHANGELOG.md` in project root (if used)
- `LICENSE.md` in project root (if used)

---

## 📞 Questions?

If unsure where to place documentation:
1. Check existing `/docs` structure
2. Look for similar documentation
3. Default to `/docs/development/` for general docs
4. Create a new subdirectory if needed (with README.md)

---

**Remember: Clean documentation structure = Better maintainability!** 🎃

