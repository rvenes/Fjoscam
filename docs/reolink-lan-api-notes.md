# Reolink LAN API Notes

These notes distinguish the Reolink LAN commands Fjoscam currently implements from candidate work. A command being implemented does not mean every camera model or firmware supports it. Runtime capability data and real-camera behaviour remain authoritative.

Keep camera-specific calls inside the Reolink adapter layer. Renderer/UI code must use normalized TypeScript methods and capability flags, not raw Reolink command names.

## Boundaries

- LAN-only camera control; Reolink UID/P2P is not supported.
- Reolink HTTP API/CGI is the primary control API.
- ONVIF is an implemented PTZ fallback when compatible Reolink PTZ calls fail.
- Unsupported controls must be hidden or disabled per camera.
- Model- and firmware-specific quirks belong in the adapter layer.
- Prefer capability and state reads before camera writes.
- Loud actions and destructive preset changes require deliberate UI confirmation.

## Implemented today

### Session and device profile

Fjoscam implements:

- `Login` and `Logout`, with cached sessions and automatic re-login after login/session errors.
- `GetAbility` for normalized capability flags.
- `GetDevInfo` for name, model, UID/serial, firmware, and hardware information.
- `GetChannelStatus` for channel names and online state.
- `GetEnc` as a read-only source of High/Clear and Low/Fluent stream information.

A connection test logs in, reads presets, name, stream information, and the capability/device/channel profile. Individual optional reads are allowed to fail without crashing the app.

The result now describes camera API connectivity, separately from video. Presets are optional and capability-gated. Playback status observes actual frames in the local player; page load is not evidence of live video. Reconnect retries the configured stream without changing quality. See [the playback progress log](utbetring-avspelingsstatus-framdrift.md) for tests and limitations.

### PTZ, zoom, and focus

`PtzCtrl` implements movement, stop, relative zoom/focus, and preset recall through normalized `PtzCommand` values. Compatible failures fall back to the ONVIF PTZ adapter.

`GetZoomFocus` reads the current zoom/focus state and camera-reported range. Fjoscam tries the range-returning action first and falls back to the older action shape. `StartZoomFocus` sets an absolute zoom position, clamped to the reported range; a legacy default range is used only when the camera does not report one.

### Presets

- `GetPtzPreset` lists enabled presets by their real camera IDs.
- `SetPtzPreset` saves or disables/deletes presets.
- Number keys recall preset IDs rather than list positions.

The current UI can save and delete Reolink presets. Deletion requires confirmation; do not remove that safeguard.

### IR, spotlight, and siren

- `GetIrLights` and `SetIrLights` read and set supported IR modes. The adapter uses the camera's `state` field because tested TrackMix firmware ignores `mode` writes.
- `GetWhiteLed` and `SetWhiteLed` handle reported spotlight mode/state and optional brightness. Cameras can require an administrator account for writes.
- `GetAudioAlarm` reads siren configuration.
- `AudioAlarmPlay` starts the siren and is exposed only behind a confirmation.

`SetAudioAlarm` configuration writes and a separate stop-siren command are not implemented.

### Snapshot and streaming

- `Snap` supplies the snapshot/MJPEG compatibility path.
- RTSP is converted to local playback by the bundled go2rtc runtime.
- Stream selection is separate from encoding configuration: choosing High or Low does not call `SetEnc`.

## Capability handling

`GetAbility` is normalized into capability flags for PTZ, presets, zoom/focus, IR, white LED, siren, motion, and AI. A capability flag indicates that UI may be offered; it does not prove that every related candidate command below is implemented or works on every firmware.

The parser now selects the configured control channel from `abilityChn`, accepts flat legacy responses, and separates support from operation/write/read permission. Unknown, unsupported, denied and read-only states disable the relevant controls. Mouse and keyboard actions share the same policy; Stop remains available. Camera-side zoom is separate from pan/tilt and focus. See [the R12 implementation log](utbetring-capabilities-framdrift.md) for sources, compatibility limits and tests.

Lens controls use the reported TrackMix model in Auto mode. Camera names and nonzero NVR stream channels no longer imply a second lens. Settings provide explicit Single / NVR and Dual lens overrides; Dual means Wide channel 0 and Zoom channel 1. The view channel itself accepts other nonnegative channel numbers.

Model-specific parsing and fallback behaviour should be covered by adapter tests using redacted or synthetic response shapes. Unsupported-command errors should be clear but must not expose login tokens or credentials.

## Candidate work not currently implemented

### Guard, check state, and patrol

- `GetPtzGuard`
- `SetPtzGuard`
- `GetPtzCheckState`
- `PtzCheck`

Treat these as optional until implemented and tested on real cameras.

### Motion detection

- `GetMdState`
- `GetMdAlarm`
- `SetMdAlarm`

Motion capability detection exists, but these state/configuration calls are not implemented.

### AI detection

- `GetAiState`
- `GetAiCfg`
- `SetAiCfg`

AI capability detection exists, but these state/configuration calls are not implemented.

### Image settings

- `GetImage`
- `SetImage`

Candidate settings include brightness, contrast, saturation, sharpness, hue, flip/mirror, day/night mode, anti-flicker, and model-specific WDR/HDR. Writes require a deliberate settings surface.

### Encoding writes

`GetEnc` is implemented for display and stream information. `SetEnc` is not implemented. Changing codec, resolution, FPS, bitrate, or camera audio writes persistent camera configuration and must remain separate from selecting the live High/Low stream.

### Recording and playback

- `GetRec`
- `SetRec`
- `Search`
- `Download`

Recording search, playback, and downloads are outside the current live-view scope.

### Other later candidates

- Two-way audio.
- Doorbell and chime features.
- Dual-lens/TrackMix-specific controls beyond current channel selection.
- Auto tracking and patrol routes.
- Quick replies and visitor events.

## Suggested implementation order

1. Add focused tests for any new response shape or firmware quirk.
2. Complete siren stop/configuration semantics if required by supported cameras.
3. Motion state/configuration.
4. AI state/configuration.
5. Image settings.
6. Encoding settings behind explicit confirmation.
7. Guard/patrol and other model-specific PTZ features.
8. Recording search/playback/download.
9. Optional doorbell, tracking, and two-way-audio features.
