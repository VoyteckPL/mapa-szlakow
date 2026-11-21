// Sandbox v1: węzeł Nm. Leaflet, rysowanie klikiem, przeciągane punkty, krawędzie pasów.
(function () {
  var KEY = 'sv1-scena', GRID = 1.75, GRIDS = [0.875, 1.75, 3.5, 5, 10], H = window.SVH = {}, O = { lat: 54.5189, lng: 18.5305 };
  var map = L.map('map', { zoomControl: false, maxZoom: 25, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 120, doubleClickZoom: false }).setView([O.lat, O.lng], 18);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  // --- podkłady i warstwy ---
  var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 25, attribution: '© OpenStreetMap' });
  var orto = L.tileLayer.wms('https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution',
    { layers: 'Raster', format: 'image/jpeg', maxZoom: 25, attribution: 'Ortofoto © GUGiK' }).addTo(map);
  var gLin = L.layerGroup().addTo(map), gPts = L.layerGroup().addTo(map);
  var gEdge = L.layerGroup().addTo(map), gAsf = L.layerGroup(), gGrid = L.layerGroup(), gAng = L.layerGroup().addTo(map), gTmp = L.layerGroup().addTo(map);
  var ic = function (t, s) { return '<span title="' + t + '">' + s + '</span>'; };
  // tło jednolite (kremowe) – podkład bez kafelków
  var tlo = L.layerGroup(); tlo.on('add', function () { map.getContainer().style.background = '#f3ecd9'; }); tlo.on('remove', function () { map.getContainer().style.background = ''; });
  var lay = L.control.layers({ [ic('Ortofoto (Geoportal)', '🛰️')]: orto, [ic('OSM', '🗺️')]: osm, [ic('Tło kremowe', '🟨')]: tlo },
    { [ic('Linie OSM', '〰️')]: gLin, [ic('Punkty', '⚬')]: gPts, [ic('Krawędzie pasów', '🛣️')]: gEdge, [ic('Asfalt', '⬛')]: gAsf, [ic('Siatka', '▦')]: gGrid, [ic('Kąty między drogami', '∠')]: gAng },
    { position: 'topright', collapsed: false }).addTo(map);
  map.createPane('asf').style.zIndex = 350;

  // --- scena, historia ---
  var sc, sel = null, drawing = null, snap = false, snapA = false, hist = [], last = null;
  function xy(ll) { return G.toXY(O, ll); }
  function ll(p) { return G.toLL(O, p); }
  function snapLL(p) { if (!snap) return { lat: p.lat, lng: p.lng }; var q = xy(p); return ll([Math.round(q[0] / GRID) * GRID, Math.round(q[1] / GRID) * GRID]); }
  function newId(pre, obj) { var m = 0; Object.keys(obj).forEach(function (k) { m = Math.max(m, +k.slice(pre.length) || 0); }); return pre + (m + 1); }
  function addNode(lat, lng, main) { var id = newId('n', sc.nodes); sc.nodes[id] = { lat: lat, lng: lng, main: !!main }; return id; }
  function road(pts, lanes, o0, o1) {
    var ids = {}; sc.roads.forEach(function (r) { ids[r.id] = 1; });
    var r = { id: newId('R', ids), pts: pts, lanes: lanes || 2, w: 3.5, o0: o0 || 0, o1: o1 || 0 };
    sc.roads.push(r); return r;
  }
  function commit() { var s = JSON.stringify(sc); if (s === last) return; if (last) hist.push(last); if (hist.length > 100) hist.shift(); last = s; fut = []; try { localStorage.setItem(KEY, s); } catch (e) {} }
  var fut = []; // w przód (ponów)
  function undo() { if (!hist.length) return; if (last) fut.push(last); last = hist.pop(); sc = JSON.parse(last); try { localStorage.setItem(KEY, last); } catch (e) {} sel = null; drawing = null; draw(); }
  function redo() { if (!fut.length) return; if (last) hist.push(last); last = fut.pop(); sc = JSON.parse(last); try { localStorage.setItem(KEY, last); } catch (e) {} sel = null; drawing = null; draw(); }
  function setScene(s) { sc = s; sc.roads = sc.roads.filter(function (r) { return r.pts.length > 1; });
    var cnt = {}; sc.roads.forEach(function (r) { [r.pts[0], r.pts[r.pts.length - 1]].forEach(function (id) { cnt[id] = (cnt[id] || 0) + 1; }); });
    sc.roads.forEach(function (r) { if (r.o == null) return; // stara scena: jeden offset -> przy końcu w węźle
      r.o0 = cnt[r.pts[0]] > 1 ? r.o : 0; r.o1 = cnt[r.pts[r.pts.length - 1]] > 1 ? r.o : 0; delete r.o; }); var ids = Object.keys(sc.nodes); if (sc.srodek) O = sc.srodek; else if (ids.length) O = { lat: sc.nodes[ids[0]].lat, lng: sc.nodes[ids[0]].lng }; sc.srodek = O; }

  // --- szablony (metry; jazda na wschód, prawo = południe). Nm = węzeł 0,0 ---
  function at(x, y, main) { var p = ll([x, y]); return addNode(p.lat, p.lng, main); }
  function prosto(La, Lb) { return function () { var m = at(0, 0, true);
    road([at(-120, 0), at(-60, 0), m], La); road([m, at(60, -8), at(120, -20)], Lb, (Lb - La) / 2); }; } // nowy/kończący pas po prawej
  function rozw(La, Lb, Lc) { return function () { var m = at(0, 0, true);
    road([at(-150, 0), at(-75, 0), m], La);
    road([m, at(75, 0), at(150, 0)], Lb);   // pasy przydzielane automatycznie od lewej
    road([m, at(50, -12), at(110, -40)], Lc); }; }
  var TPL = [
    { k: '1', t: 'Prosto', it: [['2-2', prosto(2, 2)], ['3-3', prosto(3, 3)], ['4-4', prosto(4, 4)]] },
    { k: '2', t: 'Zmiana liczby pasów', it: [['2-3', prosto(2, 3)], ['3-2', prosto(3, 2)], ['3-4', prosto(3, 4)], ['4-3', prosto(4, 3)]] },
    { k: '3', t: 'Rozwidlenia', it: [['2-1+1', rozw(2, 1, 1)], ['3-2+1', rozw(3, 2, 1)], ['3-1+2', rozw(3, 1, 2)], ['4-2+2', rozw(4, 2, 2)], ['4-3+1', rozw(4, 3, 1)]] }
  ];
  function loadTpl(name, fn) {
    var c = map.getCenter(); O = { lat: c.lat, lng: c.lng };
    sc = { nodes: {}, roads: [], tpl: name, srodek: O }; fn(); sel = null; drawing = null; commit(); draw();
  }

  // --- rysowanie ---
  function P() { var o = {}; for (var k in sc.nodes) o[k] = xy(sc.nodes[k]); return o; }
  function pl(line, opt, g) { return L.polyline(line.map(ll), opt).addTo(g); }
  // każdy pas ma własne krawędzie (lewa, prawa) – wspólna granica zdublowana, więc pasy edytuje się niezależnie.
  // pasy = płaska lista 2·L polilinii: pas j → [2j] lewa, [2j+1] prawa (od lewej).
  H.split = function (lanes) { var o = []; for (var j = 0; j + 1 < lanes.length; j++) o.push(lanes[j].map(function (q) { return q.slice(); }), lanes[j + 1].map(function (q) { return q.slice(); })); return o; };
  function lanesOf(r, p) { var g = G.lines(sc, r, p); if (!g.pasy) g.pasy = H.split(g.lanes); return H.lanes ? H.lanes(r, g) : g; } // ręczne nadpisania (edycja.js)
  function drawLines() {
    gLin.clearLayers(); gEdge.clearLayers(); gAsf.clearLayers(); if (H.drawAng) H.drawAng(); if (H.clearTurn) H.clearTurn();
    var p = P();
    sc.roads.forEach(function (r) {
      if (r.pts.length < 2) return;
      var g = lanesOf(r, p);
      var Pz = g.pasy;
      for (var k = 0; k + 1 < Pz.length; k += 2) { // asfalt osobno dla każdego pasa (między jego własnymi krawędziami)
        L.polygon(Pz[k].concat(Pz[k + 1].slice().reverse()).map(ll), { pane: 'asf', stroke: false, fillColor: '#333', fillOpacity: .75, interactive: false }).addTo(gAsf);
        [0, -1].forEach(function (q, e) { if (!g.zamkn[e]) return; // poprzeczne krawędzie końców pasów
          pl([Pz[k][q < 0 ? Pz[k].length - 1 : 0], Pz[k + 1][q < 0 ? Pz[k + 1].length - 1 : 0]], { color: '#ffeb3b', weight: 2, interactive: false }, gEdge); });
      }
      Pz.forEach(function (l, k) { var e = k === 0 || k === Pz.length - 1;
        pl(l, { color: e ? '#ffeb3b' : '#fff', weight: e ? 2 : 1.5, interactive: false }, gEdge); });
      var isSel = sel && sel.t === 'road' && sel.id === r.id;
      var osmLine = L.polyline(r.pts.map(function (id) { return sc.nodes[id]; }), { color: isSel ? '#ff1744' : '#2979ff', weight: isSel ? 4 : 2.5, dashArray: '8 6' }).addTo(gLin);
      var hit = L.polyline(osmLine.getLatLngs(), { opacity: 0, weight: 18 }).addTo(gLin); // szeroka strefa klikania
      hit.on('click', function (e) { L.DomEvent.stopPropagation(e); if (drawing) return; sel = { t: 'road', id: r.id }; draw(); });
      hit.on('dblclick', function (e) { L.DomEvent.stopPropagation(e); });
      arrow(r); if (H.drawTurn) H.drawTurn(r, g);
    });
  }
  function arrow(r) { // strzałka kierunku w połowie długości linii OSM
    var q = r.pts.map(function (id) { return map.latLngToLayerPoint(sc.nodes[id]); }), len = [0];
    for (var i = 1; i < q.length; i++) len.push(len[i - 1] + q[i].distanceTo(q[i - 1]));
    var h = len[len.length - 1] / 2; for (i = 1; i < q.length - 1 && len[i] < h; i++);
    var t = (h - len[i - 1]) / ((len[i] - len[i - 1]) || 1), a = Math.atan2(q[i].y - q[i - 1].y, q[i].x - q[i - 1].x) * 180 / Math.PI;
    var m = map.layerPointToLatLng(L.point(q[i - 1].x + (q[i].x - q[i - 1].x) * t, q[i - 1].y + (q[i].y - q[i - 1].y) * t));
    L.marker(m, { interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="sv-arr" style="transform:rotate(' + a + 'deg)">➤</div>' }) }).addTo(gLin);
  }
  function drawPts() {
    gPts.clearLayers();
    Object.keys(sc.nodes).forEach(function (id) {
      var n = sc.nodes[id], isSel = sel && sel.t === 'node' && sel.id === id;
      var m = L.marker(n, { draggable: true, icon: L.divIcon({ className: '', iconSize: [0, 0],
        html: '<div class="sv-pt' + (n.main ? ' sv-main' : '') + (isSel ? ' sv-sel' : '') + '" title="' + id + (n.main ? ' (Nm)' : '') + '"></div>' }) }).addTo(gPts);
      m.on('click', function (e) { L.DomEvent.stopPropagation(e); nodeClick(id); });
      m.on('drag', function (e) { var p = H.snapAng(id, e.target.getLatLng()); n.lat = p.lat; n.lng = p.lng; live(); });
      m.on('dragend', function (e) { var p = snapA ? H.snapAng(id, e.target.getLatLng()) : snapLL(e.target.getLatLng()); n.lat = p.lat; n.lng = p.lng; commit(); draw(); });
    });
  }
  var raf = 0; function live() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; drawLines(); }); }
  function draw() { drawLines(); drawPts(); if (H.panel) H.panel(); drawGrid(); gTmp.clearLayers(); if (H.afterDraw) H.afterDraw(); }
  function drawGrid() {
    gGrid.clearLayers(); if (!map.hasLayer(gGrid) || map.getZoom() < 16) return;
    var b = map.getBounds(), a = xy(b.getSouthWest()), c = xy(b.getNorthEast());
    if ((c[0] - a[0]) / GRID + (c[1] - a[1]) / GRID > 600) return; // za gęsto przy tym zoomie
    var st = { color: '#fff', weight: 1, opacity: .35, interactive: false };
    for (var x = Math.floor(a[0] / GRID) * GRID; x <= c[0]; x += GRID) pl([[x, a[1]], [x, c[1]]], st, gGrid);
    for (var y = Math.floor(a[1] / GRID) * GRID; y <= c[1]; y += GRID) pl([[a[0], y], [c[0], y]], st, gGrid);
  }
  map.on('moveend overlayadd', drawGrid);
    map.on('zoomend', drawLines);

  // --- edycja klikiem ---
  // Klik w pusty obszar: dodaje punkt (zaczyna nową linię; od zaznaczonego węzła, jeśli jest).
  // Klik w węzeł podczas rysowania: łączy linię z węzłem i kończy. Klik w ostatni punkt / Esc / Enter: koniec.
  // Klik w pusty obszar: odznacza. Dwuklik: dodaje punkt (zaczyna nową linię; od zaznaczonego punktu, jeśli był).
  var prevNode = null, prevT = 0;
  map.on('click', function (e) {
    if (!e.originalEvent.target.isConnected || !sel) return;
    if (sel.t === 'node') { prevNode = sel.id; prevT = Date.now(); }
    sel = null; draw();
  });
  map.on('dblclick', function (e) {
    if (!e.originalEvent.target.isConnected || H.editing) return;
    var from = prevNode && Date.now() - prevT < 600 && sc.nodes[prevNode] ? prevNode : null; prevNode = null;
    var p = snapLL(e.latlng), id = addNode(p.lat, p.lng);
    if (drawing) drawing.pts.push(id);
    else drawing = road(from ? [from, id] : [id]);
    sel = null; commit(); draw(); rubber(e.latlng);
  });
  function nodeClick(id) {
    if (drawing) {
      var t = drawing.pts[drawing.pts.length - 1];
      if (id !== t) drawing.pts.push(id);
      endDraw(); return;
    }
    sel = { t: 'node', id: id }; draw();
  }
  function endDraw() {
    if (!drawing) return; var r = drawing; drawing = null;
    if (r.pts.length < 2) { sc.roads.splice(sc.roads.indexOf(r), 1); cleanup(); }
    commit(); draw();
  }
  function rubber(to) { gTmp.clearLayers(); if (!drawing || !to) return; var n = sc.nodes[drawing.pts[drawing.pts.length - 1]];
    L.polyline([n, to], { color: '#2979ff', weight: 2, dashArray: '4 4', interactive: false }).addTo(gTmp); }
  map.on('mousemove', function (e) { if (drawing) rubber(e.latlng); });
  function cleanup() { // usuń węzły bez dróg
    var used = {}; sc.roads.forEach(function (r) { r.pts.forEach(function (id) { used[id] = 1; }); });
    Object.keys(sc.nodes).forEach(function (id) { if (!used[id]) delete sc.nodes[id]; });
  }
  function delNode(id) {
    sc.roads.forEach(function (r) { r.pts = r.pts.filter(function (x) { return x !== id; }); });
    sc.roads = sc.roads.filter(function (r) { return r.pts.length >= 2; }); delete sc.nodes[id]; cleanup();
  }
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape' || e.key === 'Enter') { if (drawing) endDraw(); else if (sel) { sel = null; draw(); } }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    if (e.key === 'Delete' && sel) { if (sel.t === 'node') delNode(sel.id); else { sc.roads = sc.roads.filter(function (r) { return r.id !== sel.id; }); cleanup(); } sel = null; commit(); draw(); }
  });

  // --- panele ---
  function ctl(pos, build) {
    var C = L.Control.extend({ options: { position: pos }, onAdd: function () {
      var d = L.DomUtil.create('div', 'sv-box leaflet-control'); L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); build(d); return d; } });
    return new C().addTo(map);
  }
  function btn(par, txt, title, fn) { var b = L.DomUtil.create('button', 'sv-btn', par); b.innerHTML = txt; b.title = title; b.onclick = fn; return b; }
  function foldable(d, icon, title) {
    var body, t = btn(d, icon, title, function () { body.classList.toggle('sv-hide'); t.classList.toggle('on'); });
    body = L.DomUtil.create('div', 'sv-body sv-hide', d); return body;
  }

  // lewy: szablony w kategoriach
  ctl('topleft', function (d) {
    var body = foldable(d, '▤', 'Szablony');
    TPL.forEach(function (cat) {
      var row = L.DomUtil.create('div', 'sv-row', body), list;
      var cb = btn(row, cat.k, cat.t, function () { list.classList.toggle('sv-hide'); cb.classList.toggle('on'); });
      cb.classList.add('sv-cat');
      list = L.DomUtil.create('div', 'sv-row sv-hide', row);
      cat.it.forEach(function (t) { btn(list, t[0], t[0], function () { loadTpl(t[0], t[1]); }).classList.add('sv-tpl'); });
    });
  });

  // API dla edycja.js
  window.SV = { map: map, layers: lay, get sc() { return sc; }, xy: xy, ll: ll, P: P, commit: commit, draw: draw, drawLines: drawLines,
    grid: function () { return GRID; }, snapOn: function () { return snap; }, ctl: ctl, btn: btn,
    // dla modułów nm-*.js (katy, menu, panel, start)
    get sel() { return sel; }, set sel(v) { sel = v; }, get snap() { return snap; }, set snap(v) { snap = v; },
    get snapA() { return snapA; }, set snapA(v) { snapA = v; }, get GRID() { return GRID; }, set GRID(v) { GRID = v; }, GRIDS: GRIDS,
    get O() { return O; }, set O(v) { O = v; }, gAng: gAng, drawGrid: drawGrid, undo: undo, redo: redo, lanesOf: lanesOf, cleanup: cleanup, delNode: delNode,
    setScene: setScene, loadTpl: loadTpl, TPL: TPL, get last() { return last; }, set last(v) { last = v; }, KEY: KEY };
})();
