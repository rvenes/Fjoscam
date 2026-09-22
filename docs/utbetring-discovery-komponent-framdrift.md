# Fjoscam – nettverkssøket som eigen komponent

Status: **ferdig**, 21. september 2026. Startpunkt: 410 testar / 34 filer, bygg og Electron-smoke består.

D01, avgrensa vedlikehaldssteg: flytt berre nettverkssøk frå App.tsx til `CameraDiscovery.tsx`. Komponenten eig søkekallet, generasjonen, tilstanden og resultat-/diagnosevisinga; avmontering ugyldiggjer seint svar. App eig framleis sjølve kameraforma og kva som skjer når brukaren vel ein kandidat. Eksisterande IPC og nettverksteknikk er uendra.

Fem spreidde søkefelt er erstatta av ein tydeleg tilstand: searching, ready med rapport, eller error med melding. Ein mislukka scan skal ikkje vise ein misvisande «ingen eigna IPv4-nett»-konklusjon; slike opplysningar kjem berre frå eit fullført søk. Retry er bevart.

42 eksisterande App-scenariotestar består etter flyttinga; ekstra scenario for feil → retry er lagd til. Ingen stor app-/adapteromskriving eller nye dependencies.

Sluttkontroll: **411 testar / 34 filer**, bygg og vendor-hashkontroll består med Node 22.23.2 / npm 10.9.8. Isolert pakking frå fersk kjelde i `out/dependency-check-RQsmtt/verification.json`: **PASS** for app, TLS og playback i ekte Electron. Dette er ein verifikasjonspakke, ikkje ein release eller installasjonstest. Fysisk kamera og Mac er ikkje testa.
