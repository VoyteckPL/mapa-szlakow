// Sandbox v1 – geometria w lokalnym układzie [m]. Bez łuków: wszystko kanciaste.
// Droga: pts (id węzłów, kierunek jak w OSM), lanes, w (szer. pasa) – bez poboczy,
// o0/o1 – offset jezdni przy początku/końcu względem linii OSM, w pasach (+ = w prawo). Reguła (Wojtek 2026-11-21):
// offset stały tuż przy końcu (aż za skośny styk), potem prosto na środek na krótkim odcinku PRZEJ; stała szerokość, bez łuków.
// Reguła styku w węźle (Nm): każda droga zachowuje szerokość pasa W POPRZEK siebie, bez łuków.
//  Ciąg (1 wchodzi + 1 wychodzi): przekrój po dwusiecznej w węźle, offsety jak ustawione.
//  Rozwidlenie / włączenie (pień + kilka odnóg): pasy pnia dzielone między odnogi po kolei od lewej
//  (odnogi posortowane od lewej). Odnoga ma środek pasa na swojej linii OSM, a skośny styk (dwusieczna pień–odnoga)
//  leży tam, gdzie środek przydzielonych jej pasów pnia przecina linię odnogi – pasy pnia biegną prosto do tego styku
//  (Wojtek 2026-11-21 15:18). Gdy przecięcia brak (odnoga prawie równoległa) – styk w węźle, odnoga dostaje
//  automatyczny offset równy położeniu swoich pasów w pniu i wraca na środek regułą offsetu.
//  Wolny koniec: przekrój prostopadły.
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
  function add(p, v, k) { return [p[0] + v[0] * k, p[1] + v[1] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  // koniec drogi r: pt(d) -> punkt krawędzi o położeniu poprzecznym d [m, + w lewo]; typ węzła; oAuto – wymuszony offset
  function endSection(sc, r, atStart, P) {
    var id = atStart ? r.pts[0] : r.pts[r.pts.length - 1], N = P[id];
    var ins = [], outs = [];
    sc.roads.forEach(function (x) {
      if (x.pts.length < 2) return;
      if (x.pts[x.pts.length - 1] === id) ins.push(x);
      if (x.pts[0] === id) outs.push(x);
    });
    var own = atStart ? dirOut(r, P) : dirIn(r, P), T, Bs, tIn;
    var prosto = function (S) { return function (d) { return add(N, S, d); }; };
    if (ins.length === 1 && outs.length >= 1) { T = ins[0]; Bs = outs; tIn = true; }
    else if (outs.length === 1 && ins.length > 1) { T = outs[0]; Bs = ins; tIn = false; }
    else return { pt: prosto(left(own)), typ: ins.length + outs.length > 1 ? 'inny' : 'koniec' };
    var Sof = function (B) { return tIn ? miter(dirIn(T, P), dirOut(B, P)) : miter(dirIn(B, P), dirOut(T, P)); };
    if (Bs.length === 1) return { pt: prosto(Sof(Bs[0])), typ: 'ciag' };
    var typ = tIn ? 'rozwidlenie' : 'wlaczenie';
    var tDir = tIn ? dirIn(T, P) : dirOut(T, P), nT = left(tDir), uIn = tIn ? [-tDir[0], -tDir[1]] : tDir;
    var oT = (tIn ? T.o1 : T.o0) || 0, cur = (T.lanes / 2 - oT) * T.w;
    var ord = Bs.map(function (B) { var q = P[tIn ? B.pts[1] : B.pts[B.pts.length - 2]], v = unit(N, q);
      return { B: B, lat: tDir[0] * v[1] - tDir[1] * v[0] }; }).sort(function (a, b) { return b.lat - a.lat; });
    var cand = ord.map(function (o) {
      var B = o.B, hi = cur, lo = cur - B.lanes * B.w, c = (hi + lo) / 2; cur = lo;
      var uB = tIn ? dirOut(B, P) : dirIn(B, P), det = tDir[0] * uB[1] - tDir[1] * uB[0];
      var seg = tIn ? Math.hypot(P[B.pts[1]][0] - N[0], P[B.pts[1]][1] - N[1]) : Math.hypot(P[B.pts[B.pts.length - 2]][0] - N[0], P[B.pts[B.pts.length - 2]][1] - N[1]);
      var X = N, cB = c;
      if (Math.abs(det) > 0.26) { var sB = c / det, t = c * dot(uB, tDir) / det;
        var ok = tIn ? (sB >= 0 && t >= -1e-6) : (sB <= 0 && t <= 1e-6);
        if (ok && Math.abs(sB) < seg - 1) { X = add(N, uB, sB); cB = 0; } }
      return { B: B, S: Sof(B), lo: lo - 1e-6, hi: hi + 1e-6, c: c, X: X, cB: cB };
    });
    if (r !== T) { var me = cand.filter(function (k) { return k.B === r; })[0];
      return { pt: function (d) { return add(me.X, me.S, d); }, typ: typ, oAuto: -me.cB / r.w }; }
    return { typ: typ, pien: true, pt: function (d, h) { // koniec pnia: zamknięcie rysują odnogi
      var best = null, bv = Infinity; // h = środek pasa: krawędź pasa kończy się na styku TEJ odnogi, do której pas prowadzi
      cand.forEach(function (k) { if (d < k.lo || d > k.hi || (h != null && (h < k.lo || h > k.hi))) return; var p = add(k.X, k.S, d - k.c + k.cB), v = dot([p[0] - N[0], p[1] - N[1]], uIn);
        if (v < bv) { bv = v; best = p; } });
      return best || add(N, nT, d);
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
    var Ltot = s[n - 1] || 1, L = r.lanes, w = r.w;
    var E0 = endSection(sc, r, true, P), E1 = endSection(sc, r, false, P);
    var o0 = E0.oAuto != null ? E0.oAuto : r.o0 || 0, o1 = E1.oAuto != null ? E1.oAuto : r.o1 || 0;
    function hold(E, p0, u, o) { var m = 0; for (var j = 0; j <= L; j++) { var q = E.pt((L / 2 - j - o) * w); m = Math.max(m, Math.abs(dot([q[0] - p0[0], q[1] - p0[1]], u))); } return m + 1; }
    var H0 = o0 ? hold(E0, pts[0], unit(pts[0], pts[1]), o0) : 0, H1 = o1 ? hold(E1, pts[n - 1], unit(pts[n - 1], pts[n - 2]), o1) : 0;
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
      QS.push(i === 0 || i === n - 1 ? null : konst(miter(unit(pts[i - 1], pts[i]), unit(pts[i], pts[i + 1]))));
    }
    var m = Q.length, dc = Qs.map(function (x) { return -off(x) * w; }); // przesunięcie osi jezdni [m, + w lewo]
    var A = Q.map(function (p, i) { if (i === 0) return E0.pt(dc[i]); if (i === m - 1) return E1.pt(dc[i]); var v = QS[i](dc[i]); return add(p, v, dc[i]); });
    var lanes = [];
    for (var j = 0; j <= L; j++) {
      var rj = (L / 2 - j) * w;
      lanes.push(Q.map(function (p, i) {
        if (i === 0 || i === m - 1) return (i ? E1 : E0).pt(rj + dc[i]); // styk/koniec
        var M = miter(unit(A[i - 1], A[i]), unit(A[i], A[i + 1]));
        return [A[i][0] + M[0] * rj, A[i][1] + M[1] * rj];
      }));
    }
    // pasy: każdy pas ma własną lewą i prawą krawędź (Wojtek 2026-11-21 16:11) – na rozwidleniu granica między pasami
    // różnych odnóg kończy się dla każdego pasa na styku jego odnogi (pas do prostej – w węźle, pas do odnogi – na jej skosie).
    var pasy = [];
    for (j = 0; j < L; j++) [0, 1].forEach(function (b) {
      var l = lanes[j + b].map(function (q) { return q.slice(); }), h = (L / 2 - j - 0.5) * w, rj = (L / 2 - j - b) * w;
      l[0] = E0.pt(rj + dc[0], h + dc[0]); l[m - 1] = E1.pt(rj + dc[m - 1], h + dc[m - 1]); pasy.push(l);
    });
    return { lanes: lanes, pasy: pasy, asfalt: [lanes[0], lanes[L]], zamkn: [!E0.pien, !E1.pien] }; // bez poboczy
  }
  return { toXY: toXY, toLL: toLL, lines: lines, nodeType: nodeType, endInfo: endSection };
})();
