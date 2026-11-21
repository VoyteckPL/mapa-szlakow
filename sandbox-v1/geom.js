// Sandbox v1 – geometria w lokalnym układzie [m]. Bez łuków: wszystko kanciaste.
// Droga: pts (id węzłów, kierunek jak w OSM), lanes, w (szer. pasa) – bez poboczy,
// o0/o1 – offset jezdni przy początku/końcu względem linii OSM, w pasach (+ = w prawo). Reguła (Wojtek 2026-11-21):
// offset stały tuż przy końcu (aż za skośny styk), potem prosto na środek na krótkim odcinku PRZEJ; stała szerokość, bez łuków.
// Reguła styku w węźle (Nm), wariant 2 (Wojtek 2026-11-21): każda droga zachowuje szerokość pasa W POPRZEK siebie.
//  Pień = jedyna droga po jednej stronie węzła (1 wchodzi + kilka wychodzi albo kilka wchodzi + 1 wychodzi).
//  Każda odnoga styka się z pniem po dwusiecznej kąta pień–odnoga (miter), więc jej pasy trafiają sztywno
//  w pasy pnia o tym samym położeniu poprzecznym (offset). Pas pnia kończy się na przekroju tej odnogi,
//  która go pokrywa; granica między odnogami sięga dalej z dwóch przekrojów (bez szczelin). Koniec pnia jest
//  więc „łamany”, kanciasty. Pas pnia bez odnogi: przekrój prostopadły. Wolny koniec: prostopadły.
var G = (function () {
  var R = 6378137, PRZEJ = 20;
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
    var Sof = function (B) { return tIn ? miter(dirIn(T, P), dirOut(B, P)) : miter(dirIn(B, P), dirOut(T, P)); };
    if (r !== T) return { f: konst(Sof(r)), typ: typ };
    var pien = Bs.length > 1; // koniec pnia na rozwidleniu/włączeniu: zamknięcie rysują odnogi
    var tDir = tIn ? dirIn(T, P) : dirOut(T, P), uIn = tIn ? [-tDir[0], -tDir[1]] : tDir;
    var cand = Bs.map(function (B) { var o = (tIn ? B.o0 : B.o1) || 0; // offset odnogi w węźle
      return { S: Sof(B), lo: (-B.lanes / 2 - o) * B.w - 1e-6, hi: (B.lanes / 2 - o) * B.w + 1e-6 }; });
    return { typ: typ, pien: pien, f: function (d) {
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
  // Offset przy końcu: stały na odcinku H (do końca skośnego styku + 1 m), potem PROSTO na środek na PRZEJ m
  // (kanciasto, bez łuków). Krawędzie = równoległe do osi jezdni (oś OSM przesunięta o offset) z miterami,
  // więc pas ma stałą szerokość także w przesunięciu.
  function lines(sc, r, P) {
    var pts = r.pts.map(function (id) { return P[id]; }), n = pts.length, s = [0];
    for (var i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    var Ltot = s[n - 1] || 1, L = r.lanes, w = r.w, o0 = r.o0 || 0, o1 = r.o1 || 0;
    var E0 = endSection(sc, r, true, P), E1 = endSection(sc, r, false, P), e0 = E0.f, e1 = E1.f;
    function hold(f, u, o) { var m = 0; for (var j = 0; j <= L; j++) { var d = (L / 2 - j - o) * w, v = f(d); m = Math.max(m, Math.abs((v[0] * u[0] + v[1] * u[1]) * d)); } return m + 1; }
    var H0 = o0 ? hold(e0, unit(pts[0], pts[1]), o0) : 0, H1 = o1 ? hold(e1, unit(pts[n - 1], pts[n - 2]), o1) : 0;
    var nk = (o0 ? 1 : 0) + (o1 ? 1 : 0), T = nk ? Math.max(0, Math.min(PRZEJ, (Ltot - H0 - H1) / nk)) : 0;
    function off(x) {
      var v = 0;
      if (o0) v += x <= H0 ? o0 : x >= H0 + T ? 0 : o0 * (1 - (x - H0) / T);
      if (o1) { var y = Ltot - x; v += y <= H1 ? o1 : y >= H1 + T ? 0 : o1 * (1 - (y - H1) / T); }
      return v;
    }
    var ks = [];
    if (o0) ks.push(H0, H0 + T); if (o1) ks.push(Ltot - H1 - T, Ltot - H1);
    ks = ks.filter(function (c) { return c > 0.01 && c < Ltot - 0.01 && s.every(function (v) { return Math.abs(v - c) > 0.01; }); })
      .sort(function (x, y) { return x - y; }).filter(function (c, i, a) { return !i || c - a[i - 1] > 0.01; });
    // punkty OSM + punkty załamania offsetu; QS = przekrój w danym punkcie
    var Q = [], QS = [], Qs = [], k = 0;
    for (i = 0; i < n; i++) {
      for (; k < ks.length && ks[k] < s[i]; k++) if (i > 0) {
        var t = (ks[k] - s[i - 1]) / (s[i] - s[i - 1]), p0 = pts[i - 1], p1 = pts[i];
        Q.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]); QS.push(konst(left(unit(p0, p1)))); Qs.push(ks[k]); }
      Q.push(pts[i]); Qs.push(s[i]);
      QS.push(i === 0 ? e0 : i === n - 1 ? e1 : konst(miter(unit(pts[i - 1], pts[i]), unit(pts[i], pts[i + 1]))));
    }
    var m = Q.length, dc = Qs.map(function (x) { return -off(x) * w; }); // przesunięcie osi jezdni [m, + w lewo]
    var A = Q.map(function (p, i) { var v = QS[i](dc[i]); return [p[0] + v[0] * dc[i], p[1] + v[1] * dc[i]]; });
    var lanes = [];
    for (var j = 0; j <= L; j++) {
      var rj = (L / 2 - j) * w;
      lanes.push(Q.map(function (p, i) {
        if (i === 0 || i === m - 1) { var d = rj + dc[i], v = QS[i](d); return [p[0] + v[0] * d, p[1] + v[1] * d]; } // styk/koniec
        var M = miter(unit(A[i - 1], A[i]), unit(A[i], A[i + 1]));
        return [A[i][0] + M[0] * rj, A[i][1] + M[1] * rj];
      }));
    }
    return { lanes: lanes, asfalt: [lanes[0], lanes[L]], zamkn: [!E0.pien, !E1.pien] }; // bez poboczy
  }
  return { toXY: toXY, toLL: toLL, lines: lines, nodeType: nodeType };
})();
