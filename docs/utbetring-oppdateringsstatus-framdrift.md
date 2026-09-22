# Fjoscam – robust oppdateringsstatus

Status: **ferdig**, 22. september 2026. Startpunkt: 463 testar / 35 filer og bygg består; siste pakka kontroll var ved 459 testar.

T03/G01 (Medium): oppdateraren manglar eigne scenario-testar. Rå error.message blir sendt til renderer, event-broadcast kan kaste når eit vindauge forsvinn, og renderer sine update-handlarar manglar catch. Eit seint IPC-svar med «checking»/«downloading» kan dessutan overskrive ei nyare tilgjengeleg/ferdig/feil-hending.

Plan: avgrensa trygg feil-/broadcast-handtering og eigarskap til nyaste UI-status, med målretta mocktestar og pakka feed-smoke. Bevar eksplisitt nedlasting/installasjon og dagens releasefeed. Ingen faktisk nedlasting/installasjon av oppdatering eller release er autorisert/utført i denne bolken. R17 førebels drain før installerstart er ei separat attståande oppgåve.

Resultat: 8 eigne updater-scenario og 4 UI-scenario er lagra. Feil brukar fast melding utan rå response-body/lokal filsti. Broadcast toler lukka vindauge, progress-tal er endelege og avgrensa, og renderer forkastar gamle svar/feil etter nyare status-event. Eksplisitt nedlasting/installasjon er bevart.

**475 testar / 36 filer, bygg/vendor-kontroll består med Node 22.23.2 / npm 10.9.8.** Isolert Windows-pakke `out/dependency-check-VRdGFv/verification.json`: **PASS** for app, TLS og playback, inkludert lokal updaterfeed og malformed YAML utan nedlasting/installasjon. Fysisk installatør-/Mac-kontroll står att.
