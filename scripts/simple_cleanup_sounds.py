#!/usr/bin/env python3
"""
Simple sound cleanup script - checks for sound files that aren't in sounds.json and deletes them.
No complicated analysis or multi-step process. Works on both Windows and Linux.
"""

import os
import json
import sys

def cleanup_sounds():
    # Get current directory (where the script is run from)
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Step 1: Get all files in the sounds directory
    sounds_dir = os.path.join(base_dir, 'public', 'sounds')
    try:
        all_files = os.listdir(sounds_dir)
        print(f"Found {len(all_files)} files in sounds directory")
    except Exception as e:
        print(f"Error accessing sounds directory: {e}")
        return
    
    # Step 2: Read the sounds.json file
    json_path = os.path.join(base_dir, 'data', 'sounds.json')
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            sounds_data = json.load(f)
    except Exception as e:
        print(f"Error reading sounds.json file: {e}")
        return
    
    # Step 3: Create a set of all filenames used in sounds.json
    used_filenames = set()
    for sound in sounds_data:
        if sound and sound.get('filename'):
            used_filenames.add(sound['filename'])
    
    print(f"Found {len(used_filenames)} files referenced in sounds.json")
    
    # Step 4: Find files that are not referenced in sounds.json
    unused_files = [file for file in all_files if file not in used_filenames]
    print(f"Found {len(unused_files)} unused files")
    
    if not unused_files:
        print("No unused sound files to delete.")
    
    # Step 5: Check for entries in sounds.json that do not have corresponding files in /public/sounds
    missing_files = []
    for sound in sounds_data:
        filename = sound.get('filename')
        if filename and filename not in all_files:
            missing_files.append({
                'id': sound.get('id'),
                'name': sound.get('name'),
                'filename': filename
            })
    
    # Print missing files results
    if missing_files:
        print(f"\nFound {len(missing_files)} JSON entries with missing sound files:")
        for sound in missing_files:
            print(f"  ID: {sound['id']}, Name: {sound['name']}, Missing file: {sound['filename']}")
    else:
        print("\nAll JSON sound entries have corresponding files on disk.")
    
    if not unused_files and not missing_files:
        return
    
    # Step 6: Delete the unused files
    delete_mode = len(sys.argv) > 1 and sys.argv[1] == '--delete'
    
    if not delete_mode:
        # Just list the files that would be deleted
        print("\nFiles that would be deleted (run with --delete to actually delete):")
        for file in unused_files:
            print(f"  {file}")
        return
    
    # Actually delete the files
    deleted_count = 0
    for file in unused_files:
        file_path = os.path.join(sounds_dir, file)
        try:
            os.remove(file_path)
            deleted_count += 1
            print(f"  Deleted: {file}")
        except Exception as e:
            print(f"  Error deleting {file}: {e}")
    
    print(f"Successfully deleted {deleted_count} unused sound files.")
    
    # Output JSON summary for easier parsing by Node.js
    summary = {
        "unused_files_count": len(unused_files),
        "missing_files_count": len(missing_files),
        "unused_files": unused_files,
        "missing_files": missing_files
    }
    
    print("\n##SUMMARY_JSON##")
    print(json.dumps(summary))
    print("##END_SUMMARY##")

if __name__ == "__main__":
    cleanup_sounds()
