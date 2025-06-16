#!/usr/bin/env python3
"""
GPIO Control System Extension - Additional components for Task 5.1
Part of MonsterBox Hardware Integration Layer

This module extends the GPIO control system with:
- Sensor controllers
- Analog reading capabilities
- Safety systems
- Emergency stop mechanisms
"""

import time
import logging
import threading
from typing import Dict, Any, Optional, List, Callable
from enum import Enum
from .gpio_control_system import GPIOControlSystem, PinMode

logger = logging.getLogger(__name__)

class SensorType(Enum):
    """Types of sensors supported"""
    DIGITAL = "digital"
    ANALOG = "analog"
    ULTRASONIC = "ultrasonic"
    TEMPERATURE = "temperature"
    MOTION = "motion"

class SafetyLevel(Enum):
    """Safety levels for operations"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class SensorController:
    """Sensor reading and management using GPIO system"""
    
    def __init__(self, gpio_system: GPIOControlSystem):
        self.gpio = gpio_system
        self.sensors: Dict[str, Dict[str, Any]] = {}
        self.sensor_callbacks: Dict[str, List[Callable]] = {}
        self._monitoring_active = False
        self._monitor_thread = None
        
    def add_sensor(self, name: str, pin: int, sensor_type: SensorType, **kwargs) -> bool:
        """Add a sensor configuration
        
        Args:
            name: Sensor identifier
            pin: GPIO pin number (or trigger pin for ultrasonic)
            sensor_type: Type of sensor
            **kwargs: Additional sensor-specific parameters
        """
        try:
            # Setup pin based on sensor type
            if sensor_type in [SensorType.DIGITAL, SensorType.MOTION]:
                if not self.gpio.setup_pin(pin, PinMode.INPUT, pull_up=kwargs.get('pull_up', True)):
                    return False
            elif sensor_type == SensorType.ULTRASONIC:
                # Ultrasonic needs trigger and echo pins
                trigger_pin = pin
                echo_pin = kwargs.get('echo_pin')
                if not echo_pin:
                    logger.error("Ultrasonic sensor requires echo_pin parameter")
                    return False
                    
                if not self.gpio.setup_pin(trigger_pin, PinMode.OUTPUT):
                    return False
                if not self.gpio.setup_pin(echo_pin, PinMode.INPUT):
                    return False
                    
            self.sensors[name] = {
                'pin': pin,
                'type': sensor_type,
                'last_reading': None,
                'last_read_time': None,
                'read_count': 0,
                'error_count': 0,
                'kwargs': kwargs
            }
            
            logger.info(f"📡 Sensor '{name}' added on pin {pin} ({sensor_type.value})")
            return True
            
        except Exception as e:
            logger.error(f"Error adding sensor '{name}': {e}")
            return False
    
    def read_sensor(self, name: str) -> Optional[Any]:
        """Read value from a sensor"""
        if name not in self.sensors:
            logger.error(f"Sensor '{name}' not found")
            return None
            
        sensor = self.sensors[name]
        
        try:
            if sensor['type'] == SensorType.DIGITAL:
                value = self.gpio.digital_read(sensor['pin'])
            elif sensor['type'] == SensorType.MOTION:
                value = self.gpio.digital_read(sensor['pin'])
            elif sensor['type'] == SensorType.ULTRASONIC:
                value = self._read_ultrasonic(sensor)
            elif sensor['type'] == SensorType.ANALOG:
                value = self._read_analog(sensor)
            else:
                logger.warning(f"Unsupported sensor type: {sensor['type']}")
                return None
                
            # Update sensor statistics
            sensor['last_reading'] = value
            sensor['last_read_time'] = time.time()
            sensor['read_count'] += 1
            
            return value
            
        except Exception as e:
            logger.error(f"Error reading sensor '{name}': {e}")
            sensor['error_count'] += 1
            return None
    
    def _read_ultrasonic(self, sensor: Dict[str, Any]) -> Optional[float]:
        """Read ultrasonic distance sensor (HC-SR04)"""
        try:
            trigger_pin = sensor['pin']
            echo_pin = sensor['kwargs']['echo_pin']
            
            # Send trigger pulse
            self.gpio.digital_write(trigger_pin, False)
            time.sleep(0.000002)  # 2 microseconds
            self.gpio.digital_write(trigger_pin, True)
            time.sleep(0.00001)   # 10 microseconds
            self.gpio.digital_write(trigger_pin, False)
            
            # Measure echo pulse duration
            start_time = time.time()
            timeout = start_time + 0.1  # 100ms timeout
            
            # Wait for echo start
            while self.gpio.digital_read(echo_pin) == False:
                if time.time() > timeout:
                    return None
                start_time = time.time()
            
            # Wait for echo end
            while self.gpio.digital_read(echo_pin) == True:
                if time.time() > timeout:
                    return None
                end_time = time.time()
            
            # Calculate distance (speed of sound = 343 m/s)
            duration = end_time - start_time
            distance = (duration * 343) / 2  # Divide by 2 for round trip
            
            return distance * 100  # Return in centimeters
            
        except Exception as e:
            logger.error(f"Error reading ultrasonic sensor: {e}")
            return None
    
    def _read_analog(self, sensor: Dict[str, Any]) -> Optional[float]:
        """Read analog sensor (requires ADC like MCP3008)"""
        # This is a placeholder for analog reading
        # In a real implementation, this would interface with an ADC
        logger.warning("Analog reading not implemented - requires ADC hardware")
        return None
    
    def start_monitoring(self, interval: float = 1.0):
        """Start continuous sensor monitoring"""
        if self._monitoring_active:
            return
            
        self._monitoring_active = True
        self._monitor_thread = threading.Thread(target=self._monitor_sensors, args=(interval,))
        self._monitor_thread.daemon = True
        self._monitor_thread.start()
        logger.info(f"📡 Started sensor monitoring (interval: {interval}s)")
    
    def stop_monitoring(self):
        """Stop sensor monitoring"""
        self._monitoring_active = False
        if self._monitor_thread:
            self._monitor_thread.join(timeout=2.0)
        logger.info("📡 Stopped sensor monitoring")
    
    def _monitor_sensors(self, interval: float):
        """Background sensor monitoring thread"""
        while self._monitoring_active:
            for name in self.sensors:
                value = self.read_sensor(name)
                if value is not None:
                    self._trigger_callbacks(name, value)
            time.sleep(interval)
    
    def add_callback(self, sensor_name: str, callback: Callable):
        """Add callback for sensor value changes"""
        if sensor_name not in self.sensor_callbacks:
            self.sensor_callbacks[sensor_name] = []
        self.sensor_callbacks[sensor_name].append(callback)
    
    def _trigger_callbacks(self, sensor_name: str, value: Any):
        """Trigger callbacks for sensor value"""
        if sensor_name in self.sensor_callbacks:
            for callback in self.sensor_callbacks[sensor_name]:
                try:
                    callback(sensor_name, value)
                except Exception as e:
                    logger.error(f"Error in sensor callback: {e}")

class SafetySystem:
    """Safety system for hardware operations"""
    
    def __init__(self, gpio_system: GPIOControlSystem):
        self.gpio = gpio_system
        self.safety_limits: Dict[str, Dict[str, Any]] = {}
        self.emergency_stop_active = False
        self.safety_callbacks: List[Callable] = []
        self._lock = threading.Lock()
        
    def set_safety_limit(self, component: str, limit_type: str, value: Any, level: SafetyLevel = SafetyLevel.MEDIUM):
        """Set safety limit for a component
        
        Args:
            component: Component name (motor, servo, etc.)
            limit_type: Type of limit (max_speed, max_duration, etc.)
            value: Limit value
            level: Safety level
        """
        with self._lock:
            if component not in self.safety_limits:
                self.safety_limits[component] = {}
                
            self.safety_limits[component][limit_type] = {
                'value': value,
                'level': level,
                'violations': 0
            }
            
            logger.info(f"🛡️ Safety limit set: {component}.{limit_type} = {value} ({level.value})")
    
    def check_safety_limit(self, component: str, limit_type: str, current_value: Any) -> bool:
        """Check if current value violates safety limit"""
        with self._lock:
            if component not in self.safety_limits:
                return True  # No limits set
                
            if limit_type not in self.safety_limits[component]:
                return True  # No limit for this type
                
            limit = self.safety_limits[component][limit_type]
            
            # Check limit based on type
            if limit_type in ['max_speed', 'max_brightness', 'max_angle']:
                violation = current_value > limit['value']
            elif limit_type in ['min_speed', 'min_brightness', 'min_angle']:
                violation = current_value < limit['value']
            elif limit_type == 'max_duration':
                violation = current_value > limit['value']
            else:
                violation = False
                
            if violation:
                limit['violations'] += 1
                logger.warning(f"🚨 Safety violation: {component}.{limit_type} = {current_value} > {limit['value']}")
                
                if limit['level'] == SafetyLevel.CRITICAL:
                    self.trigger_emergency_stop(f"Critical safety violation: {component}.{limit_type}")
                    
                return False
                
            return True
    
    def enforce_safety_limit(self, component: str, limit_type: str, requested_value: Any) -> Any:
        """Enforce safety limit by clamping value"""
        with self._lock:
            if component not in self.safety_limits:
                return requested_value
                
            if limit_type not in self.safety_limits[component]:
                return requested_value
                
            limit = self.safety_limits[component][limit_type]
            
            if limit_type in ['max_speed', 'max_brightness', 'max_angle', 'max_duration']:
                return min(requested_value, limit['value'])
            elif limit_type in ['min_speed', 'min_brightness', 'min_angle']:
                return max(requested_value, limit['value'])
            else:
                return requested_value
    
    def trigger_emergency_stop(self, reason: str = "Manual trigger"):
        """Trigger emergency stop"""
        with self._lock:
            if self.emergency_stop_active:
                return
                
            self.emergency_stop_active = True
            logger.critical(f"🚨 EMERGENCY STOP TRIGGERED: {reason}")
            
            # Trigger safety callbacks
            for callback in self.safety_callbacks:
                try:
                    callback("emergency_stop", reason)
                except Exception as e:
                    logger.error(f"Error in safety callback: {e}")
    
    def reset_emergency_stop(self):
        """Reset emergency stop (requires manual intervention)"""
        with self._lock:
            self.emergency_stop_active = False
            logger.info("🔄 Emergency stop reset")
    
    def add_safety_callback(self, callback: Callable):
        """Add callback for safety events"""
        self.safety_callbacks.append(callback)
    
    def get_safety_status(self) -> Dict[str, Any]:
        """Get current safety system status"""
        with self._lock:
            return {
                'emergency_stop_active': self.emergency_stop_active,
                'total_limits': len(self.safety_limits),
                'total_violations': sum(
                    sum(limit['violations'] for limit in component.values())
                    for component in self.safety_limits.values()
                ),
                'limits': self.safety_limits.copy()
            }

# Global safety system instance
_safety_system = None

def get_safety_system(gpio_system: GPIOControlSystem = None) -> SafetySystem:
    """Get global safety system instance"""
    global _safety_system
    if _safety_system is None and gpio_system is not None:
        _safety_system = SafetySystem(gpio_system)
    return _safety_system
