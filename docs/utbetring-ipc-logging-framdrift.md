# Fjoscam – IPC-validering og trygg logging (S06/S07)

Status: ferdig implementert og lokalt verifisert 20. september 2026. **292 testar bestått** (utgangspunkt: 233). Ingen commit/push/publisering.

## Kontrollpunkt 1 – avgrensing og undersøking

- Brukaren bad om å fullføre pågåande bolk og halde fram med neste. R07/R10 er ferdig; sjå `utbetring-snapshot-auth-framdrift.md`.
- S06 har tidlegare fått senderFrame-/opphavsvern, sperra hovudnavigasjon, RTSP/RTSPS-avgrensing og Panasonic same-origin-path. **Mange IPC-argument har framleis berre TypeScript-typar.** `camera:get-device-name` brukar rå input og kan spreie uvaliderte felt til adapteren. PTZ/lys/preset/volum/kanal treng runtime-validering før sideverknader.
- S07: request-/Reolink-/SOAP-feil er allereie meir avgrensa. `logging.ts` tek likevel imot vilkårleg tekst utan sentral sanitering; `main.ts` og `go2rtcBridge.ts` har dupliserte, ufullstendige regex. Renderer-/kamerenamn, URI-path/query og JSON/header-former kan innehalde sensitive verdiar.
- Plan: sentral, eksplisitt IPC-kontrakt utan ny dependency; robust formvalidering for kamerainput; trygg feilmelding utan ekko av input; samla loggsanitering og bounded meldingar; målretta og full regresjonskontroll. Vurder CSP separat mot faktisk Electron-avspeling før aktivering.
- Ikkje utvid kamerafunksjonar eller legg inn automatisk serverarbeid. Bevar tastatur-/PTZ-stopp, blankt passord/streamfelt ved redigering, IPv6/lokal DNS, HTTPS-tillit og legacy Panasonic.
- **Neste ved avbrot:** implementering er enno ikkje starta. Les aktuelle `main.ts`, `validation.ts`, `logging.ts`, testane og denne fila først.

## Kontrollpunkt 2 – implementering og første testar lagra

- Ny `ipcValidation.ts` har eksplisitt kontrakt for alle IPC-kanalar. Kontrollen skjer før adapter/storage/PTZ-sideverknader og avviser feil typar, NaN/uendelege tal, ugyldige PTZ-retningar, port/kanal-/presetgrenser, ugyldige boolean og for store felt. Ukjende kanalar/ekstra argument blir avviste utan input-ekko.
- Kameravalideringa handterer ukjende runtime-typar trygt. Blankt passord/streamfelt ved redigering og namnhenting før namn er fylt ut er bevarte. Preview-ID kan ikkje overstyrast av input; host blir normalisert før kameraoppslag.
- IPC krev dessutan eit faktisk appeigd vindauge. Eksterne lenkjer med userinfo/uventa port blir avviste.
- Felles `diagnostics.ts` fjernar heile URL-ar (også stream-path), kjende credentialfelt, auth-/cookie-headerar og kontrollteikn. `logging.ts` saniterer ved sjølve skrivegrensa, avgrensar meldingar til 2048 teikn og ventekø til 128 linjer per fil. Dupliserte saniteringsfunksjonar er fjerna.
- **76 målretta testar bestått**. To eldre main-testfixtures vart oppdaterte til fullstendige gyldige kamerainnstillingar; kontrollen vart ikkje svekt for å godta gamle mock-objekt.
- CSP blir lagt inn av Vite for hovuddokumentet, med eigne dev-unntak for HMR/React Refresh. Produksjon tillèt berre eigne script, lokal spelarramme og lokale bilete. BrowserWindow har eksplisitt sandbox. **Desse nyaste endringane er enno ikkje verifiserte i Electron.**
- Neste: integrasjonstestar som viser at avvist IPC ikkje gir sideverknader; bygg/full suite; ekte Electron med CSP, spela iframe/WebSocket/bilde og bygd React-app. Ikkje marker CSP som ferdig før dette passerer.

## Kontrollpunkt 3 – full suite og produksjons-CSP verifiserte

- `npm test`: **292/292 testar, 25/25 filer**. `npm run build`: begge TypeScript-prosjekta og Vite bestått.
- Ekte `smokeLocalPlayback.cjs`: **PASS** med produksjons-CSP. Lokal iframe/modular, autentisert WebSocket, dekoda snapshot, syntetiske videoframes og lydstyring fungerer framleis. Den faktisk bygde React-appen lastar med sandbox og ekte preload. Injiserte inline-/eksterne script og ekstern fetch blir blokkerte av CSP.
- Nye main-integrasjonstestar stadfestar at ugyldig IPC stoppar før lagring, kameraoppslag eller PTZ, og at framande webContents ikkje får tilgang sjølv om URL-en liknar appen.
- Diff-kontrollen fann éi ekstra blanklinje ved EOF i `main.ts`; denne er fjerna. Ingen funksjonsendring etter fulltesten.
- Lagt til valfri `--dev-renderer` i den syntetiske Electron-kontrollen for å teste utviklings-CSP mot ein allereie køyrande lokal Vite-server. Står att å køyre denne og skrive sluttstatus.

## Endeleg kontrollpunkt – bolken ferdig

| Funn | Grad | Kodeområde | Resultat og kvifor | Endringsrisiko / avgrensing |
|---|---|---|---|---|
| S06 – IPC | Medium | `src/main/ipcValidation.ts`, `main.ts`, `src/shared/validation.ts` | Alle eksponerte IPC-kanalar får runtime-kontrakt før sideverknader. Eigd vindauge, hovudramme og forventa opphav blir kontrollerte. Ugyldige kommandoar kan ikkje endre PTZ-kø, kamera eller lagring. | Medium: strengare typar/verdigrensar kan avvise uoffisielle klientar. Gjeldande UI, blanke redigeringsfelt, lokal DNS/IPv6, Panasonic-path og alle PTZ-variantar er dekte. Dette er input-/opphavsvern, ikkje ein ny brukar-/rollemodell. |
| S06 – renderer | Medium | `src/shared/contentSecurityPolicy.ts`, `vite.config.ts`, `main.ts` | Produksjons-CSP avviser inline-/eksterne script og direkte fetch. Kamera går gjennom main; lokal spelarramme og bilete er tillatne. Eksplisitt sandbox og strammare eksterne lenkjer. | Medium: nye rendererressursar må leggast til medvite. Inline-stilar er framleis nødvendige for React-stilane; utviklingsbygget har eigne HMR/Refresh-unntak. Spelarramma frå go2rtc er eit separat dokument; eksisterande tilgangskontroll gjeld der. |
| S07 – logging | Medium | `src/main/diagnostics.ts`, `logging.ts`, `main.ts`, `go2rtcBridge.ts` | Éi saniteringsgrense for alle eigne fil-loggar. Heile URL-ar og kjende sensitive felt/headerar blir fjerna; melding/kø er avgrensa. Unngår credential-path-lekkasje og uavgrensa ventekø ved treg disk. | Low–Medium: detaljar i URL-ar blir medvite borte, og meldingar utover 128 ventande per fil blir droppa. Sanitering kan ikkje identifisere kvar vilkårleg løyndom i umerka fritekst; rå kamerabody skal framleis aldri loggast. |

### Endeleg verifikasjon

- `npm test`: **292/292 testar, 25/25 testfiler**, bestått. 59 fleire enn ved starten av denne bolken.
- `npm run build`: begge TypeScript-prosjekta og Vite bestått.
- `node node_modules/electron/cli.js scripts/smokeLocalPlayback.cjs`: **PASS**, inklusive faktisk bygd React-app/preload/sandbox, produksjons-CSP og lokal avspeling.
- `node node_modules/electron/cli.js scripts/smokeLocalPlayback.cjs --dev-renderer`: **PASS**, inklusive Vite React-app med utviklings-CSP. Den eigne Vite-testprosessen på loopback vart avslutta etter kontrollen.
- `git -c core.safecrlf=false diff --check`: bestått etter fjerning av ekstra EOF-blanklinje.
- Ingen nye dependencies, ekte kamera, privat brukardata, Mac-arbeid, pakking, release eller publisering. Ingen påstand om pakka Mac-/Windows-releaseverifikasjon i denne bolken. Tidlegare pakke-/signeringsavgrensingar står ved lag.

### Attståande prioritetar til neste økt

1. **E01/E02:** gjer resterande zoompolling tilkoplings-/visibilitystyrt med backoff, start video uavhengig av treg metadata og samle raske lysendringar slik at siste verdi vinn.
2. **R13:** full ONVIF service-/kanalprofiloppdaging og trygg XML-parsing; bevar eksplisitt opt-in og CGI-primærveg. Dette er større kompatibilitetsarbeid og er ikkje implementert her.
3. **G01:** avgrensa child-diagnostikk og eventuell kontrollert automatisk bridge-omstart. Reell videohelse og manuell Reconnect er ferdige frå før.
4. **T04/D07:** fysisk kameramatrise og pakka plattform-/installer-/oppdateringskontroll før release; Mac-signering/notarisering må følgje eigne instruksjonar.

Retningsvalet for CSP/IPC er kontrollert mot [Electron sine tryggleiksråd](https://www.electronjs.org/docs/latest/tutorial/security), og testa lokalt som oppgitt ovanfor. Nye nettverks-/kamerakjelder skal ikkje leggjast direkte i renderer.

Ved ny økt: denne bolken og `utbetring-snapshot-auth-framdrift.md` er ferdige. Les framdrifta før nye endringar. Arbeidskopien inneheld mange autoriserte endringar frå tidlegare bolkar og opphavlege brukarendringar; ingen av dei skal ryddast bort.
