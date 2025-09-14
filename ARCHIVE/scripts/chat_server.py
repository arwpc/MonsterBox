#!/usr/bin/env python3
"""
ChatterPi Chat Server
Simple HTTP server to serve the chat interface
"""

import http.server
import socketserver
import os
import logging
import threading
import time
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ChatterPiHTTPHandler(http.server.SimpleHTTPRequestHandler):
    """Custom HTTP handler for ChatterPi chat interface"""
    
    def __init__(self, *args, **kwargs):
        # Set the directory to serve files from
        super().__init__(*args, directory="/home/remote/MonsterBox/public", **kwargs)
    
    def end_headers(self):
        # Add CORS headers for WebSocket connections
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_GET(self):
        # Redirect root to chat interface
        if self.path == '/':
            self.path = '/chatterpi-chat.html'
        
        return super().do_GET()
    
    def log_message(self, format, *args):
        # Custom logging format
        logger.info(f"{self.address_string()} - {format % args}")

class ChatterPiChatServer:
    """HTTP server for ChatterPi chat interface"""
    
    def __init__(self, host="0.0.0.0", port=8090):
        self.host = host
        self.port = port
        self.httpd = None
        self.server_thread = None
        self.is_running = False
        
        logger.info(f"ChatterPi Chat Server initialized on {host}:{port}")
    
    def start(self):
        """Start the HTTP server"""
        try:
            # Create server
            self.httpd = socketserver.TCPServer((self.host, self.port), ChatterPiHTTPHandler)
            self.httpd.allow_reuse_address = True
            
            logger.info(f"🚀 Starting ChatterPi Chat Server on http://{self.host}:{self.port}")
            logger.info(f"📱 Chat interface available at: http://192.168.8.130:{self.port}")
            
            self.is_running = True
            
            # Start server in a separate thread
            self.server_thread = threading.Thread(target=self.httpd.serve_forever)
            self.server_thread.daemon = True
            self.server_thread.start()
            
            logger.info("✅ ChatterPi Chat Server started successfully")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to start server: {e}")
            return False
    
    def stop(self):
        """Stop the HTTP server"""
        if self.httpd:
            logger.info("🛑 Stopping ChatterPi Chat Server...")
            self.httpd.shutdown()
            self.httpd.server_close()
            
            if self.server_thread:
                self.server_thread.join(timeout=5)
            
            self.is_running = False
            logger.info("✅ ChatterPi Chat Server stopped")
    
    def get_status(self):
        """Get server status"""
        return {
            "running": self.is_running,
            "host": self.host,
            "port": self.port,
            "url": f"http://{self.host}:{self.port}",
            "public_url": f"http://192.168.8.130:{self.port}"
        }

def main():
    """Main function to run the chat server"""
    import argparse
    import signal
    import sys
    
    parser = argparse.ArgumentParser(description="ChatterPi Chat Server")
    parser.add_argument("--host", default="0.0.0.0", help="Server host")
    parser.add_argument("--port", type=int, default=8090, help="Server port")
    
    args = parser.parse_args()
    
    # Create server
    server = ChatterPiChatServer(host=args.host, port=args.port)
    
    # Handle Ctrl+C gracefully
    def signal_handler(sig, frame):
        logger.info("Received interrupt signal")
        server.stop()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Start server
    if server.start():
        try:
            # Keep server running
            while server.is_running:
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("Server interrupted by user")
        finally:
            server.stop()
    else:
        logger.error("Failed to start server")
        sys.exit(1)

if __name__ == "__main__":
    main()
