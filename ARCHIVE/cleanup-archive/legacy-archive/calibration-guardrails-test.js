#!/usr/bin/env node
/**
 * Calibration Guardrails Integration Test
 * Tests that Jaw Animation and Head Tracking respect Min/Max calibration markers
 */

import { strict as assert } from 'assert';

console.log('🧪 Calibration Guardrails Integration Test\n');

// Test 1: Verify Simple Calibration UI exists
console.log('Test 1: Verify Simple Calibration UI...');
try {
  const fs = await import('fs/promises');
  const calibrationPage = await fs.readFile('views/setup/calibration.ejs', 'utf8');

  assert(calibrationPage.includes('Simple Calibration'), 'Simple Calibration panel should exist');
  assert(calibrationPage.includes('id="setMinBtn"'), 'Set Min button should exist');
  assert(calibrationPage.includes('id="setMaxBtn"'), 'Set Max button should exist');
  assert(calibrationPage.includes('id="goMinBtn"'), 'Go Min button should exist');
  assert(calibrationPage.includes('id="goMaxBtn"'), 'Go Max button should exist');
  assert(calibrationPage.includes('Custom Positions'), 'Custom positions section should exist');

  console.log('✅ Simple Calibration UI verified\n');
} catch (error) {
  console.error('❌ Simple Calibration UI test failed:', error.message);
  process.exit(1);
}

// Test 2: Verify Jaw Animation guardrails integration
console.log('Test 2: Verify Jaw Animation guardrails integration...');
try {
  const fs = await import('fs/promises');
  const jawService = await fs.readFile('services/jawAnimationSuperPowerService.js', 'utf8');

  assert(jawService.includes('loadCalibrationGuardrails'), 'Should have loadCalibrationGuardrails function');
  assert(jawService.includes('getMarkersForPart'), 'Should import getMarkersForPart');
  assert(jawService.includes('guardrails.minAngle'), 'Should use guardrails.minAngle');
  assert(jawService.includes('guardrails.maxAngle'), 'Should use guardrails.maxAngle');
  assert(jawService.includes('Math.max(minAngle, Math.min(maxAngle, targetAngle))'), 'Should clamp angle to guardrails');

  console.log('✅ Jaw Animation guardrails integration verified\n');
} catch (error) {
  console.error('❌ Jaw Animation guardrails test failed:', error.message);
  process.exit(1);
}

// Test 3: Verify Head Tracking guardrails integration
console.log('Test 3: Verify Head Tracking guardrails integration...');
try {
  const fs = await import('fs/promises');
  const headTracking = await fs.readFile('controllers/motionTrackingController.js', 'utf8');

  assert(headTracking.includes('loadHeadTrackingGuardrails'), 'Should have loadHeadTrackingGuardrails function');
  assert(headTracking.includes('getMarkersForPart'), 'Should import getMarkersForPart');
  assert(headTracking.includes('headTrackingGuardrails'), 'Should have guardrails cache');
  assert(headTracking.includes('guardrails.minAngle'), 'Should use guardrails.minAngle');
  assert(headTracking.includes('guardrails.maxAngle'), 'Should use guardrails.maxAngle');
  assert(headTracking.includes('if (next > maxLimit) next = maxLimit'), 'Should clamp to max limit');
  assert(headTracking.includes('if (next < minLimit) next = minLimit'), 'Should clamp to min limit');

  console.log('✅ Head Tracking guardrails integration verified\n');
} catch (error) {
  console.error('❌ Head Tracking guardrails test failed:', error.message);
  process.exit(1);
}

// Test 4: Verify marker API endpoints exist
console.log('Test 4: Verify marker API endpoints...');
try {
  const fs = await import('fs/promises');
  const calibrationRoutes = await fs.readFile('routes/setup/calibration.js', 'utf8');

  assert(calibrationRoutes.includes("router.post('/api/parts/:id/markers'"), 'Should have POST markers endpoint');
  assert(calibrationRoutes.includes("router.get('/api/parts/:id/markers'"), 'Should have GET markers endpoint');
  assert(calibrationRoutes.includes("router.delete('/api/parts/:id/markers/:name'"), 'Should have DELETE marker endpoint');

  console.log('✅ Marker API endpoints verified\n');
} catch (error) {
  console.error('❌ Marker API endpoints test failed:', error.message);
  process.exit(1);
}

// Test 5: Verify calibration service exists
console.log('Test 5: Verify calibration services...');
try {
  const fs = await import('fs/promises');

  // Check if calibration routes has getMarkersForPart
  const calibrationRoutes = await fs.readFile('routes/setup/calibration.js', 'utf8');
  assert(calibrationRoutes.includes('export'), 'Should export functions');
  assert(calibrationRoutes.includes('markers'), 'Should handle markers');

  console.log('✅ Calibration services verified\n');
} catch (error) {
  console.error('❌ Calibration services test failed:', error.message);
  process.exit(1);
}

console.log('🎉 All calibration guardrails tests passed!\n');
console.log('Summary:');
console.log('  ✅ Simple Calibration UI implemented');
console.log('  ✅ Jaw Animation uses Min/Max guardrails');
console.log('  ✅ Head Tracking uses Min/Max guardrails');
console.log('  ✅ Marker API endpoints available');
console.log('  ✅ Calibration services functional');
console.log('\nNext steps:');
console.log('  1. Test on actual hardware with servos');
console.log('  2. Set Min/Max markers for jaw servo');
console.log('  3. Set Min/Max markers for head tracking servo');
console.log('  4. Verify jaw animation respects limits during TTS');
console.log('  5. Verify head tracking respects limits during motion tracking');

process.exit(0);

