# Fjoscam – ONVIF-fallback og PTZ-stopp

Status: **fullført og lagra. 120 testar / 17 filer, bygg og begge Windows Electron-regresjonstestane består.** Startpunkt: HTTPS-bolken med 100 testar. Ingen commit, publisering eller pakking.

Seinare framdrift: [RTSPS-bolken](utbetring-rtsps-framdrift.md) legg til verifisering av faktisk straumtilkopling og reconnect. Omtalen av RTSPS som ope nedanfor er det historiske kontrollpunktet ved avslutning av ONVIF-bolken.

## Avgrensing og plan

- Fullfør den avgrensa ONVIF-delen av S05 før den større RTSPS-transportendringa. RTSPS er framleis ope; ikkje påstå at HTTPS-bolken eller denne bolken sikrar go2rtc sin upstream-TLS.
- Gjer ukryptert ONVIF-fallback til eit eksplisitt, avslått standardval per Reolink-kamera. Vis at HTTP blir brukt sjølv om API-protokollen er HTTPS. Tilby port med eksisterande 8000 som standard.
- Handhev valet også i ONVIF-adapteren, stopp redirects, og bind profilcache/forseinka resultat til gjeldande kamerakonfigurasjon.
- Stopp rørsle på den transporten som vart brukt, og køyr stopp før lagring/fjerning kan endre adresse eller trekkje tilbake ONVIF-valet. Hindre nye rørsler medan innstillingane blir lagra.
- Test med syntetiske kamera og loopback. Ingen ekte kamera eller privat konfigurasjon skal opnast.

## Kontrollpunkt

- Lagra logg, Git-status, instruksjonar og relevante ONVIF/Reolink/PTZ/store/UI-filer lesne. Tidlegare endringar og brukararbeid er bevarte.
- Første implementering er lagra, og `npm run build` består. Testar av nye grenser og samstundes lagring/stopp står att.

## Lagra implementering

- `allowInsecureOnvif` krev eksplisitt `true`, med `onvifPort` (standard 8000). Eksisterande konfigurasjon utan feltet får ikkje automatisk HTTP-fallback. Store og UI validerer/lagrar valet; bytte av vert eller kameratype slår det av i skjemaet.
- ONVIF-adapteren handhevar valet sjølv, validerer port/vert, avviser redirects og SOAP-feil/uventa svar. Berre profil med PTZ-konfigurasjon blir vald. Profilcache er bunden til endpoint/konto og blir invalidert ved lagring; gamle profiloppslag får ikkje starte forseinka rørsle.
- Reolink-adapteren hugsar når rørsle er forsøkt via ONVIF, slik at Stop går same veg utan eit nytt, potensielt tregt API-forsøk først. TLS-sertifikatfeil gir framleis ikkje fallback.
- `PtzController.withCameraPaused` avviser nye rørsler, kansellerer køa rørsler og ventar på stoppforsøket med gammal konfigurasjon før save/remove. Eit kamera som er offline må framleis kunne redigerast; manglande stoppkvittering kan ikkje garantere fysisk stans.
- Ingen dependencies eller releasefiler er endra. RTSPS står framleis att.

## Kontrollpunkt etter første fulltest

- `npm test`: **119 testar / 17 filer bestått**. `npm run build` bestått.
- Nye loopback-testar dekkjer eksplisitt samtykke, port, PTZ-profil, WS-Security-format, redirects, SOAP-fault/uventa svar, tilbakekalling under oppslag og profilbyte ved nye credentials.
- UI/store-testar dekkjer avslått standard for gamle kamera, lagring/gjenopning, portval, ugyldige verdiar og nullstilling ved ny vert/kameratype.
- Main/PTZ-testar provar stopp før save/remove, gamle innstillingar fram til stopp, blokkerte nye rørsler og vidare redigering av offline kamera.
- Siste feilsti er lagra: Stop beheld profiltokenet frå rørsleforsøket sjølv om svaret vart borte; det treng ikkje ny profiloppdaging. Endeleg fulltest og Windows Electron-regresjon står att.

## Vidareføring ved avbrot

Les denne fila, `docs/utbetring-tls-framdrift.md` og Git-diffen. Koden inneheld fleire tidlegare, autoriserte bolkar utan commit; ikkje rydd dei bort. Dokumenter testresultat og attståande risiko før avslutning.

## Endeleg resultat

- **S05, ONVIF-policy:** HTTP-fallback krev eksplisitt avkryssing og lagring for kvart Reolink-kamera. Dette gjeld òg konfigurasjonar som fanst før oppgraderinga. Ingen automatisk oppgradering av gamal konfigurasjon gir samtykke. TLS-sertifikatfeil utløyser ikkje fallback. Porten kan veljast, med 8000 som standard, og redirects blir avviste før WS-Security-data kan vidaresendast.
- **R03, PTZ-livssyklus:** Stop går direkte til ONVIF når ei rørsle er forsøkt der, også om rørslesvaret gjekk tapt. Det opphavlege profiltokenet blir halde for stoppforsøket. Save/remove stansar nye rørsler og kansellerer gamle køa rørsler, og ventar på stoppforsøk før innstillingane blir endra. Sein keyup under lagring sender ikkje Stop til den nye verten.
- **Delar av R09/R13:** profilcache tek omsyn til endpoint/konto/credential-byte, blir rydda ved save/remove og kan ikkje fyllast med eit forseinka oppslag etter policybyte. Profil utan rapportert PTZ-konfigurasjon blir ikkje vald. SOAP Fault ved HTTP 200 og manglande forventa response-tag blir avvist utan å vise innhaldet i svaret. Ukjende/avviste svar blir ikkje rapporterte som vellukka kamerakommandoar.
- UI viser at ONVIF er HTTP uavhengig av API-protokoll. Host-/typebyte slår av løyvet i skjemaet, og discovery set ikkje løyvet. Ugyldig port, feil datatype eller ONVIF for generisk/Panasonic-kamera blir avvist ved lagring.

## Endeleg verifikasjon

| Kontroll | Resultat |
| --- | --- |
| `npm test` | **120/120 testar / 17 filer bestått**, 20 nye testar i denne bolken. |
| `npm run build` | **Bestått**, begge TypeScript-prosjekta og Vite. |
| `node node_modules/electron/cli.js scripts/smokeCameraTls.cjs` | **Bestått**, eksisterande HTTPS-/safeStorage-flyt i Windows Electron. |
| `node node_modules/electron/cli.js scripts/smokeLocalPlayback.cjs` | **Bestått**, eksisterande lokal avspeling og tilgangsgrenser i Windows Electron. |
| `git diff --check` | **Bestått**. |

ONVIF-testane brukar faktiske HTTP/SOAP-førespurnader til syntetiske loopback-tenarar i Node. Reolink-transportval og main/IPC-livssyklus er testa med kontrollerte mocks. Electron-røyketestane er regresjonskontrollar for tidlegare funksjonalitet; dei er ikkje testar mot eit fysisk ONVIF-kamera.

### Endra filer

- `src/shared/types.ts`, `validation.ts`, `src/main/store.ts`: eksplisitt policy, port, persistens og validering.
- `src/renderer/App.tsx`, `styles.css`: synleg opt-in og portval.
- `src/main/onvifClient.ts`, `reolinkClient.ts`: handheving, transportval, profiltillit/cache og svarhandtering.
- `src/main/ptzController.ts`, `main.ts`: stopp og blokkering av nye rørsler før save/remove.
- Nye `src/main/onvifClient.test.ts`, `reolinkOnvif.test.ts`; utvida `ptzController.test.ts`, `main.test.ts`, `store.test.ts` og `src/renderer/App.test.tsx`.
- README og framdriftsdokument er oppdaterte. Ingen nye dependencies, versjonsnummer eller releasefiler.

## Endringsrisiko og det som står att

- **Kompatibilitet:** kamera som tidlegare var avhengige av automatisk ONVIF-fallback må få valet aktivert etter oppgradering. CGI/API-funksjonaliteten og HTTPS-policyen er bevarte. Det kan ta tid å lagre medan eit allereie starta nettverkskall og stoppforsøket ventar på timeout.
- **Fysisk stopp:** koden sikrar rekkjefølgje og prøver Stop med gammal konfigurasjon. Han kan ikkje garantere fysisk stans når kamera/nettverk ikkje svarar. Eksisterande kort ONVIF-timeout er bevart. Ein offline-konfigurasjon kan framleis rettast etter eit mislukka stoppforsøk.
- **R13 er berre delvis løyst:** service-paths er framleis faste, første profil med PTZ blir vald utan NVR-kanalkartlegging, og XML-handteringa er framleis ein avgrensa regex-parser. Det er lagt til feilsjekkar, ikkje ein full XML-validator. SOAP/namespace-/firmwarevariantar og automatisk fornying av `PT1S` ved halde tast står att.
- Ingen reelle kamera, endra firmware, Mac-pakker eller langtidstest er køyrde. Desse må kontrollerast før distribusjon. Ingen ekte passord eller privat kamerakonfigurasjon er lesen.
- **RTSPS i go2rtc er framleis ope.** Neste større transportbolk må verifisere den faktiske TLS-tilkoplinga ved kvar reconnect, med trygg tillitsflyt og bevaring av RTSP-adresse/Digest-auth/UniFi-normalisering. Ein separat sertifikatprobe er ikkje tilstrekkeleg.
- Deretter: dependency-funn S08 og resten av R08/R09/R12/R13. Den opphavlege revisjonsrapporten er framleis hovudlista.

Protokollkontroll: ONVIF definerer separate `ContinuousMove`, `Stop` og tilhøyrande svar i [PTZ WSDL](https://www.onvif.org/ver20/ptz/wsdl/). WS-Security-digestalgoritmen er ikkje endra av denne bolken.
