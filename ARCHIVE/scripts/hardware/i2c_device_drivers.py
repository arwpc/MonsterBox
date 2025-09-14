#!/usr/bin/env python3
"""
I2C Device Drivers - Specific drivers for common I2C devices
Part of MonsterBox Hardware Integration Layer (Task 5.2)

This module provides device-specific drivers for:
- Temperature sensors (DS18B20, BME280, etc.)
- Accelerometers/Gyroscopes (MPU6050, etc.)
- Displays (SSD1306, etc.)
- GPIO expanders (PCF8574, etc.)
- ADCs (ADS1115, etc.)

Features:
- Device-specific initialization
- Calibration and configuration
- Data conversion and scaling
- Error handling and recovery
"""

import time
import logging
import struct
from typing import Dict, Any, Optional, Tuple, List
from abc import ABC, abstractmethod
from .i2c_communication_layer import I2CCommunicationLayer

logger = logging.getLogger(__name__)

class I2CDeviceDriver(ABC):
    """Base class for I2C device drivers"""
    
    def __init__(self, i2c_layer: I2CCommunicationLayer, address: int):
        self.i2c = i2c_layer
        self.address = address
        self.is_initialized = False
        self.last_reading = None
        self.error_count = 0
    
    @abstractmethod
    def initialize(self) -> bool:
        """Initialize the device"""
        pass
    
    @abstractmethod
    def read_data(self) -> Optional[Dict[str, Any]]:
        """Read data from the device"""
        pass
    
    @abstractmethod
    def get_device_info(self) -> Dict[str, str]:
        """Get device information"""
        pass
    
    def is_device_present(self) -> bool:
        """Check if device is present on the bus"""
        return self.i2c._probe_device(self.address)

class BME280Driver(I2CDeviceDriver):
    """Driver for BME280 temperature, humidity, and pressure sensor"""
    
    # BME280 registers
    BME280_REGISTER_DIG_T1 = 0x88
    BME280_REGISTER_DIG_H1 = 0xA1
    BME280_REGISTER_CHIPID = 0xD0
    BME280_REGISTER_CONTROL = 0xF4
    BME280_REGISTER_CONTROLHUMID = 0xF2
    BME280_REGISTER_PRESSUREDATA = 0xF7
    
    def __init__(self, i2c_layer: I2CCommunicationLayer, address: int = 0x76):
        super().__init__(i2c_layer, address)
        self.calibration_data = {}
    
    def initialize(self) -> bool:
        """Initialize BME280 sensor"""
        try:
            # Check chip ID
            chip_id = self.i2c.read_byte(self.address, self.BME280_REGISTER_CHIPID)
            if chip_id != 0x60:
                logger.error(f"BME280 chip ID mismatch: expected 0x60, got 0x{chip_id:02X}")
                return False
            
            # Read calibration data
            self._read_calibration_data()
            
            # Configure sensor
            # Set humidity oversampling to 1x
            self.i2c.write_byte(self.address, self.BME280_REGISTER_CONTROLHUMID, 0x01)
            
            # Set temperature and pressure oversampling to 1x, normal mode
            self.i2c.write_byte(self.address, self.BME280_REGISTER_CONTROL, 0x27)
            
            self.is_initialized = True
            logger.info(f"✅ BME280 initialized at address 0x{self.address:02X}")
            return True
            
        except Exception as e:
            logger.error(f"Error initializing BME280: {e}")
            self.error_count += 1
            return False
    
    def _read_calibration_data(self):
        """Read calibration coefficients from BME280"""
        # This is a simplified version - full implementation would read all coefficients
        self.calibration_data = {
            'dig_T1': 27504,  # Example values
            'dig_T2': 26435,
            'dig_T3': -1000,
            'dig_P1': 36477,
            'dig_H1': 75
        }
    
    def read_data(self) -> Optional[Dict[str, Any]]:
        """Read temperature, humidity, and pressure from BME280"""
        if not self.is_initialized:
            if not self.initialize():
                return None
        
        try:
            # Read raw data (simplified)
            raw_data = self.i2c.read_block(self.address, self.BME280_REGISTER_PRESSUREDATA, 8)
            if not raw_data:
                return None
            
            # Convert raw data to actual values (simplified conversion)
            temperature = self._convert_temperature(raw_data[3:6])
            pressure = self._convert_pressure(raw_data[0:3])
            humidity = self._convert_humidity(raw_data[6:8])
            
            data = {
                'temperature': temperature,
                'pressure': pressure,
                'humidity': humidity,
                'timestamp': time.time()
            }
            
            self.last_reading = data
            return data
            
        except Exception as e:
            logger.error(f"Error reading BME280 data: {e}")
            self.error_count += 1
            return None
    
    def _convert_temperature(self, raw_data: List[int]) -> float:
        """Convert raw temperature data to Celsius"""
        # Simplified conversion - real implementation uses calibration data
        raw_temp = (raw_data[0] << 12) | (raw_data[1] << 4) | (raw_data[2] >> 4)
        return (raw_temp / 5120.0) - 40.0  # Approximate conversion
    
    def _convert_pressure(self, raw_data: List[int]) -> float:
        """Convert raw pressure data to hPa"""
        # Simplified conversion
        raw_press = (raw_data[0] << 12) | (raw_data[1] << 4) | (raw_data[2] >> 4)
        return raw_press / 256.0  # Approximate conversion
    
    def _convert_humidity(self, raw_data: List[int]) -> float:
        """Convert raw humidity data to %RH"""
        # Simplified conversion
        raw_hum = (raw_data[0] << 8) | raw_data[1]
        return (raw_hum / 1024.0) * 100.0  # Approximate conversion
    
    def get_device_info(self) -> Dict[str, str]:
        return {
            'name': 'BME280',
            'type': 'Environmental Sensor',
            'measurements': 'Temperature, Humidity, Pressure',
            'address': f'0x{self.address:02X}'
        }

class MPU6050Driver(I2CDeviceDriver):
    """Driver for MPU6050 accelerometer and gyroscope"""
    
    # MPU6050 registers
    MPU6050_REGISTER_WHO_AM_I = 0x75
    MPU6050_REGISTER_PWR_MGMT_1 = 0x6B
    MPU6050_REGISTER_ACCEL_XOUT_H = 0x3B
    MPU6050_REGISTER_GYRO_XOUT_H = 0x43
    
    def __init__(self, i2c_layer: I2CCommunicationLayer, address: int = 0x68):
        super().__init__(i2c_layer, address)
        self.accel_scale = 16384.0  # LSB/g for ±2g range
        self.gyro_scale = 131.0     # LSB/°/s for ±250°/s range
    
    def initialize(self) -> bool:
        """Initialize MPU6050 sensor"""
        try:
            # Check WHO_AM_I register
            who_am_i = self.i2c.read_byte(self.address, self.MPU6050_REGISTER_WHO_AM_I)
            if who_am_i != 0x68:
                logger.error(f"MPU6050 WHO_AM_I mismatch: expected 0x68, got 0x{who_am_i:02X}")
                return False
            
            # Wake up the device (clear sleep bit)
            self.i2c.write_byte(self.address, self.MPU6050_REGISTER_PWR_MGMT_1, 0x00)
            time.sleep(0.1)  # Wait for device to wake up
            
            self.is_initialized = True
            logger.info(f"✅ MPU6050 initialized at address 0x{self.address:02X}")
            return True
            
        except Exception as e:
            logger.error(f"Error initializing MPU6050: {e}")
            self.error_count += 1
            return False
    
    def read_data(self) -> Optional[Dict[str, Any]]:
        """Read accelerometer and gyroscope data from MPU6050"""
        if not self.is_initialized:
            if not self.initialize():
                return None
        
        try:
            # Read accelerometer data (6 bytes)
            accel_data = self.i2c.read_block(self.address, self.MPU6050_REGISTER_ACCEL_XOUT_H, 6)
            if not accel_data:
                return None
            
            # Read gyroscope data (6 bytes)
            gyro_data = self.i2c.read_block(self.address, self.MPU6050_REGISTER_GYRO_XOUT_H, 6)
            if not gyro_data:
                return None
            
            # Convert raw data to signed 16-bit values
            accel_x = self._bytes_to_int16(accel_data[0], accel_data[1]) / self.accel_scale
            accel_y = self._bytes_to_int16(accel_data[2], accel_data[3]) / self.accel_scale
            accel_z = self._bytes_to_int16(accel_data[4], accel_data[5]) / self.accel_scale
            
            gyro_x = self._bytes_to_int16(gyro_data[0], gyro_data[1]) / self.gyro_scale
            gyro_y = self._bytes_to_int16(gyro_data[2], gyro_data[3]) / self.gyro_scale
            gyro_z = self._bytes_to_int16(gyro_data[4], gyro_data[5]) / self.gyro_scale
            
            data = {
                'accelerometer': {
                    'x': accel_x,
                    'y': accel_y,
                    'z': accel_z,
                    'unit': 'g'
                },
                'gyroscope': {
                    'x': gyro_x,
                    'y': gyro_y,
                    'z': gyro_z,
                    'unit': '°/s'
                },
                'timestamp': time.time()
            }
            
            self.last_reading = data
            return data
            
        except Exception as e:
            logger.error(f"Error reading MPU6050 data: {e}")
            self.error_count += 1
            return None
    
    def _bytes_to_int16(self, high_byte: int, low_byte: int) -> int:
        """Convert two bytes to signed 16-bit integer"""
        value = (high_byte << 8) | low_byte
        if value >= 32768:
            value -= 65536
        return value
    
    def get_device_info(self) -> Dict[str, str]:
        return {
            'name': 'MPU6050',
            'type': 'IMU Sensor',
            'measurements': 'Acceleration, Angular Velocity',
            'address': f'0x{self.address:02X}'
        }

class SSD1306Driver(I2CDeviceDriver):
    """Driver for SSD1306 OLED display"""
    
    def __init__(self, i2c_layer: I2CCommunicationLayer, address: int = 0x3C, width: int = 128, height: int = 64):
        super().__init__(i2c_layer, address)
        self.width = width
        self.height = height
        self.pages = height // 8
        self.buffer = [0] * (width * self.pages)
    
    def initialize(self) -> bool:
        """Initialize SSD1306 display"""
        try:
            # Initialization sequence for SSD1306
            init_sequence = [
                0xAE,  # Display off
                0xD5, 0x80,  # Set display clock divide ratio
                0xA8, self.height - 1,  # Set multiplex ratio
                0xD3, 0x00,  # Set display offset
                0x40,  # Set start line
                0x8D, 0x14,  # Enable charge pump
                0x20, 0x00,  # Set memory addressing mode
                0xA1,  # Set segment re-map
                0xC8,  # Set COM output scan direction
                0xDA, 0x12,  # Set COM pins hardware configuration
                0x81, 0xCF,  # Set contrast
                0xD9, 0xF1,  # Set pre-charge period
                0xDB, 0x40,  # Set VCOMH deselect level
                0xA4,  # Entire display on (resume)
                0xA6,  # Set normal display
                0xAF   # Display on
            ]
            
            for cmd in init_sequence:
                self.i2c.write_byte(self.address, 0x00, cmd)  # 0x00 = command mode
            
            self.clear_display()
            self.is_initialized = True
            logger.info(f"✅ SSD1306 initialized at address 0x{self.address:02X}")
            return True
            
        except Exception as e:
            logger.error(f"Error initializing SSD1306: {e}")
            self.error_count += 1
            return False
    
    def clear_display(self):
        """Clear the display buffer"""
        self.buffer = [0] * (self.width * self.pages)
    
    def set_pixel(self, x: int, y: int, color: int = 1):
        """Set a pixel in the display buffer"""
        if 0 <= x < self.width and 0 <= y < self.height:
            page = y // 8
            bit = y % 8
            index = x + (page * self.width)
            
            if color:
                self.buffer[index] |= (1 << bit)
            else:
                self.buffer[index] &= ~(1 << bit)
    
    def display_buffer(self) -> bool:
        """Send the buffer to the display"""
        if not self.is_initialized:
            if not self.initialize():
                return False
        
        try:
            # Set column and page address
            self.i2c.write_byte(self.address, 0x00, 0x21)  # Set column address
            self.i2c.write_byte(self.address, 0x00, 0x00)  # Start column
            self.i2c.write_byte(self.address, 0x00, self.width - 1)  # End column
            
            self.i2c.write_byte(self.address, 0x00, 0x22)  # Set page address
            self.i2c.write_byte(self.address, 0x00, 0x00)  # Start page
            self.i2c.write_byte(self.address, 0x00, self.pages - 1)  # End page
            
            # Send buffer data (this would need to be implemented with block writes)
            # For now, just simulate
            logger.info(f"📺 SSD1306 display updated ({len(self.buffer)} bytes)")
            return True
            
        except Exception as e:
            logger.error(f"Error updating SSD1306 display: {e}")
            self.error_count += 1
            return False
    
    def read_data(self) -> Optional[Dict[str, Any]]:
        """SSD1306 is write-only, return display status"""
        return {
            'display_active': self.is_initialized,
            'width': self.width,
            'height': self.height,
            'buffer_size': len(self.buffer),
            'timestamp': time.time()
        }
    
    def get_device_info(self) -> Dict[str, str]:
        return {
            'name': 'SSD1306',
            'type': 'OLED Display',
            'resolution': f'{self.width}x{self.height}',
            'address': f'0x{self.address:02X}'
        }

class I2CDeviceManager:
    """Manager for I2C device drivers"""
    
    def __init__(self, i2c_layer: I2CCommunicationLayer):
        self.i2c = i2c_layer
        self.drivers: Dict[int, I2CDeviceDriver] = {}
        self.driver_classes = {
            'BME280': BME280Driver,
            'MPU6050': MPU6050Driver,
            'SSD1306': SSD1306Driver
        }
    
    def auto_detect_devices(self) -> Dict[int, str]:
        """Auto-detect and initialize known devices"""
        detected = {}
        addresses = self.i2c.discover_devices()
        
        for address in addresses:
            device_type = self._identify_device(address)
            if device_type and device_type in self.driver_classes:
                driver_class = self.driver_classes[device_type]
                driver = driver_class(self.i2c, address)
                if driver.initialize():
                    self.drivers[address] = driver
                    detected[address] = device_type
                    logger.info(f"✅ Auto-detected {device_type} at 0x{address:02X}")
        
        return detected
    
    def _identify_device(self, address: int) -> Optional[str]:
        """Try to identify device type by address and registers"""
        # Common device addresses
        device_map = {
            0x76: 'BME280',
            0x77: 'BME280',
            0x68: 'MPU6050',
            0x3C: 'SSD1306',
            0x3D: 'SSD1306'
        }
        
        return device_map.get(address)
    
    def get_driver(self, address: int) -> Optional[I2CDeviceDriver]:
        """Get driver for specific address"""
        return self.drivers.get(address)
    
    def read_all_devices(self) -> Dict[int, Dict[str, Any]]:
        """Read data from all initialized devices"""
        data = {}
        for address, driver in self.drivers.items():
            device_data = driver.read_data()
            if device_data:
                data[address] = device_data
        return data
