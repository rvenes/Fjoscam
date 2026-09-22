# Fjoscam – modul- og lisensinventar for go2rtc

Status: **fullført på modulnivå**, 22. september 2026. Startpunkt: 487 testar / 36 filer. Sluttpunkt: **515 testar / 36 filer, bygg og isolert Windows-pakkekontroll består**.

D06: den lokale vendor-kontrollen har opphav/hash og go2rtc sin eigen MIT-lisens, men manglar notisar for dei innebygde Go-modulane. Denne bolken les byggmetadata frå alle tre eksisterande binærar, kontrollerer modularkiv mot dei innebygde Go-summane og samlar lisens-/NOTICE-filer frå eksakte modulversjonar. Ingen kamera-/runtimekode, binæroppgradering, plattformfiltrering eller publisering.

Første funn: alle tre binærane oppgir Go 1.25.6, go2rtc v1.9.14 og same revisjon som vendor-manifestet. Dei har identisk liste over 34 avhengigheitsmodular. Denne lista er meir presis for distribusjonen enn heile upstream go.mod, som også har test-/byggavhengigheiter. Ingen Go-program eller kamera er køyrde for denne lesinga. Kjelde for formatet: https://go.dev/src/debug/buildinfo/buildinfo.go .

## Lagra kontrollpunkt

- Alle 34 modularkiv henta frå Go-proxyen og kontrollerte med Go sitt `h1`-format mot metadata i binærane. Arkiva ligg berre i ignorert `out/go-notices/`.
- `vendor/go2rtc/modules.json`, `THIRD-PARTY-NOTICES.md` og 48 originale notis-/lisensfiler er lagra. Paho sine `edl-v10`/`epl-v20` er med; Apache-fulltekst supplerer go-pkgs/yaml sine korte lisensheaderar. Go 1.25.6 LICENSE/PATENTS er med.
- Lokal byggkontroll les alle tre hashkontrollerte binærane, samanliknar modulversjon/sum, Go-versjon/revisjon/plattform og kontrollerer notisfilene med SHA-256. Ingen nettverk eller Python i vanleg bygg.
- 32 målretta vendortestar består. Pakka Windows-smoke er utvida til å køyre same kontroll på faktisk `app.asar.unpacked`.
- `.gitattributes` bevarer originale linjeskift i lisensfilene på Windows/macOS.

## Sluttkontroll

- `npm test`: **515 testar / 36 filer PASS**, inkludert 32 vendortestar (28 nye). Dekker manglande/endra notisar, foreldra modulversjon/sum, Go-/appversjon, arkitektur, duplikat, stitraversering, manglande tilleggs-/toolchain-/Paho-lisensar og feilforma Go-byggmetadata.
- `npm run build`: vendor-gate, begge TypeScript-prosjekta og Vite består. Kontrollerer alle tre faktiske binærar, 34 modular og 48 notisar (96 616 byte notistekst).
- `scripts/checkPackagedDependencies.cjs`: **PASS** i `out/dependency-check-jBBVnj/verification.json`, ferskt kjeldebygg med Node 22.23.2 / npm 10.9.8. App, TLS og playback består; full modul-/notiskontroll er køyrd mot innhaldet i den faktiske Windows-pakka. Dette er ei isolert verifikasjonsutgåve, ikkje ein release eller installatørtest.
- Vedlikehaldsverktøy kontrollert separat: hashverifisert eksport av alle tre byggmetadata; Paho-notisar regenererte byte for byte frå kontrollert ZIP; ZIP med endra LICENSE vart avvist med checksum mismatch. Desse er manuelle kontrollar i tillegg til Vitest, ikkje inkluderte i testtalet.
- `git diff --check` består. Git-attributtkontroll stadfestar at tekstnormalisering er slått av for notisfilene.
- README, RELEASING og vendor-rettleiinga forklarer inventaret, avgrensingane og kontrollert regenerering. Vanleg bygg brukar berre Node og lokale filer. Python-samlaren er eit eksplisitt vedlikehaldsverktøy og køyrer ikkje ved bygg eller appstart.

Ingen binærar eller kamera-/runtimekode er endra. Ingen commit/push/release/publisering. Alt er lagra i arbeidskopien.

## Avgrensingar og neste steg

Inventaret er på modulnivå; det er ikkje ein komplett kjeldefil-/symbolanalyse eller juridisk godkjenning av heile appen. Innebygde webressursar, alle attribusjonar i Go-kjeldetreet og Electron/npm er ikkje dekte av dette inventaret. Native Mac-pakking/signering og fysiske kamera er ikkje testa i denne bolken.

Neste avgrensa kodebolk er plattformspesifikk vendorpakking. Dei to større sluttkontrollbolkane er faktisk installasjon/oppdatering på Windows og begge Mac-arkitekturane, og fysisk kameramatrise/langtidsdrift. Ikkje implementer denne inventarbolken på nytt ved framhald.
