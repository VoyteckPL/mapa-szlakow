# Mapa Szlaków – zasady pracy

Właściciel: Wojtek. Odpowiadaj po polsku, krótko.

## Jak pracujemy
- Małe kroki, oszczędzaj tokeny: czytaj tylko potrzebne fragmenty (grep po nazwie funkcji, potem Read z offset/limit), nie całe pliki.
- Poprawki jako **reguły ogólne**, nie jednorazowe łaty pod jeden przypadek.
- `sandbox2` i `skrzyzowanie.html` usunięte 2026-11-21 (porządki; historia w git). Stary `sandbox-drog.html` + `sandbox/` tylko do podglądu, nie rozwijać. Nie ruszaj `index.html` (główna mapa) ani `edytor-pasow.html` bez wyraźnej prośby.
- Nigdy nie wysyłaj zmian do OSM. Sandbox rysuje drogi testowe lokalnie.
- Rozpoznawanie pasów z ortofoto jest porzucone – nie rozwijać.
- Zmiany commituj i wypychaj na `main` bez pytania (GitHub Pages: https://voyteckpl.github.io/mapa-szlakow/sandbox-drog.html).
- Wojtek ogląda wynik sam (lokalnie `python -m http.server 8000` → `localhost:8000/sandbox-drog.html`, F5). Zrzuty ekranu rób tylko, gdy to naprawdę potrzebne.

## Budowa starego sandboksu (tylko podgląd)
**Aktualny sandbox: `sandbox-v1.html` + `sandbox-v1/` (od 2026-11-21, zob. docs/POSTEP.md).** Pliki ładowane po kolei z `?v=czas` (lista w `sandbox-v1.html`, `GEOM` = geometria):
- `geom/baza.js` (G, układ m, wektory, miter), `geom/odsun.js` (drogi nie nachodzą: `clearP`, `odsunPtE`), `geom/rozw-tepy.js` (odnoga > 90°), `geom/styk.js` (styk w Nm: `endSection`, `nodeType`), `geom/pasy.js` (`lines` – krawędzie pasów). Wspólne pomocnicze w `G.u`.
- `nm.js` (mapa Leaflet, scena, cofnij, rysowanie, edycja klikiem, szablony, API `window.SV`), `nm-katy.js` (warstwa ∠, przyciąganie 5°), `nm-menu.js` (menu warstw: wzorce 💾📚🗑, siatka, cofnij; `config` = JSON dla Claude), `nm-panel.js` (panel zaznaczenia), `nm-start.js` (start/F5), `edycja.js` (✎ ręczna edycja krawędzi), `ustawienia.js` (pamięć po F5), `nm.css`.
- **Testy regresji (po każdym refaktorze):** `node tools/test-v1.js` (geometria, 1229 scen: szablony, przegląd kątów, wzorce Wojtka z `tools/v1-wzorce.json`) i `node tools/test-v1-ui.js` (Playwright, wymaga `python3 -m http.server 8765`; bez unpkg: `LEAFLET_DIR=…/leaflet/dist`). Celowa zmiana reguły → `--zapisz` nowe odciski.

`sandbox-drog.html` to sam HTML (panele, przyciski). Kod w `sandbox/`, ładowany po kolei jako zwykłe skrypty (wspólny zasięg globalny – kolejność ma znaczenie):
- `1-uklad.js` – stałe, geometria, model drogi, `offBase/offAt` (offset osi w pasach), `comp()` (oś, szerokość `w`, offset `d` drogi), `skelFork`, **`layout()`** (węzły, rozjazdy, zszywanie styków, linie, strzałki).
- `2-rysowanie.js` – render na canvas: asfalt, oznakowanie (`drawNodeDash`, `laneAdj` – linie pasów przy zmianie liczby pasów), obrysy pasów, `render()`.
- `3-ui.js` – stan, cofnij, UI, `laneGeom()` (granice pasów: `lb(G, q, j)`), presety zjazdów, wskaźnik, zapis.
- `4-edytor.js` – dodatki edytora (wczytywanie OSM itp.).
- `5-ustawienia.js` – ustawienia węzłów, warstwy (localStorage).
- `7-testy.js` – testy geometrii (przycisk „Testy”; w chmurze `node tools/testy-sandbox.js`).
- `6-sandbox.js` – właściwy sandbox (IIFE): typy dróg, rysowanie, `autoFork`, raport połączeń, menu, scenariusze testowe (`grp(...)`), „Kopiuj do Claude (config)”.
- `baza.css`, `sandbox.css` – style.

## Ustalone reguły geometrii
- Nieparzysta jezdnia jednokierunkowa (3, 5 pasów) na styku z jezdnią o 1 pas węższą/szerszą: oś na granicy pasów (offset ½ pasa), stały do końca drogi; pas dodatkowy / kończący się po prawej (po lewej, gdy turn:lanes wyróżnia pierwszy pas).
- Zmiana liczby pasów: węższa jezdnia pełna do węzła, szersza zaczyna się jej przekrojem i rozszerza klinem za węzłem; zwęża się tylko pas w klinie (obrysy i linie pasów ciągłe).
- Wolny koniec drogi (nic się nie łączy): oś OSM na środku jezdni.
- Wojtek wkleja JSON z przycisku „Kopiuj do Claude (config)” – to opis sceny (drogi, punkty, offsety, raport).

## Plan przebudowy
Docelowy model silnika (jezdnia = oś + profil pasów + kotwica osi, nazwane typy węzłów, asercje geometrii) i etapy: `docs/PLAN-silnik.md`. Nowe reguły dopasowuj do tego modelu.
**Postęp i następny krok: `docs/POSTEP.md` – czytaj na początku każdej rozmowy, aktualizuj po każdym etapie.**

## Testy
Playwright jest dostępny w środowisku Claude w chmurze; lokalnie wystarczy przeglądarka. Po zmianie sprawdź kilka scenariuszy z listy „Scenariusze”, nie tylko jeden.
