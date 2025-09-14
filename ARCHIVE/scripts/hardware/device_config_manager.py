#!/usr/bin/env python3
"""
Device Configuration Management System - Configuration and calibration management
Part of MonsterBox Hardware Integration Layer (Task 5.4)

This module provides comprehensive configuration management for:
- Device initialization parameters
- Calibration data storage and retrieval
- Runtime settings management
- Configuration validation and loading
- Configuration versioning and migration
- Persistent storage with JSON/YAML support

Features:
- JSON/YAML configuration file support
- Configuration validation and schema checking
- Calibration data management
- Configuration versioning and migration
- Runtime configuration updates
- Backup and restore functionality
"""

import os
import json
import yaml
import time
import logging
import threading
from typing import Dict, Any, Optional, List, Union
from pathlib import Path
from dataclasses import dataclass, asdict
from enum import Enum
import jsonschema
from jsonschema import validate, ValidationError

logger = logging.getLogger(__name__)

class ConfigFormat(Enum):
    """Supported configuration formats"""
    JSON = "json"
    YAML = "yaml"

class ConfigType(Enum):
    """Types of configuration"""
    DEVICE = "device"
    CALIBRATION = "calibration"
    RUNTIME = "runtime"
    SYSTEM = "system"

@dataclass
class DeviceConfig:
    """Device configuration structure"""
    device_id: str
    device_type: str
    protocol: str
    enabled: bool = True
    config: Dict[str, Any] = None
    calibration: Dict[str, Any] = None
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.config is None:
            self.config = {}
        if self.calibration is None:
            self.calibration = {}
        if self.metadata is None:
            self.metadata = {
                'created_at': time.time(),
                'version': '1.0.0'
            }

@dataclass
class CalibrationData:
    """Calibration data structure"""
    device_id: str
    calibration_type: str
    parameters: Dict[str, Any]
    timestamp: float
    valid_until: Optional[float] = None
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}

class DeviceConfigManager:
    """Main device configuration management system"""
    
    def __init__(self, config_dir: str = "config/hardware", backup_dir: str = "config/backup"):
        self.config_dir = Path(config_dir)
        self.backup_dir = Path(backup_dir)
        self.devices: Dict[str, DeviceConfig] = {}
        self.calibrations: Dict[str, CalibrationData] = {}
        self.runtime_config: Dict[str, Any] = {}
        self._lock = threading.Lock()
        
        # Create directories if they don't exist
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        # Load existing configurations
        self._load_all_configurations()
        
        # Define configuration schemas
        self._define_schemas()
    
    def _define_schemas(self):
        """Define JSON schemas for configuration validation"""
        self.device_schema = {
            "type": "object",
            "properties": {
                "device_id": {"type": "string"},
                "device_type": {"type": "string", "enum": ["motor", "servo", "light", "sensor", "actuator", "display"]},
                "protocol": {"type": "string", "enum": ["gpio", "i2c", "spi", "uart"]},
                "enabled": {"type": "boolean"},
                "config": {"type": "object"},
                "calibration": {"type": "object"},
                "metadata": {"type": "object"}
            },
            "required": ["device_id", "device_type", "protocol"]
        }
        
        self.calibration_schema = {
            "type": "object",
            "properties": {
                "device_id": {"type": "string"},
                "calibration_type": {"type": "string"},
                "parameters": {"type": "object"},
                "timestamp": {"type": "number"},
                "valid_until": {"type": ["number", "null"]},
                "metadata": {"type": "object"}
            },
            "required": ["device_id", "calibration_type", "parameters", "timestamp"]
        }
    
    def _load_all_configurations(self):
        """Load all configuration files from disk"""
        try:
            # Load device configurations
            device_files = list(self.config_dir.glob("device_*.json")) + list(self.config_dir.glob("device_*.yaml"))
            for file_path in device_files:
                self._load_device_config(file_path)
            
            # Load calibration data
            calibration_files = list(self.config_dir.glob("calibration_*.json")) + list(self.config_dir.glob("calibration_*.yaml"))
            for file_path in calibration_files:
                self._load_calibration_data(file_path)
            
            # Load runtime configuration
            runtime_file = self.config_dir / "runtime_config.json"
            if runtime_file.exists():
                self._load_runtime_config(runtime_file)
            
            logger.info(f"✅ Loaded {len(self.devices)} device configs and {len(self.calibrations)} calibrations")
            
        except Exception as e:
            logger.error(f"Error loading configurations: {e}")
    
    def _load_device_config(self, file_path: Path):
        """Load a single device configuration file"""
        try:
            data = self._load_file(file_path)
            
            # Validate against schema
            validate(instance=data, schema=self.device_schema)
            
            device_config = DeviceConfig(**data)
            self.devices[device_config.device_id] = device_config
            logger.debug(f"Loaded device config: {device_config.device_id}")
            
        except ValidationError as e:
            logger.error(f"Validation error in {file_path}: {e.message}")
        except Exception as e:
            logger.error(f"Error loading device config {file_path}: {e}")
    
    def _load_calibration_data(self, file_path: Path):
        """Load a single calibration data file"""
        try:
            data = self._load_file(file_path)
            
            # Validate against schema
            validate(instance=data, schema=self.calibration_schema)
            
            calibration = CalibrationData(**data)
            key = f"{calibration.device_id}_{calibration.calibration_type}"
            self.calibrations[key] = calibration
            logger.debug(f"Loaded calibration: {key}")
            
        except ValidationError as e:
            logger.error(f"Validation error in {file_path}: {e.message}")
        except Exception as e:
            logger.error(f"Error loading calibration {file_path}: {e}")
    
    def _load_runtime_config(self, file_path: Path):
        """Load runtime configuration"""
        try:
            self.runtime_config = self._load_file(file_path)
            logger.debug("Loaded runtime configuration")
        except Exception as e:
            logger.error(f"Error loading runtime config: {e}")
    
    def _load_file(self, file_path: Path) -> Dict[str, Any]:
        """Load JSON or YAML file"""
        with open(file_path, 'r') as f:
            if file_path.suffix.lower() == '.yaml' or file_path.suffix.lower() == '.yml':
                return yaml.safe_load(f)
            else:
                return json.load(f)
    
    def _save_file(self, file_path: Path, data: Dict[str, Any], format_type: ConfigFormat = ConfigFormat.JSON):
        """Save data to JSON or YAML file"""
        with open(file_path, 'w') as f:
            if format_type == ConfigFormat.YAML:
                yaml.dump(data, f, default_flow_style=False, indent=2)
            else:
                json.dump(data, f, indent=2, default=str)
    
    def add_device_config(self, device_config: DeviceConfig, save_to_disk: bool = True) -> bool:
        """Add or update device configuration"""
        with self._lock:
            try:
                # Validate configuration
                config_dict = asdict(device_config)
                validate(instance=config_dict, schema=self.device_schema)
                
                # Store in memory
                self.devices[device_config.device_id] = device_config
                
                # Save to disk if requested
                if save_to_disk:
                    file_path = self.config_dir / f"device_{device_config.device_id}.json"
                    self._save_file(file_path, config_dict)
                
                logger.info(f"✅ Added device config: {device_config.device_id}")
                return True
                
            except ValidationError as e:
                logger.error(f"Validation error for device {device_config.device_id}: {e.message}")
                return False
            except Exception as e:
                logger.error(f"Error adding device config: {e}")
                return False
    
    def get_device_config(self, device_id: str) -> Optional[DeviceConfig]:
        """Get device configuration by ID"""
        with self._lock:
            return self.devices.get(device_id)
    
    def get_all_device_configs(self) -> Dict[str, DeviceConfig]:
        """Get all device configurations"""
        with self._lock:
            return self.devices.copy()
    
    def update_device_config(self, device_id: str, updates: Dict[str, Any]) -> bool:
        """Update specific fields in device configuration"""
        with self._lock:
            if device_id not in self.devices:
                logger.error(f"Device {device_id} not found")
                return False
            
            try:
                device_config = self.devices[device_id]
                
                # Update fields
                for key, value in updates.items():
                    if hasattr(device_config, key):
                        setattr(device_config, key, value)
                    elif key in ['config', 'calibration', 'metadata']:
                        getattr(device_config, key).update(value)
                
                # Save updated configuration
                return self.add_device_config(device_config, save_to_disk=True)
                
            except Exception as e:
                logger.error(f"Error updating device config {device_id}: {e}")
                return False
    
    def add_calibration_data(self, calibration: CalibrationData, save_to_disk: bool = True) -> bool:
        """Add or update calibration data"""
        with self._lock:
            try:
                # Validate calibration data
                calibration_dict = asdict(calibration)
                validate(instance=calibration_dict, schema=self.calibration_schema)
                
                # Store in memory
                key = f"{calibration.device_id}_{calibration.calibration_type}"
                self.calibrations[key] = calibration
                
                # Save to disk if requested
                if save_to_disk:
                    file_path = self.config_dir / f"calibration_{key}.json"
                    self._save_file(file_path, calibration_dict)
                
                logger.info(f"✅ Added calibration data: {key}")
                return True
                
            except ValidationError as e:
                logger.error(f"Validation error for calibration {key}: {e.message}")
                return False
            except Exception as e:
                logger.error(f"Error adding calibration data: {e}")
                return False
    
    def get_calibration_data(self, device_id: str, calibration_type: str) -> Optional[CalibrationData]:
        """Get calibration data for a device"""
        with self._lock:
            key = f"{device_id}_{calibration_type}"
            calibration = self.calibrations.get(key)
            
            # Check if calibration is still valid
            if calibration and calibration.valid_until:
                if time.time() > calibration.valid_until:
                    logger.warning(f"Calibration {key} has expired")
                    return None
            
            return calibration
    
    def get_all_calibrations(self, device_id: Optional[str] = None) -> Dict[str, CalibrationData]:
        """Get all calibration data, optionally filtered by device"""
        with self._lock:
            if device_id:
                return {k: v for k, v in self.calibrations.items() if v.device_id == device_id}
            return self.calibrations.copy()
    
    def set_runtime_config(self, key: str, value: Any) -> bool:
        """Set runtime configuration value"""
        with self._lock:
            try:
                self.runtime_config[key] = value
                
                # Save to disk
                runtime_file = self.config_dir / "runtime_config.json"
                self._save_file(runtime_file, self.runtime_config)
                
                logger.debug(f"Set runtime config: {key} = {value}")
                return True
                
            except Exception as e:
                logger.error(f"Error setting runtime config: {e}")
                return False
    
    def get_runtime_config(self, key: str, default: Any = None) -> Any:
        """Get runtime configuration value"""
        with self._lock:
            return self.runtime_config.get(key, default)
    
    def backup_configurations(self) -> bool:
        """Create backup of all configurations"""
        try:
            timestamp = int(time.time())
            backup_subdir = self.backup_dir / f"backup_{timestamp}"
            backup_subdir.mkdir(exist_ok=True)
            
            # Backup device configurations
            for device_id, device_config in self.devices.items():
                backup_file = backup_subdir / f"device_{device_id}.json"
                self._save_file(backup_file, asdict(device_config))
            
            # Backup calibration data
            for key, calibration in self.calibrations.items():
                backup_file = backup_subdir / f"calibration_{key}.json"
                self._save_file(backup_file, asdict(calibration))
            
            # Backup runtime config
            if self.runtime_config:
                backup_file = backup_subdir / "runtime_config.json"
                self._save_file(backup_file, self.runtime_config)
            
            logger.info(f"✅ Created configuration backup: {backup_subdir}")
            return True
            
        except Exception as e:
            logger.error(f"Error creating backup: {e}")
            return False
    
    def restore_configurations(self, backup_timestamp: int) -> bool:
        """Restore configurations from backup"""
        try:
            backup_subdir = self.backup_dir / f"backup_{backup_timestamp}"
            if not backup_subdir.exists():
                logger.error(f"Backup {backup_timestamp} not found")
                return False
            
            # Clear current configurations
            self.devices.clear()
            self.calibrations.clear()
            self.runtime_config.clear()
            
            # Load from backup
            device_files = list(backup_subdir.glob("device_*.json"))
            for file_path in device_files:
                self._load_device_config(file_path)
            
            calibration_files = list(backup_subdir.glob("calibration_*.json"))
            for file_path in calibration_files:
                self._load_calibration_data(file_path)
            
            runtime_file = backup_subdir / "runtime_config.json"
            if runtime_file.exists():
                self._load_runtime_config(runtime_file)
            
            logger.info(f"✅ Restored configurations from backup {backup_timestamp}")
            return True
            
        except Exception as e:
            logger.error(f"Error restoring backup: {e}")
            return False
    
    def validate_all_configurations(self) -> Dict[str, List[str]]:
        """Validate all configurations and return any errors"""
        errors = {
            'devices': [],
            'calibrations': []
        }
        
        # Validate device configurations
        for device_id, device_config in self.devices.items():
            try:
                validate(instance=asdict(device_config), schema=self.device_schema)
            except ValidationError as e:
                errors['devices'].append(f"{device_id}: {e.message}")
        
        # Validate calibration data
        for key, calibration in self.calibrations.items():
            try:
                validate(instance=asdict(calibration), schema=self.calibration_schema)
            except ValidationError as e:
                errors['calibrations'].append(f"{key}: {e.message}")
        
        return errors
    
    def get_system_status(self) -> Dict[str, Any]:
        """Get configuration system status"""
        return {
            'total_devices': len(self.devices),
            'total_calibrations': len(self.calibrations),
            'runtime_config_keys': len(self.runtime_config),
            'config_directory': str(self.config_dir),
            'backup_directory': str(self.backup_dir),
            'last_backup': self._get_latest_backup_timestamp()
        }
    
    def _get_latest_backup_timestamp(self) -> Optional[int]:
        """Get timestamp of latest backup"""
        try:
            backup_dirs = [d for d in self.backup_dir.iterdir() if d.is_dir() and d.name.startswith('backup_')]
            if backup_dirs:
                latest = max(backup_dirs, key=lambda d: int(d.name.split('_')[1]))
                return int(latest.name.split('_')[1])
        except:
            pass
        return None

# Global configuration manager instance
_config_manager = None

def get_device_config_manager() -> DeviceConfigManager:
    """Get global device configuration manager instance"""
    global _config_manager
    if _config_manager is None:
        _config_manager = DeviceConfigManager()
    return _config_manager
