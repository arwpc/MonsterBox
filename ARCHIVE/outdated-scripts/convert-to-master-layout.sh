#!/bin/bash
# Script to convert EJS pages from full HTML to master layout content-only format
# This removes <!DOCTYPE>, <html>, <head>, <body> tags and manual navigation includes

set -e

echo "🔧 Converting MonsterBox pages to use master layout..."

# Function to convert a single file
convert_file() {
    local file="$1"
    local backup="${file}.backup"
    
    if [ ! -f "$file" ]; then
        echo "⚠️  File not found: $file"
        return 1
    fi
    
    # Check if file already uses master layout (no DOCTYPE)
    if ! grep -q "<!DOCTYPE" "$file"; then
        echo "✅ Already converted: $file"
        return 0
    fi
    
    echo "🔄 Converting: $file"
    
    # Create backup
    cp "$file" "$backup"
    
    # Use Python to do the conversion (more reliable than sed for multi-line)
    python3 << 'PYTHON_SCRIPT'
import sys
import re

file_path = sys.argv[1]

with open(file_path, 'r') as f:
    content = f.read()

# Remove DOCTYPE and opening html tag
content = re.sub(r'<!DOCTYPE[^>]*>\s*', '', content, flags=re.IGNORECASE)
content = re.sub(r'<html[^>]*>\s*', '', content, flags=re.IGNORECASE)

# Remove head section but preserve any <style> or <script> tags in head
head_match = re.search(r'<head>(.*?)</head>', content, re.DOTALL | re.IGNORECASE)
if head_match:
    head_content = head_match.group(1)
    # Extract style and script tags from head
    styles = re.findall(r'<style[^>]*>.*?</style>', head_content, re.DOTALL)
    scripts_in_head = re.findall(r'<script[^>]*>.*?</script>', head_content, re.DOTALL)
    
    # Remove the entire head section
    content = re.sub(r'<head>.*?</head>\s*', '', content, re.DOTALL | re.IGNORECASE)
    
    # Add styles and scripts back at the top
    preserved = '\n'.join(styles + scripts_in_head)
    if preserved:
        content = preserved + '\n\n' + content

# Remove opening body tag
content = re.sub(r'<body[^>]*>\s*', '', content, flags=re.IGNORECASE)

# Remove manual navigation includes
content = re.sub(r'<!--.*?Navigation.*?-->\s*', '', content, re.DOTALL)
content = re.sub(r'<%- include\([\'"]\.\.\/components\/unified-navigation[\'"][^)]*\) %>\s*', '', content)

# Remove closing body and html tags
content = re.sub(r'</body>\s*', '', content, flags=re.IGNORECASE)
content = re.sub(r'</html>\s*', '', content, flags=re.IGNORECASE)

# Remove Bootstrap CDN links (master layout provides these)
content = re.sub(r'<script src="https://cdn\.jsdelivr\.net/npm/bootstrap@[^"]*"></script>\s*', '', content)
content = re.sub(r'<script src="/js/character-menu\.js"></script>\s*', '', content)

# Clean up extra whitespace
content = re.sub(r'\n\n\n+', '\n\n', content)
content = content.strip() + '\n'

with open(file_path, 'w') as f:
    f.write(content)

print(f"✅ Converted: {file_path}")
PYTHON_SCRIPT "$file"
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully converted: $file"
        rm "$backup"
        return 0
    else
        echo "❌ Failed to convert: $file (restored from backup)"
        mv "$backup" "$file"
        return 1
    fi
}

# Convert setup pages
echo ""
echo "📁 Converting setup pages..."
convert_file "views/setup/system.ejs"
convert_file "views/setup/poses.ejs"
convert_file "views/setup/calibration.ejs"
convert_file "views/setup/calibration-continuous-servo.ejs"
convert_file "views/setup/calibration-linear-actuator.ejs"
convert_file "views/setup/calibration-standard-servo.ejs"
convert_file "views/setup/character-images.ejs"
convert_file "views/setup/characters.ejs"
convert_file "views/setup/models.ejs"
convert_file "views/setup/parts.ejs"
convert_file "views/setup/webcam.ejs"
convert_file "views/setup/super-powers.ejs"

# Convert library pages
echo ""
echo "📁 Converting library pages..."
convert_file "views/goblin-management/index.ejs"
convert_file "views/audio-library/index.ejs"
convert_file "views/video-library/index.ejs"

echo ""
echo "✅ Conversion complete!"
echo "⚠️  Remember to update routes to use renderWithLayout() instead of render()"

