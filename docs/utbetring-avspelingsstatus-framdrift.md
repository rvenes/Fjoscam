# Fjoscam – avspelingsstatus og reconnect (R14/G01, del av R15)

Status: ferdig implementert og lokalt verifisert 19. september 2026. **205 testar bestått** (utgangspunkt: 188). Ingen commit, push eller publisering.

## Første kontrollpunkt

- Stadfesta falsk positiv live-status ved returnert stream-URL og iframe onLoad. Panasonic blir testa med Reolink API, og generisk stream-test påstår suksess utan kontakt.
- Plan: mål frameframdrift inne i den lokale spelaren via avgrensa main-IPC; hald API-resultat, bridge og video skilde. MJPEG får servermåling av leverte frames, ikkje onLoad som bevis på kontinuerleg video. Vis venting/stans/feil og eksplisitt Reconnect, som kan starte ein avslutta bridge på nytt utan å endre kvalitet.
- Lyd får éin main-eigar med siste innstilling og revisjonsvern, utan dei gamle konkurrerande renderer-/main-timarane. Måling returnerer berre tal og tilstandar, aldri stream-URL frå kamera, token eller rå spelarfeil.
- Panasonic-test skal vente på første JPEG frå den same legacy-parseren. Generisk test skal uttrykkje at avspelingsmåling er nødvendig, ikkje dikte API-suksess. Reolink-test rapporterer kontroll-API særskilt.
- Gjenbruk go2rtc sin innebygde reconnect; ikkje legg på ei ny uavgrensa omstartsløkke. Automatisk prosess-supervisjon og full R07 snapshot-auth-retry kan avgrensast til seinare bolk om dei ikkje trengst for denne rettinga.
- Står att: implementering, syntetiske regresjonstestar, bygg og ekte Electron-test. Ved avbrot: les denne fila og diffen først.

## Kontrollpunkt 2 – implementering lagra

- Ny `playerHealth.ts` observerer faktisk frame-callback inne i den eksakte lokale spelarramma; berre allowlista tal/boolean blir returnerte gjennom main-IPC. Éin uteståande callback og éi IPC-lesing om gongen. Ukjende URL-ar/adminflater blir avviste. Lydinnstillingar har main-eigar og monoton revisjon; gamle injiserte svar kan ikkje gjeninnføre tidlegare volum/mute.
- `usePlaybackHealth.ts` skil venting, observerte frames, stans etter 10 sekund, oppstart utan frames etter 15 sekund og feil. Hengande statuslesing får eige varsel etter 5 sekund, utan fleire samtidige kall.
- Renderer fjernar live/Connected frå URL- og iframe-onLoad. API-testresultat er separat. Reconnect opprettar ny visingsgenerasjon og registrerer den same kvaliteten på nytt. MJPEG-fallback er eit eksplisitt val, ikkje stille nedgradering.
- MJPEG-server har maksimalt 64 tilstandsoppføringar med frames/alder/avslutting, bundne til den aktuelle request-URL-en. Panasonic-test ventar på første JPEG gjennom eksisterande legacy-parser og lukkar ressursane. Generic-test rapporterer uverifisert/inga kontroll-API; Reolink rapporterer API-tilgang.
- Målretta kontroll: **61 testar bestått** i renderer/main/probe/MJPEG/hook. Første bygg passerte. Ny ekte Electron-kontroll med syntetisk canvas-video er skrive; står att å køyre denne, heile testpakken og endeleg bygg.
- R07 auth-retry/streng snapshotvalidering og automatisk overvaking/omstart av bridge-prosessen er framleis utanfor denne bolken.

## Endeleg kontrollpunkt – bolken er ferdig

### Endringar og funn

- **R14 / G01 (Medium):** `playerHealth.ts`, `usePlaybackHealth.ts`, main/preload og `App.tsx` skil avspeling frå kontroll-API. URL-return og iframe-load gjev ikkje suksess. Lokal spelarramme blir undersøkt i main utan å slå av same-origin-vern. Observasjon av faktisk videoframe gjev «Video playing»; manglande første frame, stans, spelarfeil og manglande svar har eigne meldingar. MJPEG blir presist merka «frames arriving» ut frå serverlevering, ikkje som verifisert dekoding i nettlesaren.
- **R14 (Medium):** Reconnect brukar ny visingsgenerasjon og eksisterande stream-registrering/start. Ein avslutta go2rtc kan då startast igjen ved brukaren sitt forsøk. High/Low og linseval blir bevarte. go2rtc sin interne reconnect er behalden; ny automatisk process-supervisor er ikkje lagt til. MJPEG-fallback er eit eksplisitt val ved problem.
- **R14 (Medium):** Kamera-testen går til rett adapter. Panasonic ventar på første JPEG gjennom legacy-parseren, med frist og opprydding. Reolink-resultatet seier «Camera API connected». Generic-resultatet seier at ingen kontroll-API er testa og viser til video-status; det påstår ikkje nettverkssuksess.
- **R15 (Medium):** Gamle renderer-lydforsøk og åtte separate main-timerforsøk er fjerna. Main held siste mute/volum, bruker revisjonsvern og legg verdiane på den aktuelle videospelaren ved statuslesing/lydendring. Videoreplassering og reconnect får siste innstilling. Kamerapassord, token, kilde-URL og rå spelarfeil blir aldri returnerte av den nye statusflata.
- **R07 (delvis, Medium):** Både snapshot og Reolink-MJPEG validerer content-type og JPEG/PNG-start/sluttmarkørar før levering/teljing. Logintekst og tydeleg trunkerte bilete kan ikkje bli rapporterte som frames. Dette er formatkontroll, ikkje full bilde-dekoding eller CRC-validering. Snap sin avgrensa autentiseringsretry står framleis att.

### Verifikasjon

- Full `npm test`: **205/205 testar i 22/22 filer**. Etter siste PNG-sluttmarkør-justering: snapshot-testane **11/11**. Etter siste Disconnect-/statusvising: renderer-testane **32/32**. Desse siste avgrensa endringane er òg bygde.
- `npm run build`: TypeScript for renderer/main og Vite godkjende etter siste kodeendring.
- 17 nye testar: spelarobservasjon/lydrevisjon, statusmaskin og manglande svar, eldre kamerasvar, separat API/video, Reconnect og kvalitet, adapterruting, Panasonic første-frame/lukking, MJPEG request-eigarskap, ugyldige snapshot-data.
- `node node_modules/electron/cli.js scripts/smokeLocalPlayback.cjs`: **PASS** på Windows, inkludert ekte frame-callback i ein cross-origin lokal spelarramme. Canvas-generert video viser at frames blir oppdaga, pause aukar frame-alderen, offline RTSP ikkje gjev frames, og siste mute/volum vinn. Eksisterande krypterings-/backup-/WebSocket-/tilgangskontrollar passerer òg. Køyrd etter siste backend-endring; siste reine renderer-/Disconnect-vising er dekt av renderer-test og bygg.
- `git diff --check`: godkjend. Ingen nye dependencies, versjonsendringar, distribusjonspakkar eller endringar i privat brukaroppsett.
- Undervegs feila ein gammal test fordi han sjekka totale mock-kall frå tidlegare testar; fixture-opprydding er retta. Typeannotasjon for ein teststatus er òg retta. Endelege kontrollar over er grøne.

### Viktige avgrensingar og risiko

- **Medium endringsrisiko:** status-/lydlivsløpet er endra. Ekte Electron er testa, men fysiske kamera, macOS og pakka release er ikkje prøvde i denne bolken.
- Frame-callback er eit signal om bilete sendt til nettlesaren si vising, ikkje ein nettverksping eller garanti for kameratilstand. Skjult/minimert vindauge, ein medvite pausa spelar og svært låg bildefrekvens kan gje gammal frame-alder. Status påstår derfor ikkje at kameraet er offline. Mekanismen er basert på [requestVideoFrameCallback-dokumentasjonen](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback).
- Status blir lesen éin gong per sekund, med høgst eitt uteståande kall per vising. Første-frame-frist er 15 s, stallgrense 10 s og treg statuslesing blir synleg etter 5 s. Ingen automatisk kvalitetsnedgradering eller ny omstartsløkke.
- MJPEG-statistikk er avgrensa til 64 request-oppføringar og måler levering av frame-data. Ho stadfestar ikkje at eit fysisk videobilete er korrekt dekoda.
- R07 Snap auth-retry, full G01 diagnoseeksport/child-feilklassifisering og automatisk bridge-supervisjon står att. R13 ONVIF service-/profiloppdaging og XML-parsing står òg att frå tidlegare.

### Neste tilrådde bolk

**R07 og resterande R10:** avgrensa Snap-reautentisering ved utløpt token, tydeleg skilje mellom feil credentials/sertifikat/nettverk, og regresjonstestar mot syntetiske HTTP-svar. Deretter fullfør R13 eller den attståande bridge-diagnostikken etter prioriteringslista. Denne avspelingsbolken er ferdig; ikkje start han på nytt ved avbrot.
