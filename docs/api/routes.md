# MonsterBox API Routes

Auto-generated route documentation.

## /aiSettingsRoutes.js

| Method | Path |
|--------|------|
| GET | / |
| GET | /stt |
| GET | /agents |
| GET | /tts |
| GET | /api/settings |
| POST | /test-connection |
| GET | /api/status |

## /api/audioLoopRoutes.js

| Method | Path |
|--------|------|
| POST | /start |
| POST | /stop |
| POST | /stop-all |
| GET | /status |
| GET | /status/:characterId |

## /api/characterImagesRoutes.js

| Method | Path |
|--------|------|
| GET | /characters/:id/images |
| POST | /characters/:id/images/upload |
| POST | /characters/:id/images/active |
| GET | /characters/:id/images/:filename |
| DELETE | /characters/:id/images/:filename |

## /api/configRoutes.js

| Method | Path |
|--------|------|
| POST | /theme |
| GET | / |

## /api/elevenLabsApiRoutes.js

| Method | Path |
|--------|------|
| GET | /status |
| POST | /test-connection |
| GET | /stt/capabilities |
| POST | /stt/transcribe |
| POST | /stt/listen/start |
| POST | /stt/listen/stop |
| GET | /stt/listen/status |
| POST | /stt/testSample |
| GET | /agents |
| GET | /agents/:id |
| POST | /agents |
| PATCH | /agents/:id |
| DELETE | /agents/:id |
| GET | /models |
| GET | /voices |
| GET | /voices/:id |
| POST | /tts/generate |
| GET | /tts/models |
| GET | /stt/config |
| POST | /stt/config |
| GET | /stt/presets |
| GET | /stt/presets/:presetId |
| POST | /stt/presets/:presetId/apply |
| GET | /tts/config |
| POST | /tts/config |
| POST | /voices/clone |
| POST | /conversation/test |
| POST | /conversation |
| POST | /conversation/play |
| POST | /play-audio |
| POST | /generate-and-play |
| POST | /agent-speak |

## /api/orchestrationRoutes.js

| Method | Path |
|--------|------|
| GET | /status |
| POST | /health-check |
| POST | /broadcast/animatronics |
| POST | /broadcast/goblins |
| POST | /broadcast/all |
| POST | /reboot/animatronics |
| POST | /reboot/goblins |
| POST | /restart-services |
| POST | /say-all |
| POST | /enable-random-poses |
| POST | /disable-random-poses |
| POST | /update-config |
| POST | /deploy-code |
| POST | /start-all-queue-loops |
| POST | /animatronic/:id/auto-ai/start |
| POST | /animatronic/:id/auto-ai/stop |
| GET | /animatronic/:id/auto-ai/status |
| GET | /auto-ai/status |
| POST | /auto-ai/stop-all |
| GET | /animatronic/:id/webcam-stream |
| GET | /animatronic/:id/audio-files |
| GET | /animatronic/:id/webcam-url |
| POST | /animatronic/:id/say |
| POST | /animatronic/:id/ask-ai |
| POST | /animatronic/:id/play-audio |
| POST | /animatronic/:id/stop-audio |

## /api/partsApi.js

| Method | Path |
|--------|------|
| GET | /parts |
| GET | /parts/:id |
| POST | /parts/:id/test |
| PUT | /parts/:id |

## /api/randomPoseRoutes.js

| Method | Path |
|--------|------|
| GET | /settings |
| GET | /config |
| POST | /config |
| POST | /enable |
| POST | /disable |
| POST | /trigger |
| POST | /ensure-defaults |

## /api/sceneEditorApi.js

| Method | Path |
|--------|------|
| GET | /parts |
| GET | /poses |
| GET | /sounds |
| GET | /goblins |

## /api/systemRoutes.js

| Method | Path |
|--------|------|
| GET | /info |
| POST | /reboot |

## /audioLibrary.js

| Method | Path |
|--------|------|
| GET | / |
| GET | /api/library |
| POST | /api/search |
| POST | /api/upload |
| GET | /api/audio/:id |
| PUT | /api/audio/:id |
| DELETE | /api/audio/:id |
| POST | /api/audio/:id/play |
| GET | /api/audio/:id/download |
| GET | /api/audio/:id/waveform |
| POST | /api/search |
| GET | /api/audio-select |
| POST | /api/audio/stop-all |

## /conversation.js

| Method | Path |
|--------|------|
| GET | / |
| GET | /api/webcam-stream-url |
| GET | /api/speakers |
| GET | /api/jaw-settings |
| GET | /api/agent-status |
| POST | /api/jaw-settings |
| GET | /api/head-tracking-status |
| POST | /api/head-tracking |
| POST | /api/say |
| POST | /api/play-audio |
| POST | /api/ask-ai |
| POST | /api/jaw-drive |
| GET | /api/listen-in-url |
| POST | /api/ai-on |
| GET | /api/ai-status |

## /firstRun.js

| Method | Path |
|--------|------|
| GET | / |

## /goblinManagement.js

| Method | Path |
|--------|------|
| GET | / |
| POST | /api/register |
| POST | /api/deploy-and-register |
| DELETE | /api/goblin/:id |
| GET | /api/goblins |
| GET | /api/goblin/:id |
| PUT | /api/goblin/:id/settings |
| POST | /api/goblin/:id/lock |
| POST | /api/goblin/:id/unlock |
| POST | /api/goblin/:id/heartbeat |
| POST | /api/goblin/:id/deploy-video |
| POST | /api/goblin/:id/play-video |
| POST | /api/goblin/:id/stop-all |
| GET | /api/goblin/:id/status |
| GET | /api/stats |
| POST | /api/broadcast |
| POST | /api/goblins/:id/scan-videos |
| POST | /api/goblins/scan-all-videos |
| GET | /api/goblins/:id/videos |
| GET | /api/videos/all |
| POST | /api/goblins/:id/play-video |
| GET | /api/goblins/:id/status |
| GET | /api/playlists |
| GET | /api/playlists/:id |
| POST | /api/playlists |
| PUT | /api/playlists/:id |
| DELETE | /api/playlists/:id |
| POST | /api/playlists/:id/deploy |

## /orchestration.js

| Method | Path |
|--------|------|
| GET | / |

## /poses/index.js

| Method | Path |
|--------|------|
| GET | / |
| GET | /api/poses |
| GET | /templates |
| GET | /category/:category |
| POST | /from-template |
| GET | /api/poses/:id |
| GET | /:id |
| POST | / |
| PUT | /:id |
| DELETE | /:id |
| POST | /:id/execute |
| POST | /api/poses/:id/execute |

## /scenes/api.js

| Method | Path |
|--------|------|
| GET | / |
| GET | /scenes |
| GET | /queue |
| GET | /queue/status |
| POST | /queue/enqueue |
| POST | /queue/start |
| POST | /queue/stop |
| POST | /queue/clear |
| POST | /queue/reorder |
| POST | /queue/pause |
| POST | /queue/resume |
| POST | /queue/skip |
| POST | /queue/insert |
| POST | /queue/emergency-stop |
| POST | /queue/start-config |
| GET | /queue/library |
| POST | /queue/library |
| GET | /queue/library/:id |
| PUT | /queue/library/:id |
| DELETE | /queue/library/:id |
| POST | /queue/library/:id/export |
| POST | /queue/library/import |
| GET | /queue/templates |
| POST | /queue/templates/save |
| POST | /queue/templates/enqueue |
| GET | /:id |
| POST | / |
| PUT | /:id |
| DELETE | /:id |
| POST | /test-step |
| POST | /:id/play |
| GET | /:id/play-stream |
| GET | /templates |
| POST | /from-template |
| POST | /:id/duplicate |
| GET | /export |
| POST | /import |
| GET | /analytics |
| GET | /analytics/popular |
| GET | /analytics/:sceneId |

## /scenes/armed-mode.js

| Method | Path |
|--------|------|
| GET | /status |
| POST | /arm |
| POST | /disarm |
| POST | /playlist |
| GET | /playlist |
| POST | /config |

## /scenes/index.js

| Method | Path |
|--------|------|
| GET | / |
| GET | /edit/new |
| GET | /edit/:id |

## /setup/audio.js

| Method | Path |
|--------|------|
| GET | / |
| GET | /api/outputs |
| GET | /api/inputs |
| GET | /api/input-level |
| GET | /api/sink-inputs |
| POST | /api/move-stream |
| POST | /api/set-default-sink |
| POST | /api/set-default-source |
| GET | /api/system-config |
| POST | /api/system-config |
| POST | /api/test-system |
| GET | /api/hardware-devices |
| POST | /api/set-input-gain |
| GET | /api/active-streams |
| POST | /api/move-stream |
| GET | /api/audio-levels |

## /setup/calibration.js

| Method | Path |
|--------|------|
| GET | /unified |
| GET | / |
| GET | /api/parts |
| POST | /api/parts |
| PUT | /api/parts/:id |
| DELETE | /api/parts/:id |
| POST | /api/parts/:id/model |
| POST | /api/parts/:id/overrides |
| GET | /api/parts/:id/effective |
| GET | /api/simple/:id |
| POST | /api/simple/:id/set-safe |
| POST | /api/simple/:id/points |
| GET | /api/parts/:id/markers |
| POST | /api/parts/:id/markers |
| DELETE | /api/parts/:id/markers/:name |
| POST | /api/parts/:id/markers/:oldName/rename |
| GET | /linear_actuator/:id |
| POST | /api/linear_actuator/:id/jog |
| POST | /api/linear_actuator/:id/stop |
| POST | /api/linear_actuator/:id/save-position |
| GET | /api/linear_actuator/:id/status |
| POST | /api/linear_actuator/:id/reset |
| GET | /standard_servo/:id |
| POST | /api/standard_servo/:id/move |
| POST | /api/standard_servo/:id/save-pulse |
| POST | /api/standard_servo/:id/save-position |
| GET | /api/standard_servo/:id/status |
| GET | /api/standard_servo/:id/positions |
| DELETE | /api/standard_servo/:id/positions/:name |
| POST | /api/standard_servo/:id/positions/:name/update |
| GET | /api/servos/:id/positions |
| POST | /api/continuous_servo/:id/reset |
| GET | /api/calibration/profiles |

## /setup/characterAudio.js

| Method | Path |
|--------|------|
| GET | /api/audio-config |
| POST | /api/audio-config |
| POST | /api/audio-config/:section |
| GET | /api/microphone-config |
| GET | /api/speaker-config |
| GET | /api/stt-config |
| GET | /api/jaw-animation-config |
| GET | /api/microphones |
| POST | /api/microphones |
| PUT | /api/microphones/:id |
| DELETE | /api/microphones/:id |

## /setup/characters.js

| Method | Path |
|--------|------|
| GET | / |
| GET | /api/characters |
| GET | /api/characters/:id |
| POST | /api/characters |
| PUT | /api/characters/:id |
| DELETE | /api/characters/:id |
| GET | /api/current |
| POST | /api/select |
| GET | /api/character-assignments |
| POST | /api/character-assignments |
| GET | /images |

## /setup/models.js

| Method | Path |
|--------|------|
| GET | / |
| GET | /api/:type |
| GET | /api/:type/:id |
| POST | /api/:type |
| POST | /api/:type/bulk-delete |
| PUT | /api/:type/:id |
| DELETE | /api/:type/:id |

## /setup/poses.js

| Method | Path |
|--------|------|
| GET | / |
| GET | /api/poses |
| GET | /api/templates |
| POST | /api/poses |
| POST | /api/poses/from-template |
| PUT | /api/poses/:id |
| DELETE | /api/poses/:id |
| POST | /api/poses/:id/test |

## /setup/super-powers.js

| Method | Path |
|--------|------|
| GET | /api/list |
| GET | / |
| GET | /api/jaw-animation/:characterId |
| POST | /api/jaw-animation/:characterId |
| POST | /api/jaw-animation/:characterId/test |
| GET | /api/jaw-animation/:characterId/audio-levels |
| POST | /api/jaw-animation/:characterId/start-monitoring |
| POST | /api/jaw-animation/:characterId/stop-monitoring |
| POST | /api/jaw-animation/:characterId/drive |
| GET | /api/jaw-animation/:characterId/servos |
| POST | /api/apply-settings-to-part/:characterId |
| POST | /api/test-advanced-servo/:characterId |
| POST | /api/test-jaw-with-audio/:characterId |
| GET | /api/ai-chat-status/:characterId |
| POST | /api/ai-chat-connect/:characterId |
| POST | /api/ai-chat-disconnect/:characterId |
| POST | /api/ai-chat-send/:characterId |

## /setup/system.js

| Method | Path |
|--------|------|
| GET | / |

## /setup/webcam.js

| Method | Path |
|--------|------|
| GET | / |
| GET | /api/health |
| GET | /api/parts/:id/controls/list |
| PUT | /api/parts/:id/controls/set |
| GET | /api/devices |
| GET | /api/devices/probe |
| GET | /api/devices/inuse |
| POST | /api/parts/:id/apply-device |
| GET | /api/parts/:id/stream |
| GET | /api/models |
| GET | /api/models/:id |
| POST | /api/models |
| PUT | /api/models/:id |
| DELETE | /api/models/:id |
| POST | /api/motion-tracking/start |
| POST | /api/motion-tracking/stop |
| POST | /api/motion-tracking/params |
| GET | /api/motion-tracking/status |
| GET | /api/motion-tracking/head-tracking-requirements |
| POST | /api/motion-tracking/head-tracking/enable |
| POST | /api/motion-tracking/head-tracking/disable |
| GET | /api/motion-tracking/head-tracking/status |

## /videoLibrary.js

| Method | Path |
|--------|------|
| GET | / |
| GET | /api/library |
| GET | /api/videos |
| POST | /api/deploy |
| POST | /api/upload |
| GET | /api/video/:id |
| PUT | /api/video/:id |
| DELETE | /api/video/:id |
| GET | /api/video/:id/stream |
| GET | /api/video/:id/download |
| GET | /api/video/:id/thumbnail |
| POST | /api/video/:id/deploy |
| POST | /api/video/:id/play-on-goblin |
| POST | /api/search |
| GET | /api/stats |

