# MonsterBox

MonsterBox is a refactored scene builder application designed to manage scenes and steps efficiently for animatronic automation. It integrates hardware components (I2C, GPIO, servos, sensors, audio, cameras) and provides a web-based interface for easy control and configuration.

---

## Features

- **Scene Management**: Create, modify, and manage scenes and steps for animatronic characters.
- **Character System**: Support for multiple characters, each with their own parts, sounds, and scenes.
- **Hardware Integration**: Controls I2C devices, cameras, audio equipment, servos, sensors, and more.
- **Testing Suite**: Automated tests for hardware and software dependencies.
- **Web Interface**: User-friendly web interface built with EJS and Express.
- **Extensible**: Modular design for adding new hardware or features.

---

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/monsterbox.git
   cd monsterbox
   ```
2. **Install Node.js dependencies**
   ```bash
   npm install
   ```
3. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```
   This will ensure all required Python packages are installed.
4. **Set up environment variables**
   - Create a `.env` file in the project root. Refer to `.env.example` for required variables (e.g., hardware configuration, API keys).
   - Example variables:
     - `PORT=3000`
     - `NODE_ENV=production`
     - Hardware-specific variables as needed
5. **Run the application**
   ```bash
   npm start
   ```

---

## Usage Instructions

- **Access the Web Interface**: Open your browser and go to `http://localhost:3000` (or the configured port).
- **Select a Character**: Use the dropdown to select or create a character. Each character can have unique parts, sounds, and scenes.
- **Navigation**:
  - **Characters**: Manage animatronic characters and their properties.
  - **Parts**: Configure hardware parts (servos, actuators, sensors, lights, etc.).
  - **Sounds**: Upload and assign sounds to characters or scenes.
  - **Scenes**: Create and edit sequences of actions (steps) for characters.
  - **Active Mode**: Enable real-time control or automation.
  - **System Config**: Adjust system-wide settings and hardware configuration.
  - **Video**: Access camera feeds if configured.
- **Running Scenes**: Trigger scenes for a character to perform sequences (e.g., move head, play sound).
- **Logs**: View system and error logs for troubleshooting.

---

## Configuration Details

- **Environment Variables**: Required for hardware and server configuration. See `.env.example` for all options.
- **Data Files**: Located in `data/` directory:
  - `characters.json`: List of characters and their properties.
  - `parts.json`: Hardware parts and configuration.
  - `scenes.json`: Scene definitions and steps.
  - `sounds.json`: Sound files and metadata.
- **Hardware Setup**: Connect supported devices (servos, sensors, actuators, cameras, audio) according to your hardware configuration. GPIO and I2C pin numbers must match your wiring.
- **Custom Scripts**: Place additional scripts in the `scripts/` directory. Python scripts can be executed via the web interface.

---

## Visual Overview

- **Web Interface**: Modern, user-friendly dashboard with navigation for all major features.
- **Character Selection**: Dropdown menu to switch between animatronic characters.
- **Scene Editor**: Create and modify step sequences for each character.
- **Parts Management**: Add, remove, and configure hardware parts.
- *(Add screenshots or GIFs here for better onboarding!)*

---

## FAQ / Troubleshooting

**Q: The web interface doesn't load or gives errors.**
A: Ensure all dependencies are installed (`npm install`). Check that your `.env` file is present and correctly configured.

**Q: Hardware is not responding.**
A: Check your wiring and ensure the correct GPIO/I2C pins are set in `parts.json` and `.env`. Use the testing suite (`npm test`) to diagnose hardware issues.

**Q: How do I add a new character or part?**
A: Use the web interface under "Characters" and "Parts". Data is saved in the `data/` directory.

**Q: How do I upload sounds or images?**
A: Use the "Sounds" section in the web interface. Place image files in `public/images/` and sounds in `public/sounds/`.

**Q: Where are logs stored?**
A: Logs are accessible via the web interface and may be saved in the `log/` directory.

---

## Directory Structure

- **controllers/**: Application controllers for business logic
- **data/**: JSON files for configuration and data storage
- **public/**: Static files (CSS, images, sounds)
- **routes/**: API and web routes
- **scripts/**: JavaScript and Python scripts for operations
- **services/**: Service layer for business logic
- **tests/**: Automated tests
- **views/**: EJS templates for the web interface

---

## Dependencies

- `express`: Web framework for Node.js
- `ejs`: Embedded JavaScript templates
- `i2c-bus`: I2C access and control
- `onoff`: GPIO access and control
- *(See `package.json` for the full list)*

---

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request for any improvements or bug fixes.

---

## License

This project is licensed under the MIT License.

---

## Contact

For questions, support, or feature requests, please open an issue on GitHub or contact the maintainer.
