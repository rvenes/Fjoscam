# Fjoscam – rydding før eksplisitt oppdateringsinstallasjon

Status: **ferdig i kode og syntetiske kontrollar**, 22. september 2026. Startpunkt: 475 testar / 36 filer, bygg og pakka app/TLS/playback består (`out/dependency-check-VRdGFv`).

R17 (Medium): installasjonsknappen kallar updater direkte. I den installerte Windows-adapteren blir installatøren starta før app.quit, slik at vanleg before-quit-rydding kjem etter installerstart. Ei separat førebuing må derfor skje før kall til biblioteket, og må ikkje gjere appen permanent ubrukbar dersom installasjon blir avvist.

Plan: krev ferdig nedlasta oppdatering, del overlappande installasjonsførespurnader, vis førebuingsstatus, sperr nye kameraoperasjonar medan pågåande arbeid blir fullført, send PTZ-stopp, steng aktive snapshot-/bridgekjelder og logg ut før installerstart. Bruk reversible release-metodar; endeleg shutdown skjer ved faktisk appslutt. Dersom rydding feilar skal ingen installer starte, og appen skal tole retry/reconnect. Test med falsk installatør; ingen ekte installatør eller publisering. Kamera som ikkje kan nåast kan ikkje garanterast fysisk stillstand.

Kontrollpunkt: implementering og seks nye main-/updater-scenario er lagra; målretta testar og bygg består. `withUpdateInstallation` sperrar nye IPC-/playbackkall, ventar på aksepterte kamera-/storeoperasjonar og slepper eigde kjelder før `launch`. Permanent PTZ-/service-shutdown skjer framleis først ved appslutt. Eige `installing`-statusfelt gir brukarfeedback. Full suite og ny pakka kontroll står att.

Sluttkontroll: **482 testar / 36 filer, bygg/vendor-kontroll og isolert Windows-pakke består**, `out/dependency-check-FjmToT/verification.json`. Den pakka kontrollen bruker faktisk production IPC og go2rtc-child, men erstattar sjølve installatørkallet med ein falsk funksjon. Han beviser at child har avslutta før launch og at avspeling kan opnast på nytt etter meldt installasjonsfeil. Før nedlasting blir installasjon avvist. Eit sjuande scenario kontrollerer førebuingsstatus i UI.

Avgrensing: dette er ikkje ein verkeleg NSIS-/Mac-oppdateringstest. Native Mac sin vidare overlevering til systemoppdateraren, signering, filutskifting og appstart etter installasjon står att. Førebuing ventar med vilje på allereie aksepterte kamera-/lagringsoperasjonar; det er ikkje innført tvungen timeout som kan bryte av ei atomisk skriving. Nettverkskalla har eigne avgrensingar. Manuelt tilkoplingsforsøk kan vere nødvendig etter ein avvist installasjon.
