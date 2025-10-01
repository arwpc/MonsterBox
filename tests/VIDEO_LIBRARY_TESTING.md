# Video Library Testing Guide

This document explains how to test the dynamic video library feature in MonsterBox.

## Overview

The video library now supports **dynamic video indexing** from the `/videos` directory. This means:
- Videos can be added by simply copying them to `/videos` directory
- No need to upload through the UI
- Videos are automatically indexed within 30 seconds
- Both uploaded (UI) and dynamic (/videos) videos are supported

## Test Files

### Unit Tests
- **`tests/unit/video-library-service.test.js`** - Tests the videoLibraryService backend
  - Dynamic video indexing
  - 30-second cache mechanism
  - Dual-source video management (uploaded + dynamic)
  - Helper methods (getMimeType, formatFileSize)
  - "Use first available video" testing pattern

### UI/Integration Tests
- **`tests/video-library-dynamic.spec.js`** - Tests the video library UI with Playwright
  - Page loading
  - Dynamic video display
  - Re-indexing behavior
  - Empty state handling
  - Dual-source support
  - Metadata display

## Running Tests

### Run All Video Library Tests
```bash
npm run test:video-library
```

### Run Unit Tests Only
```bash
npm run test:video-library:unit
```

### Run UI Tests Only
```bash
npm run test:video-library:ui
```

### Run UI Tests in Headed Mode (visible browser)
```bash
npm run test:video-library:ui:live
```

### Run Individual Test Files
```bash
# Unit tests
mocha tests/unit/video-library-service.test.js --timeout 60000

# UI tests
playwright test -c playwright.config.ts tests/video-library-dynamic.spec.js
```

## Test Setup

### Prerequisites
1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Install Playwright browsers** (for UI tests):
   ```bash
   npm run playwright:browsers:firefox
   ```

3. **Ensure MonsterBox server is running** (for UI tests):
   ```bash
   npm start
   ```
   Or the tests will start it automatically via `playwright.config.ts`

### Adding Test Videos

To enable full test coverage, add video files to the `/videos` directory:

```bash
# Copy a test video
cp /path/to/your/video.mp4 videos/

# Or use the provided test videos
cp test-videos/*.mp4 videos/
```

**Supported formats**: `.mp4`, `.avi`, `.mov`, `.mkv`, `.webm`, `.m4v`, `.wmv`, `.flv`

## Test Behavior

### When No Videos Exist
- Tests will **pass** but log informational messages
- Tests gracefully handle empty `/videos` directory
- Suggests copying videos to enable full testing

### When Videos Exist
- Tests verify dynamic indexing works
- Tests check metadata display
- Tests verify streaming functionality
- Tests confirm cache behavior

### "Use First Available Video" Pattern
Many tests use this pattern:
```javascript
const result = await videoLibraryService.getLibrary();
if (result.videos.length > 0) {
    const firstVideo = result.videos[0];
    // Use firstVideo for testing...
}
```

This allows tests to work with whatever videos are available, whether from:
- `/videos` directory (dynamic)
- Uploaded through UI
- Test fixtures

## Key Test Scenarios

### 1. Dynamic Indexing
- ✅ Videos in `/videos` are automatically indexed
- ✅ Indexing happens within 30 seconds (cache duration)
- ✅ New videos appear after cache expires

### 2. Cache Performance
- ✅ First call indexes from filesystem
- ✅ Subsequent calls use cache (faster)
- ✅ Cache expires after 30 seconds

### 3. Dual-Source Support
- ✅ Both uploaded and dynamic videos appear in library
- ✅ Videos can be streamed from either source
- ✅ Dynamic videos are checked first in `getVideoStream()`

### 4. Metadata
- ✅ Dynamic videos have proper metadata (title, size, format, MIME type)
- ✅ File size is formatted correctly (KB, MB, GB)
- ✅ MIME types are correct for each format

### 5. Empty State
- ✅ System handles empty `/videos` directory gracefully
- ✅ No errors when no videos exist
- ✅ UI shows appropriate empty state message

## Continuous Integration

These tests are designed to work in CI environments:

- **No videos required**: Tests pass even if `/videos` is empty
- **Informational logging**: Tests log helpful messages about what's available
- **Graceful degradation**: Tests skip scenarios that require videos if none exist

## Troubleshooting

### Tests Fail with "Cannot find module"
```bash
# Ensure dependencies are installed
npm install
```

### UI Tests Fail with "Browser not found"
```bash
# Install Playwright browsers
npm run playwright:browsers:firefox
```

### Tests Timeout
```bash
# Increase timeout for slow systems
mocha tests/unit/video-library-service.test.js --timeout 120000
```

### Videos Not Appearing in Tests
1. Check that videos are in `/videos` directory:
   ```bash
   ls -lh videos/
   ```

2. Check video formats are supported:
   ```bash
   # Supported: .mp4, .avi, .mov, .mkv, .webm, .m4v, .wmv, .flv
   ```

3. Wait for cache to expire (30 seconds) and reload

4. Check server logs for indexing messages:
   ```
   ✅ Video Library Service initialized (dynamic indexing from /videos)
   ```

## Test Coverage

### Unit Tests Cover:
- ✅ Service initialization
- ✅ Dynamic indexing logic
- ✅ Cache mechanism
- ✅ Dual-source management
- ✅ Helper methods
- ✅ Error handling

### UI Tests Cover:
- ✅ Page loading
- ✅ Video display
- ✅ Re-indexing behavior
- ✅ User interactions
- ✅ Empty states
- ✅ Metadata display

## Integration with Existing Tests

These tests complement existing MonsterBox tests:
- Similar pattern to `tests/audio-library-playback.spec.js`
- Uses same test infrastructure (Mocha + Playwright)
- Follows MonsterBox testing conventions
- Compatible with existing CI/CD pipelines

## Future Enhancements

Potential test additions:
- [ ] Test video playback functionality
- [ ] Test video thumbnail generation
- [ ] Test video upload through UI
- [ ] Test video deletion
- [ ] Test video filtering and search
- [ ] Test video categories and tags
- [ ] Performance tests with many videos
- [ ] Concurrent access tests

## Related Documentation

- [Testing Documentation](../docs/Testing-Documentation.md)
- [Test Organization](../docs/testing/organization.md)
- [Video Library Service](../services/videoLibraryService.js)
- [Video Library Routes](../routes/videoLibrary.js)

## Questions?

If tests fail or behave unexpectedly:
1. Check server logs for errors
2. Verify `/videos` directory exists and is readable
3. Ensure video files are valid and not corrupted
4. Check that MonsterBox server is running on port 3000
5. Review test output for specific error messages

For more help, see the main [Testing Documentation](../docs/Testing-Documentation.md).

