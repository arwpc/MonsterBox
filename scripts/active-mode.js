// File: scripts/active-mode.js

// ... (keep all existing code up to the runScene function)

function runScene(sceneId) {
    return new Promise((resolve, reject) => {
        if (currentEventSource) {
            currentEventSource.close();
        }
        currentEventSource = new EventSource(`/scenes/${sceneId}/play`);

        currentEventSource.onopen = function(event) {
            console.log('EventSource connection opened');
        };

        currentEventSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                handleSceneExecutionUpdate(data);
            } catch (error) {
                console.error('Error parsing EventSource message:', error);
            }
        };

        currentEventSource.onerror = function(error) {
            console.error('EventSource failed:', error);
            currentEventSource.close();
            reject(new Error(`Failed to execute scene ${sceneId}`));
        };

        currentEventSource.addEventListener('scene_end', function(event) {
            console.log('Scene execution completed');
            currentEventSource.close();
            resolve();
        });

        // Add a timeout to prevent hanging if the server doesn't respond
        setTimeout(() => {
            if (currentEventSource.readyState !== EventSource.CLOSED) {
                currentEventSource.close();
                reject(new Error(`Timeout while executing scene ${sceneId}`));
            }
        }, 60000); // 60 second timeout
    });
}

function handleSceneExecutionUpdate(data) {
    if (data.error) {
        logArmedModeOutput(`Error: ${data.error}`);
    } else if (data.message) {
        logArmedModeOutput(data.message);
    }
}

// ... (keep all existing code after the runScene function)