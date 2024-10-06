// File: scripts/active-mode.js

$(document).ready(function() {
    console.log('Document ready');

    let isArmed = false;
    let currentEventSource = null;
    let retryCount = 0;
    const MAX_RETRIES = 3;

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

    function fetchPartsAndSounds(characterId) {
        console.log('Fetching parts and sounds');
        $.get(`/active-mode/character/${characterId}/parts-and-sounds`, function(data) {
            displayPartsAndSounds(data);
        }).fail(function(jqXHR, textStatus, errorThrown) {
            console.error("Error fetching parts and sounds:", textStatus, errorThrown);
            $('#partsAndSounds').html('<p>Failed to load parts and sounds information. Please try again.</p>');
            $('#debugInfo').append(`<p>Error fetching parts and sounds: ${textStatus} - ${errorThrown}</p>`);
        });
    }

    function displayPartsAndSounds(data) {
        console.log('Displaying parts and sounds');
        let partsHtml = '<h4>Parts:</h4><ul>';
        data.parts.forEach(part => {
            partsHtml += `<li>${part.part_name} (${part.part_type})</li>`;
        });
        partsHtml += '</ul>';

        let soundsHtml = '<h4>Sounds:</h4><ul>';
        data.sounds.forEach(sound => {
            soundsHtml += `<li>${sound.sound_name}</li>`;
        });
        soundsHtml += '</ul>';

        $('#partsAndSounds').html(partsHtml + soundsHtml);
    }

    function fetchScenes(characterId) {
        console.log(`Fetching scenes for character ID: ${characterId}`);
        $.get(`/active-mode/character/${characterId}/scenes`)
            .done(function(scenes) {
                console.log(`Scenes fetched successfully:`, scenes);
                displayScenes(scenes);
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                console.error("Error fetching scenes:", textStatus, errorThrown);
                handleSceneFetchError(jqXHR, textStatus, errorThrown);
            });
    }

    function displayScenes(scenes) {
        console.log(`Displaying ${scenes.length} scenes`);
        $('#availableScenes').empty();
        if (scenes.length === 0) {
            $('#availableScenes').append('<option value="">No available scenes</option>');
        } else {
            scenes.forEach(function(scene) {
                $('#availableScenes').append(`<option value="${scene.id}">${scene.scene_name}</option>`);
            });
        }
        console.log('Scene selection area should now be populated');
        console.log('Available scenes:', $('#availableScenes').html());
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
        if (currentEventSource) {
            currentEventSource.close();
        }
        $.post('/scenes/stop-all')
            .done(function(response) {
                logArmedModeOutput('All steps stopped: ' + response.message);
            })
            .fail(function(xhr, status, error) {
                console.error('Error stopping all steps:', error);
                logArmedModeOutput('Error stopping all steps: ' + error);
            });
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
            if (currentEventSource) {
                currentEventSource.close();
            }
            const url = `/scenes/${sceneId}/play`;
            console.log(`Connecting to EventSource: ${url}`);
            currentEventSource = new EventSource(url);

            currentEventSource.onopen = function(event) {
                console.log('EventSource connection opened:', event);
            };

            currentEventSource.onmessage = function(event) {
                console.log('Received message:', event.data);
                try {
                    const data = JSON.parse(event.data);
                    handleSceneExecutionUpdate(data);
                } catch (error) {
                    console.error('Error parsing EventSource message:', error);
                }
            };

            currentEventSource.onerror = function(error) {
                console.error('EventSource error:', error);
                currentEventSource.close();
                reject(new Error(`Failed to execute scene ${sceneId}: ${error.message}`));
            };

            currentEventSource.addEventListener('scene_end', function(event) {
                console.log('Received scene_end event:', event);
                currentEventSource.close();
                resolve();
            });

            // Add a timeout to prevent hanging if the server doesn't respond
            setTimeout(() => {
                if (currentEventSource.readyState !== EventSource.CLOSED) {
                    console.log('EventSource timed out, closing connection');
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

    function logArmedModeOutput(message) {
        const timestamp = new Date().toLocaleTimeString();
        $('#armedModeOutput').append(`<p>[${timestamp}] ${message}</p>`);
        $('#armedModeOutput').scrollTop($('#armedModeOutput')[0].scrollHeight);
    }
});