# MonsterBox

[... Previous content ...]

## Logging System

MonsterBox uses a centralized logging system implemented with Winston. This system provides consistent logging across all components of the application.

- **Log Files**: Logs are written to date-stamped files (e.g., MonsterBox-2023-05-20.log) in the root directory of the project.
- **Log Rotation**: Log files are automatically rotated daily and compressed after reaching 20MB in size. Old log files are kept for 14 days.
- **Log Levels**: The system uses various log levels (debug, info, warn, error) to categorize log messages. The logging level can be set using the LOG_LEVEL environment variable.
- **Console Output**: Error-level messages are still logged to the console for immediate visibility.

Key features of the logging system:
- Timestamps for all log entries
- Differentiation between different types of events (e.g., info for standard operations, warn for potential issues, error for critical problems)
- Centralized configuration in `logger.js`
- Environment-based log levels for flexibility between development and production environments

To view logs:
1. Access the Raspberry Pi's terminal
2. Navigate to the MonsterBox project directory
3. Use the command `cat MonsterBox-YYYY-MM-DD.log` to view a specific day's log, or `tail -f MonsterBox-YYYY-MM-DD.log` to view live log updates

To set the log level:
- Before starting the application, set the LOG_LEVEL environment variable. For example:
  ```
  export LOG_LEVEL=debug
  npm start
  ```

[... Rest of the content ...]
