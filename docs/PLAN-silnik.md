# Plan: solidny silnik dróg (sandbox)

Stan: 2026-11-20. Cel: drogi OSM odwzorowane jak w rzeczywistości – szerokości zachowane, przejścia na rozjazdach/łączeniach jak prawdziwe, offsety gdy oś OSM nie idzie środkiem, wyjątki – bez łatania pojedynczych przypadków.

## Diagnoza (dlaczego ciągle są artefakty)
1. **Geometria liczona w wielu miejscach naraz.** `comp()` (oś, szerokość, offset), `skelFork`/`skelLanes`, `layout()` (~2800 linii: zszywanie styków, cięcia, hug) i render (maski canvas `destination-out/in` chowające linie w asfalcie sąsiada) – każde poprawia wynik poprzedniego. Poprawka w jednym miejscu psuje inne.
2. **Ukryty stan globalny.** ~250 odwołań do `window.__*` (np. `__hugZero`, `__nodeGeom`, `__smCap`, `__gaussSig`, `__endTan`) – wynik zależy od kolejności wywołań. 72 puste `catch(e){}` połykają błędy, więc zamiast błędu widać glitch.
3. **Offset i wygładzanie mają kilka źródeł:** `off/offS/offE/offTS/offTE`, `_chg`, `_edge`, `hug`, wolny koniec, gauss dla autostrad, wyłączony `filletPts` (`&& false`). Nie ma jednej definicji „gdzie leży oś OSM w przekroju”.
4. **Typy połączeń nie są nazwane** – wykrywane heurystykami w środku `layout()`. Nowy przypadek = nowy `if` obok starych.
5. **Scenariusze są tylko wizualne** – regresję wykrywa oko Wojtka, a nie test.

## Model docelowy
**A. Graf.** Way OSM cięte w węzłach → krawędzie. Każdy węzeł zna swoje wloty/wyloty.

**B. Jezdnia = oś + profil przekroju.** Dla krawędzi, wzdłuż długości s (funkcje kawałkami liniowe):
- `pasy(s)`: lista szerokości pasów (suma = szerokość jezdni),
- `kotwica(s)`: gdzie w przekroju leży oś OSM (środek / granica pasów k / krawędź), w metrach od lewej krawędzi.
Jedna funkcja `granica(s, i) = oś(s) + normalna(s) · (Σ szer. pasów < i − kotwica(s))` daje krawędzie, linie pasów, strzałki i asfalt. Nic innego nie liczy przesunięć.

**C. Węzeł = jeden nazwany typ** (klasyfikator, priorytet od góry):
`KONIEC`, `KONTYNUACJA` (te same pasy), `ZMIANA_PASÓW` (±n, strona), `ROZJAZD` (n → a+b), `WŁĄCZENIE` (a+b → n), `SKRZYŻOWANIE` (reszta, generyczne).
Każdy typ to osobny moduł z dwiema funkcjami:
- `styk()` – ustala warunki brzegowe profili przy węźle: **mapowanie pasów** (pas i wlotu → pas j wylotu, z `turn:lanes` albo reguły domyślnej) i kotwice tak, by granice pasów na styku się pokrywały,
- `strefa()` – geometria wewnątrz węzła (klin, nosek, chevrony).
Nieznany przypadek → `SKRZYŻOWANIE` + ostrzeżenie w raporcie, nie nowa łata.

**D. Priorytet źródeł:** tag OSM (`placement`, `width`, `lanes`, `turn:lanes`) > reguła typu węzła > domyślna (oś na środku). Ręczne `off` z sandboksu = jawny override w danych.

**E. Wygładzanie raz**, na osi, przed profilem. Przejścia profilu (klin, zmiana kotwicy) – jedna funkcja rampy o zadanej długości.

**F. Render tylko rysuje** gotowe poligony i linie. Zero geometrii, zero masek naprawczych.

## Testy (siatka bezpieczeństwa)
Każdy scenariusz z „Scenariusze” dostaje automatyczne asercje:
- styk: krawędzie i granice pasów obu stron schodzą się (< 5 cm),
- szerokość jezdni = suma pasów (poza strefą klina),
- obrys bez samoprzecięć i NaN; linie pasów nie wychodzą poza asfalt,
- kotwica zgodna z regułą (np. 3 pasy przy sąsiedzie ±1 → oś na granicy pasów),
- brak skoku offsetu (zmiana < X m na metr).
Przycisk „Testy” w sandboksie (tabela OK/BŁĄD) + ten sam kod w Playwright w chmurze. Zrzuty referencyjne opcjonalnie, dla kilku kluczowych scen.

## Etapy (każdy = mały PR, wszystkie testy zielone przed następnym)
0. **Asercje na obecnym kodzie** (bez zmian geometrii) → lista scenariuszy, które naprawdę są złe. Przypadki, które już działają dobrze (np. 3 → 2+1), Wojtek zatwierdza jako **wzorzec**: zapisujemy ich geometrię (granice pasów w punktach kontrolnych) i zrzut, a nowy silnik musi dać to samo. Dorobek nie przepada – staje się testem.
1. Nowy silnik obok starego (`sandbox/silnik/`), przełącznik „silnik: stary / nowy”. Graf + profil + `granica()`; typy `KONIEC`, `KONTYNUACJA`.
2. `ZMIANA_PASÓW` – przeniesienie ustalonych reguł z CLAUDE.md.
3. `ROZJAZD` (2→1+1, 3→2+1, odnoga w lewo/prawo).
4. `WŁĄCZENIE`.
5. `SKRZYŻOWANIE` T/X.
6. Autostrady, łącznice, nietypowe. Gdy nowy silnik przejdzie wszystkie sceny – usunięcie starego kodu.

## Do decyzji Wojtka
- Nowy silnik obok (rekomendacja) czy refaktor istniejącego `layout()`.
- Źródło szerokości pasa: stała wg typu drogi, tag `width`, czy oba (tag wygrywa).
- Start od etapu 0 (asercje) – rekomendacja.
