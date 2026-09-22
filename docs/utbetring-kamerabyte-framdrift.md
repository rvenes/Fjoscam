# Fjoscam – kamerabyte og forseinka resultat (R08/R09)

Status: ferdig implementert og lokalt verifisert 19. september 2026, etter dependency-bolken med 140 testar. No **156 testar bestått**. Ingen commit eller publisering. Eksisterande endringar er bevarte.

## Plan og første kontrollpunkt

- App.tsx og eksisterande renderer-/main-testar er undersøkte. Profil/IR/lys manglar generasjonsvern, straumfeil kan overstyre ny vising, og kanal/kvalitet/Connect startar avspeling både direkte og via effect.
- Zoom har noko ID-vern, men same ID etter redigering eller A→B→A kan sleppe gjennom gamle svar/timarar. Polling kan overlappe. Asynkrone AppState-svar frå save/select/channel/quality kan overstyre kvarandre.
- Innfør eit avgrensa vern for kvar kameravising/konfigurasjon, avvis gamle resultat og avbryt ventande timarar. La éin effect starte straumen. Køyr konfigurasjonsmutasjonar i rekkjefølgje, utan gamle snapshot-save frå namneoppfrisking.
- Test forseinka svar og feil, A→B→A, same-ID-redigering, zoom og rask kanal-/kvalitetsendring. Bruk syntetiske renderer-mocks, ikkje reelle kamera.
- Lagring undervegs: les denne fila og Git-diffen ved avbrot. Implementering og testar står att.

## Kontrollpunkt 2 – implementering lagra

- `useCameraWork.ts` eig generasjon og resultatbaner per kameravising. Profil, IR/lys, straum, PTZ-resultat, preset og zoom avviser utdaterte resultat; A→B→A og redigering med same ID får ny eigar.
- AppState-mutasjonar er serialiserte. Berre siste intensjon publiserer den samla tilstanden, og automatisk kameranamn bruker gjeldande køtilstand i staden for eit gammalt konfigurasjonssnapshot.
- Éin effect startar video. Dei ekstra 120 ms-timarane og direkte Connect-starten er fjerna. Zoomtimarar blir rydda, zoomkommandoar held fast ved opphavleg mål, og periodiske zoomlesingar overlappar ikkje kvarandre.
- `main.ts` ugyldiggjer konfigurasjonscache etter kanal-/kvalitetslagring, inkludert pågåande gamle lesingar.
- Første byggkontroll passerte. Målretta renderer/main-køyring: **28 testar bestått**, inkludert 12 nye regresjonstestar. Ein første testkøyring brukte feil mock-URL (gav bilde i staden for iframe); syntetisk URL er retta til `/stream.html` og testane passerer.
- Står att: fleire målretta kontrollar av tele-linse/feil/preset, full testpakke og endeleg byggkontroll. Ingen commit/push/publisering og ingen kontakt med reelle kamera.

## Endeleg kontrollpunkt – ferdig bolk

### Retta

1. **R08 (High):** Profil, IR, spotlight, straumresultat/-feil, test/preset-resultat og zoom er bundne til den aktuelle kameravisinga. Gamle resultat blir avviste etter kamerabyte, A→B→A, redigering med same ID og unmount. Mellombelse kontrollverdiar blir nullstilte før den nye visinga blir vist.
2. **R08:** Kanal, kvalitet og Connect bruker éin straumstart-effect. Gamle reload-timarar er fjerna. Disconnect ugyldiggjer pågåande straumlasting og ryddar videoadresse, fallback og lydtimer.
3. **R08/R09:** Konfigurasjonsmutasjonar og initial state-lesing går gjennom éi kø; siste brukarintensjon publiserer tilstanden etter dei tidlegare mutasjonane. Snøgg tastaturnavigasjon reknar neste kamera frå gjeldande køtilstand. Nytt kamera får ikkje gamalt testresultat eller automatisk namnesave. Automatisk namneoppdatering bruker siste tilstand og bevarer løyndomar i main.
4. **R08:** Zoomdebounce og forseinka zoomoppfrisking blir rydda. Zoomkommandoar bruker opphavleg kamera og generasjon. Gamle svar kan ikkje overskrive zoom etter A→B→A. Periodiske zoomlesingar overlappar ikkje seg sjølve. PTZ-stopp ved switch/blur er bevart, også medan ein konfigurasjonsmutasjon ventar.
5. **R09 (Medium):** Main-cache blir ugyldig etter kanal-/kvalitetslagring. Cache-generasjonen avviser òg gamle pågåande lesingar. Tidlegare bolkar handterte save/remove, Reolink-/ONVIF-cache og endra transportinnstillingar.
6. Lagringsfeil blir viste sjølv om den førre videovisinga blir starta igjen. Ein feil blokkerer ikkje seinare lagringsforsøk. Profil-/lysfeil blir handterte utan uhandsama Promise-avvising eller stans i video.

### Filer i denne bolken

- `src/renderer/useCameraWork.ts` – eigarskap/generasjonsvern.
- `src/renderer/App.tsx` – livsløp for kamera, kø, straumstart, kontrollresultat og timarar.
- `src/renderer/App.test.tsx` – 14 nye renderer-regresjonstestar (22 totalt).
- `src/main/main.ts` – cache-invalidasjon ved stream channel/quality.
- `src/main/main.test.ts` – 2 nye cache-regresjonstestar (10 totalt).
- Denne framdriftsloggen og statusreferanse i revisjonsrapporten.

### Verifikasjon

- `npm test`: **156/156 testar, 18/18 filer**, etter siste kodeendring.
- `npm run build`: TypeScript for renderer/main og Vite godkjende etter siste kodeendring.
- `node node_modules/electron/cli.js scripts/smokeLocalPlayback.cjs`: **PASS** i ekte Electron på Windows. Syntetiske loopback-kjelder; OS-kryptering og backup, blank URL-redigering, UniFi-normalisering, iframe-modular, autentisert WebSocket, snapshot og blokkert uautorisert lokal API. Køyrd før den siste reine endringa i vising av lagringsfeil; denne endringa er dekt av renderer-test og bygg.
- `git diff --check`: godkjend. Ingen nye dependencies, versjonsendringar, pakkebygg, commit, push eller publisering i denne bolken.
- Undervegs avdekte TypeScript feil i testtypane (IR-litteralar og eit ikkje-støtta testquery-val). Desse er retta; endeleg bygg og full testpakke er grøne.

### Avgrensingar og endringsrisiko

- **Medium endringsrisiko:** livsløp, timarar og rekkjefølgje i UI er endra. Testane bruker kontrollerte forseinkingar, avvisingar og falsk klokke, men er ikkje ein fysisk kameratest. Verifiser rask switching, TrackMix Wide/Zoom, preset og lange tastetrykk mot aktuelle kamera før release.
- Pågåande nettverkskall blir ikkje fysisk kansellerte av renderer-vernet; resultatet blir forkasta. Adapter-timeout og tidlegare PTZ-kø/stoppvern gjeld framleis.
- Legacy Panasonic, generisk RTSP/RTSPS, High som standard, eksplisitt Low, tastatursnarvegar og stadfesting av høglydte/destruktive handlingar er bevarte. Denne bolken har ikkje endra capability-tolking eller påstandar om reell videostatus.
- macOS og pakka app er ikkje testa på nytt i denne bolken. Ingen private kamera eller lagra brukaroppsett er brukt.

### Neste tilrådde bolk

**R12:** korrekt capability-tolking per kontrollkanal, skilje mellom manglande tilgang og manglande støtte, og vising av PTZ/zoom/lys berre der det er relevant. Bevar eksisterande modellspesifikke tilpassingar. Deretter **R07/R14/G01:** reell kamera-/avspelingsstatus, adapterspesifikk tilkoplingstest og betre reconnect-diagnostikk. Full ONVIF service-/profiloppdaging og XML-parsing står framleis att frå R13.

Ved avbrot: denne bolken er ferdig. Les denne loggen og revisjonsrapporten før neste bolk; ikkje start R08/R09 på nytt og ikkje rydd bort dei eldre ulagde Git-endringane.
