# Fjoscam – TLS-bolk

Status: **HTTPS-bolken er fullført og lagra 18. september 2026. 100 testar / 15 filer, bygg og begge Windows Electron-røyketestane består.** Startpunktet var URL-krypteringsbolken med 79 testar. S05 er delvis løyst; RTSPS og ONVIF-transport står att. Ingen commit, pakking eller publisering er utført.

Seinare framdrift: [ONVIF-bolken](utbetring-onvif-framdrift.md) legg til eksplisitt HTTP-fallback, valbar port og sikrare PTZ-stopp, med 120 beståtte testar. [RTSPS-bolken](utbetring-rtsps-framdrift.md) legg til verifisering av faktisk straumtilkopling og reconnect. Denne loggen viser det historiske kontrollpunktet ved avslutning av HTTPS-bolken.

## Mål

- Fjern generell avslåing av sertifikatverifisering for kamera-HTTPS.
- Tilby eksplisitt tillit til eit bestemt sjølvsignert kamerasertifikat, bunde til endepunkt og SHA-256-fingeravtrykk.
- Hent sertifikat for vurdering utan å sende kamerapassord/token. Avvis endra sertifikat før credentials blir sende.
- Undersøk RTSPS i den medfølgjande go2rtc-versjonen og handhev tilsvarande verifisering på den faktiske datastraumen, ikkje berre med ein separat førehandstest.
- Bevar legacy HTTP som eit uttrykkeleg valt alternativ, Panasonic sin parser og UniFi-normalisering.

## Kontrollpunkt

- Instruksjonar, Git-status og aktuelle transport-/store-/bridge-filer lesne. Tidlegare endringar er bevarte.
- HTTPS-kode og UI er no lagra. `npm run build` bestått etter første implementering; sikkerheits- og regresjonstestar står att.

## Avgrensing av denne bolken

Denne bolken fullfører HTTPS for Reolink API/snapshot og Panasonic MJPEG/PTZ. RTSPS blir ein eigen bolk: go2rtc 1.9.14 si faktiske RTSPS-tilkopling omgår vanleg sertifikatkontroll ved IP-adresser. Ein førehandstest i Fjoscam vil ikkje vere tilstrekkeleg. S05 er derfor framleis delvis ope. Ingen nye dependencies er installerte.

## Lagra implementering (før testing)

- `cameraTls.ts`: standard CA-verifisering utan unntak; eksplisitt SHA-256-pin for éin HTTPS-origin. HTTP får ikkje TLS-socketen før fingerprint er kontrollert. Separate agentar hindrar deling av TLS-session/connection mellom ulike unntak.
- Sertifikatinspeksjon sender berre TLS-handshake, utan HTTP eller credentials. Resultatet blir ikkje automatisk til eit unntak.
- Eige sertifikatpanel i innstillingane: vis adresse, issuer, gyldigheit og fingerprint; krev eksplisitt avkryssing for uavhengig kontroll. Endringar gjeld ved lagring. Adresse-/port-/protokollbyte fjernar unntaket frå skjemaet.
- Store validerer unntaket og lagrar det i eksisterande atomiske konfigurasjonsflyt. Main-cache og Reolink endpoint/session-nøklar skil konfigurasjon med ulik TLS-tillit.
- Panasonic-stiar er bundne til konfigurert origin før Basic-auth blir laga. Legacy-parseren er bevart; redirects blir avviste.
- Viktig åtferdsendring: gamle HTTPS-kamera med sjølvsignerte sertifikat krev no at brukaren inspiserer og verifiserer sertifikatet i innstillingane. HTTP, RTSP og ONVIF er ikkje gjort krypterte av denne endringa.

## Kontrollpunkt etter regresjonstestar

- `npm test`: **96/96 testar, 15 filer, bestått** (79 før bolken).
- Nye testar dekkjer CA-/vertnamnverifisering, inspeksjon utan login, feil/bytt/fjerna sertifikat, same-origin/cross-port/HTTP-redirect, snapshot/SOAP/Panasonic og handshakes som stoppar opp.
- Store-testar dekkjer restart, lagring/fjerning av pin og avvising av feil adresse, port, protokoll og ugyldig fingerprint. UI-testar krev eksplisitt stadfesting og forkastar forseinka inspeksjon ved adressebyte.
- Main-cache-test provar at eit gammalt oppslag som fullfører etter lagring ikkje får gjeninnføre gammal TLS-tillit. Reolink-testar dekkjer at HTTP-fallback/session frå tidlegare innstillingar ikkje blir brukt etter HTTPS-/tillitsbyte.
- Syntetiske testsertifikat/nøklar blir genererte med OpenSSL i OS-temp og fjerna etter innlesing. Ingen private nøklar er sjekka inn. Testane krev Node ≥22.19 (CI nyttar nyaste Node 22) og OpenSSL; ingen runtime-avhengigheit er lagt til.
- Siste bygg, Electron-røyketestar og diff-kontroll står att.

## Siste tryggleikskontroll

- Windows Electron-røyketest for faktisk TLS, kryptert kamera/store, inspeksjon utan login, godkjent/feil/fjerna pin bestod. Eksisterande lokale avspelingsrøyketest bestod òg.
- Full suite kom opp i 98 beståtte testar etter UI-testar for adressebyte og seint namneoppslag. Ein feil i genererte testsertifikat (to CA-ar med same subject utan nøkkelidentifikator) vart retta i fixture, utan å svekkje produksjonsverifiseringa.
- Funne og lagra ekstra retting: gamle Reolink-sessionar blir pensjonerte lokalt ved lagring/fjerning, og forseinka arbeid med gammal endpoint/TLS-tillit blir avvist. Dette hindrar at Logout eller eit seint login gjenbrukar fjerna sertifikat-unntak. Kameraet får sjølv utløpe dei gamle tokena. Endeleg test etter denne rettinga står att.

## Vidareføring ved avbrot

Les denne loggen, dei daterte framdriftsloggane og Git-diffen. Ikkje opne ekte kamera eller privat konfigurasjon for testar. Bruk syntetiske sertifikat og loopback-tenarar. Mac- og releasearbeid krev dei tilhøyrande instruksjonsfilene.

## Endeleg resultat og kontrollar

| Kontroll | Resultat |
| --- | --- |
| `npm test` | **100/100 testar, 15/15 filer bestått**, 21 nye testar sidan førre bolk. |
| `npm run build` | **Bestått**, begge TypeScript-prosjekta og Vite. |
| `node node_modules/electron/cli.js scripts/smokeCameraTls.cjs` | **Bestått i faktisk Windows Electron**: avvising før login, inspeksjon utan HTTP, safeStorage/lagra pin, verifisert tilkopling og feil/fjerna unntak. |
| `node node_modules/electron/cli.js scripts/smokeLocalPlayback.cjs` | **Bestått**: eksisterande kryptering/migrering, go2rtc-avspeling, autentiserte lokale ruter og blokkerte admin-ruter. |
| `git diff --check` | **Bestått**; berre normale LF/CRLF-varsel. |

### Kva som er løyst

- **S05, HTTPS-delen:** generell `rejectUnauthorized: false` er fjerna frå HTTP-transportane. Standardtilkoplingar krev vanleg CA- og vertnamnverifisering. Den einaste transportvegen med avslått CA-kontroll krev eksplisitt endpoint-bunden SHA-256-kontroll på den faktiske socketen før HTTP får sende data. Sertifikatinspeksjon har ikkje applikasjonsdata og opprettar ikkje tillit.
- Sertifikattillit kan leggast til og fjernast i kamerainnstillingane. UI viser kva unntaket overstyrer; lagring og gjenopning bevarer pin korrekt. Adresse-/port-/protokollbyte krev ny tillit. Gamle HTTPS-kamera blir ikkje automatisk stolte på ved oppgradering.
- HTTPS-redirect til annan origin, også annan port på same vert, blir blokkert uavhengig av om kameraet har unntak. Same-origin HTTPS-redirect fungerer. Tidlegare blokkering av cross-host og HTTPS→HTTP er bevart.
- **S06, Panasonic-path:** absolutte/relative stiar kan ikkje sende Basic-auth til ein annan origin. Redirect/feilstatus blir avvist, og den nødvendige legacy HTTP-parseren er bevart. Oppkopling har absolutt tidsgrense i tillegg til straumen sin inaktivitetsgrense.
- **Delar av R08/R09:** forseinka sertifikatinspeksjon og namneoppslag kan ikkje gjeninnføre gammalt tillitsval. Main-cache blir invalidert før/etter lagring og forkastar gamle oppslag. Reolink-sessionar/endpoint-fallback er skilde etter TLS-konfigurasjon; gamle sessionar blir pensjonerte lokalt og forseinka arbeid med gammal TLS-policy blir avvist etter lagring/fjerning.

### Filer i denne bolken

- `src/main/cameraTls.ts`, `request.ts`, `panasonicClient.ts`, `reolinkClient.ts`: faktisk TLS-verifisering, pinning, redirect-/origin-grenser og session-livssyklus.
- `src/main/store.ts`, `main.ts`, `src/shared/types.ts`, `validation.ts`, `src/preload/preload.ts`: validering, lagring, IPC, offentlege typar og cache-invalidering.
- `src/renderer/CameraTlsSettings.tsx`, `App.tsx`, `styles.css`: eksplisitt tillitsflyt og vern mot forseinka resultat.
- Nye/utvida testar i `cameraTls.test.ts`, `CameraTlsSettings.test.tsx`, `store.test.ts`, `validation.test.ts`, `reolinkConnection.test.ts`, `main.test.ts`, `App.test.tsx`; lokal sertifikatgenerator i `src/test/tlsFixture.ts`.
- `scripts/smokeCameraTls.cjs`: isolert test i Electron. README og revisjonsrapporten peikar til oppdatert status. Tidlegare brukarendringar er bevarte.

## Avgrensingar og endringsrisiko

- **Kompatibilitet:** sjølvsignerte HTTPS-kamera treng eksplisitt, uavhengig kontroll av fingeravtrykket. Ny firmware/sertifikat eller flytting av adresse/port kan krevje ny stadfesting. Unntaket gjeld eksakt sertifikat og overstyrer òg hostname/gyldigheit; dette står i UI.
- **Yting:** ein pinned HTTPS-request brukar eigen agent utan keep-alive eller TLS-session-resumption, slik at tillit ikkje kan blandast mellom tilkoplingar. Dette gir ekstra handshake-kostnad, særleg ved Reolink snapshot-fallback. Vanleg CA-verifisert HTTPS beheld keep-alive. Yting på ekte kamera er ikkje målt; ikkje innfør pooling utan testar for isolering og tilbakekalling av tillit.
- **Sessionar:** gamle token blir ved lagring/fjerning pensjonerte lokalt utan Logout under den gamle TLS-policyen; kameraet må utløpe dei. Allereie sende førespurnader kan ikkje trekkjast tilbake. Denne bolken løyser ikkje all eldre cache-/ONVIF-/renderer-gjeld.
- **Transport:** RTSP-video og HTTP/ONVIF er framleis ukrypterte. ONVIF-fallback er ikkje gjort om til HTTPS eller eksplisitt per-kamera-policy her. TLS-feil utløyser ikkje ONVIF-fallback, men andre eksisterande fallback-grunnar er bevarte.
- **RTSPS:** verifisering av go2rtc sin faktiske upstream-socket står att. Sjå [go2rtc 1.9.14 TLS-kode](https://github.com/AlexxIT/go2rtc/blob/v1.9.14/pkg/tcp/dial.go). Ein separat sertifikatprobe før oppstart er ikkje nok.
- Ingen ekte kamera, firmwarevariantar eller langvarig drift er testa. Ingen Mac-/installer-/signeringskontroll er køyrd. Dette står att før distribusjon. Ingen runtime-dependencies, versjonsnummer eller releasefiler er endra.
- Testane krev OpenSSL og Node ≥22.19; sertifikat blir genererte lokalt og private nøklar er ikkje lagra i repositoryet. Node 22 har [CA-test-API-et frå 22.19](https://nodejs.org/docs/latest-v22.x/api/tls.html#tlssetdefaultcacertificatescerts).

## Prioritert neste bolk

1. **Resten av S05:** kontroller RTSPS på den faktiske go2rtc-tilkoplinga, også reconnect. Vurder ein vedlikehalden transport som kan handheve sertifikattillit utan å miste den opphavlege RTSP-adressa/Digest-auth/UniFi-normaliseringa. Undersøkt kandidat: go2rtc sin `#transport=ws://...` med lokal, autentisert relay som først verifiserer upstream TLS; dette er berre ein kandidat, ikkje implementert eller godkjent som endeleg design.
2. Gjer ONVIF HTTP-fallback til eit medvite per-kamera-val og test eksisterande eldre kamera; bevar nødvendige PTZ-stopp. Kartlegg faktisk kamera/firmware-støtte før HTTPS-ONVIF blir tilbydd.
3. **S08:** avgrensa dependency-oppgraderingar med riktige plattformkontrollar.
4. **R08/R09/R12:** resten av gammal renderer-tilstand, konfigurasjons-/credential-cache, capability-gating og status/diagnostikk. Sjå den opphavlege revisjonsrapporten og førre framdriftsloggar.
