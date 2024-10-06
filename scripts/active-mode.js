// File: scripts/active-mode.js

$(document).ready(function() {
    console.log('Document ready');

    let isArmed = false;
    let currentSceneId = null;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const POLLING_INTERVAL = 1000; // 1 second

    $('#addScenes').click(addScenes);
    $('#removeScenes').click(removeScenes);
    $('#activatedScenes').sortable({
        update: updateSceneTimeline
    }).selectable();
    $('#armButton').click(confirmArmSystem);
    $('#disarmButton').click(confirmDisarmSystem);
    $('#stopAllSteps').click(stopAllSteps);
    $('#sceneDelay').on('input', updateSceneTimeline);

    // Show scene selection area by default
    $('#sceneSelectionArea').show();

    // Load character information on page load
    loadCharacterInfo();

    function loadCharacterInfo() {
        console.log('Loading character info');
        try {
            const characterData = $('#characterData').text();
            console.log('Character data from hidden element:', characterData);
            const character = JSON.parse(characterData);
            console.log('Parsed character data:', character);
            if (character && character.id) {
                displayCharacterInfo(character);
                fetchScenes(character.id);
                fetchPartsAndSounds(character.id);
            } else {
                console.error('Invalid character data:', character);
                $('#debugInfo').append('<p>Error: Invalid character data</p>');
            }
        } catch (error) {
            console.error('Error parsing character data:', error);
            $('#debugInfo').append(`<p>Error parsing character data: ${error.message}</p>`);
        }
    }

    // ... other functions remain unchanged ...

    function runScene(sceneId) {
        return new Promise((resolve, reject) => {
            console.log(`Starting execution of scene ${sceneId}`);
            $.post(`/scenes/${sceneId}/play`)
                .done(function(response) {
                    console.log(`Scene ${sceneId} execution started:`, response);
                    currentSceneId = sceneId;
                    pollSceneStatus(sceneId, resolve, reject);
                })
                .fail(function(jqXHR, textStatus, errorThrown) {
                    console.error(`Failed to start scene ${sceneId}:`, textStatus, errorThrown);
                    reject(new Error(`Failed to start scene ${sceneId}: ${errorThrown}`));
                });
        });
    }

    function pollSceneStatus(sceneId, resolve, reject) {
        if (currentSceneId !== sceneId) {
            console.log(`Polling stopped for scene ${sceneId}`);
            return;
        }

        $.get(`/scenes/${sceneId}/status`)
            .done(function(status) {
                console.log(`Scene ${sceneId} status:`, status);
                
                // Process any new messages
                if (status.messages && status.messages.length > 0) {
                    status.messages.forEach(message => logArmedModeOutput(message));
                }

                // Check for errors
                if (status.error) {
                    console.error(`Error in scene ${sceneId}:`, status.error);
                    logArmedModeOutput(`Error: ${status.error}`);
                    reject(new Error(status.error));
                    return;
                }

                // Check if the scene is completed
                if (status.isCompleted) {
                    console.log(`Scene ${sceneId} completed`);
                    resolve();
                    return;
                }

                // Continue polling
                setTimeout(() => pollSceneStatus(sceneId, resolve, reject), POLLING_INTERVAL);
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                console.error(`Failed to get status for scene ${sceneId}:`, textStatus, errorThrown);
                logArmedModeOutput(`Error getting scene status: ${errorThrown}`);
                reject(new Error(`Failed to get status for scene ${sceneId}: ${errorThrown}`));
            });
    }

    function logArmedModeOutput(message) {
        const timestamp = new Date().toLocaleTimeString();
        $('#armedModeOutput').append(`<p>[${timestamp}] ${message}</p>`);
        $('#armedModeOutput').scrollTop($('#armedModeOutput')[0].scrollHeight);
    }

    // ... rest of the code remains unchanged ...
});