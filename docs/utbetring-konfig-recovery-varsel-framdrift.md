# Fjoscam – synleg varsel ved bruk av konfigurasjonsbackup

Status: **ferdig**, 21. september 2026. Startpunkt: 452 testar / 35 filer og bygg består.

G03/R11 (Medium): lagringa kan alt lese ein validert backup når hovudfila er korrupt eller manglar, men dette skjer utan varsel. Brukaren kan dermed sjå ei eldre kameraliste og tru at siste endringar framleis er lagra. Eksisterande fail-closed ved to ugyldige filer skal bevarast.

Avgrensa løysing: lat main returnere eit fast, løyndomsfritt statusflagg når backup er brukt. Hald flagget aktivt resten av appøkta, også etter seinare vellukka skriving, slik at kamerabyte ikkje fjernar varselet før brukaren ser det. Vis eit eige varsel ved kameralista. Flagget skal ikkje skrivast til kamerafila. Ingen ny restore-/slette-/importfunksjon eller endra atomisk skriveflyt. Risiko låg: eitt valfritt IPC-felt og eit varsel; ekte recoveryarbeidsflyt og kryssmaskin-eksport står framleis att.

Kontroll: **455 testar / 35 filer, bygg og Electron playback-smoke består**. Store-testar dekkjer korrupt/manglande hovudfil, friskt/nytt oppsett, flagg etter vellukka skriving, fråvær av flagg på disk og ny appøkt. Renderer-testar dekkjer varsel ved oppstart og kamerabyte. Faktisk Chromium kontrollerer synleg/uklipt varsel; skjermbiletet `out/recovery-notice-smoke.png` er visuelt kontrollert. Første smoke-forsøk las DOM før asynkron state var komen; testen ventar no uttrykkeleg på state-varselet. Ingen reelle brukar- eller kamerafiler er brukte.
