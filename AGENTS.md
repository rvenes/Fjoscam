# Fjoscam Project Instructions

## Role and supported platforms

Fjoscam is an Electron + React + TypeScript desktop app for local camera monitoring on Windows and macOS. Preserve the LAN-first design and keep Windows and both supported macOS architectures working.

## Camera and UX invariants

- Reolink uses the local HTTP API/CGI for capabilities and controls, and bundled go2rtc for RTSP-to-local playback. Keep camera-specific commands in adapters and gate controls by reported capability.
- Panasonic legacy cameras use proxied MJPEG plus their CGI PTZ interface, including the nonstandard multipart-parser compatibility. They have no audio.
- Generic RTSP/RTSPS streams use go2rtc for video/audio and have no Fjoscam PTZ, presets, or light controls. Preserve the UniFi `enableSrtp` normalization.
- Prefer Reolink High/Clear by default. Never silently downgrade High/H265 to Low/Fluent; Low is an explicit per-camera setting.
- Preserve fullscreen, camera switching, PTZ, preset, speed, optical-zoom, and mute keyboard controls. Loud camera actions and destructive camera/preset changes require deliberate confirmation.

## Local camera data and logging

- Camera configuration is local user data. Saved password fields are encrypted with Electron `safeStorage`, decrypted only in the main process, and never returned in normal renderer state.
- Do not claim that all camera data is encrypted: hosts, usernames, and stream configuration are currently ordinary local configuration, and generic stream URLs may themselves contain credentials. Credential-bearing generic URLs remain an open hardening gap; do not introduce or expose credentials in plain configuration.
- Preserve atomic camera-config writes, validated backup/recovery, and serialized updates.
- Never log passwords, tokens, credential-bearing stream URLs, or other sensitive camera data. Extend sanitization whenever a new error or logging path can carry such values.

## Build and release invariants

- Use the active commands and platform procedures in `README.md` and `RELEASING.md`. Relevant changes must pass tests and TypeScript/build checks; packaging and updater changes require packaged-app checks on the affected platform.
- On Windows, EPERM/EBUSY recovery may stop only Fjoscam or go2rtc processes that are actually running from the current unpacked build directory.
- Keep package and lockfile versions, app ID, artifact names, architectures, update metadata, file sizes, and feed hashes consistent. Never hand-edit generated update hashes.
- macOS packages must pass the repository's post-signature verification. Notarization is an open gap: do not describe or ship a build as notarized unless notarization, stapling, and Gatekeeper checks have actually passed.
- Git commits, pushes, pull requests, GitHub Releases, local staging, and public web publishing are separate operations and require matching explicit scope. Fjoscam stages approved public files only under `H:\Koding\Venes.org\fjoscam`; the active global Mac/Syncthing and venes.org instructions own transport and public publishing.
