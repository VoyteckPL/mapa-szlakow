// Sandbox v1 – warstwa ∠ (kąty między liniami OSM w węzłach) i przyciąganie kąta co 5° przy przeciąganiu węzła.
(function () {
  var S = window.SV, H = window.SVH, map = S.map, gAng = S.gAng, P = S.P, xy = S.xy, ll = S.ll;
  // sąsiedzi węzła wzdłuż dróg (kierunki odcinków wychodzących z węzła)
  function nbrs(id) { var o = []; S.sc.roads.forEach(function (r) { r.pts.forEach(function (q, i) { if (q !== id) return;
    if (i > 0) o.push(r.pts[i - 1]); if (i < r.pts.length - 1) o.push(r.pts[i + 1]); }); }); return o; }
  function drawAng() { // warstwa ∠: kąty między kolejnymi odcinkami w każdym węźle (2 odcinki – tylko mniejszy kąt, prosto pomijane)
    gAng.clearLayers(); if (!map.hasLayer(gAng)) return; var p = P();
    Object.keys(S.sc.nodes).forEach(function (id) {
      var a = nbrs(id).map(function (q) { return Math.atan2(p[q][1] - p[id][1], p[q][0] - p[id][0]); }).sort(function (x, y) { return x - y; });
      if (a.length < 2) return;
      a.forEach(function (x, i) {
        var y = i + 1 < a.length ? a[i + 1] : a[0] + 2 * Math.PI, d = (y - x) * 180 / Math.PI;
        if (d < 0.5 || (a.length === 2 && d > 180.01) || Math.abs(d - 180) < 0.5) return;
        var m = (x + y) / 2, c = map.latLngToContainerPoint(ll(p[id])), t = map.containerPointToLatLng(c.add(L.point(Math.cos(m), -Math.sin(m)).multiplyBy(22)));
        L.marker(t, { interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="sv-ang">' + Math.round(d * 10) / 10 + '°</div>' }) }).addTo(gAng);
      });
    });
  }
  // przyciąganie kąta co 5°: kierunek odcinka sąsiad→węzeł względem innego odcinka u sąsiada (albo osi X), długość bez zmian
  function snapAng(id, p0) {
    if (!S.snapA) return p0; var nb = nbrs(id); if (!nb.length) return p0;
    var P0 = P(), q = nb[0], Q = P0[q], v = xy(p0), len = Math.hypot(v[0] - Q[0], v[1] - Q[1]);
    var ref = nbrs(q).filter(function (z) { return z !== id; })[0], b = ref ? Math.atan2(P0[ref][1] - Q[1], P0[ref][0] - Q[0]) : 0;
    var a = Math.atan2(v[1] - Q[1], v[0] - Q[0]) - b, st = Math.PI / 36; a = Math.round(a / st) * st + b;
    return ll([Q[0] + Math.cos(a) * len, Q[1] + Math.sin(a) * len]);
  }
  map.on('overlayadd overlayremove', drawAng);
  H.drawAng = drawAng; H.snapAng = snapAng;
})();
