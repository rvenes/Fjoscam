# Fjoscam – eigarskap og rydding av videostraumar

Status: **fullført og lagra**. Startpunkt: G01-bolken, 343 testar, bygg og ekte Electron recovery-smoke bestått.

## Plan og teknisk val

- E04: frigjer straumressursar ved Disconnect, kamerabyte, config-save/remove og når eigarvindauget døyr. Ikkje la gamla URL/passord liggje i videoprosessen etter at visinga er frigjeven.
- Bruk kontrollert resirkulering av berre vår eigen go2rtc-child, utan å permanent stengje bridge-objektet. Nye opningar ventar på rydding før start; gamle registreringar kan ikkje overleve ein prosessgenerasjon.
- Grunn: [go2rtc 1.9.14 streams API](https://github.com/AlexxIT/go2rtc/blob/v1.9.14/internal/streams/api.go) sin DELETE slettar registeroppføringa og oppdaterer YAML, men stansar ikkje alle konsumentar/produsentar; registeroperasjonen manglar dessutan låsen som andre oppslag nyttar. Vi innfører ikkje denne feilstien for å rydde løyndomar.
- Fleire logiske kamera deler same child. Frigjeving kan derfor gi kort brot i andre registrerte visingar; dei får eksisterande avgrensa recovery. Dagens UI har eitt aktivt kamera. Eigen multiview-livssyklus må vurderast før ein slik funksjon blir innført.
- Legg til validert release-IPC. UI sender release før nye startar; seint gammalt svar må ikkje kunne sleppe ein ny eigar med same ID.

## Kontrollar som står att

Test kill/reopen med faktisk binær, invalidasjon under start/probe/registrering, shutdown under resirkulering, UI kamerabyte/disconnect og IPC-vern. Full test/bygg og ekte Electron-regresjon før bolken blir merka fullført.

Ingen fil-/databasesletting, privat kamera, commit eller publisering. Ved avbrot: les denne fila og Git-diffen; bevar tidlegare bolkar.

## Kontrollpunkt 1

- Restartbar resirkuleringsbarriere er lagra i go2rtcBridge. `invalidateCamera` sperrar gamle generasjonar, fjernar recovery-registrering og tilbakekallar RTSPS; dersom kameraet hadde ressursar, ventar ho på avslutting av berre eigen child.
- Validert `camera:release-stream` IPC/preload og renderer-eigar er implementert. Release blir sendt før ny opning på switch/disconnect, ved MJPEG-fallback og unmount. Eit seint gammalt startresultat slepper ikkje den nye eigaren.
- Main frigjev ressursar ved config-save/remove/linse-/kvalitetsbyte og ved lukka/krasja eigarvindauge. Reolink-policy blir oppdatert før ein eventuell child-stop-feil, slik at lagra tryggleiksval blir gjeldande.
- Testar for faktisk kill/reopen, fleire registrerte kamera, shutdown under release/reopen, UI A→B→A med forseinka A-svar og IPC er lagra. Første kontroll av fleire kamera viste at eit planlagt recycle arva førre backoff; eksplisitt resirkulering nullstiller no recovery-budsjettet, med revisjonsvern mot at gammal recovery set backoff tilbake.
- Bygg og dei andre målretta testane består. Ny bridge-kontroll pågår; full test og Electron står att.

## Endeleg verifikasjon og risiko

- **348/348 testar / 29 filer**, bygg og diff-kontroll bestått. Fem nye testar og oppdaterte RTSPS-/release-scenario.
- **Ekte Windows Electron smoke: PASS**, inkludert ny kontroll av at release avsluttar child, sperrar automatisk gjenoppretting av den gamle URL-en, og tillèt eksplisitt ny opning. Eksisterande crash/recovery, kryptering, CSP, autentisering, frames og lyd består.
- Planlagt frigjeving brukar ikkje retry-budsjettet frå eit tidlegare krasj. Seint avslutta recovery får ikkje setje gammal backoff etter nytt eksplisitt brukarval.
- Endringsrisiko: kamera-/linse-/kvalitetsbyte startar no ein frisk lokal videoprosess når ein gammal straum var eigd av visinga. Det kan gi litt ekstra oppstartstid; fleire logiske kamera på same child kan få eit kort brot og attregistrering. Dagens eitt-kamera-UI er testa. Ingen stille kvalitetsendring.
- Main avsluttar berre child-handtaket som denne appen eig. Ingen prosess-søk/masseavslutting eller sletting av lagra kameradata. Rydding av snapshot-/metadata-cache og eventuell framtidig multiview-delingsmodell må vurderast separat; ikkje hevda som fullført her.
- Neste bolk: D03, dei fire framleis ubrukte funksjonane som TypeScript rapporterer, med permanent unused-kontroll.
