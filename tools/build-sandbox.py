#!/usr/bin/env python3
"""Buduje sandbox-drog.html z edytor-pasow.html: ten sam silnik renderu i te same reguly wezlow co w edytorze,
ale z wlasnym, interaktywnym interfejsem (rysowanie, przesuwanie punktow, laczenie wezlow, edycja pasow, raport polaczen).
Uzycie: python3 tools/build-sandbox.py   (uruchamiane razem z build-idlanes.py)"""
root = __file__.rsplit('/tools/', 1)[0]
s = open(root + '/edytor-pasow.html', encoding='utf-8').read()
def rep(o, n):
    global s
    assert s.count(o) == 1, o[:70]
    s = s.replace(o, n)
rep("const EMBED = /[?&]embed=1/.test(location.search), EDIT = EMBED && /[?&]edit=1/.test(location.search),", "const EMBED = true, EDIT = false,")
rep("<title>Roads and Lanes</title>", "<title>Sandbox dróg</title>")
rep("  resize(); ui();\n  const h = decodeURIComponent(location.hash || '') + ' ' + location.search;",
    "  resize(); ui();\n  { S.org = { lat: 54.5, lon: 18.4 }; S.view = { x: 0, y: 0, k: 6 }; render(); return; } /* sandbox: bez wczytywania danych */\n  const h = decodeURIComponent(location.hash || '') + ' ' + location.search;")
ui = open(root + '/tools/sandbox-ui.html', encoding='utf-8').read()
rep('<input type="checkbox" id="cTile" checked>', '<input type="checkbox" id="cTile">')
rep("</body>", ui + "</body>")
open(root + '/sandbox-drog.html', 'w', encoding='utf-8').write(s)
print('ok sandbox-drog.html', len(s))
