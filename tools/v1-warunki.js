// Warunki geometrii sandbox-v1 (Wojtek 2026-11-21 20:16): (1) żaden pas nie jest odwrócony / skręcony, (2) pas trzyma
// szerokość (≥ 0,8·W na całej długości), (3) jezdnie różnych dróg na siebie nie nachodzą (> 5 cm).
// Przegląd: rozwidlenia i włączenia (pień + 2 odnogi) pod kątami co 10°, różne długości, + wszystkie wzorce Wojtka.
// Użycie: node tools/v1-warunki.js [--pelny] [--lista N]   (bez --pelny: kąty co 20°, szybciej)
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..'), ctx = { Math, console };
vm.createContext(ctx);
const html = fs.readFileSync(path.join(root, 'sandbox-v1.html'), 'utf8');
JSON.parse(html.match(/GEOM = (\[[^\]]*\])/)[1].replace(/'/g, '"')).forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }));
const G = vm.runInContext('G', ctx);
const arg = process.argv.slice(2); if (arg.includes('--dbg')) G.u.DBG = 1; const PELNY = arg.includes('--pelny'), LISTA = +(arg[arg.indexOf('--lista') + 1]) || 15;

const O = { lat: 54.5189, lng: 18.5305 };
function scena(name, build) {
  const sc = { nodes: {}, roads: [], tpl: name, srodek: O }; let n = 0, k = 0;
  const at = (x, y, main) => { const id = 'n' + ++n, p = G.toLL(O, [x, y]); sc.nodes[id] = { lat: p.lat, lng: p.lng, main: !!main }; return id; };
  const road = (pts, lanes) => { sc.roads.push({ id: 'R' + ++k, pts, lanes, w: 3.5, o0: 0, o1: 0 }); };
  build(at, road); return { n: name, sc };
}
const rad = (a) => (a * Math.PI) / 180, S = [];
const KOMBI = [[3, 2, 1], [3, 1, 2], [2, 1, 1], [4, 2, 2], [4, 3, 1]], KROK = PELNY ? 10 : 20;
KOMBI.forEach(([a, b, c]) => [20, 60].forEach((D) => {
  for (let t1 = -160; t1 <= 160; t1 += KROK) for (let t2 = -160; t2 <= 160; t2 += KROK) {
    if (t2 >= t1 || t1 - t2 < 20) continue; // odnoga b po lewej (większy kąt), c po prawej
    const u1 = [Math.cos(rad(t1)), Math.sin(rad(t1))], u2 = [Math.cos(rad(t2)), Math.sin(rad(t2))];
    S.push(scena(`rozw ${a}-${b}+${c} ${t1}/${t2} D${D}`, (at, road) => {
      const m = at(0, 0, true); road([at(-D, 0), m], a); road([m, at(u1[0] * D, u1[1] * D)], b); road([m, at(u2[0] * D, u2[1] * D)], c);
    }));
    S.push(scena(`włącz ${b}+${c}-${a} ${t1}/${t2} D${D}`, (at, road) => { // lustro: odnogi wjeżdżają, pień wyjeżdża na zachód→wschód
      const m = at(0, 0, true); road([m, at(D, 0)], a); road([at(-u2[0] * D, -u2[1] * D), m], b); road([at(-u1[0] * D, -u1[1] * D), m], c);
    }));
  }
}));
JSON.parse(fs.readFileSync(path.join(__dirname, 'v1-wzorce.json'), 'utf8')).forEach((w) => S.push(w));

// --- geometria pomocnicza
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], cr = (a, b) => a[0] * b[1] - a[1] * b[0], len = (a) => Math.hypot(a[0], a[1]);
function segX(p, q, r, s) { // właściwe przecięcie odcinków pq i rs (wnętrza, z marginesem) → true
  const d = cr(sub(q, p), sub(s, r)); if (Math.abs(d) < 1e-9) return false;
  const t = cr(sub(r, p), sub(s, r)) / d, u = cr(sub(r, p), sub(q, p)) / d, lp = len(sub(q, p)), lr = len(sub(s, r));
  const e1 = 0.01 / (lp || 1), e2 = 0.01 / (lr || 1);
  return t > e1 && t < 1 - e1 && u > e2 && u < 1 - e2;
}
function dSeg(q, a, b) { const ab = sub(b, a), l2 = ab[0] * ab[0] + ab[1] * ab[1]; let t = l2 ? ((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1]) / l2 : 0; t = Math.max(0, Math.min(1, t)); return len(sub(q, [a[0] + ab[0] * t, a[1] + ab[1] * t])); }
function dPoly(q, l) { let d = Infinity; for (let i = 0; i + 1 < l.length; i++) d = Math.min(d, dSeg(q, l[i], l[i + 1])); return d; }
function ext(l) { // polilinia z przedłużonymi końcami (szerokość przy ukośnym końcu liczona do przedłużenia)
  if (l.length < 2) return l; const n = l.length, a = sub(l[0], l[1]), b = sub(l[n - 1], l[n - 2]), la = len(a) || 1, lb = len(b) || 1;
  return [[l[0][0] + a[0] / la * 30, l[0][1] + a[1] / la * 30]].concat(l, [[l[n - 1][0] + b[0] / lb * 30, l[n - 1][1] + b[1] / lb * 30]]);
}
function samples(l, step) { const o = []; for (let i = 0; i + 1 < l.length; i++) { const s = len(sub(l[i + 1], l[i])), k = Math.max(1, Math.ceil(s / step)); for (let j = 0; j < k; j++) o.push([l[i][0] + (l[i + 1][0] - l[i][0]) * j / k, l[i][1] + (l[i + 1][1] - l[i][1]) * j / k]); } o.push(l[l.length - 1]); return o; }
function inside(q, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function area(poly) { let s = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += cr(poly[j], poly[i]); return s / 2; }
function proste(poly) { const n = poly.length; for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (segX(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false; } return true; }

function sprawdz(s) {
  const sc = s.sc, P = {}; for (const k in sc.nodes) P[k] = G.toXY(sc.srodek || O, sc.nodes[k]);
  const err = [], roads = sc.roads.filter((r) => r.pts.length > 1), Rg = [], OB = {};
  const obrys = (Pz) => { const e = Pz.map((l) => l[l.length - 1]), b = Pz.map((l) => l[0]).reverse(); // z przekrojami (końce wszystkich krawędzi)
    return Pz[0].concat(e.slice(1, -1), Pz[Pz.length - 1].slice().reverse(), b.slice(1, -1), [Pz[0][0]]); };
  roads.forEach((r) => { const Pz = G.lines(sc, r, P).pasy; if (Pz) OB[r.id] = obrys(Pz); });
  const PR = {}; roads.forEach((r) => { const Pz = G.lines(sc, r, P).pasy; if (Pz) PR[r.id] = [Pz.map((l) => l[0]), Pz.map((l) => l[l.length - 1])]; });
  const naInnej = (q, r) => Object.keys(PR).some((id) => id !== r.id && PR[id].some((pr) => dPoly(q, pr) < 0.02)); // na przekroju innej drogi
  const rdzen = (l, r) => { // najdłuższy ciąg odcinków nieleżących na obrysie innej drogi
    let best = [], cur = [];
    for (let i = 0; i + 1 < l.length; i++) { const mid = [(l[i][0] + l[i + 1][0]) / 2, (l[i][1] + l[i + 1][1]) / 2];
      if (naInnej(mid, r)) { if (cur.length > best.length) best = cur; cur = []; } else { if (!cur.length) cur.push(l[i]); cur.push(l[i + 1]); } }
    if (cur.length > best.length) best = cur; return best.length ? best : l; };
  roads.forEach((r) => {
    const g = G.lines(sc, r, P), Pz = g.pasy || null; if (!Pz) return;
    const W = r.w, L = Pz.length / 2;
    for (let j = 0; j < L; j++) {
      const l = Pz[2 * j], p = Pz[2 * j + 1], poly = l.concat(p.slice().reverse());
      // (1) odwrócenie / skręcenie: pas = wielokąt prosty, lewa krawędź po lewej (pole < 0 w układzie y w górę: lewa→, prawa←)
      if (!proste(poly)) err.push(`${r.id} pas ${j + 1}: skręcony`);
      else if (area(poly) > 1e-3) err.push(`${r.id} pas ${j + 1}: odwrócony`);
      // (2) szerokość ≥ 0,8·W (od każdej krawędzi do przedłużonej drugiej)
      // odcinki styku (leżące na obrysie innej drogi: przekrój, klin wzdłuż krawędzi pnia) nie są krawędzią pasa – pomijane
      let m = Infinity, gdzie = null; const pe = ext(rdzen(p, r)), le = ext(rdzen(l, r));
      rdzen(l, r).length && samples(rdzen(l, r), 1).forEach((q) => { if (naInnej(q, r)) return; const d = dPoly(q, pe); if (d < m) { m = d; gdzie = q; } });
      rdzen(p, r).length && samples(rdzen(p, r), 1).forEach((q) => { if (naInnej(q, r)) return; const d = dPoly(q, le); if (d < m) { m = d; gdzie = q; } });
      if (m < 0.8 * W) err.push(`${r.id} pas ${j + 1}: szer. ${m.toFixed(2)} m przy (${gdzie.map((v) => v.toFixed(1))})`);
    }
    Rg.push({ r, poly: OB[r.id].slice(0, -1) });
  });
  // (3) nachodzenie: punkt krawędzi jezdni A wewnątrz jezdni B dalej niż 5 cm od jej obrysu
  for (const A of Rg) for (const B of Rg) { if (A === B) continue;
    let m = 0, gdzie = null; samples(A.poly.concat([A.poly[0]]), 0.25).forEach((q) => { if (!inside(q, B.poly)) return; const d = dPoly(q, B.poly.concat([B.poly[0]])); if (d > m) { m = d; gdzie = q; } });
    if (m > 0.05 && A.r.id < B.r.id) err.push(`${A.r.id}↔${B.r.id}: nachodzą ${m.toFixed(2)} m przy (${gdzie.map((v) => v.toFixed(1))})`); }
  return err;
}

let zle = 0; const typy = {}, przyk = [];
if (!arg.some((a) => /^--(pokaz|siatka|zakres|do90)$/.test(a))) S.forEach((s) => { let e; try { e = sprawdz(s); } catch (x) { e = ['wyjątek: ' + x.message]; }
  if (e.length) { zle++; e.forEach((t) => { const k = t.replace(/^R\d+(↔R\d+)? (pas \d+)?:? ?/, '').replace(/[\d.,() -]+m?.*$/, '').trim() || t; typy[k] = (typy[k] || 0) + 1; }); if (przyk.length < LISTA || /^wzorzec/.test(s.n)) przyk.push(s.n + ': ' + e.join('; ')); } });
if (przyk.length || zle) console.log(przyk.join('\n'));
if (!arg.some((a) => /^--(pokaz|siatka|zakres|do90)$/.test(a))) console.log('typy błędów:', JSON.stringify(typy));
console.log(`sceny z błędami: ${zle} / ${S.length}`);
process.exitCode = zle ? 1 : 0;
if (arg.includes('--siatka')) { // mapa błędów: wiersze t1 (odnoga lewa), kolumny t2 (prawa); . ok, S skręcony/odwrócony, W szerokość, N nachodzenie
  const pre = arg[arg.indexOf('--siatka') + 1];
  const ks = []; for (let t = -160; t <= 160; t += KROK) ks.push(t);
  console.log(pre + '\n      ' + ks.map((t) => String(t).padStart(4)).join(''));
  ks.forEach((t1) => console.log(String(t1).padStart(5) + ' ' + ks.map((t2) => {
    const s = S.find((x) => x.n === `${pre} ${t1}/${t2} ${arg[arg.indexOf("--siatka") + 2] || "D60"}`); if (!s) return '    ';
    const e = sprawdz(s).join(' '); return ('   ' + ((/skręc|odwr/.test(e) ? 'S' : '') + (/szer/.test(e) ? 'W' : '') + (/nachodz/.test(e) ? 'N' : '') || '.')).slice(-4);
  }).join('')));
}
if (arg.includes('--pokaz')) { const nm = arg[arg.indexOf('--pokaz') + 1], s = S.find((x) => x.n === nm); const P = {}; for (const k in s.sc.nodes) P[k] = G.toXY(s.sc.srodek || O, s.sc.nodes[k]);
  console.log(sprawdz(s).join('\n')); s.sc.roads.forEach((r) => console.log(r.id, r.lanes, JSON.stringify(G.lines(s.sc, r, P).pasy.map((l) => l.map((q) => q.map((v) => +v.toFixed(2)))))));
  const f2 = (v) => v && v.map((x) => +x.toFixed(2));
  if (arg.includes('--dbg')) { const r = s.sc.roads.find((x) => x.id === arg[arg.indexOf('--dbg') + 1]), Pc = G.u.clearP(s.sc, P), E0 = G.u.endSection(s.sc, r, true, Pc), E1 = G.u.endSection(s.sc, r, false, Pc);
    ['odsun', 'odsun2'].forEach((k) => E0[k] && console.log(k, JSON.stringify(E0[k].ref.slice(0, 4).map(f2)), JSON.stringify(f2(E0[k].side)), E0[k].D, JSON.stringify((E0.pre || []).map((q) => f2(G.u.odsunPtE(E0[k], q)))))); console.log('pre0', JSON.stringify((E0.pre || []).map(f2)), 'pre1', JSON.stringify((E1.pre || []).map(f2)), 'oA', E0.oAuto, E1.oAuto, 'lanes', JSON.stringify(G.lines(s.sc, r, P).lanes.map((l) => l.map(f2)))); } for (const id in P) { const W = G.u.wezel2 && G.u.wezel2(s.sc, id, G.u.clearP(s.sc, P)); if (W) W.ord.forEach((o) => console.log(id, o.B.id,
    JSON.stringify({ f1: +(o.f1 * 57.3).toFixed(1), f2: +(o.f2 * 57.3).toFixed(1), Ls: +o.Ls.toFixed(2), l2: +o.l2.toFixed(2), P0: f2(o.P0), S: f2(o.S), S2: f2(o.S2), q: f2(o.q) }))); } }
if (arg.includes('--zakres')) { // statystyka wg zakresu kątów odnóg względem kierunku pnia
  const z = {}; S.forEach((s) => { const m = /^(rozw|włącz) (\S+) (-?\d+)\/(-?\d+) (D\d+)$/.exec(s.n); if (!m) return;
    const a = Math.max(Math.abs(+m[3]), Math.abs(+m[4])), k = m[1] + ' ' + m[5] + (a <= 60 ? ' ≤60°' : a <= 90 ? ' ≤90°' : ' >90°');
    z[k] = z[k] || [0, 0]; z[k][1]++; if (sprawdz(s).length) z[k][0]++; });
  Object.keys(z).sort().forEach((k) => console.log(k.padEnd(18), z[k][0] + '/' + z[k][1])); }
if (arg.includes('--do90')) S.forEach((s) => { const m = /^(rozw|włącz) (\S+) (-?\d+)\/(-?\d+) (D\d+)$/.exec(s.n); if (!m || Math.max(Math.abs(+m[3]), Math.abs(+m[4])) > 90) return;
  const e = sprawdz(s); if (e.length) console.log(s.n + ': ' + e.join('; ')); });
