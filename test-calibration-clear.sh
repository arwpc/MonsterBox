#!/bin/bash
# Test script for calibration clear functionality

echo "🧪 Testing Calibration Clear Functionality"
echo "=========================================="
echo ""

BASE_URL="http://localhost:3000"

# Test 1: Check if Clear All Calibrations endpoint exists
echo "Test 1: POST /api/calibration/clear-all"
curl -s -X POST "$BASE_URL/api/calibration/clear-all" \
  -H "Content-Type: application/json" \
  -d '{"characterId": 3, "partIds": []}' | jq '.'
echo ""

# Test 2: Check if DELETE profile endpoint exists
echo "Test 2: DELETE /api/calibration/1/profile"
curl -s -X DELETE "$BASE_URL/api/calibration/1/profile" | jq '.'
echo ""

# Test 3: Get calibration profile before clearing
echo "Test 3: GET /api/calibration/1/profile (before clear)"
curl -s "$BASE_URL/api/calibration/1/profile" | jq '.'
echo ""

# Test 4: Clear calibration profile
echo "Test 4: DELETE /api/calibration/1/profile (clearing)"
curl -s -X DELETE "$BASE_URL/api/calibration/1/profile" | jq '.'
echo ""

# Test 5: Verify profile is cleared
echo "Test 5: GET /api/calibration/1/profile (after clear)"
curl -s "$BASE_URL/api/calibration/1/profile" | jq '.'
echo ""

# Test 6: Test Clear All with actual part IDs
echo "Test 6: Clear all calibrations for parts 1, 2, 3"
curl -s -X POST "$BASE_URL/api/calibration/clear-all" \
  -H "Content-Type: application/json" \
  -d '{"characterId": 3, "partIds": [1, 2, 3]}' | jq '.'
echo ""

echo "✅ All API tests completed"
