# Fjoscam – polling, metadata og lysendringar (E01/E02)

Status: implementering ferdig 20. september 2026. **304 testar bestått**, bygg og Electron-kontroll godkjende. Utgangspunkt: 292 testar. Ingen commit eller publisering.

## Kontrollpunkt 1 – undersøking lagra

- Zoompolling har lokalt in-flight-vern, men intervallet går òg etter Disconnect og når dokumentet er skjult. Main skjuler zoomfeil som `{}`, så renderer kan ikkje bruke normal feil/backoff-handtering. Etterlesing frå zoomhandlingar kan overlappe polling.
- Reolink-video ventar på `getStreamInfo` før go2rtc-start. Treg kontroll-API forseinkar derfor video sjølv når RTSP er tilgjengeleg.
- IR-/spotlight-kommandoar blir sende parallelt. Vern mot gamle UI-svar hindrar ikkje at eldre verdi blir sist utført på kameraet. Lysstyrkeslideren sender kvart steg.
- Plan: polling berre ved aktiv synleg vising, éi lesing om gongen og avgrensa backoff; del pågåande zoomlesing i main; start video og metadata uavhengig; serialiser og slå saman ventande lysendringar, med kort debounce for lysstyrke og vern ved kamerabyte/tilgangsendring.
- Bevar High/Low-val, TrackMix-oppdateringar, manuell PTZ/zoom, stoppsikkerheit og eksplisitte stadfestingar. Ingen ekte kamera eller privat konfigurasjon skal kontaktast.
- Neste: implementering og regresjonstestar, så full suite/bygg. Tidlegare endringar i arbeidskopien skal bevarast.

## Kontrollpunkt 2 – første implementering lagra

- Renderer startar RTSP/go2rtc utan å vente på metadata. Metadata har eige vern mot gamle svar.
- Zoompolling køyrer berre når visinga er tilkopla og dokumentet synleg, og planlegg neste lesing etter at førre er ferdig. Feil/tomt zoomsvar gir 6/12/24/30 sekund pause; vellykka lesing går tilbake til 3 sekund. Skjuling/vising ugyldiggjer gamle resultat og nullstiller backoff.
- `coalescedWriter.ts` avgrensar lysstyring til éi skriving og éin samanslegen ventande verdi. Lysstyrke får 150 ms debounce, modusar blir sende straks dersom køa er ledig. Kamerabyte/unmount/tilgangsendring droppar usende kommandoar.
- Main deler pågåande zoom-/profil-/strauminfo-lesingar per kamera og konfigurasjonsrevisjon. Zoomfeil blir ikkje lenger skjulte som tom suksess. IR/spotlight har kvar si serialiserte main-kø per kamera, òg på tvers av raske visingsbyte; gamle konfigurasjonsrevisjonar blir avviste før skriving.
- Første bygg fann ein TypeScript-narrowingfeil over `await` i skrivekøa; retting er lagra. Testkøyring og bygg er **ikkje endeleg verifiserte enno**. Nye regresjonstestar står att.

## Kontrollpunkt 3 – regresjonar og avgrensingar

- Nyaste bygg passerer. Nye testar er lagra for video før metadata, skjuling/Disconnect/reconnect, feilbackoff, samanslegne lysendringar, avbrot av kø, main-single-flight, feilpropagering og skriving over visings-/konfigurasjonsbyte.
- Raskare oppstart eksponerte ein reell linsebyt-race: gammal Wide-vising kunne konsumere ventande telezoom før kanalbyte var ferdig. Telezoom krev no ferdig visingsbyte og faktisk kanal 1.
- Testane avdekte også eit tidsvindauge mellom synlege aktiverte kontrollar og oppdaterte tastaturlyttarar. Lyttarane blir no oppdaterte i layout-effekten, før brukarinteraksjon med den nye visinga.
- Avgrensing: HTTP som allereie er sendt, kan ikkje trekkjast tilbake. Main held skrivingane i rekkjefølgje og avviser usende gamle konfigurasjonar; renderer droppar usend kø ved eigarskifte. Ved endeleg skrivefeil blir feil vist, utan automatisk uendeleg retry.
- Testpakken skal køyrast på nytt etter desse siste rettingane. Ingen føresetnad om ferdig/godkjend full suite ved dette kontrollpunktet.

## Kontrollpunkt 4 – full kontroll passerte

- `npm test`: **304/304 testar, 26/26 testfiler**, bestått etter telezoom-/tastaturrettingane.
- `npm run build`: begge TypeScript-prosjekta og Vite bestått.
- `node node_modules/electron/cli.js scripts/smokeLocalPlayback.cjs`: **PASS**. Faktisk lokal spelar, WebSocket, snapshot, frames/lyd og bygd React-app med CSP/sandbox fungerer framleis.
- `git -c core.safecrlf=false diff --check`: bestått. Mellombels testinstrumentering er fjerna.
- Siste kodegjennomgang flytta metadata-feilfangst inn til adapterkallet: feil ved lokal kameralagring/oppslag skal framleis kome ut til kallaren, ikkje skjulast som manglande metadata. Målretta kontroll og bygg etter denne vesle justeringa står att ved dette kontrollpunktet.

## Resultat og avgrensing

| Funn | Grad | Fil/kodeområde | Retting | Endringsrisiko |
|---|---|---|---|---|
| E01 | Medium | `src/renderer/App.tsx` – zoompolling; `src/main/main.ts` – zoom-IPC | Tilkoplings-/visibilitystyrt polling, neste kall etter førre, backoff opp til 30 sekund, forkasting av skjulte/gamle svar og deling av pågåande zoomlesingar. | Low–Medium: posisjonsvisinga oppdaterer seinare under feil. TrackMix blir framleis følgd kvart 3. sekund etter vellykka lesing; manuell zoom/etterlesing er bevart. |
| E02 – video/metadata | Medium | `App.tsx` – `loadWebRtcRuntime`; `main.ts` – `shareCameraRead` | Video startar uavhengig av HTTP-metadata. Pågåande like metadata-/zoomlesingar blir delte per kamera/revisjon utan langvarig cache. | Low–Medium: video kan vere synleg før metadata. Gamle metadata kan ikkje erstatte data etter kamerabyte eller nyare test. High/Low er uendra. |
| E02 – lys | Medium | `coalescedWriter.ts`, `App.tsx` – IR/spotlight, `main.ts` – `serializeCameraWrite` | Éi skriving og éin samanslegen ventande patch per renderer-kø. Lysstyrke får 150 ms debounce. Main serialiserer same kontroll per kamera på tvers av visingar. Feil bryt ikkje neste eksplisitte endring. | Medium: usende mellomverdiar blir hoppa over. Endeleg feil blir vist utan automatisk skrive-retry; UI viser valt mål, ikkje garanti for fysisk lysstatus. Allereie sendt HTTP kan ikkje trekkjast tilbake, og firmware med usikker timeout må kontrollerast fysisk. |
| R08/R09 – følgjefeil | Medium | `App.tsx` – telezoom-effekt og tastaturlyttarar | Ventande telezoom blir brukt først i ferdig kanal-1-vising. Tastaturlyttarar følgjer committed kontrollar før ny vising kan brukast. | Low–Medium: eksisterande linse-, tastatur-, PTZ-stopp- og eigarskapstestar er bevarte og passerer. |

### Attståande arbeid

- Den avgrensa E01/E02-bolken er ferdig. Ved eventuell vidare E02-optimalisering: test/refresh har framleis noko overlapp mellom komplette API-testar og profilhenting; TTL-cache av stabil modellinfo er ikkje innført utan behovsmåling. Dette blokkerer ikkje lenger video.
- Neste større opne bolk er **R13: ONVIF service-/kanalprofiloppdaging og XML-parsing**. Bevar CGI-primærveg og eksplisitt opt-in. Deretter G01 child-diagnostikk/kontrollert bridge-omstart.
- Ingen ekte kamera, Mac eller pakka release er verifiserte her. Fysisk kamerakontroll og tidlegare release-/signeringsavgrensingar står ved lag.
- Ingen dependencies, versjonar, secrets eller offentlege releasefiler er endra. Arbeidet ligg lagra i arbeidskopien; ingen commit, push eller publisering.

## Endeleg kontrollpunkt – ferdig

Etter den siste avgrensinga av metadata-feilfangst: **20/20 main-testar og nytt komplett bygg bestått**. Full suite på 304 testar og Electron PASS frå kontrollpunkt 4 gjeld elles uendra kode. Ingen teststeg i denne bolken står att; fysisk kamera-/plattformkontroll er framleis avgrensinga. Ved neste økt: gå vidare frå «Attståande arbeid», ikkje implementer denne bolken på nytt.
