// Sandbox v1: węzeł Nm. Leaflet, rysowanie klikiem, przeciągane punkty, krawędzie pasów.
(function () {
  var KEY = 'sv1-scena', GRID = 1.75, GRIDS = [0.875, 1.75, 3.5, 5, 10], H = window.SVH = {}, O = { lat: 54.5189, lng: 18.5305 };
  var map = L.map('map', { zoomControl: false, maxZoom: 22, doubleClickZoom: false }).setView([O.lat, O.lng], 18);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  // --- podkłady i warstwy ---
  var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 22, attribution: '© OpenStreetMap' });
  var orto = L.tileLayer.wms('https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution',
    { layers: 'Raster', format: 'image/jpeg', maxZoom: 22, attribution: 'Ortofoto © GUGiK' }).addTo(map);
  var gLin = L.layerGroup().addTo(map), gPts = L.layerGroup().addTo(map);
  var gEdge = L.layerGroup().addTo(map), gAsf = L.layerGroup(), gGrid = L.layerGroup(), gAng = L.layerGroup().addTo(map), gTmp = L.layerGroup().addTo(map);
  var ic = function (t, s) { return '<span title="' + t + '">' + s + '</span>'; };
  var lay = L.control.layers({ [ic('Ortofoto (Geoportal)', '🛰️')]: orto, [ic('OSM', '🗺️')]: osm },
    { [ic('Linie OSM', '〰️')]: gLin, [ic('Punkty', '⚬')]: gPts, [ic('Krawędzie pasów', '🛣️')]: gEdge, [ic('Asfalt', '⬛')]: gAsf, [ic('Siatka', '▦')]: gGrid, [ic('Kąty między drogami', '∠')]: gAng },
    { position: 'topright', collapsed: true }).addTo(map);
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
  function commit() { var s = JSON.stringify(sc); if (s === last) return; if (last) hist.push(last); if (hist.length > 100) hist.shift(); last = s; try { localStorage.setItem(KEY, s); } catch (e) {} }
  function undo() { if (!hist.length) return; last = hist.pop(); sc = JSON.parse(last); try { localStorage.setItem(KEY, last); } catch (e) {} sel = null; drawing = null; draw(); }
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
  // sąsiedzi węzła wzdłuż dróg (kierunki odcinków wychodzących z węzła)
  function nbrs(id) { var o = []; sc.roads.forEach(function (r) { r.pts.forEach(function (q, i) { if (q !== id) return;
    if (i > 0) o.push(r.pts[i - 1]); if (i < r.pts.length - 1) o.push(r.pts[i + 1]); }); }); return o; }
  function drawAng() { // warstwa ∠: kąty między kolejnymi odcinkami w każdym węźle (2 odcinki – tylko mniejszy kąt, prosto pomijane)
    gAng.clearLayers(); if (!map.hasLayer(gAng)) return; var p = P();
    Object.keys(sc.nodes).forEach(function (id) {
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
    if (!snapA) return p0; var nb = nbrs(id); if (!nb.length) return p0;
    var P0 = P(), q = nb[0], Q = P0[q], v = xy(p0), len = Math.hypot(v[0] - Q[0], v[1] - Q[1]);
    var ref = nbrs(q).filter(function (z) { return z !== id; })[0], b = ref ? Math.atan2(P0[ref][1] - Q[1], P0[ref][0] - Q[0]) : 0;
    var a = Math.atan2(v[1] - Q[1], v[0] - Q[0]) - b, st = Math.PI / 36; a = Math.round(a / st) * st + b;
    return ll([Q[0] + Math.cos(a) * len, Q[1] + Math.sin(a) * len]);
  }
  function drawLines() {
    gLin.clearLayers(); gEdge.clearLayers(); gAsf.clearLayers(); drawAng();
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
      arrow(r);
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
      m.on('drag', function (e) { var p = snapAng(id, e.target.getLatLng()); n.lat = p.lat; n.lng = p.lng; live(); });
      m.on('dragend', function (e) { var p = snapA ? snapAng(id, e.target.getLatLng()) : snapLL(e.target.getLatLng()); n.lat = p.lat; n.lng = p.lng; commit(); draw(); });
    });
  }
  var raf = 0; function live() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; drawLines(); }); }
  function draw() { drawLines(); drawPts(); panel(); drawGrid(); gTmp.clearLayers(); if (H.afterDraw) H.afterDraw(); }
  function drawGrid() {
    gGrid.clearLayers(); if (!map.hasLayer(gGrid) || map.getZoom() < 16) return;
    var b = map.getBounds(), a = xy(b.getSouthWest()), c = xy(b.getNorthEast());
    if ((c[0] - a[0]) / GRID + (c[1] - a[1]) / GRID > 600) return; // za gęsto przy tym zoomie
    var st = { color: '#fff', weight: 1, opacity: .35, interactive: false };
    for (var x = Math.floor(a[0] / GRID) * GRID; x <= c[0]; x += GRID) pl([[x, a[1]], [x, c[1]]], st, gGrid);
    for (var y = Math.floor(a[1] / GRID) * GRID; y <= c[1]; y += GRID) pl([[a[0], y], [c[0], y]], st, gGrid);
  }
  map.on('moveend overlayadd', drawGrid);
  map.on('overlayadd overlayremove', drawAng);
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
    if (e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape' || e.key === 'Enter') { if (drawing) endDraw(); else if (sel) { sel = null; draw(); } }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
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

  // prawy górny: config, siatka/przyciąganie, cofnij
  ctl('topright', function (d) {
    var body = foldable(d, '⧉', 'Config dla Claude'); body.classList.add('sv-copy');
    var ta = L.DomUtil.create('textarea', '', body); ta.placeholder = 'Opisz problem…';
    var row = L.DomUtil.create('div', 'sv-row', body);
    btn(row, '📋', 'Kopiuj config + opis', function () {
      var b = this, txt = JSON.stringify(config(ta.value), null, 1);
      copy(txt); b.textContent = '✓'; setTimeout(function () { b.textContent = '📋'; }, 1200);
    });
    btn(row, '⤓', 'Wczytaj config (z pola lub schowka)', function () {
      var v = ta.value.trim();
      (v.charAt(0) === '{' ? Promise.resolve(v) : navigator.clipboard.readText()).then(function (t) {
        var o = JSON.parse(t); setScene(o.scena || o); sel = null; drawing = null; commit(); map.setView([O.lat, O.lng]); draw(); ta.value = '';
      }).catch(function () { ta.value = ''; ta.placeholder = 'Wklej tu config i kliknij ⤓'; });
    });
    // wzorce: zrzuty kolejnych ustawień (kąt, offsety, ręczne krawędzie) zbierane lokalnie, na koniec kopiowane razem
    var WK = 'sv1-wzorce', wz = function () { try { return JSON.parse(localStorage.getItem(WK)) || []; } catch (e) { return []; } };
    var row2 = L.DomUtil.create('div', 'sv-row', body), cnt;
    btn(row2, '💾', 'Zapisz wzorzec (aktualna scena + opis z pola); potem ręczne zmiany są czyszczone', function () {
      var c = config(ta.value); delete c.scena.edits; delete c.scena.editSig; delete c.scena.log; delete sc.log; c.nr = wz().length + 1;
      var a = wz(); a.push(c); try { localStorage.setItem(WK, JSON.stringify(a)); } catch (e) {}
      delete sc.edits; ta.value = ''; commit(); draw(); upd();
    });
    btn(row2, '📚', 'Kopiuj wszystkie wzorce', function () {
      var b = this; copy(JSON.stringify({ strona: 'sandbox-v1.html', wzorce: wz() }, null, 1)); b.textContent = '✓'; setTimeout(function () { b.textContent = '📚'; }, 1200);
    });
    btn(row2, '🗑', 'Usuń wszystkie zapisane wzorce', function () { if (wz().length && confirm('Usunąć ' + wz().length + ' wzorców?')) { localStorage.removeItem(WK); upd(); } });
    cnt = L.DomUtil.create('span', 'sv-val', row2);
    function upd() { cnt.textContent = wz().length + ' wz.'; } upd();
  });
  ctl('topright', function (d) {
    var s = btn(d, '🧲', 'Przyciąganie do siatki', function () { snap = !snap; s.classList.toggle('on', snap); });
    var sa = btn(d, '∠5', 'Przyciąganie kąta co 5° (względem drugiej drogi w sąsiednim węźle)', function () { snapA = !snapA; sa.classList.toggle('on', snapA); });
    sa.classList.add('sv-tpl');
    var gb = btn(d, '▦' + GRID, 'Rozdzielczość siatki [m]', function () { GRID = GRIDS[(GRIDS.indexOf(GRID) + 1) % GRIDS.length]; gb.textContent = '▦' + GRID; drawGrid(); });
    gb.classList.add('sv-tpl');
    btn(d, '↶', 'Cofnij (Ctrl+Z)', undo);
  });
  function copy(txt) {
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(function () {
      var t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    });
  }
  function auto(r, p) { var g = G.lines(sc, r, p); return g.pasy || H.split(g.lanes); } // geometria z reguł (bez ręcznych zmian)
  function katy(id, p) { // kąty między kolejnymi liniami OSM w węźle [°], z nazwami dróg
    var a = []; sc.roads.forEach(function (r) { r.pts.forEach(function (q, i) { if (q !== id) return;
      if (i > 0) a.push({ d: r.id, q: r.pts[i - 1] }); if (i < r.pts.length - 1) a.push({ d: r.id, q: r.pts[i + 1] }); }); });
    if (a.length < 2) return undefined;
    a.forEach(function (o) { o.t = Math.atan2(p[o.q][1] - p[id][1], p[o.q][0] - p[id][0]); }); a.sort(function (x, y) { return x.t - y.t; });
    return a.map(function (o, i) { var b = a[(i + 1) % a.length], d = (b.t - o.t) * 180 / Math.PI; if (d <= 0) d += 360;
      return { miedzy: [o.d, b.d], kat: Math.round(d * 10) / 10 }; }).filter(function (o) { return a.length > 2 || o.kat <= 180; });
  }
  function config(opis) {
    var p = P(), r2 = function (v) { return Math.round(v * 100) / 100; }, pts = function (l) { return l.map(function (q) { return q.map(r2); }); };
    var c0 = { strona: 'sandbox-v1.html', opis: opis, szablon: sc.tpl,
      uwaga: 'xy w metrach od srodka; offset w pasach, + = w prawo wzgledem kierunku OSM; pasy od lewej, kazdy pas ma wlasna lewa i prawa krawedz',
      wezly: Object.keys(sc.nodes).map(function (k) { return { id: k, nm: sc.nodes[k].main || undefined, typ: G.nodeType(sc, k, p), xy: p[k].map(r2), katy: katy(k, p) }; }),
      drogi: sc.roads.filter(function (r) { return r.pts.length > 1; }).map(function (r) { var g = lanesOf(r, p);
        return { id: r.id, pts: r.pts, pasy: r.lanes, szer_pasa: r.w, offset_pocz: r.o0 || 0, offset_kon: r.o1 || 0,
          offset_auto: [G.endInfo(sc, r, true, p).oAuto, G.endInfo(sc, r, false, p).oAuto].map(function (v) { return v == null ? null : r2(v); }),
          pasy_krawedzie: kr(g.pasy), recznie: g.edyt || undefined,
          pasy_krawedzie_auto: g.edyt ? kr(auto(r, p)) : undefined }; }),
      scena: sc };
    if (c0.drogi.some(function (d) { return d.recznie; }) && sc.log) c0.operacje = sc.log; // dziennik ręcznych zmian
    return c0;
    function kr(Pz) { return Pz.filter(function (l, k) { return k % 2 === 0; }).map(function (l, j) { return { lewa: pts(l), prawa: pts(Pz[2 * j + 1]) }; }); }
  }

  // prawy dolny: zaznaczona droga lub punkt
  var rp; ctl('bottomright', function (d) { rp = d; });
  function num(body, icon, title, get, setv, step, min, max, fmt) {
    var rw = L.DomUtil.create('div', 'sv-row', body), s = L.DomUtil.create('span', 'sv-val', rw); s.textContent = icon; s.title = title;
    function ch(dv) { var v = Math.round((get() + dv) * 100) / 100; if (v < min || v > max) return; setv(v); commit(); draw(); }
    btn(rw, '−', title + ' −', function () { ch(-step); });
    var v = L.DomUtil.create('span', 'sv-val', rw); v.textContent = fmt ? fmt(get()) : get();
    btn(rw, '+', title + ' +', function () { ch(step); });
  }
  var sgn = function (v) { return (v > 0 ? '+' : '') + v; };
  function panel() {
    rp.innerHTML = ''; rp.classList.toggle('sv-hide', !sel); if (!sel) return;
    var body = L.DomUtil.create('div', 'sv-body', rp);
    if (sel.t === 'road') {
      var r = sc.roads.filter(function (x) { return x.id === sel.id; })[0]; if (!r) { sel = null; return panel(); }
      num(body, '≡', 'Liczba pasów', function () { return r.lanes; }, function (v) { r.lanes = v; }, 1, 1, 8);
      num(body, '↔', 'Szerokość pasa [m]', function () { return r.w; }, function (v) { r.w = v; }, 0.25, 2.5, 5);
      var rw = L.DomUtil.create('div', 'sv-row', body); L.DomUtil.create('span', 'sv-val', rw).textContent = r.id;
      btn(rw, '⇄', 'Odwróć kierunek', function () { r.pts.reverse(); var a = r.o0 || 0; r.o0 = -(r.o1 || 0); r.o1 = -a; commit(); draw(); });
      btn(rw, '🗑', 'Usuń drogę (Del)', function () { sc.roads.splice(sc.roads.indexOf(r), 1); cleanup(); sel = null; commit(); draw(); });
    } else {
      var id = sel.id, n = sc.nodes[id]; if (!n) { sel = null; return panel(); }
      var top = L.DomUtil.create('div', 'sv-row', body); L.DomUtil.create('span', 'sv-val', top).textContent = id;
      var nb = btn(top, '◉', 'Nm (węzeł główny)', function () { n.main = !n.main; commit(); draw(); }); nb.classList.toggle('on', !!n.main);
      btn(top, '🗑', 'Usuń punkt (Del)', function () { delNode(id); sel = null; commit(); draw(); });
      sc.roads.forEach(function (r) { // offset dróg kończących się w tym punkcie
        ['o0', 'o1'].forEach(function (k, e) {
          if (r.pts[e ? r.pts.length - 1 : 0] !== id) return;
          if (G.endInfo(sc, r, !e, P()).oAuto != null) return; // offset automatyczny (odnoga rozwidlenia)
          num(body, r.id, 'Offset ' + r.id + ' przy tym końcu [pasy, + w prawo]', function () { return r[k] || 0; }, function (v) { r[k] = v; }, 0.5, -8, 8, sgn);
        });
      });
    }
  }

  // API dla edycja.js
  window.SV = { map: map, layers: lay, get sc() { return sc; }, xy: xy, ll: ll, P: P, commit: commit, draw: draw, drawLines: drawLines,
    grid: function () { return GRID; }, snapOn: function () { return snap; }, ctl: ctl, btn: btn };
  // --- start ---
  var saved = null; try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  // widok mapy (środek, zoom) pamiętany po F5
  var V = null; try { V = JSON.parse(localStorage.getItem('sv1-widok')); } catch (e) {}
  map.on('moveend', function () { try { var c = map.getCenter(); localStorage.setItem('sv1-widok', JSON.stringify({ lat: c.lat, lng: c.lng, z: map.getZoom() })); } catch (e) {} });
  if (saved && saved.roads) { setScene(saved); last = JSON.stringify(sc); if (V) map.setView([V.lat, V.lng], V.z); else map.setView([O.lat, O.lng], 18); draw(); }
  else loadTpl('2-2', TPL[0].it[0][1]);
})();
