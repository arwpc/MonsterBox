#!/usr/bin/env node
/**
 * Simple webcam streaming server for MonsterBox
 * Serves webcam stream directly without complex routing
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const port = 3000;

let streamProcess = null;

// Serve static files
app.use(express.static('public'));

// Basic test endpoint
app.get('/test', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Simple webcam server is running',
        timestamp: new Date().toISOString()
    });
});

// Simple webcam stream endpoint
app.get('/webcam/stream', (req, res) => {
    console.log('📹 New webcam stream request');
    
    try {
        // Kill any existing stream
        if (streamProcess && !streamProcess.killed) {
            streamProcess.kill();
        }
        
        // Start new stream process
        const scriptPath = path.join(__dirname, 'scripts', 'webcam_persistent_stream.py');
        streamProcess = spawn('python3', [
            scriptPath,
            '--device-id', '0',
            '--width', '640',
            '--height', '480',
            '--fps', '15',
            '--quality', '85',
            '--persistent'
        ]);
        
        // Set response headers for MJPEG stream
        res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        console.log('✅ Stream headers set, piping data...');
        
        // Pipe stream data to response
        streamProcess.stdout.pipe(res, { end: false });
        
        // Handle stream errors
        streamProcess.stderr.on('data', (data) => {
            console.error('Stream error:', data.toString());
        });
        
        streamProcess.on('close', (code) => {
            console.log(`Stream process closed with code ${code}`);
            if (!res.headersSent) {
                res.status(500).send('Stream ended');
            }
        });
        
        streamProcess.on('error', (error) => {
            console.error('Stream process error:', error);
            if (!res.headersSent) {
                res.status(500).send('Stream error');
            }
        });
        
        // Handle client disconnect
        res.on('close', () => {
            console.log('📱 Client disconnected');
            if (streamProcess && !streamProcess.killed) {
                streamProcess.kill();
            }
        });
        
    } catch (error) {
        console.error('Error starting stream:', error);
        res.status(500).send('Failed to start stream: ' + error.message);
    }
});

// Webcam test endpoint
app.get('/webcam/test', (req, res) => {
    console.log('🧪 Testing webcam...');
    
    const testScript = spawn('python3', ['-c', `
import cv2
try:
    cap = cv2.VideoCapture(0, cv2.CAP_V4L2)
    if cap.isOpened():
        ret, frame = cap.read()
        cap.release()
        if ret and frame is not None:
            print("SUCCESS: Camera working - Frame shape:", frame.shape)
        else:
            print("FAIL: Could not capture frame")
    else:
        print("FAIL: Could not open camera")
except Exception as e:
    print("ERROR:", str(e))
`]);
    
    let output = '';
    testScript.stdout.on('data', (data) => {
        output += data.toString();
    });
    
    testScript.stderr.on('data', (data) => {
        output += data.toString();
    });
    
    testScript.on('close', (code) => {
        res.json({
            success: code === 0 && output.includes('SUCCESS'),
            output: output.trim(),
            code: code
        });
    });
});

// Simple HTML page for viewing the stream
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>MonsterBox Webcam Stream</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #1a1a1a; color: white; }
        .container { max-width: 800px; margin: 0 auto; }
        .stream-container { text-align: center; margin: 20px 0; }
        img { max-width: 100%; border: 2px solid #333; border-radius: 8px; }
        .controls { margin: 20px 0; }
        button { padding: 10px 20px; margin: 5px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
        .status { padding: 10px; margin: 10px 0; border-radius: 4px; }
        .success { background: #28a745; }
        .error { background: #dc3545; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎭 MonsterBox Webcam Stream</h1>
        <div class="controls">
            <button onclick="testCamera()">Test Camera</button>
            <button onclick="refreshStream()">Refresh Stream</button>
        </div>
        <div id="status"></div>
        <div class="stream-container">
            <h2>Live Stream:</h2>
            <img id="stream" src="/webcam/stream" alt="Webcam Stream" />
        </div>
    </div>
    
    <script>
        function testCamera() {
            document.getElementById('status').innerHTML = '<div class="status">Testing camera...</div>';
            fetch('/webcam/test')
                .then(response => response.json())
                .then(data => {
                    const statusClass = data.success ? 'success' : 'error';
                    document.getElementById('status').innerHTML = 
                        '<div class="status ' + statusClass + '">' + data.output + '</div>';
                })
                .catch(error => {
                    document.getElementById('status').innerHTML = 
                        '<div class="status error">Test failed: ' + error.message + '</div>';
                });
        }
        
        function refreshStream() {
            const img = document.getElementById('stream');
            img.src = '/webcam/stream?' + new Date().getTime();
        }
        
        // Auto-refresh stream every 30 seconds
        setInterval(refreshStream, 30000);
    </script>
</body>
</html>
    `);
});

// Start server
app.listen(port, () => {
    console.log(`🎥 Simple Webcam Server running on port ${port}`);
    console.log(`📱 View stream at: http://localhost:${port}/`);
    console.log(`🎬 Direct stream: http://localhost:${port}/webcam/stream`);
    console.log(`🧪 Test camera: http://localhost:${port}/webcam/test`);
});

// Cleanup on exit
process.on('SIGINT', () => {
    console.log('Shutting down...');
    if (streamProcess && !streamProcess.killed) {
        streamProcess.kill();
    }
    process.exit(0);
});
