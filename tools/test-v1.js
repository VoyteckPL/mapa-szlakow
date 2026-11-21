// Test regresji geometrii sandbox-v1 (node, bez przeglądarki):  node tools/test-v1.js [--zapisz]
// Sceny: tools/v1-wzorce.json (wzorce Wojtka) + szablony i przeglądy kątów generowane tutaj.
// Dla każdej sceny: G.lines / G.endInfo / G.nodeType wszystkich dróg i węzłów → odcisk (sha1, zaokr. 1e-6 m).
// --zapisz zapisuje odciski do tools/v1-oczekiwane.json; bez flagi porównuje z nimi (zmiana = błąd).
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..'), ctx = { Math, console };
vm.createContext(ctx);
// pliki geometrii w kolejności z sandbox-v1.html
const html = fs.readFileSync(path.join(root, 'sandbox-v1.html'), 'utf8');
const files = JSON.parse(html.match(/GEOM = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }));
const G = vm.runInContext('G', ctx);

const O = { lat: 54.5189, lng: 18.5305 };
function scena(name, build, turn) {
  const sc = { nodes: {}, roads: [], tpl: name, srodek: O }; let n = 0, k = 0;
  const at = (x, y, main) => { const id = 'n' + ++n, p = G.toLL(O, [x, y]); sc.nodes[id] = { lat: p.lat, lng: p.lng, main: !!main }; return id; };
  const road = (pts, lanes, o0, o1) => { sc.roads.push({ id: 'R' + ++k, pts, lanes, w: 3.5, o0: o0 || 0, o1: o1 || 0 }); };
  build(at, road); if (turn) sc.roads[0].turn = turn; return { n: name, sc };
}
const rad = (a) => (a * Math.PI) / 180, S = [];
// szablony z nm.js
[[2, 2], [3, 3], [4, 4], [2, 3], [3, 2], [3, 4], [4, 3]].forEach(([a, b]) => S.push(scena('prosto ' + a + '-' + b, (at, road) => {
  const m = at(0, 0, true); road([at(-120, 0), at(-60, 0), m], a); road([m, at(60, -8), at(120, -20)], b, (b - a) / 2);
})));
const kombi = [[2, 1, 1], [3, 2, 1], [3, 1, 2], [4, 2, 2], [4, 3, 1]];
kombi.forEach(([a, b, c]) => S.push(scena('rozw ' + a + '-' + b + '+' + c, (at, road) => {
  const m = at(0, 0, true); road([at(-150, 0), at(-75, 0), m], a); road([m, at(75, 0), at(150, 0)], b); road([m, at(50, -12), at(110, -40)], c);
})));
// turn:lanes pnia (geom/turn.js): przydział pasów pnia do odnóg i offset pnia
[[3, [[2, 75, 0], [1, 50, -12]], ['through|through|right', 'left;through|through|right', 'through|through;right|right', 'through|right|right']],
 [4, [[1, 40, 40], [2, 75, 0], [1, 40, -40]], ['left|through|through|right', 'left|left;through|through|right', 'left;through|through|through;right|right', 'slight_left|through|through|sharp_right']]]
  .forEach(([La, br, tt]) => tt.forEach((t) => S.push(scena('turn ' + La + ' ' + t, (at, road) => {
    const m = at(0, 0, true); road([at(-150, 0), at(-75, 0), m], La); br.forEach(([l, x, y]) => road([m, at(x, y), at(2 * x, 2 * y)], l));
  }, t))));
// przegląd kątów odnogi (rozwidlenie i włączenie), odnoga w prawo i w lewo, daleki i bliski 1. węzeł
kombi.forEach(([a, b, c]) => [1, -1].forEach((s) => [60, 12].forEach((d1) => {
  for (let k = 3; k <= 177; k += 6) {
    const u = [Math.cos(rad(k)), -s * Math.sin(rad(k))];
    S.push(scena(`kąt ${a}-${b}+${c} ${k}° ${s > 0 ? 'P' : 'L'} d${d1}`, (at, road) => {
      const m = at(0, 0, true); road([at(-150, 0), at(-75, 0), m], a); road([m, at(75, 0), at(150, 0)], b);
      road([m, at(u[0] * d1, u[1] * d1), at(u[0] * d1 + 60, u[1] * d1 - s * 30)], c);
    }));
    S.push(scena(`włącz ${a}-${b}+${c} ${k}° ${s > 0 ? 'P' : 'L'} d${d1}`, (at, road) => {
      const m = at(0, 0, true); road([at(-150, 0), at(-75, 0), m], b); road([m, at(75, 0), at(150, 0)], a);
      road([at(-u[0] * d1 - 60, u[1] * d1 - s * 30), at(-u[0] * d1, u[1] * d1), m], c);
    }));
  }
})));
JSON.parse(fs.readFileSync(path.join(__dirname, 'v1-wzorce.json'), 'utf8')).forEach((w) => S.push(w));

const r6 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
function odcisk(sc) {
  const P = {}; for (const k in sc.nodes) P[k] = G.toXY(sc.srodek || O, sc.nodes[k]);
  const out = { typy: Object.keys(sc.nodes).map((k) => G.nodeType(sc, k, P)), drogi: [] };
  sc.roads.filter((r) => r.pts.length > 1).forEach((r) => {
    const g = G.lines(sc, r, P);
    out.drogi.push({ g, e0: G.endInfo(sc, r, true, P), e1: G.endInfo(sc, r, false, P) });
  });
  return JSON.stringify(out, (k, v) => r6(v));
}
const wyn = {}; let bledy = 0;
S.forEach((s) => {
  try { wyn[s.n] = crypto.createHash('sha1').update(odcisk(JSON.parse(JSON.stringify(s.sc)))).digest('hex').slice(0, 16); }
  catch (e) { wyn[s.n] = 'BŁĄD ' + e.message; }
});
const plik = path.join(__dirname, 'v1-oczekiwane.json');
if (process.argv.includes('--zapisz')) { fs.writeFileSync(plik, JSON.stringify(wyn, null, 0).replace(/,"/g, ',\n"') + '\n'); console.log('zapisano', S.length, 'scen'); }
else {
  const ocz = JSON.parse(fs.readFileSync(plik, 'utf8'));
  for (const k in ocz) if (ocz[k] !== wyn[k]) { bledy++; if (bledy <= 20) console.log('✗', k, wyn[k] || 'brak'); }
  console.log(bledy ? `BŁĘDY: ${bledy} / ${Object.keys(ocz).length}` : `OK ${Object.keys(ocz).length} scen`);
  process.exit(bledy ? 1 : 0);
}
