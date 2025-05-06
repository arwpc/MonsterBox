# MonsterBox

MonsterBox is a refactored scene builder application designed to manage scenes and steps efficiently. It leverages various hardware components and software libraries to provide a comprehensive solution for scene management.

## Features

- **Scene Management**: Create, modify, and manage scenes and steps.
- **Hardware Integration**: Supports I2C devices, cameras, audio equipment, and more.
- **Testing Suite**: Automated tests for verifying hardware and software dependencies.
- **Web Interface**: User-friendly web interface built with EJS and Express.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/monsterbox.git
   cd monsterbox
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables by creating a `.env` file. Refer to `.env.example` for required variables.

4. Run the application:
   ```bash
   npm start
   ```

## Testing

Run the following command to execute all tests:
```bash
npm test
```

For specific tests, use:
- **Sound Tests**: `npm run test:sound`
- **RPI Dependencies**: `npm run test:rpi`

## Directory Structure

- **controllers/**: Contains controllers for handling different aspects of the application.
- **data/**: JSON files for configuration and data storage.
- **public/**: Static files including CSS, images, and sounds.
- **routes/**: Defines API routes for various functionalities.
- **scripts/**: JavaScript and Python scripts for different operations.
- **services/**: Service layer for business logic.
- **tests/**: Test files for ensuring code quality.
- **views/**: EJS templates for rendering the web interface.

## Dependencies

Key dependencies include:
- `express`: Web framework for Node.js
- `ejs`: Embedded JavaScript templates
- `i2c-bus`: I2C access and control
- `onoff`: GPIO access and control

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request for any improvements or bug fixes.

## License

This project is licensed under the MIT License.
