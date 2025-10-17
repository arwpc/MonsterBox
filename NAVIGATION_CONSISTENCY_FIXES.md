# Navigation Consistency Fixes - MonsterBox 5.3

## Summary

Fixed navigation inconsistencies across the entire MonsterBox application by converting all pages to use the unified master layout system. Navigation is now consistent and reliable across all pages.

## Problem

Navigation was inconsistent across the application:
- Some pages had navigation floating separately from the page
- Some pages had navigation highlighted in the background
- Some pages were missing navigation entirely
- Pages manually included navigation with different Bootstrap versions (CDN vs local)
- Inconsistent styling and positioning

## Solution

Converted all pages from full HTML structure to content-only format using the master layout system (`views/layouts/master.ejs`). This ensures:
- Unified navigation across all pages
- Consistent Bootstrap 5 loading (local vendor files with CDN fallback)
- Proper theme support via `data-bs-theme` attribute
- Centralized navigation management

## Changes Made

### 1. Fixed Routes (Updated to use `renderWithLayout()`)

**Setup Routes:**
- ✅ `routes/setup/calibration.js` - Removed `includeNavigation: false`
- ✅ `routes/setup/system.js` - Updated to use `renderWithLayout()`
- ✅ `routes/setup/poses.js` - Updated to use `renderWithLayout()`
- ✅ `routes/setup/characters.js` - Updated to use `renderWithLayout()`
- ✅ `routes/setup/models.js` - Updated to use `renderWithLayout()`
- ✅ `routes/setup/webcam.js` - Updated to use `renderWithLayout()`
- ✅ `routes/setup/super-powers.js` - Updated to use `renderWithLayout()`

**Calibration Sub-Routes:**
- ✅ `routes/setup/calibration.js` (standard servo) - Updated to use `renderWithLayout()`
- ✅ `routes/setup/calibration.js` (continuous servo) - Already using `renderWithLayout()`
- ✅ `routes/setup/calibration.js` (linear actuator) - Already using `renderWithLayout()`

**Other Routes:**
- ✅ `routes/conversation.js` - Updated to use `renderWithLayout()`
- ✅ `routes/orchestration.js` - Updated to use `renderWithLayout()`
- ✅ `routes/goblinManagement.js` - Updated to use `renderWithLayout()`
- ✅ `routes/audioLibrary.js` - Updated to use `renderWithLayout()`
- ✅ `routes/videoLibrary.js` - Updated to use `renderWithLayout()`

### 2. Converted Views (Removed full HTML wrapper)

**Setup Pages:**
- ✅ `views/setup/system.ejs`
- ✅ `views/setup/poses.ejs`
- ✅ `views/setup/calibration.ejs`
- ✅ `views/setup/calibration-continuous-servo.ejs`
- ✅ `views/setup/calibration-linear-actuator.ejs`
- ✅ `views/setup/calibration-standard-servo.ejs`
- ✅ `views/setup/character-images.ejs`
- ✅ `views/setup/characters.ejs`
- ✅ `views/setup/models.ejs`
- ✅ `views/setup/webcam.ejs`
- ✅ `views/setup/super-powers.ejs`

**Other Pages:**
- ✅ `views/orchestration/index.ejs`
- ✅ `views/conversation/index.ejs`
- ✅ `views/goblin-management/index.ejs`
- ✅ `views/audio-library/index.ejs`
- ✅ `views/video-library/index.ejs`

### 3. Conversion Process

For each view file, the following changes were made:

**Removed:**
- `<!DOCTYPE html>` declaration
- `<html>` opening and closing tags
- `<head>` section (except page-specific `<style>` and `<script>` tags)
- `<body>` opening and closing tags
- Manual navigation includes: `<%- include('../components/unified-navigation', { page: '...' }) %>`
- Bootstrap CDN links (replaced by master layout's local vendor files)
- `<script src="/js/character-menu.js"></script>` (included by master layout)

**Preserved:**
- Page-specific `<style>` tags (moved to top of file)
- Page-specific `<script>` tags (kept at bottom)
- All content between former `<body>` tags
- Test mode detection scripts

### 4. New Features Added

**Theme Switching (Setup System Page):**
- Added Bootstrap theme selector to `/setup/system`
- Users can now switch between Dark and Light themes
- Theme persists across all pages via `config/app-config.json`
- Automatic page reload after theme change to apply across all components

**New API Routes:**
- `POST /api/config/theme` - Update application theme
- `GET /api/config` - Get current configuration
- `GET /api/system/info` - Get system information (Node version, platform, etc.)

**New Files Created:**
- `routes/api/configRoutes.js` - Configuration API endpoints
- `routes/api/systemRoutes.js` - System information API endpoints
- `scripts/convert_views_to_master_layout.py` - Automated conversion script

### 5. Master Layout System

The master layout (`views/layouts/master.ejs`) provides:
- HTML structure (`<!DOCTYPE html>`, `<html>`, `<head>`, `<body>`)
- Bootstrap 5 CSS/JS from local vendor files with CDN fallback
- Bootstrap Icons from local vendor files
- Unified navigation component (unless `includeNavigation: false`)
- Footer component
- Character menu JavaScript
- Theme support via `data-bs-theme="<%= config?.theme || 'dark' %>"`
- Support for page-specific styles, scripts, headExtras, bodyExtras

## Testing

To verify the fixes, test the following pages:

### Previously Problematic Pages (Now Fixed):
1. **http://192.168.8.200:3000/orchestration**
   - Navigation should be at top, properly styled
   - Should NOT be highlighted in background

2. **http://192.168.8.200:3000/setup/calibration**
   - Navigation should appear (was missing before)
   - Should NOT float separately

3. **http://192.168.8.200:3000/conversation**
   - Navigation should be consistent with other pages
   - Should NOT float or separate from page

### All Pages Should Now Have Consistent Navigation:
- `/` - Dashboard
- `/setup/system` - Setup System (with new theme controls)
- `/setup/characters` - Setup Characters
- `/setup/parts` - Setup Parts
- `/setup/poses` - Setup Poses
- `/setup/calibration` - Setup Calibration
- `/setup/audio` - Setup Audio
- `/setup/webcam` - Setup Webcam
- `/setup/models` - Setup Models
- `/setup/super-powers` - Setup Super Powers
- `/conversation` - Conversation Mode
- `/orchestration` - Orchestration Control
- `/scenes` - Scenes
- `/ai-settings` - AI Settings
- `/audio-library` - Audio Library
- `/video-library` - Video Library
- `/goblin-management` - Goblin Management

## Theme Switching

Users can now change the Bootstrap theme from the Setup System page:

1. Navigate to **Setup > System**
2. Select desired theme from dropdown (Dark or Light)
3. Click "Save Theme"
4. Page will reload with new theme applied across entire application

Theme is persisted in `config/app-config.json` and applied via the `data-bs-theme` attribute on the `<html>` element.

## Technical Details

### renderWithLayout Helper

The `renderWithLayout` helper (defined in `server.js` lines 87-114) automatically:
1. Renders the content template first
2. Wraps it in the master layout
3. Includes navigation unless `includeNavigation: false`
4. Supports `includeMainWrapper` option to control `<main>` wrapper

### Page Parameters

Each page should pass:
- `title` - Page title for `<title>` tag
- `page` - Page identifier for navigation highlighting (e.g., 'setup-calibration')
- `config` - Optional config object (e.g., `{ theme: 'dark' }`)
- `scripts` - Optional array of page-specific script paths
- `styles` - Optional array of page-specific stylesheet paths

Example:
```javascript
res.renderWithLayout('setup/system', {
    title: 'Setup System - MonsterBox 5.3',
    page: 'setup-system',
    config: { theme: 'dark' }
});
```

## Files Modified

**Total: 32 files**

**Routes (17 files):**
- routes/setup/calibration.js
- routes/setup/system.js
- routes/setup/poses.js
- routes/setup/characters.js
- routes/setup/models.js
- routes/setup/webcam.js
- routes/setup/super-powers.js
- routes/conversation.js
- routes/orchestration.js
- routes/goblinManagement.js
- routes/audioLibrary.js
- routes/videoLibrary.js
- routes/api/configRoutes.js (new)
- routes/api/systemRoutes.js (new)
- server.js

**Views (17 files):**
- views/setup/system.ejs
- views/setup/poses.ejs
- views/setup/calibration.ejs
- views/setup/calibration-continuous-servo.ejs
- views/setup/calibration-linear-actuator.ejs
- views/setup/calibration-standard-servo.ejs
- views/setup/character-images.ejs
- views/setup/characters.ejs
- views/setup/models.ejs
- views/setup/webcam.ejs
- views/setup/super-powers.ejs
- views/orchestration/index.ejs
- views/conversation/index.ejs
- views/goblin-management/index.ejs
- views/audio-library/index.ejs
- views/video-library/index.ejs

**Scripts (1 file):**
- scripts/convert_views_to_master_layout.py (new)

## Maintenance

For future pages:

1. **Always use `renderWithLayout()`** instead of `res.render()` for page routes
2. **Never include full HTML structure** in view files (no `<!DOCTYPE>`, `<html>`, `<head>`, `<body>`)
3. **Never manually include navigation** - let master layout handle it
4. **Use local vendor files** - master layout provides Bootstrap from `/vendor/`
5. **Pass `page` parameter** for navigation highlighting
6. **Use `<style>` tags** at top of view for page-specific styles
7. **Use `<script>` tags** at bottom of view for page-specific JavaScript

## Benefits

✅ Consistent navigation across entire application
✅ Unified Bootstrap 5 loading (no CDN/local conflicts)
✅ Centralized theme management
✅ Easier maintenance (navigation changes in one place)
✅ Better user experience (predictable navigation)
✅ Theme switching capability
✅ Reduced code duplication

