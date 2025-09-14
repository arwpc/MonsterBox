#!/usr/bin/env python3

"""
Add calibration data for servo 30 (Hooyij servo)
"""

import json
import os
from datetime import datetime

def add_servo_30_calibration():
    """Add calibration data for servo 30"""
    
    calibration_file = "data/servo_calibrations.json"
    
    # Load existing calibrations
    calibrations = {}
    if os.path.exists(calibration_file):
        with open(calibration_file, 'r') as f:
            calibrations = json.load(f)
    
    # Add servo 30 calibration
    calibrations["30"] = {
        "part_id": 30,
        "part_name": "Elbow of Orlok",
        "servo_type": "continuous",
        "channel": 1,
        "calibrated_date": datetime.now().isoformat(),
        "stop_pulse_us": 1500,
        "cw_pulse_us": 1000,
        "ccw_pulse_us": 2000,
        "positions": {
            "extended": {
                "description": "Fully extended position",
                "calibrated": False
            },
            "retracted": {
                "description": "Fully retracted position", 
                "calibrated": False
            },
            "neutral": {
                "description": "Neutral/middle position",
                "calibrated": False
            }
        },
        "timing_data": {}
    }
    
    # Save updated calibrations
    with open(calibration_file, 'w') as f:
        json.dump(calibrations, f, indent=2)
    
    print(f"✅ Added calibration data for servo 30")
    print(f"📁 Updated {calibration_file}")

if __name__ == "__main__":
    add_servo_30_calibration()
