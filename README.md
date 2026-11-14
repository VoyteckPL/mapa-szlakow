# Mapa Szlaków – prototyp (Gdynia)

Mapa: https://voyteckpl.github.io/mapa-szlakow/

Strona statyczna bez budowania: `index.html` + `js/config.js` (regiony, serwery Overpass, zapytanie). `data/gdynia.json` to kopia danych odświeżana przez GitHub Actions.

## Co jest na mapie

| Warstwa | Źródło | Wygląd |
|---|---|---|
| Podkład | OSM (domyślnie), CARTO Positron, OpenTopoMap, CyclOSM, Ortofotomapa (Geoportal) | wybór w panelu |
| Cieniowanie terenu | Geoportal, NMT ISOK `ShadedRelief` (WMS, EPSG:3857) | nakładka z suwakiem przezroczystości |
| Szlaki rowerowe | relacje OSM `type=route` + `route=bicycle/mtb` | **kropki** w kolorze `colour` |
| Szlaki piesze | relacje OSM `route=hiking/foot/walking` | **kreski** w kolorze z `osmc:symbol` (PTTK) |
| Infrastruktura rowerowa | `highway=cycleway`, `bicycle=designated`, `cycleway[:left/right/both]=*`, `oneway:bicycle=no`, `cycleway=crossing` | paleta niebieska: droga dla rowerów ciemna z konturem i znakami C-13, ciąg jasny ze znakami C-13/16, kontrapas i kontraruch przerywane, sierżanty z podwójnym chevronem, przejazdy czerwone z białymi kwadratami; strzałki tam, gdzie jazda jest jednokierunkowa |

Kliknięcie szlaku otwiera panel ze wszystkimi tagami relacji i linkami (OSM, Waymarked Trails, edycja). Kliknięcie drogi rowerowej pokazuje tagi drogi.

## Offset szlaków

Każda relacja jest rozbijana na odcinki (drogi OSM). Na każdej drodze szlaki dostają numer „pasa” (0, 1, 2…) w stałej kolejności: rowerowe przed pieszymi, międzynarodowe → krajowe → regionalne → lokalne, potem id relacji. Offset = (pas + 1) × krok, a krok rośnie ze zoomem (MapLibre `line-offset`). Kierunek każdego odcinka jest ujednolicany („na wschód”), żeby sąsiednie odcinki tego samego szlaku były po tej samej stronie drogi.

Znane niedoskonałości (do dopieszczenia): szlak może „przeskoczyć” na inny pas, gdy zmienia się zestaw szlaków na drodze; przy drogach biegnących dokładnie północ–południe strona może się odwrócić; ostre zakręty przy dużym offsecie tworzą pętelki.

## Świeżość danych

Przy otwarciu strona pokazuje najpierw najnowszą kopię: z pamięci przeglądarki albo `data/gdynia.json` (GitHub Actions pobiera ją z Overpass co ~15 min i commituje tylko przy zmianie danych). Potem dane są pobierane na żywo z Overpass API (aktualizowany co minutę z bazy OSM). Mapa odświeża dane co 5 minut i pokazuje „Stan bazy OSM” (znacznik czasu serwera). Serwery z danymi starszymi niż godzina są odrzucane. Ostatnia kopia jest trzymana w IndexedDB przeglądarki, więc przeładowanie strony pokazuje dane od razu.

Publiczny Overpass bywa przeciążony (HTTP 429/504), wtedy pierwsze ładowanie trwa 10–60 s. To ograniczenie prototypu, nie architektury.

## Rozszerzanie

- `?region=trojmiasto` lub `?region=polska` – kod już obsługuje duży region: dociąga kafle z10 widocznego obszaru od zoomu 10.
- Nowy region = jedna linijka w `REGIONS`.

## Droga do skali całej Polski (propozycja)

Overpass z przeglądarki nie wytrzyma całej Polski przy wielu użytkownikach. Docelowo:

1. **Import**: ekstrakt Polski z Geofabrik → PostGIS (osm2pgsql w trybie flex lub imposm3), tylko potrzebne tagi.
2. **Minutowe aktualizacje**: `osm2pgsql-replication` / imposm3 `-diff` z replikacji minutowej planet.osm.org. Zmiana w OSM jest na mapie po 1–3 min.
3. **Przetwarzanie szlaków w bazie**: budowa „pasów” (który szlak na którym miejscu) w SQL dla każdej drogi, z ciągłością wzdłuż relacji; to pozwala dopracować offset lepiej niż w przeglądarce.
4. **Kafle wektorowe**: Martin lub pg_tileserv serwują MVT prosto z PostGIS (kafle generowane na żądanie, krótki cache), frontend zostaje na MapLibre bez zmian w stylu.
5. **Cieniowanie**: zamiast WMS Geoportalu można pociąć NMT ISOK do kafli rastrowych/terrain-RGB i serwować samemu (szybciej, bez limitów).
