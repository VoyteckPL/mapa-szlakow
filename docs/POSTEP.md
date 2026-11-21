# Postęp: silnik dróg (sandbox)

Nowa rozmowa zaczyna od tego pliku + `docs/PLAN-silnik.md`. Aktualizuj po każdym etapie.

## Decyzje (Wojtek, 2026-11-20)
- Nowy silnik powstaje **obok** starego, z przełącznikiem „silnik: stary / nowy”. Stary zostaje, dopóki nowy nie przejdzie wszystkich scen.
- Szerokość pasa: stała wg typu drogi, tag `width` nadpisuje.
- Działające przypadki (np. 3 → 2+1) = wzorce testowe.

## Zrobione
- **Etap 0 (2026-11-20):** testy geometrii `sandbox/7-testy.js`, przycisk „Testy” w lewym panelu (kliknięcie wiersza wczytuje scenę, dymek pokazuje błędy), w chmurze `node tools/testy-sandbox.js`. Asercje: NaN, szerokość > 0, skok offsetu/szerokości, załamanie i pętla krawędzi, styk granic pasów w węzłach liniowych (≤ 10 cm), nakładanie pasa na asfalt innej drogi.
  Wynik na starym silniku: **89/132 OK**; widoczne sceny 3 → 2+1: 23/28 OK (źle tylko kąty 60–80°: załamanie krawędzi odnogi).

## Co wychodzi źle (stary silnik, 43 sceny)
- Dwukierunkowe: zmiana pasów 9/9 – linie pasów nie trafiają na siebie na styku (do 2,6 m).
- Jezdnia + boczna 7/7, „wspólny pas” w rozjazdach – boczna zaczyna się w środku jezdni; test nie zna jeszcze tego typu węzła (może być zamierzone → potrzebny nazwany typ).
- Zakręty i kąty 4/7 – szczeliny krawędzi na załamaniu (0,2–1,8 m), nakładanie przy ostrym Y.
- Nietypowe 4/4 – m.in. skok szerokości na krótkim odcinku, dwa rozjazdy po sobie.
- Rozjazdy 4 → 2+2, włączenia 3/10, autostrady 2/6.
Skrzyżowania T/X nie są jeszcze testowane (tylko węzły „liniowe”, ramiona w ±40°).

## Dalej
1. Wojtek przegląda listę „✗” i mówi, które sceny są faktycznie złe, a które OK (np. boczna) → test dostaje regułę typu węzła.
2. Zapis wzorców (granice pasów) dla scen zatwierdzonych jako dobre.
3. Etap 1 planu: `sandbox/silnik/` – normalizacja, graf, profil, `granica()`; typy KONIEC, KONTYNUACJA.

## 2026-11-20 19:09 – zmiana kierunku (propozycja Wojtka, czeka na „rób”)
Sandbox od zera (`sandbox2.html` + `sandbox2/`), stary zostaje. Etap 1: wszystkie osie na środku, czyste połączenia odporne na duże kąty (testy 100%). Etap 2: offsety jako reguły = przesunięcie osi narastające wzdłuż drogi, liczone PRZED połączeniem; kod połączeń nie wie o offsetach.

## 2026-11-20 – sandbox2, etap 1 (osie na środku) – zrobione
`sandbox2.html`: 19 scen w 5 grupach (ikony), przeciąganie węzłów/punktów (dwuklik dodaje/usuwa punkt), klik drogi → typ, pasy ±, →, ⇄; ⧉ kopiuje scenę, ⤓ wkleja, ↶ cofa, ✓ testy.
Reguły w `3-polaczenia.js`: ciąg z łukami (odsunięcie łuku ≤ pół szer.+2 m), klin w szerszej drodze za węzłem, rozjazd/włączenie w korytarzu (gałąź w swoich pasach pnia, nie skręca do drugiej), skrzyżowanie = przycięte ramiona + wielokąt z łukami narożników.
Testy: każda scena + 12 losowych wariantów = 247; **242 OK**. Pozostałe 5: rozjazdy/włączenia przy ostrym skręcie pnia (>45°) – gałęzie lekko na siebie nachodzą.
Dalej: uwagi Wojtka do scen (wkleja ⧉ + numer węzła) → poprawki reguł; potem etap 2 (offsety jako reguły).

## 2026-11-20 (wieczór) – poprawki po uwagach Wojtka na scenach sandbox2
- Zmiana pasów: klin SYMETRYCZNY (szersza jezdnia na styku ma szerokość węższej, rozszerza się po obu stronach osi).
- Rozjazd/włączenie: gałąź „prosta” (<9° od przedłużenia pnia) zostaje na osi, jej przekrój zwęża się symetrycznie; gałąź boczna startuje w swoim pasie pnia i jedną krzywą Hermite'a dochodzi do własnej osi (koniec falowania). Overlap asfaltów blisko węzła jest zamierzony (etap 1 bez offsetów); lane-linie nie pasują 1:1 (pień 3 pasy vs prosta 2 pasy) – czeka na etap 2.
- Nawrót: łuk o promieniu ≥ 1,5·połowa szerokości+1 (bez kanciastości); skrzyżowanie: gdy wszystkie ramiona po jednej stronie węzła, tył węzła zaokrąglony wokół W2.
- Testy: 245/247 (ostatnie 2 to losowe ostre warianty rozjazdów).

## 2026-11-20 (wieczór) – zmiana kierunku: jedno skrzyżowanie 3 ramion
Wojtek: lista szablonów nie daje postępu → `skrzyzowanie.html` + `skrz/skrz.js`. Jedno skrzyżowanie, osie na środku, suwaki: R (łuk narożnika kołowy, styczny do obu krawędzi), z (strefa), T (maks. wcięcie), min (cięcie), gap (odstęp linii), Rb (tył węzła), lw (szer. pasa), far (limit „prawie prosto”). Pasy i kierunek per ramię. Kąty pokazane na ekranie. ⧉ kopiuje parametry+węzły+kąty+cięcia; `sweepTest()` w konsoli przemiata kąty (0 błędów).
Dalej: Wojtek dobiera „złoty środek” suwakami i wkleja ustawienia; potem rozjazdy i reszta (sandbox2 wstrzymany), na końcu offsety.

## 2026-11-21 – porządki
Na prośbę Wojtka usunięte: `sandbox2.html` + `sandbox2/`, `skrzyzowanie.html` + `skrz/`, `tools/testy-sandbox2.js` (wcześniej też edytor-pasow-v2, presety-zjazdow, rozjazdy, rozjazdy-dziwne, rozpoznawanie-pasow). Kod jest w historii git, gdyby był potrzebny. Następny krok do ustalenia z Wojtkiem.
- Usunięte też mapa-drog, mapa-osm, skrzyzowania, wezel-demo, wezel-piaskownica. Zostają: index, edytor-pasow, autostrady, rozjazd-szkielet, sandbox-drog.

## 2026-11-21 – nowy sandbox od zera: `nm.html` + `nm/`
Wojtek zaczyna od początku: Leaflet, tylko linie OSM z punktami (przeciągane) i krawędzie pasów. Nm = główny węzeł rozwidlający (pomarańczowy). Zasada nienaruszalna: na Nm pasy przechodzące z drogi na drogę stykają się sztywno i zachowują szerokość; bez łuków (kanciasto). Na razie tylko autostrady, przypadek 1 na 1.
Szkielet: podkłady OSM/ortofoto + warstwy (prawy górny), ⧉ kopiuj config z opisem problemu, lewy panel szablonów (kat. „1”: 1-1, 1-1+1 czeka), prawy dolny panel zaznaczonej drogi (pasy ±, szerokość pasa ±). Scena w localStorage. Geometria wstępna: oś na środku, w Nm przekrój po dwusiecznej (miter).
Dalej: odpowiedzi Wojtka na pytania (20 pytań w wątku) → reguły Nm.

## 2026-11-21 – Sandbox v1 (`sandbox-v1.html` + `sandbox-v1/`, dawniej nm.html)
Ustalenia Wojtka: pas 3,5 m, BEZ poboczy (Wojtek 12:59: bez offsetu pasy dokładnie na środku linii OSM); panel drogi: pasy 1–8, szer. pasa, ⇄ kierunek (strzałka na linii OSM), usuń. Jezdnia jak w OSM (jednokierunkowa). Oś domyślnie na środku; offset (w pasach, + w prawo) na każdym końcu drogi: klik w punkt → ± dla każdej drogi kończącej się w nim (także Nm); liniowo po długości; jest w configu. Różna liczba pasów na Nm = regulowana offsetem (szablony: dodatkowy pas po prawej, odnogi rozwidlenia na lewych/prawych pasach pnia).
Offset (Wojtek 15:07–15:11, zastępuje wariant A): offset przy końcu drogi (o0/o1) stały tuż przy końcu (aż za skośny styk + 1 m), potem PROSTO (bez łuków) na środek na 20 m; krawędzie liczone jako równoległe do przesuniętej osi z miterami → stała szerokość pasa. Pień na rozwidleniu/włączeniu nie rysuje zamknięcia (rysują je odnogi). Stare sceny z jednym `o` konwertowane na koniec w węźle.
Reguła styku (geom.js), wariant 2 (Wojtek 13:10, „najwyżej cofniemy”): każda droga zachowuje szerokość W POPRZEK siebie. Pień = jedyna droga po jednej stronie węzła; każda odnoga styka się z pniem po dwusiecznej pień–odnoga, pas pnia kończy się na przekroju odnogi, która go pokrywa (koniec pnia łamany, kanciasty). Poprzednio (wariant 1): wspólny przekrój prostopadły do pnia – boczna droga pod kątem się zwężała.
Rysowanie: DWUKLIK w pusty obszar = punkt (klik tylko odznacza) (nowa linia, od zaznaczonego punktu jeśli jest), klik w węzeł podczas rysowania = połączenie i koniec, Esc/Enter koniec, Del usuwa, Ctrl+Z / ↶ cofa. 🧲 przyciąganie do siatki 5 m; siatka i asfalt to warstwy (domyślnie wył.). Podkład domyślny ortofoto. Linia OSM przerywana. ⧉: opis + 📋 kopiuj config (z polem `scena`), ⤓ wczytaj config.
Szablony: 1 prosto (2-2, 3-3, 4-4), 2 zmiana pasów (2-3, 3-2, 3-4, 4-3), 3 rozwidlenia (2-1+1, 3-2+1, 3-1+2, 4-2+2, 4-3+1).
Dalej: uwagi Wojtka do styku w Nm (np. pobocza na rozwidleniu nachodzą na odnogę).

## 2026-11-21 15:18 – rozwidlenie/włączenie: styk na linii odnogi
Wojtek: „środek pasa odnogi na środku linii odnogi; połączenie pasów pod kątem ma wypadać na środku linii”.
Reguła (geom.js `endSection`): pasy pnia dzielone między odnogi po kolei od lewej (odnogi sortowane od lewej); offset odnogi w węźle jest automatyczny (panel go nie pokazuje). Odnoga ma środek pasa na swojej linii OSM, skośny styk (dwusieczna) leży w punkcie, gdzie środek przydzielonych pasów pnia przecina linię odnogi; pasy pnia biegną do niego prosto. Brak przecięcia (kąt < 15° albo dalej niż pierwszy odcinek odnogi) → styk w węźle + automatyczny offset wracający na środek.
Znane: szablon 3-2+1 (odnoga 13,5°) – odnogi wracają na środek na 20 m i lekko na siebie nachodzą (~0,2 m).

## 2026-11-21 15:39 – ręczna edycja krawędzi pasów (`sandbox-v1/edycja.js`)
Warstwa ✎ (w panelu warstw, domyślnie wył.): każdy wierzchołek i odcinek krawędzi pasa przeciągany; dwuklik w odcinek dodaje wierzchołek, w wierzchołek usuwa. Opcje (panel pod 🧲, widoczny przy ✎): ⊙ przyciąganie do wierzchołków, ⟋ do krawędzi pasów, ⟷ cały przekrój naraz (szerokość zachowana), ↺ usuń ręczne zmiany. Siatka: rozdzielczość ▦ (0,875 / 1,75 / 3,5 / 5 / 10 m, domyślnie 1,75 = pół pasa), 🧲 przyciąga też uchwyty.
Zapis: `sc.edits[idDrogi]` = krawędzie (xy m) – nadpisują wyliczone; w configu `krawedzie_pasow` po edycji + `recznie: true`. Cel: Wojtek ręcznie ustawia dobry kształt i wysyła config → z tego wyprowadzamy regułę.

## 2026-11-21 15:50 – ✎: pojedynczy wierzchołek domyślnie
Wojtek: na drodze z kilkoma pasami nie dało się ruszyć jednego wierzchołka (⟷ „cały przekrój” był domyślnie włączony). Teraz ⟷ domyślnie wył.; Shift przy przeciąganiu odwraca tryb (przekrój ↔ jeden wierzchołek).

## 2026-11-21 16:00 – ✎: rozsuwanie wierzchołków w jednym miejscu
Wierzchołki bliżej niż 6 px (np. styk dróg w Nm) mają uchwyty rozsunięte wachlarzem (cienka linia do prawdziwego punktu) i etykietę `droga:krawędź/pasy`, np. `R2:3/3p` = krawędź 3 (od lewej, 0 = lewa krawędź) drogi R2 o 3 pasach. Przeciąganie uchwytu przesuwa prawdziwy punkt (z poprawką o rozsunięcie).
- 16:05 (Wojtek): etykiety tylko na żądanie. Grupa wierzchołków w jednym miejscu = jeden fioletowy uchwyt; klik rozwija wachlarz z etykietami (jedna grupa naraz), klik w mapę zwija. Klik w pojedynczy wierzchołek pokazuje/chowa jego etykietę.
- 16:02 (Wojtek): asfalt rysowany osobno dla każdego pasa (wielokąt między krawędziami k i k+1), a nie jeden dla całej drogi – ręczna edycja jednej krawędzi zmienia tylko sąsiednie pasy.
