# Fjoscam – ikkje roter backup for uendra innstillingar

Status: **ferdig**, 22. september 2026. Startpunkt: 482 testar / 36 filer og pakka Windows app/TLS/playback består.

E03/R11 (Low–Medium): val av allereie aktivt kamera, identisk kanal/kvalitet eller identisk rekkjefølgje skriv heile konfigurasjonen og roterer backup sjølv om ingen data er endra. Dette er unødvendig diskarbeid og kan byte ut ein historisk backup med ein identisk kopi av hovudfila.

Plan: etter vanleg lesing/validering, returner gjeldande state direkte når data er uendra og hovudfila var gyldig. Dersom data kom frå backup skal same handling framleis kunne reparere hovudfila gjennom eksisterande atomiske skriveveg. UI/straum-reconnect ved nytt val er uendra; dette gjeld berre lagringslaget. Ingen generelt cachelag, utsett persistens eller endra brukarverdiar. Risiko låg til middels; test særleg recovery og bevaring av backup.

Resultat: lagra og verifisert. Fem nye scenario kontrollerer at kvar av dei fire uendra operasjonane bevarer historisk backup, og at uendra kameraval etter korrupsjon framleis reparerer hovudfila utan å øydeleggje backup. **487 testar / 36 filer, bygg/vendor-kontroll og ekte Electron playback-smoke består.** Diff-kontrollen er rein. Siste isolerte pakke var 482-testpunktet før denne avgrensa store-endringa; ingen ny pakkekontroll eller fysisk firmware-/Mac-kontroll er utført her.
