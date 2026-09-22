# Fjoscam – avgrensa og tydeleg nettverkssøk

Status: **fullført og verifisert på Windows**, 21. september 2026. G02, manuell oppdaging/diagnose.

## Planlagt avgrensing

- Bruk faktisk IPv4-nettmaske ved portscan, hopp over eigne adresser og nett/broadcast, avgrens store subnett og samla arbeidsmengde.
- Behald portscan sjølv om WS-Discovery finn noko; eitt ONVIF-svar er ikkje ein komplett kameraoversikt.
- Del samtidige søk og vis kva nett som vart undersøkte / avgrensa. Portfunn er berre kandidatar, ikkje bevis på kameramodell.
- Ingen automatisk adresseendring i lagra kamera og ingen sending av passord. Nye adresser må veljast og legitimasjon fyllast inn medvite.

Alle nettverkstestar skal bruke syntetiske grensesnitt/mock-sockets; ekte LAN/kamera blir ikkje skanna i denne arbeidsøkta. Multicast på fleire grensesnitt og full WS-Discovery XML/identitetskontroll kan få eigne avgrensa oppfølgingsbolkar.

## Kontrollpunkt 1 – implementert

- `discoveryNetworks.ts`: IPv4/nettmaskekontroll, korrekte /23-/25-grenser, ekskludering av eigne adresser, duplikat, nett/broadcast, offentlege adresser og /31-/32. Nett større enn /22 blir avgrensa til lokal /24. Samla tak 2048 unike vertar.
- `discovery.ts`: WS-Discovery og portscan blir køyrde saman; samtidige IPC-kall deler søket. Kvar socket blir avslutta éin gong; synkron socketfeil og sein error-event blir handterte. Ingen payload/passord blir skrivne til TCP-probane.
- Preload/UI får ein rapport med kandidatar og faktisk avgrensa søkeplan. Dialogen forklarer private nett, multicast sitt standardgrensesnitt, grense og manuell adresse. Kandidatval tømmer innskrive passord og streamURL. Resultat frå lukka dialog blir forkasta.
- 369 testar / 33 filer består, inkludert syntetiske nettmasker, tak/duplikat, kombinert søk, deling/rydding, synkrone/etterfølgjande socketfeil og UI-eigarskap/passordtøming. Bygg og ekte Electron-smoke pågår.
- Fyrste testforsøk avdekte feil test-mocking av Node sitt namngitte OS-import. Reell TCP var mocka heile tida; OS er no eksplisitt module-mocka også. Ingen ekte kamera blei kontakta.

Avgrensing: portscan bruker framleis systemrutinga for kvar destinasjon; fleirgrensesnitt-/VPN-prioritering, valfritt subnett og identitetsverifisert IP-rebinding er ikkje innførte. Søket kan finne nettverkstenester som ikkje er kamera. Ingen endring i lagra kamera skjer automatisk.

## Sluttkontroll

369 testar / 33 filer, TypeScript/Vite/vendor-build og ekte Windows Electron-smoke består. Smoke omfattar framleis modal/inert/fokus, kryptering, IPC/CSP, lokal avspeling og go2rtc release/recovery. `git diff --check` består. Ingen nettverksmåling mot fysisk kamera eller native Mac-test er utført.
