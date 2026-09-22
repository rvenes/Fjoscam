# Fjoscam – felles små kontraktar

Status: **fullført og verifisert**, 21. september 2026. Startpunkt: 402 testar / 34 filer og isolert Windows app/TLS/playback består.

D04: `WebRtcStream` er kopiert i bridge og preload, og den faste Panasonic-presetlista er kopiert i adapter og renderer. Flytt berre desse definisjonane til shared, utan å endre IPC-felt, lagra konfigurasjon, transport eller preset-ID/name. Behald fersk preset-array ved kvart kall slik at UI ikkje kan mutere ein delt global verdi.

Ingen nye testar som berre speglar denne flyttinga; eksisterande Panasonic/UI-, bridge-, IPC- og byggkontrollar skal brukast. Større adapter/union-refaktorering og namnendringar i persistent config er ikkje del av denne bolken.

Resultat: `WebRtcStream` har éi definisjon i shared/types; bridge og preload bruker same type. `panasonicPresets()` i shared/cameraDefaults gir same ti ID-ar/namn til adapter og renderer. 402 testar / 34 filer og TypeScript/Vite/vendor-bygg består. Ingen nye dependencies, config- eller IPC-endring.
