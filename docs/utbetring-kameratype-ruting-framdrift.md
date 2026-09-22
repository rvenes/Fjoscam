# Fjoscam – rett transport for kameratypen

Status: **fullført og verifisert på Windows**, 21. september 2026. Startpunkt: 402 testar / 34 filer og bygg består.

D02: nokre backend-kall stolar framleis berre på at renderer skjuler feil kontrollar. Panasonic kunne nå Reolink IR/spotlight/siren-lesingar, siren-skriving mangla typevern, og generisk/Panasonic snapshot eller Panasonic WebRTC kunne utløysa feil protokoll. Vanleg UI brukar dei rette vegane, men feil/utdaterte IPC-kall bør ikkje sende legitimasjon eller kommandoar gjennom feil adapter.

Plan: same lille Reolink/legacy-typekontroll i backend og eksisterande kontrollpolicy; vakt ved adaptergrensa og media-ruting før nettverk/prosess-start. Behald kind-lause eldre Reolink-kamera og uendra Panasonic MJPEG/PTZ/generic RTSP-funksjonar. Ikkje migrer heile config til ny union eller lag eit stort adapterlag i denne bolken.

## Resultat

- Felles `isReolinkCamera` held ved lag legacy kind=undefined. Reolink-adapteren avviser andre typar før innlogging; main gir tomme unsupported-lesingar og avviser siren-/lysskriving til andre typar.
- Snapshotserveren avviser generic snapshot/MJPEG og Panasonic Reolink-snapshot før upstream. Panasonic MJPEG er bevart. go2rtc avviser Panasonic før child-start, med tydeleg forklaring om MJPEG.
- 410 testar / 34 filer, TypeScript/Vite/vendor-build og ekte Windows Electron-smoke består. Testar dekkjer IPC, adapter, reell lokal snapshot-HTTP og bridge før spawn.
- Smoke fann at den syntetiske bilettesten brukte generic-kamera som Reolink-snapshot. Fixturen har no ein eigen Reolink-oppføring i den isolerte teststore; normal generic-video/krypteringstest er bevart. Det nye typevernet er ikkje svekt for å få testen til å passere.
- Ingen endring i persistent format eller IPC-kontrakt. Stor config-union/adapterrefaktorering er framleis eit valfritt seinare steg; konkrete feilruter er stoppa utan denne risikoen.
