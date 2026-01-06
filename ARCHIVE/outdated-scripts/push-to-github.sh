#!/bin/bash
# Push local commits to GitHub using force push
# This will overwrite the remote with local changes

set -e

echo "Current local commits:"
git log --oneline -5

echo ""
echo "Attempting to push to GitHub..."
echo "Note: This requires GitHub authentication to be set up"

# Try to push
git push -f origin main

echo "✓ Successfully pushed to GitHub!"

