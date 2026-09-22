# Fjoscam – gjenbruk av metadata i tilkoplingstest

Status: **ferdig**, 21. september 2026. Startpunkt: 411 testar / 34 filer og isolert Windows-pakke består.

E02 (Low): `ReolinkClient.testConnection` henta `GetDevInfo` gjennom `getProfile`, og henta dei same opplysningane straks igjen gjennom `getCameraName`. Bruk no namnet/modellen frå profilen når det finst. Dersom profilkallet feilar eller manglar namn/modell, er den eksisterande ekstra lesinga bevart. Ingen varig cache, endra kamerakommandoar eller kvalitetsval.

Endringsrisiko: låg; namn og modell har same prioritet som før. Ein test som pågår samstundes som kameraet blir omdøypt, kan framleis vise namnet frå starten av testen. Tre regresjonsscenario kontrollerer faktisk tal på `GetDevInfo`-kall og reservevegen etter nettverksfeil. Full suite: **414 testar / 34 filer består**; bygg/vendor-kontroll består. Første fulltest fann at ein eksisterande profilfixture utan `device` måtte tolast; den same reservevegen dekkjer no dette. Ingen fysisk kamera- eller ny pakkekontroll er køyrd for denne avgrensa adapterendringa.
