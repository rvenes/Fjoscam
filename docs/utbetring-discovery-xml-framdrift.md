# Fjoscam – WS-Discovery XML og porttolking

Status: **fullført og verifisert på Windows**, 21. september 2026. Startpunkt: 369 testar / 33 filer, bygg og ekte Electron-smoke består.

## Funn og avgrensing

- G02/R13: regex over ProbeMatches kan miste fleire ProbeMatch-element, tolke feil namespace/kommentarar og godta vilkårleg URL-skjema. Byt til den eksisterande avgrensa XML-parseren og kontroller svar mot søket sin MessageID.
- ONVIF XAddrs peikar på device service, ikkje nødvendigvis Reolink HTTP API. Ikkje bruk ONVIF-port 8000 som CGI-port; bruk separate observerte TCP-portar / eksisterande standard og medviten manuell kontroll.
- Behald fleire legitime HTTP(S)-adresser som separate kandidatar; avvis URL med credentials/query/fragment. Ingen nettverksoppfølging av annonserte URL-ar, ingen automatisk tillit eller passordsending.

Grunnlag: [ONVIF Application Programmer's Guide](https://www.onvif.org/wp-content/uploads/2016/12/ONVIF_WG-APG-Application_Programmers_Guide-1.pdf), [ONVIF Core](https://www.onvif.org/specs/2012/ONVIF-Core-Spec-v2012.pdf). Eldre ikkje-konforme multicast-svar kan bli avviste; portscan og manuell adresse er framleis tilgjengelege. Fysisk firmwaretest står att.

## Kontrollpunkt 1

- Felles avgrensa `parseSoapEnvelope` er trekt ut frå eksisterande ONVIF-parser; kommando/fault-validering er bevart. WS-Discovery krev korrekt SOAP- og discovery-namespace, éin Body-respons og eintydig RelatesTo for gjeldande søk.
- Kvar ProbeMatch blir lesen separat; fleire adresser blir grupperte per vert utan å blande portar. Kommentarar/falske namespace, DTD, malformed XML, duplikatfelt og for stor XML blir avviste utan rå feiltekst.
- HTTP(S)-URL med credentials, query eller fragment og andre protokollar blir utelatne. Ingen annonserte URL-ar blir kontakta som del av parsing.
- ONVIF HTTP-port kjem frå XAddr, men HTTP/HTTPS API-port berre frå portscan/brukarval. HTTPS ONVIF blir ikkje mistolka som støtta HTTP fallback.
- 44 målretta discovery/ONVIF-testar og bygg består. Full regresjon står att.

## Sluttkontroll

375 testar / 33 filer, TypeScript/Vite/vendor-bygg og ekte Electron-smoke består. Ingen ny dependency eller endring av kameraets konfigurasjon. WS-Discovery 2005/04 med addressing 2004/08 er bevart frå den utsende ONVIF-proben; andre discovery-versjonar er ikkje stilleteiande hevda støtta. RelatesTo er korrelasjon, ikkje autentisering av eininga.
