# Fjoscam – toleranse for feilforma kamerametadata

Status: **ferdig**, 21. september 2026. Startpunkt: 414 testar / 34 filer og bygg består. Førre pakka kontroll (411 testar): `out/dependency-check-RQsmtt/verification.json`.

Kontrollpunkt: Reolink sine JSON-lesingar validerer konvolutten, men TypeScript-typane validerer ikkje innhaldet ved køyring. Ugyldig presetnamn kan sendast som objekt til React; ugyldig preset-ID kan bli `NaN` eller bli vist som eit mål som IPC seinare avviser. Eitt feilforma kanalnamn, modellfelt eller straumfelt kan kaste under `.trim`/`.split` og miste resten av lesinga.

Plan (Medium, avgrensa til lesing): normaliser presetliste, modellinfo, kanalstatus og strauminfo ved adaptergrensa. Bevar gyldige felt, forkast ubrukbare element, ikkje konverter objekt/boolean til tal eller tekst. Ikkje logg rå svar. Bruk reine parserar i eigen liten modul og regresjonstestar gjennom adapteren. Kontroller kjende firmwareformer og dagens ID-/kanalgrenser før innstramming. Ingen kameraendringar eller ny avhengigheit.

Implementering er lagra i `src/main/reolinkMetadata.ts`, brukt frå `reolinkClient.ts`. Preset-ID 1–64 og kanal 0–65535 følgjer eksisterande IPC-kontrakt; numeriske strenger er framleis tillatne. Duplikat-ID-ar gir éi oppføring. Manglande kanal blir ikkje lenger tolka som kanal 0. Straumtal blir endelege ikkje-negative verdiar; dimensjonar blir heiltal, og tekstfelt blir type-/lengdesjekka. Ugyldig presetnamn får standardnamn, medan andre ugyldige tekstfelt blir utelatne. Rå kamerasvar blir aldri skrivne til logg.

12 nye testscenario dekkjer feilforma toppnivå/felt, blandingar av gyldige og ugyldige element, numeriske strenger, serial-alias, dimensjonsreserveveg og faktiske adapterlesingar. **426 testar / 35 filer, bygg, vendor-kontroll og ekte Electron playback-smoke består**, og diff-kontrollen er rein. Endringsrisiko Low–Medium: uvanleg firmware med ikkje-dokumenterte datatypar kan miste metadatafelt; video og skrivekommandoar er uendra. Fysisk firmwaretest står att.
