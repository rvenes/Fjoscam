# Fjoscam – funksjonsstøtte og kamerakontrollar (R12)

Status: ferdig implementert og lokalt verifisert 19. september 2026. **188 testar bestått** (førre bolk: 156). Ingen commit/push/publisering; eldre endringar er bevarte.

## Første kontrollpunkt

- Undersøkt Reolink-profil/ability-parser, renderer-kontrollar og snarvegar, Panasonic-adapter, konfigurasjonslagring og eksisterande testar.
- Stadfesta at substring-matching blandar støtte og tilgang, ikkje les vald `abilityChn`, og feilaktig utleier zoom/preset frå PTZ og sirene frå vilkårlege alarmfelt.
- Plan: avgrensa parser med eksplisitte feltnamn og kanalval; status for støtta/ikkje støtta/ukjent/tilgang; tilsvarande vern i UI og snarvegar; inga zoompolling utan støtte. Bevar Stop, Panasonic, generiske straumar og modelltilpassingar.
- Linseval: auto frå rapportert TrackMix-modell, med eksplisitt single/dual-innstilling. NVR-kanalnummer og namn skal ikkje aktivera telelinse. Tillat vanleg numerisk view channel.
- Primærgrunnlag: Reolink Camera HTTP API V7, side 47–52 (leverandørdokument spegla på https://forum.iobroker.net/assets/uploads/files/1694077622272-reolink-kamera-api-2022.pdf). `ver` uttrykkjer støtte/type; `permit` bit 1/2/4 uttrykkjer operasjon/skriving/lesing. `ptzType` og `ptzCtrl` må tolkast kvar for seg.
- Samanlikna modell-/feltpraksis med kjeldekoden til reolink_aio: https://github.com/starkillerOG/reolink_aio/blob/master/reolink_aio/api.py (PT-type 6/7 og `supportDigitalZoom`, IR `ledControl`, spotlight `floodLight`). Ingen bibliotek blir installerte.
- Implementering og regresjonstestar står att. Ved avbrot: les denne fila og Git-diffen; ikkje køyr gamle bolkar om att.

## Kontrollpunkt 2 – implementering lagra

- Ny adapterparser `reolinkCapabilities.ts`, eksplisitt kanalval og namngjevne funksjonsfelt. Fem tilstandar: available, unsupported, denied, read-only og unknown. PTZ, zoom og fokus blir tolka separat; TrackMix sin rapporterte digitale zoom blir bevart. Direction-versjon 0 betyr åtte retningar; kontrolltilgang bruker operasjonsbiten.
- Ny delt policy `cameraControls.ts` styrer knappar og PTZ-inngangar. Ukjent profil gjev forklaring og refresh. Sikkerheits-Stop er alltid tillate for kameratypar med PTZ-adapter. Panasonic held dei eksisterande kontrollane; generiske straumar har ingen PTZ-panel.
- Ingen periodisk zoomlesing eller automatisk preset-/lyslesing når den aktuelle kameravisinga manglar støtte. Profilen har eksplisitt eigar slik at kontrollar frå førre kamera heller ikkje startar ei mellombels polling-lesing på neste.
- Linseval er lagra/validert som auto/single/dual. Auto bruker rapportert TrackMix-modell, ikkje brukarvalt namn eller positivt kanalnummer. Numerisk view channel bevarer NVR-kanalval.
- Tilkoplingstest toler kamera utan preset-støtte. Inga ny nettverksteneste eller dependency.
- Første bygg godkjent; målretta testkøyring: 67 testar bestått før siste tilleggstest for retningstilgang. Gamle PTZ-testar ventar no på rapportert profil før dei prøver rørsle, sidan rørsle under ukjent støtte med vilje er blokkert.
- Står att: full testpakke/bygg, sluttgjennomgang og dokumentasjon. Ikkje publiser eller commit denne bolken utan eigen bestilling.

## Endeleg kontrollpunkt

### Leveranse

- **R12 – Medium, parser:** `src/main/reolinkCapabilities.ts` erstattar brei substring-/rekursiv truthiness-matching. Vald kontrollkanal er avgjerande; rotdata på ein NVR eller ein annan kanal får ikkje aktivere kontrollar. Parseren toler flate, indekserte og kanalmerkte former, numeriske strengar og malformed data utan å aktivere kontrollar på vilkårleg innhald. `getProfile` sender `camera.channel`, uavhengig av videokanalen.
- **R12 – Medium, UI:** `src/shared/cameraControls.ts` og `App.tsx` brukar same kontrollpolicy for mus og tastatur. PTZ, fokus, zoom og preset-skriving er skilde. Fire-retningars rapportering deaktiverer diagonalane. Ukjent/leseavgrensa støtte får forklaring og refresh; Stop blir bevart. Generiske straumar har ingen PTZ-panel, Panasonic held eksisterande PTZ/zoom/fokus/preset-veg og har ingen lyskontrollar eller preset-skriving.
- **R12 – Medium, linser:** `lensMode` i types/validation/store/form bevarer eit eksplisitt auto/single/dual-val. Namn og positivt stream-kanalnummer gjev ikkje lenger falsk dual-lens. Auto er avgrensa til rapportert TrackMix på kontrollkanal 0; dual-override vel Wide 0 / Zoom 1 med vilje. Det frie numeriske view channel-feltet kan lagre NVR-kanalar over 1.
- **Stabilitet/yting:** Zoompolling, preset- og lyslesingar blir ikkje starta utan støtte. Profileigarskap hindrar eit kall på neste kamera basert på førre kamera sine funksjonar. Endra støtte ved refresh kansellerer ventande zoomtimarar og avviser gamle zoomresultat. Tilkoplingstest toler manglande presets på fastkamera.
- Ingen endring i High/Low-policy, TLS, credential-lagring, go2rtc, stadfesting av sirene/sletting eller releaseoppsett.

### Kontrollar

- `npm test`: **188/188 testar, 20/20 filer**, etter siste kodeendring.
- `npm run build`: TypeScript (renderer/main) og Vite godkjende etter siste kodeendring.
- 32 nye testar: 19 adapter-/parser-/profiltestar, 4 kontroll-/linsepolicytestar, 1 lagring/valideringstest og 8 renderer-testar. Dekkjer val av NVR-kanal, bitrettar og ver=0, ukjent/malformed, PT utan zoom, AF utan pan/tilt, TrackMix-zoom, readonly, snarvegar, kamerabyte, refresh/revokering, Panasonic/generic og varig linseoverride. Dei tidlegare race-/PTZ-stopp-testane er framleis med.
- `node node_modules/electron/cli.js scripts/smokeLocalPlayback.cjs`: **PASS**, exit 0. Ekte Electron, syntetiske loopback-kjelder, OS-kryptering/backup, URL-normalisering, iframe/WebSocket/snapshot og lokal API-tilgang. To GPU-meldingar kom etter PASS ved avslutting; ingen test feila. Dette er ikkje ein test av fysisk videodekoding eller kameraets capability-rapportering.
- `git diff --check`: godkjend. Alle kode-/test-/dokumentasjonsfiler er lagra lokalt. Ingen dependencies installerte eller versjonar endra.

### Risiko og avgrensingar

- **Medium–High endringsrisiko på ukjend firmware:** rapporteringa varierer. Manglande/ukjende felt deaktiverer kontrollen og tilbyr refresh; vi gjetter ikkje tilgang frå ein modell eller eit namn. Fungerande kamera med mangelfull GetAbility kan difor trenge ei dokumentert adaptertilpassing etter ein reell fixture. Linseoverride gir ikkje overstyring av brukartilgang.
- Dette er kontrolltilgjenge i appen, ikkje ein ny autorisasjonsgrense. Kameraet må framleis handheve tilgang på kvar kommando; profilinformasjon kan bli forelda mellom oppfriskingar.
- Ingen fysiske kamera, privat brukaroppsett, macOS eller nye distribusjonspakkar er testa. Før release: kontroller TrackMix, fastkamera, leseavgrensa konto, NVR-kanal, Panasonic og generisk RTSP/RTSPS på aktuell maskinvare.
- Auto-identifisering av fleire dual-lens-familiar og NVR-kanalspesifikk modelloppdaging er ikkje implementert; bruk eksplisitt linseval. Full ONVIF service-/profiloppdaging (R13) står att.

### Neste bolk

**R07/R14/G01:** reell avspelings-/kamerahelse og adapterspesifikk tilkoplingstest. Appen kan framleis omtale ei starta bridge-side som live før videobilete faktisk er stadfesta. Neste arbeid bør skilje tilkopling, videostraumen og kameraets API-status og gi betre reconnect-diagnostikk. Denne R12-bolken treng ikkje startast på nytt ved avbrot.
