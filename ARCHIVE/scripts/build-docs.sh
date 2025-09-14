#!/bin/bash

# MonsterBox Documentation Build Script
# Generates TaskMaster documentation and builds MkDocs site

set -e

echo "🚀 Building MonsterBox Documentation..."

# Add local bin to PATH for mkdocs
export PATH=$PATH:/home/augment-agent/.local/bin

# Check if mkdocs is available
if ! command -v mkdocs &> /dev/null; then
    echo "❌ MkDocs not found. Installing..."
    pip3 install mkdocs mkdocs-material
fi

# Generate TaskMaster documentation
echo "📝 Generating TaskMaster documentation..."
node scripts/generate-task-docs.js

# Build MkDocs site
echo "🔨 Building MkDocs site..."
mkdocs build

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Documentation build completed successfully!"
    echo "📁 Site generated in: ./site/"
    echo "🌐 To serve locally: mkdocs serve"
else
    echo "❌ Documentation build failed!"
    exit 1
fi

# Optional: Serve documentation locally
if [ "$1" = "--serve" ]; then
    echo "🌐 Starting local documentation server..."
    mkdocs serve
fi
