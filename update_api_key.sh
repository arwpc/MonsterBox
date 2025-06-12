#!/bin/bash

# Update OpenAI API key in .env file
NEW_KEY="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"

echo "🔑 Updating OpenAI API key in .env file..."

# Create backup
cp .env .env.backup

# Update the API key
sed -i "s/OPENAI_API_KEY=\".*\"/OPENAI_API_KEY=\"$NEW_KEY\"/" .env

echo "✅ API key updated successfully!"
echo "📄 Backup saved as .env.backup"

# Verify the change
echo "🔍 Verifying update..."
grep "OPENAI_API_KEY" .env | head -1
