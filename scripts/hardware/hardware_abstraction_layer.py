#!/usr/bin/env python3
"""
Hardware Abstraction Layer - Unified interface for all hardware components
Part of MonsterBox Hardware Integration Layer (Task 5.3)

This module provides a unified hardware abstraction layer that:
- Standardizes hardware interaction methods
- Provides consistent interfaces across GPIO, I2C, and other protocols
- Implements factory patterns for device creation
- Creates unified command structures and response formats
- Manages hardware resources and lifecycle

Features:
- Protocol-agnostic hardware interfaces
- Factory pattern for device creation
- Unified command/response format
- Resource management and cleanup
- Hardware capability discovery
"""

import time
import logging
import threading
from typing import Dict, Any, Optional, List, Union, Callable
from abc import ABC, abstractmethod
from enum import Enum
import json

from .gpio_control_system import GPIOControlSystem, MotorController, LightController
from .gpio_control_system_extension import SensorController, SafetySystem
from .i2c_communication_layer import I2CCommunicationLayer
from .i2c_device_drivers import I2CDeviceManager

logger = logging.getLogger(__name__)

class HardwareProtocol(Enum):
    """Supported hardware protocols"""
    GPIO = "gpio"
    I2C = "i2c"
    SPI = "spi"
    UART = "uart"
    PWM = "pwm"
    ANALOG = "analog"

class HardwareType(Enum):
    """Types of hardware components"""
    MOTOR = "motor"
    SERVO = "servo"
    LIGHT = "light"
    SENSOR = "sensor"
    ACTUATOR = "actuator"
    DISPLAY = "display"
    CAMERA = "camera"
    AUDIO = "audio"

class CommandType(Enum):
    """Standard command types"""
    INITIALIZE = "initialize"
    READ = "read"
    WRITE = "write"
    CONTROL = "control"
    STATUS = "status"
    CALIBRATE = "calibrate"
    RESET = "reset"
    SHUTDOWN = "shutdown"

class HardwareCommand:
    """Standardized hardware command structure"""
    
    def __init__(self, command_type: CommandType, target: str, parameters: Dict[str, Any] = None):
        self.command_type = command_type
        self.target = target
        self.parameters = parameters or {}
        self.timestamp = time.time()
        self.command_id = f"{target}_{command_type.value}_{int(self.timestamp * 1000)}"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'command_id': self.command_id,
            'command_type': self.command_type.value,
            'target': self.target,
            'parameters': self.parameters,
            'timestamp': self.timestamp
        }

class HardwareResponse:
    """Standardized hardware response structure"""
    
    def __init__(self, command_id: str, success: bool, data: Any = None, error: str = None):
        self.command_id = command_id
        self.success = success
        self.data = data
        self.error = error
        self.timestamp = time.time()
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'command_id': self.command_id,
            'success': self.success,
            'data': self.data,
            'error': self.error,
            'timestamp': self.timestamp
        }

class HardwareDevice(ABC):
    """Abstract base class for all hardware devices"""
    
    def __init__(self, device_id: str, device_type: HardwareType, protocol: HardwareProtocol):
        self.device_id = device_id
        self.device_type = device_type
        self.protocol = protocol
        self.is_initialized = False
        self.last_command = None
        self.last_response = None
        self.error_count = 0
        self.capabilities = set()
    
    @abstractmethod
    def initialize(self) -> HardwareResponse:
        """Initialize the hardware device"""
        pass
    
    @abstractmethod
    def execute_command(self, command: HardwareCommand) -> HardwareResponse:
        """Execute a hardware command"""
        pass
    
    @abstractmethod
    def get_status(self) -> Dict[str, Any]:
        """Get current device status"""
        pass
    
    @abstractmethod
    def cleanup(self):
        """Cleanup device resources"""
        pass
    
    def get_capabilities(self) -> List[str]:
        """Get device capabilities"""
        return list(self.capabilities)

class GPIODevice(HardwareDevice):
    """GPIO-based hardware device"""
    
    def __init__(self, device_id: str, device_type: HardwareType, gpio_system: GPIOControlSystem, **config):
        super().__init__(device_id, device_type, HardwareProtocol.GPIO)
        self.gpio_system = gpio_system
        self.config = config
        self.controller = None
        
        # Set capabilities based on device type
        if device_type == HardwareType.MOTOR:
            self.capabilities.update(['control', 'speed', 'direction', 'duration'])
        elif device_type == HardwareType.LIGHT:
            self.capabilities.update(['on_off', 'brightness', 'pwm'])
        elif device_type == HardwareType.SENSOR:
            self.capabilities.update(['read', 'digital', 'analog'])
    
    def initialize(self) -> HardwareResponse:
        """Initialize GPIO device"""
        try:
            if self.device_type == HardwareType.MOTOR:
                self.controller = MotorController(self.gpio_system)
                success = self.controller.add_motor(
                    self.device_id,
                    self.config.get('dir_pin'),
                    self.config.get('pwm_pin'),
                    self.config.get('motor_type', 'dc')
                )
            elif self.device_type == HardwareType.LIGHT:
                self.controller = LightController(self.gpio_system)
                success = self.controller.add_light(
                    self.device_id,
                    self.config.get('pin'),
                    self.config.get('light_type', 'digital')
                )
            elif self.device_type == HardwareType.SENSOR:
                self.controller = SensorController(self.gpio_system)
                success = self.controller.add_sensor(
                    self.device_id,
                    self.config.get('pin'),
                    self.config.get('sensor_type'),
                    **self.config.get('sensor_params', {})
                )
            else:
                success = False
            
            self.is_initialized = success
            return HardwareResponse("init", success, {"initialized": success})
            
        except Exception as e:
            logger.error(f"Error initializing GPIO device {self.device_id}: {e}")
            self.error_count += 1
            return HardwareResponse("init", False, error=str(e))
    
    def execute_command(self, command: HardwareCommand) -> HardwareResponse:
        """Execute GPIO device command"""
        if not self.is_initialized:
            init_response = self.initialize()
            if not init_response.success:
                return init_response
        
        try:
            if command.command_type == CommandType.CONTROL:
                return self._handle_control_command(command)
            elif command.command_type == CommandType.READ:
                return self._handle_read_command(command)
            elif command.command_type == CommandType.STATUS:
                return self._handle_status_command(command)
            else:
                return HardwareResponse(command.command_id, False, error="Unsupported command type")
                
        except Exception as e:
            logger.error(f"Error executing command on {self.device_id}: {e}")
            self.error_count += 1
            return HardwareResponse(command.command_id, False, error=str(e))
    
    def _handle_control_command(self, command: HardwareCommand) -> HardwareResponse:
        """Handle control commands"""
        params = command.parameters
        
        if self.device_type == HardwareType.MOTOR:
            success = self.controller.control_motor(
                self.device_id,
                params.get('direction', 'forward'),
                params.get('speed', 50),
                params.get('duration', 0)
            )
        elif self.device_type == HardwareType.LIGHT:
            success = self.controller.control_light(
                self.device_id,
                params.get('state', True),
                params.get('brightness', 100)
            )
        else:
            success = False
        
        return HardwareResponse(command.command_id, success, {"controlled": success})
    
    def _handle_read_command(self, command: HardwareCommand) -> HardwareResponse:
        """Handle read commands"""
        if self.device_type == HardwareType.SENSOR:
            data = self.controller.read_sensor(self.device_id)
            return HardwareResponse(command.command_id, data is not None, data)
        else:
            return HardwareResponse(command.command_id, False, error="Device not readable")
    
    def _handle_status_command(self, command: HardwareCommand) -> HardwareResponse:
        """Handle status commands"""
        status = self.get_status()
        return HardwareResponse(command.command_id, True, status)
    
    def get_status(self) -> Dict[str, Any]:
        """Get GPIO device status"""
        return {
            'device_id': self.device_id,
            'device_type': self.device_type.value,
            'protocol': self.protocol.value,
            'initialized': self.is_initialized,
            'error_count': self.error_count,
            'capabilities': self.get_capabilities(),
            'config': self.config
        }
    
    def cleanup(self):
        """Cleanup GPIO device"""
        if self.controller:
            # Specific cleanup based on device type
            if self.device_type == HardwareType.MOTOR:
                self.controller.stop_motor(self.device_id)

class I2CDevice(HardwareDevice):
    """I2C-based hardware device"""
    
    def __init__(self, device_id: str, device_type: HardwareType, i2c_manager: I2CDeviceManager, address: int):
        super().__init__(device_id, device_type, HardwareProtocol.I2C)
        self.i2c_manager = i2c_manager
        self.address = address
        self.driver = None
        
        # Set capabilities based on device type
        if device_type == HardwareType.SENSOR:
            self.capabilities.update(['read', 'temperature', 'humidity', 'pressure'])
        elif device_type == HardwareType.DISPLAY:
            self.capabilities.update(['write', 'display', 'graphics'])
    
    def initialize(self) -> HardwareResponse:
        """Initialize I2C device"""
        try:
            self.driver = self.i2c_manager.get_driver(self.address)
            if self.driver:
                success = self.driver.is_device_present()
                self.is_initialized = success
                return HardwareResponse("init", success, {"initialized": success})
            else:
                return HardwareResponse("init", False, error="No driver available")
                
        except Exception as e:
            logger.error(f"Error initializing I2C device {self.device_id}: {e}")
            self.error_count += 1
            return HardwareResponse("init", False, error=str(e))
    
    def execute_command(self, command: HardwareCommand) -> HardwareResponse:
        """Execute I2C device command"""
        if not self.is_initialized:
            init_response = self.initialize()
            if not init_response.success:
                return init_response
        
        try:
            if command.command_type == CommandType.READ:
                data = self.driver.read_data()
                return HardwareResponse(command.command_id, data is not None, data)
            elif command.command_type == CommandType.STATUS:
                status = self.get_status()
                return HardwareResponse(command.command_id, True, status)
            else:
                return HardwareResponse(command.command_id, False, error="Unsupported command type")
                
        except Exception as e:
            logger.error(f"Error executing command on {self.device_id}: {e}")
            self.error_count += 1
            return HardwareResponse(command.command_id, False, error=str(e))
    
    def get_status(self) -> Dict[str, Any]:
        """Get I2C device status"""
        status = {
            'device_id': self.device_id,
            'device_type': self.device_type.value,
            'protocol': self.protocol.value,
            'address': f'0x{self.address:02X}',
            'initialized': self.is_initialized,
            'error_count': self.error_count,
            'capabilities': self.get_capabilities()
        }
        
        if self.driver:
            status.update(self.driver.get_device_info())
            
        return status
    
    def cleanup(self):
        """Cleanup I2C device"""
        # I2C devices typically don't need special cleanup
        pass

class HardwareAbstractionLayer:
    """Main hardware abstraction layer"""
    
    def __init__(self):
        self.devices: Dict[str, HardwareDevice] = {}
        self.gpio_system = None
        self.i2c_layer = None
        self.i2c_manager = None
        self.safety_system = None
        self._lock = threading.Lock()
        
        # Initialize subsystems
        self._initialize_subsystems()
    
    def _initialize_subsystems(self):
        """Initialize hardware subsystems"""
        try:
            # Initialize GPIO system
            self.gpio_system = GPIOControlSystem()
            logger.info("✅ GPIO subsystem initialized")
            
            # Initialize I2C system
            self.i2c_layer = I2CCommunicationLayer()
            self.i2c_manager = I2CDeviceManager(self.i2c_layer)
            logger.info("✅ I2C subsystem initialized")
            
            # Initialize safety system
            self.safety_system = SafetySystem(self.gpio_system)
            logger.info("✅ Safety subsystem initialized")
            
        except Exception as e:
            logger.error(f"Error initializing subsystems: {e}")
    
    def create_device(self, device_config: Dict[str, Any]) -> Optional[str]:
        """Create a hardware device using factory pattern"""
        with self._lock:
            try:
                device_id = device_config['device_id']
                device_type = HardwareType(device_config['device_type'])
                protocol = HardwareProtocol(device_config['protocol'])
                
                if protocol == HardwareProtocol.GPIO:
                    device = GPIODevice(device_id, device_type, self.gpio_system, **device_config.get('config', {}))
                elif protocol == HardwareProtocol.I2C:
                    address = device_config['address']
                    device = I2CDevice(device_id, device_type, self.i2c_manager, address)
                else:
                    logger.error(f"Unsupported protocol: {protocol}")
                    return None
                
                # Initialize device
                response = device.initialize()
                if response.success:
                    self.devices[device_id] = device
                    logger.info(f"✅ Created device {device_id} ({device_type.value} via {protocol.value})")
                    return device_id
                else:
                    logger.error(f"Failed to initialize device {device_id}: {response.error}")
                    return None
                    
            except Exception as e:
                logger.error(f"Error creating device: {e}")
                return None
    
    def execute_command(self, device_id: str, command: HardwareCommand) -> HardwareResponse:
        """Execute command on a specific device"""
        with self._lock:
            if device_id not in self.devices:
                return HardwareResponse(command.command_id, False, error=f"Device {device_id} not found")
            
            device = self.devices[device_id]
            return device.execute_command(command)
    
    def get_device_status(self, device_id: str) -> Optional[Dict[str, Any]]:
        """Get status of a specific device"""
        with self._lock:
            if device_id in self.devices:
                return self.devices[device_id].get_status()
            return None
    
    def get_all_devices_status(self) -> Dict[str, Dict[str, Any]]:
        """Get status of all devices"""
        with self._lock:
            return {device_id: device.get_status() for device_id, device in self.devices.items()}
    
    def discover_hardware(self) -> Dict[str, Any]:
        """Discover available hardware"""
        discovered = {
            'gpio_available': self.gpio_system is not None,
            'i2c_devices': [],
            'timestamp': time.time()
        }
        
        if self.i2c_manager:
            i2c_devices = self.i2c_manager.auto_detect_devices()
            discovered['i2c_devices'] = [
                {'address': f'0x{addr:02X}', 'type': device_type}
                for addr, device_type in i2c_devices.items()
            ]
        
        return discovered
    
    def cleanup_all(self):
        """Cleanup all hardware resources"""
        with self._lock:
            logger.info("🧹 Cleaning up all hardware resources")
            
            for device in self.devices.values():
                try:
                    device.cleanup()
                except Exception as e:
                    logger.error(f"Error cleaning up device {device.device_id}: {e}")
            
            if self.gpio_system:
                self.gpio_system.cleanup_all()
            
            if self.i2c_layer:
                self.i2c_layer.cleanup()

# Global hardware abstraction layer instance
_hal_instance = None

def get_hardware_abstraction_layer() -> HardwareAbstractionLayer:
    """Get global hardware abstraction layer instance"""
    global _hal_instance
    if _hal_instance is None:
        _hal_instance = HardwareAbstractionLayer()
    return _hal_instance
