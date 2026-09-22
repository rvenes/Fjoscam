# Fjoscam – fanga oppstarts- og vindaugsfeil

Status: **ferdig**, 22. september 2026. Startpunkt: 455 testar / 35 filer, bygg og Electron-smoke består.

R/G01 (Medium): `app.whenReady().then(...)` har ingen rejection-handler. Dersom lokal snapshot-teneste eller vindaugsinnlasting feilar, kan appen stå utan fungerande vindauge og utan forklaring. Også `activate` og `second-instance` startar vindauge med ein ufanga promise.

Plan: éin idempotent feilveg med fast melding i native dialog, fast loggkategori og eksisterande ordna shutdown før appslutt. Ikkje vis rå feiltekst/URL/arbitrary error-data. Bevar Mac sin normale vindaugslivssyklus og single-instance-vern. Test tenestefeil, vindaugsfeil og feil ved ny aktivering med syntetisk Electron-mock; faktisk native dialog/Mac står att. Ingen kamera-/konfigendring eller ny dependency.

Resultat: rettinga og fire nye scenario er lagra. Også feil i sjølve native dialogen blir fanga, og rydding/appslutt blir fullført. **459 testar / 35 filer og bygg består med Node 22.23.2 / npm 10.9.8.** Isolert Windows-pakke frå fersk kjelde i `out/dependency-check-NH9z4r/verification.json`: **PASS** for app, TLS og playback. Inkluderer alle metadata-/status-/recoverybolkar fram til dette kontrollpunktet. Ingen ekte installasjon, kamera eller Mac-kontroll er utført.
