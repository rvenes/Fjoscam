# Fjoscam – livssyklus for snapshot og Panasonic MJPEG

Status: **fullført og verifisert på Windows**, 21. september 2026. Startpunkt: 389 testar / 34 filer, bygg og ekte Electron-smoke består.

E03/E04: klientfråkopling blir i dag oppdaga, men ein pågåande upstream-opning/snapshot kan halde fram fram til timeout. Panasonic-strømmen har dessutan ikkje eigen main-prosess-invalidering ved kameraendring/fjerning; han stolar på at renderer lukkar biletet.

Plan: per-request abortsignal fram til transporten, synkron lukking av kameraets aktive svar ved save/remove, og rydding ved appstopp. Ta med pending kameraoppslag slik at eit gammalt oppslag ikkje kan opne ny upstream etter invalidasjon. Behald eksisterande parser, autentisering, TLS, biletevalidering og backpressure. Deling av JPEG-cache/fanout blir vurdert separat etter levetidsrettinga.

## Kontrollpunkt 1

- SnapshotServer registrerer klienten før async kameraoppslag og har éin idempotent close-funksjon som set ended, aborterer, lukkar svar og fjernar registrering. Save/remove/lens-/kvalitetsbyte invaliderer kameraet; vindaugslukking/renderer-krasj og stopp ryddar alle.
- Reolink Snap og Panasonic open får signal fram til Node HTTP(S)-request, inkludert redirects. Abortsvar bruker fast tekst utan å reflektere ein eventuell sensitiv abortgrunn. Ei delt Reolink-innlogging kan framleis fullførast for andre kall, men det avbrotne snapshotkallet får ikkje starte Snap eller token-retry.
- Snapshot-loopane avbryt òg retry-/bileteventing. Etterfølgjande Panasonic-respons frå ein mock/sein kjelde blir framleis øydelagd dersom klienten alt er lukka.
- Nye loopback-testar verifiserer faktisk socketlukking før headers, midt i body, etter redirect og ved Panasonic-opning. Servertestar dekkjer gammalt oppslag, eitt kamera vs. anna aktivt kamera, signal ved fråkopling og ingen ny polling. IPC-testar dekkjer dei fire config-operasjonane.
- Testutvidinga avdekte ein eksisterande `beforeEach` som returnerte sjølve mock-funksjonen (Vitest handsama han som cleanup). Hooken returnerer no void og resetter implementasjonen mellom testar.
- Målretta testar og bygg består. Full test og ekte Electron-kontroll står att.

## Sluttkontroll

402 testar / 34 filer, TypeScript/Vite/vendor-build og isolert pakka Windows-kontroll består på referanseverktøya Node 22.23.2 / npm 10.9.8. `out/dependency-check-IBAZFg/verification.json` har PASS for app, TLS og playback frå fersk kjelde. Det omfattar også alle dei føregåande nye bolkane i denne økta. `git diff --check` består.

Ingen fysisk kamera-, Mac-, installatør- eller update-install-test er utført. Snapshotdeling, justering av frame-rate og måling av CPU/RAM/nettverk på faktisk kamera er framleis eigne ytingsoppgåver; dagens ein-klient-åtferd og Panasonic-parser er bevart.
