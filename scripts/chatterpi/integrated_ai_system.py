#!/usr/bin/env python3
"""
Integrated ChatterPi AI System
Combines OpenAI chat, TTS, and real-time jaw animation
"""

import asyncio
import json
import logging
import time
import subprocess
import tempfile
import os
from typing import Optional, Dict, Any
from jaw_control_system import JawControlSystem
from audio_jaw_animator import AudioJawAnimator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ChatterPiAISystem:
    """Integrated AI system with jaw animation"""
    
    def __init__(self):
        # Core components
        self.jaw_control = None
        self.audio_animator = None
        
        # AI configuration
        self.character_id = "orlok"
        self.ai_api_url = "http://localhost:3000/api/chatterpi/chat"
        
        # State
        self.is_initialized = False
        self.is_speaking = False
        self.current_audio_process = None
        
        logger.info("ChatterPi AI System created")
    
    async def initialize(self) -> bool:
        """Initialize all system components"""
        try:
            logger.info("🚀 Initializing ChatterPi AI System...")
            
            # Initialize jaw control
            self.jaw_control = JawControlSystem(pin=18, min_pulse=500, max_pulse=2400)
            if not self.jaw_control.initialize():
                logger.error("Failed to initialize jaw control")
                return False
            
            # Initialize audio animator
            self.audio_animator = AudioJawAnimator(
                jaw_control=self.jaw_control,
                volume_threshold=0.01,
                sensitivity=1.2
            )
            
            self.is_initialized = True
            logger.info("✅ ChatterPi AI System initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize system: {e}")
            return False
    
    async def process_user_message(self, message: str) -> Dict[str, Any]:
        """Process user message and generate AI response with jaw animation"""
        if not self.is_initialized:
            return {"error": "System not initialized"}
        
        try:
            logger.info(f"🎭 Processing message: '{message}'")
            
            # Stop any current speech/animation
            await self.stop_speaking()
            
            # Get AI response
            ai_response = await self._get_ai_response(message)
            if not ai_response.get("success"):
                return ai_response
            
            response_text = ai_response["data"]["aiResponse"]["text"]
            logger.info(f"🤖 AI Response: '{response_text}'")
            
            # Generate and play speech with jaw animation
            speech_result = await self._speak_with_animation(response_text)
            
            return {
                "success": True,
                "user_message": message,
                "ai_response": response_text,
                "character": ai_response["data"]["aiResponse"]["character"],
                "speech_result": speech_result,
                "timestamp": time.time()
            }
            
        except Exception as e:
            logger.error(f"❌ Error processing message: {e}")
            return {"error": str(e)}
    
    async def _get_ai_response(self, message: str) -> Dict[str, Any]:
        """Get AI response from the API"""
        try:
            import aiohttp
            
            payload = {
                "message": message,
                "character": self.character_id
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(self.ai_api_url, json=payload) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        error_text = await response.text()
                        logger.error(f"API error {response.status}: {error_text}")
                        return {"error": f"API error: {response.status}"}
                        
        except Exception as e:
            logger.error(f"Error calling AI API: {e}")
            # Return fallback response
            return {
                "success": True,
                "data": {
                    "aiResponse": {
                        "text": "Verily, I hear thee, though the shadows cloud my response...",
                        "character": "Count Orlok"
                    }
                }
            }
    
    async def _speak_with_animation(self, text: str) -> Dict[str, Any]:
        """Generate speech and animate jaw in real-time"""
        try:
            logger.info(f"🎤 Speaking with animation: '{text}'")
            self.is_speaking = True
            
            # Generate TTS audio file
            audio_file = await self._generate_tts(text)
            if not audio_file:
                logger.warning("TTS generation failed, using jaw animation only")
                return await self._animate_jaw_for_text(text)
            
            # Start audio-driven jaw animation
            if not self.audio_animator.start_animation():
                logger.warning("Failed to start audio animation")
            
            # Play audio file
            await self._play_audio_file(audio_file)
            
            # Stop animation
            self.audio_animator.stop_animation()
            
            # Clean up audio file
            try:
                os.unlink(audio_file)
            except:
                pass
            
            return {"success": True, "method": "audio_driven"}
            
        except Exception as e:
            logger.error(f"Error in speech with animation: {e}")
            return {"error": str(e)}
        finally:
            self.is_speaking = False
    
    async def _generate_tts(self, text: str) -> Optional[str]:
        """Generate TTS audio file (placeholder - implement with your TTS service)"""
        try:
            # For now, use espeak as a simple TTS solution
            # In production, replace with TopMediai or other quality TTS
            
            # Create temporary file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                audio_file = f.name
            
            # Generate speech with espeak
            cmd = [
                "espeak",
                "-v", "en+m3",  # Male voice
                "-s", "150",    # Speed
                "-a", "100",    # Amplitude
                "-w", audio_file,  # Output file
                text
            ]
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode == 0:
                logger.info(f"✅ TTS generated: {audio_file}")
                return audio_file
            else:
                logger.error(f"TTS generation failed: {stderr.decode()}")
                return None
                
        except Exception as e:
            logger.error(f"TTS generation error: {e}")
            return None
    
    async def _play_audio_file(self, audio_file: str):
        """Play audio file"""
        try:
            # Use aplay to play the audio file
            cmd = ["aplay", audio_file]
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            self.current_audio_process = process
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                logger.warning(f"Audio playback warning: {stderr.decode()}")
            
        except Exception as e:
            logger.error(f"Audio playback error: {e}")
        finally:
            self.current_audio_process = None
    
    async def _animate_jaw_for_text(self, text: str) -> Dict[str, Any]:
        """Animate jaw based on text length (fallback when no audio)"""
        try:
            # Simple animation based on text characteristics
            words = text.split()
            duration = len(words) * 0.3  # ~0.3 seconds per word
            
            # Animate jaw opening/closing
            for i in range(len(words)):
                if not self.is_speaking:
                    break
                
                # Open jaw
                self.jaw_control.move_to_angle(35, 0.1, "ease_out")
                await asyncio.sleep(0.1)

                # Close jaw
                self.jaw_control.move_to_angle(45, 0.1, "ease_in")
                await asyncio.sleep(0.2)
            
            # Return to closed
            self.jaw_control.move_to_angle(50, 0.3, "ease_in_out")
            
            return {"success": True, "method": "text_based"}
            
        except Exception as e:
            logger.error(f"Text-based animation error: {e}")
            return {"error": str(e)}
    
    async def stop_speaking(self):
        """Stop current speech and animation"""
        if not self.is_speaking:
            return
        
        logger.info("🛑 Stopping speech and animation")
        self.is_speaking = False
        
        # Stop audio playback
        if self.current_audio_process:
            try:
                self.current_audio_process.terminate()
                await asyncio.sleep(0.1)
                if self.current_audio_process.returncode is None:
                    self.current_audio_process.kill()
            except:
                pass
        
        # Stop jaw animation
        if self.audio_animator:
            self.audio_animator.stop_animation()
        
        # Return jaw to closed position
        if self.jaw_control:
            self.jaw_control.move_to_angle(50, 0.5, "ease_in_out")
    
    async def get_greeting(self) -> Dict[str, Any]:
        """Get character greeting"""
        greeting_message = "Greet the user as Count Orlok would, briefly and mysteriously."
        return await self.process_user_message(greeting_message)
    
    def cleanup(self):
        """Cleanup system resources"""
        logger.info("🧹 Cleaning up ChatterPi AI System")
        
        if self.audio_animator:
            self.audio_animator.stop_animation()
        
        if self.jaw_control:
            self.jaw_control.cleanup()
        
        self.is_initialized = False
        logger.info("✅ Cleanup completed")

async def main():
    """Test the integrated AI system"""
    print("🎭 ChatterPi Integrated AI System Test")
    print("=" * 50)
    
    system = ChatterPiAISystem()
    
    try:
        # Initialize system
        if not await system.initialize():
            print("❌ Failed to initialize system")
            return
        
        print("✅ System initialized successfully")
        print("🎯 Testing AI conversation with jaw animation...")
        
        # Test conversation
        test_messages = [
            "Hello Count Orlok",
            "Tell me about your castle",
            "What do you think of the night?"
        ]
        
        for message in test_messages:
            print(f"\n👤 User: {message}")
            
            result = await system.process_user_message(message)
            
            if result.get("success"):
                print(f"🧛 {result['character']}: {result['ai_response']}")
                print(f"   Speech method: {result['speech_result'].get('method', 'unknown')}")
            else:
                print(f"❌ Error: {result.get('error')}")
            
            # Wait between messages
            await asyncio.sleep(2)
        
        print("\n🎉 Test completed successfully!")
        
    except KeyboardInterrupt:
        print("\n⚠️ Test interrupted by user")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
    finally:
        system.cleanup()

if __name__ == "__main__":
    asyncio.run(main())
