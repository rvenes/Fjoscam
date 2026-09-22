# Releasing Fjoscam

This is the project-specific operator guide for building and staging Fjoscam releases. It does not authorize a commit, push, pull request, GitHub Release, staging change, or public publication. Those are separate operations and require matching scope.

The active global instructions own the Mac host, Syncthing transport, and venes.org preview/publication procedures. This guide defines only Fjoscam's build products and integrity checks.

## Sources of truth

- `package.json` and `package-lock.json` must contain the same release version.
- `package.json` owns the Electron Builder targets, app ID, generic update provider, and the Mac `afterSign` hook.
- `scripts/verifyMacSignature.cjs` is the machine-enforced authority for the expected Mac app ID and signing identity.
- `src/main/updater.ts` owns packaged-app update behaviour.
- Generated `latest.yml` and `latest-mac.yml` own artifact names, sizes, and SHA-512 values. Never edit generated hashes manually.

The generic update provider is:

```text
https://venes.org/fjoscam/
```

GitHub Releases are not currently part of the updater or binary-distribution flow.

## Release boundaries

Treat these as separate operations:

1. Build and test.
2. Sign and, when a notarization workflow exists, notarize.
3. Verify finished release artifacts.
4. Create a GitHub Release, if explicitly requested.
5. Stage approved files under `H:\Koding\Venes.org\fjoscam`.
6. Publish the staged tree to venes.org using the active global publication procedure.

Completing one step does not authorize any later step.

## Prepare a release version

Use the exact Node.js version in `.nvmrc` and npm version in `packageManager` (currently Node 22.23.2 / npm 10.9.8), matching CI. Check `node --version` and `npm --version`; those metadata fields do not change your installed toolchain. Start from the intended clean release commit and install exactly the locked dependencies:

```powershell
npm ci
```

For a new version, update both package files without creating a Git tag automatically:

```powershell
npm version X.Y.Z --no-git-tag-version
```

Confirm that both files report the same version, then run the common quality gate:

```powershell
npm test
npm run build
```

Do not package or stage if the tests, build, version check, or platform-specific checks fail.

The vendor gate also checks the embedded Go dependency list and collected notices for all three source go2rtc binaries. Packaging excludes the binary directories from ASAR collection; `scripts/packageVendor.cjs` adds only the requested platform/architecture in `afterPack`, before signing, at the existing `app.asar.unpacked/vendor/go2rtc/` runtime path. Keep this hook and the file exclusions together. It must fail for unsupported targets or unexpected extra platform directories.

Keep the complete source `manifest.json`, `modules.json`, `THIRD-PARTY-NOTICES.md` and `notices/` in each package. The Windows isolated package check verifies their actual packaged contents and the single Windows binary. Source byte hashes are checked before signing; use the existing post-signature procedure for signed artifacts and never replace source hashes with signed-copy hashes. Both native Mac architectures still need package/signature/playback checks before release. See the vendor README for controlled regeneration and inventory limits.

For dependency updates, inspect both `npm audit` and the Electron release line's support status; an empty audit does not certify Chromium, the bundled go2rtc binary or the entire application. `node scripts/checkPackagedDependencies.cjs` runs an isolated native package check after the quality gate: Windows x64 on Windows, and both Mac architectures on macOS. It exercises actual packaged application code and a local updater feed, but does not test the NSIS/DMG installer, generated update feeds or installing an update. Its verification bootstrap must never be used in a release package. Normal `npm run dist` keeps the production entry point.

On Apple Silicon the Intel check requires Rosetta and does not replace testing on physical Intel hardware. Run Mac signing and Electron/safeStorage checks in the logged-in GUI session with access to the signing keychain. SSH can work for tests/builds while still failing for signing (`errSecInternalComponent`) or OS encryption. Do not disable signing, weaken keychain rules or transmit passwords to make the test pass. An explicitly started temporary GUI-session test job can run the same isolated check; remove its job registration afterward. Mac smoke checks require the repository's native signature/identity gate before inspecting the signed go2rtc metadata and notices.

The packaged check also calls production installation IPC with a fake installer: it requires the owned go2rtc process to exit before launch and checks playback can reopen after a simulated installation failure. Before distributing updater changes, separately test the real installer/update handoff and restart on each supported platform; the fake installer does not verify file replacement, OS prompts or the macOS native updater.

The [native platform check](docs/utbetring-native-plattform-framdrift.md) records successful signed package checks for both Mac architectures on 22 September 2026, including the existing post-signature hook, plus DMG mount/copy checks of normal production-entry bundles. Intel execution was through Rosetta; physical Intel, real updater handoff and camera field tests remain separate. Repeat the relevant checks for each changed release. Electron 43 retains macOS 12 support and has a scheduled support deadline of 5 January 2027; choose and validate its successor before that deadline. Electron 44 raises the macOS minimum to 13, so that move needs an explicit compatibility decision.

## Windows build

Build Windows releases on Windows.

For a quick runnable unpacked build:

```powershell
npm run package
```

The executable is normally:

```text
dist\win-unpacked\Fjoscam.exe
```

For the NSIS installer and updater metadata:

```powershell
npm run dist
```

The three version-current Windows files are:

```text
latest.yml
Fjoscam Setup X.Y.Z.exe
Fjoscam Setup X.Y.Z.exe.blockmap
```

`latest.yml` must name the exact installer, contain the release version, and match the installer's generated size and SHA-512. The current project config does not define an explicit Windows signing identity; do not describe a Windows artifact as signed unless that exact artifact has been verified separately.

### EPERM or EBUSY in the unpacked directory

Packaging can fail when Fjoscam or its bundled go2rtc process is still running from `dist\win-unpacked`. First identify only matching processes:

```powershell
Get-Process | Where-Object { $_.ProcessName -in @('Fjoscam','go2rtc') -and $_.Path -like '*\dist\win-unpacked\*' }
```

Stop only processes that the check proves are running from the current repository's unpacked build. Do not use a broad process kill.

## macOS build

Follow the active global Mac instructions and build on the designated Mac, outside the Syncthing transport directory. The repository includes go2rtc binaries for both `x64` and `arm64`.

After the common test/build gate, package both architectures in one Electron Builder invocation so one `latest-mac.yml` contains both update ZIPs:

```bash
npm run dist -- --mac --x64 --arm64
```

The nine version-current Mac files are:

```text
latest-mac.yml
Fjoscam-X.Y.Z.dmg
Fjoscam-X.Y.Z.dmg.blockmap
Fjoscam-X.Y.Z-mac.zip
Fjoscam-X.Y.Z-mac.zip.blockmap
Fjoscam-X.Y.Z-arm64.dmg
Fjoscam-X.Y.Z-arm64.dmg.blockmap
Fjoscam-X.Y.Z-arm64-mac.zip
Fjoscam-X.Y.Z-arm64-mac.zip.blockmap
```

`latest-mac.yml` must contain both Intel and Apple Silicon update ZIPs and match the generated file sizes and SHA-512 values. The two DMGs are the direct-download artifacts used by the website.

### Mac signature and architecture checks

Electron Builder runs `scripts/verifyMacSignature.cjs` after signing. Packaging must fail if the app ID, signing authority, team, or strict codesign verification differs from the script's expected values. Do not bypass this hook.

Before transfer, verify both app bundles directly:

```bash
file dist/mac/Fjoscam.app/Contents/MacOS/Fjoscam
file dist/mac-arm64/Fjoscam.app/Contents/MacOS/Fjoscam
file dist/mac/Fjoscam.app/Contents/Resources/app.asar.unpacked/vendor/go2rtc/mac-amd64/go2rtc
file dist/mac-arm64/Fjoscam.app/Contents/Resources/app.asar.unpacked/vendor/go2rtc/mac-arm64/go2rtc
defaults read "$PWD/dist/mac/Fjoscam.app/Contents/Info" CFBundleShortVersionString
defaults read "$PWD/dist/mac-arm64/Fjoscam.app/Contents/Info" CFBundleShortVersionString
codesign --verify --deep --strict --verbose=2 dist/mac/Fjoscam.app
codesign --verify --deep --strict --verbose=2 dist/mac-arm64/Fjoscam.app
```

Both the app and go2rtc Intel binaries must report `x86_64`; both Apple Silicon binaries must report `arm64`. Each bundle must contain only its matching go2rtc platform directory, with executable permission on go2rtc and all common notices/metadata present. Both bundle versions must equal the package version. Smoke-test the native bundle on the Mac: start the app, open a camera stream, test PTZ where available, then exit Fjoscam and its go2rtc child before handling the artifacts.

### Open notarization gap

The repository currently has a strict Apple Development signature check, but no notarization configuration, notarization script, stapling step, or automated Gatekeeper check was found. Do not call a Mac artifact notarized unless notarization, stapling, and Gatekeeper verification have actually passed for that artifact. Establishing a Developer ID/notarization workflow is a separate release-engineering task.

## Verify finished artifacts

Before transfer or staging:

- Confirm the package and lockfile versions match.
- Confirm every expected file exists, is non-empty, and has the expected architecture-specific name.
- Confirm feed versions, URLs, sizes, and SHA-512 values against the actual files.
- Confirm `latest.yml` contains only the intended Windows release.
- Confirm `latest-mac.yml` contains both Mac update ZIPs and the intended Mac release.
- Confirm the appropriate packaged-app smoke test passed.
- Preserve the generated feeds; do not hand-edit their hashes or sizes.

Do not mix artifacts from different build runs or versions in one release set.

## Transfer and local staging

Mac artifacts must be finished, signed, checked, and smoke-tested before they enter the global Syncthing release-transport flow. Use the globally defined manifest and readiness checks; do not build inside the transport directory and do not copy directly from the Mac into the venes.org staging tree.

The only Fjoscam public staging root is:

```text
H:\Koding\Venes.org\fjoscam
```

The public tree currently has these categories:

- Website: `index.html` and `fjoscam01.png`.
- Current Windows updater: `latest.yml`, installer, and installer blockmap.
- Current Mac updater/downloads: `latest-mac.yml`, both ZIPs, both DMGs, and their four blockmaps.
- Historical stable installers and Mac packages retained from older versions.

Copy only the approved, verified release set into staging. Recheck that staged file sizes and hashes equal the source artifacts. Do not remove or rename historical files without a separate retention decision: the global publisher mirrors the local tree and a local deletion can delete the public copy.

## Public publication and verification

Staging does not publish anything. Public publication must follow the active global venes.org procedure, including its full preview and deletion-risk review.

After an explicitly requested successful publication, verify at least:

```text
https://venes.org/fjoscam/
https://venes.org/fjoscam/latest.yml
https://venes.org/fjoscam/latest-mac.yml
```

Verify that the website's Windows button resolves through `latest.yml`, both Mac buttons identify the intended version and DMGs, all current artifacts respond successfully, and the public feed content equals the approved staging feeds.

The website's release text is maintained separately from the generated feeds. A version bump is incomplete as a public website update if the buttons point to the new release while the visible “What's new” text still describes an older version.

## GitHub operations

A commit, push, pull request, tag, and GitHub Release are distinct from packaging and venes.org publication. Fjoscam currently has no GitHub Releases, and the generic updater does not consume GitHub release assets. Do not create or attach release assets on GitHub unless that operation is explicitly requested and its artifact ownership has been defined.
