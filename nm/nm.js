// Sandbox węzła Nm: Leaflet, przeciągane punkty OSM, krawędzie pasów.
(function () {
  var KEY = 'nm-scena-v1', O = { lat: 54.5189, lng: 18.5305 }; // środek układu lokalnego (Gdynia)
  var map = L.map('map', { zoomControl: false, maxZoom: 22 }).setView([O.lat, O.lng], 18);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  // --- podkłady i warstwy ---
  var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxNativeZoom: 19, maxZoom: 22, attribution: '© OpenStreetMap' }).addTo(map);
  var orto = L.tileLayer.wms('https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution',
    { layers: 'Raster', format: 'image/jpeg', maxZoom: 22, attribution: 'Ortofoto © GUGiK' });
  var gOsm = L.layerGroup().addTo(map), gEdge = L.layerGroup().addTo(map);
  L.control.layers(
    { '<span title="OSM">🗺️</span>': osm, '<span title="Ortofoto (Geoportal)">🛰️</span>': orto },
    { '<span title="Linie OSM i punkty">〰️</span>': gOsm, '<span title="Krawędzie pasów">🛣️</span>': gEdge },
    { position: 'topright', collapsed: true }).addTo(map);

  // --- scena ---
  var sc, sel = null, nid = 0;
  function xy2ll(x, y) { return G.toLL(O, [x, y]); }
  function node(x, y, main) { var id = 'n' + (++nid), ll = xy2ll(x, y); sc.nodes[id] = { lat: ll.lat, lng: ll.lng, main: !!main }; return id; }
  // Szablony: drogi w metrach względem środka mapy. A kończy się w Nm, B zaczyna się w Nm.
  var TPL = {
    '1': [
      { id: '1-1', make: function () { var m = node(0, 0, true);
        return [{ pts: [node(-120, 0), node(-60, 0), m], lanes: 2 }, { pts: [m, node(60, -8), node(120, -20)], lanes: 2 }]; } },
      { id: '1-1+1', todo: true }
    ]
  };
  function loadTpl(t) {
    var c = map.getCenter(); O = { lat: c.lat, lng: c.lng };
    sc = { nodes: {}, roads: [], tpl: t.id }; nid = 0;
    t.make().forEach(function (r, i) { sc.roads.push({ id: 'R' + (i + 1), pts: r.pts, lanes: r.lanes, w: 3.5 }); });
    sel = null; save(); draw();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(sc)); } catch (e) {} }
  function restore() {
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.roads) { sc = s;
      nid = Math.max.apply(null, Object.keys(s.nodes).map(function (k) { return +k.slice(1) || 0; }));
      var ids = Object.keys(s.nodes); if (ids.length) O = { lat: s.nodes[ids[0]].lat, lng: s.nodes[ids[0]].lng };
      return true; } } catch (e) {}
    return false;
  }

  // --- rysowanie ---
  function XY() { var P = {}; for (var k in sc.nodes) P[k] = G.toXY(O, sc.nodes[k]); return P; }
  function draw() {
    gOsm.clearLayers(); gEdge.clearLayers();
    var P = XY();
    sc.roads.forEach(function (r) {
      G.edges(sc, r, P).forEach(function (line, j) {
        L.polyline(line.map(function (p) { return G.toLL(O, p); }),
          { color: (j === 0 || j === r.lanes) ? '#111' : '#555', weight: 2, dashArray: (j === 0 || j === r.lanes) ? null : '6 6', interactive: false }).addTo(gEdge);
      });
      var pl = L.polyline(r.pts.map(function (id) { return sc.nodes[id]; }),
        { color: sel === r.id ? '#d50000' : '#1565c0', weight: 3 }).addTo(gOsm);
      pl.on('click', function (e) { L.DomEvent.stop(e); sel = r.id; draw(); });
    });
    Object.keys(sc.nodes).forEach(function (id) {
      var n = sc.nodes[id];
      var m = L.marker(n, { draggable: true, icon: L.divIcon({ className: '', html: '<div class="nm-pt' + (n.main ? ' nm-main' : '') + '" title="' + id + (n.main ? ' Nm' : '') + '"></div>', iconSize: [0, 0] }) }).addTo(gOsm);
      m.on('drag', function (e) { var ll = e.target.getLatLng(); n.lat = ll.lat; n.lng = ll.lng; drawLive(); });
      m.on('dragend', function () { save(); draw(); });
    });
    roadPanel();
  }
  var raf = 0; function drawLive() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; redrawEdges(); }); }
  function redrawEdges() { // podczas przeciągania przerysuj tylko linie, markery zostają
    gEdge.clearLayers(); var P = XY();
    gOsm.eachLayer(function (l) { if (l instanceof L.Polyline) gOsm.removeLayer(l); });
    sc.roads.forEach(function (r) {
      G.edges(sc, r, P).forEach(function (line, j) {
        L.polyline(line.map(function (p) { return G.toLL(O, p); }), { color: (j === 0 || j === r.lanes) ? '#111' : '#555', weight: 2, dashArray: (j === 0 || j === r.lanes) ? null : '6 6', interactive: false }).addTo(gEdge);
      });
      L.polyline(r.pts.map(function (id) { return sc.nodes[id]; }), { color: sel === r.id ? '#d50000' : '#1565c0', weight: 3 }).addTo(gOsm);
    });
  }
  map.on('click', function (e) { if (!e.originalEvent.target.isConnected) return; if (sel) { sel = null; draw(); } });

  // --- panele ---
  function ctl(pos, build) {
    var C = L.Control.extend({ options: { position: pos }, onAdd: function () {
      var d = L.DomUtil.create('div', 'nm-box leaflet-control'); L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); build(d); return d; } });
    return new C().addTo(map);
  }
  function btn(par, txt, title, fn) { var b = L.DomUtil.create('button', 'nm-btn', par); b.innerHTML = txt; b.title = title; b.onclick = fn; return b; }
  function foldable(d, icon, title) { // chowany panel: ikona + ciało
    var body; var t = btn(d, icon, title, function () { body.classList.toggle('nm-hide'); t.classList.toggle('on'); });
    body = L.DomUtil.create('div', 'nm-body nm-hide', d); return body;
  }

  // lewy: szablony
  ctl('topleft', function (d) {
    var body = foldable(d, '▤', 'Szablony');
    Object.keys(TPL).forEach(function (cat) {
      var row = L.DomUtil.create('div', 'nm-row', body), list;
      var cb = btn(row, cat, 'Kategoria ' + cat, function () { list.classList.toggle('nm-hide'); cb.classList.toggle('on'); });
      cb.classList.add('nm-cat');
      list = L.DomUtil.create('div', 'nm-row nm-hide', row);
      TPL[cat].forEach(function (t) {
        var b = btn(list, t.id, t.todo ? 'do ustalenia' : t.id, function () { if (!t.todo) loadTpl(t); });
        b.classList.add('nm-tpl'); if (t.todo) b.style.opacity = .4;
      });
    });
  });

  // prawy górny: kopiuj config
  ctl('topright', function (d) {
    var body = foldable(d, '⧉', 'Kopiuj config do Claude'); body.classList.add('nm-copy');
    var ta = L.DomUtil.create('textarea', '', body); ta.placeholder = 'Opisz problem…';
    btn(body, '📋', 'Kopiuj', function () {
      var txt = JSON.stringify(config(ta.value), null, 1);
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(function () {
        var t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
      });
      this.textContent = '✓'; var b = this; setTimeout(function () { b.textContent = '📋'; }, 1200);
    });
  });
  function config(opis) {
    var P = XY(), r2 = function (v) { return Math.round(v * 100) / 100; };
    return { strona: 'nm.html', opis: opis, szablon: sc.tpl, srodek: O,
      wezly: Object.keys(sc.nodes).map(function (k) { var n = sc.nodes[k]; return { id: k, nm: n.main || undefined, xy: P[k].map(r2), ll: [+n.lat.toFixed(7), +n.lng.toFixed(7)] }; }),
      drogi: sc.roads.map(function (r) { return { id: r.id, pts: r.pts, pasy: r.lanes, szer_pasa: r.w,
        krawedzie: G.edges(sc, r, P).map(function (l) { return l.map(function (p) { return p.map(r2); }); }) }; }) };
  }

  // prawy dolny: grubość zaznaczonej drogi
  var rp;
  ctl('bottomright', function (d) { rp = d; });
  function roadPanel() {
    rp.innerHTML = ''; var r = sc.roads.filter(function (x) { return x.id === sel; })[0];
    rp.classList.toggle('nm-hide', !r); if (!r) return;
    var body = L.DomUtil.create('div', 'nm-body', rp);
    function row(icon, title, get, step, min, max) {
      var rw = L.DomUtil.create('div', 'nm-row', body); var s = L.DomUtil.create('span', 'nm-val', rw);
      s.textContent = icon; s.title = title;
      btn(rw, '−', title + ' −', function () { set(-step); });
      var v = L.DomUtil.create('span', 'nm-val', rw); v.textContent = get();
      btn(rw, '+', title + ' +', function () { set(step); });
      function set(dv) { var nv = Math.round((get() + dv) * 10) / 10; if (nv < min || nv > max) return;
        if (icon === '≡') r.lanes = nv; else r.w = nv; save(); draw(); }
    }
    row('≡', 'Liczba pasów', function () { return r.lanes; }, 1, 1, 6);
    row('↔', 'Szerokość pasa [m]', function () { return r.w; }, 0.25, 2.5, 5);
  }

  if (!restore()) loadTpl(TPL['1'][0]); else { map.setView([O.lat, O.lng], 18); draw(); }
})();
