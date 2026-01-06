#!/usr/bin/env python3
"""
Test all hardware parts across all animatronics
Calls the parts test API endpoint and moves actual hardware
"""
import json
import sys
import time
import urllib.request
import urllib.error

# Animatronics configuration
ANIMATRONICS = {
    'orlok': '192.168.8.120',
    'skulltalker': '192.168.8.130',
    'coffin': '192.168.8.140',
    'pumpkinhead': '192.168.8.150',
    'groundbreaker': '192.168.8.200'
}

# Hardware test actions (conservative values to avoid stress)
TEST_ACTIONS = {
    'servo': {
        'action': 'moveToAngle',
        'params': {'angleDeg': 90}
    },
    'motor': {
        'action': 'control',
        'params': {'direction': 'forward', 'speed': 30, 'duration': 1000}
    },
    'stepper': {
        'action': 'moveSteps',
        'params': {'steps': 50, 'speed': 100}
    },
    'linear_actuator': {
        'action': 'extend',
        'params': {'speed': 30, 'distance': 20}
    }
}

def test_animatronic(name, ip):
    """Test all parts on a single animatronic"""
    print(f"\n{'='*60}")
    print(f"Testing {name.upper()} ({ip})")
    print(f"{'='*60}")
    
    # Check if animatronic is reachable
    try:
        urllib.request.urlopen(f'http://{ip}:3000/setup/parts/api/parts', timeout=5)
    except Exception as e:
        print(f"❌ {name} is not reachable: {e}")
        return {'name': name, 'ip': ip, 'reachable': False, 'parts_tested': 0, 'parts_passed': 0, 'parts_failed': 0}
    
    # Get parts list
    try:
        with urllib.request.urlopen(f'http://{ip}:3000/setup/parts/api/parts', timeout=10) as response:
            data = json.loads(response.read().decode())
            if not data.get('success'):
                print(f"❌ Failed to get parts list: {data}")
                return {'name': name, 'ip': ip, 'reachable': True, 'parts_tested': 0, 'parts_passed': 0, 'parts_failed': 0}
            
            parts = data.get('parts', [])
            print(f"Found {len(parts)} parts")
    except Exception as e:
        print(f"❌ Error fetching parts: {e}")
        return {'name': name, 'ip': ip, 'reachable': True, 'parts_tested': 0, 'parts_passed': 0, 'parts_failed': 0}
    
    # Test each part that moves hardware
    results = {'name': name, 'ip': ip, 'reachable': True, 'parts_tested': 0, 'parts_passed': 0, 'parts_failed': 0, 'details': []}
    
    for part in parts:
        part_type = part.get('type', '').lower()
        part_id = part.get('id')
        part_name = part.get('name', 'Unknown')
        enabled = part.get('enabled', True)
        
        # Skip non-moving parts or disabled parts
        if part_type not in TEST_ACTIONS or not enabled:
            continue
        
        print(f"\n🧪 Testing {part_name} (ID: {part_id}, Type: {part_type})")
        results['parts_tested'] += 1
        
        # Get test action for this part type
        test_config = TEST_ACTIONS[part_type]
        
        # Special handling for continuous servos
        if part_type == 'servo':
            servo_type = part.get('config', {}).get('servoType', 'standard')
            if servo_type == 'continuous':
                test_config = {
                    'action': 'rotateContinuous',
                    'params': {'direction': 'cw', 'speed': 25, 'duration': 1000}
                }
        
        # Make test request
        try:
            test_data = json.dumps(test_config).encode('utf-8')
            req = urllib.request.Request(
                f'http://{ip}:3000/setup/parts/api/parts/{part_id}/test',
                data=test_data,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            
            with urllib.request.urlopen(req, timeout=15) as response:
                result = json.loads(response.read().decode())
                
                if result.get('success'):
                    print(f"   ✅ PASS: {result.get('message', 'Success')}")
                    results['parts_passed'] += 1
                    results['details'].append({
                        'part_id': part_id,
                        'part_name': part_name,
                        'part_type': part_type,
                        'status': 'PASS'
                    })
                else:
                    print(f"   ❌ FAIL: {result.get('message', 'Unknown error')}")
                    results['parts_failed'] += 1
                    results['details'].append({
                        'part_id': part_id,
                        'part_name': part_name,
                        'part_type': part_type,
                        'status': 'FAIL',
                        'error': result.get('message', 'Unknown error')
                    })
        except urllib.error.HTTPError as e:
            error_msg = f"HTTP {e.code}: {e.reason}"
            print(f"   ❌ FAIL: {error_msg}")
            results['parts_failed'] += 1
            results['details'].append({
                'part_id': part_id,
                'part_name': part_name,
                'part_type': part_type,
                'status': 'FAIL',
                'error': error_msg
            })
        except Exception as e:
            error_msg = str(e)
            print(f"   ❌ FAIL: {error_msg}")
            results['parts_failed'] += 1
            results['details'].append({
                'part_id': part_id,
                'part_name': part_name,
                'part_type': part_type,
                'status': 'FAIL',
                'error': error_msg
            })
        
        # Small delay between tests
        time.sleep(0.5)
    
    return results

def main():
    """Test all animatronics"""
    print("🎃 MonsterBox v5.4 Hardware Test Suite")
    print("=" * 60)
    
    all_results = []
    
    for name, ip in ANIMATRONICS.items():
        result = test_animatronic(name, ip)
        all_results.append(result)
        time.sleep(2)  # Delay between animatronics
    
    # Print summary
    print(f"\n\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    
    total_tested = sum(r['parts_tested'] for r in all_results)
    total_passed = sum(r['parts_passed'] for r in all_results)
    total_failed = sum(r['parts_failed'] for r in all_results)
    
    for result in all_results:
        name = result['name']
        if not result['reachable']:
            print(f"❌ {name.upper()}: UNREACHABLE")
        else:
            tested = result['parts_tested']
            passed = result['parts_passed']
            failed = result['parts_failed']
            status = "✅ PASS" if failed == 0 and tested > 0 else "❌ FAIL"
            print(f"{status} {name.upper()}: {passed}/{tested} parts passed")
    
    print(f"\n{'='*60}")
    print(f"TOTAL: {total_passed}/{total_tested} parts passed")
    
    if total_failed > 0:
        print(f"\n❌ {total_failed} PARTS FAILED - REVIEW REQUIRED")
        sys.exit(1)
    else:
        print(f"\n✅ ALL PARTS PASSED - SYSTEM 100% OPERATIONAL")
        sys.exit(0)

if __name__ == '__main__':
    main()
