#!/usr/bin/env python3
"""
GPIO Control System - Comprehensive GPIO control for all hardware components
Part of MonsterBox Hardware Integration Layer (Task 5.1)

This module provides unified GPIO control for:
- Motors (DC motors, stepper motors)
- Servos (PWM control)
- Linear actuators
- Lights and LEDs
- Sensors (digital and analog)
- General purpose I/O

Features:
- Multiple GPIO backend support (lgpio, pigpio, RPi.GPIO)
- Automatic fallback and error recovery
- Resource management and cleanup
- Safety limits and bounds checking
- Configuration-driven pin management
"""

import lgpio
import time
import json
import sys
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List, Union
from enum import Enum
import threading
import atexit

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GPIOBackend(Enum):
    """Supported GPIO backends"""
    LGPIO = "lgpio"
    PIGPIO = "pigpio"
    RPI_GPIO = "rpi_gpio"
    SIMULATION = "simulation"

class PinMode(Enum):
    """GPIO pin modes"""
    INPUT = "input"
    OUTPUT = "output"
    PWM = "pwm"
    SERVO = "servo"

class GPIOControlSystem:
    """Main GPIO control system with backend abstraction"""
    
    def __init__(self, preferred_backend: GPIOBackend = GPIOBackend.LGPIO):
        self.backend = None
        self.gpio_handle = None
        self.active_pins: Dict[int, Dict[str, Any]] = {}
        self.is_initialized = False
        self.preferred_backend = preferred_backend
        self._lock = threading.Lock()
        
        # Register cleanup on exit
        atexit.register(self.cleanup_all)
        
        # Initialize backend
        self._initialize_backend()
    
    def _initialize_backend(self):
        """Initialize GPIO backend with fallback options"""
        backends_to_try = [
            self.preferred_backend,
            GPIOBackend.LGPIO,
            GPIOBackend.PIGPIO,
            GPIOBackend.RPI_GPIO,
            GPIOBackend.SIMULATION
        ]
        
        for backend in backends_to_try:
            if self._try_backend(backend):
                self.backend = backend
                self.is_initialized = True
                logger.info(f"✅ GPIO initialized with {backend.value} backend")
                return
        
        raise RuntimeError("Failed to initialize any GPIO backend")
    
    def _try_backend(self, backend: GPIOBackend) -> bool:
        """Try to initialize a specific GPIO backend"""
        try:
            if backend == GPIOBackend.LGPIO:
                return self._init_lgpio()
            elif backend == GPIOBackend.PIGPIO:
                return self._init_pigpio()
            elif backend == GPIOBackend.RPI_GPIO:
                return self._init_rpi_gpio()
            elif backend == GPIOBackend.SIMULATION:
                return self._init_simulation()
        except Exception as e:
            logger.debug(f"Failed to initialize {backend.value}: {e}")
            return False
        
        return False
    
    def _init_lgpio(self) -> bool:
        """Initialize lgpio backend"""
        try:
            import lgpio
            self.gpio_handle = lgpio.gpiochip_open(0)
            return True
        except ImportError:
            logger.debug("lgpio not available")
            return False
        except Exception as e:
            logger.debug(f"lgpio initialization failed: {e}")
            return False
    
    def _init_pigpio(self) -> bool:
        """Initialize pigpio backend"""
        try:
            import pigpio
            self.gpio_handle = pigpio.pi()
            return self.gpio_handle.connected
        except ImportError:
            logger.debug("pigpio not available")
            return False
        except Exception as e:
            logger.debug(f"pigpio initialization failed: {e}")
            return False
    
    def _init_rpi_gpio(self) -> bool:
        """Initialize RPi.GPIO backend"""
        try:
            import RPi.GPIO as GPIO
            GPIO.setmode(GPIO.BCM)
            GPIO.setwarnings(False)
            return True
        except ImportError:
            logger.debug("RPi.GPIO not available")
            return False
        except Exception as e:
            logger.debug(f"RPi.GPIO initialization failed: {e}")
            return False
    
    def _init_simulation(self) -> bool:
        """Initialize simulation backend"""
        logger.info("Using GPIO simulation mode")
        return True
    
    def setup_pin(self, pin: int, mode: PinMode, **kwargs) -> bool:
        """Setup a GPIO pin with specified mode and parameters"""
        with self._lock:
            try:
                if pin in self.active_pins:
                    logger.warning(f"Pin {pin} already configured, cleaning up first")
                    self._cleanup_pin(pin)
                
                pin_config = {
                    'pin': pin,
                    'mode': mode,
                    'backend': self.backend,
                    'kwargs': kwargs,
                    'initialized_at': time.time()
                }
                
                if self.backend == GPIOBackend.LGPIO:
                    success = self._setup_pin_lgpio(pin, mode, **kwargs)
                elif self.backend == GPIOBackend.PIGPIO:
                    success = self._setup_pin_pigpio(pin, mode, **kwargs)
                elif self.backend == GPIOBackend.RPI_GPIO:
                    success = self._setup_pin_rpi_gpio(pin, mode, **kwargs)
                else:  # SIMULATION
                    success = self._setup_pin_simulation(pin, mode, **kwargs)
                
                if success:
                    self.active_pins[pin] = pin_config
                    logger.info(f"✅ Pin {pin} configured as {mode.value}")
                    return True
                else:
                    logger.error(f"❌ Failed to configure pin {pin}")
                    return False
                    
            except Exception as e:
                logger.error(f"Error setting up pin {pin}: {e}")
                return False
    
    def _setup_pin_lgpio(self, pin: int, mode: PinMode, **kwargs) -> bool:
        """Setup pin using lgpio backend"""
        try:
            if mode == PinMode.OUTPUT:
                lgpio.gpio_claim_output(self.gpio_handle, pin)
            elif mode == PinMode.INPUT:
                pull_up = kwargs.get('pull_up', False)
                pull_down = kwargs.get('pull_down', False)
                if pull_up:
                    lgpio.gpio_claim_input(self.gpio_handle, pin, lgpio.SET_PULL_UP)
                elif pull_down:
                    lgpio.gpio_claim_input(self.gpio_handle, pin, lgpio.SET_PULL_DOWN)
                else:
                    lgpio.gpio_claim_input(self.gpio_handle, pin)
            elif mode in [PinMode.PWM, PinMode.SERVO]:
                lgpio.gpio_claim_output(self.gpio_handle, pin)
            return True
        except Exception as e:
            logger.error(f"lgpio pin setup failed: {e}")
            return False
    
    def _setup_pin_pigpio(self, pin: int, mode: PinMode, **kwargs) -> bool:
        """Setup pin using pigpio backend"""
        try:
            import pigpio
            if mode == PinMode.OUTPUT:
                self.gpio_handle.set_mode(pin, pigpio.OUTPUT)
            elif mode == PinMode.INPUT:
                self.gpio_handle.set_mode(pin, pigpio.INPUT)
                pull_up = kwargs.get('pull_up', False)
                pull_down = kwargs.get('pull_down', False)
                if pull_up:
                    self.gpio_handle.set_pull_up_down(pin, pigpio.PUD_UP)
                elif pull_down:
                    self.gpio_handle.set_pull_up_down(pin, pigpio.PUD_DOWN)
            elif mode in [PinMode.PWM, PinMode.SERVO]:
                self.gpio_handle.set_mode(pin, pigpio.OUTPUT)
            return True
        except Exception as e:
            logger.error(f"pigpio pin setup failed: {e}")
            return False
    
    def _setup_pin_rpi_gpio(self, pin: int, mode: PinMode, **kwargs) -> bool:
        """Setup pin using RPi.GPIO backend"""
        try:
            import RPi.GPIO as GPIO
            if mode == PinMode.OUTPUT:
                GPIO.setup(pin, GPIO.OUT)
            elif mode == PinMode.INPUT:
                pull_up = kwargs.get('pull_up', False)
                pull_down = kwargs.get('pull_down', False)
                if pull_up:
                    GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
                elif pull_down:
                    GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)
                else:
                    GPIO.setup(pin, GPIO.IN)
            elif mode in [PinMode.PWM, PinMode.SERVO]:
                GPIO.setup(pin, GPIO.OUT)
            return True
        except Exception as e:
            logger.error(f"RPi.GPIO pin setup failed: {e}")
            return False
    
    def _setup_pin_simulation(self, pin: int, mode: PinMode, **kwargs) -> bool:
        """Setup pin in simulation mode"""
        logger.info(f"🎭 Simulated pin {pin} setup as {mode.value}")
        return True
    
    def digital_write(self, pin: int, value: bool) -> bool:
        """Write digital value to output pin"""
        with self._lock:
            if pin not in self.active_pins:
                logger.error(f"Pin {pin} not configured")
                return False
            
            try:
                if self.backend == GPIOBackend.LGPIO:
                    lgpio.gpio_write(self.gpio_handle, pin, 1 if value else 0)
                elif self.backend == GPIOBackend.PIGPIO:
                    self.gpio_handle.write(pin, 1 if value else 0)
                elif self.backend == GPIOBackend.RPI_GPIO:
                    import RPi.GPIO as GPIO
                    GPIO.output(pin, GPIO.HIGH if value else GPIO.LOW)
                else:  # SIMULATION
                    logger.info(f"🎭 Simulated write pin {pin} = {value}")
                
                return True
            except Exception as e:
                logger.error(f"Error writing to pin {pin}: {e}")
                return False
    
    def digital_read(self, pin: int) -> Optional[bool]:
        """Read digital value from input pin"""
        with self._lock:
            if pin not in self.active_pins:
                logger.error(f"Pin {pin} not configured")
                return None
            
            try:
                if self.backend == GPIOBackend.LGPIO:
                    return bool(lgpio.gpio_read(self.gpio_handle, pin))
                elif self.backend == GPIOBackend.PIGPIO:
                    return bool(self.gpio_handle.read(pin))
                elif self.backend == GPIOBackend.RPI_GPIO:
                    import RPi.GPIO as GPIO
                    return bool(GPIO.input(pin))
                else:  # SIMULATION
                    logger.info(f"🎭 Simulated read pin {pin}")
                    return False  # Default simulation value
                    
            except Exception as e:
                logger.error(f"Error reading pin {pin}: {e}")
                return None

    def analog_read(self, pin: int, adc_channel: int = 0) -> Optional[float]:
        """Read analog value from ADC (requires external ADC like MCP3008)

        Args:
            pin: GPIO pin number (for SPI communication with ADC)
            adc_channel: ADC channel number (0-7 for MCP3008)

        Returns:
            Analog value as voltage (0.0-3.3V) or None if error
        """
        with self._lock:
            try:
                # This is a placeholder implementation
                # In a real system, this would interface with an ADC via SPI
                if self.backend == GPIOBackend.SIMULATION:
                    # Return simulated analog value
                    import random
                    simulated_value = random.uniform(0.0, 3.3)
                    logger.info(f"🎭 Simulated analog read pin {pin}, channel {adc_channel}: {simulated_value:.2f}V")
                    return simulated_value
                else:
                    logger.warning(f"Analog reading not implemented for {self.backend.value} - requires ADC hardware")
                    return None

            except Exception as e:
                logger.error(f"Error reading analog pin {pin}: {e}")
                return None

    def cleanup_all(self):
        """Cleanup all GPIO resources"""
        with self._lock:
            logger.info("🧹 Cleaning up all GPIO resources")
            for pin in list(self.active_pins.keys()):
                self._cleanup_pin(pin)
            
            if self.gpio_handle and self.backend == GPIOBackend.LGPIO:
                try:
                    lgpio.gpiochip_close(self.gpio_handle)
                except:
                    pass
            elif self.gpio_handle and self.backend == GPIOBackend.PIGPIO:
                try:
                    self.gpio_handle.stop()
                except:
                    pass
            elif self.backend == GPIOBackend.RPI_GPIO:
                try:
                    import RPi.GPIO as GPIO
                    GPIO.cleanup()
                except:
                    pass
    
    def _cleanup_pin(self, pin: int):
        """Cleanup a specific pin"""
        try:
            if self.backend == GPIOBackend.LGPIO and self.gpio_handle:
                lgpio.gpio_free(self.gpio_handle, pin)
            # Other backends handle cleanup in cleanup_all
            
            if pin in self.active_pins:
                del self.active_pins[pin]
                
        except Exception as e:
            logger.debug(f"Error cleaning up pin {pin}: {e}")

    def pwm_write(self, pin: int, duty_cycle: float, frequency: float = 1000) -> bool:
        """Write PWM signal to pin

        Args:
            pin: GPIO pin number
            duty_cycle: Duty cycle as percentage (0-100)
            frequency: PWM frequency in Hz
        """
        with self._lock:
            if pin not in self.active_pins:
                logger.error(f"Pin {pin} not configured for PWM")
                return False

            try:
                # Clamp duty cycle to valid range
                duty_cycle = max(0, min(100, duty_cycle))

                if self.backend == GPIOBackend.LGPIO:
                    # lgpio uses duty cycle as percentage of period
                    lgpio.tx_pwm(self.gpio_handle, pin, frequency, duty_cycle)
                elif self.backend == GPIOBackend.PIGPIO:
                    # pigpio uses 0-255 range for duty cycle
                    duty_value = int((duty_cycle / 100.0) * 255)
                    self.gpio_handle.set_PWM_dutycycle(pin, duty_value)
                    self.gpio_handle.set_PWM_frequency(pin, frequency)
                elif self.backend == GPIOBackend.RPI_GPIO:
                    # RPi.GPIO PWM implementation
                    import RPi.GPIO as GPIO
                    if not hasattr(self, f'_pwm_{pin}'):
                        setattr(self, f'_pwm_{pin}', GPIO.PWM(pin, frequency))
                        getattr(self, f'_pwm_{pin}').start(duty_cycle)
                    else:
                        getattr(self, f'_pwm_{pin}').ChangeDutyCycle(duty_cycle)
                        getattr(self, f'_pwm_{pin}').ChangeFrequency(frequency)
                else:  # SIMULATION
                    logger.info(f"🎭 Simulated PWM pin {pin}: {duty_cycle}% @ {frequency}Hz")

                return True
            except Exception as e:
                logger.error(f"Error writing PWM to pin {pin}: {e}")
                return False

    def servo_write(self, pin: int, angle: float, min_pulse: float = 1.0, max_pulse: float = 2.0) -> bool:
        """Control servo motor

        Args:
            pin: GPIO pin number
            angle: Servo angle in degrees (-90 to +90, or 0 to 180 depending on servo)
            min_pulse: Minimum pulse width in milliseconds
            max_pulse: Maximum pulse width in milliseconds
        """
        with self._lock:
            if pin not in self.active_pins:
                logger.error(f"Pin {pin} not configured for servo")
                return False

            try:
                # Clamp angle to reasonable range
                angle = max(-180, min(180, angle))

                # Convert angle to pulse width (standard servo: 1-2ms pulse width)
                pulse_range = max_pulse - min_pulse
                normalized_angle = (angle + 90) / 180.0  # Normalize to 0-1 range
                pulse_width = min_pulse + (normalized_angle * pulse_range)

                # Convert to duty cycle for 50Hz PWM (20ms period)
                duty_cycle = (pulse_width / 20.0) * 100

                return self.pwm_write(pin, duty_cycle, 50)  # Standard servo frequency

            except Exception as e:
                logger.error(f"Error controlling servo on pin {pin}: {e}")
                return False

    def get_pin_status(self, pin: int) -> Optional[Dict[str, Any]]:
        """Get status information for a pin"""
        with self._lock:
            if pin not in self.active_pins:
                return None

            status = self.active_pins[pin].copy()
            status['uptime'] = time.time() - status['initialized_at']
            return status

    def get_all_pins_status(self) -> Dict[int, Dict[str, Any]]:
        """Get status for all active pins"""
        with self._lock:
            return {pin: self.get_pin_status(pin) for pin in self.active_pins}

    def is_pin_available(self, pin: int) -> bool:
        """Check if a pin is available for use"""
        return pin not in self.active_pins and 0 <= pin <= 27


class MotorController:
    """Motor control using GPIO system"""

    def __init__(self, gpio_system: GPIOControlSystem):
        self.gpio = gpio_system
        self.motors: Dict[str, Dict[str, Any]] = {}

    def add_motor(self, name: str, dir_pin: int, pwm_pin: int, motor_type: str = "dc") -> bool:
        """Add a motor configuration

        Args:
            name: Motor identifier
            dir_pin: Direction control pin
            pwm_pin: PWM/speed control pin
            motor_type: Type of motor (dc, stepper, servo)
        """
        try:
            # Setup pins
            if not self.gpio.setup_pin(dir_pin, PinMode.OUTPUT):
                return False
            if not self.gpio.setup_pin(pwm_pin, PinMode.PWM):
                return False

            self.motors[name] = {
                'dir_pin': dir_pin,
                'pwm_pin': pwm_pin,
                'type': motor_type,
                'current_speed': 0,
                'current_direction': 'forward'
            }

            logger.info(f"✅ Motor '{name}' added (dir: {dir_pin}, pwm: {pwm_pin})")
            return True

        except Exception as e:
            logger.error(f"Error adding motor '{name}': {e}")
            return False

    def control_motor(self, name: str, direction: str, speed: float, duration: float = 0) -> bool:
        """Control motor movement

        Args:
            name: Motor identifier
            direction: 'forward', 'backward', or 'stop'
            speed: Speed percentage (0-100)
            duration: Duration in seconds (0 = indefinite)
        """
        if name not in self.motors:
            logger.error(f"Motor '{name}' not found")
            return False

        motor = self.motors[name]

        try:
            # Set direction
            if direction == 'forward':
                self.gpio.digital_write(motor['dir_pin'], False)
            elif direction == 'backward':
                self.gpio.digital_write(motor['dir_pin'], True)
            elif direction == 'stop':
                speed = 0

            # Set speed
            self.gpio.pwm_write(motor['pwm_pin'], speed)

            # Update motor state
            motor['current_speed'] = speed
            motor['current_direction'] = direction

            logger.info(f"🔧 Motor '{name}': {direction} at {speed}%")

            # Handle duration
            if duration > 0:
                time.sleep(duration)
                self.gpio.pwm_write(motor['pwm_pin'], 0)  # Stop motor
                motor['current_speed'] = 0
                logger.info(f"🛑 Motor '{name}' stopped after {duration}s")

            return True

        except Exception as e:
            logger.error(f"Error controlling motor '{name}': {e}")
            return False

    def stop_motor(self, name: str) -> bool:
        """Stop a specific motor"""
        return self.control_motor(name, 'stop', 0)

    def stop_all_motors(self):
        """Emergency stop all motors"""
        logger.warning("🚨 Emergency stop - all motors")
        for name in self.motors:
            self.stop_motor(name)


class LightController:
    """Light and LED control using GPIO system"""

    def __init__(self, gpio_system: GPIOControlSystem):
        self.gpio = gpio_system
        self.lights: Dict[str, Dict[str, Any]] = {}

    def add_light(self, name: str, pin: int, light_type: str = "digital") -> bool:
        """Add a light configuration

        Args:
            name: Light identifier
            pin: GPIO pin number
            light_type: 'digital' for on/off, 'pwm' for dimming
        """
        try:
            mode = PinMode.PWM if light_type == "pwm" else PinMode.OUTPUT
            if not self.gpio.setup_pin(pin, mode):
                return False

            self.lights[name] = {
                'pin': pin,
                'type': light_type,
                'current_state': False,
                'current_brightness': 0
            }

            logger.info(f"💡 Light '{name}' added on pin {pin} ({light_type})")
            return True

        except Exception as e:
            logger.error(f"Error adding light '{name}': {e}")
            return False

    def control_light(self, name: str, state: bool, brightness: float = 100) -> bool:
        """Control light state and brightness

        Args:
            name: Light identifier
            state: True for on, False for off
            brightness: Brightness percentage (0-100) for PWM lights
        """
        if name not in self.lights:
            logger.error(f"Light '{name}' not found")
            return False

        light = self.lights[name]

        try:
            if light['type'] == 'digital':
                self.gpio.digital_write(light['pin'], state)
                light['current_state'] = state
                logger.info(f"💡 Light '{name}': {'ON' if state else 'OFF'}")
            else:  # PWM
                if state:
                    self.gpio.pwm_write(light['pin'], brightness)
                    light['current_brightness'] = brightness
                else:
                    self.gpio.pwm_write(light['pin'], 0)
                    light['current_brightness'] = 0

                light['current_state'] = state
                logger.info(f"💡 Light '{name}': {'ON' if state else 'OFF'} @ {brightness}%")

            return True

        except Exception as e:
            logger.error(f"Error controlling light '{name}': {e}")
            return False

    def turn_on(self, name: str, brightness: float = 100) -> bool:
        """Turn on a light"""
        return self.control_light(name, True, brightness)

    def turn_off(self, name: str) -> bool:
        """Turn off a light"""
        return self.control_light(name, False)

    def dim_light(self, name: str, brightness: float) -> bool:
        """Dim a PWM light"""
        if name not in self.lights or self.lights[name]['type'] != 'pwm':
            return False
        return self.control_light(name, True, brightness)
