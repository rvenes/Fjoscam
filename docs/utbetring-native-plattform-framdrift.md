# Fjoscam – native plattform-/installasjonskontroll

Status: **automatisert Mac-kontroll og DMG-kopitest fullførte**, 22. september 2026. Manuell kamera-/installasjonstest og faktisk updater-handoff står att. Startpunkt: 527 testar / 36 filer og Windows-pakkekontroll `out/dependency-check-iLrKju/verification.json` består.

Brukaren har no uttrykkeleg bede om Mac-testing via passordlaus SSH. Tilgangen `mac-rvmba` er kontrollert: korrekt vert `rvmba`, brukar `rvenes`, Apple Silicon arm64, macOS 26.6.2. Rosetta finst. Byggsignaturen som prosjektet krev er tilgjengeleg som gyldig identitet. Ingen private nøklar/passord er lesne eller viste.

`~/Code/Fjoscam` er rein ved commit `213a0d4` (gammal 1.0.7-kode), og har ikkje dei 527-test-verifiserte endringane frå Windows. Node på Mac er 26.5.0 og npm 11.17.0; testbygg skal bruke ei isolert støtta verktøykjede, ikkje endre global Node.

Brukaren godkjende uttrykkeleg ein isolert eingongskopi for testen. Avgrensa kjeldetestpakke ligg lokalt i `out/mac-verification-20260922/` med fil-/SHA-256-manifest, 158 filer og 22 564 185 byte komprimert. Ingen node_modules, Git-historikk, kameradata, globale private instruksjonar eller brukarlagring er med. Arkiv-SHA-256: `f84c4560fd1f4df7813eefebffa5a1446060d2d153af1221318ce395eb746cf2`.

## Gjennomførte kontrollar og feilsøking

- Isolert Mac-rot: `/Users/rvenes/Code/Fjoscam-verification-20260922-OnzKuH`. Prosjektkopien ligg i `source/`; eksisterande `~/Code/Fjoscam` er ikkje endra.
- Portabel Node **22.23.2 / npm 10.9.8** er lagd under testrota og kontrollert mot offisiell SHA-256. Global Node er urørt. Alle 158 kjeldefilhashar er kontrollerte etter overføring.
- **527 testar / 36 filer PASS på Mac arm64**, og vendor-/TypeScript-/Vite-bygg består. Det kom to React `act(...)`-varsel i UI-testane, men ingen testfeil. Loggar: `tests.log`, `build.log`, `npm-ci.log` under testrota.
- `checkPackagedDependencies.cjs` og `smokePackagedDependencies.cjs` er utvida lokalt for begge native plattformer og deretter overførte til den isolerte testkopien. Dei to overstyrte filhashane er lagra i `verification-script-overrides.sha256`. Produksjonskode er uendra. Mac-kontrollen brukar plattformsignatur etter signering, ikkje hash frå usignerte kjeldebinærar.
- Mac-pakkekontroll stoppa ved signering av første x64-pakke med `errSecInternalComponent`; `security show-keychain-info` gav `User interaction is not allowed`. Ingen signeringsvern er svekte. Brukaren er beden om å låse opp nøkkelringen lokalt på Mac-en; ikkje be om passord i chat. Mac-logg: `packaged.log`; teststaging `source/out/dependency-check-fdqBRY` er ikkje ei ferdig/signert utgåve.
- Ny Windows-regresjonskontroll av den utvida testkøyraren **PASS**: `out/dependency-check-swrU4f/verification.json` (app, TLS, playback).
- Direkte Electron TLS-smoke over SSH stoppa med `OS encryption is unavailable`; playback vart ikkje køyrd etter dette. Det viser at også safeStorage treng rett Mac-økt i denne testen.
- Brukaren låste opp nøkkelringen lokalt. Ein ny SSH-signeringstest feila framleis. Same avgrensa signeringstest i innlogga Aqua-økt **bestod**, med korrekt Apple Development-identitet og team. Dette er ei køyringskontekstgrense; ingen ACL/trust/keychain-reglar er endra.
- Pakkekontrollen vart køyrd som ein mellombels jobb i brukarens GUI-økt, merka `no.fjoscam.verification.package-OnzKuH`, definert berre i testrota (`package-gui.plist`, ikkje i auto-start-mappa). Logg: `packaged-gui.log`. Denne og signeringsprobe-jobben er avregistrerte.
- **GUI-pakkekontroll PASS for begge arkitekturar** i `source/out/dependency-check-qtJO4A/verification.json`: arm64/app, arm64/tls, arm64/playback, x64/app, x64/tls, x64/playback. Begge pakkene har passert faktisk signering og eksisterande `afterSign` med korrekt identitet/team. Intel-app/go2rtc er også kontrollerte med `file` som x86_64. Intel-køyring er via Rosetta på Apple Silicon, ikkje fysisk Intel-maskin.
- Rapporten er kopiert til `out/mac-verification-20260922/native-packaged-verification.json` på Windows. Native logg inneheld Chromium GPU/overlay-varsel rundt avslutting av app-testen, men både test av faktiske videoframes og alle andre kontrollar består. Varsla er ikkje skjulte med GPU-flagg; visuell kameraoppleving må framleis vurderast manuelt.
- Vanleg `npm run dist -- --mac --x64 --arm64 --publish never` **bestod** frå den same testa kjelda, med separat output `native-installers/` under testrota. Denne har produksjonsstartpunkt, ikkje test-bootstrap. Logg: `native-installers.log`. GUI-jobben `no.fjoscam.verification.installers-OnzKuH` er avregistrert. Testartefaktane er ikkje publiserte og versjonen er framleis 1.0.7.
- Ingen notariseringskonfigurasjon er tilgjengeleg; signerte pakkar skal ikkje omtalast som notariserte.

## DMG og installasjonsgrunnlag

`installation-verification.json` under testrota på Mac, kopiert til `out/mac-verification-20260922/installation-verification.json` på Windows, har **PASS** for:

- Alle ni venta filer: to DMG-ar, to ZIP-ar, fire blockmaps og `latest-mac.yml`.
- Feed med begge arkitekturane; filstorleikar og SHA-512 mot faktisk genererte filer. SHA-256 for alle ni er lagra i rapporten. Ingen genererte hashar er redigerte.
- Begge DMG-ar består `hdiutil verify`, er monterte skriveverna og kopierte med `ditto` til kvar si isolerte `installation-copy-*`-mappe.
- Kopierte appar består streng djup signaturkontroll med korrekt identitet/team; app og go2rtc har rett arkitektur og køyrerett. Alle 48 notisar er med. ASAR har produksjonsstartpunkt og ingen smoke-bootstrap.
- Testvoluma er demonterte og alle tre mellombelse GUI-jobbar er avregistrerte. Ingen Fjoscam/go2rtc-testprosessar var att ved sluttkontrollen. Det opphavlege Mac-prosjektet er framleis reint.

Apple Silicon-installasjonsfila på brukaren sin Mac:

```text
/Users/rvenes/Code/Fjoscam-verification-20260922-OnzKuH/native-installers/Fjoscam-1.0.7-arm64.dmg
```

Ho kan opnast frå Terminal på Mac med:

```sh
open ~/Code/Fjoscam-verification-20260922-OnzKuH/native-installers/Fjoscam-1.0.7-arm64.dmg
```

Dette er eit nytt testbygg med same versjonsnummer **1.0.7**, ikkje ein offentleg release. Det er signert med Apple Development, ikkje notarisert. Ingen automatisk oppdateringsinstallasjon frå gammal 1.0.7 er testa; likt versjonsnummer utløyser ikkje ein vanleg ny-versjon-oppdatering.

## Attståande kontrollar

Brukaren kan teste vanleg installasjon/oppstart og eigne kamera manuelt: eksisterande innstillingar, High/Low, lyd, fullskjerm/kamerabyte, PTZ/presets for støtta kamera og offline/reconnect. Automatisk test har berre brukt syntetiske kjelder og mellombelse profilar.

Faktisk updater-handoff/restart, Windows NSIS-installasjon, fysisk Intel-maskin, notariseringsflyt og langvarig kamera-/CPU-/RAM-test står att. Eksisterande `/Applications/Fjoscam.app` 1.0.7 er berre inspisert: streng djup signaturkontroll består med forventa app-ID/identitet/team. Ingen publisering eller endring i installert app/kameradata er utført.
