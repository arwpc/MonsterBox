#!/usr/bin/env python3
"""
Wait for Goblin2 to reboot and complete setup
"""
import paramiko
import time
import requests
import os
from scp import SCPClient

GOBLIN2_IP = '192.168.8.106'
PASSWORD = 'klrklr89!'

def wait_for_ssh():
    """Wait for SSH to become available"""
    print("🔄 Waiting for Goblin2 to reboot...")
    
    while True:
        try:
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(GOBLIN2_IP, username='remote', password=PASSWORD, timeout=5)
            client.close()
            print("✅ Goblin2 is back online!")
            return True
        except:
            time.sleep(5)

def install_node():
    """Install Node.js"""
    print("\n=== Installing Node.js ===")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(GOBLIN2_IP, username='remote', password=PASSWORD, timeout=10)
    
    # Check disk space
    stdin, stdout, stderr = client.exec_command('df -h /')
    print("Disk space:")
    print(stdout.read().decode())
    
    # Install Node.js
    print("\nInstalling Node.js (this may take a minute)...")
    stdin, stdout, stderr = client.exec_command(
        'echo "klrklr89!" | sudo -S apt update && echo "klrklr89!" | sudo -S apt install -y nodejs npm',
        get_pty=True
    )
    exit_status = stdout.channel.recv_exit_status()
    
    if exit_status == 0:
        print("✅ Node.js installed!")
        stdin, stdout, stderr = client.exec_command('node --version && npm --version')
        print(stdout.read().decode())
    else:
        print("❌ Installation failed")
        return False
    
    client.close()
    return True

def deploy_goblin():
    """Deploy Goblin system using facehugger"""
    print("\n=== Deploying Goblin system ===")
    
    response = requests.post(
        'http://localhost:3000/goblin-management/api/deploy-and-register',
        json={
            'goblinData': {
                'goblinId': 'goblin-two',
                'endpoint': f'http://{GOBLIN2_IP}:3001',
                'capabilities': ['video', 'audio'],
                'metadata': {
                    'name': 'Goblin Two',
                    'location': 'Halloween Display',
                    'description': 'Video display goblin'
                }
            },
            'sshPassword': PASSWORD
        },
        stream=True,
        timeout=180
    )
    
    for line in response.iter_lines():
        if line:
            line_str = line.decode('utf-8')
            if line_str.startswith('data: '):
                print(line_str[6:])
    
    return True

def copy_videos():
    """Copy videos to Goblin2"""
    print("\n=== Copying videos ===")
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(GOBLIN2_IP, username='remote', password=PASSWORD, timeout=10)
    
    scp = SCPClient(client.get_transport())
    
    video_dir = '/home/remote/MonsterBox/data/goblin-videos'
    for video in os.listdir(video_dir):
        if video.endswith('.mp4'):
            local_path = os.path.join(video_dir, video)
            print(f"Copying {video}...")
            scp.put(local_path, '/home/remote/goblin/media/video/')
    
    scp.close()
    client.close()
    print("✅ All videos copied!")

def start_fire():
    """Start fire video on loop"""
    print("\n=== Starting FIRE 🔥 ===")
    
    response = requests.post(
        f'http://{GOBLIN2_IP}:3001/play-video',
        json={
            'filename': 'c1efa5eb-4ff4-4112-9c84-15d99f6ec955.mp4',
            'loop': True
        },
        timeout=10
    )
    
    result = response.json()
    if result.get('success'):
        print("🔥🔥🔥 GOBLIN2 IS PLAYING FIRE! 🔥🔥🔥")
        return True
    else:
        print(f"❌ Failed to start video: {result}")
        return False

def main():
    print("🎃 Goblin2 Setup Script 🎃")
    print(f"Target: {GOBLIN2_IP}")
    print()
    
    # Wait for reboot
    wait_for_ssh()
    time.sleep(5)  # Give it a moment to fully boot
    
    # Install Node.js
    if not install_node():
        print("❌ Failed to install Node.js")
        return
    
    # Deploy Goblin system
    deploy_goblin()
    time.sleep(5)
    
    # Copy videos
    copy_videos()
    
    # Start fire
    start_fire()
    
    print("\n🎃 GOBLIN2 SETUP COMPLETE! 🎃")
    print("\nAll Goblins Status:")
    print("  Goblin1 (192.168.8.40): 🔥 FIRE")
    print("  Goblin2 (192.168.8.106): 🔥 FIRE")
    print("  Goblin3 (192.168.8.14): 🔥 FIRE")

if __name__ == '__main__':
    main()

