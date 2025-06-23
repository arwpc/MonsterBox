#!/usr/bin/env python3
"""
ChatterPi AI WebSocket Bridge
Provides AI conversation capabilities with jaw animation synchronization
Runs on port 8766 and connects to jaw server on port 8765
"""

import asyncio
import websockets
import json
import logging
import argparse
import time
import sys
import os
from typing import Dict, Any, Optional, List
import subprocess
import re

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('ai_websocket_bridge.log')
    ]
)
logger = logging.getLogger(__name__)

class AIWebSocketBridge:
    """AI WebSocket Bridge for ChatterPi system"""
    
    def __init__(self, host='localhost', port=8766, jaw_host='localhost', jaw_port=8765):
        self.host = host
        self.port = port
        self.jaw_host = jaw_host
        self.jaw_port = jaw_port
        self.connected_clients = set()
        self.jaw_websocket = None
        self.is_running = False
        
        # AI Characters configuration
        self.characters = {
            'orlok': {
                'name': 'Count Orlok',
                'personality': 'Ancient vampire with mysterious, eloquent responses',
                'voice_style': 'dark, archaic',
                'response_patterns': [
                    "Thou speakest of matters beyond mortal understanding...",
                    "Verily, the night holds many mysteries...",
                    "The shadows whisper secrets I cannot share...",
                    "In centuries past, I have witnessed...",
                    "Mortal, thy words intrigue me..."
                ]
            },
            'robochat': {
                'name': 'RoboChat',
                'personality': 'Helpful robot with logical, friendly responses',
                'voice_style': 'mechanical, precise',
                'response_patterns': [
                    "Processing your request... Analysis complete.",
                    "My circuits indicate this is fascinating.",
                    "Logic dictates that we should explore this further.",
                    "System update: I find this conversation engaging.",
                    "Calculating optimal response... Complete."
                ]
            },
            'blackbeard': {
                'name': 'Captain Blackbeard',
                'personality': 'Swashbuckling pirate with adventurous responses',
                'voice_style': 'gruff, nautical',
                'response_patterns': [
                    "Ahoy there, matey! That be a fine question!",
                    "Batten down the hatches, we're in for adventure!",
                    "By Blackbeard's beard, that's interesting!",
                    "Shiver me timbers, let me tell ye...",
                    "Avast! That reminds me of me sailing days..."
                ]
            }
        }
        
        self.current_character = 'orlok'
        self.detected_jaw_servos = []

    def detect_jaw_servos(self) -> List[Dict[str, Any]]:
        """Detect jaw servos from parts configuration"""
        try:
            # Path to parts.json relative to script location
            parts_file = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'parts.json')

            if not os.path.exists(parts_file):
                logger.warning(f"Parts configuration file not found: {parts_file}")
                return []

            with open(parts_file, 'r') as f:
                parts_data = json.load(f)

            jaw_servos = []
            for part in parts_data:
                # Look for servo parts that could be jaw servos
                if (part.get('type') == 'servo' and
                    'jaw' in part.get('name', '').lower()):

                    jaw_servo = {
                        'id': part.get('id'),
                        'name': part.get('name'),
                        'pin': part.get('pin'),
                        'characterId': part.get('characterId'),
                        'servoType': part.get('servoType'),
                        'minPulse': part.get('minPulse', 500),
                        'maxPulse': part.get('maxPulse', 2400),
                        'defaultAngle': part.get('defaultAngle', 90)
                    }
                    jaw_servos.append(jaw_servo)
                    logger.info(f"Detected jaw servo: {jaw_servo['name']} on GPIO {jaw_servo['pin']}")

                # Also look for ChatterPi system parts
                elif part.get('type') in ['chatterpi-jaw', 'chatterpi-system']:
                    chatterpi_config = part.get('chatterpi_config', {})
                    if chatterpi_config.get('auto_detect_jaw_servos'):
                        logger.info("ChatterPi system configured for auto-detection")

            self.detected_jaw_servos = jaw_servos
            return jaw_servos

        except Exception as e:
            logger.error(f"Error detecting jaw servos: {e}")
            return []

    def get_jaw_servo_for_character(self, character_id: int = None) -> Optional[Dict[str, Any]]:
        """Get the jaw servo configuration for a specific character"""
        if not self.detected_jaw_servos:
            self.detect_jaw_servos()

        if character_id is None:
            # Return the first available jaw servo
            return self.detected_jaw_servos[0] if self.detected_jaw_servos else None

        # Look for jaw servo matching the character
        for servo in self.detected_jaw_servos:
            if servo.get('characterId') == character_id:
                return servo

        # Fallback to first available
        return self.detected_jaw_servos[0] if self.detected_jaw_servos else None

    async def connect_to_jaw_server(self):
        """Connect to the jaw WebSocket server"""
        try:
            jaw_url = f"ws://{self.jaw_host}:{self.jaw_port}"
            logger.info(f"Connecting to jaw server at {jaw_url}")
            self.jaw_websocket = await websockets.connect(jaw_url)
            logger.info("✅ Connected to jaw server")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to connect to jaw server: {e}")
            self.jaw_websocket = None
            return False
    
    async def send_jaw_animation(self, text: str):
        """Send jaw animation commands based on text"""
        if not self.jaw_websocket:
            logger.warning("No jaw WebSocket connection available")
            return
        
        try:
            # Generate jaw animation sequence based on text
            words = text.split()
            animation_sequence = []
            
            for i, word in enumerate(words):
                # Calculate jaw movement based on word characteristics
                word_length = len(word)
                vowel_count = sum(1 for char in word.lower() if char in 'aeiou')
                
                # Determine jaw angle based on word characteristics
                if vowel_count > 2:
                    jaw_angle = 25  # More open for vowel-heavy words
                elif word_length > 6:
                    jaw_angle = 35  # More open for long words
                else:
                    jaw_angle = 45  # Less open for short words
                
                # Add movement command
                animation_sequence.append({
                    "type": "jaw_move",
                    "angle": jaw_angle,
                    "duration": 0.3,
                    "curve_type": "ease_in_out"
                })
                
                # Add pause between words
                if i < len(words) - 1:
                    animation_sequence.append({
                        "type": "jaw_move", 
                        "angle": 50,  # Closed position
                        "duration": 0.1,
                        "curve_type": "linear"
                    })
            
            # Send animation sequence
            for command in animation_sequence:
                await self.jaw_websocket.send(json.dumps(command))
                await asyncio.sleep(command["duration"])
                
        except Exception as e:
            logger.error(f"Error sending jaw animation: {e}")
    
    def generate_ai_response(self, message: str, character: str = None) -> str:
        """Generate AI response using character personality"""
        if character is None:
            character = self.current_character
            
        char_config = self.characters.get(character, self.characters['orlok'])
        
        # Try to use OpenAI if available, otherwise use fallback
        try:
            # Check if we have AI integration available
            ai_response = self._call_ai_integration(message, character)
            if ai_response:
                return ai_response
        except Exception as e:
            logger.warning(f"AI integration failed: {e}")
        
        # Fallback to pattern-based responses
        import random
        patterns = char_config['response_patterns']
        base_response = random.choice(patterns)
        
        # Simple response generation based on input
        if '?' in message:
            if character == 'orlok':
                return f"{base_response} Thy question pierces the veil of darkness."
            elif character == 'robochat':
                return f"{base_response} Query analysis suggests multiple possibilities."
            else:  # blackbeard
                return f"{base_response} That be a question worth pondering, matey!"
        else:
            return base_response
    
    def _call_ai_integration(self, message: str, character: str) -> Optional[str]:
        """Call AI integration script"""
        try:
            # Path to AI integration script
            ai_script_path = os.path.join(os.path.dirname(__file__), 'ai_integration.js')

            if not os.path.exists(ai_script_path):
                logger.warning("AI integration script not found")
                return None

            # Call the AI integration script
            result = subprocess.run([
                'node', ai_script_path,
                '--character', character,
                '--message', message
            ], capture_output=True, text=True, timeout=30)

            if result.returncode == 0:
                # Parse the output to extract the AI response
                output = result.stdout.strip()
                logger.info(f"AI script output: {output}")

                # Extract response from output (assuming JSON format)
                try:
                    response_data = json.loads(output)
                    return response_data.get('response', output)
                except json.JSONDecodeError:
                    # If not JSON, return the raw output
                    return output
            else:
                logger.error(f"AI script error: {result.stderr}")
                return None

        except subprocess.TimeoutExpired:
            logger.error("AI integration script timed out")
            return None
        except Exception as e:
            logger.error(f"Error calling AI integration: {e}")
            return None

    async def send_error(self, websocket, error_message: str):
        """Send standardized error message to client"""
        await websocket.send(json.dumps({
            "type": "error",
            "message": error_message,
            "timestamp": time.time()
        }))

    def validate_message(self, data: Dict[str, Any]) -> tuple[bool, str]:
        """Validate incoming WebSocket message"""
        # Check if data is a dictionary
        if not isinstance(data, dict):
            return False, "Message must be a JSON object"

        # Check for required 'type' field
        if "type" not in data:
            return False, "Message must include 'type' field"

        message_type = data.get("type")

        # Validate message type
        valid_types = ["chat", "set_character", "get_status", "ping"]
        if message_type not in valid_types:
            return False, f"Invalid message type. Allowed types: {', '.join(valid_types)}"

        # Type-specific validation
        if message_type == "chat":
            message = data.get("message", "")
            if not isinstance(message, str):
                return False, "Chat message must be a string"
            if len(message.strip()) == 0:
                return False, "Chat message cannot be empty"
            if len(message) > 1000:  # Reasonable limit
                return False, "Chat message too long (max 1000 characters)"

            # Basic content filtering
            if self._contains_suspicious_content(message):
                return False, "Message contains potentially harmful content"

        elif message_type == "set_character":
            character = data.get("character")
            if not isinstance(character, str):
                return False, "Character must be a string"
            if character not in self.characters:
                return False, f"Unknown character. Available: {', '.join(self.characters.keys())}"

        return True, ""

    def _contains_suspicious_content(self, text: str) -> bool:
        """Basic content filtering for suspicious patterns"""
        suspicious_patterns = [
            r'<script[^>]*>',  # Script tags
            r'javascript:',     # JavaScript URLs
            r'data:text/html',  # Data URLs
            r'vbscript:',      # VBScript
            r'onload=',        # Event handlers
            r'onerror=',
            r'onclick=',
        ]

        text_lower = text.lower()
        for pattern in suspicious_patterns:
            if re.search(pattern, text_lower):
                return True
        return False

    async def handle_client(self, websocket, _path):
        """Handle WebSocket client connections"""
        logger.info(f"🔌 Client connected from {websocket.remote_address}")
        self.connected_clients.add(websocket)

        try:
            # Send welcome message
            await websocket.send(json.dumps({
                "type": "welcome",
                "message": "Connected to ChatterPi AI Bridge",
                "characters": list(self.characters.keys()),
                "current_character": self.current_character
            }))

            async for message in websocket:
                try:
                    data = json.loads(message)

                    # Validate message
                    is_valid, error_msg = self.validate_message(data)
                    if not is_valid:
                        await self.send_error(websocket, error_msg)
                        continue

                    await self.handle_message(websocket, data)
                except json.JSONDecodeError:
                    await self.send_error(websocket, "Invalid JSON")
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    await self.send_error(websocket, str(e))

        except websockets.exceptions.ConnectionClosed:
            logger.info("Client disconnected")
        except Exception as e:
            logger.error(f"Client error: {e}")
        finally:
            self.connected_clients.discard(websocket)

    async def handle_message(self, websocket, data: Dict[str, Any]):
        """Handle incoming WebSocket messages"""
        message_type = data.get("type")

        if message_type == "chat":
            await self.handle_chat_message(websocket, data)
        elif message_type == "set_character":
            await self.handle_set_character(websocket, data)
        elif message_type == "get_status":
            await self.handle_get_status(websocket, data)
        else:
            await self.send_error(websocket, f"Unknown message type: {message_type}")

    async def handle_chat_message(self, websocket, data: Dict[str, Any]):
        """Handle chat messages and generate AI responses"""
        try:
            user_message = data.get("message", "")
            character = data.get("character", self.current_character)

            if not user_message:
                await self.send_error(websocket, "Empty message")
                return

            logger.info(f"Processing chat message: {user_message} (character: {character})")

            # Send processing indicator
            await websocket.send(json.dumps({
                "type": "processing",
                "message": "Generating response..."
            }))

            # Generate AI response
            ai_response = self.generate_ai_response(user_message, character)

            # Send AI response
            await websocket.send(json.dumps({
                "type": "ai_response",
                "message": ai_response,
                "character": character,
                "timestamp": time.time()
            }))

            # Send jaw animation if connected
            if self.jaw_websocket:
                await self.send_jaw_animation(ai_response)

        except Exception as e:
            logger.error(f"Error handling chat message: {e}")
            await self.send_error(websocket, f"Error processing message: {str(e)}")

    async def handle_set_character(self, websocket, data: Dict[str, Any]):
        """Handle character selection"""
        try:
            character = data.get("character")
            if character in self.characters:
                self.current_character = character
                await websocket.send(json.dumps({
                    "type": "character_set",
                    "character": character,
                    "character_info": self.characters[character]
                }))
                logger.info(f"Character set to: {character}")
            else:
                await self.send_error(websocket, f"Unknown character: {character}")
        except Exception as e:
            logger.error(f"Error setting character: {e}")
            await self.send_error(websocket, str(e))

    async def handle_get_status(self, websocket, _data: Dict[str, Any]):
        """Handle status requests"""
        try:
            status = {
                "type": "status",
                "ai_bridge_running": self.is_running,
                "jaw_connected": self.jaw_websocket is not None,
                "current_character": self.current_character,
                "connected_clients": len(self.connected_clients),
                "available_characters": list(self.characters.keys())
            }
            await websocket.send(json.dumps(status))
        except Exception as e:
            logger.error(f"Error getting status: {e}")
            await self.send_error(websocket, str(e))

    async def start_server(self):
        """Start the AI WebSocket bridge server"""
        logger.info(f"🚀 Starting AI WebSocket Bridge on {self.host}:{self.port}")

        # Detect available jaw servos
        jaw_servos = self.detect_jaw_servos()
        if jaw_servos:
            logger.info(f"✅ Detected {len(jaw_servos)} jaw servo(s)")
            for servo in jaw_servos:
                logger.info(f"   - {servo['name']} (GPIO {servo['pin']}, Character {servo['characterId']})")
        else:
            logger.warning("⚠️ No jaw servos detected in parts configuration")

        # Try to connect to jaw server
        await self.connect_to_jaw_server()

        try:
            server = await websockets.serve(
                self.handle_client,
                self.host,
                self.port,
                ping_interval=30,
                ping_timeout=10
            )

            self.is_running = True
            logger.info(f"✅ AI WebSocket Bridge running on ws://{self.host}:{self.port}")
            logger.info(f"🦴 Jaw server connection: {'✅ Connected' if self.jaw_websocket else '❌ Disconnected'}")

            await server.wait_closed()

        except Exception as e:
            logger.error(f"❌ Server error: {e}")
            return False
        finally:
            self.cleanup()

    async def cleanup(self):
        """Cleanup resources"""
        logger.info("🧹 Cleaning up AI WebSocket Bridge")
        self.is_running = False

        # Properly close jaw WebSocket connection
        if self.jaw_websocket:
            try:
                if not self.jaw_websocket.closed:
                    await self.jaw_websocket.close()
                    logger.info("✅ Jaw WebSocket connection closed")
            except Exception as e:
                logger.error(f"Error closing jaw WebSocket: {e}")
            finally:
                self.jaw_websocket = None

        # Close all client connections
        if self.connected_clients:
            logger.info(f"Closing {len(self.connected_clients)} client connections")
            for client in list(self.connected_clients):
                try:
                    if not client.closed:
                        await client.close()
                except Exception as e:
                    logger.error(f"Error closing client connection: {e}")
            self.connected_clients.clear()

        logger.info("✅ Cleanup completed")

def main():
    """Main function to run the AI WebSocket bridge"""
    parser = argparse.ArgumentParser(description="ChatterPi AI WebSocket Bridge")
    parser.add_argument("--host", default="localhost", help="Server host")
    parser.add_argument("--port", type=int, default=8766, help="Server port")
    parser.add_argument("--jaw-host", default="localhost", help="Jaw server host")
    parser.add_argument("--jaw-port", type=int, default=8765, help="Jaw server port")

    args = parser.parse_args()

    # Create and start bridge
    bridge = AIWebSocketBridge(
        host=args.host,
        port=args.port,
        jaw_host=args.jaw_host,
        jaw_port=args.jaw_port
    )

    try:
        asyncio.run(bridge.start_server())
    except KeyboardInterrupt:
        logger.info("Bridge interrupted by user")
    except Exception as e:
        logger.error(f"Bridge error: {e}")

if __name__ == "__main__":
    main()
