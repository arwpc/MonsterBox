import sys
import pygame
import time
import json
from threading import Thread
import os
os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = "hide"

class SoundPlayer:
    def __init__(self):
        pygame.mixer.init()
        self.channels = {}

    def play_sound(self, sound_id, file_path):
        if sound_id in self.channels:
            self.channels[sound_id].stop()
        
        try:
            sound = pygame.mixer.Sound(file_path)
            channel = sound.play()
            self.channels[sound_id] = channel
            print(json.dumps({"status": "playing", "sound_id": sound_id, "file": file_path}))
            sys.stdout.flush()
            
            while channel.get_busy():
                time.sleep(0.1)
            
            print(json.dumps({"status": "finished", "sound_id": sound_id, "file": file_path}))
            sys.stdout.flush()
        except Exception as e:
            print(json.dumps({"status": "error", "sound_id": sound_id, "file": file_path, "error": str(e)}))
            sys.stdout.flush()

    def stop_sound(self, sound_id):
        if sound_id in self.channels:
            self.channels[sound_id].stop()
            print(json.dumps({"status": "stopped", "sound_id": sound_id}))
            sys.stdout.flush()

if __name__ == "__main__":
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
            print(json.dumps({"status": "error", "error": str(e)}))
            sys.stdout.flush()

    pygame.mixer.quit()