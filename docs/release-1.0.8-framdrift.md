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

## Kontrollpunkt: kjeldekode og Windows

- Releasekjelde `5e14a03` er committa og pusha til `origin/main`. Den private, uregistrerte instruksjonsplanen under `docs/plans/` er ikkje teken med.
- Windows: 527/527 testar, TypeScript/Vite/vendor-bygg og alle tre isolerte pakkesjekkar består. Pakkesjekk: `out/dependency-check-qiolOk/verification.json`.
- Vanleg Windows NSIS-installer er bygd med produksjonsinngang, versjon 1.0.8. Feedversjon, storleik og SHA-512 stemmer. Pakken inneheld berre rett go2rtc-binær, 34 moduloppføringar og 48 lisensnotisar. Authenticode-status er `NotSigned`.
- Windows artifactrapport: `out/release-1.0.8-20260922/windows-artifacts.json`.
- Mac byggjer frå ein ny Git-klone av same releasecommit: `/Users/rvenes/Code/Fjoscam-release-1.0.8-20260922-CZwwAP/source`. Det eksisterande Mac-prosjektet er ikkje endra. Alle 527 Mac-testar består; GUI-jobben `no.fjoscam.release.108.CZwwAP` køyrer signering/pakkekontroll og deretter normale DMG/ZIP-bygg.
- Nettsidekjelde er lagra i `website/index.html`. DOM/JavaScript-kontroll stadfestar nyheitene og alle tre dynamiske 1.0.8-nedlastingsknappane. Offentleg staging er enno ikkje endra.
- Git whitespace-kontroll fann berre uendra oppstraums whitespace i hashverna lisensnotisar og ei ekstra sluttlinje i `CameraDiscovery.tsx`; byteverna lisensar er bevarte.

## Kjende avgrensingar

Mac-signeringa bruker Apple Development og er ikkje notariseringskontroll. Intel-køyring blir testa via Rosetta. Fysiske kamera, fysisk Intel-Mac og verkeleg native oppdateringsinstallasjon er ikkje stadfesta av dei syntetiske pakketestane.
