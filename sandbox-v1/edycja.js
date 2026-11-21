// Sandbox v1 – ręczna edycja krawędzi pasów (warstwa ✎, domyślnie wyłączona).
// Nadpisania: sc.edits[idDrogi] = [krawędź j (od lewej): [[x,y],...]] w metrach od środka sceny.
// Przeciąganie wierzchołka / odcinka; dwuklik w odcinek dodaje wierzchołek, dwuklik w wierzchołek go usuwa.
// ⟷ = cały przekrój (ten sam wierzchołek na wszystkich krawędziach drogi) – szerokość pasów zachowana.
// Przyciąganie: ⊙ do wierzchołków, ⟋ do krawędzi innych pasów, 🧲 do siatki (rozdzielczość ▦).
(function () {
  var S = window.SV, H = window.SVH, map = S.map, TOL = 12; // px
  var gH = L.layerGroup(), opt = { v: true, e: true, sek: true };
  var cp = function (l) { return l.map(function (q) { return q.slice(); }); };

  H.lanes = function (r, g) {
    var e = S.sc.edits && S.sc.edits[r.id];
    if (e && e.length === g.lanes.length) { g.lanes = e.map(cp); g.asfalt = [g.lanes[0], g.lanes[g.lanes.length - 1]]; g.edyt = true; }
    return g;
  };
  function roads() { return S.sc.roads.filter(function (r) { return r.pts.length > 1; }); }
  function ensure(r) { // pierwsza edycja: kopia wyliczonych krawędzi
    if (!S.sc.edits) S.sc.edits = {};
    if (!S.sc.edits[r.id] || S.sc.edits[r.id].length !== r.lanes + 1) S.sc.edits[r.id] = G.lines(S.sc, r, S.P()).lanes.map(cp);
    return S.sc.edits[r.id];
  }
  function all() { var p = S.P(); return roads().map(function (r) { return { r: r, L: H.lanes(r, G.lines(S.sc, r, p)).lanes }; }); }
  function px(q) { return map.latLngToContainerPoint(S.ll(q)); }

  // przyciąganie punktu q (xy); skip(idDrogi, j, i) – wierzchołki, które się teraz ruszają
  function snapTo(q, skip) {
    var P0 = px(q), best = null, bd = TOL, A = all();
    if (opt.v) A.forEach(function (o) { o.L.forEach(function (l, j) { l.forEach(function (v, i) {
      if (skip(o.r.id, j, i)) return; var d = P0.distanceTo(px(v)); if (d < bd) { bd = d; best = v.slice(); } }); }); });
    if (!best && opt.e) { bd = TOL; A.forEach(function (o) { o.L.forEach(function (l, j) { for (var i = 0; i < l.length - 1; i++) {
      if (skip(o.r.id, j, i) || skip(o.r.id, j, i + 1)) continue;
      var a = l[i], b = l[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1);
      t = Math.max(0, Math.min(1, t)); var c = [a[0] + dx * t, a[1] + dy * t], d = P0.distanceTo(px(c)); if (d < bd) { bd = d; best = c; } } }); }); }
    if (!best && S.snapOn()) { var G0 = S.grid(); best = [Math.round(q[0] / G0) * G0, Math.round(q[1] / G0) * G0]; }
    return best || q;
  }
  function group(E, j, i) { // które krawędzie ruszamy razem
    if (!opt.sek) return [j];
    return E.map(function (l, k) { return k; }).filter(function (k) { return i < E[k].length; });
  }

  function draw() {
    gH.clearLayers(); if (!map.hasLayer(gH)) return;
    all().forEach(function (o) {
      var r = o.r, ed = !!(S.sc.edits && S.sc.edits[r.id]);
      o.L.forEach(function (l, j) {
        for (var i = 0; i < l.length - 1; i++) (function (i) { // odcinki: przeciąganie i dwuklik = nowy wierzchołek
          var seg = L.polyline([S.ll(l[i]), S.ll(l[i + 1])], { weight: 12, opacity: 0, bubblingMouseEvents: false }).addTo(gH);
          seg.on('mousedown', function (e) { L.DomEvent.stop(e); dragSeg(r, j, i, e.latlng); });
          seg.on('dblclick', function (e) { L.DomEvent.stop(e); insert(r, j, i, S.xy(e.latlng)); });
        })(i);
        l.forEach(function (v, i) { // wierzchołki
          var m = L.marker(S.ll(v), { draggable: true, icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="sv-h' + (ed ? ' sv-ed' : '') + '"></div>' }) }).addTo(gH);
          var orig;
          m.on('dragstart', function () { orig = ensure(r).map(cp); });
          m.on('drag', function (e) {
            var E = S.sc.edits[r.id], ks = group(E, j, i);
            var tq = snapTo(S.xy(e.target.getLatLng()), function (id, jj, ii) { return id === r.id && ii === i && ks.indexOf(jj) >= 0; });
            var dx = tq[0] - orig[j][i][0], dy = tq[1] - orig[j][i][1];
            ks.forEach(function (k) { E[k][i] = [orig[k][i][0] + dx, orig[k][i][1] + dy]; });
            S.drawLines();
          });
          m.on('dragend', function () { S.commit(); S.draw(); });
          m.on('dblclick', function (e) { L.DomEvent.stop(e); remove(r, j, i); });
        });
      });
    });
  }
  function dragSeg(r, j, i, start) {
    var E = ensure(r), orig = E.map(cp), ks = group(E, j, i).filter(function (k) { return i + 1 < E[k].length; }), s0 = S.xy(start);
    map.dragging.disable();
    function mv(e) {
      var q = S.xy(e.latlng), a = [orig[j][i][0] + q[0] - s0[0], orig[j][i][1] + q[1] - s0[1]];
      var tq = snapTo(a, function (id, jj, ii) { return id === r.id && ks.indexOf(jj) >= 0 && (ii === i || ii === i + 1); });
      var dx = tq[0] - orig[j][i][0], dy = tq[1] - orig[j][i][1];
      ks.forEach(function (k) { [i, i + 1].forEach(function (ii) { E[k][ii] = [orig[k][ii][0] + dx, orig[k][ii][1] + dy]; }); });
      S.drawLines();
    }
    function up() { map.off('mousemove', mv); map.off('mouseup', up); document.removeEventListener('mouseup', up); map.dragging.enable(); S.commit(); S.draw(); }
    map.on('mousemove', mv); map.on('mouseup', up); document.addEventListener('mouseup', up);
  }
  function insert(r, j, i, q) { // nowy wierzchołek na odcinku i–i+1 (w trybie ⟷ na wszystkich krawędziach, w tym samym miejscu odcinka)
    var E = ensure(r), a = E[j][i], b = E[j][i + 1], dx = b[0] - a[0], dy = b[1] - a[1];
    var t = Math.max(0.05, Math.min(0.95, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    group(E, j, i).forEach(function (k) { if (i + 1 >= E[k].length) return; var p0 = E[k][i], p1 = E[k][i + 1];
      E[k].splice(i + 1, 0, k === j && !opt.sek ? q : [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]); });
    S.commit(); S.draw();
  }
  function remove(r, j, i) {
    var E = ensure(r);
    group(E, j, i).forEach(function (k) { if (E[k].length > 2) E[k].splice(i, 1); });
    S.commit(); S.draw();
  }

  // panel opcji (widoczny, gdy warstwa ✎ włączona)
  var box;
  S.ctl('topright', function (d) {
    box = d; d.classList.add('sv-hide');
    [['v', '⊙', 'Przyciągaj do wierzchołków'], ['e', '⟋', 'Przyciągaj do krawędzi pasów'], ['sek', '⟷', 'Cały przekrój naraz (szerokość pasów zachowana)']].forEach(function (o) {
      var b = S.btn(d, o[1], o[2], function () { opt[o[0]] = !opt[o[0]]; b.classList.toggle('on', opt[o[0]]); }); b.classList.toggle('on', opt[o[0]]);
    });
    S.btn(d, '↺', 'Usuń ręczne zmiany (wszystkie drogi)', function () { delete S.sc.edits; S.commit(); S.draw(); });
  });
  S.layers.addOverlay(gH, '<span title="Edycja krawędzi pasów">✎</span>');
  map.on('overlayadd overlayremove', function () { H.editing = map.hasLayer(gH); box.classList.toggle('sv-hide', !H.editing); draw(); });
  map.on('zoomend', draw);
  H.afterDraw = draw;
  S.draw();
})();
