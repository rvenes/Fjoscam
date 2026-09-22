# Fjoscam – go2rtc-opphav og integritet

Status: **fullført og verifisert på Windows**. Startpunkt: 356 testar, bygg og ekte Electron-modal-/avspelingskontroll består.

D06: kontroller dei tre eksisterande binærane mot upstream release, dokumenter versjon/kjelde/hash/arkitektur og ta med MIT-lisensen. Lag lokal kontroll som avviser endra/manglande binær før bygg. Ikkje oppgrader binær eller endre signaturkrav i denne bolken.

Plattformspesifikk utelating av andre arkitekturar er ei separat pakkeforbetring som krev kontroll av alle tre mål. Ingen Mac-, signerings-, staging- eller publiseringsarbeid er utført. Ingen fil skal bli hevda som identisk med upstream utan faktisk kontroll.

Ved avbrot: les denne fila og Git-diffen. Kjelde og testar er lagra utan commit; tidlegare bolkar skal bevarast.

## Kontrollpunkt 1 – opphav stadfesta

- Offisiell GitHub release v1.9.14 (19. januar 2026) og asset-metadata henta. Alle tre ZIP-arkiv er lasta til `out/vendor-check-d1b3c85f8d554e70b5811bb1d7b504d5` og SHA-256 er kontrollert mot GitHub sine asset-digestar. Både byte-tal og hash for binærane i arkiva samsvarar med dei lokale kopiane.
- `vendor/go2rtc/manifest.json`, README og upstream MIT LICENSE er lagra. Ingen binær er bytt eller endra. Manifestet er proveniens/integritetsgrunnlag, ikkje påstand om reproduserbart kjeldebygg eller uavhengig signaturbevis.
- `scripts/verifyVendor.cjs` verifiserer lokalt utan nettverk og utan å køyre binærar. Normal build krev kontrollen. Testar dekkjer komplett plattformmatrise, endra bytes, ugyldig/duplisert sti/mål og lisensnotis.
- Pakka smoke er utvida med kontroll av medfølgjande manifest/lisens. Full test, bygg og ny isolert Windows-pakke står att.

## Sluttkontroll

- 360 testar i 32 filer består; TypeScript/Vite-bygg og vendor-integritetskontroll består.
- `out/dependency-check-yH2eA8/verification.json` stadfestar PASS for app, TLS og playback i isolert Windows-pakke, inkludert manifest/lisens. Resultatet vart kontrollert ved framhald 21. september 2026.
- Ingen binær er oppgradert, ingen release er distribuert. Mac-signering og full oversikt over transitive Go-lisensar står framleis att som eigne oppgåver.
