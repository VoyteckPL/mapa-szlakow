// Zapis krótki wzorców (📚 w sandbox-v1, {v1:[…]}) → sceny w formacie sc (nodes/roads) + ręczne krawędzie.
// Użycie: node tools/v1-krotki.js plik.json  → wypisuje [{sc, e, op, d}] (e: {droga: [L1,P1,L2,P2…]}).
function scena(o) {
  var sc = { nodes: {}, roads: [], tpl: o.t, srodek: o.o ? { lat: o.o[0], lng: o.o[1] } : undefined };
  Object.keys(o.n).forEach(function (k) { var q = o.n[k]; sc.nodes[k] = { lat: q[0], lng: q[1], main: !!q[2] }; });
  o.r.forEach(function (a) { var r = { id: a[0], pts: a[1].split(','), lanes: a[2], w: a[3], o0: a[4], o1: a[5] }; if (a[6]) r.turn = a[6]; sc.roads.push(r); });
  return sc;
}
module.exports = scena;
if (require.main === module) {
  var j = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(j.v1.map(function (o) { return { sc: scena(o), e: o.e, op: o.op, d: o.d }; })));
}
