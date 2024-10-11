import pygame
import time
import sys

def test_pygame_audio():
    print("Initializing pygame...")
    pygame.init()
    
    print("Initializing mixer...")
    try:
        pygame.mixer.init()
        print(f"Mixer initialized: {pygame.mixer.get_init()}")
    except pygame.error as e:
        print(f"Failed to initialize mixer: {e}")
        return

    print("Creating sound object...")
    try:
        sound = pygame.mixer.Sound("public/sounds/test-sound.mp3")
        print("Sound object created successfully")
    except pygame.error as e:
        print(f"Failed to create sound object: {e}")
        return

    print("Playing sound...")
    channel = sound.play()
    if channel is None:
        print("Failed to play sound")
    else:
        print("Sound is playing")
        time.sleep(2)  # Wait for 2 seconds to let the sound play

    print("Quitting pygame...")
    pygame.quit()

if __name__ == "__main__":
    test_pygame_audio()
    print("Test completed")
