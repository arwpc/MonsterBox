# Validation Scripts

This directory contains validation scripts for verifying system functionality, configurations, and fixes.

## Files

### `validate_webcam_fixes.py`
- **Purpose**: Validates webcam fixes and functionality
- **Tests**: Camera access, streaming capabilities, configuration validation
- **Usage**: `python3 scripts/validation/validate_webcam_fixes.py`
- **Output**: Validation report with pass/fail status

## Running Validation Scripts

```bash
# Run webcam validation
python3 scripts/validation/validate_webcam_fixes.py

# Run with verbose output
python3 scripts/validation/validate_webcam_fixes.py --verbose

# Generate validation report
python3 scripts/validation/validate_webcam_fixes.py --report
```

## Validation Categories

### Hardware Validation
- Camera device detection
- Frame capture capability
- Resolution and FPS testing
- Device compatibility checks

### Software Validation
- OpenCV installation and functionality
- Streaming service availability
- API endpoint validation
- Configuration file integrity

### Integration Validation
- MonsterBox service integration
- Character-webcam associations
- Streaming pipeline functionality
- Error handling validation

## Requirements

- **Python 3.7+**
- **OpenCV**: `pip install opencv-python`
- **System Access**: Camera hardware and permissions
- **Network**: For API validation tests

## Output Formats

- **Console**: Real-time validation progress
- **JSON**: Machine-readable validation results
- **HTML**: Human-readable validation reports

## Use Cases

- **Pre-deployment**: Validate system before going live
- **Post-fix**: Verify fixes are working correctly
- **Troubleshooting**: Identify specific failure points
- **Documentation**: Generate validation evidence

## Notes

- Validation scripts are designed to be non-destructive
- Scripts provide detailed error information for debugging
- Use validation scripts as part of CI/CD pipeline
- Regular validation helps maintain system health
