# Fjoscam – go2rtc-prosesshelse og kontrollert gjenoppretting

Status: **fullført og lagra**. Startpunkt: 334 testar / 28 filer og bygg bestått; førre ONVIF-bolkar er lagra.

## Plan

- Rapporter separat bridge-status i eksisterande playback-health, med trygg årsak ved uventa exit/oppstartsfeil.
- Gjenopprett berre ein tidlegare registrert straum som den aktive spelaren framleis spør etter. Ingen automatisk oppstart for ukjende eller invaliderte kamera.
- Del pågåande recovery, avgrens forsøk og backoff. Eksplisitt Reconnect gir nytt forsøk. Shutdown skal ikkje kunne utløyse ny prosess.
- Ikkje lagre rå stdout/stderr frå go2rtc: klassifiser berre kjende feiltypar til faste meldingar, med avgrensa linjebuffer. Kjeldene kan innehalde kamera-URL/passord.
- Test faktisk child-exit/restart med den medfølgjande binæren og syntetisk kamera; test UI-status og pakka/ekte Electron-regresjon der relevant.

Avgrensing: ein levande, hengande child og kamera-/kodekfeil skal ikkje starte ein uavgrensa prosessrestart-loop. Vidare stall-/kamera-reconnect og diagnostikkeksport blir eigne oppgåver. Ingen reelle kamera, server-/Mac-arbeid eller publisering.

Ved avbrot: les denne fila og Git-diffen. Ingen commit er utført; tidlegare lagra bolkar må bevarast.

## Kontrollpunkt 1 – implementering lagra

- `observePlayback` kjenner berre registrerte straumnamn; config-save/remove fjernar retten til automatisk recovery. Uventa child-exit gir restart ved neste aktive helsesjekk, med deling av pågåande forsøk, backoff og maks fem forsøk. Først 60 s stabil drift eller eksplisitt opning/reconnect nullstiller budsjettet.
- Straumen blir registrert i minnet att; credential-bearing YAML er ikkje innført. Readiness kontrollerer framleis privat autentisering, og berre eigen child blir stoppa.
- `BridgeHealth` i eksisterande health-IPC skil lokal videoteneste frå video-frames. Renderer viser ventetid/feil og lastar berre iframe på nytt etter recovery, utan å nullstille forsøksbudsjettet.
- Child stdout/stderr får kvar sin 4096-teikns linjebuffer. Berre faste kategoriar for portkonflikt/tilgangsfeil og trygt exitcode/signal blir logga; ukjent tekst og for lange linjer blir kasta.
- Målretta testar/bygg består, inkludert faktisk binær som blir avslutta og automatisk starta med straumen registrert att; fem mislukka restartar og eksplisitt reconnect; ukjent/invalidering/shutdown utan restart; UI-callback og rådiagnostikk.
- Fyrste retry-test avslørte feil i testklokka (ho vart flytt før førre forsøk hadde sett backoff), ikkje produksjonskoden. Testen ventar no på rapportert retry-ventetid; spawn-mock blir nullstilt per test.
- Full regresjon og ekte Electron-kontroll står att. Levande fastlåst prosess, fysisk kamera og diagnostikkeksport er framleis utanfor denne bolken.

## Endeleg resultat

- **343/343 testar / 29 filer og bygg bestått.** Ni nye testar dekkjer child-recovery, retry-grense, ugyldig/gammal straum, trygg diagnostikk, main-IPC og faktisk React-iframe-reload utan nytt stream-open/kvalitetsbyte.
- **Ekte Windows Electron playback-smoke: PASS**, no utvida med styrt avslutting av berre testen sin eigen go2rtc-child, automatisk restart, straumregistrering og autentisert WebSocket etter player-reload. Eksisterande krypterings-, CSP-, bilde-/frame- og lydkontrollar består.
- Automatisk recovery gjeld uventa avslutta child. Han påstår ikkje at eit kamera lever eller at video kjem: frame-status er framleis separat og krev reelle bilete. Ukjent straum, config-invalidering og app-shutdown kan ikkje drive restart.
- Endringsrisiko: fem forsøk/backoff kan gi ventetid før video kjem att; eksplisitt Reconnect gir ny sjanse. Ein levande fastlåst prosess og vedvarande kamera-/kodekfeil gir framleis manuell feilsøking/reconnect. Berre kjende faste feilkategoriar blir viste; detaljert loggeksport og fysisk kamera-/Mac-test står att.
- Neste prioriterte bolk: E04, fjerning av gamle go2rtc-streamregistreringar og kameraopplysningar ved save/remove/disconnect. Registreringsmetadata blir no invalidert i appen, men gamle kjelder kan framleis liggje i go2rtc sitt minne til overskriving/prosesslutt.
