#!/usr/bin/env python3
"""
Add HTTP heartbeat functionality to goblin servers
This allows goblins to register as "online" with MonsterBox
"""

import subprocess
import sys

GOBLINS = [
    {"ip": "192.168.8.160", "name": "Goblin 1", "id": "goblin1"},
    {"ip": "192.168.8.161", "name": "Goblin 2", "id": "goblin2"}
]

PASSWORD = "klrklr89!"
MONSTERBOX_IP = "192.168.8.200"
MONSTERBOX_PORT = "3000"

# Code to add - heartbeat method
HEARTBEAT_METHOD = """
  /**
   * Send heartbeat to MonsterBox
   */
  async sendHeartbeat() {
    if (!this.monsterboxEndpoint) {
      return;
    }

    try {
      const response = await fetch(`${this.monsterboxEndpoint}/goblin-management/api/goblin/${this.goblinId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uptime: process.uptime(),
          memory: process.memoryUsage().heapUsed / 1024 / 1024,
          status: 'healthy'
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log(`💓 Heartbeat sent to MonsterBox`);
        }
      }
    } catch (error) {
      console.error(`❌ Heartbeat failed:`, error.message);
    }
  }

  /**
   * Start heartbeat interval
   */
  startHeartbeat() {
    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000);

    // Send initial heartbeat
    this.sendHeartbeat();
    console.log(`💓 Heartbeat started (30s interval)`);
  }

"""

# Code to add to constructor
CONSTRUCTOR_ADDITION = """
    this.monsterboxEndpoint = process.env.MONSTERBOX_ENDPOINT || 'http://""" + MONSTERBOX_IP + ":" + MONSTERBOX_PORT + """';
    this.heartbeatInterval = null;
"""

# Code to add to start() method - after beacon.start()
START_ADDITION = """
      
      // Start HTTP heartbeat to MonsterBox
      this.startHeartbeat();
"""

# Code to add to shutdown() method
SHUTDOWN_ADDITION = """
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
"""

def run_ssh(ip, command):
    """Run SSH command on goblin"""
    full_cmd = f"sshpass -p '{PASSWORD}' ssh -o StrictHostKeyChecking=no remote@{ip} \"{command}\""
    result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True)
    return result.stdout, result.stderr, result.returncode

def add_to_goblin(goblin):
    """Add heartbeat to a goblin"""
    ip = goblin["ip"]
    name = goblin["name"]
    goblin_id = goblin["id"]
    
    print(f"\\n📡 Processing {name} ({ip})...")
    
    # Check if already has heartbeat
    stdout, stderr, code = run_ssh(ip, "grep -c 'sendHeartbeat' /home/remote/goblin/server.js 2>/dev/null || echo 0")
    count = stdout.strip()
    if count != "0" and count != "":
        try:
            if int(count) > 0:
                print(f"✅ {name} already has heartbeat functionality")
                return True
        except:
            pass
    
    print(f"📝 Adding heartbeat to {name}...")
    
    # Backup
    print(f"💾 Creating backup...")
    run_ssh(ip, "cp /home/remote/goblin/server.js /home/remote/goblin/server.js.backup-heartbeat-$(date +%Y%m%d-%H%M%S)")
    
    # Download the file
    print(f"📥 Downloading server.js...")
    subprocess.run(f"sshpass -p '{PASSWORD}' scp remote@{ip}:/home/remote/goblin/server.js /tmp/goblin-{ip}-server.js", 
                   shell=True, capture_output=True)
    
    # Read the file
    with open(f"/tmp/goblin-{ip}-server.js", "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Add monsterboxEndpoint to constructor
    if "this.monsterboxEndpoint" not in content:
        marker = "    this.monsterboxHost = null;"
        if marker in content:
            content = content.replace(marker, marker + CONSTRUCTOR_ADDITION)
            print(f"✅ Added monsterboxEndpoint to constructor")
        else:
            print(f"⚠️  Could not find constructor marker")
            return False
    
    # 2. Add heartbeat methods before scanVideoDirectory
    if "sendHeartbeat" not in content:
        marker = "  /**\n   * Scan video directory recursively\n   */"
        if marker in content:
            content = content.replace(marker, HEARTBEAT_METHOD + marker)
            print(f"✅ Added heartbeat methods")
        else:
            print(f"⚠️  Could not find method insertion point")
            return False
    
    # 3. Add startHeartbeat() call in start() method
    if "this.startHeartbeat()" not in content:
        marker = "      this.beacon.start();"
        if marker in content:
            content = content.replace(marker, marker + START_ADDITION)
            print(f"✅ Added heartbeat start call")
        else:
            print(f"⚠️  Could not find start() method marker")
            return False
    
    # 4. Add cleanup in shutdown() method
    if "clearInterval(this.heartbeatInterval)" not in content:
        marker = "    this.beacon.stop();"
        if marker in content:
            content = content.replace(marker, marker + "\\n" + SHUTDOWN_ADDITION)
            print(f"✅ Added heartbeat cleanup")
        else:
            print(f"⚠️  Could not find shutdown() method marker")
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
    print("💓 Adding HTTP Heartbeat to Goblin servers...")
    print(f"   MonsterBox: {MONSTERBOX_IP}:{MONSTERBOX_PORT}")
    
    success_count = 0
    for goblin in GOBLINS:
        if add_to_goblin(goblin):
            success_count += 1
    
    print(f"\\n🎉 Updated {success_count}/{len(GOBLINS)} goblins!")
    print("\\n💓 Goblins will now send heartbeats every 30 seconds")
    print("   They should appear as 'online' in MonsterBox within 30 seconds")
    print("\\n✅ Done!")

if __name__ == "__main__":
    main()

