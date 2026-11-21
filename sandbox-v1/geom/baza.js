// Sandbox v1 – geometria: wspólne podstawy (układ lokalny [m], wektory, przekrój ukośny). Kolejność plików: sandbox-v1.html (GEOM).
// Moduły geometrii dopisują się do G: odsun.js (drogi nie nachodzą), rozw-tepy.js (odnoga > 90°), styk.js (styk w węźle Nm), pasy.js (krawędzie pasów).
var G = { u: {} };
(function () {
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
  G.toXY = toXY; G.toLL = toLL;
  G.u = { R: R, PRZEJ: PRZEJ, unit: unit, left: left, miter: miter, dirIn: dirIn, dirOut: dirOut, konst: konst, add: add, dot: dot };
})();
