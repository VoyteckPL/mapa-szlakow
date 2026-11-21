// Sandbox v1 – ręczna edycja krawędzi pasów (warstwa ✎, domyślnie wyłączona).
// Nadpisania: sc.edits[idDrogi] = [pas 1 lewa, pas 1 prawa, pas 2 lewa, ...]: [[x,y],...] w metrach od środka sceny (każdy pas ma własne krawędzie).
// Przeciąganie wierzchołka / odcinka. Wstawianie: przeciągnij kółko w połowie odcinka (albo dwuklik w krawędź) – na wszystkich
// krawędziach, które tam przechodzą. Usuwanie: prawy klik (albo dwuklik) w wierzchołek; prawy klik w fioletową grupę usuwa całą grupę.
// Domyślnie pojedynczy wierzchołek. ⟷ (albo Shift przy przeciąganiu) = cały przekrój (ten sam wierzchołek na wszystkich krawędziach drogi) – szerokość pasów zachowana.
// Przyciąganie: ⊙ do wierzchołków, ⟋ do krawędzi innych pasów, 🧲 do siatki (rozdzielczość ▦).
(function () {
  var S = window.SV, H = window.SVH, map = S.map, TOL = 12; // px
  var gH = L.layerGroup(), openKey = null, opt = { v: true, e: true, sek: false }, shift = false;
  document.addEventListener('keydown', function (e) { if (e.key === 'Shift') shift = true; });
  document.addEventListener('keyup', function (e) { if (e.key === 'Shift') shift = false; });
  var cp = function (l) { return l.map(function (q) { return q.slice(); }); };

  // ręczne krawędzie należą do geometrii, przy której je zrobiono: po ruchu linii OSM / zmianie drogi są ignorowane
  // (krawędzie znów liczone na żywo), a następna edycja zaczyna od świeżej geometrii. Ctrl+Z przywraca.
  function sig() { var sc = S.sc; return JSON.stringify([sc.nodes, sc.roads]); }
  function stale() { var sc = S.sc; if (!sc.edits) return false; if (!sc.editSig) sc.editSig = sig(); return sc.editSig !== sig(); } // bez podpisu (stara / wczytana scena) = pasuje
  H.lanes = function (r, g) {
    var e = !stale() && S.sc.edits && S.sc.edits[r.id];
    if (e && e.length === g.lanes.length && e.length > 2) e = S.sc.edits[r.id] = H.split(e); // stary format (wspólne krawędzie)
    if (e && e.length === g.pasy.length) { g.pasy = e.map(cp); g.asfalt = [g.pasy[0], g.pasy[g.pasy.length - 1]]; g.edyt = true; }
    return g;
  };
  // dziennik ręcznych operacji (do eksportu): przesuń / dodaj / usuń wierzchołek
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  function log(op, r, j, i, z, na) {
    var sc = S.sc; if (!sc.log) sc.log = [];
    sc.log.push({ op: op, droga: r.id, pas: (j >> 1) + 1, krawedz: j % 2 ? 'P' : 'L', w: i, z: z && z.map(r2), na: na && na.map(r2) });
  }
  function roads() { return S.sc.roads.filter(function (r) { return r.pts.length > 1; }); }
  function ensure(r) { // pierwsza edycja: kopia wyliczonych krawędzi
    if (stale()) { delete S.sc.edits; delete S.sc.log; }
    if (!S.sc.edits) S.sc.edits = {};
    S.sc.editSig = sig();
    var g = H.lanes(r, (function (g) { if (!g.pasy) g.pasy = H.split(g.lanes); return g; })(G.lines(S.sc, r, S.P())));
    if (!S.sc.edits[r.id] || S.sc.edits[r.id].length !== 2 * r.lanes) S.sc.edits[r.id] = g.pasy.map(cp);
    return S.sc.edits[r.id];
  }
  function all() { var p = S.P(); return roads().map(function (r) { return { r: r, L: H.lanes(r, (function (g) { if (!g.pasy) g.pasy = H.split(g.lanes); return g; })(G.lines(S.sc, r, p))).pasy }; }); }
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
    if (opt.sek === shift) return [j]; // ⟷ wył.: jeden wierzchołek; Shift odwraca
    return E.map(function (l, k) { return k; }).filter(function (k) { return i < E[k].length; });
  }

  function draw() {
    gH.clearLayers(); if (!map.hasLayer(gH)) return; var V = [], M = [];
    all().forEach(function (o) {
      var r = o.r, ed = !stale() && !!(S.sc.edits && S.sc.edits[r.id]);
      o.L.forEach(function (l, j) {
        for (var i = 0; i < l.length - 1; i++) (function (i) { // odcinki: przeciąganie i dwuklik = nowy wierzchołek
          var seg = L.polyline([S.ll(l[i]), S.ll(l[i + 1])], { weight: 12, opacity: 0, bubblingMouseEvents: false }).addTo(gH);
          seg.on('mousedown', function (e) { L.DomEvent.stop(e); dragSeg(r, j, i, e.latlng); });
          seg.on('dblclick', function (e) { L.DomEvent.stop(e); var q = S.xy(e.latlng); insertAt(hits(q), q).forEach(function (x) { log('dodaj', x.r, x.j, x.i, null, S.sc.edits[x.r.id][x.j][x.i]); }); S.commit(); S.draw(); });
          M.push({ q: [(l[i][0] + l[i + 1][0]) / 2, (l[i][1] + l[i + 1][1]) / 2], len: px(l[i]).distanceTo(px(l[i + 1])) });
        })(i);
        l.forEach(function (v, i) { V.push({ r: r, j: j, i: i, v: v, ed: ed, n: o.L.length / 2, P: px(v) }); });
      });
    });
    // wierzchołki w jednym miejscu (< 6 px) = grupa: zwinięta jeden fioletowy uchwyt; klik rozwija wachlarz z etykietami
    // „droga:krawędź/pasy” (tylko jedna grupa naraz). Klik w pojedynczy wierzchołek pokazuje jego etykietę.
    var used = [];
    V.forEach(function (h, a) {
      if (used[a]) return; var C = [h]; used[a] = 1;
      V.forEach(function (g, b) { if (!used[b] && h.P.distanceTo(g.P) < 6) { C.push(g); used[b] = 1; } });
      var key = h.r.id + ':' + h.j + ':' + h.i, op = openKey === key;
      if (C.length > 1 && !op) return collapsed(C, key);
      C.forEach(function (g, k) {
        g.off = C.length < 2 ? L.point(0, 0) : L.point(Math.cos(2 * Math.PI * k / C.length - Math.PI / 2), Math.sin(2 * Math.PI * k / C.length - Math.PI / 2)).multiplyBy(22 + 2 * C.length);
        g.lab = op; g.multi = C.length > 1; g.key = key; handle(g);
      });
    });
    // uchwyty w połowie odcinków (gdy odcinek ≥ 40 px): przeciągnięcie wstawia wierzchołek – na wszystkich krawędziach,
    // które tu przechodzą (wspólna granica pasów zostaje wspólna; rozdzielić można potem w grupie)
    var MP = [];
    M.forEach(function (o) { if (o.len < 40) return; var P0 = px(o.q); if (MP.some(function (z) { return z.distanceTo(P0) < 6; })) return; MP.push(P0); mid(o.q); });
  }
  // wszystkie odcinki krawędzi (dowolnej drogi) przechodzące przez punkt q (≤ 3 px): {r, j, i, t}
  function hits(q) {
    var P0 = px(q), out = [];
    all().forEach(function (o) { o.L.forEach(function (l, j) { for (var i = 0; i < l.length - 1; i++) {
      var a = l[i], b = l[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1);
      if (t <= 0.01 || t >= 0.99) continue;
      if (P0.distanceTo(px([a[0] + dx * t, a[1] + dy * t])) <= 3) { out.push({ r: o.r, j: j, i: i, t: t }); break; } } }); });
    return out;
  }
  // wstawia wierzchołek w q na trafionych odcinkach (⟷: na całym przekroju ich dróg, w tym samym miejscu odcinka); zwraca [{r, j, i}]
  function insertAt(H0, q) {
    var add = [];
    H0.forEach(function (h) { var E = ensure(h.r); group(E, h.j, h.i).forEach(function (k) {
      if (h.i + 1 >= E[k].length || add.some(function (x) { return x.r === h.r && x.j === k; })) return;
      add.push({ r: h.r, j: k, i: h.i, t: h.t, own: k === h.j }); }); });
    add.forEach(function (x) { var l = S.sc.edits[x.r.id][x.j], p0 = l[x.i], p1 = l[x.i + 1];
      l.splice(x.i + 1, 0, x.own ? q.slice() : [p0[0] + (p1[0] - p0[0]) * x.t, p0[1] + (p1[1] - p0[1]) * x.t]); x.i++; });
    return add;
  }
  function mid(q) {
    var m = L.marker(S.ll(q), { draggable: true, title: 'Przeciągnij, żeby wstawić wierzchołek (dwuklik w krawędź też wstawia)',
      icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="sv-mid"></div>' }) }).addTo(gH), A, orig;
    m.on('dragstart', function () { A = insertAt(hits(q), q); orig = A.map(function (x) { return S.sc.edits[x.r.id][x.j][x.i].slice(); }); });
    m.on('drag', function (e) {
      if (!A.length) return;
      var tq = snapTo(S.xy(e.target.getLatLng()), function (id, jj, ii) { return A.some(function (x) { return x.r.id === id && x.j === jj && x.i === ii; }); });
      var dx = tq[0] - q[0], dy = tq[1] - q[1];
      A.forEach(function (x, k) { S.sc.edits[x.r.id][x.j][x.i] = [orig[k][0] + dx, orig[k][1] + dy]; });
      S.drawLines();
    });
    m.on('dragend', function () { A.forEach(function (x) { log('dodaj', x.r, x.j, x.i, null, S.sc.edits[x.r.id][x.j][x.i]); }); S.commit(); S.draw(); });
  }
  function collapsed(C, key) {
    var m = L.marker(S.ll(C[0].v), { title: C.length + ' wierzchołki w jednym miejscu – kliknij, żeby rozwinąć',
      icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="sv-h sv-multi"></div>' }) }).addTo(gH);
    m.on('click', function (e) { L.DomEvent.stop(e); openKey = key; draw(); });
    m.on('contextmenu', function (e) { L.DomEvent.stop(e); L.DomEvent.preventDefault(e.originalEvent); removeAll(C); });
  }
  // usuwanie: tylko wierzchołki środkowe (końce krawędzi zostają); od końca listy, żeby indeksy się nie przesunęły
  function removeAll(C) {
    C.slice().sort(function (a, b) { return b.i - a.i; }).forEach(function (h) { var l = ensure(h.r)[h.j]; if (h.i > 0 && h.i < l.length - 1) log('usun', h.r, h.j, h.i, l.splice(h.i, 1)[0]); });
    S.commit(); S.draw();
  }
  function handle(h) {
    var r = h.r, j = h.j, i = h.i, off = h.off, at = h.P.add(off);
    if (h.lab) L.polyline([S.ll(h.v), map.containerPointToLatLng(at)], { color: '#000', weight: 1, opacity: 0.6, interactive: false }).addTo(gH);
    var html = '<div class="sv-h' + (h.ed ? ' sv-ed' : '') + (h.multi ? ' sv-multi' : '') + '"></div>' + (h.lab ? '<div class="sv-hl">' + r.id + ':' + ((j >> 1) + 1) + '/' + h.n + 'p ' + (j % 2 ? 'P' : 'L') + '</div>' : '');
    var m = L.marker(map.containerPointToLatLng(at), { draggable: true, title: 'Droga ' + r.id + ', pas ' + ((j >> 1) + 1) + ' z ' + h.n + ' (od lewej), krawędź ' + (j % 2 ? 'prawa' : 'lewa') + ', wierzchołek ' + i,
      icon: L.divIcon({ className: '', iconSize: [0, 0], html: html }) }).addTo(gH);
    var orig;
    m.on('dragstart', function () { orig = ensure(r).map(cp); });
    m.on('drag', function (e) {
      var E = S.sc.edits[r.id], ks = group(E, j, i);
      var q0 = S.xy(map.containerPointToLatLng(map.latLngToContainerPoint(e.target.getLatLng()).subtract(off)));
      var tq = snapTo(q0, function (id, jj, ii) { return id === r.id && ii === i && ks.indexOf(jj) >= 0; });
      var dx = tq[0] - orig[j][i][0], dy = tq[1] - orig[j][i][1];
      ks.forEach(function (k) { E[k][i] = [orig[k][i][0] + dx, orig[k][i][1] + dy]; });
      S.drawLines();
    });
    m.on('dragend', function () { var E = S.sc.edits[r.id]; group(E, j, i).forEach(function (k) {
      if (E[k][i] && (E[k][i][0] !== orig[k][i][0] || E[k][i][1] !== orig[k][i][1])) log('przesun', r, k, i, orig[k][i], E[k][i]); });
      S.commit(); S.draw(); });
    m.on('dblclick', function (e) { L.DomEvent.stop(e); remove(r, j, i); });
    m.on('contextmenu', function (e) { L.DomEvent.stop(e); L.DomEvent.preventDefault(e.originalEvent); remove(r, j, i); });
    m.on('click', function (e) { L.DomEvent.stop(e); if (!h.multi) { openKey = openKey === h.key ? null : h.key; draw(); } });
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
  function remove(r, j, i) { // pojedynczy (⟷: cały przekrój); końce krawędzi zostają
    var E = ensure(r);
    group(E, j, i).forEach(function (k) { if (i > 0 && i < E[k].length - 1) log('usun', r, k, i, E[k].splice(i, 1)[0]); });
    S.commit(); S.draw();
  }

  // panel opcji (widoczny, gdy warstwa ✎ włączona)
  var box;
  S.ctl('topright', function (d) {
    box = d; d.classList.add('sv-hide');
    [['v', '⊙', 'Przyciągaj do wierzchołków'], ['e', '⟋', 'Przyciągaj do krawędzi pasów'], ['sek', '⟷', 'Cały przekrój naraz (szerokość pasów zachowana); Shift = odwrotnie']].forEach(function (o) {
      var b = S.btn(d, o[1], o[2], function () { opt[o[0]] = !opt[o[0]]; b.classList.toggle('on', opt[o[0]]); }); b.classList.toggle('on', opt[o[0]]);
    });
    S.btn(d, '↺', 'Usuń ręczne zmiany (wszystkie drogi)', function () { delete S.sc.edits; delete S.sc.log; S.commit(); S.draw(); });
  });
  S.layers.addOverlay(gH, '<span title="Edycja krawędzi pasów">✎</span>');
  map.on('overlayadd overlayremove', function () { H.editing = map.hasLayer(gH); box.classList.toggle('sv-hide', !H.editing); draw(); });
  map.on('zoomend', draw);
  map.on('click', function () { if (openKey) { openKey = null; draw(); } });
  H.afterDraw = draw;
  S.draw();
})();
