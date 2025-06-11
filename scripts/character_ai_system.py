#!/usr/bin/env python3
"""
Character AI System for ChatterPi
Integrates OpenAI API with Text-to-Speech and jaw synchronization
"""

import asyncio
import websockets
import json
import logging
import time
import threading
import subprocess
import tempfile
import os
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
import requests

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class CharacterConfig:
    """Configuration for AI character"""
    name: str
    personality: str
    voice_id: str = "en-us"
    speaking_rate: float = 1.0
    pitch: float = 0.0
    system_prompt: str = ""

class CharacterAISystem:
    """AI Character system with TTS and jaw synchronization"""
    
    def __init__(self, websocket_url: str = "ws://localhost:8765"):
        self.websocket_url = websocket_url
        self.websocket = None
        self.is_connected = False
        
        # Character configuration
        self.character = CharacterConfig(
            name="ChatterPi",
            personality="friendly, curious, and slightly mischievous animatronic character",
            voice_id="en-us",
            speaking_rate=1.0,
            pitch=0.0,
            system_prompt="""You are ChatterPi, a friendly animatronic character with a mechanical jaw that moves when you speak. 
            You are curious, slightly mischievous, and love to engage in conversation. Keep responses conversational, 
            engaging, and not too long (1-3 sentences usually). You have a playful personality and enjoy making 
            people smile. You're aware that you're an animatronic character and can reference your mechanical nature 
            in a fun way."""
        )
        
        # Conversation state
        self.conversation_history = []
        self.max_history = 10
        
        # Audio processing
        self.current_audio_process = None
        self.is_speaking = False
        
        logger.info(f"Character AI System initialized for {self.character.name}")
    
    async def connect_to_jaw_control(self) -> bool:
        """Connect to jaw control WebSocket"""
        try:
            logger.info(f"Connecting to jaw control at {self.websocket_url}")
            self.websocket = await websockets.connect(self.websocket_url)
            self.is_connected = True
            
            # Wait for welcome message
            welcome = await self.websocket.recv()
            logger.info(f"Connected to jaw control: {json.loads(welcome)}")
            
            # Subscribe to jaw events
            await self.send_jaw_command({
                "type": "subscribe",
                "events": ["jaw_movement", "jaw_stopped"]
            })
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to jaw control: {e}")
            return False
    
    async def send_jaw_command(self, command: Dict[str, Any]):
        """Send command to jaw control system"""
        if self.websocket and self.is_connected:
            try:
                await self.websocket.send(json.dumps(command))
            except Exception as e:
                logger.error(f"Error sending jaw command: {e}")
    
    def generate_ai_response(self, user_message: str) -> str:
        """Generate AI response using OpenAI API (simulated for now)"""
        # Add user message to history
        self.conversation_history.append({"role": "user", "content": user_message})
        
        # Keep history manageable
        if len(self.conversation_history) > self.max_history:
            self.conversation_history = self.conversation_history[-self.max_history:]
        
        # For now, simulate AI responses (replace with actual OpenAI API call)
        responses = [
            f"That's really interesting, {user_message.split()[0] if user_message.split() else 'friend'}! *jaw clicks mechanically* Tell me more about that.",
            f"Hmm, {user_message}... *whirs thoughtfully* I love learning new things! What made you think of that?",
            f"Oh wow! *jaw moves excitedly* That reminds me of something fascinating I heard once. Do you want to hear it?",
            f"*mechanical clicking* You know, being an animatronic gives me a unique perspective on {user_message}. What's your take?",
            f"That's so cool! *jaw articulates precisely* I wish I could experience that myself. How did it make you feel?",
            f"*servo whirs* Fascinating! My circuits are practically buzzing with curiosity about {user_message}.",
            f"You humans are so interesting! *jaw moves thoughtfully* I never would have thought of {user_message} that way.",
            f"*mechanical sounds* That's exactly the kind of thing that makes conversations so exciting! What else can you tell me?"
        ]
        
        import random
        response = random.choice(responses)
        
        # Add AI response to history
        self.conversation_history.append({"role": "assistant", "content": response})
        
        return response
    
    def text_to_speech(self, text: str) -> str:
        """Convert text to speech and return audio file path"""
        try:
            # Create temporary file for audio
            temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            temp_file.close()
            
            # Use espeak for TTS (available on most Linux systems)
            cmd = [
                "espeak",
                "-v", self.character.voice_id,
                "-s", str(int(150 * self.character.speaking_rate)),  # Speed in words per minute
                "-p", str(int(50 + self.character.pitch * 50)),      # Pitch (0-99)
                "-w", temp_file.name,  # Write to file
                text
            ]
            
            logger.info(f"Generating speech: {text[:50]}...")
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                logger.info(f"Speech generated: {temp_file.name}")
                return temp_file.name
            else:
                logger.error(f"TTS failed: {result.stderr}")
                return None
                
        except Exception as e:
            logger.error(f"TTS error: {e}")
            return None
    
    async def play_audio_with_jaw_sync(self, audio_file: str, text: str):
        """Play audio while synchronizing jaw movements"""
        if not audio_file or not os.path.exists(audio_file):
            logger.error("Audio file not found")
            return
        
        try:
            self.is_speaking = True
            logger.info(f"Playing audio with jaw sync: {text[:30]}...")
            
            # Start audio playback
            audio_process = subprocess.Popen([
                "aplay", audio_file  # Use aplay on Linux
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            self.current_audio_process = audio_process
            
            # Simulate jaw movements based on text content
            await self.animate_jaw_for_speech(text)
            
            # Wait for audio to finish
            audio_process.wait()
            
            # Ensure jaw returns to closed position
            await self.send_jaw_command({
                "type": "jaw_move",
                "angle": 0,
                "duration": 0.3
            })
            
            self.is_speaking = False
            logger.info("Audio playback and jaw sync completed")
            
        except Exception as e:
            logger.error(f"Audio playback error: {e}")
            self.is_speaking = False
        finally:
            # Clean up temp file
            try:
                os.unlink(audio_file)
            except:
                pass
    
    async def animate_jaw_for_speech(self, text: str):
        """Animate jaw based on speech content"""
        words = text.split()
        
        for i, word in enumerate(words):
            if not self.is_speaking:
                break
            
            # Skip sound effect words
            if word.startswith('*') and word.endswith('*'):
                # Special mechanical sound effects
                if 'click' in word.lower():
                    await self.send_jaw_command({"type": "jaw_move", "angle": 15, "duration": 0.1})
                    await asyncio.sleep(0.1)
                    await self.send_jaw_command({"type": "jaw_move", "angle": 0, "duration": 0.1})
                    await asyncio.sleep(0.2)
                elif 'whir' in word.lower():
                    # Smooth whirring motion
                    for angle in [10, 20, 15, 5]:
                        await self.send_jaw_command({"type": "jaw_move", "angle": angle, "duration": 0.15})
                        await asyncio.sleep(0.15)
                continue
            
            # Calculate jaw movement based on word characteristics
            word_length = len(word)
            vowel_count = sum(1 for char in word.lower() if char in 'aeiou')
            
            # Base angle on word complexity
            base_angle = min(35, max(10, word_length * 3 + vowel_count * 2))
            
            # Add some variation
            import random
            angle_variation = random.uniform(0.8, 1.2)
            final_angle = base_angle * angle_variation
            
            # Animate jaw for this word
            await self.send_jaw_command({
                "type": "jaw_move",
                "angle": final_angle,
                "duration": 0.2
            })
            
            # Hold position briefly
            await asyncio.sleep(0.15)
            
            # Close slightly between words
            await self.send_jaw_command({
                "type": "jaw_move", 
                "angle": final_angle * 0.3,
                "duration": 0.1
            })
            
            # Pause between words
            word_pause = 0.3 if word.endswith(('.', '!', '?')) else 0.15
            await asyncio.sleep(word_pause)
    
    def stop_speaking(self):
        """Stop current speech and jaw movement"""
        self.is_speaking = False
        if self.current_audio_process:
            self.current_audio_process.terminate()
            self.current_audio_process = None
    
    async def process_message(self, user_message: str) -> str:
        """Process user message and generate response with audio"""
        logger.info(f"Processing message: {user_message}")
        
        # Stop any current speech
        self.stop_speaking()
        
        # Generate AI response
        ai_response = self.generate_ai_response(user_message)
        logger.info(f"AI Response: {ai_response}")
        
        # Generate speech audio
        audio_file = self.text_to_speech(ai_response)
        
        if audio_file:
            # Play audio with jaw synchronization
            await self.play_audio_with_jaw_sync(audio_file, ai_response)
        else:
            # Fallback: just animate jaw without audio
            logger.warning("Audio generation failed, using jaw animation only")
            await self.animate_jaw_for_speech(ai_response)
        
        return ai_response
    
    async def cleanup(self):
        """Clean up resources"""
        self.stop_speaking()
        if self.websocket:
            await self.websocket.close()
        logger.info("Character AI System cleaned up")

async def test_character_ai():
    """Test the character AI system"""
    ai_system = CharacterAISystem()
    
    # Connect to jaw control
    if not await ai_system.connect_to_jaw_control():
        logger.error("Failed to connect to jaw control")
        return False
    
    try:
        # Test messages
        test_messages = [
            "Hello ChatterPi! How are you today?",
            "What's it like being an animatronic?",
            "Can you tell me a joke?",
            "What do you think about artificial intelligence?"
        ]
        
        for message in test_messages:
            logger.info(f"\n{'='*50}")
            logger.info(f"USER: {message}")
            
            response = await ai_system.process_message(message)
            logger.info(f"CHATTERPI: {response}")
            
            # Wait a bit between messages
            await asyncio.sleep(2)
        
        logger.info("✅ Character AI test completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"Test failed: {e}")
        return False
    finally:
        await ai_system.cleanup()

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="ChatterPi Character AI System")
    parser.add_argument("--test", action="store_true", help="Run test mode")
    parser.add_argument("--websocket-url", default="ws://192.168.8.130:8765", 
                       help="WebSocket URL for jaw control")
    
    args = parser.parse_args()
    
    if args.test:
        # Run test
        success = asyncio.run(test_character_ai())
        exit(0 if success else 1)
    else:
        logger.info("Character AI System ready. Use --test to run test mode.")

class ChatterPiWebSocketHandler:
    """WebSocket handler for chat interface integration"""

    def __init__(self, ai_system: CharacterAISystem):
        self.ai_system = ai_system
        self.chat_clients = set()

    async def handle_chat_client(self, websocket, path):
        """Handle chat client WebSocket connection"""
        self.chat_clients.add(websocket)
        logger.info(f"Chat client connected: {websocket.remote_address}")

        try:
            await websocket.send(json.dumps({
                "type": "welcome",
                "character": self.ai_system.character.name,
                "message": f"Hello! I'm {self.ai_system.character.name}, ready to chat!"
            }))

            async for message in websocket:
                try:
                    data = json.loads(message)
                    if data.get("type") == "chat_message":
                        user_message = data.get("message", "")

                        # Send typing indicator to all clients
                        await self.broadcast_to_chat_clients({
                            "type": "typing_start",
                            "character": self.ai_system.character.name
                        })

                        # Process message with AI
                        ai_response = await self.ai_system.process_message(user_message)

                        # Send response to all clients
                        await self.broadcast_to_chat_clients({
                            "type": "chat_response",
                            "character": self.ai_system.character.name,
                            "message": ai_response,
                            "timestamp": time.time()
                        })

                        # Stop typing indicator
                        await self.broadcast_to_chat_clients({
                            "type": "typing_stop"
                        })

                except json.JSONDecodeError:
                    logger.error("Invalid JSON from chat client")
                except Exception as e:
                    logger.error(f"Error processing chat message: {e}")

        except websockets.exceptions.ConnectionClosed:
            logger.info("Chat client disconnected")
        finally:
            self.chat_clients.discard(websocket)

    async def broadcast_to_chat_clients(self, message: Dict[str, Any]):
        """Broadcast message to all connected chat clients"""
        if self.chat_clients:
            disconnected = set()
            for client in self.chat_clients:
                try:
                    await client.send(json.dumps(message))
                except websockets.exceptions.ConnectionClosed:
                    disconnected.add(client)

            # Remove disconnected clients
            self.chat_clients -= disconnected

async def run_integrated_server():
    """Run integrated server with AI, jaw control, and chat interface"""
    import websockets

    # Initialize AI system
    ai_system = CharacterAISystem(websocket_url="ws://localhost:8765")

    # Connect to jaw control
    if not await ai_system.connect_to_jaw_control():
        logger.error("Failed to connect to jaw control")
        return False

    # Create chat handler
    chat_handler = ChatterPiWebSocketHandler(ai_system)

    # Start chat WebSocket server
    logger.info("🚀 Starting ChatterPi Integrated Server...")
    logger.info("💬 Chat WebSocket: ws://localhost:8766")

    try:
        async with websockets.serve(chat_handler.handle_chat_client, "0.0.0.0", 8766):
            logger.info("✅ ChatterPi Integrated Server running!")
            logger.info("🎭 AI Character ready for conversation with audio!")

            # Keep server running
            await asyncio.Future()  # Run forever

    except Exception as e:
        logger.error(f"Server error: {e}")
        return False
    finally:
        await ai_system.cleanup()

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "server":
        asyncio.run(run_integrated_server())
    else:
        main()
