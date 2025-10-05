#!/usr/bin/env python3
"""
Enhanced Linear Actuator Control Script for MonsterBox 4.0
Supports multiple motor driver boards: MDD10A, Cytron, BTS7960
"""

import lgpio
import time
import sys
import json

def log_info(message):
    print(json.dumps({"level": "info", "message": message}), file=sys.stderr, flush=True)

def log_error(message):
    print(json.dumps({"level": "error", "message": message}), file=sys.stderr, flush=True)

def log_debug(message):
    print(json.dumps({"level": "debug", "message": message}), file=sys.stderr, flush=True)

def log_warning(message):
    print(json.dumps({"level": "warning", "message": message}), file=sys.stderr, flush=True)

# Board type constants
BOARD_MDD10A = "MDD10A"
BOARD_CYTRON = "CYTRON"
BOARD_BTS7960 = "BTS7960"

class LinearActuatorController:
    """Controller for linear actuators with multiple board type support."""
    
    def __init__(self, board_type="MDD10A"):
        self.board_type = board_type
        self.h = None
        self.pins = {}
        
    def setup_gpio(self):
        """Initialize GPIO connection."""
        try:
            self.h = lgpio.gpiochip_open(0)
            log_info(f"GPIO initialized successfully for {self.board_type} board")
            return True
        except Exception as e:
            log_error(f"Failed to initialize GPIO: {str(e)}")
            return False
    
    def setup_mdd10a_pins(self, dir_pin, pwm_pin):
        """Setup pins for MDD10A/Cytron board (DIR + PWM)."""
        try:
            lgpio.gpio_claim_output(self.h, dir_pin)
            lgpio.gpio_claim_output(self.h, pwm_pin)
            self.pins = {'dir': dir_pin, 'pwm': pwm_pin}
            log_info(f"MDD10A pins configured - DIR: {dir_pin}, PWM: {pwm_pin}")
            return True
        except Exception as e:
            log_error(f"Failed to setup MDD10A pins: {str(e)}")
            return False
    
    def setup_bts7960_pins(self, rpwm_pin, lpwm_pin, ren_pin=None, len_pin=None):
        """Setup pins for BTS7960 board (RPWM + LPWM + optional enables)."""
        try:
            lgpio.gpio_claim_output(self.h, rpwm_pin)
            lgpio.gpio_claim_output(self.h, lpwm_pin)
            self.pins = {'rpwm': rpwm_pin, 'lpwm': lpwm_pin}
            
            # Setup enable pins if provided
            if ren_pin is not None:
                lgpio.gpio_claim_output(self.h, ren_pin)
                lgpio.gpio_write(self.h, ren_pin, 1)  # Enable right side
                self.pins['ren'] = ren_pin
            
            if len_pin is not None:
                lgpio.gpio_claim_output(self.h, len_pin)
                lgpio.gpio_write(self.h, len_pin, 1)  # Enable left side
                self.pins['len'] = len_pin
            
            log_info(f"BTS7960 pins configured - RPWM: {rpwm_pin}, LPWM: {lpwm_pin}, R_EN: {ren_pin}, L_EN: {len_pin}")
            return True
        except Exception as e:
            log_error(f"Failed to setup BTS7960 pins: {str(e)}")
            return False
    
    def control_mdd10a(self, direction, speed, duration):
        """Control actuator using MDD10A/Cytron board."""
        try:
            dir_pin = self.pins['dir']
            pwm_pin = self.pins['pwm']
            
            # Stop motor first
            lgpio.gpio_write(self.h, pwm_pin, 0)
            time.sleep(0.05)
            
            # Set direction (0=forward, 1=backward)
            dir_value = 0 if direction == 'forward' else 1
            lgpio.gpio_write(self.h, dir_pin, dir_value)
            log_info(f"Direction set to {direction} (pin {dir_pin} = {dir_value})")
            
            # Calculate duty cycle
            duty_cycle = int((speed / 100.0) * 255)
            log_info(f"Speed: {speed}%, Duty cycle: {duty_cycle}/255")
            
            # Software PWM
            cycle_time = 0.01  # 10ms = 100Hz
            start_time = time.time()
            end_time = start_time + (duration / 1000.0)
            
            while time.time() < end_time:
                if duty_cycle > 0:
                    on_time = cycle_time * (duty_cycle / 255.0)
                    off_time = cycle_time - on_time
                    lgpio.gpio_write(self.h, pwm_pin, 1)
                    time.sleep(on_time)
                    lgpio.gpio_write(self.h, pwm_pin, 0)
                    time.sleep(off_time)
                else:
                    time.sleep(cycle_time)
            
            # Stop motor
            lgpio.gpio_write(self.h, pwm_pin, 0)
            log_info("Motor stopped")
            return True
            
        except Exception as e:
            log_error(f"Error controlling MDD10A: {str(e)}")
            return False
    
    def control_bts7960(self, direction, speed, duration):
        """Control actuator using BTS7960 board."""
        try:
            rpwm_pin = self.pins['rpwm']
            lpwm_pin = self.pins['lpwm']
            
            # Stop motor first
            lgpio.gpio_write(self.h, rpwm_pin, 0)
            lgpio.gpio_write(self.h, lpwm_pin, 0)
            time.sleep(0.05)
            
            # Calculate duty cycle
            duty_cycle = int((speed / 100.0) * 255)
            log_info(f"BTS7960 control - Direction: {direction}, Speed: {speed}%, Duty: {duty_cycle}/255")
            
            # Determine which PWM pin to use
            active_pin = rpwm_pin if direction == 'forward' else lpwm_pin
            inactive_pin = lpwm_pin if direction == 'forward' else rpwm_pin
            
            # Ensure inactive pin is LOW
            lgpio.gpio_write(self.h, inactive_pin, 0)
            
            # Software PWM on active pin
            cycle_time = 0.01  # 10ms = 100Hz
            start_time = time.time()
            end_time = start_time + (duration / 1000.0)
            
            while time.time() < end_time:
                if duty_cycle > 0:
                    on_time = cycle_time * (duty_cycle / 255.0)
                    off_time = cycle_time - on_time
                    lgpio.gpio_write(self.h, active_pin, 1)
                    time.sleep(on_time)
                    lgpio.gpio_write(self.h, active_pin, 0)
                    time.sleep(off_time)
                else:
                    time.sleep(cycle_time)
            
            # Stop motor
            lgpio.gpio_write(self.h, rpwm_pin, 0)
            lgpio.gpio_write(self.h, lpwm_pin, 0)
            log_info("BTS7960 motor stopped")
            return True
            
        except Exception as e:
            log_error(f"Error controlling BTS7960: {str(e)}")
            return False
    
    def cleanup(self):
        """Clean up GPIO resources."""
        if self.h is not None:
            try:
                # Set all pins LOW
                for pin in self.pins.values():
                    if pin is not None:
                        lgpio.gpio_write(self.h, pin, 0)
                lgpio.gpiochip_close(self.h)
                log_info("GPIO cleanup completed")
            except Exception as e:
                log_error(f"Error during cleanup: {str(e)}")

def main():
    """Main entry point with argument parsing."""
    if len(sys.argv) < 2:
        log_error("Usage: python3 linear_actuator_control_v2.py <config_json>")
        print(json.dumps({"success": False, "error": "Missing configuration"}))
        sys.exit(1)
    
    try:
        # Parse JSON configuration
        config = json.loads(sys.argv[1])
        
        board_type = config.get('controlBoard', 'MDD10A')
        direction = config.get('direction', 'forward')
        speed = float(config.get('speed', 50))
        duration = int(config.get('duration', 1000))
        
        log_info(f"Configuration: board={board_type}, direction={direction}, speed={speed}, duration={duration}")
        
        # Create controller
        controller = LinearActuatorController(board_type)
        
        if not controller.setup_gpio():
            print(json.dumps({"success": False, "error": "GPIO initialization failed"}))
            sys.exit(1)
        
        # Setup pins based on board type
        if board_type in [BOARD_MDD10A, BOARD_CYTRON]:
            dir_pin = int(config.get('directionPin'))
            pwm_pin = int(config.get('pwmPin'))
            if not controller.setup_mdd10a_pins(dir_pin, pwm_pin):
                print(json.dumps({"success": False, "error": "Pin setup failed"}))
                sys.exit(1)
            success = controller.control_mdd10a(direction, speed, duration)
            
        elif board_type == BOARD_BTS7960:
            rpwm_pin = int(config.get('rpwmPin'))
            lpwm_pin = int(config.get('lpwmPin'))
            ren_pin = config.get('renPin')
            len_pin = config.get('lenPin')
            if ren_pin: ren_pin = int(ren_pin)
            if len_pin: len_pin = int(len_pin)
            
            if not controller.setup_bts7960_pins(rpwm_pin, lpwm_pin, ren_pin, len_pin):
                print(json.dumps({"success": False, "error": "Pin setup failed"}))
                sys.exit(1)
            success = controller.control_bts7960(direction, speed, duration)
        else:
            log_error(f"Unsupported board type: {board_type}")
            print(json.dumps({"success": False, "error": f"Unsupported board type: {board_type}"}))
            sys.exit(1)
        
        controller.cleanup()
        
        if success:
            print(json.dumps({"success": True}))
            sys.exit(0)
        else:
            print(json.dumps({"success": False, "error": "Control operation failed"}))
            sys.exit(1)
            
    except Exception as e:
        log_error(f"Fatal error: {str(e)}")
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()

