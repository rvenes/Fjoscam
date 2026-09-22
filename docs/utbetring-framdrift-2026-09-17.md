# Fjoscam – utbetring av alvorlege revisjonsfunn

Starta 17. september 2026 etter uttrykkeleg bestilling om å rette dei grovaste feila. Grunnlag: `revisjonsrapport-2026-09-15.md`. Denne loggen blir oppdatert ved kvart kontrollpunkt. Endringane ligg lagra i arbeidsmappa; ingen commit/publisering er bestilt.

**Status: første utbetringsbolk ferdig og kontrollert 17. september 2026.** Sjå sluttkontrollen og vidare prioritering nedanfor. Kontrollpunkta dokumenterer mellomstatus; dei er ikkje den endelege restlista.

**Oppfølging 18. september:** generiske URL-ar og migrering er no handsama i [andre bolk](utbetring-framdrift-2026-09-18.md). Bruk den nyare loggen for gjeldande restliste; omtalen av ukrypterte generiske URL-ar nedanfor er historisk status frå første bolk.

## Første arbeidsbolk

- Trygg straumregistrering: unngå go2rtc-persistens av passord, slå av RTSP-tenaren, fjern passord frå tilkoplingstest-resultat.
- Prosess-/app-livssyklus: serialisert oppstart, sikker avslutting og macOS-gjenopning, éin appinstans.
- Avbrotne HTTP-svar, avgrensa responsstorleik/tidsbruk og trygg redirect-handtering.
- Datatap ved duplisert kameraomrekkjefølgje og korrupt konfigurasjon.
- Discovery-/MJPEG-feilstiar og PTZ-stopp dersom dette kan fullførast med forsvarlege regresjonstestar i same bolk.

## Status

- Gjeldande instruksjonar, Git-status, revisjonsrapport og sentrale kjeldefiler er lesne.
- Eksisterande brukarendringar blir bevarte: AGENTS.md, README.md, docs/reolink-lan-api-notes.md, RELEASING.md og docs/plans/.
- Kontrollpunkt 1: kjeldeendringar lagra for S01 (go2rtc-delen), S02, S03, S04 (lokal auth), R01/R02/R17 (livssyklus), R04 (HTTP), R05 (discovery), R06 (MJPEG), R11 (lagring) og R16 (éin instans). S05 berre delvis: redirectgrensa er stramma inn; TLS/HTTPS-fallback står att.
- `npm run build` passerte etter første kodebolk. Regresjonstestar er under utviding/køyring; ikkje ferdigverifisert enno.
- Viktig ved framhald: kontroller faktisk go2rtc PATCH/auth/miljøvariabelkonfigurasjon med syntetisk URL, og Electron-avspeling med header-injeksjon. Generiske URL-ar i kamerastore er framleis eit ope krypterings-/migreringspunkt.
- Kontrollpunkt 2: faktisk medfølgjande Windows-go2rtc bestod 3 integrasjonstestar (minnebasert PATCH, autentisering, parallell oppstart, avslutting og spawn-feil). Isolert skjult Electron-røyketest bestod lasting av iframe/modular, autentisert WebSocket 101, dekoding av snapshot og blokkering av admin-API frå renderer. Testskriptet er lagra som `scripts/smokeLocalPlayback.cjs`; bruk etter bygg.
- PTZ har no kø per kamera, kansellering av utdaterte rørsler/fallbacks, stopp ved blur/lukking/kamerabyte og ein 30-sekunds reservegrense ved tapt slepp-hending. Eigen regresjonstest er lagra. Langvarig rørsle må startast på nytt etter reservegrensa; dette må opplysast ved levering.
- S05: HTTPS-val får ikkje lenger automatisk HTTP-fallback; TLS-sertifikatverifisering står framleis att. S06: hovudramme/opphav blir kontrollert for IPC, og generiske straumar avgrensa til RTSP/RTSPS. Dette er delvis hardening, ikkje full input-validering.
- Endeleg full testsuite/bygg og gjennomgang av diff står att. Ingen ekte kamera, installer eller Mac er testa.

## Attståande avgrensingar

Ingen ekte kamera eller privat kamerakonfigurasjon blir brukt i automatiske testar. Pakking, Mac-køyring, dependency-/releaseoppgraderingar og publisering er ikkje utførte. Oppfølging må skilje verifiserte kodeendringar frå ekte kamera-/plattformtestar.

## Sluttkontroll – første bolk

| Kontroll | Resultat |
| --- | --- |
| `npm test` | **63/63 testar, 12 testfiler, bestått**. Revisjonen hadde 36 testar. |
| `npm run build` | **Bestått**: renderer-TypeScript, main/preload-TypeScript og Vite. |
| `node node_modules/electron/cli.js scripts/smokeLocalPlayback.cjs` | **Bestått på Windows**, med isolert userData og skjult Electron-vindauge. |
| Medfølgjande go2rtc | Integrasjonstestar av PATCH utan credential-persistens, auth, prosessoppstart og avslutting bestått. |
| PTZ og app-livssyklus | Testa med syntetiske adapterar/renderer; macOS-livssyklus simulert i unit test, ikkje køyrd på Mac. |
| Git | Berre arbeidsfiler; ingen staging, commit, push eller publisering. Eksisterande brukarendringar er bevarte. |

Electron-røyketesten kontrollerer dei faktiske avspelingsressursane, WebSocket-handshake (101), dekoding av eit syntetisk snapshot, avvist admin-API frå renderer og HTTP 401 utan autentisering. Han dokumenterer ikkje ekte video, lyd, kamera-firmware eller H265-dekoding. Kameraadressa i testane er kunstig og peikar til loopback-port 9. Mellombelse go2rtc-/Electron-testmapper i OS-temp inneheld berre syntetiske data og blir liggjande for feilsøking.

### Gjennomført og kopling til revisjonen

| Funn | Endring | Viktig avgrensing |
| --- | --- | --- |
| S01, go2rtc-delen | Bytt frå persisterande PUT til minnebasert PATCH; vent på at registrering lukkast. | Generiske URL-ar i cameras.json/backup er framleis ikkje krypterte. Eksisterande backupkopiar er ikkje sletta eller migrerte. Generert go2rtc.yaml blir som før regenerert ved neste bridge-start. |
| S02 | Fjerna passordberande RTSP-URL frå tilkoplingstest og IPC-returtype. | Vanlege profilfelt er framleis tilgjengelege for renderer. |
| S03 | Eksplisitt avslått RTSP-tenar i go2rtc-konfigurasjonen. | RTSP-klienten og WebRTC/MSE-avspeling blir bevarte; ekte kamera må røyketestast. |
| S04 | Tilfeldig API-passord per appøkt, local_auth, redusert go2rtc API-flate og eige snapshot-auth. Main injiserer auth berre for avspelingsressursar frå appvindauge. | API-passord går via child-miljøvariabel, ikkje YAML-verdi/renderer-URL. Tilgang frå prosessar med høve til å inspisere same brukar sitt prosessminne er ikkje ei ny OS-tryggleiksgrense. |
| S05, delvis | Blokker cross-host redirects, HTTPS→HTTP-redirect og HTTP-fallback når kamera er konfigurert med HTTPS. | TLS-verifisering og ein eksplisitt tillitsflyt for sjølvsignerte kamerasertifikat står att. Same vert kan framleis bruke alternativ port. |
| S06, delvis | IPC krev appens hovudramme/opphav; navigasjon av hovudvindauget blir blokkert. Generiske straumar må bruke RTSP/RTSPS. | Full runtime-validering av alle IPC-parametrar og Panasonic-path-hardening står att. |
| S07, delvis | HTTP-/snapshot-feil speglar ikkje lenger rå responskroppar til UI/logg. | Samla sanitiseringsgjennomgang av alle adapterar står att. |
| R01, R16 | Éin appinstans, delte tenester blir haldne i live ved macOS-vindaugelukking, og aktivert app opnar nytt vindauge. | Faktisk Mac-/pakka-app-kontroll står att. |
| R02, R17 delvis | Éin oppstartspromise, spawn-error-handler, autentisert readiness, delt stop-promise, venting på faktisk child-exit og SIGKILL-reserve. | Updater/installasjonsflyt er ikkje endra eller verifisert i denne bolken. Ingen garanti mot at operativsystemet avviser all terminering. |
| R03 | Kommandoar blir ordna per kamera; utdaterte køa rørsler/retries/fallbacks blir avbrotne. Stopp ved kamerabyte, fokustap, lukking, renderer-krasj og slepp av tast/mus. | Ein pågåande nettverkskommando må fullførast/timeout før siste stopp kan sendast. Nettverksbrot kan gjere fysisk stopp umogleg. Ekte PTZ/ONVIF må testast. |
| R04 | Absolutt sekssekundsfrist per transportkall inklusive redirects, avbrots-/error-handtering og maks 4 MiB tekst / 16 MiB biletsvar. | Adapter-retries kan framleis gi lengre samla operasjonstid; separat Panasonic-transport har framleis eigen timeoutlogikk. |
| R05 | Discovery avsluttar éin gong, ryddar timerar, avgrensar innsamling og toler ugyldig prosentkoding. | Subnett-/IP-identitetslogikk er ikkje endra. |
| R06 | Tidleg klientavbrot blir fanga opp; seint tilkopla upstream blir lukka. JPEG-buffer får grense, treg mottakar får backpressure/frame-dropping. | Legacy JPEG-markerparser er bevart og testa. Reconnect mot ekte Panasonic står att. |
| R10, delvis | Login som fullfører etter invalidert pending-login, får ikkje gjenopprette sessioncache. | Host/user-eigarskap, logoutExcept og lease-/cache-politikk treng framleis eigen oppfølging. |
| R11 | Avvis duplisert omrekkjefølgje, ugyldige grunnfelt/ID-ar, feil filtilgang og korrupt hovudfil+backup. Fjern uatomisk copy-fallback. Feil blir viste i UI. | Det er ei grunnvalidering, ikkje eit fullstendig nytt migrerings-/schemasystem. Eksisterande gyldig backup-recovery er bevart. |

### Endringar brukaren kan merke

- Halden PTZ/zoom/fokus får ein **reserve-stopp etter 30 sekund** utan ny kommando. Slepp og trykk igjen for vidare rørsle. Fokustap og kamerabyte stoppar tidlegare.
- HTTP-fallback skjer ikkje lenger når HTTPS er uttrykkeleg valt. Feilkonfigurerte kamera kan derfor krevje at korrekt protokoll/port blir valt i innstillingane.
- Øydelagd konfigurasjon blir meldt som feil, ikkje presentert som ei ny tom kameraliste. Ein permanent låst fil gir lagringsfeil og bevarer gamle filer.
- Lokale avspelings-URL-ar fungerer gjennom Fjoscam si autentiserte økt; kopiering til ein ekstern nettlesar gir ikkje automatisk tilgang.

## Neste prioriterte bolk

1. **S01 resten:** kryptert lagring av generiske RTSP/RTSPS-URL-ar, trygg redigeringsflyt utan retur av saved secrets, og ikkje-destruktiv migrerings-/backupplan.
2. **S05 resten:** sertifikattillit/pinning per kamera, eksplisitt legacy-unntak og RTSPS-verifisering. Ikkje slå av støtte for sjølvsignerte LAN-kamera utan ein fungerande tillitsflyt.
3. **S08:** oppdater risikoutsette dependencies i kontrollerte steg; Electron/updater/byggverktøy må få relevant pakka plattformkontroll.
4. **R08/R09/R12:** utdaterte asynkrone rendererresultat, cache-invalidering ved kameraendringar og capability-tolking/gating.
5. **R10/R13/R14/R17 resten:** session-eigarskap, ONVIF-profil/fallback, faktisk videostatus/reconnect og updater-shutdown.
6. Røyketest på verkelege Reolink/Panasonic/generiske kamera og støtta Mac-arkitekturar før release. Test High/H265, lyd/mute, lange heldne kommandoar, fokustap, kamera offline/online og app avslutt/gjenopne.

### Framhald etter avbroten økt

Les denne fila, revisjonsrapporten, AGENTS.md og Git-status. Kjeldeendringar/testar er lagra, men ikkje committa. Ikkje overskriv brukarendringane som er lista ovanfor. Køyr `npm test` og `npm run build` ved nye relevante endringar. Røyketesten krev ledig port 1984 og nektar å ta over ein annan køyrande Fjoscam/go2rtc-prosess. Mac-/releasearbeid krev dei relevante temafilene før handling. Ingen slik handling er utført her.
