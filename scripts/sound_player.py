# File: scripts/sound_player.py

import sys
import pygame
import time
import json
import signal
from threading import Thread, Event

class SoundPlayer:
    def __init__(self):
        pygame.mixer.init()
        self.channels = {}
        self.exit_event = Event()

    def play_sound(self, sound_id, file_path):
        if sound_id in self.channels:
            self.channels[sound_id].stop()
        
        try:
            sound = pygame.mixer.Sound(file_path)
            channel = sound.play()
            self.channels[sound_id] = channel
            print(json.dumps({"status": "playing", "sound_id": sound_id, "file": file_path}))
            sys.stdout.flush()
            
            while channel.get_busy() and not self.exit_event.is_set():
                time.sleep(0.1)
            
            if not self.exit_event.is_set():
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

    def stop_all_sounds(self):
        for sound_id in self.channels:
            self.channels[sound_id].stop()
        print(json.dumps({"status": "all_stopped"}))
        sys.stdout.flush()

    def run(self):
        while not self.exit_event.is_set():
            try:
                command = input().strip()
                if command == "EXIT":
                    break

                cmd, sound_id, file_path = command.split("|")
                if cmd == "PLAY":
                    Thread(target=self.play_sound, args=(sound_id, file_path)).start()
                elif cmd == "STOP":
                    self.stop_sound(sound_id)
            except Exception as e:
                print(json.dumps({"status": "error", "error": str(e)}))
                sys.stdout.flush()

        self.stop_all_sounds()
        pygame.mixer.quit()

def signal_handler(signum, frame):
    player.exit_event.set()

if __name__ == "__main__":
    player = SoundPlayer()
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    player.run()
