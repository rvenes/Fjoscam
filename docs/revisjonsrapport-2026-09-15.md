# Fjoscam – vedlikehaldsrevisjon

Dato: 15. september 2026. Prosjekt: `H:\Koding\Fjoscam`. Versjon: 1.0.7. Git HEAD: `213a0d4`.

**Status: ferdig revisjonsrapport, 46 prioriterte funn og forbetringspunkt.** Ingen kjeldekode er endra. Denne fila er rapporten, ikkje ei bestilling om å gjennomføre tiltaka.

Dette er situasjonsbiletet frå revisjonsdatoen. Seinare autoriserte rettingar er dokumenterte i [første bolk](utbetring-framdrift-2026-09-17.md), [URL-kryptering](utbetring-framdrift-2026-09-18.md), [HTTPS-tillit](utbetring-tls-framdrift.md), [eksplisitt ONVIF-fallback/PTZ-stopp](utbetring-onvif-framdrift.md) og [verifisert RTSPS-transport](utbetring-rtsps-framdrift.md). Sertifikatkontrollen omfattar no òg faktisk RTSPS og reconnect; legacy HTTP/RTSP er framleis tilgjengeleg og fysisk kamera-/plattformkontroll står att. R13 er delvis retta; full service-/kanaloppdaging og XML-parser står att.

## Kontrollgrunnlag og avgrensing

**Siste samla status:** [Vedlikehaldsindeksen](VEDLIKEHALD-STATUS.md) er det aktive kontrollpunktet. Nye bolkar 21. september omfattar [D05 byggverktøy](utbetring-byggverktoy-framdrift.md), [G02 nettverkssøk](utbetring-nettverkssok-framdrift.md), [WS-Discovery XML](utbetring-discovery-xml-framdrift.md), [zoomcache/PTZ-kø](utbetring-zoomcache-framdrift.md) og [snapshot-livssyklus](utbetring-snapshot-livssyklus-framdrift.md). Siste kontrollpunkt 22. september: 487 testar, bygg og Electron-smoke består. Isolert Windows-pakke app/TLS/playback ved 482-testpunktet inkluderer updaterførebuing med falsk installatør. Seinare bolkar og nøyaktige avgrensingar er samla i vedlikehaldsindeksen. «Neste bolk» i dei eldre avsnitta nedanfor er historiske kontrollpunkt, ikkje den gjeldande arbeidslista.

Seinare vedlikehald/UX: [D03 ubrukt kode](utbetring-ubrukt-kode-framdrift.md), [G04 fullskjerm](utbetring-fullskjerm-framdrift.md) og [G04 dialogfokus](utbetring-dialogar-framdrift.md) er lagra. 356 testar / 31 filer, unused-kontroll i begge bygg, og ekte Electron/Chromium-modaltest består. CSS-restar, samordna språk og eventuelle lagra preferansar står att. Neste bolk er D06 vendor-proveniens.

Seinare E04-retting: [straumrydding](utbetring-straumrydding-framdrift.md) dokumenterer release før ny vising, invalidasjon ved config-endring og kontrollert avslutting av eigen child for å fjerne gamle streamregistreringar/løyndomar frå prosessminnet. 348 testar, bygg og ekte Electron release/reopen består. Meir metadata-/snapshot-cachearbeid og framtidig multiview-livssyklus er separate oppgåver.

Seinare G01/R14-retting: [bridge-helse og recovery](utbetring-bridge-helse-framdrift.md) dokumenterer avgrensa restart/attregistrering av synleg straum, trygg child-diagnostikk og player-reload utan kvalitetsbyte. 343 testar, bygg og ekte Electron child-krasj/recovery består. Levande fastlåst child, diagnostikkeksport og fysisk kamera-/Mac-test står att; E04-registerrydding er neste bolk.

Seinare R13-retting: [ONVIF-oppdaging/XML](utbetring-onvif-oppdaging-framdrift.md) og [rørslefornying](utbetring-onvif-rorsle-framdrift.md) dokumenterer namespace-validering, same-origin-serviceoppdaging, avgrensa profilcache, avvising av tvitydig NVR-val og Stop før vidare rørsle. 334 testar og bygg består; oppdaging/dependency-bolken er òg verifisert i isolert Windows-pakke. Eksplisitt NVR-/presetmapping, HTTPS-/Media2-ONVIF og fysisk firmwaretest står att. G01/prosesshelse er neste bolk.

Seinare polling-/ytingsretting: [E01/E02-framdrift](utbetring-polling-metadata-framdrift.md) dokumenterer synleg/tilkopla zoompolling med backoff, deling av pågåande lesingar, video før metadata og serialiserte/samanslegne lysendringar. 304 testar, bygg og ekte Electron-kontroll er godkjende. Full R13 og vidare G01 er neste større opne bolkar; attståande mindre E02-optimalisering er dokumentert.

Seinare IPC-/loggretting: [S06/S07-framdrift](utbetring-ipc-logging-framdrift.md) dokumenterer runtime-kontraktar, eigarskap/opphavsvern, produksjons-/utviklings-CSP, felles sanitering og avgrensa loggkø. 292 testar, bygg og ekte Electron-kontroll av både bygd React-app og lokal video er godkjende. E01/E02, full R13 og vidare G01 står att; neste prioritetar er lagra i framdriftsfila.

Seinare auth-retting: [R07/R10-framdrift](utbetring-snapshot-auth-framdrift.md) dokumenterer avgrensa Snap/API-tokenfornying, samtidigheits-/utloggingsvern, kameraets tokenlevetid, innloggingspause og trygg strukturert feilhandtering. 233 testar, bygg og ekte Electron TLS-kontroll er godkjende. Fysisk firmwarekontroll står att.

Seinare avspelingsretting: [R14/G01/R15-framdrift](utbetring-avspelingsstatus-framdrift.md) dokumenterer reell frame-observasjon, separat API/video-status, eksplisitt Reconnect, adaptertestar, samla lydstyring og delvis R07 bildevalidering. 205 testar, bygg og ekte Electron-kontroll er godkjende; Snap-auth-retry og automatisk process-supervisjon står att.

Seinare funksjonsretting: [R12-framdrift](utbetring-capabilities-framdrift.md) dokumenterer kanalspesifikk funksjonstolking, støtte/tilgang/ukjent, sams kontrollvern for mus og tastatur og eksplisitt linseval. 188 testar og bygg er godkjende. Firmware-/hardwarekontroll står att; opphavlege funn nedanfor er historikk.

Seinare renderer-/cache-retting: [R08/R09-framdrift](utbetring-kamerabyte-framdrift.md) dokumenterer vern mot gamle kamerasvar, éin straumstart, serialiserte konfigurasjonsendringar, rydding av zoomtimarar og cache-invalidasjon ved kanal-/kvalitetsbyte. 156 testar og bygg er godkjende; fysisk kamera-/Mac-verifikasjon står att.

Seinare dependency-retting: [S08-framdrift](utbetring-dependencies-framdrift.md) dokumenterer oppdaterte versjonar, 26→0 npm-varsel og isolert pakka Windows-verifikasjon. Opphavlege funn og audit-tal nedanfor er bevarte som historikk; Mac-/installerverifikasjon står framleis att før release.

- 41 spora filer: 38 tekstfiler og 3 go2rtc-binærar. Alle eigne kjeldefiler, testar, stilark, konfigurasjonar, byggjeskript og dokument er undersøkte. Lockfile er analysert maskinelt for alle 483 pakkeoppføringar, versjonar, kjelder og integritet.
- Også undersøkt: eksisterande uspora [RELEASING.md](H:/Koding/Fjoscam/RELEASING.md), [docs/plans/fjoscam-agents-refaktorering-plan.html](H:/Koding/Fjoscam/docs/plans/fjoscam-agents-refaktorering-plan.html) og strukturen i ignorert [.claude/settings.local.json](H:/Koding/Fjoscam/.claude/settings.local.json).
- Eksisterande brukarendringar ved start: [AGENTS.md](H:/Koding/Fjoscam/AGENTS.md), [README.md](H:/Koding/Fjoscam/README.md), [docs/reolink-lan-api-notes.md](H:/Koding/Fjoscam/docs/reolink-lan-api-notes.md); uspora [RELEASING.md](H:/Koding/Fjoscam/RELEASING.md) og planmappa. Desse er ikkje endra av revisjonen.
- `npm test`: **36/36 testar, 5/5 testfiler, bestått**.
- `npm run build`: **begge TypeScript-prosjekta og Vite bestått**. Bygginga oppdaterte generert, ignorert output. Ingen pakking/publisering.
- Ekstra `tsc --noEmit --noUnusedLocals --noUnusedParameters`: fem ubrukte funksjonar, lista under kodekvalitet.
- Køyrt på Windows, Node **24.19.0**, npm **12.0.2**; CI/releaseguiden spesifiserer Node 22. Ingen reinstallasjon eller lockfileoppdatering.
- Ingen ekte kamera, privat kamerakonfigurasjon eller ekte kamerapassord er opna/kontakta. Ingen PTZ eller sirene er aktivert. Ingen Mac-/serverarbeid, endrande Git-operasjonar, staging eller publisering er utført.
- Avgrensa syntetiske reproduksjonar køyrde frå minnet, med mocka modular eller HTTP på loopback. Éin isolert go2rtc-test brukte midlertidig konfigurasjon, kunstig passord og avslått RTSP-/WebRTC-lytting. Testprosessen vart avslutta.
- Ingen fullstendig gjennomgang av tredjepartskode eller alle historiske Git-objekt er hevda. Relevante go2rtc-kjelder for nøyaktig versjon og installert updaterkode er undersøkte.

## A. Executive summary

Teknologivalet Electron + React + TypeScript og LAN-baserte kameraadapterar er framleis fornuftig. Ei full omskriving er ikkje tilrådd. Den viktigaste gjelda ligg i tryggleiksgrenser, asynkron livssyklus, reell straumstatus og manglande testar av feilstiar. Oppdatert syntax eller nyaste majorversjon ville ikkje i seg sjølv rette desse problema.

Dei alvorlegaste funna:

1. Reolink-passord blir indirekte skrivne i klartekst i go2rtc si YAML-fil. Dette går utover det kjende problemet med generiske straum-URL-ar.
2. go2rtc sitt lokale konfigurasjons-API returnerer desse dataa utan autentisering. RTSP-tenaren er heller ikkje slått av og har standard lytting på alle grensesnitt.
3. `testConnection()` returnerer RTSP-URL med dekryptert passord til renderer.
4. TLS-verifisering er generelt slått av; redirects kan sende login-body til andre vertar; HTTPS kan falle tilbake til HTTP.
5. macOS-gjenopning etter lukking av siste vindauge bryt livssyklusen til tenestene.
6. go2rtc-oppstart kan starte to prosessar samstundes, og `spawn` manglar error-handler.
7. PTZ-stopp er ikkje sikra ved kamerabyte/fokustap og kan konkurrere med eldre rørslekommandoar.
8. Avbrotne HTTP-svar kan etterlate promises uavslutta; discovery og MJPEG har eigne krasj-/ressursrisikoar.

Ingen Critical utnytting i sjølve Fjoscam er stadfesta. `npm audit` sine Critical-pakkevarsel skal ikkje forvekslast med stadfesta Critical-funn i appen.

**Vedlikehaldstilråding:** behald produktet, kameraadapterane og go2rtc. Rett først dei konkrete tryggleiks- og livssyklusfeila med avgrensa regresjonstestar. Del deretter opp renderer og legg til betre diagnostikk. Testresultatet er eit godt utgangspunkt, men 36 små testar er ikkje dokumentasjon på langvarig drift, nettverksfeil eller trygg release.

### Arkitektur slik ho faktisk fungerer

```text
React-renderer
    │ avgrensa preload-metodar / IPC
    ▼
Electron main
    ├─ CameraStore → cameras.json + backup + safeStorage-passord
    ├─ ReolinkClient → lokal CGI/HTTP(S), sessionar og capabilities
    │                  └─ ONVIF PTZ-fallback
    ├─ PanasonicClient → Basic-auth, legacy CGI og MJPEG
    ├─ SnapshotServer → loopback HTTP, snapshots/MJPEG
    ├─ Go2RtcBridge → medfølgjande subprocess → kamera-RTSP(S)
    │                                      └─ iframe med WebRTC/MSE m.m.
    ├─ discovery → WS-Discovery; portscan dersom ingen svar
    └─ electron-updater → generic HTTPS-feed
```

Det er éi aktiv kameravising. Fleire lagra kamera er støtta; samtidig multiview er ikkje implementert. Reolink API-styring og RTSP-avspeling er separate forbindelsar. ONVIF er PTZ-fallback, ikkje ein generell ONVIF-kameramotor. Generisk RTSP har ingen Fjoscam-PTZ. Panasonic har ingen audio.

### Alvor og bevisnivå

- **Critical:** svært alvorleg, direkte utnyttbar konsekvens med få føresetnader. Ingen slik appfeil stadfesta her.
- **High:** tap/eksponering av credentials eller kameradata, utilsikta kamerarørsle, krasj eller vesentleg svikt i støtta drift.
- **Medium:** robustheits-, kompatibilitets- eller forsvarsproblem med avgrensa konsekvens/fleire føresetnader.
- **Low:** avgrensa vedlikehalds- eller brukarproblem.
- **Nice-to-have:** valfri produktutviding.

«Reprodusert» betyr syntetisk køyring av aktuell kode eller medfølgjande binær. «Kodefunn» betyr ein identifisert feilveg; konsekvensen på ekte kamera/plattform kan krevje røyketest. Tilrådingar er ikkje presenterte som allereie gjennomførte rettingar. Ingen risiko er oppgradert berre fordi koden kan vere AI-generert.

## B. Security findings

### S01 – High: go2rtc skriv Reolink-passord i klartekst

- **Fil/område:** [src/main/go2rtcBridge.ts:29–35,104–127](H:/Koding/Fjoscam/src/main/go2rtcBridge.ts:29); [src/main/reolinkClient.ts:571–575](H:/Koding/Fjoscam/src/main/reolinkClient.ts:571); [src/main/store.ts:42–56](H:/Koding/Fjoscam/src/main/store.ts:42).
- **Problem:** `PUT /api/streams` i go2rtc 1.9.14 persisterer `src` til konfigurasjonsfila. Fjoscam sender ei RTSP-adresse med brukarnamn/passord. Den genererte fila i userData/go2rtc inneheld dermed dekrypterte Reolink-passord. Generiske URL-ar ligg dessutan i `cameras.json` og backup.
- **Kvifor:** safeStorage-vernet rundt passordfeltet blir omgått av den vidare lagringskjeda; disk-/backupkopiar kan innehalde credentials.
- **Forslag:** bruk ei verifisert registrering som berre endrar minne, t.d. eigna PATCH-flyt i denne go2rtc-versjonen, og flytt generiske credential-/token-URL-ar inn i kryptert secret-lagring. Lag ein eksplisitt migreringsplan for eksisterande filer utan å slette brukarbackup automatisk.
- **Endringsrisiko:** Medium; krev kompatibilitetstest av registrering, oppstart og trygg migrering.
- **Bevis:** isolert medfølgjande Windows-binær: PUT 200 og syntetisk passord funne i YAML. Ingen ekte data brukte.
- **Kjelde:** [go2rtc 1.9.14 streams API](https://github.com/AlexxIT/go2rtc/blob/v1.9.14/internal/streams/api.go).

### S02 – High: dekryptert passord går gjennom IPC til renderer

- **Fil/område:** [src/main/reolinkClient.ts:108–125](H:/Koding/Fjoscam/src/main/reolinkClient.ts:108); [src/main/main.ts:186–190](H:/Koding/Fjoscam/src/main/main.ts:186); [src/shared/types.ts:153–164](H:/Koding/Fjoscam/src/shared/types.ts:153); [src/renderer/App.tsx:459–465](H:/Koding/Fjoscam/src/renderer/App.tsx:459).
- **Problem:** `testConnection()` returnerer `streamUrl: buildRtspUrl(camera)` med passord. `testCamera()` lagrar resultatet i renderer-state. Vanleg `getState()` er passordfri for Reolink, men denne operasjonen er det ikkje.
- **Kvifor:** aukar tilgangen til lagra løyndomar ved rendererkompromittering og feilsøking.
- **Forslag:** fjern credential-URL frå returtypen; returner berre nødvendige status-/profilfelt og lokal straumidentitet.
- **Endringsrisiko:** Low; feltet blir ikkje brukt til avspeling i renderer.
- **Bevis:** syntetisk kall returnerte passordet i resultatet.

### S03 – High: RTSP-tenar kan eksponere straumar på LAN

- **Fil/område:** [src/main/go2rtcBridge.ts:104–119](H:/Koding/Fjoscam/src/main/go2rtcBridge.ts:104); `vendor/go2rtc/*`.
- **Problem:** konfigurasjonen avgrensar API og WebRTC til loopback, men utelèt RTSP. Medfølgjande go2rtc 1.9.14 har standard `:8554`, utan brukar/passord.
- **Kvifor:** registrerte straumar kan nåast frå andre maskiner dersom brannmur tillèt det og straumnamnet er kjent. UUID er ikkje autentisering.
- **Forslag:** slå eksplisitt av RTSP-tenaren dersom Fjoscam berre treng RTSP-klienten; alternativt bind til loopback med nødvendig tilgangskontroll. Verifiser lyttande portar i pakka app.
- **Endringsrisiko:** Low–Medium; kontroller at ingen aktuell avspelingsveg krev lokal RTSP-utgang.
- **Bevis:** kjeldekontroll mot versjonen identifisert i alle tre binærane; ikkje testa med LAN-tilkopling.
- **Kjelde:** [go2rtc 1.9.14 RTSP-standardar](https://github.com/AlexxIT/go2rtc/blob/v1.9.14/internal/rtsp/rtsp.go).

### S04 – High: lokalt administrasjons-API utan autentisering

- **Fil/område:** [src/main/go2rtcBridge.ts:104–127](H:/Koding/Fjoscam/src/main/go2rtcBridge.ts:104); [src/main/snapshotServer.ts:16–31,99–116](H:/Koding/Fjoscam/src/main/snapshotServer.ts:16).
- **Problem:** go2rtc API har ingen autentisering eller avgrensa endpoint-liste. Isolert test fekk `/api/config` med passord utan autentisering. Snapshotserveren brukar kamera-ID som einaste tilgangsparameter.
- **Kvifor:** loopback vernar mot direkte LAN-tilgang, men er ikkje ei grense mellom lokale brukarar/prosessar. Administrasjonsendepunkt er langt kraftigare enn naudsynt avspeling. Manglande CORS er ikkje autentisering.
- **Forslag:** per-app-session autentisering, lokalt auth-krav i go2rtc, avgrensa API-/proxyflate og token for biletruter. Ikkje legg hemmeleg API-passord i renderer-URL.
- **Endringsrisiko:** Medium–High; WebSocket, iframe, MSE og biletlaster må framleis fungere.
- **Kjelde:** [go2rtc API-konfigurasjon](https://github.com/AlexxIT/go2rtc/blob/v1.9.14/internal/api/api.go).

### S05 – High: TLS og redirects vernar ikkje kameracredentials godt nok

- **Fil/område:** [src/main/request.ts:6–8,72–104](H:/Koding/Fjoscam/src/main/request.ts:6); [src/main/reolinkClient.ts:545–567,639–647](H:/Koding/Fjoscam/src/main/reolinkClient.ts:545); [src/main/panasonicClient.ts:61–83](H:/Koding/Fjoscam/src/main/panasonicClient.ts:61).
- **Problem:** `rejectUnauthorized:false` er standard. POST-body blir vidaresend ved cross-origin redirect. Endpoint-fallback kan gå frå HTTPS til HTTP. HTTP er standard i nytt kameraskjema. Panasonic sender Basic-auth.
- **Kvifor:** ein feil eller manipulert LAN-endpoint kan få login-data; HTTPS-valet gir ikkje stadfesta serveridentitet.
- **Forslag:** eksplisitt per-kamera TLS-policy med pinning/akseptert sjølvsignert sertifikat; avvis cross-host redirects og nedgradering som standard. Tillat dokumentert legacy-unntak per kamera. Ikkje fjern nødvendig Panasonic-kompatibilitet globalt.
- **Endringsrisiko:** High kompatibilitetsrisiko; test eldre firmware, eigne portar og sjølvsignerte sertifikat.
- **Tillegg:** go2rtc 1.9.14 hoppar over sertifikatkontroll for RTSPS mot IP-literal. [Versjonsspesifikk TLS-kode](https://github.com/AlexxIT/go2rtc/blob/v1.9.14/pkg/tcp/dial.go).

### S06 – Medium: svake validerings- og Electron-grenser

- **Fil/område:** [src/main/main.ts:25–54,156–292](H:/Koding/Fjoscam/src/main/main.ts:25); [src/shared/validation.ts:3–24](H:/Koding/Fjoscam/src/shared/validation.ts:3); [src/main/panasonicClient.ts:29–43](H:/Koding/Fjoscam/src/main/panasonicClient.ts:29); [index.html](H:/Koding/Fjoscam/index.html).
- **Problem:** IPC kontrollerer ikkje senderFrame/origin og validerer mange argument berre gjennom TypeScript-typar. Generic aksepterer andre skjema enn RTSP/RTSPS; Panasonic-path kan vere absolutt URL til ein annan vert. Host-normalisering skil ikkje sikkert host/port/userinfo. CSP og eksplisitt navigasjonsvern manglar.
- **Kvifor:** feilinput eller rendererkompromittering får større handlingsrom. Panasonic sin Basic-auth følgjer vald absolutt URL.
- **Forslag:** runtime-valider IPC; tillat berre forventa toppframe; avgrens protokollar og URL-opphav; blokker uventa navigasjon; innfør CSP som toler lokal media.
- **Endringsrisiko:** Medium; bevar gyldige lokale DNS-namn, IPv4/IPv6 og kameraspesifikke paths.
- **Bevis/avgrensing:** Fjoscam-validator aksepterte syntetisk `exec:`-input, men go2rtc 1.9.14 avviste denne kjelda med HTTP 400. Vilkårleg kommandoeksekvering via dette feltet er derfor **ikkje** stadfesta.
- **Kjelde:** [Electron sine tryggleiksråd](https://github.com/electron/electron/blob/main/docs/tutorial/security.md).

### S07 – Medium: sanitering er fragmentert og rå kamerasvar kan lekke

- **Fil/område:** [src/main/request.ts:21–25,108–114](H:/Koding/Fjoscam/src/main/request.ts:21); [src/main/snapshotServer.ts:18–19,83–89,136–137](H:/Koding/Fjoscam/src/main/snapshotServer.ts:18); [src/main/main.ts:359–364](H:/Koding/Fjoscam/src/main/main.ts:359); [src/main/go2rtcBridge.ts:211–216](H:/Koding/Fjoscam/src/main/go2rtcBridge.ts:211); [src/main/logging.ts](H:/Koding/Fjoscam/src/main/logging.ts).
- **Problem:** rå response-body blir lagt i feiltekst. Snapshotlogging sanitiserer ikkje. To andre filer dupliserer regex som berre kjenner nokre token- og RTSP-passordformer; URL-path som fungerer som tilgangstoken og JSON-passord er ikkje dekte.
- **Kvifor:** ei kamera-/proxyfeilmelding som ekkoar credentials kan gå til logg eller renderer.
- **Forslag:** strukturerte feil med status/kode og trygg tekst; felles sanitering ved logggrensa; ingen rå svarbody i vanlege loggar. Test med syntetiske credential-former.
- **Endringsrisiko:** Low–Medium; må bevare nok diagnostikk til feilsøking.

### S08 – High: tryggleiksoppdateringar i avhengigheitene er etterslepne

- **Fil/område:** [package.json](H:/Koding/Fjoscam/package.json); [package-lock.json](H:/Koding/Fjoscam/package-lock.json); [.github/workflows/ci.yml](H:/Koding/Fjoscam/.github/workflows/ci.yml).
- **Problem:** audit gav **26 pakkevarsel: 3 Critical, 20 High, 3 Moderate**. Med `--omit=dev`: **3 High**, knytte til `electron-updater`, `builder-util-runtime` og `js-yaml`. Electron er devDependency i npm, men inngår i runtime og må vurderast separat.
- **Kvifor:** installert Electron 41.3.0 og fleire bygge-/testverktøy manglar tryggleiksrettingar. Audit-tal inkluderer avhengigheitskjeder og er ikkje talet på uavhengige utnyttbare feil i Fjoscam.
- **Forslag:** oppdater kontrollert innanfor eksisterande kompatible seriar først; prioriter Electron, updater og YAML-parser, så Vite/Vitest og byggeverktøy. Test pakka app og begge målplattformer etterpå. Ikkje køyr blind `audit fix --force`.
- **Endringsrisiko:** Medium–High for Electron/avspeling/updater; mindre for reine verktøyoppdateringar.
- **Rekkjevidd:** updater sin PRIVATE-TOKEN-redirect-feil er ikkje vist nåbar her: generic-feeden set ingen slike credentials. JS-YAML les derimot ekstern update-metadata. AppImage-spesifikke varsel gjeld ikkje dei oppgitte Windows/macOS-måla. Critical i shell-quote/concurrently og tar er verktøyrisiko, ikkje bevist kamera-RCE.
- **Kjelder:** [updater-varsel](https://github.com/advisories/GHSA-p2f4-r6v6-j797), [YAML-varsel](https://github.com/advisories/GHSA-2883-xcg3-v3hh).

Den vidare Electron-planen må òg liggje på ei støtta majorserie. `npm outdated` oppgav 44.3.0 som latest, medan prosjektet brukar 41.3.0; ei oppdatering til 41.10.7 åleine er derfor berre eit mogleg mellomsteg. Electron støttar dei tre siste stabile majorseriane. Verifiser støtte på gjennomføringsdatoen og test eit kontrollert majorløft. [Electron sin støttepolicy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines).

### Tryggleik som er kontrollert utan stadfesta funn

- Det vart ikkje funne ekte private nøklar eller kjende leverandørtoken i det maskinelle mønstersøket i spora tekstfiler. URL-treff var syntetiske testar og kode som byggjer URL. Dette er ikkje ein garanti for fråvær av løyndomar i all Git-historikk eller gamle releaseartefaktar.
- Subprocess-start i eigen kode brukar `spawn(executable, args)`/`spawnSync('codesign', args)` utan shell og med avgrensa argument. Ingen direkte shell injection er påvist. I go2rtc-testen vart `exec:` avvist av upstream-validering.
- Snapshot-path blir brukt til kameraoppslag, ikkje som filsti; direkte path traversal i denne ruta er ikkje påvist. URL-validering og avgrensing av lokale API er likevel nødvendige, jf. S04/S06.
- React renderar vanlege tekstfelt; det er ikkje funne `dangerouslySetInnerHTML` eller runtime-eval av kameradata i eigen renderer. Scriptinjeksjonen for audio set ein klampa talverdi og ein boolean, og er ikkje i seg sjølv ein påvist injection-feil.
- Eksterne lenkjer har HTTPS-/vertsallowlist, og nye vindauge blir nekta. Dette er eit godt vern som bør bevarast saman med ytterlegare navigasjons-/IPC-kontroll.

## C. Bugs/reliability findings

| ID | Grad | Fil/område | Problem og konsekvens | Konkret løysing | Endringsrisiko |
|---|---|---|---|---|---|
| R01 | High | [main.ts:137–154,62–64](H:/Koding/Fjoscam/src/main/main.ts:137) | Siste vindauge kallar permanent shutdown også på macOS. Activate opprettar berre vindauge; snapshotserveren er stoppa og shutdown-flagget står true. Seinare go2rtc kan starte, men neste shutdown returnerer straks. | Skil vindaugslivssyklus frå appslutt; bruk éi shutdown-promise og restartable service-state. | Medium; må røyketestast på Mac. |
| R02 | High | [go2rtcBridge.ts:29–82,139–173](H:/Koding/Fjoscam/src/main/go2rtcBridge.ts:29) | To parallelle start-kall passerer sjekken før await writeConfig og spawnar kvar sin prosess. Manglar child error-handler. Fast port godtek vilkårleg svar som ready. PUT blir ikkje avventa. | Single-flight start-promise, error/exit-handtering, kontroller eigarskap til bridge, avvent registrering, verifiser stream. | Medium. Syntetisk test gav 2 spawn og 0 error-listeners. |
| R03 | High | [App.tsx:147–238,656–677,818–854](H:/Koding/Fjoscam/src/renderer/App.tsx:147); [main.ts:250–257](H:/Koding/Fjoscam/src/main/main.ts:250); [reolinkClient.ts:267–296](H:/Koding/Fjoscam/src/main/reolinkClient.ts:267) | Ingen stop på blur/visibility/camera switch. Keyup sender til noverande kamera. Move og stop kan fullføre i feil rekkjefølgje, særleg med endpoint/ONVIF-fallback. | Knyt PTZ-operasjonen til opphavleg kamera, prioriter stop, kanseller eldre move, legg watchdog og stop ved overgangar. | High; fysisk kamerarørsle må testast kontrollert. |
| R04 | High | [request.ts:91–127](H:/Koding/Fjoscam/src/main/request.ts:91); [go2rtcBridge.ts:148–174](H:/Koding/Fjoscam/src/main/go2rtcBridge.ts:148) | Avbroten response etter headers blir ikkje avvist; manglar response error/aborted/close-handler. Svarbuffer er uavgrensa, timeout er inaktivitet og ikkje total deadline. | Avslutt promise ved premature close, total AbortSignal-deadline, storleiksgrenser og rydding. | Medium. Lokal test var framleis pending etter 6500 ms, utover 6000 ms innstilt timeout. |
| R05 | High | [discovery.ts:24–39,44–55](H:/Koding/Fjoscam/src/main/discovery.ts:24) | Ugyldig prosentkoding i nettverkssvar kastar URIError i finish-callback. Finish er ikkje idempotent og send/finish-timar blir ikkje rydda ved error. | Trygg parsing per melding; idempotent finish; rydd timerar og socket; avgrens responsmengde. | Low–Medium. Syntetisk malformed Scope gav URIError. |
| R06 | High | [snapshotServer.ts:31–71,140–178](H:/Koding/Fjoscam/src/main/snapshotServer.ts:31) | Disconnect-handler blir installert etter await. Tidleg avbrot kan la upstream leve. MJPEG med JPEG-start utan slutt gir uavgrensa buffer. Ingen backpressure. | Abonner på response close før await; avbryt upstream og avvis sein oppstart; maks frame-buffer og pause/drain eller frame-dropp. | Medium–High; bevar legacy-parseren. Syntetisk avbrot lét upstream udestroyed. |
| R07 | Medium | [reolinkClient.ts:349–354](H:/Koding/Fjoscam/src/main/reolinkClient.ts:349); [snapshotServer.ts:61–76](H:/Koding/Fjoscam/src/main/snapshotServer.ts:61) | Snap har ikkje same token-retry som JSON-kall og aksepterer ikkje-bilete som frame. | Klassifiser auth-feil, avgrensa relogin, valider content-type og JPEG. | Medium, firmwarevariasjon. |
| R08 | High | [App.tsx:240–261,303–315,361–415,439–497](H:/Koding/Fjoscam/src/renderer/App.tsx:240) | Profil/lys har ingen generasjonskontroll. Sein feil frå gammal runtime kan oppdatere ny vising. Stream startast både av effect og eksplisitte timarar; gamle timarar kan vinne etter kamerabyte. | Éin eigar for stream-start; generasjon/kamera-ID på alle asynkrone resultat og rydde timarar. | Medium; krev UI-racetestar. |
| R09 | Medium | `App.tsx:261,418–428`; [main.ts:167–183,294–299](H:/Koding/Fjoscam/src/main/main.ts:167); [reolinkClient.ts:104–106](H:/Koding/Fjoscam/src/main/reolinkClient.ts:104) | Endra host/passord/control channel med same ID restartar ikkje effect. Camera-cache blir ikkje ugyldig ved quality/channel, og session/ONVIF/range/override-cache følgjer ikkje redigering. Cache slettast før lagring, slik at parallell lesing kan fylle gamle data. | Invalider etter vellukka lagring, bruk konfigurasjonsrevisjon og samla cache-livssyklus. | Medium. |
| R10 | Medium | [reolinkClient.ts:427–469,490–503,635–637](H:/Koding/Fjoscam/src/main/reolinkClient.ts:427) | Pending login kan fylle sessions etter logout. Alle API-feil slettar session; auth-retry bruker brei tekstmatching. Same host/brukar deler session på tvers av kamera-ID medan logoutExcept brukar ID. | Generasjonsvern, strukturerte rspCode, korrekt leaseTime, session-eigarskap per endpoint og referansar. | Medium. Pending-login-test gav éin session etter logoutAll. |
| R11 | High | [store.ts:87–96,153–158,206–250](H:/Koding/Fjoscam/src/main/store.ts:87) | Reorder godtek duplikat-ID og mistar andre oppføringar. Persistensvalidering sjekkar berre cameras-array; korrupte/ulesbare filer blir tom state utan varsel. CopyFile-fallback er ikkje atomisk. | Unik permutasjonskontroll, full schema-validering, synleg recovery/fail-closed ved korrupsjon og trygg atomisk feilhandtering. | Medium–High; lagringsmigrering må testast. Syntetisk reorder gav `[a,a]` frå `[a,b]`. |
| R12 | Medium | [reolinkClient.ts:697–721](H:/Koding/Fjoscam/src/main/reolinkClient.ts:697); [App.tsx:1101–1186,1774–1777](H:/Koding/Fjoscam/src/renderer/App.tsx:1101) | Capability-matching mistar nested abilityChn og blandar permit/ver. PTZ/zoom visast etter kameratype framfor reell capability. Dual-lens blir gjetta frå namn og kanal >0. | Pars kjende channel-spesifikke felt, skil støtte/tilgang/ukjent; gate controls; bruk dokumentert modellinfo med eksplisitt override. | Medium–High, variasjon mellom firmware/NVR. Syntetisk nested response gav alle flags false. |
| R13 | Medium | [onvifClient.ts:59–73,130–137](H:/Koding/Fjoscam/src/main/onvifClient.ts:59); [App.tsx:178–182](H:/Koding/Fjoscam/src/renderer/App.tsx:178) | Fast HTTP:8000/service-path, første PTZ-profil framfor vald NVR-kanal, evig profile-cache, regex XML og ingen SOAP Fault-sjekk ved HTTP 200. PT1S move blir ikkje fornya ved halde tast. | Bruk oppdaga capabilities/service-URL og kanalprofil, trygg XML/Fault-parsing, cache-invalidasjon og tidsstyrt move-fornying. | Medium–High; ikkje erstatt fungerande CGI-primærveg. |
| R14 | Medium | [App.tsx:370–412,975–1023,1331–1361](H:/Koding/Fjoscam/src/renderer/App.tsx:370); [main.ts:186–190](H:/Koding/Fjoscam/src/main/main.ts:186); [reolinkClient.ts:108–116](H:/Koding/Fjoscam/src/main/reolinkClient.ts:108) | Live/Connected blir sett ved URL/iframe-load utan video. Iframe har ikkje den onError-vegen som utløyser MJPEG-fallback. Generic-test returnerer success utan nettverk; Panasonic blir testa som Reolink; GetPtzPreset er påkravd i Reolink-test. | Separate statusar for API/bridge/video; frame-age/playing-signal; adapterspesifikk test og eksplisitt reconnect. | Medium. go2rtc har eigne reconnect-mekanismar; dei er ikkje integrerte med appstatus. |
| R15 | Medium | [App.tsx:989–1023](H:/Koding/Fjoscam/src/renderer/App.tsx:989); [main.ts:302–338](H:/Koding/Fjoscam/src/main/main.ts:302) | Audio blir styrt både frå renderer og injiserte script. Cross-origin iframe har normalt ikkje tilgjengeleg contentDocument. OnLoad køyrer berre rendererforsøket, medan eldre main-timarar kan leggje på gamle volumverdiar etter nyare endringar. | Éin main/player-eigar for lyd; bruk siste innstilling med generasjonsvern, send på frame-/video-ready og reconnect. | Medium; test treg oppstart, MSE/RTC og mute/volum på begge plattformer. Kodefunn, ikkje lydreprodusert. |
| R16 | High | [main.ts:13–24,56–65](H:/Koding/Fjoscam/src/main/main.ts:13); `store.ts:23,146–150`; [go2rtcBridge.ts:12–13](H:/Koding/Fjoscam/src/main/go2rtcBridge.ts:12) | Ingen single-instance-lås. To appinstansar kan endre same fil frå kvar si skrivekø og dele faste bridgeportar. Den eine kan sjå feil bridge eller overskrive den andre sine oppdateringar. | Be om Electron single-instance-lock før tenester startar, aktiver eksisterande vindauge ved nytt forsøk. Dersom fleirinstans er ønskt må lagring/portar isolerast eksplisitt. | Low–Medium; test dobbelstart og updater-restart. Kodefunn. |
| R17 | Medium | [go2rtcBridge.ts:46–56](H:/Koding/Fjoscam/src/main/go2rtcBridge.ts:46); [main.ts:137–154](H:/Koding/Fjoscam/src/main/main.ts:137); [updater.ts:58–60](H:/Koding/Fjoscam/src/main/updater.ts:58) | `child.killed` betyr at signal er sendt, ikkje at prosessen har avslutta. SIGKILL-fallback blir normalt hoppa over etter SIGTERM. Exit blir ikkje avventa. Overlappande shutdown returnerer straks i staden for å vente på same rydding; updater har ingen eigen førebels service-drain. | Avvent exit/close med deadline og eventuell hard avslutting av akkurat eigen child; del shutdown-promise; fullfør nødvendig rydding før installasjon blir starta. | Medium–High; viktig på macOS og ved updater. Ingen faktisk installasjon testa. |

### Presisering av dei viktigaste feilstiane

**R01 – macOS:** etter at siste vindauge er lukka, blir `snapshots.stop()` kalla og `isShuttingDown=true`. Appen blir ståande på macOS. `activate` opprettar nytt vindauge utan å starte snapshots. Reolink/go2rtc kan bli nytta igjen, men seinare shutdown blir hoppa over. Dette er ei direkte logisk motseiing i livssyklusen; reproduksjon på Mac står att.

**R03 – PTZ:** hald ei retning på kamera A, vel kamera B og slepp tasten. Keyup-handteraren brukar den då aktive kamerakonfigurasjonen. A får ikkje garantert Stop. Alt-Tab, modal/fokusflytting og renderer-lukking manglar òg stop-handtering. Ein gammal Move som kjem ut av fallback etter Stop kan starte rørsle igjen. ONVIF sin tidsavgrensa Move gir noko vern i den vegen, men CGI-handteringa set ingen tilsvarande app-watchdog. Globale snarvegar er berre sperra i tekstfelt, ikkje når ein modal er open og ein knapp har fokus.

**R08/R09 – feil kamera eller gamle innstillingar:** video har noko generasjonsvern, men profil/lys manglar det. Byt A→B medan A er treg: A sine controls kan bli viste med B som kommandamål. `setViewChannel` og `setStreamQuality` startar ny lasting både via effect og etter 120 ms; timeren bruker gammal closure og kan køyre etter endå eit kamerabyte. Redigering av host/passord med uendra ID endrar ikkje effect-dependencyane. Rett dette med eit eksplisitt aktivt kamera + konfigurasjonsrevisjon gjennom heile kjeda.

**R11 – lagring:** skrivekø, sync, tempfil og last-known-good-backup er gode løysingar og bør bevarast. Tre konkrete hol må rettast: duplikat i reorder, for svak innhaldsvalidering og at copy-fallback bryt atomisitetsløftet. Dessutan blir ENOENT, EACCES og korrupsjon likestilte som «ingen data». Brukaren bør få skilje mellom første oppstart, vellykka backup-recovery og tilfelle der begge kjelder er skadde. I sistnemnde tilfelle bør vanlege lagringar sperrast til brukar har teke stilling til recovery.

**R12/R13 – modell og firmware:** `GetAbility` bør tolkast per kontrollkanal. Eit tilfeldig felt som inneheld `alarm` betyr ikkje nødvendigvis sirene, og `ptz` betyr ikkje alltid optisk zoom. Deaktiver eller marker ukjent støtte framfor å late som generiske controls verkar. ONVIF må velje korrekt profil og handtere kameraets klokke/WS-Security og SOAP Fault eksplisitt. Det protokollbestemte SHA-1-digestet i WS-Security er ikkje grunnlag for å byte hash på eiga hand. TrackMix-quirks for IR/White LED og rapportert zoomrange er nyttige og skal behaldast.

**R14 – reconnect:** den medfølgjande go2rtc-spelaren har WebSocket-reconnect og intern avspelingsfallback. Det er derfor feil å seie at prosjektet manglar all reconnect. Fjoscam overvaker likevel ikkje faktiske frames eller bridge-exit, og startar ikkje ein avslutta child automatisk berre fordi iframe prøver igjen. Panasonic `<img>` har ingen planlagd automatisk reconnect etter brot. Vis straumtype korrekt: Reolink-iframe kan velje MSE, medan teksten alltid seier WebRTC. [Spelaren i go2rtc 1.9.14](https://github.com/AlexxIT/go2rtc/blob/v1.9.14/www/video-rtc.js).

`subprocess.killed` si tyding er dokumentert av Node; bruk prosessavsluttingshendinga for å vite om child faktisk er ute. [Node child-process API](https://nodejs.org/api/child_process.html#subprocesskilled).

## D. Architecture/code-quality findings

| ID | Grad | Fil/område | Problem og kvifor det betyr noko | Konkret løysing | Endringsrisiko |
|---|---|---|---|---|---|
| D01 | Medium | [App.tsx:47–1609](H:/Koding/Fjoscam/src/renderer/App.tsx:47) | Éin 1791-linjers modul eig nesten all UI, kamera-I/O, player, PTZ, lyd og dialogar. Mange relaterte statefelt kan representere inkonsistente kombinasjonar; det forklarer fleire av racane. | Trekk gradvis ut player-livssyklus, aktive kameradata, PTZ-session og dialogar. Bruk ei tydeleg statusmodell for avspeling; hald JSX og kamera-I/O skilde. | Medium–High ved stor refaktorering; låg ved små steg med scenario-testar. |
| D02 | Medium | [main.ts:186–281](H:/Koding/Fjoscam/src/main/main.ts:186); [shared/types.ts:3–24](H:/Koding/Fjoscam/src/shared/types.ts:3); [App.tsx:303–315,361–412,581–642](H:/Koding/Fjoscam/src/renderer/App.tsx:303) | Kameratype blir sjekka på mange stader, og felles konfig har mange irrelevante felt. Panasonic/generic kan nå Reolink-test/Fetch. | Eit lite adapterinterface for test/profil/presets/PTZ og ei discriminated union for konfig. Bevar vendor-spesifikke metodar der semantikken faktisk er ulik. | Medium; migrer gamle kind-lause Reolink-konfigurasjonar og bevar public IPC-kontrakt kontrollert. |
| D03 | Low | [reolinkClient.ts:650](H:/Koding/Fjoscam/src/main/reolinkClient.ts:650); `App.tsx:893,938,983,1030`; [styles.css](H:/Koding/Fjoscam/src/renderer/styles.css) | Fem ubrukte funksjonar er stadfesta av TypeScript. CSS har restar frå gamle controls og duplikat `flex`; døde avspelingsspor gjer det vanskeleg å vite kva som er aktivt. | Fjern berre dokumentert ubrukt kode i ein eigen liten endring; slå på unused-kontroll etter opprydding. Vurder lett lint for hooks og floating promises. | Low for dei fem funksjonane; kontroller dynamiske CSS-klasser før fjerning. |
| D04 | Low | [main.ts:359–364](H:/Koding/Fjoscam/src/main/main.ts:359); [go2rtcBridge.ts:15–21,211–216](H:/Koding/Fjoscam/src/main/go2rtcBridge.ts:15); [preload.ts:20–26](H:/Koding/Fjoscam/src/preload/preload.ts:20); [panasonicClient.ts:7–11](H:/Koding/Fjoscam/src/main/panasonicClient.ts:7); [App.tsx:374](H:/Koding/Fjoscam/src/renderer/App.tsx:374) | Duplisert sanitering, streamtype og Panasonic-presetliste kan drive frå kvarandre. Namna snapshotUrl/WebRtcStream/lowLatency er misvisande for fleire ulike media/High–Low-val. | Del små reine typar/hjelparar og bruk playbackUrl/playbackMode/streamQuality ved naturlege endringar. Ikkje lag generell abstraksjon for all kameratrafikk. | Low–Medium; konfigurasjonsnamn krev bakoverkompatibel migrering om dei endrast på disk. |

### Dependencies og bygg/release

| ID | Grad | Fil/område | Problem og kvifor det betyr noko | Konkret løysing | Endringsrisiko |
|---|---|---|---|---|---|
| D05 | Medium | [package.json:6–14](H:/Koding/Fjoscam/package.json:6); [tsconfig.electron.json](H:/Koding/Fjoscam/tsconfig.electron.json); [.github/workflows/ci.yml](H:/Koding/Fjoscam/.github/workflows/ci.yml); [RELEASING.md](H:/Koding/Fjoscam/RELEASING.md) | Node 22 er dokumentert, men ikkje festa i prosjektmetadata; lokale testar gjekk på Node 24 med @types/node 25. CI brukar flytande runner/action-taggar og ingen lint/pakkesjekk. TSC ryddar ikkje gamle outputfiler dersom kjeldefiler seinare blir fjerna. | Definer støtta Node/npm, bruk npm ci, presis runtime-typestrategi og kontrollerte actionoppdateringar. Pakk frå rein, isolert byggjemappe og lagre commit/toolchain/artifactmanifest. | Low–Medium; ikkje slett eksisterande dist eller brukararbeid som del av revisjonen. |
| D06 | Medium | [package.json:23–38](H:/Koding/Fjoscam/package.json:23); `vendor/go2rtc/*`; [LICENSE](H:/Koding/Fjoscam/LICENSE) | Alle tre go2rtc-binærane blir inkluderte/unpacka på alle plattformer. Ingen versjons-/hashmanifest eller tredjepartsnotis følgjer i vendor. Berre binærmetadata seier kva revisjon dei kjem frå. | Inkluder berre målarkitekturen; legg ved proveniens, SHA-256, lisens/notisar og ei kontrollert rutine for å verifisere oppgraderingar mot upstream. | Low–Medium; endra ressurssti må røyketestast i pakka app på tre mål. |
| D07 | Medium | [package.json:42–60](H:/Koding/Fjoscam/package.json:42); [scripts/verifyMacSignature.cjs:4–48](H:/Koding/Fjoscam/scripts/verifyMacSignature.cjs:4); [RELEASING.md](H:/Koding/Fjoscam/RELEASING.md) | Mac-hook krev eksakt Apple Development-identitet. Notarisering/stapling/Gatekeeper er ikkje konfigurert. Windows har inga eksplisitt signeringsidentitet. Feedhash er integritetskontroll, ikkje sjølvstendig signert utgjevarbevis. | Planlegg Windows-signering og Mac Developer ID/notarisering med trygg overgang frå eksisterande signaturkrav. Automatiser ferdige artefakt-/feed-/arkitekturkontrollar og installer/update-røyketest. | High for signatur-/updaterovergang; kan bryte oppdateringar for installert brukarbase. |

S08 eig dei konkrete sårbarheitsvarsla. D05–D07 gjeld kontroll og reproducerbarheit rundt avhengigheitene. Lockfile og `npm ci` er ei god ordning; caret-ranges i package.json er ikkje i seg sjølv eit problem når lockfile blir brukt. Full byte-identisk signert release er ikkje stadfesta av dagens prosedyre.

Det finst ikkje tung, openbert feilvalt runtime-avhengigheit som må bytast ut. React og lucide-react er nytta; electron-updater er aktiv. `@testing-library/react` og `user-event` er installerte utan komponenttestar, men blir naturleg nyttige når T02 blir gjennomført. Unngå å byte desse berre for å redusere teljaren.

go2rtc-binaryane er til saman om lag 57,9 MB ukomprimert; om lag 38–39 MB av dette er feil plattformarkitekturar i kvar normal pakke. Dette er storleik på rå vendor-filer, ikkje målt installatorkomprimering eller RAM. Upstream-versjonen har MIT-lisens; ta med relevant tredjepartsnotis i distribusjonen. [go2rtc-lisens](https://github.com/AlexxIT/go2rtc/blob/v1.9.14/LICENSE).

Den eksisterande lokale Windows-feeden og 1.0.7-installatøren vart sjekka: versjon, oppgitt byte-storleik og SHA-512 samsvarte. Ingen ny signatur, installerstart, updaterinstallasjon, Mac-pakke eller offentleg feed vart verifisert i denne revisjonen. Gjeldande releaseguide er tydeleg på desse skilja og bør bevarast.

## E. Performance findings

| ID | Grad | Fil/område | Problem og kvifor det betyr noko | Konkret løysing | Endringsrisiko |
|---|---|---|---|---|---|
| E01 | Medium | [App.tsx:275–301](H:/Koding/Fjoscam/src/renderer/App.tsx:275); [reolinkClient.ts:299–310,545–567](H:/Koding/Fjoscam/src/main/reolinkClient.ts:299) | Zoompolling kvart 3. sekund held fram ved Disconnect og utan påvist zoomstøtte. Ingen in-flight-lås for lesing; trege kall kan ta mykje meir enn intervallet og akkumulere. Unsupported-feil kan dessutan utløysa nye login via R10. | Gjer polling capability-/visibility-/tilkoplingsstyrt; ny polling først når førre er ferdig; backoff ved offline og nullstilling når kamera kjem att. | Low–Medium; bevar behovet for å følgje automatisk TrackMix-zoom. |
| E02 | Medium | [App.tsx:303–315,394–398,557–562,989–1016](H:/Koding/Fjoscam/src/renderer/App.tsx:303); [reolinkClient.ts:108–116](H:/Koding/Fjoscam/src/main/reolinkClient.ts:108); [main.ts:302–334](H:/Koding/Fjoscam/src/main/main.ts:302) | Metadata blir avventa før video; test hentar overlappande device-data; lys-/volumslidarar gir mange samtidige operasjonar. Dette aukar latency og kan la gammal verdi vinne. | Start video uavhengig av metadata, del pågåande lesingar, cache stabil modellinfo, debounce/coalesce skrivingar med siste verdi. | Medium; sikre at endeleg brukarverdi alltid blir sendt. |
| E03 | Medium | [snapshotServer.ts:61–70,140–178](H:/Koding/Fjoscam/src/main/snapshotServer.ts:61); [store.ts:100–127](H:/Koding/Fjoscam/src/main/store.ts:100) | Snap-loop har 180 ms venting: teoretisk opptil 5,6 bilete/s per klient før svartid. Kvar klient hentar eigen straum; legacy-parser kopierer veksande buffer og ignorerer backpressure. Kamerabyte skriv/syncar heile konfig og backup. | Rett R06 først; vurder delt snapshotkjelde og frame-dropp ved trege klientar. Mål behov før optimalisering av konfigskriving. | Medium; MJPEG-kompatibilitet og datavern må bevarast. |
| E04 | Medium | [go2rtcBridge.ts:29–35,123–127](H:/Koding/Fjoscam/src/main/go2rtcBridge.ts:29); [main.ts:167–183](H:/Koding/Fjoscam/src/main/main.ts:167); [reolinkClient.ts:102–106](H:/Koding/Fjoscam/src/main/reolinkClient.ts:102); [onvifClient.ts:11](H:/Koding/Fjoscam/src/main/onvifClient.ts:11) | Streamregistreringar og metadata-cache blir ikkje rydda ved fjerning/redigering. Langvarig drift med mange endringar akkumulerer gamle kjelder og secrets. PUT gir dessutan diskskriving. | Definer eigar og release/invalidation per kamera, fjern registrering når ho ikkje lenger trengst, bruk minnebasert oppdatering og avgrens cache. | Medium; fleire logiske kamera kan dele same fysiske endpoint. |
| E05 | Medium | [go2rtcBridge.ts:104–119,195–199](H:/Koding/Fjoscam/src/main/go2rtcBridge.ts:104); medfølgjande `video-rtc.js` og go2rtc WebRTC-modul | Standard ICE-konfig inneheld offentlege STUN-tenarar trass i lokal avspeling. Det kan gi unødvendig ekstern trafikk, identitetseksponering og venting utan internett. | Sett lokal ICE/STUN-policy både i player og server, og røyketest med internett sperra og berre LAN/loopback. | Medium; må verifisere kandidatutveksling på Windows og begge Mac-arkitekturar før standardar blir fjerna. |

E04 betyr ikkje at kvart tidlegare valt kamera nødvendigvis held fram med nettverkstrafikk; go2rtc styrer produsentar etter konsumentar. E05 er eit kode-/standardfunn, ikkje ei målt pakkefangst frå den vanlege appen. [go2rtc WebRTC-standardar](https://github.com/AlexxIT/go2rtc/blob/v1.9.14/internal/webrtc/webrtc.go).

**Ytingskonklusjon:** eigen rendererbundle er moderat: Vite rapporterte 236,01 kB JS (73,25 kB gzip) og 13,35 kB CSS. Det er ikkje grunnlag for å erstatte React av ytingsomsyn. Den store ukjende kostnaden er dekoding, codec/GPU-støtte, oppløysing og langvarige nettverksfeil. Ingen reell CPU/RAM/4K/H265-/langtidstest er utført. High/Clear skal framleis vere standard; optimalisering skal ikkje skjult velje Low/Fluent.

## F. Testing gaps

Eksisterande fordeling: store 8, snapshotserver 3, Reolink reine hjelpefunksjonar 12, PTZ 9 og validation 4 = 36. Ingen React-komponenttest, ingen ekte ReolinkClient-sessiontest, ingen request-/discovery-/ONVIF-/Panasonic-/go2rtc-/updater-livssyklustest. Testoppsettet mockar safeStorage og beviser ikkje faktisk OS-kryptering.

| ID | Grad | Fil/område | Problem og kvifor det betyr noko | Konkret løysing | Endringsrisiko |
|---|---|---|---|---|---|
| T01 | High | [request.ts](H:/Koding/Fjoscam/src/main/request.ts); [reolinkClient.test.ts](H:/Koding/Fjoscam/src/main/reolinkClient.test.ts); [discovery.ts](H:/Koding/Fjoscam/src/main/discovery.ts); [onvifClient.ts](H:/Koding/Fjoscam/src/main/onvifClient.ts); [panasonicClient.ts](H:/Koding/Fjoscam/src/main/panasonicClient.ts) | Ingen test av den faktiske nettverks-/auth-/fallback-livssyklusen; reine parserhjelparar kan passere medan appen heng. | Lokale fake HTTP/HTTPS/SOAP-/MJPEG-endpoint og injiserbar transport/klokke. Test auth-feil, token utgått, samtidige login, ufullstendig JSON/XML, avbrot, timeout og feil cert/redirect. | Low for isolerte testar; Medium dersom testbarheit krev ny dependency injection. |
| T02 | High | [App.tsx](H:/Koding/Fjoscam/src/renderer/App.tsx); [src/test/setup.ts](H:/Koding/Fjoscam/src/test/setup.ts); [vite.config.ts](H:/Koding/Fjoscam/vite.config.ts) | Ingen renderert UI-test. Races, feil modal-shortcuts, PTZ-stopp og playerstatus er derfor utan regresjonsvern. | Bruk eksisterande Testing Library med mocka IPC/deferred promises; A→B, redigering av aktivt kamera, sein A-response, stop/fokustap, disconnect/reconnect og capability-controls. | Low–Medium; skil App-komponenten frå createRoot-entry for enklare testing. |
| T03 | High | [store.test.ts](H:/Koding/Fjoscam/src/main/store.test.ts); [snapshotServer.test.ts](H:/Koding/Fjoscam/src/main/snapshotServer.test.ts); [go2rtcBridge.ts](H:/Koding/Fjoscam/src/main/go2rtcBridge.ts); [main.ts](H:/Koding/Fjoscam/src/main/main.ts); [updater.ts](H:/Koding/Fjoscam/src/main/updater.ts) | Testane dekkjer ikkje multiinstans, defekt backupschema, rename-feil, manglande kryptering, MJPEG-avbrot eller child-start/exit og appgjenopning. | Utvid testane med feilinjeksjon og eigne tempmapper; loopback-integrasjon for streams; fake child for single-flight, ENOENT/EACCES/portkollisjon og avslutting. Test at ingen syntetiske credentials kjem i IPC/YAML/logg. | Low–Medium; alle negative testar må vere avgrensa i tid og minne. |
| T04 | Medium | [.github/workflows/ci.yml](H:/Koding/Fjoscam/.github/workflows/ci.yml); [RELEASING.md](H:/Koding/Fjoscam/RELEASING.md); [scripts/verifyMacSignature.cjs](H:/Koding/Fjoscam/scripts/verifyMacSignature.cjs) | CI testar kjelde/build, men ikkje pakka ressursstiar, kodek/lyd, signatur, updater eller begge Mac-arkitekturar. Node/jsdom-test er ikkje Electron Chromium. | Ein liten pakka smoke-suite per mål og ei eksplisitt kameramatrise. Røyketest minst High/H265, Low/H264, Reolink/PTZ, Panasonic-parser, generic RTSPS/UniFi, offline og restart/update. | Medium; hardwaretest må vere kontrollert, og signing krev separate releaseomgjevnader. |

### Akseptscenario for neste fase

1. **Offline/tregt kamera:** tydeleg status; ingen uavgrensa kø; raskt kamerabyte og Stop; kontrollert gjenopptaking utan apprestart.
2. **Feil passord/brukartilgang:** ingen login-storm; skil feil passord, manglande capability og manglande skrivetilgang.
3. **Transport:** truncated body, uventa redirect, HTTP 401/403/500, ugyldig JSON, feil content-type, SOAP Fault med HTTP 200 og ugyldig URI-koding avsluttar kontrollert.
4. **Stream:** kamera- og bridge-restart, nettverksbyte, laptop sleep/wake, rask High/Low-/lens-switch, tidleg avbrot i MJPEG og klient som ikkje les data.
5. **Kameraforskjellar:** syntetiske fixtures for flat/nested GetAbility, ulike permit/ver, NVR-kanalar og TrackMix zoomrange/IR/spotlight; ekte røyketest der det finst hardware.
6. **Lokal tryggleik:** ingen syntetiske løyndomar i rendererresultat, YAML eller loggar; berre tiltenkte loopback-portar; uvedkomande lokal klient blir avvist.
7. **App/drift:** dobbelstart, lukking/gjenopning på Mac, vanleg Quit, oppdateringsrestart og ingen attlevande child/socket etter endeleg avslutting.

Det er meir verdifullt å verifisere desse scenarioa enn å jage eit vilkårleg coverage-tal. Det vart ikkje installert coverage-/lint-/analyseavhengigheiter i revisjonen.

## G. Feature opportunities

| ID | Grad | Fil/område | Behov og kvifor det betyr noko | Konkret forslag | Endringsrisiko |
|---|---|---|---|---|---|
| G01 | Medium | [App.tsx:105–107,1404–1408](H:/Koding/Fjoscam/src/renderer/App.tsx:105); [logging.ts](H:/Koding/Fjoscam/src/main/logging.ts); [go2rtcBridge.ts:68–78](H:/Koding/Fjoscam/src/main/go2rtcBridge.ts:68) | Status skil ikkje video, kontroll-API, bridge og siste frame. Child stdout/stderr er ignorert, så feilårsaka ved oppstart går tapt. | Kamerahelse med separate signal, siste frame/alder og siste trygge feil; avgrensa, sanitert child-diagnostikk og eksport etter førehandsvising. | Medium; video-statistikk og eksport må unngå URL-/tokenlekkasje. |
| G02 | Medium | [discovery.ts:13–16,133–142](H:/Koding/Fjoscam/src/main/discovery.ts:13); [types.ts:26–42](H:/Koding/Fjoscam/src/shared/types.ts:26); [App.tsx:598–615](H:/Koding/Fjoscam/src/renderer/App.tsx:598) | Endra IP blir ikkje knytt til lagra kamera. Discovery antar /24, nyttar ikkje nettmasker, og stoppar vidare scanning så snart eitt WS-svar finst. Oppdagings-ID er host-basert. | Først betre manuell rescan/diagnose og visning av grensesnitt/ukjende einingar; deretter rebind mot stabil device-ID med identitetskontroll. Ikkje auto-send lagra passord til ein ny IP berre fordi namnet matchar. | Medium–High for automatikk; Low–Medium for manuell hjelp. |
| G03 | Nice-to-have | [store.ts:153–203](H:/Koding/Fjoscam/src/main/store.ts:153); [App.tsx:1526–1605](H:/Koding/Fjoscam/src/renderer/App.tsx:1526) | Backup finst, men brukar har ikkje trygg recovery-/eksportflate eller forklaring på OS-bunden kryptering ved flytting. | Vis backupstatus og recoveryval; passordverna eksport med separat format/migrering om portabilitet er ønskt. | Medium; må aldri eksportere credentials ope eller overskrive backup utan deliberate handling. |
| G04 | Low | [App.tsx:147–238,336–338,1434–1605](H:/Koding/Fjoscam/src/renderer/App.tsx:147); [main.ts:109–120](H:/Koding/Fjoscam/src/main/main.ts:109); [styles.css](H:/Koding/Fjoscam/src/renderer/styles.css) | Fullscreen-state i renderer blir ikkje synka når native meny/OS endrar fullscreen. Modalane manglar gjennomgåande fokusfelle/aria-modal; språk er blanda. Lyd/visingspreferansar blir nullstilte ved oppstart. | Synk native fullscreen-hendingar; tilgjengelege dialogar med fokusretur og sperra globale kameratastar; samordna språk og valfrie lagra preferansar. | Low–Medium; bevar tastatursnarvegane og unngå uventa unmute ved oppstart. |
| G05 | Nice-to-have | [types.ts:73–88](H:/Koding/Fjoscam/src/shared/types.ts:73); [App.tsx:1279–1410](H:/Koding/Fjoscam/src/renderer/App.tsx:1279); [docs/reolink-lan-api-notes.md](H:/Koding/Fjoscam/docs/reolink-lan-api-notes.md) | Eitt aktivt bilete og ingen motion/AI-hendingar kan vere avgrensande for fleire bingar/kamera. Dette er produktomfang, ikkje feil. | Prioriter etter faktisk bruk: enkel multiview med avgrensa samtidige dekodarar eller lesande motion/AI-status. Patrol, opptak, firmware og tovegslyd bør vere eigne seinare avgjerder. | High for multiview/ny medielivssyklus; Medium for avgrensa lesande status. |

Før multiview bør sessiondeling, ressursrydding og statusmodell vere retta. Fleire samtidige H265-strøymar kan koste mykje GPU/RAM; ein slik funksjon må ha eigne målingar. Sirene og destruktive kamera-/presetoperasjonar skal halde fram med deliberate stadfesting.

## H. Prioritert arbeidsliste

### Fix immediately

| Rekkefølgje | Arbeid | Funn | Ferdig når |
|---:|---|---|---|
| 1 | Stopp credentiallekkasje og unødvendig eksponering | S01–S04 | Kunstige credentials kjem ikkje til renderer/YAML/logg; lokal klient utan tilgang blir avvist; ingen uønskt LAN-listener. |
| 2 | Sikre PTZ-stopp og rett kameramål | R03, R08 | Kamera A stoppar ved switch/blur; gamle operasjonar kan ikkje starte A etter Stop eller styre B med A-data. |
| 3 | Rett app-/bridge-livssyklus | R01, R02, R16, R17 | Single-instance og single-flight; kontrollert startfeil; Mac reopen og endeleg Quit ryddar alle eigne ressursar. |
| 4 | Gjer nettverksfeil endelege og avgrensa | R04–R06 | Malformed/avbrotne svar korkje krasjar, heng eller gir uavgrensa buffer/kø; upstream døyr når visaren blir borte. |
| 5 | Vern lagra data ved feil | R11 | Duplikat-reorder blir avvist; defekt schema blir ikkje brukt; tomt førstegangsoppsett blir skilt frå korrupt/ulesbar konfig. |
| 6 | Stram inn transport utan å bryte legacy-støtte | S05 | Sertifikattillit og eventuelle HTTP-unntak er eksplisitte; login følgjer ikkje cross-host redirect/nedgradering. |
| 7 | Installer kontrollerte tryggleiksrettingar i ny kodefase | S08 | Nye lockversjonar gjennomgår test/build og relevant pakka smoke; attverande varsel har dokumentert rekkjevidd. |

T01–T03 sine relevante regresjonstestar skal følgje kvart av desse stega, ikkje kome som eit stort prosjekt til slutt.

### Should fix

1. Samla cache-/session-/konfigurasjonsrevisjon og korrekt auth-retry: **R09–R10**.
2. Reell videostatus og adapterspesifikk tilkoplingstest/reconnect: **R07, R12–R15, G01**.
3. IPC-/URL-validering, navigasjonsvern og sentral sanitering: **S06–S07**.
4. Kontrollert polling/debounce og separat video-/metadatalasting: **E01–E02**.
5. Pakkesjekkar og plan for støtta signering/notarisering: **T04, D07**. Ikkje fjern eksisterande signaturhook før ei verifisert overgangsløysing finst.

### Worth improving

1. Del renderer etter ansvar og konsolider kamera-routing: **D01–D02**.
2. Fjern påvist død kode, del små hjelparar og rydd misvisande namn: **D03–D04**.
3. Reproducerbar toolchain, avgrensa plattformpakker og vendor-proveniens: **D05–D06**.
4. Bounded MJPEG, streamregister-/cache-rydding og lokalt ICE-oppsett: **E03–E05**, i den grad dei ikkje allereie er løyste av tryggleiksstega.
5. Forbetra manuell discovery, fullscreen-synk og tilgjengelege dialogar: **G02, G04**.

### Optional / future feature

Trygg eksport/recovery-UI (**G03**), automatisk identitetsverifisert IP-rebinding (den automatiske delen av **G02**), lagra brukarpreferansar (del av **G04**) og multiview/motion/AI (**G05**). Ikkje utvid kameraets vedvarande konfigurasjon, firmware eller skytilkopling som del av ei robustheitsretting.

## Dependency- og binærinventar

- Lockfile v3, alle 482 avhengigheitsoppføringar utanom rot hadde integritet for resolve-URL; alle kjeldevertar var registry.npmjs.org. Pakke- og lockfileversjon er begge 1.0.7.
- Aktuelle installerte nøkkelversjonar: Electron 41.3.0, electron-updater 6.8.3, electron-builder 26.8.1, React 19.2.5, TypeScript 6.0.3, Vite 8.0.10, Vitest 4.1.5.
- `npm outdated` rapporterte innanfor noverande semver mellom anna Electron 41.10.7, updater 6.8.9, builder 26.15.3, Vite 8.3.0, Vitest 4.1.11. Dette er oppslagsstatus, ikkje testa oppgraderingsfasit.
- Alle go2rtc-binærar identifiserer v1.9.14, Go 1.25.6, commit `b5948cfb25404cc5cb37b166ecaa2dca20b11d4b` og metadata `vcs.modified=false`. Metadata er ikkje uavhengig proveniens-/signaturbevis. Release-endepunktet peikte framleis på v1.9.14; binæren er ikkje klassifisert utdatert berre på grunn av dato. [Upstream-release](https://github.com/AlexxIT/go2rtc/releases/tag/v1.9.14).

| Binær | Byte | SHA-256 |
|---|---:|---|
| mac-amd64/go2rtc | 19677216 | `9beb1d730447729337dbe40218126cb41392aad94b427ec1099837c85fe1a4aa` |
| mac-arm64/go2rtc | 18513650 | `6e5039d56d652d2d325cb3ce3f7cc20248a34db42fe8abf9bb13488494ac023e` |
| win64/go2rtc.exe | 19737088 | `923d57252e8139a69c52e4acc1e399a640244a8ef457fd9b7267a25847d68f8c` |

## Vedlegg: dekning av heile repositoryet

Filinventaret vart samanlikna med `git ls-files`, uspora filer og den lokale mappeoversikta. Kjelda under `src` omfattar **25 filer / 6293 linjer**, inkludert testar, CSS og deklarasjonsfiler. Ingen eigne kjeldemodular er utelatne.

| Område | Undersøkte filer | Kontroll |
|---|---|---|
| App/livssyklus | [src/main/main.ts](H:/Koding/Fjoscam/src/main/main.ts), [src/main/updater.ts](H:/Koding/Fjoscam/src/main/updater.ts), [src/preload/preload.ts](H:/Koding/Fjoscam/src/preload/preload.ts) | Oppstart, IPC, meny, vindauge, avslutting, lyd og updater. |
| Kameraadapterar | [src/main/reolinkClient.ts](H:/Koding/Fjoscam/src/main/reolinkClient.ts), [src/main/onvifClient.ts](H:/Koding/Fjoscam/src/main/onvifClient.ts), [src/main/panasonicClient.ts](H:/Koding/Fjoscam/src/main/panasonicClient.ts) | Alle metodar og hjelpefunksjonar; auth, protokoll, capability og fallback. |
| Nettverk/media | [src/main/request.ts](H:/Koding/Fjoscam/src/main/request.ts), [src/main/discovery.ts](H:/Koding/Fjoscam/src/main/discovery.ts), [src/main/go2rtcBridge.ts](H:/Koding/Fjoscam/src/main/go2rtcBridge.ts), [src/main/snapshotServer.ts](H:/Koding/Fjoscam/src/main/snapshotServer.ts) | Request-/socket-/child-livssyklus, parsing, timeout, registrering, lokal API og buffer. |
| Lokal tilstand/logging | [src/main/store.ts](H:/Koding/Fjoscam/src/main/store.ts), [src/main/logging.ts](H:/Koding/Fjoscam/src/main/logging.ts) | Heile lagrings-/backup-/krypteringskjeda og logging/rotasjon. |
| Renderer | [src/renderer/App.tsx](H:/Koding/Fjoscam/src/renderer/App.tsx), [src/renderer/styles.css](H:/Koding/Fjoscam/src/renderer/styles.css), [src/renderer/global.d.ts](H:/Koding/Fjoscam/src/renderer/global.d.ts) | Heile komponenten, effects, handlers, JSX, modal, snarvegar og alle CSS-reglar. |
| Delte typar/hjelparar | [src/shared/types.ts](H:/Koding/Fjoscam/src/shared/types.ts), [src/shared/ptz.ts](H:/Koding/Fjoscam/src/shared/ptz.ts), [src/shared/validation.ts](H:/Koding/Fjoscam/src/shared/validation.ts), [src/vite-env.d.ts](H:/Koding/Fjoscam/src/vite-env.d.ts) | Datagrenser, kommandotypar, validering og hjelpefunksjonar. |
| Alle testar | [src/main/store.test.ts](H:/Koding/Fjoscam/src/main/store.test.ts), [src/main/snapshotServer.test.ts](H:/Koding/Fjoscam/src/main/snapshotServer.test.ts), [src/main/reolinkClient.test.ts](H:/Koding/Fjoscam/src/main/reolinkClient.test.ts), [src/shared/ptz.test.ts](H:/Koding/Fjoscam/src/shared/ptz.test.ts), [src/shared/validation.test.ts](H:/Koding/Fjoscam/src/shared/validation.test.ts), [src/test/setup.ts](H:/Koding/Fjoscam/src/test/setup.ts) | Gjennomlesne og køyrde; 36 testar. |
| Bygg/CI | [package.json](H:/Koding/Fjoscam/package.json), [package-lock.json](H:/Koding/Fjoscam/package-lock.json), [tsconfig.json](H:/Koding/Fjoscam/tsconfig.json), [tsconfig.electron.json](H:/Koding/Fjoscam/tsconfig.electron.json), [vite.config.ts](H:/Koding/Fjoscam/vite.config.ts), [.github/workflows/ci.yml](H:/Koding/Fjoscam/.github/workflows/ci.yml), [scripts/verifyMacSignature.cjs](H:/Koding/Fjoscam/scripts/verifyMacSignature.cjs), [index.html](H:/Koding/Fjoscam/index.html), [.gitignore](H:/Koding/Fjoscam/.gitignore) | Innstillingar, alle lockoppføringar, scripts, releasegrenser og generert output. |
| Dokument/lisens | [AGENTS.md](H:/Koding/Fjoscam/AGENTS.md), [README.md](H:/Koding/Fjoscam/README.md), [LICENSE](H:/Koding/Fjoscam/LICENSE), [docs/reolink-lan-api-notes.md](H:/Koding/Fjoscam/docs/reolink-lan-api-notes.md) | Heile gjeldande arbeidskopien, ikkje berre HEAD. |
| Eksisterande uspora dokument | [RELEASING.md](H:/Koding/Fjoscam/RELEASING.md), [docs/plans/fjoscam-agents-refaktorering-plan.html](H:/Koding/Fjoscam/docs/plans/fjoscam-agents-refaktorering-plan.html) | Heile dokumenta; den eldre planen er historikk, ikkje bevis på dagens eksterne release-/Mac-status. |
| Vendor | [vendor/go2rtc/win64/go2rtc.exe](H:/Koding/Fjoscam/vendor/go2rtc/win64/go2rtc.exe), [vendor/go2rtc/mac-amd64/go2rtc](H:/Koding/Fjoscam/vendor/go2rtc/mac-amd64/go2rtc), [vendor/go2rtc/mac-arm64/go2rtc](H:/Koding/Fjoscam/vendor/go2rtc/mac-arm64/go2rtc) | Storleik, SHA-256, Go/versjons-/arkitekturmetadata, executable-bit i Git; relevante upstream-kjelder og isolert Windows-binærtest. |
| Lokal verktøykonfig | [.claude/settings.local.json](H:/Koding/Fjoscam/.claude/settings.local.json) | Ignorert lokal permissions-konfig, to allow-oppføringar; struktur/kategoriar og avgrensa secrets-mønstersøk. Ikkje del av appdistribusjonen. |

`node_modules`, `.git` og genererte buildmapper er ikkje eigne ulesne kjeldemodular. Tredjepartsavhengigheiter er vurderte gjennom lockfile, audit, importbruk og målretta kjeldekontroll; det er ikkje utført full manuell revisjon av alle tredjepartslinjene. Eksisterande `dist` vart inventert og Windows-feed/installer kontrollert for hash/storleik. Generert renderer/Electron-output vart oppdatert av den autoriserte byggjekontrollen. Brukardata under AppData vart ikkje lesne.

### Dokumenterte reproduksjonar

| Kontroll | Resultat |
|---|---|
| Medfølgjande go2rtc, syntetisk PUT | HTTP 200; passordet vart skrive i test-YAML. |
| Same isolerte API, GET config | HTTP 200 utan autentisering; syntetisk passord synleg. |
| Generic-validator kontra upstream | Fjoscam godtek syntetisk `exec:`; go2rtc avviser med 400. Ingen kommando vart køyrd. |
| Reolink connection-test med mocka nettverk | Returobjektet inneheld syntetisk passord i streamUrl. |
| To parallelle bridge-start-kall, mocka child | To spawn og ingen error-listener på child. |
| Pending login etter logoutAll | Ein session dukka opp etter at logout var ferdig. |
| Reorder av to kamera med same ID to gonger | To kopiar av A; B forsvann frå resultatet. Berre mocka data. |
| Nested capability-fixture | PTZ/IR-flagg vart false trass i channel-felt med støtte. |
| Capability-fixture med ver=0, permit=1 | PTZ/preset/zoom vart true; skiljet mellom ver og permit blir ikkje respektert. |
| Ugyldig prosentkoding i discovery Scope | URIError frå parser. Ingen discovery-pakke sendt på LAN. |
| HTTP-body avbroten etter headers | Promise framleis pending etter 6500 ms, sjølv om timeout er sett til 6000 ms. |
| MJPEG-visar avslutta medan kameraoppslag venta | Mocka upstream vart ikkje øydelagd automatisk. Testen avslutta han sjølv. |

### Sluttkontroll

- Alle 46 funn-ID-ar er unike. Fil-/linjemål i rapporten er kontrollerte mot arbeidskopien.
- Git viste ingen endring i kjeldekode, testar, build-/pakkeconfig, workflow eller signaturskript etter revisjonen.
- Dei eksisterande endringane og uspora dokumenta frå starten ligg framleis der. Einaste nye prosjektfil frå revisjonen er denne rapporten.
- Ingen commit, push, PR, release eller publisering er gjort.
- Rapporten er lagra fortløpande og er tilstrekkeleg som utgangspunkt for ei ny økt: A–H, bevis, avgrensingar, filreferansar og konkret arbeidsrekkjefølgje er samla her.

**Konklusjon:** behald dei fungerande løysingane. Prioriter løyndomar gjennom heile dataflyten, sikker kamerastyring, eksplisitt livssyklus og realistiske feilstiar før kosmetisk modernisering eller nye funksjonar.
