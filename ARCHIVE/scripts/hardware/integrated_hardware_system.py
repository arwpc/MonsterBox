#!/usr/bin/env python3
"""
Integrated Hardware System - Complete hardware integration with safety systems
Part of MonsterBox Hardware Integration Layer (Task 5.5)

This module provides the final integration layer that:
- Implements comprehensive safety limit enforcement
- Provides emergency stop mechanisms
- Manages system-wide hardware coordination
- Includes health monitoring and diagnostics
- Provides comprehensive logging and error handling
- Integrates all hardware subsystems

Features:
- Emergency stop functionality
- Safety bounds checking for all actuators
- Hardware monitoring and health checks
- System-wide integration testing
- Comprehensive logging and diagnostic capabilities
- Graceful shutdown and recovery procedures
"""

import time
import logging
import threading
import asyncio
from typing import Dict, Any, Optional, List, Callable
from enum import Enum
from dataclasses import dataclass
import json

from .hardware_abstraction_layer import HardwareAbstractionLayer, HardwareCommand, HardwareResponse, CommandType
from .device_config_manager import DeviceConfigManager, DeviceConfig
from .gpio_control_system_extension import SafetySystem, SafetyLevel
from .i2c_communication_layer import I2CCommunicationLayer

logger = logging.getLogger(__name__)

class SystemState(Enum):
    """System operational states"""
    INITIALIZING = "initializing"
    OPERATIONAL = "operational"
    EMERGENCY_STOP = "emergency_stop"
    MAINTENANCE = "maintenance"
    SHUTDOWN = "shutdown"
    ERROR = "error"

class HealthStatus(Enum):
    """Health status levels"""
    HEALTHY = "healthy"
    WARNING = "warning"
    CRITICAL = "critical"
    FAILED = "failed"

@dataclass
class SystemHealth:
    """System health information"""
    overall_status: HealthStatus
    subsystem_status: Dict[str, HealthStatus]
    error_count: int
    warning_count: int
    last_check: float
    details: Dict[str, Any]

@dataclass
class SafetyEvent:
    """Safety event information"""
    event_type: str
    severity: SafetyLevel
    device_id: Optional[str]
    message: str
    timestamp: float
    resolved: bool = False

class IntegratedHardwareSystem:
    """Complete integrated hardware system with safety and monitoring"""
    
    def __init__(self):
        self.state = SystemState.INITIALIZING
        self.hal = None
        self.config_manager = None
        self.safety_system = None
        self.health_monitor = None
        
        # System monitoring
        self.system_health = SystemHealth(
            overall_status=HealthStatus.HEALTHY,
            subsystem_status={},
            error_count=0,
            warning_count=0,
            last_check=time.time(),
            details={}
        )
        
        # Safety and events
        self.safety_events: List[SafetyEvent] = []
        self.emergency_stop_active = False
        self.safety_callbacks: List[Callable] = []
        
        # Monitoring and diagnostics
        self.performance_metrics = {}
        self.diagnostic_data = {}
        
        # Threading
        self._lock = threading.Lock()
        self._monitor_thread = None
        self._monitor_active = False
        
        # Initialize system
        self._initialize_system()
    
    def _initialize_system(self):
        """Initialize the complete hardware system"""
        try:
            logger.info("🚀 Initializing Integrated Hardware System...")
            
            # Initialize hardware abstraction layer
            self.hal = HardwareAbstractionLayer()
            logger.info("✅ Hardware Abstraction Layer initialized")
            
            # Initialize configuration manager
            self.config_manager = DeviceConfigManager()
            logger.info("✅ Device Configuration Manager initialized")
            
            # Initialize safety system
            if self.hal.safety_system:
                self.safety_system = self.hal.safety_system
                self._setup_safety_limits()
                logger.info("✅ Safety System initialized")
            
            # Load device configurations and create devices
            self._load_and_create_devices()
            
            # Start health monitoring
            self._start_health_monitoring()
            
            # Set system state to operational
            self.state = SystemState.OPERATIONAL
            logger.info("✅ Integrated Hardware System fully operational")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize hardware system: {e}")
            self.state = SystemState.ERROR
            raise
    
    def _setup_safety_limits(self):
        """Setup comprehensive safety limits for all hardware"""
        try:
            # Motor safety limits
            self.safety_system.set_safety_limit("motor", "max_speed", 100, SafetyLevel.CRITICAL)
            self.safety_system.set_safety_limit("motor", "max_duration", 5.0, SafetyLevel.HIGH)
            
            # Servo safety limits
            self.safety_system.set_safety_limit("servo", "max_angle", 180, SafetyLevel.MEDIUM)
            self.safety_system.set_safety_limit("servo", "min_angle", -180, SafetyLevel.MEDIUM)
            
            # Light safety limits
            self.safety_system.set_safety_limit("light", "max_brightness", 100, SafetyLevel.LOW)
            
            # Add safety callbacks
            self.safety_system.add_safety_callback(self._handle_safety_event)
            
            logger.info("🛡️ Safety limits configured")
            
        except Exception as e:
            logger.error(f"Error setting up safety limits: {e}")
    
    def _load_and_create_devices(self):
        """Load device configurations and create hardware devices"""
        try:
            device_configs = self.config_manager.get_all_device_configs()
            
            for device_id, config in device_configs.items():
                if config.enabled:
                    device_config_dict = {
                        'device_id': config.device_id,
                        'device_type': config.device_type,
                        'protocol': config.protocol,
                        'config': config.config
                    }
                    
                    # Add I2C address if applicable
                    if config.protocol == 'i2c' and 'address' in config.config:
                        device_config_dict['address'] = config.config['address']
                    
                    created_device = self.hal.create_device(device_config_dict)
                    if created_device:
                        logger.info(f"✅ Created device: {device_id}")
                    else:
                        logger.warning(f"⚠️ Failed to create device: {device_id}")
            
        except Exception as e:
            logger.error(f"Error loading and creating devices: {e}")
    
    def _start_health_monitoring(self):
        """Start continuous health monitoring"""
        self._monitor_active = True
        self._monitor_thread = threading.Thread(target=self._health_monitor_loop, daemon=True)
        self._monitor_thread.start()
        logger.info("🏥 Health monitoring started")
    
    def _health_monitor_loop(self):
        """Health monitoring loop"""
        while self._monitor_active:
            try:
                self._perform_health_check()
                time.sleep(10)  # Check every 10 seconds
            except Exception as e:
                logger.error(f"Error in health monitoring: {e}")
                time.sleep(5)
    
    def _perform_health_check(self):
        """Perform comprehensive health check"""
        with self._lock:
            try:
                # Check overall system state
                if self.state == SystemState.EMERGENCY_STOP:
                    self.system_health.overall_status = HealthStatus.CRITICAL
                    return
                
                # Check subsystems
                subsystem_status = {}
                
                # Check HAL
                if self.hal:
                    devices_status = self.hal.get_all_devices_status()
                    healthy_devices = sum(1 for status in devices_status.values() if status.get('error_count', 0) < 5)
                    total_devices = len(devices_status)
                    
                    if total_devices == 0:
                        subsystem_status['hal'] = HealthStatus.WARNING
                    elif healthy_devices / total_devices > 0.8:
                        subsystem_status['hal'] = HealthStatus.HEALTHY
                    elif healthy_devices / total_devices > 0.5:
                        subsystem_status['hal'] = HealthStatus.WARNING
                    else:
                        subsystem_status['hal'] = HealthStatus.CRITICAL
                else:
                    subsystem_status['hal'] = HealthStatus.FAILED
                
                # Check safety system
                if self.safety_system:
                    safety_status = self.safety_system.get_safety_status()
                    if safety_status['emergency_stop_active']:
                        subsystem_status['safety'] = HealthStatus.CRITICAL
                    elif safety_status['total_violations'] > 10:
                        subsystem_status['safety'] = HealthStatus.WARNING
                    else:
                        subsystem_status['safety'] = HealthStatus.HEALTHY
                else:
                    subsystem_status['safety'] = HealthStatus.FAILED
                
                # Check configuration manager
                if self.config_manager:
                    validation_errors = self.config_manager.validate_all_configurations()
                    total_errors = len(validation_errors['devices']) + len(validation_errors['calibrations'])
                    
                    if total_errors == 0:
                        subsystem_status['config'] = HealthStatus.HEALTHY
                    elif total_errors < 5:
                        subsystem_status['config'] = HealthStatus.WARNING
                    else:
                        subsystem_status['config'] = HealthStatus.CRITICAL
                else:
                    subsystem_status['config'] = HealthStatus.FAILED
                
                # Determine overall status
                critical_count = sum(1 for status in subsystem_status.values() if status == HealthStatus.CRITICAL)
                failed_count = sum(1 for status in subsystem_status.values() if status == HealthStatus.FAILED)
                warning_count = sum(1 for status in subsystem_status.values() if status == HealthStatus.WARNING)
                
                if failed_count > 0 or critical_count > 1:
                    overall_status = HealthStatus.CRITICAL
                elif critical_count > 0 or warning_count > 1:
                    overall_status = HealthStatus.WARNING
                else:
                    overall_status = HealthStatus.HEALTHY
                
                # Update system health
                self.system_health = SystemHealth(
                    overall_status=overall_status,
                    subsystem_status=subsystem_status,
                    error_count=self.system_health.error_count,
                    warning_count=warning_count,
                    last_check=time.time(),
                    details={
                        'devices_count': len(self.hal.get_all_devices_status()) if self.hal else 0,
                        'safety_violations': safety_status.get('total_violations', 0) if self.safety_system else 0,
                        'config_errors': total_errors if self.config_manager else 0
                    }
                )
                
            except Exception as e:
                logger.error(f"Error performing health check: {e}")
                self.system_health.overall_status = HealthStatus.CRITICAL
    
    def _handle_safety_event(self, event_type: str, details: Any):
        """Handle safety events"""
        try:
            safety_event = SafetyEvent(
                event_type=event_type,
                severity=SafetyLevel.CRITICAL if event_type == "emergency_stop" else SafetyLevel.MEDIUM,
                device_id=None,
                message=str(details),
                timestamp=time.time()
            )
            
            self.safety_events.append(safety_event)
            
            # Handle emergency stop
            if event_type == "emergency_stop":
                self.trigger_emergency_stop(f"Safety event: {details}")
            
            # Trigger safety callbacks
            for callback in self.safety_callbacks:
                try:
                    callback(safety_event)
                except Exception as e:
                    logger.error(f"Error in safety callback: {e}")
            
            logger.warning(f"🚨 Safety event: {event_type} - {details}")
            
        except Exception as e:
            logger.error(f"Error handling safety event: {e}")
    
    def trigger_emergency_stop(self, reason: str = "Manual trigger"):
        """Trigger system-wide emergency stop"""
        with self._lock:
            try:
                if self.emergency_stop_active:
                    return
                
                self.emergency_stop_active = True
                self.state = SystemState.EMERGENCY_STOP
                
                logger.critical(f"🚨 EMERGENCY STOP TRIGGERED: {reason}")
                
                # Stop all motors immediately
                if self.hal:
                    devices_status = self.hal.get_all_devices_status()
                    for device_id, status in devices_status.items():
                        if status.get('device_type') == 'motor':
                            try:
                                stop_command = HardwareCommand(CommandType.CONTROL, device_id, {'direction': 'stop', 'speed': 0})
                                self.hal.execute_command(device_id, stop_command)
                            except Exception as e:
                                logger.error(f"Error stopping motor {device_id}: {e}")
                
                # Trigger safety system emergency stop
                if self.safety_system:
                    self.safety_system.trigger_emergency_stop(reason)
                
                # Record safety event
                safety_event = SafetyEvent(
                    event_type="emergency_stop",
                    severity=SafetyLevel.CRITICAL,
                    device_id=None,
                    message=reason,
                    timestamp=time.time()
                )
                self.safety_events.append(safety_event)
                
            except Exception as e:
                logger.error(f"Error during emergency stop: {e}")
    
    def reset_emergency_stop(self):
        """Reset emergency stop (requires manual intervention)"""
        with self._lock:
            if not self.emergency_stop_active:
                return
            
            try:
                # Reset safety system
                if self.safety_system:
                    self.safety_system.reset_emergency_stop()
                
                self.emergency_stop_active = False
                self.state = SystemState.OPERATIONAL
                
                logger.info("🔄 Emergency stop reset - system operational")
                
            except Exception as e:
                logger.error(f"Error resetting emergency stop: {e}")
    
    def execute_device_command(self, device_id: str, command_type: CommandType, parameters: Dict[str, Any] = None) -> HardwareResponse:
        """Execute command on a device with safety checks"""
        if self.emergency_stop_active:
            return HardwareResponse("emergency_stop", False, error="System in emergency stop")
        
        if self.state != SystemState.OPERATIONAL:
            return HardwareResponse("not_operational", False, error=f"System not operational: {self.state.value}")
        
        try:
            # Apply safety limits
            if self.safety_system and parameters:
                device_status = self.hal.get_device_status(device_id)
                if device_status:
                    device_type = device_status.get('device_type', '')
                    
                    # Check and enforce safety limits
                    for param, value in parameters.items():
                        if param in ['speed', 'brightness', 'angle', 'duration']:
                            safe_value = self.safety_system.enforce_safety_limit(device_type, f"max_{param}", value)
                            if safe_value != value:
                                logger.warning(f"🛡️ Safety limit enforced: {param} {value} -> {safe_value}")
                                parameters[param] = safe_value
            
            # Execute command
            command = HardwareCommand(command_type, device_id, parameters)
            response = self.hal.execute_command(device_id, command)
            
            return response
            
        except Exception as e:
            logger.error(f"Error executing device command: {e}")
            return HardwareResponse("error", False, error=str(e))
    
    def get_system_status(self) -> Dict[str, Any]:
        """Get comprehensive system status"""
        with self._lock:
            return {
                'system_state': self.state.value,
                'emergency_stop_active': self.emergency_stop_active,
                'health': {
                    'overall_status': self.system_health.overall_status.value,
                    'subsystem_status': {k: v.value for k, v in self.system_health.subsystem_status.items()},
                    'error_count': self.system_health.error_count,
                    'warning_count': self.system_health.warning_count,
                    'last_check': self.system_health.last_check,
                    'details': self.system_health.details
                },
                'devices': self.hal.get_all_devices_status() if self.hal else {},
                'safety_events': len(self.safety_events),
                'recent_safety_events': [
                    {
                        'event_type': event.event_type,
                        'severity': event.severity.value,
                        'message': event.message,
                        'timestamp': event.timestamp
                    }
                    for event in self.safety_events[-5:]  # Last 5 events
                ],
                'discovered_hardware': self.hal.discover_hardware() if self.hal else {}
            }
    
    def run_system_diagnostics(self) -> Dict[str, Any]:
        """Run comprehensive system diagnostics"""
        diagnostics = {
            'timestamp': time.time(),
            'system_state': self.state.value,
            'tests': {}
        }
        
        try:
            # Test hardware abstraction layer
            if self.hal:
                devices = self.hal.get_all_devices_status()
                diagnostics['tests']['hal'] = {
                    'passed': True,
                    'device_count': len(devices),
                    'healthy_devices': sum(1 for d in devices.values() if d.get('error_count', 0) < 5)
                }
            else:
                diagnostics['tests']['hal'] = {'passed': False, 'error': 'HAL not initialized'}
            
            # Test configuration manager
            if self.config_manager:
                validation_errors = self.config_manager.validate_all_configurations()
                total_errors = len(validation_errors['devices']) + len(validation_errors['calibrations'])
                diagnostics['tests']['config'] = {
                    'passed': total_errors == 0,
                    'validation_errors': total_errors,
                    'details': validation_errors
                }
            else:
                diagnostics['tests']['config'] = {'passed': False, 'error': 'Config manager not initialized'}
            
            # Test safety system
            if self.safety_system:
                safety_status = self.safety_system.get_safety_status()
                diagnostics['tests']['safety'] = {
                    'passed': not safety_status['emergency_stop_active'],
                    'emergency_stop': safety_status['emergency_stop_active'],
                    'violations': safety_status['total_violations']
                }
            else:
                diagnostics['tests']['safety'] = {'passed': False, 'error': 'Safety system not initialized'}
            
            # Overall test result
            all_tests_passed = all(test.get('passed', False) for test in diagnostics['tests'].values())
            diagnostics['overall_result'] = 'PASS' if all_tests_passed else 'FAIL'
            
        except Exception as e:
            logger.error(f"Error running diagnostics: {e}")
            diagnostics['overall_result'] = 'ERROR'
            diagnostics['error'] = str(e)
        
        return diagnostics
    
    def shutdown_system(self):
        """Gracefully shutdown the hardware system"""
        with self._lock:
            try:
                logger.info("🛑 Shutting down Integrated Hardware System...")
                
                self.state = SystemState.SHUTDOWN
                
                # Stop health monitoring
                self._monitor_active = False
                if self._monitor_thread:
                    self._monitor_thread.join(timeout=5)
                
                # Stop all devices
                if self.hal:
                    devices_status = self.hal.get_all_devices_status()
                    for device_id in devices_status.keys():
                        try:
                            stop_command = HardwareCommand(CommandType.SHUTDOWN, device_id)
                            self.hal.execute_command(device_id, stop_command)
                        except Exception as e:
                            logger.error(f"Error shutting down device {device_id}: {e}")
                
                # Cleanup hardware abstraction layer
                if self.hal:
                    self.hal.cleanup_all()
                
                # Backup configurations
                if self.config_manager:
                    self.config_manager.backup_configurations()
                
                logger.info("✅ Hardware system shutdown complete")
                
            except Exception as e:
                logger.error(f"Error during system shutdown: {e}")

# Global integrated hardware system instance
_integrated_system = None

def get_integrated_hardware_system() -> IntegratedHardwareSystem:
    """Get global integrated hardware system instance"""
    global _integrated_system
    if _integrated_system is None:
        _integrated_system = IntegratedHardwareSystem()
    return _integrated_system
