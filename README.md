# Fjoscam

Fjoscam is a low-latency desktop viewer for Reolink cameras on the same LAN. It is built for barn monitoring: large live-view space, always-visible PTZ controls, keyboard/numpad control, optical zoom shortcuts, click-and-hold PTZ movement, and preset recall without exposing preset deletion in the main viewer.

## Run

```powershell
npm install
npm run dev
```

## Build and Package

```powershell
npm test
npm run build
npm run package
```

The unpacked Windows app is created at `dist\win-unpacked\Fjoscam.exe`.

## Current MVP Notes

- Camera setup is manual: name, IP/host, ports, username, password, channel, and low-latency preference.
- Passwords are encrypted with Electron `safeStorage`, which uses the operating system's protected storage services.
- PTZ, zoom, focus, presets, and connection tests use Reolink's local HTTP/HTTPS API.
- Live video uses a local WebRTC bridge through the bundled go2rtc runtime, with MJPEG/snapshot fallback for simple compatibility.
- The renderer never receives camera passwords directly.
