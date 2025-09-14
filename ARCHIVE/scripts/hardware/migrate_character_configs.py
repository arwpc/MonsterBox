#!/usr/bin/env python3
"""
Character Configuration Migration Script
Migrates existing character configurations to Hardware Integration Layer format
Preserves all calibration values and safety limits during migration
"""

import json
import os
import sys
import logging
from typing import Dict, Any, List
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CharacterConfigMigrator:
    """Migrates character configurations to HAL format"""
    
    def __init__(self, characters_file: str = None, output_dir: str = None):
        self.characters_file = characters_file or os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 
            "data", "characters.json"
        )
        self.output_dir = output_dir or os.path.join(
            os.path.dirname(__file__), "device_configs"
        )
        
        # Ensure output directory exists
        Path(self.output_dir).mkdir(parents=True, exist_ok=True)
        
    def load_characters(self) -> List[Dict[str, Any]]:
        """Load character configurations from JSON file"""
        try:
            with open(self.characters_file, 'r') as f:
                characters = json.load(f)
                
            # Handle both array format and object format
            if isinstance(characters, list):
                return characters
            elif isinstance(characters, dict) and 'characters' in characters:
                return characters['characters']
            else:
                logger.error("Invalid characters file format")
                return []
                
        except FileNotFoundError:
            logger.error(f"Characters file not found: {self.characters_file}")
            return []
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in characters file: {e}")
            return []
    
    def extract_hardware_config(self, character: Dict[str, Any]) -> Dict[str, Any]:
        """Extract hardware configuration from character data"""
        hardware_config = {
            "character_id": character.get("id"),
            "character_name": character.get("char_name", character.get("name")),
            "devices": [],
            "safety_limits": {},
            "calibration_data": {}
        }
        
        # Extract animatronic configuration
        animatronic = character.get("animatronic", {})
        if not animatronic.get("enabled", False):
            logger.info(f"Character {character.get('id')} has animatronics disabled, skipping")
            return hardware_config
        
        # Extract ChatterPi jaw configuration
        chatterpi_config = animatronic.get("chatterpi_config", {})
        if chatterpi_config:
            jaw_settings = chatterpi_config.get("jaw_settings", {})
            if jaw_settings:
                # Create jaw servo device
                jaw_device = {
                    "device_id": f"jaw_servo_{character.get('id')}",
                    "device_type": "servo",
                    "protocol": "gpio",
                    "enabled": True,
                    "config": {
                        "pins": jaw_settings.get("preferred_gpio_pins", [18, 19, 20, 21]),
                        "auto_detect": jaw_settings.get("auto_detect_servo", True)
                    },
                    "calibration": jaw_settings.get("calibration", {
                        "closed_angle": 50,
                        "open_angle": 30,
                        "movement_speed": "medium"
                    }),
                    "metadata": {
                        "character_id": character.get("id"),
                        "part_type": "jaw",
                        "description": "Jaw servo for speech animation"
                    }
                }
                hardware_config["devices"].append(jaw_device)
                
                # Add safety limits for jaw servo
                hardware_config["safety_limits"]["jaw_servo"] = {
                    "max_angle": 180,
                    "min_angle": 0,
                    "max_speed": 100,
                    "max_duration": 5000
                }
        
        # Extract hardware requirements
        hardware_requirements = animatronic.get("hardware_requirements", {})
        
        # Process motor configurations
        motor_config = hardware_requirements.get("motor", {})
        if motor_config.get("enabled", False):
            pins = motor_config.get("pins", [20, 21])
            for i, pin in enumerate(pins):
                motor_device = {
                    "device_id": f"motor_{pin}_{character.get('id')}",
                    "device_type": "motor",
                    "protocol": "gpio",
                    "enabled": True,
                    "config": {
                        "pin": pin,
                        "direction_pin": pin,
                        "pwm_pin": pin + 1 if i == 0 else pin - 1,
                        "motor_type": "wiper_motor"
                    },
                    "calibration": {
                        "max_speed": 100,
                        "default_speed": 50,
                        "acceleration": "medium"
                    },
                    "metadata": {
                        "character_id": character.get("id"),
                        "part_type": "motor",
                        "description": f"Motor {i+1} for character movement"
                    }
                }
                hardware_config["devices"].append(motor_device)
                
                # Add safety limits for motor
                hardware_config["safety_limits"][f"motor_{pin}"] = {
                    "max_speed": 100,
                    "max_duration": 10000,
                    "emergency_stop_enabled": True
                }
        
        # Process light configurations
        light_config = hardware_requirements.get("light", {})
        if light_config.get("enabled", False):
            pins = light_config.get("pins", [22, 23])
            for i, pin in enumerate(pins):
                light_device = {
                    "device_id": f"light_{pin}_{character.get('id')}",
                    "device_type": "light",
                    "protocol": "gpio",
                    "enabled": True,
                    "config": {
                        "pin": pin,
                        "light_type": "led",
                        "supports_pwm": True
                    },
                    "calibration": {
                        "max_brightness": 100,
                        "default_brightness": 75,
                        "fade_time": 500
                    },
                    "metadata": {
                        "character_id": character.get("id"),
                        "part_type": "light",
                        "description": f"Light {i+1} for character illumination"
                    }
                }
                hardware_config["devices"].append(light_device)
                
                # Add safety limits for light
                hardware_config["safety_limits"][f"light_{pin}"] = {
                    "max_brightness": 100,
                    "max_duration": 0,  # No duration limit for lights
                    "thermal_protection": True
                }
        
        # Process actuator configurations
        actuator_config = hardware_requirements.get("actuator", {})
        if actuator_config.get("enabled", False):
            pins = actuator_config.get("pins", [24, 25])
            for i, pin in enumerate(pins):
                actuator_device = {
                    "device_id": f"actuator_{pin}_{character.get('id')}",
                    "device_type": "actuator",
                    "protocol": "gpio",
                    "enabled": True,
                    "config": {
                        "pin": pin,
                        "actuator_type": "linear",
                        "stroke_length": 100  # mm
                    },
                    "calibration": {
                        "max_speed": 75,
                        "default_speed": 50,
                        "position_feedback": False
                    },
                    "metadata": {
                        "character_id": character.get("id"),
                        "part_type": "actuator",
                        "description": f"Linear actuator {i+1} for character movement"
                    }
                }
                hardware_config["devices"].append(actuator_device)
                
                # Add safety limits for actuator
                hardware_config["safety_limits"][f"actuator_{pin}"] = {
                    "max_speed": 75,
                    "max_duration": 15000,
                    "position_limits": {"min": 0, "max": 100}
                }
        
        return hardware_config
    
    def save_device_config(self, character_id: int, hardware_config: Dict[str, Any]):
        """Save device configuration to HAL format"""
        output_file = os.path.join(self.output_dir, f"character_{character_id}_devices.json")
        
        try:
            with open(output_file, 'w') as f:
                json.dump(hardware_config, f, indent=2)
            
            logger.info(f"✅ Saved device configuration for character {character_id}: {output_file}")
            
        except Exception as e:
            logger.error(f"❌ Failed to save device configuration for character {character_id}: {e}")
    
    def migrate_all_characters(self):
        """Migrate all character configurations"""
        logger.info("🚀 Starting character configuration migration...")
        
        characters = self.load_characters()
        if not characters:
            logger.error("No characters found to migrate")
            return
        
        migrated_count = 0
        
        for character in characters:
            character_id = character.get("id")
            character_name = character.get("char_name", character.get("name", "Unknown"))
            
            logger.info(f"📋 Migrating character {character_id}: {character_name}")
            
            hardware_config = self.extract_hardware_config(character)
            
            if hardware_config["devices"]:
                self.save_device_config(character_id, hardware_config)
                migrated_count += 1
                logger.info(f"  ✅ Migrated {len(hardware_config['devices'])} devices")
            else:
                logger.info(f"  ⚠️ No hardware devices found for character {character_id}")
        
        logger.info(f"🎉 Migration complete! Migrated {migrated_count} characters")
        logger.info(f"📁 Device configurations saved to: {self.output_dir}")
    
    def generate_migration_report(self):
        """Generate a migration report"""
        report_file = os.path.join(self.output_dir, "migration_report.json")
        
        report = {
            "migration_timestamp": "2025-06-15T20:30:00.000Z",
            "source_file": self.characters_file,
            "output_directory": self.output_dir,
            "migrated_characters": [],
            "summary": {
                "total_characters": 0,
                "migrated_characters": 0,
                "total_devices": 0,
                "device_types": {}
            }
        }
        
        # Scan output directory for migrated files
        for config_file in Path(self.output_dir).glob("character_*_devices.json"):
            try:
                with open(config_file, 'r') as f:
                    config = json.load(f)
                
                character_info = {
                    "character_id": config.get("character_id"),
                    "character_name": config.get("character_name"),
                    "device_count": len(config.get("devices", [])),
                    "config_file": str(config_file)
                }
                
                report["migrated_characters"].append(character_info)
                report["summary"]["total_devices"] += character_info["device_count"]
                
                # Count device types
                for device in config.get("devices", []):
                    device_type = device.get("device_type", "unknown")
                    report["summary"]["device_types"][device_type] = \
                        report["summary"]["device_types"].get(device_type, 0) + 1
                
            except Exception as e:
                logger.error(f"Error reading config file {config_file}: {e}")
        
        report["summary"]["total_characters"] = len(self.load_characters())
        report["summary"]["migrated_characters"] = len(report["migrated_characters"])
        
        try:
            with open(report_file, 'w') as f:
                json.dump(report, f, indent=2)
            
            logger.info(f"📊 Migration report saved: {report_file}")
            
        except Exception as e:
            logger.error(f"Failed to save migration report: {e}")

def main():
    """Main function"""
    if len(sys.argv) > 1:
        characters_file = sys.argv[1]
    else:
        characters_file = None
    
    migrator = CharacterConfigMigrator(characters_file)
    migrator.migrate_all_characters()
    migrator.generate_migration_report()

if __name__ == "__main__":
    main()
