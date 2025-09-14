// File: scripts/scene-player.js

function clientLog(level, message) {
    axios.post('/log', { level: level, message: message })
        .catch(function(error) {
            // Use clientLog instead of console.error
            clientLog('error', 'Failed to log to server: ' + error.message);
        });
}

function logToServer(message, level = 'info') {
    clientLog(level, message);
}

logToServer("Scene player script loaded");

document.addEventListener('DOMContentLoaded', function() {
    logToServer("DOM content loaded");
    let currentStep = 0;
    let eventSource = null;
    const steps = sceneData.steps || [];

    logToServer("Total steps: " + steps.length);

    function logMessage(message, isError = false) {
        const logBox = document.getElementById("log-box");
        const className = isError ? 'error-message' : '';
        const logEntry = document.createElement('p');
        logEntry.className = className;
        logEntry.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
        logBox.appendChild(logEntry);
        logBox.scrollTop = logBox.scrollHeight;
        logToServer(message, isError ? 'error' : 'info');
    }

    function updateCurrentStep(index) {
        logToServer("Updating current step to: " + index);
        document.querySelectorAll(".step").forEach(el => el.classList.remove("current-step"));
        if (index >= 0 && index < steps.length) {
            document.getElementById(`step-${index}`).classList.add("current-step");
        }
    }

    document.getElementById("backward-btn").addEventListener("click", function() {
        logToServer("Backward button clicked");
        if (currentStep > 0) {
            currentStep--;
            logMessage(`Moved to step ${currentStep + 1}: ${steps[currentStep].name}`);
            updateCurrentStep(currentStep);
        } else {
            logMessage("Already at the beginning of the scene");
        }
    });

    document.getElementById("forward-btn").addEventListener("click", function() {
        logToServer("Forward button clicked");
        if (currentStep < steps.length - 1) {
            currentStep++;
            logMessage(`Moved to step ${currentStep + 1}: ${steps[currentStep].name}`);
            updateCurrentStep(currentStep);
        } else {
            logMessage("Reached the end of the scene");
        }
    });

    document.getElementById("run-btn").addEventListener("click", function() {
        logToServer("Run button clicked");
        this.disabled = true;
        document.getElementById("backward-btn").disabled = true;
        document.getElementById("forward-btn").disabled = true;
        document.getElementById("stop-btn").disabled = false;
        logMessage(`Running scene from step ${currentStep + 1}`);
        runScene();
    });

    document.getElementById("stop-btn").addEventListener("click", function() {
        logToServer("Stop button clicked");
        stopAllSteps();
    });

    function runScene() {
        logToServer("Running scene");
        if (eventSource) {
            eventSource.close();
        }

        const url = `/scenes/${sceneData.id}/play?characterId=${characterId}&startStep=${currentStep}`;
        logToServer("EventSource URL: " + url);
        eventSource = new EventSource(url);

        eventSource.onmessage = function(event) {
            logToServer("Received message: " + event.data);
            try {
                const data = JSON.parse(event.data);
                if (data.message) {
                    logMessage(data.message);
                }
                if (data.currentStep !== undefined) {
                    currentStep = data.currentStep;
                    updateCurrentStep(currentStep);
                }
                if (data.error) {
                    logMessage(`Error: ${data.error}`, true);
                    eventSource.close();
                    resetControlButtons();
                }
                if (data.event === 'scene_end') {
                    logMessage("Scene execution completed");
                    eventSource.close();
                    resetControlButtons();
                }
            } catch (error) {
                logToServer('Error parsing event data: ' + error.message, 'error');
                logMessage(`Error parsing event data: ${error.message}`, true);
            }
        };

        eventSource.onerror = function(error) {
            logToServer('EventSource error: ' + error, 'error');
            if (eventSource.readyState === EventSource.CLOSED) {
                logMessage("Scene execution ended", true);
            } else {
                logMessage(`EventSource error: ${error.message || 'Unknown error'}`, true);
            }
            eventSource.close();
            resetControlButtons();
        };
    }

    function stopAllSteps() {
        logToServer("Stopping all steps");
        if (eventSource) {
            eventSource.close();
        }

        axios.post(`/scenes/${sceneData.id}/stop?characterId=${characterId}`)
            .then(function(response) {
                logToServer("Stop request successful: " + JSON.stringify(response.data));
                logMessage("All steps stopped");
                resetControlButtons();
            })
            .catch(function(error) {
                logToServer('Error stopping steps: ' + error.message, 'error');
                logMessage(`Error stopping steps: ${error.message}`, true);
                resetControlButtons();
            });
    }

    function resetControlButtons() {
        logToServer("Resetting control buttons");
        document.getElementById("run-btn").disabled = false;
        document.getElementById("backward-btn").disabled = false;
        document.getElementById("forward-btn").disabled = false;
        document.getElementById("stop-btn").disabled = true;
    }

    // Initial scene overview
    logMessage(`Scene Overview: "${sceneData.scene_name}"`);
    logMessage(`Total steps: ${steps.length}`);
    steps.forEach((step, index) => {
        logMessage(`Step ${index + 1}: ${step.name} (Type: ${step.type}${step.concurrent ? ', Concurrent' : ''})`);
    });

    // Disable stop button initially
    document.getElementById("stop-btn").disabled = true;

    logToServer("Scene player initialization complete");
});
