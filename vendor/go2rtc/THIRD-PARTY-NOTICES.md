# Third-party notices for bundled go2rtc

This directory accompanies go2rtc v1.9.14 (source commit
`b5948cfb25404cc5cb37b166ecaa2dca20b11d4b`), built with go1.25.6.
The go2rtc MIT notice is in [LICENSE](LICENSE).

All 34 dependency modules below are reported in the embedded build information
of each bundled Windows x64, macOS x64 and macOS arm64 binary. Exact versions,
Go `h1` sums, source archive URLs/SHA-256 and original notice paths/SHA-256 are
recorded in [modules.json](modules.json). Each complete module ZIP was checked
against the binary's embedded `h1` sum before collecting these unmodified texts.
The archive links below also provide the corresponding module source code.

This is a module-level inventory, not a claim that every file in each module is
linked into the executable. Nested notices (including WebRTC test-wasm) are
retained conservatively. It does not replace a per-file/per-symbol assessment
of copied code or a license review of Electron, npm dependencies, codecs,
assets or the entire application. The Go toolchain entries below cover its
root license and patent grant, not every attribution in the Go source tree.

Paho's original LICENSE, NOTICE and both full license texts are retained.
Its NOTICE declares a dual-license choice; the upstream texts remain
unchanged. The full Apache 2.0 text supplements the headers in go-pkgs and
yaml.v3; it does not replace their copyright/NOTICE text.

## Modules and original notices

| Module | Version | Original notice files | Source archive |
|---|---|---|---|
| `github.com/eclipse/paho.mqtt.golang` | `v1.5.1` | [LICENSE](notices/module-00-00.txt), [NOTICE.md](notices/module-00-01.txt), [edl-v10](notices/module-00-02.txt), [epl-v20](notices/module-00-03.txt) | [ZIP](https://proxy.golang.org/github.com/eclipse/paho.mqtt.golang/@v/v1.5.1.zip) |
| `github.com/expr-lang/expr` | `v1.17.7` | [LICENSE](notices/module-01-00.txt) | [ZIP](https://proxy.golang.org/github.com/expr-lang/expr/@v/v1.17.7.zip) |
| `github.com/google/uuid` | `v1.6.0` | [LICENSE](notices/module-02-00.txt) | [ZIP](https://proxy.golang.org/github.com/google/uuid/@v/v1.6.0.zip) |
| `github.com/gorilla/websocket` | `v1.5.3` | [LICENSE](notices/module-03-00.txt) | [ZIP](https://proxy.golang.org/github.com/gorilla/websocket/@v/v1.5.3.zip) |
| `github.com/mattn/go-colorable` | `v0.1.14` | [LICENSE](notices/module-04-00.txt) | [ZIP](https://proxy.golang.org/github.com/mattn/go-colorable/@v/v0.1.14.zip) |
| `github.com/mattn/go-isatty` | `v0.0.20` | [LICENSE](notices/module-05-00.txt) | [ZIP](https://proxy.golang.org/github.com/mattn/go-isatty/@v/v0.0.20.zip) |
| `github.com/miekg/dns` | `v1.1.70` | [LICENSE](notices/module-06-00.txt) | [ZIP](https://proxy.golang.org/github.com/miekg/dns/@v/v1.1.70.zip) |
| `github.com/pion/datachannel` | `v1.6.0` | [LICENSE](notices/module-07-00.txt) | [ZIP](https://proxy.golang.org/github.com/pion/datachannel/@v/v1.6.0.zip) |
| `github.com/pion/dtls/v3` | `v3.0.10` | [LICENSE](notices/module-08-00.txt) | [ZIP](https://proxy.golang.org/github.com/pion/dtls/v3/@v/v3.0.10.zip) |
| `github.com/pion/ice/v4` | `v4.2.0` | [LICENSE](notices/module-09-00.txt) | [ZIP](https://proxy.golang.org/github.com/pion/ice/v4/@v/v4.2.0.zip) |
| `github.com/pion/interceptor` | `v0.1.43` | [LICENSE](notices/module-10-00.txt) | [ZIP](https://proxy.golang.org/github.com/pion/interceptor/@v/v0.1.43.zip) |
| `github.com/pion/logging` | `v0.2.4` | [LICENSE](notices/module-11-00.txt) | [ZIP](https://proxy.golang.org/github.com/pion/logging/@v/v0.2.4.zip) |
| `github.com/pion/mdns/v2` | `v2.1.0` | [LICENSE](notices/module-12-00.txt) | [ZIP](https://proxy.golang.org/github.com/pion/mdns/v2/@v/v2.1.0.zip) |
| `github.com/pion/randutil` | `v0.1.0` | [LICENSE](notices/module-13-00.txt) | [ZIP](https://proxy.golang.org/github.com/pion/randutil/@v/v0.1.0.zip) |
| `github.com/pion/rtcp` | `v1.2.16` | [LICENSE](notices/module-14-00.txt) | [ZIP](https://proxy.golang.org/github.com/pion/rtcp/@v/v1.2.16.zip) |
| `github.com/pion/rtp` | `v1.10.0` | [LICENSE](notices/module-15-00.txt) | [ZIP](https://proxy.golang.org/github.com/pion/rtp/@v/v1.10.0.zip) |
| `github.com/pion/sctp` | `v1.9.2` | [LICENSE](notices/module-16-00.txt) | [ZIP](https://proxy.golang.org/github.com/pion/sctp/@v/v1.9.2.zip) |
| `github.com/pion/sdp/v3` | `v3.0.17` | [LICENSE](notices/module-17-00.txt) | [ZIP](https://proxy.golang.org/github.com/pion/sdp/v3/@v/v3.0.17.zip) |
| `github.com/pion/srtp/v3` | `v3.0.10` | [LICENSE](notices/module-18-00.txt) | [ZIP](https://proxy.golang.org/github.com/pion/srtp/v3/@v/v3.0.10.zip) |
| `github.com/pion/stun/v3` | `v3.1.1` | [LICENSE](notices/module-19-00.txt) | [ZIP](https://proxy.golang.org/github.com/pion/stun/v3/@v/v3.1.1.zip) |
| `github.com/pion/transport/v4` | `v4.0.1` | [LICENSE](notices/module-20-00.txt) | [ZIP](https://proxy.golang.org/github.com/pion/transport/v4/@v/v4.0.1.zip) |
| `github.com/pion/turn/v4` | `v4.1.4` | [LICENSE](notices/module-21-00.txt) | [ZIP](https://proxy.golang.org/github.com/pion/turn/v4/@v/v4.1.4.zip) |
| `github.com/pion/webrtc/v4` | `v4.2.3` | [LICENSE](notices/module-22-00.txt), [test-wasm/LICENSE](notices/module-22-01.txt) | [ZIP](https://proxy.golang.org/github.com/pion/webrtc/v4/@v/v4.2.3.zip) |
| `github.com/rs/zerolog` | `v1.34.0` | [LICENSE](notices/module-23-00.txt), [hlog/internal/mutil/LICENSE](notices/module-23-01.txt) | [ZIP](https://proxy.golang.org/github.com/rs/zerolog/@v/v1.34.0.zip) |
| `github.com/sigurn/crc16` | `v0.0.0-20240131213347-83fcde1e29d1` | [LICENSE](notices/module-24-00.txt) | [ZIP](https://proxy.golang.org/github.com/sigurn/crc16/@v/v0.0.0-20240131213347-83fcde1e29d1.zip) |
| `github.com/sigurn/crc8` | `v0.0.0-20220107193325-2243fe600f9f` | [LICENSE.md](notices/module-25-00.txt) | [ZIP](https://proxy.golang.org/github.com/sigurn/crc8/@v/v0.0.0-20220107193325-2243fe600f9f.zip) |
| `github.com/tadglines/go-pkgs` | `v0.0.0-20210623144937-b983b20f54f9` | [LICENSE](notices/module-26-00.txt) | [ZIP](https://proxy.golang.org/github.com/tadglines/go-pkgs/@v/v0.0.0-20210623144937-b983b20f54f9.zip) |
| `github.com/wlynxg/anet` | `v0.0.5` | [LICENSE](notices/module-27-00.txt) | [ZIP](https://proxy.golang.org/github.com/wlynxg/anet/@v/v0.0.5.zip) |
| `golang.org/x/crypto` | `v0.47.0` | [LICENSE](notices/module-28-00.txt), [PATENTS](notices/module-28-01.txt) | [ZIP](https://proxy.golang.org/golang.org/x/crypto/@v/v0.47.0.zip) |
| `golang.org/x/net` | `v0.49.0` | [LICENSE](notices/module-29-00.txt), [PATENTS](notices/module-29-01.txt) | [ZIP](https://proxy.golang.org/golang.org/x/net/@v/v0.49.0.zip) |
| `golang.org/x/sync` | `v0.19.0` | [LICENSE](notices/module-30-00.txt), [PATENTS](notices/module-30-01.txt) | [ZIP](https://proxy.golang.org/golang.org/x/sync/@v/v0.19.0.zip) |
| `golang.org/x/sys` | `v0.40.0` | [LICENSE](notices/module-31-00.txt), [PATENTS](notices/module-31-01.txt) | [ZIP](https://proxy.golang.org/golang.org/x/sys/@v/v0.40.0.zip) |
| `golang.org/x/time` | `v0.14.0` | [LICENSE](notices/module-32-00.txt), [PATENTS](notices/module-32-01.txt) | [ZIP](https://proxy.golang.org/golang.org/x/time/@v/v0.14.0.zip) |
| `gopkg.in/yaml.v3` | `v3.0.1` | [LICENSE](notices/module-33-00.txt), [NOTICE](notices/module-33-01.txt) | [ZIP](https://proxy.golang.org/gopkg.in/yaml.v3/@v/v3.0.1.zip) |

## Go toolchain and supplemental texts

- [go-LICENSE.txt](notices/go-LICENSE.txt) ([source](https://raw.githubusercontent.com/golang/go/go1.25.6/LICENSE))
- [go-PATENTS.txt](notices/go-PATENTS.txt) ([source](https://raw.githubusercontent.com/golang/go/go1.25.6/PATENTS))
- [Apache-2.0.txt](notices/Apache-2.0.txt) ([source](https://www.apache.org/licenses/LICENSE-2.0.txt)); applies to `github.com/tadglines/go-pkgs`, `gopkg.in/yaml.v3`

See [README.md](README.md) for verification and controlled regeneration.
