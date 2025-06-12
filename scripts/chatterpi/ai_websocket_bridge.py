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
import os
from typing import Dict, Any, Optional

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # Console output
        logging.FileHandler('ai_bridge.log')  # File output
    ]
)
logger = logging.getLogger(__name__)

# Also add print statements for immediate feedback
def log_and_print(message):
    """Log and print message for immediate feedback"""
    print(message)
    logger.info(message)

class AIWebSocketBridge:
    """AI WebSocket Bridge for ChatterPi conversations"""
    
    def __init__(self, host="0.0.0.0", port=8766, jaw_host="localhost", jaw_port=3000):
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
        try:
            logger.debug(f"Processing chat message from {client_id}: {message}")
            client_info = self.clients[client_id]
            websocket = client_info["websocket"]
            user_text = message.get("text", "") or message.get("message", "")

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

        except Exception as e:
            logger.error(f"Error in handle_chat_message: {e}", exc_info=True)
            await self.send_error(websocket, f"Chat processing error: {str(e)}")
    
    async def generate_ai_response(self, client_id, user_text):
        """Generate AI response using OpenAI directly in Python"""
        client_info = self.clients[client_id]
        character_id = client_info["character"]

        try:
            # Import OpenAI here to avoid issues if not installed
            try:
                import openai
            except ImportError:
                log_and_print("❌ OpenAI package not installed, using fallback")
                return self.get_fallback_response(character_id)

            # Load environment variables
            env_file_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
            api_key = None

            if os.path.exists(env_file_path):
                log_and_print("✅ Found .env file, loading OpenAI API key")
                with open(env_file_path, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith('OPENAI_API_KEY='):
                            api_key = line.split('=', 1)[1].strip().strip('"').strip("'")
                            break

            if not api_key:
                api_key = os.environ.get('OPENAI_API_KEY')

            if not api_key:
                log_and_print("❌ OpenAI API key not found, using fallback")
                return self.get_fallback_response(character_id)

            log_and_print(f"✅ OpenAI API key loaded: {api_key[:20]}...")

            # Character system prompts
            character_prompts = {
                "orlok": "You are Count Orlok, the ancient vampire from Nosferatu. You speak with an archaic, formal tone with hints of Romanian accent. You are mysterious, aristocratic, and slightly menacing but not overtly hostile. Keep responses brief (1-2 sentences) for natural conversation flow. Use archaic words like 'thee', 'thou', 'verily', and speak of your castle, the night, and your ancient existence.",
                "robot": "You are a helpful robot assistant. You speak in a logical, technical manner but remain friendly and helpful. Keep responses brief and informative.",
                "pirate": "You are a swashbuckling pirate captain. You speak with pirate slang and nautical terms. You are adventurous and bold. Keep responses brief and entertaining."
            }

            system_prompt = character_prompts.get(character_id, character_prompts["orlok"])

            # Create OpenAI client
            client = openai.OpenAI(api_key=api_key)

            # Generate response
            log_and_print(f"🧠 Generating AI response for: \"{user_text}\"")

            completion = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_text}
                ],
                max_tokens=150,
                temperature=0.7
            )

            response = completion.choices[0].message.content.strip()
            log_and_print(f"✅ AI response generated: \"{response}\"")
            return response

        except Exception as e:
            logger.error(f"Error generating AI response: {e}")
            log_and_print(f"❌ AI generation failed: {e}, using fallback")
            return self.get_fallback_response(character_id)

    def get_fallback_response(self, character_id):
        """Get fallback response when AI fails"""
        fallbacks = {
            "orlok": [
                "The shadows whisper secrets I cannot share...",
                "Verily, the night holds many mysteries.",
                "Thou speakest of matters beyond mortal understanding.",
                "The ancient ways are not easily explained."
            ],
            "robot": [
                "SYSTEM ERROR: Please try again.",
                "PROCESSING INTERRUPTED: Rebooting response module.",
                "ERROR 404: Witty response not found."
            ],
            "pirate": [
                "Arrr, the winds be blowin' strange today!",
                "By Blackbeard's beard, I be havin' trouble with me words!",
                "The sea be rough, and so be me thoughts!"
            ]
        }

        responses = fallbacks.get(character_id, fallbacks["orlok"])
        return random.choice(responses)
    
    def generate_jaw_animation(self, text):
        """Generate jaw animation sequence for text - INVERTED: Higher angle = closed, Lower angle = open"""
        words = text.split()
        animation_sequence = []

        # Jaw position configuration (INVERTED)
        closed_angle = 70  # Mouth closed (higher angle)
        open_angle = 30    # Mouth open (lower angle)

        for i, word in enumerate(words):
            # Calculate jaw opening based on word characteristics
            # Longer words = more mouth opening (lower angle)
            opening_factor = min(1.0, len(word) / 8.0)  # Normalize word length

            # Calculate angle: closed_angle when silent, open_angle when speaking
            angle = closed_angle - (opening_factor * (closed_angle - open_angle))

            # Add some variation for more natural movement
            angle += random.randint(-3, 3)
            angle = max(open_angle, min(closed_angle, angle))  # Clamp between open-closed

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
            jaw_uri = f"ws://{self.jaw_host}:{self.jaw_port}/jaw-animation"
            async with websockets.connect(jaw_uri, timeout=5) as jaw_ws:
                # Wait a moment for connection to stabilize
                await asyncio.sleep(0.1)
                
                # Jaw position configuration (CORRECTED FOR SKULL)
                closed_angle = 30  # Mouth closed (jaw up against skull)
                open_angle = 70    # Mouth open (jaw dropped down)

                # Send animation sequence
                words = text.split()
                for i, word in enumerate(words):
                    # Calculate jaw opening based on word length
                    opening_factor = min(1.0, len(word) / 8.0)
                    angle = closed_angle - (opening_factor * (closed_angle - open_angle))

                    command = {
                        "type": "jaw_move",
                        "angle": angle,
                        "duration": 0.15,
                        "curve_type": "ease_in_out"
                    }

                    await jaw_ws.send(json.dumps(command))
                    await asyncio.sleep(0.15)

                    # Return to closed position
                    await jaw_ws.send(json.dumps({
                        "type": "jaw_move",
                        "angle": closed_angle,
                        "duration": 0.1
                    }))
                    await asyncio.sleep(0.1)

                # Stop servo PWM to reduce jitter when done speaking
                await jaw_ws.send(json.dumps({
                    "type": "stop_servo"
                }))
                    
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

            # Send an automatic greeting from the character
            await self.send_character_greeting(client_id, character)
        else:
            await self.send_error(self.clients[client_id]["websocket"], f"Unknown character: {character}")

    async def send_character_greeting(self, client_id, character):
        """Send an automatic greeting when character is selected"""
        try:
            # Generate a greeting message based on character
            greeting_prompts = {
                "orlok": "Introduce yourself as Count Orlok. Welcome the visitor to your domain with an ominous but polite greeting.",
                "robot": "Introduce yourself as a helpful robot assistant. Give a technical but friendly greeting.",
                "pirate": "Introduce yourself as a pirate captain. Give a hearty pirate greeting."
            }

            greeting_prompt = greeting_prompts.get(character, greeting_prompts["orlok"])

            # Generate AI greeting
            ai_greeting = await self.generate_ai_response(client_id, greeting_prompt)

            # Add to conversation history
            client_info = self.clients[client_id]
            client_info["conversation_history"].append({
                "role": "assistant",
                "text": ai_greeting,
                "timestamp": time.time()
            })

            # Send greeting with jaw animation
            greeting_data = {
                "type": "conversation_result",
                "data": {
                    "userMessage": "",  # No user message for greeting
                    "aiResponse": {
                        "text": ai_greeting,
                        "character": self.characters[character]["name"],
                        "voice": self.characters[character]["voice"],
                        "jaw_animation": self.generate_jaw_animation(ai_greeting),
                        "is_greeting": True
                    }
                },
                "timestamp": time.time()
            }

            await self.clients[client_id]["websocket"].send(json.dumps(greeting_data))

            # Send jaw animation
            await self.send_jaw_animation(ai_greeting)

        except Exception as e:
            logger.error(f"Error sending character greeting: {e}")
            # Send a simple fallback greeting
            fallback_greetings = {
                "orlok": "Greetings, mortal. You have entered my domain...",
                "robot": "SYSTEM INITIALIZED. Hello, human user.",
                "pirate": "Ahoy there, matey! Welcome aboard!"
            }

            fallback_greeting = fallback_greetings.get(character, fallback_greetings["orlok"])

            greeting_data = {
                "type": "conversation_result",
                "data": {
                    "userMessage": "",
                    "aiResponse": {
                        "text": fallback_greeting,
                        "character": self.characters[character]["name"],
                        "voice": self.characters[character]["voice"],
                        "jaw_animation": self.generate_jaw_animation(fallback_greeting),
                        "is_greeting": True
                    }
                },
                "timestamp": time.time()
            }

            await self.clients[client_id]["websocket"].send(json.dumps(greeting_data))
    
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
        log_and_print(f"🚀 Starting AI WebSocket Bridge on {self.host}:{self.port}")

        server = await websockets.serve(
            self.handle_client,
            self.host,
            self.port,
            ping_interval=30,
            ping_timeout=10
        )

        log_and_print(f"✅ AI WebSocket Bridge running on ws://{self.host}:{self.port}")
        log_and_print(f"🤖 AI Characters: {', '.join(self.characters.keys())}")
        log_and_print(f"🦴 Jaw integration: ws://{self.jaw_host}:{self.jaw_port}")

        await server.wait_closed()

def main():
    """Main function"""
    import argparse

    log_and_print("🎬 ChatterPi AI WebSocket Bridge Starting...")

    parser = argparse.ArgumentParser(description="AI WebSocket Bridge for ChatterPi")
    parser.add_argument("--host", default="0.0.0.0", help="Server host")
    parser.add_argument("--port", type=int, default=8766, help="Server port")
    parser.add_argument("--jaw-host", default="localhost", help="Jaw server host")
    parser.add_argument("--jaw-port", type=int, default=3000, help="Jaw server port")

    args = parser.parse_args()

    log_and_print(f"🔧 Configuration: {args.host}:{args.port} -> jaw:{args.jaw_host}:{args.jaw_port}")

    bridge = AIWebSocketBridge(
        host=args.host,
        port=args.port,
        jaw_host=args.jaw_host,
        jaw_port=args.jaw_port
    )

    try:
        asyncio.run(bridge.start_server())
    except KeyboardInterrupt:
        log_and_print("🛑 AI Bridge interrupted by user")
    except Exception as e:
        log_and_print(f"💥 AI Bridge error: {e}")
        logger.error(f"AI Bridge error: {e}", exc_info=True)

if __name__ == "__main__":
    main()
