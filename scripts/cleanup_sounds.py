#!/usr/bin/env python3

import json
import os
import sys

def main():
    # Path to sounds directory and sounds.json
    sounds_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'sounds')
    sounds_json = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'sounds.json')
    
    # Load sounds data
    try:
        with open(sounds_json, 'r', encoding='utf-8') as f:
            sounds_data = json.load(f)
    except UnicodeDecodeError:
        # Try with a different encoding if UTF-8 fails
        try:
            with open(sounds_json, 'r', encoding='latin-1') as f:
                sounds_data = json.load(f)
        except Exception as e:
            print(f"Error reading sounds.json with latin-1 encoding: {e}")
            return 1
    except Exception as e:
        print(f"Error reading sounds.json: {e}")
        return 1
    
    # Extract filenames from sounds.json
    used_filenames = set()
    for sound in sounds_data:
        if 'filename' in sound and sound['filename']:
            used_filenames.add(sound['filename'])
        if 'file' in sound and sound['file']:
            used_filenames.add(sound['file'])
    
    print(f"Found {len(used_filenames)} sound files referenced in sounds.json")
    
    # List all files in sounds directory
    all_sound_files = set()
    try:
        all_sound_files = set(os.listdir(sounds_dir))
    except Exception as e:
        print(f"Error listing sound files directory: {e}")
        return 1
    
    print(f"Found {len(all_sound_files)} files in the sounds directory")
    
    # Find unused sound files
    unused_files = all_sound_files - used_filenames
    
    # Print the results
    if len(unused_files) == 0:
        print("No unused sound files found!")
        return 0
    
    print(f"\nFound {len(unused_files)} unused sound files that can be deleted:")
    for file in sorted(unused_files):
        file_path = os.path.join(sounds_dir, file)
        file_size = os.path.getsize(file_path) / 1024  # size in KB
        print(f"- {file} ({file_size:.1f} KB)")
    
    # Ask to delete files
    if not sys.argv[-1] == "--delete":
        print("\nTo delete these files, run again with --delete flag")
        return 0
    
    # Delete the unused files
    print("\nDeleting unused sound files...")
    deleted_count = 0
    for file in unused_files:
        try:
            os.remove(os.path.join(sounds_dir, file))
            print(f"Deleted: {file}")
            deleted_count += 1
        except Exception as e:
            print(f"Error deleting {file}: {e}")
    
    print(f"\nDeleted {deleted_count} unused sound files.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
