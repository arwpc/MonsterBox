// public/js/MediaCaptureService.js

class MediaCaptureService {
    constructor() {
        this.audioSocket = null;
        this.videoSocket = null;
        this.localAudioStream = null;
        this.localVideoStream = null;
        this.audioContext = null;
        this.audioSource = null;
        this.audioProcessor = null;
        this.mediaRecorderAudio = null;
        this.mediaRecorderVideo = null;

        this.isMicLocked = false;
        this.isVideoSource = false;

        this._connectAudioSocket();
        this._connectVideoSocket();
    }

    _connectAudioSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.audioSocket = new WebSocket(`${protocol}//${window.location.host}/audiostream`);

        this.audioSocket.onopen = () => {
            console.log('Audio WebSocket connected');
        };

        this.audioSocket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log('Audio WS Message:', message);
            if (message.type === 'micLockGranted') {
                this.isMicLocked = true;
                console.log('Microphone lock granted.');
                // Start sending audio if stream is ready
                if (this.localAudioStream) this.startSendingAudio();
            } else if (message.type === 'micLockBusy') {
                this.isMicLocked = false;
                console.warn('Microphone lock busy.');
                // Optionally notify UI
            } else if (message.type === 'micReleased') {
                this.isMicLocked = false;
                console.log('Microphone lock released by server.');
            }
        };

        this.audioSocket.onclose = () => {
            console.log('Audio WebSocket disconnected');
            this.isMicLocked = false;
        };

        this.audioSocket.onerror = (error) => {
            console.error('Audio WebSocket error:', error);
            this.isMicLocked = false;
        };
    }

    _connectVideoSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.videoSocket = new WebSocket(`${protocol}//${window.location.host}/videostream`);

        this.videoSocket.onopen = () => {
            console.log('Video WebSocket connected');
        };

        this.videoSocket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log('Video WS Message:', message);
            if (message.type === 'videoStreamSourceAccepted') {
                this.isVideoSource = true;
                console.log('Video stream source accepted.');
                // Start sending video if stream is ready
                if (this.localVideoStream) this.startSendingVideo();
            } else if (message.type === 'videoStreamSourceBusy') {
                this.isVideoSource = false;
                console.warn('Video stream source busy.');
            } else if (message.type === 'videoStreamSourceReleased') {
                this.isVideoSource = false;
                console.log('Video stream source released by server.');
            }
        };

        this.videoSocket.onclose = () => {
            console.log('Video WebSocket disconnected');
            this.isVideoSource = false;
        };

        this.videoSocket.onerror = (error) => {
            console.error('Video WebSocket error:', error);
            this.isVideoSource = false;
        };
    }

    async requestMediaPermissions(constraints = { audio: true, video: true }) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (constraints.audio) {
                this.localAudioStream = new MediaStream(stream.getAudioTracks());
                console.log('Audio permission granted.');
            }
            if (constraints.video) {
                this.localVideoStream = new MediaStream(stream.getVideoTracks());
                console.log('Video permission granted.');
            }
            return true;
        } catch (error) {
            console.error('Error accessing media devices.', error);
            return false;
        }
    }

    // --- Audio Methods ---
    requestMicLock() {
        if (this.audioSocket && this.audioSocket.readyState === WebSocket.OPEN) {
            this.audioSocket.send(JSON.stringify({ type: 'requestMic' }));
        } else {
            console.error('Audio WebSocket not connected to request mic lock.');
        }
    }

    releaseMicLock() {
        if (this.audioSocket && this.audioSocket.readyState === WebSocket.OPEN && this.isMicLocked) {
            this.audioSocket.send(JSON.stringify({ type: 'releaseMic' }));
            this.isMicLocked = false; // Optimistically update
            this.stopSendingAudio();
        } else {
            console.error('Audio WebSocket not connected or mic not locked.');
        }
    }

    startSendingAudio() {
        if (!this.localAudioStream) {
            console.error('Local audio stream not available.');
            return;
        }
        if (!this.isMicLocked) {
            console.warn('Mic not locked. Requesting lock first.');
            this.requestMicLock(); // Will start sending once lock is granted
            return;
        }
        if (this.audioSocket && this.audioSocket.readyState === WebSocket.OPEN) {
            // Using MediaRecorder for simplicity to send chunks
            // For raw PCM, you'd use AudioContext and ScriptProcessorNode/AudioWorkletNode
            this.mediaRecorderAudio = new MediaRecorder(this.localAudioStream);
            this.mediaRecorderAudio.ondataavailable = (event) => {
                if (event.data.size > 0 && this.audioSocket.readyState === WebSocket.OPEN) {
                    // Send as binary or convert to a suitable format if server expects JSON wrapped binary
                    // For now, sending as a JSON message with base64 encoded data for simplicity
                    // In a production scenario, sending raw ArrayBuffer/Blob might be more efficient
                    const reader = new FileReader();
                    reader.onload = () => {
                        const base64Data = reader.result.split(',')[1];
                        this.audioSocket.send(JSON.stringify({ type: 'audioData', data: base64Data }));
                    };
                    reader.readAsDataURL(event.data);
                }
            };
            this.mediaRecorderAudio.start(1000); // Send data every 1 second, adjust as needed
            console.log('Started sending audio data.');
        } else {
            console.error('Audio WebSocket not connected.');
        }
    }

    stopSendingAudio() {
        if (this.mediaRecorderAudio && this.mediaRecorderAudio.state !== 'inactive') {
            this.mediaRecorderAudio.stop();
            console.log('Stopped sending audio data.');
        }
    }

    // --- Video Methods ---
    requestVideoStreamSource() {
        if (this.videoSocket && this.videoSocket.readyState === WebSocket.OPEN) {
            this.videoSocket.send(JSON.stringify({ type: 'requestVideoStream' }));
        } else {
            console.error('Video WebSocket not connected to request video source.');
        }
    }

    releaseVideoStreamSource() {
        if (this.videoSocket && this.videoSocket.readyState === WebSocket.OPEN && this.isVideoSource) {
            this.videoSocket.send(JSON.stringify({ type: 'releaseVideoStream' }));
            this.isVideoSource = false; // Optimistically update
            this.stopSendingVideo();
        } else {
            console.error('Video WebSocket not connected or not the video source.');
        }
    }

    startSendingVideo(videoElementForPreview = null) {
        if (!this.localVideoStream) {
            console.error('Local video stream not available.');
            return;
        }
        if (!this.isVideoSource) {
            console.warn('Not designated video source. Requesting first.');
            this.requestVideoStreamSource(); // Will start sending once accepted
            return;
        }

        if (videoElementForPreview && videoElementForPreview instanceof HTMLVideoElement) {
            videoElementForPreview.srcObject = this.localVideoStream;
            videoElementForPreview.play();
        }

        if (this.videoSocket && this.videoSocket.readyState === WebSocket.OPEN) {
            // Using MediaRecorder for video as well for chunked data
            this.mediaRecorderVideo = new MediaRecorder(this.localVideoStream, { mimeType: 'video/webm;codecs=vp8' }); // or vp9
            this.mediaRecorderVideo.ondataavailable = (event) => {
                if (event.data.size > 0 && this.videoSocket.readyState === WebSocket.OPEN) {
                    // Send as Blob directly. Server's 'ws' library handles binary data (Buffer).
                    this.videoSocket.send(event.data);
                }
            };
            this.mediaRecorderVideo.start(200); // Send data every 200ms (5fps), adjust as needed
            console.log('Started sending video data.');
        } else {
            console.error('Video WebSocket not connected.');
        }
    }

    stopSendingVideo() {
        if (this.mediaRecorderVideo && this.mediaRecorderVideo.state !== 'inactive') {
            this.mediaRecorderVideo.stop();
            console.log('Stopped sending video data.');
        }
        if (this.localVideoStream) {
            this.localVideoStream.getTracks().forEach(track => track.stop());
            this.localVideoStream = null;
        }
    }

    // Utility to attach local video to a <video> element for preview
    attachVideoPreview(videoElement) {
        if (this.localVideoStream && videoElement instanceof HTMLVideoElement) {
            videoElement.srcObject = this.localVideoStream;
            videoElement.muted = true; // Usually good practice for local preview
            videoElement.play();
        } else if (!this.localVideoStream) {
            console.warn('Local video stream not available to attach preview.');
        } else {
            console.error('Invalid video element provided for preview.');
        }
    }

    // Stop all media and close sockets
    dispose() {
        this.stopSendingAudio();
        this.stopSendingVideo();
        if (this.localAudioStream) {
            this.localAudioStream.getTracks().forEach(track => track.stop());
        }
        if (this.localVideoStream) {
            this.localVideoStream.getTracks().forEach(track => track.stop());
        }
        if (this.audioSocket && this.audioSocket.readyState === WebSocket.OPEN) {
            this.audioSocket.close();
        }
        if (this.videoSocket && this.videoSocket.readyState === WebSocket.OPEN) {
            this.videoSocket.close();
        }
        console.log('MediaCaptureService disposed.');
    }
}

// Export if using modules, or attach to window for global access in simpler setups
// export default MediaCaptureService; // For ES6 modules
// window.MediaCaptureService = MediaCaptureService; // For global script include
