# Fjoscam – avgrensa fornying av ONVIF-rørsle

Status: **fullført og lagra**. Startpunkt: oppdaging/XML-bolken med 329 testar, bygg og isolert Windows-pakke bestått.

## Plan

- Bevar kort PT1S-lease i kameraet. Forny etter 500 ms når førre svar er kome, berre medan den opphavlege PTZ-kommandoen framleis er aktiv.
- Ingen overlappande fornyingar, ingen automatisk retry etter feil. Stop skal kansellere timer og vente på allereie sendt fornying før fysisk stoppkommando.
- Kamera-/konfigurasjonsbyte, keyup, renderer-blur/krasj og main sin 30 s watchdog skal stoppe fornying. Adapteren skal i tillegg ha eiga absolutt tidsgrense.
- Syntetiske testar av fornying, feil, sakte svar og Stop-rekkjefølgje. Ingen ekte kamera.

Ved avbrot: source- og dokumentfiler blir lagra utan commit. Les førre ONVIF-framdriftsfil og Git-diffen. G01/prosesshelse er neste større bolk.

## Resultat og kontroll

- `MotionRenewal` fornyar etter 500 ms frå førre kvittering. Kameraet får framleis PT1S. Ingen parallelle fornyingar, og feil stoppar løkka utan retry.
- Stop/ny ONVIF-kommando kansellerer timer straks og ventar på sendt fornying før neste fysiske kommando. Generasjonskontroll frå eksisterande PtzController bind løkka til akkurat det tastetrykket. Konfigurasjonsbyte kansellerer fornyinga.
- Adapteren sluttar å fornye etter 29 sekund, uavhengig av main sin eksisterande 30 s Stop-watchdog. Siste kortvarige lease må utløpe i kameraet; eit offline kamera kan ikkje gi garanti om fysisk stopp.
- **334/334 testar / 28 filer**, `npm run build` og diff-kontroll består. Fem nye testar: halde tast, cancel/drain for fleire Stop-kall, nettverksfeil, generasjon/deadline og faktisk loopback-SOAP med forseinka fornyingssvar før Stop.
- Ingen endring i firmware-/kamera-timeout eller generell CGI-styring. Tregt nettverk kan gi pausar fordi fornying ventar på kvittering; dette bevarer avgrensa kø og rørsle. Ingen fysisk kamera-/Mac-verifikasjon.
- Neste bolk: G01, go2rtc-prosesshelse og kontrollert restart.
