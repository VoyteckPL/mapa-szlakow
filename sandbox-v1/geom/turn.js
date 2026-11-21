// Sandbox v1 – geometria: turn:lanes (tag OSM drogi, pasy od lewej w kierunku drogi, np. "left|through|through;right").
// r.turn = tekst tagu. Przydział pasów pnia do odnóg rozwidlenia (Wojtek 2026-11-21 „offset przy turnlanes”):
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
  // ord – odnogi posortowane od lewej ({B, al = cos kąta z pniem}), st – odnoga na wprost; zwraca [{a, k}] dla ord albo null
  function regions(T, ord, st) {
    var p = parse(T); if (!p) return null;
    var si = ord.indexOf(st), L = ord.slice(0, si), R = ord.slice(si + 1);
    function side(arr, t) { // arr: odnogi jednej strony; t: slight / '' / sharp
      if (!arr.length) return null;
      var s = arr.slice().sort(function (a, b) { return b.al - a.al; }); // od najmniejszego kąta
      if (t === 'slight') return s[0]; if (t === 'sharp') return s[s.length - 1];
      return s.reduce(function (b, o) { return Math.abs(o.al) < Math.abs(b.al) ? o : b; });
    }
    function cel(t) {
      if (t === 'through' || t === 'none' || /^merge_to/.test(t)) return st;
      var m = /^(slight_|sharp_)?(left|right)$/.exec(t); if (!m) return null;
      return side(m[2] === 'left' ? L : R, (m[1] || '').replace('_', ''));
    }
    var S = p.map(function (ts) { var o = []; ts.forEach(function (t) { var c = cel(t); if (c && o.indexOf(c) < 0) o.push(c); }); return o; });
    if (S.some(function (o) { return !o.length; })) return null;
    var out = ord.map(function (o) {
      var js = []; S.forEach(function (s, j) { if (s.indexOf(o) >= 0) js.push(j); });
      if (!js.length || js[js.length - 1] - js[0] + 1 !== js.length) return null;
      return { a: js[0], k: js.length };
    });
    return out.some(function (x) { return !x; }) ? null : out;
  }
  G.u.turnParse = parse; G.u.turnRegions = regions;
})();
