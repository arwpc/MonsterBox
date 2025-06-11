#!/usr/bin/env python3
"""
AI WebSocket Bridge for ChatterPi
Provides AI conversation capabilities with jaw animation synchronization
"""

import asyncio
import websockets
import json
import logging
import time
import random
from typing import Dict, Any, Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AIWebSocketBridge:
    """AI WebSocket Bridge for ChatterPi conversations"""
    
    def __init__(self, host="0.0.0.0", port=8766, jaw_host="localhost", jaw_port=8765):
        self.host = host
        self.port = port
        self.jaw_host = jaw_host
        self.jaw_port = jaw_port
        self.clients = {}
        self.client_counter = 0
        
        # Character personalities
        self.characters = {
            "orlok": {
                "name": "Count Orlok",
                "voice": "deep",
                "personality": "ancient vampire, mysterious, eloquent",
                "responses": [
                    "Ah, mortal... your words echo through the shadows of eternity...",
                    "Indeed, from my centuries of existence, I have observed such things...",
                    "The darkness whispers secrets that few dare to comprehend...",
                    "Your mortal perspective intrigues me, young one...",
                    "In my long existence, I have seen many such matters unfold...",
                    "The night reveals truths that daylight conceals...",
                    "Fascinating... tell me more of this mortal concern...",
                    "Your words stir memories from ages past..."
                ]
            },
            "robot": {
                "name": "RoboChat",
                "voice": "robotic",
                "personality": "helpful robot, logical, friendly",
                "responses": [
                    "PROCESSING... That is a logical observation, human.",
                    "ANALYSIS COMPLETE: Your input has been processed successfully.",
                    "INTERESTING DATA: Please provide additional parameters.",
                    "SYSTEM STATUS: Ready to assist with your query.",
                    "COMPUTATION RESULT: I understand your request.",
                    "ROBOT LOGIC: That makes perfect sense to my circuits.",
                    "BEEP BOOP: Fascinating human behavior detected.",
                    "PROCESSING COMPLETE: How may I further assist you?"
                ]
            },
            "pirate": {
                "name": "Captain Blackbeard",
                "voice": "gruff",
                "personality": "swashbuckling pirate, adventurous, colorful",
                "responses": [
                    "Arrr, that be a fine tale ye be tellin', matey!",
                    "Shiver me timbers! That's quite the adventure!",
                    "Aye, I've sailed the seven seas and seen such things!",
                    "Batten down the hatches! That's a story worth tellin'!",
                    "Yo ho ho! That reminds me of me days on the high seas!",
                    "Avast ye! That be treasure worth more than gold!",
                    "Splice the mainbrace! Tell me more of this tale!",
                    "By Blackbeard's ghost! That's a fine yarn, sailor!"
                ]
            }
        }
        
        self.current_character = "orlok"
    
    async def register_client(self, websocket, path):
        """Register new client"""
        client_id = f"ai_client_{self.client_counter}_{int(time.time())}"
        self.client_counter += 1
        
        self.clients[client_id] = {
            "websocket": websocket,
            "character": self.current_character,
            "conversation_history": []
        }
        
        logger.info(f"✅ AI Client connected: {client_id}")
        
        # Send welcome message
        character_info = self.characters[self.current_character]
        welcome = {
            "type": "welcome",
            "client_id": client_id,
            "character": character_info["name"],
            "voice": character_info["voice"],
            "server_info": {
                "version": "1.0.0",
                "ai_enabled": True,
                "jaw_integration": True,
                "voice_synthesis": True
            },
            "timestamp": time.time()
        }
        
        await websocket.send(json.dumps(welcome))
        return client_id
    
    async def handle_message(self, client_id, message_data):
        """Handle incoming message"""
        try:
            message = json.loads(message_data)
            message_type = message.get("type", "unknown")
            
            logger.info(f"Received {message_type} from {client_id}")
            
            client_info = self.clients[client_id]
            websocket = client_info["websocket"]
            
            if message_type == "chat_message":
                await self.handle_chat_message(client_id, message)
            elif message_type == "set_character":
                await self.handle_set_character(client_id, message)
            elif message_type == "get_characters":
                await self.handle_get_characters(websocket)
            elif message_type == "ping":
                await self.handle_ping(websocket, message)
            else:
                await self.send_error(websocket, f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError:
            await self.send_error(websocket, "Invalid JSON format")
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            await self.send_error(websocket, f"Internal server error: {str(e)}")
    
    async def handle_chat_message(self, client_id, message):
        """Handle chat message and generate AI response"""
        client_info = self.clients[client_id]
        websocket = client_info["websocket"]
        user_text = message.get("text", "")
        
        if not user_text.strip():
            await self.send_error(websocket, "Empty message")
            return
        
        # Add to conversation history
        client_info["conversation_history"].append({
            "role": "user",
            "text": user_text,
            "timestamp": time.time()
        })
        
        # Send processing started
        await websocket.send(json.dumps({
            "type": "processing_started",
            "timestamp": time.time()
        }))
        
        # Simulate AI processing delay
        await asyncio.sleep(0.5 + random.random() * 1.5)
        
        # Generate AI response
        ai_response = await self.generate_ai_response(client_id, user_text)
        
        # Add AI response to history
        client_info["conversation_history"].append({
            "role": "assistant",
            "text": ai_response,
            "timestamp": time.time()
        })
        
        # Send response with jaw animation data
        response_data = {
            "type": "conversation_result",
            "data": {
                "userMessage": user_text,
                "aiResponse": {
                    "text": ai_response,
                    "character": self.characters[client_info["character"]]["name"],
                    "voice": self.characters[client_info["character"]]["voice"],
                    "jaw_animation": self.generate_jaw_animation(ai_response)
                }
            },
            "timestamp": time.time()
        }
        
        await websocket.send(json.dumps(response_data))
        
        # Send jaw animation commands to jaw server
        await self.send_jaw_animation(ai_response)
    
    async def generate_ai_response(self, client_id, user_text):
        """Generate AI response based on character"""
        client_info = self.clients[client_id]
        character = self.characters[client_info["character"]]
        
        # Simple response generation (can be enhanced with actual AI)
        responses = character["responses"]
        
        # Add some context-aware responses
        user_lower = user_text.lower()
        if any(word in user_lower for word in ["hello", "hi", "hey", "greetings"]):
            if client_info["character"] == "orlok":
                return "Greetings, mortal... Welcome to my domain of eternal shadows..."
            elif client_info["character"] == "robot":
                return "GREETING PROTOCOL ACTIVATED: Hello, human. How may I assist you today?"
            elif client_info["character"] == "pirate":
                return "Ahoy there, matey! Welcome aboard me ship!"
        
        if any(word in user_lower for word in ["bye", "goodbye", "farewell"]):
            if client_info["character"] == "orlok":
                return "Farewell, mortal... May the shadows guide your path..."
            elif client_info["character"] == "robot":
                return "FAREWELL PROTOCOL INITIATED: Goodbye, human. Until next time."
            elif client_info["character"] == "pirate":
                return "Fair winds and following seas, me hearty!"
        
        # Random response from character's pool
        return random.choice(responses)
    
    def generate_jaw_animation(self, text):
        """Generate jaw animation sequence for text"""
        words = text.split()
        animation_sequence = []
        
        for i, word in enumerate(words):
            # Calculate jaw angle based on word characteristics
            base_angle = min(45, len(word) * 3)
            
            # Add some variation for more natural movement
            angle = base_angle + random.randint(-5, 5)
            angle = max(0, min(60, angle))  # Clamp between 0-60 degrees
            
            animation_sequence.append({
                "word": word,
                "angle": angle,
                "duration": 0.2 + len(word) * 0.05,
                "delay": i * 0.3
            })
        
        return animation_sequence
    
    async def send_jaw_animation(self, text):
        """Send jaw animation to jaw server"""
        try:
            jaw_uri = f"ws://{self.jaw_host}:{self.jaw_port}"
            async with websockets.connect(jaw_uri, timeout=5) as jaw_ws:
                # Skip welcome message
                await jaw_ws.recv()
                
                # Send animation sequence
                words = text.split()
                for i, word in enumerate(words):
                    angle = min(45, len(word) * 3)
                    
                    command = {
                        "type": "jaw_move",
                        "angle": angle,
                        "duration": 0.2,
                        "curve_type": "ease_in_out"
                    }
                    
                    await jaw_ws.send(json.dumps(command))
                    await asyncio.sleep(0.3)
                    
                    # Return to neutral
                    await jaw_ws.send(json.dumps({
                        "type": "jaw_move",
                        "angle": 0,
                        "duration": 0.1
                    }))
                    await asyncio.sleep(0.1)
                    
        except Exception as e:
            logger.warning(f"Could not send jaw animation: {e}")
    
    async def handle_set_character(self, client_id, message):
        """Handle character change"""
        character = message.get("character", "orlok")
        if character in self.characters:
            self.clients[client_id]["character"] = character
            
            response = {
                "type": "character_changed",
                "character": self.characters[character]["name"],
                "voice": self.characters[character]["voice"],
                "timestamp": time.time()
            }
            
            await self.clients[client_id]["websocket"].send(json.dumps(response))
        else:
            await self.send_error(self.clients[client_id]["websocket"], f"Unknown character: {character}")
    
    async def handle_get_characters(self, websocket):
        """Handle get characters request"""
        characters_list = []
        for char_id, char_info in self.characters.items():
            characters_list.append({
                "id": char_id,
                "name": char_info["name"],
                "voice": char_info["voice"],
                "personality": char_info["personality"]
            })
        
        response = {
            "type": "characters_list",
            "characters": characters_list,
            "timestamp": time.time()
        }
        
        await websocket.send(json.dumps(response))
    
    async def handle_ping(self, websocket, message):
        """Handle ping request"""
        response = {
            "type": "pong",
            "timestamp": time.time()
        }
        await websocket.send(json.dumps(response))
    
    async def send_error(self, websocket, error_message):
        """Send error message"""
        response = {
            "type": "ai_error",
            "error": error_message,
            "timestamp": time.time()
        }
        await websocket.send(json.dumps(response))
    
    async def handle_client(self, websocket, path):
        """Handle client connection"""
        client_id = await self.register_client(websocket, path)
        
        try:
            async for message in websocket:
                await self.handle_message(client_id, message)
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"AI Client {client_id} disconnected")
        except Exception as e:
            logger.error(f"Error with AI client {client_id}: {e}")
        finally:
            if client_id in self.clients:
                del self.clients[client_id]
    
    async def start_server(self):
        """Start the AI WebSocket server"""
        logger.info(f"🚀 Starting AI WebSocket Bridge on {self.host}:{self.port}")
        
        server = await websockets.serve(
            self.handle_client,
            self.host,
            self.port,
            ping_interval=30,
            ping_timeout=10
        )
        
        logger.info(f"✅ AI WebSocket Bridge running on ws://{self.host}:{self.port}")
        logger.info(f"🤖 AI Characters: {', '.join(self.characters.keys())}")
        logger.info(f"🦴 Jaw integration: ws://{self.jaw_host}:{self.jaw_port}")
        
        await server.wait_closed()

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="AI WebSocket Bridge for ChatterPi")
    parser.add_argument("--host", default="0.0.0.0", help="Server host")
    parser.add_argument("--port", type=int, default=8766, help="Server port")
    parser.add_argument("--jaw-host", default="localhost", help="Jaw server host")
    parser.add_argument("--jaw-port", type=int, default=8765, help="Jaw server port")
    
    args = parser.parse_args()
    
    bridge = AIWebSocketBridge(
        host=args.host,
        port=args.port,
        jaw_host=args.jaw_host,
        jaw_port=args.jaw_port
    )
    
    try:
        asyncio.run(bridge.start_server())
    except KeyboardInterrupt:
        logger.info("AI Bridge interrupted by user")
    except Exception as e:
        logger.error(f"AI Bridge error: {e}")

if __name__ == "__main__":
    main()
