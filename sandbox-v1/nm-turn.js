// Sandbox v1 – turn:lanes: strzałki na pasach (warstwa ↱) i edycja w panelu drogi (H.turnPanel).
(function () {
  var S = window.SV, H = window.SVH, map = S.map, btn = S.btn;
  var gT = L.layerGroup().addTo(map);
  S.layers.addOverlay(gT, '<span title="Strzałki pasów (turn:lanes)">↱</span>');
  map.on('overlayadd overlayremove', function (e) { if (e.layer === gT) S.drawLines(); });
  var KAT = { through: 0, none: 0, slight_right: 45, right: 90, sharp_right: 135, slight_left: -45, left: -90, sharp_left: -135 };
  function svg(ts) { // strzałka w układzie: w górę = kierunek jazdy; ramiona dla każdego kierunku pasa
    var o = '';
    ts.forEach(function (t) {
      if (t === 'reverse') { o += '<path d="M0 9V-2A4 4 0 0 0-8-2V5"/><path d="M-11 2-8 6-5 2"/>'; return; }
      if (/^merge_to_/.test(t)) { var s = t === 'merge_to_left' ? -1 : 1; o += '<path d="M0 9L' + 6 * s + ' -8"/><path d="M' + (6 * s - 4) + ' -6 ' + 6 * s + ' -9 ' + (6 * s + 3 * s) + ' -4"/>'; return; }
      var a = KAT[t]; if (a == null || t === 'none') return;
      var r = a * Math.PI / 180, x = 8 * Math.sin(r), y = -8 * Math.cos(r), hx = Math.sin(r), hy = -Math.cos(r);
      var px = -hy, py = hx; // grot: dwa ramiona wstecz od końca
      o += '<path d="M0 9V' + (a ? 1 : -8) + (a ? 'L' + x.toFixed(1) + ' ' + y.toFixed(1) : '') + '"/>';
      o += '<path d="M' + (x - 3.5 * hx + 3 * px).toFixed(1) + ' ' + (y - 3.5 * hy + 3 * py).toFixed(1) + 'L' + x.toFixed(1) + ' ' + y.toFixed(1) +
        'L' + (x - 3.5 * hx - 3 * px).toFixed(1) + ' ' + (y - 3.5 * hy - 3 * py).toFixed(1) + '"/>';
    });
    return o;
  }
  function onEnd(l, d) { // punkt i kierunek polilinii l w odległości d [m] od jej końca
    for (var i = l.length - 1; i > 0; i--) {
      var a = l[i - 1], b = l[i], s = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (s >= d || i === 1) { var t = s ? Math.max(0, 1 - d / s) : 0; return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], u: s ? [(b[0] - a[0]) / s, (b[1] - a[1]) / s] : [1, 0] }; }
      d -= s;
    }
  }
  H.drawTurn = function (r, g) { // strzałki przy końcu drogi, na środku każdego pasa
    if (!map.hasLayer(gT)) return;
    var p = G.u.turnParse(r); if (!p) return;
    var Pz = g.pasy, ln = 0, e = Pz[0];
    for (var i = 1; i < e.length; i++) ln += Math.hypot(e[i][0] - e[i - 1][0], e[i][1] - e[i - 1][1]);
    var d = Math.min(8, ln * 0.3), z = map.getZoom();
    p.forEach(function (ts, j) {
      if (!Pz[2 * j + 1]) return;
      var A = onEnd(Pz[2 * j], d), B = onEnd(Pz[2 * j + 1], d), c = [(A.p[0] + B.p[0]) / 2, (A.p[1] + B.p[1]) / 2];
      var q0 = map.latLngToLayerPoint(S.ll(c)), q1 = map.latLngToLayerPoint(S.ll([c[0] + A.u[0] * r.w, c[1] + A.u[1] * r.w]));
      var px = q0.distanceTo(q1) * 0.9, ang = Math.atan2(q1.y - q0.y, q1.x - q0.x) * 180 / Math.PI + 90;
      if (px < 8) return; // za mały zoom
      L.marker(S.ll(c), { interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0],
        html: '<svg class="sv-turn" width="' + px.toFixed(0) + '" height="' + px.toFixed(0) + '" viewBox="-12 -12 24 24" style="margin:' + (-px / 2).toFixed(0) + 'px 0 0 ' + (-px / 2).toFixed(0) + 'px;transform:rotate(' + ang.toFixed(1) + 'deg)">' + svg(ts) + '</svg>' }) }).addTo(gT);
    });
  };
  H.clearTurn = function () { gT.clearLayers(); };

  // panel drogi: pole tagu + przycisk dla każdego pasa (klik = następny kierunek, prawy klik = poprzedni)
  var CYKL = ['none', 'through', 'left', 'right', 'left;through', 'through;right', 'slight_left', 'slight_right', 'left;through;right', 'reverse'];
  var ZNAK = { none: '·', through: '↑', left: '↰', right: '↱', 'left;through': '↰↑', 'through;right': '↑↱', slight_left: '↖', slight_right: '↗', 'left;through;right': '↰↑↱', reverse: '↶' };
  H.turnPanel = function (body, r) {
    var rw = L.DomUtil.create('div', 'sv-row', body), lab = L.DomUtil.create('span', 'sv-val', rw); lab.textContent = '↱'; lab.title = 'turn:lanes (pasy od lewej, kierunek drogi)';
    var inp = L.DomUtil.create('input', 'sv-turnin', rw); inp.value = r.turn || ''; inp.placeholder = 'turn:lanes';
    var ok = !r.turn || G.u.turnParse(r); inp.classList.toggle('sv-bad', !ok); if (!ok) inp.title = 'liczba pól ≠ liczba pasów (' + r.lanes + ')';
    function set(v) { if (v && !/[^|;]/.test(v.replace(/none/g, ''))) v = ''; if (v) r.turn = v; else delete r.turn; S.commit(); S.draw(); }
    inp.onchange = function () { set(inp.value.trim()); };
    var row = L.DomUtil.create('div', 'sv-row', body), cur = (r.turn && r.turn.split('|').length === r.lanes) ? r.turn.split('|') : null;
    for (var j = 0; j < r.lanes; j++) (function (j) {
      var t = cur ? cur[j] || 'none' : 'none', b = btn(row, ZNAK[t] || t, 'Pas ' + (j + 1) + ': ' + t + ' (klik: następny, prawy klik: poprzedni)', function () { kr(1); });
      b.classList.add('sv-lane');
      b.oncontextmenu = function (e) { e.preventDefault(); kr(-1); };
      function kr(dv) { var a = cur ? cur.slice() : Array(r.lanes).fill('none'), i = CYKL.indexOf(a[j]); a[j] = CYKL[(i + dv + CYKL.length) % CYKL.length]; set(a.join('|')); }
    })(j);
  };
})();
