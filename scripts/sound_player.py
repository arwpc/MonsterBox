import sys
import pygame # type: ignore
import time
import json
from threading import Thread
import os
import signal
import traceback

def log_message(message):
    print(json.dumps(message), flush=True)

os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = "hide"
# Use the SDL_AUDIODRIVER from the environment, defaulting to 'pipewire'
os.environ['SDL_AUDIODRIVER'] = os.environ.get('SDL_AUDIODRIVER', 'pipewire')

class SoundPlayer:
    def __init__(self):
        log_message({"status": "info", "message": "Initializing SoundPlayer"})
        self.init_pygame_mixer(retries=3)
        self.sounds = {}
        self.next_channel_id = 0
        log_message({"status": "ready", "message": "SoundPlayer initialized and ready"})

    def init_pygame_mixer(self, retries=3):
        for attempt in range(retries):
            try:
                pygame.init()
                frequency = int(os.environ.get('PYGAME_MIXER_INIT_FREQUENCY', '44100'))
                size = int(os.environ.get('PYGAME_MIXER_INIT_SIZE', '-16'))
                channels = int(os.environ.get('PYGAME_MIXER_INIT_CHANNELS', '2'))
                buffer = int(os.environ.get('PYGAME_MIXER_INIT_BUFFER', '2048'))
                
                pygame.mixer.init(frequency=frequency, size=size, channels=channels, buffer=buffer)
                log_message({"status": "info", "message": "pygame.mixer initialized successfully"})
                
                log_message({"status": "info", "message": f"SDL_AUDIODRIVER: {os.environ.get('SDL_AUDIODRIVER', 'Not set')}"})
                log_message({"status": "info", "message": f"Pygame audio driver: {pygame.mixer.get_init()}"})
                log_message({"status": "info", "message": f"Mixer settings: frequency={frequency}, size={size}, channels={channels}, buffer={buffer}"})
                
                pygame.mixer.set_num_channels(32)  # Set a higher number of channels for concurrent playback
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
            log_message({"status": "info", "message": f"Sound file loaded. Length: {sound.get_length()} seconds"})
            
            channel = pygame.mixer.find_channel()
            if channel is None:
                log_message({"status": "error", "message": "No available channel to play sound"})
                return
            
            channel_id = self.next_channel_id
            self.next_channel_id += 1
            
            log_message({"status": "info", "message": f"Playing sound on channel {channel_id}"})
            channel.play(sound)
            self.sounds[sound_id] = (sound, channel, channel_id)
            log_message({"status": "playing", "sound_id": sound_id, "file": file_path, "channel": channel_id})
            
            # Start a new thread to wait for the sound to finish
            Thread(target=self._wait_for_sound_end, args=(sound_id, channel, channel_id)).start()
            
        except FileNotFoundError as e:
            log_message({"status": "error", "sound_id": sound_id, "file": file_path, "message": str(e)})
        except Exception as e:
            log_message({"status": "error", "sound_id": sound_id, "file": file_path, "message": str(e), "traceback": traceback.format_exc()})

    def _wait_for_sound_end(self, sound_id, channel, channel_id):
        start_time = time.time()
        while channel.get_busy():
            time.sleep(0.1)
        end_time = time.time()
        duration = end_time - start_time
        log_message({"status": "finished", "sound_id": sound_id, "duration": duration, "channel": channel_id})
        if sound_id in self.sounds:
            del self.sounds[sound_id]

    def stop_sound(self, sound_id):
        if sound_id in self.sounds:
            _, channel, channel_id = self.sounds[sound_id]
            channel.stop()
            del self.sounds[sound_id]
            log_message({"status": "stopped", "sound_id": sound_id, "channel": channel_id})
        else:
            log_message({"status": "warning", "message": f"Sound {sound_id} not found or already stopped"})

    def stop_all_sounds(self):
        pygame.mixer.stop()
        self.sounds.clear()
        log_message({"status": "info", "message": "All sounds stopped"})

    def get_sound_status(self, sound_id):
        if sound_id in self.sounds:
            _, channel, channel_id = self.sounds[sound_id]
            is_playing = channel.get_busy()
            return {"status": "playing" if is_playing else "stopped", "sound_id": sound_id, "channel": channel_id}
        else:
            return {"status": "not_found", "sound_id": sound_id}

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

                parts = command.split("|")
                message_id = parts[0]
                cmd = parts[1]

                response = {"messageId": message_id}

                if cmd == "PLAY":
                    if len(parts) != 4:
                        response["status"] = "error"
                        response["message"] = f"Invalid PLAY command format: {command}"
                    else:
                        sound_id, file_path = parts[2], parts[3]
                        player.play_sound(sound_id, file_path)
                        response["status"] = "success"
                        response["message"] = "Sound playback started"
                elif cmd == "STOP":
                    if len(parts) != 3:
                        response["status"] = "error"
                        response["message"] = f"Invalid STOP command format: {command}"
                    else:
                        sound_id = parts[2]
                        player.stop_sound(sound_id)
                        response["status"] = "success"
                        response["message"] = "Sound stopped"
                elif cmd == "STOP_ALL":
                    player.stop_all_sounds()
                    response["status"] = "success"
                    response["message"] = "All sounds stopped"
                elif cmd == "STATUS":
                    if len(parts) != 3:
                        response["status"] = "error"
                        response["message"] = f"Invalid STATUS command format: {command}"
                    else:
                        sound_id = parts[2]
                        status = player.get_sound_status(sound_id)
                        response.update(status)
                else:
                    response["status"] = "error"
                    response["message"] = f"Unknown command: {cmd}"

                log_message(response)

            except EOFError:
                log_message({"status": "info", "message": "Received EOF. Waiting for more input."})
                time.sleep(1)  # Wait a bit before trying to read input again
            except Exception as e:
                log_message({"status": "error", "message": f"Command processing error: {str(e)}", "traceback": traceback.format_exc()})

    except Exception as e:
        log_message({"status": "error", "message": f"Failed to initialize or run SoundPlayer: {str(e)}", "traceback": traceback.format_exc()})
    finally:
        log_message({"status": "info", "message": "Quitting pygame mixer"})
        pygame.mixer.quit()
        pygame.quit()
        log_message({"status": "exit", "message": "SoundPlayer exiting"})
