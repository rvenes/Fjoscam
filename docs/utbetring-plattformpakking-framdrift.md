# Fjoscam – plattformspesifikk go2rtc-pakking

Status: **implementert og verifisert på Windows**, 22. september 2026. Startpunkt: 515 testar / 36 filer. Sluttpunkt: **527 testar / 36 filer, bygg og pakka Windows app/TLS/playback består**. Native Mac-kontroll er framleis del av den attståande plattformbolken.

Pakkeregelen tok med alle tre binærane i kvar app. Denne bolken ekskluderer binærmappene frå ASAR-innsamlinga og legg berre inn korrekt, hashkontrollert binær i `app.asar.unpacked/vendor/go2rtc/` gjennom `afterPack`, før signering. Eksisterande runtime-stiar og alle lisens-/inventarfiler blir bevarte. Ingen endring av kjeldebinærar, manifesthashar eller kamerakode.

`packageVendor.cjs` vel mål frå byggkonteksten (ikkje vertsmaskina), avviser ustøtta mål, verifiserer alle kjeldebinærar/notisar og kopierer utan overskriving/sletting. `verifyPackagedVendor` kontrollerer éin binær og avviser andre plattformmapper. Det fullstendige kjeldemanifestet blir framleis med.

## Verifisering

- **44 målretta vendortestar består**, inkludert 12 nye testar for dei tre byggkontekstane, ustøtta mål, manglande/ekstra binærar, endra kjeldebinær, overskriving og lenkjer/utstiar. Alle kjeldebinærar blir bevarte. Mac-konteksttestane brukar syntetiske filsystemdata på Windows og er ikkje native Mac-pakketestar.
- `npm test`: **527 testar / 36 filer PASS**.
- `npm run build`: vendor-gate, begge TypeScript-prosjekta og Vite består.
- Nytt isolert kjeldebygg/pakkekontroll: `out/dependency-check-iLrKju/verification.json`, **PASS** for app, TLS og playback med Node 22.23.2 / npm 10.9.8. Testen arvar dei faktiske produksjonsfilreglane og utvidar berre med verifikasjonsskripta. Den faktiske pakka appen startar korrekt go2rtc-child frå same sti som før; straum, recovery og lisenshashar består.
- Fysisk pakkeinnhald kontrollert: berre `win64` og `notices` som undermapper i vendor-mappa; ingen binærmapper/-filer ligg skjulte i ASAR. Alle 48 notisar er med.
- Dei to bortfiltrerte Mac-binærane utgjer **38 190 866 byte**. Målt vendor-mappe i Windows-pakka gjekk frå 58 062 191 til 19 872 684 byte (netto 38 189 507 byte mindre, etter litt større dokumentasjon). Dette er utpakka innhald, ikkje eit målt installer-/nedlastingskutt.
- `git diff --check` består. Lockfilen er uendra i denne bolken: SHA-256 `4aa662b26895372a1e650cfb9d55d110fac027741b25c9f49e7cd0acd8b50e00`.

## Ved framhald

Ingen kamerakode, kjeldebinærar, versjonar eller kjeldehashar er endra. Alt er lagra i arbeidskopien. Ikkje implementer denne kodebolken på nytt.

Dei to attståande hovudbolkane er native plattform-/installasjonskontroll og fysisk kameramatrise/langtidsdrift. På Mac må ein stadfeste korrekt binær/arkitektur, køyrerett, lisensfiler, signatur og avspeling i begge faktiske app-pakkene. RELEASING har fått dei konkrete fil-/arkitekturkontrollane.

Native Mac-signering/pakka app er ikkje testa her. Eksisterande `afterSign` er bevart. Ingen commit/push/release/publisering.
