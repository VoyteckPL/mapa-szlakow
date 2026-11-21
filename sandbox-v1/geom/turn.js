// Sandbox v1 – geometria: turn:lanes (tag OSM drogi, pasy od lewej w kierunku drogi, np. "left|through|through;right").
// r.turn = tekst tagu – tylko strzałki i edycja (reguła offsetu / przydziału pasów wg turn:lanes usunięta 2026-11-21 19:55).
// Dawny opis reguły (historia w git):
//  pas j prowadzi do odnóg pasujących do jego kierunków; prosta (najmniejszy kąt z pniem) = through / none / merge_to_*,
//  left* = odnogi po lewej od prostej, right* = po prawej (slight = najmniejszy kąt, sharp = największy, zwykły = najbliżej 90°).
//  Odnoga dostaje zakres pasów pnia [a, a+k) = pasy, które do niej prowadzą (pas wspólny, np. through;right, należy do obu).
//  Offset pnia: pasy do prostej mają środek na osi pnia: o = L/2 − a − k/2. Zakres nieciągły / odnoga bez pasa /
//  pas bez kierunku / liczba pól ≠ liczba pasów → null (reguła domyślna: po kolei od lewej wg liczby pasów odnóg).
(function () {
  function parse(r) { // tablica zbiorów kierunków dla każdego pasa albo null
    if (!r.turn || typeof r.turn !== 'string') return null;
    var p = r.turn.split('|').map(function (s) { return s.split(';').map(function (t) { return t.trim() || 'none'; }); });
    return p.length === r.lanes ? p : null;
  }
  G.u.turnParse = parse;
})();
