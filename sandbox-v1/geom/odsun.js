// Sandbox v1 – geometria: odsuwanie dróg (clearP: węższa droga ustępuje szerszej; odsunPtE: punkt od łamanej).
(function () {
  var unit = G.u.unit, left = G.u.left, add = G.u.add, dot = G.u.dot;
  // Drogi nie nachodzą na siebie (Wojtek 17:59, 18:03 – R3 → R4 obok R2): punkt OSM węższej drogi leżący „obok” szerszej
  // drogi X (rzut na odcinek X) bliżej niż (szer. w węźle + szer. X)/2 od osi OSM X → odsunięty prostopadle do tego odcinka.
  // Liczone raz dla sceny (cache po obiekcie P); geometria wszystkich dróg używa przesuniętych punktów.
  var clrCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function clearP(sc, P) {
    if (clrCache && clrCache.has(P)) { var cc = clrCache.get(P); if (cc.sig === sc) return cc.Q; }
    var Q = {}, ids = Object.keys(P); ids.forEach(function (id) { Q[id] = P[id]; });
    var rs = sc.roads.filter(function (x) { return x.pts.length > 1; });
    ids.forEach(function (id) {
      var mine = rs.filter(function (x) { return x.pts.indexOf(id) >= 0; }); if (!mine.length) return;
      var wN = Math.max.apply(null, mine.map(function (x) { return x.lanes * x.w; })), lN = Math.max.apply(null, mine.map(function (x) { return x.lanes; }));
      rs.forEach(function (X) {
        if (X.pts.indexOf(id) >= 0 || X.lanes <= lN) return; // ustępuje tylko węższa droga
        var D = (wN + X.lanes * X.w) / 2, p = Q[id], best = null;
        for (var k = 0; k < X.pts.length - 1; k++) { var a = P[X.pts[k]], b = P[X.pts[k + 1]], u = unit(a, b), Ls = Math.hypot(b[0] - a[0], b[1] - a[1]);
          var v = [p[0] - a[0], p[1] - a[1]], t = dot(v, u); if (t < 0 || t > Ls) continue;
          var g = dot(v, left(u)); if (!best || Math.abs(g) < Math.abs(best.g)) best = { g: g, n: left(u) }; }
        if (best && Math.abs(best.g) > 1e-6 && Math.abs(best.g) < D) { var sgn = best.g < 0 ? -1 : 1; Q[id] = add(p, best.n, sgn * D - best.g); }
      });
    });
    if (clrCache) clrCache.set(P, { sig: sc, Q: Q });
    return Q;
  }
  function odsunPtE(o, p) { // najbliższy odcinek łamanej ref, przy którym p leży „obok” (rzut w odcinku); za blisko → na zewnątrz
    var best = null;
    for (var k = 0; k < o.ref.length - 1; k++) { var a = o.ref[k], b = o.ref[k + 1], u = unit(a, b), Ls = Math.hypot(b[0] - a[0], b[1] - a[1]);
      var v = [p[0] - a[0], p[1] - a[1]], t = dot(v, u); if (t <= (k ? -1e-6 : 1e-6) || t > Ls + 1e-6) continue;
      var nn = left(u); if (dot(o.side, left(unit(o.ref[0], o.ref[1]))) < 0) nn = [-nn[0], -nn[1]];
      var g = dot(v, nn); if (!best || Math.abs(g) < Math.abs(best.g)) best = { g: g, n: nn }; }
    return best && best.g < o.D && best.g > -(o.G || o.D) ? add(p, best.n, o.D - best.g) : p;
  }
  G.u.clearP = clearP; G.u.odsunPtE = odsunPtE;
})();
