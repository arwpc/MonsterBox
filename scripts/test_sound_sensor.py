import pyaudio
import numpy as np
import curses
import sys
import json

def select_input_device(stdscr, p):
    devices = []
    for i in range(p.get_device_count()):
        device_info = p.get_device_info_by_index(i)
        if device_info['maxInputChannels'] > 0:
            devices.append(device_info)
    
    stdscr.clear()
    stdscr.addstr("Available audio input devices:\n")
    for i, device in enumerate(devices):
        stdscr.addstr(f"{i}: {device['name']}\n")

    stdscr.addstr("\nEnter the device index for the microphone input: ")
    stdscr.refresh()

    curses.echo()
    device_index = int(stdscr.getstr().decode())
    curses.noecho()

    return devices[device_index]['index']

def print_sound(stdscr, in_data, frame_count, time_info, status):
    audio_data = np.frombuffer(in_data, dtype=np.float32)
    volume_norm = np.linalg.norm(audio_data) * 10
    bar = "|" * int(volume_norm)
    stdscr.addstr(0, 0, f"Sound level: {bar:<50}")
    stdscr.refresh()
    return (in_data, pyaudio.paContinue)

def test_sound_sensor(stdscr, device_index, threshold):
    p = pyaudio.PyAudio()

    if device_index is None:
        device_index = select_input_device(stdscr, p)

    stdscr.clear()
    stdscr.addstr(0, 0, "Initializing sound sensor...")
    stdscr.refresh()

    def callback(in_data, frame_count, time_info, status):
        print_sound(stdscr, in_data, frame_count, time_info, status)
        audio_data = np.frombuffer(in_data, dtype=np.float32)
        volume_norm = np.linalg.norm(audio_data) * 10
        if volume_norm > threshold:
            stdscr.addstr(1, 0, "Sound Detected!")
        else:
            stdscr.addstr(1, 0, "             ")
        stdscr.refresh()
        return (in_data, pyaudio.paContinue)

    stream = p.open(format=pyaudio.paFloat32,
                    channels=1,
                    rate=44100,
                    input=True,
                    input_device_index=device_index,
                    stream_callback=callback)

    stream.start_stream()

    stdscr.addstr(2, 0, "Listening... Press 'q' to stop.")
    stdscr.refresh()

    while True:
        key = stdscr.getch()
        if key == ord('q'):
            break

    stream.stop_stream()
    stream.close()
    p.terminate()

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python test_sound_sensor.py <device_index> <threshold>")
        sys.exit(1)

    device_index = int(sys.argv[1]) if sys.argv[1] != "null" else None
    threshold = float(sys.argv[2])

    curses.wrapper(lambda stdscr: test_sound_sensor(stdscr, device_index, threshold))
