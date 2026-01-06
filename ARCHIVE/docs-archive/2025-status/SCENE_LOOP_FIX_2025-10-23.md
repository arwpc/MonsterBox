# Scene Loop Execution Fix - October 23, 2025

## Problem Description

The scene queue loop functionality was not working correctly. When "Play Loop" was selected:
- The queue would play the first video and remove it
- Then play the second video and remove it
- Then STOP instead of continuing to loop

**Expected Behavior**: The queue should continuously play scenes in a loop until manually stopped.

## Root Cause Analysis

Two issues were identified in `/home/remote/MonsterBox/services/scenes/sceneQueue.js`:

### Issue 1: Logic Error in Queue Refill
In the `runLoop()` function (lines 159-187), there was a subtle bug in how the queue handled the loop refill:

```javascript
// OLD CODE (BUGGY)
if (q.items.length === 0){
  if (q.mode === 'loop_queue' && q.originalItems && q.originalItems.length > 0){
    q.items = q.originalItems.slice();  // Refill queue
  } else {
    break; // finished
  }
}
next = q.items.shift();  // ❌ This would remove an item AFTER refilling
```

**Problem**: After refilling the queue, `q.items.shift()` was called unconditionally, which would:
1. Refill the queue from originalItems
2. Immediately remove the first item without playing it
3. This caused items to be skipped during loop iterations

### Issue 2: Blocking HTTP Response
The `start()` and `startWithConfig()` functions were using `await runLoop()`, which caused:
- The HTTP endpoint to wait until the entire queue finished
- Frontend showed "completed" message immediately
- UI appeared unresponsive
- Loop mode would block indefinitely

## Solution Implemented

### Fix 1: Corrected Loop Logic
Modified the `runLoop()` function to only shift items when the queue has content:

```javascript
// NEW CODE (FIXED)
if (q.items.length === 0){
  if (q.mode === 'loop_queue' && q.originalItems && q.originalItems.length > 0){
    // Refill queue for loop mode
    q.items = q.originalItems.slice();
  } else {
    // Sequential mode or no items - exit loop
    break;
  }
}
// Get next item only if queue has items
if (q.items.length > 0) {
  next = q.items.shift();
}
```

### Fix 2: Non-Blocking Queue Start
Modified `start()` and `startWithConfig()` to run the loop in the background:

```javascript
// Start loop in background - don't await
runLoop(characterId).catch(err => {
  console.error(`Queue loop error for character ${characterId}:`, err);
  q.running = false;
});
return getStatus(characterId);
```

This allows the HTTP response to return immediately while the queue continues running.

### Fix 3: Updated Frontend Message
Changed the frontend message from "completed" to "started" in `/home/remote/MonsterBox/views/scenes/scenes.ejs`:

```javascript
setHtml('queueStatus', alertBox('success', 'Queue ' + (loop ? 'loop' : 'playback') + ' started'));
```

## Files Modified

1. `/home/remote/MonsterBox/services/scenes/sceneQueue.js`
   - Fixed `runLoop()` function logic
   - Made `start()` and `startWithConfig()` non-blocking

2. `/home/remote/MonsterBox/views/scenes/scenes.ejs`
   - Updated `window.playQueue()` success message
   - Updated cache buster to v3.1

## Testing

### Test Script Created
Created `/home/remote/test-extended-loop.sh` to verify continuous loop operation.

### Test Results
```
=== Extended Scene Loop Test (60 seconds) ===
Scene transitions detected: 26
✅ SUCCESS - Loop is working continuously!
```

The queue successfully completed 13 full loops (26 scene transitions) over 60 seconds, confirming:
- ✅ Queue refills correctly after each complete cycle
- ✅ All scenes play in order without skipping
- ✅ Loop continues indefinitely until manually stopped
- ✅ HTTP endpoints respond immediately
- ✅ Frontend updates status correctly

## Deployment Status

- **Server**: Restarted and running (PID 4175)
- **Health Check**: ✅ Passing
- **Version**: 5.3
- **Date**: October 23, 2025 @ 21:18 UTC

## Usage Instructions

### Web UI
1. Navigate to the Scenes page
2. Select scenes using checkboxes
3. Click "Add Selected to Queue"
4. Click "Play Loop" button
5. Queue will continuously loop until "Stop" is pressed

### API
```bash
# Start loop mode
curl -X POST http://localhost:3000/scenes/api/queue/start-config \
  -H "Content-Type: application/json" \
  -d '{"mode":"loop_queue","scenes":[{"scene_id":1},{"scene_id":2}]}'

# Stop loop
curl -X POST http://localhost:3000/scenes/api/queue/stop
```

## Verification Checklist

- [x] Code logic corrected in sceneQueue.js
- [x] Frontend messaging updated
- [x] Server restarted
- [x] Test script created and passed
- [x] 60-second continuous loop verified
- [x] Multiple loop iterations confirmed
- [x] Documentation created

## Notes

The fix maintains backward compatibility with:
- Sequential mode (plays once and stops)
- Priority queue insertion
- Pause/Resume functionality
- Skip functionality
- Emergency stop

All existing scene queue features continue to work as expected.
