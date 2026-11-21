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
      var ob = o === st ? null : rozw(o, B, lo, hi, c, uB);
      return { B: B, S: S, lo: lo - 1e-6, hi: hi + 1e-6, c: c, X: X, cB: cB, ob: ob };
    });
    // Odnoga pod kątem > 90° do drogi na wprost (wzorzec 93°, Wojtek 17:32): wewnętrzna krawędź odnogi dochodzi do krawędzi
    // pasów na wprost (Xin), zewnętrzna krawędź odnogi i zewnętrzna krawędź pnia – ukos (Xout). Styk pas pnia | odnoga =
    // odcinek od narożnika pnia w węźle (K) do Xout; klin K–Xin–Xout należy do odnogi (jej zewnętrzna krawędź zaczyna się w K).
    // Kąt WYJŚCIA odnogi e (od drogi na wprost, wg kierunku środek pasów pnia → 1. węzeł odnogi θ): do 100° e = θ (klin jak
    // wzorzec 93°, tam θ = 96°), 100°–115° e wraca płynnie do 90°, dalej e = 90° (wzorzec 137,7°, 17:42): odnoga wychodzi prostopadle
    // (styk jak przy 90°), a gdy dalej wjechałaby na pień – zakręt na odległości ½ jej szerokości od zewn. krawędzi pnia.
    function rozw(o, B, lo, hi, c, uB) {
      var sg = tIn ? 1 : -1, aS = tIn ? dirOut(st.B, P) : dirIn(st.B, P), aB = [sg * uB[0], sg * uB[1]], aT = [-sg * tDir[0], -sg * tDir[1]];
      aS = [sg * aS[0], sg * aS[1]]; if (dot(aB, aS) >= 0) return null;
      var inL = ord.indexOf(st) < ord.indexOf(o), dIn = inL ? hi : lo, dOut = inL ? lo : hi;
      var K = add(N, nT, dIn), Cb = add(N, nT, c), Pn = P[tIn ? B.pts[1] : B.pts[B.pts.length - 2]], aBe = unit(Cb, Pn);
      var deg = 180 / Math.PI, th = Math.acos(Math.max(-1, Math.min(1, dot(aBe, aS)))) * deg;
      if (th <= 90) return null;
      var e = th <= 100 ? th : th >= 115 ? 90 : 100 - 10 * (th - 100) / 15, zakret = th > 100;
      if (zakret) { var pp = left(aS); if (dot(pp, [Cb[0] - K[0], Cb[1] - K[1]]) < 0) pp = [-pp[0], -pp[1]]; var er = e / deg; // pp: na stronę pasów odnogi
        aBe = [aS[0] * Math.cos(er) + pp[0] * Math.sin(er), aS[1] * Math.cos(er) + pp[1] * Math.sin(er)]; }
      var lB = left([sg * aBe[0], sg * aBe[1]]), si = dot(lB, aS) < 0 ? -1 : 1, wh = B.lanes * B.w / 2;
      function x(p, u, q, v) { var D = u[0] * v[1] - u[1] * v[0]; if (Math.abs(D) < 1e-6) return null;
        var t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / D; return add(p, u, t); }
      var Xin = x(add(Cb, lB, si * wh), aBe, K, aS), Xout = x(add(Cb, lB, -si * wh), aBe, add(N, nT, dOut), aT);
      if (!Xin || !Xout || dot([Xin[0] - K[0], Xin[1] - K[1]], aS) < -1e-6 || dot([Xout[0] - N[0], Xout[1] - N[1]], aT) < -1e-6) return null;
      var cBo = dot([Cb[0] - N[0], Cb[1] - N[1]], lB), lin = function (A0, A1, u) { return [A0[0] + (A1[0] - A0[0]) * u, A0[1] + (A1[1] - A0[1]) * u]; };
      // płynnie od 90° (Wojtek 17:39): kp 0 → 1 między e = 90° a 93°; przy 90° styk = ukos Xin–Xout (jak wzorzec 90°),
      // od 93° styk K–Xout. J = koniec wewn. krawędzi pasa pnia (Xin → K). Odcinek stały pnia: jak przy węźle, gdy jest zakręt.
      var kp = Math.max(0, Math.min(1, (e - 90) / 3)), hk = zakret ? 1 : kp, J = lin(Xin, K, kp);
      var nOut = [nT[0] * (dOut < dIn ? -1 : 1), nT[1] * (dOut < dIn ? -1 : 1)], E0 = add(N, nT, dOut);
      return { cB: cBo, K: kp > 1e-6 ? J : null, dK: cBo - si * wh,
        pien: function (d) { return lin(J, Xout, (d - dIn) / (dOut - dIn)); },
        hold: function (d) { return lin(lin(Xin, Xout, (d - dIn) / (dOut - dIn)), add(N, nT, d), hk); },
        odn: function (d) { return lin(Xout, Xin, (d - cBo + si * wh) / (2 * si * wh)); },
        // pień jako przeszkoda: oś odnogi za węzłem ≥ ½ szer. odnogi od zewn. krawędzi pnia
        pienOdsun: { C: E0, u: aT, n: nOut, D: wh, L: tIn ? Math.hypot(P[T.pts[T.pts.length - 2]][0] - N[0], P[T.pts[T.pts.length - 2]][1] - N[1]) : Math.hypot(P[T.pts[1]][0] - N[0], P[T.pts[1]][1] - N[1]) },
        zakret: zakret ? { e: aBe, C: E0, n: nOut, D: wh } : null };
    }
    if (r !== T) { var me = cand.filter(function (k) { return k.B === r; })[0];
      // Odnoga nie może wjechać na drogę na wprost (wzorzec 19, Wojtek 17:00): powrót na własną oś trwa co najmniej tyle,
      // aż linie OSM rozejdą się na pół szerokości obu jezdni: tMin = (kB + kS)·w/2 / sin(kąt między nimi).
      var tMin = 0, uS = tIn ? dirOut(st.B, P) : dirIn(st.B, P), uR = tIn ? dirOut(r, P) : dirIn(r, P), sn = Math.abs(uS[0] * uR[1] - uS[1] * uR[0]);
      if (st.B !== r) tMin = sn > 1e-3 ? (r.lanes * r.w + st.B.lanes * st.B.w) / 2 / sn : Infinity;
      // Odnoga nie wchodzi na sąsiednią jezdnię (wzorce 17:19, n6 blisko R2): oś odnogi trzyma się co najmniej
      // (kB + kS)·w/2 od osi drogi na wprost – gdy punkt OSM leży bliżej, oś odsuwa się prostopadle do tej drogi.
      var sc0 = cand.filter(function (k) { return k.B === st.B; })[0], Cs = add(sc0.X, sc0.S, sc0.cB), Cm = add(me.X, me.S, me.cB);
      var nS = left(uS), sd = dot([Cm[0] - Cs[0], Cm[1] - Cs[1]], nS) < 0 ? -1 : 1;
      var odsun = st.B === r ? null : { C: Cs, u: tIn ? uS : [-uS[0], -uS[1]], n: [nS[0] * sd, nS[1] * sd], D: (r.lanes * r.w + st.B.lanes * st.B.w) / 2,
        L: tIn ? Math.hypot(P[st.B.pts[1]][0] - N[0], P[st.B.pts[1]][1] - N[1]) : Math.hypot(P[st.B.pts[st.B.pts.length - 2]][0] - N[0], P[st.B.pts[st.B.pts.length - 2]][1] - N[1]) };
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
    function hold(E, p0, u, o) { var m = 0; for (var j = 0; j <= L; j++) { var q = E.pt((L / 2 - j - o) * w, null, true); m = Math.max(m, Math.abs(dot([q[0] - p0[0], q[1] - p0[1]], u))); } return m + 1; }
    // odnoga przy Nm (automatyczny offset, nie pień): bez odcinka stałego – od styku od razu prosto na środek
    // (wzorce 2026-11-21 16:57: Wojtek usuwał wierzchołek „styk + 1 m”). Pień i ręczne offsety: jak dotąd.
    var br0 = E0.oAuto != null && !E0.pien, br1 = E1.oAuto != null && !E1.pien;
    var H0 = o0 && !br0 ? hold(E0, pts[0], unit(pts[0], pts[1]), o0) : 0, H1 = o1 && !br1 ? hold(E1, pts[n - 1], unit(pts[n - 1], pts[n - 2]), o1) : 0;
    var nk = (o0 ? 1 : 0) + (o1 ? 1 : 0), T = nk ? Math.max(0, Math.min(PRZEJ, (Ltot - H0 - H1) / nk)) : 0;
    if (nk) T = Math.max(T, Math.min((Ltot - H0 - H1) / nk, Math.max(E0.tMin || 0, E1.tMin || 0))); // odnoga: nie wjeżdża na prostą
    // odnoga przy Nm: przejście na oś przez CAŁY pierwszy odcinek OSM – jeden prosty pas bez wierzchołków po drodze (Wojtek 17:04)
    if (nk === 1 && br0) T = Math.max(T, s[1]); if (nk === 1 && br1) T = Math.max(T, Ltot - s[n - 2]);
    if (nk && (Ltot - H0 - H1) / nk - T < 5) T = (Ltot - H0 - H1) / nk; // reszta < 5 m: przejście do końca (bez krótkiego załamania)
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
    // odsunięcie od drogi na wprost (zob. endSection.odsun): WSZYSTKIE punkty osi odnogi leżące wzdłuż pierwszego odcinka tej
    // drogi (wzorzec 17:57: n6 blisko R2, n7 dalej – pas zostaje równoległy, nie nachodzi na R2)
    // + pień jako przeszkoda dla odnogi > 90° (odsun2)
    [[E0, 0, 'odsun'], [E1, 1, 'odsun'], [E0, 0, 'odsun2'], [E1, 1, 'odsun2']].forEach(function (z) { var o = z[0][z[2]], Eo = z[1] ? E0 : E1; if (!o) return;
      for (var q = 1; q < m; q++) { var ii = z[1] ? m - 1 - q : q;
        if ((ii === 0 || ii === m - 1) && Eo.typ !== 'koniec') break; // drugi koniec w węźle – styk ustala węzeł
        var v = [A[ii][0] - o.C[0], A[ii][1] - o.C[1]], g = dot(v, o.n);
        var al = dot(v, o.u); if (al > 0 && al <= o.L + 1e-6 && g < o.D) A[ii] = add(A[ii], o.n, o.D - g); } });
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
      if (E0.extra && Math.abs(rj + dc[0] - E0.extra.d) < 1e-6) l.unshift(E0.extra.K.slice()); // klin odnogi > 90°
      if (E1.extra && Math.abs(rj + dc[m - 1] - E1.extra.d) < 1e-6) l.push(E1.extra.K.slice());
      pasy.push(l.filter(function (q, i) { return !i || Math.hypot(q[0] - l[i - 1][0], q[1] - l[i - 1][1]) > 1e-3; })); // bez zdublowanych
    });
    return { lanes: lanes, pasy: pasy, asfalt: [lanes[0], lanes[L]], zamkn: [!E0.pien, !E1.pien] }; // bez poboczy
  }
  return { toXY: toXY, toLL: toLL, lines: lines, nodeType: nodeType, endInfo: endSection };
})();
