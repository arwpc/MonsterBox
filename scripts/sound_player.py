import sys
import pygame
import time
import json
from threading import Thread
import os
import subprocess
import signal

def log_message(message):
    print(json.dumps(message), flush=True)

def set_alsa_params():
    try:
        for card in range(5):  # Check cards 0 to 4
            try:
                subprocess.run(["amixer", "-c", str(card), "sset", "PCM", "100%"], check=True, stderr=subprocess.DEVNULL)
                log_message({"status": "info", "message": f"ALSA parameters set successfully for card {card}"})
                return
            except subprocess.CalledProcessError:
                continue
        
        subprocess.run(["amixer", "sset", "Master", "100%"], check=True)
        log_message({"status": "info", "message": "Master volume set to 100%"})
        
        subprocess.run(["alsactl", "store"], check=True)
    except subprocess.CalledProcessError as e:
        log_message({"status": "error", "message": f"Failed to set ALSA parameters: {str(e)}"})

if 'XDG_RUNTIME_DIR' not in os.environ:
    runtime_dir = f"/run/user/{os.getuid()}"
    os.environ['XDG_RUNTIME_DIR'] = runtime_dir
    log_message({"status": "info", "message": f"Set XDG_RUNTIME_DIR to {runtime_dir}"})

os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = "hide"
os.environ['SDL_AUDIODRIVER'] = 'alsa'

def find_audio_device():
    try:
        result = subprocess.run(["aplay", "-l"], capture_output=True, text=True, check=True)
        lines = result.stdout.split('\n')
        log_message({"status": "info", "message": f"Audio devices found: {lines}"})
        for line in lines:
            if "USB Audio Device" in line:
                card = line.split(':')[0].split(' ')[-1]
                log_message({"status": "info", "message": f"Found USB Audio Device: card {card}"})
                return f"plughw:{card},0"
        log_message({"status": "warning", "message": "USB Audio Device not found in device list"})
    except subprocess.CalledProcessError as e:
        log_message({"status": "error", "message": f"Error finding audio devices: {str(e)}"})
    
    log_message({"status": "warning", "message": "USB Audio Device not found, using default"})
    return 'default'

os.environ['AUDIODEV'] = find_audio_device()

class SoundPlayer:
    def __init__(self):
        log_message({"status": "info", "message": "Initializing SoundPlayer"})
        set_alsa_params()
        self.init_pygame_mixer(retries=3)
        self.sounds = {}
        log_message({"status": "ready", "message": "SoundPlayer initialized and ready"})

    def init_pygame_mixer(self, retries=3):
        for attempt in range(retries):
            try:
                pygame.mixer.pre_init(frequency=44100, size=-16, channels=2, buffer=4096)
                pygame.init()
                pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=8192)
                pygame.mixer.set_num_channels(32)  # Set a higher number of channels for concurrent playback
                log_message({"status": "info", "message": "pygame.mixer initialized successfully"})
                
                log_message({"status": "info", "message": f"SDL_AUDIODRIVER: {os.environ.get('SDL_AUDIODRIVER', 'Not set')}"})
                log_message({"status": "info", "message": f"AUDIODEV: {os.environ.get('AUDIODEV', 'Not set')}"})
                log_message({"status": "info", "message": f"Pygame audio driver: {pygame.mixer.get_init()}"})
                log_message({"status": "info", "message": f"Pygame mixer info: {pygame.mixer.get_init()}"})
                
                pygame.mixer.music.set_volume(1.0)
                log_message({"status": "info", "message": f"Volume set to: {pygame.mixer.music.get_volume()}"})
                return
            except pygame.error as e:
                log_message({"status": "error", "message": f"Failed to initialize pygame mixer (attempt {attempt + 1}): {str(e)}"})
                if attempt == retries - 1:
                    raise

    def play_sound(self, sound_id, file_path):
        try:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Sound file not found: {file_path}")
            
            log_message({"status": "info", "message": f"Loading sound file: {file_path}"})
            sound = pygame.mixer.Sound(file_path)
            channel = pygame.mixer.find_channel()
            if channel is None:
                log_message({"status": "error", "message": "No available channel to play sound"})
                return
            
            channel.play(sound)
            self.sounds[sound_id] = (sound, channel)
            log_message({"status": "playing", "sound_id": sound_id, "file": file_path})
            
            # Start a new thread to wait for the sound to finish
            Thread(target=self._wait_for_sound_end, args=(sound_id, channel)).start()
            
        except FileNotFoundError as e:
            log_message({"status": "error", "sound_id": sound_id, "file": file_path, "message": str(e)})
        except Exception as e:
            log_message({"status": "error", "sound_id": sound_id, "file": file_path, "message": str(e)})

    def _wait_for_sound_end(self, sound_id, channel):
        start_time = time.time()
        while channel.get_busy():
            time.sleep(0.1)
        end_time = time.time()
        duration = end_time - start_time
        log_message({"status": "finished", "sound_id": sound_id, "duration": duration})
        if sound_id in self.sounds:
            del self.sounds[sound_id]

    def stop_sound(self, sound_id):
        if sound_id in self.sounds:
            _, channel = self.sounds[sound_id]
            channel.stop()
            del self.sounds[sound_id]
            log_message({"status": "stopped", "sound_id": sound_id})

def signal_handler(signum, frame):
    log_message({"status": "info", "message": f"Received signal {signum}. Exiting gracefully."})
    pygame.mixer.quit()
    pygame.quit()
    sys.exit(0)

if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        log_message({"status": "info", "message": "Starting SoundPlayer"})
        player = SoundPlayer()

        log_message({"status": "info", "message": "Entering main loop"})
        while True:
            try:
                command = input().strip()
                log_message({"status": "info", "message": f"Received command: {command}"})
                if command == "EXIT":
                    break

                cmd, sound_id, file_path = command.split("|")
                if cmd == "PLAY":
                    player.play_sound(sound_id, file_path)
                elif cmd == "STOP":
                    player.stop_sound(sound_id)
            except EOFError:
                log_message({"status": "info", "message": "Received EOF. Waiting for more input."})
                time.sleep(1)  # Wait a bit before trying to read input again
            except Exception as e:
                log_message({"status": "error", "message": f"Command processing error: {str(e)}", "traceback": str(sys.exc_info())})

    except Exception as e:
        log_message({"status": "error", "message": f"Failed to initialize or run SoundPlayer: {str(e)}", "traceback": str(sys.exc_info())})
    finally:
        log_message({"status": "info", "message": "Quitting pygame mixer"})
        pygame.mixer.quit()
        pygame.quit()
        log_message({"status": "exit", "message": "SoundPlayer exiting"})
