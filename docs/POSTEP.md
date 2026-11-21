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
- 16:15 (Wojtek): każdy pas ma WŁASNE krawędzie (lewa, prawa) – wspólna granica sąsiednich pasów zdublowana (`H.split`), więc wierzchołki i asfalt pasów są niezależne. `sc.edits[id]` = płaska lista 2·L polilinii (pas j: [2j] lewa, [2j+1] prawa); stary format (L+1 krawędzi) konwertowany przy wczytaniu. Config: `pasy_krawedzie: [{lewa, prawa}]` zamiast `krawedzie_pasow`. Etykieta wierzchołka: `R2:3/3p P` = droga R2, pas 3 z 3 (od lewej, od 1), prawa krawędź. Zakończenia rysowane osobno dla każdego pasa.

## 2026-11-21 16:20 – rozwidlenie: krawędzie pasów pnia kończą się na styku SWOJEJ odnogi
Wzorzec Wojtka: 3-2+1, odnoga 1-pasowa pod 90° w prawo, pień z offsetem końca +0,5 (2 lewe pasy w osi prostej). Pasy pnia do prostej kończą się w węźle (przekrój prostopadły), pas 3 skręca w odnogę z miterem (skos przez punkt, gdzie środek pasa 3 przecina linię odnogi). Reguła ogólna w `geom.js`: `lines()` zwraca `pasy` (każdy pas: własna lewa i prawa krawędź); na końcu pnia krawędź pasa kończy się na styku odnogi, do której ten pas prowadzi (`endSection.pt(d, h)`, h = środek pasa). Granica między pasami różnych odnóg ma więc dwa końce. Wcześniej wspólna granica brała skos odnogi także dla pasa prostej. Wynik bez ręcznych zmian = wzorzec 1:1.

## 2026-11-21 16:25 – wzorce, kąty, przyciąganie kąta
- ⧉: 💾 zapisuje wzorzec (config aktualnej sceny + opis z pola, ręczne krawędzie w `pasy_krawedzie` z `recznie`) do localStorage `sv1-wzorce` i czyści ręczne zmiany; 📚 kopiuje wszystkie `{wzorce: [...]}`; 🗑 usuwa. Licznik „n wz.”.
- Ręczne krawędzie mają podpis geometrii (`sc.editSig` = węzły + drogi). Po ruchu linii OSM / zmianie drogi są ignorowane (krawędzie znów liczone), następna edycja zaczyna od świeżej geometrii; Ctrl+Z przywraca. (Wcześniej ręczne krawędzie „zamrażały” drogę.)
- Warstwa ∠ (domyślnie wł.): kąty między liniami OSM w każdym węźle (180° pomijane, przy 2 odcinkach tylko mniejszy kąt).
- ∠5 (obok 🧲): przeciągany węzeł przyciąga kąt odcinka sąsiad→węzeł co 5° względem drugiej drogi w sąsiednim węźle (bez niej – względem osi X); długość odcinka bez zmian.

## 2026-11-21 16:35 – rozwidlenie: narożnik wewnętrzny styku na przekroju w węźle (wzorce 15–90°)
11 wzorców Wojtka (3-2+1, pień offset +0,5, odnoga 1 pas w prawo, kąty 18–76° + wcześniejszy 90°). Wniosek: styk pnia z odnogą to miter (dwusieczna pień–linia OSM odnogi), ale jego narożnik wewnętrzny nie może wyjść za przekrój pnia w węźle. Przy ≥ ~75° obowiązuje dotychczasowa reguła (środek styku na linii odnogi, narożnik wewnętrzny już przed węzłem). Poniżej cały styk cofa się wzdłuż pnia, aż narożnik wewnętrzny trafi na przekrój w węźle → narożnik zewnętrzny x = szer·tg(kąt/2). Odnoga startuje wtedy obok swojej linii OSM (automatyczny offset) i wraca na nią regułą offsetu (1 m + 20 m). Reguła w `geom.js` `endSection` (cand). Styk zgadza się z wszystkimi wzorcami co do cm; różnica tylko w środku odnogi: we wzorcach odnoga szła prosto do końca linii (artefakt – nie było tam wierzchołków), u nas powrót na oś na 20 m.
- 16:50 ✎ wstawianie/usuwanie: kółka w połowie odcinków (≥ 40 px) – przeciągnięcie wstawia wierzchołek na WSZYSTKICH krawędziach, które tam przechodzą (wspólna granica pasów zostaje wspólna; ⟷ = cały przekrój); dwuklik w krawędź też. Usuwanie: prawy klik (lub dwuklik) w wierzchołek; prawy klik w fioletową grupę usuwa całą grupę. Końców krawędzi nie da się usunąć.
- 16:55 (Wojtek: „zapamiętaj offset +0,5 dla tej kombinacji”) – reguła ogólna: offset pnia przy rozwidleniu/włączeniu jest AUTOMATYCZNY: o = L/2 − a − k/2, gdzie odnoga „na wprost” (najmniejszy kąt z pniem) dostaje pasy pnia [a, a+k) (podział od lewej). 3-2+1 → +0,5; 3-1+2 (prosta po prawej) → −0,5; 4-2+2 z prostą po lewej → +1. Ręczny offset pnia w tym węźle jest ignorowany (jak offset odnóg).
- 17:00 Eksport (📋 i 💾) zbiera więcej danych: `operacje` = dziennik ręcznych zmian (przesun/dodaj/usun: droga, pas, krawędź L/P, nr wierzchołka `w`, `z` → `na`), `pasy_krawedzie_auto` (geometria z reguł obok ręcznej, dla dróg z `recznie`), `offset_auto` [początek, koniec] (null = brak automatu), `wezly[].katy` = kąty między liniami OSM w węźle z nazwami dróg. Dziennik czyszczony razem z ręcznymi zmianami (💾, ↺, zmiana geometrii).

## 2026-11-21 17:05 – 19 wzorców 3-2+1 (0–90°), wnioski
Analiza skryptem (geom.js w node vs `pasy_krawedzie` + `operacje`):
- Styk w n1 zgadzał się już z regułą 16:31 dla wszystkich kątów 15,9–90° (bez zmian).
- Wojtek w każdym wzorcu usuwał wierzchołek „styk + 1 m” odnogi → odnoga przy Nm (automatyczny offset, nie pień) NIE ma odcinka stałego: od styku od razu prosto na swoją oś (pień i ręczne offsety – bez zmian).
- Gdy po przejściu (20 m) zostaje < 5 m drogi, przejście idzie do samego końca (bez krótkiego załamania). Koniec odnogi zostaje prostopadły, na środku linii.
- < 15° (wzorzec 12°): styk = przekrój prostopadły do pnia w węźle (pas pnia ucięty równo w n1, odnoga zaczyna się tym samym przekrojem i idzie prosto na swoją oś).
Wynik: n1 zgodne we wszystkich 19; różnice tylko w środku odnóg ≥ 25 m (wzorce 18, 19: punkt powrotu na oś ~3 m dalej) i hold pnia przy 12° (0,7 m, nieedytowany).
- 17:10 Wzorzec 19 (n6 tuż przy R2, 12°) = zakaz wjazdu odnogi na drogę na wprost: powrót odnogi na własną oś trwa co najmniej tMin = (kB + kS)·w/2 / sin(kąt odnoga–prosta) (aż linie OSM rozejdą się na pół szerokości obu jezdni), najwyżej do końca odnogi. Środek odnogi liniowo między stykiem a punktem powrotu, więc krawędź nie przekracza krawędzi prostej. Wzorce 1–17 i 19 zgodne; 18 różni się tylko punktem powrotu (bez nakładania).
- 17:08 (Wojtek) Odnoga przy Nm: przejście na oś przez cały pierwszy odcinek OSM (jeden prosty pas, bez wierzchołków po drodze, także gdy n6 daleko). Wolny koniec drogi: przekrój prostopadły do FAKTYCZNEJ osi jezdni (z offsetem), nie do linii OSM – zakończenie pasa zawsze prostopadłe do krawędzi bocznych.
- 17:12 Wzorzec 30°, n6 11 m od n1 (odnoga krótsza niż punkt przecięcia): styk = przekrój prostopadły do pnia w węźle (jak < 15°). Reguła: brak ważnego przecięcia środka pasów pnia z linią odnogi → przekrój prostopadły do pnia. Wzorzec zgodny 1:1; stare wzorce: n1 bez zmian, różnią się tylko końce odnóg (~0,4 m) przez regułę 17:04 (koniec prostopadły do faktycznej osi).
- 17:13 Widok mapy (środek + zoom) zapamiętywany w localStorage `sv1-widok` i odtwarzany po F5 (szablon / wczytanie configu nadal centruje).
- 17:18 (Wojtek: skok między 27° a 26°) Styk ukośny ↔ prostopadły przechodzi PŁYNNIE: k = (zapas od przecięcia środka pasów pnia z linią odnogi do końca jej odcinka − 1 m) / 4 m, obcięte do 0–1; środek i kierunek styku liniowo między wariantami (narożnik wewnętrzny zostaje na przekroju w węźle). Usunięty próg 15° (det 0,26) – mały kąt daje duży sB, więc k = 0 sam. Wszystkie wcześniejsze wzorce: styk w n1 bez zmian.
- 17:30 – odnoga nie wchodzi na sąsiednią jezdnię (4 wzorce, n6 blisko R2): oś odnogi do pierwszego węzła OSM trzyma się ≥ (kB+kS)·w/2 od osi drogi na wprost; bliżej → odsunięcie prostopadle do tej drogi (R3 zostaje w paśmie pasa 3, równolegle). `endSection().odsun` + korekta osi w `lines()`. Wszystkie wzorce zgodne (≤0,06 m), stare bez zmian.
- 17:27 – większy zoom mapy: maxZoom 25 (było 22), krok 0,25/0,5.
- 17:35 – ✎: przycisk ⇹ „przywróć szerokość pasa” – klik w wierzchołek krawędzi wzorcowej, druga krawędź tego pasa ustawia się równolegle w odległości w (ukosy w wierzchołkach, końce prostopadłe); w logu operacja `szerokosc`.
- 17:40 – pamięć ustawień po F5 (`sandbox-v1/ustawienia.js`, localStorage sv1-ustaw): podkład, nakładki, przełączniki (🧲, ∠5, ⊙, ⟋, ⟷, ⇹…) i rozdzielczość siatki ▦.
- 17:50 – odnoga 90°–135° do drogi na wprost (wzorzec 93°): wewn. krawędź odnogi do krawędzi pasów na wprost (Xin), zewn. krawędzie odnogi i pnia – ukos (Xout); styk pas pnia | odnoga = odcinek narożnik pnia w węźle (K) → Xout, klin K–Xin–Xout należy do odnogi. Wierzchołki krawędzi pnia za cofniętym końcem dociągane do niego. Powyżej 135° bez zmian (brak wzorców). `endSection` → `rozw()`, `extra`.
- 17:45 – płynne przejście przy 90°: między 90° a 93° koniec wewn. krawędzi pasa pnia przesuwa się z Xin do K (styk z ukosu Xin–Xout w K–Xout), odcinek stały pnia też płynnie (`kp`, `hold` w `rozw()`).
- 17:58 – odnoga > 90° całym zakresem (wzorce 93° i 137,7°): kąt wyjścia e = θ do 100° (klin), 100°–115° płynnie do 90°, dalej wyjście prostopadłe (styk jak przy 90°) i zakręt, gdy oś jest ½ szer. odnogi za zewn. krawędzią pnia; pień jako przeszkoda (`odsun2`) – odnoga nie wchodzi na R1. Usuwane zdublowane wierzchołki krawędzi. Przegląd 85–178° co 0,25°: bez skoków.
- 18:00 – poprawka: warstwa ✎ nie jest już pamiętana po F5 (przy włączonej ✎ dwuklik nie rysuje nowych linii OSM).
- 18:05 – odsunięcie odnogi od drogi na wprost (i od pnia) działa na WSZYSTKICH punktach osi odnogi wzdłuż pierwszego odcinka tej drogi, nie tylko do 1. węzła odnogi (wzorzec n1–n6–n7: n6 blisko R2, pas zostaje równoległy). Zgodność z wzorcem ≤0,45 m (różnice tylko w położeniu wierzchołków wzdłuż krawędzi).
- 18:12 – odnoga nie nachodzi na drogę na wprost ani na pień na CAŁEJ długości: każdy punkt osi odnogi trzyma odstęp od całej łamanej tej drogi (najbliższy odcinek, odsunięcie prostopadłe do niego); pień – od jego zewn. krawędzi. `odsunPt`, `dalej()`.
- 18:15 – podkład „Tło kremowe” 🟨 (jednolity kolor #f3ecd9, bez kafelków), pamiętany po F5.
- 18:20 – drogi nie nachodzą na siebie ogólnie (`clearP`): punkt OSM węższej drogi leżący obok szerszej drogi bliżej niż (szer. w węźle + szer. tamtej)/2 od jej osi OSM jest odsuwany prostopadle (geometria liczona z przesuniętych punktów, linie OSM bez zmian). Odnoga przy Nm: gdy jej 1. węzeł trzyma odstęp, przejście na oś kończy się dokładnie w nim (prosty pas). Wzorzec R3→R4 obok R2: pasy równoległe w −3,5…−7.
- 18:25 – menu warstw Leaflet domyślnie otwarte, ikona warstw zawsze widoczna (zwija/rozwija listę). Do menu przeniesione: 💾 📚 🗑 + licznik wzorców, 🧲 ▦ ∠5, ↶ i nowy ↷ (ponów, Ctrl+Y / Ctrl+Shift+Z). Panel ⧉ (opis problemu, 📋, ⤓) usunięty.
- 18:30 – mechanika węzła Nm wstępnie gotowa. **Następny krok (nowy wątek):** optymalizacja i podział plików sandbox-v1 na mniejsze moduły (oszczędność tokenów), bez zmiany zachowania – sprawdzać wzorcami (`wzorce` z 📚) przed i po.

## 2026-11-21 17:40 – podział sandbox-v1 na moduły (bez zmiany zachowania)
- Testy regresji: `tools/test-v1.js` (node, geometria: 7 szablonów prosto, 5 rozwidleń, przegląd kątów 3–177° co 6° dla rozwidlenia i włączenia, odnoga L/P, 1. węzeł 60 m i 12 m + 17 wzorców Wojtka → 1229 odcisków) i `tools/test-v1-ui.js` (Playwright: szablony, nakładki, panel punktu/drogi, przeciąganie z ∠5, 💾, F5 → 27 odcisków). Oba zgodne przed i po podziale (UI porównane ze starym kodem).
- `geom.js` (269 l.) → `geom/` baza 27, odsun 36, rozw-tepy 41, styk 97, pasy 94. `nm.js` (323 l.) → nm 203 + nm-katy 30, nm-menu 63, nm-panel 40, nm-start 10. Kod reguł bez zmian (tylko opakowanie; `rozw` dostaje kontekst węzła).
- **Następny krok:** dalsze prace nad regułami węzłów; przy refaktorze zawsze oba testy. Ewentualnie podzielić `edycja.js` (206 l.).

## 2026-11-21 18:40 – turn:lanes (`geom/turn.js`, `nm-turn.js`)
- Droga ma `turn` = tag OSM turn:lanes (pasy od lewej, w kierunku drogi). Panel drogi: pole tekstowe (czerwone, gdy liczba pól ≠ liczba pasów) + przycisk na każdy pas (klik = następny kierunek, prawy klik = poprzedni). Eksport: `drogi[].turn_lanes`, scena: `roads[].turn`.
- Warstwa ↱: strzałki na środku każdego pasa ~8 m przed końcem drogi (białe, SVG; reverse, merge_to_*).
- Rozwidlenie: gdy pień ma poprawny turn:lanes, odnoga dostaje zakres pasów pnia z tagu (through/none/merge → prosta = najmniejszy kąt; left*/right* → odnogi po lewej/prawej od prostej; slight = najmniejszy kąt, sharp = największy, zwykły = najbliżej 90°). Pas wspólny (np. through;right) należy do obu odnóg (krawędź kończy się na bliższym styku). Offset pnia: o = L/2 − a − k/2 z zakresu prostej; odnoga ma środek na środku swojego zakresu (szerokość własna). Np. 3 pasy `left;through|through|right` → +0,5. Zakres nieciągły, odnoga bez pasa, pas bez celu, zły licznik → reguła domyślna.
- Testy: 8 nowych scen `turn …` w test-v1.js (1237), UI zgodne poza nową warstwą/panelem (odciski zapisane po sprawdzeniu, że ścieżki bez zmian).
- **Dalej:** wzorce Wojtka z turn:lanes (pas wspólny, odnoga o innej liczbie pasów niż zakres), ewentualnie ciąg ze zmianą liczby pasów (pas dodatkowy po lewej, gdy turn:lanes wyróżnia pierwszy pas).
- 18:25 (wzorzec Wojtka: 2 pasy → 3 pasy `none|none|right` → 3-2+1) Oba końce drogi z tym samym offsetem (tu ręczny +0,5 przy 2-pasówce i auto +0,5 przy rozwidleniu): oś stała na całej długości, bez powrotu na środek po drodze (`stale` w `pasy.js`). Wzorzec dopisany do `tools/v1-wzorce.json`; stare sceny bez zmian.
- 18:35 (wzorzec Wojtka: pień 3 pasy wchodzi pod kątem 16,7° do prostej, odnoga 13,5° w prawo) Krawędź pasa pnia przy odnodze nie wjeżdża na jezdnię sąsiada od strony prostej: gdy wewn. narożnik styku odnogi leży za zewn. krawędzią sąsiada (prostej), przenoszony na narożnik sąsiada; zewn. narożnik bez zmian, styk = odcinek między nimi (`k.f` w `styk.js`). Płynnie (głębokość 0–0,1 m). Pień w linii z prostą – bez zmian (wszystkie stare sceny 0,000 m). Wzorzec zgodny 1:1, dopisany do testów.
- 18:45 ✎ linie pomocnicze 📐 (domyślnie wł., w panelu ✎ pod ⟋): przeciągany wierzchołek blisko linii pomocniczej jedzie po niej – przedłużenia obu sąsiednich odcinków jego krawędzi i prostopadłe do nich (przez położenie wyjściowe); na linii przyciąga do przecięcia z krawędzią pasa lub z drugą linią pomocniczą (kółko). Wierzchołek ⊙ ma pierwszeństwo. Linia rysowana przerywaną turkusową.
- 18:50 ✎ 🧲: wierzchołki przyciągają się do LINII siatki (każda oś osobno, gdy linia bliżej niż 12 px; węzeł siatki = obie), a na linii pomocniczej 📐 – do jej przecięć z liniami siatki. Wcześniej 🧲 zawsze zaokrąglał do węzła siatki.
- 18:55–19:15 **Nowa reguła odnogi ostrej (6 wzorców 3-2+1: 90, 85, 80, 70, 65, 45°; stare wzorce 0–15 z 0–90° usunięte z testów – Wojtek: „są źle”).** Odnoga jedzie na SWOJEJ osi OSM (offset 0, bez przejścia), prosto do pnia. Każda krawędź odnogi kończy się na przecięciu (narożnik) z odpowiadającą jej krawędzią pasów pnia. Narożnik za przekrojem pnia w węźle → krawędź pnia kończy się na przekroju, a krawędź odnogi biegnie od przekroju wzdłuż krawędzi pnia do narożnika (klin należy do odnogi); narożnik przed przekrojem → obie krawędzie w nim. Reguła działa, gdy oba narożniki leżą na 1. odcinku odnogi (3-2+1, odcinek 60 m: od ~6°) i narożnik nie wypada na jezdni prostej (pień pod kątem – wtedy dawna reguła, wzorzec turn 2). `nw` w `styk.js`, `extra` jako lista w `pasy.js`. Odnoga > 90°: styk K–Xout już od 90° (usunięte przejście 90–93°) – ciągłość z nową regułą.
- Wierzchołki krawędzi leżące na prostej (< 1 cm) są usuwane (Wojtek kasował je ręcznie).
- Zgodność: narożniki 1:1 we wzorcach 85, 70, 65°; 45° 0,33 m (wzorzec 5,97 → potem przesunięty na 6,30 – wygląda na przypadkowe); 80° 0,36 m (n6 załamane 5°, we wzorcu krawędź prosto z 2. odcinka); 90°: pas pnia kończy się na przekroju (0; −3,5), we wzorcu 1,75 – jak w 85–45°.
- **Dalej:** wzorce < 45° (jak wygląda długi klin wzdłuż prostej) i > 90°.
