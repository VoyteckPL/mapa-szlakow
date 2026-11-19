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
#lc #vLoad { display:block; width:100%; height:auto; margin:6px 0 2px; padding:6px 8px; font:600 12px system-ui; line-height:1.2; color:#fff; background:#1e88e5; border:0; border-radius:5px; cursor:pointer; } #lc #vClr { display:block; width:100%; height:auto; margin:4px 0 2px; padding:5px 8px; font:600 12px system-ui; line-height:1.2; color:#c62828; background:#fff; border:1px solid #e57373; border-radius:5px; cursor:pointer; } #lc #vLoad:disabled { opacity:.5; cursor:default; }
#vSt { font:11px system-ui; color:#555; max-width:210px; white-space:normal; margin-top:3px; }
</style>
<script>
(function () {
  var lcP = document.getElementById('lcP'); if (!lcP) return;
  /* usun z menu warstw sekcje 'Edytor' (naglowek, separator, przycisk) */
  var bs = lcP.querySelectorAll('b'); bs.forEach(function (b) { if (/edytor/i.test(b.textContent)) { var hr = b.previousElementSibling, row = b.nextElementSibling; if (hr && hr.tagName === 'HR') hr.remove(); if (row) row.remove(); b.remove(); } });
  var btn = document.createElement('button'); btn.id = 'vLoad'; btn.textContent = '⬇ Pobierz drogi z widoku'; var st = document.createElement('div'); st.id = 'vSt'; var clr = document.createElement('button'); clr.id = 'vClr'; clr.textContent = '🗑 Usuń wszystkie drogi'; lcP.append(btn, clr, st);
  clr.onclick = function () { S.osm.ways.clear(); S.osm.tiles.clear(); S.doc = { road: [] }; S.sel = -1; S.vsel = -1; S.undo = []; S.redo = []; S.dirty = true; L = null; touch(); st.textContent = 'Usunięto wszystkie drogi.'; };
  var last = 0, MAXW = 1500, MAXH = 1200, COOL = 8000; /* limity: maks. obszar widoku (m) i odstep miedzy pobraniami */
  btn.onclick = async function () {
    var z = Math.log2(156543.03 * Math.cos(S.org.lat * Math.PI / 180) * S.view.k), wm = W / S.view.k, hm = H / S.view.k, wait = COOL - (Date.now() - last);
    if (z < 16) { st.textContent = 'Przybliż do zoomu 16 lub więcej.'; return; }
    if (wm > MAXW || hm > MAXH) { st.textContent = 'Widok za duży (' + Math.round(wm) + '×' + Math.round(hm) + ' m, limit ' + MAXW + '×' + MAXH + '). Przybliż.'; return; }
    if (wait > 0) { st.textContent = 'Poczekaj ' + Math.ceil(wait / 1000) + ' s.'; return; }
    last = Date.now(); btn.disabled = true; st.textContent = 'Pobieram…';
    try { await window.__loadFresh(); st.textContent = 'Wczytano ' + S.doc.road.length + ' odcinków dróg.'; } catch (e) { st.textContent = 'Błąd pobierania.'; }
    btn.disabled = false;
  };
  var cv = document.getElementById('cv'), dn = null;
  cv.addEventListener('pointerdown', function (e) { dn = [e.clientX, e.clientY]; });
  cv.addEventListener('pointerup', function (e) { if (!dn) return; var mv = Math.hypot(e.clientX - dn[0], e.clientY - dn[1]); dn = null; if (mv > 5) return; var ns = hitRoad(s2w(evp(e))); S.sel = ns; S.vsel = -1; ui(); touch(); }); /* klik w droge: podswietlenie i tagi */
  setInterval(function () { try { var h = curHash(); if (h && h !== location.hash) history.replaceState(null, '', h); } catch (e) {} }, 1500); /* link do udostepnienia = biezacy widok */
})();
</script>
"""
# nitki OSM w podgladzie: tylko linie (bez punktow i srodkow odcinkow), zaznaczona droga podswietlona
rep("  if ($('cAx').checked) {\n    ctx.font = '10px system-ui'; ctx.textAlign = 'center';\n    D.road.forEach((r, i) => {\n      const c = HW_COL[(r.hw || '').replace('_link', '')] || '#6a7f94', isSel = i === S.sel;",
    "  if ($('cAx').checked || S.sel >= 0) {\n    ctx.font = '10px system-ui'; ctx.textAlign = 'center';\n    D.road.forEach((r, i) => {\n      const isSel = S.sel >= 0 && (i === S.sel || (D.road[S.sel].osm && r.osm === D.road[S.sel].osm)); if (!$('cAx').checked && !isSel) return;\n      const c = HW_COL[(r.hw || '').replace('_link', '')] || '#6a7f94';")
rep("      if (k > 6 || isSel) r.pts.forEach((p, vi) => {", "      if (false) r.pts.forEach((p, vi) => {")
rep("      if (isSel && S.tool !== 'rend') for (let vi = 0; vi < r.pts.length - 1; vi++) {", "      if (false) for (let vi = 0; vi < r.pts.length - 1; vi++) {")
rep("</body>", viewer + "</body>")
open(root + '/podglad.html', 'w', encoding='utf-8').write(s)
print('ok podglad.html', len(s))
