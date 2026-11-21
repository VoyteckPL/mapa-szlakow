// Sandbox v1 – geometria, model 2 (Wojtek 2026-11-21 20:24): styk rozwidlenia / włączenia = JEDEN prosty przekrój
// prostopadły do pnia w węźle, wspólny dla wszystkich pasów pnia. Pasy odnóg zaczynają się na nim prosto (krótki odcinek
// wzdłuż pnia), potem skręcają w swoją stronę. Każda jezdnia = oś (łamana) ± pasy z miterami → szerokość stała, pas nie
// może się odwrócić. Odnogi skręcają tak, że na każdej wspólnej granicy pasów wierzchołki obu sąsiadów są w tym samym
// punkcie – dalej się rozchodzą (posortowane od lewej), więc nie nachodzą na siebie.
// Nadpisuje G.u.endSection / G.endInfo dla węzłów pień + ≥ 2 odnogi; inne węzły – dawna reguła (styk.js).
(function () {
  var U = G.u, unit = U.unit, left = U.left, dirIn = U.dirIn, dirOut = U.dirOut, add = U.add, dot = U.dot, stary = U.endSection;
  var rot = function (v, f) { var c = Math.cos(f), s = Math.sin(f); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };
  var cr = function (a, b) { return a[0] * b[1] - a[1] * b[0]; }, rad = Math.PI / 180;
  function gauss(M) { var n = M.length;
    for (var c = 0; c < n; c++) { var pv = c; for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pv][c])) pv = r;
      var t = M[c]; M[c] = M[pv]; M[pv] = t; if (Math.abs(M[c][c]) < 1e-12) throw new Error('osobliwa');
      for (r = 0; r < n; r++) if (r !== c) { var k = M[r][c] / M[c][c]; for (var q = c; q <= n; q++) M[r][q] -= k * M[c][q]; } }
    return M.map(function (w, i) { return w[n] / w[i]; }); }
  var cache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function wezel(sc, id, P) { // wynik liczony raz na scenę (cache po obiekcie P i węźle)
    var c = cache && cache.get(P); if (!c || c.sc !== sc) { c = { sc: sc, w: {} }; if (cache) cache.set(P, c); }
    if (!(id in c.w)) c.w[id] = wezel0(sc, id, P); return c.w[id];
  }
  function wezel0(sc, id, P) {
    var N = P[id], ins = [], outs = [];
    sc.roads.forEach(function (x) { if (x.pts.length < 2) return; if (x.pts[x.pts.length - 1] === id) ins.push(x); if (x.pts[0] === id) outs.push(x); });
    var T, Bs, tIn;
    if (ins.length === 1 && outs.length >= 2) { T = ins[0]; Bs = outs; tIn = true; }
    else if (outs.length === 1 && ins.length >= 2) { T = outs[0]; Bs = ins; tIn = false; } else return null;
    var tDir = tIn ? dirIn(T, P) : dirOut(T, P), nT = left(tDir), a = tIn ? tDir : [-tDir[0], -tDir[1]], sg = tIn ? 1 : -1;
    var dal = function (B) { return P[tIn ? B.pts[1] : B.pts[B.pts.length - 2]]; };
    var ord = Bs.map(function (B) { var v = unit(N, dal(B)), lat = cr(tDir, v), al = dot(v, tDir) * sg;
      return { B: B, al: al, ang: Math.atan2(lat, al) }; }).sort(function (x, y) { return y.ang - x.ang; });
    // prosta: najmniejszy kąt z pniem; przy kątach różnych o < 20° – najwięcej pasów (wzorce 19:33, 19:47)
    var st0 = ord.reduce(function (b, o) { return o.al > b.al ? o : b; }), aSt = Math.abs(st0.ang);
    var st = ord.reduce(function (b, o) { return Math.abs(o.ang) - aSt < 20 * rad && (o.B.lanes > b.B.lanes || (o.B.lanes === b.B.lanes && o.al > b.al)) ? o : b; }, st0);
    var a0 = 0; for (var i = 0; ord[i] !== st; i++) a0 += ord[i].B.lanes;
    var oT = T.lanes === 3 ? 0.5 : T.lanes / 2 - a0 - st.B.lanes / 2, cur = (T.lanes / 2 - oT) * T.w;
    ord.forEach(function (o) { var w = o.B.w; o.hi = cur; o.lo = cur - o.B.lanes * w; o.c = (o.hi + o.lo) / 2; o.hw = o.B.lanes * w / 2; cur = o.lo;
      o.P0 = add(N, nT, o.c); o.Ls = 0.5; });
    // Skręt odnogi φ (od kierunku „od węzła” a do kierunku na jej 1. dalszy punkt): 1. załamanie o φ1 = φ ograniczone do ±90°,
    // 2. załamanie o resztę (zawracanie > 90°). x(d) – położenie wierzchołka krawędzi d (lewo +) wzdłuż kierunku przed załamaniem.
    // Na każdej wspólnej granicy sąsiadów wierzchołki w jednym punkcie; żaden wierzchołek nie cofa się za poprzedni (≥ 0,5 / 0,2 m).
    // Odsunięcie od sąsiada (bliżej prostej): punkty OSM odnogi bliżej osi sąsiada niż suma połówek szerokości → na zewnątrz
    // (prostopadle do odcinka sąsiada). Kolejno od prostej na zewnątrz; ax = oś odnogi od węzła (pre + punkty OSM).
    var kSt = ord.indexOf(st), odsun = U.odsunPtE;
    var dalej = function (B) { var ids = tIn ? B.pts.slice(1) : B.pts.slice(0, -1).reverse(); return ids.map(function (id) { return P[id]; }); };
    // pień jako przeszkoda dla skrajnych odnóg (zawracanie): oś środka pnia od węzła wstecz, przedłużona
    var tp = [N].concat((tIn ? T.pts.slice(0, -1).reverse() : T.pts.slice(1)).map(function (id) { return P[id]; })), cT = -oT * T.w;
    var tRef = tp.map(function (q, i) { var u1 = unit(i ? tp[i - 1] : q, i ? q : tp[1]), u2 = tp[i + 1] ? unit(q, tp[i + 1]) : u1;
      return add(q, U.miter(u1, u2), cT * (tIn ? -1 : 1)); });
    tRef.push(add(tRef[tRef.length - 1], unit(tRef[tRef.length - 2], tRef[tRef.length - 1]), 1000));
    function osie() {
      var kol = [kSt]; for (var j = kSt - 1, m = kSt + 1; j >= 0 || m < ord.length; j--, m++) { if (j >= 0) kol.push(j); if (m < ord.length) kol.push(m); }
      kol.forEach(function (j) { var o = ord[j], pts = dalej(o.B), p = j < kSt ? ord[j + 1] : j > kSt ? ord[j - 1] : null;
        if (p) { var sd = j < kSt ? nT : [-nT[0], -nT[1]], D = o.hw + p.hw; var rf = p.ax.slice(), z = rf[rf.length - 1]; rf.push(add(z, unit(rf[rf.length - 2], z), 1000)); // koniec sąsiada przedłużony
          o.ods = { ref: rf, side: sd, D: D, G: D }; // oś OSM odnogi 3-pasowej: ½ pasa w lewo (nT) od środka jezdni
          var D3 = o.B.lanes === 3 ? (j < kSt ? 0.5 : -0.5) * o.B.w : 0, od3 = { ref: rf, side: sd, D: D + D3, G: D };
          pts = pts.map(function (q) { return odsun(od3, q); }); } else o.ods = null;
        if (j === 0 || j === ord.length - 1) { var D2 = o.hw + T.lanes * T.w / 2, s2 = j === 0 ? nT : [-nT[0], -nT[1]];
          o.ods2 = { ref: tRef, side: s2, D: D2, G: D2 }; var d23 = o.B.lanes === 3 ? (j === 0 ? 0.5 : -0.5) * o.B.w : 0;
          pts = pts.map(function (q) { return odsun({ ref: tRef, side: s2, D: D2 + d23, G: D2 }, q); }); } else o.ods2 = null;
        // punkt OSM tuż przy styku (bliżej niż szer. odnogi + 1 m od początku jej osi) – pominięty, oś na następny (o.skip)
        var blisko = function (q) { return Math.hypot(q[0] - o.P0[0], q[1] - o.P0[1]) < 2 * o.hw + 1; };
        o.skip = 0; while (pts.length > 1 && blisko(pts[0])) { pts.shift(); o.skip++; }
        o.q = pts[0]; var S = add(o.P0, a, o.Ls), S1 = o.S2 || S;
        if (o.B.lanes === 3) pts = pts.map(function (q, i) { var u1 = unit(i ? pts[i - 1] : S1, q), u2 = pts[i + 1] ? unit(q, pts[i + 1]) : u1;
          return add(q, U.miter(u1, u2), -sg * 0.5 * o.B.w); }); // ax = środek jezdni
        o.ax = [o.P0, S].concat(o.S2 ? [o.S2] : [], pts); });
    }
    var kat = function (o) { var S = o.S2 || add(o.P0, a, o.Ls), q = o.q, b = Math.hypot(q[0] - S[0], q[1] - S[1]) > 1e-6 ? unit(S, q) : a;
      var e = o.B.lanes === 3 ? Math.asin(Math.min(1, 0.5 * o.B.w / Math.max(1e-6, Math.hypot(q[0] - S[0], q[1] - S[1])))) * sg : 0; // 3 pasy: oś OSM +0,5
      return Math.atan2(cr(a, b), dot(a, b)) - e; };
    var x1 = function (o, d) { return o.Ls - sg * d * o.t1; }, x2 = function (o, d) { return o.l2 - sg * d * (o.t1 + o.t2); };
    function uklad(fs) { // dla zadanych skrętów φ: odcinki Ls, l2 (łańcuch po wspólnych granicach), S, S2
      ord.forEach(function (o, j) { var f = fs[j]; o.f = f; o.f1 = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, f)); o.f2 = f - o.f1;
        o.t1 = Math.tan(o.f1 / 2); o.t2 = Math.tan(o.f2 / 2); o.h1 = rot(a, o.f1); o.Ls = 0.5; o.l2 = 0.5; });
      for (var i = 1; i < ord.length; i++) { var p = ord[i - 1], o = ord[i]; o.Ls = x1(p, -p.hw) + sg * o.hw * o.t1; }
      var mn = Infinity; ord.forEach(function (o) { mn = Math.min(mn, x1(o, o.hw), x1(o, -o.hw)); });
      var sh = 0.5 - mn; ord.forEach(function (o) { o.Ls += sh; });
      // 2. załamanie: grupy sąsiadów z tym samym kierunkiem po 1. załamaniu (wspólna granica dalej w linii)
      var gr = function (p, o) { return p && o && Math.abs(o.f2) > 1e-6 && Math.abs(p.f2) > 1e-6 && Math.abs(p.f1 - o.f1) < 1e-6; };
      for (i = 0; i < ord.length; i++) { o = ord[i]; if (Math.abs(o.f2) < 1e-6) continue;
        o.l2 = gr(ord[i - 1], o) ? x2(ord[i - 1], -ord[i - 1].hw) + sg * o.hw * (o.t1 + o.t2) : 0.2 + o.hw * Math.abs(o.t1 + o.t2); }
      // skrajna odnoga zawracająca: po 1. załamaniu odchodzi od pnia na tyle, by wrócić obok niego (½ pnia + ½ odnogi)
      [ord[0], ord[ord.length - 1]].forEach(function (o) { if (Math.abs(o.f2) < 1e-6) return;
        var k = dot(o.h1, nT), c = o.c - cT, req = (T.lanes * T.w / 2 + o.hw - Math.abs(c)) / Math.abs(k || 1e-9);
        if (k * c > 0 && o.l2 < req) o.l2 = req; });
      for (i = ord.length - 1; i >= 0; i--) { o = ord[i]; var nx = ord[i + 1]; if (Math.abs(o.f2) < 1e-6) continue;
        var need = 0.2 - Math.min(x2(o, o.hw), x2(o, -o.hw)); if (need > 0) o.l2 += need;
        if (gr(o, nx)) { var want = x2(nx, nx.hw), have = x2(o, -o.hw); if (have < want) o.l2 += want - have; } }
      for (i = 1; i < ord.length; i++) if (gr(ord[i - 1], ord[i])) { p = ord[i - 1]; o = ord[i]; o.l2 = x2(p, -p.hw) + sg * o.hw * (o.t1 + o.t2); }
      ord.forEach(function (o) { o.S = add(o.P0, a, o.Ls); o.S2 = Math.abs(o.f2) > 1e-6 ? add(o.S, o.h1, o.l2) : null; });
    }
    function res(fs) { uklad(fs); osie(); return ord.map(function (o, j) { var d = kat(o) - fs[j]; return Math.atan2(Math.sin(d), Math.cos(d)); }); }
    // skręty φ tak, by odcinek po ostatnim załamaniu celował dokładnie w punkt OSM (Newton, n ≤ 4 niewiadomych)
    ord.forEach(function (o) { o.S2 = null; }); osie();
    var fs = ord.map(function (o) { var f = kat(o), st = (tIn ? 1 : -1) * Math.sign(o.ang); // zawracanie > 180°: po stronie odnogi
      return st && f * st < 0 && Math.abs(f) > Math.PI / 2 ? f + 2 * Math.PI * st : f; }), f0 = fs.slice(), r = res(fs), best = { fs: fs.slice(), e: Math.max.apply(null, r.map(Math.abs)) };
    for (var it = 0; it < 25 && best.e > 1e-5; it++) {
      var n = fs.length, J = [];
      for (var j = 0; j < n; j++) { var f2 = fs.slice(); f2[j] += 1e-5; var r2 = res(f2); J.push(r2.map(function (v, k) { return (v - r[k]) / 1e-5 - (k === j ? 0 : 0); })); }
      // J[j][k] = ∂r_k/∂f_j; układ: Σ_j J[j][k] Δ_j = −r_k
      var M = r.map(function (v, k) { return J.map(function (c) { return c[k]; }).concat([-v]); }), dl;
      try { dl = gauss(M); } catch (e) { dl = r.slice(); }
      var mx = Math.max.apply(null, dl.map(Math.abs)), k = mx > 0.3 ? 0.3 / mx : 1;
      fs = fs.map(function (f, j) { return Math.max(f0[j] - 1.2, Math.min(f0[j] + 1.2, Math.max(-4.6, Math.min(4.6, f + dl[j] * k)))); }); r = res(fs);
      var e = Math.max.apply(null, r.map(Math.abs)); if (e < best.e) best = { fs: fs.slice(), e: e };
    }
    res(best.fs);
    return { a: a, N: N, T: T, tIn: tIn, tDir: tDir, nT: nT, oT: oT, ord: ord, st: st, typ: tIn ? 'rozwidlenie' : 'wlaczenie' };
  }
  function endSection(sc, r, atStart, P) {
    if (!U.MODEL2) return stary(sc, r, atStart, P);
    var id = atStart ? r.pts[0] : r.pts[r.pts.length - 1], W = wezel(sc, id, P);
    if (!W) return stary(sc, r, atStart, P);
    if (r === W.T) return { typ: W.typ, pien: true, oAuto: W.oT, pt: function (d) { return add(W.N, W.nT, d); } };
    var o = W.ord.filter(function (x) { return x.B === r; })[0]; if (!o) return stary(sc, r, atStart, P);
    var pre = o.S2 ? [o.P0, o.S, o.S2] : [o.P0, o.S], oA = r.lanes === 3 ? 0.5 : 0, R0 = add(o.P0, W.nT, oA * r.w);
    // odnoga 3-pasowa: oś OSM na sztywno między lewym a środkowym pasem (+0,5) – łamana pre równoległa do środka jezdni
    if (oA) { var ze = pre.concat([add(pre[pre.length - 1], rot(W.a, o.f), 10)]); pre = pre.map(function (p, i) { var u2 = unit(p, ze[i + 1]), M = i ? U.miter(unit(ze[i - 1], p), u2) : left(u2);
      return add(p, M, oA * r.w * (W.tIn ? 1 : -1)); }); }
    if (!W.tIn) pre.reverse();
    return { typ: W.typ, oAuto: oA, pre: pre, skip: o.skip, odsun: o.ods, odsun2: o.ods2, pt: function (d) { return add(R0, W.nT, d); } };
  }
  U.MODEL2 = true; U.endSection = endSection; G.endInfo = endSection; U.wezel2 = wezel;
})();
