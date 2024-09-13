// File: public/js/active-mode.js

$(document).ready(function() {
    let isArmed = false;

    $('#characterSelect').change(fetchCharacterInfo);
    $('#addScenes').click(addScenes);
    $('#removeScenes').click(removeScenes);
    $('#activatedScenes').sortable().selectable();
    $('#armButton').click(armSystem);
    $('#disarmButton').click(disarmSystem);

    // ... (keep all existing functions up to runScene)

    function runScene(sceneId) {
        return new Promise((resolve, reject) => {
            const eventSource = new EventSource(`/scenes/${sceneId}/execute`);

            eventSource.onmessage = function(event) {
                const data = JSON.parse(event.data);
                handleSceneExecutionUpdate(data);
            };

            eventSource.onerror = function(error) {
                console.error('EventSource failed:', error);
                eventSource.close();
                reject(new Error(`Failed to execute scene ${sceneId}`));
            };

            eventSource.addEventListener('close', function(event) {
                eventSource.close();
                resolve();
            });
        });
    }

    function handleSceneExecutionUpdate(data) {
        if (data.error) {
            logArmedModeOutput(`Error: ${data.error}`);
            logSceneDetailsOutput(`Error: ${data.error}`);
        } else if (data.message) {
            logArmedModeOutput(data.message);
            logSceneDetailsOutput(data.message);

            if (data.step) {
                logSceneDetailsOutput(`Step details: ${JSON.stringify(data.step, null, 2)}`);
            }

            if (data.result) {
                logSceneDetailsOutput(`Step result: ${JSON.stringify(data.result, null, 2)}`);
            }

            if (data.results) {
                logSceneDetailsOutput(`Results: ${JSON.stringify(data.results, null, 2)}`);
            }
        }
    }

    // ... (keep all existing functions after runScene)

    function logArmedModeOutput(message) {
        const timestamp = new Date().toLocaleTimeString();
        $('#armedModeOutput').append(`<p>[${timestamp}] ${message}</p>`);
        $('#armedModeOutput').scrollTop($('#armedModeOutput')[0].scrollHeight);
        console.log(`[${timestamp}] ${message}`); // Also log to console for debugging
    }

    function logSceneDetailsOutput(message) {
        const timestamp = new Date().toLocaleTimeString();
        $('#sceneDetailsOutput').append(`<pre>[${timestamp}] ${message}</pre>`);
        $('#sceneDetailsOutput').scrollTop($('#sceneDetailsOutput')[0].scrollHeight);
    }
});
