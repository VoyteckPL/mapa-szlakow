// Geometria: lokalny układ w metrach + krawędzie pasów. Bez łuków – wszystko kanciaste.
// Reguła Nm (wstępnie, czeka na ustalenia): w węźle wspólnym dla 2 dróg przekrój po dwusiecznej
// (miter), więc pasy obu dróg stykają się sztywno i zachowują szerokość.
var G = (function () {
  var R = 6378137;
  function toXY(o, ll) {
    return [(ll.lng - o.lng) * Math.PI / 180 * R * Math.cos(o.lat * Math.PI / 180),
            (ll.lat - o.lat) * Math.PI / 180 * R];
  }
  function toLL(o, p) {
    return { lat: o.lat + p[1] / R * 180 / Math.PI,
             lng: o.lng + p[0] / (R * Math.cos(o.lat * Math.PI / 180)) * 180 / Math.PI };
  }
  function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }
  function nrm(u) { return [-u[1], u[0]]; } // lewa strona kierunku jazdy

  // Kierunek wejścia/wyjścia na końcu drogi: jeśli w węźle jest dokładnie jedna inna droga, bierzemy jej odcinek.
  function neighbour(sc, road, atStart) {
    var nid = atStart ? road.pts[0] : road.pts[road.pts.length - 1];
    var others = sc.roads.filter(function (r) { return r !== road && r.pts.indexOf(nid) >= 0; });
    if (others.length !== 1) return null;
    var o = others[0], i = o.pts.indexOf(nid);
    if (atStart && i === o.pts.length - 1 && i > 0) return o.pts[i - 1];   // o kończy się tu, my zaczynamy
    if (!atStart && i === 0 && o.pts.length > 1) return o.pts[1];          // my kończymy, o zaczyna
    return null;
  }

  // Zwraca linie krawędzi pasów drogi: tablica (lanes+1) polilinii w XY, od lewej do prawej.
  function edges(sc, road, P) {
    var pts = road.pts.map(function (id) { return P[id]; });
    var n = pts.length, prevN = neighbour(sc, road, true), nextN = neighbour(sc, road, false);
    var norms = [];
    for (var i = 0; i < n; i++) {
      var a = i > 0 ? pts[i - 1] : (prevN ? P[prevN] : null);
      var b = i < n - 1 ? pts[i + 1] : (nextN ? P[nextN] : null);
      var u1 = a ? unit(a, pts[i]) : null, u2 = b ? unit(pts[i], b) : null;
      var n1 = u1 ? nrm(u1) : nrm(u2), n2 = u2 ? nrm(u2) : n1;
      var dot = n1[0] * n2[0] + n1[1] * n2[1], k = 1 / Math.max(1 + dot, 0.05);
      norms.push([(n1[0] + n2[0]) * k, (n1[1] + n2[1]) * k]); // wektor miter (długość = 1/cos(α/2))
    }
    var L = road.lanes, w = road.w, out = [];
    for (var j = 0; j <= L; j++) {
      var d = (L / 2 - j) * w; // oś na środku jezdni
      out.push(pts.map(function (p, i) { return [p[0] + norms[i][0] * d, p[1] + norms[i][1] * d]; }));
    }
    return out;
  }
  return { toXY: toXY, toLL: toLL, edges: edges };
})();
