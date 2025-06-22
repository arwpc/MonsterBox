#!/usr/bin/env python3
"""
ChatterPi Web Jaw Bridge
Connects the existing ChatterPi web interface with our working jaw animation system
"""

import asyncio
import websockets
import json
import logging
import threading
import time
from typing import Dict, Any, Optional

from jaw_control_system import JawControlSystem
from audio_jaw_animator import AudioJawAnimator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ChatterPiWebBridge:
    """Bridge between web interface and jaw animation system"""
    
    def __init__(self, port: int = 8765):
        self.port = port
        self.jaw_control = None
        self.audio_animator = None
        self.connected_clients = set()
        self.is_running = False
        
        # Animation state
        self.animation_active = False
        self.current_character = "orlok"
        
        logger.info(f"ChatterPi Web Bridge initialized on port {port}")
    
    async def initialize(self) -> bool:
        """Initialize jaw control and audio animator"""
        try:
            logger.info("🚀 Initializing ChatterPi Web Bridge...")
            
            # Initialize jaw control with correct configuration
            self.jaw_control = JawControlSystem(
                pin=18, 
                min_pulse=500, 
                max_pulse=2400
            )
            
            if not self.jaw_control.initialize():
                logger.error("Failed to initialize jaw control")
                return False
            
            # Initialize audio animator
            self.audio_animator = AudioJawAnimator(
                jaw_control=self.jaw_control,
                volume_threshold=0.01,
                sensitivity=1.2
            )
            
            logger.info("✅ ChatterPi Web Bridge initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize bridge: {e}")
            return False
    
    async def handle_client(self, websocket, path):
        """Handle WebSocket client connections"""
        logger.info(f"🔌 Client connected from {websocket.remote_address}")
        self.connected_clients.add(websocket)
        
        try:
            # Send welcome message
            await websocket.send(json.dumps({
                "type": "welcome",
                "message": "Connected to ChatterPi Web Bridge",
                "jaw_config": {
                    "closed_angle": 50,
                    "open_angle": 30,
                    "pin": 18
                }
            }))
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.handle_message(websocket, data)
                except json.JSONDecodeError:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Invalid JSON"
                    }))
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": str(e)
                    }))
        
        except websockets.exceptions.ConnectionClosed:
            logger.info("🔌 Client disconnected")
        finally:
            self.connected_clients.discard(websocket)
    
    async def handle_message(self, websocket, data: Dict[str, Any]):
        """Handle incoming WebSocket messages"""
        message_type = data.get("type")

        if message_type == "jaw_move":
            await self.handle_jaw_move(websocket, data)
        elif message_type == "start_animation":
            await self.handle_start_animation(websocket, data)
        elif message_type == "stop_animation":
            await self.handle_stop_animation(websocket, data)
        elif message_type == "get_status":
            await self.handle_get_status(websocket, data)
        elif message_type == "configure_servo":
            await self.handle_configure_servo(websocket, data)
        elif message_type == "subscribe":
            await self.handle_subscribe(websocket, data)
        elif message_type == "volume_data":
            await self.handle_volume_data(websocket, data)
        else:
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Unknown message type: {message_type}"
            }))
    
    async def handle_jaw_move(self, websocket, data: Dict[str, Any]):
        """Handle manual jaw movement commands"""
        try:
            angle = float(data.get("angle", 50))
            duration = float(data.get("duration", 1.0))
            curve_type = data.get("curve_type", "ease_in_out")
            
            # Clamp angle to valid range (30° open to 50° closed)
            angle = max(30, min(50, angle))
            
            logger.info(f"🦴 Moving jaw to {angle}° over {duration}s")
            
            success = self.jaw_control.move_to_angle(angle, duration, curve_type)
            
            if success:
                # Broadcast movement to all clients
                await self.broadcast({
                    "type": "jaw_movement",
                    "angle": angle,
                    "duration": duration,
                    "curve_type": curve_type,
                    "timestamp": time.time()
                })
                
                await websocket.send(json.dumps({
                    "type": "jaw_move_response",
                    "success": True,
                    "angle": angle
                }))
            else:
                await websocket.send(json.dumps({
                    "type": "jaw_move_response",
                    "success": False,
                    "error": "Failed to move jaw"
                }))
                
        except Exception as e:
            logger.error(f"Error in jaw_move: {e}")
            await websocket.send(json.dumps({
                "type": "jaw_move_response",
                "success": False,
                "error": str(e)
            }))
    
    async def handle_start_animation(self, websocket, data: Dict[str, Any]):
        """Handle start audio-driven animation"""
        try:
            if self.animation_active:
                await websocket.send(json.dumps({
                    "type": "animation_response",
                    "success": False,
                    "error": "Animation already active"
                }))
                return
            
            logger.info("🎤 Starting audio-driven jaw animation")
            
            success = self.audio_animator.start_animation()
            
            if success:
                self.animation_active = True
                
                # Broadcast to all clients
                await self.broadcast({
                    "type": "animationStarted",
                    "characterId": self.current_character,
                    "timestamp": time.time()
                })
                
                await websocket.send(json.dumps({
                    "type": "animation_response",
                    "success": True,
                    "message": "Audio animation started"
                }))
                
                # Start status updates
                asyncio.create_task(self.send_animation_updates())
            else:
                await websocket.send(json.dumps({
                    "type": "animation_response",
                    "success": False,
                    "error": "Failed to start animation"
                }))
                
        except Exception as e:
            logger.error(f"Error starting animation: {e}")
            await websocket.send(json.dumps({
                "type": "animation_response",
                "success": False,
                "error": str(e)
            }))
    
    async def handle_stop_animation(self, websocket, data: Dict[str, Any]):
        """Handle stop audio-driven animation"""
        try:
            if not self.animation_active:
                await websocket.send(json.dumps({
                    "type": "animation_response",
                    "success": False,
                    "error": "Animation not active"
                }))
                return
            
            logger.info("🛑 Stopping audio-driven jaw animation")
            
            self.audio_animator.stop_animation()
            self.animation_active = False
            
            # Broadcast to all clients
            await self.broadcast({
                "type": "animationStopped",
                "characterId": self.current_character,
                "timestamp": time.time()
            })
            
            await websocket.send(json.dumps({
                "type": "animation_response",
                "success": True,
                "message": "Audio animation stopped"
            }))

        except Exception as e:
            logger.error(f"Error stopping animation: {e}")
            await websocket.send(json.dumps({
                "type": "animation_response",
                "success": False,
                "error": str(e)
            }))

    async def handle_volume_data(self, websocket, data: Dict[str, Any]):
        """Handle real-time volume data for jaw animation"""
        try:
            volume = data.get("volume", 0.0)
            timestamp = data.get("timestamp", int(time.time() * 1000))

            # Only process volume data if animation is active
            if not self.animation_active:
                return

            # Convert volume to jaw angle using the audio animator
            if self.audio_animator:
                # Manually set the volume for the audio animator
                self.audio_animator.current_volume = volume
                self.audio_animator.smoothed_volume = (
                    self.audio_animator.smoothing_factor * self.audio_animator.smoothed_volume +
                    (1 - self.audio_animator.smoothing_factor) * volume
                )

                # Calculate jaw angle based on volume
                jaw_angle = self.audio_animator._volume_to_jaw_angle(self.audio_animator.smoothed_volume)

                # Only move if there's significant change (reduce jitter)
                angle_diff = abs(jaw_angle - self.audio_animator.last_jaw_angle)
                if angle_diff > 1.0:
                    self.audio_animator.jaw_control.move_to_angle(jaw_angle, 0.05, "linear")
                    self.audio_animator.last_jaw_angle = jaw_angle

                    # Update stats
                    self.stats["volume_updates"] += 1

        except Exception as e:
            logger.error(f"Error processing volume data: {e}")
    
    async def handle_get_status(self, websocket, data: Dict[str, Any]):
        """Handle status request"""
        try:
            jaw_status = self.jaw_control.get_status()
            
            if self.animation_active and self.audio_animator:
                animation_status = self.audio_animator.get_status()
            else:
                animation_status = {"is_running": False}
            
            status = {
                "type": "status_response",
                "jaw_control": jaw_status,
                "animation": animation_status,
                "animation_active": self.animation_active,
                "current_character": self.current_character,
                "timestamp": time.time()
            }
            
            await websocket.send(json.dumps(status))
            
        except Exception as e:
            logger.error(f"Error getting status: {e}")
            await websocket.send(json.dumps({
                "type": "status_response",
                "error": str(e)
            }))
    
    async def handle_configure_servo(self, websocket, data: Dict[str, Any]):
        """Handle servo configuration (compatibility with existing interface)"""
        pin = data.get("pin", 18)
        
        await websocket.send(json.dumps({
            "type": "configure_response",
            "success": True,
            "pin": pin,
            "message": f"Servo configured on GPIO {pin}"
        }))
    
    async def handle_subscribe(self, websocket, data: Dict[str, Any]):
        """Handle event subscription"""
        events = data.get("events", [])
        
        await websocket.send(json.dumps({
            "type": "subscription_response",
            "success": True,
            "events": events,
            "message": "Subscribed to events"
        }))
    
    async def send_animation_updates(self):
        """Send periodic animation status updates"""
        while self.animation_active and self.audio_animator:
            try:
                status = self.audio_animator.get_status()
                
                await self.broadcast({
                    "type": "volumeUpdate",
                    "volume": status.get("smoothed_volume", 0),
                    "servoPosition": status.get("last_jaw_angle", 50),
                    "timestamp": time.time()
                })
                
                await asyncio.sleep(0.1)  # 10Hz updates
                
            except Exception as e:
                logger.error(f"Error sending animation updates: {e}")
                break
    
    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast message to all connected clients"""
        if not self.connected_clients:
            return
        
        message_json = json.dumps(message)
        disconnected = set()
        
        for client in self.connected_clients:
            try:
                await client.send(message_json)
            except websockets.exceptions.ConnectionClosed:
                disconnected.add(client)
            except Exception as e:
                logger.error(f"Error broadcasting to client: {e}")
                disconnected.add(client)
        
        # Remove disconnected clients
        self.connected_clients -= disconnected
    
    async def start_server(self):
        """Start the WebSocket server"""
        if not await self.initialize():
            logger.error("Failed to initialize bridge")
            return
        
        logger.info(f"🌐 Starting ChatterPi Web Bridge on ws://localhost:{self.port}")
        
        async with websockets.serve(self.handle_client, "localhost", self.port):
            self.is_running = True
            logger.info("✅ ChatterPi Web Bridge server started")
            await asyncio.Future()  # Run forever
    
    def cleanup(self):
        """Cleanup resources"""
        logger.info("🧹 Cleaning up ChatterPi Web Bridge")
        
        if self.audio_animator:
            self.audio_animator.stop_animation()
        
        if self.jaw_control:
            self.jaw_control.cleanup()
        
        self.is_running = False
        logger.info("✅ Cleanup completed")

async def main():
    """Main function"""
    bridge = ChatterPiWebBridge(port=8765)
    
    try:
        await bridge.start_server()
    except KeyboardInterrupt:
        logger.info("⚠️ Server interrupted by user")
    finally:
        bridge.cleanup()

if __name__ == "__main__":
    asyncio.run(main())
