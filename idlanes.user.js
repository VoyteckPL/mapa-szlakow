// ==UserScript==
// @name         Pasy w iD (Roads and Lanes)
// @namespace    https://github.com/VoyteckPL/mapa-szlakow
// @version      2026.11.17.2113
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
const cv = $('cv'), ctx = cv.getContext('2d'), off = document.createElement('canvas'), octx = off.getContext('2d');
// Rejestr typow rozjazdow renderowanych specjalnie. Kazdy typ: gdzie stosowany (hw = regex na highway drog w wezle), co rysuje.
// Pozostale wezly ida po zwyklej osi OSM. Kolejne typy dopisujemy tutaj.
const FORK_TYPES = { 'rozjazd-n': { on: true, opis: 'n pasow -> a+b (szkielet, offset dla nieparzystych)', hw: /^(motorway|trunk|primary|secondary|tertiary)/ }, 'rozjazd-3-2+1': { on: true, opis: '3 pasy -> 2+1 (pasy glowne na osi, pas zjazdu bokiem, klin z chevronami)', hw: /^(motorway|trunk|primary|secondary|tertiary)/ }, 'rozjazd-3-2+2': { on: true, opis: '3 pasy -> 2+2 (srodkowy pas wspolny)', hw: /^(motorway|trunk|primary|secondary|tertiary)/ }, 'rozjazd-1-1+1': { on: true, opis: '1 pas -> 1+1 (wspolny pas, plynne rozejscie bez linii na zlaczu)', hw: /^(motorway|trunk|primary|secondary|tertiary)/ }, 'rozjazd-2-1+1': { on: true, opis: '2 pasy -> 1+1 (klin z chevronami)', hw: /^(motorway|trunk|primary|secondary|tertiary)/ } };
const EMBED = /[?&]embed=1/.test(location.search), EDIT = EMBED && /[?&]edit=1/.test(location.search), EKEY = (() => { const m = /#map=[\d.]+\/(-?[\d.]+)\/(-?[\d.]+)/.exec(location.hash); return m ? 'rozj-' + m[1] + '/' + m[2] : 'rozj-x'; })(); // tryb osadzony (galeria rozjazdow): bez zapisu, bez panelu
const ROZBIEZNY = false; // true wlacza tryby rozjazdu: wylot odchylony od przedluzenia (diverge) i 'prosty + odchodzacy' (asym); false = pierwotny, symetryczny sposob
const KEY = 'edytor-pasow-v3', CHEVRONS = true, HINTS = false, TAPER2 = true, FORK_MARKS = false, P9_TAPER = false;
const LS = { p1: { dash: [3, 6], w: 0.12 }, p2: { dash: null, w: 0.2 }, p4: { dash: null, w: 0.12, dbl: 0.12 } };
const LW_CLASS = { motorway: 3.75, trunk: 3.5, primary: 3.5, secondary: 3.4, tertiary: 3.5, unclassified: 2.5, residential: 2.5, living_street: 2.25, service: 4, busway: 3.25 };
const RANK = { motorway: 4, trunk: 4, primary: 3, secondary: 3, tertiary: 2 };
const HW_COL = { motorway: '#e0457b', trunk: '#e0457b', primary: '#e58a00', secondary: '#c9a400', tertiary: '#2f6fae', unclassified: '#6a7f94', residential: '#6a7f94', living_street: '#6a7f94', service: '#8d99a6', busway: '#6668ab' };
const OKHW = new Set(['motorway', 'trunk', 'primary', 'secondary']); /* 2026-11-17: na razie tylko autostrady, glowne i secondary (+ lacznice); dawniej + tertiary, unclassified, residential, living_street, service, busway */
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
  return o;
}
function dense(P, step) {
  const out = [P[0]];
  for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], n = Math.max(1, Math.round(dist(a, b) / step)); for (let j = 1; j <= n; j++) { const q = [a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n], l = out[out.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.01) out.push(q); } } /* bez powtorzonych punktow: zerowy odcinek psuje normalna offsetu (kolce) */
  return out;
}
function smoothDense(P0, step, tin, tout, force) { // centripetalna krzywa Catmull-Rom przez wierzchołki (węzły zostają na miejscu)
  const P = P0.filter((p, i) => i === 0 || dist(p, P0[i - 1]) > 1e-6); if (P.length < 2 || !(force || $('cSm').checked) || (P.length < 3 && !tin && !tout)) return dense(P0, step);
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
function layerOf(t) { let l = parseInt(t.layer, 10) || 0; if (t.bridge && t.bridge !== 'no' && l < 1) l = 1; if (t.tunnel && t.tunnel !== 'no' && l > -1) l = -1; return l; }
function makeRoad(o, a, b) {
  const t = o.t, hw = t.highway || '', base = hw.replace('_link', ''), ow = ['yes', '1', 'true', '-1'].includes(t.oneway) || t.junction === 'roundabout' || (base === 'motorway' && t.oneway !== 'no');
  const f = parseInt(t['lanes:forward'], 10) || 0, bk = parseInt(t['lanes:backward'], 10) || 0;
  let n = parseInt(t.lanes, 10) || (f + bk) || (ow || base === 'service' ? 1 : 2); if (n < 1) n = 1;
  const wd = parseFloat(String(t.width || '').replace(',', '.')), lw = wd > 2.5 ? wd / n : (LW_CLASS[base] || 3);
  const rank = RANK[base] || 1, minor = base === 'service' || base === 'living_street';
  let pts = o.g.slice(a, b + 1).map(p => [p[0], p[1]]), nk = o.nk.slice(a, b + 1);
  let tl = ow ? (t['turn:lanes'] || t['turn:lanes:forward'] || '') : (t['turn:lanes:forward'] || '');
  { const tn = tl ? tl.split('|').length : 0; if (ow && tn > n) n = tn; } /* brak lanes: liczba pasow z turn:lanes */
  if (t.oneway === '-1') { pts.reverse(); nk.reverse(); }
  const tfc = t['turn:lanes:forward'] ? t['turn:lanes:forward'].split('|').length : 0, tbc = t['turn:lanes:backward'] ? t['turn:lanes:backward'].split('|').length : 0, nf = ow ? n : (f || (bk && bk < n ? n - bk : 0) || (tfc && tfc < n ? tfc : 0) || (tbc && tbc < n ? n - tbc : 0) || Math.round(n / 2)); // liczba pasów forward: z tagów lanes:*, a gdy ich brak – z liczby pasów w turn:lanes:forward/backward
  return { pts, nk, lanes: n, lw: +lw.toFixed(2), oneway: ow, centre: 'auto', marked: t.lane_markings !== 'no' && !minor && n > 1 && (!!t.lanes || rank >= 3), edge: rank >= 3 && t.lane_markings !== 'no', kerb: true, osm: o.id, name: t.name || '', hw, tl, tlb: ow ? '' : (t['turn:lanes:backward'] || ''), nf, ly: layerOf(t), br: !!t.bridge && t.bridge !== 'no' };
}
const specOff = r => !!r._edge || (/^(primary|secondary)/.test(r.hw || '') && r._osg === -1); /* offset nieparzystych jezdni tylko w szczegolnych ukladach (turn:lanes z rozjazdem); inaczej os OSM jest na srodku */
const ruleOff = r => { const nl = r.lanes | 0; if (!(nl >= 3 && nl <= 6) || !r.oneway || !r.tl) return null; const t = r.tl.split('|'); if (t.length !== nl) return null; const st = x => x === '' || x === 'through' || x === 'none'; let a = 0; while (a < nl && !st(t[a])) a++; let b = nl; while (b > a && !st(t[b - 1])) b--; if (b - a < 2 || b - a === nl) return null; if (!t.slice(a, b).every(st)) return null; return nl / 2 - (a + b) / 2; }; /* turn:lanes: pasy skretu tylko na brzegach, >=2 pasy na wprost: os dokladnie na srodku pasow na wprost (offset = srodek jezdni - srodek pasow prosto) */
const rightRule = r => ruleOff(r) !== null;
const offBase = r => { const nl = r.lanes | 0; if (!r.oneway || !/^(motorway|trunk|primary|secondary)/.test(r.hw || '')) return 0; if (rightRule(r)) return ruleOff(r); return specOff(r) && nl >= 3 && nl % 2 === 1 ? (r._osg || 1) / 2 : 0; }; /* offset jezdni wzgledem osi w pasach */
const hasOff = r => (r.off != null && r.off !== '') || r.offS != null || r.offE != null;
const offAt = (r, e) => { const v = e ? r.offE : r.offS; return v != null && v !== '' ? +v : (r.off != null && r.off !== '' ? +r.off : offBase(r)); };
const noOff = r => { const t = (r.tl || '').split('|'); return (r.lanes | 0) === 3 && t.length === 3 && (t[0] === 'through' || t[0] === '') && t[1] === 'through' && /right/.test(t[2]); }; /* through|through|right: offset po lewej (dodatkowy pas z lewej) */
const newRoad = (pts, nk) => ({ pts, nk, lanes: 2, lw: 3.5, oneway: false, centre: 'auto', marked: true, edge: false, kerb: true, osm: 0, name: '', hw: 'residential', tl: '', nf: 1 });

// ---------- warstwa OSM ----------
async function loadOsmAround(lat, lon, box) {
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
    if (S.doc.del && S.doc.del.includes(o.id)) continue; const hw = (o.t.highway || '').replace('_link', ''); if (!OKHW.has(hw) || o.t.area === 'yes' || ['parking_aisle', 'driveway'].includes(o.t.service)) continue;
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
  const Q = (/^(motorway|trunk|primary|secondary)/.test(r.hw || '') && false) ? dense(filletPts(gp(r), +($('fR') ? $('fR').value : 80), Math.max(rw(r) / 2 + 0.5, Math.min(+($('fR') ? $('fR').value : 80), 25))), 2) : smoothDense(gp(r), 2, h && h.tin, h && h.tout, h && h.sm), w = Q.map(() => rw(r)), nl = r.lanes | 0, dS = offAt(r, 0) * (r.lw || 3.75), dE = offAt(r, 1) * (r.lw || 3.75), d0 = dS, cq0 = cumOf(Q), Lq0 = cq0[cq0.length - 1], free = j => { const k = r.nk[j]; return !k || !S.doc.road.some(x => x.nk !== r.nk && x.nk.includes(k)); }, fs = d0 && !hasOff(r) && free(0), fe = d0 && !hasOff(r) && free(r.nk.length - 1), Tf = Math.max(1, Math.min(30, Lq0 / 2)), sstep = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }, d = Q.map((_, j) => (dS + (dE - dS) * sstep(cq0[j] / Math.max(1, Lq0))) * Math.min(fs ? sstep(cq0[j] / Tf) : 1, fe ? sstep((Lq0 - cq0[j]) / Tf) : 1)); /* wolny koniec (nic sie nie laczy): os OSM na srodku jezdni, offset narasta plynnie w glab drogi; standardowy offset 3-pasmowki (dodatkowy pas po prawej) na calej dlugosci; konfiguracja turn:lanes prosto|w prawo|w prawo ma ponadto rozjazd liczony od tego offsetu (_edge) */ return { Q, w, d, d0, dS, dE, e: Q.map(() => 0), side: 1, cum: cumOf(Q) };
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
  let xN = nX * w / 2; if (nX % 2 === 1) { const extraNeg = neg.l < pos.l; xN = extraNeg ? w + (nX - 1) * w / 2 : (nX - 1) * w / 2; }
  if ((nX % 2 === 1 && R[X.i]._edge) || hasOff(R[X.i]) || rightRule(R[X.i])) xN = (X.st ? 1 : -1) * ((X.st ? C[X.i].dS : C[X.i].dE) || 0) + nX * w / 2; // turn:lanes: os na granicy pasa 'prosto' i pasow 'w prawo' - rozjazd liczony od tego offsetu
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
    const P0 = add(add(n0, mul(nE, o.c)), mul(e, sS)), P1 = D[iT], T1 = nrm(sub(D[Math.min(D.length - 1, iT + 1)], D[Math.max(0, iT - 1)])), L = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]) || 1, N = Math.max(4, Math.ceil(L / 0.5)), M0 = mul(e, L * 0.8), M1 = mul(T1, L), Cd = []; /* start rownolegly (styczna = przedluzenie wjazdu), ale krotki odcinek poczatkowy (0.35 L): rampa szybko sie odchyla */
    for (let q = 0; q < sS - 1e-6; q += 0.5) Cd.push(add(add(n0, mul(nE, o.c)), mul(e, q))); const pre = Cd.length;
    for (let k = 0; k <= N; k++) { const u = k / N, h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2; Cd.push([0, 1].map(q => h00 * P0[q] + h10 * M0[q] + h01 * P1[q] + h11 * M1[q])); }
    for (let k = iT + 1; k < D.length; k++) Cd.push(D[k]);
    o.Cd = Cd; o.nh = pre + N;
  }
  // zakaz nakladania: osie jezdni zjazdu nie moga zblizyc sie bardziej niz suma polowek szerokosci + margines; odsuwamy lagodnie (mniejsza odnoga ustepuje)
  if (arms[0].l + arms[1].l !== nX + 1) { const A = arms[0], B = arms[1], nA = A.Cd.length, nB = B.Cd.length, hs = (A.l + B.l) * w / 2, CL = 0, sh = A.straight !== B.straight ? (A.straight ? [0, 1] : [1, 0]) : (A.l === B.l ? [0.5, 0.5] : (A.l < B.l ? [1, 0] : [0, 1]));
    const pA = new Array(nA).fill(0), pB = new Array(nB).fill(0), dirA = new Array(nA), dirB = new Array(nB); let sA2 = 0;
    for (let i = 0; i < nA; i++) { if (i) sA2 += Math.hypot(A.Cd[i][0] - A.Cd[i - 1][0], A.Cd[i][1] - A.Cd[i - 1][1]); let bj = Math.min(nB - 1, i), bd = 1e9; for (let j = Math.max(0, i - 80); j < Math.min(nB, i + 80); j++) { const d = Math.hypot(A.Cd[i][0] - B.Cd[j][0], A.Cd[i][1] - B.Cd[j][1]); if (d < bd) { bd = d; bj = j; } }
      const need = hs + CL * sm5(Math.max(0, sA2 - 6) / 20), def = Math.max(0, need - bd); if (def > 0) { const v = nrm(sub(A.Cd[i], B.Cd[bj])); pA[i] = Math.max(pA[i], def * sh[0]); pB[bj] = Math.max(pB[bj], def * sh[1]); dirA[i] = v; dirB[bj] = mul(v, -1); } }
    const spread = P => { const n = P.length, r = 10; let Q = P.map((v, i) => { let m = 0; for (let k = Math.max(0, i - r); k <= Math.min(n - 1, i + r); k++) m = Math.max(m, P[k]); return m; }); for (let it = 0; it < 4; it++) { const Z = Q.slice(); for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let k = Math.max(0, i - 8); k <= Math.min(n - 1, i + 8); k++) { a += Q[k]; c++; } Z[i] = a / c; } Q = Z; } return Q; };
    const qA = spread(pA), qB = spread(pB);
    const apply = (O, q, dirs) => { const n = O.Cd.length, NN = O.Cd.map((_, i) => nOf(nrm(sub(O.Cd[Math.min(n - 1, i + 1)], O.Cd[Math.max(0, i - 1)])))); let bi = -1, bm = 0; for (let i = 0; i < n; i++) if (dirs[i] && q[i] > bm) { bm = q[i]; bi = i; } if (bi < 0) return; const sg = NN[bi][0] * dirs[bi][0] + NN[bi][1] * dirs[bi][1] >= 0 ? 1 : -1; // jedna, stala strona odsuniecia (od drugiej odnogi)
      for (let i = 0; i < n; i++) if (q[i] > 0.005) O.Cd[i] = [O.Cd[i][0] + NN[i][0] * sg * q[i], O.Cd[i][1] + NN[i][1] * sg * q[i]]; };
    const fadeIn = q => q.map((v, i) => v * sm5(i * 0.5 / 8)); apply(A, fadeIn(qA), dirA); apply(B, fadeIn(qB), dirB); }
  for (const o of arms) { const c = C[o.ye.i], Q = o.ye.st ? o.Cd : o.Cd.slice().reverse(); c.Q = Q; c.w = Q.map(() => o.l * w); { const d0a = R[o.ye.i].off != null && R[o.ye.i].off !== '' ? R[o.ye.i].off * w : offBase(R[o.ye.i]) * w, cq = cumOf(Q), Lq = cq[cq.length - 1], Lfa = Math.max(1, Math.min(150, Lq - Math.min(T, Lq / 2))); c.d0 = d0a; c.d = Q.map((_, j) => d0a * sm5(((o.ye.st ? cq[j] : Lq - cq[j]) - Math.min(T, Lq / 2)) / Lfa)); } c.e = Q.map(() => 0); c.side = 1; c.tf = undefined; c.cum = cumOf(Q); }
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
function skelLanes(G, C, R) {
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
  const T = Math.max(10, Math.min(+$('fT').value || 35, ow.cum[ow.cum.length - 1] / 1.5));
  const toDp = x => sf > 0 ? x : -x, linesN = [], linesW = [], BIG = 1e9, same = (x, arr) => arr.some(y => Math.abs(x - y) < 1e-6);
  const SN = [], SW = []; for (let k = 1; k < n; k++) SN.push(Nu[0] + k * w); for (let k = 1; k < m; k++) SW.push(Wu[0] + k * w);
  { const wl = SW.map(x => toDp(x) + sw), used = new Set(); /* linie pasow szerszej drogi: kazda linia wezszej przechodzi plynnie w najblizsza linie szerszej, nadmiarowe linie szerszej wyrastaja dalej */
    SN.forEach(x => { const q = toDp(x) + sn; let k = -1, bk = 1e9; wl.forEach((y, kk) => { if (!used.has(kk) && Math.abs(y - q) < bk) { bk = Math.abs(y - q); k = kk; } }); if (k >= 0) { used.add(k); linesW.push({ p: wl[k], p0: q, T, a: 0, b: BIG }); } linesN.push({ p: -toDp(x) - sn, a: 0, b: BIG }); });
    wl.forEach((y, kk) => { if (!used.has(kk)) linesW.push({ p: y, a: T * 0.6, b: BIG }); }); }
  const cl = x => Math.max(0, Math.min(1, x)), wR = Math.abs(Rm - Rn) >= Math.abs(Lm - Ln) - 1e-9, iL = wR ? Ln : Lm, iR = wR ? Rm : Rn; // nowy pas = klin; ciagly pas chwilowo na krawedzi, potem plynnie na srodek osi
  const prof = (a0, i0, a1) => ow.cum.map(s => a0 + (i0 - a0) * sm5(cl(s / (0.7 * T))) + (a1 - i0) * sm(cl((s / T - 0.3) / 0.7)));
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
  const R = S.doc.road, ends = new Map(), nodeRoads = new Map();
  { /* koncowki dwoch drog w tym samym miejscu bez wspolnego wezla: polacz (tylko gdy koniec nie ma klucza) */
    const E = []; R.forEach((r, i) => [0, r.pts.length - 1].forEach(j => E.push({ r, j, p: r.pts[j] })));
    for (let x = 0; x < E.length; x++) for (let y = x + 1; y < E.length; y++) { const A = E[x], B = E[y]; if (A.r === B.r || dist(A.p, B.p) > 0.4 || (A.r.nk[A.j] && B.r.nk[B.j])) continue; const k = A.r.nk[A.j] || B.r.nk[B.j] || 'n' + Math.random().toString(36).slice(2, 9); A.r.nk[A.j] = k; B.r.nk[B.j] = k; }
  }
  R.forEach((r, i) => { r.nk.forEach(k => { if (k) (nodeRoads.get(k) || nodeRoads.set(k, []).get(k)).push(i); }); [[0, true], [r.pts.length - 1, false]].forEach(([j, st]) => { const k = r.nk[j]; if (k) (ends.get(k) || ends.set(k, []).get(k)).push({ i, st }); }); });
  { // strona dodatkowego pasa nieparzystej jezdni jednokierunkowej: z turn:lanes (skrajny pas skreca w lewo/prawo), dalej wzdluz lancucha jezdni; domyslnie po prawej
    const sg0 = R.map(r => { if (!r.oneway || !/^(motorway|trunk)/.test(r.hw || '') || !r.tl || !((r.lanes | 0) >= 3 && (r.lanes | 0) % 2 === 1)) return 0; const t = r.tl.split('|').map(x => /left/.test(x) ? 'L' : /right/.test(x) ? 'R' : 'T'), n = t.length; if (n < 3) return 0; const restL = t.slice(1).every(x => x === t[1]), restR = t.slice(0, -1).every(x => x === t[0]); return n === 3 && t[0] === 'T' && t[1] === 'R' && t[2] === 'R' ? 1 : 0; /* tylko ta konfiguracja: prosto|w prawo|w prawo */ /* pojedynczy pas innego rodzaju na skraju (np. 1 prosto + 2 w prawo): os na granicy tego pasa i reszty */ });
    for (let it = 0; it < 60; it++) { let ch = false; for (const [, G] of ends) { if (G.length !== 2 || G[0].i === G[1].i) continue; const [a, b] = G; if (a.st === b.st) continue; const ra = R[a.i], rb = R[b.i]; if ((ra.lanes | 0) !== (rb.lanes | 0) || !ra.oneway || !rb.oneway) continue; if (sg0[a.i] && !sg0[b.i]) { sg0[b.i] = sg0[a.i]; ch = true; } else if (sg0[b.i] && !sg0[a.i]) { sg0[a.i] = sg0[b.i]; ch = true; } } if (!ch) break; }
    const edge0 = sg0.map((v, i) => v !== 0 || (R[i].off != null && R[i].off !== ''));
    R.forEach((r, i) => { Object.defineProperty(r, '_osg', { value: sg0[i] || (r.off != null && r.off !== '' ? (r.off < 0 ? -1 : 1) : (/^(primary|secondary)/.test(r.hw || '') && r.oneway && (r.lanes | 0) === 3 && r.tl && (tk => tk.length === 3 && tk[0] !== tk[1] && tk[1] === tk[2])(r.tl.split('|'))) ? -1 : 1), writable: true, configurable: true, enumerable: false }); Object.defineProperty(r, '_edge', { value: edge0[i], writable: true, configurable: true, enumerable: false }); });
  }
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
      if (TAPER2 && R[G[0].i].lanes !== R[G[1].i].lanes) skelLanes(G, C, R); // zmiana liczby pasow na szkielecie (jak w piaskownicy)
      continue;
    }
    if (G.length === 3 && nodeRoads.get(k).length === 3 && new Set(G.map(e => e.i)).size === 3) {
      const U = G.map(e => unitFrom(C[e.i], e.st)); let xi = 0, best = 9;
      U.forEach((u, a) => { const o = [0, 1, 2].filter(b => b !== a), v = u[0] * (U[o[0]][0] + U[o[1]][0]) + u[1] * (U[o[0]][1] + U[o[1]][1]); if (v < best) { best = v; xi = a; } });
      const ln = G.map(e => R[e.i].lanes), mx = Math.max(...ln); if (ln.filter(v => v === mx).length === 1) xi = ln.indexOf(mx);
      const X = G[xi], Ys = G.filter((_, a) => a !== xi), wX = rw(R[X.i]);
      if (U[xi][0] * (U[(xi + 1) % 3][0] + U[(xi + 2) % 3][0]) + U[xi][1] * (U[(xi + 1) % 3][1] + U[(xi + 2) % 3][1]) < -1.0 && R[X.i].lanes >= Math.max(R[Ys[0].i].lanes, R[Ys[1].i].lanes)) {
        handled.add(k);
        const T = R[X.i].lanes === 1 && R[Ys[0].i].lanes === 1 && R[Ys[1].i].lanes === 1 && Ys.every(e => { const uu = unitFrom(C[e.i], e.st); return -(uu[0] * U[xi][0] + uu[1] * U[xi][1]) > 0.5; }) /* obie gałęzie < 60° od przedłużenia wjazdu; prostopadła łącznica to skrzyżowanie T, nie rozjazd */ ? 'rozjazd-1-1+1' : R[X.i].lanes === 2 && R[Ys[0].i].lanes === 1 && R[Ys[1].i].lanes === 1 ? 'rozjazd-2-1+1' : (R[X.i].lanes === 3 && R[Ys[0].i].lanes === 2 && R[Ys[1].i].lanes === 2 ? 'rozjazd-3-2+2' : R[X.i].lanes === 3 && Ys.map(e => R[e.i].lanes).sort().join() === '1,2' ? 'rozjazd-3-2+1' : (R[X.i].lanes >= 2 && R[X.i].lanes <= 6 && (R[X.i].lanes === R[Ys[0].i].lanes + R[Ys[1].i].lanes || R[X.i].lanes + 1 === R[Ys[0].i].lanes + R[Ys[1].i].lanes) ? 'rozjazd-n' : null));
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
    if (G.length !== 1 || (nodeRoads.get(k) || []).length !== 2) continue; const e = G[0], bi = nodeRoads.get(k).find(i => i !== e.i), rA = R[e.i], rB = R[bi], iB = rB.nk.indexOf(k); if (iB <= 0 || iB >= rB.nk.length - 1) continue;
    if ((rB.lanes | 0) <= (rA.lanes | 0) || (RANK[(rB.hw || '').replace('_link', '')] || 1) < (RANK[(rA.hw || '').replace('_link', '')] || 1)) continue;
    const cA = C[e.i], cB = C[bi], nd = orient(cA, e.st).Q[0]; let bj = 0, bd = 1e9; cB.Q.forEach((q, j) => { const d = dist(q, nd); if (d < bd) { bd = d; bj = j; } }); if (bd > 3) continue;
    const tB = nrm2(sub2(cB.Q[Math.min(cB.Q.length - 1, bj + 1)], cB.Q[Math.max(0, bj - 1)])), U = unitFrom(cA, e.st), sinT = Math.abs(tB[0] * U[1] - tB[1] * U[0]), cosT = Math.abs(tB[0] * U[0] + tB[1] * U[1]); if (sinT < 0.3) continue;
    const nB = [-tB[1], tB[0]], sd = U[0] * nB[0] + U[1] * nB[1] > 0 ? 1 : -1, dB = (cB.d && cB.d[bj]) || 0, wB = (cB.w && cB.w[bj]) || rw(rB), ext = sd > 0 ? dB + wB / 2 : -(dB - wB / 2);
    slipEnd(e, rA, cA, nd, nB, sd, ext, sinT, cosT, rw(rA));
  }
  for (const [k, G] of ends) {
    if (G.some(g => forkX.has(g.i)) || G.length !== 3 || (nodeRoads.get(k) || []).length !== 3 || new Set(G.map(e => e.i)).size !== 3) continue; // wezel 3 drog: dwie przeciwlegle (droga glowna) + boczna (slip lane)
    const Us = G.map(e => unitFrom(C[e.i], e.st)); let pr = null, bestDot = 9; for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) { const dd = Us[a][0] * Us[b][0] + Us[a][1] * Us[b][1]; if (dd < bestDot) { bestDot = dd; pr = [a, b]; } }
    if (bestDot > -0.8) continue; const ti = [0, 1, 2].find(x => !pr.includes(x)), e = G[ti], rA = R[e.i], lb = pr.map(x => R[G[x].i].lanes | 0);
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
    G.forEach((e, a) => { const c = C[e.i], n = c.Q.length, Ln = c.cum[n - 1], Lf = Math.max(2, Math.min(40, Ln / 2)), cur = ed[a], want = a === 0 ? tg : [-tg[1], -tg[0]], dL = want[0] - cur[0], dR = want[1] - cur[1];
      for (let j = 0; j < n; j++) { const s = e.st ? c.cum[j] : Ln - c.cum[j], f = 1 - sm5(s / Lf); if (f <= 0) continue; const dd = (dL + dR) / 2 * f, dw = (dR - dL) * f; c.d[j] += e.st ? dd : -dd; c.w[j] += dw; } });
  }
  // cięcia linii na skrzyżowaniach (węzły niezałatwione jako zlanie/zwężenie)
  const polys = [], lines = [], arrows = preAr.slice();
  forkLinks.forEach(l => lines.push(l));
  // obrysy jezdni (do ukrywania linii krawedzi wewnatrz asfaltu sasiednich drog - zamiast kolowego wycinania wokol wezlow)
  const PO = C.map(c => { const ex = c.e.some(v => v > 0), eL = j => ex && c.side < 0 ? c.e[j] : 0, eR = j => ex && c.side > 0 ? c.e[j] : 0; const Lf = offsetPts(c.Q, c.d.map((v, j) => v - c.w[j] / 2 - eL(j))), Rt = offsetPts(c.Q, c.d.map((v, j) => v + c.w[j] / 2 + eR(j))); return Lf.concat(Rt.slice().reverse()); });
  const inPoly = (pt, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const connNb = R.map((r, i) => { const set = new Set(); r.nk.forEach(k => { if (!k || handled.has(k)) return; for (const j of nodeRoads.get(k) || []) { if (j === i) continue; const G = ends.get(k) || [], gi = G.find(e => e.i === i), gj = G.find(e => e.i === j); if (gi && gj) { const a = unitFrom(C[i], gi.st), b = unitFrom(C[j], gj.st); if (a[0] * b[0] + a[1] * b[1] < -0.8) continue; } set.add(j); } }); return [...set]; });
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
    polys.push({ P: Lf.concat(Rt.slice().reverse()), L: Lf, R: Rt, kerb: r.kerb }); edgeOf[i] = { Lf, Rt };
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
    if (r.edge || /^(motorway|trunk|primary|secondary|tertiary)/.test(r.hw || '')) {
      const len = c.cum[n - 1], kpe = sg => keep.map((kk, j) => kk && !(c.skipIn && c.skipIn.sg === sg && c.skipIn.m[j]) && !cutIn.some(ci => ci.i === i && ci.ss === sg && (ci.st ? c.cum[j] : len - c.cum[j]) < ci.s));
      const PLe = offsetPts(Q, c.d.map((v, j) => v - c.w[j] / 2 - eL(j))), PRe = offsetPts(Q, c.d.map((v, j) => v + c.w[j] / 2 + eR(j)));
      const hideN = p => connNb[i].some(j => inPoly(p, PO[j])), mkE = (P, sg) => keepE.map((v, j) => v && !(c.skipIn && c.skipIn.sg === sg && c.skipIn.m[j]) && !cutIn.some(ci => ci.i === i && ci.ss === sg && (ci.st ? c.cum[j] : len - c.cum[j]) < ci.s) && !inB(P[j]) && !hideN(P[j]));
      const plen = P => { let t = 0; for (let j = 1; j < P.length; j++) t += dist(P[j - 1], P[j]); return t; }, slipIn = c.slip && c.slip.length && /_link/.test(r.hw || '') ? (plen(PLe) > plen(PRe) ? -1 : 1) : 0; /* slip lane: strona od wyspy (wewnetrzna) bez bialej linii - tam jest krawieznik */
      if (slipIn !== -1) addLine(PLe, 'p2', mkE(PLe, -1)); if (slipIn !== 1) addLine(PRe, 'p2', mkE(PRe, 1));
    }
    if (r.tl) { // strzałki P-8 z turn:lanes
      const parts = r.tl.split('|'), len = c.cum[n - 1]; const NL = Math.max(1, r.lanes | 0), nb = NL - (r.oneway ? NL : r.nf);
      if (parts.length === (r.oneway ? NL : r.nf) && len > 25) {
        for (let sa = 9, cnt = 0; sa < len - 8 && cnt < 60; sa += (c.skipIn ? 38 : 21), cnt++) { // strzałki co ok. 21 m na calym odcinku z pelna liczba pasow, liczac od konca drogi
          const s = len - sa, p = atS(Q, c.cum, s), p2 = atS(Q, c.cum, s + 1), dx = p2[0] - p[0], dy = p2[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;
          let jn = 0, bd = 1e9; for (let j = 0; j < n; j++) { const dd = Math.abs(c.cum[j] - s); if (dd < bd) { bd = dd; jn = j; } }
          const exj = c.e[jn] > 0, eLj = exj && c.side < 0 ? c.e[jn] : 0, leftLat = c.d[jn] - c.w[jn] / 2 - eLj; // krawędź lewa wg faktycznej geometrii (offset, poszerzenie)
          if (Math.abs(c.w[jn] / (r.lw || 3.75) - NL) > 0.1) continue; // tylko tam, gdzie sa juz pelne pasy (nie w zwezeniu)
          parts.forEach((v, k) => {
            const set = new Set(v.split(';').map(x => x.replace('slight_', '').replace('sharp_', ''))); let key = ['through', 'left', 'right', 'reverse'].filter(x => set.has(x)).join('-'); if (set.has('merge_to_left')) key = 'p9a'; else if (set.has('merge_to_right')) key = 'p9b'; /* strzalki zbiegu pasow */
            if (key === 'through-left-right' || ARR.has(key)) { const lat = leftLat + (nb + k + 0.5) * r.lw; arrows.push({ x: p[0] + nx * lat, y: p[1] + ny * lat, rot: ang, type: key }); }
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
          if (key === 'through-left-right' || ARR.has(key)) { const lat = leftLat + (nbk - 1 - k + 0.5) * r.lw; arrows.push({ x: p[0] + nx * lat, y: p[1] + ny * lat, rot: ang, type: key }); }
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
    const FR = 5; /* promien luku [m] */
    for (const [k, G] of ends) {
      if (window.__noFil || forkDone.has(k) || G.length !== 3 || nodeRoads.get(k).length !== 3 || new Set(G.map(e => e.i)).size !== 3) continue;
      const U = G.map(e => unitFrom(C[e.i], e.st)); let a = 0, b = 1, best = 9;
      for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) { const d = U[p][0] * U[q][0] + U[p][1] * U[q][1]; if (d < best) { best = d; a = p; b = q; } }
      if (best > -0.7) continue; /* przelotowa musi byc prawie prosta */
      const ci = 3 - a - b, eC = G[ci], eA = G[a], eB = G[b], o = orient(C[eC.i], eC.st).Q[0];
      const uC = U[ci], t0 = [U[a][0] - U[b][0], U[a][1] - U[b][1]], tl = Math.hypot(t0[0], t0[1]) || 1, t = [t0[0] / tl, t0[1] / tl], nt = [-t[1], t[0]];
      const hC = rw(R[eC.i]) / 2, hT = Math.max(rw(R[eA.i]), rw(R[eB.i])) / 2, nC = [-uC[1], uC[0]], dn = uC[0] * nt[0] + uC[1] * nt[1];
      if (Math.abs(dn) < 0.5) continue;
      const sg = dn > 0 ? 1 : -1, ly = Math.max(R[eA.i].ly | 0, R[eB.i].ly | 0), fil = [];
      for (const s of [-1, 1]) {
        const lam = (sg * hT - s * hC * (nC[0] * nt[0] + nC[1] * nt[1])) / dn, I = [o[0] + nC[0] * s * hC + uC[0] * lam, o[1] + nC[1] * s * hC + uC[1] * lam];
        if (lam < -hT * 4 || lam > 40) continue;
        const u1 = uC, sd = (nC[0] * s * t[0] + nC[1] * s * t[1]) >= 0 ? 1 : -1, u2 = [t[0] * sd, t[1] * sd], cs = u1[0] * u2[0] + u1[1] * u2[1], phi = Math.acos(Math.max(-1, Math.min(1, cs)));
        if (phi < 0.35 || phi > 2.9) continue;
        let r = FR, L = r / Math.tan(phi / 2); if (L > 9) { r *= 9 / L; L = 9; }
        const T1 = [I[0] + u1[0] * L, I[1] + u1[1] * L], T2 = [I[0] + u2[0] * L, I[1] + u2[1] * L], bs = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(bs[0], bs[1]) || 1, cc = [I[0] + bs[0] / bl * r / Math.sin(phi / 2), I[1] + bs[1] / bl * r / Math.sin(phi / 2)];
        let a1 = Math.atan2(T1[1] - cc[1], T1[0] - cc[0]), a2 = Math.atan2(T2[1] - cc[1], T2[0] - cc[0]), da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const arc = []; for (let q = 0; q <= 14; q++) arc.push([cc[0] + r * Math.cos(a1 + da * q / 14), cc[1] + r * Math.sin(a1 + da * q / 14)]);
        fil.push({ I, L, T1, T2, arc });
      }
      if (!fil.length) continue;
      for (const f of fil) { /* wyciecie prostych krawedzi w obrebie luku i zastapienie lukiem */
        let E1 = null, E2 = null, d1 = 3, d2 = 3; const pieces = [];
        for (const l of lines) { if (l.st !== 'p2') continue; let run = []; const out = [];
          for (const p of l.P) { if (dist(p, f.I) < f.L - 0.02) { if (run.length) out.push(run); run = []; } else run.push(p); }
          if (run.length) out.push(run); if (out.length === 1 && out[0].length === l.P.length) continue;
          for (const R2 of out) for (const p of [R2[0], R2[R2.length - 1]]) { const q1 = dist(p, f.T1), q2 = dist(p, f.T2); if (q1 < d1) { d1 = q1; E1 = p; } if (q2 < d2) { d2 = q2; E2 = p; } }
          l.P = out[0] || []; for (let q = 1; q < out.length; q++) pieces.push({ P: out[q], st: 'p2', ly: l.ly });
        }
        lines.push(...pieces); for (let q = lines.length - 1; q >= 0; q--) if (lines[q].P.length < 2) lines.splice(q, 1);
        lines.push({ P: [E1, ...f.arc, E2].filter(Boolean), st: 'p2', ly });
        polys.push({ P: [f.I, f.T1, ...f.arc, f.T2], L: f.arc, R: f.arc, kerb: true, ly, br: false });
      }
    }
  }
  for (const [k, G] of ends) { /* zlacze dwoch drog: krawedziowe linie ciagle laczymy odcinkami (bez luk i uskokow na zakretach) */
    if (!(G.length === 2 && nodeRoads.get(k).length === 2 && G[0].i !== G[1].i)) continue;
    const nd = orient(C[G[0].i], G[0].st).Q[0], E = [];
    lines.forEach(l => { if (l.st !== 'p2' || l.P.length < 2) return; [0, l.P.length - 1].forEach(j => { if (dist(l.P[j], nd) < 5) E.push({ l, j, p: l.P[j] }); }); });
    const roadOfLine = l => { const j = lines.indexOf(l); for (let i = R.length - 1; i >= 0; i--) if (rng[i] && j >= rng[i][0]) return i; return -1; }; /* nie lacz dwoch krawedzi tej samej drogi (waski most: krawedzie leza blizej niz 4,5 m) */
    const pairs = []; for (let x = 0; x < E.length; x++) for (let y = x + 1; y < E.length; y++) if (E[x].l !== E[y].l && (E[x].l.ly | 0) === (E[y].l.ly | 0) && roadOfLine(E[x].l) !== roadOfLine(E[y].l)) { const d = dist(E[x].p, E[y].p); if (d > 0.02 && d < 4.5) pairs.push([d, x, y]); } /* mosty/wiadukty (inna warstwa) nie lacza sie krawedziami ze zwykla droga: tam sa barierki */
    pairs.sort((u, v) => u[0] - v[0]); const used = new Set();
    const isect = (A, B, C2, D2) => { const r = [B[0] - A[0], B[1] - A[1]], q = [D2[0] - C2[0], D2[1] - C2[1]], den = r[0] * q[1] - r[1] * q[0]; if (Math.abs(den) < 1e-9) return null; const t = ((C2[0] - A[0]) * q[1] - (C2[1] - A[1]) * q[0]) / den; return [A[0] + r[0] * t, A[1] + r[1] * t]; };
    for (const [, x, y] of pairs) { if (used.has(x) || used.has(y)) continue; used.add(x); used.add(y);
      const ex = E[x], ey = E[y], px = ex.l.P, py = ey.l.P, ax = ex.j === 0 ? px[1] : px[px.length - 2], ay = ey.j === 0 ? py[1] : py[py.length - 2], X = isect(ax, ex.p, ay, ey.p);
      if (X && dist(X, ex.p) < 4.5 && dist(X, ey.p) < 4.5) { px[ex.j] = X; py[ey.j] = X; } /* zakret: przeciecie krawedzi (wew. zakret obcina nachodzace konce, zew. przedluza) */
      else lines.push({ P: [ex.p, ey.p], st: 'p2', ly: ex.l.ly }); }
  }
  { // łączenie linii ciągłych, które kończą się w tym samym punkcie (brak dziur na styku dróg)
    const sol = lines.filter(l => l.st === 'p2'), rest = lines.filter(l => l.st !== 'p2'), tol = 0.7; let ch = true;
    while (ch) { ch = false;
      for (let i = 0; i < sol.length && !ch; i++) for (let j = i + 1; j < sol.length && !ch; j++) {
        const a = sol[i], b = sol[j]; if ((a.ly | 0) !== (b.ly | 0)) continue; const sa = a.P[0], ea = a.P[a.P.length - 1], sb = b.P[0], eb = b.P[b.P.length - 1];
        if (dist(ea, sb) < tol) a.P = a.P.concat(b.P.slice(1)); else if (dist(ea, eb) < tol) a.P = a.P.concat(b.P.slice(0, -1).reverse()); else if (dist(sa, eb) < tol) a.P = b.P.concat(a.P.slice(1)); else if (dist(sa, sb) < tol) a.P = b.P.slice(1).reverse().concat(a.P); else continue;
        sol.splice(j, 1); ch = true;
      }
    }
    lines.length = 0; lines.push(...rest, ...sol);
  }
  S.CC = C; S.forks = forks; S.forks3 = forks3; return { polys, lines, gores, arrows };
}

// ---------- strzałki ----------
function glyph(g, key) {
  if (key === 'p9a' || key === 'p9b') { const sg = key === 'p9a' ? -1 : 1; g.strokeStyle = g.fillStyle = '#f4f4f4'; g.lineWidth = 3.2; g.lineCap = 'butt'; const x0 = 6, y0 = 16 - sg * 6, x1 = 42, y1 = 16 + sg * 6, ang = Math.atan2(y1 - y0, x1 - x0); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - Math.cos(ang) * 4, y1 - Math.sin(ang) * 4); g.stroke(); g.save(); g.translate(x1, y1); g.rotate(ang); g.beginPath(); g.moveTo(5, 0); g.lineTo(-5, -5.5); g.lineTo(-5, 5.5); g.closePath(); g.fill(); g.restore(); return; }
  const parts = key.split('-'), has = p => parts.includes(p);
  g.strokeStyle = g.fillStyle = '#f4f4f4'; g.lineWidth = 3.2; g.lineCap = 'butt';
  const head = (x, y, ang) => { g.save(); g.translate(x, y); g.rotate(ang); g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -5.5); g.lineTo(-4, 5.5); g.closePath(); g.fill(); g.restore(); };
  const fork = has('through') ? 26 : 30;
  g.beginPath(); g.moveTo(2, 16); g.lineTo(has('through') ? 38 : fork, 16); g.stroke();
  if (has('through')) head(40, 16, 0);
  for (const [p, sg] of [['left', -1], ['right', 1]]) if (has(p)) { g.beginPath(); g.moveTo(fork - 6, 16); g.quadraticCurveTo(fork + 2, 16, fork + 4, 16 + sg * 7); g.stroke(); head(fork + 5, 16 + sg * 9.5, sg * Math.PI / 2 - sg * 0.35); }
}

// ---------- rysowanie ----------
const TILES = new Map(); let tq = 0; const tw = [];
const merc = (x, y, n) => { const R = 20037508.342789244; return [x / n * 2 * R - R, R - y / n * 2 * R]; };
async function fetchTile(kind, z, x, y, im) {
  while (tq >= (kind === 'orto' || kind === 'ortolo' ? 6 : 4)) await new Promise(r => tw.push(r)); tq++;
  try {
    { /* kafelek, ktory przestal byc widoczny (przesuniecie/zoom w trakcie kolejki), nie jest pobierany: kolejka obsluguje to, co jest na ekranie */ const n = 2 ** z, lo = v => v / n * 360 - 180, la = v => Math.atan(Math.sinh(Math.PI * (1 - 2 * v / n))) * 180 / Math.PI, a = w2s(proj(lo(x), la(y))), b = w2s(proj(lo(x + 1), la(y + 1))), zc = Math.log2(156543.03 * Math.cos(S.org.lat * Math.PI / 180) * S.view.k);
      if (b[0] < -300 || b[1] < -300 || a[0] > W + 300 || a[1] > H + 300 || Math.abs(z - Math.round(zc)) > 3) { TILES.delete(kind + z + '/' + x + '/' + y); return; } }
    let url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    if (kind === 'quiet') url = `https://a.basemaps.cartocdn.com/light_nolabels/${z}/${x}/${y}.png`;
    if (kind === 'esri') url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    if (kind === 'ortolo') { const n = 2 ** z, a = merc(x, y + 1, n), b = merc(x + 1, y, n); url = `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=Raster&STYLES=&FORMAT=image/jpeg&TRANSPARENT=FALSE&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX=${a[0]},${a[1]},${b[0]},${b[1]}`; }
    if (kind === 'orto') { const n = 2 ** z, a = merc(x, y + 1, n), b = merc(x + 1, y, n); url = `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=Raster&STYLES=&FORMAT=image/jpeg&TRANSPARENT=FALSE&CRS=EPSG:3857&WIDTH=512&HEIGHT=512&BBOX=${a[0]},${a[1]},${b[0]},${b[1]}`; }
    let cache = null; try { cache = await caches.open('edytor-podklad-v1'); const hit = await cache.match(url); if (hit) { im.src = URL.createObjectURL(await hit.blob()); return; } } catch (e) {}
    for (let t = 0; t < 5; t++) {
      const r = await fetch(url); if (r.ok) { try { if (cache) cache.put(url, r.clone()); } catch (e) {} im.src = URL.createObjectURL(await r.blob()); return; }
      if (![429, 500, 502, 503, 504].includes(r.status)) return; await new Promise(q => setTimeout(q, 400 * 2 ** t));
    }
  } catch (e) {} finally { tq--; const n = tw.pop(); if (n) n(); } /* najnowsze zadania pierwsze (LIFO): po przesunieciu mapy najpierw widoczne kafelki */
}
let srT = 0, srLast = 0; function schedRender() { if (srT) return; const wait = 0; srT = setTimeout(() => { srT = 0; srLast = performance.now(); requestAnimationFrame(render); }, wait); } /* zlaczone przerysowania po zaladowaniu kafelkow (w jezdzie max co ~350 ms) */
function tile(kind, z, x, y) { const k = kind + z + '/' + x + '/' + y; let im = TILES.get(k); if (!im) { im = new Image(); im.onload = schedRender; TILES.set(k, im); fetchTile(kind, z, x, y, im); } return im; }
function drawTiles() {
  if (!$('cTile').checked) return;
  const kind = $('bm').value; if (kind === 'quiet') { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#eceef1'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.restore(); return; } let z = Math.round(Math.log2(156543.03 * Math.cos(S.org.lat * Math.PI / 180) * S.view.k)); z = Math.max(2, Math.min(kind === 'orto' ? 20 : kind === 'ortolo' ? 18 : 19, z));
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
function asphaltPat(g, k) { // tekstura asfaltu: ziarno + plamy, kafel zakotwiczony w metrach (skaluje sie z zoomem)
  if (!ASPT) { const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N); let sd = 7; const rnd = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < N * N; i++) { const v = 112 + (rnd() - 0.5) * 26 + (rnd() < 0.04 ? (rnd() - 0.4) * 40 : 0); im.data[i * 4] = v; im.data[i * 4 + 1] = v + 1; im.data[i * 4 + 2] = v + 3; im.data[i * 4 + 3] = 255; }
    x.putImageData(im, 0, 0);
    for (let q = 0; q < 26; q++) { const px = rnd() * N, py = rnd() * N, r = 14 + rnd() * 34, a = (rnd() - 0.5) * 0.07; for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) { const gr = x.createRadialGradient(px + dx, py + dy, 0, px + dx, py + dy, r), col = a > 0 ? '255,255,255' : '0,0,0'; gr.addColorStop(0, 'rgba(' + col + ',' + Math.abs(a) + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)'); x.fillStyle = gr; x.fillRect(px + dx - r, py + dy - r, 2 * r, 2 * r); } }
    ASPT = c; }
  const p = g.createPattern(ASPT, 'repeat'), o = w2s([0, 0]), sc = k / 40; try { p.setTransform(new DOMMatrix([sc, 0, 0, sc, o[0], o[1]])); } catch (e) {} return p;
}
function drawGroup(g, ly) {
  const k = S.view.k; g.lineJoin = 'round'; const PAT = asphaltPat(g, k) || '#7c8083'; const Lp = L.polys.filter(q => (q.ly | 0) === ly), Lg = L.gores.filter(q => (q.ly | 0) === ly), Ll = L.lines.filter(q => (q.ly | 0) === ly), La = L.arrows.filter(q => (q.ly | 0) === ly);
  if (ly > 0) for (const q of Lp) if (q.br && q.P.length > 2) { /* cien mostu rzucony na nizsze warstwy: rozmyty, przesuniety w dol-prawo (slonce z lewej-gory), z ciemniejszym rdzeniem przy krawedzi */
    g.save(); g.lineJoin = 'round'; { /* cien tylko miedzy poprzecznymi koncami mostu: nie zachodzi na drogi dojazdowe (asfalt jednolity przy wjezdach) */ const A0 = q.L[0], B0 = q.R[0], A1 = q.L[q.L.length - 1], B1 = q.R[q.R.length - 1], n0 = [B0[0] - A0[0], B0[1] - A0[1]], n1 = [B1[0] - A1[0], B1[1] - A1[1]], l0 = Math.hypot(n0[0], n0[1]) || 1, l1 = Math.hypot(n1[0], n1[1]) || 1, W = 60, m0 = [(A0[0] + B0[0]) / 2, (A0[1] + B0[1]) / 2], m1 = [(A1[0] + B1[0]) / 2, (A1[1] + B1[1]) / 2]; pathOf(g, [[m0[0] - n0[0] / l0 * W, m0[1] - n0[1] / l0 * W], [m0[0] + n0[0] / l0 * W, m0[1] + n0[1] / l0 * W], [m1[0] + n1[0] / l1 * W, m1[1] + n1[1] / l1 * W], [m1[0] - n1[0] / l1 * W, m1[1] - n1[1] / l1 * W]], true); g.clip(); } for (const [dx, dy, bl, al] of [[2.6, 3.2, 1.6, 0.20], [1.2, 1.5, 0.7, 0.22]]) { g.save(); try { g.filter = 'blur(' + Math.max(0.5, bl * k) + 'px)'; } catch (e) {} g.translate(dx * k, dy * k); pathOf(g, q.P, true); g.fillStyle = 'rgba(8,10,14,' + al + ')'; g.fill(); g.restore(); } g.restore(); } // cień wiaduktu na niższych drogach
  for (const q of Lp) if (q.P.length > 2 && q.kerb !== false) { g.lineCap = 'butt'; g.lineJoin = 'round'; for (const [col, wd] of [['#6f716c', 0.84], ['#c4c6c0', 0.68]]) { g.strokeStyle = col; g.lineWidth = Math.max(1.5, wd * k); for (const E of [q.L, q.R]) { pathOf(g, E, false); g.stroke(); } } } // krawezniki: waski jasny pasek na zewnatrz konturu (wnetrze przykrywa jezdnia)
  { // asfalt jezdni: jeden wspolny obrys (jednolita powierzchnia bez szwow miedzy jezdniami); kierunek obrysow ujednolicony, zeby nakladajace sie nie wycinaly dziur
    g.beginPath(); let any = false; for (const q of Lp) if (q.P.length > 2) { let P = q.P.map(w2s), ar = 0; for (let i = 0; i < P.length; i++) { const a2 = P[i], b2 = P[(i + 1) % P.length]; ar += a2[0] * b2[1] - b2[0] * a2[1]; } if (ar < 0) P = P.reverse(); P.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); any = true; }
    if (any) { g.fillStyle = g.strokeStyle = '#7c8083'; g.lineWidth = 1; g.fill('nonzero'); g.fillStyle = PAT; g.fill('nonzero'); g.lineJoin = 'round'; g.lineWidth = Math.max(2.5, 0.3 * k); g.strokeStyle = '#7c8083'; g.stroke(); g.strokeStyle = PAT; g.stroke(); } /* obrys zakrywa waskie szczeliny miedzy sasiednimi jezdniami */
  }
  for (const q of Lp) if (q.P.length > 2) { if (ly > 0 && q.br) { g.lineCap = 'butt'; g.lineJoin = 'round'; for (const E of [q.L, q.R]) { /* dzwigar/fasada pomostu widoczna od spodu */ g.save(); g.translate(0.5 * k, 0.65 * k); pathOf(g, E, false); g.strokeStyle = '#43474d'; g.lineWidth = Math.max(2.5, 0.95 * k); g.stroke(); g.translate(-0.22 * k, -0.28 * k); pathOf(g, E, false); g.strokeStyle = '#8d9197'; g.lineWidth = Math.max(1.5, 0.38 * k); g.stroke(); g.restore(); /* barierki mostu: betonowy parapet 3D: cien rzucony na jezdnie, ciemna sciana boczna, jasny wierzch z listwa swiatla i slupki */ const sh = 0.55 * k; g.save(); g.translate(sh * 0.7, sh * 0.8); pathOf(g, E, false); g.strokeStyle = 'rgba(10,12,16,.32)'; g.lineWidth = Math.max(2.5, 0.75 * k); g.stroke(); g.restore(); pathOf(g, E, false); g.strokeStyle = '#6b6f75'; g.lineWidth = Math.max(2.5, 0.72 * k); g.stroke(); g.save(); g.translate(-0.07 * k, -0.09 * k); pathOf(g, E, false); g.strokeStyle = '#b4b8bd'; g.lineWidth = Math.max(1.5, 0.5 * k); g.stroke(); pathOf(g, E, false); g.strokeStyle = '#e4e6e9'; g.lineWidth = Math.max(1, 0.2 * k); g.stroke(); g.restore(); g.save(); pathOf(g, E, false); g.setLineDash([Math.max(1, 0.18 * k), Math.max(3, 4 * k)]); g.strokeStyle = '#555960'; g.lineWidth = Math.max(2.5, 0.74 * k); g.stroke(); g.restore(); } } }
  for (const q of Lg) { pathOf(g, q.poly, true); g.fillStyle = g.strokeStyle = '#7c8083'; g.lineWidth = 1; g.fill(); g.fillStyle = PAT; g.fill(); g.stroke(); }
  for (const q of Lg) if (q.cap) { g.strokeStyle = '#c9cdd2'; g.lineWidth = Math.max(1.5, 0.7 * k); g.lineCap = 'butt'; pathOf(g, q.cap, false); g.stroke(); } // koniec wyspy: krawężnik łączy się z krawężnikami jezdni
  const line = (P, st, col) => {
    const sty = LS[st] || LS.p1, one = Q => { pathOf(g, Q, false); g.setLineDash(sty.dash ? sty.dash.map(v => v * k) : []); g.lineWidth = Math.max(1, sty.w * k); g.strokeStyle = col || '#f2f2f2'; g.lineCap = 'butt'; g.stroke(); g.setLineDash([]); };
    if (sty.dbl) { one(offsetPts(P, -sty.dbl)); one(offsetPts(P, sty.dbl)); } else one(P);
  };
  for (const l of Ll) line(l.P, l.st);
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
/* przechwyt kontekstu iD: iD tworzy go lokalnie, wiec opakowujemy iD.coreContext zanim zostanie wywolane (skrypt startuje przed iD) */
(function () {
  const wrap = o => { try { if (o && typeof o.coreContext === 'function' && !o.coreContext.__idl) { const orig = o.coreContext, f = function () { const c = orig.apply(this, arguments); try { window.__idctx = c; } catch (e) {} return c; }; f.__idl = 1; Object.keys(orig).forEach(k => { try { f[k] = orig[k]; } catch (e) {} }); o.coreContext = f; } } catch (e) {} return o; };
  try { if (window.iD) wrap(window.iD); else { let v; Object.defineProperty(window, 'iD', { configurable: true, enumerable: true, get() { return v; }, set(x) { v = wrap(x); } }); } } catch (e) {}
})();
/* ---- adapter iD: graf iD -> model edytora, rysowanie na nakladce canvas ---- */
const IDL = { on: true, hide: true, raf: 0 };
function idCtx() { const ok = c => c && typeof c.map === 'function' && typeof c.graph === 'function' && typeof c.history === 'function' && typeof c.container === 'function'; for (const c of [window.__idctx, window.id, window.context, window.iD && window.iD.context]) if (ok(c)) return c; try { for (const k of Object.getOwnPropertyNames(window)) { let v; try { v = window[k]; } catch (e) { continue; } if (v && typeof v === 'object' && ok(v)) return v; } } catch (e) {} return null; }
function idBadge(t) { let b = document.getElementById('idlanes-badge'); if (!b) { b = document.createElement('div'); b.id = 'idlanes-badge'; b.style.cssText = 'position:fixed;right:70px;top:8px;z-index:99999;font:12px system-ui;background:#fff;border:1px solid #889;border-radius:6px;padding:3px 8px;box-shadow:0 1px 4px #0004'; (document.body || document.documentElement).appendChild(b); } b.textContent = t; return b; }
function idWhen(cb) { let n = 0; const t = setInterval(() => { if (window.__idlDom) { clearInterval(t); try { document.getElementById('idlanes-badge').remove(); } catch (e) {} return; } if (window.top === window && document.querySelector('iframe[src*="/id"]')) { clearInterval(t); return; } if (n === 0) idBadge('Pasy w iD: szukam edytora…'); const c = idCtx(); const mm = document.querySelector('.main-map, .supersurface, #id-container .main-content'); if (c && mm) { clearInterval(t); try { document.getElementById('idlanes-badge').remove(); } catch (e) {} cb(c); } else if (++n >= 6 && n % 4 === 2) { const cls = new Set(); document.querySelectorAll('div,svg,canvas').forEach(e => { if (cls.size < 12 && e.className && typeof e.className === 'string' && /map|surface|main|content|id-/.test(e.className)) cls.add(e.className.split(' ')[0]); }); idBadge('Pasy w iD v' + '2113' + ': ' + (c ? 'ctx ok' : 'brak ctx') + ', ' + (mm ? 'mapa ok' : 'brak mapy') + '; iD=' + typeof window.iD + ', hook=' + (window.iD && window.iD.coreContext && window.iD.coreContext.__idl ? 'tak' : 'nie') + ', ramki=' + [...document.querySelectorAll('iframe')].map(f => (f.src || f.getAttribute('src') || f.id || '?').slice(0, 90)).join(' ; ') + ', top=' + (window.top === window) + ', klasy=' + [...cls].join(' ')); } }, 500); }
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
    mk('Pasy: wł.', b => { IDL.on = !IDL.on; b.textContent = 'Pasy: ' + (IDL.on ? 'wł.' : 'wył.'); });
    IDL.hide = false; mk('Linie iD: wł.', b => { IDL.hide = !IDL.hide; b.textContent = 'Linie iD: ' + (IDL.hide ? 'wył.' : 'wł.'); css(); });
    mk('Diagnostyka', b => { const h = {}; sup.querySelectorAll('*').forEach(e => { const c = typeof e.className === 'string' ? e.className : (e.className && e.className.baseVal) || ''; const k = e.tagName.toLowerCase() + (c ? '.' + c.trim().split(/\s+/).slice(0, 3).join('.') : ''); h[k] = (h[k] || 0) + 1; }); const top = Object.entries(h).sort((x, y) => y[1] - x[1]).slice(0, 40).map(x => x[1] + 'x ' + x[0]).join('\n'); let pn = document.getElementById('idlanes-diag'); if (!pn) { pn = document.createElement('pre'); pn.id = 'idlanes-diag'; pn.style.cssText = 'position:absolute;left:8px;top:70px;z-index:70;max-width:70%;max-height:70%;overflow:auto;font:11px monospace;background:#fff;color:#222;border:1px solid #889;padding:6px;white-space:pre-wrap;pointer-events:auto'; pn.onclick = () => pn.remove(); mm.appendChild(pn); } pn.textContent = 'DIAG (klik = zamknij)\n' + top; });
    const st = document.createElement('style'); document.head.appendChild(st);
    const css = () => { st.textContent = IDL.hide ? ['motorway', 'trunk', 'primary', 'secondary'].map(h => '.layer-osm path.line[class*="tag-highway-' + h + '"],.layer-osm .line[class*="tag-highway-' + h + '"]').join(',') + '{display:none!important;visibility:hidden!important;opacity:0!important}' + ',.layer-labels,.layer-labels *,svg [class*="pathlabel"],svg [class*="textpath"],svg [class*="oneway"],svg [class*="sided"],svg [class*="onewaygroup"],svg text.pathlabel,.labels-group,.layer-osm marker,.layer-osm use[class*="oneway"]{display:none!important}' : ''; }; css();
    const ids = new WeakMap(); let nid = 0, last = '';
    const hashView = () => { const m = /map=([\d.]+)(?:\/|%2F)(-?[\d.]+)(?:\/|%2F)(-?[\d.]+)/i.exec(decodeURIComponent(location.hash || '')); return m ? { z: +m[1], lat: +m[2], lon: +m[3] } : null; };
    function ways() { const m = new Map(); document.querySelectorAll('.layer-osm path.line').forEach(p => { const d = p.__data__; if (d && d.type === 'way' && d.tags && d.tags.highway && !m.has(d.id)) m.set(d.id, d); }); return m; }
    let hs = 0; function hideLines() { if (Date.now() - hs < 120) return; hs = Date.now(); document.querySelectorAll('.layer-osm path, .layer-osm .onewaygroup, .layer-osm .sidedgroup, .layer-osm .oneway, .layer-osm .sided').forEach(p => { let d = p.__data__, q = p; for (let u = 0; u < 4 && !(d && d.type === 'way') && q.parentNode && q.parentNode !== document; u++) { q = q.parentNode; d = q.__data__; } if (!d || d.type !== 'way' || !d.tags || !d.tags.highway) return; const hw = String(d.tags.highway).replace('_link', ''); if (!OKHW.has(hw)) return; if (IDL.hide) { if (p.style.display !== 'none') p.style.setProperty('display', 'none', 'important'); p.setAttribute('data-idl-h', '1'); } else if (p.getAttribute('data-idl-h')) { p.style.removeProperty('display'); p.removeAttribute('data-idl-h'); } }); }
    function tick() { hideLines();
      const hv = hashView(), W0 = mm.clientWidth, H0 = mm.clientHeight; if (!hv || !W0 || !H0) return;
      const wm = ways(), sig = [hv.z, hv.lat, hv.lon, W0, H0, IDL.on]; for (const w of wm.values()) { let i = ids.get(w); if (!i) ids.set(w, i = ++nid); sig.push(i); }
      const key = sig.join(','); if (key === last) return; last = key;
      DPR = window.devicePixelRatio || 1; W = W0; H = H0; for (const c of [cvs, offc]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); } cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
      cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cvs.width, cvs.height); if (!IDL.on || hv.z < 16 || !wm.size) return;
      // graf aktualny = taki, ktory zwraca ta sama encje drogi co element SVG
      const first = wm.values().next().value; let g = null; for (const c of GR.slice().reverse()) { try { if (c.hasEntity(first.id) === first) { g = c; break; } } catch (e) {} } if (!g) g = GR[GR.length - 1];
      S.org = { lat: hv.lat, lon: hv.lon }; S.view.k = Math.pow(2, hv.z) / (156543.03 * Math.cos(hv.lat * Math.PI / 180)); S.view.x = 0; S.view.y = 0;
      const wmap = new Map(), roads = [];
      for (const e of wm.values()) { const hw = (e.tags.highway || '').replace('_link', ''); if (!OKHW.has(hw) || e.tags.area === 'yes' || e.nodes.length < 2) continue; const pts = [], nk = []; let bad = false; for (const n of e.nodes) { const nd = g.hasEntity(n); if (!nd || !nd.loc) { bad = true; break; } pts.push(proj(nd.loc[0], nd.loc[1])); nk.push(n); } if (bad) continue; const num = +String(e.id).slice(1), o = { id: num, t: { ...e.tags }, g: pts, nk }; wmap.set(num, o); try { roads.push(makeRoad(o, 0, pts.length - 1)); } catch (er) { console.warn('idlanes makeRoad', er); } }
      S.osm.ways = wmap; S.doc.road = roads; S.dirty = true; try { L = layout(); } catch (e) { console.warn('idlanes layout', e); L = null; } S.dirty = false; if (!L) return;
      ocx.setTransform(DPR, 0, 0, DPR, 0, 0); ocx.clearRect(0, 0, W, H); try { drawLayer(ocx); } catch (e) { console.warn('idlanes draw', e); } cx.drawImage(offc, 0, 0);
    }
    let lt = 0; const loop = t => { if (t - lt >= 30) { lt = t; try { tick(); } catch (e) { console.warn('idlanes tick', e); } } requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    window.__idlanes = IDL;
  }
})();

})();
