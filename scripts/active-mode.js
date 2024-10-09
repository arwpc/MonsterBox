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
                fetchCharacterParts(character.id);
            } else {
                console.error('Invalid character data:', character);
                $('#debugInfo').append('<p>Error: Invalid character data</p>');
            }
        } catch (error) {
            console.error('Error parsing character data:', error);
            $('#debugInfo').append(`<p>Error parsing character data: ${error.message}</p>`);
        }
    }

    function displayCharacterInfo(character) {
        console.log('Displaying character info');
        let infoHtml = `<h3>${character.char_name}</h3><p>${character.char_description}</p>`;
        $('#characterInfo').html(infoHtml);
        
        if (character.image) {
            $('#characterImage').attr('src', `/images/characters/${character.image}`).attr('alt', character.char_name);
        } else {
            $('#characterImage').attr('src', '/images/placeholder.jpg').attr('alt', 'Placeholder Image');
        }
    }

    function fetchCharacterParts(characterId) {
        console.log('Fetching character parts');
        $.get(`/active-mode/character/${characterId}/parts`, function(data) {
            displayCharacterParts(data);
        }).fail(function(jqXHR, textStatus, errorThrown) {
            console.error("Error fetching character parts:", textStatus, errorThrown);
            $('#characterParts').html('<p>Failed to load character parts information. Please try again.</p>');
            $('#debugInfo').append(`<p>Error fetching character parts: ${textStatus} - ${errorThrown}</p>`);
        });
    }

    function displayCharacterParts(parts) {
        console.log('Displaying character parts:', parts);
        let partsHtml = '<h4>Character Parts:</h4>';
        if (parts.length === 0) {
            partsHtml += '<p>No parts assigned to this character.</p>';
        } else {
            partsHtml += '<ul>';
            parts.forEach(part => {
                partsHtml += `<li>
                    <strong>${part.part_name}</strong> (${part.part_type})
                    <br>Description: ${part.part_description || 'N/A'}
                    <br>Pin: ${part.pin || 'N/A'}
                </li>`;
            });
            partsHtml += '</ul>';
        }

        $('#characterParts').html(partsHtml);
    }

    function fetchScenes(characterId) {
        console.log(`Fetching scenes for character ID: ${characterId}`);
        $.get(`/active-mode/character/${characterId}/scenes`)
            .done(function(scenes) {
                console.log(`Scenes fetched successfully:`, scenes);
                if (Array.isArray(scenes)) {
                    console.log(`Number of scenes fetched: ${scenes.length}`);
                } else {
                    console.error('Fetched scenes is not an array:', scenes);
                }
                displayScenes(scenes);
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
		console.error("Error fetching scenes:", textStatus, errorThrown);
                console.error("Response text:", jqXHR.responseText);
                handleSceneFetchError(jqXHR, textStatus, errorThrown);
            });
    }

    function displayScenes(scenes) {
        console.log(`Displaying scenes:`, scenes);
        $('#availableScenes').empty();
        if (!Array.isArray(scenes) || scenes.length === 0) {
            console.log('No scenes to display');
            $('#availableScenes').append('<option value="">No available scenes</option>');
        } else {
            scenes.forEach(function(scene) {
                console.log(`Adding scene to select: ID ${scene.id}, Name: ${scene.scene_name}`);
                $('#availableScenes').append(`<option value="${scene.id}">${scene.scene_name}</option>`);
            });
        }
        $('#sceneSelectionArea').show();
        console.log('Scene selection area should now be visible');
        console.log('Scene selection area display style:', $('#sceneSelectionArea').css('display'));
        console.log('Available scenes HTML:', $('#availableScenes').html());
    }

    function handleSceneFetchError(jqXHR, textStatus, errorThrown) {
        console.error("Error fetching scenes:", textStatus, errorThrown);
        $('#availableScenes').html('<option>Failed to load scenes</option>');
        $('#debugInfo').append(`<p>Error fetching scenes: ${textStatus} - ${errorThrown}</p>`);
    }

    function addScenes() {
        $('#availableScenes option:selected').each(function() {
            const sceneId = $(this).val();
            const sceneName = $(this).text();
            $('#activatedScenes').append(`<li data-id="${sceneId}">${sceneName}</li>`);
            $(this).remove();
        });
        updateSceneTimeline();
        updateArmButtonState();
    }

    function removeScenes() {
        $('#activatedScenes li.ui-selected').each(function() {
            const sceneId = $(this).data('id');
            const sceneName = $(this).text();
            $('#availableScenes').append(`<option value="${sceneId}">${sceneName}</option>`);
            $(this).remove();
        });
        updateSceneTimeline();
        updateArmButtonState();
    }

    function updateSceneTimeline() {
        const delay = parseInt($('#sceneDelay').val()) || 5;
        let totalTime = 0;
        const timelineHtml = $('#activatedScenes li').map(function(index) {
            const sceneName = $(this).text();
            const startTime = totalTime;
            totalTime += delay;
            return `<div class="timeline-item">
                        <strong>${sceneName}</strong><br>
                        Start: ${formatTime(startTime)}, End: ${formatTime(totalTime)}
                    </div>`;
        }).get().join('');
        
        $('#sceneTimeline').html(timelineHtml);
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    function updateArmButtonState() {
        const hasActivatedScenes = $('#activatedScenes li').length > 0;
        $('#armButton').prop('disabled', !hasActivatedScenes);
    }

    function confirmArmSystem() {
        if ($('#activatedScenes li').length === 0) {
            alert('Please select at least one scene to activate.');
            return;
        }
        if (confirm('Are you sure you want to arm the system and start executing scenes?')) {
            armSystem();
        }
    }

    function armSystem() {
        isArmed = true;
        $('#armButton').prop('disabled', true);
        $('#disarmButton').prop('disabled', false);
        $('#armStatus').text('ARMED').removeClass('disarmed').addClass('armed');
        logArmedModeOutput('System armed. Starting Active Mode.');
        startActiveModeLoop();
    }

    function confirmDisarmSystem() {
        if (confirm('Are you sure you want to disarm the system and stop executing scenes?')) {
            disarmSystem();
        }
    }

    function disarmSystem() {
        isArmed = false;
        $('#armButton').prop('disabled', false);
        $('#disarmButton').prop('disabled', true);
        $('#armStatus').text('DISARMED').removeClass('armed').addClass('disarmed');
        logArmedModeOutput('System disarmed. Active Mode stopped.');
        stopAllSteps();
    }

    function stopAllSteps() {
        if (currentSceneId) {
            $.post(`/scenes/${currentSceneId}/stop`)
                .done(function(response) {
                    logArmedModeOutput('All steps stopped: ' + response.message);
                })
                .fail(function(xhr, status, error) {
                    console.error('Error stopping all steps:', error);
                    logArmedModeOutput('Error stopping all steps: ' + error);
                });
        }
        currentSceneId = null;
    }

    function startActiveModeLoop() {
        const scenes = $('#activatedScenes li').map(function() {
            return $(this).data('id');
        }).get();
        const delay = parseInt($('#sceneDelay').val()) * 1000 || 5000;

        function runNextScene(index) {
            if (!isArmed) return;
            if (index >= scenes.length) {
                index = 0; // Reset to the beginning of the list
            }
            const sceneId = scenes[index];
            logArmedModeOutput(`Starting execution of scene ${sceneId}`);
            runScene(sceneId).then(() => {
                logArmedModeOutput(`Completed execution of scene ${sceneId}`);
                retryCount = 0; // Reset retry count on successful execution
                setTimeout(() => runNextScene(index + 1), delay);
            }).catch((error) => {
                logArmedModeOutput(`Error executing scene ${sceneId}: ${error.message}`);
                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    logArmedModeOutput(`Retrying scene ${sceneId} (Attempt ${retryCount} of ${MAX_RETRIES})`);
                    setTimeout(() => runNextScene(index), delay);
                } else {
                    retryCount = 0; // Reset retry count
                    logArmedModeOutput(`Max retries reached for scene ${sceneId}. Moving to next scene.`);
                    setTimeout(() => runNextScene(index + 1), delay);
                }
            });
        }

        runNextScene(0);
    }

    function runScene(sceneId) {
        return new Promise((resolve, reject) => {
            console.log(`Starting execution of scene ${sceneId}`);
            $.post(`/scenes/${sceneId}/play`)
                .done(function(response) {
                    console.log(`Scene ${sceneId} execution started:`, response);
                    if (response.message === 'Scene execution started') {
                        currentSceneId = sceneId;
                        pollSceneStatus(sceneId, resolve, reject);
                    } else {
                        reject(new Error(`Unexpected response: ${JSON.stringify(response)}`));
                    }
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
});