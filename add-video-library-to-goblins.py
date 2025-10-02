#!/usr/bin/env python3
"""
Add video library endpoints to goblin servers
"""

import subprocess
import sys

GOBLINS = [
    {"ip": "192.168.8.160", "name": "Goblin 1"},
    {"ip": "192.168.8.161", "name": "Goblin 2"}
]

PASSWORD = "klrklr89!"

# Code to add - helper method
HELPER_METHOD = """
  /**
   * Scan video directory recursively
   */
  async scanVideoDirectory(dir, category = '') {
    const videos = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const subVideos = await this.scanVideoDirectory(fullPath, entry.name);
          videos.push(...subVideos);
        } else if (entry.isFile() && /\\.(mp4|avi|mkv|mov)$/i.test(entry.name)) {
          const stats = await fs.stat(fullPath);
          const relativePath = fullPath.replace(path.join(__dirname, 'media', 'video') + path.sep, '');
          videos.push({
            name: entry.name,
            path: relativePath,
            category: category,
            size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
            modified: stats.mtime
          });
        }
      }
    } catch (error) {
      console.error('Error scanning video directory:', error);
    }
    return videos;
  }

"""

# Code to add - routes
ROUTES_CODE = """
    // Video Library - serve local video library via web interface
    this.app.get('/video-library/api/videos', async (req, res) => {
      try {
        const videoDir = path.join(__dirname, 'media', 'video');
        const videos = await this.scanVideoDirectory(videoDir);
        
        res.json({
          success: true,
          videos: videos,
          count: videos.length,
          goblinId: this.goblinId
        });
      } catch (error) {
        console.error('Error getting video list:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

"""

def run_ssh(ip, command):
    """Run SSH command on goblin"""
    full_cmd = f"sshpass -p '{PASSWORD}' ssh -o StrictHostKeyChecking=no remote@{ip} \"{command}\""
    result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True)
    return result.stdout, result.stderr, result.returncode

def add_to_goblin(goblin):
    """Add video library to a goblin"""
    ip = goblin["ip"]
    name = goblin["name"]
    
    print(f"\\n📡 Processing {name} ({ip})...")
    
    # Check if already has the endpoint
    stdout, stderr, code = run_ssh(ip, "grep -c 'video-library/api/videos' /home/remote/goblin/server.js 2>/dev/null || echo 0")
    count = stdout.strip()
    if count != "0" and count != "":
        try:
            if int(count) > 0:
                print(f"✅ {name} already has video library endpoints")
                return True
        except:
            pass
    
    print(f"📝 Adding video library to {name}...")
    
    # Backup
    print(f"💾 Creating backup...")
    run_ssh(ip, "cp /home/remote/goblin/server.js /home/remote/goblin/server.js.backup-$(date +%Y%m%d-%H%M%S)")
    
    # Download the file
    print(f"📥 Downloading server.js...")
    subprocess.run(f"sshpass -p '{PASSWORD}' scp remote@{ip}:/home/remote/goblin/server.js /tmp/goblin-{ip}-server.js", 
                   shell=True, capture_output=True)
    
    # Read the file
    with open(f"/tmp/goblin-{ip}-server.js", "r") as f:
        content = f.read()
    
    # Find insertion points
    # Add helper method before handleMonsterBoxConnection
    if "scanVideoDirectory" not in content:
        marker = "  /**\n   * Handle connection to MonsterBox\n   */"
        if marker in content:
            content = content.replace(marker, HELPER_METHOD + marker)
            print(f"✅ Added scanVideoDirectory helper method")
        else:
            print(f"⚠️  Could not find insertion point for helper method")
            return False
    
    # Add routes before "Status and monitoring"
    if "/video-library/api/videos" not in content:
        marker = "    // Status and monitoring"
        if marker in content:
            content = content.replace(marker, ROUTES_CODE + marker)
            print(f"✅ Added video library routes")
        else:
            print(f"⚠️  Could not find insertion point for routes")
            return False
    
    # Write back
    with open(f"/tmp/goblin-{ip}-server.js", "w") as f:
        f.write(content)
    
    # Upload
    print(f"📤 Uploading modified server.js...")
    subprocess.run(f"sshpass -p '{PASSWORD}' scp /tmp/goblin-{ip}-server.js remote@{ip}:/home/remote/goblin/server.js",
                   shell=True, capture_output=True)
    
    # Restart service
    print(f"🔄 Restarting goblin service...")
    run_ssh(ip, "sudo systemctl restart goblin")
    
    print(f"✅ {name} updated successfully!")
    return True

def main():
    print("🎃 Adding Video Library endpoints to Goblin servers...")
    
    success_count = 0
    for goblin in GOBLINS:
        if add_to_goblin(goblin):
            success_count += 1
    
    print(f"\\n🎉 Updated {success_count}/{len(GOBLINS)} goblins!")
    print("\\n📺 Access the video libraries at:")
    for goblin in GOBLINS:
        print(f"   {goblin['name']}: http://{goblin['ip']}:3001/video-library/api/videos")
    print("\\n✅ Done!")

if __name__ == "__main__":
    main()

