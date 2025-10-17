#!/usr/bin/env python3
"""
Convert EJS views from full HTML to master layout content-only format.
This script removes <!DOCTYPE>, <html>, <head>, <body> tags and manual navigation includes.
"""

import re
import sys
from pathlib import Path

def convert_view_to_master_layout(file_path):
    """Convert a single EJS file to use master layout."""
    print(f"Converting: {file_path}")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if already converted
    if '<!DOCTYPE' not in content:
        print(f"  [OK] Already converted (no DOCTYPE found)")
        return False
    
    original_content = content
    
    # Remove DOCTYPE and opening html tag
    content = re.sub(r'<!DOCTYPE[^>]*>\s*', '', content, flags=re.IGNORECASE)
    content = re.sub(r'<html[^>]*>\s*', '', content, flags=re.IGNORECASE)
    
    # Extract and preserve <style> and <script> tags from head
    head_match = re.search(r'<head>(.*?)</head>', content, re.DOTALL | re.IGNORECASE)
    preserved_head_content = ''
    if head_match:
        head_content = head_match.group(1)
        # Extract style tags
        styles = re.findall(r'<style[^>]*>.*?</style>', head_content, re.DOTALL)
        # Extract script tags (but not Bootstrap/CDN scripts)
        scripts_in_head = re.findall(r'<script(?![^>]*src=["\']https://cdn)[^>]*>.*?</script>', head_content, re.DOTALL)
        
        if styles or scripts_in_head:
            preserved_head_content = '\n'.join(styles + scripts_in_head) + '\n\n'
    
    # Remove the entire head section
    content = re.sub(r'<head>.*?</head>\s*', '', content, re.DOTALL | re.IGNORECASE)
    
    # Remove opening body tag
    content = re.sub(r'<body[^>]*>\s*', '', content, flags=re.IGNORECASE)
    
    # Remove manual navigation includes and comments
    content = re.sub(r'<!--.*?Navigation.*?-->\s*', '', content, re.DOTALL)
    content = re.sub(r'<%- include\([\'"]\.\.\/components\/unified-navigation[\'"][^)]*\) %>\s*', '', content)
    
    # Remove Bootstrap CDN script tags
    content = re.sub(r'<script src="https://cdn\.jsdelivr\.net/npm/bootstrap@[^"]*"></script>\s*', '', content)
    
    # Remove character-menu.js script tag (master layout includes it)
    content = re.sub(r'<script src="/js/character-menu\.js"></script>\s*', '', content)
    
    # Remove closing body and html tags
    content = re.sub(r'</body>\s*', '', content, flags=re.IGNORECASE)
    content = re.sub(r'</html>\s*', '', content, flags=re.IGNORECASE)
    
    # Add preserved head content at the top
    content = preserved_head_content + content
    
    # Clean up extra whitespace
    content = re.sub(r'\n\n\n+', '\n\n', content)
    content = content.strip() + '\n'
    
    # Write back
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"  [OK] Converted successfully")
    return True

def main():
    # Files to convert
    files_to_convert = [
        'views/setup/calibration.ejs',
        'views/setup/calibration-continuous-servo.ejs',
        'views/setup/calibration-linear-actuator.ejs',
        'views/setup/calibration-standard-servo.ejs',
    ]
    
    converted_count = 0
    for file_path in files_to_convert:
        path = Path(file_path)
        if not path.exists():
            print(f"[WARN] File not found: {file_path}")
            continue

        if convert_view_to_master_layout(path):
            converted_count += 1

    print(f"\n[SUCCESS] Conversion complete! Converted {converted_count} files.")
    print("[WARN] Remember to update routes to use renderWithLayout() instead of render()")

if __name__ == '__main__':
    main()

