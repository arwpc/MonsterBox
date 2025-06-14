#!/bin/bash
# Verify TopMediai integration and save progress

cd ~/MB-TopMedia

# Check if we're on the isolated branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Currently on branch: $CURRENT_BRANCH"

# Check if TopMediai API key exists in .env
if grep -q "TOPMEDIAI_API_KEY" .env; then
  echo "✅ TopMediai API key found in .env file"
else
  echo "❌ TopMediai API key not found in .env file"
  echo "Adding TopMediai API key to .env file..."
  echo "TOPMEDIAI_API_KEY=\"3d31edf8c9a24824b72bf325f0d46ced\"" >> .env
fi

# Check if TopMediai integration files exist
if [ -f "scripts/topMediaiAPI.js" ]; then
  echo "✅ TopMediai API integration file exists"
else
  echo "❌ TopMediai API integration file not found"
fi

# Save our progress
echo "Saving progress..."
git add .
git commit -m "Save progress on TopMediai integration in isolated branch"

echo "Progress saved on branch: $CURRENT_BRANCH"
echo "To start the application with TopMediai integration, run:"
echo "cd ~/MB-TopMedia && npm start"