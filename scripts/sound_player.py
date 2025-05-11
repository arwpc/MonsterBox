import sys
import time
import json
from threading import Thread, Lock
import os
import signal
import traceback
import subprocess
import psutil

def log_message(message):
    print(json.dumps(message), flush=True)

class SoundPlayer:
    def __init__(self):
        log_message({"status": "info", "message": "Initializing SoundPlayer"})
        self.sounds = {}
        self.sounds_lock = Lock()
        self.next_sound_id = 0

        # Test mpg123 installation
        try:
            version = subprocess.run(['mpg123', '--version'], capture_output=True, text=True)
            log_message({"status": "info", "message": f"MPG123 version: {version.stdout.strip()}"})
        except Exception as e:
            log_message({"status": "warning", "message": f"MPG123 test failed: {str(e)}"})

        log_message({"status": "ready", "message": "SoundPlayer initialized and ready"})

    def play_sound(self, sound_id, file_path, message_id=None):
        with open('/tmp/sound_player_play.log', 'a') as f:
            f.write(f"play_sound called with sound_id={sound_id}, file_path={file_path}\n")
        try:
            with open('/tmp/sound_player_play.log', 'a') as f:
                f.write("Checking if file exists...\n")
            if not os.path.exists(file_path):
                with open('/tmp/sound_player_play.log', 'a') as f:
                    f.write("File does not exist.\n")
                raise FileNotFoundError(f"Sound file not found: {file_path}")
            with open('/tmp/sound_player_play.log', 'a') as f:
                f.write("File exists. Checking file size...\n")
            file_size = os.path.getsize(file_path)
            with open('/tmp/sound_player_play.log', 'a') as f:
                f.write(f"File size is {file_size}\n")
            log_message({"status": "info", "message": f"Playing sound file: {file_path}, size: {file_size} bytes"})
            
            if file_size == 0:
                with open('/tmp/sound_player_play.log', 'a') as f:
                    f.write("File is empty.\n")
                raise Exception(f"Sound file is empty: {file_path}")
            with open('/tmp/sound_player_play.log', 'a') as f:
                f.write("Getting duration with mpg123...\n")
            # Get duration first
            duration_result = subprocess.run(['mpg123', '--skip', '0', '-t', file_path], 
                                          capture_output=True, text=True)
            with open('/tmp/sound_player_play.log', 'a') as f:
                f.write(f"Duration result: returncode={duration_result.returncode}, stderr={duration_result.stderr}\n")
            duration = None
            for line in duration_result.stderr.split('\n'):
                if 'Time:' in line:
                    duration = float(line.split()[-1])
                    break
            
            if duration:
                with open('/tmp/sound_player_play.log', 'a') as f:
                    f.write(f"Parsed duration: {duration}\n")
                log_message({"status": "info", "message": f"Sound duration: {duration} seconds"})
            with open('/tmp/sound_player_play.log', 'a') as f:
                f.write("Starting mpg123 playback subprocess...\n")
            # Use MPG123 to play the MP3 file
            log_message({"status": "info", "message": f"Starting playback: {file_path}"})
            process = subprocess.Popen(
                [
                    'mpg123',
                    '--quiet',
                    file_path
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            with open('/tmp/sound_player_play.log', 'a') as f:
                f.write(f"mpg123 subprocess started with pid {process.pid}\n")
            
            with self.sounds_lock:
                self.sounds[sound_id] = process
            
            # Send initial playing status
            log_message({"status": "playing", "sound_id": sound_id, "file": file_path})
            
            # Start a new thread to wait for the sound to finish
            Thread(target=self._wait_for_sound_end, args=(sound_id, process, file_path, duration, message_id)).start()
            
        except FileNotFoundError as e:
            with open('/tmp/sound_player_play.log', 'a') as f:
                f.write(f"FileNotFoundError: {str(e)}\n")
            log_message({"status": "error", "sound_id": sound_id, "file": file_path, "message": str(e)})
        except Exception as e:
            with open('/tmp/sound_player_play.log', 'a') as f:
                f.write(f"Exception: {str(e)}\nTraceback: {traceback.format_exc()}\n")
            log_message({"status": "error", "sound_id": sound_id, "file": file_path, "message": str(e), "traceback": traceback.format_exc()})

    def _wait_for_sound_end(self, sound_id, process, file_path, duration, message_id=None):
        start_time = time.time()
        try:
            stdout, stderr = process.communicate()
            end_time = time.time()
            actual_duration = end_time - start_time
            
            if stdout:
                log_message({"status": "info", "message": f"MPG123 stdout: {stdout.decode('utf-8', errors='ignore')}"})
            if stderr:
                log_message({"status": "info", "message": f"MPG123 stderr: {stderr.decode('utf-8', errors='ignore')}"})
            
            if process.returncode != 0 and process.returncode != -15:  # -15 is SIGTERM, which is normal for stopped sounds
                log_message({"status": "error", "sound_id": sound_id, "file": file_path, 
                           "message": f"MPG123 error (code {process.returncode}): {stderr.decode('utf-8', errors='ignore')}"})
            
            log_message({
                "status": "finished",
                "sound_id": sound_id,
                "duration": actual_duration,
                "expected_duration": duration,
                "messageId": message_id
            })
        except Exception as e:
            log_message({"status": "error", "sound_id": sound_id, "message": str(e), 
                        "traceback": traceback.format_exc()})
        finally:
            with self.sounds_lock:
                if sound_id in self.sounds:
                    del self.sounds[sound_id]

    def _force_kill_process(self, process):
        """Force kills a process and all its children"""
        try:
            parent = psutil.Process(process.pid)
            for child in parent.children(recursive=True):
                try:
                    child.kill()
                except psutil.NoSuchProcess:
                    pass
            parent.kill()
        except psutil.NoSuchProcess:
            pass

    def stop_sound(self, sound_id):
        with self.sounds_lock:
            if sound_id in self.sounds:
                process = self.sounds[sound_id]
                try:
                    # First try SIGTERM
                    process.terminate()
                    
                    # Wait up to 2 seconds for graceful termination
                    try:
                        process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        # If graceful termination fails, force kill
                        self._force_kill_process(process)
                    
                    log_message({"status": "stopped", "sound_id": sound_id})
                except Exception as e:
                    log_message({"status": "warning", "message": f"Error stopping sound {sound_id}: {str(e)}"})
                finally:
                    if sound_id in self.sounds:
                        del self.sounds[sound_id]
            else:
                log_message({"status": "warning", "message": f"Sound {sound_id} not found or already stopped"})

    def stop_all_sounds(self):
        with self.sounds_lock:
            sound_ids = list(self.sounds.keys())
        for sound_id in sound_ids:
            self.stop_sound(sound_id)
        log_message({"status": "info", "message": "All sounds stopped"})

    def get_sound_status(self, sound_id):
        with self.sounds_lock:
            if sound_id in self.sounds:
                process = self.sounds[sound_id]
                try:
                    is_playing = process.poll() is None
                    status = "playing" if is_playing else "stopped"
                    return {"status": status, "sound_id": sound_id}
                except Exception:
                    return {"status": "error", "sound_id": sound_id}
            else:
                return {"status": "not_found", "sound_id": sound_id}

def signal_handler(signum, frame):
    log_message({"status": "info", "message": f"Received signal {signum}. Exiting gracefully."})
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
                with open('/tmp/sound_player_debug.log', 'a') as f:
                    f.write(f"Received command: {command}\n")
                if not command:
                    continue
                
                log_message({"status": "info", "message": f"Received command: {command}"})
                if command == "EXIT":
                    break

                # Handle commands without message IDs for backward compatibility
                if command.startswith("PLAY|") or command.startswith("STOP|") or command == "STOP_ALL":
                    parts = ["AUTO"] + command.split("|")
                else:
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
                        player.play_sound(sound_id, file_path, message_id=message_id)
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
                log_message({"status": "info", "message": "Received EOF. Exiting."})
                break
            except Exception as e:
                log_message({"status": "error", "message": f"Command processing error: {str(e)}", 
                           "traceback": traceback.format_exc()})

    except Exception as e:
        log_message({"status": "error", "message": f"Failed to initialize or run SoundPlayer: {str(e)}", 
                    "traceback": traceback.format_exc()})
    finally:
        log_message({"status": "exit", "message": "SoundPlayer exiting"})
