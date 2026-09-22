# Fjoscam – dependency-risiko (S08)

Status: **dependency-rettingane er fullførte og lagra 18. september 2026. 140 testar / 18 filer, bygg og tre modusar i ei isolert Windows-pakke består. Npm audit: 26 → 0 rapporterte sårbarheiter.** Mac-/installer-/oppdateringsinstallasjon er ikkje verifisert og står att før release. Ingen commit, push eller publisering.

## Plan / kontrollpunkt 1

- Prosjektinstruksjonar, README, releaseprosedyre, CI, package/lockfile, updater og tidlegare framdrift lesne. Eksisterande brukarendringar og tidlegare bolkar skal bevarast.
- Ny `npm audit` stadfestar 26 varsla pakkenamn: 3 Critical, 20 High, 3 Moderate. Fleire er foreldre som arvar same underliggjande feil; dette er ikkje 26 stadfesta utnyttingar i Fjoscam.
- Skil faktisk distribuert Electron/updater frå utvikling, testing, installasjon og pakking. `electron` er devDependency i npm, men sjølve runtime blir distribuert; `--omit=dev` åleine kan derfor ikkje friskmelde appen.
- Oppdater avgrensa, kompatible grupper utan `audit fix --force` eller unødvendige majoroppgraderingar. Kontroller upstream-råd/releaseinformasjon og installer frå lockfile. Ingen endringar av kameraformat, video-kvalitet eller firmware.
- Køyre eksisterande testar, bygg og Windows Electron-smoke. Dersom bygg/updater blir endra, lag isolert lokal Windows-pakke for kontroll; ikkje overskriv releaseprodukt eller kontakt offentleg update-feed. Mac-/signeringskontroll må dokumenterast presist dersom han ikkje blir utført.
- Baseline-audit er lagra som `docs/dependency-audit-before-2026-09-18.json` (berre offentlege pakkenamn/advisories, ingen konfigurasjon/løyndomar). Ved avbrot: les denne loggen og Git-diffen før vidare arbeid.

## Førebels klassifisering

- Distribuert runtime: Electron sine eigne advisories og Chromium/Node-patchar. `electron-updater` / `builder-util-runtime` og `js-yaml` ligg i produksjonstreet; vurder update-feed/metadata/nettverksgrenser.
- Bygg/pakking/installasjon: electron-builder-familien, tar, extract-zip, tmp, xmldom, brace-expansion og delar av undici. Desse kan råke byggjemaskina sjølv om pakkane ikkje blir sende til brukarane.
- Utvikling/testing: Vite/devserver/PostCSS/nanoid, Vitest/mocker, concurrently/shell-quote, wait-on/axios/form-data/joi, jsdom/undici. Fjoscam køyrer ikkje kamerakall via axios, men utviklingsverktøya må òg vedlikehaldast.

Ingen versjonar er endra i dette kontrollpunktet. Baseline: Electron 41.3.0, builder 26.8.1, updater 6.8.3, Vite 8.0.10 og Vitest 4.1.5.

## Kontrollpunkt 2 – utviklingsverktøy

- Lagra eksakte versjonar: Vite 8.0.16, Vitest 4.1.11, concurrently 9.2.4, wait-on 9.1.0 og jsdom 29.1.1. Ingen majoroppgradering; React, TypeScript og UI-bibliotek er bevarte.
- Etter denne gruppa: **140/140 testar** og begge TypeScript-/Vite-bygg består. Audit fall frå 26 til 16 varsla pakkenamn (15 High / 1 Critical).
- Neste gruppe er under installasjon: Electron 41.10.7, electron-builder 26.15.3 og updater 6.8.9. Alle er innan eksisterande majorserie. Installerer først utan livssyklusskript, deretter Electron sitt nødvendige installasjonsskript for den kontrollerte runtime-versjonen. Verifikasjon av denne gruppa står att.
- Primærkjelder: [Electron iframe-retting](https://github.com/electron/electron/security/advisories/GHSA-9f4c-93c8-jc8g), [Vite Windows-sti-retting](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff), [updater redirect-headers, retta i builder-util-runtime 9.7.0](https://github.com/electron-userland/electron-builder/security/advisories/GHSA-p2f4-r6v6-j797). Fjoscam sitt offentlege generic-feed brukar ikkje private GitLab-token; oppdateringa fjernar likevel den sårbare bibliotekversjonen.

## Kontrollpunkt 3 – runtime, updater og transitive rettingar

- Electron 41.10.7, builder 26.15.3 og updater 6.8.9 er installerte og eksakt festa. Faktisk Electron-binær rapporterer 41.10.7.
- Oppdatert berre dei to attståande sårbare transitive pakkane innan eksisterande intervall: `js-yaml` 4.3.2 og `undici` 7.29.1. Ingen overrides eller nye direkte runtime-bibliotek.
- `npm audit`: **0 rapporterte sårbarheiter** etter desse endringane. Dette dekkjer npm-treet, ikkje den separate go2rtc-binæren eller ukjende feil.
- Mellom anna builder-util-runtime 9.7.0, tar 7.5.22 og xmldom 0.8.15 er no i lockfile. Gamal extract-zip er erstatta via Electron si eiga oppdaterte avhengigheit.
- Full verifikasjon av den samla gruppa, rein installasjon og isolert pakka Windows-test står att. Mac-pakker blir ikkje kontrollerte i denne bolken; ingen release skal skildrast som godkjend for Mac på dette grunnlaget.

## Kontrollpunkt 4 – samla testar og isolert pakking

- Samla endring: **140/140 testar og bygg består**. Begge eksisterande Windows Electron-smoke-testane består med Electron 41.10.7. Ei første parallellkøyring kolliderte på testport 1984; sekvensiell køyring består. Ingen appretting var nødvendig for testkollisjonen.
- Nye `scripts/checkPackagedDependencies.cjs` og `smokePackagedDependencies.cjs` lagar ein eigen `out/dependency-check-*` med kopierte bygg og rein `npm ci`, og køyrer berre syntetisk kameradata og loopback-feed. Normal `dist` og releasefiler blir ikkje endra.
- Første pakkeprototypen avdekte at ein eksplisitt builder-config ikkje arvar package.json-config automatisk. Pakkeverifikasjonen stoppa korrekt fordi go2rtc ikkje kom frå `app.asar.unpacked`. Testhjelparen er retta til å ta med heile eksisterande build-konfigurasjonen, inkludert app-ID, produktnamn, asarUnpack og update-feed. Produksjonskonfigurasjonen er ikkje endra. Ny isolert pakke blir bygd og testa no.
- Verifikasjonspakka har ein eigen test-bootstrap som først set isolert userData og deretter lastar faktisk production main/preload/renderer. Ho er ikkje eit distribuerbart releaseprodukt. Ingen offentleg updater blir kontakta, og ingen installasjon blir forsøkt.

## Kontrollpunkt 5 – støtta Electron-serie

- Ytterlegare upstream-kontroll viste at Electron 41 nådde EOL 25. august 2026. Null npm-advisories er derfor ikkje tilstrekkeleg vedlikehaldsgrunnlag for å bli verande på 41.
- Vald **Electron 43.7.3**, støtta serie fram til 5. januar 2027 etter gjeldande [releaseplan](https://releases.electronjs.org/schedule). 44 er ikkje vald: [breaking changes](https://www.electronjs.org/docs/latest/breaking-changes) fjernar macOS 12-støtte. Dette bevarer eksisterande OS-kompatibilitet og begge Mac-arkitekturar på dependency-nivå; faktisk Mac-køyring står att.
- Den andre pakkeprototypen fekk riktig go2rtc-sti og køyrde production main/preload/renderer og lokal updater-test, men siste testassertion venta `app-update.yml` frå ein `--dir`-pakke. Den fila blir generert av installer-target, ikkje dir-target. Testen er retta til å kontrollere den bevarte feed-konfigurasjonen i package.json. Ingen endring av produksjonsfeed.
- Electron 43-installasjon/bygg pågår. Sluttresultatet skal vise 43.7.3, ikkje det tidlegare 41.10.7-kontrollpunktet. Endeleg fulltest og alle tre pakka modusar står att.
- Kontroll av rein installasjon avdekte òg at Vitest sitt eksisterande exclude-mønster berre utelukka node_modules i rota; testane i kopierte dependency-mapper under `out` vart feilaktig tekne med. `vite.config.ts` utelukkar no alle `**/node_modules/**` og den ignorerte byggjemappa `out/**`. Ingen eigne kjeldetestar er tekne bort.

## Endeleg resultat

### Versjonar

| Direkte pakke | Før bolken | Lagra versjon | Grunn |
| --- | --- | --- | --- |
| electron | 41.3.0 | **43.7.3** | Kjende rettingar og støtta release-serie; macOS 12 bevart. |
| electron-updater | 6.8.3 | **6.8.9** | Oppdatert builder-util-runtime 9.7.0 og tryggare redirect-handtering. |
| electron-builder | 26.8.1 | **26.15.3** | Pakke-/runtime-verktøykjede og sårbare transitive avhengigheiter. |
| vite | 8.0.10 | **8.0.16** | Rettar dei varsla Windows-devserver-grensene innan same minorserie. |
| vitest | 4.1.5 | **4.1.11** | Rettar mocker/sti-varsla innan same minorserie. |
| concurrently | 9.2.1 | **9.2.4** | Oppdatert shell-quote i utviklingsflyten. |
| wait-on | 9.0.5 | **9.1.0** | Oppdaterte validerings-/HTTP-avhengigheiter. |
| jsdom | 29.0.2 | **29.1.1** | Oppdatert testmiljø utan majorbyte. |

Desse direkte versjonane er eksakte i package.json og lockfile. React, React DOM, TypeScript, ikonbiblioteket, ws og app-versjon **1.0.7** er bevarte. Transitive rettingar inkluderer js-yaml 4.3.2 og undici 7.29.1 innan foreldra sine støtta versjonsintervall. Ingen globale overrides, tvungen audit-fix eller ny produksjonsteneste.

### Verifikasjon

| Kontroll | Resultat |
| --- | --- |
| `npm test` etter siste konfigurasjonsretting | **140/140**, 18 filer. |
| `npm run build` med Electron 43.7.3 | **Bestått**, TypeScript for main/renderer og Vite. |
| `npm audit` / `npm audit --omit=dev` | **0** rapporterte sårbarheiter; før-/etter-JSON lagra i docs. |
| Manifest/lockfile | Versjon og direkte dependencies samsvarar. Alle 450 låste pakkeoppføringar har npm-registry HTTPS-kjelde og integritet. |
| Isolert `npm ci --ignore-scripts` | **Bestått**, 420 installerte pakkar på Windows; SHA-256 av lockfile uendra. Valfrie plattformpakkar forklarer skilnaden frå 450 oppføringar. |
| Pakka `app`-modus | **Bestått**, Electron **43.7.3**, faktisk production main/preload/React, isolert OS-kryptert userData og go2rtc frå `app.asar.unpacked`. |
| Pakka `tls`-modus | **Bestått**, faktisk HTTPS/RTSPS, pin/avvising, safeStorage og produksjonsdependency ws. |
| Pakka `playback`-modus | **Bestått**, iframe/modular/WebSocket/snapshot, URL-migrering og renderer-/API-tilgang. |
| Pakka updater | **Bestått** mot loopback generic-feed: gyldig versjon, ugyldig YAML avvist, ingen automatisk nedlasting eller installasjon. |

Varig lokalt kontrollresultat: `out/dependency-check-2PL077/verification.json`. Denne køyringa brukar lockfile-SHA-256 `7399ae839bf3d6510e085d826cadd11830180871832286bd950ed7a994e317a3`. Prototypane er bevarte under andre `out/dependency-check-*` for feilsøking; dei er ikkje releaseprodukt. Ingen fil i vanleg `dist`, inga offentleg staging-mappe og ingen feed på nett er endra.

Den endelege `--dir`-testen kontrollerer updater-runtime med eksplisitt lokal test-feed. Builder stripp-ar `build` frå pakka package.json og genererer ikkje app-update.yml for dir-target; generated release-metadata blir derfor ikkje hevda verifisert. Testhjelparen bevarer source build-konfigurasjonen ved pakking, med avgrensa override for test-entry/files/output og lokal Electron-distribusjon. Normal produksjons-entry og signeringshook er uendra.

### Risiko / avgrensing

- **S08 High, retta for dei kjende npm-varsla:** npm-treet har ingen advisories i kontrollen 18. september. Det er ikkje ei full friskmelding av Electron/Chromium, tredjepartsbinærar eller ukjende sårbarheiter.
- **Medium endringsrisiko:** Electron 41→43 gir ny Chromium-runtime. Oversikta for 42/43 er kontrollert: endringane i notification/offscreen/nativeImage/dialog/extension-handtering råkar ikkje dei brukte kameraflytane direkte. Binary-installasjon skjer frå 42 ved CLI-bruk eller eksplisitt install-electron. macOS Intel/ARM, H265/4K, lyd og langvarig fysisk kameraavspeling må likevel testast før distribusjon.
- **Release-verifikasjon står att:** native Mac-pakker med post-signature-hook, NSIS-installasjon, genererte feed-hashar og faktisk update-install er ikkje køyrde. `--dir`-testpakka med test-bootstrap er ikkje eit releaseprodukt. Ingen signert/notarisert release blir hevda.
- Electron 43 er planlagt støtta til **5. januar 2027**. Neste runtime-val må avklarast før dette; 44 krev macOS 13. Ingen kalenderautomatisering er oppretta.
- Fem eldre/deprecated underavhengigheiter finst framleis (inflight, glob 7, rimraf 2, boolean og lodash.isequal). Dei blir eigde av oppstraums verktøy/updater, og audit rapporterer ingen noverande advisory i det låste treet. Dei er ikkje erstatta med utesta major-overrides.
- `go2rtc` er framleis **1.9.14**. [Upstream releaseoversikt](https://github.com/AlexxIT/go2rtc/releases) viser denne som latest i kontrollen; [security-sida](https://github.com/AlexxIT/go2rtc/security) har ingen publiserte advisories. Dette er ikkje ein Go-module-/binærskann. Eksisterande auth/loopback/API-avgrensing og RTSPS-relay er bevarte; full supply-chain-/Go-runtime-kontroll er attståande D06-arbeid.
- Chromium skreiv to GPU-diagnoselinjer under avslutning av avspelingssmoken; alle assertions og prosessexit var vellukka. Dette er ikkje ein test av stabil GPU-dekoding over tid.
- Lokalt Node **24.19.0** / npm **12.0.2** er brukt. CI si Node 22-køyring er ikkje utløyst her. D05 (samordna Node/types/CI-policy) står att.

### Neste arbeidsbolk

Gå vidare med **R08/R09: forseinka renderer-resultat, kamerabyte og konfigurasjonsrevisjon**, der gammal profil/lys/kanal kan hamne på nytt aktivt kamera. Bevar denne dependency-bolken og alle tidlegare endringar. Deretter R12/R13, straumstatus og opprydding (E04), i samsvar med hovudrapporten. Plattform-/releasekontrollane ovanfor er obligatoriske før distribusjon.
