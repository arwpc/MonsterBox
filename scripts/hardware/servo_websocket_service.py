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

    def __init__(self, port: int = 8404, host: str = "0.0.0.0"):
        super().__init__("servo_service", "servo", port, host)

        # Servo management
        self.servo_configs: Dict[str, ServoConfig] = {}
        self.servo_states: Dict[str, ServoState] = {}
        self.jaw_animation_configs: Dict[str, JawAnimationConfig] = {}

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

    def _angle_to_pulse_width(self, angle: float, config: ServoConfig) -> int:
        """Convert angle to pulse width for servo"""
        # Clamp angle to valid range
        angle = max(config.min_angle, min(config.max_angle, angle))

        # Linear interpolation between min and max pulse widths
        pulse_range = config.max_pulse - config.min_pulse
        angle_range = config.max_angle - config.min_angle

        if angle_range == 0:
            return config.min_pulse

        pulse_width = config.min_pulse + (angle / angle_range) * pulse_range
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
        pulse_range = config.max_pulse - config.min_pulse
        angle_range = config.max_angle - config.min_angle

        if pulse_range == 0:
            return config.min_angle

        normalized = (pulse_width - config.min_pulse) / pulse_range
        angle = config.min_angle + (normalized * angle_range)
        return max(config.min_angle, min(config.max_angle, angle))

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

            return {"status": "success", "configs": configs}

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

    async def get_capabilities(self):
        """Get service capabilities"""
        return self.capabilities

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
