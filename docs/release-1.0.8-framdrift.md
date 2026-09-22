# Release 1.0.8 – framdrift

## Bestilling

22. september 2026: Brukaren har uttrykkeleg bestilt versjon 1.0.8 for Windows x64, macOS Intel og macOS Apple Silicon, publisering på venes.org, oppdaterte nettsidenyheiter og push til GitHub. Ingen GitHub Release er bestilt.

## Klargjering

- Gjeldande Mac-, Syncthing- og venes.org-instruksar er lesne.
- Git `main` og `origin/main` peika på same commit før releasearbeidet.
- Pakke- og låsfilversjon er oppdaterte til 1.0.8 med npm, utan automatisk tagg.
- Offentlege releasenotat ligg i `docs/release-1.0.8.md`.
- Ny Windows-testkøyring er starta; resultat og vidare pakkekontroll blir lagra under `out/release-1.0.8-20260922/`.
- Tidlegare 1.0.7-testpakkar skal ikkje publiserast som 1.0.8. Alle tre releasepakkane blir bygde på nytt.
- Historiske offentlege filer skal bevarast. Publisering ventar på full kontroll av alle pakkar, Syncthing-overføring og rein global førehandsvising.

## Avgrensingar

Mac-signeringa bruker Apple Development og er ikkje notariseringskontroll. Intel-køyring blir testa via Rosetta. Fysiske kamera, fysisk Intel-Mac og verkeleg native oppdateringsinstallasjon er ikkje stadfesta av dei syntetiske pakketestane.
