#!/usr/bin/env python3
"""
SSL Configuration Module for ChatterPi WebSocket Services
Provides SSL certificate loading and WebSocket SSL context creation
"""

import ssl
import json
import os
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

class SSLConfig:
    """SSL configuration manager for ChatterPi services"""
    
    def __init__(self, config_path: str = "/etc/ssl/monsterbox/ssl-config.json"):
        self.config_path = config_path
        self.ssl_config = None
        self.ssl_context = None
        self.is_available = False
        
        self.load_ssl_config()
    
    def load_ssl_config(self) -> bool:
        """Load SSL configuration from file"""
        try:
            if not os.path.exists(self.config_path):
                logger.warning(f"SSL config file not found: {self.config_path}")
                return False
            
            with open(self.config_path, 'r') as f:
                self.ssl_config = json.load(f)
            
            # Validate required fields
            required_fields = ['certificates', 'https']
            for field in required_fields:
                if field not in self.ssl_config:
                    logger.error(f"Missing required SSL config field: {field}")
                    return False
            
            cert_config = self.ssl_config['certificates']
            required_cert_fields = ['key', 'cert']
            for field in required_cert_fields:
                if field not in cert_config:
                    logger.error(f"Missing required certificate field: {field}")
                    return False
            
            # Check if certificate files exist
            key_file = cert_config['key']
            cert_file = cert_config['cert']
            
            if not os.path.exists(key_file):
                logger.error(f"SSL private key file not found: {key_file}")
                return False
            
            if not os.path.exists(cert_file):
                logger.error(f"SSL certificate file not found: {cert_file}")
                return False
            
            logger.info("✅ SSL configuration loaded successfully")
            self.is_available = True
            return True
            
        except Exception as e:
            logger.error(f"Error loading SSL configuration: {e}")
            return False
    
    def create_ssl_context(self) -> Optional[ssl.SSLContext]:
        """Create SSL context for WebSocket servers"""
        if not self.is_available:
            return None
        
        try:
            # Create SSL context
            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            
            # Load certificate and private key
            cert_config = self.ssl_config['certificates']
            ssl_context.load_cert_chain(
                certfile=cert_config['cert'],
                keyfile=cert_config['key']
            )
            
            # Configure SSL settings for WebSocket
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            
            # Set cipher suites (optional, for better security)
            ssl_context.set_ciphers('ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS')
            
            self.ssl_context = ssl_context
            logger.info("✅ SSL context created successfully")
            return ssl_context
            
        except Exception as e:
            logger.error(f"Error creating SSL context: {e}")
            return None
    
    def get_ssl_context(self) -> Optional[ssl.SSLContext]:
        """Get SSL context, creating it if necessary"""
        if self.ssl_context is None and self.is_available:
            return self.create_ssl_context()
        return self.ssl_context
    
    def get_wss_port(self, default_port: int = 8765) -> int:
        """Get WSS port from configuration"""
        if not self.is_available:
            return default_port

        # Use different ports for WSS to avoid conflicts
        if default_port == 8765:  # Jaw server
            return 8865  # WSS port for jaw server
        elif default_port == 8766:  # AI bridge
            return 8866  # WSS port for AI bridge
        elif default_port == 8090:  # Chat server
            return 8493  # WSS port for chat server
        else:
            # For other services, use port + 100
            return default_port + 100
    
    def get_device_name(self) -> str:
        """Get device name from SSL configuration"""
        if not self.is_available:
            return "unknown"
        return self.ssl_config.get('device', 'unknown')
    
    def is_ssl_enabled(self) -> bool:
        """Check if SSL is enabled and available"""
        return self.is_available and self.ssl_config is not None
    
    def get_certificate_info(self) -> Dict[str, Any]:
        """Get certificate information"""
        if not self.is_available:
            return {}
        
        try:
            import subprocess
            cert_file = self.ssl_config['certificates']['cert']
            
            # Get certificate details using openssl
            result = subprocess.run([
                'openssl', 'x509', '-in', cert_file, '-text', '-noout'
            ], capture_output=True, text=True)
            
            if result.returncode == 0:
                output = result.stdout
                
                # Extract basic information
                info = {
                    'file': cert_file,
                    'device': self.get_device_name(),
                    'ssl_enabled': True
                }
                
                # Extract subject
                for line in output.split('\n'):
                    if 'Subject:' in line:
                        info['subject'] = line.strip()
                    elif 'Not After :' in line:
                        info['expires'] = line.strip()
                    elif 'DNS:' in line or 'IP Address:' in line:
                        if 'alt_names' not in info:
                            info['alt_names'] = []
                        info['alt_names'].append(line.strip())
                
                return info
            else:
                logger.error(f"Error getting certificate info: {result.stderr}")
                return {'error': 'Failed to read certificate'}
                
        except Exception as e:
            logger.error(f"Error getting certificate info: {e}")
            return {'error': str(e)}
    
    def __str__(self) -> str:
        """String representation of SSL config"""
        if self.is_available:
            device = self.get_device_name()
            return f"SSLConfig(device={device}, enabled=True)"
        else:
            return "SSLConfig(enabled=False)"

# Global SSL configuration instance
_ssl_config_instance = None

def get_ssl_config() -> SSLConfig:
    """Get global SSL configuration instance"""
    global _ssl_config_instance
    if _ssl_config_instance is None:
        _ssl_config_instance = SSLConfig()
    return _ssl_config_instance

def create_secure_websocket_server(handler, host: str, port: int, ssl_port: int = None):
    """Create WebSocket server with optional SSL support"""
    import websockets
    
    ssl_config = get_ssl_config()
    
    servers = []
    
    # Always create regular WebSocket server
    logger.info(f"Creating WebSocket server on ws://{host}:{port}")
    
    # Create SSL WebSocket server if available
    if ssl_config.is_ssl_enabled():
        ssl_context = ssl_config.get_ssl_context()
        if ssl_context:
            if ssl_port is None:
                ssl_port = ssl_config.get_wss_port(port)
            
            logger.info(f"Creating secure WebSocket server on wss://{host}:{ssl_port}")
            
            return {
                'ws_server': websockets.serve(handler, host, port, ping_interval=30, ping_timeout=10),
                'wss_server': websockets.serve(handler, host, ssl_port, ssl=ssl_context, ping_interval=30, ping_timeout=10),
                'ssl_enabled': True,
                'ws_port': port,
                'wss_port': ssl_port
            }
    
    # Return only regular WebSocket server
    return {
        'ws_server': websockets.serve(handler, host, port, ping_interval=30, ping_timeout=10),
        'wss_server': None,
        'ssl_enabled': False,
        'ws_port': port,
        'wss_port': None
    }

async def start_websocket_servers(server_config):
    """Start both WebSocket and secure WebSocket servers"""
    import asyncio
    
    servers = []
    
    # Start regular WebSocket server
    ws_server = await server_config['ws_server']
    servers.append(ws_server)
    logger.info(f"✅ WebSocket server started on port {server_config['ws_port']}")
    
    # Start secure WebSocket server if available
    if server_config['wss_server']:
        wss_server = await server_config['wss_server']
        servers.append(wss_server)
        logger.info(f"🔐 Secure WebSocket server started on port {server_config['wss_port']}")
    
    return servers

if __name__ == "__main__":
    # Test SSL configuration
    ssl_config = get_ssl_config()
    print(f"SSL Config: {ssl_config}")
    
    if ssl_config.is_ssl_enabled():
        print("Certificate Info:")
        cert_info = ssl_config.get_certificate_info()
        for key, value in cert_info.items():
            print(f"  {key}: {value}")
    else:
        print("SSL not available")
