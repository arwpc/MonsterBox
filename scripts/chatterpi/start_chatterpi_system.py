#!/usr/bin/env python3
"""
ChatterPi System Startup Script
Starts all ChatterPi services in the correct order
"""

import subprocess
import time
import sys
import os
import signal
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ChatterPiSystemManager:
    """Manages the ChatterPi system services"""
    
    def __init__(self, project_root="/home/remote/MonsterBox"):
        self.project_root = Path(project_root)
        self.scripts_dir = self.project_root / "scripts" / "chatterpi"
        self.processes = {}
        self.running = True
        
        # Setup signal handlers
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
    
    def signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info(f"Received signal {signum}, shutting down...")
        self.running = False
        self.stop_all_services()
        sys.exit(0)
    
    def log(self, message):
        """Log with timestamp"""
        logger.info(message)
    
    def run_command(self, command, cwd=None, background=False):
        """Run a command"""
        try:
            if background:
                process = subprocess.Popen(
                    command,
                    shell=True,
                    cwd=cwd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    preexec_fn=os.setsid if os.name != 'nt' else None
                )
                return process
            else:
                result = subprocess.run(
                    command,
                    shell=True,
                    cwd=cwd,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                return result.returncode == 0, result.stdout, result.stderr
        except Exception as e:
            logger.error(f"Command failed: {e}")
            return False, "", str(e)
    
    def check_port(self, port):
        """Check if a port is in use"""
        success, stdout, stderr = self.run_command(f"netstat -tln | grep :{port}")
        return success and f":{port}" in stdout
    
    def kill_existing_processes(self):
        """Kill any existing ChatterPi processes"""
        self.log("🔄 Stopping existing ChatterPi processes...")
        
        # Kill processes by name
        processes_to_kill = [
            "jaw_websocket_server",
            "minimal_jaw_server",
            "ai_websocket_bridge"
        ]
        
        for process_name in processes_to_kill:
            self.run_command(f"pkill -f {process_name}")
        
        # Kill processes by port
        ports_to_clear = [8765, 8766]
        for port in ports_to_clear:
            self.run_command(f"fuser -k {port}/tcp")
        
        time.sleep(2)
        self.log("✅ Existing processes stopped")
    
    def start_main_app(self):
        """Start the main MonsterBox application"""
        self.log("🚀 Starting MonsterBox main application...")
        
        # Check if already running
        if self.check_port(3000):
            self.log("✅ MonsterBox app already running on port 3000")
            return True
        
        # Start the main app
        process = self.run_command(
            "nohup node --no-deprecation app.js > app.log 2>&1 &",
            cwd=self.project_root,
            background=True
        )
        
        if process:
            self.processes['main_app'] = process
            
            # Wait for startup
            for i in range(10):
                time.sleep(1)
                if self.check_port(3000):
                    self.log("✅ MonsterBox app started successfully")
                    return True
            
            self.log("❌ MonsterBox app failed to start")
            return False
        
        return False
    
    def start_jaw_server(self):
        """Start the jaw WebSocket server"""
        self.log("🦴 Starting Jaw WebSocket Server...")
        
        # Use minimal jaw server for testing
        jaw_script = self.scripts_dir / "minimal_jaw_server.py"
        
        if not jaw_script.exists():
            self.log(f"❌ Jaw server script not found: {jaw_script}")
            return False
        
        process = self.run_command(
            f"python3 {jaw_script} --host 0.0.0.0 --port 8765",
            cwd=self.scripts_dir,
            background=True
        )
        
        if process:
            self.processes['jaw_server'] = process
            
            # Wait for startup
            for i in range(10):
                time.sleep(1)
                if self.check_port(8765):
                    self.log("✅ Jaw WebSocket Server started successfully")
                    return True
            
            self.log("❌ Jaw WebSocket Server failed to start")
            return False
        
        return False
    
    def start_ai_bridge(self):
        """Start the AI WebSocket bridge"""
        self.log("🤖 Starting AI WebSocket Bridge...")
        
        ai_script = self.scripts_dir / "ai_websocket_bridge.py"
        
        if not ai_script.exists():
            self.log(f"❌ AI bridge script not found: {ai_script}")
            return False
        
        process = self.run_command(
            f"python3 {ai_script} --host 0.0.0.0 --port 8766 --jaw-host localhost --jaw-port 8765",
            cwd=self.scripts_dir,
            background=True
        )
        
        if process:
            self.processes['ai_bridge'] = process
            
            # Wait for startup
            for i in range(10):
                time.sleep(1)
                if self.check_port(8766):
                    self.log("✅ AI WebSocket Bridge started successfully")
                    return True
            
            self.log("❌ AI WebSocket Bridge failed to start")
            return False
        
        return False
    
    def check_system_health(self):
        """Check if all services are running"""
        services = {
            "MonsterBox App": 3000,
            "Jaw WebSocket": 8765,
            "AI Bridge": 8766
        }
        
        all_healthy = True
        self.log("🔍 Checking system health...")
        
        for service_name, port in services.items():
            if self.check_port(port):
                self.log(f"✅ {service_name}: Running on port {port}")
            else:
                self.log(f"❌ {service_name}: Not responding on port {port}")
                all_healthy = False
        
        return all_healthy
    
    def show_access_info(self):
        """Show access information"""
        self.log("=" * 60)
        self.log("🎉 ChatterPi System Started Successfully!")
        self.log("=" * 60)
        self.log("🌐 Access URLs:")
        self.log("   Main MonsterBox: http://192.168.8.130:3000")
        self.log("   ChatterPi Basic: http://192.168.8.130:3000/chatterpi-chat.html")
        self.log("   ChatterPi AI: http://192.168.8.130:3000/chatterpi-ai-chat.html")
        self.log("")
        self.log("🔌 WebSocket Endpoints:")
        self.log("   Jaw Control: ws://192.168.8.130:8765")
        self.log("   AI Bridge: ws://192.168.8.130:8766")
        self.log("")
        self.log("🎯 Features Available:")
        self.log("   ✅ Real-time jaw animation")
        self.log("   ✅ Servo selection (GPIO 18, 19, 20, 21)")
        self.log("   ✅ Character voices (Count Orlok, RoboChat, Captain Blackbeard)")
        self.log("   ✅ Audio synthesis with jaw synchronization")
        self.log("   ✅ AI conversation with jaw animation")
        self.log("=" * 60)
    
    def stop_all_services(self):
        """Stop all running services"""
        self.log("🛑 Stopping all ChatterPi services...")
        
        for service_name, process in self.processes.items():
            try:
                if process and process.poll() is None:
                    self.log(f"Stopping {service_name}...")
                    os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                    process.wait(timeout=5)
            except Exception as e:
                self.log(f"Error stopping {service_name}: {e}")
        
        self.processes.clear()
        self.log("✅ All services stopped")
    
    def start_system(self):
        """Start the complete ChatterPi system"""
        self.log("🎯 Starting ChatterPi System...")
        self.log("=" * 60)
        
        # Kill existing processes
        self.kill_existing_processes()
        
        # Start services in order
        if not self.start_main_app():
            self.log("❌ Failed to start main application")
            return False
        
        if not self.start_jaw_server():
            self.log("❌ Failed to start jaw server")
            return False
        
        if not self.start_ai_bridge():
            self.log("❌ Failed to start AI bridge")
            return False
        
        # Final health check
        if self.check_system_health():
            self.show_access_info()
            return True
        else:
            self.log("❌ System health check failed")
            return False
    
    def monitor_system(self):
        """Monitor the system and restart services if needed"""
        self.log("👁️ Monitoring system (Ctrl+C to stop)...")
        
        try:
            while self.running:
                time.sleep(30)  # Check every 30 seconds
                
                if not self.check_system_health():
                    self.log("⚠️ System health check failed, attempting restart...")
                    self.start_system()
                
        except KeyboardInterrupt:
            self.log("Monitoring stopped by user")

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="ChatterPi System Manager")
    parser.add_argument("--project-root", default="/home/remote/MonsterBox", help="Project root directory")
    parser.add_argument("--monitor", action="store_true", help="Monitor and restart services")
    
    args = parser.parse_args()
    
    manager = ChatterPiSystemManager(args.project_root)
    
    if manager.start_system():
        if args.monitor:
            manager.monitor_system()
        else:
            logger.info("System started successfully. Use --monitor to keep running.")
    else:
        logger.error("Failed to start ChatterPi system")
        sys.exit(1)

if __name__ == "__main__":
    main()
