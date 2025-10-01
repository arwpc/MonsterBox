#!/usr/bin/env python3

"""
Unified Servo WebSocket Service for MonsterBox
Combines MonsterBox Parts servo control with ChatterPi jaw animation capabilities
"""

import asyncio
import json
import time
import threading
import logging
import os
from typing import Dict, Any, Optional, Set
from dataclasses import dataclass, asdict
import websockets
from base_hardware_service import BaseHardwareService

# Hardware imports with fallbacks
try:
    import lgpio
    LGPIO_AVAILABLE = True
except ImportError:
    LGPIO_AVAILABLE = False
    print("Warning: lgpio not available, using simulation mode")

try:
    from adafruit_pca9685 import PCA9685
    import board
    import busio
    PCA9685_AVAILABLE = True
except ImportError:
    PCA9685_AVAILABLE = False
    print("Warning: PCA9685 libraries not available")

logger = logging.getLogger(__name__)

@dataclass
class ServoConfig:
    """Servo configuration data structure"""
    servo_id: str
    character_id: int
    name: str
    pin: int
    channel: Optional[int]
    control_type: str  # 'gpio' or 'pca9685'
    servo_type: str
    min_pulse: int
    max_pulse: int
    default_angle: float
    min_angle: float = 0.0
    max_angle: float = 180.0
    frequency: int = 50
    enabled: bool = True

@dataclass
class ServoState:
    """Current servo state"""
    servo_id: str
    current_angle: float
    target_angle: float
    is_moving: bool
    last_update: float
    pulse_width: int
    control_active: bool = False

@dataclass
class JawAnimationConfig:
    """Jaw animation configuration parameters"""
    servo_id: str
    closed_angle: float = 50.0
    open_angle: float = 30.0
    smoothing_factor: float = 0.8
    volume_threshold: float = 0.02
    attack_time: float = 0.05
    release_time: float = 0.15
    sensitivity: float = 1.5
    # Additional runtime behavior controls
    step_threshold: float = 0.5        # Minimum angle delta to move (deg)
    idle_timeout: float = 1.0          # Seconds without audio before idling
    response_curve: str = "linear"     # Reserved for future use




class ServoWebSocketService(BaseHardwareService):
    """WebSocket service for servo control"""

    def __init__(self, port: int = 8405, host: str = "0.0.0.0"): # Fixed: use consistent port 8405
        super().__init__("servo_service", "servo", port, host)

        # Servo management
        self.servo_configs: Dict[str, ServoConfig] = {}
        self.servo_states: Dict[str, ServoState] = {}
        self.jaw_animation_configs: Dict[str, JawAnimationConfig] = {}

        # Calibration system
        self.servo_calibrations: Dict[str, Dict] = {}
        self.continuous_servo_positions: Dict[str, Dict] = {}
        self.calibration_file = "data/servo_calibrations.json"
        self.continuous_positions_file = "data/continuous_servo_positions.json"

        # Hardware interfaces
        self.gpio_handle = None
        self.pca9685_instances: Dict[int, Any] = {}  # Address -> PCA9685 instance

        # Animation state
        self.active_animations: Dict[str, bool] = {}
        self.animation_tasks: Dict[str, asyncio.Task] = {}
        self.audio_processors: Dict[str, Any] = {}

        # Thread safety
        self.servo_lock = threading.Lock()

        # Service capabilities
        self.capabilities = {
            "manual_control": True,
            "jaw_animation": True,
            "gpio_control": LGPIO_AVAILABLE,
            "pca9685_control": PCA9685_AVAILABLE,
            "real_time_animation": True,
            "audio_synchronization": True,
            "multiple_servos": True
        }

    async def initialize_hardware(self) -> bool:
        """Initialize servo hardware interfaces"""
        try:
            logger.info("🔧 Initializing servo hardware...")

            # Initialize GPIO if available
            if LGPIO_AVAILABLE:
                try:
                    self.gpio_handle = lgpio.gpiochip_open(0)
                    logger.info("✅ GPIO interface initialized")
                except Exception as e:
                    logger.error(f"Failed to initialize GPIO: {e}")
                    self.gpio_handle = None

            # Load servo configurations from MonsterBox parts
            await self.load_servo_configurations()

            # Load jaw animation configurations
            await self.load_jaw_animation_configurations()

            # Load servo calibrations
            await self.load_servo_calibrations()

            logger.info(f"🎯 Initialized {len(self.servo_configs)} servo configurations")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize servo hardware: {e}")
            return False

    async def load_servo_configurations(self):
        """Load servo configurations from MonsterBox parts.json"""
        try:
            import os
            parts_file = os.path.join(os.path.dirname(__file__), '../../data/parts.json')

            if os.path.exists(parts_file):
                with open(parts_file, 'r') as f:
                    parts_data = json.load(f)

                for part in parts_data:
                    if part.get('type') == 'servo':
                        servo_config = ServoConfig(
                            servo_id=str(part['id']),
                            character_id=part['characterId'],
                            name=part['name'],
                            pin=part['pin'],
                            channel=part.get('channel'),
                            control_type='pca9685' if part.get('usePCA9685') else 'gpio',
                            servo_type=part.get('servoType', 'Standard'),
                            min_pulse=part.get('minPulse', 500),
                            max_pulse=part.get('maxPulse', 2500),
                            default_angle=part.get('defaultAngle', 90),
                            frequency=50
                        )

                        self.servo_configs[servo_config.servo_id] = servo_config

                        # Initialize servo state
                        self.servo_states[servo_config.servo_id] = ServoState(
                            servo_id=servo_config.servo_id,
                            current_angle=servo_config.default_angle,
                            target_angle=servo_config.default_angle,
                            is_moving=False,
                            last_update=time.time(),
                            pulse_width=self._angle_to_pulse_width(servo_config.default_angle, servo_config)
                        )

                        logger.info(f"📍 Loaded servo config: {servo_config.name} (ID: {servo_config.servo_id})")

        except Exception as e:
            logger.error(f"Failed to load servo configurations: {e}")

    async def load_jaw_animation_configurations(self):
        """Load jaw animation configurations"""
        try:
            import os

            # Load from jaw-animation-config.json
            config_file = os.path.join(os.path.dirname(__file__), '../../data/jaw-animation-config.json')
            if os.path.exists(config_file):
                with open(config_file, 'r') as f:
                    config_data = json.load(f)

                characters = config_data.get('characters', {})
                for char_id, char_config in characters.items():
                    # Find servo for this character
                    servo_id = None
                    for sid, servo_config in self.servo_configs.items():
                        if servo_config.character_id == int(char_id):
                            servo_id = sid
                            break

                    if servo_id:
                        servo_mapping = char_config.get('servoMapping', {})
                        audio_analysis = char_config.get('audioAnalysis', {})

                        jaw_config = JawAnimationConfig(
                            servo_id=servo_id,
                            closed_angle=servo_mapping.get('minPosition', 50.0),
                            open_angle=servo_mapping.get('maxPosition', 30.0),
                            smoothing_factor=audio_analysis.get('smoothingFactor', 0.8),
                            volume_threshold=audio_analysis.get('volumeThreshold', 0.02),
                            attack_time=servo_mapping.get('attackTime', 0.05),
                            release_time=servo_mapping.get('releaseTime', 0.15),
                            sensitivity=servo_mapping.get('sensitivity', 1.5)
                        )

                        self.jaw_animation_configs[servo_id] = jaw_config
                        logger.info(f"🦷 Loaded jaw animation config for servo {servo_id}")

        except Exception as e:
            logger.error(f"Failed to load jaw animation configurations: {e}")

    async def load_servo_calibrations(self):
        """Load servo calibrations from calibration files"""
        try:
            # Load servo calibrations
            if os.path.exists(self.calibration_file):
                with open(self.calibration_file, 'r') as f:
                    self.servo_calibrations = json.load(f)
                logger.info(f"📊 Loaded {len(self.servo_calibrations)} servo calibrations")
            else:
                logger.info("📊 No servo calibrations file found")

            # Load continuous servo positions
            if os.path.exists(self.continuous_positions_file):
                with open(self.continuous_positions_file, 'r') as f:
                    self.continuous_servo_positions = json.load(f)
                logger.info(f"📍 Loaded {len(self.continuous_servo_positions)} continuous servo positions")
            else:
                logger.info("📍 No continuous servo positions file found")

        except Exception as e:
            logger.error(f"Failed to load servo calibrations: {e}")

    def _angle_to_pulse_width(self, angle: float, config: ServoConfig) -> int:
        """Convert angle to pulse width for servo"""
        # Use safe defaults if config values are None
        min_angle = config.min_angle if config.min_angle is not None else 0.0
        max_angle = config.max_angle if config.max_angle is not None else 180.0
        min_pulse = config.min_pulse if config.min_pulse is not None else 1000
        max_pulse = config.max_pulse if config.max_pulse is not None else 2000

        # Clamp angle to valid range
        angle = max(min_angle, min(max_angle, angle))

        # Linear interpolation between min and max pulse widths
        pulse_range = max_pulse - min_pulse
        angle_range = max_angle - min_angle

        if angle_range == 0:
            return min_pulse

        pulse_width = min_pulse + (angle / angle_range) * pulse_range
        return int(pulse_width)

    async def handle_message(self, websocket, message: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming WebSocket messages"""
        try:
            message_type = message.get('type')
            request_id = message.get('request_id')

            response = None
            if message_type == 'servo_move':
                response = await self.handle_servo_move(message)
            elif message_type == 'servo_test':
                response = await self.handle_servo_test(message)
            elif message_type == 'servo_stop':
                response = await self.handle_servo_stop(message)
            elif message_type == 'jaw_animation_start':
                response = await self.handle_jaw_animation_start(message)
            elif message_type == 'jaw_animation_stop':
                response = await self.handle_jaw_animation_stop(message)
            elif message_type == 'jaw_animation_update':
                response = await self.handle_jaw_animation_update(message)
            elif message_type == 'get_servo_status':
                response = await self.handle_get_servo_status(message)
            elif message_type == 'get_servo_configs':
                response = await self.handle_get_servo_configs(message)
            elif message_type == 'update_servo_config':
                response = await self.handle_update_servo_config(message)
            elif message_type == 'servo_move_to_position':
                response = await self.handle_servo_move_to_position(message)
            elif message_type == 'servo_continuous_control':
                response = await self.handle_servo_continuous_control(message)
            elif message_type == 'servo_extension_control':
                response = await self.handle_servo_extension_control(message)
            elif message_type == 'servo_save_position':
                response = await self.handle_servo_save_position(message)
            elif message_type == 'servo_get_positions':
                response = await self.handle_servo_get_positions(message)
            elif message_type == 'servo_calibrate':
                response = await self.handle_servo_calibrate(message)
            elif message_type == 'servo_test_pulse':
                response = await self.handle_servo_test_pulse(message)
            elif message_type == 'servo_auto_range_test':
                response = await self.handle_servo_auto_range_test(message)
            elif message_type == 'test_pca9685_channel':
                response = await self.handle_test_pca9685_channel(message)
            elif message_type == 'reload_configurations':
                response = await self.handle_reload_configurations(message)
            elif message_type == 'get_current_pulse_width':
                response = await self.handle_get_current_pulse_width(message)
            elif message_type == 'save_calibration_position':
                response = await self.handle_save_calibration_position(message)
            elif message_type == 'test_calibrated_position':
                response = await self.handle_test_calibrated_position(message)
            elif message_type == 'get_calibration_status':
                response = await self.handle_get_calibration_status(message)
            else:
                response = {"status": "error", "message": f"Unknown message type: {message_type}"}

            # Include request_id in response if provided
            if response and request_id:
                response['request_id'] = request_id

            return response

        except Exception as e:
            logger.error(f"Error handling message: {e}")
            error_response = {"status": "error", "message": str(e)}
            if message.get('request_id'):
                error_response['request_id'] = message.get('request_id')
            return error_response

    async def handle_servo_move(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Handle servo movement command"""
        try:
            servo_id = str(message.get('servo_id'))
            angle = float(message.get('angle', 90))
            duration = float(message.get('duration', 0.5))

            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}

            config = self.servo_configs[servo_id]

            # Clamp angle to valid range
            angle = max(config.min_angle, min(config.max_angle, angle))

            # Move servo
            success = await self._move_servo_hardware(servo_id, angle, duration)

            if success:
                # Update servo state
                self.servo_states[servo_id].target_angle = angle
                self.servo_states[servo_id].is_moving = True
                self.servo_states[servo_id].last_update = time.time()

                # Broadcast status update
                await self.broadcast_message({
                    "type": "servo_status_update",
                    "servo_id": servo_id,
                    "angle": angle,
                    "is_moving": True
                })

                return {"status": "success", "message": f"Servo {servo_id} moved to {angle}°"}
            else:
                return {"status": "error", "message": f"Failed to move servo {servo_id}"}

        except Exception as e:
            logger.error(f"Error in servo move: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_servo_test(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Handle servo test command"""
        try:
            servo_id = str(message.get('servo_id'))
            test_angles = message.get('test_angles', [0, 90, 180])
            duration = float(message.get('duration', 1.0))

            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}

            config = self.servo_configs[servo_id]
            results = []

            for angle in test_angles:
                # Clamp angle to valid range
                angle = max(config.min_angle, min(config.max_angle, angle))

                success = await self._move_servo_hardware(servo_id, angle, duration)
                results.append({"angle": angle, "success": success})

                if success:
                    await asyncio.sleep(duration)

            return {"status": "success", "message": "Servo test completed", "results": results}

        except Exception as e:
            logger.error(f"Error in servo test: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_servo_stop(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Handle servo stop command"""
        try:
            servo_id = str(message.get('servo_id'))

            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}

            # Stop servo PWM
            success = await self._stop_servo_hardware(servo_id)

            if success:
                # Update servo state
                self.servo_states[servo_id].is_moving = False
                self.servo_states[servo_id].control_active = False
                self.servo_states[servo_id].last_update = time.time()

                # Broadcast status update
                await self.broadcast_message({
                    "type": "servo_status_update",
                    "servo_id": servo_id,
                    "is_moving": False,
                    "control_active": False
                })

                return {"status": "success", "message": f"Servo {servo_id} stopped"}
            else:
                return {"status": "error", "message": f"Failed to stop servo {servo_id}"}

        except Exception as e:
            logger.error(f"Error stopping servo: {e}")
            return {"status": "error", "message": str(e)}

    async def _move_servo_hardware(self, servo_id: str, angle: float, duration: float = 0.5) -> bool:
        """Move servo hardware to specified angle"""
        try:
            config = self.servo_configs[servo_id]
            pulse_width = self._angle_to_pulse_width(angle, config)

            with self.servo_lock:
                if config.control_type == 'gpio':
                    return await self._move_servo_gpio(config, pulse_width, duration)
                elif config.control_type == 'pca9685':
                    return await self._move_servo_pca9685(config, pulse_width, duration)
                else:
                    logger.error(f"Unknown control type: {config.control_type}")
                    return False

        except Exception as e:
            logger.error(f"Error moving servo hardware: {e}")
            return False

    async def _move_servo_gpio(self, config: ServoConfig, pulse_width: int, duration: float) -> bool:
        """Move servo using GPIO control"""
        try:
            if not LGPIO_AVAILABLE or not self.gpio_handle:
                logger.info(f"🎭 SIMULATION: Moving servo {config.name} to pulse width {pulse_width}µs")
                await asyncio.sleep(duration)
                return True

            # Claim GPIO pin as output
            lgpio.gpio_claim_output(self.gpio_handle, config.pin)

            # Use lgpio's servo function for precise control
            result = lgpio.tx_servo(self.gpio_handle, config.pin, pulse_width, config.frequency, 0, 1)

            if result < 0:
                logger.error(f"lgpio.tx_servo failed with code: {result}")
                return False

            # Allow time for servo to move
            await asyncio.sleep(duration)

            # Update servo state
            self.servo_states[config.servo_id].current_angle = self._pulse_to_angle(pulse_width, config)
            self.servo_states[config.servo_id].pulse_width = pulse_width
            self.servo_states[config.servo_id].control_active = True

            logger.info(f"🦴 Servo {config.name} moved to {pulse_width}µs pulse width")
            return True

        except Exception as e:
            logger.error(f"Error in GPIO servo control: {e}")
            return False

    def _pulse_to_angle(self, pulse_width: int, config: ServoConfig) -> float:
        """Convert pulse width back to angle"""
        # Use safe defaults if config values are None
        min_angle = config.min_angle if config.min_angle is not None else 0.0
        max_angle = config.max_angle if config.max_angle is not None else 180.0
        min_pulse = config.min_pulse if config.min_pulse is not None else 1000
        max_pulse = config.max_pulse if config.max_pulse is not None else 2000

        pulse_range = max_pulse - min_pulse
        angle_range = max_angle - min_angle

        if pulse_range == 0:
            return min_angle

        normalized = (pulse_width - min_pulse) / pulse_range
        angle = min_angle + (normalized * angle_range)
        return max(min_angle, min(max_angle, angle))

    async def _move_servo_pca9685(self, config: ServoConfig, pulse_width: int, duration: float) -> bool:
        """Move servo using PCA9685 control"""
        try:
            if not PCA9685_AVAILABLE:
                logger.info(f"🎭 SIMULATION: Moving PCA9685 servo {config.name} to pulse width {pulse_width}µs")
                await asyncio.sleep(duration)
                return True

            # Initialize PCA9685 if needed
            i2c_address = 0x40  # Default PCA9685 address
            if i2c_address not in self.pca9685_instances:
                i2c = busio.I2C(board.SCL, board.SDA)
                pca = PCA9685(i2c, address=i2c_address)
                pca.frequency = config.frequency
                self.pca9685_instances[i2c_address] = pca

            pca = self.pca9685_instances[i2c_address]

            # Convert pulse width to PCA9685 value
            # PCA9685 has 4096 steps per period (12-bit resolution)
            period_us = 1000000 / config.frequency  # Period in microseconds
            off_value = int((pulse_width / period_us) * 4096)

            # Set PWM
            pca.channels[config.channel].duty_cycle = off_value

            # Allow time for servo to move
            await asyncio.sleep(duration)

            # Update servo state
            self.servo_states[config.servo_id].current_angle = self._pulse_to_angle(pulse_width, config)
            self.servo_states[config.servo_id].pulse_width = pulse_width
            self.servo_states[config.servo_id].control_active = True

            logger.info(f"🦴 PCA9685 servo {config.name} moved to {pulse_width}µs pulse width")
            return True

        except Exception as e:
            logger.error(f"Error in PCA9685 servo control: {e}")
            return False

    async def _stop_servo_hardware(self, servo_id: str) -> bool:
        """Stop servo PWM to reduce jitter"""
        try:
            config = self.servo_configs[servo_id]

            with self.servo_lock:
                if config.control_type == 'gpio':
                    if LGPIO_AVAILABLE and self.gpio_handle:
                        # Stop servo PWM (pulse_width = 0 stops the servo)
                        lgpio.tx_servo(self.gpio_handle, config.pin, 0)
                        logger.info(f"🛑 Stopped GPIO servo {config.name}")
                    else:
                        logger.info(f"🎭 SIMULATION: Stopped servo {config.name}")

                elif config.control_type == 'pca9685':
                    if PCA9685_AVAILABLE:
                        i2c_address = 0x40
                        if i2c_address in self.pca9685_instances:
                            pca = self.pca9685_instances[i2c_address]
                            pca.channels[config.channel].duty_cycle = 0
                            logger.info(f"🛑 Stopped PCA9685 servo {config.name}")
                    else:
                        logger.info(f"🎭 SIMULATION: Stopped PCA9685 servo {config.name}")

            return True

        except Exception as e:
            logger.error(f"Error stopping servo hardware: {e}")
            return False

    async def handle_jaw_animation_start(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Start jaw animation for a servo"""
        try:
            servo_id = str(message.get('servo_id'))
            character_id = message.get('character_id')

            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}

            if servo_id not in self.jaw_animation_configs:
                return {"status": "error", "message": f"No jaw animation config for servo {servo_id}"}

            # Stop existing animation if running
            if servo_id in self.active_animations and self.active_animations[servo_id]:
                await self.handle_jaw_animation_stop({"servo_id": servo_id})

            # Start animation
            self.active_animations[servo_id] = True

            # Create animation task
            task = asyncio.create_task(self._jaw_animation_loop(servo_id))
            self.animation_tasks[servo_id] = task

            # Broadcast animation started
            await self.broadcast_message({
                "type": "jaw_animation_started",
                "servo_id": servo_id,
                "character_id": character_id
            })

            logger.info(f"🦷 Started jaw animation for servo {servo_id}")
            return {"status": "success", "message": f"Jaw animation started for servo {servo_id}"}

        except Exception as e:
            logger.error(f"Error starting jaw animation: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_jaw_animation_stop(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Stop jaw animation for a servo"""
        try:
            servo_id = str(message.get('servo_id'))

            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}

            # Stop animation
            self.active_animations[servo_id] = False

            # Cancel animation task
            if servo_id in self.animation_tasks:
                task = self.animation_tasks[servo_id]
                if not task.done():
                    task.cancel()
                del self.animation_tasks[servo_id]

            # Return to closed position
            if servo_id in self.jaw_animation_configs:
                jaw_config = self.jaw_animation_configs[servo_id]
                await self._move_servo_hardware(servo_id, jaw_config.closed_angle, 0.5)

            # Stop servo PWM to reduce jitter
            await self._stop_servo_hardware(servo_id)

            # Broadcast animation stopped
            await self.broadcast_message({
                "type": "jaw_animation_stopped",
                "servo_id": servo_id
            })

            logger.info(f"🛑 Stopped jaw animation for servo {servo_id}")
            return {"status": "success", "message": f"Jaw animation stopped for servo {servo_id}"}

        except Exception as e:
            logger.error(f"Error stopping jaw animation: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_jaw_animation_update(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Update jaw animation with audio data"""
        try:
            servo_id = str(message.get('servo_id'))
            volume = float(message.get('volume', 0.0))

            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}

            if servo_id not in self.jaw_animation_configs:
                return {"status": "error", "message": f"No jaw animation config for servo {servo_id}"}

            if not self.active_animations.get(servo_id, False):
                return {"status": "error", "message": f"Jaw animation not active for servo {servo_id}"}

            # Process audio and update servo position
            jaw_config = self.jaw_animation_configs[servo_id]
            target_angle = self._calculate_jaw_position(volume, jaw_config)

            # Apply smoothing and move servo
            await self._update_jaw_position(servo_id, target_angle, jaw_config)

            return {"status": "success", "message": "Jaw position updated"}

        except Exception as e:
            logger.error(f"Error updating jaw animation: {e}")
            return {"status": "error", "message": str(e)}

    def _calculate_jaw_position(self, volume: float, jaw_config: JawAnimationConfig) -> float:
        """Calculate jaw position based on audio volume"""
        # Apply volume threshold
        if volume < jaw_config.volume_threshold:
            return jaw_config.closed_angle

        # Normalize volume and apply sensitivity
        normalized_volume = min(1.0, volume * jaw_config.sensitivity)

        # Calculate target angle (linear interpolation between closed and open)
        angle_range = abs(jaw_config.open_angle - jaw_config.closed_angle)
        target_angle = jaw_config.closed_angle + (normalized_volume * angle_range *
                                                 (1 if jaw_config.open_angle > jaw_config.closed_angle else -1))

        return target_angle

    async def _update_jaw_position(self, servo_id: str, target_angle: float, jaw_config: JawAnimationConfig):
        """Update jaw position with smoothing"""
        try:
            current_state = self.servo_states[servo_id]
            current_angle = current_state.current_angle

            # Apply step threshold to reduce jitter
            angle_diff = abs(target_angle - current_angle)
            if angle_diff < jaw_config.step_threshold:
                return

            # Apply smoothing
            smoothed_angle = current_angle + (target_angle - current_angle) * (1 - jaw_config.smoothing_factor)

            # Move servo
            await self._move_servo_hardware(servo_id, smoothed_angle, 0.02)  # Fast update for real-time

        except Exception as e:
            logger.error(f"Error updating jaw position: {e}")

    async def _jaw_animation_loop(self, servo_id: str):
        """Main jaw animation loop"""
        try:
            jaw_config = self.jaw_animation_configs[servo_id]
            last_audio_time = time.time()

            while self.active_animations.get(servo_id, False):
                current_time = time.time()

                # Check for idle timeout
                if current_time - last_audio_time > jaw_config.idle_timeout:
                    # Return to closed position and stop PWM to reduce jitter
                    await self._move_servo_hardware(servo_id, jaw_config.closed_angle, 0.2)
                    await asyncio.sleep(0.1)
                    await self._stop_servo_hardware(servo_id)

                    # Wait for audio activity
                    await asyncio.sleep(0.1)
                else:
                    # Normal animation loop - wait for audio updates
                    await asyncio.sleep(0.02)  # 50Hz update rate

        except asyncio.CancelledError:
            logger.info(f"Jaw animation loop cancelled for servo {servo_id}")
        except Exception as e:
            logger.error(f"Error in jaw animation loop: {e}")

    async def handle_get_servo_status(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Get status of all servos or specific servo"""
        try:
            servo_id = message.get('servo_id')

            if servo_id:
                # Get specific servo status
                if servo_id not in self.servo_configs:
                    return {"status": "error", "message": f"Servo {servo_id} not found"}

                config = self.servo_configs[servo_id]
                state = self.servo_states[servo_id]
                jaw_config = self.jaw_animation_configs.get(servo_id)

                return {
                    "status": "success",
                    "servo": {
                        "config": asdict(config),
                        "state": asdict(state),
                        "jaw_animation": asdict(jaw_config) if jaw_config else None,
                        "animation_active": self.active_animations.get(servo_id, False)
                    }
                }
            else:
                # Get all servo statuses
                servos = {}
                for sid in self.servo_configs:
                    config = self.servo_configs[sid]
                    state = self.servo_states[sid]
                    jaw_config = self.jaw_animation_configs.get(sid)

                    servos[sid] = {
                        "config": asdict(config),
                        "state": asdict(state),
                        "jaw_animation": asdict(jaw_config) if jaw_config else None,
                        "animation_active": self.active_animations.get(sid, False)
                    }

                return {"status": "success", "servos": servos}

        except Exception as e:
            logger.error(f"Error getting servo status: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_get_servo_configs(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Get servo configurations"""
        try:
            configs = {}
            for servo_id, config in self.servo_configs.items():
                configs[servo_id] = asdict(config)

            return {"status": "success", "servo_configs": configs}

        except Exception as e:
            logger.error(f"Error getting servo configs: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_update_servo_config(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Update servo configuration"""
        try:
            servo_id = str(message.get('servo_id'))
            updates = message.get('updates', {})

            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}

            # Update configuration
            config = self.servo_configs[servo_id]
            for key, value in updates.items():
                if hasattr(config, key):
                    setattr(config, key, value)

            # Update jaw animation config if provided
            jaw_updates = message.get('jaw_animation_updates', {})
            if jaw_updates and servo_id in self.jaw_animation_configs:
                jaw_config = self.jaw_animation_configs[servo_id]
                for key, value in jaw_updates.items():
                    if hasattr(jaw_config, key):
                        setattr(jaw_config, key, value)

            return {"status": "success", "message": f"Servo {servo_id} configuration updated"}

        except Exception as e:
            logger.error(f"Error updating servo config: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_servo_move_to_position(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Move servo to a named calibrated position"""
        try:
            servo_id = str(message.get('servo_id'))
            position_name = message.get('position_name')
            duration = float(message.get('duration', 2.0))

            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}

            # Check if servo has calibration data
            calibration = self.servo_calibrations.get(servo_id)
            if not calibration:
                return {"status": "error", "message": f"No calibration found for servo {servo_id}"}

            # Handle different servo types
            if calibration.get('servo_type') == 'continuous':
                return await self._move_continuous_to_position(servo_id, position_name, duration)
            else:
                return await self._move_standard_to_position(servo_id, position_name)

        except Exception as e:
            logger.error(f"Error moving servo to position: {e}")
            return {"status": "error", "message": str(e)}

    def _is_continuous_servo(self, servo_id: str) -> bool:
        """Check if servo supports continuous rotation based on configuration"""
        if servo_id not in self.servo_configs:
            return False

        config = self.servo_configs[servo_id]

        # Check if servo type supports continuous rotation
        # Look up servo specs from servos.json data
        servo_type = config.servo_type

        # Known continuous rotation servos
        continuous_servos = ['FITEC FS90R', 'FS90R']

        # Known servos that support multiple modes including continuous
        multi_mode_servos = ['GoBilda Stingray 2 Servo', 'Stingray 2']

        # Check if it's a known continuous servo
        if servo_type in continuous_servos:
            return True

        # Check if it's a multi-mode servo and has been calibrated for continuous
        if servo_type in multi_mode_servos:
            calibration = self.servo_calibrations.get(servo_id)
            return calibration and calibration.get('servo_type') == 'continuous'

        # Default: most servos are standard positioning servos
        return False

    async def handle_servo_continuous_control(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Control continuous rotation servo with direction and speed"""
        try:
            servo_id = str(message.get('servo_id'))
            direction = message.get('direction')  # 'cw', 'ccw', 'stop'
            speed = message.get('speed', 'slow')  # 'slow', 'fast'
            duration = float(message.get('duration', 0))  # 0 = continuous until stopped

            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}

            # Check if servo supports continuous rotation
            if not self._is_continuous_servo(servo_id):
                return {"status": "error", "message": f"Servo {servo_id} is not a continuous rotation servo"}

            config = self.servo_configs[servo_id]
            stop_pulse = calibration.get('stop_pulse_us', 1500)

            # Calculate pulse width based on direction and speed
            if direction == 'stop':
                pulse_width = 0  # Turn off PWM
            elif direction == 'cw':
                offset = 500 if speed == 'fast' else 200
                pulse_width = stop_pulse - offset
            elif direction == 'ccw':
                offset = 500 if speed == 'fast' else 200
                pulse_width = stop_pulse + offset
            else:
                return {"status": "error", "message": "Invalid direction. Use 'cw', 'ccw', or 'stop'"}

            # Send PWM signal
            success = await self._send_pwm_pulse(config, pulse_width)

            # If duration specified, schedule stop
            if duration > 0 and direction != 'stop':
                asyncio.create_task(self._stop_servo_after_delay(servo_id, duration))

            return {
                "status": "success" if success else "error",
                "message": f"Servo {servo_id} {direction} {'for ' + str(duration) + 's' if duration > 0 else 'continuous'}",
                "pulse_width": pulse_width
            }

        except Exception as e:
            logger.error(f"Error controlling continuous servo: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_servo_extension_control(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Control servo extension (for arm joints, etc.) with slow movement and position marking"""
        try:
            servo_id = str(message.get('servo_id'))
            action = message.get('action')  # 'extend', 'retract', 'stop', 'goto'
            speed = message.get('speed', 'slow')  # 'slow', 'medium', 'fast'
            target_position = message.get('target_position')  # For 'goto' action

            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}

            config = self.servo_configs[servo_id]

            # Check if this is a high-torque servo that needs longer movement times
            is_high_torque = 'Hooyij' in config.servo_type or 'DS3240MG' in config.servo_type
            duration_multiplier = 2.0 if is_high_torque else 1.0

            if action == 'extend':
                # Move towards maximum extension
                angle = config.max_angle
                base_duration = 3.0 if speed == 'slow' else 1.5 if speed == 'medium' else 0.5
                duration = base_duration * duration_multiplier
            elif action == 'retract':
                # Move towards minimum extension
                angle = config.min_angle
                base_duration = 3.0 if speed == 'slow' else 1.5 if speed == 'medium' else 0.5
                duration = base_duration * duration_multiplier
            elif action == 'stop':
                # Stop at current position (for continuous servos)
                calibration = self.servo_calibrations.get(servo_id)
                if calibration and calibration.get('servo_type') == 'continuous':
                    return await self.handle_servo_continuous_control({
                        'servo_id': servo_id,
                        'direction': 'stop'
                    })
                else:
                    return {"status": "success", "message": f"Servo {servo_id} stopped"}
            elif action == 'goto' and target_position is not None:
                # Go to specific position
                angle = float(target_position)
                duration = 2.0
            else:
                return {"status": "error", "message": "Invalid action. Use 'extend', 'retract', 'stop', or 'goto'"}

            # Move servo
            success = await self._move_servo_hardware(servo_id, angle, duration)

            return {
                "status": "success" if success else "error",
                "message": f"Servo {servo_id} {action} to {angle}°",
                "target_angle": angle,
                "duration": duration
            }

        except Exception as e:
            logger.error(f"Error controlling servo extension: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_servo_save_position(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Save current servo position with a name"""
        try:
            servo_id = str(message.get('servo_id'))
            position_name = message.get('position_name')
            description = message.get('description', f'Position: {position_name}')

            if not position_name:
                return {"status": "error", "message": "Position name is required"}

            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}

            # Save position to continuous servo positions
            if servo_id not in self.continuous_servo_positions:
                self.continuous_servo_positions[servo_id] = {}

            self.continuous_servo_positions[servo_id][position_name] = {
                'description': description,
                'saved_time': time.time()
            }

            # Save to file
            try:
                with open(self.continuous_positions_file, 'w') as f:
                    json.dump(self.continuous_servo_positions, f, indent=2)
            except Exception as e:
                logger.error(f"Failed to save positions to file: {e}")

            return {
                "status": "success",
                "message": f"Position '{position_name}' saved for servo {servo_id}",
                "position_name": position_name,
                "description": description
            }

        except Exception as e:
            logger.error(f"Error saving servo position: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_servo_get_positions(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Get all saved positions for a servo or all servos"""
        try:
            servo_id = message.get('servo_id')

            if servo_id:
                # Get positions for specific servo
                servo_id = str(servo_id)
                if servo_id not in self.servo_configs:
                    return {"status": "error", "message": f"Servo {servo_id} not found"}

                positions = self.continuous_servo_positions.get(servo_id, {})
                calibration = self.servo_calibrations.get(servo_id, {})
                calibrated_positions = calibration.get('positions', {})

                return {
                    "status": "success",
                    "servo_id": servo_id,
                    "saved_positions": positions,
                    "calibrated_positions": calibrated_positions
                }
            else:
                # Get all positions
                return {
                    "status": "success",
                    "all_saved_positions": self.continuous_servo_positions,
                    "all_calibrations": self.servo_calibrations
                }

        except Exception as e:
            logger.error(f"Error getting servo positions: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_servo_calibrate(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Start servo calibration process"""
        try:
            servo_id = str(message.get('servo_id'))

            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}

            return {
                "status": "info",
                "message": f"Servo calibration for {servo_id} should be done using the calibration scripts",
                "instructions": [
                    "Run: python3 scripts/servo_calibration.py",
                    "Or use: python3 scripts/continuous_servo_manual_control.py",
                    "Calibration data will be automatically loaded by this service"
                ]
            }

        except Exception as e:
            logger.error(f"Error handling servo calibration: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_servo_auto_range_test(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Automatically test servo range to determine limits and type"""
        try:
            servo_id = str(message.get('servo_id'))

            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}

            config = self.servo_configs[servo_id]

            # Test pulse widths from 500µs to 2500µs in steps
            test_pulses = [
                500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500,
                1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500
            ]

            results = {
                "servo_id": servo_id,
                "servo_name": config.name,
                "servo_type": config.servo_type,
                "test_results": [],
                "recommended_min": 500,
                "recommended_max": 2500,
                "appears_continuous": False
            }

            logger.info(f"Starting automatic range test for servo {servo_id}")

            # Test each pulse width
            for pulse_us in test_pulses:
                logger.info(f"Testing pulse width: {pulse_us}µs")

                # Send test pulse
                success = await self._send_pwm_pulse(config, pulse_us)

                test_result = {
                    "pulse_us": pulse_us,
                    "success": success,
                    "timestamp": time.time()
                }

                results["test_results"].append(test_result)

                # Wait between tests to allow servo to move
                await asyncio.sleep(0.5)

            # Analyze results to determine servo characteristics
            successful_pulses = [r["pulse_us"] for r in results["test_results"] if r["success"]]

            if successful_pulses:
                results["recommended_min"] = min(successful_pulses)
                results["recommended_max"] = max(successful_pulses)

                # Check if servo appears to be continuous rotation
                # Continuous servos typically respond to the full range
                if len(successful_pulses) > 15 and 1500 in successful_pulses:
                    results["appears_continuous"] = True

            # Stop servo after testing
            await self._send_pwm_pulse(config, 0)

            logger.info(f"Auto range test completed for servo {servo_id}: {len(successful_pulses)} successful pulses")

            return {
                "status": "success",
                "message": f"Auto range test completed for servo {servo_id}",
                "results": results
            }

        except Exception as e:
            logger.error(f"Error in auto range test: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_servo_test_pulse(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Test servo with specific pulse width"""
        try:
            servo_id = str(message.get('servo_id'))
            pulse_width = int(message.get('pulse_width', 1500))

            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}

            config = self.servo_configs[servo_id]
            success = await self._send_pwm_pulse(config, pulse_width)

            return {
                "status": "success" if success else "error",
                "message": f"Servo {servo_id} test pulse {pulse_width}\u00b5s {'sent' if success else 'failed'}",
                "pulse_width": pulse_width
            }
        except Exception as e:
            logger.error(f"Error in handle_servo_test_pulse: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_get_current_pulse_width(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Return the most recent pulse width for the specified servo (live monitor surrogate)."""
        try:
            servo_id = str(message.get('servo_id'))
            if servo_id not in self.servo_states:
                return {"status": "error", "message": f"Servo {servo_id} not found"}
            state = self.servo_states[servo_id]
            return {"status": "success", "servo_id": servo_id, "pulse_width": state.pulse_width, "timestamp": time.time()}
        except Exception as e:
            logger.error(f"Error in handle_get_current_pulse_width: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_save_calibration_position(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Save current pulse width as a named calibration position (automated)."""
        try:
            servo_id = str(message.get('servo_id'))
            position = message.get('position')  # e.g., 'min'|'neutral'|'max' for standard; 'stop'|'cw_full'|'ccw_full' for continuous
            description = message.get('description')
            if not servo_id or not position:
                return {"status": "error", "message": "servo_id and position are required"}
            if servo_id not in self.servo_configs or servo_id not in self.servo_states:
                return {"status": "error", "message": f"Servo {servo_id} not found"}

            config = self.servo_configs[servo_id]
            state = self.servo_states[servo_id]
            pulse_us = int(message.get('pulse_us', state.pulse_width))

            # Initialize calibration entry if missing
            cal = self.servo_calibrations.get(servo_id)
            if not cal:
                cal = {
                    "part_id": int(servo_id),
                    "part_name": config.name,
                    "servo_type": "continuous" if self._is_continuous_servo(servo_id) else "standard",
                    "positions": {}
                }
                self.servo_calibrations[servo_id] = cal

            cal["functionality_status"] = cal.get("functionality_status", "needs_calibration")
            cal["calibrated_date"] = time.strftime('%Y-%m-%dT%H:%M:%S')

            # Save by type/position
            if cal.get("servo_type") == "continuous" or position in ("stop", "cw_full", "ccw_full"):
                # Top-level keys for continuous
                if position in ("stop", "stop_pulse"):
                    cal["stop_pulse_us"] = pulse_us
                elif position in ("cw_full", "cw"):
                    cal["cw_pulse_us"] = pulse_us
                elif position in ("ccw_full", "ccw"):
                    cal["ccw_pulse_us"] = pulse_us
                else:
                    # Fallback into positions bag
                    cal.setdefault("positions", {})[position] = {"pulse_us": pulse_us, "description": description or position, "calibrated": True}
            else:
                # Standard servo named positions
                cal.setdefault("positions", {})[position] = {
                    "pulse_us": pulse_us,
                    "angle": message.get('angle'),
                    "calibrated": True,
                    "verified": False,
                    "description": description or position
                }

            # Mark as working if we have core points
            if cal.get("servo_type") == "standard":
                pos = cal.get("positions", {})
                if all(k in pos and pos[k].get("calibrated") for k in ("min", "neutral", "max")):
                    cal["functionality_status"] = "working"
            else:
                if all(k in cal for k in ("stop_pulse_us", "cw_pulse_us", "ccw_pulse_us")):
                    cal["functionality_status"] = "working"

            # Ensure top-level version tag (backward-compatible)
            if "version" not in self.servo_calibrations:
                self.servo_calibrations["version"] = "2.0_backward_compatible"

            # Persist to disk
            try:
                with open(self.calibration_file, 'w') as f:
                    json.dump(self.servo_calibrations, f, indent=2)
            except Exception as e:
                logger.error(f"Failed saving calibration file: {e}")

            return {"status": "success", "message": f"Saved calibration for {servo_id}:{position}", "pulse_us": pulse_us}
        except Exception as e:
            logger.error(f"Error in handle_save_calibration_position: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_test_calibrated_position(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Move to a previously saved calibrated position by name."""
        try:
            servo_id = str(message.get('servo_id'))
            position = message.get('position')
            duration = float(message.get('duration', 1.0))
            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}
            cal = self.servo_calibrations.get(servo_id)
            if not cal:
                return {"status": "error", "message": f"No calibration data for servo {servo_id}"}

            config = self.servo_configs[servo_id]

            if cal.get("servo_type") == "continuous" or position in ("stop", "cw_full", "ccw_full"):
                # Determine pulse for continuous
                if position in ("stop", "stop_pulse"):
                    pulse = int(cal.get("stop_pulse_us", 1500))
                elif position in ("cw_full", "cw"):
                    pulse = int(cal.get("cw_pulse_us", 1300))
                elif position in ("ccw_full", "ccw"):
                    pulse = int(cal.get("ccw_pulse_us", 1700))
                else:
                    return {"status": "error", "message": f"Unknown position '{position}' for continuous servo"}
                ok = await self._send_pwm_pulse(config, pulse)
                if ok:
                    # Let it run briefly unless stop
                    await asyncio.sleep(0.2 if position != 'stop' else 0.5)
                return {"status": "success" if ok else "error", "pulse_us": pulse}
            else:
                # Standard: lookup pulse or angle
                pos = cal.get("positions", {}).get(position)
                if not pos:
                    return {"status": "error", "message": f"Position '{position}' not found"}
                pulse = int(pos.get('pulse_us', self._angle_to_pulse_width(pos.get('angle', 90), config)))
                # Convert pulse to angle for our internal move call
                angle = self._pulse_to_angle(pulse, config)
                ok = await self._move_servo_hardware(servo_id, angle, duration)
                return {"status": "success" if ok else "error", "angle": angle, "pulse_us": pulse}
        except Exception as e:
            logger.error(f"Error in handle_test_calibrated_position: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_get_calibration_status(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Return combined calibration + live status for a servo."""
        try:
            servo_id = str(message.get('servo_id'))
            if servo_id not in self.servo_configs:
                return {"status": "error", "message": f"Servo {servo_id} not found"}
            state = self.servo_states.get(servo_id)
            cal = self.servo_calibrations.get(servo_id, {})
            return {
                "status": "success",
                "servo_id": servo_id,
                "pulse_width": state.pulse_width if state else None,
                "calibration": cal,
                "timestamp": time.time()
            }
        except Exception as e:
            logger.error(f"Error in handle_get_calibration_status: {e}")
            return {"status": "error", "message": str(e)}



        except Exception as e:
            logger.error(f"Error testing servo pulse: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_test_pca9685_channel(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Test a specific PCA9685 channel with pulse width"""
        try:
            channel = int(message.get('channel'))
            pulse_width = int(message.get('pulse_width', 1500))

            if channel < 0 or channel > 15:
                return {"status": "error", "message": "Channel must be between 0 and 15"}

            # Create a temporary servo config for testing
            temp_config = ServoConfig(
                servo_id=f"test_channel_{channel}",
                character_id=0,
                name=f"Test Channel {channel}",
                pin=0,
                channel=channel,
                control_type='pca9685',
                servo_type='Test',
                min_pulse=500,
                max_pulse=2500,
                default_angle=90,
                frequency=50
            )

            success = await self._send_pca9685_pulse(temp_config, pulse_width)

            return {
                "status": "success" if success else "error",
                "message": f"PCA9685 channel {channel} test pulse {pulse_width}µs {'sent' if success else 'failed'}",
                "channel": channel,
                "pulse_width": pulse_width
            }

        except Exception as e:
            logger.error(f"Error testing PCA9685 channel: {e}")
            return {"status": "error", "message": str(e)}

    async def handle_reload_configurations(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Reload servo configurations from parts.json"""
        try:
            logger.info("🔄 Reloading servo configurations...")

            # Clear existing configurations
            old_servo_count = len(self.servo_configs)
            self.servo_configs.clear()
            self.servo_states.clear()
            self.jaw_animation_configs.clear()
            self.continuous_servo_positions.clear()

            # Reload all configurations
            await self.load_servo_configurations()
            await self.load_jaw_animation_configurations()
            await self.load_servo_calibrations()

            new_servo_count = len(self.servo_configs)

            logger.info(f"✅ Servo configurations reloaded: {old_servo_count} → {new_servo_count} servos")

            return {
                "type": "reload_complete",
                "status": "success",
                "message": f"Configurations reloaded successfully ({new_servo_count} servos)",
                "servo_count": new_servo_count,
                "timestamp": message.get('timestamp')
            }

        except Exception as e:
            logger.error(f"Error reloading configurations: {e}")
            return {
                "type": "error",
                "status": "error",
                "message": f"Failed to reload configurations: {str(e)}"
            }

    async def get_capabilities(self):
        """Get service capabilities"""
        capabilities = self.capabilities.copy()
        capabilities.update({
            "calibrated_control": True,
            "continuous_servo_support": True,
            "position_saving": True,
            "extension_control": True,
            "supported_message_types": [
                "servo_move", "servo_test", "servo_stop",
                "servo_move_to_position", "servo_continuous_control",
                "servo_extension_control", "servo_save_position",
                "servo_get_positions", "servo_calibrate", "servo_test_pulse",
                "test_pca9685_channel", "jaw_animation_start", "jaw_animation_stop",
                "jaw_animation_update", "get_servo_status", "get_servo_configs",
                "update_servo_config", "reload_configurations"
            ]
        })
        return capabilities

    # Helper methods for calibrated servo control
    async def _move_continuous_to_position(self, servo_id: str, position_name: str, duration: float) -> Dict[str, Any]:
        """Move continuous rotation servo to a named position"""
        try:
            calibration = self.servo_calibrations.get(servo_id)
            if not calibration:
                return {"status": "error", "message": f"No calibration found for servo {servo_id}"}

            positions = calibration.get('positions', {})
            if position_name not in positions:
                return {"status": "error", "message": f"Position '{position_name}' not found"}

            position_data = positions[position_name]
            if not position_data.get('calibrated', False):
                return {"status": "error", "message": f"Position '{position_name}' not calibrated"}

            # For continuous servos, we can't automatically go to positions
            # This would require timing data or external feedback
            return {
                "status": "info",
                "message": f"Position '{position_name}' found but automatic positioning not available for continuous servos",
                "suggestion": "Use servo_continuous_control with manual timing or external feedback"
            }

        except Exception as e:
            logger.error(f"Error moving continuous servo to position: {e}")
            return {"status": "error", "message": str(e)}

    async def _move_standard_to_position(self, servo_id: str, position_name: str) -> Dict[str, Any]:
        """Move standard servo to a named position"""
        try:
            calibration = self.servo_calibrations.get(servo_id)
            if not calibration:
                return {"status": "error", "message": f"No calibration found for servo {servo_id}"}

            positions = calibration.get('positions', {})
            if position_name not in positions:
                return {"status": "error", "message": f"Position '{position_name}' not found"}

            position_data = positions[position_name]
            if not position_data.get('calibrated', False):
                return {"status": "error", "message": f"Position '{position_name}' not calibrated"}

            pulse_us = position_data.get('pulse_us')
            if pulse_us is None:
                return {"status": "error", "message": f"No pulse width data for position '{position_name}'"}

            config = self.servo_configs[servo_id]
            success = await self._send_pwm_pulse(config, pulse_us)

            return {
                "status": "success" if success else "error",
                "message": f"Moved servo {servo_id} to position '{position_name}' ({pulse_us}µs)",
                "position_name": position_name,
                "pulse_width": pulse_us
            }

        except Exception as e:
            logger.error(f"Error moving standard servo to position: {e}")
            return {"status": "error", "message": str(e)}

    def _validate_pulse_width(self, config: ServoConfig, pulse_width_us: int) -> bool:
        """Validate pulse width is within safe servo limits"""
        if pulse_width_us == 0:
            return True  # 0 means stop/off

        # General servo pulse width limits (most servos work in this range)
        min_safe_pulse = 500
        max_safe_pulse = 2500

        # Use servo-specific limits if available and not None
        if hasattr(config, 'min_pulse') and config.min_pulse is not None:
            min_safe_pulse = max(config.min_pulse, 500)  # Never go below 500µs
        if hasattr(config, 'max_pulse') and config.max_pulse is not None:
            max_safe_pulse = min(config.max_pulse, 2500)  # Never go above 2500µs

        return min_safe_pulse <= pulse_width_us <= max_safe_pulse

    async def _send_pwm_pulse(self, config: ServoConfig, pulse_width_us: int) -> bool:
        """Send PWM pulse to servo"""
        try:
            # Validate pulse width before sending
            if not self._validate_pulse_width(config, pulse_width_us):
                logger.error(f"Invalid pulse width {pulse_width_us}µs for servo {config.servo_id}. Valid range: {config.min_pulse}-{config.max_pulse}µs")
                return False

            if config.control_type == 'pca9685':
                return await self._send_pca9685_pulse(config, pulse_width_us)
            elif config.control_type == 'gpio':
                return await self._send_gpio_pulse(config, pulse_width_us)
            else:
                logger.error(f"Unknown control type: {config.control_type}")
                return False
        except Exception as e:
            logger.error(f"Error sending PWM pulse: {e}")
            return False

    async def _send_pca9685_pulse(self, config: ServoConfig, pulse_width_us: int) -> bool:
        """Send PWM pulse via PCA9685"""
        try:
            if not PCA9685_AVAILABLE:
                logger.error("PCA9685 libraries not available")
                return False

            # Get or create PCA9685 instance
            address = getattr(config, 'pca9685_address', 0x40)
            if address not in self.pca9685_instances:
                i2c = busio.I2C(board.SCL, board.SDA)
                pca = PCA9685(i2c, address=address)
                pca.frequency = config.frequency
                self.pca9685_instances[address] = pca

            pca = self.pca9685_instances[address]

            if pulse_width_us == 0:
                # Turn off PWM
                pca.channels[config.channel].duty_cycle = 0
            else:
                # Set PWM duty cycle
                duty_cycle = int((pulse_width_us / 20000.0) * 65535)
                pca.channels[config.channel].duty_cycle = duty_cycle

            return True

        except Exception as e:
            logger.error(f"Error sending PCA9685 pulse: {e}")
            return False

    async def _send_gpio_pulse(self, config: ServoConfig, pulse_width_us: int) -> bool:
        """Send PWM pulse via GPIO"""
        try:
            if not LGPIO_AVAILABLE or not self.gpio_handle:
                logger.error("GPIO not available")
                return False

            if pulse_width_us == 0:
                # Stop servo
                lgpio.tx_servo(self.gpio_handle, config.pin, 0)
            else:
                # Send servo pulse
                lgpio.tx_servo(self.gpio_handle, config.pin, pulse_width_us, config.frequency, 0, 0)

            return True

        except Exception as e:
            logger.error(f"Error sending GPIO pulse: {e}")
            return False

    async def _stop_servo_after_delay(self, servo_id: str, delay: float):
        """Stop servo after specified delay"""
        try:
            await asyncio.sleep(delay)
            config = self.servo_configs.get(servo_id)
            if config:
                calibration = self.servo_calibrations.get(servo_id)
                if calibration and calibration.get('servo_type') == 'continuous':
                    # Send stop pulse for continuous servo
                    stop_pulse = calibration.get('stop_pulse_us', 1500)
                    await self._send_pwm_pulse(config, stop_pulse)
                else:
                    # Turn off PWM for standard servo
                    await self._send_pwm_pulse(config, 0)

                logger.info(f"Servo {servo_id} stopped after {delay}s delay")

        except Exception as e:
            logger.error(f"Error stopping servo after delay: {e}")

    async def start(self):
        """Start the servo WebSocket service"""
        await self.start_server()

    async def stop(self):
        """Stop the servo WebSocket service"""
        await self.stop_server()

    async def cleanup(self):
        """Cleanup resources"""
        try:
            logger.info("🧹 Cleaning up servo service...")

            # Stop all animations
            for servo_id in list(self.active_animations.keys()):
                if self.active_animations[servo_id]:
                    await self.handle_jaw_animation_stop({"servo_id": servo_id})

            # Stop all servos
            for servo_id in self.servo_configs:
                await self._stop_servo_hardware(servo_id)

            # Close GPIO handle
            if self.gpio_handle and LGPIO_AVAILABLE:
                lgpio.gpiochip_close(self.gpio_handle)
                self.gpio_handle = None

            # Close PCA9685 instances
            self.pca9685_instances.clear()

            logger.info("✅ Servo service cleanup completed")

        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

async def main():
    """Main function to run the servo WebSocket service"""
    import argparse

    parser = argparse.ArgumentParser(description='MonsterBox Servo WebSocket Service')
    parser.add_argument('--port', type=int, default=8404, help='WebSocket port')
    parser.add_argument('--host', default='0.0.0.0', help='WebSocket host')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')

    args = parser.parse_args()

    # Configure logging - REDUCED VERBOSITY FOR PRODUCTION
    log_level = logging.DEBUG if args.debug else logging.WARNING  # Only show warnings and errors
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # Suppress excessive logging from specific modules
    logging.getLogger('websockets').setLevel(logging.ERROR)
    logging.getLogger('asyncio').setLevel(logging.ERROR)

    # Create and start service
    service = ServoWebSocketService(port=args.port, host=args.host)

    try:
        await service.start()
    except KeyboardInterrupt:
        logger.info("Received interrupt signal")
    finally:
        await service.cleanup()

if __name__ == "__main__":
    asyncio.run(main())
