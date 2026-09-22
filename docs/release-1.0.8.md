# Fjoscam 1.0.8

22 September 2026 — Windows x64, macOS Intel and macOS Apple Silicon.

## What's new

- **Safer saved credentials.** Complete generic RTSP/RTSPS URLs now use OS-backed encryption, alongside camera passwords. Existing valid configuration and backup files are migrated. Saved secrets stay out of normal UI state and diagnostic messages.
- **Verified encrypted connections.** HTTPS camera requests and generic RTSPS streams verify certificates. Self-signed cameras have an explicit certificate inspection and fingerprint confirmation workflow.
- **More reliable video recovery.** The local video service has bounded automatic restart and stream recovery. Switching cameras, disconnecting and closing the app release old streams and pending snapshot/MJPEG requests.
- **More dependable camera controls.** Reolink capability and metadata handling, authentication renewal, zoom caching and ONVIF movement/Stop handling are more robust when cameras respond slowly or go offline.
- **Clearer discovery and status.** Camera discovery shows network coverage and limits, handles ONVIF responses more carefully, and keeps API and ONVIF ports separate. Playback, update and configuration-recovery notices explain more of what is happening.
- **Smoother daily use.** Fullscreen state, modal keyboard/focus handling and camera switching are more consistent. Repeated settings writes and unnecessary background camera requests are reduced.
- **Refreshed builds.** Runtime/build dependencies are updated, bundled video components have verified provenance and license notices, and each installer includes only its matching video-service binary.

## Before updating

- Self-signed HTTPS/RTSPS cameras may need a one-time certificate inspection and explicit fingerprint confirmation. Verify the fingerprint through a trusted source before accepting it.
- ONVIF PTZ fallback is now an explicit per-camera opt-in, with a separate HTTP port. Reolink API controls remain the primary path.
- Camera names, hosts and usernames remain ordinary local configuration. Old external backups are not modified. Encrypted secrets are tied to the OS account; moving configuration to another account may require entering credentials again.
- Older versions cannot read the new encrypted generic-stream URL format. Avoid editing migrated camera data with an older build.
- macOS packages are Apple Development signed and strictly signature-checked, **not notarized**. Windows packages have no configured signing identity.

## Verification scope

The maintenance baseline passed 527 automated tests on Windows and native Mac arm64, plus packaged app, TLS and synthetic playback checks for Windows x64 and both Mac architectures. Intel execution on the test Mac uses Rosetta. Release-specific verification is recorded separately in the release progress log.

Physical Intel hardware, live-camera field regression and real native updater installation/restart are not covered by those automated checks. No claim of Apple notarization is made.
