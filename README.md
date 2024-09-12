Certainly! I'll update the README.md to include information about the hardware components. Here's the revised version:

```markdown
# MonsterBox

MonsterBox is an animatronic automation package designed to control and manage various components of interactive Halloween displays or haunted house attractions. It provides a web-based interface for creating, editing, and executing scenes that control different types of hardware components.

## Description

MonsterBox allows users to:
- Create and manage characters
- Add and configure various types of parts (motors, LEDs, lights, sensors, etc.)
- Design complex scenes with multiple steps
- Play sounds
- Execute scenes to control the animatronic components

The application is built with a Node.js backend using Express.js and EJS templates for the frontend. It's designed to run on a Raspberry Pi or similar device that can interface with GPIO pins to control physical hardware.

## Hardware Components

MonsterBox is designed to work with the following hardware:

1. **Raspberry Pi 4B**: The main controller running the MonsterBox software.
2. **Servos**: 
   - Standard servos (e.g., SG90, MG996R)
   - Continuous rotation servos
3. **Motors**:
   - DC motors with H-bridge drivers (e.g., L298N)
   - Stepper motors with appropriate drivers
4. **Linear Actuators**: 12V DC actuators for linear motion
5. **LEDs**: Both individual LEDs and LED strips (e.g., WS2812B)
6. **Lights**: Relay-controlled AC or DC lights
7. **Sensors**:
   - PIR motion sensors
   - Ultrasonic distance sensors (HC-SR04)
   - Sound sensors
8. **Audio**: 
   - USB audio adapter
   - Speakers or amplifier module

## Main Software Components

1. **Characters**: Represent the animatronic figures or props in your display.
2. **Parts**: Various types of controllable components (motors, LEDs, sensors, etc.) that can be attached to characters.
3. **Scenes**: Sequences of steps that define how parts should behave over time.
4. **Sounds**: Audio files that can be played as part of a scene.

## Project Structure

- `/routes`: Contains Express.js route handlers for different sections of the application.
- `/scripts`: Python scripts for controlling hardware components via GPIO.
- `/services`: JavaScript modules for data management and business logic.
- `/views`: EJS templates for rendering the web interface.
- `/public`: Static assets like CSS files.
- `/data`: JSON files for storing application data.

## Key Files

- `app.js`: The main Express.js application file.
- `package.json`: Defines project dependencies and scripts.
- `README.md`: This file, containing project documentation.

## Technology Stack

- Backend: Node.js with Express.js
- Frontend: EJS templates with custom CSS
- Database: JSON files (for simplicity and portability)
- Hardware Control: Python scripts using RPi.GPIO library

## Setup and Installation

1. Set up your Raspberry Pi 4B with the latest Raspberry Pi OS.
2. Install Node.js and npm on your Raspberry Pi.
3. Clone this repository to your Raspberry Pi.
4. Navigate to the project directory and run `npm install` to install dependencies.
5. Ensure Python 3 is installed and install the RPi.GPIO library: `pip3 install RPi.GPIO`.
6. Connect your hardware components to the appropriate GPIO pins on the Raspberry Pi.
7. Start the application by running `npm start`.

## Usage

1. Access the MonsterBox interface by opening a web browser and navigating to `http://<raspberry-pi-ip>:3000`.
2. Create characters to represent your animatronic figures.
3. Add parts to your characters, configuring them with the appropriate GPIO pins.
4. Create scenes by adding a series of steps that control your parts.
5. Use the scene player to test and run your scenes.

## Contributing

Contributions to MonsterBox are welcome! Please feel free to submit pull requests or create issues for bugs and feature requests.

## License

This project is licensed under the MIT License.

## Acknowledgments

Created by ARW (8.15.2024)

Special thanks to the Raspberry Pi Foundation and the open-source community for providing the tools and libraries that make this project possible.
```

This updated README now includes information about the specific hardware components that MonsterBox is designed to work with, as well as more detailed setup instructions. It provides a comprehensive overview of both the software and hardware aspects of the project.
