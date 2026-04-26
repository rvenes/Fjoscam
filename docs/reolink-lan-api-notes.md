# Reolink LAN API Notes

These notes collect candidate Reolink LAN HTTP API / CGI commands for future Fjoscam work. They are implementation guidance, not confirmed support for every camera model.

Fjoscam should keep all camera-specific calls inside the Reolink adapter layer. Renderer/UI code must use normalized TypeScript methods and capability flags, not raw Reolink command names.

## Boundaries

- LAN-only camera control.
- Reolink HTTP API / CGI is the primary control API.
- ONVIF can remain a compatibility fallback when a Reolink command is missing or behaves differently.
- Unsupported features must be hidden or disabled per camera.
- Model-specific quirks belong in the adapter layer.
- Prefer safe read commands before write commands.

## Session Startup

For each camera session, prefer this read-first sequence:

1. `Login`
2. `GetAbility`
3. `GetDevInfo`
4. `GetChannelStatus`

Build a `CameraCapabilities` object from these responses. Token expiry should trigger automatic re-login. Unsupported command errors should be logged clearly without crashing the app.

## Core Commands

- `Login`
- `Logout`
- `GetAbility`
- `GetDevInfo`
- `GetChannelStatus`

## PTZ

Primary command:

- `PtzCtrl`

Normalized adapter methods:

- `ptzMove(direction, speed)`
- `ptzStop()`
- `ptzZoomIn(speed)`
- `ptzZoomOut(speed)`
- `ptzFocusNear(speed)`
- `ptzFocusFar(speed)`

Likely command names to map:

- Movement: model-dependent `PtzCtrl` operations.
- Zoom fallback: `ZoomInc`, `ZoomDec`
- Focus fallback: `FocusInc`, `FocusDec`

## Zoom And Focus

Read/write commands to verify:

- `GetZoomFocus`
- `StartZoomFocus`

Use these for absolute optical zoom/focus where supported. Use `PtzCtrl` zoom/focus increment commands as fallback.

## Presets

Commands:

- `GetPtzPreset`
- `SetPtzPreset`

Normalized methods:

- `getPresets()`
- `gotoPreset(id)`
- `savePreset(id, name)`
- `deletePreset(id)` only if the model reports support

Preset edit/delete should stay out of the main viewer to avoid accidental changes.

## Guard, Check State, Patrol

Candidate commands to verify per model:

- `GetPtzGuard`
- `SetPtzGuard`
- `GetPtzCheckState`
- `PtzCheck`

Treat as optional until tested on real cameras.

## IR Lights

Commands:

- `GetIrLights`
- `SetIrLights`

Normalized methods:

- `getIrLights()`
- `setIrLights(mode)`

Expose only when capabilities confirm support.

## White LED / Spotlight

Commands:

- `GetWhiteLed`
- `SetWhiteLed`

Normalized methods:

- `getWhiteLed()`
- `setWhiteLed(enabled)`
- `setWhiteLedBrightness(value)` if supported
- `setWhiteLedMode(mode)` if supported

## Siren / Audio Alarm

Commands:

- `GetAudioAlarm`
- `SetAudioAlarm`
- `AudioAlarmPlay`

Normalized methods:

- `getSirenConfig()`
- `setSirenConfig(config)`
- `playSiren()`
- `stopSiren()` if supported

Use extra UI confirmation for loud actions.

## Motion Detection

Commands:

- `GetMdState`
- `GetMdAlarm`
- `SetMdAlarm`

Normalized methods:

- `getMotionState()`
- `getMotionAlarmConfig()`
- `setMotionAlarmConfig(config)`

## AI Detection

Commands:

- `GetAiState`
- `GetAiCfg`
- `SetAiCfg`

Normalized methods:

- `getAiState()`
- `getAiConfig()`
- `setAiConfig(config)`

## Image Settings

Commands:

- `GetImage`
- `SetImage`

Candidate settings:

- Brightness
- Contrast
- Saturation
- Sharpness
- Hue
- Flip
- Mirror
- Day/night mode
- Anti-flicker
- WDR/HDR if supported

## Stream / Encoding Settings

Commands:

- `GetEnc`
- `SetEnc`

Candidate settings:

- Main/sub stream
- Resolution
- FPS
- Bitrate
- Codec
- Audio if supported

Keep this separate from live stream selection. Changing encoding writes camera configuration and should require a deliberate settings panel.

## Snapshot

Commands:

- `Snap`

Normalized method:

- `getSnapshot()`

Fjoscam already has snapshot/MJPEG fallback plumbing; use this for compatibility and diagnostics.

## Recording / Playback

Commands to verify later:

- `GetRec`
- `SetRec`
- `Search`
- `Download`

Normalized methods:

- `getRecordingConfig()`
- `setRecordingConfig(config)`
- `searchRecordings(from, to)`
- `downloadRecording(file)`

Recording/playback is outside the current live-view MVP and should stay lower priority.

## Optional Later

- Two-way audio
- Doorbell-specific features
- Dual-lens / TrackMix-specific features
- Auto tracking
- Patrol routes
- Chime / visitor event
- Quick replies

## Suggested UI Panels

- PTZ panel
- Preset panel
- Zoom/focus panel
- IR light panel
- Spotlight panel
- Siren/alarm panel
- Motion panel
- AI detection panel
- Image settings panel
- Encoding panel
- Snapshot panel
- Recording/playback panel
- Device info panel

## Suggested Priority

1. `GetAbility`, `GetDevInfo`, `GetChannelStatus`
2. IR lights
3. White LED / spotlight
4. Siren / audio alarm
5. Absolute zoom/focus
6. Motion state/config
7. AI state/config
8. Image settings
9. Encoding settings
10. Snapshot diagnostics
11. Recording search/download
12. Optional model-specific features
