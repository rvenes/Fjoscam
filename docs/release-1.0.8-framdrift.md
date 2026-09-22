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

## Kontrollpunkt: Mac-pakketestar og GitHub CI

- Alle seks 1.0.8 Mac-pakkesjekkar består (`arm64/app`, `arm64/tls`, `arm64/playback`, `x64/app`, `x64/tls`, `x64/playback`). Intel-køyringa bruker Rosetta. Begge testpakkane har bestått streng signatur- og identitetskontroll.
- Mac-rapport: `out/release-1.0.8-20260922/mac-packaged-verification.json`. Windows-rapport er kopiert til same mappe. Begge viser same låsfil-SHA-256 `ea538a053eaa393316b9e00aa32fbd145f6f3c39a4e5630515bee1697452da4f`, Node 22.23.2 og npm 10.9.8.
- GitHub CI består på Windows/macOS for både releasecommit `5e14a03` og nettside/dokumentcommit `04f9fde` (køyringar `35696886490` og `35697247123`).
- Nettsida er også visuelt kontrollert i nettlesar. Førebels global publisher-preview var heilt rein: åtte mapper, ingen endringar. Ny obligatorisk preview blir køyrd etter ferdig staging.
- Normale Mac-installeringspakkar blir no bygde separat. Ingen offentlege filer er endra enno.

## Kontrollpunkt: ferdige Mac-installeringsfiler

- Normalt Mac-bygg fullførte med exitkode 0. Begge produksjonsappane består den strenge signaturkontrollen; Apple-notarisering er ikkje utført.
- Begge DMG-ar består checksumkontroll, skriveverna montering, isolert appkopiering, signatur/identitet, arkitektur, produksjonsinngang og vendor-/lisenskontroll.
- `latest-mac.yml` inneheld begge ZIP-arkitekturane. Alle oppførte filstorleikar og SHA-512-verdiar stemmer med filene.
- Rapport er lagra som `out/release-1.0.8-20260922/mac-artifacts.json`. Ni Mac-filer, totalt 540 097 706 byte, er kopierte og hashkontrollerte i Syncthing-leveringa `Fjoscam/1.0.8-20260922-5e14a03-CZwwAP`; manifest og `READY` vart skrivne sist.
- GUI-byggjobben er avregistrert. Berre eigne mellombelse DMG-mounts vart opna/lukka; den installerte Fjoscam-appen og eksisterande Mac-prosjekt er ikkje endra.

## Publisering

- Windows-mottaket verifiserte `READY`, alle ni SHA-256-summar, eksklusiv filopning og stabilt filtal/storleik over minst 11 sekund. Tolv releasefiler og nettsida vart kopierte til staging og kontrollerte på nytt. Historiske filer er bevarte.
- Endeleg global førehandsvising: berre `fjoscam`, ti nye filer, tre oppdateringar (`index.html`, `latest.yml`, `latest-mac.yml`), null slettingar. Åtte mapper kontrollerte; sju uendra. Exitkode 0.
- Publisering fullførte med `Publish completed successfully.` og exitkode 0. Same ti nye/tre oppdaterte/null sletta filer.
- Første raske HTTP-etterkontroll møtte HTTP 429 etter fleire vellukka kontrollar. Ny kontroll med pausar fullførte utan feil.
- Offentleg `index.html`, `latest.yml` og `latest-mac.yml` er byteidentiske med godkjend staging. Alle tolv releasefiler svarar HTTP 200 med korrekt storleik. Rapport: `out/release-1.0.8-20260922/public-verification.json`, kontrollert 22. september kl. 09:14 norsk tid.
- Offentleg nettlesarkontroll viser nyheitene for 1.0.8 og fungerande versjonslenkjer for Windows, Mac Apple Silicon og Mac Intel.
- Artifactinventar og testomfang er lagra i `docs/release-1.0.8-checks.json`; lokale detaljloggar ligg under `out/release-1.0.8-20260922/`.

**Bestillinga er fullført:** alle tre 1.0.8-versjonane og nettsidenyheitene er publiserte. Kjeldekode og releasenettside er pusha til GitHub, og releasebevisa er lagra.

## Verifikasjonsavgrensingar

Mac-signeringa bruker Apple Development og er ikkje notariseringskontroll. Intel-køyring blir testa via Rosetta. Fysiske kamera, fysisk Intel-Mac og verkeleg native oppdateringsinstallasjon er ikkje stadfesta av dei syntetiske pakketestane.
