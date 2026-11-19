// ==UserScript==
// @name         Pasy w iD (Roads and Lanes)
// @namespace    https://github.com/VoyteckPL/mapa-szlakow
// @version      2026.11.19.1951
// @description  Rysuje pasy ruchu, strzalki, mosty i rozjazdy na zywo nad mapa edytora iD (openstreetmap.org/edit)
// @match        https://www.openstreetmap.org/edit*
// @match        https://www.openstreetmap.org/*/edit*
// @match        https://www.openstreetmap.org/id*
// @match        https://ideditor.com/*
// @match        https://ideditor.netlify.app/*
// @grant        none
// @run-at       document-start
// @updateURL    https://voyteckpl.github.io/mapa-szlakow/idlanes.user.js
// @downloadURL  https://voyteckpl.github.io/mapa-szlakow/idlanes.user.js
// ==/UserScript==
(function () {
'use strict';
const STUBV = { cLay: 1, rA: 0.85, fT: 45, fT2: 80, fR: 60, bm: 0, cAx: 0, cAn: 0, cTile: 0, cSm: 1, cBlue: 0 }, STUB = {};
const $ = id => STUB[id] || (STUB[id] = id === 'cv' ? document.createElement('canvas') : { checked: !!STUBV[id], value: STUBV[id] === undefined ? '' : STUBV[id], style: {}, classList: { add() {}, remove() {}, toggle() {} }, set onclick(f) {}, set oninput(f) {}, set onchange(f) {}, getBoundingClientRect: () => ({ width: 800, height: 600 }) });
let ctx; const cv = $('cv'); ctx = cv.getContext('2d'); const off = document.createElement('canvas'), octx = off.getContext('2d');
// Rejestr typow rozjazdow renderowanych specjalnie. Kazdy typ: gdzie stosowany (hw = regex na highway drog w wezle), co rysuje.
// Pozostale wezly ida po zwyklej osi OSM. Kolejne typy dopisujemy tutaj.
const FORK_TYPES = { 'rozjazd-n': { on: true, opis: 'n pasow -> a+b (szkielet, offset dla nieparzystych)', hw: /^(motorway|trunk|primary|secondary|tertiary)/ }, 'rozjazd-3-2+1': { on: true, opis: '3 pasy -> 2+1 (pasy glowne na osi, pas zjazdu bokiem, klin z chevronami)', hw: /^(motorway|trunk|primary|secondary|tertiary)/ }, 'rozjazd-3-2+2': { on: true, opis: '3 pasy -> 2+2 (srodkowy pas wspolny)', hw: /^(motorway|trunk|primary|secondary|tertiary)/ }, 'rozjazd-1-1+1': { on: true, opis: '1 pas -> 1+1 (wspolny pas, plynne rozejscie bez linii na zlaczu)', hw: /^(motorway|trunk|primary|secondary|tertiary)/ }, 'rozjazd-2-1+1': { on: true, opis: '2 pasy -> 1+1 (klin z chevronami)', hw: /^(motorway|trunk|primary|secondary|tertiary)/ } };
const EMBED = /[?&]embed=1/.test(location.search), EDIT = EMBED && /[?&]edit=1/.test(location.search), EKEY = (() => { const m = /#map=[\d.]+\/(-?[\d.]+)\/(-?[\d.]+)/.exec(location.hash); return m ? 'rozj-' + m[1] + '/' + m[2] : 'rozj-x'; })(); // tryb osadzony (galeria rozjazdow): bez zapisu, bez panelu
const ROZBIEZNY = false; // true wlacza tryby rozjazdu: wylot odchylony od przedluzenia (diverge) i 'prosty + odchodzacy' (asym); false = pierwotny, symetryczny sposob
const KEY = 'edytor-pasow-v3', CHEVRONS = true, HINTS = false, TAPER2 = true, FORK_MARKS = false, P9_TAPER = false;
const LS = { p1: { dash: [3, 6], w: 0.12 }, p2: { dash: null, w: 0.2 }, p4: { dash: null, w: 0.12, dbl: 0.12 } };
const LW_CLASS = { motorway: 3.75, trunk: 3.5, primary: 3.5, secondary: 3.4, tertiary: 3.5, unclassified: 2.5, residential: 2.5, living_street: 2.25, service: 4, busway: 3.25, road: 3, construction: 3 };
const RANK = { motorway: 4, trunk: 4, primary: 3, secondary: 3, tertiary: 2 };
const HW_COL = { motorway: '#e0457b', trunk: '#e0457b', primary: '#e58a00', secondary: '#c9a400', tertiary: '#2f6fae', unclassified: '#6a7f94', residential: '#6a7f94', living_street: '#6a7f94', service: '#8d99a6', busway: '#6668ab', road: '#8d99a6', construction: '#c47a3a' };
const OKHW = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'busway', 'road', 'construction']); /* 2026-11-18: dodane nizsze klasy, busway, road, construction; service tez parking_aisle/driveway */
const ARR = new Set(['through', 'left', 'right', 'through-left', 'through-right', 'left-right', 'through-left-right', 'reverse', 'p9a', 'p9b']);
const TOOLS = [['sel', 'Zaznacz / przesuwaj'], ['pan', 'Widok'], ['osm', 'Dodaj drogę z OSM'], ['road', 'Rysuj drogę'], ['rend', 'Przesuń render']];
const S = { hints: {}, org: { lat: 54.4985, lon: 18.4614 }, osm: { ways: new Map(), tiles: new Set() }, doc: { road: [] }, view: { x: 0, y: 0, k: 3 }, tool: 'sel', sel: -1, vsel: -1, draw: null, dirty: true, undo: [], redo: [] };
let W = 0, H = 0, DPR = 1, L = null;

// ---------- geometria ----------
const w2s = p => [(p[0] - S.view.x) * S.view.k + W / 2, (p[1] - S.view.y) * S.view.k + H / 2];
const s2w = p => [(p[0] - W / 2) / S.view.k + S.view.x, (p[1] - H / 2) / S.view.k + S.view.y];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sm = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const sm5 = t => { t = Math.max(0, Math.min(1, t)); return t * t * t * (t * (6 * t - 15) + 10); };
const proj = (lon, lat) => [(lon - S.org.lon) * 111320 * Math.cos(S.org.lat * Math.PI / 180), -(lat - S.org.lat) * 110540];
const unproj = p => ({ lon: S.org.lon + p[0] / (111320 * Math.cos(S.org.lat * Math.PI / 180)), lat: S.org.lat - p[1] / 110540 });
function segDist(p, a, b) { const x = b[0] - a[0], y = b[1] - a[1], l2 = x * x + y * y || 1; let t = ((p[0] - a[0]) * x + (p[1] - a[1]) * y) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - x * t, p[1] - a[1] - y * t); }
function offsetPts(P, d) { // d > 0 w prawo od kierunku
  if (P.length < 2) return P.map(q => [q[0], q[1]]); /* zdegenerowana droga (1 punkt) - bez przesuniecia */
  const o = [], nr = (a, b) => { const x = b[0] - a[0], y = b[1] - a[1], l = Math.hypot(x, y) || 1; return [-y / l, x / l]; };
  for (let i = 0; i < P.length; i++) {
    const n1 = i > 0 ? nr(P[i - 1], P[i]) : null, n2 = i < P.length - 1 ? nr(P[i], P[i + 1]) : null;
    let n = n1 && n2 ? [n1[0] + n2[0], n1[1] + n2[1]] : (n1 || n2); const l = Math.hypot(n[0], n[1]) || 1; n = [n[0] / l, n[1] / l];
    const m = n1 && n2 ? Math.max(0.4, n[0] * n1[0] + n[1] * n1[1]) : 1, di = Array.isArray(d) ? d[i] : d;
    o.push([P[i][0] + n[0] * di / m, P[i][1] + n[1] * di / m]);
  }
  for (let i = 0; i + 3 < o.length; i++) for (let j = Math.min(o.length - 2, i + 40); j >= i + 2; j--) { /* petla krawedzi po wewnetrznej stronie ostrego zakretu: punkty petli sciagniete do punktu przeciecia (liczba punktow bez zmian) */
    const a = o[i], b = o[i + 1], c = o[j], e = o[j + 1], d1x = b[0] - a[0], d1y = b[1] - a[1], d2x = e[0] - c[0], d2y = e[1] - c[1], den = d1x * d2y - d1y * d2x; if (Math.abs(den) < 1e-12) continue;
    const t = ((c[0] - a[0]) * d2y - (c[1] - a[1]) * d2x) / den, u = ((c[0] - a[0]) * d1y - (c[1] - a[1]) * d1x) / den; if (t <= 0 || t >= 1 || u <= 0 || u >= 1) continue;
    const X = [a[0] + d1x * t, a[1] + d1y * t]; for (let k = i + 1; k <= j; k++) o[k] = X; i = j; break; }
  return o;
}
function dense(P, step) {
  const out = [P[0]];
  for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], n = Math.max(1, Math.round(dist(a, b) / step)); for (let j = 1; j <= n; j++) { const q = [a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n], l = out[out.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.01) out.push(q); } } /* bez powtorzonych punktow: zerowy odcinek psuje normalna offsetu (kolce) */
  return out;
}
function warpEnds(P, GE) { /* wspolna styczna na styku dwoch odcinkow jezdni glownej: w ciagu ok. 40 m od konca os jest lekko przesunieta bokiem, tak by kierunek przy wezle byl zadany (D), korekta wygasa plynnie (zerowa wartosc i pochodna na koncu strefy) */
  if (!GE || P.length < 4) return P; P = P.map(q => q.slice());
  for (const side of ['s', 'e']) { const D = GE[side]; if (!D) continue; const st = side === 's', m = P.length, sc = [0]; for (let i = 1; i < m; i++) sc.push(sc[i - 1] + dist(P[i - 1], P[i])); const Lt = sc[m - 1], S0 = Math.min(40, Lt * 0.45), at = i => st ? sc[i] : Lt - sc[i]; let j = st ? 0 : m - 1; while (st ? j < m - 1 : j > 0) { if (at(j) >= 6) break; j += st ? 1 : -1; } const o0 = st ? P[0] : P[m - 1], pj = P[j], ds = Math.hypot(pj[0] - o0[0], pj[1] - o0[1]); if (ds < 1) continue; const u = [(pj[0] - o0[0]) / ds, (pj[1] - o0[1]) / ds], th = Math.atan2(u[0] * D[1] - u[1] * D[0], u[0] * D[0] + u[1] * D[1]); if (Math.abs(th) < 0.003 || Math.abs(th) > 0.6) continue; const tn = Math.tan(th), nl = [-u[1], u[0]];
    for (let i = 0; i < m; i++) { const sv = at(i); if (sv >= S0) continue; const f = 1 - sv / S0, dl = tn * sv * f * f; P[i] = [P[i][0] + nl[0] * dl, P[i][1] + nl[1] * dl]; } }
  return P; }
function smoothDense(P0, step, tin, tout, force) { // centripetalna krzywa Catmull-Rom przez wierzchołki (węzły zostają na miejscu)
  let P = P0.filter((p, i) => i === 0 || dist(p, P0[i - 1]) > 1e-6); if (P.length < 2 || !(force || $('cSm').checked) || (P.length < 3 && !tin && !tout)) return dense(P0, step);
  let gaussDone = false; if (window.__gaussSig > 0 && P.length >= 3) { /* autostrady/ekspresowki: os OSM ma drobne zygzaki co kilkadziesiat metrow - wygladzanie gaussowskie (sigma m), konce zakotwiczone (wezly sie nie przesuwaja), wplyw rosnie plynnie w glab drogi */
    const D = dense(P, 2), n = D.length, sg = window.__gaussSig, rad = Math.ceil(2.5 * sg / 2); if (n > 6) { const sl = [0]; for (let i = 1; i < n; i++) sl.push(sl[i - 1] + dist(D[i - 1], D[i])); const Ls = sl[n - 1], Q2 = D.map((p, i) => { const t = Math.min(1, Math.min(sl[i], Ls - sl[i]) / (2 * sg)); if (t <= 0) return p; let sx = 0, sy = 0, sw = 0; for (let j = Math.max(0, i - rad); j <= Math.min(n - 1, i + rad); j++) { const d = sl[j] - sl[i], w = Math.exp(-d * d / (2 * sg * sg)); sx += D[j][0] * w; sy += D[j][1] * w; sw += w; } const g = [sx / sw, sy / sw], tt = t * t * (3 - 2 * t); return [p[0] + (g[0] - p[0]) * tt, p[1] + (g[1] - p[1]) * tt]; }); P = Q2; gaussDone = true;
      P = warpEnds(P, window.__gaussEnds); } }
  if (gaussDone) return dense(P, step); /* os juz gladka i gesta (2 m): bez dodatkowego zaokraglania narozy */
  if (window.__smCap > 0) { /* (takze na drogach laczacych sie w wezle - krzywa przez wszystkie punkty falowala przy ostrych zakretach) wygladzanie trzymajace sie linii: tylko skrocenie naroznikow (krzywa Beziera) o maks. __smCap m */
    const o2 = [P[0]]; for (let i = 1; i < P.length - 1; i++) { const a = P[i - 1], b = P[i], c = P[i + 1], l1 = dist(a, b), l2 = dist(b, c), cut = Math.min(window.__smCap, 0.45 * l1, 0.45 * l2); if (cut < 0.05) { o2.push(b); continue; } const E = [b[0] + (a[0] - b[0]) / l1 * cut, b[1] + (a[1] - b[1]) / l1 * cut], X = [b[0] + (c[0] - b[0]) / l2 * cut, b[1] + (c[1] - b[1]) / l2 * cut], n = 8; for (let j = 0; j <= n; j++) { const t = j / n, m = 1 - t; o2.push([m * m * E[0] + 2 * m * t * b[0] + t * t * X[0], m * m * E[1] + 2 * m * t * b[1] + t * t * X[1]]); } } o2.push(P[P.length - 1]); return warpEnds(dense(o2, step), window.__gaussEnds); }
  const out = [P[0]], mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  for (let i = 0; i < P.length - 1; i++) {
    const p1 = P[i], p2 = P[i + 1], L12 = dist(p1, p2), p0 = i > 0 ? P[i - 1] : (tin ? [p1[0] - tin[0] * L12, p1[1] - tin[1] * L12] : [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]]), p3 = i + 2 < P.length ? P[i + 2] : (tout ? [p2[0] + tout[0] * L12, p2[1] + tout[1] * L12] : [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]]);
    const t0 = 0, t1 = t0 + Math.sqrt(dist(p0, p1)), t2 = t1 + Math.sqrt(dist(p1, p2)), t3 = t2 + Math.sqrt(dist(p2, p3)), n = Math.max(1, Math.ceil(dist(p1, p2) / step));
    for (let j = 1; j <= n; j++) {
      const t = t1 + (t2 - t1) * j / n; if (j === n) { out.push(p2); continue; }
      const A1 = mix(p0, p1, (t - t0) / (t1 - t0 || 1)), A2 = mix(p1, p2, (t - t1) / (t2 - t1 || 1)), A3 = mix(p2, p3, (t - t2) / (t3 - t2 || 1));
      out.push(mix(mix(A1, A2, (t - t0) / (t2 - t0 || 1)), mix(A2, A3, (t - t1) / (t3 - t1 || 1)), (t - t1) / (t2 - t1 || 1)));
    }
  }
  return out;
}
function cumOf(Q) { const c = [0]; for (let i = 1; i < Q.length; i++) c.push(c[i - 1] + dist(Q[i - 1], Q[i])); return c; }
function atS(Q, c, s) { // punkt na polilinii w odległości s
  if (s <= 0) return Q[0]; const n = Q.length; if (s >= c[n - 1]) return Q[n - 1];
  let i = 1; while (i < n - 1 && c[i] < s) i++; const f = (s - c[i - 1]) / ((c[i] - c[i - 1]) || 1); return [Q[i - 1][0] + (Q[i][0] - Q[i - 1][0]) * f, Q[i - 1][1] + (Q[i][1] - Q[i - 1][1]) * f];
}

// ---------- model drogi ----------
const rw = r => r.lanes * r.lw, gp = r => r.rp || r.pts; // rp = ręcznie przesunięte punkty samej warstwy renderowanej
const isCycW = t => !!t && (t.highway === 'cycleway' || (/^(footway|path|pedestrian|track)$/.test(t.highway || '') && t.bicycle === 'designated')); /* droga rowerowa: osobna albo wspolna z pieszymi (bicycle=designated) */
function infraCls(t) { /* klasy infrastruktury rowerowej z tagow drogi - te same reguly co w index.html: przejazd, droga, ciag, pas, kontrapas, buspas, sharrow, kontraruch; side: -1 lewa / 0 os / 1 prawa; dir: 1 zgodnie z droga, -1 pod prad, 2 oba, 0 brak */
  const out = [], hw = t.highway; if (!hw) return out; const carDir = ['yes', '1', 'true'].includes(t.oneway) ? 1 : t.oneway === '-1' ? -1 : 0, ow = v => v === 'yes' || v === '1' || v === 'true' ? 1 : v === '-1' ? -1 : v === 'no' ? 0 : null;
  if (t.cycleway === 'crossing' || (hw === 'cycleway' && (t.crossing || t.footway === 'crossing')) || (t.footway === 'crossing' && t.bicycle === 'designated') || (t.path === 'crossing' && t.bicycle === 'designated')) { out.push({ cls: 'przejazd', side: 0, dir: 0, zebra: t.foot === 'designated' || t.footway === 'crossing' || t.highway === 'footway' }); return out; }
  if (hw === 'cycleway' || (t.bicycle === 'designated' && /^(path|footway|pedestrian|track|service|living_street|bridleway)$/.test(hw))) { const shared = hw === 'cycleway' ? (t.foot === 'designated' && t.segregated !== 'yes') : ((t.foot === 'designated' || hw === 'footway' || hw === 'pedestrian') && t.segregated !== 'yes'); const d = ow(t['oneway:bicycle']) ?? ow(t.oneway) ?? 0; out.push({ cls: shared ? 'ciag' : 'droga', side: 0, dir: d }); return out; }
  const map1 = v => ({ lane: 'pas', opposite_lane: 'kontrapas', track: 'droga', opposite_track: 'droga', share_busway: 'buspas', opposite_share_busway: 'buspas', shared_lane: 'sharrow', opposite: 'kontraruch' })[v];
  const push = (cls, sideNum, explicit) => { let dir; if (cls === 'kontraruch') dir = 2; else if (explicit !== null && explicit !== undefined) dir = explicit === 0 ? 0 : explicit; else if (cls === 'kontrapas') dir = carDir ? -carDir : -1; else if (carDir) dir = carDir; else dir = sideNum < 0 ? -1 : sideNum > 0 ? 1 : 0; out.push({ cls, side: sideNum, dir }); };
  const sideVal = (side, v) => { let cls = map1(v); if (!cls) return; const explicit = ow(t['cycleway:' + side + ':oneway']), contraLeft = side === 'left' && carDir && t['oneway:bicycle'] === 'no' && explicit === null; if (cls === 'pas' && carDir && (explicit === -carDir || contraLeft)) cls = 'kontrapas'; const ex = (cls === 'sharrow' || cls === 'buspas') && contraLeft ? -carDir : explicit; push(cls, side === 'left' ? -1 : 1, cls === 'kontrapas' && explicit === null ? null : ex); };
  if (t['cycleway:left']) sideVal('left', t['cycleway:left']); if (t['cycleway:right']) sideVal('right', t['cycleway:right']); if (t['cycleway:both']) { sideVal('left', t['cycleway:both']); sideVal('right', t['cycleway:both']); }
  if (t.cycleway && !out.length) { const cls = map1(t.cycleway); if (cls) { if (/^opposite/.test(t.cycleway)) push(cls === 'pas' ? 'kontrapas' : cls, cls === 'kontraruch' ? 0 : -1, null); else if (carDir) push(cls, 1, null); else { push(cls, -1, null); push(cls, 1, null); } } }
  if (!out.length && carDir && t['oneway:bicycle'] === 'no') push('kontraruch', 0, null);
  return out; }
function layerOf(t) { let l = parseInt(t.layer, 10) || 0; if (t.bridge && t.bridge !== 'no' && l < 1) l = 1; if (t.tunnel && t.tunnel !== 'no' && l > -1) l = -1; return l; }
function makeRoad(o, a, b) {
  const t = o.t, hw = t.highway || '', base = hw.replace('_link', ''), ow = ['yes', '1', 'true', '-1'].includes(t.oneway) || t.junction === 'roundabout' || (base === 'motorway' && t.oneway !== 'no');
  const f = parseInt(t['lanes:forward'], 10) || 0, bk = parseInt(t['lanes:backward'], 10) || 0;
  let n = parseInt(t.lanes, 10) || (f + bk) || (ow || base === 'service' ? 1 : 2); if (n < 1) n = 1;
  const wd = parseFloat(String(t.width || '').replace(',', '.')), lw = wd > 2.5 ? wd / n : (base === 'service' && ['parking_aisle', 'driveway'].includes(t.service) ? 2.75 : (LW_CLASS[base] || 3));
  const rank = RANK[base] || 1, minor = base === 'service' || base === 'living_street';
  let pts = o.g.slice(a, b + 1).map(p => [p[0], p[1]]), nk = o.nk.slice(a, b + 1);
  let tl = ow ? (t['turn:lanes'] || t['turn:lanes:forward'] || '') : (t['turn:lanes:forward'] || '');
  { const tn = tl ? tl.split('|').length : 0; if (ow && tn > n) n = tn; } /* brak lanes: liczba pasow z turn:lanes */
  if (t.oneway === '-1') { pts.reverse(); nk.reverse(); }
  const tfc = t['turn:lanes:forward'] ? t['turn:lanes:forward'].split('|').length : 0, tbc = t['turn:lanes:backward'] ? t['turn:lanes:backward'].split('|').length : 0, nf = ow ? n : (f || (bk && bk < n ? n - bk : 0) || (tfc && tfc < n ? tfc : 0) || (tbc && tbc < n ? n - tbc : 0) || Math.round(n / 2)); // liczba pasów forward: z tagów lanes:*, a gdy ich brak – z liczby pasów w turn:lanes:forward/backward
  return { pts, nk, lanes: n, lw: +lw.toFixed(2), oneway: ow, centre: 'auto', marked: t.lane_markings !== 'no' && !minor && n > 1 && (!!t.lanes || rank >= 3), edge: rank >= 3 && t.lane_markings !== 'no', kerb: true, osm: o.id, sf: t.surface || '', name: t.name || '', hw, tl, tlb: ow ? '' : (t['turn:lanes:backward'] || ''), nf, ly: layerOf(t), br: !!t.bridge && t.bridge !== 'no' };
}
const specOff = r => !!r._edge || r._osg === -1; /* offset nieparzystych jezdni tylko w szczegolnych ukladach (turn:lanes z rozjazdem); inaczej os OSM jest na srodku */
const ruleOff = r => { const nl = r.lanes | 0; if (!(nl >= 3 && nl <= 6) || !r.oneway || !r.tl) return null; const t = r.tl.split('|'); if (t.length !== nl) return null; const st = x => x === '' || x === 'through' || x === 'none'; let a = 0; while (a < nl && !st(t[a])) a++; let b = nl; while (b > a && !st(t[b - 1])) b--; if (b - a < 2 || b - a === nl) return null; if (!t.slice(a, b).every(st)) return null; return nl / 2 - (a + b) / 2; }; /* turn:lanes: pasy skretu tylko na brzegach, >=2 pasy na wprost: os dokladnie na srodku pasow na wprost (offset = srodek jezdni - srodek pasow prosto) */
const rightRule = r => ruleOff(r) !== null;
const lmRule = r => { if (!r.oneway || (r.lanes | 0) !== 3 || !r.tl) return false; const t = r.tl.split('|'); return t.length === 3 && /left/.test(t[0]) && !/right/.test(t[0]) && /through/.test(t[1]) && !/left|right/.test(t[1]) && /right/.test(t[2]) && !/left/.test(t[2]); }; /* 3 pasy left | prosto | right: os miedzy lewym a srodkowym pasem */
const offBase = r => { const nl = r.lanes | 0; if (!r.oneway) return 0; if (lmRule(r)) return 0.5; /* reguly osi wg turn:lanes dla kazdej klasy drogi (dawniej tylko motorway..secondary) */ if (rightRule(r)) return ruleOff(r); return specOff(r) && nl >= 3 && nl % 2 === 1 ? (r._osg || 1) / 2 : 0; }; /* offset jezdni wzgledem osi w pasach */
const hasOff = r => (r.off != null && r.off !== '') || r.offS != null || r.offE != null;
const offAt = (r, e) => { const v = e ? r.offE : r.offS; return v != null && v !== '' ? +v : (r.off != null && r.off !== '' ? +r.off : offBase(r)); };
const noOff = r => { const t = (r.tl || '').split('|'); return (r.lanes | 0) === 3 && t.length === 3 && (t[0] === 'through' || t[0] === '') && t[1] === 'through' && /right/.test(t[2]); }; /* through|through|right: offset po lewej (dodatkowy pas z lewej) */
const newRoad = (pts, nk) => ({ pts, nk, lanes: 2, lw: 3.5, oneway: false, centre: 'auto', marked: true, edge: false, kerb: true, osm: 0, name: '', hw: 'residential', tl: '', nf: 1 });

// ---------- warstwa OSM ----------
let osmBusy = 0, osmWait = [];
const osmIdle = () => osmBusy ? Promise.race([new Promise(r => osmWait.push(r)), new Promise(r => setTimeout(r, 10000))]) : Promise.resolve(); /* podklad (Geoportal) czeka na wczytanie drog OSM */
async function loadOsmAround(lat, lon, box) { osmBusy++; try { return await loadOsmAround0(lat, lon, box); } finally { if (!--osmBusy) { osmWait.forEach(f => f()); osmWait = []; } } }
async function loadOsmAround0(lat, lon, box) {
  const tx = Math.floor(lon / 0.02), ty = Math.floor(lat / 0.01); let fail = 0;
  const [xa, xb, ya, yb] = box || [tx - 1, tx + 1, ty - 1, ty + 1];
  for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) {
    const k = x + '_' + y; if (S.osm.tiles.has(k)) continue; let done = false;
    for (let at = 0; at < 3 && !done; at++) {
      try { const r = await fetch(`data/roads/gdynia/${k}.json`); if (r.status === 404) { done = true; break; } if (!r.ok) throw new Error(r.status); for (const w of await r.json()) if (!S.osm.ways.has(w.i)) S.osm.ways.set(w.i, { id: w.i, t: w.t, g: w.g.map(c => proj(c[0], c[1])), nk: w.g.map(c => c[0].toFixed(7) + ',' + c[1].toFixed(7)) }); done = true; } catch (e) { await new Promise(r => setTimeout(r, 400 * (at + 1))); }
    }
    if (done) S.osm.tiles.add(k); else fail++;
  }
  say(`OSM: ${S.osm.ways.size} dróg w pamięci` + (fail ? ' (część kafelków niedostępna)' : '')); render();
}
function importView(margin = 40) {
  const a = s2w([0, 0]), b = s2w([W, H]), x0 = Math.min(a[0], b[0]) - margin, x1 = Math.max(a[0], b[0]) + margin, y0 = Math.min(a[1], b[1]) - margin, y1 = Math.max(a[1], b[1]) + margin;
  const cov = new Map(); for (const r of S.doc.road) { if (!cov.has(r.osm)) cov.set(r.osm, new Set()); for (const k of r.nk) cov.get(r.osm).add(k); } // wezly juz zaimportowane (droga mogla byc wczesniej wczytana tylko czesciowo)
  let n = 0, full = false;
  for (const o of S.osm.ways.values()) {
    if (S.doc.del && S.doc.del.includes(o.id)) continue; const hw = (o.t.highway || '').replace('_link', ''); if (!OKHW.has(hw) || o.t.area === 'yes') continue;
    const have = cov.get(o.id), need = o.g.map((p, i) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1 && !(have && have.has(o.nk[i])));
    if (!have && need.some(Boolean) && o.g.length > 1) { if (S.doc.road.length >= 500) { full = true; break; } S.doc.road.push(makeRoad(o, 0, o.g.length - 1)); n++; continue; } // cala droga naraz (nie ciecie na kawalki przy widoku – to psulo zwezenia i rozjazdy)
    for (let i = 0; i < need.length; i++) {
      if (!need[i]) continue; let j = i; while (j + 1 < need.length && need[j + 1]) j++;
      const A = Math.max(0, i - 1), B = Math.min(o.g.length - 1, j + 1); i = j;
      if (B <= A) continue; if (S.doc.road.length >= 500) { full = true; break; } S.doc.road.push(makeRoad(o, A, B)); n++;
    }
    if (full) break;
  }
  S.undo = []; save(); touch(); ui(); say(`Wczytano ${n} dróg z widoku (łącznie ${S.doc.road.length}).` + (full ? ' Limit 500 dróg – przybliż widok.' : ''));
}
function osmAt(w, tol) { let best = null, bd = tol; for (const o of S.osm.ways.values()) for (let j = 1; j < o.g.length; j++) { const d = segDist(w, o.g[j - 1], o.g[j]); if (d < bd) { bd = d; best = o; } } return best; }
function parseLink(t) {
  let m = /#map=(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(t); if (m) return { z: +m[1], lat: +m[2], lon: +m[3] };
  m = /(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)/.exec(t); return m ? { z: 18, lat: +m[1], lon: +m[2] } : null;
}
async function loadLink(txt) {
  const p = parseLink(txt); if (!p) { say('Nie rozpoznaję linku. Potrzebny fragment #map=zoom/lat/lon.'); return; }
  S.org = { lat: p.lat, lon: p.lon }; S.osm.ways.clear(); S.osm.tiles.clear(); S.doc = { road: [] }; S.sel = -1; S.vsel = -1; S.undo = []; S.redo = [];
  S.view = { x: 0, y: 0, k: Math.pow(2, p.z) / (156543.03 * Math.cos(p.lat * Math.PI / 180)) };
  say('Wczytuję…'); render(); await loadOsmAround(p.lat, p.lon); importView(); if (!S.doc.road.length) say('Brak danych dróg dla tego miejsca (dostępne: Gdynia i okolice).');
}

// ---------- układ automatyczny ----------
// przed zaokragleniem: gdy sasiednie odcinki sa za krotkie, zeby zmiescil sie luk o promieniu >= minR (polowa szerokosci jezdni + zapas), usuwamy blizszy wezel - inaczej wewnetrzna krawedz sie zawija (kolce)
function thinForRadius(pts, minR) {
  if (minR <= 0 || pts.length < 3) return pts; let P = pts.map(q => q.slice());
  for (let it = 0; it < 80; it++) { let ch = false;
    for (let i = 1; i < P.length - 1 && !ch; i++) { const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], l1 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]), l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]); if (l1 < 1e-6 || l2 < 1e-6) continue;
      const cs = ((p0[0] - p1[0]) * (p2[0] - p1[0]) + (p0[1] - p1[1]) * (p2[1] - p1[1])) / (l1 * l2), ang = Math.acos(Math.max(-1, Math.min(1, cs))); if (ang > 3.1 || ang < 0.05) continue;
      const need = minR / Math.tan(ang / 2), lim = Math.min(l1 * (i === 1 ? 0.9 : 0.5), l2 * (i === P.length - 2 ? 0.9 : 0.5)); if (need <= lim) continue;
      if (l1 <= l2 && i - 1 > 0) { P.splice(i - 1, 1); ch = true; } else if (l2 < l1 && i + 1 < P.length - 1) { P.splice(i + 1, 1); ch = true; } else if (i - 1 > 0 && i + 1 < P.length - 1) { P.splice(l1 <= l2 ? i - 1 : i + 1, 1); ch = true; } }
    if (!ch) break; }
  return P;
}
function filletPts(pts, r, minR) {
  pts = thinForRadius(pts, minR || 0); // zaokragla zalamania lamanej lukami o promieniu r (os OSM zostaje ostra; zaokraglona jest tylko jezdnia)
  if (pts.length < 3 || r <= 0) return pts.map(q => q.slice()); const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], len = a => Math.hypot(a[0], a[1]), nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; }, out = [pts[0].slice()];
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], d1 = nrm(sub(p0, p1)), d2 = nrm(sub(p2, p1)), l1 = len(sub(p0, p1)), l2 = len(sub(p2, p1));
    const cs = Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])), ang = Math.acos(cs); if (ang > 3.1 || ang < 0.02) { out.push(p1.slice()); continue; }
    let tl = r / Math.tan(ang / 2); const lim = Math.min(l1 * (i === 1 ? 0.9 : 0.5), l2 * (i === pts.length - 2 ? 0.9 : 0.5)); let rr = r; if (tl > lim) { tl = lim; rr = tl * Math.tan(ang / 2); }
    const a = [p1[0] + d1[0] * tl, p1[1] + d1[1] * tl], b = [p1[0] + d2[0] * tl, p1[1] + d2[1] * tl], bis = nrm([d1[0] + d2[0], d1[1] + d2[1]]), c = [p1[0] + bis[0] * rr / Math.sin(ang / 2), p1[1] + bis[1] * rr / Math.sin(ang / 2)];
    const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), a1 = Math.atan2(b[1] - c[1], b[0] - c[0]); let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const n = Math.max(2, Math.ceil(Math.abs(da) * rr / 0.5)); for (let k = 0; k <= n; k++) { const t = a0 + da * k / n; out.push([c[0] + rr * Math.cos(t), c[1] + rr * Math.sin(t)]); }
  }
  out.push(pts[pts.length - 1].slice()); return out;
}
function comp(r, h) {
  const Q = (/^(motorway|trunk|primary|secondary)/.test(r.hw || '') && false) ? dense(filletPts(gp(r), +($('fR') ? $('fR').value : 80), Math.max(rw(r) / 2 + 0.5, Math.min(+($('fR') ? $('fR').value : 80), 25))), 2) : (() => { const c0 = window.__smCap; const hwm = /^(motorway|trunk)(?!_link)/.test(r.hw || ''); if (/^(motorway|trunk)/.test(r.hw || '')) window.__smCap = Math.max(c0 || 0, 12); const g0 = window.__gaussSig, e0 = window.__gaussEnds; window.__gaussSig = hwm ? 14 : 0; window.__gaussEnds = window.__endTan && window.__endTan.get(r) || null; try { return smoothDense(gp(r), 2, h && h.tin, h && h.tout, h && h.sm); } finally { window.__smCap = c0; window.__gaussSig = g0; window.__gaussEnds = e0; } })(), /* autostrady i ekspresowki: lagodne luki (os OSM ma drobne zalamania - krawedz falowala) */ w = Q.map(() => rw(r)), nl = r.lanes | 0, dS = offAt(r, 0) * (r.lw || 3.75), dE = offAt(r, 1) * (r.lw || 3.75), d0 = dS, cq0 = cumOf(Q), Lq0 = cq0[cq0.length - 1], free = j => { const k = r.nk[j]; return !k || !S.doc.road.some(x => x.nk !== r.nk && x.nk.includes(k)); }, fs = d0 && !hasOff(r) && free(0), fe = d0 && !hasOff(r) && free(r.nk.length - 1), Tf = Math.max(1, Math.min(30, Lq0 / 2)), sstep = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }, fOf = j => r.offTS != null ? Math.min(1, cq0[j] / Math.max(0.5, +r.offTS)) : r.offTE != null ? 1 - Math.min(1, (Lq0 - cq0[j]) / Math.max(0.5, +r.offTE)) : cq0[j] / Math.max(1, Lq0) /* krotkie przejscie offsetu przy wezle (offTS/offTE w m) zamiast na calej dlugosci */, d = Q.map((_, j) => (dS + (dE - dS) * sstep(fOf(j))) * Math.min(fs ? sstep(cq0[j] / Tf) : 1, fe ? sstep((Lq0 - cq0[j]) / Tf) : 1)); /* wolny koniec (nic sie nie laczy): os OSM na srodku jezdni, offset narasta plynnie w glab drogi; standardowy offset 3-pasmowki (dodatkowy pas po prawej) na calej dlugosci; konfiguracja turn:lanes prosto|w prawo|w prawo ma ponadto rozjazd liczony od tego offsetu (_edge) */ return { Q, w, d, d0, dS, dE, e: Q.map(() => 0), side: 1, cum: cumOf(Q) };
}
const orient = (c, st) => st ? c : { Q: c.Q.slice().reverse(), d: c.d.map(v => -v).reverse(), w: c.w.slice().reverse(), cum: c.cum.map(v => c.cum[c.cum.length - 1] - v).reverse() };
const edgeOf = (o, sg, ins = 0) => offsetPts(o.Q, o.d.map((v, i) => v + sg * (o.w[i] / 2 - ins)));
function unitFrom(c, st, dd = 10) { const o = orient(c, st), p = atS(o.Q, o.cum, Math.min(dd, o.cum[o.cum.length - 1])), l = dist(o.Q[0], p) || 1; return [(p[0] - o.Q[0][0]) / l, (p[1] - o.Q[0][1]) / l]; }
function endShift(c, st, f) { const n = c.Q.length, len = c.cum[n - 1]; for (let i = 0; i < n; i++) { const s = st ? c.cum[i] : len - c.cum[i], v = f(s); if (v) c.d[i] += st ? v : -v; } }
function endWidth(c, st, f) { const n = c.Q.length, len = c.cum[n - 1]; for (let i = 0; i < n; i++) { const s = st ? c.cum[i] : len - c.cum[i]; c.w[i] = f(s, c.w[i]); } }


// ---------- rozjazd na szkielecie (przeniesiony z rozjazd-szkielet.html) ----------
const SHOW_CHEV = false;
function skelFork(X, yl, yr, C, R, gores) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k], nrm = a => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; }, nOf = t => [-t[1], t[0]];
  const dens = (Q, ds) => { const c = cumOf(Q), L = c[c.length - 1], out = []; for (let s = 0; s < L; s += ds) out.push(atS(Q, c, s)); out.push(Q[Q.length - 1]); return out; };
  const w = R[X.i].lw || 3.75, nX = R[X.i].lanes, T = Math.max(25, +(nX >= 4 ? $('fT2').value : $('fT').value) || 70); /* krotsze przejscie niz ok. 25 m daje fale przy rozstawie ramp */
  const oX = orient(C[X.i], X.st), n0 = oX.Q[0], tX = nrm(sub(oX.Q[Math.min(2, oX.Q.length - 1)], oX.Q[0])), e = mul(tX, -1), nE = nOf(e);
  const arms = [yl, yr].map(ye => { const o = orient(C[ye.i], ye.st); return { ye, D: dens(o.Q, 0.5), l: R[ye.i].lanes }; });
  const lat = D => { const b = D[Math.min(D.length - 1, 30)]; return nE[0] * (b[0] - n0[0]) + nE[1] * (b[1] - n0[1]); }, outer = D => lat(D) > 0 ? -1 : 1;
  let sA = outer(arms[1].D), sB = outer(arms[0].D);
  if (sA === sB) { const dA = Math.abs(lat(arms[0].D)), dB = Math.abs(lat(arms[1].D)); if (dA >= dB) sA = -sA; else sB = -sB; }
  arms[0].sg = sA; arms[1].sg = sB;
  const neg = arms.find(o => o.sg < 0) || arms[0], pos = arms.find(o => o !== neg);
  let xN = nX * w / 2; if (nX % 2 === 1 && specOff(R[X.i])) { /* przesuniecie o pol pasa tylko dla drog z offsetem (_edge/_osg); wyrownana os = jezdnia symetryczna */ const extraNeg = neg.l < pos.l; xN = extraNeg ? w + (nX - 1) * w / 2 : (nX - 1) * w / 2; }
  if ((nX % 2 === 1 && R[X.i]._edge) || hasOff(R[X.i]) || rightRule(R[X.i]) || lmRule(R[X.i])) xN = (X.st ? 1 : -1) * ((X.st ? C[X.i].dS : C[X.i].dE) || 0) + nX * w / 2; // turn:lanes: os na granicy pasa 'prosto' i pasow 'w prawo' - rozjazd liczony od tego offsetu
  neg.c = -xN + neg.l * w / 2; pos.c = -xN + neg.l * w + pos.l * w / 2;
  if (neg.l + pos.l === nX + 1) { xN = nX * w / 2; neg.c = -xN + neg.l * w / 2; pos.c = xN - pos.l * w / 2; } /* 3->2+2: wspolny pas srodkowy - odnogi startuja nakladajac sie o jeden pas */
  { const tkn = String(R[X.i].tl || '').split('|').filter(Boolean), nt = (!X.st && tkn.length === nX) ? tkn.filter(v => v.split(';').some(x => x === 'through')).length : 0; for (const o of arms) o.straight = nt > 0 && nt < nX && o.l === nt && arms.every(z => z === o || z.l !== nt); } /* turn:lanes: odnoga z pasami 'prosto' biegnie prosto, nie wg osi OSM */
  for (const o of arms) {
    const D = o.D, dir = o.sg > 0 ? 1 : -1, lamC = dir * o.c, cD = cumOf(D); let iT = 0;
    // prosto w swoim pasie (rownolegle do drogi wjazdowej), dopoki wlasna os odnogi nie dojdzie do tego pasa; potem hermite o dlugosci przejscia T
    let sS = 0; { const k = D.findIndex(q => dir * (nE[0] * (q[0] - n0[0]) + nE[1] * (q[1] - n0[1])) >= lamC); sS = k < 0 ? 0 : cD[k]; sS = Math.max(0, Math.min(sS, 2 * T, cD[cD.length - 1] - T)); }
    let Tm = T; if (!arms.some(z => z.straight && z === o)) { // przejscie konczy sie najpozniej na pierwszym wierzcholku osi odnogi (po pominieciu kikuta), nie krocej niz 25 m: punkt osi lezy juz na srodku jezdni
      const rp = gp(R[o.ye.i]), P = o.ye.st ? rp : rp.slice().reverse(); let vi = 1; if (P.length >= 3) { const d1 = dist(P[0], P[1]), d2 = dist(P[1], P[2]); if (d1 > 1e-6 && d2 > 1e-6 && d1 < 15 && Math.acos(Math.max(-1, Math.min(1, ((P[1][0] - P[0][0]) * (P[2][0] - P[1][0]) + (P[1][1] - P[0][1]) * (P[2][1] - P[1][1])) / (d1 * d2)))) * 180 / Math.PI > 8) vi = 2; }
      { let cs = 0; for (let q = 1; q < P.length; q++) { cs += dist(P[q - 1], P[q]); if (cs >= 24) { if (q > vi) vi = q; break; } } } /* punkty 10 m od wezla (edytor rozjazdu) nie skracaja przejscia: autorytetem jest pierwszy wierzcholek >=24 m */ const tv = P[Math.min(vi, P.length - 1)]; let bi = 0, bd = 1e9; D.forEach((q, i) => { const dd = Math.hypot(q[0] - tv[0], q[1] - tv[1]); if (dd < bd) { bd = dd; bi = i; } }); const s1 = cD[bi]; if (s1 > 0) { Tm = Math.max(8, Math.min(T, s1)); sS = Math.max(0, Math.min(sS, s1 - Tm)); } } // punkt osi jest autorytetem: jezdnia przechodzi przez niego (przejscie moze byc krotsze niz T)
    { const k = cD.findIndex(v => v >= sS + Tm); iT = k < 1 ? D.length - 1 : k; }
    const dOwn = offAt(R[o.ye.i], o.ye.st ? 0 : 1) * (R[o.ye.i].lw || w) || 0, cA = o.c - dOwn, /* jezdnia = os + offset wlasny (dodawany pozniej): wlasny offset odnogi odejmujemy od polozenia startowego, zeby jezdnia startowala dokladnie w swoim pasie */ P0 = add(add(n0, mul(nE, cA)), mul(e, sS)), P1 = D[iT], T1 = nrm(sub(D[Math.min(D.length - 1, iT + 1)], D[Math.max(0, iT - 1)])), L = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]) || 1, N = Math.max(4, Math.ceil(L / 0.5)), M0 = mul(e, L * 0.8), M1 = mul(T1, L), Cd = []; /* start rownolegly (styczna = przedluzenie wjazdu), ale krotki odcinek poczatkowy (0.35 L): rampa szybko sie odchyla */
    for (let q = 0; q < sS - 1e-6; q += 0.5) Cd.push(add(add(n0, mul(nE, cA)), mul(e, q))); const pre = Cd.length;
    for (let k = 0; k <= N; k++) { const u = k / N, h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2; Cd.push([0, 1].map(q => h00 * P0[q] + h10 * M0[q] + h01 * P1[q] + h11 * M1[q])); }
    for (let k = iT + 1; k < D.length; k++) Cd.push(D[k]);
    if (Cd.length > 1) Cd.splice(1, 0, add(Cd[0], mul(e, 0.02))); /* pierwszy odcinek dokladnie wzdluz drogi glownej: przekroj na zlaczu prostopadly jak u niej (bez klinowej szczeliny) */
    o.Cd = Cd; o.nh = pre + N + 1; o.dOwn = dOwn; o.cTrue = o.c;
  }
  // zakaz nakladania: osie jezdni zjazdu nie moga zblizyc sie bardziej niz suma polowek szerokosci + margines; odsuwamy lagodnie (mniejsza odnoga ustepuje)
  if (arms[0].l + arms[1].l !== nX + 1) { const A = arms[0], B = arms[1], nA = A.Cd.length, nB = B.Cd.length, hs = (A.l + B.l) * w / 2, CL = 1.6, sh = A.straight !== B.straight ? (A.straight ? [0, 1] : [1, 0]) : (A.l === B.l ? [0.5, 0.5] : (A.l < B.l ? [1, 0] : [0, 1]));
    const real = O => { const n = O.Cd.length, tg = i => nOf(nrm(sub(O.Cd[Math.min(n - 1, i + 1)], O.Cd[Math.max(0, i - 1)]))), tr = add(n0, mul(nE, O.c)), s0 = tg(0), sg = dist(add(O.Cd[0], mul(s0, O.dOwn || 0)), tr) <= dist(add(O.Cd[0], mul(s0, -(O.dOwn || 0))), tr) ? 1 : -1; return O.Cd.map((q, i) => add(q, mul(tg(i), sg * (O.dOwn || 0)))); }, rA = real(A), rB = real(B); /* odstep liczony miedzy rzeczywistymi osiami jezdni (z offsetem), nie miedzy osiami OSM */
    const pA = new Array(nA).fill(0), pB = new Array(nB).fill(0), dirA = new Array(nA), dirB = new Array(nB); let sA2 = 0;
    for (let i = 0; i < nA; i++) { if (i) sA2 += Math.hypot(A.Cd[i][0] - A.Cd[i - 1][0], A.Cd[i][1] - A.Cd[i - 1][1]); let bj = Math.min(nB - 1, i), bd = 1e9; for (let j = Math.max(0, i - 80); j < Math.min(nB, i + 80); j++) { const d = Math.hypot(rA[i][0] - rB[j][0], rA[i][1] - rB[j][1]); if (d < bd) { bd = d; bj = j; } }
      const need = hs + CL * sm5(Math.max(0, sA2 - 6) / 20), def = Math.max(0, need - bd); if (def > 0) { const v = nrm(sub(A.Cd[i], B.Cd[bj])); pA[i] = Math.max(pA[i], def * sh[0]); pB[bj] = Math.max(pB[bj], def * sh[1]); dirA[i] = v; dirB[bj] = mul(v, -1); } }
    const spread = P => { const n = P.length, r = 10; let Q = P.map((v, i) => { let m = 0; for (let k = Math.max(0, i - r); k <= Math.min(n - 1, i + r); k++) m = Math.max(m, P[k]); return m; }); for (let it = 0; it < 4; it++) { const Z = Q.slice(); for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let k = Math.max(0, i - 8); k <= Math.min(n - 1, i + 8); k++) { a += Q[k]; c++; } Z[i] = a / c; } Q = Z; } return Q; };
    const qA = spread(pA), qB = spread(pB);
    const apply = (O, q, dirs) => { const n = O.Cd.length, NN = O.Cd.map((_, i) => nOf(nrm(sub(O.Cd[Math.min(n - 1, i + 1)], O.Cd[Math.max(0, i - 1)])))); let bi = -1, bm = 0; for (let i = 0; i < n; i++) if (dirs[i] && q[i] > bm) { bm = q[i]; bi = i; } if (bi < 0) return; const sg = NN[bi][0] * dirs[bi][0] + NN[bi][1] * dirs[bi][1] >= 0 ? 1 : -1; // jedna, stala strona odsuniecia (od drugiej odnogi)
      for (let i = 0; i < n; i++) if (q[i] > 0.005) O.Cd[i] = [O.Cd[i][0] + NN[i][0] * sg * q[i], O.Cd[i][1] + NN[i][1] * sg * q[i]]; };
    const fadeIn = q => q.map((v, i) => v * sm5(i * 0.5 / 8)); apply(A, fadeIn(qA), dirA); apply(B, fadeIn(qB), dirB); }
  for (const o of arms) { const c = C[o.ye.i], Q = o.ye.st ? o.Cd : o.Cd.slice().reverse(); c.fe = (c.fe || []).filter(f => f.st !== o.ye.st).concat({ st: o.ye.st, P: o.Cd[0], e }); for (const f of c.fe) { if (f.st === o.ye.st) continue; const j0 = f.st ? 0 : Q.length - 1, j1 = f.st ? 1 : Q.length - 2; if (Q.length > 1 && dist(Q[j0], f.P) < 0.05 && dist(Q[j0], Q[j1]) > 0.03) { const q = [f.P[0] + f.e[0] * 0.02, f.P[1] + f.e[1] * 0.02]; if (f.st) Q.splice(1, 0, q); else Q.splice(Q.length - 1, 0, q); } } /* drugi rozjazd na drugim koncu drogi przelicza jej punkty: przywroc prostopadly koniec przy pierwszym */ c.Q = Q; { const cq0 = cumOf(Q), Lq0 = cq0[cq0.length - 1], wOwn = o.l * (R[o.ye.i].lw || w), Lr = Math.min(T, 30, Lq0); c.tps = (c.tps || []).filter(t => t.st !== o.ye.st).concat({ st: o.ye.st, w0: o.l * w, Lr }); c.w = Q.map((_, j) => c.tps.reduce((acc, t) => { const sj = t.st ? cq0[j] : Lq0 - cq0[j]; return acc + (t.w0 - wOwn) * (1 - sm5(sj / t.Lr)); }, wOwn)); } /* odnoga bywa ramieniem dwoch rozjazdow (na obu koncach): zwezenia z obu koncow sie sumuja, drugi nie kasuje pierwszego */ /* odnoga zaczyna szerokoscia pasa drogi wjazdowej i plynnie poszerza sie do wlasnej */ { const d0a = R[o.ye.i].off != null && R[o.ye.i].off !== '' ? R[o.ye.i].off * w : offBase(R[o.ye.i]) * w, cq = cumOf(Q), Lq = cq[cq.length - 1], Lfa = Math.max(1, Math.min(150, Lq - Math.min(T, Lq / 2))); c.d0 = d0a; c.d = Q.map((_, j) => d0a * sm5(((o.ye.st ? cq[j] : Lq - cq[j]) - Math.min(T, Lq / 2)) / Lfa)); } c.e = Q.map(() => 0); c.side = 1; c.tf = undefined; c.cum = cumOf(Q); }
  if (arms[0].l + arms[1].l === nX + 1) { // 3->2+2: wewnetrzne krawedzie ramion nakladaja sie na wspolnym pasie - nie rysujemy ich, dopoki ramiona sie nie rozsuna
    const hs = (arms[0].l + arms[1].l) * w / 2;
    arms.forEach((o, ai) => { const c = C[o.ye.i], oth = arms[1 - ai].Cd, Q = c.Q, st = o.ye.st, n = Q.length;
      const dOth = j => { const q = Q[j]; let bd = 1e9; for (const p of oth) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) bd = d; } return bd; };
      const m = Q.map((_, j) => dOth(j) < hs - 0.15), j0 = Math.floor(n / 2), t = [Q[Math.min(n - 1, j0 + 1)][0] - Q[j0][0], Q[Math.min(n - 1, j0 + 1)][1] - Q[j0][1]], rt = offsetPts([Q[j0], [Q[j0][0] + t[0], Q[j0][1] + t[1]]], [1, 1])[0];
      let nearO = oth[0], bd = 1e9; for (const p of oth) { const d = Math.hypot(p[0] - Q[j0][0], p[1] - Q[j0][1]); if (d < bd) { bd = d; nearO = p; } }
      const sg = ((rt[0] - Q[j0][0]) * (nearO[0] - Q[j0][0]) + (rt[1] - Q[j0][1]) * (nearO[1] - Q[j0][1])) >= 0 ? 1 : -1;
      c.skipIn = { sg, m }; });
  }
  { const c = C[X.i], dc = (xN - nX * w / 2), Ln = c.cum[c.cum.length - 1], T0 = Math.min(T, Ln / 2), Lf = Math.max(1, Math.min(150, Ln - T0)); // krotka droga: offset gasnie do konca drogi, nie zostaje schodka na styku // offset nieparzystej jezdni tylko przy rozjezdzie, potem plynnie wraca do osi (bez schodka na styku z dalsza czescia drogi)
    c.w = c.Q.map(() => nX * w); c.d = c.Q.map((_, j) => { const sj = X.st ? c.cum[j] : Ln - c.cum[j]; const g = (X.st ? 1 : -1) * dc, d0 = (X.st ? c.dE : c.dS) || 0; return d0 + (g - d0) * (1 - sm5((sj - T0) / Lf)); }); c.e = c.Q.map(() => 0); c.tf = undefined; }
  if (!SHOW_CHEV) return; // szewrony (klin) wylaczone na razie calkiem
  // klin z szewronami (wariant 1: ramiona konczace sie rowno z krawedzia), rowne odstepy wzdluz osi klina
  const A = arms[0], B = arms[1], edge = (o, sg) => offsetPts(o.Cd, sg * o.l * w / 2), ia = edge(A, A.sg > 0 ? -1 : 1), ib = edge(B, B.sg > 0 ? -1 : 1);
  const SP = 1.7, AL = 58 * Math.PI / 180, NCH = 8;
  const near = (i, Pb) => { let bj = 0, bd = 1e9; for (let j = Math.max(0, i - 60); j < Math.min(Pb.length, i + 60); j++) { const d = Math.hypot(ia[i][0] - Pb[j][0], ia[i][1] - Pb[j][1]); if (d < bd) { bd = d; bj = j; } } return [bj, bd]; };
  const M = [], Gp = [], Cs = [0]; const nI = Math.min(ia.length, ib.length);
  for (let i = 0; i < nI; i++) { const [j, g] = near(i, ib); M.push([(ia[i][0] + ib[j][0]) / 2, (ia[i][1] + ib[j][1]) / 2]); Gp.push(g); if (i) Cs.push(Cs[i - 1] + Math.hypot(M[i][0] - M[i - 1][0], M[i][1] - M[i - 1][1])); }
  let i0 = -1; for (let i = 8; i < nI; i++) if (Gp[i] >= 2.2) { i0 = i; break; } if (i0 < 0) return;
  const apexes = []; for (let k = 0; k < NCH; k++) { const sT = Cs[i0] + k * SP; let i = i0; while (i < nI - 1 && Cs[i] < sT) i++; if (Cs[i] < sT - 1e-6) break; const f = i > 0 ? (sT - Cs[i - 1]) / ((Cs[i] - Cs[i - 1]) || 1) : 1; apexes.push({ i, m: i > 0 ? [M[i - 1][0] + (M[i][0] - M[i - 1][0]) * f, M[i - 1][1] + (M[i][1] - M[i - 1][1]) * f] : M[i] }); }
  if (!apexes.length) return;
  const iL = apexes[apexes.length - 1].i, hL = Gp[iL] / 2; let iEnd = iL; while (iEnd < nI - 1 && Cs[iEnd] < Cs[iL] + hL * 0.9 + 0.6) iEnd++;
  const jEnd = near(iEnd, ib)[0], clip = ia.slice(0, iEnd + 1).concat(ib.slice(0, jEnd + 1).reverse());
  const inP = pt => { let c = false; for (let i = 0, j = clip.length - 1; i < clip.length; j = i++) { const a = clip[i], b = clip[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const nearIdx = (E, pt) => { let bj = 0, bd = 1e9; for (let j = 0; j < E.length; j++) { const q = Math.hypot(E[j][0] - pt[0], E[j][1] - pt[1]); if (q < bd) { bd = q; bj = j; } } return bj; };
  const chev = [], lastHits = [];
  apexes.forEach(({ i, m }) => {
    const i1 = Math.max(0, i - 6), i2 = Math.min(nI - 1, i + 6), u = nrm(sub(M[i2], M[i1])), nn = nOf(u), hits = [];
    [-1, 1].forEach(sd => { const d = add(mul(u, Math.cos(AL)), mul(nn, sd * Math.sin(AL))); let t = 0; while (t < 40 && inP(add(m, mul(d, t + 0.05)))) t += 0.05; hits.push(add(m, mul(d, t))); });
    chev.push([hits[0], m, hits[1]]); lastHits.length = 0; lastHits.push(hits[0], hits[1], m);
  });
  const dA = lastHits.slice(0, 2).map(h => { const j = nearIdx(ia, h); return Math.hypot(ia[j][0] - h[0], ia[j][1] - h[1]); }), kA = dA[0] <= dA[1] ? 0 : 1, hh = [lastHits[kA], lastHits[1 - kA]];
  const poly = ia.slice(0, nearIdx(ia, hh[0]) + 1).concat([hh[0], lastHits[2], hh[1]], ib.slice(0, nearIdx(ib, hh[1]) + 1).reverse());
  gores.push({ poly, A: [], B: [], clip, nl: true, chev, ly: R[X.i].ly | 0 });
}

// ---------- zmiana liczby pasow na szkielecie (przyrost / redukcja) ----------
function skelLanes(G, C, R, after) { /* after = true: wezsza droga zaczyna sie pelna szerokoscia przy wezle i zwęza sie ZA nim (skrzyzowanie), szersza zostaje pelna do wezla */
  const n0 = R[G[0].i].lanes, n1 = R[G[1].i].lanes, we = n0 > n1 ? G[0] : G[1], ne = n0 > n1 ? G[1] : G[0], m = Math.max(n0, n1), n = Math.min(n0, n1), w = R[we.i].lw || 3.75;
  const cw = C[we.i], ow = orient(cw, we.st), node = ow.Q[0], u = unitFrom(cw, we.st); let bd = 25, sf = 1; // strona zewnetrzna = od najblizszej innej drogi
  R.forEach((r2, i2) => { if (i2 === G[0].i || i2 === G[1].i) return; r2.pts.forEach(q => { const dd = dist(q, node); if (dd < bd) { bd = dd; sf = (u[0] * (q[1] - node[1]) - u[1] * (q[0] - node[0])) >= 0 ? -1 : 1; } }); });
  const lay = (k, e) => k === 1 ? [-w / 2, w / 2] : k % 2 === 0 ? [-k * w / 2, k * w / 2] : (e > 0 ? [-(k - 1) * w / 2, (k - 1) * w / 2 + w] : [-(k - 1) * w / 2 - w, (k - 1) * w / 2]), e0 = sf * (we.st ? 1 : -1) * (R[we.i]._osg || 1), Wu = lay(m, e0); // (e0: dodatkowy nieparzysty pas po stronie offsetu drogi: z turn:lanes albo domyslnie po prawej) rama u: zewnetrzna strona = +
  let best = null; for (const e of [e0, -e0]) { const N = lay(n, e); if (N[0] >= Wu[0] - 1e-6 && N[1] <= Wu[1] + 1e-6) { best = { N }; break; } } /* offset nieparzystych zawsze po tej samej stronie (e=1), gdy sie miesci */ const nr = R[ne.i], cen = n % 2 === 1 && m % 2 === 0 && !hasOff(nr) && !nr._edge && !offBase(nr), Nu = cen ? [-n * w / 2, n * w / 2] : best ? best.N : lay(n, e0); /* 3->4: os zostaje na srodku 3 pasow, potem plynnie na srodek 4 */
  const toD = I => sf > 0 ? I : [-I[1], -I[0]], [Lm0, Rm0] = toD(Wu), [Ln0, Rn0] = toD(Nu), sw = (we.st ? 1 : -1) * offAt(R[we.i], we.st ? 0 : 1) * w - (Lm0 + Rm0) / 2, sn = (ne.st ? -1 : 1) * offAt(R[ne.i], ne.st ? 0 : 1) * w - (Ln0 + Rn0) / 2, Lm = Lm0 + sw, Rm = Rm0 + sw, Ln = Ln0 + sn, Rn = Rn0 + sn; /* offset (reczny/auto) obu drog na styku: przesuwa oba profile w ramie szerszej drogi */ // w ramie wiekszej drogi (os. od wezla, +d = prawo)
  // wklad kazdego konca drogi przechowujemy jako funkcje odleglosci od tego konca (nie indeksu), bo skelFork potem przelicza Q (inna liczba punktow)
  const set = (e, cum, dLo, dRo, lines) => { const c = C[e.i];
    (c.contrib = c.contrib || {})[e.st ? 'A' : 'B'] = { s: cum.slice(), lo: dLo.slice(), hi: dRo.slice() }; c.e = c.Q.map(() => 0); c.side = 1; c.tf = undefined; c.lat = c.lat || { lines: [] };
    lines.forEach(l => c.lat.lines.push({ p: e.st ? l.p : -l.p, p0: l.p0 == null ? null : e.st ? l.p0 : -l.p0, T: l.T, st: e.st, a: l.a, b: l.b })); };
  const NP = (S.nodeP && S.nodeP[(R[G[0].i].nk || [])[G[0].st ? 0 : R[G[0].i].nk.length - 1]]) || null, SA = NP && NP.s != null ? NP.s : 0.3; /* parametry przejscia ustawione recznie dla wezla */
  const T = NP && NP.T ? Math.max(3, Math.min(NP.T, ow.cum[ow.cum.length - 1] / 1.2)) : Math.max(10, Math.min(+$('fT').value || 35, ow.cum[ow.cum.length - 1] / 1.5));
  const toDp = x => sf > 0 ? x : -x, linesN = [], linesW = [], BIG = 1e9, same = (x, arr) => arr.some(y => Math.abs(x - y) < 1e-6);
  const SN = [], SW = [], MATCH = []; for (let k = 1; k < n; k++) SN.push(Nu[0] + k * w); for (let k = 1; k < m; k++) SW.push(Wu[0] + k * w);
  { const wl = SW.map(x => toDp(x) + sw), used = new Set(); /* linie pasow szerszej drogi: kazda linia wezszej przechodzi plynnie w najblizsza linie szerszej, nadmiarowe linie szerszej wyrastaja dalej */
    SN.forEach(x => { const q = toDp(x) + sn; let k = -1, bk = 1e9; wl.forEach((y, kk) => { if (!used.has(kk) && Math.abs(y - q) < bk) { bk = Math.abs(y - q); k = kk; } }); if (k >= 0) { used.add(k); linesW.push({ p: wl[k], p0: q, T, a: 0, b: BIG }); MATCH.push({ x, y: wl[k] }); } linesN.push({ p: -toDp(x) - sn, a: 0, b: BIG }); });
    wl.forEach((y, kk) => { if (!used.has(kk)) linesW.push({ p: y, a: T * 0.6, b: BIG }); }); }
  const cl = x => Math.max(0, Math.min(1, x)), wR = Math.abs(Rm - Rn) >= Math.abs(Lm - Ln) - 1e-9, iL = wR ? Ln : Lm, iR = wR ? Rm : Rn; // nowy pas = klin; ciagly pas chwilowo na krawedzi, potem plynnie na srodek osi
  const prof = (a0, i0, a1) => ow.cum.map(s => a0 + (i0 - a0) * sm5(cl(s / ((1 - SA) * T))) + (a1 - i0) * sm(cl((s / T - SA) / (1 - SA))));
  if (NP && NP.af != null) after = !!NP.af;
  if (after) { const on2 = orient(C[ne.i], ne.st), e2 = s => sm(cl(s / T)); set(we, ow.cum, ow.cum.map(() => Lm), ow.cum.map(() => Rm), SW.map(x => ({ p: toDp(x) + sw, a: 0, b: BIG })));
    set(ne, on2.cum, on2.cum.map(s => -(Rm + (Rn - Rm) * e2(s))), on2.cum.map(s => -(Lm + (Ln - Lm) * e2(s))), MATCH.map(m => ({ p: -toDp(m.x) - sn, p0: -m.y, T, a: 0, b: BIG }))); return; }
  set(we, ow.cum, prof(Ln, iL, Lm), prof(Rn, iR, Rm), linesW);
  const on = orient(C[ne.i], ne.st); set(ne, on.cum, on.cum.map(() => -Rn), on.cum.map(() => -Ln), linesN);
}
// laczenie wkladow z obu koncow drogi (kazdy koniec moze miec zmiane liczby pasow): na srodku plynne mieszanie profili
function finalizeLanes(C, R) {
  const at = (cum, v, s) => { const n = cum.length; if (s <= cum[0]) return v[0]; if (s >= cum[n - 1]) return v[n - 1]; let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; } const t = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1); return v[lo] + (v[hi] - v[lo]) * t; };
  C.forEach((c, i) => { if (!c.contrib) return; const N = c.Q.length, Ln = c.cum[N - 1] || 1, W0 = rw(R[i]), D0 = c.d0 || 0, pA = c.contrib.A, pB = c.contrib.B;
    const d1 = c.d.slice(), w1 = c.w.slice(); c.d = []; c.w = []; for (let j = 0; j < N; j++) { const wB = sm((c.cum[j] / Ln - 0.35) / 0.3), wA = 1 - wB;
      const dfL = (d1[j] != null ? d1[j] : D0) - (w1[j] != null ? w1[j] : W0) / 2, dfR = (d1[j] != null ? d1[j] : D0) + (w1[j] != null ? w1[j] : W0) / 2; // brak wkladu z tego konca = dotychczasowy uklad drogi (np. offset z rozjazdu)
      const LA = pA ? at(pA.s, pA.lo, c.cum[j]) : dfL, RA = pA ? at(pA.s, pA.hi, c.cum[j]) : dfR, LB = pB ? -at(pB.s, pB.hi, Ln - c.cum[j]) : dfL, RB = pB ? -at(pB.s, pB.lo, Ln - c.cum[j]) : dfR;
      const L = wA * LA + wB * LB, Rr = wA * RA + wB * RB; c.d[j] = (L + Rr) / 2; c.w[j] = Rr - L; } });
}
function layout() {
  if (window.__nodeGeom) { /* wspolny wezel = jeden punkt: koncowki z tym samym kluczem, przesuniete wzgledem siebie (<3 m), sprowadz do punktu odniesienia (wierzcholek drogi przelotowej albo pierwszej drogi) */
    const ref = new Map(); S.doc.road.forEach(r => r.pts.forEach((q, j) => { const k = r.nk[j]; if (k && j > 0 && j < r.pts.length - 1 && !ref.has(k)) ref.set(k, q); })); S.doc.road.forEach(r => [0, r.pts.length - 1].forEach(j => { const k = r.nk[j]; if (k && !ref.has(k)) ref.set(k, r.pts[j]); }));
    S.doc.road.forEach(r => [0, r.pts.length - 1].forEach(j => { const k = r.nk[j]; if (!k) return; const q = ref.get(k); if (q && q !== r.pts[j]) { const d = dist(q, r.pts[j]); if (d > 0.02 && d < 3) { r.pts[j] = q.slice(); if (Array.isArray(r.rp) && r.rp.length === r.pts.length) r.rp[j] = q.slice(); } } }));
  }
  if (window.__nodeGeom) { /* droga przechodzaca przez wezel, w ktorym konczy sie droga niska (service itp.): tnij ja w tym wezle, zeby powstal wezel skrzyzowania */
    const LOW = /^(service|residential|living_street|unclassified|busway|road|construction|track)/, endLow = new Set();
    S.doc.road.forEach(r => { if (!LOW.test(r.hw || '')) return; [0, r.pts.length - 1].forEach(j => { if (r.nk[j]) endLow.add(r.nk[j]); }); });
    for (let i = 0; i < S.doc.road.length; i++) { const r = S.doc.road[i];
      for (let j = 1; j < r.pts.length - 1; j++) { const k = r.nk[j]; if (!k || !endLow.has(k) || r.nk.indexOf(k) !== j || r.nk.lastIndexOf(k) !== j) continue;
        const cp = x => Array.isArray(x) && x.length === r.pts.length ? x.slice(j) : x, r2 = Object.assign({}, r, { pts: r.pts.slice(j), nk: r.nk.slice(j) });
        if (Array.isArray(r.rp) && r.rp.length === r.pts.length) { r2.rp = r.rp.slice(j); r.rp = r.rp.slice(0, j + 1); }
        r.pts = r.pts.slice(0, j + 1); r.nk = r.nk.slice(0, j + 1); S.doc.road.push(r2); break; } }
  }
  const R = S.doc.road, ends = new Map(), nodeRoads = new Map();
  { /* koncowki dwoch drog w tym samym miejscu bez wspolnego wezla: polacz (tylko gdy koniec nie ma klucza) */
    const E = []; R.forEach((r, i) => [0, r.pts.length - 1].forEach(j => E.push({ r, j, p: r.pts[j] })));
    const _g = new Map(), _ck = (cx, cy) => cx + ',' + cy; E.forEach((e, i) => { e.i = i; const cx = Math.floor(e.p[0] / 0.5), cy = Math.floor(e.p[1] / 0.5), kk = _ck(cx, cy); (_g.get(kk) || _g.set(kk, []).get(kk)).push(i); e.cx = cx; e.cy = cy; }); /* siatka 0,5 m: porownujemy tylko sasiednie komorki (zamiast wszystkich par) */
    for (let x = 0; x < E.length; x++) { const cand = []; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const l = _g.get(_ck(E[x].cx + dx, E[x].cy + dy)); if (l) for (const y of l) if (y > x) cand.push(y); } cand.sort((a, b) => a - b); for (const y of cand) { const A = E[x], B = E[y]; if (A.r === B.r || dist(A.p, B.p) > 0.4 || (A.r.nk[A.j] && B.r.nk[B.j])) continue; const k = A.r.nk[A.j] || B.r.nk[B.j] || 'n' + Math.random().toString(36).slice(2, 9); A.r.nk[A.j] = k; B.r.nk[B.j] = k; } }
  }
  R.forEach((r, i) => { r.nk.forEach(k => { if (k) (nodeRoads.get(k) || nodeRoads.set(k, []).get(k)).push(i); }); [[0, true], [r.pts.length - 1, false]].forEach(([j, st]) => { const k = r.nk[j]; if (k) (ends.get(k) || ends.set(k, []).get(k)).push({ i, st }); }); });
  { // strona dodatkowego pasa nieparzystej jezdni jednokierunkowej: z turn:lanes (skrajny pas skreca w lewo/prawo), dalej wzdluz lancucha jezdni; domyslnie po prawej
    const sg0 = R.map(r => { if (!r.oneway || !r.tl || !((r.lanes | 0) >= 3 && (r.lanes | 0) % 2 === 1)) return 0; const t = r.tl.split('|').map(x => /left/.test(x) ? 'L' : /right/.test(x) ? 'R' : 'T'), n = t.length; if (n < 3) return 0; const restL = t.slice(1).every(x => x === t[1]), restR = t.slice(0, -1).every(x => x === t[0]); return n === 3 && t[0] === 'T' && t[1] === 'R' && t[2] === 'R' ? 1 : 0; /* tylko ta konfiguracja: prosto|w prawo|w prawo */ /* pojedynczy pas innego rodzaju na skraju (np. 1 prosto + 2 w prawo): os na granicy tego pasa i reszty */ });
    for (let it = 0; it < 60; it++) { let ch = false; for (const [, G] of ends) { if (G.length !== 2 || G[0].i === G[1].i) continue; const [a, b] = G; if (a.st === b.st) continue; const ra = R[a.i], rb = R[b.i]; if ((ra.lanes | 0) !== (rb.lanes | 0) || !ra.oneway || !rb.oneway) continue; if (sg0[a.i] && !sg0[b.i]) { sg0[b.i] = sg0[a.i]; ch = true; } else if (sg0[b.i] && !sg0[a.i]) { sg0[a.i] = sg0[b.i]; ch = true; } } if (!ch) break; }
    const edge0 = sg0.map((v, i) => v !== 0 || (R[i].off != null && R[i].off !== ''));
    R.forEach((r, i) => { Object.defineProperty(r, '_osg', { value: sg0[i] || (r.off != null && r.off !== '' ? (r.off < 0 ? -1 : 1) : (r.oneway && (r.lanes | 0) === 3 && r.tl && (tk => tk.length === 3 && tk[0] !== tk[1] && tk[1] === tk[2])(r.tl.split('|'))) ? -1 : 1), writable: true, configurable: true, enumerable: false }); Object.defineProperty(r, '_edge', { value: edge0[i], writable: true, configurable: true, enumerable: false }); });
  }
  window.__endTan = new Map(); { /* styk dwoch jezdni glownych (motorway/trunk) w jednym wezle: oba odcinki dostaja ten sam kierunek styczny (bez przegiecia na zlaczu) */
    const MAJ = r => /^(motorway|trunk|primary|secondary|tertiary)(?!_link)/.test(r.hw || ''), awayDir = (r, st) => { const P = gp(r), n = P.length, o = st ? P[0] : P[n - 1]; let acc = 0, q = o; for (let z = 1; z < n && acc < 8; z++) { q = st ? P[z] : P[n - 1 - z]; acc = dist(o, q); } if (acc < 1) return null; return [(q[0] - o[0]) / acc, (q[1] - o[1]) / acc]; };
    for (const [k, G] of ends) { if (G.length !== 2 || G[0].i === G[1].i || (nodeRoads.get(k) || []).length !== 2) continue; const [a, b] = G, ra = R[a.i], rb = R[b.i]; if (!MAJ(ra) || !MAJ(rb)) continue; const da = awayDir(ra, a.st), db = awayDir(rb, b.st); if (!da || !db) continue; const dd = [da[0] * db[0] + da[1] * db[1]]; if (dd[0] > -0.8) continue; /* ramiona prawie przeciwne = jezdnia biegnie dalej prosto (kat < ok. 37 st.) */
      const x = [da[0] - db[0], da[1] - db[1]], xl = Math.hypot(x[0], x[1]) || 1, A = [x[0] / xl, x[1] / xl], B = [-A[0], -A[1]]; for (const [e, D] of [[a, A], [b, B]]) { const r = R[e.i], m = window.__endTan.get(r) || {}; m[e.st ? 's' : 'e'] = D; window.__endTan.set(r, m); } } }
  const C0 = R.map(r => comp(r)), hints = {}, preAr = [];
  for (const [k, G] of ends) { // styczność ramp do jezdni głównej w węźle rozwidlenia/zlania
    if (!(G.length === 3 && nodeRoads.get(k).length === 3 && new Set(G.map(e => e.i)).size === 3)) continue;
    const U = G.map(e => unitFrom(C0[e.i], e.st)), ln = G.map(e => R[e.i].lanes), mx = Math.max(...ln); let xi = 0, best = 9;
    U.forEach((u, a) => { const o = [0, 1, 2].filter(b => b !== a), v = u[0] * (U[o[0]][0] + U[o[1]][0]) + u[1] * (U[o[0]][1] + U[o[1]][1]); if (v < best) { best = v; xi = a; } });
    if (ln.filter(v => v === mx).length === 1) xi = ln.indexOf(mx);
    if (best < -1.0 && ln[xi] === 2 && ln.filter((_, a) => a !== xi).every(v => v === 1)) G.forEach((e, a) => { const h = hints[e.i] || (hints[e.i] = {}); h.sm = true; if (a === xi || !HINTS) return; const t = [-U[xi][0], -U[xi][1]]; if (e.st) h.tin = t; else h.tout = [-t[0], -t[1]]; });
  }
  for (const [k, G] of ends) { /* gladkie polaczenie dwoch drog: wspolna styczna w wezle */
    if (!(G.length === 2 && nodeRoads.get(k).length === 2 && G[0].i !== G[1].i)) continue;
    const uA = unitFrom(C0[G[0].i], G[0].st), uB = unitFrom(C0[G[1].i], G[1].st), sx = uB[0] - uA[0], sy = uB[1] - uA[1], sl = Math.hypot(sx, sy); if (sl < 0.5 || uA[0] * uB[0] + uA[1] * uB[1] > 0.2) continue; /* 'prawie prosto': kat skretu < ~80 st. */
    const s = [sx / sl, sy / sl];
    [[G[0], [-s[0], -s[1]]], [G[1], s]].forEach(([e, u]) => { const h = hints[e.i] || (hints[e.i] = {}); h.sm = true; if (e.st) h.tin = u; else h.tout = [-u[0], -u[1]]; });
  }
  S.hints = hints; const C = R.map((r, i) => comp(r, hints[i])), handled = new Set(), forkDone = new Set(), gores = [], forkLinks = [], cutIn = [], forks = [], forks3 = [], forkX = new Map();
  for (const [k, G] of [...ends].sort((p, q) => p[1].length - q[1].length)) { // najpierw zwężenia 2-drożne, potem rozwidlenia
    if (G.length === 2 && nodeRoads.get(k).length === 2 && G[0].i !== G[1].i) { // połączenie dwóch dróg: zwężenie szerszej
      const ws = G.map(e => rw(R[e.i])); handled.add(k);
      if (TAPER2 && !window.__nodeGeom && R[G[0].i].lanes !== R[G[1].i].lanes) skelLanes(G, C, R, !!window.__smooth && !/^(motorway|trunk)/.test(R[G[0].i].hw || '') && !/^(motorway|trunk)/.test(R[G[1].i].hw || '')); /* gladkie rogi (nizsze klasy): szersza zostaje pelna do wezla, wezsza zwęza sie za nim */ // zmiana liczby pasow na szkielecie (jak w piaskownicy)
      continue;
    }
    if (G.length === 3 && nodeRoads.get(k).length === 3 && new Set(G.map(e => e.i)).size === 3) {
      const lw0 = e => /^(service|residential|living_street|unclassified|busway|road|construction|track)/.test(R[e.i].hw || ''), hi = G.filter(e => !lw0(e));
      if (hi.length === 2) { /* dwie drogi wyzszej klasy + dojazd niskiej klasy: zmiana liczby pasow tylko miedzy dwiema glownymi (zwezenie jak na zwyklym zlaczu), dojazd to zwykle T */
        if (TAPER2 && !window.__nodeGeom && R[hi[0].i].lanes !== R[hi[1].i].lanes) skelLanes(hi, C, R, !window.__noAfter); continue; } /* (bez handled: krawedzie dojazdu pod jezdnia glowna maja byc ukryte) */
      const U = G.map(e => unitFrom(C[e.i], e.st)); let xi = 0, best = 9;
      U.forEach((u, a) => { const o = [0, 1, 2].filter(b => b !== a), v = u[0] * (U[o[0]][0] + U[o[1]][0]) + u[1] * (U[o[0]][1] + U[o[1]][1]); if (v < best) { best = v; xi = a; } });
      const ln = G.map(e => R[e.i].lanes), mx = Math.max(...ln); if (ln.filter(v => v === mx).length === 1) xi = ln.indexOf(mx);
      const X = G[xi], Ys = G.filter((_, a) => a !== xi), wX = rw(R[X.i]), lowHw = e => /^(service|residential|living_street|unclassified|busway|road|construction|track)/.test(R[e.i].hw || ''), lowMix = G.some(lowHw) && !G.every(lowHw); /* dojazd/uliczka niskiej klasy do drogi wyzszej to skrzyzowanie T, nigdy rozjazd (lacznica) */
      if (!window.__forkNode && !lowMix && U[xi][0] * (U[(xi + 1) % 3][0] + U[(xi + 2) % 3][0]) + U[xi][1] * (U[(xi + 1) % 3][1] + U[(xi + 2) % 3][1]) < -1.0 && R[X.i].lanes >= Math.max(R[Ys[0].i].lanes, R[Ys[1].i].lanes)) {
        handled.add(k);
        const T = R[X.i].lanes === 1 && R[Ys[0].i].lanes === 1 && R[Ys[1].i].lanes === 1 && Ys.every(e => { const uu = unitFrom(C[e.i], e.st); return -(uu[0] * U[xi][0] + uu[1] * U[xi][1]) > 0.5; }) /* obie gałęzie < 60° od przedłużenia wjazdu; prostopadła łącznica to skrzyżowanie T, nie rozjazd */ ? 'rozjazd-1-1+1' : R[X.i].lanes === 2 && R[Ys[0].i].lanes === 1 && R[Ys[1].i].lanes === 1 ? 'rozjazd-2-1+1' : (R[X.i].lanes === 3 && R[Ys[0].i].lanes === 2 && R[Ys[1].i].lanes === 2 ? 'rozjazd-3-2+2' : R[X.i].lanes === 3 && Ys.map(e => R[e.i].lanes).sort().join() === '1,2' ? 'rozjazd-3-2+1' : (R[X.i].lanes >= 2 && R[X.i].lanes <= 6 && (R[X.i].lanes === R[Ys[0].i].lanes + R[Ys[1].i].lanes || (R[X.i].lanes + 1 === R[Ys[0].i].lanes + R[Ys[1].i].lanes && R[Ys[0].i].lanes !== R[X.i].lanes && R[Ys[1].i].lanes !== R[X.i].lanes)) ? 'rozjazd-n' : null));
        if (T) { const al = Ys.map(e => { const uu = unitFrom(C[e.i], e.st); return -(uu[0] * U[xi][0] + uu[1] * U[xi][1]); }), thr = al[0] >= al[1] ? 0 : 1, sidA = al[1 - thr]; if (sidA <= 0.5 && R[X.i].lanes === R[Ys[thr].i].lanes) continue; } /* prostopadla galaz (> 60 st. od przedluzenia) dochodzaca do jezdni o STALEJ liczbie pasow to skrzyzowanie T, nie rozjazd - bez wyginania; zmiana liczby pasow (np. 2+1 -> 3) to wlaczenie/zjazd i zostaje rozjazdem */
        if (!T || !FORK_TYPES[T].on || !G.some(e => FORK_TYPES[T].hw.test(R[e.i].hw || ''))) continue; // tylko typy z rejestru FORK_TYPES, tylko na wskazanych klasach drog
        (T === 'rozjazd-2-1+1' ? forks : forks3).push(orient(C[X.i], X.st).Q[0]); forkX.set(X.i, X.st);
        // krotki "kikut" osi przy wezle (pierwszy segment < 14 m, ktory ostro skreca wzgledem dalszego przebiegu) nie jest sladem pasa - pomijamy ten wierzcholek tylko w renderze
        for (const e of Ys) {
          const G0 = gp(R[e.i]); if (G0.length < 3) continue; const P0 = e.st ? G0 : G0.slice().reverse(), d1 = dist(P0[0], P0[1]);
          if (d1 < 15) { const u1 = [(P0[1][0] - P0[0][0]) / d1, (P0[1][1] - P0[0][1]) / d1], l2 = dist(P0[0], P0[2]) || 1, u2 = [(P0[2][0] - P0[0][0]) / l2, (P0[2][1] - P0[0][1]) / l2];
            if (Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]))) * 180 / Math.PI > 8) { const keepIdx = e.st ? [0].concat(G0.map((_, i) => i).slice(2)) : G0.map((_, i) => i).slice(0, G0.length - 2).concat([G0.length - 1]); C[e.i] = comp({ ...R[e.i], pts: keepIdx.map(i => G0[i]), rp: null }, hints[e.i]); }
          }
        }
        const mu = [U[0][0] + U[1][0] + U[2][0] - U[xi][0], U[0][1] + U[1][1] + U[2][1] - U[xi][1]], ml = Math.hypot(...mu) || 1, m = [mu[0] / ml, mu[1] / ml], nR = [-m[1], m[0]];
        const cr = Ys.map(e => { const u = unitFrom(C[e.i], e.st); return m[0] * u[1] - m[1] * u[0]; });
        const li = cr[0] < cr[1] ? 0 : 1, yl = Ys[li], yr = Ys[1 - li];
        forkDone.add(k); skelFork(X, yl, yr, C, R, gores); continue;
        continue;
      }
    }
  }
  // slip lane / boczna droga konczaca sie w srodku wiekszej drogi (wezel lezy wewnatrz jej przebiegu): jezdnia konczy sie na krawedzi glownej, asfalt ciagly, bez linii krawedzi wewnatrz
  const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]], nrm2 = a => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
  const slipEnd = (e, rA, cA, nd, nB, sd, ext, sinT, cosT, wA) => { // przytnij koniec bocznej drogi do krawedzi drogi glownej
    const sCut = Math.max(0, Math.min(40, (ext - (wA / 2) * cosT) / sinT - 0.8)), o = orient(cA, e.st), L = o.cum[o.cum.length - 1]; if (sCut < 0.5 || sCut > L - 2) return;
    const Qn = cA.Q, n = Qn.length, cum = cA.cum, idx = e.st ? cum.findIndex(v => v >= sCut) : (() => { let j = n - 1; while (j > 0 && L - cum[j] < sCut) j--; return j; })(); if (idx < 0) return;
    const pt = atS(o.Q, o.cum, sCut), keep = e.st ? [pt, ...Qn.slice(idx)] : [...Qn.slice(0, idx + 1), pt];
    const cut = arr => arr && arr.length === n ? (e.st ? [arr[idx], ...arr.slice(idx)] : [...arr.slice(0, idx + 1), arr[idx]]) : arr;
    (cA.slip = cA.slip || []).push({ nd, nB, sd, ext }); cA.Q = keep; cA.w = cut(cA.w); cA.d = cut(cA.d); cA.e = cut(cA.e); cA.cum = cumOf(keep); cA.trim = (cA.trim || 0) + sCut;
  };
  // koniec bocznej drogi w srodku wiekszej drogi (wezel wewnetrzny jej przebiegu)
  for (const [k, G] of ends) {
    if (G.length !== 1 || (nodeRoads.get(k) || []).length !== 2) continue; const e = G[0], bi = nodeRoads.get(k).find(i => i !== e.i); if (bi == null || !R[bi]) continue; const rA = R[e.i], rB = R[bi], iB = rB.nk.indexOf(k); if (iB <= 0 || iB >= rB.nk.length - 1) continue;
    if ((rB.lanes | 0) <= (rA.lanes | 0) || (RANK[(rB.hw || '').replace('_link', '')] || 1) < (RANK[(rA.hw || '').replace('_link', '')] || 1)) continue;
    const cA = C[e.i], cB = C[bi], nd = orient(cA, e.st).Q[0]; let bj = 0, bd = 1e9; cB.Q.forEach((q, j) => { const d = dist(q, nd); if (d < bd) { bd = d; bj = j; } }); if (bd > 3) continue;
    const tB = nrm2(sub2(cB.Q[Math.min(cB.Q.length - 1, bj + 1)], cB.Q[Math.max(0, bj - 1)])), U = unitFrom(cA, e.st), sinT = Math.abs(tB[0] * U[1] - tB[1] * U[0]), cosT = Math.abs(tB[0] * U[0] + tB[1] * U[1]); if (sinT < 0.3) continue;
    const nB = [-tB[1], tB[0]], sd = U[0] * nB[0] + U[1] * nB[1] > 0 ? 1 : -1, dB = (cB.d && cB.d[bj]) || 0, wB = (cB.w && cB.w[bj]) || rw(rB), ext = sd > 0 ? dB + wB / 2 : -(dB - wB / 2);
    slipEnd(e, rA, cA, nd, nB, sd, ext, sinT, cosT, rw(rA));
  }
  for (const [k, G] of ends) {
    if (G.some(g => forkX.has(g.i)) || G.length !== 3 || (nodeRoads.get(k) || []).length !== 3 || new Set(G.map(e => e.i)).size !== 3) continue; // wezel 3 drog: dwie przeciwlegle (droga glowna) + boczna (slip lane)
    const Us = G.map(e => unitFrom(C[e.i], e.st)); let pr = null, bestDot = 9; for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) { const dd = Us[a][0] * Us[b][0] + Us[a][1] * Us[b][1]; if (dd < bestDot) { bestDot = dd; pr = [a, b]; } }
    if (bestDot > -0.8) continue; const ti = [0, 1, 2].find(x => !pr.includes(x)), e = G[ti], rA = R[e.i], lb = pr.map(x => R[G[x].i].lanes | 0); if (/^(service|residential|living_street|unclassified|busway|road|construction|track)/.test(rA.hw || '')) continue; /* dojazd niskiej klasy do drogi wyzszej: zwykle T, bez wyspy slip lane */
    if (Math.min(...lb) <= (rA.lanes | 0) || pr.some(x => (RANK[(R[G[x].i].hw || '').replace('_link', '')] || 1) < (RANK[(rA.hw || '').replace('_link', '')] || 1))) continue;
    const cA = C[e.i], nd = orient(cA, e.st).Q[0], tB = nrm2(sub2(Us[pr[0]], Us[pr[1]])), U = Us[ti], sinT = Math.abs(tB[0] * U[1] - tB[1] * U[0]), cosT = Math.abs(tB[0] * U[0] + tB[1] * U[1]); if (sinT < 0.3) continue;
    const nB = [-tB[1], tB[0]], sd = U[0] * nB[0] + U[1] * nB[1] > 0 ? 1 : -1, wB = Math.max(...pr.map(x => rw(R[G[x].i]))), g0 = G[pr[0]], cB0 = C[g0.i], dB = (g0.st ? 1 : -1) * ((cB0.d && cB0.d[g0.st ? 0 : cB0.d.length - 1]) || 0), ext = sd > 0 ? dB + wB / 2 : -(dB - wB / 2), wA = rw(rA); /* krawedz drogi glownej po stronie slip lane (z offsetem d) */
    slipEnd(e, rA, cA, nd, nB, sd, ext, sinT, cosT, wA);
  }
  finalizeLanes(C, R);
  // zszycie polaczen dwoch drog (taka sama lub rozna liczba pasow): krawedzie obu jezdni na styku maja sie schodzic; roznica rozkladana plynnie wzdluz obu drog
  for (const [k, G] of ends) {
    if (!(G.length === 2 && nodeRoads.get(k).length === 2 && G[0].i !== G[1].i)) continue;
    const ed = G.map(e => { const c = C[e.i], n = c.Q.length, j = e.st ? 0 : n - 1, d = c.d[j], w = c.w[j]; if (!isFinite(d) || !isFinite(w)) return null; return e.st ? [d - w / 2, d + w / 2] : [-d - w / 2, -d + w / 2]; });
    if (!ed[0] || !ed[1]) continue;
    const A = ed[0], B = [-ed[1][1], -ed[1][0]], tg = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    if (Math.abs(A[0] - B[0]) > 6 || Math.abs(A[1] - B[1]) > 6 || (Math.abs(A[0] - B[0]) < 0.02 && Math.abs(A[1] - B[1]) < 0.02)) continue;
    const LfC = Math.max(2, Math.min(40, ...G.map(e => C[e.i].cum[C[e.i].Q.length - 1] / 2))), easeOut = t => { const b = 0.3, cc = 1 / (1 - b / 2), tt = Math.max(0, Math.min(1, t)); return tt <= 1 - b ? cc * tt : cc * (1 - b) + cc * (tt - (1 - b)) - cc * (tt - (1 - b)) * (tt - (1 - b)) / (2 * b); }; /* rampa prosta przy styku (obie polowki w jedna prosta), miekkie dojscie do krawedzi drogi; wspolna dlugosc strefy dla obu jezdni */
    G.forEach((e, a) => { const c = C[e.i], n = c.Q.length, Ln = c.cum[n - 1], Lf = LfC, cur = ed[a], want = a === 0 ? tg : [-tg[1], -tg[0]], dL = want[0] - cur[0], dR = want[1] - cur[1];
      for (let j = 0; j < n; j++) { const s = e.st ? c.cum[j] : Ln - c.cum[j], f = 1 - easeOut(s / Lf); if (f <= 0) continue; const dd = (dL + dR) / 2 * f, dw = (dR - dL) * f; c.d[j] += e.st ? dd : -dd; c.w[j] += dw; } });
  }
  // cięcia linii na skrzyżowaniach (węzły niezałatwione jako zlanie/zwężenie)
  { /* styk dwoch odcinkow tej samej jezdni (np. zwykla droga i most) z ta sama liczba pasow, ale inna szerokosc / przesunieciem osi: wyrownanie w okolicy styku (plynne przejscie krawedzi i linii pasow zamiast uskoku) */
    for (const [k, G] of ends) { if (G.length !== 2 || G[0].i === G[1].i || (nodeRoads.get(k) || []).length !== 2) continue; const [a, b] = G; if (a.st === b.st) continue; const ra = R[a.i], rb = R[b.i], ca = C[a.i], cb = C[b.i]; if (!ca || !cb || !ca.w || !cb.w || !ca.d || !cb.d || (ra.lanes | 0) !== (rb.lanes | 0) || !!ra.oneway !== !!rb.oneway || (ra.nf | 0) !== (rb.nf | 0) || ca.e && ca.e.some(v => v > 0) || cb.e && cb.e.some(v => v > 0)) continue;
      const ia = a.st ? 0 : ca.w.length - 1, ib = b.st ? 0 : cb.w.length - 1, wa = ca.w[ia], wb = cb.w[ib], da = ca.d[ia], db = cb.d[ib]; if (Math.abs(wa - wb) < 0.02 && Math.abs(da - db) < 0.02) continue; if (Math.abs(wa - wb) > 0.5 * Math.max(wa, wb)) continue;
      const wt = (wa + wb) / 2, dt2 = (da + db) / 2;
      for (const [c, i0, w0, d0, st] of [[ca, ia, wa, da, a.st], [cb, ib, wb, db, b.st]]) { const cm = cumOf(c.Q), Lq = cm[cm.length - 1], Lb = Math.min(25, 0.45 * Lq); if (Lb < 3) continue; for (let j = 0; j < c.w.length; j++) { const sv = st ? cm[j] : Lq - cm[j]; if (sv >= Lb) continue; const f = 1 - sm5(sv / Lb); c.w[j] += (wt - w0) * f; c.d[j] += (dt2 - d0) * f; } } } }
  const polys = [], lines = [], arrows = preAr.slice();
  const _lm = new Map(), lineIdx = l => { let j = _lm.get(l); if (j === undefined || lines[j] !== l) { _lm.clear(); for (let i = 0; i < lines.length; i++) if (!_lm.has(lines[i])) _lm.set(lines[i], i); j = _lm.get(l); } return j === undefined ? -1 : j; }; /* indeks linii z pamiecia (zamiast indexOf w petlach - O(n^2)) */
  forkLinks.forEach(l => lines.push(l));
  // obrysy jezdni (do ukrywania linii krawedzi wewnatrz asfaltu sasiednich drog - zamiast kolowego wycinania wokol wezlow)
  const PO = C.map(c => { const ex = c.e.some(v => v > 0), eL = j => ex && c.side < 0 ? c.e[j] : 0, eR = j => ex && c.side > 0 ? c.e[j] : 0; const Lf = offsetPts(c.Q, c.d.map((v, j) => v - c.w[j] / 2 - eL(j))), Rt = offsetPts(c.Q, c.d.map((v, j) => v + c.w[j] / 2 + eR(j))); return Lf.concat(Rt.slice().reverse()); });
  const inPoly = (pt, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const connNb = R.map((r, i) => { const set = new Set(); r.nk.forEach(k => { if (!k || handled.has(k)) return; for (const j of nodeRoads.get(k) || []) { if (j === i) continue; const G = ends.get(k) || [], gi = G.find(e => e.i === i), gj = G.find(e => e.i === j); if (gi && gj) { const a = unitFrom(C[i], gi.st), b = unitFrom(C[j], gj.st); if (a[0] * b[0] + a[1] * b[1] < -0.8 && rw(R[j]) <= rw(R[i]) + 0.5) continue; /* prosta kontynuacja: pomijamy, chyba ze sasiad jest wyraznie szerszy (jego asfalt zakrywa krawedzie wezszej galezi) */ } set.add(j); } }); return [...set]; });
  const rng = [];
  const edgeOf = [];
  R.forEach((r, i) => {
    rng[i] = [lines.length, arrows.length, polys.length];
    const c = C[i], Q = c.Q, n = Q.length, cuts = [];
    r.nk.forEach((k, j) => { if (!k || handled.has(k)) return; const ids = nodeRoads.get(k); if (!ids || ids.length < 2) return; let rad = 0; for (const o of ids) if (o !== i) rad = Math.max(rad, rw(R[o]) / 2); cuts.push({ p: gp(r)[j], rad: rad + 1.5 }); });
    const inB = p => c.slip && c.slip.some(sl => ((p[0] - sl.nd[0]) * sl.nB[0] + (p[1] - sl.nd[1]) * sl.nB[1]) * sl.sd < sl.ext - 0.05); /* punkt wewnatrz asfaltu drogi glownej (slip lane) */
    const keep = Q.map(q => !cuts.some(ct => dist(q, ct.p) < ct.rad) && !inB(q)), keepE = Q.map(q => !inB(q));
    const addLine = (P, st, kp) => { kp = kp || keep; let run = []; for (let j = 0; j < n; j++) { if (kp[j]) run.push(P[j]); else { if (run.length > 1) lines.push({ P: run, st }); run = []; } } if (run.length > 1) lines.push({ P: run, st }); };
    const ex = c.e.some(v => v > 0), eL = j => ex && c.side < 0 ? c.e[j] : 0, eR = j => ex && c.side > 0 ? c.e[j] : 0;
    const Lf = offsetPts(Q, c.d.map((v, j) => v - c.w[j] / 2 - eL(j))), Rt = offsetPts(Q, c.d.map((v, j) => v + c.w[j] / 2 + eR(j)));
    polys.push({ P: Lf.concat(Rt.slice().reverse()), L: Lf, R: Rt, kerb: r.kerb, ed: !!(r.edge || /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|busway|road|construction)/.test(r.hw || '')) }); edgeOf[i] = { Lf, Rt };
    const nl = ex ? Math.max(1, Math.round(c.w[0] / r.lw)) : Math.max(1, r.lanes | 0);
    if (ex) { let run = []; const es = c.side, EP = offsetPts(Q, c.d.map((v, jj) => v + es * c.w[jj] / 2)); for (let j = 0; j <= n; j++) { if (j < n && keep[j] && c.e[j] > 0.12) run.push(EP[j]); else { if (run.length > 1) lines.push({ P: run, st: 'p1' }); run = []; } } }
    if (c.lat && r.marked) { const lo = c.d.map((v, j) => v - c.w[j] / 2), hi = c.d.map((v, j) => v + c.w[j] / 2); const lwr = r.lw || 3.75, mm = c.w.map(v => v / lwr), full = mm.map(m => Math.abs(m - Math.round(m)) < 0.04), mx = Math.round(Math.max(...mm));
      for (let k = 1; k < mx; k++) addLine(offsetPts(Q, c.d.map((v, j) => v - c.w[j] / 2 + k * lwr)), 'p1', keep.map((kk, j) => kk && full[j] && k < Math.round(mm[j]))); // pelne pasy: dzielniki ida za osia i szerokoscia drogi (plynny offset)
      const clen = c.cum[n - 1]; for (const l of c.lat.lines) { const c0 = l.st ? l.a : clen - l.b, c1 = l.st ? l.b : clen - l.a; const pj = Q.map((_, j) => l.p0 == null ? l.p : l.p + (l.p0 - l.p) * (1 - sm5(Math.max(0, Math.min(1, (l.st ? c.cum[j] : clen - c.cum[j]) / l.T))))); addLine(offsetPts(Q, pj), 'p1', keep.map((kk, j) => kk && !full[j] && c.cum[j] >= c0 - 1e-6 && c.cum[j] <= c1 + 1e-6 && pj[j] > lo[j] + 0.05 && pj[j] < hi[j] - 0.05)); } }
    if (!c.lat && r.marked && nl > 1) for (let k = 1; k < nl; k++) {
      const centre = !r.oneway && k * 2 === nl; if (centre && r.centre === 'brak') continue;
      const DL = offsetPts(Q, c.d.map((v, j) => v - c.w[j] / 2 + k * c.w[j] / nl)), dst = centre ? (r.centre === 'auto' ? (nl >= 4 ? 'p4' : 'p1') : r.centre) : 'p1';
      addLine(DL, dst); // linia pasow przed rozjazdem tez przerywana, jak reszta drogi
    }
    if (r.edge || /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|busway|road|construction)/.test(r.hw || '')) {
      const len = c.cum[n - 1], kpe = sg => keep.map((kk, j) => kk && !(c.skipIn && c.skipIn.sg === sg && c.skipIn.m[j]) && !cutIn.some(ci => ci.i === i && ci.ss === sg && (ci.st ? c.cum[j] : len - c.cum[j]) < ci.s));
      const PLe = offsetPts(Q, c.d.map((v, j) => v - c.w[j] / 2 - eL(j))), PRe = offsetPts(Q, c.d.map((v, j) => v + c.w[j] / 2 + eR(j)));
      const hideN = p => connNb[i].some(j => inPoly(p, PO[j]) && !nearEdge(p, PO[j])), nearEdge = (p, poly) => { for (let q = 0; q < poly.length; q++) if (segDist(p, poly[q], poly[(q + 1) % poly.length]) < 0.3) return true; return false; } /* punkt tuz przy krawedzi sasiedniego asfaltu nie jest ukrywany (linia biegnaca wzdluz granicy nie moze miec dziury) */, baseE = sg => keepE.map((v, j) => v && !(c.skipIn && c.skipIn.sg === sg && c.skipIn.m[j]) && !cutIn.some(ci => ci.i === i && ci.ss === sg && (ci.st ? c.cum[j] : len - c.cum[j]) < ci.s)), mkE = (P, sg) => baseE(sg).map((v, j) => v && !inB(P[j]) && !hideN(P[j]));
      const plen = P => { let t = 0; for (let j = 1; j < P.length; j++) t += dist(P[j - 1], P[j]); return t; }, slipIn = c.slip && c.slip.length && /_link/.test(r.hw || '') ? (plen(PLe) > plen(PRe) ? -1 : 1) : 0; /* slip lane: strona od wyspy (wewnetrzna) bez bialej linii - tam jest krawieznik */
      const edgeLine = (P, sg) => { const mk = mkE(P, sg);
        if (n < 2) { addLine(P, 'p2', mk); return; }
        /* krotka droga (laczy dwa wezly, np. przejazd przez pas rozdzielajacy): krawedz dzielona co ok. 0,3 m, zeby ukrycie pod sasiednia jezdnia konczylo sie dokladnie na jej krawedzi, a nie na najblizszym wierzcholku co 2 m */
        const bs = baseE(sg), Pd = [], md = []; for (let j = 0; j < n - 1; j++) { const a = P[j], b = P[j + 1], m = (len <= 40 || c.cum[j] < 8 || c.cum[j + 1] > len - 8) ? Math.max(1, Math.ceil(dist(a, b) / 0.3)) : 1; /* gestszy podzial tylko przy koncach drogi (krotkie drogi w calosci) */ for (let q = 0; q < m; q++) { const t = q / m, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], jn = t < 0.5 ? j : j + 1; Pd.push(p); md.push(bs[jn] && !inB(p) && !hideN(p)); } }
        Pd.push(P[n - 1]); md.push(mk[n - 1]);
        let run = []; for (let j = 0; j < Pd.length; j++) { if (md[j]) run.push(Pd[j]); else { if (run.length > 1) lines.push({ P: run, st: 'p2' }); run = []; } } if (run.length > 1) lines.push({ P: run, st: 'p2' }); };
      if (slipIn !== -1) edgeLine(PLe, -1); if (slipIn !== 1) edgeLine(PRe, 1);
    }
    if (r.tl) { // strzałki P-8 z turn:lanes
      const parts = r.tl.split('|'), len = c.cum[n - 1]; const NL = Math.max(1, r.lanes | 0), nb = NL - (r.oneway ? NL : r.nf);
      if (parts.length === (r.oneway ? NL : r.nf) && len > 14) { /* krotkie odcinki: jedna strzalka w srodku */
        for (let sa = len > 25 ? 9 : len / 2, cnt = 0; sa < len - Math.min(8, len / 4) && cnt < 60; sa += (c.skipIn ? 38 : 21), cnt++) { // strzałki co ok. 21 m na calym odcinku z pelna liczba pasow, liczac od konca drogi
          const s = len - sa, p = atS(Q, c.cum, s), p2 = atS(Q, c.cum, s + 1), dx = p2[0] - p[0], dy = p2[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;
          let jn = 0, bd = 1e9; for (let j = 0; j < n; j++) { const dd = Math.abs(c.cum[j] - s); if (dd < bd) { bd = dd; jn = j; } }
          const exj = c.e[jn] > 0, eLj = exj && c.side < 0 ? c.e[jn] : 0, leftLat = c.d[jn] - c.w[jn] / 2 - eLj; // krawędź lewa wg faktycznej geometrii (offset, poszerzenie)
          if (Math.abs(c.w[jn] / (r.lw || 3.75) - NL) > (len > 25 ? 0.1 : 0.4)) continue; // tylko tam, gdzie sa juz pelne pasy (nie w zwezeniu)
          parts.forEach((v, k) => {
            const set = new Set(v.split(';').map(x => x.replace('slight_', '').replace('sharp_', ''))); let key = ['through', 'left', 'right', 'reverse'].filter(x => set.has(x)).join('-'); if (set.has('merge_to_left')) key = 'p9a'; else if (set.has('merge_to_right')) key = 'p9b'; /* strzalki zbiegu pasow */
            if (key === 'through-left-right' || ARR.has(key)) { const lat = leftLat + (nb + k + 0.5) * r.lw; arrows.push({ x: p[0] + nx * lat, y: p[1] + ny * lat, rot: ang, type: key, lw: r.lw }); }
          });
        }
      }
    }
    if (r.tlb && !r.oneway) { // strzałki turn:lanes:backward: pasy przeciwnego kierunku, malowane przy początku drogi i obrócone o 180°
      const parts = r.tlb.split('|'), len = c.cum[n - 1], NL = Math.max(1, r.lanes | 0), nbk = NL - (r.nf || 1);
      if (nbk > 0 && parts.length === nbk && len > 25) for (let sa = 9, cnt = 0; sa < len - 8 && cnt < 60; sa += 21, cnt++) {
        const p = atS(Q, c.cum, sa), p2 = atS(Q, c.cum, sa + 1), dx = p2[0] - p[0], dy = p2[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, ang = Math.atan2(dy, dx) * 180 / Math.PI + 90 + 180;
        let jn = 0, bd = 1e9; for (let j = 0; j < n; j++) { const dd = Math.abs(c.cum[j] - sa); if (dd < bd) { bd = dd; jn = j; } }
        const exj = c.e[jn] > 0, eLj = exj && c.side < 0 ? c.e[jn] : 0, leftLat = c.d[jn] - c.w[jn] / 2 - eLj;
        if (Math.abs(c.w[jn] / (r.lw || 3.75) - NL) > 0.1) continue;
        parts.forEach((v, k) => {
          const set = new Set(v.split(';').map(x => x.replace('slight_', '').replace('sharp_', ''))); let key = ['through', 'left', 'right', 'reverse'].filter(x => set.has(x)).join('-'); if (set.has('merge_to_left')) key = 'p9a'; else if (set.has('merge_to_right')) key = 'p9b'; /* strzalki zbiegu pasow */
          if (key === 'through-left-right' || ARR.has(key)) { const lat = leftLat + (nbk - 1 - k + 0.5) * r.lw; arrows.push({ x: p[0] + nx * lat, y: p[1] + ny * lat, rot: ang, type: key, lw: r.lw }); }
        });
      }
    }
  });
  R.forEach((r, i) => { const ly = r.ly | 0, nx = rng[i + 1] || [lines.length, arrows.length, polys.length], b = rng[i]; if (!b) return; for (let j = b[0]; j < nx[0]; j++) lines[j].ly = ly; for (let j = b[1]; j < nx[1]; j++) arrows[j].ly = ly; for (let j = b[2]; j < nx[2]; j++) { polys[j].ly = ly; polys[j].br = !!r.br; } });
  for (const [k, G] of ends) { /* zaslepka szczeliny na zlaczu dwoch drog: czworokat miedzy koncami krawedzi */
    if (!(G.length === 2 && nodeRoads.get(k).length === 2 && G[0].i !== G[1].i && edgeOf[G[0].i] && edgeOf[G[1].i])) continue;
    const ep = e => { const E = edgeOf[e.i], j = e.st ? 0 : E.Lf.length - 1; return [E.Lf[j], E.Rt[j]]; }, [a1, a2] = ep(G[0]), [b1, b2] = ep(G[1]);
    if (!a1 || !a2 || !b1 || !b2) continue;
    const P = dist(a1, b1) + dist(a2, b2) <= dist(a1, b2) + dist(a2, b1) ? [a1, a2, b2, b1] : [a1, a2, b1, b2];
    const [qa, qb] = P === undefined ? [[], []] : (dist(a1, b1) + dist(a2, b2) <= dist(a1, b2) + dist(a2, b1) ? [[a1, b1], [a2, b2]] : [[a1, b2], [a2, b1]]);
    polys.push({ P, L: qa, R: qb, kerb: true, ly: Math.max(R[G[0].i].ly | 0, R[G[1].i].ly | 0), br: false });
  }
  { // skrzyzowanie T: droga boczna dojezdza do przelotowej pod dowolnym katem - luki (fillety) krawedzi na zlaczu
    const FR = 3.5; /* promien luku [m] */
    for (const [k, G] of ends) {
      if (window.__noFil || window.__nodeGeom || (S.nodeR && S.nodeR[k] != null && G.length >= 3) || forkDone.has(k) || G.length !== 3 || nodeRoads.get(k).length !== 3 || new Set(G.map(e => e.i)).size !== 3) continue;
      const U = G.map(e => unitFrom(C[e.i], e.st)); let a = 0, b = 1, best = 9;
      for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) { const d = U[p][0] * U[q][0] + U[p][1] * U[q][1]; if (d < best) { best = d; a = p; b = q; } }
      if (best > -0.7) continue; /* przelotowa musi byc prawie prosta */
      const ci = 3 - a - b, eC = G[ci], eA = G[a], eB = G[b], o = orient(C[eC.i], eC.st).Q[0];
      const uC = U[ci], t0 = [U[a][0] - U[b][0], U[a][1] - U[b][1]], tl = Math.hypot(t0[0], t0[1]) || 1, t = [t0[0] / tl, t0[1] / tl], nt = [-t[1], t[0]];
      const hC = rw(R[eC.i]) / 2, hT = Math.max(rw(R[eA.i]), rw(R[eB.i])) / 2, nC = [-uC[1], uC[0]], dn = uC[0] * nt[0] + uC[1] * nt[1];
      if (Math.abs(dn) < 0.5) continue;
      const cCum = C[eC.i].cum, pts0 = R[eC.i].pts, nk0 = R[eC.i].nk, dir0 = eC.st ? 1 : -1; let lenC = cCum[cCum.length - 1], farJ = (nodeRoads.get(nk0[eC.st ? nk0.length - 1 : 0]) || []).length >= 3;
      { let acc = 0; for (let ix = eC.st ? 0 : pts0.length - 1; ix + dir0 >= 0 && ix + dir0 < pts0.length;) { acc += dist(pts0[ix], pts0[ix + dir0]); ix += dir0; const kk = nk0[ix]; if (kk && (nodeRoads.get(kk) || []).length >= 2 && !(nodeRoads.get(kk) || []).every(q => q === eC.i)) { if (acc < lenC) { lenC = acc; farJ = true; } break; } } } /* dojazd przechodzacy przez jezdnie (wezel posredni na jej wierzcholku) tez ogranicza dlugosc luku */
      const sg = dn > 0 ? 1 : -1, ly = Math.max(R[eA.i].ly | 0, R[eB.i].ly | 0), fil = [];
      for (const s of [-1, 1]) {
        const sdX = (nC[0] * s * t[0] + nC[1] * s * t[1]) >= 0 ? 1 : -1, eX = sdX > 0 ? eA : eB, oX = orient(C[eX.i], eX.st), uX = unitFrom(C[eX.i], eX.st), nX = [-uX[1], uX[0]], dnX = uC[0] * nX[0] + uC[1] * nX[1];
        let ed = oX.d[0] + (oX.w[0] / 2) * (dnX >= 0 ? 1 : -1); /* krawedz drogi przelotowej po tej stronie wg jej rzeczywistej szerokosci i offsetu (a nie wspolna dla obu ramion) */
        const Pe = [oX.Q[0][0] + nX[0] * ed, oX.Q[0][1] + nX[1] * ed], lam = Math.abs(dnX) > 0.3 ? ((Pe[0] - o[0] - nC[0] * s * hC) * nX[0] + (Pe[1] - o[1] - nC[1] * s * hC) * nX[1]) / dnX : (sg * hT - s * hC * (nC[0] * nt[0] + nC[1] * nt[1])) / dn, I = [o[0] + nC[0] * s * hC + uC[0] * lam, o[1] + nC[1] * s * hC + uC[1] * lam];
        if (lam < -hT * 4 || lam > 40) continue;
        const u1 = uC, sd = (nC[0] * s * t[0] + nC[1] * s * t[1]) >= 0 ? 1 : -1, u2 = [t[0] * sd, t[1] * sd], cs = u1[0] * u2[0] + u1[1] * u2[1], phi = Math.acos(Math.max(-1, Math.min(1, cs)));
        if (phi < 0.9 || phi > 2.9) continue; /* ostry dojazd (< ok. 50 st.): bez luku, czubek klina zaokragla pozniej wygladzenie wierzcholkow */
        const FRn = S.nodeR && S.nodeR[k] != null ? S.nodeR[k] : FR; if (FRn <= 0.05) continue; /* promien wezla ustawiony recznie (suwak „Promien rogow”), 0 = brak luku */
        let r = FRn, L = r / Math.tan(phi / 2), Lm = 9; if (farJ) Lm = Math.min(Lm, (lenC - 2 * Math.abs(lam)) / 2); if (Lm < 1.5) continue; /* za malo miejsca na wyspie - bez luku (naroznik prosty) */ /* krotka droga laczaca dwa wezly (przerwa w pasie rozdzielajacym): luki obu koncow nie moga na siebie nachodzic */ if (L > Lm) { r *= Lm / L; L = Lm; }
        const T1 = [I[0] + u1[0] * L, I[1] + u1[1] * L], T2 = [I[0] + u2[0] * L, I[1] + u2[1] * L], bs = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(bs[0], bs[1]) || 1, cc = [I[0] + bs[0] / bl * r / Math.sin(phi / 2), I[1] + bs[1] / bl * r / Math.sin(phi / 2)];
        let a1 = Math.atan2(T1[1] - cc[1], T1[0] - cc[0]), a2 = Math.atan2(T2[1] - cc[1], T2[0] - cc[0]), da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const arc = []; for (let q = 0; q <= 14; q++) arc.push([cc[0] + r * Math.cos(a1 + da * q / 14), cc[1] + r * Math.sin(a1 + da * q / 14)]);
        fil.push({ I, L, T1, T2, arc });
      }
      if (!fil.length) continue;
      for (const f of fil) { /* wyciecie prostych krawedzi w obrebie luku i zastapienie lukiem */
        const snap = lines.map(l => l.P); let E1 = null, E2 = null, d1 = 1.2, d2 = 1.2; const pieces = []; /* koniec luku szukany tylko tuz przy stycznych */
        const Lc = f.L - 0.02, nearRay = p => segDist(p, [2 * f.I[0] - f.T1[0], 2 * f.I[1] - f.T1[1]], f.T1) < 1.0 || segDist(p, [2 * f.I[0] - f.T2[0], 2 * f.I[1] - f.T2[1]], f.T2) < 1.0, inCut = p => dist(p, f.I) < Lc && nearRay(p); /* tnij tylko krawedzie lezace na prostych (wlot i jezdnia glowna) zastepowanych lukiem, nie sasiednie krawedzie waskiej rampy */
        for (const l of lines) { if (l.st !== 'p2' || l.arc) continue; let run = []; const out = []; /* luki wczesniej zrobionych fillet nie sa ciete (przy waskiej rampie luk jednej strony wchodzil w zasieg drugiej i znikal) */
          const PP = []; for (let q = 0; q < l.P.length; q++) { const a = l.P[q]; if (q > 0) { const b = l.P[q - 1], da = dist(a, f.I) - Lc, db = dist(b, f.I) - Lc; if (da * db < 0 && nearRay([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) ) { let lo = 0, hi = 1; for (let it = 0; it < 24; it++) { const m = (lo + hi) / 2, pm = [b[0] + (a[0] - b[0]) * m, b[1] + (a[1] - b[1]) * m]; if ((dist(pm, f.I) - Lc) * db > 0) lo = m; else hi = m; } const mm = (lo + hi) / 2; PP.push([b[0] + (a[0] - b[0]) * mm, b[1] + (a[1] - b[1]) * mm]); } } PP.push(a); } /* dokladne punkty na okregu ciecia: krawedz konczy sie dokladnie tam, gdzie zaczyna sie luk (bez szczeliny) */
          for (const p of PP) { if (inCut(p)) { if (run.length) out.push(run); run = []; } else run.push(p); }
          if (run.length) out.push(run); if (out.length === 1 && out[0].length === PP.length) continue;
          for (const R2 of out) for (const p of [R2[0], R2[R2.length - 1]]) { const q1 = dist(p, f.T1), q2 = dist(p, f.T2); if (q1 < d1) { d1 = q1; E1 = p; } if (q2 < d2) { d2 = q2; E2 = p; } }
          l.P = out[0] || []; for (let q = 1; q < out.length; q++) pieces.push({ P: out[q], st: 'p2', ly: l.ly });
        }
        if (!E1 || !E2) { lines.forEach((l, q) => { if (snap[q]) l.P = snap[q]; }); continue; } /* krawedzie nie dochodza do stycznych luku: nie ciac (luk bylby oderwany od linii) */
        lines.push(...pieces); for (let q = lines.length - 1; q >= 0; q--) if (lines[q].P.length < 2) lines.splice(q, 1);
        lines.push({ P: [E1 || f.T1, ...f.arc, E2 || f.T2], st: 'p2', ly, arc: true }); /* brak krawedzi do ucięcia przy stycznej: luk zaczyna sie w punkcie stycznym */
        polys.push({ P: [f.I, f.T1, ...f.arc, f.T2], L: f.arc, R: f.arc, kerb: false, ly, br: false, ed: true }); /* krawezniki luku rysowane pozniej wzdluz wygladzonej linii */
      }
    }
  }
  const _rol1 = new Map(); /* pamiec: droga danej linii (liczona raz) */
  for (const [k, G] of ends) { /* zlacze dwoch drog: krawedziowe linie ciagle laczymy odcinkami (bez luk i uskokow na zakretach) */
    if (!(G.length === 2 && nodeRoads.get(k).length === 2 && G[0].i !== G[1].i)) continue;
    const nd = orient(C[G[0].i], G[0].st).Q[0], E = [];
    const roadOfLine = l => { let v = _rol1.get(l); if (v !== undefined) return v; const j = lineIdx(l); v = -1; for (let i = R.length - 1; i >= 0; i--) if (rng[i] && j >= rng[i][0]) { v = i; break; } _rol1.set(l, v); return v; };
    lines.forEach(l => { if (l.st !== 'p2' || l.arc || l.P.length < 2) return; const eg = G.find(g => g.i === roadOfLine(l)); if (!eg) return; const j = eg.st ? 0 : l.P.length - 1; if (dist(l.P[j], nd) < 5) E.push({ l, j, p: l.P[j] }); }); /* tylko koniec krawedzi lezacy przy TYM wezle */ /* nie lacz dwoch krawedzi tej samej drogi (waski most: krawedzie leza blizej niz 4,5 m) */
    const pairs = []; for (let x = 0; x < E.length; x++) for (let y = x + 1; y < E.length; y++) if (E[x].l !== E[y].l && (E[x].l.ly | 0) === (E[y].l.ly | 0) && roadOfLine(E[x].l) !== roadOfLine(E[y].l)) { const d = dist(E[x].p, E[y].p); if (d > 0.02 && d < 4.5) pairs.push([d, x, y]); } /* mosty/wiadukty (inna warstwa) nie lacza sie krawedziami ze zwykla droga: tam sa barierki */
    pairs.sort((u, v) => u[0] - v[0]); const used = new Set();
    const isect = (A, B, C2, D2) => { const r = [B[0] - A[0], B[1] - A[1]], q = [D2[0] - C2[0], D2[1] - C2[1]], den = r[0] * q[1] - r[1] * q[0]; if (Math.abs(den) < 1e-9) return null; const t = ((C2[0] - A[0]) * q[1] - (C2[1] - A[1]) * q[0]) / den; return [A[0] + r[0] * t, A[1] + r[1] * t]; };
    for (const [, x, y] of pairs) { if (used.has(x) || used.has(y)) continue; used.add(x); used.add(y);
      const ex = E[x], ey = E[y], px = ex.l.P, py = ey.l.P, ax = ex.j === 0 ? px[1] : px[px.length - 2], ay = ey.j === 0 ? py[1] : py[py.length - 2], X = isect(ax, ex.p, ay, ey.p);
      if (X && dist(X, ex.p) < 4.5 && dist(X, ey.p) < 4.5) { px[ex.j] = X; py[ey.j] = X; } /* zakret: przeciecie krawedzi (wew. zakret obcina nachodzace konce, zew. przedluza) */
      else lines.push({ P: [ex.p, ey.p], st: 'p2', ly: ex.l.ly }); }
  }
  { /* wezly 3+ drog (rozgalezienia, zmiany szerokosci): wolne konce bialych krawedzi sasiednich drog lacze sie plynna krzywa (Bezier styczny do obu krawedzi) zamiast uskoku */
    const sb_ = (p, q) => [p[0] - q[0], p[1] - q[1]], uu_ = v => { const l = Math.hypot(v[0], v[1]); return l > 1e-9 ? [v[0] / l, v[1] / l] : null; }; const ends2 = []; for (const l of lines) if (l.st === 'p2' && l.P.length >= 2) { ends2.push({ l, j: 0 }); ends2.push({ l, j: l.P.length - 1 }); }
    const gridE = new Map(); ends2.forEach(e => { const p = e.l.P[e.j], k = Math.floor(p[0] / 0.25) + ',' + Math.floor(p[1] / 0.25); (gridE.get(k) || gridE.set(k, []).get(k)).push(e); }); /* siatka zamiast wszystkich par */
    const free = ends2.filter(e => { const p = e.l.P[e.j], cx = Math.floor(p[0] / 0.25), cy = Math.floor(p[1] / 0.25); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const l = gridE.get((cx + dx) + ',' + (cy + dy)); if (l) for (const o of l) if (o !== e && dist(o.l.P[o.j], p) < 0.12) return false; } return true; });
    const _rol2 = new Map(), roadOf = l => { let v = _rol2.get(l); if (v !== undefined) return v; const j = lineIdx(l); v = -1; for (let i = R.length - 1; i >= 0; i--) if (rng[i] && j >= rng[i][0]) { v = i; break; } _rol2.set(l, v); return v; };
    for (const [k, G] of ends) {
      if (forkDone.has(k) || (nodeRoads.get(k) || []).length < 3 || new Set(G.map(e => e.i)).size < 3) continue;
      const nd = orient(C[G[0].i], G[0].st).Q[0], F = [];
      for (const e of free) { if (e.used || e.l.arc) continue; const ri = roadOf(e.l), eg = G.find(g => g.i === ri); if (!eg) continue; if ((eg.st ? 0 : e.l.P.length - 1) !== e.j) continue; if (dist(e.l.P[e.j], nd) > 7) continue; F.push(e); }
      const pr = []; for (let x = 0; x < F.length; x++) for (let y = x + 1; y < F.length; y++) { if (roadOf(F[x].l) === roadOf(F[y].l) || (F[x].l.ly | 0) !== (F[y].l.ly | 0)) continue; const d = dist(F[x].l.P[F[x].j], F[y].l.P[F[y].j]); if (d > 0.04 && d < 2.6) pr.push([d, x, y]); }
      pr.sort((a, b) => a[0] - b[0]); const used = new Set();
      for (const [d, x, y] of pr) { if (used.has(x) || used.has(y)) continue;
        let best = null;
        for (const [iA, iB] of [[x, y], [y, x]]) { const A = F[iA], B = F[iB], pA = A.l.P[A.j], PB = B.l.P, jb = B.j, nA = A.l.P[A.j === 0 ? 1 : A.l.P.length - 2], tA = uu_(sb_(pA, nA)); if (!tA) continue;
          /* C = punkt na krawedzi B w odleglosci s od jej konca */ const s0 = Math.min(3.5, Math.max(1.2, d * 2.5)); let acc = 0, ci = jb, C = null, prev = PB[jb];
          for (let q = jb === 0 ? 1 : PB.length - 2; q >= 0 && q < PB.length; q += jb === 0 ? 1 : -1) { const seg = dist(prev, PB[q]); if (acc + seg >= s0) { const u = (s0 - acc) / (seg || 1); C = [prev[0] + (PB[q][0] - prev[0]) * u, prev[1] + (PB[q][1] - prev[1]) * u]; ci = q; break; } acc += seg; prev = PB[q]; }
          if (!C) continue; const tC = uu_(sb_(C, prev)); if (!tC) continue; const turn = tA[0] * tC[0] + tA[1] * tC[1]; if (turn < 0.34) continue; /* skret < ok. 70 st. (ostrzejsze naroza to luki fillet) */
          { const dAC0 = dist(pA, C), h0 = dAC0 * 0.4, c10 = [pA[0] + tA[0] * h0, pA[1] + tA[1] * h0], c20 = [C[0] - tC[0] * h0, C[1] - tC[1] * h0], cv0 = [];
            for (let q = 0; q <= 12; q++) { const u = q / 12, w = 1 - u; cv0.push([w * w * w * pA[0] + 3 * w * w * u * c10[0] + 3 * w * u * u * c20[0] + u * u * u * C[0], w * w * w * pA[1] + 3 * w * w * u * c10[1] + 3 * w * u * u * c20[1] + u * u * u * C[1]]); }
            const oP = jb === 0 ? PB.slice(0, ci) : PB.slice(ci + 1).reverse(), pl = cv0.concat(oP.slice().reverse().filter(p => dist(p, C) > 0.01)); let cx = 0, cy = 0; pl.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= pl.length; cy /= pl.length;
            if (PO.some(po => po.length > 2 && inPoly([cx, cy], po))) continue; /* uskok ma byc wypelniony tylko tam, gdzie jest teren (nie zwezamy asfaltu) */ }
          if (!best || turn > best.turn) best = { A, B, pA, C, ci, tA, tC, turn, jb }; }
        if (!best) { if (d < 1.0 && !F[x].used && !F[y].used) { used.add(x); used.add(y); lines.push({ P: [F[x].l.P[F[x].j], F[y].l.P[F[y].j]], st: 'p2', ly: F[x].l.ly }); } continue; } /* brak miejsca na krzywa (wezel zakryty asfaltem): prosty lacznik, zeby linia nie miala dziury */
        const { A, B, pA, C, ci, tA, tC, jb } = best, PB = B.l.P, pB = PB[jb], dAC = dist(pA, C), h = dAC * 0.4, c1 = [pA[0] + tA[0] * h, pA[1] + tA[1] * h], c2 = [C[0] - tC[0] * h, C[1] - tC[1] * h], cv = [];
        for (let q = 0; q <= 12; q++) { const u = q / 12, w = 1 - u; cv.push([w * w * w * pA[0] + 3 * w * w * u * c1[0] + 3 * w * u * u * c2[0] + u * u * u * C[0], w * w * w * pA[1] + 3 * w * w * u * c1[1] + 3 * w * u * u * c2[1] + u * u * u * C[1]]); }
        const old = jb === 0 ? [pB, ...PB.slice(1, ci)] : [pB, ...PB.slice(ci + 1).reverse()].reverse().reverse(); /* stary przebieg B -> C (do zastapienia) */
        const oldP = jb === 0 ? PB.slice(0, ci) : PB.slice(ci + 1).reverse(); /* od B w strone C */
        const poly = cv.concat(oldP.slice().reverse().filter(p => dist(p, C) > 0.01)); let ar = 0; for (let q = 0; q < poly.length; q++) { const p1 = poly[q], p2 = poly[(q + 1) % poly.length]; ar += p1[0] * p2[1] - p2[0] * p1[1]; } ar = Math.abs(ar) / 2; if (ar > 6) continue; /* wypelnienie tylko maly uskok */
        used.add(x); used.add(y); A.used = B.used = true;
        B.l.P = jb === 0 ? PB.slice(ci) : PB.slice(0, ci + 1); if (jb === 0) B.l.P[0] = C; else B.l.P[B.l.P.length - 1] = C;
        lines.push({ P: cv, st: 'p2', ly: A.l.ly }); polys.push({ P: poly, L: [], R: [], kerb: false, ly: A.l.ly | 0, br: false }); polys.push({ P: [cv[0], cv[0], cv[0]], L: cv, R: [], kerb: true, ly: A.l.ly | 0, br: false }); }
    }
  }
  { // łączenie linii ciągłych, które kończą się w tym samym punkcie (brak dziur na styku dróg)
    const sol = lines.filter(l => l.st === 'p2'), rest = lines.filter(l => l.st !== 'p2'), tol = 0.7; let ch = true;
    for (let i = 0; i < sol.length; i++) { const a = sol[i]; ch = true; /* linia i doklejana do skutku, potem nastepna (bez zaczynania od nowa: n^2 zamiast n^3; wynik ten sam - konce linii tylko sie dziedzicza) */
      while (ch) { ch = false;
        for (let j = i + 1; j < sol.length; j++) {
          const b = sol[j]; if ((a.ly | 0) !== (b.ly | 0)) continue; const sa = a.P[0], ea = a.P[a.P.length - 1], sb = b.P[0], eb = b.P[b.P.length - 1];
          if (dist(ea, sb) < tol) a.P = a.P.concat(b.P.slice(1)); else if (dist(ea, eb) < tol) a.P = a.P.concat(b.P.slice(0, -1).reverse()); else if (dist(sa, eb) < tol) a.P = b.P.concat(a.P.slice(1)); else if (dist(sa, sb) < tol) a.P = b.P.slice(1).reverse().concat(a.P); else continue;
          sol.splice(j, 1); ch = true; break;
        }
      }
    }
    lines.length = 0; lines.push(...rest, ...sol);
  }
  for (const [k, G] of ends) { /* Node Controller: reczny promien rogow - wkleslle luki (fillety) miedzy kazda para sasiednich ramion wezla (3+ drog) */
    const rr0 = S.nodeR && S.nodeR[k]; if (rr0 == null || rr0 <= 0.05 || G.length < 3 || new Set(G.map(e => e.i)).size < 3) continue;
    const arms = G.map(e => { const E = edgeOf[e.i]; if (!E) return null; const j = e.st ? 0 : E.Lf.length - 1, u = unitFrom(C[e.i], e.st), Lp = e.st ? E.Lf[j] : E.Rt[j], Rp = e.st ? E.Rt[j] : E.Lf[j]; return { e, u, Lp, Rp, ang: Math.atan2(u[1], u[0]), len: C[e.i].cum[C[e.i].cum.length - 1] }; }).filter(Boolean).sort((a, b) => a.ang - b.ang);
    if (arms.length < 3) continue; const lyK = Math.max(...arms.map(a => R[a.e.i].ly | 0));
    for (let q = 0; q < arms.length; q++) { const A = arms[q], B = arms[(q + 1) % arms.length], cr = A.u[0] * B.u[1] - A.u[1] * B.u[0], dt = A.u[0] * B.u[0] + A.u[1] * B.u[1]; if (cr <= 0.05) continue; /* kat CCW od A do B w (0, 180) st. */
      const phi = Math.acos(Math.max(-1, Math.min(1, dt))); if (phi < 0.35 || phi > 2.75) continue;
      const P0 = A.Rp, P1 = B.Lp, den = A.u[0] * B.u[1] - A.u[1] * B.u[0], t = ((P1[0] - P0[0]) * B.u[1] - (P1[1] - P0[1]) * B.u[0]) / den, I = [P0[0] + A.u[0] * t, P0[1] + A.u[1] * t]; if (dist(I, P0) > 25 || (I[0] - P0[0]) * A.u[0] + (I[1] - P0[1]) * A.u[1] < -0.3 || (I[0] - P1[0]) * B.u[0] + (I[1] - P1[1]) * B.u[1] < -0.3) continue; /* naroznik musi lezec 'za' poczatkami krawedzi ramion (po stronie wezla) */
      let L = rr0 * 1.6, r = L * Math.tan(phi / 2); const Lm = Math.min(14, A.len * 0.45, B.len * 0.45); if (L > Lm) { r *= Lm / L; L = Lm; } if (L < 0.2) continue; /* suwak = dlugosc stycznej (rowny wzrost niezaleznie od kata ramion) */
      const T1 = [I[0] + A.u[0] * L, I[1] + A.u[1] * L], T2 = [I[0] + B.u[0] * L, I[1] + B.u[1] * L], bs = [A.u[0] + B.u[0], A.u[1] + B.u[1]], bl = Math.hypot(bs[0], bs[1]) || 1, cc = [I[0] + bs[0] / bl * r / Math.sin(phi / 2), I[1] + bs[1] / bl * r / Math.sin(phi / 2)];
      let a1 = Math.atan2(T1[1] - cc[1], T1[0] - cc[0]), a2 = Math.atan2(T2[1] - cc[1], T2[0] - cc[0]), da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const arc = []; for (let w = 0; w <= 14; w++) arc.push([cc[0] + r * Math.cos(a1 + da * w / 14), cc[1] + r * Math.sin(a1 + da * w / 14)]);
      const wp = [I, T1, ...arc, T2], inW = p => inPoly(p, wp) || segDist(p, I, T1) < 0.2 || segDist(p, I, T2) < 0.2; /* krawedzie ramion wewnatrz klina luku znikaja (obrys robi wspolna krawedz) */
      for (const l of lines.slice()) { if (l.st !== 'p2' || (l.ly | 0) !== lyK) continue; let run = []; const out = []; for (const p of l.P) { if (inW(p)) { if (run.length) out.push(run); run = []; } else run.push(p); } if (run.length) out.push(run); if (out.length === 1 && out[0].length === l.P.length) continue; const keepP = out.filter(o => { let t = 0; for (let z = 1; z < o.length; z++) t += dist(o[z - 1], o[z]); return t > 1.5; }); l.P = keepP[0] || []; for (let w2 = 1; w2 < keepP.length; w2++) lines.push({ P: keepP[w2], st: 'p2', ly: l.ly }); }
      polys.push({ P: wp, L: arc, R: [], kerb: true, ly: lyK, br: false, ed: true }); } }
    for (let q = lines.length - 1; q >= 0; q--) if (lines[q].P.length < 2) lines.splice(q, 1);
  for (const [k, G] of ends) { /* Node Controller: przy recznym promieniu linie krawedzi ramion nie sa rysowane wewnatrz asfaltu (zostaje tylko wspolny obrys) */
    const rr0 = S.nodeR && S.nodeR[k]; if (rr0 == null || rr0 <= 0.05 || G.length < 3) continue; const gi = new Set(G.map(e => e.i));
    for (const l of lines) { if (l.st !== 'p2' || l.arc) continue; const ri = (() => { const jj = lines.indexOf(l); for (let i2 = R.length - 1; i2 >= 0; i2--) if (rng[i2] && jj >= rng[i2][0]) return i2; return -1; })(); if (gi.has(ri)) l.noInt = true; } }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], unit = a => { const l = Math.hypot(a[0], a[1]); return l > 1e-9 ? [a[0] / l, a[1] / l] : null; };
  const krn = [];
  for (const l of lines) { /* zaokraglenie ostrych/sfazowanych naroznikow krawedzi (krotki odcinek <1,2 m laczacy dwa prawie prostopadle kierunki -> luk) */
    if (l.st !== 'p2' || l.arc || l.P.length < 4) continue;
    let P = l.P, ch = true, guard = 0;
    while (ch && guard++ < 20) { ch = false;
      for (let k = 1; k + 2 < P.length; k++) {
        const A = P[k], B = P[k + 1], sl = dist(A, B); if (sl > 1.2 || sl < 0.05) continue;
        let kb = k - 1; while (kb > 0 && dist(P[kb], A) < 1.0) kb--; let kf = k + 2; while (kf < P.length - 1 && dist(P[kf], B) < 1.0) kf++; if (dist(P[kb], A) < 1.0 || dist(P[kf], B) < 1.0) continue; /* oba ramiona proste przez >= 1 m */
        const d1 = unit(sub(A, P[kb])), d2 = unit(sub(P[kf], B)); if (!d1 || !d2) continue;
        let okc = true; for (let q = kb + 1; q < k && okc; q++) okc = Math.abs((P[q][0] - A[0]) * d1[1] - (P[q][1] - A[1]) * d1[0]) < 0.08; for (let q = k + 2; q < kf && okc; q++) okc = Math.abs((P[q][0] - B[0]) * d2[1] - (P[q][1] - B[1]) * d2[0]) < 0.08; if (!okc) continue;
        const cr = d1[0] * d2[1] - d1[1] * d2[0], dt = d1[0] * d2[0] + d1[1] * d2[1]; if (Math.abs(cr) < 0.5) continue; /* skret wiekszy niz ok. 30 st. */
        const t = ((B[0] - A[0]) * d2[1] - (B[1] - A[1]) * d2[0]) / cr, X = [A[0] + d1[0] * t, A[1] + d1[1] * t];
        if (t < -0.2 || dist(X, A) > 1.5 || dist(X, B) > 1.5) continue;
        const r = Math.max(0.55, dist(X, A), dist(X, B)) + 0.05, a0 = [X[0] - d1[0] * r, X[1] - d1[1] * r], a1 = [X[0] + d2[0] * r, X[1] + d2[1] * r];
        const pre = P.slice(0, k + 1), post = P.slice(k + 1); while (pre.length > 1 && dist(pre[pre.length - 1], X) < r + 0.02) pre.pop(); while (post.length > 1 && dist(post[0], X) < r + 0.02) post.shift();
        if (pre.length < 1 || post.length < 1) continue;
        const bz = []; for (let q = 0; q <= 8; q++) { const u = q / 8, w = 1 - u; bz.push([w * w * a0[0] + 2 * w * u * X[0] + u * u * a1[0], w * w * a0[1] + 2 * w * u * X[1] + u * u * a1[1]]); }
        P = pre.concat(bz, post); ch = true; krn.push({ P: [bz[0], bz[0], bz[0]], L: bz, R: [], kerb: true, ly: l.ly, br: false }); break; } }
    guard = 0; ch = true; while (ch && guard++ < 20) { ch = false; /* ostry wierzcholek (zbieg dwoch krawedzi pod ostrym katem, czubek wyspy): male zaokraglenie zamiast szpica */
      for (let k = 1; k + 1 < P.length; k++) {
        const V = P[k]; let kb = k - 1; while (kb > 0 && dist(P[kb], V) < 1.0) kb--; let kf = k + 1; while (kf < P.length - 1 && dist(P[kf], V) < 1.0) kf++; if (dist(P[kb], V) < 1.0 || dist(P[kf], V) < 1.0) continue;
        const d1 = unit(sub(V, P[kb])), d2 = unit(sub(P[kf], V)); if (!d1 || !d2 || d1[0] * d2[0] + d1[1] * d2[1] > 0.82) continue; /* skret > ok. 35 st. */
        let okc = true; for (let q = kb + 1; q < k && okc; q++) okc = Math.abs((P[q][0] - V[0]) * d1[1] - (P[q][1] - V[1]) * d1[0]) < 0.08; for (let q = k + 1; q < kf && okc; q++) okc = Math.abs((P[q][0] - V[0]) * d2[1] - (P[q][1] - V[1]) * d2[0]) < 0.08; if (!okc) continue;
        const r = 1.0, a0 = [V[0] - d1[0] * r, V[1] - d1[1] * r], a1 = [V[0] + d2[0] * r, V[1] + d2[1] * r], pre = P.slice(0, k), post = P.slice(k + 1); while (pre.length > 1 && dist(pre[pre.length - 1], V) < r + 0.02) pre.pop(); while (post.length > 1 && dist(post[0], V) < r + 0.02) post.shift();
        const bz = []; for (let q = 0; q <= 8; q++) { const u = q / 8, w = 1 - u; bz.push([w * w * a0[0] + 2 * w * u * V[0] + u * u * a1[0], w * w * a0[1] + 2 * w * u * V[1] + u * u * a1[1]]); }
        P = pre.concat(bz, post); ch = true; krn.push({ P: [bz[0], bz[0], bz[0]], L: bz, R: [], kerb: true, ly: l.ly, br: false }); break; } }
    l.P = P; }
  polys.push(...krn); /* krawezniki wzdluz zaokraglonych naroznikow */
  for (const l of lines) { /* wygladzenie drobnych garbow bialych krawedzi na zlaczach (3-10 cm): lekkie usrednianie sasiednich punktow, konce nieruchome */
    if (l.st !== 'p2' || l.P.length < 5) continue; let P = l.P;
    for (let it = 0; it < 3; it++) { const Q = P.map(p => p); for (let j = 1; j < P.length - 1; j++) { if (dist(P[j - 1], P[j]) > 0.8 || dist(P[j], P[j + 1]) > 0.8) continue; Q[j] = [P[j][0] * 0.5 + (P[j - 1][0] + P[j + 1][0]) * 0.25, P[j][1] * 0.5 + (P[j - 1][1] + P[j + 1][1]) * 0.25]; } P = Q; }
    l.P = P; if (l.arc) polys.push({ P: [P[0], P[0], P[0]], L: P, R: [], kerb: true, ly: l.ly, br: false }); }
  S.nodeViz = []; const miniSet = new Set();
  if (window.__nodeGeom) for (const [k, G] of ends) { /* nowa geometria wezlow: wielokat z krawedzi dojazdow z lukami stycznymi w narozniku (jak w wezel-demo.html) */
    if (forkDone.has(k)) continue;
    if (G.length === 2 && G[0].i !== G[1].i && (nodeRoads.get(k) || []).length === 2) { /* mini-wezel: dwie drogi zlaczone pod katem (zakret > ~12 st.) */
      const dd = e => { const Q = orient(C[e.i], e.st).Q; let j = 1; while (j < Q.length - 1 && dist(Q[0], Q[j]) < 3) j++; return unit([Q[j][0] - Q[0][0], Q[j][1] - Q[0][1]]) || [1, 0]; }, u1 = dd(G[0]), u2 = dd(G[1]);
      if (-(u1[0] * u2[0] + u1[1] * u2[1]) > 0.99998) continue; miniSet.add(k); /* prawie prosto: zwykle polaczenie */
    } else if (G.length < 3 || new Set(G.map(e => e.i)).size < 3) continue;
    if (G.length === 3) { const hw = G.map(e => R[e.i].hw || ''), hiN = hw.filter(h => /^(motorway|trunk)(?!_link)/.test(h)).length, loN = hw.filter(h => /^(service|track|path|footway|cycleway|living_street|residential|unclassified)/.test(h)).length; if (hiN === 2 && loN === 1) continue; } /* dojazd techniczny do autostrady/ekspresowki: jezdnia glowna biegnie dalej bez wezla, dojazd po prostu sie do niej dokleja */
    const o = orient(C[G[0].i], G[0].st).Q[0], arms = G.map(e => { const oo = orient(C[e.i], e.st), Qs = oo.Q; let j1 = 1; while (j1 < Qs.length - 1 && dist(Qs[0], Qs[j1]) < 0.5) j1++; const d0 = unit([Qs[j1][0] - Qs[0][0], Qs[j1][1] - Qs[0][1]]) || [1, 0];
      let run = 0; for (let q = j1; q < Qs.length; q++) { const dq = unit([Qs[q][0] - Qs[q - 1][0], Qs[q][1] - Qs[q - 1][1]]); if (!dq || dq[0] * d0[0] + dq[1] * d0[1] < 0.9986) break; run = dist(Qs[0], Qs[q]); }
      const h = rw(R[e.i]) / 2, d00 = (oo.d && oo.d[0]) || 0, w00 = (oo.w && oo.w[0]) || 2 * h, hp = d00 + w00 / 2, hq = w00 / 2 - d00, tot = Qs.reduce((t, q, z) => z ? t + dist(Qs[z - 1], q) : 0, 0), D = Math.max(1, Math.min(14, tot * 0.5, Math.max(run, 1) + 1.5)), sc = [0]; for (let q = 1; q < Qs.length; q++) sc.push(sc[q - 1] + dist(Qs[q - 1], Qs[q]));
      const edge = side => { const out = []; for (let q = 0; q < Qs.length && sc[q] <= D; q++) { const a1 = Qs[Math.max(0, q - 1)], b1 = Qs[Math.min(Qs.length - 1, q + 1)], t = unit([b1[0] - a1[0], b1[1] - a1[1]]) || d0, nn = [-t[1], t[0]], cs = Math.max(0.5, nn[0] * (-d0[1]) + nn[1] * d0[0]); out.push({ s: sc[q], p: [Qs[q][0] + side * nn[0] * h / cs * (q === 0 ? 1 : 1), Qs[q][1] + side * nn[1] * h / cs] }); } if (out.length && out[out.length - 1].s < D - 0.05 && Qs.length > out.length) { const q = out.length, f = (D - sc[q - 1]) / (sc[q] - sc[q - 1] || 1), pt = [Qs[q - 1][0] + (Qs[q][0] - Qs[q - 1][0]) * f, Qs[q - 1][1] + (Qs[q][1] - Qs[q - 1][1]) * f]; const t = unit([Qs[q][0] - Qs[q - 1][0], Qs[q][1] - Qs[q - 1][1]]) || d0; out.push({ s: D, p: [pt[0] + side * (-t[1]) * h, pt[1] + side * t[0] * h] }); } return out; };
      const trueEdge = sg => Qs.map((q, z) => { const a1 = Qs[Math.max(0, z - 1)], b1 = Qs[Math.min(Qs.length - 1, z + 1)], t = unit([b1[0] - a1[0], b1[1] - a1[1]]) || d0, dd = oo.d ? oo.d[z] : 0, ww = oo.w ? oo.w[z] : 2 * h, off = sg > 0 ? dd + ww / 2 : dd - ww / 2; return [q[0] - t[1] * off, q[1] + t[0] * off]; });
      return { ri: e.i, a: Math.atan2(d0[1], d0[0]), u: d0, n: [-d0[1], d0[0]], h, hp, hq, SC: sc, TP: trueEdge(1), TM: trueEdge(-1), nl: Math.max(1, R[e.i].lanes | 0), len: Math.max(1, Math.min(30, run)), EP: edge(1), EM: edge(-1) }; }).sort((p, q) => p.a - q.a);
    const dt = (p, q) => p[0] * q[0] + p[1] * q[1], N = arms.length, poly = [], arcList = [], isMini = miniSet.has(k), r0 = isMini ? (window.__miniR != null ? window.__miniR : 0.5) : (S.nodeR && S.nodeR[k] != null ? S.nodeR[k] : (window.__nodeR0 != null ? window.__nodeR0 : 1)), AMIN = isMini ? (window.__miniMin != null ? window.__miniMin : 0.05) : (window.__arcMin != null ? window.__arcMin : 1.2), md = S.arcMode | 0;
    const ix = (p, d, q, e) => { const den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 1e-9) return null; const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den; return [p[0] + d[0] * t, p[1] + d[1] * t]; };
    const beyond = (E, tmin) => E.filter(q => q.s > tmin + 0.02).map(q => q.p); /* punkty krawedzi dalej niz punkt styczny */
    const cor = new Array(N).fill(null);
    for (let i = 0; i < N; i++) {
      const a = arms[i], b = arms[(i + 1) % N]; let gap = b.a - a.a; while (gap <= 0) gap += 2 * Math.PI;
      const L0 = [o[0] + a.n[0] * a.hp, o[1] + a.n[1] * a.hp], R0 = [o[0] - b.n[0] * b.hq, o[1] - b.n[1] * b.hq];
      { const e0 = a.EM.length ? a.EM : null; if (i === 0 || true) { /* poczatek ramienia a: prawa krawedz (minus) zakonczona tuz za punktem stycznym poprzedniego rogu - tu tylko daleki koniec */ } }
      if (gap >= Math.PI - 0.3) { cor[i] = { pts: [L0, R0], T1: L0, T2: R0 }; continue; } /* ramiona prawie naprzeciw siebie (< ok. 17 st. od prostej): droga przelotowa, bez luku (wzor r / tan(kat / 2) dawal dziesiatki metrow = bombel) */
      const th = Math.acos(Math.max(-1, Math.min(1, -dt(a.u, b.u)))); let rr = r0; if (md === 1 && th > 0.05) rr = r0 / th; else if (md === 2 && th > 0.05) rr = r0 / Math.tan(th / 2);
      let T1, T2, C0, ok = false, refl = false;
      if (gap > 1.75 && th > 0.02) { /* lagodny naroznik (kat zewnetrzny >135 st.): luk wypukly na zewnatrz, srodek po stronie wezla, styczne ~r0 od wierzcholka */
        const rx = Math.min(window.__rxMax || 60, r0 / Math.tan(th / 2)), c = ix([o[0] + a.n[0] * (a.hp - rx), o[1] + a.n[1] * (a.hp - rx)], a.u, [o[0] - b.n[0] * (b.hq - rx), o[1] - b.n[1] * (b.hq - rx)], b.u);
        if (c) { refl = true; rr = rx; C0 = c; T1 = [c[0] + a.n[0] * rx, c[1] + a.n[1] * rx]; T2 = [c[0] - b.n[0] * rx, c[1] - b.n[1] * rx]; ok = true; } }
      const al = Math.PI - th, AMc = al < 0.65 ? Math.max(0.2, Math.min(AMIN, 4 * Math.sin(al / 2))) : AMIN; /* ostry kat miedzy ramionami: czubek klina nie dalej niz ok. 4 m od wierzcholka (bez dlugiej igly) */ if (AMc < AMIN && rr > AMc) rr = AMc;
      for (let it = 0; it < 24 && rr > AMc; it++) { C0 = ix([o[0] + a.n[0] * (a.hp + rr), o[1] + a.n[1] * (a.hp + rr)], a.u, [o[0] - b.n[0] * (b.hq + rr), o[1] - b.n[1] * (b.hq + rr)], b.u); if (!C0) { rr *= 0.7; continue; } T1 = [C0[0] - a.n[0] * rr, C0[1] - a.n[1] * rr]; T2 = [C0[0] + b.n[0] * rr, C0[1] + b.n[1] * rr]; if (dt([T1[0] - o[0], T1[1] - o[1]], a.u) <= Math.max(a.len, 9) * 0.95 && dt([T2[0] - o[0], T2[1] - o[1]], b.u) <= Math.max(b.len, 9) * 0.95) { ok = true; break; } rr *= 0.85; }
      if (!ok || rr <= AMc + 0.001) { rr = AMc; C0 = ix([o[0] + a.n[0] * (a.hp + rr), o[1] + a.n[1] * (a.hp + rr)], a.u, [o[0] - b.n[0] * (b.hq + rr), o[1] - b.n[1] * (b.hq + rr)], b.u); if (!C0) { const X = ix(L0, a.u, R0, b.u) || L0; cor[i] = { pts: [X], T1: X, T2: X }; continue; } T1 = [C0[0] - a.n[0] * rr, C0[1] - a.n[1] * rr]; T2 = [C0[0] + b.n[0] * rr, C0[1] + b.n[1] * rr]; } /* zawsze luk: gdy nie miesci sie, najmniejszy promien */
      { /* doprecyzowanie: okrag styczny do rzeczywistych (krzywych) krawedzi pasow, nie do prostego modelu */
        const nr = (P, c) => { let best = 1e9, bp = P[0]; for (let z = 1; z < P.length; z++) { const x0 = P[z - 1], dx = P[z][0] - x0[0], dy = P[z][1] - x0[1], t = Math.max(0, Math.min(1, ((c[0] - x0[0]) * dx + (c[1] - x0[1]) * dy) / (dx * dx + dy * dy || 1))), qx = x0[0] + dx * t, qy = x0[1] + dy * t, d = Math.hypot(qx - c[0], qy - c[1]); if (d < best) { best = d; bp = [qx, qy]; } } return { d: best, p: bp }; };
        const solve = (PA, PB, c) => { for (let it = 0; it < 60; it++) { const A = nr(PA, c), B = nr(PB, c); if (!(A.d > 1e-6 && B.d > 1e-6)) return null; const ea = rr - A.d, eb = rr - B.d; if (Math.abs(ea) < 1e-4 && Math.abs(eb) < 1e-4) break; c = [c[0] + 0.7 * (ea * (c[0] - A.p[0]) / A.d + eb * (c[0] - B.p[0]) / B.d), c[1] + 0.7 * (ea * (c[1] - A.p[1]) / A.d + eb * (c[1] - B.p[1]) / B.d)]; } const A = nr(PA, c), B = nr(PB, c); return Math.abs(A.d - rr) < 0.02 && Math.abs(B.d - rr) < 0.02 ? { c, A, B } : null; }; const cutIn = (P, c) => { let last = -1; for (let z = 1; z < P.length; z++) { const x0 = P[z - 1], dx = P[z][0] - x0[0], dy = P[z][1] - x0[1], t = Math.max(0, Math.min(1, ((c[0] - x0[0]) * dx + (c[1] - x0[1]) * dy) / (dx * dx + dy * dy || 1))); if (Math.hypot(x0[0] + dx * t - c[0], x0[1] + dy * t - c[1]) < rr - 0.05) last = z; } return last; }; /* ostatni odcinek krawedzi wchodzacy w okrag */ const pip = (P, c) => { let ins = false; for (let z = 0, w = P.length - 1; z < P.length; w = z++) { const p0 = P[z], p1 = P[w]; if ((p0[1] > c[1]) !== (p1[1] > c[1]) && c[0] < (p1[0] - p0[0]) * (c[1] - p0[1]) / (p1[1] - p0[1]) + p0[0]) ins = !ins; } return ins; }, strip = m => m.TP.slice(0, 60).concat(m.TM.slice(0, 60).reverse()), SA = strip(a), SB = strip(b); const crosses = c => cutIn(a.TP, c) >= 0 || cutIn(b.TM, c) >= 0 || pip(SA, c) || pip(SB, c); /* luk przecina krawedz albo lezy na asfalcie drogi */ const sol = solve(a.TP, b.TM, C0.slice()); if (sol && Math.hypot(sol.c[0] - C0[0], sol.c[1] - C0[1]) < 2) { C0 = sol.c; T1 = sol.A.p; T2 = sol.B.p; } if (crosses(C0)) { /* luk wchodzi na pas: krawedzie drog przecinaja sie juz w wezle (waski klin, droga zalamana przy wezle) - luk wpisany w klin za punktem przeciecia, w razie potrzeby mniejszy promien */ let X = null, za = 0, zb = 0; for (let z = 1; z < Math.min(a.TP.length, 40) && !X; z++) for (let w = 1; w < Math.min(b.TM.length, 40) && !X; w++) { const p0 = a.TP[z - 1], p1 = a.TP[z], q0 = b.TM[w - 1], q1 = b.TM[w], d1 = [p1[0] - p0[0], p1[1] - p0[1]], d2 = [q1[0] - q0[0], q1[1] - q0[1]], den = d1[0] * d2[1] - d1[1] * d2[0]; if (Math.abs(den) < 1e-12) continue; const t = ((q0[0] - p0[0]) * d2[1] - (q0[1] - p0[1]) * d2[0]) / den, v = ((q0[0] - p0[0]) * d1[1] - (q0[1] - p0[1]) * d1[0]) / den; if (t >= 0 && t <= 1 && v >= 0 && v <= 1) { X = [p0[0] + d1[0] * t, p0[1] + d1[1] * t]; za = z; zb = w; } } if (X) { const PA = [X].concat(a.TP.slice(za)), PB = [X].concat(b.TM.slice(zb)), dir = P => { let j = 1; while (j < P.length - 1 && dist(P[0], P[j]) < 1) j++; return unit([P[j][0] - P[0][0], P[j][1] - P[0][1]]); }, dA = dir(PA), dB = dir(PB); if (dA && dB) { const bis = unit([dA[0] + dB[0], dA[1] + dB[1]]), ph = Math.acos(Math.max(-1, Math.min(1, dt(dA, dB)))) / 2; if (bis && ph > 0.01) for (let rep = 0; rep < 40 && rr >= 0.1; rep++) { const c0 = [X[0] + bis[0] * rr / Math.sin(ph), X[1] + bis[1] * rr / Math.sin(ph)]; let pa = PA, pb = PB, s2 = solve(pa, pb, c0.slice()); for (let k2 = 0; k2 < 6 && s2; k2++) { const z1 = cutIn(pa, s2.c), z2 = cutIn(pb, s2.c); if (z1 < 0 && z2 < 0) break; if (z1 >= 0) pa = pa.slice(Math.max(1, z1 - 1)); if (z2 >= 0) pb = pb.slice(Math.max(1, z2 - 1)); if (pa.length < 2 || pb.length < 2) { s2 = null; break; } s2 = solve(pa, pb, s2.c); } /* krawedzie przecinaja sie ponownie (bardzo krotki odcinek przy wezle): luk styczny do dalszej czesci krawedzi, przy prawdziwym czubku klina */ const cc = s2 && Math.hypot(s2.c[0] - c0[0], s2.c[1] - c0[1]) < rr + 8 ? s2 : null, ce = cc ? cc.c : c0; if (!crosses(ce)) { C0 = ce; T1 = cc ? cc.A.p : [X[0] + dA[0] * rr / Math.tan(ph), X[1] + dA[1] * rr / Math.tan(ph)]; T2 = cc ? cc.B.p : [X[0] + dB[0] * rr / Math.tan(ph), X[1] + dB[1] * rr / Math.tan(ph)]; break; } rr *= 0.85; } } } } }
      const a1 = Math.atan2(T1[1] - C0[1], T1[0] - C0[0]), a2 = Math.atan2(T2[1] - C0[1], T2[0] - C0[0]); let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const arc = []; for (let q = 0; q <= 16; q++) arc.push([C0[0] + rr * Math.cos(a1 + da * q / 16), C0[1] + rr * Math.sin(a1 + da * q / 16)]); cor[i] = { pts: arc, T1: arc[0], T2: arc[arc.length - 1], refl: refl ? { a, b } : null, ai: arcList.length }; arcList.push(arc);
    }
    const edgeAt = (P, SCa, d) => { let z = 1; while (z < SCa.length - 1 && SCa[z] < d) z++; const f = Math.max(0, Math.min(1, (d - SCa[z - 1]) / ((SCa[z] - SCa[z - 1]) || 1))); return [P[z - 1][0] + (P[z][0] - P[z - 1][0]) * f, P[z - 1][1] + (P[z][1] - P[z - 1][1]) * f]; };
    { /* lagodne narozniki: krzywa gladka od naroza granicy jednej drogi do naroza granicy drugiej (styczna do obu krawedzi), wezel nigdy sie nie zwezza */
      const Dm = arms.map((m, j) => { const pc = cor[(j - 1 + N) % N], cc = cor[j]; return Math.max(pc ? dt([pc.T2[0] - o[0], pc.T2[1] - o[1]], m.u) : 0, cc ? dt([cc.T1[0] - o[0], cc.T1[1] - o[1]], m.u) : 0, 0.3); });
      const tg = (E, SCa, d, u) => { const q0 = edgeAt(E, SCa, Math.max(0, d - 0.5)), q1 = edgeAt(E, SCa, d + 0.5); return unit([q0[0] - q1[0], q0[1] - q1[1]]) || [-u[0], -u[1]]; };
      const pipR = (P, c) => { let ins = false; for (let z = 0, w = P.length - 1; z < P.length; w = z++) { const p0 = P[z], p1 = P[w]; if ((p0[1] > c[1]) !== (p1[1] > c[1]) && c[0] < (p1[0] - p0[0]) * (c[1] - p0[1]) / (p1[1] - p0[1]) + p0[0]) ins = !ins; } return ins; };
      for (let i = 0; i < N; i++) { const c = cor[i]; if (!c || !c.refl) continue; const { a, b } = c.refl, ja = i, jb = (i + 1) % N, P1 = edgeAt(a.TP, a.SC, Dm[ja]), P2 = edgeAt(b.TM, b.SC, Dm[jb]);
        const bez = (sa, sb) => { const Q1 = edgeAt(a.TP, a.SC, sa), Q2 = edgeAt(b.TM, b.SC, sb), h = Math.hypot(Q2[0] - Q1[0], Q2[1] - Q1[1]) * 0.4, ia = tg(a.TP, a.SC, sa, a.u), ib = tg(b.TM, b.SC, sb, b.u), Xc = ix(Q1, ia, Q2, ib), t1 = Xc ? dt([Xc[0] - Q1[0], Xc[1] - Q1[1]], ia) : -1, t2 = Xc ? dt([Xc[0] - Q2[0], Xc[1] - Q2[1]], ib) : -1, h1 = t1 > 0 && t2 > 0 ? Math.min(h, t1 * 2 / 3) : h, h2 = t1 > 0 && t2 > 0 ? Math.min(h, t2 * 2 / 3) : h, K1 = [Q1[0] + ia[0] * h1, Q1[1] + ia[1] * h1], K2 = [Q2[0] + ib[0] * h2, Q2[1] + ib[1] * h2], out = []; /* styczne = rzeczywisty kierunek krawedzi; punkty kontrolne nie dalej niz przeciecie stycznych */
          for (let q = 0; q <= 16; q++) { const t = q / 16, m = 1 - t; out.push([m * m * m * Q1[0] + 3 * m * m * t * K1[0] + 3 * m * t * t * K2[0] + t * t * t * Q2[0], m * m * m * Q1[1] + 3 * m * m * t * K1[1] + 3 * m * t * t * K2[1] + t * t * t * Q2[1]]); } return out; };
        const SA = a.TP.slice(0, 80).concat(a.TM.slice(0, 80).reverse()), SB = b.TP.slice(0, 80).concat(b.TM.slice(0, 80).reverse()), bad = B => { for (let q = 2; q <= 14; q++) if (pipR(SA, B[q]) || pipR(SB, B[q])) return true; return false; };
        let sa = Dm[ja], sb = Dm[jb], pts = bez(sa, sb);
        if (bad(pts)) { let found = false; for (let k = 1; k <= 24 && !found; k++) { const f = 1 - k / 25; for (const [xa, xb] of [[Dm[ja] * f, Dm[jb]], [Dm[ja], Dm[jb] * f], [Dm[ja] * f, Dm[jb] * f]]) { const B = bez(xa, xb); if (!bad(B)) { sa = xa; sb = xb; pts = B; found = true; break; } } } } /* krzywa szla na skroty przez asfalt drogi (droga zakreca tuz przed wezlem): najpierw wzdluz krawedzi drogi, dopiero potem luk */
        const pre = [P1], post = []; for (let z = a.SC.length - 1; z >= 0; z--) if (a.SC[z] < Dm[ja] - 0.02 && a.SC[z] > sa + 0.02) pre.push(a.TP[z]); for (let z = 0; z < b.SC.length; z++) if (b.SC[z] > sb + 0.02 && b.SC[z] < Dm[jb] - 0.02) post.push(b.TM[z]); post.push(P2);
        pts = (sa < Dm[ja] - 0.02 ? pre : []).concat(pts, sb < Dm[jb] - 0.02 ? post : []);
        c.pts = pts; c.T1 = P1; c.T2 = P2; arcList[c.ai] = pts; } }
    const midOf = (m, d) => { const a = edgeAt(m.TM, m.SC, d), b = edgeAt(m.TP, m.SC, d); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }, RAD = !isMini && window.__nodeRad > 0 ? +window.__nodeRad : 0; let CEN = null; /* rozmiar wezla: granice ramion w rownej odleglosci od srodka geometrycznego */
    if (RAD) { let sx = 0, sy = 0, cn = 0; for (let j = 0; j < N; j++) { const pc = cor[(j - 1 + N) % N], cc = cor[j]; if (!pc || !cc) continue; const m = arms[j], d0 = Math.max(dt([pc.T2[0] - o[0], pc.T2[1] - o[1]], m.u), dt([cc.T1[0] - o[0], cc.T1[1] - o[1]], m.u), 0.3), p = midOf(m, Math.min(d0, RAD)); sx += p[0]; sy += p[1]; cn++; } if (cn) CEN = [sx / cn, sy / cn]; }
    const cuts = []; for (let j = 0; j < N; j++) { const pc = cor[(j - 1 + N) % N], cc = cor[j]; if (!pc || !cc) continue; const m = arms[j], sL = dt([pc.T2[0] - o[0], pc.T2[1] - o[1]], m.u), sR = dt([cc.T1[0] - o[0], cc.T1[1] - o[1]], m.u); let D = Math.max(sL, sR, 0.3); if (CEN) { const L0 = m.SC[m.SC.length - 1] || 60; let dd = 0.3; while (dd < L0 - 0.5 && dd < 80) { const p = midOf(m, dd); if (Math.hypot(p[0] - CEN[0], p[1] - CEN[1]) >= RAD) break; dd += 0.2; } D = Math.max(dd, Math.min(Math.max(sL, sR, 0.3), RAD * 2.5)); } { const ovD = R[m.ri].cutD && R[m.ri].cutD[k]; if (ovD != null && isFinite(ovD)) D = Math.max(0.3, +ovD); } /* reczna dlugosc ramienia (uchwyt w piaskownicy) */ /* granica wezla = prostopadla do drogi w odleglosci D */ { const A1 = edgeAt(m.TM, m.SC, D), B1 = edgeAt(m.TP, m.SC, D), mid = d => { const a = edgeAt(m.TM, m.SC, d), b = edgeAt(m.TP, m.SC, d); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }, Mc = [(A1[0] + B1[0]) / 2, (A1[1] + B1[1]) / 2], M0 = mid(Math.max(0, D - 1.5)), M2 = mid(D + 1.5), tq = unit([M2[0] - M0[0], M2[1] - M0[1]]) || m.u, nq = [-tq[1], tq[0]], pa = (A1[0] - Mc[0]) * nq[0] + (A1[1] - Mc[1]) * nq[1], pb = (B1[0] - Mc[0]) * nq[0] + (B1[1] - Mc[1]) * nq[1]; /* granica ramienia prostopadla do lokalnego kierunku jezdni (obraca sie plynnie z droga), nie do kierunku przy wezle */
      cuts[j] = [pc.T2, [Mc[0] + nq[0] * pa, Mc[1] + nq[1] * pa], [Mc[0] + nq[0] * pb, Mc[1] + nq[1] * pb], cc.T1]; cuts[j].D = D; cuts[j].u = tq; } }
    for (let j = 0; j < N; j++) { const c = cor[j], ca = cuts[j], cb = cuts[(j + 1) % N]; if (!c || c.refl || !ca || !cb) continue; if (dist(c.T1, ca[2]) < 0.1 && dist(c.T2, cb[1]) < 0.1) continue; const A = ca[2], B = cb[1]; /* luk konczy sie gdzie indziej niz granica ramienia (droga zakreca przy wezle): jedna plynna krzywa od krawedzi jednej drogi przy granicy do krawedzi drugiej, bez prostego odcinka */
      const a = arms[j], b = arms[(j + 1) % N], tgE = (E, SCa, d, u) => { const q0 = edgeAt(E, SCa, Math.max(0, d - 0.5)), q1 = edgeAt(E, SCa, d + 0.5); return unit([q0[0] - q1[0], q0[1] - q1[1]]) || [-u[0], -u[1]]; }, ia = tgE(a.TP, a.SC, ca.D, a.u), ib = tgE(b.TM, b.SC, cb.D, b.u), h = dist(A, B) * 0.55, fa = dt([B[0] - A[0], B[1] - A[1]], ia) / (dist(A, B) || 1), fb = dt([A[0] - B[0], A[1] - B[1]], ib) / (dist(A, B) || 1), h1 = h * Math.max(0.25, Math.min(1, 0.5 + fa)), h2 = h * Math.max(0.25, Math.min(1, 0.5 + fb)), /* styczna krotsza po stronie konca lezacego za drugim (bez zawijasa) */ K1 = [A[0] + ia[0] * h1, A[1] + ia[1] * h1], K2 = [B[0] + ib[0] * h2, B[1] + ib[1] * h2], pts = [];
      for (let q = 0; q <= 16; q++) { const t = q / 16, mm = 1 - t; pts.push([mm * mm * mm * A[0] + 3 * mm * mm * t * K1[0] + 3 * mm * t * t * K2[0] + t * t * t * B[0], mm * mm * mm * A[1] + 3 * mm * mm * t * K1[1] + 3 * mm * t * t * K2[1] + t * t * t * B[1]]); }
      c.pts = pts; c.T1 = A; c.T2 = B; ca[3] = A; cb[0] = B; if (c.ai != null) arcList[c.ai] = pts; }
    for (let j = 0; j < N; j++) { if (cor[j]) poly.push(...cor[j].pts); const c2 = cuts[(j + 1) % N]; if (c2) poly.push(c2[1], c2[2]); }
    const edges = []; for (let j = 0; j < N; j++) { if (!cor[j]) continue; const cj = cuts[j], cn = cuts[(j + 1) % N]; edges.push((cj ? [cj[2]] : []).concat(cor[j].pts, cn ? [cn[1]] : [])); }
    { const lyN = Math.max(...G.map(e => R[e.i].ly | 0)), PS = !miniSet.has(k) && window.__nodeAsph ? window.__nodeAsph({ k, o, cuts, lanes: arms.map(m => ({ ri: m.ri, u: m.u })) }) : null; /* piaskownica: asfalt wezla tylko pod pasami (pasy o stalej szerokosci) */ if (PS && PS.length) PS.forEach(P => polys.push({ P, L: [], R: [], kerb: false, ly: lyN, br: false, ed: false })); else polys.push({ P: poly, L: [], R: [], kerb: false, ly: lyN, br: false, ed: true }); var PS_ = PS && PS.length ? PS : null; } (S.nodeViz = S.nodeViz || []).push({ asph: PS_, k, mini: miniSet.has(k), poly, cuts, edges, arcs: arcList, o, lanes: arms.map(m => ({ ri: m.ri, u: m.u, n: m.n, h: m.h, nl: m.nl, len: Math.min(m.len, 6) })) });
  }
  S.CC = C; S.forks = forks; S.forks3 = forks3; return { polys, lines, gores, arrows };
}

// ---------- strzałki ----------
const GLY = {"through":[[[46.0,15.8],[28.1,12.3],[28.0,15.1],[0.2,15.1],[0.2,16.9],[28.0,16.9],[28.3,17.2],[28.1,19.7],[45.5,16.3]]],"right":[[[46.2,22.7],[46.2,22.4],[39.3,22.3],[32.2,15.1],[0.2,15.1],[0.2,16.9],[24.1,16.9],[29.6,22.3],[24.0,22.4],[24.0,22.7],[34.4,25.6],[35.5,25.6]]],"left":[[[46.5,9.3],[34.5,6.2],[24.3,9.1],[24.3,9.4],[29.5,9.4],[29.6,9.9],[24.1,14.9],[0.2,15.1],[0.2,16.8],[32.4,16.8],[39.3,9.6],[46.5,9.6]]],"through-left":[[[45.8,15.5],[29.0,12.2],[28.0,12.3],[28.1,14.6],[27.8,14.9],[13.4,14.9],[18.3,9.4],[25.7,9.4],[25.7,9.1],[14.5,6.2],[13.3,6.2],[3.1,9.1],[3.1,9.4],[8.7,9.6],[3.4,14.8],[0.2,15.1],[0.2,16.8],[27.8,16.8],[28.1,17.1],[28.1,19.5],[44.9,16.2],[45.8,15.8]]],"through-right":[[[45.8,15.7],[28.1,12.3],[28.1,14.6],[27.8,15.1],[0.2,15.2],[0.2,16.9],[3.2,17.1],[8.7,22.3],[3.8,22.4],[3.2,22.9],[13.3,25.6],[14.7,25.6],[25.2,22.7],[25.2,22.4],[18.5,22.4],[13.4,17.4],[13.4,16.9],[28.0,16.9],[28.1,19.5],[29.2,19.5],[45.8,16.0]]],"through-left-right":[[[45.7,15.5],[28.1,12.0],[28.1,14.6],[27.8,14.9],[13.6,14.9],[13.4,14.6],[18.5,9.4],[25.8,9.4],[25.8,9.1],[15.3,6.4],[13.3,6.2],[3.4,9.1],[3.4,9.4],[8.6,9.4],[8.7,9.7],[3.1,15.1],[0.2,15.1],[0.2,16.8],[3.4,16.9],[8.7,22.0],[8.6,22.3],[3.1,22.3],[3.1,22.6],[14.4,25.5],[25.5,22.4],[25.5,22.1],[18.5,22.1],[13.4,17.1],[13.6,16.8],[27.8,16.6],[28.1,16.9],[28.1,19.4],[45.7,15.8]]],"left-right":[[[46.6,22.7],[46.6,22.4],[39.7,22.4],[33.5,16.2],[39.6,9.6],[46.5,9.6],[46.5,9.3],[35.6,6.4],[33.8,6.5],[24.1,9.3],[24.1,9.6],[29.8,9.7],[24.3,15.1],[0.2,15.1],[0.2,16.9],[24.1,16.9],[29.8,22.1],[29.6,22.4],[24.1,22.4],[24.1,22.7],[34.4,25.6],[36.4,25.5]]],"p9b":[[[41.1,27.5],[34.8,15.1],[26.3,15.1],[14.1,4.7],[13.3,4.4],[0.2,4.5],[0.3,5.0],[17.4,14.8],[17.3,15.1],[9.3,15.1],[9.3,15.4]]],"p9a":[[[41.0,4.3],[9.5,16.5],[9.5,16.8],[17.6,17.0],[1.1,26.6],[0.2,27.5],[13.9,27.4],[26.0,17.0],[34.8,16.8],[41.0,4.9]]]};
function glyph(g, key) { /* strzalki drogowe: wielokaty wycięte 1:1 ze wzoru (os x = kierunek jazdy 0..46, os y = bok, os pasa y = 16) */
  const P = GLY[key] || GLY[key.split('-').filter(q => q !== 'reverse').join('-')] || GLY.through; g.fillStyle = window.__arrCol || '#f4f4f4'; g.beginPath(); for (const poly of P) { poly.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); } g.fill('evenodd');
}

// ---------- rysowanie ----------
const TILES = new Map(); let tq = 0; const tw = [];
const merc = (x, y, n) => { const R = 20037508.342789244; return [x / n * 2 * R - R, R - y / n * 2 * R]; };
window.__tst = { ok: 0, err: 0, last: '' };
async function fetchTile(kind, z, x, y, im) {
  if (kind === 'orto' || kind === 'ortolo' || kind === 'esri') await osmIdle();
  while (tq >= (kind === 'orto' || kind === 'ortolo' ? 6 : 4)) await new Promise(r => tw.push(r)); tq++;
  try {
    { /* kafelek, ktory przestal byc widoczny (przesuniecie/zoom w trakcie kolejki), nie jest pobierany: kolejka obsluguje to, co jest na ekranie */ const n = 2 ** z, lo = v => v / n * 360 - 180, la = v => Math.atan(Math.sinh(Math.PI * (1 - 2 * v / n))) * 180 / Math.PI, a = w2s(proj(lo(x), la(y))), b = w2s(proj(lo(x + 1), la(y + 1))), zc = Math.log2(156543.03 * Math.cos(S.org.lat * Math.PI / 180) * S.view.k);
      if (b[0] < -300 || b[1] < -300 || a[0] > W + 300 || a[1] > H + 300 || Math.abs(z - Math.round(zc)) > 3) { TILES.delete(kind + z + '/' + x + '/' + y); return; } }
    let url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    if (kind === 'topo') url = `https://${'abc'[(x + y) % 3]}.tile.opentopomap.org/${z}/${x}/${y}.png`;
    if (kind === 'quiet') url = `https://a.basemaps.cartocdn.com/light_nolabels/${z}/${x}/${y}.png`;
    if (kind === 'esri') url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    if (kind === 'ortolo') { const n = 2 ** z, a = merc(x, y + 1, n), b = merc(x + 1, y, n); url = `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=Raster&STYLES=&FORMAT=image/jpeg&TRANSPARENT=FALSE&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX=${a[0]},${a[1]},${b[0]},${b[1]}`; }
    if (kind === 'orto') { const n = 2 ** z, a = merc(x, y + 1, n), b = merc(x + 1, y, n); url = `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=Raster&STYLES=&FORMAT=image/jpeg&TRANSPARENT=FALSE&CRS=EPSG:3857&WIDTH=512&HEIGHT=512&BBOX=${a[0]},${a[1]},${b[0]},${b[1]}`; }
    let cache = null; try { cache = await caches.open('edytor-podklad-v1'); const hit = await cache.match(url); if (hit) { im.src = URL.createObjectURL(await hit.blob()); return; } } catch (e) {}
    for (let t = 0; t < 5; t++) {
      const r = await fetch(url); if (r.ok) { window.__tst.ok++; try { if (cache) cache.put(url, r.clone()); } catch (e) {} im.src = URL.createObjectURL(await r.blob()); return; }
      window.__tst.err++; window.__tst.last = kind + ' HTTP ' + r.status; if (![429, 500, 502, 503, 504].includes(r.status)) return; await new Promise(q => setTimeout(q, 400 * 2 ** t));
    }
  } catch (e) { window.__tst.err++; window.__tst.last = kind + ' ' + (e && e.message || e); } finally { tq--; const n = tw.pop(); if (n) n(); } /* najnowsze zadania pierwsze (LIFO): po przesunieciu mapy najpierw widoczne kafelki */
}
let srT = 0, srLast = 0; function schedRender() { if (srT) return; const wait = 0; srT = setTimeout(() => { srT = 0; srLast = performance.now(); requestAnimationFrame(render); }, wait); } /* zlaczone przerysowania po zaladowaniu kafelkow (w jezdzie max co ~350 ms) */
function tile(kind, z, x, y) { const k = kind + z + '/' + x + '/' + y; let im = TILES.get(k); if (!im) { im = new Image(); im.onload = schedRender; TILES.set(k, im); fetchTile(kind, z, x, y, im); } return im; }
function drawTiles() {
  if (!$('cTile').checked) return;
  const kind = $('bm').value; if (kind === 'quiet') { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#eceef1'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.restore(); return; } let z = Math.round(Math.log2(156543.03 * Math.cos(S.org.lat * Math.PI / 180) * S.view.k)); z = Math.max(2, Math.min(kind === 'topo' ? 17 : kind === 'orto' ? 20 : kind === 'ortolo' ? 18 : 19, z));
  const a = unproj(s2w([0, 0])), b = unproj(s2w([W, H])), n = 2 ** z;
  const tx = lon => (lon + 180) / 360 * n, ty = lat => (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  const lonOf = x => x / n * 360 - 180, latOf = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
  const x0 = Math.floor(tx(a.lon)), x1 = Math.floor(tx(b.lon)), y0 = Math.floor(ty(a.lat)), y1 = Math.floor(ty(b.lat));
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 80) return;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const im = tile(kind, z, x, y), p = w2s(proj(lonOf(x), latOf(y))), q = w2s(proj(lonOf(x + 1), latOf(y + 1)));
    if (!im.complete || !im.naturalWidth) { // do czasu wczytania: kafel z niższego zoomu
      for (let up = 1; up <= 3 && z - up >= 2; up++) { const pk = kind + (z - up) + '/' + (x >> up) + '/' + (y >> up), pim = TILES.get(pk); if (pim && pim.complete && pim.naturalWidth) { const f = 2 ** up, sw = pim.naturalWidth / f, sh = pim.naturalHeight / f; ctx.drawImage(pim, (x % f) * sw, (y % f) * sh, sw, sh, p[0], p[1], q[0] - p[0] + 0.6, q[1] - p[1] + 0.6); break; } }
      continue;
    } ctx.drawImage(im, p[0], p[1], q[0] - p[0] + 0.6, q[1] - p[1] + 0.6);
  }
}
function pathOf(g, P, closed) { const s = P.map(w2s); g.beginPath(); s.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); if (closed) g.closePath(); }
function drawLayer(g) {
  const lys = [...new Set([...L.polys, ...L.gores, ...L.lines, ...L.arrows].map(q => q.ly | 0))].sort((a, b) => a - b);
  for (const ly of lys) drawGroup(g, ly);
}
let ASPT = null;
const SFP = {};
const surfOf = r => { let v = r.sf; if (v == null && r.osm) { const o = S.osm.ways.get(r.osm); v = o && o.t && o.t.surface; } v = String(v || '').split(';')[0]; return /^(paving_stones|sett|cobblestone|unhewn_cobblestone|paved_stones)/.test(v) ? 'brick' : /^(concrete|concrete:plates|concrete:lanes)/.test(v) ? 'concrete' : /^(gravel|fine_gravel|compacted|pebblestone|woodchips)/.test(v) ? 'gravel' : /^(unpaved|dirt|ground|earth|mud|sand|grass)/.test(v) ? 'dirt' : ''; };
function surfPat(kind) { if (SFP[kind]) return SFP[kind]; const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); let sd = 11; const rnd = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296; /* kafel 4 m */
  const base = { brick: '#9b948c', concrete: '#aeb0ac', gravel: '#b5a888', dirt: '#9a8466' }[kind]; x.fillStyle = base; x.fillRect(0, 0, N, N);
  if (kind === 'brick') { const bw = 16, bh = 8; for (let r = 0; r < N / bh; r++) for (let q = 0; q < N / bw; q++) { const o = (r % 2) * bw / 2, v = 128 + (rnd() - 0.5) * 36; x.fillStyle = `rgb(${v + 12},${v + 4},${v - 6})`; x.fillRect(q * bw + o + 0.7, r * bh + 0.7, bw - 1.4, bh - 1.4); if (o && q === 0) x.fillRect(o - bw + 0.7, r * bh + 0.7, bw - 1.4, bh - 1.4); } }
  else if (kind === 'concrete') { for (let i = 0; i < 1500; i++) { x.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '90,90,90'},${rnd() * 0.12})`; x.fillRect(rnd() * N, rnd() * N, 1.5, 1.5); } x.strokeStyle = 'rgba(70,70,70,.45)'; x.lineWidth = 0.7; x.strokeRect(0.5, 0.5, N - 1, N - 1); x.beginPath(); x.moveTo(N / 2, 0); x.lineTo(N / 2, N); x.stroke(); }
  else { for (let i = 0; i < (kind === 'gravel' ? 2600 : 1800); i++) { const v = rnd(); x.fillStyle = kind === 'gravel' ? `rgba(${v < 0.5 ? '235,225,200' : '120,105,80'},${0.15 + rnd() * 0.3})` : `rgba(${v < 0.5 ? '170,140,100' : '70,50,30'},${0.12 + rnd() * 0.25})`; x.beginPath(); x.arc(rnd() * N, rnd() * N, 0.5 + rnd() * (kind === 'gravel' ? 1.4 : 2.2), 0, 7); x.fill(); } }
  return SFP[kind] = c; }
function asphaltPat(g, k) { // tekstura asfaltu: ziarno + plamy, kafel zakotwiczony w metrach (skaluje sie z zoomem)
  if (!ASPT) { const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N); let sd = 7; const rnd = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < N * N; i++) { const r0 = rnd(), v = 103 + (rnd() - 0.5) * 18 + (r0 < 0.035 ? 26 + rnd() * 30 : 0) - (r0 > 0.975 ? 18 : 0); im.data[i * 4] = v; im.data[i * 4 + 1] = v + 3; im.data[i * 4 + 2] = v + 8; im.data[i * 4 + 3] = 255; } /* kolor jak asfalt na ortofotomapie (Geoportal): sredni szary z chlodnym odcieniem, jasne ziarna kruszywa i ciemne pory */
    x.putImageData(im, 0, 0);
    for (let q = 0; q < 26; q++) { const px = rnd() * N, py = rnd() * N, r = 14 + rnd() * 34, a = (rnd() - 0.5) * 0.09; for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) { const gr = x.createRadialGradient(px + dx, py + dy, 0, px + dx, py + dy, r), col = a > 0 ? '255,255,255' : '0,0,0'; gr.addColorStop(0, 'rgba(' + col + ',' + Math.abs(a) + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)'); x.fillStyle = gr; x.fillRect(px + dx - r, py + dy - r, 2 * r, 2 * r); } }
    ASPT = c; }
  const p = g.createPattern(ASPT, 'repeat'), o = w2s([0, 0]), sc = k / 40; try { p.setTransform(new DOMMatrix([sc, 0, 0, sc, o[0], o[1]])); } catch (e) {} return p;
}
let EDGE_C = null, EDGE_PEND = null, SM_C = null;
function pipN(pt, P) { if (!P || P.length < 3) return false; let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; } /* punkt w wielokacie wezla */
function drawGroup(g, ly) {
  const k = S.view.k; g.lineJoin = 'round'; const PAT = asphaltPat(g, k) || '#7c8083'; const Lp = L.polys.filter(q => (q.ly | 0) === ly), Lg = L.gores.filter(q => (q.ly | 0) === ly), Ll = L.lines.filter(q => (q.ly | 0) === ly), La = L.arrows.filter(q => (q.ly | 0) === ly);
  if (ly > 0) for (const q of Lp) if (q.br && q.P.length > 2) { /* cien mostu rzucony na nizsze warstwy: rozmyty, przesuniety w dol-prawo (slonce z lewej-gory), z ciemniejszym rdzeniem przy krawedzi */
    g.save(); g.lineJoin = 'round'; { /* cien tylko miedzy poprzecznymi koncami mostu: nie zachodzi na drogi dojazdowe (asfalt jednolity przy wjezdach) */ const A0 = q.L[0], B0 = q.R[0], A1 = q.L[q.L.length - 1], B1 = q.R[q.R.length - 1], n0 = [B0[0] - A0[0], B0[1] - A0[1]], n1 = [B1[0] - A1[0], B1[1] - A1[1]], l0 = Math.hypot(n0[0], n0[1]) || 1, l1 = Math.hypot(n1[0], n1[1]) || 1, W = 60, m0 = [(A0[0] + B0[0]) / 2, (A0[1] + B0[1]) / 2], m1 = [(A1[0] + B1[0]) / 2, (A1[1] + B1[1]) / 2]; pathOf(g, [[m0[0] - n0[0] / l0 * W, m0[1] - n0[1] / l0 * W], [m0[0] + n0[0] / l0 * W, m0[1] + n0[1] / l0 * W], [m1[0] + n1[0] / l1 * W, m1[1] + n1[1] / l1 * W], [m1[0] - n1[0] / l1 * W, m1[1] - n1[1] / l1 * W]], true); g.clip(); } for (const [dx, dy, bl, al] of [[2.6, 3.2, 1.6, 0.20], [1.2, 1.5, 0.7, 0.22]]) { g.save(); try { g.filter = 'blur(' + Math.max(0.5, bl * k) + 'px)'; } catch (e) {} g.translate(dx * k, dy * k); pathOf(g, q.P, true); g.fillStyle = 'rgba(8,10,14,' + al + ')'; g.fill(); g.restore(); } g.restore(); } // cień wiaduktu na niższych drogach
  if (!(window.__smooth || window.__nodeGeom)) { g.lineCap = 'butt'; g.lineJoin = 'round'; for (const [col, wd] of [['#6f716c', 0.84], ['#c4c6c0', 0.68]]) { g.strokeStyle = col; g.lineWidth = Math.max(1.5, wd * k); for (const q of Lp) if (q.P.length > 2 && q.kerb !== false) for (const E of [q.L, q.R]) { pathOf(g, E, false); g.stroke(); } } } /* najpierw wszystkie ciemne obrysy, potem jasne: bez szwow na zlaczach segmentow */ // krawezniki: waski jasny pasek na zewnatrz konturu (wnetrze przykrywa jezdnia)
  if (!(window.__smooth || window.__nodeGeom)) { // asfalt jezdni: jeden wspolny obrys (jednolita powierzchnia bez szwow miedzy jezdniami); kierunek obrysow ujednolicony, zeby nakladajace sie nie wycinaly dziur
    g.beginPath(); let any = false; for (const q of Lp) if (q.P.length > 2) { let P = q.P.map(w2s), ar = 0; for (let i = 0; i < P.length; i++) { const a2 = P[i], b2 = P[(i + 1) % P.length]; ar += a2[0] * b2[1] - b2[0] * a2[1]; } if (ar < 0) P = P.reverse(); P.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); any = true; }
    if (any) { g.fillStyle = g.strokeStyle = '#7c8083'; g.lineWidth = 1; g.fill('nonzero'); g.fillStyle = PAT; g.fill('nonzero'); g.lineJoin = 'round'; g.lineWidth = Math.max(2.5, 0.3 * k); g.strokeStyle = '#7c8083'; g.stroke(); g.strokeStyle = PAT; g.stroke(); } /* obrys zakrywa waskie szczeliny miedzy sasiednimi jezdniami */
  }
  const UN = !window.__noUnion && Lp.some(q => q.ed);
  if (UN) { /* biala krawedz z wspolnego obrysu asfaltu (ciagla i plynna na zlaczach): maska sumy jezdni, erozja przez przesuniecia, pas = maska minus erozja */
    const cw = g.canvas.width, ch = g.canvas.height, mk = () => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; };
    EDGE_C = EDGE_C || [mk(), mk(), mk(), mk(), mk()]; for (const c of EDGE_C) if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const [M, E, Bd, E2, L2] = EDGE_C, mg = M.getContext('2d'), eg = E.getContext('2d'), bg = Bd.getContext('2d'), tr = g.getTransform(), dp = tr.a;
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, cw, ch); mg.setTransform(tr); mg.beginPath();
    for (const q of Lp) if (q.P.length > 2 && q.ed) { let P = q.P.map(w2s), ar = 0; for (let i = 0; i < P.length; i++) { const a2 = P[i], b2 = P[(i + 1) % P.length]; ar += a2[0] * b2[1] - b2[0] * a2[1]; } if (ar < 0) P = P.reverse(); P.forEach((p, i) => i ? mg.lineTo(p[0], p[1]) : mg.moveTo(p[0], p[1])); mg.closePath(); }
    mg.fillStyle = mg.strokeStyle = '#fff'; mg.fill('nonzero'); mg.lineJoin = 'round'; mg.lineWidth = Math.max(2.5, 0.3 * k); mg.stroke(); /* jak asfalt: zamyka waskie szczeliny miedzy sasiednimi poligonami */
    if ((window.__smooth || window.__nodeGeom)) { /* gladkie rogi: maska sumy rozmyta i uciete progiem (zaokraglenie ~0,2 m), asfalt/krawezniki/linia ze wspolnej maski */
      if (!document.getElementById('smBlur')) { const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('width', 0); sv.setAttribute('height', 0); sv.style.position = 'absolute'; sv.innerHTML = ['smBlur:50:-25', 'smKd:20:-4', 'smKl:20:-4'].map(x => { const [id, sl, ic] = x.split(':'); return '<filter id="' + id + '" color-interpolation-filters="sRGB" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur id="' + id + 'G" stdDeviation="2"/><feComponentTransfer><feFuncA type="linear" slope="' + sl + '" intercept="' + ic + '"/></feComponentTransfer></filter>'; }).join(''); document.body.appendChild(sv); }
      SM_C = SM_C || [mk(), mk(), mk()]; for (const c of SM_C) if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
      const ppm = k * dp, ps = (id, px) => document.getElementById(id + 'G').setAttribute('stdDeviation', Math.max(0.3, px)), [T1, T2, T3] = SM_C, t1 = T1.getContext('2d'), t2 = T2.getContext('2d'), t3 = T3.getContext('2d');
      { /* domkniecie maski (dylatacja, potem erozja kolem ~0,8 m, kilka malych krokow): wcieca/schodki krawedzi zalane na zewnatrz, proste krawedzie i duze wyspy bez zmian */
        const NS = 4, sp = (window.__smC || 1.3) / NS * ppm; let cur = M; const O = [t2, t3], OC = [T2, T3]; let bi = 0;
        const stepD = (src, dil) => { const t = O[bi], c = OC[bi]; bi ^= 1; t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, cw, ch); if (dil) { for (let q = 0; q < 12; q++) { const an = q * Math.PI / 6; t.drawImage(src, Math.cos(an) * sp, Math.sin(an) * sp); } } else { t.drawImage(src, 0, 0); t.globalCompositeOperation = 'destination-in'; for (let q = 0; q < 12; q++) { const an = q * Math.PI / 6; t.drawImage(src, Math.cos(an) * sp, Math.sin(an) * sp); } } return c; };
        for (let q = 0; q < NS; q++) cur = stepD(cur, true); for (let q = 0; q < NS; q++) cur = stepD(cur, false);
        mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, cw, ch); mg.drawImage(cur, 0, 0); }
      t1.setTransform(1, 0, 0, 1, 0, 0); t1.clearRect(0, 0, cw, ch); ps('smBlur', (window.__smS || 0.4) * ppm); t1.filter = 'url(#smBlur)'; t1.drawImage(M, 0, 0); t1.filter = 'none';
      mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, cw, ch); mg.drawImage(T1, 0, 0); mg.setTransform(tr); /* M = wygladzona maska */
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      for (const [id, col, dm] of [['smKd', '#6f716c', 0.42], ['smKl', '#c4c6c0', 0.34]]) { ps(id, dm * ppm / 0.84); t2.setTransform(1, 0, 0, 1, 0, 0); t2.globalCompositeOperation = 'source-over'; t2.clearRect(0, 0, cw, ch); t2.filter = 'url(#' + id + ')'; t2.drawImage(M, 0, 0); t2.filter = 'none'; t2.globalCompositeOperation = 'source-in'; t2.fillStyle = col; t2.fillRect(0, 0, cw, ch); g.drawImage(T2, 0, 0); }
      t3.setTransform(1, 0, 0, 1, 0, 0); t3.globalCompositeOperation = 'source-over'; t3.clearRect(0, 0, cw, ch); t3.drawImage(M, 0, 0); t3.globalCompositeOperation = 'source-in'; t3.setTransform(tr); t3.fillStyle = PAT; t3.fillRect(-1e5, -1e5, 2e5, 2e5); t3.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(T3, 0, 0); g.restore(); }
    const d = Math.max(1.2, 0.2 * k * dp); /* grubosc paska [px urzadzenia] = 0,2 m jak linia ciagla */
    eg.setTransform(1, 0, 0, 1, 0, 0); eg.globalCompositeOperation = 'source-over'; eg.clearRect(0, 0, cw, ch); eg.drawImage(M, 0, 0); eg.globalCompositeOperation = 'destination-in';
    for (let q = 0; q < 12; q++) { const an = q * Math.PI / 6; eg.drawImage(M, Math.round(Math.cos(an) * d), Math.round(Math.sin(an) * d)); }
    bg.setTransform(1, 0, 0, 1, 0, 0); bg.globalCompositeOperation = 'source-over'; bg.clearRect(0, 0, cw, ch); bg.drawImage(M, 0, 0); bg.globalCompositeOperation = 'destination-out'; bg.drawImage(E, 0, 0); bg.globalCompositeOperation = 'source-in'; bg.fillStyle = '#f2f2f2'; bg.fillRect(0, 0, cw, ch);
    { /* krawedzie wewnatrz sumy (np. miedzy sasiednimi jezdniami): zostaja tylko tam, gdzie leza dalej niz 0,5 m od obrysu */
      const e2 = E2.getContext('2d'), l2 = L2.getContext('2d'), d2 = Math.max(2, 0.5 * k * dp);
      e2.setTransform(1, 0, 0, 1, 0, 0); e2.globalCompositeOperation = 'source-over'; e2.clearRect(0, 0, cw, ch); e2.drawImage(M, 0, 0); e2.globalCompositeOperation = 'destination-in';
      for (let q = 0; q < 12; q++) { const an = q * Math.PI / 6; e2.drawImage(M, Math.round(Math.cos(an) * d2), Math.round(Math.sin(an) * d2)); }
      l2.setTransform(1, 0, 0, 1, 0, 0); l2.globalCompositeOperation = 'source-over'; l2.clearRect(0, 0, cw, ch); l2.setTransform(tr); l2.lineCap = 'butt'; l2.lineJoin = 'round'; l2.strokeStyle = '#f2f2f2'; l2.lineWidth = Math.max(1, LS.p2.w * k);
      for (const l of Ll) if (l.st === 'p2' && !l.noInt) { if ((window.__smooth || window.__nodeGeom)) continue; if ((window.__smooth || window.__nodeGeom)) { let tl = 0; for (let z = 1; z < l.P.length; z++) tl += Math.hypot(l.P[z][0] - l.P[z - 1][0], l.P[z][1] - l.P[z - 1][1]); if (tl < 2) continue; } pathOf(l2, l.P, false); l2.stroke(); }
      l2.setTransform(1, 0, 0, 1, 0, 0); l2.globalCompositeOperation = 'destination-in'; l2.drawImage(E2, 0, 0); bg.globalCompositeOperation = 'source-over'; bg.drawImage(L2, 0, 0); }
    EDGE_PEND = Bd; }
  for (const q of Lp) if (q.P.length > 2) { if (ly > 0 && q.br) { g.lineCap = 'butt'; g.lineJoin = 'round'; for (const E of [q.L, q.R]) { /* dzwigar/fasada pomostu widoczna od spodu */ g.save(); g.translate(0.5 * k, 0.65 * k); pathOf(g, E, false); g.strokeStyle = '#43474d'; g.lineWidth = Math.max(2.5, 0.95 * k); g.stroke(); g.translate(-0.22 * k, -0.28 * k); pathOf(g, E, false); g.strokeStyle = '#8d9197'; g.lineWidth = Math.max(1.5, 0.38 * k); g.stroke(); g.restore(); /* barierki mostu: betonowy parapet 3D: cien rzucony na jezdnie, ciemna sciana boczna, jasny wierzch z listwa swiatla i slupki */ const sh = 0.55 * k; g.save(); g.translate(sh * 0.7, sh * 0.8); pathOf(g, E, false); g.strokeStyle = 'rgba(10,12,16,.32)'; g.lineWidth = Math.max(2.5, 0.75 * k); g.stroke(); g.restore(); pathOf(g, E, false); g.strokeStyle = '#6b6f75'; g.lineWidth = Math.max(2.5, 0.72 * k); g.stroke(); g.save(); g.translate(-0.07 * k, -0.09 * k); pathOf(g, E, false); g.strokeStyle = '#b4b8bd'; g.lineWidth = Math.max(1.5, 0.5 * k); g.stroke(); pathOf(g, E, false); g.strokeStyle = '#e4e6e9'; g.lineWidth = Math.max(1, 0.2 * k); g.stroke(); g.restore(); g.save(); pathOf(g, E, false); g.setLineDash([Math.max(1, 0.18 * k), Math.max(3, 4 * k)]); g.strokeStyle = '#555960'; g.lineWidth = Math.max(2.5, 0.74 * k); g.stroke(); g.restore(); } } }
  if (EDGE_PEND) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(EDGE_PEND, 0, 0); g.restore(); EDGE_PEND = null; }
  for (const q of Lg) { pathOf(g, q.poly, true); g.fillStyle = g.strokeStyle = '#7c8083'; g.lineWidth = 1; g.fill(); g.fillStyle = PAT; g.fill(); g.stroke(); }
  for (const q of Lg) if (q.cap) { g.strokeStyle = '#c9cdd2'; g.lineWidth = Math.max(1.5, 0.7 * k); g.lineCap = 'butt'; pathOf(g, q.cap, false); g.stroke(); } // koniec wyspy: krawężnik łączy się z krawężnikami jezdni
  const line = (P, st, col) => {
    const sty = LS[st] || LS.p1, one = Q => { pathOf(g, Q, false); g.setLineDash(sty.dash ? sty.dash.map(v => v * k) : []); g.lineWidth = Math.max(1, sty.w * k); g.strokeStyle = col || '#f2f2f2'; g.lineCap = 'butt'; g.stroke(); g.setLineDash([]); };
    if (sty.dbl) { one(offsetPts(P, -sty.dbl)); one(offsetPts(P, sty.dbl)); } else one(P);
  };
  for (const l of Ll) { if (UN && l.st === 'p2') continue; line(l.P, l.st); }
  for (const q of Lg) {
    if (!q.nl) { line(q.A, 'p2'); line(q.B, 'p2'); }
    for (const e of q.extra || []) line(e, 'p2');
    if (q.chev.length) { g.save(); pathOf(g, q.clip || q.A.concat(q.B.slice().reverse()), true); g.clip(); }
    for (const c of q.chev) {
      pathOf(g, c, false); g.strokeStyle = '#f2f2f2'; g.lineWidth = Math.max(1.5, 0.4 * k); g.lineJoin = 'miter'; g.lineCap = 'butt'; g.stroke(); g.lineJoin = 'round';
    }
    if (q.chev.length) g.restore();
  }
  for (const a of La) { const p = w2s([a.x, a.y]); g.save(); g.translate(p[0], p[1]); g.rotate((a.rot - 90) * Math.PI / 180); const sc = 5 * k / 48; g.scale(sc, sc); g.translate(-24, -16); glyph(g, a.type); g.restore(); }
}
function cutClip(ri, kk) { /* sciezka (evenodd): wszystko poza prostokatami za granicami wezlow, ale tylko dla ramion drogi ri */
  const out = [];
  for (const nv of S.nodeViz || []) (nv.mini ? [] : nv.cuts || []).forEach((c, j) => { if (!c || !nv.lanes[j] || nv.lanes[j].ri !== ri) return; const wd = Math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1]), mid = [(c[1][0] + c[2][0]) / 2, (c[1][1] + c[2][1]) / 2]; let u = wd > 1e-6 ? [(c[2][1] - c[1][1]) / wd, -(c[2][0] - c[1][0]) / wd] : nv.lanes[j].u; if ((mid[0] - nv.o[0]) * u[0] + (mid[1] - nv.o[1]) * u[1] < 0) u = [-u[0], -u[1]]; /* prostopadle do granicy (droga moze skrecac przy wezle), od wezla na zewnatrz */
    const E1 = w2s(c[1]), E2 = w2s(c[2]), Lp = Math.max(1, (mid[0] - nv.o[0]) * u[0] + (mid[1] - nv.o[1]) * u[1] + 0.4 + wd) * kk, ex = E2[0] - E1[0], ey = E2[1] - E1[1], el = Math.hypot(ex, ey) || 1, wx = ex / el * kk * (0.4 + wd * 0.5), wy = ey / el * kk * (0.4 + wd * 0.5), F1 = [E1[0] - wx, E1[1] - wy], F2 = [E2[0] + wx, E2[1] + wy], ov = 0.12 * kk, G1 = [F1[0] - u[0] * ov, F1[1] - u[1] * ov], G2 = [F2[0] - u[0] * ov, F2[1] - u[1] * ov]; const cp = new Path2D(); cp.rect(-1e5, -1e5, 2e5, 2e5); cp.moveTo(G1[0], G1[1]); cp.lineTo(G2[0], G2[1]); cp.lineTo(F2[0] - u[0] * Lp, F2[1] - u[1] * Lp); cp.lineTo(F1[0] - u[0] * Lp, F1[1] - u[1] * Lp); cp.closePath(); out.push(cp); }); /* osobna sciezka na kazdy koniec: nakladajace sie prostokaty (krotka droga miedzy bliskimi wezlami) nie znosza sie w evenodd */
  return out; }
function busLanes(ri, NL) { /* pasy autobusowe z tagow OSM (+ zmiany w edytorze): bus:lanes / psv:lanes (:forward/:backward), lanes:bus / lanes:psv, busway; indeksy pasow od lewej krawedzi jezdni */
  const r = S.doc.road[ri], out = new Set(); if (!r) return out; const w = r.osm && S.osm.ways.get(r.osm), t = Object.assign({}, (w && w.t) || {}, r.tg || {}), ow = !!r.oneway, nb = ow ? 0 : NL - (r.nf || 1), nf = NL - nb, isB = v => /^(designated|only|yes_designated)$/.test(String(v || '').trim());
  const tok = (k1, k2) => { const v = t[k1] || t[k2]; return v ? String(v).split('|') : null; };
  const fw = ow ? tok('bus:lanes', 'psv:lanes') || tok('bus:lanes:forward', 'psv:lanes:forward') : tok('bus:lanes:forward', 'psv:lanes:forward'), bw = ow ? null : tok('bus:lanes:backward', 'psv:lanes:backward');
  if (fw && fw.length === nf) fw.forEach((v, i) => { if (isB(v)) out.add(nb + i); }); if (bw && bw.length === nb) bw.forEach((v, i) => { if (isB(v)) out.add(nb - 1 - i); });
  const cnt = k => parseInt(t[k], 10) || 0, nF = ow ? cnt('lanes:bus') || cnt('lanes:psv') || cnt('lanes:bus:forward') || cnt('lanes:psv:forward') : cnt('lanes:bus:forward') || cnt('lanes:psv:forward'), nB = ow ? 0 : cnt('lanes:bus:backward') || cnt('lanes:psv:backward');
  for (let i = 0; i < Math.min(nF, nf); i++) out.add(NL - 1 - i); for (let i = 0; i < Math.min(nB, nb); i++) out.add(i);
  const bwy = k => String(t[k] || '') === 'lane'; if (bwy('busway:right') || bwy('busway:both') || (ow && bwy('busway'))) out.add(NL - 1); if (bwy('busway:left') || bwy('busway:both')) out.add(0);
  if (out.size >= NL && NL > 0 && !/^(busway|bus_guideway)$/.test(r.hw || '')) { /* wszystkie pasy autobusowe na zwyklej drodze: zostaw tak jak w tagach */ }
  return out; }
function nodeHole(ri) { /* sciezka (evenodd): wszystko poza wielokatami wezlow, do ktorych dochodzi droga ri - czesc drogi zalamanej w wezle nie wystaje z wezla */
  const cp = new Path2D(); cp.rect(-1e5, -1e5, 2e5, 2e5);
  const out = []; for (const nv of S.nodeViz || []) { if (nv.mini) continue; const ms = (nv.lanes || []).filter(m => m.ri === ri); if (!ms.length) continue; const cp = new Path2D(); cp.rect(-1e5, -1e5, 2e5, 2e5); nv.poly.forEach((q, i) => { const w = w2s(q); i ? cp.lineTo(w[0], w[1]) : cp.moveTo(w[0], w[1]); }); cp.closePath(); out.push(cp);
    if (ms.length === 1) { const u = ms[0].u, n = [-u[1], u[0]], o = nv.o, hw = (ms[0].h || 2) + 1.5, dp = 2 * (ms[0].h || 2) + 3, hp = new Path2D(); hp.rect(-1e5, -1e5, 2e5, 2e5); [[hw, -0.02], [-hw, -0.02], [-hw, -dp], [hw, -dp]].forEach((d, i) => { const w = w2s([o[0] + n[0] * d[0] + u[0] * d[1], o[1] + n[1] * d[0] + u[1] * d[1]]); i ? hp.lineTo(w[0], w[1]) : hp.moveTo(w[0], w[1]); }); hp.closePath(); out.push(hp); } /* tylko maly prostokat tuz za srodkiem wezla (nie cala polplaszczyzna: droga moze wracac petla do innego wezla) */
    (nv.cuts || []).forEach((c, j) => { const m = nv.lanes[j]; if (!c || !m || m.ri === ri) return; const u = m.u, n = [-u[1], u[0]], mid = [(c[1][0] + c[2][0]) / 2, (c[1][1] + c[2][1]) / 2], hw = Math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1]) / 2 + 0.05, b0 = [mid[0] + u[0] * 0.02, mid[1] + u[1] * 0.02], xp = new Path2D(); xp.rect(-1e5, -1e5, 2e5, 2e5); [[hw, 0], [-hw, 0], [-hw, 2 * hw + 1], [hw, 2 * hw + 1]].forEach((d, i) => { const w = w2s([b0[0] + n[0] * d[0] + u[0] * d[1], b0[1] + n[1] * d[0] + u[1] * d[1]]); i ? xp.lineTo(w[0], w[1]) : xp.moveTo(w[0], w[1]); }); xp.closePath(); out.push(xp); }); } /* koniec drogi nie wystaje za srodek wezla ani za granice innych ramion */
  return out; }
let CYPT = null;
function cyclePat(g, k) { /* tekstura czerwonej nawierzchni dróg rowerowych: ziarno, jasne kruszywo, ciemne pory, delikatne plamy; kafel zakotwiczony w metrach */
  if (!CYPT) { const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N); let sd = 11; const rnd = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < N * N; i++) { const r0 = rnd(), v = (rnd() - 0.5) * 22 + (r0 < 0.03 ? 22 + rnd() * 26 : 0) - (r0 > 0.98 ? 24 : 0); im.data[i * 4] = 190 + v; im.data[i * 4 + 1] = 86 + v * 0.7; im.data[i * 4 + 2] = 76 + v * 0.6; im.data[i * 4 + 3] = 255; }
    x.putImageData(im, 0, 0); for (let q = 0; q < 22; q++) { const px = rnd() * N, py = rnd() * N, r = 12 + rnd() * 30, a = (rnd() - 0.5) * 0.12; for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) { const gr = x.createRadialGradient(px + dx, py + dy, 0, px + dx, py + dy, r), col = a > 0 ? '255,235,225' : '70,10,5'; gr.addColorStop(0, 'rgba(' + col + ',' + Math.abs(a) + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)'); x.fillStyle = gr; x.fillRect(px + dx - r, py + dy - r, 2 * r, 2 * r); } }
    CYPT = c; }
  const p = g.createPattern(CYPT, 'repeat'), o = w2s([0, 0]), sc = k / 40; try { p.setTransform(new DOMMatrix([sc, 0, 0, sc, o[0], o[1]])); } catch (e) {} return p;
}
function drawBikeI(g, cx, cy, s, col) { const r = s * 0.2, lx = cx - s * 0.28, rx = cx + s * 0.28, wy = cy + s * 0.1; g.strokeStyle = col; g.lineWidth = Math.max(0.4, s * 0.07); g.beginPath(); g.arc(lx, wy, r, 0, 7); g.moveTo(rx + r, wy); g.arc(rx, wy, r, 0, 7); g.stroke(); g.beginPath(); g.moveTo(lx, wy); g.lineTo(cx - s * 0.02, wy); g.lineTo(cx + s * 0.16, cy - s * 0.16); g.lineTo(cx - s * 0.12, cy - s * 0.16); g.lineTo(lx, wy); g.moveTo(cx - s * 0.02, wy); g.lineTo(cx - s * 0.15, cy - s * 0.24); g.moveTo(cx - s * 0.21, cy - s * 0.24); g.lineTo(cx - s * 0.08, cy - s * 0.24); g.moveTo(rx, wy); g.lineTo(cx + s * 0.14, cy - s * 0.27); g.lineTo(cx + s * 0.23, cy - s * 0.29); g.stroke(); }
function drawWalkerI(g, cx, cy, s, col) { g.fillStyle = col; g.strokeStyle = col; g.lineWidth = Math.max(0.4, s * 0.11); g.beginPath(); g.arc(cx + s * 0.04, cy - s * 0.36, s * 0.12, 0, 7); g.fill(); g.beginPath(); g.moveTo(cx, cy - s * 0.2); g.lineTo(cx - s * 0.04, cy + s * 0.1); g.lineTo(cx - s * 0.2, cy + s * 0.4); g.moveTo(cx - s * 0.04, cy + s * 0.1); g.lineTo(cx + s * 0.16, cy + s * 0.4); g.moveTo(cx - s * 0.2, cy - s * 0.02); g.lineTo(cx, cy - s * 0.16); g.lineTo(cx + s * 0.18, cy); g.stroke(); }
function drawSignC(g, cls, x, y, size) { /* C-13 (droga dla rowerow) i C-13/16 (ciag pieszo-rowerowy) jak w index.html */ g.save(); g.translate(x - size / 2, y - size / 2); g.scale(size / 22, size / 22); g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); g.arc(11, 11, 10, 0, 7); g.fillStyle = '#1659c7'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke(); if (cls === 'ciag') { g.beginPath(); g.moveTo(2.5, 11); g.lineTo(19.5, 11); g.lineWidth = 1.2; g.stroke(); drawWalkerI(g, 11, 6.8, 7, '#fff'); drawBikeI(g, 11, 15.2, 10, '#fff'); } else drawBikeI(g, 11, 11.5, 14, '#fff'); g.restore(); }
function drawCycle(kk, aC, LY) { /* czerwone pasy i drogi rowerowe: (1) osobne drogi (highway=cycleway) z danych OSM, (2) pasy / drogi przy jezdni z tagow cycleway:left|right|both = lane|track; na czerwieni biale rowerki */
  const RED = '#c4584e', a = s2w([0, 0]), b = s2w([W, H]), mg = 25, x0 = Math.min(a[0], b[0]) - mg, x1 = Math.max(a[0], b[0]) + mg, y0 = Math.min(a[1], b[1]) - mg, y1 = Math.max(a[1], b[1]) + mg, marks = [], signsC = [];
  const pathOf2 = P => { ctx.beginPath(); P.forEach((q, i) => { const w = w2s(q); i ? ctx.lineTo(w[0], w[1]) : ctx.moveTo(w[0], w[1]); }); };
  const addMarks = (P, step, w, dir) => { if (kk < 5 || w * kk < 7) return; const cm = cumOf(P), L0 = cm[cm.length - 1]; for (let sv = Math.min(12, L0 / 2); sv < L0 - 4; sv += step) { let z = 1; while (z < cm.length - 1 && cm[z] < sv) z++; const f = (sv - cm[z - 1]) / ((cm[z] - cm[z - 1]) || 1), A = P[z - 1], B = P[z], p = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]; if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) continue; marks.push({ p, ang: Math.atan2(B[1] - A[1], B[0] - A[0]), w, dir }); } };
  const cycEnds = new Map(), axisHW = new Map(); /* konce drog rowerowych: gdy koniec lezy na osi jezdni i nikt po drugiej stronie nie kontynuuje, to dojazd (przycinamy do krawedzi jezdni); gdy kontynuuje, to przejazd przez cala jezdnie */
  for (const o of S.osm.ways.values()) if (o.t && isCycW(o.t) && o.nk && o.nk.length > 1) for (const k of [o.nk[0], o.nk[o.nk.length - 1]]) cycEnds.set(k, (cycEnds.get(k) || 0) + 1);
  if (cycEnds.size) { S.doc.road.forEach(rd => { const hwd = rw(rd) / 2; rd.nk.forEach(k => { if (k && cycEnds.has(k)) axisHW.set(k, Math.max(axisHW.get(k) || 0, hwd)); }); }); for (const o of S.osm.ways.values()) { if (!o.t || isCycW(o.t) || !OKHW.has((o.t.highway || '').replace('_link', '')) || !o.nk) continue; for (const k of o.nk) if (cycEnds.has(k) && !axisHW.has(k)) axisHW.set(k, (LW_CLASS[(o.t.highway || '').replace('_link', '')] || 3) * Math.max(1, parseInt(o.t.lanes, 10) || 2) / 2); } }
  const axisAt = kn => { const us = []; S.doc.road.forEach((rd, ri) => { if (!rd.osm || rd.pts.length < 2) return; const n = rd.nk.length; for (let j = 0; j < n; j++) { if (rd.nk[j] !== kn) continue; for (const dj of [1, -1]) { const b = rd.pts[j + dj], a = rd.pts[j]; if (!b) continue; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; us.push({ ri, u: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] }); } } }); let best = null, bd = 1; for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) { const d = us[i].u[0] * us[j].u[0] + us[i].u[1] * us[j].u[1]; if (d < bd) { bd = d; best = [us[i], us[j]]; } } if (!best || bd > -0.6) return null; return { tg: [best[1].u[0] - best[0].u[0], best[1].u[1] - best[0].u[1]], main: new Set([best[0].ri, best[1].ri]) }; }; /* os jezdni glownej w wezle: dwa przeciwne kierunki (takze gdy jezdnia jest podzielona w tym wezle) */
  const sameSide = new Map(); /* konce drog rowerowych na osi jezdni: gdy wszystkie dochodza z tej samej strony jezdni (V), to zadna nie przechodzi na druga strone - kazda konczy sie na krawedzi jezdni */
  if (cycEnds.size) { const sides = new Map(); for (const o of S.osm.ways.values()) { if (!o.t || !isCycW(o.t) || !o.nk || o.nk.length < 2 || !o.g) continue; for (const [kk2, a, b] of [[o.nk[0], o.g[0], o.g[1]], [o.nk[o.nk.length - 1], o.g[o.g.length - 1], o.g[o.g.length - 2]]]) { if (!axisHW.has(kk2)) continue; const ax0 = axisAt(kk2), tg = ax0 && ax0.tg; if (!tg) continue; const cr = tg[0] * (b[1] - a[1]) - tg[1] * (b[0] - a[0]); (sides.get(kk2) || sides.set(kk2, []).get(kk2)).push(cr > 0 ? 1 : -1); } } for (const [kk2, arr] of sides) if (arr.length >= 2 && arr.every(v => v === arr[0])) sameSide.set(kk2, true); }
  const trimPoly = (D, a0, b0) => { const cm = cumOf(D), L0 = cm[cm.length - 1]; if (a0 + b0 >= L0 - 0.5) return []; const at = sv => { let z = 1; while (z < cm.length - 1 && cm[z] < sv) z++; const f = (sv - cm[z - 1]) / ((cm[z] - cm[z - 1]) || 1); return [D[z - 1][0] + (D[z][0] - D[z - 1][0]) * f, D[z - 1][1] + (D[z][1] - D[z - 1][1]) * f]; }; const out = [at(a0)]; for (let z = 0; z < D.length; z++) if (cm[z] > a0 + 0.05 && cm[z] < L0 - b0 - 0.05) out.push(D[z]); out.push(at(L0 - b0)); return out; };
  ctx.save(); ctx.globalAlpha = aC * (LY != null && LY < 0 ? 0.5 : 1); ctx.strokeStyle = cyclePat(ctx, kk) || RED; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; /* okragle konce: bez prześwitu na stykach odcinkow */
  for (const o of S.osm.ways.values()) { const t = o.t || {}; if (!isCycW(t) || !o.g || o.g.length < 2) continue; if (LY != null && layerOf(t) !== LY) continue; /* warstwa (layer / most / tunel): droga rowerowa pod mostem rysowana pod nim */ let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9; for (const q of o.g) { if (q[0] < bx0) bx0 = q[0]; if (q[0] > bx1) bx1 = q[0]; if (q[1] < by0) by0 = q[1]; if (q[1] > by1) by1 = q[1]; } if (bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1) continue;
    const icl = infraCls(t)[0] || { cls: 'droga', dir: 0 }, w = parseFloat(String(t.width || '').replace(',', '.')) || (icl.cls === 'przejazd' ? 2.4 : icl.cls === 'ciag' ? 2.8 : (icl.dir ? 2.0 : 2.5)); ctx.lineWidth = Math.max(1.2, w * kk); let D = dense(o.g, 2); { const k0 = o.nk && o.nk[0], k1 = o.nk && o.nk[o.nk.length - 1], c0 = axisHW.has(k0) && (cycEnds.get(k0) === 1 || sameSide.get(k0)) ? axisHW.get(k0) + 0.5 : 0, c1 = axisHW.has(k1) && (cycEnds.get(k1) === 1 || sameSide.get(k1)) ? axisHW.get(k1) + 0.5 : 0; if (c0 || c1) D = trimPoly(D, c0, c1); } if (D.length < 2) continue; pathOf2(D); ctx.stroke(); if (icl.cls === 'przejazd') { /* przejazd rowerowy P-11: biale kwadraty po bokach */ ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineCap = 'butt'; ctx.lineWidth = Math.max(1, 0.5 * kk); ctx.setLineDash([0.5 * kk, 0.5 * kk]); for (const sg of [-1, 1]) { pathOf2(offsetPts(D, D.map(() => sg * (w / 2 - 0.35)))); ctx.stroke(); } if (icl.zebra) { ctx.setLineDash([]); } ctx.restore(); } else if (icl.cls === 'ciag') { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineCap = 'butt'; ctx.lineWidth = Math.max(1, 0.12 * kk); ctx.setLineDash([1.2 * kk, 1.0 * kk]); pathOf2(D); ctx.stroke(); ctx.restore(); } else addMarks(D, 45, w, icl.dir === 2 ? 0 : icl.dir); if (icl.cls === 'ciag' || icl.cls === 'droga') { const cmD = cumOf(D), lenD = cmD[cmD.length - 1]; if (lenD >= 4) { const k2 = lenD < 20 ? 0 : Math.max(0, Math.ceil(lenD / 110) - 1), ps = lenD < 20 ? [lenD / 2] : [3].concat(Array.from({ length: k2 }, (_, i) => lenD * (i + 1) / (k2 + 1)), [lenD - 3]); for (const m of ps) signsC.push({ p: atS(D, cmD, m), cls: icl.cls }); } } }
  const lanes = []; S.doc.road.forEach((r, i) => { if (!r.osm || r.sb) return; if (LY != null && (r.ly | 0) !== LY) return; if (/^(motorway|trunk|busway)/.test(r.hw || '')) return; const t = effTags(r), rev = t.oneway === '-1', items = infraCls(t).filter(c => c.cls !== 'przejazd' && c.cls !== 'droga_ow').map(c => ({ cls: c.cls, sd: c.side === 0 ? 'C' : ((c.side > 0) !== rev ? 'R' : 'L'), dir: c.dir === 2 || c.dir === 0 ? c.dir : (rev ? -c.dir : c.dir) })); if (items.length) lanes.push({ i, items }); }); /* wszystkie klasy infrastruktury przy jezdni: pas, kontrapas, droga (track), buspas, sharrow, kontraruch */
  const strips = new Map(); /* srodki pasow wg drogi i strony (do laczenia na stykach) */
  const WSTR = { pas: 1.5, kontrapas: 1.5, droga: 2.0, buspas: 1.2, sharrow: 0.8, kontraruch: 0.8 }, CSTR = { buspas: '#9a2f2b', sharrow: 'rgba(196,88,78,.55)', kontraruch: 'rgba(196,88,78,.85)' };
  for (const ln of lanes) { let G = null; try { G = laneGeom(ln.i); } catch (e) {} if (!G || G.Q.length < 2) continue; let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9; for (const q of G.Q) { if (q[0] < bx0) bx0 = q[0]; if (q[0] > bx1) bx1 = q[0]; if (q[1] < by0) by0 = q[1]; if (q[1] > by1) by1 = q[1]; } if (bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1) continue;
    for (const it of ln.items) { const kind = it.cls, w = WSTR[kind] || 1.5, gap = kind === 'droga' ? 0.5 : 0.1, sd = it.sd; let cen; if (sd === 'C') cen = G.Q.map((_, j) => G.left[j] + G.NL * G.lw[j] / 2); else cen = G.Q.map((_, j) => sd === 'R' ? G.left[j] + G.NL * G.lw[j] + gap + w / 2 : G.left[j] - gap - w / 2); const P = offsetPts(G.Q, cen); ctx.save(); ctx.lineWidth = Math.max(1.2, w * kk); if (CSTR[kind]) ctx.strokeStyle = CSTR[kind]; if (kind === 'kontraruch') { ctx.lineCap = 'butt'; ctx.setLineDash([0.4 * kk, 1.0 * kk]); } pathOf2(P); ctx.stroke(); ctx.restore(); if (kind !== 'kontraruch') addMarks(P, 40, w, it.dir === 2 ? 0 : it.dir); strips.set(ln.i + sd, { P, w, kind }); } }
  { const endsAt = new Map(); S.doc.road.forEach((rd, i) => { if (rd.pts.length < 2) return; [[0, true], [rd.nk.length - 1, false]].forEach(([j, st]) => { const k = rd.nk[j]; if (k) (endsAt.get(k) || endsAt.set(k, []).get(k)).push({ i, st }); }); }); /* laczniki: na wspolnym wezle dwoch drog pas konczy sie na obu odcinkach w roznych punktach (przesuniecie boczne): wypelnienie klina po zewnetrznej stronie zakretu */
    for (const [, ls] of endsAt) { if (ls.length !== 2 || ls[0].i === ls[1].i) continue; const [e0, e1] = ls; for (const sd of ['R', 'L']) { const a = strips.get(e0.i + sd), sd2 = e0.st === e1.st ? (sd === 'R' ? 'L' : 'R') : sd, b = strips.get(e1.i + sd2); if (!a || !b || a.kind !== b.kind) continue; const pa = e0.st ? a.P[0] : a.P[a.P.length - 1], pb = e1.st ? b.P[0] : b.P[b.P.length - 1]; ctx.lineWidth = Math.max(1.2, Math.min(a.w, b.w) * kk); pathOf2([pa, pb]); ctx.stroke(); } } }
  { /* DDR konczace sie w wezle na osi jezdni glownej (z jednej strony) + pasy rowerowe drogi bocznej w tym wezle: prosty przejazd przez jezdnie (P-11) z kazdej DDR do pasa po tej samej stronie; bez V w osi */
    const at = (P, sv) => atS(P, cumOf(P), sv);
    for (const [kn] of sameSide) { const hwm = axisHW.get(kn); if (hwm == null) continue; const cuts = []; for (const o of S.osm.ways.values()) { if (!o.t || !isCycW(o.t) || !o.nk || o.nk.length < 2 || !o.g) continue; const st0 = o.nk[0] === kn, en0 = o.nk[o.nk.length - 1] === kn; if (!st0 && !en0) continue; const D0 = dense(o.g, 2), D = st0 ? D0 : D0.slice().reverse(); if (D.length < 2) continue; cuts.push({ o, E: at(D, hwm + 0.5), w: parseFloat(String(o.t.width || '').replace(',', '.')) || 2.4 }); }
      if (cuts.length < 2) continue;
      const axn = axisAt(kn); S.doc.road.forEach((rr, ri) => { if (!rr.osm || rr.nk.length < 2 || (axn && axn.main.has(ri))) return; const first = rr.nk[0] === kn, last = rr.nk[rr.nk.length - 1] === kn; if (!first && !last) return; for (const sd of ['L', 'R']) { const st = strips.get(ri + sd); if (!st || st.P.length < 2) continue; const P = first ? st.P : st.P.slice().reverse(), S2 = at(P, hwm + 0.5); let best = null, bd = 1e9; for (const c of cuts) { if (c.used) continue; const d = Math.hypot(c.E[0] - S2[0], c.E[1] - S2[1]); if (d < bd) { bd = d; best = c; } } if (!best || bd > 25) continue; best.used = true; const w = Math.max(st.w, 1.5); let nx = -axn.tg[1], ny = axn.tg[0]; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl; if ((best.E[0] - S2[0]) * nx + (best.E[1] - S2[1]) * ny < 0) { nx = -nx; ny = -ny; } const NN = [S2[0] + nx * 2 * (hwm + 0.5), S2[1] + ny * 2 * (hwm + 0.5)]; /* przejazd prostopadly do jezdni: od krawedzi po stronie DDR prosto do pasa; DDR dochodzi do jego poczatku */ ctx.save(); ctx.lineWidth = Math.max(1.2, w * kk); ctx.lineCap = 'butt'; pathOf2([best.E, NN]); ctx.stroke(); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.2, Math.min(w, best.w) * kk); pathOf2([best.E, NN]); ctx.stroke(); ctx.lineCap = 'butt'; ctx.lineWidth = Math.max(1.2, w * kk); pathOf2([NN, S2]); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, 0.5 * kk); ctx.setLineDash([0.5 * kk, 0.5 * kk]); for (const sg of [-1, 1]) { pathOf2(offsetPts([NN, S2], [sg * (w / 2 - 0.35), sg * (w / 2 - 0.35)])); ctx.stroke(); } ctx.restore(); } }); } }
  for (const sg of signsC) { const sp = w2s(sg.p); if (sp[0] < -30 || sp[1] < -30 || sp[0] > W + 30 || sp[1] > H + 30) continue; drawSignC(ctx, sg.cls, sp[0], sp[1], Math.max(14, Math.min(30, 2.6 * kk))); } /* znaki C-13 / C-13/16 na drogach rowerowych */
  ctx.fillStyle = ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; for (const m of marks) { const sp = w2s(m.p), sz = Math.min(1.25, 0.82 * m.w) / 1.3, ca = Math.cos(m.ang), sa = Math.sin(m.ang); /* piktogram na jezdni: rowerek z boku, os poprzecznie do pasa, przodem w prawo (jak w drodze rowerowej), nad nim strzalka kierunku */
    ctx.save(); ctx.translate(sp[0], sp[1]); ctx.rotate(m.ang + (m.dir < 0 ? Math.PI : 0) + Math.PI / 2); ctx.scale(kk * sz, kk * sz); ctx.lineWidth = 0.12; /* gora rowerka = kierunek ruchu na pasie (jak strzalka) */ ctx.beginPath(); ctx.arc(-0.55, 0, 0.3, 0, 6.2832); ctx.moveTo(0.85, 0); ctx.arc(0.55, 0, 0.3, 0, 6.2832); ctx.stroke(); ctx.lineWidth = 0.14; ctx.beginPath(); ctx.moveTo(-0.55, 0); ctx.lineTo(-0.28, -0.5); ctx.lineTo(0.36, -0.52); ctx.lineTo(0.55, 0); ctx.moveTo(-0.55, 0); ctx.lineTo(-0.02, 0); ctx.lineTo(0.36, -0.52); ctx.moveTo(-0.28, -0.5); ctx.lineTo(-0.02, 0); ctx.moveTo(0.36, -0.52); ctx.lineTo(0.30, -0.72); ctx.lineTo(0.5, -0.72); ctx.moveTo(-0.33, -0.62); ctx.lineTo(-0.1, -0.62); ctx.stroke(); ctx.restore();
    if (m.dir) { const ap = w2s([m.p[0] + m.dir * ca * 1.15 * sz, m.p[1] + m.dir * sa * 1.15 * sz]); ctx.save(); ctx.translate(ap[0], ap[1]); ctx.rotate(m.ang + (m.dir < 0 ? Math.PI : 0)); ctx.scale(kk * sz, kk * sz); ctx.lineWidth = 0.12; ctx.beginPath(); ctx.moveTo(-0.38, 0); ctx.lineTo(0.2, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0.52, 0); ctx.lineTo(0.12, -0.2); ctx.lineTo(0.12, 0.2); ctx.closePath(); ctx.fill(); ctx.restore(); } }
  ctx.restore(); }
function drawNodeDash() {
  const tkR = !document.getElementById('cNodeRend') || document.getElementById('cNodeRend').checked, tkE = tkR && S.view.k >= 1.8, tkM = tkR && S.view.k >= 2.0; /* poziomy szczegolow (k = px/m; zoom 16 ~ 0,7, 17 ~ 1,4, 18 ~ 2,9, 19 ~ 5,8): < 1,05 same kreski; od 1,05 wypelnienie jezdni; od 1,8 kraweznik i linia krawedzi; od 2,0 linie pasow; od 3 strzalki, warstwy mostow, cienie i barierki - kazdy element pojawia sie plynnie (przezroczystosc rosnie ze skala) */
  const cl01 = x => Math.max(0, Math.min(1, x)), aE = cl01((S.view.k - 1.8) / 1.4), aM = cl01((S.view.k - 2.0) / 1.4), aA = cl01((S.view.k - 3.0) / 1.5), aL = cl01((S.view.k - 3.0) / 2.0);
  if (tkR && S.view.k < 1.05 && window.__nodeGeom && L) { /* zoom <= 16: same proste kreski dróg, bez wezlow, warstw, kraweznikow i oznakowania */
    const kk0 = S.view.k, rs = []; for (let i = 0; i < S.doc.road.length; i++) { let G = null; try { G = laneGeom(i); } catch (e) {} if (!G || G.Q.length < 2) continue; const NLg = G.NL, E0 = offsetPts(G.Q, G.Q.map((_, j) => G.left[j])), E1 = offsetPts(G.Q, G.Q.map((_, j) => G.left[j] + NLg * G.lw[j])); rs.push({ ly: S.doc.road[i].ly | 0, P: E0.concat(E1.slice().reverse()) }); }
    rs.sort((a, b) => a.ly - b.ly); ctx.save(); ctx.lineJoin = 'round'; ctx.fillStyle = ctx.strokeStyle = '#6f7378'; const zz0 = Math.log2(156543.03 * Math.cos(S.org.lat * Math.PI / 180) * kk0), fz = Math.max(0, Math.min(1, (zz0 - 14) / 2.5)); ctx.lineWidth = 0.55 + 0.85 * fz - 0.5 * fz * Math.min(1, Math.max(0, (kk0 - 0.3) / 0.7)); /* obrys kreski: od 0,55 px (zoom 14) do ok. 1,4 px (zoom ~16), potem zanika, bo jezdnia ma juz wlasna szerokosc */ ctx.globalAlpha = 1;
    for (const r of rs) { const W0 = r.P.map(w2s), Wq = []; for (let z = 0; z < W0.length; z++) { const q = W0[z], l = Wq[Wq.length - 1]; if (!l || z === W0.length - 1 || Math.abs(q[0] - l[0]) + Math.abs(q[1] - l[1]) > 0.8) Wq.push(q); } /* redukcja punktow wzgledem ostatniego zachowanego (nie poprzedniego): gesta geometria zostaje, a nie sprowadza sie do cieciwy */ let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of Wq) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; } if (x1 < -4 || y1 < -4 || x0 > W + 4 || y0 > H + 4) continue;
      ctx.globalAlpha = (r.ly < 0 ? 0.45 : 1) * (0.7 + 0.3 * fz); ctx.beginPath(); Wq.forEach((q, z) => z ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.restore(); return; } /* jedna warstwa: asfalt, krawezniki, oznakowanie, strzalki */
  if (window.__nodeGeom && L && (tkR || tkE)) { /* lekki render w nowej geometrii: drogi (asfalt z tekstura, krawezniki, linie, strzalki) od granicy do granicy + wezly jako wielokat */
    const kk = S.view.k, PAT = (typeof asphaltPat === 'function' && asphaltPat(ctx, kk)) || '#676a70', fq = (list) => { ctx.beginPath(); for (const q of list) { const W = q.map(w2s); let ar = 0; for (let z = 0; z < W.length; z++) { const a = W[z], b = W[(z + 1) % W.length]; ar += a[0] * b[1] - b[0] * a[1]; } if (ar < 0) W.reverse(); W.forEach((p, z) => z ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); } ctx.fillStyle = PAT; ctx.fill(); }, pl = (P, close) => { ctx.beginPath(); P.forEach((q, i) => { const w = w2s(q); i ? ctx.lineTo(w[0], w[1]) : ctx.moveTo(w[0], w[1]); }); if (close) ctx.closePath(); };
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    const aC = cl01((kk - 2.5) / 1.5); /* warstwa rowerowa rysowana na koncu, nad drogami */
    const cp = new Path2D(); { cp.rect(-1e5, -1e5, 2e5, 2e5); for (const nv of S.nodeViz || []) (nv.mini ? [] : nv.cuts || []).forEach((c, j) => { if (!c || !nv.lanes[j]) return; const u = nv.lanes[j].u, E1 = w2s(c[1]), E2 = w2s(c[2]), Lp = Math.max(1, (c[1][0] - nv.o[0]) * u[0] + (c[1][1] - nv.o[1]) * u[1] + 0.4) * kk, ex = E2[0] - E1[0], ey = E2[1] - E1[1], el = Math.hypot(ex, ey) || 1, wx = ex / el * kk * 0.5, wy = ey / el * kk * 0.5, F1 = [E1[0] - wx, E1[1] - wy], F2 = [E2[0] + wx, E2[1] + wy]; const ov = 0.12 * kk, G1 = [F1[0] - u[0] * ov, F1[1] - u[1] * ov], G2 = [F2[0] - u[0] * ov, F2[1] - u[1] * ov]; cp.moveTo(G1[0], G1[1]); cp.lineTo(G2[0], G2[1]); cp.lineTo(F2[0] - u[0] * Lp, F2[1] - u[1] * Lp); cp.lineTo(F1[0] - u[0] * Lp, F1[1] - u[1] * Lp); cp.closePath(); }); }
    { /* maska sumy asfaltu (drogi jako czworokaty, wezly jako trojkaty) -> krawezniki i linia krawedzi z maski: jeden obrys, bez podwojnych krawezników */
      const Wd = cv.width, Hd = cv.height, PL = (window.__cvPool = window.__cvPool || []); let pi = 0; const mk = () => { let c = PL[pi]; if (!c) { c = document.createElement('canvas'); PL[pi] = c; } pi++; const g = c.getContext('2d'); if (c.width !== Wd || c.height !== Hd) { c.width = Wd; c.height = Hd; } else { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, Wd, Hd); } return c; }, M = mk(); /* plotna wielokrotnego uzytku (bez tworzenia nowych w kazdej klatce) */
      const roads = [];
      for (let i = 0; i < S.doc.road.length; i++) { let G = null; try { G = laneGeom(i); } catch (e) {} if (!G) continue; const E0 = offsetPts(G.Q, G.Q.map((_, j) => G.left[j])), E1 = offsetPts(G.Q, G.Q.map((_, j) => G.left[j] + G.NL * G.lw[j])); roads.push({ G, E0, E1, ri: i, ly: S.doc.road[i].ly | 0 }); }
      { /* koniec drogi za granica wezla: geometria drogi obcieta dokladnie na granicy (wg dlugosci luku), nie tylko prostokatem - droga skrecajaca tuz za granica nie wystaje ogonem na asfalt wezla */
        const byRi = new Map(roads.map(r => [r.ri, r])), cut = new Map();
        for (const nv of S.nodeViz || []) { if (nv.mini) continue; (nv.cuts || []).forEach((c, j) => { const m = nv.lanes && nv.lanes[j]; if (!c || !m || c.D == null) return; const r = byRi.get(m.ri); if (!r) return; const Q = r.G.Q, o0 = m.o || nv.o, side = dist(o0, Q[0]) <= dist(o0, Q[Q.length - 1]) ? 0 : 1, e = cut.get(r) || [0, 0]; e[side] = Math.max(e[side], Math.max(0, c.D - 0.12)); cut.set(r, e); }); }
        for (const [r, [ds, de]] of cut) { const cm = cumOf(r.G.Q), Lq = cm[cm.length - 1]; if (ds + de >= Lq - 0.5 || (ds < 0.2 && de < 0.2)) continue; const sub = E => { const out = []; const at = sv => { let z = 1; while (z < cm.length - 1 && cm[z] < sv) z++; const f = Math.max(0, Math.min(1, (sv - cm[z - 1]) / ((cm[z] - cm[z - 1]) || 1))); return [E[z - 1][0] + (E[z][0] - E[z - 1][0]) * f, E[z - 1][1] + (E[z][1] - E[z - 1][1]) * f]; }; out.push(ds > 0.2 ? at(ds) : E[0]); for (let z = 0; z < E.length; z++) if (cm[z] > ds + 0.05 && cm[z] < Lq - de - 0.05) out.push(E[z]); out.push(de > 0.2 ? at(Lq - de) : E[E.length - 1]); return out; }; r.E0 = sub(r.E0); r.E1 = sub(r.E1); } }
      
      const fm = (c, list, clip, sw) => { const WL = []; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of list) { const W0 = q.map(w2s), Wq = []; if (W0.length > 8) { for (let z = 0; z < W0.length; z++) { const p = W0[z], l = Wq[Wq.length - 1]; if (!l || z === W0.length - 1 || Math.abs(p[0] - l[0]) + Math.abs(p[1] - l[1]) > 0.75) Wq.push(p); } } else for (const p of W0) Wq.push(p); /* redukcja wzgledem ostatniego zachowanego punktu */ for (const p of Wq) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } WL.push(Wq); } const m = (sw || 0) + 2; if (x1 < -m || y1 < -m || x0 > W + m || y0 > H + m) return; /* poza ekranem: pomijamy */ const g2 = c.getContext('2d'); g2.save(); g2.setTransform(DPR, 0, 0, DPR, 0, 0); if (clip) { g2.beginPath(); g2.rect(Math.max(-2, x0 - m), Math.max(-2, y0 - m), Math.min(W + 4, x1 + m) - Math.max(-2, x0 - m), Math.min(H + 4, y1 + m) - Math.max(-2, y0 - m)); g2.clip(); [].concat(clip).forEach(cq => g2.clip(cq, 'evenodd')); } /* najpierw maly prostokat wokol drogi: przyciecia licza sie tylko na nim, nie na calym ekranie */ g2.beginPath(); for (const Wq of WL) { let ar = 0; for (let z = 0; z < Wq.length; z++) { const a = Wq[z], b = Wq[(z + 1) % Wq.length]; ar += a[0] * b[1] - b[0] * a[1]; } if (ar < 0) Wq.reverse(); Wq.forEach((p, z) => z ? g2.lineTo(p[0], p[1]) : g2.moveTo(p[0], p[1])); g2.closePath(); } g2.fillStyle = '#000'; g2.fill(); if (sw) { g2.strokeStyle = '#000'; g2.lineWidth = sw; g2.lineJoin = 'round'; g2.stroke(); } g2.restore(); };
      const allRoads = roads, NVL = (S.nodeViz || []).map(nv => ({ nv, ly: (() => { const ls = (nv.lanes || []).map(a => S.doc.road[a.ri] ? S.doc.road[a.ri].ly | 0 : 99).filter(v => v < 99), mn = ls.length ? Math.min(...ls) : 99, mx = ls.length ? Math.max(...ls) : 99; return mx > mn && mx > 0 && ls.filter(v => v === mx).length >= 2 ? mx : mn; })() })) /* wezel laczacy droge z mostem lezy na poziomie nizszej drogi (wjazd na most jest na ziemi); gdy co najmniej dwie jego drogi sa na moscie (skrzyzowanie na wiadukcie) - na poziomie mostu: jednolity asfalt bez 'zakonczen' mostu */, LYS = [...new Set(allRoads.map(r => r.ly).concat(NVL.map(x => x.ly)).concat([...S.osm.ways.values()].filter(o => o.t && isCycW(o.t)).map(o => layerOf(o.t))))].filter(v => v > -9).sort((a, b) => a - b);
      const SEAMS = (() => { /* jezdnie jednokierunkowe biegnace obok siebie (rampa przy jezdni glownej): szczelina < 1,6 m wypelniana asfaltem, na srodku linia pasa */
        if (window.__noSeams) return []; if (L.__seams) return L.__seams; const out = [], inf = allRoads.map(r => { const rd = S.doc.road[r.ri]; if (!rd || !rd.oneway || r.E0.length < 2) return null; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of r.E0.concat(r.E1)) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; } return { r, bb: [x0 - 2, y0 - 2, x1 + 2, y1 + 2] }; });
        const tg = (P, k) => { const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
        for (let i = 0; i < inf.length; i++) { const A0 = inf[i]; if (!A0) continue; for (let j = i + 1; j < inf.length; j++) { const B0 = inf[j]; if (!B0 || A0.r.ly !== B0.r.ly) continue; const a = A0.bb, b = B0.bb; if (a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]) continue;
          for (const EA of [A0.r.E0, A0.r.E1]) for (const EB of [B0.r.E0, B0.r.E1]) { let run = [];
            const flush = () => { if (run.length >= 4) { let len = 0; for (let z = 1; z < run.length; z++) len += dist(run[z - 1].m, run[z].m); if (len > 2) out.push({ ly: A0.r.ly, A: run.map(x => x.p), B: run.map(x => x.q), mid: run.map(x => x.m) }); } run = []; };
            for (let k = 0; k < EA.length; k++) { const p = EA[k]; if (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3]) { flush(); continue; } let bd = 1e9, bq = null, bt = null; for (let z = 1; z < EB.length; z++) { const x0 = EB[z - 1]; if (p[0] < Math.min(x0[0], EB[z][0]) - 1.7 || p[0] > Math.max(x0[0], EB[z][0]) + 1.7 || p[1] < Math.min(x0[1], EB[z][1]) - 1.7 || p[1] > Math.max(x0[1], EB[z][1]) + 1.7) continue; const dx = EB[z][0] - x0[0], dy = EB[z][1] - x0[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - x0[0]) * dx + (p[1] - x0[1]) * dy) / L2)), qx = x0[0] + dx * t, qy = x0[1] + dy * t, d = Math.hypot(qx - p[0], qy - p[1]); if (d < bd) { bd = d; bq = [qx, qy]; bt = [dx / Math.sqrt(L2), dy / Math.sqrt(L2)]; } }
              const ta = tg(EA, k), ok = bq && bd < 1.6 && ta[0] * bt[0] + ta[1] * bt[1] > 0.97; if (ok) run.push({ p, q: bq, m: [(p[0] + bq[0]) / 2, (p[1] + bq[1]) / 2] }); else flush(); } flush(); } } }
        return (L.__seams = out); })();
      window.__busPts = [];
      for (const LY of (kk >= 3 ? LYS : [null])) { pi = 0; const baseA = LY !== null && LY < 0 ? 0.5 : 1; const roads = allRoads.filter(r => LY === null || r.ly === LY), nvs = NVL.filter(x => LY === null || x.ly === LY).map(x => x.nv); if (!roads.length && !nvs.length) { if (kk >= 3) { const cy0 = document.getElementById('cCycle'); if (aC > 0 && tkR && (!cy0 || cy0.checked)) drawCycle(kk, aC, LY); } continue; } const M = mk(); ctx.save(); if (LY < 0) ctx.globalAlpha = 0.5; /* warstwy po kolei: tunele (polprzezroczyste), teren, mosty nad nimi */
      const ER = new Path2D(), ERS = new Path2D(), EXT = []; let anyER = false; for (const r of (LY === null ? [] : roads)) { const rd = S.doc.road[r.ri], Q = r.G.Q; if (Q.length < 2) continue; for (const [ix, jx] of [[0, 0], [rd.nk.length - 1, 1]]) { const k = rd.nk[ix]; if (!k || !S.doc.road.some(q => (q.ly | 0) !== LY && q.nk.includes(k))) continue; const Pq = jx ? Q[Q.length - 1] : Q[0], P2 = jx ? Q[Q.length - 2] : Q[1], tl = dist(Pq, P2) || 1, t = [(P2[0] - Pq[0]) / tl, (P2[1] - Pq[1]) / tl], n = [-t[1], t[0]], hw = r.G.NL * r.G.lw[jx ? Q.length - 1 : 0] / 2 + Math.abs(r.G.left[jx ? Q.length - 1 : 0] + r.G.NL * r.G.lw[jx ? Q.length - 1 : 0] / 2) + 1.5;
        const P = (() => { for (const nv of S.nodeViz || []) { const j = (nv.lanes || []).findIndex(a => a.ri === r.ri); if (j < 0 || !nv.cuts || !nv.cuts[j] || !nv.o || dist(nv.o, Pq) > 1) continue; const c = nv.cuts[j]; return [(c[1][0] + c[2][0]) / 2, (c[1][1] + c[2][1]) / 2]; } return Pq; })(); /* przy wezle koniec mostu lezy na ciecie wezla (nie w jego srodku): tam znika kraweznik i cien */ { const h2 = hw - 1.5, A = [P[0] + n[0] * h2, P[1] + n[1] * h2], B = [P[0] - n[0] * h2, P[1] - n[1] * h2]; EXT.push([A, B, [B[0] - t[0] * 0.3, B[1] - t[1] * 0.3], [A[0] - t[0] * 0.3, A[1] - t[1] * 0.3]]); } /* asfalt lekko za koniec: bez szczeliny na styku warstw */ [[hw + 2, -6], [-hw - 2, -6], [-hw - 2, 3.5], [hw + 2, 3.5]].forEach((d, i) => { const w = w2s([P[0] + n[0] * d[0] + t[0] * d[1], P[1] + n[1] * d[0] + t[1] * d[1]]); i ? ERS.lineTo(w[0], w[1]) : ERS.moveTo(w[0], w[1]); }); ERS.closePath(); /* przy wjezdzie most jest na poziomie terenu: bez cienia */ { const he = hw - 1.5 - 0.22; [[he, -0.6], [-he, -0.6], [-he, 0.6], [he, 0.6]].forEach((d, i) => { const w = w2s([P[0] + n[0] * d[0] + t[0] * d[1], P[1] + n[1] * d[0] + t[1] * d[1]]); i ? ER.lineTo(w[0], w[1]) : ER.moveTo(w[0], w[1]); }); ER.closePath(); } anyER = true; } } /* styk z droga innej warstwy (wjazd na most): bez kraweznika i linii krawedzi w poprzek */
      const erase = T => { if (anyER && T) { const g = T.getContext('2d'); g.save(); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.globalCompositeOperation = 'destination-out'; g.fill(ER); g.restore(); } return T; };
      if (EXT.length) fm(M, EXT, null); { const sq = SEAMS.filter(x => LY === null || x.ly === LY); if (sq.length) fm(M, sq.map(x => { const n = x.A.length, gp0 = dist(x.A[0], x.B[0]), gp1 = dist(x.A[n - 1], x.B[n - 1]), cum = [0]; for (let z = 1; z < n; z++) cum.push(cum[z - 1] + dist(x.mid[z - 1], x.mid[z])); const Ls = cum[n - 1], TL = Math.min(15, Ls * 0.6), op = gp1 > gp0 ? 1 : 0; /* klin: od strony, gdzie jezdnie sie rozchodza, wypelnienie zweza sie do zera - ostry czubek */
            const Bf = x.B.map((q, z) => { const dd = op ? Ls - cum[z] : cum[z], f = Math.max(0, Math.min(1, dd / TL)), p = x.A[z]; return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]; }); return x.A.concat(Bf.reverse()); }), null); } const nts = nvs.flatMap(nv => nv.asph || [nv.poly]); /* wielokat wezla wypelniany w calosci (nie tysiace trojkatow wachlarza) */
      if (kk >= 2.5) { for (const r of roads) fm(M, [r.E0.concat(r.E1.slice().reverse())], [...cutClip(r.ri, kk), ...nodeHole(r.ri)]); } else fm(M, roads.map(r => r.E0.concat(r.E1.slice().reverse())), null); /* jeden wielokat na droge; przy oddaleniu wszystkie drogi jednym wypelnieniem */ { const g0 = M.getContext('2d'); g0.globalCompositeOperation = 'destination-out'; fm(M, nts, false); g0.globalCompositeOperation = 'source-over'; } fm(M, nts, false); { const g3 = M.getContext('2d'); g3.save(); g3.setTransform(DPR, 0, 0, DPR, 0, 0); g3.beginPath(); for (const nv of nvs) for (const PP of (nv.asph || [nv.poly])) { PP.forEach((q, i) => { const w = w2s(q); i ? g3.lineTo(w[0], w[1]) : g3.moveTo(w[0], w[1]); }); g3.closePath(); } g3.strokeStyle = '#000'; g3.lineWidth = Math.max(1.4, 0.05 * kk); g3.lineJoin = 'round'; g3.stroke(); g3.restore(); } /* obrys tylko zewnetrzny wielokata wezla (nie kazdego trojkata wachlarza) */
      { const g0 = M.getContext('2d'); g0.globalCompositeOperation = 'source-over'; g0.drawImage(M, 0, 0); g0.drawImage(M, 0, 0); } /* maska prawie binarna: polprzezroczyste szwy na stykach drog (antyaliasing) nie daja linii w krawezniku */
      if (kk >= 2.5 && !window.__noGapClose && 'filter' in M.getContext('2d')) { const rb = (0.12 * kk * DPR).toFixed(2), D = mk(), dg = D.getContext('2d'); dg.filter = 'blur(' + rb + 'px)'; dg.drawImage(M, 0, 0); dg.filter = 'none'; for (let q = 0; q < 5; q++) dg.drawImage(D, 0, 0); const E = mk(), eg = E.getContext('2d'); eg.filter = 'blur(' + rb + 'px)'; eg.drawImage(D, 0, 0); eg.filter = 'none'; eg.globalCompositeOperation = 'destination-in'; for (let q = 0; q < 5; q++) eg.drawImage(E, 0, 0); eg.globalCompositeOperation = 'source-over'; M.getContext('2d').drawImage(E, 0, 0); } /* domkniecie wlosowatych szczelin (< ok. 0,3 m) miedzy stykajacymi sie jezdniami, np. rampa przy jezdni glownej */
      const DIR = [[1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];
      const grow = (src, px) => { const T = mk(), t = T.getContext('2d'); t.drawImage(src, 0, 0); for (const [x, y] of DIR) t.drawImage(src, x * px * DPR, y * px * DPR); return T; };
      const shrink = (src, px) => { const T = mk(), t = T.getContext('2d'); t.drawImage(src, 0, 0); t.globalCompositeOperation = 'destination-in'; for (const [x, y] of DIR) t.drawImage(src, x * px * DPR, y * px * DPR); return T; };
      const tintIn = (T, col) => { const t = T.getContext('2d'); t.globalCompositeOperation = 'source-in'; t.fillStyle = col; t.fillRect(0, 0, Wd, Hd); t.globalCompositeOperation = 'source-over'; return T; }, tint = (src, col) => { const T = mk(); T.getContext('2d').drawImage(src, 0, 0); return tintIn(T, col); };
      let ring = null; if (tkE) { const cg = M.getContext('2d'); if ('filter' in cg) { ring = mk(); const rg0 = ring.getContext('2d'); rg0.filter = 'blur(' + (0.13 * kk * DPR).toFixed(2) + 'px)'; rg0.drawImage(M, 0, 0); rg0.filter = 'none'; rg0.globalCompositeOperation = 'destination-in'; for (let q = 0; q < 5; q++) rg0.drawImage(ring, 0, 0); rg0.globalCompositeOperation = 'source-over'; for (let q = 0; q < 4; q++) rg0.drawImage(ring, 0, 0); } /* progowanie: potega alfy (a^32), potem wzmocnienie - ostra krawedz */ else ring = shrink(M, 0.2 * kk); /* zwezenie maski przez rozmycie (izotropowe): bez promieni przy waskich szczelinach */ const rg = ring.getContext('2d'); rg.globalCompositeOperation = 'source-out'; rg.drawImage(M, 0, 0); rg.globalCompositeOperation = 'source-over'; tintIn(ring, '#e4e5e1'); } /* biala linia krawedzi: maska minus maska zwezona */
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); if (LY !== null && LY > 0 && LY > LYS[0] && tkR && aL > 0) { const SH = tint(M, 'rgba(0,0,0,0.42)'); if (anyER) { const g = SH.getContext('2d'); g.save(); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; /* pelne wymazanie (pedzel z kolorem cienia ma alfe 0,42 i kasowal tylko ulamek) */ g.fill(ERS); g.restore(); } ctx.save(); ctx.globalAlpha = aL; if ('filter' in ctx) ctx.filter = 'blur(' + Math.max(1, 0.9 * kk * DPR).toFixed(1) + 'px)'; ctx.drawImage(SH, 0.9 * kk * DPR, 1.3 * kk * DPR); ctx.restore(); } /* cien mostu na drogach pod spodem (slonce z lewej-gory) */ if (tkE) { const G1 = grow(M, 0.17 * kk), G2 = grow(G1, 0.04 * kk); /* kraweznik 0,21 m */
        const NOK = /^(motorway|trunk)(?!_link)/, noK = T => { /* bez kraweznika na drogach primary / secondary i nizszych (zostaja tylko autostrady i drogi ekspresowe); biala linia krawedzi bez zmian */ const g = T.getContext('2d'); g.save(); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.globalCompositeOperation = 'destination-out'; g.fillStyle = g.strokeStyle = '#000'; g.lineJoin = 'round'; g.lineWidth = 0.8 * kk; const poly = P => { g.beginPath(); P.forEach((q, i) => { const w = w2s(q); i ? g.lineTo(w[0], w[1]) : g.moveTo(w[0], w[1]); }); g.closePath(); g.fill(); g.stroke(); };
          for (const r of roads) { if (NOK.test(S.doc.road[r.ri].hw || '')) continue; if (r.E0.length < 2) continue; poly(r.E0.concat(r.E1.slice().reverse())); } for (const nv of nvs) if ((nv.lanes || []).length && (nv.lanes || []).every(m => S.doc.road[m.ri] && !NOK.test(S.doc.road[m.ri].hw || ''))) (nv.asph || [nv.poly]).forEach(poly); g.restore(); return T; };
        ctx.globalAlpha = baseA * aE; ctx.drawImage(noK(erase(tintIn(G2, '#6f716c'))), 0, 0); ctx.drawImage(noK(erase(tintIn(G1, '#c4c6c0'))), 0, 0); ctx.globalAlpha = baseA; }
      if (tkR) for (const r of roads) { const sk = window.__surfOn ? surfOf(S.doc.road[r.ri]) : ''; if (!sk) continue; /* na razie tylko asfalt: inne nawierzchnie wylaczone (window.__surfOn) */ const q1 = []; for (let z = 1; z < r.E0.length; z++) q1.push([r.E0[z - 1], r.E0[z], r.E1[z], r.E1[z - 1]]); const SM = mk(); fm(SM, q1, [...cutClip(r.ri, kk), ...nodeHole(r.ri)]); const T = tint(SM, '#000'), t = T.getContext('2d'); t.globalCompositeOperation = 'source-in'; const pt = t.createPattern(surfPat(sk), 'repeat'); const sc = kk * 4 / 128 * 1; pt.setTransform(new DOMMatrix().scale(sc, sc)); t.fillStyle = pt; t.fillRect(0, 0, Wd, Hd); r.surf = T; }
      if (tkR) { ctx.drawImage(tintIn(M, PAT), 0, 0); for (const r of roads) if (r.surf) ctx.drawImage(r.surf, 0, 0); } /* asfalt: maska barwiona w miejscu (bez dodatkowej kopii) */
      if (ring) { erase(ring); const MIN = /^(residential|service|living_street|track)/, mr = roads.filter(r => MIN.test(S.doc.road[r.ri].hw || '')); if (mr.length) { const g = ring.getContext('2d'); g.save(); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.globalCompositeOperation = 'destination-out'; g.beginPath(); for (const r of mr) { const P = offsetPts(r.G.Q, r.G.Q.map((_, j) => r.G.left[j] - 0.3)).concat(offsetPts(r.G.Q, r.G.Q.map((_, j) => r.G.left[j] + r.G.NL * r.G.lw[j] + 0.3)).reverse()); P.forEach((q, i) => { const w = w2s(q); i ? g.lineTo(w[0], w[1]) : g.moveTo(w[0], w[1]); }); g.closePath(); } for (const nv of nvs) if ((nv.lanes || []).every(m => S.doc.road[m.ri] && MIN.test(S.doc.road[m.ri].hw || ''))) { nv.poly.forEach((q, i) => { const w = w2s(q); i ? g.lineTo(w[0], w[1]) : g.moveTo(w[0], w[1]); }); g.closePath(); } g.fill('nonzero'); g.restore(); } ctx.globalAlpha = baseA * aE; ctx.drawImage(ring, 0, 0); ctx.globalAlpha = baseA; } /* residential/service: sam asfalt z kraweznikiem, bez bialej linii krawedzi */ ctx.restore();
      const EM = new Map(); S.doc.road.forEach((rd, i) => { [[0, true], [rd.nk.length - 1, false]].forEach(([j, st]) => { const k = rd.nk[j]; if (k) (EM.get(k) || EM.set(k, []).get(k)).push({ ri: i, st }); }); });
      const byRiAll = new Map(allRoads.map(r => [r.ri, r])), PHm = new Map(), PDash = 7.5; /* faza wzoru kresek: ciagla przez styki jezdni jednokierunkowych (kreska nie zaczyna sie od nowa na kazdym odcinku) */
      const phaseOf = (ri, depth) => { if (PHm.has(ri)) return PHm.get(ri); PHm.set(ri, 0); const rd = S.doc.road[ri]; let ph = 0; if (rd && rd.oneway && depth < 60) { const k = rd.nk[0], ls = k && EM.get(k); if (ls && ls.length === 2) { const o = ls.find(e => e.ri !== ri), ro = o && S.doc.road[o.ri], rp = o && byRiAll.get(o.ri); if (o && !o.st && ro.oneway && rp) { const cmp = cumOf(rp.G.Q); ph = (phaseOf(o.ri, depth + 1) + cmp[cmp.length - 1]) % PDash; } } } PHm.set(ri, ph); return ph; };
      const laneAdj = (ri, G) => { /* zmiana liczby pasow o 1 na styku dwoch jezdni jednokierunkowych: wszystkie linie pasow leza w stalym odstepie (nominalna szerokosc pasa) od stalej krawedzi jezdni; rozszerzajacy sie / zwezajacy pas wyrasta z drugiej krawedzi (linia pasa, ktory sie konczy, dochodzi do krawedzi) */
        const rd = S.doc.road[ri]; if (G.NL < 1 || G.Q.length < 3) return null; const nbkL = rd.oneway ? 0 : G.NL - Math.max(0, Math.min(G.NL, rd.nf == null ? Math.round(G.NL / 2) : rd.nf)); const cm = cumOf(G.Q), Lq = cm[cm.length - 1]; let res = null;
        for (const [ix, st] of [[0, true], [rd.nk.length - 1, false]]) { const k = rd.nk[ix]; if (!k) continue; const ls = EM.get(k); if (!ls || ls.length !== 2) continue; const oth = ls.find(e => e.ri !== ri); if (!oth || oth.st === st || ls.filter(e => e.ri === ri).length !== 1) continue; const ro = S.doc.road[oth.ri]; if (!ro || !!ro.oneway !== !!rd.oneway || (!rd.oneway && ((ro.nf | 0) !== (rd.nf | 0) || nbkL <= 0))) continue; const dN = (ro.lanes | 0) - (rd.lanes | 0); if (Math.abs(dN) !== 1) continue; let Go = null; try { Go = laneGeom(oth.ri); } catch (e) {} if (!Go) continue;
          const jw = st ? 0 : G.Q.length - 1, nd = G.Q[jw]; if ((S.nodeViz || []).some(nv => !nv.mini && dist(nv.o, nd) < 2)) continue; /* z prawdziwym wezlem (3+ drog) zostaje po staremu; maly wezel dwoch drog to zwykly styk */
          const T = Math.min(Math.max(10, +($('fT') ? $('fT').value : 35) || 35), 0.45 * Lq); if (T < 5) continue;
          const wide = dN < 0, w0 = Math.min(rd.lw || 3.75, ro.lw || 3.75), rg = j => G.left[j] + G.NL * G.lw[j];
          const sideR = (Gx, stx) => { const nx = Gx.Q.length, cx = cumOf(Gx.Q), Lx = cx[nx - 1], Tx = Math.min(Math.max(10, +($('fT') ? $('fT').value : 35) || 35), 0.45 * Lx), jx = stx ? 0 : nx - 1; let jf = jx; while (stx ? jf < nx - 1 : jf > 0) { if ((stx ? cx[jf] : Lx - cx[jf]) >= 1.5 * Tx) break; jf += stx ? 1 : -1; } const rgx = j => Gx.left[j] + Gx.NL * Gx.lw[j]; return Math.abs(rgx(jx) - rgx(jf)) < Math.abs(Gx.left[jx] - Gx.left[jf]) - 0.05; };
          const anchR = !rd.oneway ? true : (wide ? sideR(G, st) : sideR(Go, oth.st)); /* dwukierunkowa: stala liczba pasow w przod (prawa strona), zmienia sie liczba pasow przeciwnych (lewa) - kotwica prawa krawedz */ /* ta sama kotwica po obu stronach styku (wg szerszego odcinka): bez przeskoku linii */ /* ktora krawedz stoi w miejscu: ta, do ktorej kotwiczymy linie */
          res = res || new Map(); if (!rd.oneway && Go.NL >= 3) res.dbl = true; const qMax = wide ? G.NL - 1 : G.NL; /* odcinek wezszy dostaje dodatkowa linie (poczatek nowego pasa) */
          for (let q = 1; q <= qMax; q++) { const cur = res.get(q) || { off: null, keep: null }; const off = cur.off || G.Q.map((_, j) => G.left[j] + q * G.lw[j]), keep = cur.keep || G.Q.map(() => true);
            if (q === nbkL && !wide && !rd.oneway && Go.NL >= 3) { cur.fade = cur.fade || G.Q.map(() => 0); for (let j = 0; j < off.length; j++) { const sv = st ? cm[j] : Lq - cm[j]; cur.fade[j] = Math.max(cur.fade[j], sv >= T ? 0 : 1 - sm5((sv - 0.5 * T) / (0.5 * T))); } } /* podwojna ciagla wchodzi w wezszy odcinek i zanika */
            for (let j = 0; j < off.length; j++) { const sv = st ? cm[j] : Lq - cm[j]; if (sv >= 2 * T) { if (q === G.NL) keep[j] = false; continue; } const g = sv <= T ? 1 : 1 - sm5((sv - T) / T), anc = anchR ? rg(j) - (q === G.NL ? G.NL : G.NL - q) * w0 : G.left[j] + q * w0; if (q === G.NL) { const gapEdge = anchR ? anc - G.left[j] : rg(j) - anc; if (gapEdge < 0.35) keep[j] = false; off[j] = anc; } else off[j] = off[j] * (1 - g) + anc * g; }
            cur.off = off; cur.keep = keep; res.set(q, cur); } }
        if (res) res.cm = cm, res.Lq = Lq; return res; };
      if (tkM) for (const r of roads) { ctx.save(); cutClip(r.ri, kk).forEach(cq => ctx.clip(cq, 'evenodd')); nodeHole(r.ri).forEach(cq => ctx.clip(cq, 'evenodd')); const G = r.G, BL = busLanes(r.ri, G.NL), LAD = BL.size ? null : laneAdj(r.ri, G), ph0 = phaseOf(r.ri, 0); ctx.strokeStyle = '#f2f2f2'; ctx.globalAlpha = baseA * aM * 0.82;
        const minorR = /^(residential|living_street|service|unclassified|track|road|pedestrian)/.test(S.doc.road[r.ri].hw || '') && !BL.size; /* male uliczki: bez linii pasow */ const rdv = S.doc.road[r.ri], nbk = rdv.oneway ? 0 : G.NL - Math.max(0, Math.min(G.NL, rdv.nf == null ? Math.round(G.NL / 2) : rdv.nf)); /* pasy kierunku przeciwnego (od lewej) */
      for (let q = 1; q < (minorR ? 1 : (LAD && LAD.has(G.NL) ? G.NL + 1 : G.NL)); q++) { const adv = LAD && LAD.get(q); if (q === nbk && nbk > 0 && !BL.size && (G.NL >= 3 || (adv && LAD.dbl))) { /* droga dwukierunkowa z >= 3 pasami (i poczatek wezszego odcinka przy styku): cienka podwojna ciagla miedzy kierunkami */ ctx.setLineDash([]); ctx.lineWidth = 0.08 * kk; const offv = adv && adv.off ? adv.off : G.Q.map((_, j) => G.left[j] + q * G.lw[j]), fd = adv && adv.fade, a0 = ctx.globalAlpha;
          if (fd) { for (let j = 1; j < G.Q.length; j++) { const al = Math.min(fd[j - 1], fd[j]); if (al <= 0.02) continue; ctx.globalAlpha = a0 * al; for (const dz of [-0.1, 0.1]) { pl(offsetPts([G.Q[j - 1], G.Q[j]], [offv[j - 1] + dz, offv[j] + dz]), false); ctx.stroke(); } } ctx.globalAlpha = a0;
            /* za koncem zanikania podwojnej ciaglej wraca zwykla przerywana linia srodka */ ctx.setLineDash([2.5 * kk, 5 * kk]); ctx.lineDashOffset = ph0 * kk; ctx.lineWidth = 0.12 * kk; let run = []; const flushD = () => { if (run.length > 1) { pl(offsetPts(run.map(j => G.Q[j]), run.map(j => offv[j])), false); ctx.stroke(); } run = []; }; for (let j = 0; j < G.Q.length; j++) { if (fd[j] <= 0.02) run.push(j); else flushD(); } flushD(); ctx.setLineDash([]); }
          else for (const dz of [-0.1, 0.1]) { pl(offsetPts(G.Q, offv.map(v => v + dz)), false); ctx.stroke(); } continue; } const solid = BL.has(q - 1) !== BL.has(q); ctx.setLineDash(solid ? [] : [2.5 * kk, 5 * kk]); ctx.lineDashOffset = ph0 * kk; ctx.lineWidth = (solid ? 0.2 : 0.12) * kk; { const ad = LAD && LAD.get(q); if (ad) { const off = ad.off || G.Q.map((_, j) => G.left[j] + q * G.lw[j]), ix = []; for (let j = 0; j < G.Q.length; j++) if (!ad.keep || ad.keep[j]) ix.push(j); if (ix.length > 1) { /* odcinki ciagle (maska moze miec przerwy) */ let run = []; for (let z = 0; z <= ix.length; z++) { if (z < ix.length && (run.length === 0 || ix[z] === run[run.length - 1] + 1)) { run.push(ix[z]); continue; } if (run.length > 1) { pl(offsetPts(run.map(j => G.Q[j]), run.map(j => off[j])), false); ctx.lineDashOffset = ((ph0 + LAD.cm[run[0]]) % PDash) * kk; ctx.stroke(); } run = z < ix.length ? [ix[z]] : []; } continue; } else continue; } else pl(offsetPts(G.Q, G.Q.map((_, j) => G.left[j] + q * G.lw[j])), false); } ctx.stroke(); } ctx.setLineDash([]); /* pas autobusowy oddzielony szeroka linia ciagla */
        if (BL.size && kk > 3) { const rd = S.doc.road[r.ri], nb = rd.oneway ? 0 : G.NL - (rd.nf || 1), cum = [0]; for (let z = 1; z < G.Q.length; z++) cum.push(cum[z - 1] + dist(G.Q[z - 1], G.Q[z])); const Ltot = cum[cum.length - 1];
          ctx.fillStyle = '#f2f2f2'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold ' + (1.5 * kk).toFixed(1) + 'px Arial, sans-serif';
          for (const q of BL) { const back = q < nb; for (let sd = Math.min(12, Ltot / 2); sd < Ltot; sd += 35) { let z = 1; while (z < cum.length - 1 && cum[z] < sd) z++; const f = (sd - cum[z - 1]) / ((cum[z] - cum[z - 1]) || 1), A = G.Q[z - 1], B = G.Q[z], tl0 = Math.hypot(B[0] - A[0], B[1] - A[1]); if (tl0 < 1e-9) continue; const t = [(B[0] - A[0]) / tl0, (B[1] - A[1]) / tl0]; const lat = G.left[z] + (q + 0.5) * G.lw[z], P = [A[0] + (B[0] - A[0]) * f - t[1] * lat, A[1] + (B[1] - A[1]) * f + t[0] * lat], sp = w2s(P), dir = back ? [-t[0], -t[1]] : t; window.__busPts.push(P);
            ctx.save(); ctx.translate(sp[0], sp[1]); ctx.rotate(Math.atan2(dir[1], dir[0]) + Math.PI / 2); ctx.scale(0.75, 1.6); ctx.fillText('BUS', 0, 0); ctx.restore(); } } } /* napis BUS na pasie, czytany w kierunku jazdy, wydluzony jak na jezdni */
        ctx.restore(); }
      if (tkM) for (const sq of SEAMS) { if (LY !== null && sq.ly !== LY) continue; const cum = [0]; for (let z = 1; z < sq.mid.length; z++) cum.push(cum[z - 1] + dist(sq.mid[z - 1], sq.mid[z])); const Ls = cum[cum.length - 1], fade = 0.6, nA = sq.A.length, opn = dist(sq.A[nA - 1], sq.B[nA - 1]) > dist(sq.A[0], sq.B[0]), TLs = Math.min(15, Ls * 0.6); ctx.save(); ctx.globalAlpha = baseA * aM; ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 0.15 * kk; ctx.setLineDash([2.5 * kk, 5 * kk]); pl(sq.mid.filter((_, z) => cum[z] > fade && cum[z] < Ls - fade && (opn ? Ls - cum[z] : cum[z]) > TLs), false); /* bez linii w zwezajacym sie klinie */ ctx.stroke(); ctx.restore(); } /* linia pasa miedzy rampa a jezdnia glowna */
      if (tkE && LY !== null && LY > 0 && aL > 0) for (const r of roads) { const G = r.G, NL = G.NL; ctx.save(); ctx.globalAlpha = aL; cutClip(r.ri, kk).forEach(cq => ctx.clip(cq, 'evenodd')); nodeHole(r.ri).forEach(cq => ctx.clip(cq, 'evenodd')); ctx.lineCap = 'butt'; ctx.lineJoin = 'round'; /* barierki mostu: betonowa podstawa, slupki i jasna porecz przesunieta w gore-lewo (lekkie 3D) */
        const cq = cumOf(G.Q), Lq = cq[cq.length - 1], ix = G.Q.map((_, j) => j).filter(j => cq[j] > 0.8 && cq[j] < Lq - 0.8); if (ix.length < 2) { ctx.restore(); continue; } /* barierki konczą sie przed koncem odcinka (krotkie odcinki na zlaczu maja przypadkowy kierunek) */ for (const sd of [-1, 1]) { const off = ix.map(j => sd < 0 ? G.left[j] - 0.45 : G.left[j] + NL * G.lw[j] + 0.45), E = offsetPts(ix.map(j => G.Q[j]), off);
          pl(E, false); ctx.strokeStyle = '#6c6f6a'; ctx.lineWidth = 0.55 * kk; ctx.stroke();
          ctx.setLineDash([0.14 * kk, 1.86 * kk]); ctx.strokeStyle = '#4a4c48'; ctx.lineWidth = 0.75 * kk; ctx.stroke(); ctx.setLineDash([]);
          ctx.save(); ctx.translate(-0.12 * kk, -0.18 * kk); pl(E, false); ctx.strokeStyle = '#e6e7e3'; ctx.lineWidth = 0.22 * kk; ctx.stroke(); ctx.restore(); }
        ctx.restore(); }
      if (tkM) for (const a of L.arrows || []) { if (LY !== null && (a.ly | 0) !== LY) continue; if (window.__busPts && window.__busPts.some(bp => Math.hypot(bp[0] - a.x, bp[1] - a.y) < 4.3)) continue; /* strzalka nie nachodzi na napis BUS */ if ((S.nodeViz || []).some(nv => pipN([a.x, a.y], nv.poly) || (nv.cuts || []).some(c => { if (!c) return false; const mx = (c[1][0] + c[2][0]) / 2, my = (c[1][1] + c[2][1]) / 2; return Math.hypot(a.x - mx, a.y - my) < 6; }))) continue; const p = w2s([a.x, a.y]); ctx.save(); ctx.globalAlpha = baseA * aA; window.__arrCol = '#dcdcd8'; ctx.translate(p[0], p[1]); ctx.rotate((a.rot - 90) * Math.PI / 180); const sc = 4.2 * Math.min(1, Math.max(0.55, (a.lw || 3.5) / 3.5)) * kk / 48; /* strzalka proporcjonalna do szerokosci pasa (waskie pasy: mniejsze, bez zachodzenia) */ ctx.scale(sc, sc); ctx.translate(-24, -16); try { glyph(ctx, a.type); } catch (e) {} window.__arrCol = null; ctx.restore(); }
      ctx.restore(); { const cy = document.getElementById('cCycle'); if (aC > 0 && tkR && (!cy || cy.checked)) drawCycle(kk, aC, LY); } /* drogi i pasy rowerowe tuz nad drogami swojej warstwy (pod mostem - nizej, na moscie - wyzej) */ }
      }
    if (false) for (const a of L.arrows || []) { if ((S.nodeViz || []).some(nv => (nv.cuts || []).some(c => { if (!c) return false; const mx = (c[1][0] + c[2][0]) / 2, my = (c[1][1] + c[2][1]) / 2; return Math.hypot(a.x - mx, a.y - my) < 4.5; }))) continue; const p = w2s([a.x, a.y]); ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate((a.rot - 90) * Math.PI / 180); const sc = 5 * kk / 48; ctx.scale(sc, sc); ctx.translate(-24, -16); try { glyph(ctx, a.type); } catch (e) {} ctx.restore(); }
    ctx.restore(); }
  if (window.__nodeGeom && document.getElementById('cNodeLanes') && document.getElementById('cNodeLanes').checked) { /* obrysy kazdego pasa kazdej jezdni (osobna warstwa), przyciete na zoltej granicy wezla */
    const T = document.createElement('canvas'); T.width = cv.width; T.height = cv.height; const t = T.getContext('2d'); t.setTransform(DPR, 0, 0, DPR, 0, 0); const pth = (P) => { t.beginPath(); P.forEach((q, i) => { const w = w2s(q); i ? t.lineTo(w[0], w[1]) : t.moveTo(w[0], w[1]); }); t.closePath(); };
    t.lineJoin = 'round'; t.lineWidth = 1.5; for (let i = 0; i < S.doc.road.length; i++) { let G = null; try { G = laneGeom(i); } catch (e) {} if (!G) continue; t.strokeStyle = 'hsl(' + (i * 67 % 360) + ',85%,45%)'; t.fillStyle = 'hsla(' + (i * 67 % 360) + ',85%,50%,.10)'; t.save(); cutClip(i, S.view.k).forEach(cq => t.clip(cq, 'evenodd')); nodeHole(i).forEach(cq => t.clip(cq, 'evenodd')); for (let q = 0; q < G.NL; q++) { const A0 = offsetPts(G.Q, G.Q.map((_, j) => G.left[j] + q * G.lw[j])), B0 = offsetPts(G.Q, G.Q.map((_, j) => G.left[j] + (q + 1) * G.lw[j])); pth(A0.concat(B0.slice().reverse())); t.fill(); t.stroke(); } t.restore(); }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(T, 0, 0); ctx.restore(); }
  if (window.__nodeGeom && S.nodeViz && document.getElementById('cNodeBord') && document.getElementById('cNodeBord').checked) for (const nv of S.nodeViz) { if (nv.mini) continue; /* widoczna geometria wezla: obrys wielokata (przerywany) i luki w narozach (niebieskie) */
    ctx.save(); { /* sasiednie wezly: granice lezace wewnatrz innego wezla sa niewidoczne (wezly sie lacza) */ const cp = new Path2D(); cp.rect(-1e5, -1e5, 2e5, 2e5); let any = false; for (const o2 of S.nodeViz) { if (o2 === nv || o2.mini) continue; o2.poly.forEach((q, i) => { const w = w2s(q); i ? cp.lineTo(w[0], w[1]) : cp.moveTo(w[0], w[1]); }); cp.closePath(); any = true; } if (any) ctx.clip(cp, 'evenodd');
      const cnt = new Map(); for (const o2 of S.nodeViz) { if (o2.mini) continue; (o2.lanes || []).forEach((m, j) => { const c = o2.cuts && o2.cuts[j]; if (c && c.D != null) cnt.set(m.ri, (cnt.get(m.ri) || []).concat(c.D)); }); }
      for (const [ri, Ds] of cnt) { if (Ds.length < 2) continue; let G = null; try { G = laneGeom(ri); } catch (e) {} if (!G) continue; let len = 0; for (let z = 1; z < G.Q.length; z++) len += dist(G.Q[z - 1], G.Q[z]); if (len > Ds[0] + Ds[1] + 0.5) continue; /* krotka droga miedzy dwoma bliskimi wezlami (w calosci w wezle): jej obszar bez linii granic */
        const E0 = offsetPts(G.Q, G.Q.map((_, j) => G.left[j])), E1 = offsetPts(G.Q, G.Q.map((_, j) => G.left[j] + G.NL * G.lw[j])), sp = new Path2D(); sp.rect(-1e5, -1e5, 2e5, 2e5); E0.concat(E1.slice().reverse()).forEach((q, i) => { const w = w2s(q); i ? sp.lineTo(w[0], w[1]) : sp.moveTo(w[0], w[1]); }); sp.closePath(); ctx.clip(sp, 'evenodd'); } }
    ctx.save(); ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#f5b400'; ctx.beginPath(); nv.poly.forEach((q, i) => { const w = w2s(q); i ? ctx.lineTo(w[0], w[1]) : ctx.moveTo(w[0], w[1]); }); ctx.closePath(); ctx.stroke();
    if (nv.cuts && nv.cuts.some(Boolean)) { ctx.setLineDash([]); ctx.lineWidth = 3; ctx.strokeStyle = '#ffc400'; for (const c of nv.cuts) { if (!c) continue; ctx.beginPath(); c.forEach((q, i) => { const w = w2s(q); i ? ctx.lineTo(w[0], w[1]) : ctx.moveTo(w[0], w[1]); }); ctx.stroke(); } } else if (nv.arcs.length > 1) { ctx.setLineDash([]); ctx.lineWidth = 3; ctx.strokeStyle = '#ffc400'; for (let q = 0; q < nv.arcs.length; q++) { const A0 = nv.arcs[q], B0 = nv.arcs[(q + 1) % nv.arcs.length], e1 = w2s(A0[A0.length - 1]), s1 = w2s(B0[0]); ctx.beginPath(); ctx.moveTo(e1[0], e1[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke(); } }
    ctx.setLineDash([]); ctx.lineWidth = 3.5; ctx.strokeStyle = '#0050ff'; if (!window.__noBlue) for (const ar of nv.arcs) { ctx.beginPath(); ar.forEach((q, j) => { const w = w2s(q); j ? ctx.lineTo(w[0], w[1]) : ctx.moveTo(w[0], w[1]); }); ctx.stroke(); } ctx.restore(); ctx.restore(); }
  if (S.msel && S.msel.size) for (const { i, q } of S.msel.values()) { const G = laneGeom(i); if (!G || q < 0 || q >= G.NL) continue; const A0 = offsetPts(G.Q, G.Q.map((_, j) => G.left[j] + q * G.lw[j])), B0 = offsetPts(G.Q, G.Q.map((_, j) => G.left[j] + (q + 1) * G.lw[j])); ctx.save(); pathOf(ctx, A0.concat(B0.slice().reverse()), true); ctx.fillStyle = 'rgba(255,122,0,.35)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,122,0,.95)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
  { const nb = document.getElementById('nrbar'), nk = nb && nb.style.display !== 'none' ? nb.dataset.k : ''; /* geometria przejscia wybranego wezla: przerywana os drog na dlugosci przejscia + znaczniki poczatku i konca */
    if (nk) { const P = S.nodeP[nk] || {}, T = P.T || (+$('fT').value || 35), SA = P.s != null ? P.s : 0.3; ctx.save(); ctx.setLineDash([7, 5]); ctx.lineWidth = 2; ctx.strokeStyle = '#ff7a00';
      for (const r of S.doc.road) { const j = r.nk.indexOf(nk); if (j < 0) continue; for (const dir of [1, -1]) { if (j + dir < 0 || j + dir >= r.pts.length) continue; let acc = 0, prev = r.pts[j], pts = [prev], mk = [];
          for (let q = j + dir; q >= 0 && q < r.pts.length && acc < T; q += dir) { const cur = r.pts[q], d = dist(prev, cur), room = T - acc, f = d > room ? room / d : 1, pt = [prev[0] + (cur[0] - prev[0]) * f, prev[1] + (cur[1] - prev[1]) * f]; if (acc < SA * T && acc + d * f >= SA * T) { const g2 = (SA * T - acc) / (d * f || 1); mk.push([prev[0] + (pt[0] - prev[0]) * g2, prev[1] + (pt[1] - prev[1]) * g2]); } acc += d * f; pts.push(pt); prev = cur; if (f < 1) break; }
          ctx.beginPath(); pts.forEach((q, i) => { const w = w2s(q); i ? ctx.lineTo(w[0], w[1]) : ctx.moveTo(w[0], w[1]); }); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#ff7a00'; for (const q of mk.concat([pts[pts.length - 1]])) { const w = w2s(q); ctx.beginPath(); ctx.arc(w[0], w[1], 4, 0, 7); ctx.fill(); } ctx.setLineDash([7, 5]); } }
      ctx.restore(); } }
}
/* przechwyt kontekstu iD: iD tworzy go lokalnie, wiec opakowujemy iD.coreContext zanim zostanie wywolane (skrypt startuje przed iD) */
(function () {
  const wrap = o => { try { if (o && typeof o.coreContext === 'function' && !o.coreContext.__idl) { const orig = o.coreContext, f = function () { const c = orig.apply(this, arguments); try { window.__idctx = c; } catch (e) {} return c; }; f.__idl = 1; Object.keys(orig).forEach(k => { try { f[k] = orig[k]; } catch (e) {} }); o.coreContext = f; } } catch (e) {} return o; };
  try { if (window.iD) wrap(window.iD); else { let v; Object.defineProperty(window, 'iD', { configurable: true, enumerable: true, get() { return v; }, set(x) { v = wrap(x); } }); } } catch (e) {}
})();
/* ---- adapter iD: graf iD -> model edytora, rysowanie na nakladce canvas ---- */
const IDL = { on: true, hide: true, raf: 0 };
function idCtx() { const ok = c => c && typeof c.map === 'function' && typeof c.graph === 'function' && typeof c.history === 'function' && typeof c.container === 'function'; for (const c of [window.__idctx, window.id, window.context, window.iD && window.iD.context]) if (ok(c)) return c; try { for (const k of Object.getOwnPropertyNames(window)) { let v; try { v = window[k]; } catch (e) { continue; } if (v && typeof v === 'object' && ok(v)) return v; } } catch (e) {} return null; }
function idBadge(t) { let b = document.getElementById('idlanes-badge'); if (!b) { b = document.createElement('div'); b.id = 'idlanes-badge'; b.style.cssText = 'position:fixed;right:70px;top:8px;z-index:99999;font:12px system-ui;background:#fff;border:1px solid #889;border-radius:6px;padding:3px 8px;box-shadow:0 1px 4px #0004'; (document.body || document.documentElement).appendChild(b); } b.textContent = t; return b; }
function idWhen(cb) { let n = 0; const t = setInterval(() => { if (window.__idlDom) { clearInterval(t); try { document.getElementById('idlanes-badge').remove(); } catch (e) {} return; } if (window.top === window && document.querySelector('iframe[src*="/id"]')) { clearInterval(t); return; } if (n === 0) idBadge('Pasy w iD: szukam edytora…'); const c = idCtx(); const mm = document.querySelector('.main-map, .supersurface, #id-container .main-content'); if (c && mm) { clearInterval(t); try { document.getElementById('idlanes-badge').remove(); } catch (e) {} cb(c); } else if (++n >= 6 && n % 4 === 2) { const cls = new Set(); document.querySelectorAll('div,svg,canvas').forEach(e => { if (cls.size < 12 && e.className && typeof e.className === 'string' && /map|surface|main|content|id-/.test(e.className)) cls.add(e.className.split(' ')[0]); }); idBadge('Pasy w iD v' + '1951' + ': ' + (c ? 'ctx ok' : 'brak ctx') + ', ' + (mm ? 'mapa ok' : 'brak mapy') + '; iD=' + typeof window.iD + ', hook=' + (window.iD && window.iD.coreContext && window.iD.coreContext.__idl ? 'tak' : 'nie') + ', ramki=' + [...document.querySelectorAll('iframe')].map(f => (f.src || f.getAttribute('src') || f.id || '?').slice(0, 90)).join(' ; ') + ', top=' + (window.top === window) + ', klasy=' + [...cls].join(' ')); } }, 500); }
idWhen(ctxId => {
  const root = document.querySelector('.main-map') || document.querySelector('.supersurface') || document.querySelector('#id-container .main-content');
  const cvs = document.createElement('canvas'); cvs.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:5';
  root.appendChild(cvs); const cx = cvs.getContext('2d'), offc = document.createElement('canvas'), ocx = offc.getContext('2d');
  // przelaczniki
  const bar = document.createElement('div'); bar.style.cssText = 'position:absolute;right:56px;top:8px;z-index:6;display:flex;gap:4px;font:12px system-ui;pointer-events:auto';
  const mk = (txt, f) => { const b = document.createElement('button'); b.textContent = txt; b.style.cssText = 'padding:3px 8px;border:1px solid #889;border-radius:6px;background:#fff;cursor:pointer'; b.onclick = () => { f(b); sched(); }; bar.appendChild(b); return b; };
  mk('Pasy: wł.', b => { IDL.on = !IDL.on; b.textContent = 'Pasy: ' + (IDL.on ? 'wł.' : 'wył.'); });
  mk('Linie iD: ukryte', b => { IDL.hide = !IDL.hide; b.textContent = 'Linie iD: ' + (IDL.hide ? 'ukryte' : 'widoczne'); applyCss(); });
  root.appendChild(bar);
  const st = document.createElement('style'); document.head.appendChild(st);
  const applyCss = () => { st.textContent = IDL.hide ? '.main-map .layer-osm path.line.tag-highway-motorway,.main-map .layer-osm path.line.tag-highway-motorway_link,.main-map .layer-osm path.line.tag-highway-trunk,.main-map .layer-osm path.line.tag-highway-trunk_link,.main-map .layer-osm path.line.tag-highway-primary,.main-map .layer-osm path.line.tag-highway-primary_link,.main-map .layer-osm path.line.tag-highway-secondary,.main-map .layer-osm path.line.tag-highway-secondary_link{opacity:.25}' : ''; }; applyCss();

  const kOf = (lon, lat) => lon.toFixed(7) + ',' + lat.toFixed(7);
  let cache = { v: -1 };
  function rebuild(ext) {
    const g = ctxId.graph(), ents = ctxId.history().intersects(ext);
    const ways = new Map(), roads = [];
    for (const e of ents) {
      if (e.type !== 'way' || !e.tags || !e.tags.highway || e.nodes.length < 2) continue;
      const hw = (e.tags.highway || '').replace('_link', ''); if (!OKHW.has(hw) || e.tags.area === 'yes') continue;
      const pts = [], nk = []; let bad = false;
      for (const id of e.nodes) { const n = g.hasEntity(id); if (!n || !n.loc) { bad = true; break; } pts.push(proj(n.loc[0], n.loc[1])); nk.push(id); }
      if (bad) continue;
      const num = +String(e.id).slice(1), o = { id: num, t: { ...e.tags }, g: pts, nk };
      ways.set(num, o); roads.push(makeRoad(o, 0, pts.length - 1));
    }
    S.osm.ways = ways; S.doc.road = roads; S.dirty = true;
  }
  let lastKey = '', lastGraph = null;
  function draw() {
    IDL.raf = 0; const m = ctxId.map(); const ww = root.clientWidth, hh = root.clientHeight; if (!ww || !hh) return;
    DPR = window.devicePixelRatio || 1; W = ww; H = hh;
    for (const c of [cvs, offc]) { if (c.width !== Math.round(W * DPR)) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); } }
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cvs.width, cvs.height);
    if (!IDL.on) return;
    const c = m.center(), z = m.zoom(); if (z < 16) return;
    if (!S.orig0 || Math.abs(c[1] - S.org.lat) > 0.05 || Math.abs(c[0] - S.org.lon) > 0.08) { S.org = { lat: c[1], lon: c[0] }; S.orig0 = true; lastKey = ''; }
    S.view.k = Math.pow(2, z) / (156543.03 * Math.cos(S.org.lat * Math.PI / 180)); const cp = proj(c[0], c[1]); S.view.x = cp[0]; S.view.y = cp[1];
    const ext = m.extent(), gr = ctxId.graph(), ek = ext.rectangle().map(v => v.toFixed(4)).join(',') + '|' + "";
    if (gr !== lastGraph) { lastGraph = gr; lastKey = "x"; }
    if (ek !== lastKey || S.dirty) {
      if (ek !== lastKey || !L) { const pad = 0.0015; rebuild(ext.padByMeters ? ext.padByMeters(60) : ext); lastKey = ek; }
      try { L = layout(); } catch (e) { console.warn('idlanes layout', e); L = null; } S.dirty = false;
    }
    if (!L) return;
    ocx.setTransform(DPR, 0, 0, DPR, 0, 0); ocx.clearRect(0, 0, W, H); try { drawLayer(ocx); } catch (e) { console.warn('idlanes draw', e); }
    cx.drawImage(offc, 0, 0);
  }
  function sched() { if (!IDL.raf) IDL.raf = requestAnimationFrame(draw); }
  ctxId.map().on('move.idlanes', sched); ctxId.map().on('drawn.idlanes', sched);
  try { ctxId.history().on('change.idlanes', () => { lastKey = ''; sched(); }); } catch (e) {}
  window.addEventListener('resize', sched); sched();
  window.__idlanes = IDL;
});

/* ---- tryb DOM: gdy iD nie udostepnia kontekstu (iD w ramce /id). Dane z grafu iD przechwyconego przez prototyp coreGraph + encje powiazane z elementami SVG ---- */
(function () {
  const GR = [];
  function hookGraph() {
    const g = window.iD && window.iD.coreGraph; if (!g || !g.prototype) return false; if (g.prototype.__idl) return true;
    for (const m of ['hasEntity', 'entity']) { const o = g.prototype[m]; if (typeof o !== 'function') continue; g.prototype[m] = function () { if (GR[GR.length - 1] !== this) { const i = GR.indexOf(this); if (i >= 0) GR.splice(i, 1); GR.push(this); if (GR.length > 12) GR.shift(); } return o.apply(this, arguments); }; }
    g.prototype.__idl = 1; return true;
  }
  hookGraph(); const hk = setInterval(() => { if (hookGraph() && GR.length) clearInterval(hk); }, 300); setTimeout(() => clearInterval(hk), 60000);
  let started = false;
  const boot = setInterval(() => {
    if (started) return; const sup = document.querySelector('.supersurface'), mm = document.querySelector('.main-map');
    if (!sup || !mm || !window.iD || !hookGraph() || idCtx()) return; if (!GR.length) return;
    started = true; window.__idlDom = 1; clearInterval(boot); try { const b = document.getElementById('idlanes-badge'); if (b) b.remove(); } catch (e) {} run(sup, mm);
  }, 500);
  function run(sup, mm) {
    const cvs = document.createElement('canvas'); cvs.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none'; sup.appendChild(cvs); cvs.style.zIndex = '1'; { let a = sup.querySelector('svg.surface') || sup.querySelector('.surface') || sup.querySelector('.layer-osm'); while (a && a.parentNode !== sup) a = a.parentNode; if (a && a !== cvs) { if (getComputedStyle(a).position === 'static') a.style.position = 'relative'; a.style.zIndex = '2'; } } /* pod warstwa SVG iD: linie, wezly i uchwyty zostaja na wierzchu i da sie edytowac */
    const cx = cvs.getContext('2d'), offc = document.createElement('canvas'), ocx = offc.getContext('2d');
    const bar = document.createElement('div'); bar.style.cssText = 'position:absolute;right:64px;bottom:40px;z-index:60;display:flex;flex-direction:column;gap:4px;font:13px system-ui;pointer-events:auto;box-shadow:0 1px 6px #0006;border-radius:8px'; mm.appendChild(bar); for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'dblclick', 'wheel', 'contextmenu']) bar.addEventListener(ev, e => e.stopPropagation());
    const mk = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'padding:6px 12px;border:1px solid #889;border-radius:8px;background:#fff;color:#222;cursor:pointer'; b.onclick = () => { f(b); last = ''; }; bar.appendChild(b); };
    { const vl = document.createElement('div'); vl.textContent = 'Pasy v1951'; vl.style.cssText = 'font:11px system-ui;color:#555;background:#fff;border-radius:6px;padding:2px 6px;text-align:center'; bar.appendChild(vl); }
    mk('Pasy: wł.', b => { IDL.on = !IDL.on; b.textContent = 'Pasy: ' + (IDL.on ? 'wł.' : 'wył.'); });
    IDL.hide = false; mk('Linie iD: wł.', b => { IDL.hide = !IDL.hide; b.textContent = 'Linie iD: ' + (IDL.hide ? 'wył.' : 'wł.'); css(); });
    mk('Diagnostyka', b => { const h = {}; sup.querySelectorAll('*').forEach(e => { const c = typeof e.className === 'string' ? e.className : (e.className && e.className.baseVal) || ''; const k = e.tagName.toLowerCase() + (c ? '.' + c.trim().split(/\s+/).slice(0, 3).join('.') : ''); h[k] = (h[k] || 0) + 1; }); const top = Object.entries(h).sort((x, y) => y[1] - x[1]).slice(0, 40).map(x => x[1] + 'x ' + x[0]).join('\n'); let pn = document.getElementById('idlanes-diag'); if (!pn) { pn = document.createElement('pre'); pn.id = 'idlanes-diag'; pn.style.cssText = 'position:absolute;left:8px;top:70px;z-index:70;max-width:70%;max-height:70%;overflow:auto;font:11px monospace;background:#fff;color:#222;border:1px solid #889;padding:6px;white-space:pre-wrap;pointer-events:auto'; pn.onclick = () => pn.remove(); mm.appendChild(pn); } pn.textContent = 'DIAG v1951 (klik = zamknij)\ndrogi: ' + S.doc.road.slice(0, 6).map(r => r.osm + ' lanes=' + r.lanes + ' hw=' + r.hw).join(' | ') + '\ngrafy=' + GR.length + '\n' + top; });
    const st = document.createElement('style'); document.head.appendChild(st);
    const css = () => { st.textContent = IDL.hide ? ['motorway', 'trunk', 'primary', 'secondary'].map(h => '.layer-osm path.line[class*="tag-highway-' + h + '"],.layer-osm .line[class*="tag-highway-' + h + '"]').join(',') + '{display:none!important;visibility:hidden!important;opacity:0!important}' + ',g.onewaygroup,g.sidedgroup,g.onewaygroup *,g.sidedgroup *,path.oneway,path.sided,text.linelabel,text.linelabel-halo,textpath.textpath,.layer-labels,.layer-labels *,svg [class*="pathlabel"],svg [class*="textpath"],svg [class*="oneway"],svg [class*="sided"],svg [class*="onewaygroup"],svg text.pathlabel,.labels-group,.layer-osm marker,.layer-osm use[class*="oneway"]{display:none!important}' : ''; }; css();
    const ids = new WeakMap(); let nid = 0, last = '';
    const hashView = () => { const m = /map=([\d.]+)(?:\/|%2F)(-?[\d.]+)(?:\/|%2F)(-?[\d.]+)/i.exec(decodeURIComponent(location.hash || '')); return m ? { z: +m[1], lat: +m[2], lon: +m[3] } : null; };
    function ways() { const m = new Map(); document.querySelectorAll('.layer-osm path.line').forEach(p => { const d = p.__data__; if (d && d.type === 'way' && d.tags && d.tags.highway && !m.has(d.id)) m.set(d.id, d); }); return m; }
    let hs = 0; function hideLines() { if (Date.now() - hs < 120) return; hs = Date.now(); document.querySelectorAll('.layer-osm path, .layer-osm .onewaygroup, .layer-osm .sidedgroup, .layer-osm .oneway, .layer-osm .sided').forEach(p => { let d = p.__data__, q = p; for (let u = 0; u < 4 && !(d && d.type === 'way') && q.parentNode && q.parentNode !== document; u++) { q = q.parentNode; d = q.__data__; } if (!d || d.type !== 'way' || !d.tags || !d.tags.highway) return; const hw = String(d.tags.highway).replace('_link', ''); if (!OKHW.has(hw)) return; if (IDL.hide) { if (p.style.display !== 'none') p.style.setProperty('display', 'none', 'important'); p.setAttribute('data-idl-h', '1'); } else if (p.getAttribute('data-idl-h')) { p.style.removeProperty('display'); p.removeAttribute('data-idl-h'); } }); }
    /* kalibracja pozycji: wezel z danych iD ma na SVG transform translate(x,y); stad dokladny srodek mapy z ostatniego przerysowania iD (adres #map= opoznia sie podczas przesuwania) */
    function calib(hv, k, W0, H0) {
      const xy = e => { const t = e.getAttribute && e.getAttribute('transform'); let m = t && /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(t); if (m) return [+m[1], +m[2]]; if (e.getAttribute && e.getAttribute('cx') != null) return [+e.getAttribute('cx'), +e.getAttribute('cy')]; return null; };
      let n = 0; const els = document.querySelectorAll('.layer-osm g.vertex, .layer-osm g.point, .layer-osm .node, .layer-points g');
      for (const e of els) { let d = e.__data__, q = e; if (!(d && d.loc) && e.parentNode) { q = e.parentNode; d = q.__data__; } if (!d || !d.loc) continue; const c = xy(e) || xy(q); if (!c || !isFinite(c[0])) continue; const pv = proj(d.loc[0], d.loc[1]); return [pv[0] - (c[0] - W0 / 2) / k, pv[1] - (c[1] - H0 / 2) / k]; }
      return null;
    }
    /* iD moze blokowac <style> (CSP) - dlatego strzalki i etykiety chowamy tez przez styl inline na elementach */
    let hs2 = 0; function hideExtra() { if (Date.now() - hs2 < 150) return; hs2 = Date.now(); document.querySelectorAll('g.onewaygroup, g.sidedgroup, path.oneway, path.sided, text.linelabel, text.linelabel-halo, textpath, .layer-labels text, .layer-labels g, .labels-group').forEach(e => { if (IDL.hide) { if (e.style.display !== 'none') e.style.setProperty('display', 'none', 'important'); e.setAttribute('data-idl-x', '1'); } else if (e.getAttribute('data-idl-x')) { e.style.removeProperty('display'); e.removeAttribute('data-idl-x'); } }); }
    let dataKey = '', viewKey = '', org0 = null;
    const gids = new WeakMap(); let ngid = 0;
    /* rysowanie (tanie): uklad pasow L jest liczony tylko przy zmianie danych; przy przesuwaniu mapy tylko przerysowanie z aktualnym widokiem */
    function paint(force) {
      const hv = hashView(), W0 = mm.clientWidth, H0 = mm.clientHeight; if (!hv || !W0 || !H0 || !org0) return;
      S.org = org0; const k = Math.pow(2, hv.z) / (156543.03 * Math.cos(org0.lat * Math.PI / 180)); const cc = calib(hv, k, W0, H0), pc = proj(hv.lon, hv.lat), vx = cc ? cc[0] : pc[0], vy = cc ? cc[1] : pc[1];
      const vk = [vx.toFixed(2), vy.toFixed(2), k.toFixed(6), W0, H0, IDL.on].join(','); if (!force && vk === viewKey) return; viewKey = vk;
      DPR = window.devicePixelRatio || 1; W = W0; H = H0; if (cvs.width !== Math.round(W * DPR) || cvs.height !== Math.round(H * DPR)) { for (const c of [cvs, offc]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); } cvs.style.width = W + 'px'; cvs.style.height = H + 'px'; }
      cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cvs.width, cvs.height); if (!IDL.on || hv.z < 16 || !L) return;
      S.view.k = k; S.view.x = vx; S.view.y = vy;
      ocx.setTransform(DPR, 0, 0, DPR, 0, 0); ocx.clearRect(0, 0, W, H); try { drawLayer(ocx); } catch (e) { console.warn('idlanes draw', e); } cx.drawImage(offc, 0, 0);
    }
    function tick() { hideLines(); hideExtra();
      const hv = hashView(), W0 = mm.clientWidth, H0 = mm.clientHeight; if (!hv || !W0 || !H0) return;
      if (!org0 || Math.abs(hv.lat - org0.lat) > 0.03 || Math.abs(hv.lon - org0.lon) > 0.05) org0 = { lat: hv.lat, lon: hv.lon };
      const wm0 = ways(); let g = null, bs = -1; for (const c of GR.slice().reverse()) { let sc = 0; try { for (const id of wm0.keys()) { const e = c.hasEntity(id); if (e) sc += (e.v || 0) + 1; } } catch (e) { continue; } if (sc > bs) { bs = sc; g = c; } } if (!g) g = GR[GR.length - 1]; if (!g) return;
      const wm = new Map(); for (const [id, d] of wm0) { let e = d; try { e = g.hasEntity(id) || d; } catch (er) {} wm.set(id, e); }
      let gi = gids.get(g); if (!gi) gids.set(g, gi = ++ngid);
      const sig = [org0.lat, org0.lon, hv.z.toFixed(2), gi]; for (const w of wm.values()) { let i = ids.get(w); if (!i) ids.set(w, i = ++nid); sig.push(i); }
      const dk = sig.join(',');
      if (dk !== dataKey) {
        dataKey = dk; S.org = org0; S.view.k = Math.pow(2, hv.z) / (156543.03 * Math.cos(org0.lat * Math.PI / 180));
        const wmap = new Map(), roads = [];
        for (const e of wm.values()) { const hw = (e.tags.highway || '').replace('_link', ''); if (!OKHW.has(hw) || e.tags.area === 'yes' || e.nodes.length < 2) continue; const pts = [], nk = []; let bad = false; for (const n of e.nodes) { const nd = g.hasEntity(n); if (!nd || !nd.loc) { bad = true; break; } pts.push(proj(nd.loc[0], nd.loc[1])); nk.push(n); } if (bad) continue; const num = +String(e.id).slice(1), o = { id: num, t: { ...e.tags }, g: pts, nk }; wmap.set(num, o); try { roads.push(makeRoad(o, 0, pts.length - 1)); } catch (er) { console.warn('idlanes makeRoad', er); } }
        S.osm.ways = wmap; S.doc.road = roads; S.dirty = true; try { L = layout(); } catch (e) { console.warn('idlanes layout', e); L = null; } S.dirty = false;
        paint(true);
      } else paint(false);
    }
    try { new MutationObserver(() => { try { paint(false); } catch (e) {} }).observe(sup, { attributes: true, attributeFilter: ['style'] }); } catch (e) {}
    let lt = 0; const loop = t => { if (t - lt >= 30) { lt = t; try { tick(); } catch (e) { console.warn('idlanes tick', e); } } requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    window.__idlanes = IDL;
  }
})();

})();
