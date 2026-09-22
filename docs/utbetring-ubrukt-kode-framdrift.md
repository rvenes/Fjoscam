# Fjoscam – dokumentert ubrukt kode

Status: **fullført og lagra**. Startpunkt: 348 testar / 29 filer, bygg og ekte Electron-kontroll består.

TypeScript med `--noUnusedLocals --noUnusedParameters` rapporterer berre fire funksjonar: `isConnectionRefused` i Reolink-adapteren og `toggleZoomChannel`, `setDigitalZoomLevel`, `getStageBounds` i renderer. Fjern desse etter kontroll av referansar og slå på dei same flagga i begge tsconfig-filer.

Ingen endring av dynamiske CSS-klasser eller fungerande controls utan påvist ubrukt kode. Ingen nye dependencies. Test/bygg og diff-kontroll skal dokumenterast før avslutning. Neste aktuelle bolk: G04, native fullscreen-synk og dialogtilgjenge.

## Resultat

Dei fire funksjonane hadde ingen referansar utanom definisjonen og er fjerna. Begge TypeScript-prosjekta har no `noUnusedLocals` og `noUnusedParameters`; den vanlege byggjekommandoen og CI vil fange nye ubrukte lokale symbol/parameterar. Eksisterande JSX, tastar, zoom og nettverksfallback er bevarte.

**348/348 testar / 29 filer, bygg og diff-kontroll består.** Ingen nye testar for rein fjerning av påvist død kode; eksisterande scenario/regresjon er køyrd. Risikoen er låg. D03 sin CSS-/lintdel står att; dynamiske klassar er ikkje sletta på mistanke.

## CSS-oppfølging 21. september 2026

Kryssjekk av alle klasseselektorar mot TS/TSX-kjelde og separat søk i src/scripts/index.html gav berre tre ubrukte klassenamn: `panel-heading`, `selected-action` og `zoom-switch`. Dei har ingen direkte eller oppbygd dynamisk bruk i den aktive UI-en. Berre desse selektorane og éin identisk duplisert `flex: 0 0 auto` i `.preset-item` er fjerna. Delte reglar for aktive klassar er bevarte. Bygg og Electron-smoke står att for dette vesle CSS-steget; ingen ny dependency eller speglande test blir lagd til.

CSS-steget er verifisert: TypeScript/Vite/vendor-bygg og ekte Electron/Chromium-smoke består etter oppryddinga. 410 eksisterande testar bestod før den reine CSS-endringa. Hooks-/promise-lint er framleis eit mogleg separat tiltak; ikkje innført utan eigen vurdering av støy og vedlikehaldsnytte.
