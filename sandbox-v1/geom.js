// Sandbox v1 – geometria w lokalnym układzie [m]. Bez łuków: wszystko kanciaste.
// Droga: pts (id węzłów, kierunek jak w OSM), lanes, w (szer. pasa) – bez poboczy,
// o0/o1 – offset jezdni względem linii OSM na początku/końcu, w pasach (+ = w prawo), liniowo po długości.
// Reguła styku w węźle (Nm): przekrój wspólny dla stykających się dróg, więc pasy stykają się sztywno
// i zachowują szerokość wzdłuż przekroju:
//  1 wchodzi + 1 wychodzi  -> przekrój po dwusiecznej kąta (miter),
//  1 wchodzi + kilka wychodzi (rozwidlenie) -> wszystkie na przekroju prostopadłym do drogi wchodzącej,
//  kilka wchodzi + 1 wychodzi (włączenie)   -> wszystkie na przekroju prostopadłym do drogi wychodzącej,
//  wolny koniec / inne -> przekrój prostopadły do własnej drogi.
var G = (function () {
  var R = 6378137;
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

  // typ węzła i przekrój dla końca drogi r (atStart: początek)
  function endSection(sc, r, atStart, P) {
    var id = atStart ? r.pts[0] : r.pts[r.pts.length - 1];
    var ins = [], outs = [];
    sc.roads.forEach(function (x) {
      if (x.pts.length < 2) return;
      if (x.pts[x.pts.length - 1] === id) ins.push(x);
      if (x.pts[0] === id) outs.push(x);
    });
    var own = atStart ? dirOut(r, P) : dirIn(r, P);
    if (ins.length === 1 && outs.length === 1) return { S: miter(dirIn(ins[0], P), dirOut(outs[0], P)), typ: 'ciag' };
    if (ins.length === 1 && outs.length > 1) return { S: left(dirIn(ins[0], P)), typ: 'rozwidlenie' };
    if (outs.length === 1 && ins.length > 1) return { S: left(dirOut(outs[0], P)), typ: 'wlaczenie' };
    return { S: left(own), typ: ins.length + outs.length > 1 ? 'inny' : 'koniec' };
  }
  function nodeType(sc, id, P) {
    var r = sc.roads.filter(function (x) { return x.pts.length > 1 && (x.pts[0] === id || x.pts[x.pts.length - 1] === id); })[0];
    return r ? endSection(sc, r, r.pts[0] === id, P).typ : 'punkt';
  }

  // Linie drogi: lanes+1 granic pasów (od lewej) i 2 krawędzie asfaltu (lewa, prawa), polilinie XY.
  function lines(sc, r, P) {
    var pts = r.pts.map(function (id) { return P[id]; }), n = pts.length, S = [], s = [0];
    for (var i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    for (i = 0; i < n; i++) {
      if (i === 0) S.push(endSection(sc, r, true, P).S);
      else if (i === n - 1) S.push(endSection(sc, r, false, P).S);
      else S.push(miter(unit(pts[i - 1], pts[i]), unit(pts[i], pts[i + 1])));
    }
    var Ltot = s[n - 1] || 1, L = r.lanes, w = r.w;
    function line(dFn) { return pts.map(function (p, i) { var d = dFn(r.o0 + (r.o1 - r.o0) * s[i] / Ltot); return [p[0] + S[i][0] * d, p[1] + S[i][1] * d]; }); }
    var lanes = [];
    for (var j = 0; j <= L; j++) (function (j) { lanes.push(line(function (o) { return (L / 2 - j - o) * w; })); })(j);
    return { lanes: lanes,
      asfalt: [lanes[0], lanes[L]] }; // bez poboczy
  }
  return { toXY: toXY, toLL: toLL, lines: lines, nodeType: nodeType };
})();
