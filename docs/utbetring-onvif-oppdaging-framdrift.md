# Fjoscam – ONVIF-oppdaging og robuste SOAP-svar

Status: **oppdaging/XML-bolken fullført og lagra; rørslefornying er òg fullført i eiga framdriftsfil**. Startpunkt: E01/E02-bolken, 304 testar / 26 filer og bygg bestått. Ingen commit eller publisering.

## Plan og avgjerder

- R13: erstatt regex-tolking med namespace-medviten XML-parser og streng SOAP-envelope/response-validering; avvis DTD, ugyldig XML og for store/kompliserte dokument utan rå feildetaljar.
- Oppdag Media/PTZ-adresser gjennom standard GetCapabilities på device_service. Godta berre same HTTP-opphav som brukaren har konfigurert. Bevar faste legacy-adresser berre når discovery uttrykkeleg er ustøtta (ikkje ved auth-/nettverks-/parsefeil).
- Bevar eksakt profil og PTZ-adresse for Stop ved uvisst rørsleresultat. Tidsavgrens og del discovery-cache; gamle svar må ikkje starte rørsle etter innstillingsbyte.
- Ikkje gjett NVR-kanal ut frå tokennamn eller rekkjefølgje. Avvis tvitydig profilval og ikkje-null kanal inntil eksplisitt, verifiserbar kanalkopling finst. Dette er ei medviten tryggleiksavgrensing.
- Deretter undersøkje fornying av kort ONVIF-rørsle ved halde tast, og gå vidare til G01/prosesshelse.

## Verifikasjon som står att

Loopback-SOAP-testar, full test/bygg, npm audit og isolert Windows-pakkekontroll ved ny runtime-dependency. Ingen ekte kamera, privat konfigurasjon eller passord skal opnast. Fysisk firmware-/NVR- og Mac-kontroll står att før distribusjon.

## Kontrollpunkt 1 – implementering lagra

- Namespace-medviten SOAP/XML-handtering i `onvifXml.ts`; `@xmldom/xmldom` 0.9.12 er eksplisitt pinna runtime-dependency. npm install/audit melder 0 sårbarheiter.
- GetCapabilities, same-origin-adresser, avgrensa legacy-fallback, 5 min cache, delte pågåande oppslag og vern ved konfigurasjonsbyte er implementert. Stop held originalt profiltoken og PTZ-adresse også ved mislukka rørslesvar og utgått cache.
- NVR-kanal != 0, fleire rapporterte videokjelder eller tvitydige PTZ-profilar blir avviste. Fleire encoding-profilar for same rapporterte kjelde/PTZ-node blir godtekne. Eksplisitt NVR-mapping er framleis ei framtidig oppgåve.
- **33/33 målretta testar i onvifXml/onvifClient består**. Første bygg består; ny full regresjonsrunde og pakka Windows-verifikasjon pågår.
- Rørslefornying ved halde tast og G01 er enno ikkje endra i denne bolken.

## Kontrollpunkt 2 – full regresjon

- **329/329 testar / 27 filer bestått**, `npm run build` og `git diff --check` består.
- 25 nye testar samanlikna med før bolken. Testane brukar syntetisk XML og faktiske loopback-HTTP-kall; ingen fysisk kamerakontroll er hevda.
- README er oppdatert med same-origin-grensa og eksplisitt NVR-avgrensing. Isolert Windows-pakkekontroll er starta; ikkje marker den som bestått før resultatet ligg føre.

## Endeleg verifikasjon av oppdaging/XML

- **329 testar / 27 filer**, bygg og diff-kontroll bestått.
- **Isolert Windows-pakke: PASS** for app, TLS og playback. `out/dependency-check-6V1xXO/verification.json` har resultatet og lockfile-hash. Rein installasjon med `npm ci`, faktisk pakka main/preload/renderer og ny XML-runtime lasta; begge eksisterande Electron-regresjonskontrollane består.
- npm audit: **0** rapporterte sårbarheiter etter installasjon. Eldre transitive byggverktøy gir framleis deprecation-varsel; dette er ikkje ein garanti for heile runtime/binærkjeda.
- Risiko: firmware med ugyldig XML eller service-adresser på andre portar blir no avvist tydeleg. HTTP 500 SOAP-fault blir handtert som HTTP-feil og gir ikkje legacy-fallback. Berre godkjend unsupported-status (404/405/501) eller kvalifisert ActionNotSupported i eit vellukka HTTP-svar gir faste legacy-paths.
- Attståande R13: eksplisitt NVR-/presetmapping, Media2-only/HTTPS-ONVIF og fysisk firmwareverifikasjon. Rørslefornying blir neste del. Ingen release/installer/Mac-verifikasjon eller distribusjon er utført.

## Kjelder

- ONVIF Device/Media/PTZ WSDL: https://www.onvif.org/ver10/device/wsdl/ , https://www.onvif.org/ver10/media/wsdl/ , https://www.onvif.org/ver20/ptz/wsdl/
- XML-parser: https://github.com/xmldom/xmldom (direkte runtime-avhengigheit, eksakt versjon og lockfile).

Ved avbrot: les denne fila og Git-diffen; mange tidlegare autoriserte bolkar ligg utan commit. Ikkje fjern desse.
