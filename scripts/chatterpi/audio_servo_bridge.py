#!/usr/bin/env python3
"""
Audio-Servo Bridge for ChatterPi
Connects existing Node.js audio analysis system with Python lgpio servo control
"""

import asyncio
import websockets
import json
import logging
import threading
import time
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass
from jaw_control_system import JawControlSystem

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class AudioData:
    """Audio analysis data from Node.js system"""
    raw_volume: float
    smoothed_volume: float
    peak_volume: float
    timestamp: int
    servo_position: Optional[float] = None

class AudioServoBridge:
    """Bridge between Node.js audio analysis and Python servo control"""
    
    def __init__(self, websocket_url: str = "ws://localhost:3000", servo_pin: int = 18):
        self.websocket_url = websocket_url
        self.servo_pin = servo_pin
        
        # Components
        self.jaw_control = None
        self.websocket = None
        
        # State
        self.is_connected = False
        self.is_running = False
        self.last_audio_data = None
        self.volume_to_angle_mapping = {
            "min_volume": 0.0,
            "max_volume": 1.0,
            "min_angle": 0.0,
            "max_angle": 45.0,
            "curve_type": "linear",
            "smoothing_factor": 0.8
        }
        
        # Statistics
        self.stats = {
            "messages_received": 0,
            "servo_commands_sent": 0,
            "connection_errors": 0,
            "last_update": 0,
            "average_latency": 0.0
        }
        
        # Threading
        self.bridge_thread = None
        self.stop_event = threading.Event()
        
        logger.info(f"Audio-Servo Bridge initialized")
        logger.info(f"WebSocket URL: {self.websocket_url}")
        logger.info(f"Servo Pin: {self.servo_pin}")
    
    def initialize(self) -> bool:
        """Initialize the bridge components"""
        try:
            # Initialize jaw control system
            self.jaw_control = JawControlSystem(pin=self.servo_pin)
            if not self.jaw_control.initialize():
                logger.error("Failed to initialize jaw control system")
                return False
            
            logger.info("✅ Audio-Servo Bridge initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"❌ Bridge initialization failed: {e}")
            return False
    
    def start(self) -> bool:
        """Start the bridge in a separate thread"""
        if self.is_running:
            logger.warning("Bridge already running")
            return True
        
        if not self.jaw_control:
            logger.error("Bridge not initialized")
            return False
        
        try:
            self.is_running = True
            self.stop_event.clear()
            
            # Start bridge thread
            self.bridge_thread = threading.Thread(target=self._run_bridge_loop)
            self.bridge_thread.daemon = True
            self.bridge_thread.start()
            
            logger.info("🚀 Audio-Servo Bridge started")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to start bridge: {e}")
            self.is_running = False
            return False
    
    def stop(self):
        """Stop the bridge"""
        if not self.is_running:
            return
        
        logger.info("🛑 Stopping Audio-Servo Bridge...")
        
        self.is_running = False
        self.stop_event.set()
        
        if self.bridge_thread and self.bridge_thread.is_alive():
            self.bridge_thread.join(timeout=5.0)
        
        if self.jaw_control:
            self.jaw_control.cleanup()
        
        logger.info("✅ Audio-Servo Bridge stopped")
    
    def _run_bridge_loop(self):
        """Main bridge loop (runs in separate thread)"""
        while self.is_running and not self.stop_event.is_set():
            try:
                # Run async WebSocket client
                asyncio.run(self._websocket_client())
            except Exception as e:
                logger.error(f"Bridge loop error: {e}")
                self.stats["connection_errors"] += 1
                
                if self.is_running:
                    logger.info("Reconnecting in 5 seconds...")
                    time.sleep(5)
    
    async def _websocket_client(self):
        """WebSocket client for receiving audio data"""
        try:
            logger.info(f"Connecting to {self.websocket_url}...")
            
            async with websockets.connect(self.websocket_url) as websocket:
                self.websocket = websocket
                self.is_connected = True
                logger.info("✅ WebSocket connected")
                
                # Send initial configuration
                await self._send_config()
                
                # Listen for messages
                async for message in websocket:
                    if self.stop_event.is_set():
                        break
                    
                    await self._handle_message(message)
                    
        except websockets.exceptions.ConnectionClosed:
            logger.warning("WebSocket connection closed")
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
        finally:
            self.is_connected = False
            self.websocket = None
    
    async def _send_config(self):
        """Send configuration to Node.js system"""
        config = {
            "type": "bridge_config",
            "servo_pin": self.servo_pin,
            "mapping": self.volume_to_angle_mapping,
            "request_audio_data": True
        }
        
        try:
            await self.websocket.send(json.dumps(config))
            logger.info("📤 Configuration sent to Node.js system")
        except Exception as e:
            logger.error(f"Failed to send config: {e}")
    
    async def _handle_message(self, message: str):
        """Handle incoming WebSocket message"""
        try:
            data = json.loads(message)
            message_type = data.get("type", "unknown")
            
            if message_type == "volumeUpdate":
                await self._handle_volume_update(data)
            elif message_type == "audioData":
                await self._handle_audio_data(data)
            elif message_type == "status":
                await self._handle_status_update(data)
            else:
                logger.debug(f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON message: {e}")
        except Exception as e:
            logger.error(f"Error handling message: {e}")
    
    async def _handle_volume_update(self, data: Dict[str, Any]):
        """Handle volume update from audio analyzer with REAL-TIME OPTIMIZATIONS"""
        try:
            # Extract volume data
            audio_data = AudioData(
                raw_volume=data.get("raw", 0.0),
                smoothed_volume=data.get("smoothed", 0.0),
                peak_volume=data.get("peak", 0.0),
                timestamp=data.get("timestamp", int(time.time() * 1000))
            )

            # Map volume to servo angle
            angle = self._map_volume_to_angle(audio_data.smoothed_volume)
            audio_data.servo_position = angle

            # Move servo with MINIMAL LATENCY
            if self.jaw_control and not self.jaw_control.emergency_stop:
                # REAL-TIME OPTIMIZATION: Use immediate movement (0.05s instead of 0.1s)
                self.jaw_control.move_to_angle(angle, duration=0.05, curve_type="linear")
                self.stats["servo_commands_sent"] += 1

            # Update statistics
            self.stats["messages_received"] += 1
            self.stats["last_update"] = time.time()
            self.last_audio_data = audio_data

            # Calculate latency
            current_time = int(time.time() * 1000)
            latency = current_time - audio_data.timestamp
            self.stats["average_latency"] = (self.stats["average_latency"] * 0.9) + (latency * 0.1)

            logger.debug(f"Volume: {audio_data.smoothed_volume:.3f} → Angle: {angle:.1f}° (latency: {latency}ms)")

        except Exception as e:
            logger.error(f"Error handling volume update: {e}")
    
    async def _handle_audio_data(self, data: Dict[str, Any]):
        """Handle raw audio data (if needed for advanced processing)"""
        # For now, we primarily use volume updates
        # This could be extended for more sophisticated audio analysis
        pass
    
    async def _handle_status_update(self, data: Dict[str, Any]):
        """Handle status updates from Node.js system"""
        logger.info(f"Node.js system status: {data}")
    
    def _map_volume_to_angle(self, volume: float) -> float:
        """Map audio volume to servo angle"""
        mapping = self.volume_to_angle_mapping
        
        # Clamp volume to valid range
        volume = max(mapping["min_volume"], min(mapping["max_volume"], volume))
        
        # Normalize volume (0.0 to 1.0)
        if mapping["max_volume"] > mapping["min_volume"]:
            normalized = (volume - mapping["min_volume"]) / (mapping["max_volume"] - mapping["min_volume"])
        else:
            normalized = 0.0
        
        # Apply curve
        if mapping["curve_type"] == "exponential":
            normalized = normalized ** 2
        elif mapping["curve_type"] == "logarithmic":
            normalized = normalized ** 0.5
        # Default is linear (no change)
        
        # Map to angle range
        angle_range = mapping["max_angle"] - mapping["min_angle"]
        angle = mapping["min_angle"] + (normalized * angle_range)
        
        return angle
    
    def get_status(self) -> Dict[str, Any]:
        """Get bridge status"""
        jaw_status = self.jaw_control.get_status() if self.jaw_control else {}
        
        return {
            "bridge": {
                "is_running": self.is_running,
                "is_connected": self.is_connected,
                "websocket_url": self.websocket_url
            },
            "jaw_control": jaw_status,
            "mapping": self.volume_to_angle_mapping,
            "statistics": self.stats,
            "last_audio_data": {
                "smoothed_volume": self.last_audio_data.smoothed_volume if self.last_audio_data else None,
                "servo_position": self.last_audio_data.servo_position if self.last_audio_data else None,
                "timestamp": self.last_audio_data.timestamp if self.last_audio_data else None
            } if self.last_audio_data else None
        }
    
    def update_mapping(self, new_mapping: Dict[str, Any]):
        """Update volume to angle mapping"""
        self.volume_to_angle_mapping.update(new_mapping)
        logger.info(f"Updated volume mapping: {self.volume_to_angle_mapping}")

def main():
    """Test the audio-servo bridge"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Audio-Servo Bridge")
    parser.add_argument("--websocket-url", default="ws://localhost:3000", 
                       help="WebSocket URL for Node.js audio system")
    parser.add_argument("--servo-pin", type=int, default=18, 
                       help="GPIO pin for servo")
    parser.add_argument("--test-mode", action="store_true", 
                       help="Run in test mode without WebSocket")
    
    args = parser.parse_args()
    
    # Create bridge
    bridge = AudioServoBridge(
        websocket_url=args.websocket_url,
        servo_pin=args.servo_pin
    )
    
    if not bridge.initialize():
        logger.error("Failed to initialize bridge")
        return False
    
    try:
        if args.test_mode:
            # Test mode - simulate audio data
            logger.info("Running in test mode...")
            
            # Test volume levels
            test_volumes = [0.0, 0.2, 0.5, 0.8, 1.0, 0.5, 0.0]
            
            for volume in test_volumes:
                angle = bridge._map_volume_to_angle(volume)
                logger.info(f"Test volume {volume:.1f} → angle {angle:.1f}°")
                
                if bridge.jaw_control:
                    bridge.jaw_control.move_to_angle(angle, 1.0)
                    while bridge.jaw_control.is_moving:
                        time.sleep(0.1)
                
                time.sleep(0.5)
        else:
            # Normal mode - connect to WebSocket
            logger.info("Starting bridge...")
            bridge.start()
            
            # Keep running until interrupted
            try:
                while bridge.is_running:
                    time.sleep(1)
                    
                    # Print status periodically
                    if bridge.stats["messages_received"] % 100 == 0 and bridge.stats["messages_received"] > 0:
                        status = bridge.get_status()
                        logger.info(f"Status: {bridge.stats['messages_received']} messages, "
                                  f"latency: {bridge.stats['average_latency']:.1f}ms")
                        
            except KeyboardInterrupt:
                logger.info("Interrupted by user")
        
        return True
        
    except Exception as e:
        logger.error(f"Bridge error: {e}")
        return False
        
    finally:
        bridge.stop()

if __name__ == "__main__":
    main()
