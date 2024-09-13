// File: public/js/active-mode.js

$(document).ready(function() {
    let isArmed = false;

    $('#characterSelect').change(fetchCharacterInfo);
    $('#addScenes').click(addScenes);
    $('#removeScenes').click(removeScenes);
    $('#activatedScenes').sortable().selectable();
    $('#armButton').click(armSystem);
    $('#disarmButton').click(disarmSystem);

    // Add this new test function
    function testServerConnection() {
        $.get('/scenes/test')
            .done(function(response) {
                console.log('Test route response:', response);
                logArmedModeOutput('Server test successful: ' + response.message);
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                console.error('Test route error:', textStatus, errorThrown);
                logArmedModeOutput('Server test failed: ' + textStatus);
            });
    }

    // Call the test function when the page loads
    testServerConnection();

    function fetchCharacterInfo() {
        const characterId = $(this).val();
        if (characterId) {
            $.get(`/characters/${characterId}`, displayCharacterInfo)
                .fail(handleCharacterInfoError);
            fetchScenes(characterId);
        } else {
            clearCharacterInfo();
        }
    }

    function displayCharacterInfo(character) {
        let infoHtml = '';
        if (character.image) {
            infoHtml += `<img src="/images/characters/${character.image}" alt="${character.char_name}" onerror="this.onerror=null;this.src='/images/placeholder.jpg';">`;
        }
        infoHtml += `<div><h3>${character.char_name}</h3><p>${character.char_description}</p></div>`;
        $('#characterInfo').html(infoHtml);
    }

    function handleCharacterInfoError(jqXHR, textStatus, errorThrown) {
        console.error("Error fetching character info:", textStatus, errorThrown);
        $('#characterInfo').html('<p>Failed to load character information. Please try again.</p>');
    }

    function clearCharacterInfo() {
        $('#characterInfo').empty();
        $('#availableScenes').empty();
        $('#activatedScenes').empty();
    }

    function fetchScenes(characterId) {
        $.get(`/active-mode/character/${characterId}/scenes`, displayScenes)
            .fail(handleSceneFetchError);
    }

    function displayScenes(scenes) {
        $('#availableScenes').empty();
        scenes.forEach(function(scene) {
            $('#availableScenes').append(`<option value="${scene.id}">${scene.scene_name}</option>`);
        });
    }

    function handleSceneFetchError(jqXHR, textStatus, errorThrown) {
        console.error("Error fetching scenes:", textStatus, errorThrown);
        $('#availableScenes').html('<option>Failed to load scenes</option>');
    }

    function addScenes() {
        $('#availableScenes option:selected').each(function() {
            const sceneId = $(this).val();
            const sceneName = $(this).text();
            $('#activatedScenes').append(`<li data-id="${sceneId}">${sceneName}</li>`);
            $(this).remove();
        });
    }

    function removeScenes() {
        $('#activatedScenes li.ui-selected').each(function() {
            const sceneId = $(this).data('id');
            const sceneName = $(this).text();
            $('#availableScenes').append(`<option value="${sceneId}">${sceneName}</option>`);
            $(this).remove();
        });
    }

    function armSystem() {
        if ($('#activatedScenes li').length === 0) {
            alert('Please select at least one scene to activate.');
            return;
        }
        isArmed = true;
        $(this).prop('disabled', true);
        $('#disarmButton').prop('disabled', false);
        $('#armStatus').text('ARMED').removeClass('disarmed').addClass('armed');
        logArmedModeOutput('System armed. Starting Active Mode.');
        startActiveModeLoop();
    }

    function disarmSystem() {
        isArmed = false;
        $(this).prop('disabled', true);
        $('#armButton').prop('disabled', false);
        $('#armStatus').text('DISARMED').removeClass('armed').addClass('disarmed');
        logArmedModeOutput('System disarmed. Active Mode stopped.');
    }

    function startActiveModeLoop() {
        const scenes = $('#activatedScenes li').map(function() {
            return $(this).data('id');
        }).get();

        function runNextScene(index) {
            if (!isArmed) return;
            if (index >= scenes.length) {
                index = 0; // Reset to the beginning of the list
            }
            const sceneId = scenes[index];
            logArmedModeOutput(`Starting execution of scene ${sceneId}`);
            runScene(sceneId).then(() => {
                logArmedModeOutput(`Completed execution of scene ${sceneId}`);
                setTimeout(() => runNextScene(index + 1), 5000); // 5 seconds between scenes
            }).catch((error) => {
                logArmedModeOutput(`Error executing scene ${sceneId}: ${error.message}`);
                setTimeout(() => runNextScene(index + 1), 5000); // Continue to next scene even if there's an error
            });
        }

        runNextScene(0);
    }

    function runScene(sceneId) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `/scenes/${sceneId}/execute`,
                method: 'POST',
                timeout: 60000, // 1 minute timeout
                success: function(response) {
                    processSceneExecutionResponse(response);
                    resolve();
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    handleSceneExecutionError(sceneId, jqXHR, textStatus, errorThrown);
                    reject(new Error(`Failed to execute scene ${sceneId}`));
                }
            });
        });
    }

    function handleSceneExecutionError(sceneId, jqXHR, textStatus, errorThrown) {
        console.error(`Scene ${sceneId} execution error:`, jqXHR.responseText);
        logArmedModeOutput(`Error executing scene ${sceneId}: ${jqXHR.responseJSON ? jqXHR.responseJSON.error : 'Unknown error'}`);
        logArmedModeOutput(`Error details: ${textStatus} - ${errorThrown}`);
    }

    function processSceneExecutionResponse(response) {
        console.log('Scene execution response:', response);
        if (typeof response === 'string') {
            try {
                response = JSON.parse(response);
            } catch (e) {
                logArmedModeOutput(`Error parsing response: ${response}`);
                return;
            }
        }

        if (response.success) {
            logArmedModeOutput(response.message);
            if (response.results && Array.isArray(response.results)) {
                processResults(response.results);
            } else {
                logArmedModeOutput('No results returned from scene execution.');
            }
        } else {
            logArmedModeOutput(`Error: ${response.error}`);
        }
    }

    function processResults(results, stepIndex = 1) {
        results.forEach((result) => {
            if (Array.isArray(result)) {
                // Handle concurrent steps
                logArmedModeOutput(`Step ${stepIndex} (Concurrent):`);
                processResults(result, stepIndex);
            } else {
                logArmedModeOutput(`Step ${stepIndex}:`);
                if (result.success) logArmedModeOutput(`  Success: ${result.message}`);
                if (result.stdout) logArmedModeOutput(`  Output: ${result.stdout}`);
                if (result.stderr) logArmedModeOutput(`  Error: ${result.stderr}`);
                stepIndex++;
            }
        });
    }

    function logArmedModeOutput(message) {
        const timestamp = new Date().toLocaleTimeString();
        $('#armedModeOutput').append(`<p>[${timestamp}] ${message}</p>`);
        $('#armedModeOutput').scrollTop($('#armedModeOutput')[0].scrollHeight);
        console.log(`[${timestamp}] ${message}`); // Also log to console for debugging
    }

    function logSceneDetailsOutput(message) {
        $('#sceneDetailsOutput').append(`<pre>${message}</pre>`);
        $('#sceneDetailsOutput').scrollTop($('#sceneDetailsOutput')[0].scrollHeight);
    }
});
