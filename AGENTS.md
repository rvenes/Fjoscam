# Fjoscam Agent Notes

Fjoscam is an Electron + React + TypeScript desktop app for LAN camera viewing, built first for Windows. It started as a simpler Reolink-style viewer for barn/lambing monitoring: large live video, fast PTZ controls, presets, keyboard navigation, fullscreen viewing, and local-only camera access.

## Working Style

- Keep changes small, practical, and safe. Prefer fixing one concrete issue at a time.
- Check `git status --short` before editing or committing.
- Do not revert user changes unless explicitly asked.
- Use existing project patterns instead of large rewrites.
- Keep replies short. Do not paste huge diffs or noisy terminal output.
- When the user asks to publish/share finished work, commit and push to GitHub.
- Main remote is `https://github.com/rvenes/Fjoscam.git`.

## Current Camera Support

- Reolink LAN cameras:
  - HTTP API/CGI for login, PTZ, presets, device/profile info, IR/white LED, siren.
  - RTSP via bundled `go2rtc` to WebRTC for low-latency viewing.
  - High/Clear is preferred by default. Low/Fluent is a manual per-camera choice and is stored.
- Panasonic legacy MJPEG:
  - Uses proxied MJPEG from `/nphMotionJpeg?...`.
  - Uses HTTP CGI `/nphControlCamera` for pan/tilt/zoom/focus/presets.
  - Uses `insecureHTTPParser` and JPEG-frame extraction because the old camera sends nonstandard multipart HTTP.
- Generic RTSP/RTSPS:
  - Intended for UniFi Protect shared RTSP/RTSPS links.
  - `enableSrtp` is stripped before passing the URL to go2rtc.
  - Video works through WebRTC/go2rtc; no PTZ/presets/lights for generic streams.

## Important UX Decisions

- High/Clear should be first priority on capable machines.
- Do not automatically downgrade Reolink High/H265 to Low. Let the user choose Low manually.
- Keyboard controls matter:
  - Enter / Numpad Enter toggles fullscreen.
  - Page Up / Page Down changes camera.
  - Numpad, arrow keys, and WASD steer PTZ.
  - Number keys recall presets.
  - Numpad `+` / `-` changes PTZ speed.
- Panasonic works without audio. Reolink/UniFi audio has been explored, but robust app-level volume/mute is not finished.

## Build And Test

Run these when relevant:

```powershell
npm test
npm run build
npm run dist
```

For a quick runnable unpacked Windows build:

```powershell
npm run package
```

Runnable app path:

```text
<repo-root>\dist\win-unpacked\Fjoscam.exe
```

If build/package fails with `EPERM` on `dist\win-unpacked`, Fjoscam or `go2rtc` is probably still running from that folder. Check and stop only those processes:

```powershell
Get-Process | Where-Object { $_.ProcessName -in @('Fjoscam','go2rtc') -and $_.Path -like '*\dist\win-unpacked\*' }
```

## Release / Auto Update

Auto-update uses `electron-updater` with Electron Builder generic provider:

```text
https://venes.org/fjoscam/
```

To make a release that triggers updates:

1. Bump `version` in `package.json` and `package-lock.json` using:

   ```powershell
   npm version X.Y.Z --no-git-tag-version
   ```

2. Run:

   ```powershell
   npm test
   npm run build
   npm run dist
   ```

3. Upload these files from `dist\` to `https://venes.org/fjoscam/`:

   ```text
   latest.yml
   Fjoscam Setup X.Y.Z.exe
   Fjoscam Setup X.Y.Z.exe.blockmap
   ```

`latest.yml` must sit directly at:

```text
https://venes.org/fjoscam/latest.yml
```

## Packaging Notes

- `npm run package` creates/updates `dist\win-unpacked`, useful for local testing.
- `npm run dist` creates installer/update files in `dist\`.
- Do not delete older stable folders unless asked.
- Keep Windows working when adding macOS support later. macOS auto-update/signing is separate work and must not break Windows NSIS updates.

## Logs

Useful local logs are under:

```text
%APPDATA%\fjoscam\
```

Common logs:

```text
go2rtc-bridge.log
snapshot-server.log
renderer.log
```

Camera config is local user data, not included in installer builds:

```text
%APPDATA%\fjoscam\cameras.json
```

Secrets are encrypted with Electron `safeStorage`.
