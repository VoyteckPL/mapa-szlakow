// Sandbox v1 – geometria: krawędzie pasów drogi (lines) – offset osi, przejścia, odsunięcia, zakręt, pasy z własnymi krawędziami.
(function () {
  var clearP = G.u.clearP, odsunPtE = G.u.odsunPtE, endSection = G.u.endSection, PRZEJ = G.u.PRZEJ, unit = G.u.unit, left = G.u.left, miter = G.u.miter, konst = G.u.konst, add = G.u.add, dot = G.u.dot;

  // Linie drogi: lanes+1 granic pasów (od lewej) i 2 krawędzie asfaltu (lewa, prawa), polilinie XY.
  // Offset przy końcu: stały na odcinku H (do końca skośnego styku + 1 m), potem PROSTO na środek na PRZEJ m
  // (kanciasto, bez łuków). Krawędzie = równoległe do osi jezdni (oś OSM przesunięta o offset) z miterami,
  // więc pas ma stałą szerokość także w przesunięciu.
  function lines(sc, r, P) {
    P = clearP(sc, P);
    var E0 = endSection(sc, r, true, P), E1 = endSection(sc, r, false, P);
    // model 2 (przekroj.js): odnoga zaczyna się na przekroju pnia – oś od środka jej pasów, odcinek prosty, potem dalej
    var pts = r.pts.map(function (id) { return P[id]; });
    if (E0.pre) pts = E0.pre.concat(pts.slice(1 + Math.min(E0.skip || 0, pts.length - 2))); if (E1.pre) pts = pts.slice(0, pts.length - 1 - Math.min(E1.skip || 0, pts.length - 2)).concat(E1.pre);
    var n = pts.length, s = [0];
    for (var i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    var Ltot = s[n - 1] || 1, L = r.lanes, w = r.w;
    var o0 = E0.oAuto != null ? E0.oAuto : r.o0 || 0, o1 = E1.oAuto != null ? E1.oAuto : r.o1 || 0;
    // jezdnia 3-pasowa na sztywno na całej długości (Wojtek 19:55/19:57): oś OSM między lewym a środkowym pasem (+0,5) na obu
    // końcach (wolny koniec, ciąg, pień); wyjątek – koniec będący odnogą rozwidlenia (offset z przydziału pasów pnia)
    if (L === 3) { if (!(E0.oAuto != null && !E0.pien)) o0 = 0.5; if (!(E1.oAuto != null && !E1.pien)) o1 = 0.5; }
    // ciąg z jezdnią 3-pasową: lewe krawędzie w linii (pasy dodatkowe / kończące się po prawej) → offset (L − 2) / 2
    else { var o3 = function (E, id) { if (E.typ !== 'ciag') return null;
        var x = sc.roads.filter(function (q) { return q !== r && q.pts.length > 1 && (q.pts[0] === id || q.pts[q.pts.length - 1] === id); })[0];
        return x && x.lanes === 3 ? (L - 2) / 2 : null; };
      var a3 = o3(E0, r.pts[0]), b3 = o3(E1, r.pts[r.pts.length - 1]); if (a3 != null) o0 = a3; if (b3 != null) o1 = b3; }
    function hold(E, p0, u, o) { var m = 0; for (var j = 0; j <= L; j++) { var q = E.pt((L / 2 - j - o) * w, null, true); m = Math.max(m, Math.abs(dot([q[0] - p0[0], q[1] - p0[1]], u))); } return m + 1; }
    // odnoga przy Nm (automatyczny offset, nie pień): bez odcinka stałego – od styku od razu prosto na środek
    // (wzorce 2026-11-21 16:57: Wojtek usuwał wierzchołek „styk + 1 m”). Pień i ręczne offsety: jak dotąd.
    var br0 = E0.oAuto != null && !E0.pien, br1 = E1.oAuto != null && !E1.pien;
    var H0 = o0 && !br0 ? hold(E0, pts[0], unit(pts[0], pts[1]), o0) : o0 ? E0.hN || 0 : 0, H1 = o1 && !br1 ? hold(E1, pts[n - 1], unit(pts[n - 1], pts[n - 2]), o1) : o1 ? E1.hN || 0 : 0; // odnoga: do narożnika sąsiada (hN)
    var nk = (o0 ? 1 : 0) + (o1 ? 1 : 0), T = nk ? Math.max(0, Math.min(PRZEJ, (Ltot - H0 - H1) / nk)) : 0;
    if (nk) T = Math.max(T, Math.min((Ltot - H0 - H1) / nk, Math.max(E0.tMin || 0, E1.tMin || 0))); // odnoga: nie wjeżdża na prostą
    // odnoga przy Nm: przejście na oś przez CAŁY pierwszy odcinek OSM – jeden prosty pas bez wierzchołków po drodze (Wojtek 17:04)
    if (nk === 1 && br0) T = Math.max(T, s[1]); if (nk === 1 && br1) T = Math.max(T, Ltot - s[n - 2]);
    // …a gdy 1. węzeł odnogi trzyma już odstęp od drogi na wprost (np. po odsunięciu, wzorce 17:57/18:03) – dokładnie do niego
    function wolny(E, q) { return E.odsun && E.odsun.ref.length > 1 && odsunPtE(E.odsun, q) === q; }
    if (nk === 1 && br0 && n > 2 && wolny(E0, pts[1])) T = s[1]; if (nk === 1 && br1 && n > 2 && wolny(E1, pts[n - 2])) T = Ltot - s[n - 2];
    if (nk && (Ltot - H0 - H1) / nk - T < 5) T = (Ltot - H0 - H1) / nk; // reszta < 5 m: przejście do końca (bez krótkiego załamania)
    // oba końce z tym samym offsetem (np. 3 pasy między 2-pasówką a rozwidleniem 3-2+1, oba +0,5 – wzorzec 18:23):
    // oś stała na całej drodze, bez powrotu na środek po drodze
    var stale = o0 && o1 && Math.abs(o0 - o1) < 1e-6;
    function off(x) {
      if (stale) return o0;
      var v = 0;
      if (o0) v += x <= H0 ? o0 : x >= H0 + T ? 0 : o0 * (1 - (x - H0) / T);
      if (o1) { var y = Ltot - x; v += y <= H1 ? o1 : y >= H1 + T ? 0 : o1 * (1 - (y - H1) / T); }
      return v;
    }
    var ks = [];
    if (o0 && !stale) ks.push(H0, H0 + T); if (o1 && !stale) ks.push(Ltot - H1 - T, Ltot - H1);
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
    // odsunięcie od drogi na wprost (zob. endSection.odsun): WSZYSTKIE punkty osi odnogi leżące wzdłuż pierwszego odcinka tej
    // drogi – CAŁA łamana tej drogi (wzorzec 17:57 i 17:59: odnoga nigdzie nie nachodzi na R2 ani na pień)
    // + pień jako przeszkoda dla odnogi > 90° (odsun2)
    [[E0, 0, 'odsun'], [E1, 1, 'odsun'], [E0, 0, 'odsun2'], [E1, 1, 'odsun2']].forEach(function (z) { var o = z[0][z[2]], Eo = z[1] ? E0 : E1; if (!o || o.ref.length < 2) return;
      for (var q = z[0].pre ? z[0].pre.length : 1; q < m; q++) { var ii = z[1] ? m - 1 - q : q; // punkty styku (pre) – bez odsuwania
        if ((ii === 0 || ii === m - 1) && Eo.typ !== 'koniec') break; // drugi koniec w węźle – styk ustala węzeł
        A[ii] = odsunPtE(o, A[ii]); } });
    // zakręt odnogi > 100° (wzorzec 137,7°): od styku w kierunku wyjścia e, aż oś jest ½ szer. odnogi za zewn. krawędzią pnia
    [[E0, 0], [E1, 1]].forEach(function (z) { var Z = z[0].zakret; if (!Z) return;
      var i0 = z[1] ? m - 1 : 0, Cj = A[i0], e = Z.e, de = dot(e, Z.n), sz = (Z.D - dot([Cj[0] - Z.C[0], Cj[1] - Z.C[1]], Z.n)) / (de || 1);
      if (de < 1e-3 || sz < 0.01) return;
      var Kp = add(Cj, e, sz), at = z[1] ? m - 1 : 1;
      A.splice(at, 0, Kp); Q.splice(at, 0, Kp); QS.splice(at, 0, null); Qs.splice(at, 0, z[1] ? Qs[m - 1] - 1e-3 : Qs[0] + 1e-3); dc.splice(at, 0, 0); m++;
    });
    // wolny koniec: przekrój prostopadły do FAKTYCZNEJ osi jezdni (także gdy oś jest skośna przez offset) – Wojtek 17:04
    function endPt(i, d, h) {
      var E = i ? E1 : E0; if (E.typ !== 'koniec') return E.pt(d, h);
      var u = i ? unit(A[m - 2], A[m - 1]) : unit(A[0], A[1]); return add(A[i], left(u), d - dc[i]);
    }
    var lanes = [];
    for (var j = 0; j <= L; j++) {
      var rj = (L / 2 - j) * w;
      lanes.push(Q.map(function (p, i) {
        if (i === 0 || i === m - 1) return endPt(i, rj + dc[i]); // styk/koniec
        var M = miter(unit(A[i - 1], A[i]), unit(A[i], A[i + 1]));
        return [A[i][0] + M[0] * rj, A[i][1] + M[1] * rj];
      }));
    }
    // pasy: każdy pas ma własną lewą i prawą krawędź (Wojtek 2026-11-21 16:11) – na rozwidleniu granica między pasami
    // różnych odnóg kończy się dla każdego pasa na styku jego odnogi (pas do prostej – w węźle, pas do odnogi – na jej skosie).
    var pasy = [];
    for (j = 0; j < L; j++) [0, 1].forEach(function (b) {
      var l = lanes[j + b].map(function (q) { return q.slice(); }), h = (L / 2 - j - 0.5) * w, rj = (L / 2 - j - b) * w;
      l[0] = endPt(0, rj + dc[0], h + dc[0]); l[m - 1] = endPt(m - 1, rj + dc[m - 1], h + dc[m - 1]);
      // koniec krawędzi cofnięty (ukos odnogi > 90° przed węzłem): wierzchołki za nim dociągnięte do niego (wzorzec 93°)
      for (var i = m - 2; i > 0 && dot([l[i][0] - l[m - 1][0], l[i][1] - l[m - 1][1]], unit(Q[m - 2], Q[m - 1])) > 1e-6; i--) l[i] = l[m - 1].slice();
      for (i = 1; i < m - 1 && dot([l[i][0] - l[0][0], l[i][1] - l[0][1]], unit(Q[1], Q[0])) > 1e-6; i++) l[i] = l[0].slice();
      [].concat(E0.extra || []).forEach(function (x) { if (Math.abs(rj + dc[0] - x.d) < 1e-6) l.unshift(x.K.slice()); }); // klin odnogi
      [].concat(E1.extra || []).forEach(function (x) { if (Math.abs(rj + dc[m - 1] - x.d) < 1e-6) l.push(x.K.slice()); });
      l = l.filter(function (q, i) { return !i || Math.hypot(q[0] - l[i - 1][0], q[1] - l[i - 1][1]) > 1e-3; }); // bez zdublowanych
      // bez wierzchołków na prostej (< 1 cm od odcinka sąsiadów) – Wojtek usuwa je ręcznie we wzorcach (18:55)
      for (var c2 = 1; c2 < l.length - 1; c2++) { var a = l[c2 - 1], b = l[c2 + 1], q = l[c2], ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (ab > 1e-6 && Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / ab < 0.01 && dot([q[0] - a[0], q[1] - a[1]], [q[0] - b[0], q[1] - b[1]]) < 0) l.splice(c2--, 1); }
      pasy.push(l);
    });
    return { lanes: lanes, pasy: pasy, asfalt: [lanes[0], lanes[L]], zamkn: [!E0.pien, !E1.pien] }; // bez poboczy
  }
  G.lines = lines;
})();
