# Fjoscam – zoommetadata og avbroten absolutt zoom

Status: **fullført og verifisert på Windows**, 21. september 2026. Startpunkt: 375 testar / 33 filer, bygg og ekte Electron-smoke består.

E04/R08: zoomområdet blir lagra berre per kamera-ID, utan kanal/endpoint/levetid, og blir ikkje sletta ved redigering/fjerning. Eit kamera som blir bytt eller ein annan NVR-kanal kan dermed få gammalt område. I tillegg blir `current` frå PTZ-køen kontrollert før absolutt zoom kallar `startZoomFocus`, men ikkje vidare gjennom sein innlogging/retry.

Plan: invalidere og nøkle zoomcache per endpoint/kanal, avgrense levetid/storleik, forkaste gamle svar og føre kansellering fram til siste nettverksutsending. Behald legacy zoomområde for kamera som ikkje rapporterer område, utan å gøyme kansellering som ein slik legacy-fallback. Syntetiske request-fixtures skal verifisere at gamle arbeid ikkje sender rørsle.

## Kontrollpunkt 1 – implementert

- Cache blir sletta ved save/remove og full logout. Nøkkel inneheld endpoint/TLS-policy/kanal; fem minutt levetid og maks 128 postar. Returnert zoomområde kan ikkje mutere den lagra kopien. Numeriske område må ha trygge, ikkje-negative heiltalsgrenser.
- `GetZoomFocus` har eigarskap gjennom login/action:1/action:0 og respons. Gamle svar etter configendring eller logout kan ikkje gjenopprette cache.
- Absolutt zoom tek med PTZ-kansellering gjennom login, tokenfornying, nettverksforsøk og settle-polling. Legacy-fallback gjenopplivar ikkje kansellert arbeid.
- Vidare kontroll fann at `camera:set-zoom-position` gjekk utanom PTZ-køen. Han går no gjennom same kø og stop/save/blur-vern som andre rørsler. Enqueue skjer før async kameralesing; dette hindrar at ein sein lookup sender zoom etter Stop. Settle-venting er bevart i adapteren; IPC les posisjonen etter køen.
- 72 målretta testar bestod før dei siste to IPC-testane. Full test/bygg/Electron-smoke pågår. Testane bruker berre syntetiske data/request-mocks; fysisk zoom er ikkje køyrd.

## Sluttkontroll

389 testar / 34 filer, TypeScript/Vite/vendor-build og ekte Windows Electron-smoke består. Nye testar dekkjer kanalbyte, same endpoint etter save/remove, utløp, 128-postgrense, mutasjon av returnert område, seint svar, kansellering under login/tokenfornying/settle og Stop under IPC-kameralesing. Fysisk motor/firmware og native Mac er ikkje verifiserte. Stop kan framleis måtte vente på eit allereie utsendt nettverkskall; ingen påstand om fysisk stillstand utan svar.
