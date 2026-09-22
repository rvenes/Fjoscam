# Fjoscam – andre utbetringsbolk

Start: 18. september 2026. Bestilling: hald fram med neste prioriterte del og lagre undervegs. Sjå førre logg `utbetring-framdrift-2026-09-17.md` og revisjonsrapporten.

**Status: andre bolk ferdig og kontrollert. 79/79 testar, bygg og isolert Electron-/safeStorage-røyketest bestått.** Koden er lagra i arbeidsmappa, ikkje committa eller publisert.

## Omfang

S01 resten: krypter heile generiske RTSP/RTSPS-URL-ar med safeStorage; ikkje returner lagra URL-ar i renderer-state. Gjer tomt URL-felt ved redigering til «behald lagra adresse». Migrer gyldig lokal konfigurasjon og backup utan å slette kamera eller backuphistorikk. Bevar UniFi-normalisering og avspeling.

## Kontrollpunkt

- Git-status, instruksjonar, førre logg og eksisterande store/types/validering er lesne. Førre arbeidsbolk og eksisterande brukarendringar ligg framleis urørte i arbeidsmappa.
- Plan for migrering: all kryptering/verifisering før første filutskifting, atomisk utskifting av kvar fil, serialisert tilgang, feil utan tom-reset dersom OS-kryptering ikkje er tilgjengeleg. Eldre eksterne kopiar blir ikkje sletta eller automatisk funne.
- Kontrollpunkt 1: store/types/validering/UI er lagra. URL-ar går no i separat safeStorage-kryptert map, og getState returnerer berre hasStreamUrl. Begge gyldige filer blir migrerte under same kø; kryptering og dekrypteringskontroll skjer før første utskifting. Backup behaldar si eiga kamerahistorie.
- Første bygg etter endringane bestod. Eksisterande full testsuite blir køyrd; nye migrerings-/feilsti-/UI-testar og ekte safeStorage-røyketest står att.
- Ny adresse på eksisterande kamera utløyser ny avspeling etter lagring. URL-feltet er maskert; tomt felt beheld lagra adresse, og lukking ryddar det innskrivne feltet.
- Kontrollpunkt 2: 11 nye store-/migreringstestar og 2 nye renderer-testar bestod. Skjult Electron-røyketest bestod med faktisk safeStorage på Windows: migrering av syntetisk hovudfil/backup, bevaring ved tom redigering, avspeling via go2rtc og autentiserte biletruter.
- README er oppdatert målretta rundt credential-/migreringsåtferda; eksisterande brukarendringar er bevarte. Normal backupbygging brukar same verifiserte atomiske skriving og kan ikkje kopiere ein gammal URL i klartekst til ny backup.

## Ved avbrot

Les denne loggen og `git diff` før vidare arbeid. Ingen commit/push/pakking/publisering er bestilt. Test berre syntetiske kamera og isolerte testmapper; ikkje opne ekte kameraløyndomar.

## Ferdig resultat

- **S01, resten av app-lagringa:** heile generiske URL-ar, med innebygde passord og token i sti/query, blir krypterte i `encryptedStreamUrls` med Electron safeStorage. Vanleg kamerakonfigurasjon inneheld ikkje URL-feltet. Dei eksisterande passordoppføringane brukar framleis same format.
- `CameraConfig` har berre `hasStreamUrl`; `CameraInput` og main-processens `CameraWithSecret` kan ha den faktiske URL-en. Ingen ny IPC for å hente lagra løyndomar er innført.
- Ny eller erstatta URL krev gyldig RTSP/RTSPS-adresse og fungerande OS-kryptering. Tom URL ved redigering av eit eksisterande generisk kamera beheld lagra ciphertext. Bytte av kameratype krev dei nødvendige nye løyndomane; eksisterande ID som ikkje finst blir avvist.
- URL-feltet er maskert og tydeleg merkt for «behald lagra adresse». Avbrot/lukking tømmer den innskrivne verdien. Generisk vertnamn blir utleidd frå adressa, og lagring utløyser ny avspeling sjølv når kamera-ID er den same.
- Legacy-migrering skjer ved første store-tilgang, serialisert med lesing og skriving. Kryptering og round-trip-verifisering av begge gyldige filer skjer før første utskifting. Kvar fil blir deretter skriven til unik tempfil, synka, validert og erstatta atomisk. Backup blir behandla først og beheld si eiga historie.
- Dersom prosessen stoppar etter backup-utskifting og før hovudfil-utskifting, kan neste forsøk halde fram. Dersom OS-kryptering ikkje fungerer, blir ingen av filene erstatta. Ugyldige filer blir ikkje «reparerte» med ei tom kameraliste. Migrering rører ikkje ein korrupt backup.
- Nye backupkopiar blir bygde gjennom same atomiske skriveveg; ein legacy-URL blir aldri kopiert i klartekst til ei ny backupfil.

### Filene i denne bolken

- `src/main/store.ts`: kryptering, migrering, backup og skiljet mellom offentleg tilstand og løyndomar.
- `src/shared/types.ts`, `src/shared/validation.ts`: URL som secret og validering av tomt redigeringsfelt.
- `src/renderer/App.tsx`: trygg redigering, rydding ved avbrot og ny avspeling etter lagring.
- `src/main/streamSecrets.test.ts`: 14 nye migrerings-/lagringstestar; AES-fixture for å simulere kryptering/feil utan OS-avhengig unit test.
- `src/renderer/App.test.tsx`: 2 nye UI-testar.
- `scripts/smokeLocalPlayback.cjs`: utvida med ekte safeStorage og ekte store → go2rtc-flyt på syntetiske data.
- `README.md`: oppdatert berre credential-/migreringsdelen og lenkje til denne loggen. Andre eksisterande brukarendringar er bevarte.

## Endeleg verifikasjon

| Kontroll | Resultat |
| --- | --- |
| `npm test` | **79 testar / 13 filer bestått**, opp frå 63 før bolken. |
| `npm run build` | **Bestått**, begge TypeScript-prosjekta og Vite. |
| `node node_modules/electron/cli.js scripts/smokeLocalPlayback.cjs` | **Bestått på Windows** med skjult vindauge, isolert userData og faktisk OS-kryptering. |
| `git diff --check` | **Bestått**. Git melder berre eksisterande LF/CRLF-normalisering. |

Røyketesten kontrollerte migrering av hovudfil/backup, dekryptering berre i main, tom redigering, erstatta URL i faktisk go2rtc, UniFi `enableSrtp`-normalisering, ingen URL-persistens i go2rtc-YAML, iframe-modular, autentisert WebSocket og snapshot. Han kontrollerte òg at renderer og uautentiserte klientar ikkje får admin-tilgang. Ingen ekte kamera eller privat kamerakonfigurasjon vart lesne. Testmappene under OS-temp inneheld berre syntetiske data.

## Avgrensingar og endringsrisiko

- Faktisk Mac-keychain, Intel/Apple Silicon-pakker og ekte kamera/video/lyd er ikkje testa. Relevant Mac-/releasekontroll står att før distribusjon.
- Krypterte URL-ar er knytte til OS-kontoen. Ved flytting til anna konto/maskin kan adressa måtte leggjast inn på nytt. Eldre Fjoscam-bygg forstår ikkje dette nye feltet; ikkje nedgrader og rediger same migrerte data med ein slik versjon.
- Dette er to atomiske filutskiftingar, ikkje ein atomisk transaksjon over begge filer. Mellomtilstanden ved avbrot er dekt av testar og kan takast opp att.
- Gamle eksterne backupkopiar, korrupte filer, eldre go2rtc-kopiar og filsystem-snapshots kan framleis innehalde klartekst frå før. Dei blir ikkje oppsøkte, sletta eller sikkert overskrivne automatisk. Rett kode kan ikkje trekkje tilbake allereie kopierte løyndomar.
- Namn, vert, brukarnamn, portar og vanlege kamerainnstillingar er framleis ikkje krypterte. S01 er retta for den aktive, gyldige app-konfigurasjonen og backupflyten; dette er ikkje eit løfte om at alle historiske data er krypterte.
- Ingen dependencies, pakkenummer, installer, updater-feed eller publisering er endra.

## Neste arbeid

1. **S05:** eksplisitt sertifikattillit/pinning per kamera, med trygg støtte for sjølvsignerte LAN-kamera og kontroll av RTSPS. Bevar legacy-kompatibilitet gjennom ein synleg tillitsflyt; ikkje berre skru på verifisering og bryt eksisterande kamera.
2. **S08:** avgrensa dependency-oppgraderingar med relevante plattform-/installer-testar.
3. **R08/R09/R12:** gamle asynkrone rendererresultat, full cache-invalidering og capability-gating. Denne bolken startar straumen på nytt etter lagring, men løyser ikkje alle desse funna.
4. Resten av session-/ONVIF-/reconnect-/updater-funna og reelle kameratestar frå førre logg.
