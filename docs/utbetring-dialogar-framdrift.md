# Fjoscam – dialogfokus og trygg tastaturbruk

Status: **fullført og lagra**. Startpunkt: 352 testar, bygg og diff-kontroll består.

G04: samle dei fire modale flatene (innstillingar, preset, about, oppdatering) i ein liten wrapper som eig focus trap, Escape, inert bakgrunn og fokusretur. Bevar eksisterande skjema, stil og stadfesting av destruktive handlingar. Tips er ei ikkje-modal hjelpeflate og skal framleis vere det.

Globale kamera-/fullskjermtastar skal vere sperra under modal. Opning skal stoppe eventuell halden PTZ/zoom. Test fokus, Tab/Shift+Tab, Escape, stablede dialogar og at tal/piltastar/Enter ikkje styrer kameraet bak dialogen.

Ingen nye dependencies. Lagre og køyr test/bygg før merking som fullført. Ved avbrot: les denne fila og Git-diffen.

## Resultat

- `Modal.tsx` samlar aria-dialog/aria-modal, Escape, Tab/Shift+Tab, fokusretur og inert bakgrunn. Open rekkjefølgje styrer både fokus og z-index, også når DOM-rekkjefølgja er ulik. Fjerning av underliggjande dialog opnar ikkje bakgrunnen til den øvste.
- Innstillingar, preset, about og oppdatering nyttar wrapperen utan omskriving av skjema/controls. Lukketøy har tilgjengelege namn. Tips er framleis ikkje-modal.
- Globale kameratastar/fullskjermtastar blir sperra under modal. Opning kansellerer zoomarbeid og stoppar ei halden PTZ-rørsle. Tastane verkar att etter lukking.
- **356/356 testar / 31 filer**, bygg og diff-kontroll består. Fire nye testar dekkjer fokus/stack og kamera-/fullskjermvern i faktisk App-komponent.
- **Ekte Windows Electron/Chromium smoke: PASS**, utvida med modalopning, faktisk inert bakgrunn, fokusfelle, Tab-wrap, Escape og fokusretur. Eksisterande straumrelease/reopen, crash/recovery, CSP, kryptering, auth, frames og lyd består.
- Risiko: dialogar sperrar no bevisst tastar som tidlegare kunne nå bakgrunnen. Ingen automatisk unmute eller endring i stadfesting av destruktive/loud kamerahandlingar. Skjermlesar og fysisk Mac-interaksjon er ikkje testa.
- Neste bolk: D06, vendor-opphav, SHA-256-kontroll og tredjepartslisensar for go2rtc.
