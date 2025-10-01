#!/usr/bin/env python3
"""
Test script to verify SMBus library installation
"""

import sys

def test_smbus_import():
    """Test if SMBus libraries can be imported"""
    print("🔧 Testing SMBus library imports...")
    
    # Test smbus2 (preferred)
    try:
        import smbus2
        print("✅ smbus2 imported successfully")
        smbus2_available = True
    except ImportError as e:
        print(f"❌ smbus2 import failed: {e}")
        smbus2_available = False
    
    # Test smbus (fallback)
    try:
        import smbus
        print("✅ smbus imported successfully")
        smbus_available = True
    except ImportError as e:
        print(f"❌ smbus import failed: {e}")
        smbus_available = False
    
    # Test the same import pattern as pca9685_control.py
    try:
        try:
            import smbus2 as smbus
            print("✅ smbus2 imported as smbus successfully")
        except ImportError:
            import smbus
            print("✅ smbus imported successfully (fallback)")
        
        # Try to create SMBus instance
        bus = smbus.SMBus(1)
        print("✅ SMBus(1) instance created successfully")
        bus.close()
        
        return True
        
    except Exception as e:
        print(f"❌ SMBus test failed: {e}")
        return False

def test_pca9685_import():
    """Test if pca9685_control can be imported"""
    print("\n🔧 Testing pca9685_control import...")
    
    try:
        sys.path.insert(0, '/home/remote/MonsterBox/python_wrappers')
        from pca9685_control import pca9685_set_angle, PCA9685_DEFAULT_ADDRESS
        print("✅ pca9685_control imported successfully")
        return True
    except Exception as e:
        print(f"❌ pca9685_control import failed: {e}")
        return False

if __name__ == "__main__":
    print("🚀 MonsterBox SMBus Installation Test")
    print("=" * 50)
    
    smbus_ok = test_smbus_import()
    pca9685_ok = test_pca9685_import()
    
    print("\n📊 Test Results:")
    print(f"   SMBus libraries: {'✅ PASS' if smbus_ok else '❌ FAIL'}")
    print(f"   PCA9685 control: {'✅ PASS' if pca9685_ok else '❌ FAIL'}")
    
    if smbus_ok and pca9685_ok:
        print("\n🎉 All tests passed! SMBus and PCA9685 control should work.")
        sys.exit(0)
    else:
        print("\n⚠️  Some tests failed. Run the following to fix:")
        print("   sudo apt update")
        print("   sudo apt install python3-smbus python3-smbus2")
        print("   pip3 install smbus2 --break-system-packages")
        sys.exit(1)
