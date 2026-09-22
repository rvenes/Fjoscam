# Fjoscam – RTSPS

Status: **fullført og lagra 18. september 2026. 140 testar / 18 filer, bygg og begge Windows Electron-kontrollane består.** Starta frå ONVIF-bolken med 120 testar. Ingen commit, publisering eller releasebygg.

Seinare framdrift: [dependency-bolken](utbetring-dependencies-framdrift.md) oppdaterer Electron/updater/byggjeverktøy, fjernar dei då kjende npm-varsla og legg til isolert Windows-pakkeverifikasjon. Tal på advisories nedanfor er historikken frå denne RTSPS-bolken.

## Plan og sikkerheitsgrenser

- go2rtc 1.9.14 kan bruke WebSocket som byte-transport medan opphavleg RTSP-adresse blir brukt til RTSP/Digest. Undersøk og test dette med faktisk medfølgjande binær.
- Lokal relay skal verifisere den faktiske upstream TLS-socketen før RTSP-data kan sendast, ved kvar reconnect. Bruk CA-verifisering som standard og eksplisitt endpoint-bunden sertifikatpin for sjølvsignerte kamera.
- Relay skal berre lytte på loopback, krevje ein tilfeldig rutenøkkel som blir i main/go2rtc, avvise nettlesar-Origin og ha grenser for tilkoplingar, meldingar og tidsbruk. Pipe med backpressure og lukking i begge retningar.
- Bruk den vedlikehaldne `ws`-implementasjonen; ikkje skriv ein eigen WebSocket-parser. Ingen ny ekstern teneste eller endra go2rtc-binær.
- Lagra URL skal framleis vere kryptert og skal ikkje sendast tilbake til renderer. Sertifikatinspeksjon av lagra URL skjer i main utan RTSP-data.
- Save/remove må trekkje tilbake gamle ruter og aktive tilkoplingar. Innskrivne transport-overstyringar må ikkje kunne omgå relay.
- Reolink RTSP, Panasonic, High/Clear og UniFi-normalisering skal bevarast.

## Kontrollpunkt

- Instruksjonar, tidlegare logg, kode og versjonsspesifikk go2rtc-kjelde lesne.
- Kontrollpunkt 1: `rtspsRelay.ts`, endpoint-bunden `rtspsTrust`, validering, store og sertifikatinspeksjon er lagra. `ws` 8.21.3 er direkte, eksakt produksjonsavhengigheit; `@types/ws` 8.18.1 er eksakt utviklingsavhengigheit.
- Kontrollpunkt 2: go2rtc-brua brukar relay for RTSPS, fjernar innskrivne fragment-overstyringar, serialiserer registrering per kamera og kan trekkje tilbake ruter/avbryte ventande TLS ved konfigurasjonsendring. Ikkje testa enno. Main/renderer-integrasjon og regresjonstestar står att.
- Kontrollpunkt 3: Main/renderer og eksplisitt sertifikatgodkjenning er kopla til. Dei første 11 relay-testane er grøne (CA/IP-hostname, pin, reconnect, binær transport/backpressure, avbrot, timeout, grenser og lokal tilgang). Build passerte før dei siste testfilendringane. Store-/UI-/validerings- og faktisk go2rtc-integrasjonstest er lagra, men skal køyrast før ferdigmelding.
- Kontrollpunkt 4: **138 testar / 18 filer grøne**, `npm run build` grøn. Faktisk go2rtc 1.9.14: Digest med opphavleg URI, H264 + PCMU-spor, UniFi-normalisering, sertifikatbyte etter preflight, sperring av `#transport=tcp`, tilbakekalling og ny eksplisitt pin alle testa. Lagra YAML og renderer-respons inneheld ikkje straumløyndomar. Windows Electron-smoke er utvida for RTSPS; skal køyrast no.
- Ved avbrot: les denne loggen og Git-diffen. Arbeid berre med syntetiske kamera på loopback; ikkje opne privat kamerakonfigurasjon.

## Lagra resultat

### Endeleg verifikasjon

| Kontroll | Resultat |
| --- | --- |
| `npm test` | **140/140 testar / 18 filer bestått**, 20 nye testar sidan ONVIF-bolken. |
| `npm run build` | **Bestått**, begge TypeScript-prosjekta og Vite. |
| `node node_modules/electron/cli.js scripts/smokeCameraTls.cjs` | **Bestått**, utvida med faktisk RTSPS-relay/OS-kryptering i Windows Electron. |
| `node node_modules/electron/cli.js scripts/smokeLocalPlayback.cjs` | **Bestått**, eksisterande lokal avspeling og tilgangskontroll. |
| `git diff --check` | **Bestått**. |

Dei to siste testane stadfestar IPC-flyten for inspeksjon av lagra URL utan å returnere han, og avvising av manglande/feil kameratype. Checkpoint-tekstane ovanfor er historikk frå lagring undervegs; ingen av dei nemnde teststega står att.

- **S05, RTSPS-verifisering:** den faktiske upstream-socketen får CA-/vertnamnkontroll som standard, også for IP-adresser. Ved eksplisitt `rtspsTrust` blir SHA-256 på den faktiske peer-sertifikaten kontrollert før applikasjonsdata kan sendast. Kvar ny tilkopling går same veg; det finst ingen tillit basert berre på ein tidlegare probe.
- go2rtc bruker sin eksisterande WebSocket-byte-transport med den opphavlege RTSPS-adressa som protokoll-/autentiserings-URI. Berre loopback er bunde. Tilfeldig 256-bit rutenøkkel er intern i main/go2rtc; ukjend nøkkel, nettlesar-Origin og feil Host blir avvist. Ingen ekstra teneste eller endra binær.
- Relay har 5 sekund TLS-frist, 64 samtidige lokale sockets, 32 aktive straumtilkoplingar, 4 per kamera og 1 MiB meldingsgrense. Stream-piping med backpressure har 64 KiB high-water-mark; dette er ei bufferstyringsgrense, ikkje ein påstand om total RAM-bruk. Komprimering er av. Lukking/feil/tilbakekalling avsluttar begge sider.
- Fragment i innskriven RTSP(S)-URL blir fjerna før registrering, slik at `#transport=tcp` ikkje kan omgå kontrollen. UniFi `enableSrtp`-normalisering og full kryptert URL-lagring er bevarte.
- Save/remove trekkjer tilbake RTSPS-ruter og lukkar gamle tilkoplingar. Registrering er serialisert per kamera; konfigurasjonsgenerasjon hindrar forseinka gammal konfigurasjon i å bli registrert. Aktive TLS-probar blir avbrotne ved endring/stopp.
- UI tilbyr inspeksjon og eksplisitt, uavhengig fingerprint-stadfesting for RTSPS. Lagra URL blir lesen/dekryptert i main; renderer får berre sertifikatmetadata. URL-/kameratypebyte fjernar pin frå skjemaet. Store kontrollerer pin mot faktisk kryptert URL òg ved blank redigering.
- `ws` **8.21.3** og typane **8.18.1** er eksakt festa i package/lockfile. Lockfile-diffen har berre desse to tilleggspakkane. Ingen native valfrie modulpakkar er installerte.

## Testgrunnlag og avgrensing

- Syntetiske TLS-tenarar på loopback, disponibel OpenSSL-sertifikatgenerering og faktisk medfølgjande Windows go2rtc 1.9.14. Ingen ekte kamera, kamerarørsle eller privat konfigurasjon er brukt.
- Relay-testane dekkjer CA/hostname/IP, pin, sertifikatbyte ved reconnect, binære data i begge retningar, ressursgrenser, avbrot, timeout og tilbakekalling. Go2rtc-integrasjonen dekkjer Digest/URI, H264-/PCMU-spor i SDP, endra sertifikat mellom probe og avspeling, fragment-omgåing og ny eksplisitt pin. Dette er protokolltestar, ikkje dokumentasjon på dekoda kameravideo eller langvarig streaming.
- Faktisk Windows Electron: `smokeCameraTls.cjs` består med OS-kryptert URL/pin, sertifikatinspeksjon, RTSPS-CA-avvising, binær WebSocket/TLS og tilbakekalling. Den eksisterande `smokeLocalPlayback.cjs` består òg med iframe/modular/WebSocket/snapshot og avvising av renderer-admin.
- `npm audit` 18. september: framleis **26 varsel (3 Moderate, 20 High, 3 Critical)** i dependency-treet; ingen `ws`-advisory i denne kontrollen. Dette er pakkevarsel, ikkje 26 stadfesta apputnyttingar. S08 er ikkje løyst i denne bolken.

## Endringsrisiko / attståande arbeid

- **Medium–High kompatibilitetsrisiko:** tidlegare automatisk aksepterte sjølvsignerte RTSPS-kamera må få sertifikatet kontrollert og godkjent. CA-/host-/gyldigheitsfeil blir ikkje ignorerte automatisk. Eksplisitt pin erstattar desse sjekkane for nøyaktig sertifikat og endpoint; UI forklarer dette.
- Den ekstra lokale byte-transporten kan påverke CPU/RAM ved høg bitrate; syntetisk backpressure-test er bestått, men ekte H265/4K, mange kamera og langtidstest står att. Reolink RTSP og Panasonic er ikkje flytta til relay.
- Windows Electron er testa frå det bygde kjeldetreet. Ingen installer-/pakke-, Mac Intel-/ARM-, fysisk kamera- eller firmwaretest er køyrd. `ws` er produksjonsdependency; kontroller inkludering og faktisk avspeling i pakka app på alle plattformer før release.
- HTTP og vanleg RTSP er framleis tilgjengelege for legacy-kamera. Dette tiltaket krypterer ikkje all kameratrafikk. Det gir heller ikkje ein ny health/status-mekanisme for feil som oppstår midt under avspeling.
- go2rtc kan halde gamle stream-definisjonar i minnet fram til oppdatering/prosess-stopp. Ei tilbakekalla RTSPS-rute kan ikkje opne upstream igjen, og konfigurasjon blir ikkje persistert i YAML. Generell opprydding av ubrukte straumar (E04), inkludert vanleg RTSP, står att. DELETE-endepunktet er ikkje brukt fordi go2rtc då skriv konfigurasjon til disk.
- Neste prioriterte bolk: **S08, dependency-risiko**. Klassifiser faktisk runtime-/byggjeeksponering og oppdater avgrensa grupper med kompatibilitetstest; ikkje køyr ukritisk `audit fix --force`. Deretter attståande R08/R09/R12/R13 og straumstatus/opprydding. Originalrapporten er hovudlista.

## Filer og kjelder

- Ny `src/main/rtspsRelay.ts` og testar; integrasjon i `go2rtcBridge.ts`, `cameraTls.ts`, `main.ts`, preload, store, shared types/validation og eksisterande sertifikatpanel/App.
- Utvida store-/main-/UI-/validerings-/go2rtc-testar og `scripts/smokeCameraTls.cjs`; README og framdriftsloggar oppdaterte.
- Versjonskontroll av transportval og URI/autentisering: [go2rtc RTSP-klient 1.9.14](https://github.com/AlexxIT/go2rtc/blob/v1.9.14/pkg/rtsp/client.go). Minne-PATCH kontra disk-DELETE: [streams API](https://github.com/AlexxIT/go2rtc/blob/v1.9.14/internal/streams/api.go).
