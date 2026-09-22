# Fjoscam – siste lagra vedlikehaldsstatus

Brukaren har autorisert fortløpande feilrettingsbolkar og ber om lagring undervegs. Mac-testing via passordlaus SSH er bestilt. Den 22. september 2026 vart 1.0.8 publisert for alle tre plattformer på venes.org med nye releasenotat og push til GitHub. Deretter bestilte brukaren dei nyttige restbolkane, betre handtering av HTTPS-feilen ved kamerastyring og lansering av 1.0.9. Sjå [releaseframdrift](release-1.0.9-framdrift.md). Bevar brukarendringar og private lokale `docs/plans/`.

## Siste release

**1.0.9 er publisert og verifisert 22. september 2026** for Windows x64, Mac Intel og Mac Apple Silicon på venes.org. Nettsida har nye releasenotat. Releasekjelde `173994b` og nettsidekjelde er pusha til GitHub; sjå [releaseframdrift](release-1.0.9-framdrift.md) og [filinventar/testomfang](release-1.0.9-checks.json). Alle 540 testar består på Windows og Mac arm64; alle ni isolerte pakkesjekkar består på dei tre måla. Begge Mac-DMG-ar og begge ZIP-ar er signatur-/innhaldskontrollerte. Mac-appane er Apple Development-signerte, ikkje notariserte; Windows er usignert. Alle tolv offentlege releasefiler svarar med korrekt storleik; nettsida og begge feedane er byteidentiske med staging. Rein preview, exitkode 0, ingen slettingar. Historiske releasar er bevarte.

## Siste verifiserte kode

**1.0.9:** varig kameraspesifikt TLS-varsel med direkte sertifikatinspeksjon og lagre/prøv igjen; allowlist-basert lokal diagnostikk utan kameraidentitet/løyndomar; suspend/resume som stoppar helden rørsle og opnar berre tidlegare aktiv video. **540 testar / 38 filer og bygg består på Windows og Mac arm64.** Pakka app/TLS/playback består på Windows, Mac arm64 og Mac x64/Rosetta, med identisk låsfil og Node 22.23.2 / npm 10.9.8. Sjå [1.0.9-rapporten](release-1.0.9-checks.json). Kameraet frå brukaren sitt skjermbilete krev framleis uavhengig kontroll og eksplisitt godkjenning av korrekt sertifikat; ingen ekte kamerainnstilling er endra.

### Historikk før 1.0.9

**Siste bolk:** [native plattformkontroll](utbetring-native-plattform-framdrift.md). **527 testar og bygg består også nativt på Mac arm64; alle seks signerte pakkesjekkar (app/TLS/playback for arm64 og x64/Rosetta) består.** Vanlege DMG/ZIP-testpakkar er bygde og verifiserte, inkludert skriveverna montering, isolert appkopi, signaturar og metadatahashar for begge arkitekturar. Rapportar: `out/mac-verification-20260922/native-packaged-verification.json` og `installation-verification.json`. Windows-regresjonskontroll `out/dependency-check-swrU4f/verification.json` består også. Ingen aktive testjobbar/mounts står att. Installeringsfiler ligg på Mac i `/Users/rvenes/Code/Fjoscam-verification-20260922-OnzKuH/native-installers`; manuell brukartest står att. Eksisterande Mac-prosjekt/installert app er urørte.

**527 testar / 36 filer og bygg/vendor-kontroll består på Windows og Mac.** Siste isolerte Windows-pakkekontroll er `out/dependency-check-swrU4f/verification.json`: PASS for app, TLS og playback frå fersk kjelde med Node 22.23.2 / npm 10.9.8. Windows-pakka inneheld berre Windows-binæren av go2rtc; 38,2 MB unødvendige binærfiler er borte frå utpakka innhald. Go-modulinventaret og alle 48 notisar er kontrollerte. Oppdateringsstatus, førebuing før falsk installerstart, child-exit og reconnect etter installasjonsfeil er også testa i dei faktiske pakka appane. Alt er lagra; ingen kodebolk står halvferdig ved dette kontrollpunktet, 22. september 2026.

## Bolkar fullførte i siste arbeidsøkt

| Bolk | Kontrollpunkt |
|---|---|
| HTTPS/RTSPS-feil og direkte sertifikatgjenoppretting | [1.0.9](release-1.0.9-framdrift.md); eigarskap, varig varsel, inspeksjon/stadfesting/lagre er regresjonstesta |
| G01 lokal diagnostikkeksport | [1.0.9](release-1.0.9.md); eksplisitt feltliste utan kameraidentitet/løyndomar, avbryt/lagringsfeil testa |
| R/G kvilemodus og gjenopptaking | [1.0.9](release-1.0.9.md); Stop-ordning, utdaterte hendingar og manuelt fråkopla video testa; ekte OS-søvn står att |
| R13 XML/serviceoppdaging, namespace-validering og trygg profilavgrensing | [ONVIF-oppdaging](utbetring-onvif-oppdaging-framdrift.md) |
| R13 avgrensa helden ONVIF-rørsle og ordna Stop | [ONVIF-rørsle](utbetring-onvif-rorsle-framdrift.md) |
| G01/R14 bridge-status og fem avgrensa recoveryforsøk | [Bridge-helse](utbetring-bridge-helse-framdrift.md) |
| E04 release og rydding av gamle go2rtc-kjelder/løyndomar | [Straumrydding](utbetring-straumrydding-framdrift.md) |
| D03 fire påvist ubrukte funksjonar og permanent TypeScript-kontroll | [Ubrukt kode](utbetring-ubrukt-kode-framdrift.md) |
| G04 native fullskjerm-synk | [Fullskjerm](utbetring-fullskjerm-framdrift.md) |
| G04 modal/inert/fokus/kameratastvern | [Dialogar](utbetring-dialogar-framdrift.md) |
| D06 vendor-proveniens/lisens og lokal integritetskontroll | [Vendor](utbetring-vendor-framdrift.md) |
| D05 fast referanseverktøykjede, action-pinning og isolert kjeldebygg | [Byggverktøy](utbetring-byggverktoy-framdrift.md); 360 testar og pakka Windows app/TLS/playback består med Node 22.23.2 / npm 10.9.8 |
| G02 nettmasker, samla avgrensing og tydeleg søkeoversikt | [Nettverkssøk](utbetring-nettverkssok-framdrift.md) |
| G02/R13 WS-Discovery XML, svar-korrelasjon og eigne ONVIF-portar | [Discovery XML](utbetring-discovery-xml-framdrift.md); 375 testar og Electron-smoke består |
| E04/R08 zoomcache og kansellering/ordning av absolutt zoom | [Zoomcache](utbetring-zoomcache-framdrift.md) |
| E03/E04 abort og main-eigd snapshot/MJPEG-livssyklus | [Snapshot-livssyklus](utbetring-snapshot-livssyklus-framdrift.md) |
| D04 felles playback-type og Panasonic-presets | [Felles kontraktar](utbetring-felles-kontraktar-framdrift.md) |
| D02 vendor-/mediaruting før innlogging/prosess-start | [Kameratype-ruting](utbetring-kameratype-ruting-framdrift.md); 410 testar, bygg og Electron-smoke består |
| D03 siste tre ubrukte CSS-klasser og duplisert deklarasjon | [Ubrukt kode](utbetring-ubrukt-kode-framdrift.md), CSS-oppfølging; bygg/Electron-smoke består |
| D01 nettverkssøk med samla tilstand og eigarskap i eigen komponent | [Discovery-komponent](utbetring-discovery-komponent-framdrift.md); 411 testar, bygg og pakka app/TLS/playback består |
| E02 unngå dobbel GetDevInfo ved tilkoplingstest | [Tilkoplingsmetadata](utbetring-tilkoplingsmetadata-framdrift.md) |
| F/R – feilforma preset-, kanal-, modell- og straumdata | [Metadata-validering](utbetring-kamerametadata-validering-framdrift.md); 426 testar, bygg og Electron-smoke består |
| F/R – feilforma IR-, LED- og zoomstatus | [Kontrollstatus](utbetring-kontrollstatus-framdrift.md) |
| G03/R11 – synleg varsel ved backup-recovery | [Backupvarsel](utbetring-konfig-recovery-varsel-framdrift.md); også visuelt kontrollert i Chromium |
| R/G01 – fanga oppstarts-/vindaugsfeil og ordna avslutting | [Oppstartsfeil](utbetring-oppstartsfeil-framdrift.md); 459 testar og pakka app/TLS/playback består |
| S07/E – stoppa loggvekst når rotasjon/stat/append feilar | [Loggrotasjon](utbetring-loggrotasjon-framdrift.md); 463 testar og bygg består |
| T03/G01 – updater-feil, lukka vindauge og eigarskap til siste status | [Oppdateringsstatus](utbetring-oppdateringsstatus-framdrift.md); 475 testar og pakka kontroll består |
| R17 – førebu kamera/store/straumar før eksplisitt installerstart | [Installasjonsførebuing](utbetring-installasjonsforbuing-framdrift.md); 482 testar og pakka test med falsk installatør består |
| E03/R11 – bevar historisk backup ved uendra innstillingar | [Uendra konfig](utbetring-uendra-konfig-framdrift.md); 487 testar og bygg består |
| D06 – inventar for 34 innebygde Go-modular og 48 lisensnotisar | [Go-lisensinventar](utbetring-go-lisensinventar-framdrift.md); 515 testar, bygg og pakka app/TLS/playback består |
| D06 – berre korrekt go2rtc-plattformbinær i kvar pakke | [Plattformpakking](utbetring-plattformpakking-framdrift.md); 527 testar, bygg og pakka Windows app/TLS/playback består; native Mac-kontroll står att |
| T04/D07 – native Mac-bygg, signerte arm64/x64-pakkar og DMG-kopitest | [Native plattform](utbetring-native-plattform-framdrift.md); 527 testar på Mac, seks pakkesjekkar og begge vanlege DMG-ar består; manuell bruk og faktisk updater-handoff står att |

Tidlegare bolkar frå tryggleik, kryptering, TLS, dependencies, kameraeigar/capabilities, auth, IPC/logging og polling er lenka frå [revisjonsrapporten](revisjonsrapport-2026-09-15.md). Den opphavlege rapporten er historikk; ikkje tolk alle gamle funn som framleis uendra.

## Neste arbeid

1. **1.0.9 er ferdig publisert.** Ikkje bygg/test dei fullførte bolkane på nytt utan nye endringar. Brukaren kan no oppdatere frå venes.org og kontrollere HTTPS-sertifikatet gjennom den nye snarvegen. Manuell installasjons-/kameratest står att; ikkje installer over brukarens eksisterande app eller endre ekte kameradata automatisk.
2. **T04/D07/R17 attståande plattformkontroll:** faktisk NSIS-/Mac-oppdateringsinstallasjon og apprestart, fysisk Intel og notariseringsflyt. Mac-bygg/signatur og arm64/x64-Rosetta app/TLS/playback er no testa. Den falske installatøren og DMG-kopitesten beviser ikkje Squirrel/NSIS-handoff ved oppdatering.
3. **Kameramatrise:** fysisk Reolink High/H265, Low/H264, TrackMix/linse/PTZ, Panasonic og generic RTSPS/UniFi; offline/reconnect/sleep-wake og langvarig CPU/RAM. Ingen hardwareresultat skal konstruerast frå syntetiske testar.
4. **Worth improving:** vidare D01/D02 berre ved konkret vedlikehaldsgevinst; meir detaljert kjeldefil-/ressursattribusjon utover Go-modulinventaret; mål E03/E04 før delt snapshotkjelde/varig metadata-cache.
5. **Optional/future:** trygg eksport/import av kamerakonfigurasjon, identitetsverifisert IP-rebinding/multi-NIC-søk, språk/preferansar og multiview. Desse er ikkje innførte som del av feilrettingane. Avgrensa lokal diagnostikkeksport er innført i 1.0.9.

To konkrete hovudbolkar står att: native plattform-/installasjonskontroll og fysisk kameramatrise/langtidsdrift. Dette er ikkje eit estimat som inkluderer alle valfrie framtidsfunksjonar. Det nye inventaret dekkjer modulnotisar for dei faste go2rtc-binærane; ikkje alle innebygde webressursar, kjeldefilattribusjonar eller heile appen. ONVIF NVR-/presetmapping/Media2/HTTPS er ikkje innført. Ingen native Mac-, installatør- eller kamerakontrollar skal hevdast utan faktisk utføring.

## Ved framhald

Les `AGENTS.md`, Git-status og den aktive framdriftsfila før endringar. Køyr `npm test`, `npm run build` og relevant Electron-smoke. Fulltest og playback-/pakkesjekk må gå sekvensielt sidan dei deler port 1984. Avslutt berre child-prosessar som testen/appen sjølv eig. Bevar alle lokale kameradata og brukaranvendringar.
