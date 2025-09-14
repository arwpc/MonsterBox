#!/usr/bin/env python3
"""
Head Tracking Dependencies Checker
Verifies all required dependencies for head tracking functionality
"""

import sys
import subprocess
import importlib
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Required packages for head tracking
REQUIRED_PACKAGES = {
    'cv2': 'opencv-python>=4.5.0',
    'numpy': 'numpy>=1.19.0',
    'websockets': 'websockets>=10.0',
    'asyncio': 'built-in',  # Built-in module
    'json': 'built-in',     # Built-in module
    'time': 'built-in',     # Built-in module
    'threading': 'built-in', # Built-in module
    'logging': 'built-in',   # Built-in module
}

# Optional packages for enhanced functionality
OPTIONAL_PACKAGES = {
    'lgpio': 'lgpio>=1.0.0',
    'pigpio': 'pigpio>=1.78',
}

def check_package(package_name, requirement):
    """Check if a package is available and working"""
    try:
        if requirement == 'built-in':
            # Just try to import built-in modules
            importlib.import_module(package_name)
            logger.info(f"✅ {package_name}: Available (built-in)")
            return True
        else:
            # Import and check version if possible
            module = importlib.import_module(package_name)
            version = getattr(module, '__version__', 'unknown')
            logger.info(f"✅ {package_name}: Available (version {version})")
            return True
    except ImportError as e:
        logger.error(f"❌ {package_name}: Not available - {e}")
        return False
    except Exception as e:
        logger.warning(f"⚠️ {package_name}: Available but with issues - {e}")
        return True  # Consider it available but with warnings

def check_opencv_functionality():
    """Test OpenCV specific functionality needed for head tracking"""
    try:
        import cv2
        import numpy as np
        
        # Test basic OpenCV functionality
        test_image = np.zeros((100, 100, 3), dtype=np.uint8)
        gray = cv2.cvtColor(test_image, cv2.COLOR_BGR2GRAY)
        
        # Test background subtractor
        bg_subtractor = cv2.createBackgroundSubtractorMOG2()
        mask = bg_subtractor.apply(test_image)
        
        # Test contour detection
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        logger.info("✅ OpenCV functionality test passed")
        return True
        
    except Exception as e:
        logger.error(f"❌ OpenCV functionality test failed: {e}")
        return False

def check_camera_access():
    """Check if camera devices are accessible"""
    try:
        import cv2
        
        # Try to access common camera devices
        camera_found = False
        for device_id in range(5):  # Check first 5 camera devices
            try:
                cap = cv2.VideoCapture(device_id, cv2.CAP_V4L2)
                if cap.isOpened():
                    logger.info(f"✅ Camera device /dev/video{device_id}: Available")
                    camera_found = True
                    cap.release()
                else:
                    logger.debug(f"Camera device /dev/video{device_id}: Not available")
            except Exception as e:
                logger.debug(f"Camera device /dev/video{device_id}: Error - {e}")
        
        if not camera_found:
            logger.warning("⚠️ No camera devices found - head tracking will not work without a camera")
            
        return camera_found
        
    except Exception as e:
        logger.error(f"❌ Camera access check failed: {e}")
        return False

def install_missing_packages():
    """Attempt to install missing packages"""
    logger.info("🔧 Attempting to install missing packages...")
    
    try:
        # Update package list
        subprocess.run(['sudo', 'apt', 'update'], check=True, capture_output=True)
        
        # Install OpenCV dependencies
        subprocess.run([
            'sudo', 'apt', 'install', '-y',
            'python3-opencv',
            'libopencv-dev',
            'python3-numpy'
        ], check=True, capture_output=True)
        
        # Install Python packages
        subprocess.run([
            'pip3', 'install',
            'opencv-python>=4.5.0',
            'numpy>=1.19.0',
            'websockets>=10.0'
        ], check=True, capture_output=True)
        
        logger.info("✅ Package installation completed")
        return True
        
    except subprocess.CalledProcessError as e:
        logger.error(f"❌ Package installation failed: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Unexpected error during installation: {e}")
        return False

def main():
    """Main dependency check function"""
    logger.info("🔍 Checking head tracking dependencies...")
    
    all_good = True
    missing_packages = []
    
    # Check required packages
    logger.info("\n📦 Checking required packages:")
    for package, requirement in REQUIRED_PACKAGES.items():
        if not check_package(package, requirement):
            all_good = False
            if requirement != 'built-in':
                missing_packages.append(requirement)
    
    # Check optional packages
    logger.info("\n📦 Checking optional packages:")
    for package, requirement in OPTIONAL_PACKAGES.items():
        check_package(package, requirement)
    
    # Test OpenCV functionality
    logger.info("\n🧪 Testing OpenCV functionality:")
    if not check_opencv_functionality():
        all_good = False
    
    # Check camera access
    logger.info("\n📹 Checking camera access:")
    camera_available = check_camera_access()
    
    # Summary
    logger.info("\n📋 Dependency Check Summary:")
    if all_good:
        logger.info("✅ All required dependencies are available")
        if camera_available:
            logger.info("✅ Camera hardware is accessible")
            logger.info("🎯 Head tracking system is ready to use!")
        else:
            logger.warning("⚠️ No camera found - head tracking will not work without camera hardware")
    else:
        logger.error("❌ Some required dependencies are missing")
        if missing_packages:
            logger.info(f"Missing packages: {', '.join(missing_packages)}")
            
            # Offer to install missing packages
            try:
                response = input("\n🔧 Would you like to attempt automatic installation? (y/N): ")
                if response.lower() in ['y', 'yes']:
                    if install_missing_packages():
                        logger.info("✅ Installation completed. Please run this check again.")
                    else:
                        logger.error("❌ Installation failed. Please install packages manually.")
            except KeyboardInterrupt:
                logger.info("\n⚠️ Installation cancelled by user")
    
    return all_good and camera_available

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
