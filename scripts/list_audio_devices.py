import pyaudio
import json

def list_audio_devices():
    p = pyaudio.PyAudio()
    devices = []

    for i in range(p.get_device_count()):
        device_info = p.get_device_info_by_index(i)
        if device_info['maxInputChannels'] > 0:
            devices.append({
                'index': i,
                'name': device_info['name'],
                'channels': device_info['maxInputChannels']
            })

    p.terminate()
    print(json.dumps(devices))

if __name__ == "__main__":
    list_audio_devices()
