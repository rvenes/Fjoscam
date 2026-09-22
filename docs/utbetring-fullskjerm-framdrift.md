# Fjoscam – synkronisering av native fullskjerm

Status: **fullført og lagra**. Startpunkt: 348 testar og bygg med permanent unused-kontroll består. Tidlegare ONVIF-, bridge- og straumryddingsbolkar er fullførte og lagra.

G04: renderer skal følgje faktisk fullskjermstatus frå Electron ved meny-/OS-endringar og etter reload. Abonner før innleiande statuslesing og avvis eit forseinka startoppslag dersom ei nyare hending har kome. Handter avvist setFullscreen utan uhandtert promise. Bevar Enter/Numpad Enter/F11/Esc.

Test native-event/IPC, forsinka initialstatus, avmelding og rendererklasse. Dialogfokus er neste del av G04; inga endring av språk eller lagring av lydpreferansar i denne bolken.

## Resultat og verifikasjon

- Main sender `enter-full-screen`/`leave-full-screen` til eigarvindauget. Validert `app:get-fullscreen` IPC gir startstatus ved renderer-load. Preload filtrerer eventverdien til boolean.
- Ny liten `useWindowFullscreen` eig abonnementet; forseinka initialstatus kan ikkje overskrive nyare native-hending. Renderer gjettar ikkje lenger at ei asynkron native-endring er ferdig; feil ved set blir handtert med fast melding.
- **352/352 testar / 30 filer**, bygg og diff-kontroll består. Fire nye scenario: native IPC/event, forsinka status, reload/unsubscribe og faktisk React-klasse/tastatur/avvist set.
- [Electron BrowserWindow-dokumentasjonen](https://www.electronjs.org/docs/latest/api/browser-window) stadfestar eventane og at macOS-overgangen er asynkron. Native Mac-/menytest står att før distribusjon. Windows-eventrouting er ein kontrollert mocktest; ingen fysisk fullskjermtest er hevda.
- Neste bolk: G04-dialogar med fokusfelle, fokusretur og sperring av globale kameratastar medan dialogen er open.
