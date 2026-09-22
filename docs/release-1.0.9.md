# Fjoscam 1.0.9

22 September 2026 — Windows x64, macOS Intel and macOS Apple Silicon.

## Camera controls and HTTPS certificates

Video can work while camera movement, presets or lights fail: video and camera controls use separate connections. Version 1.0.8 began enforcing certificate verification, so cameras with self-signed certificates may need explicit approval.

1. When the warning appears, select **Review HTTPS certificate**. The correct camera opens with focus on certificate inspection.
2. Select **Inspect HTTPS certificate**. No camera password is sent by inspection.
3. Independently verify the SHA-256 fingerprint against the camera or a trusted administrator.
4. Select **I have independently verified this fingerprint**, then **Use this certificate**.
5. Select **Save camera and retry**. Saved credentials are preserved and the app reloads the camera controls.

The warning now stays visible when video succeeds, and it does not follow you to a different camera. Error messages no longer show Electron's technical remote-method wrapper. Generic RTSPS certificate rejection is also distinguished from ordinary connection failure.

There is no automatic certificate approval or fallback to unencrypted HTTP. A changed camera certificate must be verified again. See the README for the exact scope of certificate exceptions.

## Resume after sleep

Fjoscam attempts to stop held camera movement on suspend and before resuming playback. Pending movement is not replayed. Active playback reopens on resume with its existing camera, quality and audio settings. A manually disconnected view stays disconnected. Stop cannot confirm physical rest if the camera is offline.

## Local diagnostic report

Open **Help → About Fjoscam → Save diagnostics…** to save a JSON report. It contains runtime versions, main-process uptime/memory and anonymous camera setting categories. It excludes camera names, IDs, addresses, usernames, passwords, stream URLs, certificate contents, images and raw logs. Nothing is uploaded automatically.

The report is a configuration/runtime snapshot, not a camera-connectivity test. Memory figures exclude the renderer and video-service processes.

## Verification and limits

Release verification is recorded in `release-1.0.9-framdrift.md`. Synthetic tests do not establish physical-camera compatibility, long-term memory behaviour or real OS sleep/wake behaviour. Mac Intel execution is checked through Rosetta, not physical Intel hardware. Real native updater installation/restart remains a separate check.

Mac packages remain Apple Development signed and strictly signature-checked, **not notarized**. Windows packages remain unsigned.
