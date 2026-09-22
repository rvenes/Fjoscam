# Fjoscam

Fjoscam is a low-latency desktop viewer for local network cameras on Windows and macOS. It was built for barn and lambing monitoring: a large live view, always-available PTZ controls, fast camera switching, presets, audio controls, and keyboard/numpad operation without navigating through several menus.

## Supported camera types

- **Reolink LAN cameras:** local HTTP API/CGI for login, capabilities, PTZ, presets, zoom/focus, device and stream information, IR, spotlight, siren, and snapshots where the camera reports support. Live video/audio uses RTSP through the bundled go2rtc runtime.
- **Panasonic legacy MJPEG:** proxied MJPEG plus Panasonic CGI pan/tilt/zoom/focus/presets. The compatibility path accepts the camera's nonstandard multipart HTTP. Panasonic playback has no audio.
- **Generic RTSP/RTSPS:** intended primarily for UniFi Protect shared links. Video/audio uses go2rtc; Fjoscam does not provide PTZ, presets, or light controls for generic streams.

Reolink High/Clear is the default. Low/Fluent is a manual per-camera setting; Fjoscam does not silently downgrade High/H265 streams.

## Run locally

The reference build toolchain is Node **22.23.2** (`.nvmrc`) with its bundled npm **10.9.8** (`packageManager`). CI reads `.nvmrc`; use the same pair for release checks. Node 24.19+ within the 24.x line is also supported for development. `engines` records compatible development versions; it does not switch or install your global tools. Update the reference deliberately when applying Node security updates.

```powershell
npm ci
npm run dev
```

Use `npm install` only when intentionally changing dependencies and review the resulting lockfile.

## Test and build

```powershell
npm test
npm run build
```

The HTTPS transport tests generate temporary synthetic certificates using OpenSSL (on Windows: Git for Windows' bundled `openssl.exe`; on macOS: `openssl` on PATH). Use a supported Node version as declared above. No camera credentials or checked-in private keys are used.

For dependency or packaging changes, after the tests and build, run the isolated Windows package check:

```powershell
node scripts/checkPackagedDependencies.cjs
```

This copies source and build configuration into a new `out/dependency-check-*` directory, performs `npm ci --ignore-scripts`, and compiles there before packaging with a verification bootstrap. Existing `dist-*` output is never used. It tests the real main/preload/renderer, packaged go2rtc, TLS, encrypted storage and updater metadata parsing. It uses temporary synthetic camera data and a loopback update feed. Run it sequentially with other playback tests because they share port 1984. It retains `verification.json` (including Node/npm versions and lock hash) and the test package for diagnosis; it does not publish, install an update or overwrite `dist` releases. These test packages are not distribution artifacts.

Dependency status and remaining release checks are recorded in [the dependency progress log](docs/utbetring-dependencies-framdrift.md). Electron is pinned to the supported 43 series to retain macOS 12 compatibility; review its support deadline before the next release. Electron 42+ downloads its binary on first CLI use; `npx --no-install install-electron` can prepare it explicitly after `npm ci` for offline work.

`npm run build` first runs `npm run verify:vendor`, an offline size/SHA-256 check of all three bundled go2rtc inputs, their embedded Go dependency metadata and collected license notices. A mismatch stops the build; it never downloads or replaces a binary. The [third-party notice index](vendor/go2rtc/THIRD-PARTY-NOTICES.md) covers the 34 recorded Go modules; provenance, inventory scope and the controlled upgrade procedure are in [vendor/go2rtc/README.md](vendor/go2rtc/README.md). Verify these repository inputs before platform signing, which may change packaged executable bytes.

Packaging includes only the go2rtc binary for the requested target (Windows x64, macOS x64 or macOS arm64), plus all notices and source provenance. The `afterPack` hook selects and verifies it before signing; the existing Mac `afterSign` check remains in place. Development builds still use the repository's platform binaries.

Create a runnable unpacked build on the current platform:

```powershell
npm run package
```

On Windows the unpacked executable is normally:

```text
dist\win-unpacked\Fjoscam.exe
```

Create installer/update artifacts for the current platform with:

```powershell
npm run dist
```

CI runs tests and the normal build on Windows and macOS. It does not package, sign, notarize, or publish releases. See [RELEASING.md](RELEASING.md) for the separate Windows and Mac procedures and artifact checks.

## Finding cameras

**Add camera → Search again** combines ONVIF multicast with unauthenticated TCP port checks on private IPv4 networks. One ONVIF response no longer prevents the port checks. **Search coverage and limits** shows each eligible interface, its subnet and the addresses checked. The search honours the network mask up to /22; larger networks are limited to the interface's local /24, with a total cap of 2048 unique addresses. Own addresses, network/broadcast and /31–/32 networks are skipped. IPv6, public addresses and other VLANs can be entered manually.

Results are possible cameras: an open port or advertised name does not establish the device's identity or brand. Verify a device before entering its credentials. Selecting a candidate clears any password/stream URL already typed in the new-camera form. Discovery never changes saved camera addresses or sends their passwords to a newly found IP. ONVIF multicast currently uses the system-selected interface; manual entry remains available when multicast routing or a firewall prevents discovery.

Multicast replies must be valid SOAP/WS-Discovery XML and refer to the current probe. All reported matches are read; credential-bearing URLs and unsupported schemes are ignored. An advertised ONVIF service port is kept separate from the vendor's HTTP API port. Nonconforming legacy replies may be omitted; port checks and manual entry remain available. Discovery is not device authentication.

## Keyboard-first viewer

- `Enter`, `Numpad Enter`, or `F11`: toggle fullscreen; `Esc`: leave fullscreen.
- `Page Up` / `Page Down`: switch camera.
- Arrow keys, WASD, or numpad directions: move PTZ; `Numpad 5`: stop.
- Number keys `1`–`9` recall matching preset IDs; `0` recalls preset 10.
- Numpad `+` / `-`: adjust PTZ speed.
- Numpad `*` / `/`: adjust optical zoom on supported Reolink cameras.
- Numpad decimal: toggle audio mute on non-Panasonic streams.

Reolink and generic streams have app-level volume and mute controls. Loud siren actions and camera/preset deletion require confirmation.

## Local camera data and credentials

Camera state is stored in the Electron user-data directory, normally:

```text
%APPDATA%\fjoscam\cameras.json
%APPDATA%\fjoscam\cameras.json.bak
```

Camera reads and writes are serialized and use atomic replacement plus a validated last-known-good backup. Saved passwords and complete generic RTSP/RTSPS URLs are encrypted with Electron `safeStorage`. The main process decrypts them when a camera operation needs them; normal renderer state returns neither saved passwords nor saved stream URLs. When editing a generic camera, leave the URL field blank to keep its saved address, or enter a complete replacement.

If the main configuration is missing or corrupt and a valid backup is used, a notice stays beside the camera list for the rest of the session. Check the list and settings: recent changes may be missing. Repeating an unchanged camera/channel/quality/order setting preserves the historical backup instead of rotating it unnecessarily. When recovery was needed, that same action can still repair the main file atomically.

Not all camera configuration is encrypted. Names, hosts, usernames, ports, and non-secret stream settings remain ordinary local configuration. On first access, legacy stream URLs in a valid `cameras.json` and `cameras.json.bak` are encrypted in place, preserving each file's camera list. Encryption is verified before either file is replaced. A missing backup is created during migration; migration leaves a corrupt backup untouched. If encryption is unavailable or fails verification, migration stops without replacing either file. A later write failure leaves recoverable files and migration can be retried.

Encrypted credentials are tied to the OS account. Copying these files to another machine/account may require re-entering passwords and URLs. Historical external backups, old go2rtc files and filesystem snapshots may still contain plaintext from older versions; they are not searched or deleted automatically. See [the migration progress log](docs/utbetring-framdrift-2026-09-18.md) for verification and remaining work.

Older Fjoscam builds do not understand encrypted generic URLs. Keep the migrated files intact and use a build that supports this format; downgrading and editing the same data with an older build can make generic streams unavailable or reintroduce plaintext URLs.

The application logs rotate under the same user-data directory. Common files are:

```text
go2rtc-bridge.log
snapshot-server.log
renderer.log
```

Logging paths sanitize known tokens and credential-bearing RTSP URLs. New logging and error paths must not expose passwords, tokens, or sensitive camera URLs.

Playback status distinguishes frames from the local video service. If go2rtc exits unexpectedly while a registered stream is being viewed, Fjoscam tries to restart it and restore that stream, with increasing delay and at most five attempts. A successful short restart does not reset this limit; a minute of stable service or an explicit Reconnect does. The player reloads after recovery without changing High/Low quality. Only fixed, safe child-error categories and exit status are logged; raw child output is discarded. See [the bridge health progress log](docs/utbetring-bridge-helse-framdrift.md).

Disconnect, camera changes and edits release the previous stream by recycling Fjoscam's own video process. This removes old stream credentials and registrations from that process; the next view starts it afresh. The app never stops unrelated go2rtc processes. A planned release also resets crash-recovery backoff. See [the stream cleanup progress log](docs/utbetring-straumrydding-framdrift.md).

Snapshot and Panasonic MJPEG requests also have an explicit lifetime: closing their viewer aborts pending image/stream transport. Saving or removing a camera closes its existing snapshot/MJPEG responses in the main process, including requests still looking up settings. Renderer crashes and app shutdown release all of them. See [the snapshot lifecycle log](docs/utbetring-snapshot-livssyklus-framdrift.md).

## HTTPS camera certificates

Reolink HTTPS API/snapshots and Panasonic HTTPS MJPEG/controls verify certificates by default. Existing cameras with self-signed certificates may require a one-time action after updating:

1. Edit the camera, select HTTPS and its correct HTTPS port.
2. Choose **Inspect HTTPS certificate**. Inspection sends no camera login data.
3. Compare the displayed SHA-256 fingerprint with the certificate obtained directly from the camera or a trusted administrator.
4. Confirm that you have verified the fingerprint, choose **Use this certificate**, then **Save camera**.

The exception applies only to that exact certificate and HTTPS address/port. It replaces the normal issuer, hostname and expiry checks; it does not accept arbitrary certificates. A changed certificate is blocked before credentials are sent. Editing the host, protocol or port clears the form's exception. Use **Remove certificate exception** and save to return to normal verification. Firmware or certificate renewal can require a new inspection and confirmation.

This setting applies to HTTPS controls and snapshots. Reolink video still uses RTSP; legacy HTTP remains available. ONVIF fallback requires a separate opt-in below. Generic RTSPS has its own certificate setting described next. See [the TLS progress log](docs/utbetring-tls-framdrift.md) for the HTTPS checks.

## RTSPS stream certificates

Generic RTSPS streams verify the actual TLS connection before sending RTSP authentication or stream requests, including every reconnect and connections to IP addresses. A self-signed stream that played in an older version may now need an explicit certificate exception:

1. Edit the generic camera. Leave its URL blank to inspect the saved address, or enter a complete replacement RTSPS URL.
2. Choose **Inspect RTSPS certificate** and independently verify its SHA-256 fingerprint against the camera or a trusted administrator.
3. Confirm the fingerprint, choose **Use this certificate**, and **Save camera**.

Inspection sends only a TLS handshake and never returns the saved stream URL to the settings screen. The exception is tied to the exact certificate, host and port; it replaces normal issuer, hostname and expiry checks. Changing the URL clears the form's exception. Remove the exception and save to restore normal verification. Saving or removing a camera closes its old RTSPS connections.

RTSP is still unencrypted. Generic video/audio, UniFi `enableSrtp` normalization and the camera's original RTSP authentication URI are preserved. URL fragments are treated as unsupported transport options and discarded; use percent-encoding for a literal `#` in the camera path. See [the RTSPS progress log](docs/utbetring-rtsps-framdrift.md) for implementation, tests and remaining platform checks.

## Optional ONVIF PTZ fallback

ONVIF fallback is **off by default**, including existing camera configurations without this setting. Reolink API controls remain the primary path. If those controls fail on a camera that needs ONVIF, edit that camera and enable **Allow unencrypted ONVIF PTZ fallback** only on a trusted local network. Select its **ONVIF HTTP port** (default 8000) and save.

ONVIF sends the username, WS-Security password digest and commands over HTTP even when the Reolink API uses HTTPS. HTTPS certificate errors never trigger fallback. ONVIF redirects are rejected. Changing the host or camera type clears the form's permission; camera discovery does not enable it automatically.

The fallback discovers Media/PTZ service paths through `GetCapabilities` and accepts only the configured HTTP origin (same host and port). Legacy paths remain available when device discovery explicitly reports that it is unsupported. SOAP responses are parsed and checked by namespace. Profiles are cached for five minutes; Stop keeps the exact profile and service address used for the movement attempt. NVR channel numbers are not ONVIF profile indexes: nonzero channels, multiple reported video sources and ambiguous PTZ profiles are blocked until explicit channel mapping is supported. Use primary Reolink API controls or a direct single-camera connection in those cases. See [the ONVIF discovery progress log](docs/utbetring-onvif-oppdaging-framdrift.md).

Held ONVIF movement renews the short one-second camera timeout after each successful response. Releasing the control cancels renewal and sends Stop after any in-flight renewal. Network failure ends renewal; a separate main-process watchdog also stops an orphaned hold. See [the movement progress log](docs/utbetring-onvif-rorsle-framdrift.md) for limits and checks.

When movement uses ONVIF, Stop follows that transport and retains the profile used for the movement even if its response was lost. Saving or removing a camera blocks new movements and waits for a stop attempt with the old settings. Offline cameras can still be edited; a failed stop request cannot confirm physical rest.

Explicit NVR channel/preset mapping, Media2 and HTTPS ONVIF remain follow-up work. The [original ONVIF progress log](docs/utbetring-onvif-framdrift.md) records earlier limitations; the discovery and movement logs above describe the subsequent fixes.

## Updates and releases

Packaged builds use `electron-updater` with the generic feed at `https://venes.org/fjoscam/`.

Downloads and installation require explicit actions. Before starting an installer, Fjoscam waits for accepted camera/settings work, attempts PTZ Stop, closes playback connections and logs out. If the local video process cannot exit, installation is blocked. Failed preparation leaves the app usable for retry; reconnect playback if needed. The Windows package smoke check tests this ordering with a fake installer, not an actual update installation.

- Windows uses an NSIS installer and `latest.yml`.
- macOS has Intel and Apple Silicon ZIP/DMG artifacts and `latest-mac.yml`.
- GitHub Releases are not currently used for updater artifacts.

Mac packaging enforces the repository's post-signature check. A complete notarization/stapling/Gatekeeper workflow is not configured or verified and remains an open release-engineering gap. See [RELEASING.md](RELEASING.md) before preparing any release.

## Current scope

Fjoscam is LAN-first and does not support Reolink UID/P2P access. Recording playback, camera firmware updates, two-way audio, and several advanced model-specific settings are outside the current implemented scope. Reolink command status and candidates are tracked in [docs/reolink-lan-api-notes.md](docs/reolink-lan-api-notes.md).
