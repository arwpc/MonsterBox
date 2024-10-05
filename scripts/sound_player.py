# File: scripts/sound_player.py

import sys
import pygame
import time
import json
from threading import Thread
import os

def log_message(message):
    print(json.dumps(message))
    sys.stdout.flush()

os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = "hide"
os.environ['SDL_AUDIODRIVER'] = 'alsa'  # Set SDL audio driver to ALSA

class SoundPlayer:
    def __init__(self):
        log_message({"status": "info", "message": "Initializing SoundPlayer"})
        try:
            pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=4096)
            log_message({"status": "info", "message": "pygame.mixer initialized successfully"})
        except pygame.error as e:
            log_message({"status": "error", "error": f"Failed to initialize pygame mixer: {str(e)}"})
            raise

        self.channels = {}
        log_message({"status": "ready", "message": "SoundPlayer initialized and ready"})

    def play_sound(self, sound_id, file_path):
        if sound_id in self.channels:
            self.channels[sound_id].stop()
        
        try:
            log_message({"status": "info", "message": f"Loading sound file: {file_path}"})
            sound = pygame.mixer.Sound(file_path)
            channel = sound.play()
            self.channels[sound_id] = channel
            log_message({"status": "playing", "sound_id": sound_id, "file": file_path})
            
            while channel.get_busy():
                time.sleep(0.1)
            
            log_message({"status": "finished", "sound_id": sound_id, "file": file_path})
        except Exception as e:
            log_message({"status": "error", "sound_id": sound_id, "file": file_path, "error": str(e)})

    def stop_sound(self, sound_id):
        if sound_id in self.channels:
            self.channels[sound_id].stop()
            log_message({"status": "stopped", "sound_id": sound_id})

if __name__ == "__main__":
    try:
        log_message({"status": "info", "message": "Starting SoundPlayer"})
        player = SoundPlayer()

        while True:
            try:
                command = input().strip()
                if command == "EXIT":
                    break

                cmd, sound_id, file_path = command.split("|")
                if cmd == "PLAY":
                    Thread(target=player.play_sound, args=(sound_id, file_path)).start()
                elif cmd == "STOP":
                    player.stop_sound(sound_id)
            except Exception as e:
                log_message({"status": "error", "error": f"Command processing error: {str(e)}"})

    except Exception as e:
        log_message({"status": "error", "error": f"Failed to initialize or run SoundPlayer: {str(e)}"})
    finally:
        log_message({"status": "info", "message": "Quitting pygame mixer"})
        pygame.mixer.quit()
        log_message({"status": "exit", "message": "SoundPlayer exiting"})