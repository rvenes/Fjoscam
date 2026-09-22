# Fjoscam – storleiksgrense når loggrotasjon feilar

Status: **ferdig**, 22. september 2026. Startpunkt: 459 testar / 35 filer og bygg består; isolert Windows-pakke `out/dependency-check-NH9z4r` består før denne bolken.

Funn (Medium, `src/main/logging.ts:appendLogLine`): loggen har ei tiltenkt 5 MiB-grense, men held fram med append dersom rename/rotasjon feilar. Ein annan prosess som låser omdøyping medan append er tillate, kan dermed gi uavgrensa diskvekst ved langvarig kamerafeil.

Løysing: dropp den nye linja dersom den eksisterande fila framleis er for stor etter mislukka rotasjon. Neste loggkall får prøve rotasjon på nytt. Eksisterande serialisering, køgrense, sanitering og best-effort-feilhandtering skal bevarast. Risiko låg: nokre diagnostikklinjer går tapt medan filsystemet hindrar rotasjon; appen held fram. Berre mocka filsystem i testar, ingen reelle loggar røyrde.

I tillegg: berre ENOENT betyr tom/ny fil; andre stat-feil får ikkje omgå storleiksgrensa. Feila append ugyldiggjer storleikscachen sidan delvis skriving kan ha skjedd. Fire nye scenario dekkjer blokkert rotasjon → retry, forsvunnen fil, ukjend storleik og delvis append.

**463 testar / 35 filer, bygg og vendor-kontroll består.** Ingen ny pakking eller reelle fillåsar testa i denne avgrensa bolken.
