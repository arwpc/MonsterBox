# File: scripts/audio_server.py

from flask import Flask, request, jsonify
import pygame
import threading
import os

app = Flask(__name__)
pygame.mixer.init()

playing_sounds = {}

@app.route('/play', methods=['POST'])
def play_sound():
    data = request.json
    sound_id = data['sound_id']
    file_path = data['file_path']

    if sound_id in playing_sounds:
        playing_sounds[sound_id].stop()

    try:
        sound = pygame.mixer.Sound(file_path)
        channel = sound.play()
        playing_sounds[sound_id] = channel

        def wait_for_finish():
            while channel.get_busy():
                pygame.time.wait(100)
            if sound_id in playing_sounds:
                del playing_sounds[sound_id]

        threading.Thread(target=wait_for_finish).start()

        return jsonify({"status": "playing", "sound_id": sound_id, "file": file_path})
    except Exception as e:
        return jsonify({"status": "error", "sound_id": sound_id, "file": file_path, "error": str(e)}), 500

@app.route('/stop', methods=['POST'])
def stop_sound():
    data = request.json
    sound_id = data['sound_id']

    if sound_id in playing_sounds:
        playing_sounds[sound_id].stop()
        del playing_sounds[sound_id]
        return jsonify({"status": "stopped", "sound_id": sound_id})
    else:
        return jsonify({"status": "not_found", "sound_id": sound_id}), 404

if __name__ == '__main__':
    app.run(host='localhost', port=5000)