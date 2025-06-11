# ChatterPi Deployment and Testing Script
# PowerShell script for comprehensive deployment

$RemoteHost = "192.168.8.130"
$RemoteUser = "remote"
$RemotePath = "~/MonsterBox"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] $Message"
}

function Test-SSHConnection {
    Write-Log "🔍 Testing SSH connection to RPI4b..."
    try {
        $result = ssh $RemoteUser@$RemoteHost "echo 'SSH connection successful'"
        if ($result -eq "SSH connection successful") {
            Write-Log "✅ SSH connection successful"
            return $true
        } else {
            Write-Log "❌ SSH connection failed"
            return $false
        }
    } catch {
        Write-Log "❌ SSH connection error: $_"
        return $false
    }
}

function Copy-ChatterPiFiles {
    Write-Log "📁 Copying ChatterPi files to RPI4b..."
    
    try {
        # Copy ChatterPi scripts
        scp -r scripts/chatterpi $RemoteUser@${RemoteHost}:$RemotePath/scripts/
        if ($LASTEXITCODE -eq 0) {
            Write-Log "✅ ChatterPi scripts copied"
        } else {
            Write-Log "❌ Failed to copy ChatterPi scripts"
            return $false
        }
        
        # Copy HTML files
        scp public/chatterpi-*.html $RemoteUser@${RemoteHost}:$RemotePath/public/
        if ($LASTEXITCODE -eq 0) {
            Write-Log "✅ ChatterPi HTML files copied"
        } else {
            Write-Log "❌ Failed to copy HTML files"
            return $false
        }
        
        return $true
    } catch {
        Write-Log "❌ File copy error: $_"
        return $false
    }
}

function Start-MonsterBoxApp {
    Write-Log "🚀 Starting MonsterBox main application..."
    
    try {
        # Kill existing processes
        ssh $RemoteUser@$RemoteHost "pkill -f 'node.*app.js'"
        Start-Sleep -Seconds 2
        
        # Start main app
        ssh $RemoteUser@$RemoteHost "cd $RemotePath && nohup node --no-deprecation app.js > app.log 2>&1 &"
        Start-Sleep -Seconds 5
        
        # Check if it's running
        $result = ssh $RemoteUser@$RemoteHost "ps aux | grep 'node.*app.js' | grep -v grep"
        if ($result) {
            Write-Log "✅ MonsterBox main application started"
            return $true
        } else {
            Write-Log "❌ Failed to start MonsterBox application"
            # Check log for errors
            $log = ssh $RemoteUser@$RemoteHost "cd $RemotePath && tail -10 app.log"
            Write-Log "App log: $log"
            return $false
        }
    } catch {
        Write-Log "❌ Error starting MonsterBox app: $_"
        return $false
    }
}

function Start-JawServer {
    Write-Log "🦴 Starting jaw WebSocket server..."
    
    try {
        # Kill existing jaw server
        ssh $RemoteUser@$RemoteHost "pkill -f jaw_websocket_server"
        Start-Sleep -Seconds 2
        
        # Start jaw server
        ssh $RemoteUser@$RemoteHost "cd $RemotePath/scripts/chatterpi && nohup python3 -u jaw_websocket_server.py --host 0.0.0.0 --port 8765 --servo-pin 18 > jaw_server.log 2>&1 &"
        Start-Sleep -Seconds 5
        
        # Check if it's running
        $result = ssh $RemoteUser@$RemoteHost "ps aux | grep jaw_websocket_server | grep -v grep"
        if ($result) {
            Write-Log "✅ Jaw WebSocket server started"
            return $true
        } else {
            Write-Log "❌ Failed to start jaw server"
            # Check log for errors
            $log = ssh $RemoteUser@$RemoteHost "cd $RemotePath/scripts/chatterpi && cat jaw_server.log"
            Write-Log "Jaw server log: $log"
            return $false
        }
    } catch {
        Write-Log "❌ Error starting jaw server: $_"
        return $false
    }
}

function Test-WebInterface {
    Write-Log "🌐 Testing web interface..."
    
    try {
        # Test main app
        $result = ssh $RemoteUser@$RemoteHost "curl -s -I http://localhost:3000 | head -1"
        if ($result -like "*200 OK*") {
            Write-Log "✅ Main web interface accessible"
        } else {
            Write-Log "❌ Main web interface not accessible: $result"
            return $false
        }
        
        # Test ChatterPi interface
        $result = ssh $RemoteUser@$RemoteHost "curl -s -I http://localhost:3000/chatterpi-chat.html | head -1"
        if ($result -like "*200 OK*") {
            Write-Log "✅ ChatterPi web interface accessible"
            return $true
        } else {
            Write-Log "❌ ChatterPi web interface not accessible: $result"
            return $false
        }
    } catch {
        Write-Log "❌ Error testing web interface: $_"
        return $false
    }
}

function Test-WebSocketConnection {
    Write-Log "🔌 Testing WebSocket connection..."
    
    try {
        # Create WebSocket test script
        $testScript = @"
import asyncio
import websockets
import json
import sys

async def test_websocket():
    try:
        uri = "ws://localhost:8765"
        async with websockets.connect(uri, timeout=5) as websocket:
            welcome = await asyncio.wait_for(websocket.recv(), timeout=5)
            data = json.loads(welcome)
            
            if data.get("type") == "welcome":
                print("WebSocket connection successful")
                
                command = {"type": "jaw_move", "angle": 45, "duration": 0.5}
                await websocket.send(json.dumps(command))
                
                response = await asyncio.wait_for(websocket.recv(), timeout=3)
                resp_data = json.loads(response)
                
                if resp_data.get("type") == "jaw_move_started":
                    print("Jaw movement successful")
                    return True
                else:
                    print(f"Jaw movement failed: {resp_data}")
                    return False
            else:
                print(f"Unexpected welcome: {data}")
                return False
                
    except Exception as e:
        print(f"WebSocket test failed: {e}")
        return False

if __name__ == "__main__":
    result = asyncio.run(test_websocket())
    sys.exit(0 if result else 1)
"@
        
        # Write and run test script
        ssh $RemoteUser@$RemoteHost "cd $RemotePath/scripts/chatterpi && cat > websocket_test.py << 'EOF'`n$testScript`nEOF"
        $result = ssh $RemoteUser@$RemoteHost "cd $RemotePath/scripts/chatterpi && python3 websocket_test.py"
        
        if ($result -like "*WebSocket connection successful*" -and $result -like "*Jaw movement successful*") {
            Write-Log "✅ WebSocket connection and jaw movement test passed"
            return $true
        } else {
            Write-Log "❌ WebSocket test failed: $result"
            return $false
        }
    } catch {
        Write-Log "❌ Error testing WebSocket: $_"
        return $false
    }
}

function Run-BrowserSimulation {
    Write-Log "🖥️ Running browser simulation (10 interactions)..."
    
    try {
        $browserScript = @"
import asyncio
import websockets
import json
import sys

async def simulate_browser_interactions():
    success_count = 0
    
    for i in range(10):
        try:
            print(f"Browser interaction {i+1}/10...")
            
            uri = "ws://localhost:8765"
            async with websockets.connect(uri, timeout=5) as websocket:
                await websocket.recv()  # Skip welcome
                
                subscribe_cmd = {"type": "subscribe", "events": ["jaw_movement", "jaw_stopped"]}
                await websocket.send(json.dumps(subscribe_cmd))
                await websocket.recv()  # subscription response
                
                angle = 20 + (i * 10) % 60
                jaw_cmd = {"type": "jaw_move", "angle": angle, "duration": 0.3}
                
                await websocket.send(json.dumps(jaw_cmd))
                response = await asyncio.wait_for(websocket.recv(), timeout=3)
                resp_data = json.loads(response)
                
                if resp_data.get("type") == "jaw_move_started":
                    print(f"Interaction {i+1} successful (angle: {angle}°)")
                    success_count += 1
                else:
                    print(f"Interaction {i+1} failed: {resp_data}")
                
                await asyncio.sleep(0.4)
                
        except Exception as e:
            print(f"Interaction {i+1} error: {e}")
    
    print(f"Browser simulation completed: {success_count}/10 successful")
    return success_count == 10

if __name__ == "__main__":
    result = asyncio.run(simulate_browser_interactions())
    sys.exit(0 if result else 1)
"@
        
        # Write and run browser test script
        ssh $RemoteUser@$RemoteHost "cd $RemotePath/scripts/chatterpi && cat > browser_test.py << 'EOF'`n$browserScript`nEOF"
        $result = ssh $RemoteUser@$RemoteHost "cd $RemotePath/scripts/chatterpi && timeout 60 python3 browser_test.py"
        
        if ($result -like "*Browser simulation completed: 10/10 successful*") {
            Write-Log "✅ All 10 browser interactions successful"
            return $true
        } else {
            Write-Log "❌ Browser simulation failed: $result"
            return $false
        }
    } catch {
        Write-Log "❌ Error running browser simulation: $_"
        return $false
    }
}

function Show-SystemStatus {
    Write-Log "📊 System Status:"
    
    try {
        # Show running processes
        $processes = ssh $RemoteUser@$RemoteHost "ps aux | grep -E '(node.*app|jaw_websocket)' | grep -v grep"
        Write-Log "Running processes:"
        Write-Log $processes
        
        # Show listening ports
        $ports = ssh $RemoteUser@$RemoteHost "netstat -tln | grep -E ':(3000|8765)'"
        Write-Log "Listening ports:"
        Write-Log $ports
        
        # Show access URLs
        Write-Log "🌐 Access URLs:"
        Write-Log "   Main MonsterBox: http://$RemoteHost`:3000"
        Write-Log "   ChatterPi Chat: http://$RemoteHost`:3000/chatterpi-chat.html"
        Write-Log "   ChatterPi AI Chat: http://$RemoteHost`:3000/chatterpi-ai-chat.html"
        
    } catch {
        Write-Log "❌ Error getting system status: $_"
    }
}

# Main deployment and testing
Write-Log "🎯 Starting ChatterPi deployment and testing..."
Write-Log "=" * 60

$results = @{}

# Test SSH connection
$results["ssh_connection"] = Test-SSHConnection

# Copy files
if ($results["ssh_connection"]) {
    $results["file_copy"] = Copy-ChatterPiFiles
} else {
    $results["file_copy"] = $false
}

# Start main app
if ($results["file_copy"]) {
    $results["main_app"] = Start-MonsterBoxApp
} else {
    $results["main_app"] = $false
}

# Start jaw server
if ($results["main_app"]) {
    $results["jaw_server"] = Start-JawServer
} else {
    $results["jaw_server"] = $false
}

# Test web interface
if ($results["main_app"]) {
    $results["web_interface"] = Test-WebInterface
} else {
    $results["web_interface"] = $false
}

# Test WebSocket
if ($results["jaw_server"]) {
    $results["websocket_test"] = Test-WebSocketConnection
} else {
    $results["websocket_test"] = $false
}

# Browser simulation
if ($results["websocket_test"]) {
    $results["browser_simulation"] = Run-BrowserSimulation
} else {
    $results["browser_simulation"] = $false
}

# Show system status
Show-SystemStatus

# Summary
Write-Log "=" * 60
Write-Log "🎯 DEPLOYMENT AND TEST SUMMARY"
Write-Log "=" * 60

$totalTests = $results.Count
$passedTests = ($results.Values | Where-Object { $_ -eq $true }).Count

foreach ($test in $results.GetEnumerator()) {
    $status = if ($test.Value) { "✅ PASS" } else { "❌ FAIL" }
    $testName = $test.Key -replace "_", " "
    $testName = (Get-Culture).TextInfo.ToTitleCase($testName)
    Write-Log "$testName`: $status"
}

Write-Log "-" * 60
Write-Log "Total Tests: $totalTests"
Write-Log "Passed: $passedTests"
Write-Log "Failed: $($totalTests - $passedTests)"
Write-Log "Success Rate: $([math]::Round(($passedTests/$totalTests)*100, 1))%"

if ($passedTests -eq $totalTests) {
    Write-Log "🎉 ALL TESTS PASSED! ChatterPi system is fully operational!"
    Write-Log "🌐 Access ChatterPi at: http://$RemoteHost`:3000/chatterpi-chat.html"
} else {
    Write-Log "⚠️ Some tests failed. Check the logs above for details."
}

Write-Log "=" * 60
