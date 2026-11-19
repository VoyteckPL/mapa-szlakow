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
#edPop, #edP, #tagPop, #sbP, #nrbar, #offBar, #hint, #smWrap, #panel, #lcP label:has(#cAx), #lcP label:has(#cAn), #lcP label:has(#cSn), #lcP label:has(#cNodeLanes), #lcP label:has(#cNodeBord), #lcP .vhide { display:none !important; }
#lc #vLoad { display:block; width:100%; height:auto; margin:6px 0 2px; padding:6px 8px; font:600 12px system-ui; line-height:1.2; color:#fff; background:#1e88e5; border:0; border-radius:5px; cursor:pointer; } #lc #vLoad:disabled { opacity:.5; cursor:default; }
#vSt { font:11px system-ui; color:#555; max-width:210px; white-space:normal; margin-top:3px; }
</style>
<script>
(function () {
  var lcP = document.getElementById('lcP'); if (!lcP) return;
  /* usun z menu warstw sekcje 'Edytor' (naglowek, separator, przycisk) */
  var bs = lcP.querySelectorAll('b'); bs.forEach(function (b) { if (/edytor/i.test(b.textContent)) { var hr = b.previousElementSibling, row = b.nextElementSibling; if (hr && hr.tagName === 'HR') hr.remove(); if (row) row.remove(); b.remove(); } });
  var btn = document.createElement('button'); btn.id = 'vLoad'; btn.textContent = '⬇ Pobierz drogi z widoku'; var st = document.createElement('div'); st.id = 'vSt'; lcP.append(btn, st);
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
  setInterval(function () { try { var h = curHash(); if (h && h !== location.hash) history.replaceState(null, '', h); } catch (e) {} }, 1500); /* link do udostepnienia = biezacy widok */
})();
</script>
"""
rep("</body>", viewer + "</body>")
open(root + '/podglad.html', 'w', encoding='utf-8').write(s)
print('ok podglad.html', len(s))
