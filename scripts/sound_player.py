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

        # Test mpg123 and audio device
        try:
            test_result = subprocess.run(['mpg123', '--test', '-a', 'default'], capture_output=True, text=True)
            log_message({"status": "info", "message": f"MPG123 test result: {test_result.stderr}"})
        except Exception as e:
            log_message({"status": "warning", "message": f"MPG123 test failed: {str(e)}"})

        log_message({"status": "ready", "message": "SoundPlayer initialized and ready"})

    def play_sound(self, sound_id, file_path):
        try:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Sound file not found: {file_path}")
            
            file_size = os.path.getsize(file_path)
            log_message({"status": "info", "message": f"Playing sound file: {file_path}, size: {file_size} bytes"})
            
            if file_size == 0:
                raise Exception(f"Sound file is empty: {file_path}")
            
            # Use MPG123 to play the MP3 file with optimized settings
            log_message({"status": "info", "message": f"Executing mpg123 command for file: {file_path}"})
            process = subprocess.Popen(
                [
                    'mpg123',
                    '-a', 'default',  # Use default audio device
                    '--quiet',        # Reduce console output
                    '--buffer', '1024',  # Larger buffer for smoother playback
                    '--aggressive',   # More aggressive buffering
                    '--no-control',   # Disable terminal control
                    '--no-equ',      # Disable equalizer
                    '--no-gapless',  # Disable gapless playback
                    file_path
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            with self.sounds_lock:
                self.sounds[sound_id] = process
            
            # Send initial playing status
            log_message({"status": "playing", "sound_id": sound_id, "file": file_path})
            
            # Start a new thread to wait for the sound to finish
            Thread(target=self._wait_for_sound_end, args=(sound_id, process, file_path)).start()
            
        except FileNotFoundError as e:
            log_message({"status": "error", "sound_id": sound_id, "file": file_path, "message": str(e)})
        except Exception as e:
            log_message({"status": "error", "sound_id": sound_id, "file": file_path, "message": str(e), "traceback": traceback.format_exc()})

    def _wait_for_sound_end(self, sound_id, process, file_path):
        start_time = time.time()
        try:
            # Set a timeout for process.communicate()
            stdout, stderr = process.communicate(timeout=30)  # 30 second timeout
            end_time = time.time()
            duration = end_time - start_time
            
            if stdout:
                log_message({"status": "info", "message": f"MPG123 stdout: {stdout.decode('utf-8', errors='ignore')}"})
            if stderr:
                log_message({"status": "info", "message": f"MPG123 stderr: {stderr.decode('utf-8', errors='ignore')}"})
            
            if process.returncode != 0 and process.returncode != -15:  # -15 is SIGTERM, which is normal for stopped sounds
                log_message({"status": "error", "sound_id": sound_id, "file": file_path, 
                           "message": f"MPG123 error (code {process.returncode}): {stderr.decode('utf-8', errors='ignore')}"})
            
            log_message({"status": "finished", "sound_id": sound_id, "duration": duration})
        except subprocess.TimeoutExpired:
            log_message({"status": "error", "sound_id": sound_id, 
                        "message": "Sound playback timed out after 30 seconds"})
            self._force_kill_process(process)
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

    def get_sound_duration(self, file_path):
        try:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Sound file not found: {file_path}")
            
            # Use MPG123 to get the duration of the MP3 file
            result = subprocess.run(['mpg123', '--quiet', '-t', file_path], 
                                 capture_output=True, text=True, timeout=5)
            duration_line = [line for line in result.stderr.split('\n') if 'Time:' in line][0]
            duration = float(duration_line.split()[-1])
            return {"status": "success", "duration": duration}
        except Exception as e:
            return {"status": "error", "message": str(e)}

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
                elif cmd == "DURATION":
                    if len(parts) != 3:
                        response["status"] = "error"
                        response["message"] = f"Invalid DURATION command format: {command}"
                    else:
                        file_path = parts[2]
                        duration_info = player.get_sound_duration(file_path)
                        response.update(duration_info)
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
