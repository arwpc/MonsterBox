#!/usr/bin/env python3
"""
Audio Source Adapters for ChatterPi Animation System
Provides adapters for different audio input sources to drive animatronic control
Supports microphone, file playback, streaming TTS, and WebSocket audio sources
"""

import asyncio
import threading
import time
import logging
import json
import numpy as np
import io
import tempfile
import os
from typing import Optional, Dict, Any, Callable, Union, List
import requests
from urllib.parse import urlparse

from generic_audio_stream_handler import (
    GenericAudioStreamHandler, 
    AudioSourceType, 
    AudioStreamConfig
)

# Audio processing imports
try:
    import pyaudio
    PYAUDIO_AVAILABLE = True
except ImportError:
    PYAUDIO_AVAILABLE = False

try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False

try:
    import websockets
    WEBSOCKETS_AVAILABLE = True
except ImportError:
    WEBSOCKETS_AVAILABLE = False

logger = logging.getLogger(__name__)

class MicrophoneAdapter:
    """Adapter for microphone input using PyAudio"""
    
    def __init__(self, stream_handler: GenericAudioStreamHandler):
        self.stream_handler = stream_handler
        self.audio = None
        self.stream = None
        self.is_recording = False
        
        if not PYAUDIO_AVAILABLE:
            raise RuntimeError("PyAudio not available - cannot use microphone input")
    
    def start_recording(self) -> bool:
        """Start recording from microphone"""
        try:
            self.audio = pyaudio.PyAudio()
            
            self.stream = self.audio.open(
                format=pyaudio.paFloat32,
                channels=self.stream_handler.config.channels,
                rate=self.stream_handler.config.sample_rate,
                input=True,
                frames_per_buffer=self.stream_handler.config.chunk_size,
                stream_callback=self._audio_callback
            )
            
            self.stream.start_stream()
            self.is_recording = True
            
            logger.info("🎤 Microphone recording started")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start microphone recording: {e}")
            return False
    
    def stop_recording(self):
        """Stop microphone recording"""
        self.is_recording = False
        
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
            self.stream = None
        
        if self.audio:
            self.audio.terminate()
            self.audio = None
        
        logger.info("🎤 Microphone recording stopped")
    
    def _audio_callback(self, in_data, frame_count, time_info, status):
        """PyAudio callback for microphone input"""
        if self.is_recording:
            try:
                audio_data = np.frombuffer(in_data, dtype=np.float32)
                self.stream_handler.add_audio_data(
                    audio_data, 
                    AudioSourceType.MICROPHONE,
                    self.stream_handler.config.sample_rate
                )
            except Exception as e:
                logger.error(f"Error in microphone callback: {e}")
        
        return (None, pyaudio.paContinue)

class AudioFileAdapter:
    """Adapter for audio file playback"""
    
    def __init__(self, stream_handler: GenericAudioStreamHandler):
        self.stream_handler = stream_handler
        self.is_playing = False
        self.playback_thread = None
        
        if not PYDUB_AVAILABLE:
            logger.warning("Pydub not available - audio file support limited")
    
    def play_file(self, file_path: str, real_time: bool = True) -> bool:
        """
        Play audio file and stream to animatronic control system

        Args:
            file_path: Path to audio file
            real_time: If True, play at normal speed. If False, process as fast as possible
        """
        try:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Audio file not found: {file_path}")
            
            self.is_playing = True
            
            if real_time:
                self.playback_thread = threading.Thread(
                    target=self._play_file_realtime, 
                    args=(file_path,)
                )
            else:
                self.playback_thread = threading.Thread(
                    target=self._process_file_fast, 
                    args=(file_path,)
                )
            
            self.playback_thread.daemon = True
            self.playback_thread.start()
            
            logger.info(f"🎵 Started playing audio file: {file_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to play audio file: {e}")
            self.is_playing = False
            return False
    
    def stop_playback(self):
        """Stop audio file playback"""
        self.is_playing = False
        
        if self.playback_thread and self.playback_thread.is_alive():
            self.playback_thread.join(timeout=2.0)
        
        logger.info("🎵 Audio file playback stopped")
    
    def _play_file_realtime(self, file_path: str):
        """Play audio file in real-time"""
        try:
            if PYDUB_AVAILABLE:
                # Use pydub for better format support
                audio = AudioSegment.from_file(file_path)
                
                # Convert to the required format
                audio = audio.set_frame_rate(self.stream_handler.config.sample_rate)
                audio = audio.set_channels(self.stream_handler.config.channels)
                
                # Get raw audio data
                raw_data = audio.raw_data
                sample_width = audio.sample_width
                
                # Convert to float32
                if sample_width == 2:  # 16-bit
                    audio_array = np.frombuffer(raw_data, dtype=np.int16).astype(np.float32) / 32768.0
                elif sample_width == 4:  # 32-bit
                    audio_array = np.frombuffer(raw_data, dtype=np.int32).astype(np.float32) / 2147483648.0
                else:
                    audio_array = np.frombuffer(raw_data, dtype=np.float32)
                
            else:
                # Fallback to basic wave file support
                import wave
                with wave.open(file_path, 'rb') as wav_file:
                    frames = wav_file.readframes(wav_file.getnframes())
                    audio_array = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
            
            # Stream audio in chunks
            chunk_size = self.stream_handler.config.chunk_size
            chunk_duration = chunk_size / self.stream_handler.config.sample_rate
            
            for i in range(0, len(audio_array), chunk_size):
                if not self.is_playing:
                    break
                
                chunk = audio_array[i:i + chunk_size]
                
                self.stream_handler.add_audio_data(
                    chunk,
                    AudioSourceType.AUDIO_FILE,
                    self.stream_handler.config.sample_rate,
                    {'file_path': file_path, 'chunk_index': i // chunk_size}
                )
                
                # Sleep to maintain real-time playback
                time.sleep(chunk_duration)
            
        except Exception as e:
            logger.error(f"Error playing audio file: {e}")
        finally:
            self.is_playing = False
    
    def _process_file_fast(self, file_path: str):
        """Process audio file as fast as possible (for testing)"""
        try:
            if PYDUB_AVAILABLE:
                audio = AudioSegment.from_file(file_path)
                audio = audio.set_frame_rate(self.stream_handler.config.sample_rate)
                audio = audio.set_channels(self.stream_handler.config.channels)
                
                raw_data = audio.raw_data
                sample_width = audio.sample_width
                
                if sample_width == 2:
                    audio_array = np.frombuffer(raw_data, dtype=np.int16).astype(np.float32) / 32768.0
                else:
                    audio_array = np.frombuffer(raw_data, dtype=np.float32)
            else:
                import wave
                with wave.open(file_path, 'rb') as wav_file:
                    frames = wav_file.readframes(wav_file.getnframes())
                    audio_array = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
            
            # Process in chunks without delay
            chunk_size = self.stream_handler.config.chunk_size
            
            for i in range(0, len(audio_array), chunk_size):
                if not self.is_playing:
                    break
                
                chunk = audio_array[i:i + chunk_size]
                
                self.stream_handler.add_audio_data(
                    chunk,
                    AudioSourceType.AUDIO_FILE,
                    self.stream_handler.config.sample_rate,
                    {'file_path': file_path, 'chunk_index': i // chunk_size}
                )
                
                # Small delay to prevent overwhelming the processor
                time.sleep(0.001)
            
        except Exception as e:
            logger.error(f"Error processing audio file: {e}")
        finally:
            self.is_playing = False

class StreamingTTSAdapter:
    """Adapter for streaming TTS audio from TopMediai or other services"""
    
    def __init__(self, stream_handler: GenericAudioStreamHandler):
        self.stream_handler = stream_handler
        self.is_streaming = False
        self.stream_thread = None
    
    def stream_from_url(self, audio_url: str, metadata: Dict = None) -> bool:
        """Stream audio from URL (e.g., TopMediai TTS result)"""
        try:
            self.is_streaming = True
            
            self.stream_thread = threading.Thread(
                target=self._stream_from_url_worker,
                args=(audio_url, metadata or {})
            )
            self.stream_thread.daemon = True
            self.stream_thread.start()
            
            logger.info(f"🌐 Started streaming from URL: {audio_url}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start URL streaming: {e}")
            self.is_streaming = False
            return False
    
    def stream_from_buffer(self, audio_buffer: bytes, format: str = 'mp3', metadata: Dict = None) -> bool:
        """Stream audio from memory buffer"""
        try:
            self.is_streaming = True
            
            self.stream_thread = threading.Thread(
                target=self._stream_from_buffer_worker,
                args=(audio_buffer, format, metadata or {})
            )
            self.stream_thread.daemon = True
            self.stream_thread.start()
            
            logger.info(f"🎵 Started streaming from buffer ({len(audio_buffer)} bytes)")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start buffer streaming: {e}")
            self.is_streaming = False
            return False
    
    def stop_streaming(self):
        """Stop TTS streaming"""
        self.is_streaming = False
        
        if self.stream_thread and self.stream_thread.is_alive():
            self.stream_thread.join(timeout=2.0)
        
        logger.info("🌐 TTS streaming stopped")
    
    def _stream_from_url_worker(self, audio_url: str, metadata: Dict):
        """Worker for streaming audio from URL"""
        try:
            # Download audio data
            response = requests.get(audio_url, stream=True, timeout=30)
            response.raise_for_status()
            
            # Collect audio data
            audio_data = b''
            for chunk in response.iter_content(chunk_size=8192):
                if not self.is_streaming:
                    break
                audio_data += chunk
            
            if self.is_streaming:
                # Process the complete audio
                self._process_audio_data(audio_data, metadata)
            
        except Exception as e:
            logger.error(f"Error streaming from URL: {e}")
        finally:
            self.is_streaming = False
    
    def _stream_from_buffer_worker(self, audio_buffer: bytes, format: str, metadata: Dict):
        """Worker for streaming audio from buffer"""
        try:
            self._process_audio_data(audio_buffer, metadata)
        except Exception as e:
            logger.error(f"Error streaming from buffer: {e}")
        finally:
            self.is_streaming = False
    
    def _process_audio_data(self, audio_data: bytes, metadata: Dict):
        """Process audio data and stream to animatronic control system"""
        try:
            if PYDUB_AVAILABLE:
                # Create temporary file for pydub
                with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as temp_file:
                    temp_file.write(audio_data)
                    temp_path = temp_file.name
                
                try:
                    # Load and convert audio
                    audio = AudioSegment.from_file(temp_path)
                    audio = audio.set_frame_rate(self.stream_handler.config.sample_rate)
                    audio = audio.set_channels(self.stream_handler.config.channels)
                    
                    # Convert to numpy array
                    raw_data = audio.raw_data
                    sample_width = audio.sample_width
                    
                    if sample_width == 2:
                        audio_array = np.frombuffer(raw_data, dtype=np.int16).astype(np.float32) / 32768.0
                    else:
                        audio_array = np.frombuffer(raw_data, dtype=np.float32)
                    
                    # Stream in real-time chunks
                    chunk_size = self.stream_handler.config.chunk_size
                    chunk_duration = chunk_size / self.stream_handler.config.sample_rate
                    
                    for i in range(0, len(audio_array), chunk_size):
                        if not self.is_streaming:
                            break
                        
                        chunk = audio_array[i:i + chunk_size]
                        
                        self.stream_handler.add_audio_data(
                            chunk,
                            AudioSourceType.STREAMING_TTS,
                            self.stream_handler.config.sample_rate,
                            {**metadata, 'chunk_index': i // chunk_size}
                        )
                        
                        # Maintain real-time playback
                        time.sleep(chunk_duration)
                
                finally:
                    # Clean up temporary file
                    try:
                        os.unlink(temp_path)
                    except:
                        pass
            
            else:
                logger.warning("Pydub not available - cannot process TTS audio")
        
        except Exception as e:
            logger.error(f"Error processing TTS audio data: {e}")

class WebSocketStreamAdapter:
    """Adapter for WebSocket audio streams"""
    
    def __init__(self, stream_handler: GenericAudioStreamHandler):
        self.stream_handler = stream_handler
        self.websocket = None
        self.is_connected = False
        
        if not WEBSOCKETS_AVAILABLE:
            raise RuntimeError("websockets library not available")
    
    async def connect(self, websocket_url: str) -> bool:
        """Connect to WebSocket audio stream"""
        try:
            self.websocket = await websockets.connect(websocket_url)
            self.is_connected = True
            
            logger.info(f"🔌 Connected to WebSocket: {websocket_url}")
            
            # Start listening for audio data
            asyncio.create_task(self._listen_for_audio())
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to WebSocket: {e}")
            return False
    
    async def disconnect(self):
        """Disconnect from WebSocket"""
        self.is_connected = False
        
        if self.websocket:
            await self.websocket.close()
            self.websocket = None
        
        logger.info("🔌 WebSocket disconnected")
    
    async def _listen_for_audio(self):
        """Listen for audio data from WebSocket"""
        try:
            async for message in self.websocket:
                if not self.is_connected:
                    break
                
                try:
                    # Parse message (assuming JSON format)
                    data = json.loads(message)
                    
                    if data.get('type') == 'audio_data':
                        # Extract audio data (assuming base64 encoded)
                        import base64
                        audio_bytes = base64.b64decode(data['data'])
                        audio_array = np.frombuffer(audio_bytes, dtype=np.float32)
                        
                        self.stream_handler.add_audio_data(
                            audio_array,
                            AudioSourceType.WEBSOCKET_STREAM,
                            data.get('sample_rate', self.stream_handler.config.sample_rate),
                            data.get('metadata', {})
                        )
                
                except json.JSONDecodeError:
                    # Assume raw audio data
                    audio_array = np.frombuffer(message, dtype=np.float32)
                    self.stream_handler.add_audio_data(
                        audio_array,
                        AudioSourceType.WEBSOCKET_STREAM
                    )
                
                except Exception as e:
                    logger.error(f"Error processing WebSocket message: {e}")
        
        except Exception as e:
            logger.error(f"WebSocket listening error: {e}")
        finally:
            self.is_connected = False
