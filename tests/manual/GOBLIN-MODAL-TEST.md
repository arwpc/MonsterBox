# Goblin Management Modal - Manual Test Checklist

## Test Environment
- **URL**: http://orlok:3000/goblin-management
- **Browser**: Any modern browser (Chrome, Firefox, Safari, Edge)
- **Prerequisites**: All three Goblins must be online and accessible

---

## ✅ Test 1: Modal Opening

### Steps:
1. Navigate to http://orlok:3000/goblin-management
2. Wait for page to load completely
3. Verify all three Goblin cards are displayed
4. **Double-click** on the "Goblin One" card

### Expected Results:
- ✅ Modal opens without errors in browser console
- ✅ Modal title shows "Goblin One - Video Queue"
- ✅ Modal has three main sections:
  - Current Queue (left side)
  - Available Videos (right side)
  - Playback Status (bottom)

### Common Issues:
- ❌ If modal doesn't open: Check browser console for errors
- ❌ If "Loading..." persists: Check network tab for failed API calls

---

## ✅ Test 2: Current Queue Section

### Steps:
1. With modal open, look at the "Current Queue" section on the left
2. Observe the queue status display

### Expected Results:
- ✅ Shows "Queue is empty" if no videos in queue
- ✅ Shows queue status (Running/Stopped)
- ✅ Shows loop mode (none/sequential/continuous)
- ✅ If videos in queue, they are listed with:
  - Video number badge
  - Filename
  - Remove button (X)

### Common Issues:
- ❌ If stuck on "Loading...": API response format mismatch (check console)
- ❌ If shows error: Network connectivity issue with Goblin

---

## ✅ Test 3: Available Videos Section

### Steps:
1. Look at the "Available Videos" section on the right
2. Scroll through the video list
3. Use the search box to filter videos

### Expected Results:
- ✅ Shows 57 videos from `/home/remote/media/video`
- ✅ Each video displays:
  - Filename
  - File size
  - Duration
  - Resolution (1280x720)
  - Two buttons: "Add" and "Play"
- ✅ Search box filters videos in real-time
- ✅ Scroll bar appears if list is long

### Common Issues:
- ❌ If no videos shown: Check `/media` endpoint response
- ❌ If videos missing metadata: Check ffprobe installation on Goblin

---

## ✅ Test 4: Add Video to Queue

### Steps:
1. Find any video in the "Available Videos" list
2. Click the "Add" button next to it
3. Observe the "Current Queue" section

### Expected Results:
- ✅ Success message appears: "Added [filename] to queue"
- ✅ Video appears in the "Current Queue" list
- ✅ Queue count increases
- ✅ No errors in browser console

### Common Issues:
- ❌ If add fails: Check `/queue/enqueue` endpoint
- ❌ If queue doesn't update: Check transformQueueData() function

---

## ✅ Test 5: Play Video Immediately

### Steps:
1. Find any video in the "Available Videos" list
2. Click the "Play" button next to it
3. Observe the Playback Status section

### Expected Results:
- ✅ Success message: "Now playing: [filename]"
- ✅ Playback Status shows:
  - Green "Playing" indicator
  - Current video filename
  - Goblin name
- ✅ Video starts playing on the Goblin display
- ✅ Current Queue updates to show the video

### Common Issues:
- ❌ If play fails: Check `/queue/enqueue-priority` and `/queue/start` endpoints
- ❌ If no video on display: Check MPV process on Goblin

---

## ✅ Test 6: Queue Controls

### Steps:
1. Add 2-3 videos to the queue using "Add" buttons
2. Click "Start Queue" button
3. Wait a few seconds
4. Click "Stop Queue" button
5. Click "Clear Queue" button (confirm the dialog)

### Expected Results:
- ✅ **Start Queue**: 
  - Success message appears
  - First video starts playing
  - Status changes to "Running"
- ✅ **Stop Queue**:
  - Success message appears
  - Playback stops
  - Status changes to "Stopped"
- ✅ **Clear Queue**:
  - Confirmation dialog appears
  - After confirming, queue empties
  - Shows "Queue is empty" message

### Common Issues:
- ❌ If start fails: Check `/queue/start` endpoint
- ❌ If stop fails: Check `/queue/stop` endpoint
- ❌ If clear fails: Check `/queue/clear` endpoint

---

## ✅ Test 7: Playback Status Updates

### Steps:
1. Start playing a video (using "Play" button)
2. Watch the Playback Status section for 10 seconds
3. Stop the video

### Expected Results:
- ✅ Status updates every 2 seconds automatically
- ✅ Shows current video filename
- ✅ Shows playing/stopped state
- ✅ Updates reflect actual Goblin state
- ✅ When stopped, shows "No video playing"

### Common Issues:
- ❌ If status doesn't update: Check auto-refresh interval (2000ms)
- ❌ If status incorrect: Check `/playback-status` endpoint

---

## ✅ Test 8: Multiple Goblins

### Steps:
1. Close the current modal
2. Double-click on "Goblin Two" card
3. Repeat tests 1-7 for Goblin Two
4. Close modal
5. Double-click on "Goblin Three" card
6. Repeat tests 1-7 for Goblin Three

### Expected Results:
- ✅ Each Goblin's modal works independently
- ✅ Each Goblin has its own queue
- ✅ Each Goblin shows its own 57 videos
- ✅ All controls work for each Goblin

### Common Issues:
- ❌ If modal shows wrong Goblin: Check `currentQueueGoblin` variable
- ❌ If data mixed between Goblins: Check modal cleanup on close

---

## ✅ Test 9: Error Handling

### Steps:
1. Open browser console (F12)
2. Perform various actions (add, play, start, stop, clear)
3. Monitor console for errors

### Expected Results:
- ✅ No JavaScript errors in console
- ✅ No "Cannot read properties of undefined" errors
- ✅ No CORS errors
- ✅ All API calls return 200 status
- ✅ Error messages are user-friendly if something fails

### Common Issues:
- ❌ CORS errors: Check Goblin server CORS middleware
- ❌ 404 errors: Check endpoint exists on Goblin server
- ❌ Undefined errors: Check data transformation in frontend

---

## ✅ Test 10: Modal Responsiveness

### Steps:
1. Open modal
2. Resize browser window to different sizes
3. Test on different screen resolutions if possible

### Expected Results:
- ✅ Modal adjusts to window size
- ✅ Scroll bars appear when needed
- ✅ Buttons remain clickable
- ✅ Text doesn't overflow
- ✅ Layout remains usable on smaller screens

---

## 🎯 Success Criteria

**All tests must pass for the Goblin Management modal to be considered fully functional.**

### Critical Tests (Must Pass):
- ✅ Test 1: Modal Opening
- ✅ Test 2: Current Queue Section
- ✅ Test 3: Available Videos Section
- ✅ Test 4: Add Video to Queue
- ✅ Test 5: Play Video Immediately
- ✅ Test 9: Error Handling

### Important Tests (Should Pass):
- ✅ Test 6: Queue Controls
- ✅ Test 7: Playback Status Updates
- ✅ Test 8: Multiple Goblins
- ✅ Test 10: Modal Responsiveness

---

## 🐛 Reporting Issues

If any test fails, please provide:
1. **Test number and name**
2. **Steps to reproduce**
3. **Expected vs actual result**
4. **Browser console errors** (if any)
5. **Network tab errors** (if any)
6. **Screenshot** (if visual issue)

---

## 📝 Notes

- All API endpoints have been fixed and tested via curl
- Frontend data transformation has been corrected
- CORS headers are properly configured
- All three Goblins are deployed with latest code
- MonsterBox server has been restarted with latest frontend code

**Last Updated**: 2025-10-21
**Version**: MonsterBox 5.1

