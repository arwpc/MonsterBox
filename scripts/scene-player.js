// File: scripts/scene-player.js

function logToServer(message) {
    $.post('/log', { message: message })
        .fail(function(xhr, status, error) {
            console.error('Failed to log to server:', error);
        });
}

logToServer("Scene player script loaded");

$(document).ready(function() {
    logToServer("jQuery document ready function executing");
    let currentStep = 0;
    let eventSource = null;
    const steps = sceneData.steps || [];

    logToServer("Total steps: " + steps.length);

    function logMessage(message, isError = false) {
        const logBox = $("#log-box");
        const className = isError ? 'error-message' : '';
        logBox.append(`<p class="${className}">${new Date().toLocaleTimeString()} - ${message}</p>`);
        logBox.scrollTop(logBox[0].scrollHeight);
        logToServer(message);
    }

    function updateCurrentStep(index) {
        logToServer("Updating current step to: " + index);
        $(".step").removeClass("current-step");
        if (index >= 0 && index < steps.length) {
            $(`#step-${index}`).addClass("current-step");
        }
    }

    $("#backward-btn").on("click", function() {
        logToServer("Backward button clicked");
        if (currentStep > 0) {
            currentStep--;
            logMessage(`Moved to step ${currentStep + 1}: ${steps[currentStep].name}`);
            updateCurrentStep(currentStep);
        } else {
            logMessage("Already at the beginning of the scene");
        }
    });

    $("#forward-btn").on("click", function() {
        logToServer("Forward button clicked");
        if (currentStep < steps.length - 1) {
            currentStep++;
            logMessage(`Moved to step ${currentStep + 1}: ${steps[currentStep].name}`);
            updateCurrentStep(currentStep);
        } else {
            logMessage("Reached the end of the scene");
        }
    });

    $("#run-btn").on("click", function() {
        logToServer("Run button clicked");
        $(this).prop('disabled', true);
        $("#backward-btn").prop('disabled', true);
        $("#forward-btn").prop('disabled', true);
        $("#stop-btn").prop('disabled', false);
        logMessage(`Running scene from step ${currentStep + 1}`);
        runScene();
    });

    $("#stop-btn").on("click", function() {
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
                logToServer('Error parsing event data: ' + error.message);
                logMessage(`Error parsing event data: ${error.message}`, true);
            }
        };

        eventSource.onerror = function(error) {
            logToServer('EventSource error: ' + error);
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

        $.ajax({
            url: `/scenes/${sceneData.id}/stop?characterId=${characterId}`,
            method: 'POST',
            success: function(response) {
                logToServer("Stop request successful: " + JSON.stringify(response));
                logMessage("All steps stopped");
                resetControlButtons();
            },
            error: function(xhr, status, error) {
                logToServer('Error stopping steps: ' + error);
                logMessage(`Error stopping steps: ${error}`, true);
                resetControlButtons();
            }
        });
    }

    function resetControlButtons() {
        logToServer("Resetting control buttons");
        $("#run-btn").prop('disabled', false);
        $("#backward-btn").prop('disabled', false);
        $("#forward-btn").prop('disabled', false);
        $("#stop-btn").prop('disabled', true);
    }

    // Initial scene overview
    logMessage(`Scene Overview: "${sceneData.scene_name}"`);
    logMessage(`Total steps: ${steps.length}`);
    steps.forEach((step, index) => {
        logMessage(`Step ${index + 1}: ${step.name} (Type: ${step.type}${step.concurrent ? ', Concurrent' : ''})`);
    });

    // Disable stop button initially
    $("#stop-btn").prop('disabled', true);

    logToServer("Scene player initialization complete");
});