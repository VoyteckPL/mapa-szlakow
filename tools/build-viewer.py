#!/usr/bin/env python3
"""Buduje podglad.html (wersja tylko do ogladania) z edytor-pasow.html - ten sam silnik renderu, bez edycji.
Uzycie: python3 tools/build-viewer.py   (uruchamiane razem z build-idlanes.py)"""
root = __file__.rsplit('/tools/', 1)[0]
s = open(root + '/edytor-pasow.html', encoding='utf-8').read()
def rep(o, n):
    global s
    assert s.count(o) == 1, o[:60]
    s = s.replace(o, n)
rep("const EMBED = /[?&]embed=1/.test(location.search), EDIT = EMBED && /[?&]edit=1/.test(location.search),", "const EMBED = true, EDIT = false,")  # tryb tylko do odczytu (narzedzie 'pan', bez zapisu i wysylki do OSM)
rep("<title>Roads and Lanes</title>", "<title>Roads and Lanes – podgląd</title>")
rep("  resize(); ui();\n  const h = decodeURIComponent(location.hash || '') + ' ' + location.search;",
    "  resize(); ui();\n  { const p = parseLink(location.hash) || { z: 17, lat: 54.5073, lon: 18.5345 }; S.org = { lat: p.lat, lon: p.lon }; S.view = { x: 0, y: 0, k: Math.pow(2, p.z) / (156543.03 * Math.cos(p.lat * Math.PI / 180)) }; render(); say('Przybliż mapę i kliknij „Pobierz drogi”.'); return; } /* podglad: bez automatycznego pobierania */\n  const h = decodeURIComponent(location.hash || '') + ' ' + location.search;")
viewer = r"""<style>
#edPop, #edP, #sbP, #nrbar, #offBar, #hint, #smWrap, #panel, #lcP label:has(#cAn), #lcP label:has(#cSn), #lcP label:has(#cNodeLanes), #lcP label:has(#cNodeBord), #lcP .vhide { display:none !important; }
#vWay { display:none; position:fixed; left:10px; z-index:8; background:#fff; color:#1565c0; font:600 11px system-ui; padding:4px 8px; border-radius:6px; box-shadow:0 1px 4px rgba(0,0,0,.3); text-decoration:none; } #vWay:hover { background:#eef4fc; }
#vBar { position:fixed; left:10px; top:10px; z-index:8; width:190px; background:rgba(255,255,255,.96); border-radius:8px; padding:6px 8px; box-shadow:0 1px 6px rgba(0,0,0,.35); border-top:3px solid #1e88e5; } #tagPop { top:116px !important; } #vBar #vClr { display:block; width:100%; height:auto; margin:4px 0 2px; padding:5px 8px; font:600 12px system-ui; line-height:1.2; color:#c62828; background:#fff; border:1px solid #e57373; border-radius:5px; cursor:pointer; }
#vSt { font:11px system-ui; color:#555; max-width:210px; white-space:normal; margin-top:3px; }
</style>
<script>
(function () {
  var lcP = document.getElementById('lcP'); if (!lcP) return;
  /* usun z menu warstw sekcje 'Edytor' (naglowek, separator, przycisk) */
  var bs = lcP.querySelectorAll('b'); bs.forEach(function (b) { if (/edytor/i.test(b.textContent)) { var hr = b.previousElementSibling, row = b.nextElementSibling; if (hr && hr.tagName === 'HR') hr.remove(); if (row) row.remove(); b.remove(); } });
  var st = document.createElement('div'); st.id = 'vSt'; var clr = document.createElement('button'); clr.id = 'vClr'; clr.textContent = '🗑 Usuń wszystkie drogi'; var bar = document.createElement('div'); bar.id = 'vBar'; bar.append(clr, st); document.body.appendChild(bar);
  /* AUTOMATYCZNE WCZYTYWANIE: po zatrzymaniu mapy doczytywane sa kafelki (~450 m) widoku z API OSM, po jednym, z przerwa; w pamieci zostaja tylko okoliczne; do rysowania trafiaja tylko drogi w widoku + margines */
  var TW = 0.006, TH = 0.004, MINZ = 16, MAXW = 1600, MAXH = 1300, MAXT = 30, GAP = 1200, API = 'https://api.openstreetmap.org/api/0.6/map.json';
  var tiles = new Map(), lastSig = '', stableAt = 0, doneSig = '', running = false, built = null, lastReq = 0, backoff = 0;
  var zoomNow = function () { return Math.log2(156543.03 * Math.cos(S.org.lat * Math.PI / 180) * S.view.k); };
  var sig = function () { return [Math.round(S.view.x), Math.round(S.view.y), S.view.k.toFixed(3), W, H].join(); };
  var tkey = function (ix, iy) { return ix + '_' + iy; };
  var viewLL = function () { var a = unproj(s2w([0, 0])), b = unproj(s2w([W, H])); return { lo0: Math.min(a.lon, b.lon), lo1: Math.max(a.lon, b.lon), la0: Math.min(a.lat, b.lat), la1: Math.max(a.lat, b.lat) }; };
  var needTiles = function () { var v = viewLL(), mx = (v.lo1 - v.lo0) * 0.25, my = (v.la1 - v.la0) * 0.25, out = [], cx = (v.lo0 + v.lo1) / 2 / TW, cy = (v.la0 + v.la1) / 2 / TH;
    for (var ix = Math.floor((v.lo0 - mx) / TW); ix <= Math.floor((v.lo1 + mx) / TW); ix++) for (var iy = Math.floor((v.la0 - my) / TH); iy <= Math.floor((v.la1 + my) / TH); iy++) out.push({ ix: ix, iy: iy, k: tkey(ix, iy), d: Math.hypot(ix + 0.5 - cx, iy + 0.5 - cy) });
    return out.sort(function (a, b) { return a.d - b.d; }); };
  var wayOK = function (t) { var h = (t.highway || '').replace('_link', ''); return OKHW.has(h) || isCycW(t); };
  async function fetchTile(t) {
    var url = API + '?bbox=' + (t.ix * TW).toFixed(6) + ',' + (t.iy * TH).toFixed(6) + ',' + ((t.ix + 1) * TW).toFixed(6) + ',' + ((t.iy + 1) * TH).toFixed(6), ac = new AbortController(), to = setTimeout(function () { ac.abort(); }, 25000), ids = new Set();
    try { var r = await fetch(url, { signal: ac.signal }); if (r.status === 429 || r.status === 509 || r.status >= 500) { backoff = Date.now() + 15000; return false; } if (!r.ok) { tiles.set(t.k, { ids: ids, ix: t.ix, iy: t.iy }); return true; }
      var els = (await r.json()).elements || [], nodes = new Map(); for (var i = 0; i < els.length; i++) { var e = els[i]; if (e.type === 'node') nodes.set(e.id, [e.lon, e.lat]); }
      for (var j = 0; j < els.length; j++) { var w = els[j]; if (w.type !== 'way' || !w.tags || !w.tags.highway || !wayOK(w.tags)) continue; var ll = w.nodes.map(function (id) { return nodes.get(id); }).filter(Boolean); if (ll.length < 2) continue; S.osm.ways.set(w.id, { id: w.id, t: w.tags, g: ll.map(function (c) { return proj(c[0], c[1]); }), nk: ll.map(function (c) { return c[0].toFixed(7) + ',' + c[1].toFixed(7); }) }); ids.add(w.id); }
      tiles.set(t.k, { ids: ids, ix: t.ix, iy: t.iy }); return true;
    } catch (e) { backoff = Date.now() + 8000; return false; } finally { clearTimeout(to); }
  }
  function evict() { if (tiles.size <= MAXT) return; var v = viewLL(), cx = (v.lo0 + v.lo1) / 2 / TW, cy = (v.la0 + v.la1) / 2 / TH, arr = Array.from(tiles.entries()).sort(function (a, b) { return Math.hypot(b[1].ix + 0.5 - cx, b[1].iy + 0.5 - cy) - Math.hypot(a[1].ix + 0.5 - cx, a[1].iy + 0.5 - cy); });
    while (tiles.size > MAXT - 6 && arr.length) tiles.delete(arr.shift()[0]);
    var keep = new Set(); tiles.forEach(function (t) { t.ids.forEach(function (id) { keep.add(id); }); }); Array.from(S.osm.ways.keys()).forEach(function (id) { if (!keep.has(id)) S.osm.ways.delete(id); }); built = null; }
  /* LICZENIE UKLADU DROG W TLE (Web Worker): ten sam silnik co na glownym watku; interfejs rysuje stary uklad, az nowy bedzie gotowy */
  var wk = null, wJob = 0, wBusy = false, wPending = null, wFail = false, wMeta = null;
  function workerSrc() { var big = '', A = 'function render', B = '() {', C = 'const $ = id => document.getElementById(id);'; Array.prototype.forEach.call(document.scripts, function (sc) { var t = sc.textContent; if (!sc.src && t.length > big.length && t.indexOf(A + B) >= 0 && t.indexOf(C) >= 0) big = t; });
    var eng = big.slice(0, big.indexOf(A + B)), STUB = "const STUBV = { cLay: 1, rA: 0.85, fT: 45, fT2: 80, fR: 60, bm: 0, cAx: 0, cAn: 0, cTile: 0, cSm: 1, cBlue: 0 }, STUB = {}; const $ = id => STUB[id] || (STUB[id] = id === 'cv' ? new OffscreenCanvas(1, 1) : { checked: !!STUBV[id], value: STUBV[id] === undefined ? '' : STUBV[id], style: {}, classList: { add() {}, remove() {}, toggle() {} }, set onclick(f) {}, set oninput(f) {}, set onchange(f) {}, getBoundingClientRect: () => ({ width: 800, height: 600 }) });";
    var pre = "var window = self; var document = { createElement: () => new OffscreenCanvas(1, 1), getElementById: () => null, querySelector: () => null, addEventListener() {}, documentElement: { style: {} } }; var localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} }; var location = { hash: '', search: '' }; var navigator = {}; var devicePixelRatio = 1;\n",
      post = "\nself.onmessage = e => { const d = e.data; try { Object.assign(self, d.flags); S.arcMode = d.arc; S.org = d.org; S.view = d.view; S.nodeR = {}; S.nodeP = {}; S.osm.ways = new Map(d.ways); S.doc = { road: d.roads }; S.dirty = true; const L = layout(); self.postMessage({ id: d.id, L, CC: S.CC, nodeViz: S.nodeViz, forks: S.forks, forks3: S.forks3, roads: S.doc.road }); } catch (err) { self.postMessage({ id: d.id, err: String(err && err.stack || err) }); } };";
    return pre + eng.replace(C, STUB) + post; }
  function applyResult(d) { S.doc.road = d.roads; S.CC = d.CC; S.nodeViz = d.nodeViz; S.forks = d.forks; S.forks3 = d.forks3; L = d.L; DUP = []; PZI = []; S.sel = -1; S.vsel = -1; S.dirty = false; if (wMeta) built = wMeta; showLink(); render(); }
  function sendJob(roads, meta) { var ids = new Set(roads.map(function (r) { return r.osm; })), ways = []; S.osm.ways.forEach(function (o, id) { if (ids.has(id)) ways.push([id, o]); }); var flags = {}; Object.keys(window).forEach(function (k) { if (k.indexOf('__') === 0 && ['number', 'boolean', 'string'].indexOf(typeof window[k]) >= 0) flags[k] = window[k]; });
    wBusy = true; wMeta = meta; wk.postMessage({ id: ++wJob, flags: flags, arc: S.arcMode, org: S.org, view: S.view, ways: ways, roads: roads }); }
  function startWorker() { try { wk = new Worker(URL.createObjectURL(new Blob([workerSrc()], { type: 'text/javascript' })));
    wk.onmessage = function (e) { var d = e.data; wBusy = false; if (d.err) { wFail = true; st.textContent = 'Błąd liczenia w tle – tryb zwykły.'; if (wPending) { S.doc.road = wPending.roads; S.dirty = true; L = null; touch(); wPending = null; } return; } if (d.id === wJob) applyResult(d); if (wPending) { var q = wPending; wPending = null; sendJob(q.roads, q.meta); } };
    wk.onerror = function () { wFail = true; wBusy = false; };
  } catch (e) { wFail = true; } }
  var __ol = layout; layout = function () { return L || __ol(); }; /* w podgladzie uklad liczy worker; glowny watek tylko rysuje */
  function ensureDoc(force) { var a = s2w([0, 0]), b = s2w([W, H]), x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    if (!force && built && built.x0 <= x0 && built.x1 >= x1 && built.y0 <= y0 && built.y1 >= y1) return; var m = 0.25 * Math.max(x1 - x0, y1 - y0), meta = { x0: x0 - m, x1: x1 + m, y0: y0 - m, y1: y1 + m };
    var old = S.doc.road; S.doc.road = []; importView(m); var next = S.doc.road; S.doc.road = old;
    if (wFail || typeof Worker === 'undefined') { S.doc.road = next; S.sel = -1; S.vsel = -1; built = meta; S.dirty = true; L = null; touch(); showLink(); return; }
    if (!wk) startWorker(); if (wFail) { S.doc.road = next; S.sel = -1; S.vsel = -1; built = meta; S.dirty = true; L = null; touch(); showLink(); return; }
    built = meta; if (wBusy) wPending = { roads: next, meta: meta }; else sendJob(next, meta); }
  async function run() { if (running) return; running = true; try {
    var z = zoomNow(), wm = W / S.view.k, hm = H / S.view.k;
    if (z < MINZ) { st.textContent = 'Przybliż do zoomu ' + MINZ + ', żeby wczytać drogi (teraz ' + z.toFixed(1) + ').'; return; }
    if (wm > MAXW || hm > MAXH) { st.textContent = 'Widok za duży (' + Math.round(wm) + '×' + Math.round(hm) + ' m, limit ' + MAXW + '×' + MAXH + ') – przybliż.'; return; }
    var mySig = sig(), miss = needTiles().filter(function (t) { return !tiles.has(t.k); }), n = 0;
    for (var i = 0; i < miss.length; i++) { if (sig() !== mySig) return; var wait = Math.max(GAP - (Date.now() - lastReq), backoff - Date.now(), 0); if (wait) await new Promise(function (r) { setTimeout(r, wait); }); if (sig() !== mySig) return;
      st.textContent = 'Wczytuję kafelek ' + (i + 1) + '/' + miss.length + '…'; lastReq = Date.now(); var ok = await fetchTile(miss[i]); if (!ok) { st.textContent = 'Serwer OSM zajęty – ponawiam za chwilę…'; return; } n++; if (n === 1 || i === miss.length - 1) { ensureDoc(true); } }
    evict(); ensureDoc(); doneSig = mySig; st.textContent = 'Wczytano ' + S.doc.road.length + ' odcinków dróg · kafelków w pamięci: ' + tiles.size;
  } finally { running = false; } }
  setInterval(function () { var s0 = sig(); if (s0 !== lastSig) { lastSig = s0; stableAt = Date.now(); return; } if (running || doneSig === s0 || Date.now() - stableAt < 700) return; if (backoff > Date.now()) return; run(); }, 400);
  clr.onclick = function () { wJob++; wPending = null; tiles.clear(); built = null; S.osm.ways.clear(); S.osm.tiles.clear(); S.doc = { road: [] }; S.sel = -1; S.vsel = -1; S.undo = []; S.redo = []; S.dirty = true; L = null; doneSig = ''; touch(); showLink(); st.textContent = 'Usunięto wszystkie drogi (po chwili wczytają się ponownie dla widoku).'; };
  var lk = document.createElement('a'); lk.id = 'vWay'; lk.target = '_blank'; lk.rel = 'noopener'; document.body.appendChild(lk);
  function showLink() { var r = S.doc.road[S.sel]; if (!r || !r.osm) { lk.style.display = 'none'; return; } lk.href = 'https://www.openstreetmap.org/way/' + r.osm; lk.textContent = '↗ Otwórz way ' + r.osm + ' w OSM'; var tp = document.getElementById('tagPop'), b = tp && tp.style.display !== 'none' ? tp.getBoundingClientRect().bottom + 6 : 116; lk.style.top = Math.round(b) + 'px'; lk.style.display = 'block'; } /* link do zaznaczonej drogi w OSM */
  var cv = document.getElementById('cv'), dn = null;
  cv.addEventListener('pointerdown', function (e) { dn = [e.clientX, e.clientY]; });
  cv.addEventListener('pointerup', function (e) { if (!dn) return; var mv = Math.hypot(e.clientX - dn[0], e.clientY - dn[1]); dn = null; if (mv > 5) return; var ns = hitRoad(s2w(evp(e))); S.sel = ns; S.vsel = -1; ui(); touch(); showLink(); }); /* klik w droge: podswietlenie i tagi */
  setInterval(function () { try { var h = curHash(); if (h && h !== location.hash) history.replaceState(null, '', h); } catch (e) {} }, 1500); /* link do udostepnienia = biezacy widok */
})();
</script>
"""
# nitki OSM w podgladzie: tylko linie (bez punktow i srodkow odcinkow), zaznaczona droga podswietlona
rep("  if ($('cAx').checked) {\n    ctx.font = '10px system-ui'; ctx.textAlign = 'center';\n    D.road.forEach((r, i) => {\n      const c = HW_COL[(r.hw || '').replace('_link', '')] || '#6a7f94', isSel = i === S.sel;",
    "  if ($('cAx').checked || S.sel >= 0) {\n    ctx.font = '10px system-ui'; ctx.textAlign = 'center';\n    D.road.forEach((r, i) => {\n      const isSel = S.sel >= 0 && (i === S.sel || (D.road[S.sel].osm && r.osm === D.road[S.sel].osm)); if (!$('cAx').checked && !isSel) return;\n      const c = HW_COL[(r.hw || '').replace('_link', '')] || '#6a7f94';")
rep("      if (k > 6 || isSel) r.pts.forEach((p, vi) => {", "      if (false) r.pts.forEach((p, vi) => {")
rep("      if (isSel && S.tool !== 'rend') for (let vi = 0; vi < r.pts.length - 1; vi++) {", "      if (false) for (let vi = 0; vi < r.pts.length - 1; vi++) {")
rep("if (S.doc.road.length >= 500) { full = true; break; } S.doc.road.push(makeRoad(o, 0, o.g.length - 1)); n++; continue; }", "if (S.doc.road.length >= 320) { full = true; break; } S.doc.road.push(makeRoad(o, 0, o.g.length - 1)); n++; continue; }")
rep("if (S.doc.road.length >= 500) { full = true; break; } S.doc.road.push(makeRoad(o, A, B)); n++;", "if (S.doc.road.length >= 320) { full = true; break; } S.doc.road.push(makeRoad(o, A, B)); n++;")
# lzejszy render: DPR max 1.5, bez skanow edytora (duplikaty / problemy)
rep("DPR = window.devicePixelRatio || 1;", "DPR = Math.min(window.devicePixelRatio || 1, 1.5);")
rep("try { DUP = dupScan(); } catch (e) { DUP = []; console.warn('dupScan', e); } try { PZI = pzScan(); } catch (e) { PZI = []; console.warn('pzScan', e); }", "DUP = []; PZI = [];")
rep("</body>", viewer + "</body>")
open(root + '/podglad.html', 'w', encoding='utf-8').write(s)
print('ok podglad.html', len(s))
