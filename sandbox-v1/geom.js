// Sandbox v1 – geometria w lokalnym układzie [m]. Bez łuków: wszystko kanciaste.
// Droga: pts (id węzłów, kierunek jak w OSM), lanes, w (szer. pasa) – bez poboczy,
// o0/o1 – offset jezdni względem linii OSM na początku/końcu, w pasach (+ = w prawo). Wariant B (Wojtek 2026-11-21):
// przy każdym końcu offset stały, zmiana liniowo tylko na odcinku PRZEJ (30 m) w środku drogi; krótsza droga – na całej długości.
// Reguła styku w węźle (Nm), wariant 2 (Wojtek 2026-11-21): każda droga zachowuje szerokość pasa W POPRZEK siebie.
//  Pień = jedyna droga po jednej stronie węzła (1 wchodzi + kilka wychodzi albo kilka wchodzi + 1 wychodzi).
//  Każda odnoga styka się z pniem po dwusiecznej kąta pień–odnoga (miter), więc jej pasy trafiają sztywno
//  w pasy pnia o tym samym położeniu poprzecznym (offset). Pas pnia kończy się na przekroju tej odnogi,
//  która go pokrywa; granica między odnogami sięga dalej z dwóch przekrojów (bez szczelin). Koniec pnia jest
//  więc „łamany”, kanciasty. Pas pnia bez odnogi: przekrój prostopadły. Wolny koniec: prostopadły.
var G = (function () {
  var R = 6378137, PRZEJ = 30;
  function toXY(o, ll) {
    return [(ll.lng - o.lng) * Math.PI / 180 * R * Math.cos(o.lat * Math.PI / 180), (ll.lat - o.lat) * Math.PI / 180 * R];
  }
  function toLL(o, p) {
    return { lat: o.lat + p[1] / R * 180 / Math.PI, lng: o.lng + p[0] / (R * Math.cos(o.lat * Math.PI / 180)) * 180 / Math.PI };
  }
  function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }
  function left(u) { return [-u[1], u[0]]; }
  // wektor przekroju: punkt krawędzi = p + S*d (d w metrach, + = w lewo); |S| = 1/cos(pół kąta)
  function miter(u1, u2) {
    var n1 = left(u1), n2 = left(u2), k = 1 / Math.max(1 + n1[0] * n2[0] + n1[1] * n2[1], 0.05);
    return [(n1[0] + n2[0]) * k, (n1[1] + n2[1]) * k];
  }
  function dirIn(r, P) { var n = r.pts.length; return unit(P[r.pts[n - 2]], P[r.pts[n - 1]]); }
  function dirOut(r, P) { return unit(P[r.pts[0]], P[r.pts[1]]); }

  function konst(S) { return function () { return S; }; }
  // przekrój końca drogi r: f(d) -> wektor S (punkt krawędzi = p + S*d), typ węzła
  function endSection(sc, r, atStart, P) {
    var id = atStart ? r.pts[0] : r.pts[r.pts.length - 1];
    var ins = [], outs = [];
    sc.roads.forEach(function (x) {
      if (x.pts.length < 2) return;
      if (x.pts[x.pts.length - 1] === id) ins.push(x);
      if (x.pts[0] === id) outs.push(x);
    });
    var own = atStart ? dirOut(r, P) : dirIn(r, P), T, Bs, tIn;
    if (ins.length === 1 && outs.length >= 1) { T = ins[0]; Bs = outs; tIn = true; }
    else if (outs.length === 1 && ins.length > 1) { T = outs[0]; Bs = ins; tIn = false; }
    else return { f: konst(left(own)), typ: ins.length + outs.length > 1 ? 'inny' : 'koniec' };
    var typ = Bs.length === 1 ? 'ciag' : tIn ? 'rozwidlenie' : 'wlaczenie';
    var Sof = function (B) { // odnoga zawracająca (> 90° od pnia): przekrój prostopadły do pnia
      var a = tIn ? dirIn(T, P) : dirIn(B, P), b = tIn ? dirOut(B, P) : dirOut(T, P);
      return a[0] * b[0] + a[1] * b[1] < 0 ? left(tIn ? a : b) : miter(a, b); };
    if (r !== T) return { f: konst(Sof(r)), typ: typ };
    var tDir = tIn ? dirIn(T, P) : dirOut(T, P), uIn = tIn ? [-tDir[0], -tDir[1]] : tDir;
    var cand = Bs.map(function (B) { var o = tIn ? B.o0 : B.o1; // offset odnogi w węźle
      return { S: Sof(B), lo: (-B.lanes / 2 - o) * B.w - 1e-6, hi: (B.lanes / 2 - o) * B.w + 1e-6 }; });
    return { typ: typ, f: function (d) {
      var best = null, bv = Infinity;
      cand.forEach(function (c) { if (d < c.lo || d > c.hi) return; var v = (c.S[0] * uIn[0] + c.S[1] * uIn[1]) * d; if (v < bv) { bv = v; best = c.S; } });
      return best || left(tDir);
    } };
  }
  function nodeType(sc, id, P) {
    var r = sc.roads.filter(function (x) { return x.pts.length > 1 && (x.pts[0] === id || x.pts[x.pts.length - 1] === id); })[0];
    return r ? endSection(sc, r, r.pts[0] === id, P).typ : 'punkt';
  }

  // Linie drogi: lanes+1 granic pasów (od lewej) i 2 krawędzie asfaltu (lewa, prawa), polilinie XY.
  function lines(sc, r, P) {
    var pts = r.pts.map(function (id) { return P[id]; }), n = pts.length, S = [], s = [0];
    for (var i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    for (i = 0; i < n; i++) {
      if (i === 0) S.push(endSection(sc, r, true, P).f);
      else if (i === n - 1) S.push(endSection(sc, r, false, P).f);
      else S.push(konst(miter(unit(pts[i - 1], pts[i]), unit(pts[i], pts[i + 1]))));
    }
    var Ltot = s[n - 1] || 1, L = r.lanes, w = r.w;
    // punkty wstawione na granicach strefy zmiany offsetu (przekrój prostopadły do odcinka)
    var a = Ltot > PRZEJ ? (Ltot - PRZEJ) / 2 : 0, b = Ltot > PRZEJ ? a + PRZEJ : Ltot, Q = [], QS = [], Qs = [];
    for (i = 0; i < n; i++) {
      if (i > 0) [a, b].forEach(function (c) { if (c > s[i - 1] + 1e-6 && c < s[i] - 1e-6) {
        var t = (c - s[i - 1]) / (s[i] - s[i - 1]), p0 = pts[i - 1], p1 = pts[i];
        Q.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]); QS.push(konst(left(unit(p0, p1)))); Qs.push(c); } });
      Q.push(pts[i]); QS.push(S[i]); Qs.push(s[i]);
    }
    function off(x) { var t = b > a ? Math.min(1, Math.max(0, (x - a) / (b - a))) : 0; return r.o0 + (r.o1 - r.o0) * t; }
    function line(dFn) { return Q.map(function (p, i) { var d = dFn(off(Qs[i])); var v = QS[i](d); return [p[0] + v[0] * d, p[1] + v[1] * d]; }); }
    var lanes = [];
    for (var j = 0; j <= L; j++) (function (j) { lanes.push(line(function (o) { return (L / 2 - j - o) * w; })); })(j);
    return { lanes: lanes,
      asfalt: [lanes[0], lanes[L]] }; // bez poboczy
  }
  return { toXY: toXY, toLL: toLL, lines: lines, nodeType: nodeType };
})();
