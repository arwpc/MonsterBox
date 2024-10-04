// File: scripts/scene-player.js

$(document).ready(function() {
    let currentStep = 0;
    let eventSource = null;
    const steps = sceneData.steps || [];

    function logMessage(message, isError = false) {
        const logBox = $("#log-box");
        const className = isError ? 'error-message' : '';
        logBox.append(`<p class="${className}">${new Date().toLocaleTimeString()} - ${message}</p>`);
        logBox.scrollTop(logBox[0].scrollHeight);
        console.log(message);
    }

    function updateCurrentStep(index) {
        $(".step").removeClass("current-step");
        if (index >= 0 && index < steps.length) {
            $(`#step-${index}`).addClass("current-step");
        }
    }

    $("#backward-btn").click(function() {
        if (currentStep > 0) {
            currentStep--;
            logMessage(`Moved to step ${currentStep + 1}: ${steps[currentStep].name}`);
            updateCurrentStep(currentStep);
        } else {
            logMessage("Already at the beginning of the scene");
        }
    });

    $("#forward-btn").click(function() {
        if (currentStep < steps.length - 1) {
            currentStep++;
            logMessage(`Moved to step ${currentStep + 1}: ${steps[currentStep].name}`);
            updateCurrentStep(currentStep);
        } else {
            logMessage("Reached the end of the scene");
        }
    });

    $("#run-btn").click(function() {
        $(this).prop('disabled', true);
        $("#backward-btn").prop('disabled', true);
        $("#forward-btn").prop('disabled', true);
        $("#stop-btn").prop('disabled', false);
        logMessage(`Running scene from step ${currentStep + 1}`);
        runScene();
    });

    $("#stop-btn").click(function() {
        stopAllSteps();
    });

    function runScene() {
        if (eventSource) {
            eventSource.close();
        }

        eventSource = new EventSource(`/scenes/${sceneData.id}/play?characterId=${characterId}&startStep=${currentStep}`);

        eventSource.onmessage = function(event) {
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
                }
            } catch (error) {
                console.error('Error parsing event data:', error);
                logMessage(`Error parsing event data: ${error.message}`, true);
            }
        };

        eventSource.onerror = function(error) {
            console.error('EventSource failed:', error);
            logMessage(`EventSource error: ${error.message || 'Unknown error'}`, true);
            eventSource.close();
            resetControlButtons();
        };

        eventSource.addEventListener('close', function(event) {
            eventSource.close();
            resetControlButtons();
            logMessage("Scene execution completed");
        });
    }

    function stopAllSteps() {
        if (eventSource) {
            eventSource.close();
        }

        $.ajax({
            url: `/scenes/${sceneData.id}/stop?characterId=${characterId}`,
            method: 'POST',
            success: function(response) {
                logMessage("All steps stopped");
                resetControlButtons();
            },
            error: function(xhr, status, error) {
                console.error('Error stopping steps:', error);
                logMessage(`Error stopping steps: ${error}`, true);
                resetControlButtons();
            }
        });
    }

    function resetControlButtons() {
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
});
