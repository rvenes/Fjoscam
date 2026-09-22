# Release 1.0.9 – aktivt arbeid

Brukaren har bestilt dei nyttige restbolkane samla, retting av HTTPS-problemet ved kamerastyring og lansering av 1.0.9 på same måte som 1.0.8.

## Avgrensa implementasjonsbolkar

1. HTTPS-feil: varig, forståeleg varsel skilt frå videostatus, direkte veg til rett kamerainnstilling/sertifikatkontroll og regresjonstestar. Ingen automatisk tillit eller nedgradering til HTTP.
2. Lokal diagnostikk: ein eksplisitt, avgrensa rapport for feilsøking, utan kameraadresser, namn, brukarnamn, URL-ar, råloggar eller løyndomar.
3. Kvilemodus: stopp heldne kamerarørsler og gjenopprett berre avspeling brukaren hadde aktivert. Ingen automatisk kamerarørsle etter oppvakning.
4. Full test-/bygg-/pakkekontroll og 1.0.9 for Windows x64 og begge Mac-arkitekturane. Nettside, GitHub og venes.org blir oppdaterte etter kontrollane.

Fysisk Intel-Mac, kontrollerte feltmålingar/langtidsdrift og Developer ID/notarisering krev eiga faktisk verifisering. Desse blir ikkje erklærte fullførte gjennom syntetiske testar. Valfrie store funksjonar som multiview, ny ONVIF-kanalmapping og automatisk IP-rebinding inngår ikkje i denne feilrettingsreleasen.

## Funne årsak

Skjermbiletet viser den tilsikta sertifikatavvisinga frå 1.0.8: RTSP-video kan fungere sjølv om HTTPS-styring blir blokkert. Den eksisterande UI-en viser Electron sin IPC-feiltekst i botn, utan direkte løysingsknapp, og vellukka avspeling kan tømme feilmeldinga. Brukaren må framleis verifisere kameraets fingeravtrykk før eit sertifikatunntak blir lagra.

## Kontrollpunkt 22. september, kl. 16:11

- Dei tre avgrensa kodebolkane er implementerte, med nye regresjonstestar. Versjonen er oppdatert til 1.0.9 i pakke- og låsfil.
- **540 testar / 38 filer og TypeScript/Vite/vendor-bygg består på Windows.** Loggar ligg i `out/release-1.0.9-20260922/`.
- Varsel og direkte overgang til sertifikatinnstillingar er visuelt kontrollerte med syntetisk nettlesarfixture. Det er ikkje ein fysisk kameratest; fixture-videoen er ikkje ein verkeleg straum.
- Releasekjelde og nettside er committa og pusha som `173994b`. Private `docs/plans/` er bevarte lokalt og ikkje pusha.
- Windows køyrer fersk isolert pakkekontroll og deretter normalt NSIS-bygg.
- Mac byggjer frå ein ny Git-klone av same commit i `/Users/rvenes/Code/Fjoscam-release-1.0.9-20260922-4rE2Jj`. GUI-jobb `no.fjoscam.release.109.4rE2Jj` køyrer npm ci, fulltest, seks signerte pakkesjekkar og normale DMG/ZIP-bygg. Eksisterande prosjekt/installert app blir ikkje endra.
- Dei mellombelse nettlesar-/HTTP-førehandsvisingane er avslutta. Ingen offentlege 1.0.9-filer er publiserte enno.

## Windows-pakkar og Mac-testar

- Windows app/TLS/playback frå ny isolert pakke består: `out/dependency-check-7gHtZw/verification.json` (kopi i releasemappa). Vanleg NSIS-bygg fullførte med exitkode 0.
- Windows 1.0.9-installer: 112 042 259 byte. Versjon, produksjonsinngang, vendorinventar, feedstorleik og SHA-512 består. `windows-artifacts.json` inneheld SHA-256 for alle tre filene. Authenticode: `NotSigned`.
- **540 testar / 38 filer består også på Mac arm64.** Begge Mac-arkitekturane blir no signerte og pakkekontrollerte.
- Første globale venes.org-preview før staging var rein: åtte mapper, ingen endringar. Ny preview er påkravd etter staging.

## Signerte Mac-pakketestar fullførte

- Alle seks ferske Mac-pakketestar består: app, TLS og playback for arm64 og x64 under Rosetta. Rapporten er kopiert til `out/release-1.0.9-20260922/mac-packaged-verification.json`.
- Windows og Mac har identisk låsfilhash `48406b167869ecce6d92d2da2a6ffe1469a7dc703d3018fd74e6f1b90f39ca64`, Node 22.23.2 og npm 10.9.8. GitHub CI for releasekjelde `173994b` er grøn på begge plattformer.
- Mac-jobben byggjer no dei vanlege distribusjonsfilene. Etterpå skal begge DMG-ar monterast skriveverna og kopierast isolert; begge ZIP-ar skal pakkast ut isolert. Produksjonsinngang, versjon, signatur, arkitektur, vendorinventar og feedhashar skal kontrollerast før Syncthing-overføring og publisering.

## Alle distribusjonspakkane klare

- Mac-bygg fullførte med exitkode 0. Begge DMG-ar og begge utpakka ZIP-ar består versjons-, produksjonsinngangs-, signatur-, arkitektur- og vendor-kontroll. Begge genererte oppdateringsfeedar samsvarar med filstorleik/SHA-512. Sjå `out/release-1.0.9-20260922/mac-artifacts.json`.
- Den mellombelse GUI-jobben er avregistrert, og begge testmonteringane er avslutta. Ingen eksisterande installert app er erstatta.
- Ni ferdige Mac-filer (540 100 541 byte) er lagde i ny Syncthing-levering `Fjoscam/1.0.9-20260922-173994b-4rE2Jj`, med SHA-256-manifest og READY til slutt. Mottakarkontroll, staging og publisering står att.

## Publisert og verifisert – 22. september, kl. 16:27

- Syncthing-mottaket består: alle ni SHA-256-summar, eksklusive lesingar og 11 filer stabile gjennom minst 11 sekund. Tolv releasefiler og nettsida er kopierte til `H:\Koding\Venes.org\fjoscam` og hashverifiserte. Alle historiske filer er bevarte uendra.
- Den globale førehandsvisinga viste berre 10 nye filer og 3 oppdateringar i `fjoscam`, ingen slettingar. Åtte mapper kontrollerte, sju uendra. Preview og publisering fullførte med exitkode 0 og `Publish completed successfully.`
- Offentleg nettside og begge feedar er byteidentiske med staging. Alle tolv releasefiler svarar HTTP 200 med rett storleik. Nettlesaren viser 1.0.9, nye releasenotat og korrekte Windows-, Apple Silicon- og Intel-knappar.
- [Permanent kontrollrapport](release-1.0.9-checks.json) samlar kjeldecommit, verktøyversjonar, 540 testar på kvar testplattform, ni pakkemodusar, Mac-arkivkontrollar, filhashar og publiseringsresultat.
- Kjelde og nettside er pusha som `173994b`; endeleg kontrollrapport og vedlikehaldsstatus blir lagra i ein eigen dokumentasjonscommit. Ingen GitHub Release eller tag er oppretta.

### Attståande brukartest

Kameraet i skjermbiletet er ikkje endra eller automatisk godkjent. Etter oppdatering: **Review HTTPS certificate → Inspect HTTPS certificate → verifiser fingeravtrykket uavhengig → Use this certificate → Save camera and retry**. Feilen blir løyst for eit legitimt sjølvsignert kamera når korrekt sertifikatunntak er lagra; ingen fysisk kameratest er utført her.

Fysisk Intel, ekte OS-kvile/oppvakning, langvarig kameradrift og faktisk native oppdateringsinstallasjon/apprestart står att som manuelle plattform-/feltkontrollar. Mac er Apple Development-signert, ikkje notarisert; Windows er usignert. Ingen aktive eigne GUI-jobbar, DMG-monteringar eller mellombelse nettlesarvisingar står att. Transport- og byggkopiane er bevarte.
