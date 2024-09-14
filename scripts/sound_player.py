import sys
import json
import signal
import subprocess
from threading import Thread, Event, Lock

class SoundPlayer:
    def __init__(self):
        self.processes = {}
        self.exit_event = Event()
        self.lock = Lock()
        self.audio_device = 'default'

    def play_sound(self, sound_id, file_path):
        with self.lock:
            if sound_id in self.processes:
                self.stop_sound(sound_id)
            
            try:
                process = subprocess.Popen(['aplay', '-D', self.audio_device, file_path], 
                                           stdout=subprocess.PIPE, 
                                           stderr=subprocess.PIPE)
                self.processes[sound_id] = process
                print(json.dumps({"status": "playing", "sound_id": sound_id, "file": file_path}))
                sys.stdout.flush()
                
                def wait_for_completion():
                    stdout, stderr = process.communicate()
                    with self.lock:
                        if sound_id in self.processes and self.processes[sound_id] == process:
                            if process.returncode == 0 and not self.exit_event.is_set():
                                print(json.dumps({"status": "finished", "sound_id": sound_id, "file": file_path}))
                            else:
                                print(json.dumps({"status": "error", "sound_id": sound_id, "file": file_path, "error": stderr.decode()}))
                            sys.stdout.flush()
                            del self.processes[sound_id]
                
                Thread(target=wait_for_completion).start()
            except Exception as e:
                print(json.dumps({"status": "error", "sound_id": sound_id, "file": file_path, "error": str(e)}))
                sys.stdout.flush()

    def stop_sound(self, sound_id):
        with self.lock:
            if sound_id in self.processes:
                process = self.processes[sound_id]
                process.terminate()
                process.wait()
                del self.processes[sound_id]
                print(json.dumps({"status": "stopped", "sound_id": sound_id}))
                sys.stdout.flush()

    def stop_all_sounds(self):
        with self.lock:
            for sound_id, process in list(self.processes.items()):
                process.terminate()
                process.wait()
                del self.processes[sound_id]
                print(json.dumps({"status": "stopped", "sound_id": sound_id}))
                sys.stdout.flush()
        print(json.dumps({"status": "all_stopped"}))
        sys.stdout.flush()

    def run(self):
        while not self.exit_event.is_set():
            try:
                command = input().strip()
                if command == "EXIT":
                    break
                elif command == "STOP_ALL":
                    self.stop_all_sounds()
                elif command.startswith("DEVICE|"):
                    _, self.audio_device = command.split("|")
                    print(json.dumps({"status": "device_set", "device": self.audio_device}))
                    sys.stdout.flush()
                else:
                    cmd, sound_id, file_path = command.split("|")
                    if cmd == "PLAY":
                        self.play_sound(sound_id, file_path)
                    elif cmd == "STOP":
                        self.stop_sound(sound_id)
            except Exception as e:
                print(json.dumps({"status": "error", "error": str(e)}))
                sys.stdout.flush()

        self.stop_all_sounds()

def signal_handler(signum, frame):
    player.exit_event.set()

if __name__ == "__main__":
    player = SoundPlayer()
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    player.run()
