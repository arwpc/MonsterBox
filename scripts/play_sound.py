import sys
import pygame

def play_sound(file_path):
    try:
        pygame.mixer.init()  # Initialize the mixer with the default audio device
        print(f"Playing sound from file: {file_path}")
        pygame.mixer.music.load(file_path)
        pygame.mixer.music.play()

        while pygame.mixer.music.get_busy():  # Wait until the sound has finished playing
            pygame.time.Clock().tick(10)

        print("Sound playback finished.")
    except Exception as e:
        print(f"Error during sound playback: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python play_sound.py <file_path>")
        sys.exit(1)

    file_path = sys.argv[1]
    play_sound(file_path)
