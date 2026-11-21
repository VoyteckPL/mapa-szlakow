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
      // kolejność od lewej po KĄCIE (atan2), nie po sinusie – odnoga > 90° w tę samą stronę co prosta nie przeskakuje
      // na drugą stronę (wzorzec 19:22: R2 90° w prawo, R3 107,5° w prawo)
      var lat = tDir[0] * v[1] - tDir[1] * v[0], al = dot(v, tDir) * (tIn ? 1 : -1);
      return { B: B, lat: lat, al: al, ang: Math.atan2(lat, al) }; }).sort(function (a, b) { return b.ang - a.ang; });
    // offset pnia przy węźle – automatyczny (Wojtek 2026-11-21 16:48, 3-2+1 → +0,5): pasy pnia prowadzące do odnogi
    // „na wprost” (najmniejszy kąt z pniem) mają środek na osi pnia, czyli prosta jedzie dalej bez przesunięcia.
    var st = ord.reduce(function (b, o) { return o.al > b.al ? o : b; }), a0 = 0;
    for (var ii = 0; ord[ii] !== st; ii++) a0 += ord[ii].B.lanes;
    var oT = T.lanes / 2 - a0 - st.B.lanes / 2, cur = (T.lanes / 2 - oT) * T.w;
    // turn:lanes pnia (geom/turn.js): zakresy pasów pnia dla odnóg z tagu; prosta – środek swoich pasów na osi pnia
    var tr = tIn ? G.u.turnRegions(T, ord, st) : null;
    if (tr) { var rs = tr[ord.indexOf(st)]; oT = T.lanes / 2 - rs.a - rs.k / 2; }
    var cand = ord.map(function (o, oi) {
      var B = o.B, hi = cur, lo = cur - B.lanes * B.w, c = (hi + lo) / 2; cur = lo;
      if (tr) { c = (T.lanes / 2 - oT - tr[oi].a - tr[oi].k / 2) * T.w; hi = c + B.lanes * B.w / 2; lo = c - B.lanes * B.w / 2; }
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
      // Odnoga ostra (wzorce 18:55, 3-2+1, 45–90°): odnoga na SWOJEJ osi (offset 0), prosto do pnia. Każda krawędź odnogi
      // (d) kończy się na przecięciu z odpowiadającą jej krawędzią pasów pnia (D = d + c) – narożnik. Narożnik za przekrojem
      // pnia w węźle: krawędź pnia kończy się na przekroju (N + nT·D), krawędź odnogi biegnie od tego punktu wzdłuż
      // krawędzi pnia do narożnika (klin należy do odnogi). Narożnik przed przekrojem: obie krawędzie kończą się w nim.
      // Gdy któryś narożnik nie leży na 1. odcinku odnogi (mały kąt / krótki odcinek) – dotychczasowa reguła.
      var nw = null;
      if (o !== st && !ob) (function () {
        // odnoga przyklejona do prostej (wzorce 19:17): 1. węzeł odnogi bliżej osi prostej niż (kB+kS)·w/2 → odnoga
        // (po odsunięciu) biegnie równolegle do prostej, oś w tej odległości – krawędzie liczone od tej osi
        var uS0 = tIn ? dirOut(st.B, P) : dirIn(st.B, P), nS0 = left(uS0), Pn = P[tIn ? B.pts[1] : B.pts[B.pts.length - 2]],
          Dg = (B.lanes * B.w + st.B.lanes * st.B.w) / 2, ps = dot(nS0, [Pn[0] - N[0], Pn[1] - N[1]]), O0 = N, uE = uB;
        if (Math.abs(ps) < Dg + 1e-3) { O0 = add(N, nS0, ps < 0 ? -Dg : Dg); uE = uS0; }
        var nB = left(uE), dt = uE[0] * -tDir[1] - uE[1] * -tDir[0]; if (Math.abs(dt) < 1e-6) return;
        function kor(d) { var D = d + c, Q0 = add(O0, nB, d), Q1 = add(N, nT, D), rx = Q1[0] - Q0[0], ry = Q1[1] - Q0[1], t = (rx * -tDir[1] - ry * -tDir[0]) / dt;
          return { t: t, p: add(Q0, uE, t), K: Q1 }; }
        var hw = B.lanes * B.w / 2, ok = [hw, -hw].every(function (d) { var t = kor(d).t * sg; return t >= -1e-6 && t <= seg; });
        if (!ok) return;
        var wn = function (q) { return sg * dot([q.p[0] - N[0], q.p[1] - N[1]], tDir) > 1e-6; }; // narożnik za przekrojem pnia
        nw = { odn: function (d) { return kor(d).p; },
          pien: function (D) { var q = kor(D - c); return wn(q) ? q.K : q.p; },
          extra: [] };
        for (var j = 0; j <= B.lanes; j++) { var q = kor((B.lanes / 2 - j) * B.w); if (wn(q)) nw.extra.push({ d: (B.lanes / 2 - j) * B.w, K: q.K }); }
      })();
      return { B: B, S: S, lo: lo - 1e-6, hi: hi + 1e-6, lo0: lo, hi0: hi, c: c, X: X, cB: cB, ob: ob, nw: nw };
    });
    // Krawędź pasa pnia przy odnodze nie wjeżdża na jezdnię sąsiada od strony prostej (wzorzec 18:31: pień wchodzi pod kątem
    // 16,7°, prosta ma ukos, granica pasów 2|3 przedłużona do narożnika odnogi wchodziła na R2). Gdy wewn. narożnik styku
    // odnogi leży na jezdni sąsiada (za jego zewn. krawędzią) – przeniesiony na narożnik sąsiada, zewn. narożnik bez zmian;
    // styk = odcinek między nimi. Płynnie: głębokość 0 → bez zmian, ≥ 0,1 m → cały. Pień w linii z prostą – bez zmian.
    function ptT(k, d) { return k.nw ? k.nw.pien(d) : k.f ? k.f(d) : add(k.X, k.S, d - k.c + k.cB); }
    var si = ord.indexOf(st), uSt = tIn ? dirOut(st.B, P) : dirIn(st.B, P);
    [1, -1].forEach(function (dir) { for (var i = si + dir; i >= 0 && i < cand.length; i += dir) {
      var k = cand[i], nb = cand[i - dir]; if (k.ob || nb.ob) break;
      var db = dir > 0 ? k.hi0 : k.lo0, de = dir > 0 ? k.lo0 : k.hi0, A = ptT(nb, db), Cs = ptT(nb, nb.c);
      var cr = function (v) { return uSt[0] * v[1] - uSt[1] * v[0]; }, sd = cr([Cs[0] - A[0], Cs[1] - A[1]]) < 0 ? -1 : 1;
      if (k.nw) { // odnoga ostra: narożnik nie może leżeć na jezdni sąsiada (pień pod kątem, wzorzec 18:31) – wtedy reguła dawna
        var Q = k.nw.odn(db - k.c); if (sd * cr([Q[0] - A[0], Q[1] - A[1]]) <= 1e-3) continue; k.nw = null; }
      var A0 = ptT(k, db);
      var g = sd * cr([A0[0] - A[0], A0[1] - A[1]]), zm = false;
      var t = Math.max(0, Math.min(1, g / 0.1)), Ai = [A0[0] + (A[0] - A0[0]) * t, A0[1] + (A[1] - A0[1]) * t];
      // zewn. narożnik (wzorce 19:17): gdy 1. węzeł odnogi leży bliżej prostej niż (kB+kS)·w/2 (odnoga odsunięta, biegnie
      // równolegle do prostej), narożnik = przecięcie zewn. krawędzi pasów pnia z linią równoległą do zewn. krawędzi
      // prostej w odległości szer. odnogi; inaczej bez zmian (wzorzec turn 2).
      var Bo = ptT(k, de), Bk = k.B, Pn = P[tIn ? Bk.pts[1] : Bk.pts[Bk.pts.length - 2]], nS = left(uSt);
      if (dot(nS, [Cs[0] - A[0], Cs[1] - A[1]]) > 0) nS = [-nS[0], -nS[1]];
      if (Math.abs(dot(nS, [Pn[0] - N[0], Pn[1] - N[1]])) < (Bk.lanes * Bk.w + st.B.lanes * st.B.w) / 2 + 1e-3) {
        var E0p = add(N, nT, de), Lp = add(A, nS, Bk.lanes * Bk.w), D2 = tDir[0] * uSt[1] - tDir[1] * uSt[0];
        if (Math.abs(D2) > 1e-6) { var s2 = ((Lp[0] - E0p[0]) * uSt[1] - (Lp[1] - E0p[1]) * uSt[0]) / D2, Bg = add(E0p, tDir, s2);
          zm = Math.hypot(Bg[0] - Bo[0], Bg[1] - Bo[1]) > 1e-6; Bo = Bg; } }
      else if (t > 0) { // wewn. narożnik przeniesiony: zewn. tak, żeby pas odnogi miał pełną szerokość (wzorzec 19:29) – krawędź
        // wewn. od Ai do punktu wewn. krawędzi przy 1. węźle odnogi, zewn. równolegle w odległości szer. odnogi. Tylko gdy dawny
        // narożnik zwęża pas: szer. < 0,6·W → cały, > 0,8·W → bez zmian (wzorzec turn 2: 0,85·W), płynnie (wzorce 19:29, 19:30)
        var uBk = tIn ? dirOut(Bk, P) : dirIn(Bk, P), nIn = left(uBk); if (dot(nIn, [Cs[0] - A[0], Cs[1] - A[1]]) < 0) nIn = [-nIn[0], -nIn[1]];
        var Fin = add(Pn, nIn, Bk.lanes * Bk.w / 2), uI = unit(Ai, Fin), nO = left(uI); if (dot(nO, [Cs[0] - A[0], Cs[1] - A[1]]) > 0) nO = [-nO[0], -nO[1]];
        var Wb = Bk.lanes * Bk.w, wO = dot(nO, [Bo[0] - Ai[0], Bo[1] - Ai[1]]), tw = t * Math.max(0, Math.min(1, (0.8 * Wb - wO) / (0.2 * Wb)));
        var E1p = add(N, nT, de), Lq = add(Ai, nO, Bk.lanes * Bk.w), D3 = tDir[0] * uI[1] - tDir[1] * uI[0];
        if (tw > 0 && Math.abs(D3) > 1e-6) { var s3 = ((Lq[0] - E1p[0]) * uI[1] - (Lq[1] - E1p[1]) * uI[0]) / D3, Bw = add(E1p, tDir, s3);
          Bo = [Bo[0] + (Bw[0] - Bo[0]) * tw, Bo[1] + (Bw[1] - Bo[1]) * tw]; } }
      if (!zm && t <= 0) continue;
      k.f = (function (d0, d1, A, B) { return function (d) { var t = (d - d0) / (d1 - d0); return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]; }; })(db, de, Ai, Bo);
    } });
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
      if (me.nw) return { pt: me.nw.odn, typ: typ, oAuto: 0, tMin: tMin, odsun: odsun, extra: me.nw.extra };
      return { pt: me.f ? function (d) { return me.f(d + me.c - me.cB); } : function (d) { return add(me.X, me.S, d); }, typ: typ, oAuto: -me.cB / r.w, tMin: tMin, odsun: odsun }; }
    return { typ: typ, pien: true, oAuto: oT, pt: function (d, h, bezOb) { // koniec pnia: zamknięcie rysują odnogi
      var best = null, bv = Infinity; // h = środek pasa: krawędź pasa kończy się na styku TEJ odnogi, do której pas prowadzi
      cand.forEach(function (k) { if (d < k.lo || d > k.hi || (h != null && (h < k.lo || h > k.hi))) return; var p = k.ob ? (bezOb ? k.ob.hold(d) : k.ob.pien(d)) : ptT(k, d), v = dot([p[0] - N[0], p[1] - N[1]], uIn);
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
