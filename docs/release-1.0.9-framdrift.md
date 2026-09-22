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
