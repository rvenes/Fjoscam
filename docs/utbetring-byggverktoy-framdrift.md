# Fjoscam – byggverktøy og reproduserbar kontroll

Status: **fullført og verifisert på Windows**, 21. september 2026. Startpunkt: 360 testar / 32 filer, bygg og isolert Windows-pakke består.

## Avgrensa bolk D05

- Deklarer ein eksakt Node/npm-referanse for CI/release utan å endre global installasjon.
- Bruk Node 22-typar slik at kompilering ikkje føreset API frå Node 25.
- Fest GitHub Actions til kontrollerte commit-SHA-ar og avgrens token til lesing.
- Bygg isolert pakkekontroll frå kopiert kjeldekode og låste dependencies, slik at gamle `dist-*`-filer ikkje kan gje falsk tryggleik.

Ingen commit/push/publisering er bestilt. Ingen Mac-maskin eller ekte kamera skal kontaktast. Endringar og resultat blir lagra her og i vedlikehaldsindeksen. Kjeldebygg er ikkje det same som byte-identiske signerte releasefiler; runner-image, signering og plattformar er framleis separate kontrollar.

## Kontrollpunkt 1 – implementert, testar pågår

- `.nvmrc` har 22.23.2, `packageManager` npm 10.9.8. `engines` tillèt referansen og Node 24.19+ innan 24-serien med npm 10.9.8–12.x. Lokal global installasjon er ikkje endra.
- `@types/node` er eksakt 22.20.4; installasjon gav 0 kjende npm-sårbarheiter. Node 25-typar er ikkje lenger grunnlaget for appen.
- CI bruker `.nvmrc`, fast SHA for checkout v7 / setup-node v6, `contents: read` og ingen lagra Git-credentials. SHA-ar er kontrollerte mot GitHub API.
- Pakkekontroll kopierer kjelde/config, køyrer fersk build etter `npm ci`, bruker staging sitt electron-builder og registrerer Node/npm/lockhash. Ingen gamle dist-filer blir kopierte. Eksisterande root Electron-binær er framleis kontrollert gjenbruk frå den låste versjonen; denne kontrollen er ikkje fullstendig hermetisk.
- Offisiell Node 22.23.2 Windows ZIP er lasta til `out/toolchain-27d7784bb9fb48129712deaddaf182c8`, SHA-256 kontrollert mot offisiell SHASUMS256. Denne private testprosessen bruker portabel Node/npm; systeminstallasjonen er uendra. Full test pågår på denne referansen.
- Kjelder: [Node-utgjevingar](https://nodejs.org/dist/index.json), [GitHub sine råd om SHA-pinning](https://docs.github.com/en/actions/reference/security/secure-use), [npm engines](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/).

Attstår: fulltest, bygg og isolert Windows-pakke på referanseverktøya; ikkje hevd desse som bestått før faktisk resultat.

## Kontrollpunkt 2

- 360 testar / 32 filer består på portabel Node 22.23.2 / npm 10.9.8. Ein eksisterande renderer-test venta berre på API-kallet; han ventar no på dei faktiske kontrollane før vidare klikk. Ingen produksjonsåtferd er endra av den testrettinga.
- Node 22-typane avdekte at HTTPS `connection` er typa som `Duplex`; test-fixturen held no denne felles basetypen for rydding utan type-cast. TypeScript/Vite/vendor-bygg består.
- Isolert kjeldebygg/pakkekontroll pågår i `out/dependency-check-AbCM85`. Ved avbrot: kontroller `verification.json`.

## Sluttkontroll

`out/dependency-check-AbCM85/verification.json` har PASS for app/TLS/playback, `builtFromSource: true`, Node v22.23.2 og npm 10.9.8. Fersk `npm ci` bevarte lockhash `4aa662b26895372a1e650cfb9d55d110fac027741b25c9f49e7cd0acd8b50e00`; fersk TypeScript/Vite/vendor-build og pakka Windows-app består.

Avgrensingar: CI-fila er oppdatert, men GitHub CI og native Mac-bygg er ikkje køyrde her. Det normale lokale TSC-bygget kan framleis ha gamle outputfiler etter sletta kjeldefiler; releaseinstruksen krev rein checkout, og isolert kontroll gjenbruker ingen slike filer. Runner-image og signerte artefaktar er ikkje byte-pinna. Ingen release er laga eller publisert.
