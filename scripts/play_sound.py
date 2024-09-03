import sys
import pygame
import threading
import time

def play_sound(file_path, concurrent=False):
    try:
        pygame.mixer.init()
        pygame.mixer.music.load(file_path)
        print(f"Playing sound from file: {file_path}")
        pygame.mixer.music.play()

        if not concurrent:
            while pygame.mixer.music.get_busy():
                pygame.time.Clock().tick(10)
            print("Sound playback finished.")
        else:
            print("Non-blocking sound playback initiated.")
    except pygame.error as e:
        print(f"Pygame error during sound playback: {e}")
    except Exception as e:
        print(f"Error during sound playback: {e}")
    finally:
        if not concurrent:
            pygame.mixer.quit()

if __name__ == "__main__":
    if len(sys.argv) < 2 or len(sys.argv) > 3:
        print("Usage: python play_sound.py <file_path> [concurrent]")
        sys.exit(1)

    file_path = sys.argv[1]
    concurrent = len(sys.argv) == 3 and sys.argv[2].lower() == 'true'

    if concurrent:
        threading.Thread(target=play_sound, args=(file_path, concurrent), daemon=True).start()
        time.sleep(1)  # Give the thread a moment to start
    else:
        play_sound(file_path, concurrent)

    if concurrent:
        print("Main thread continuing execution.")
    else:
        print("Sound playback script completed.")

    sys.exit(0)
