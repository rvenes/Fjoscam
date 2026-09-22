# Bundled go2rtc

Upstream: [AlexxIT/go2rtc v1.9.14](https://github.com/AlexxIT/go2rtc/releases/tag/v1.9.14), source commit `b5948cfb25404cc5cb37b166ecaa2dca20b11d4b`, built with Go 1.25.6. The upstream MIT notice is in `LICENSE`.

`manifest.json` records exact repository binary sizes/SHA-256 and official release archive SHA-256. On 20 September 2026, all three archives were downloaded from that release, checked against GitHub's asset digest metadata, and their contained binaries matched the repository copies byte for byte. This establishes a match to the published release; it is not a reproducible source-build or independent publisher-signature proof.

## Local verification

Run `npm run verify:vendor`. The normal build runs the same offline check. It verifies all three supported binaries and fails for a changed, missing, mislabelled or duplicate entry. It also reads their embedded Go metadata and checks the exact dependency versions/checksums against `modules.json`, plus SHA-256 of every collected notice. It never downloads, executes, modifies or repairs a binary. The existing package rule includes this directory's manifests, readable index and notices alongside the runtime files.

Verify repository inputs before packaging. Platform code signing may change packaged executable bytes; the source manifest is not a substitute for the existing post-signature checks, generated update metadata or installer verification.

## Platform-specific packages

The source repository keeps all three verified binaries. The `build.files` rule excludes their platform directories from ASAR collection. `scripts/packageVendor.cjs` then adds exactly one binary to `app.asar.unpacked/vendor/go2rtc/` in the `afterPack` hook, before signing:

| Build target | Included binary |
|---|---|
| Windows x64 | `win64/go2rtc.exe` |
| macOS x64 | `mac-amd64/go2rtc` |
| macOS arm64 | `mac-arm64/go2rtc` |

Selection uses the requested build architecture, not the host architecture. Unsupported targets (including a universal Mac bundle) fail explicitly. Runtime paths remain unchanged. The hook verifies all repository inputs first, creates the output binary without overwriting files, and verifies the selected binary and notices before signing. It does not delete unwanted binaries; incorrectly filtered/stale output fails instead.

All notices and the complete source manifest remain in each package. The manifest documents the three source inputs; it is not a statement that all three are installed. `verifyPackagedVendor` checks a single target and rejects other platform directories. Its byte/hash check applies before signing (or to an unsigned verification package). Use platform signature verification after signing changes executable bytes; never rewrite source hashes for signed copies. The Mac `afterSign` hook remains unchanged. Native Mac package/signature/playback checks are still required before release.

## Controlled upgrades

1. Read the upstream release notes and review relevant security/protocol changes. Retain Windows x64 and both supported Mac architectures.
2. Download only the selected official release assets into a fresh temporary directory. Check each archive's digest against the release asset metadata before examining its binary.
3. Confirm version, architecture, source revision and Go build metadata; compute the binary sizes and SHA-256. Review the upstream license and transitive notices for that release.
4. Replace repository binaries only as part of an authorized upgrade, and update the manifest/license together from those checked artifacts. Never regenerate hashes merely to make a failed integrity check pass.
5. Run vendor verification, tests, build, actual playback/TLS smoke and packaged checks on every affected platform. Preserve the Mac signature hook. Publishing remains a separate operation.

## Go module notices and regeneration

[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) indexes all 34 dependency modules recorded in the three binaries. The 48 collected texts include original module LICENSE/NOTICE/PATENTS files, Paho's separately named license texts, the Go toolchain's root LICENSE/PATENTS and a full Apache 2.0 text for modules that only supply headers. `modules.json` maps every original path to its local copy, hash and source archive. Texts retain their original bytes; `.gitattributes` disables newline conversion for them.

The maintenance collector needs Python 3.10+ (standard library only) and network access to the official Go module proxy, Go source repository and Apache license text. Normal tests/builds need neither Python nor network for these checks. After independently verifying upgraded release archives and updating the binary manifest, export hash-verified metadata and collect into a **new** output directory:

```powershell
node scripts/verifyVendor.cjs --export-build-info out/go-build-info-new.json
python scripts/collectGoNotices.py --build-info out/go-build-info-new.json --output out/go-notices-new
```

The metadata export intentionally checks binaries without requiring the old notice inventory to match the new version. It is not the complete build gate. The collector checks every module ZIP against the embedded Go `h1` sum, reads archive entries without extracting or executing source, and rejects unequal dependency lists between platforms. See the [Go checksum definition](https://go.dev/ref/mod#authenticating) and [HashZip implementation](https://raw.githubusercontent.com/golang/mod/v0.32.0/sumdb/dirhash/hash.go).

Review the new inventory and upstream license texts, including nonstandard filenames and references to additional notices. Collection by filename alone cannot establish license completeness. Copy only the reviewed `modules.json`, `THIRD-PARTY-NOTICES.md` and `notices/` into this directory; module ZIPs stay in ignored `out/`. If modules use different license layouts, extend the collector and corresponding verification rules deliberately. Then run the full vendor/build gate and package checks. Do not copy a partially failed collection or refresh hashes just to pass a check.

Scope: this closes the module-list/collected-notice gap for the pinned binaries. It is not a file-by-file audit of linked symbols, bundled web assets, Go's whole source tree, Electron/npm dependencies or all codec/patent obligations. Native Mac packaging/signature checks remain separate.
