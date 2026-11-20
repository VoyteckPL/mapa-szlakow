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
