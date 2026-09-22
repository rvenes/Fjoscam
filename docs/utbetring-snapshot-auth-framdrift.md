# Fjoscam – snapshot-autentisering og sesjonar (R07/R10)

Status: ferdig implementert og lokalt verifisert 20. september 2026. **233 testar bestått** (utgangspunkt: 205). Ingen commit, push eller publisering.

## Kontrollpunkt 1 – undersøking lagra

- Førre bolk er ferdig: sjå `utbetring-avspelingsstatus-framdrift.md`. No blir attståande R07 (Snap-auth-retry) og R10 (strukturert feilklassifisering/sesjonslivsløp) handsama.
- Stadfesta: `getSnapshot` gjer berre eitt binærkall. `postWithTokenRetry` slettar sesjonen ved alle feil og tolkar vide teksttreff som autentiseringsfeil. Dette kan gi unødvendige Login-kall og la gamle svar fjerne ein ny token.
- Login brukar fast 25 minutt, ikkje kameraets `leaseTime`. `logoutExcept` avbryt ikkje pågåande innlogging dersom kameraet enno ikkje har ein ferdig sesjon. Sesjonsnøkkelen inneheld allereie kamera-ID; den delen av opphavleg R10 er retta tidlegare.
- Plan: trygge strukturerte HTTP/API-feil, eitt avgrensa auth-forsøk for Snap og JSON, vern for samtidige/gamle svar, kameraets tokenlevetid og avbrot av pågåande login. Bevar HTTPS-tillit, PTZ-stoppvern og eksisterande bildevalidering.
- Står att: implementering, målretta regresjonstestar, heile testpakken, bygg og relevant syntetisk transportkontroll. Ingen ekte kamera eller privat konfigurasjon skal kontaktast.
- Ved avbrot: les denne fila og siste diff før vidare arbeid. Kode er ikkje endra i denne bolken enno.

## Kontrollpunkt 2 – første implementering lagra (20. september)

- `cameraErrors.ts` skil HTTP-status og trygge Reolink-feilkodar frå rå kameratekst. Reolink -6/-21 og HTTP 401 gir eitt forsøk med oppfriska token. Parameter-/tilgangsfeil gir ikkje ny innlogging. JSON-parsefeil tek ikkje lenger med rå svartekst i `cause`.
- Snap tolkar små JSON-feilkonvoluttar også ved HTTP 200/feil MIME-type; bildevalideringa i snapshot-serveren står ved lag.
- API og Snap deler avgrensa token-retry. Ein forseinka feil slettar berre tokenen som faktisk feila. Sesjonsomfang blir avbrote ved utlogging/kamerabyte, og pågåande login blir forkasta ved konfigurasjonslagring, også når endepunktet er uendra.
- Login respekterer numerisk `leaseTime` med sikkerheitsmargin og 24-timars øvre grense; eldre firmware utan gyldig felt brukar konservativ fallback.
- **Ikkje verifisert enno:** testar for auth/samtidige svar/utlogging/lease, full testpakke og bygg. Vurder òg avgrensing av repeterte Login-feil frå MJPEG-løkka.
- Brukaren har no bedt om neste bolk etter denne. Vel neste opne prioritet frå revisjonen først når denne bolken er ferdig og kontrollert.

### Kjeldegrunnlag

Feilkodar og `leaseTime` er kontrollerte mot Reolink Camera HTTP API User Guide v7, kapittel 3.2.1 og 4.1 ([leverandørdokument, spegel](https://forum.iobroker.net/assets/uploads/files/1694077622272-reolink-kamera-api-2022.pdf)). Firmware med JSON-feil i `text/html` er òg dokumentert i [reolink_aio si implementering](https://github.com/starkillerOG/reolink_aio/blob/master/reolink_aio/api.py). Dette erstattar ikkje verifikasjon på fysisk kamera.

## Kontrollpunkt 3 – auth-regresjonstestar lagra

- Første 42 målretta testar passerte (Reolink auth/connection/ONVIF og HTTP-transport). Første bygg etter kjerneendringa passerte; nyaste testar og backoff-tillegg må framleis gjennom fullt bygg.
- Innlogging som blir avvist, og ny token som straks blir avvist igjen, gir 30 sekund pause før nye Login-forsøk. Konfigurasjonslagring fjernar pausen. Vanlege nettverks-/parameterfeil slettar ikkje gyldig token.
- Tilgangsavslag eller autentiseringsfeil utløyser ikkje ONVIF-fallback. Numeriske kodar har prioritet over fritekst; berre eksakte kjende legacy-frasar blir brukte når kode manglar.
- Nye testar dekkjer MIME-variasjonar, eitt retry, samtidige/forseinka tokenfeil, utlogging/kamerabyte, passordlagring med same endepunkt, tokenlevetid, feil passord, malformed konvoluttar og PTZ-stopp under refresh.
- To ekstra integrasjonstestar køyrer verkelege HTTP/Snap-utvekslingar mot syntetisk loopback-kamera (401 og JSON-feil med HTTP 200). Desse er lagra, men enno ikkje køyrde ved dette kontrollpunktet.
- Neste: full testpakke/bygg, relevant Electron TLS-kontroll, sluttkontroll av diff. Deretter neste prioriterte bolk som brukaren bad om.

## Endeleg kontrollpunkt – bolken ferdig

- **R07 / Medium:** Snap fornyar ein avvist token éin gong (401, Reolink -6/-21 eller eksakt legacy-feil). Felles bildekonvoluttvalidering frå førre bolk vernar framleis snapshot/MJPEG mot feilinnhald. MIME-feil frå firmware skjuler ikkje ei lita JSON-feilkonvolutt.
- **R10 / Medium:** Vanlege API-feil bevarer sesjonen, samtidig refresh er single-flight, gamle tokenfeil slettar ikkje ny sesjon, og pågåande arbeid blir avbrote ved utlogging/konfigurasjonslagring. Tokenlevetid kjem frå kameraet med margin. Kjende innloggingsavslag og straks avvist erstatningstoken får 30 sekund pause; lagring av innstillingar nullstiller pausen.
- **Trygg feildiagnostikk:** HTTP-status og numeriske API-kodar er tilgjengelege utan rå `detail`, body eller JSON-parser-cause. Autentiserings-/tilgangsavslag fører ikkje til ONVIF-forsøk. PTZ blir ikkje sendt på nytt dersom Stop har ugyldiggjort handlinga under refresh.
- Endringsrisiko: Medium. Strammare klassifisering kan krevje tillegg for udokumenterte firmwarefeil; ikkje gjeninnfør breie teksttreff. 30-sekundspausen gjeld berre kjende auth-/loginavslag. Fysisk firmwarematrise står att.

### Verifikasjon

- `npm test`: **233/233 testar, 23/23 filer**, bestått. Inkluderer verkeleg lokal HTTP-utveksling gjennom både request-laget og Reolink-adapteren, med 401 og HTTP-200/JSON-authfeil.
- `npm run build`: begge TypeScript-prosjekta og Vite bestått.
- `node node_modules/electron/cli.js scripts/smokeCameraTls.cjs`: **PASS**. Ekte Electron/TLS/safeStorage og RTSPS-kontroll framleis godkjende etter transportendringa.
- `git -c core.safecrlf=false diff --check`: bestått.
- Ingen ekte kamera, Mac, pakking, commit eller publisering. Plattform-/firmwarekontroll må framleis gjerast før release.
- Brukaren har bedt om vidare arbeid i neste bolk. Denne bolken treng ikkje implementerast på nytt; neste kontrollpunkt får eiga fil.
