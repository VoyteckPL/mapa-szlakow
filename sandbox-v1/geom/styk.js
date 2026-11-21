// Sandbox v1 – geometria: styk drogi w węźle (endSection) i typ węzła.
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
//  Offset pnia przy rozwidleniu/włączeniu jest automatyczny: pasy do odnogi na wprost mają środek na osi pnia.
//  Wolny koniec: przekrój prostopadły.
(function () {
  var unit = G.u.unit, left = G.u.left, miter = G.u.miter, dirIn = G.u.dirIn, dirOut = G.u.dirOut, add = G.u.add, dot = G.u.dot;
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
    var ord = Bs.map(function (B) { var q = P[tIn ? B.pts[1] : B.pts[B.pts.length - 2]], v = unit(N, q);
      return { B: B, lat: tDir[0] * v[1] - tDir[1] * v[0], al: dot(v, tDir) * (tIn ? 1 : -1) }; }).sort(function (a, b) { return b.lat - a.lat; });
    // offset pnia przy węźle – automatyczny (Wojtek 2026-11-21 16:48, 3-2+1 → +0,5): pasy pnia prowadzące do odnogi
    // „na wprost” (najmniejszy kąt z pniem) mają środek na osi pnia, czyli prosta jedzie dalej bez przesunięcia.
    var st = ord.reduce(function (b, o) { return o.al > b.al ? o : b; }), a0 = 0;
    for (var ii = 0; ord[ii] !== st; ii++) a0 += ord[ii].B.lanes;
    var oT = T.lanes / 2 - a0 - st.B.lanes / 2, cur = (T.lanes / 2 - oT) * T.w;
    var cand = ord.map(function (o) {
      var B = o.B, hi = cur, lo = cur - B.lanes * B.w, c = (hi + lo) / 2; cur = lo;
      var uB = tIn ? dirOut(B, P) : dirIn(B, P), det = tDir[0] * uB[1] - tDir[1] * uB[0];
      var seg = tIn ? Math.hypot(P[B.pts[1]][0] - N[0], P[B.pts[1]][1] - N[1]) : Math.hypot(P[B.pts[B.pts.length - 2]][0] - N[0], P[B.pts[B.pts.length - 2]][1] - N[1]);
      // Dwa warianty styku: (m) ukos – środek pasów pnia przecina linię odnogi w X, dwusieczna pień–odnoga, narożnik
      // wewnętrzny nie wychodzi za przekrój pnia w węźle (16:31, wzorce 15–90°); (p) przekrój prostopadły do pnia w węźle
      // (odnoga < 15° albo za krótka, żeby przecięcie się zmieściło – wzorce 12°, 30°/11 m, 72°/5 m).
      // Przejście PŁYNNE (Wojtek 17:13, skok między 27° a 26°): k = zapas od przecięcia do końca odcinka odnogi,
      // 1 m → 0 (p), 5 m → 1 (m); pomiędzy liniowo środek i kierunek styku.
      var sg = tIn ? 1 : -1, k = 0, Xm, Sm, cBm = 0;
      if (Math.abs(det) > 0.05) { var sB = c / det, t = c * dot(uB, tDir) / det;
        var ok = tIn ? (sB >= 0 && t >= -1e-6) : (sB <= 0 && t <= 1e-6);
        if (ok) k = Math.max(0, Math.min(1, (seg - Math.abs(sB) - 1) / 4)); }
      function onB(C, S) { // punkt C zapisany jako X (na linii odnogi) + S·cB
        var D = uB[0] * S[1] - uB[1] * S[0], rx = C[0] - N[0], ry = C[1] - N[1];
        if (Math.abs(D) < 1e-6) return { X: N, cB: dot([rx, ry], S) / dot(S, S) };
        return { X: add(N, uB, (rx * S[1] - ry * S[0]) / D), cB: (uB[0] * ry - uB[1] * rx) / D };
      }
      if (k > 0) { Xm = add(N, uB, sB); Sm = Sof(B); var e = Infinity;
        [lo, hi].forEach(function (d) { var q = add(Xm, Sm, d - c); e = Math.min(e, sg * dot([q[0] - N[0], q[1] - N[1]], tDir)); });
        if (e > 1e-6) { var o = onB(add(Xm, tDir, -sg * e), Sm); Xm = o.X; cBm = o.cB; } }
      var Cp = add(N, nT, c), S = nT, X = N, cB = c;
      if (k >= 1) { S = Sm; X = Xm; cB = cBm; }
      else if (k > 0) { var Cm = add(Xm, Sm, cBm), C = [Cp[0] + (Cm[0] - Cp[0]) * k, Cp[1] + (Cm[1] - Cp[1]) * k];
        S = [nT[0] + (Sm[0] - nT[0]) * k, nT[1] + (Sm[1] - nT[1]) * k]; var o2 = onB(C, S); X = o2.X; cB = o2.cB; }
      var ob = o === st ? null : G.u.rozw({ tIn: tIn, tDir: tDir, nT: nT, N: N, P: P, st: st, ord: ord, T: T, dalej: dalej }, o, B, lo, hi, c, uB);
      return { B: B, S: S, lo: lo - 1e-6, hi: hi + 1e-6, c: c, X: X, cB: cB, ob: ob };
    });
    // punkty OSM drogi X za węzłem N (w kierunku od węzła); odp = X zaczyna się w N
    function dalej(X, odp) { var q = X.pts.map(function (id) { return P[id]; }); if (!odp) q.reverse(); return q.slice(1); }
    if (r !== T) { var me = cand.filter(function (k) { return k.B === r; })[0];
      // Odnoga nie może wjechać na drogę na wprost (wzorzec 19, Wojtek 17:00): powrót na własną oś trwa co najmniej tyle,
      // aż linie OSM rozejdą się na pół szerokości obu jezdni: tMin = (kB + kS)·w/2 / sin(kąt między nimi).
      var tMin = 0, uS = tIn ? dirOut(st.B, P) : dirIn(st.B, P), uR = tIn ? dirOut(r, P) : dirIn(r, P), sn = Math.abs(uS[0] * uR[1] - uS[1] * uR[0]);
      if (st.B !== r) tMin = sn > 1e-3 ? (r.lanes * r.w + st.B.lanes * st.B.w) / 2 / sn : Infinity;
      // Odnoga nie wchodzi na sąsiednią jezdnię (wzorce 17:19, n6 blisko R2): oś odnogi trzyma się co najmniej
      // (kB + kS)·w/2 od osi drogi na wprost – gdy punkt OSM leży bliżej, oś odsuwa się prostopadle do tej drogi.
      var sc0 = cand.filter(function (k) { return k.B === st.B; })[0], Cs = add(sc0.X, sc0.S, sc0.cB), Cm = add(me.X, me.S, me.cB);
      var nS = left(uS), sd = dot([Cm[0] - Cs[0], Cm[1] - Cs[1]], nS) < 0 ? -1 : 1;
      var odsun = st.B === r ? null : { ref: [Cs].concat(dalej(st.B, tIn)), D: (r.lanes * r.w + st.B.lanes * st.B.w) / 2, side: [Cm[0] - Cs[0], Cm[1] - Cs[1]] };
      if (me.ob) return { pt: me.ob.odn, typ: typ, oAuto: -me.ob.cB / r.w, tMin: tMin, odsun: odsun, odsun2: me.ob.pienOdsun, zakret: me.ob.zakret,
        extra: me.ob.K ? { d: me.ob.dK, K: me.ob.K } : null };
      return { pt: function (d) { return add(me.X, me.S, d); }, typ: typ, oAuto: -me.cB / r.w, tMin: tMin, odsun: odsun }; }
    return { typ: typ, pien: true, oAuto: oT, pt: function (d, h, bezOb) { // koniec pnia: zamknięcie rysują odnogi
      var best = null, bv = Infinity; // h = środek pasa: krawędź pasa kończy się na styku TEJ odnogi, do której pas prowadzi
      cand.forEach(function (k) { if (d < k.lo || d > k.hi || (h != null && (h < k.lo || h > k.hi))) return; var p = k.ob ? (bezOb ? k.ob.hold(d) : k.ob.pien(d)) : add(k.X, k.S, d - k.c + k.cB), v = dot([p[0] - N[0], p[1] - N[1]], uIn);
        if (v < bv) { bv = v; best = p; } });
      return best || add(N, nT, d);
    } };
  }
  function nodeType(sc, id, P) {
    var r = sc.roads.filter(function (x) { return x.pts.length > 1 && (x.pts[0] === id || x.pts[x.pts.length - 1] === id); })[0];
    return r ? endSection(sc, r, r.pts[0] === id, P).typ : 'punkt';
  }
  G.endInfo = endSection; G.u.endSection = endSection; G.nodeType = nodeType;
})();
