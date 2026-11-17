#!/usr/bin/env python3
"""Buduje idlanes.user.js (skrypt Tampermonkey dla edytora iD) z silnika renderu w edytor-pasow.html.
Uzycie: python3 tools/build-idlanes.py   (z katalogu repo)"""
import re, sys
root = __file__.rsplit('/tools/', 1)[0]
src = open(root + '/edytor-pasow.html', encoding='utf-8').read().split('\n')
# silnik: od poczatku <script> do funkcji render() (bez UI i zapisu do OSM)
start = next(i for i, l in enumerate(src) if l.startswith('<script>')) + 1
end = next(i for i, l in enumerate(src) if l.startswith('function render() {'))
engine = '\n'.join(src[start:end])
old = "const $ = id => document.getElementById(id);"
assert engine.count(old) == 1
engine = engine.replace(old, """const STUBV = { cLay: 1, rA: 0.85, fT: 45, fT2: 80, fR: 60, bm: 0, cAx: 0, cAn: 0, cTile: 0, cSm: 1, cBlue: 0 }, STUB = {};
const $ = id => STUB[id] || (STUB[id] = id === 'cv' ? document.createElement('canvas') : { checked: !!STUBV[id], value: STUBV[id] === undefined ? '' : STUBV[id], style: {}, classList: { add() {}, remove() {}, toggle() {} }, set onclick(f) {}, set oninput(f) {}, set onchange(f) {}, getBoundingClientRect: () => ({ width: 800, height: 600 }) });""")
# ostatni commit edytora jako wersja
header = """// ==UserScript==
// @name         Pasy w iD (Roads and Lanes)
// @namespace    https://github.com/VoyteckPL/mapa-szlakow
// @version      %VERSION%
// @description  Rysuje pasy ruchu, strzalki, mosty i rozjazdy na zywo nad mapa edytora iD (openstreetmap.org/edit)
// @match        https://www.openstreetmap.org/edit*
// @match        https://www.openstreetmap.org/*/edit*
// @match        https://ideditor.com/*
// @match        https://ideditor.netlify.app/*
// @grant        none
// @run-at       document-start
// @updateURL    https://voyteckpl.github.io/mapa-szlakow/idlanes.user.js
// @downloadURL  https://voyteckpl.github.io/mapa-szlakow/idlanes.user.js
// ==/UserScript==
"""
adapter = open(root + '/tools/idlanes-adapter.js', encoding='utf-8').read()
import time
out = header.replace('%VERSION%', time.strftime('%Y.%m.%d.%H%M')) + "(function () {\n" + engine + "\n" + adapter + "\n})();\n"
out = out.replace('%VERSION%', time.strftime('%H%M'))
open(root + '/idlanes.user.js', 'w', encoding='utf-8').write(out)
print('ok', len(out))
