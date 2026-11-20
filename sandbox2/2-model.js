/* sandbox2 · model sceny i krótki zapis tekstowy.
   Zapis (to samo w scenach, „Kopiuj” i „Wklej”):
     W1 -80 0              węzeł: nazwa x y (m)
     A gl 3> W1 W2 | 30 6  droga: nazwa typ pasy(> = jednokier.) węzeł_od węzeł_do | punkty pośrednie x y …
   Typy (szerokość pasa): au autostrada 3.75, ek ekspresowa 3.5, gl główna 3.5, zb zbiorcza 3.25, lo lokalna 3.0, lc łącznica 3.5 */
'use strict';
const TYPY = {
  au: { lw: 3.75, R: 60, n: 'autostrada' },
  ek: { lw: 3.5, R: 45, n: 'ekspresowa' },
  gl: { lw: 3.5, R: 25, n: 'główna' },
  zb: { lw: 3.25, R: 18, n: 'zbiorcza' },
  lo: { lw: 3.0, R: 12, n: 'lokalna' },
  lc: { lw: 3.5, R: 30, n: 'łącznica' },
};
const lwOf = (r) => (TYPY[r.typ] || TYPY.gl).lw;
const hwOf = (r) => (r.pasy * lwOf(r)) / 2;

function parseScene(txt) {
  const sc = { nodes: new Map(), roads: [] };
  for (let ln of String(txt).split(/\r?\n/)) {
    ln = ln.replace(/#.*/, '').trim();
    if (!ln) continue;
    const [head, tail] = ln.split('|'),
      t = head.trim().split(/\s+/);
    if (/^W\w*$/.test(t[0]) && t.length === 3) {
      sc.nodes.set(t[0], { id: t[0], p: [+t[1], +t[2]] });
    } else if (t.length >= 5) {
      const m = /^(\d+)(>?)$/.exec(t[2]);
      if (!m) continue;
      const nums = (tail || '').trim().split(/\s+/).filter(Boolean).map(Number),
        mid = [];
      for (let i = 0; i + 1 < nums.length; i += 2) mid.push([nums[i], nums[i + 1]]);
      sc.roads.push({ id: t[0], typ: TYPY[t[1]] ? t[1] : 'gl', pasy: Math.max(1, +m[1]), jedn: !!m[2], a: t[3], b: t[4], mid });
    }
  }
  sc.roads = sc.roads.filter((r) => sc.nodes.has(r.a) && sc.nodes.has(r.b));
  return sc;
}

const fx = (v) => String(Math.round(v * 10) / 10);
function sceneText(sc) {
  const o = [];
  for (const n of sc.nodes.values()) o.push(`${n.id} ${fx(n.p[0])} ${fx(n.p[1])}`);
  for (const r of sc.roads)
    o.push(`${r.id} ${r.typ} ${r.pasy}${r.jedn ? '>' : ''} ${r.a} ${r.b}` + (r.mid.length ? ' | ' + r.mid.map((p) => fx(p[0]) + ' ' + fx(p[1])).join(' ') : ''));
  return o.join('\n');
}

/* łamana drogi od węzła a do b */
const roadPts = (sc, r) => [sc.nodes.get(r.a).p].concat(r.mid, [sc.nodes.get(r.b).p]);

/* ---------- sceny: krótka lista, bez wariantów kątów (kąty zmieniasz przeciągając węzły) ---------- */
const SCENY = [
  { g: 'Ciąg', n: 'Prosta', t: 'W1 -60 0\nW2 60 0\nA gl 2 W1 W2' },
  { g: 'Ciąg', n: 'Łuk', t: 'W1 -60 -30\nW2 50 40\nA gl 2 W1 W2 | 0 -10 20 0' },
  { g: 'Ciąg', n: 'Styk', t: 'W1 -70 0\nW2 0 0\nW3 50 45\nA gl 2 W1 W2\nB gl 2 W2 W3' },
  { g: 'Ciąg', n: 'Nawrót', t: 'W1 -60 10\nW2 30 0\nW3 -60 -14\nA gl 2> W1 W2\nB gl 2> W2 W3' },
  { g: 'Pasy', n: '+1', t: 'W1 -80 0\nW2 0 0\nW3 80 0\nA gl 2> W1 W2\nB gl 3> W2 W3' },
  { g: 'Pasy', n: '−1', t: 'W1 -80 0\nW2 0 0\nW3 80 0\nA gl 3> W1 W2\nB gl 2> W2 W3' },
  { g: 'Pasy', n: '2↔4', t: 'W1 -80 0\nW2 0 0\nW3 80 0\nA gl 2 W1 W2\nB gl 4 W2 W3' },
  { g: 'Pasy', n: 'Typ', t: 'W1 -80 0\nW2 0 0\nW3 80 0\nA lo 2 W1 W2\nB au 2 W2 W3' },
  { g: 'Rozjazd', n: '3→2+1', t: 'W1 -90 0\nW2 0 0\nW3 90 0\nW4 85 40\nA gl 3> W1 W2\nB gl 2> W2 W3\nC lc 1> W2 W4 | 35 8' },
  { g: 'Rozjazd', n: '2→1+1', t: 'W1 -90 0\nW2 0 0\nW3 80 25\nW4 80 -25\nA gl 2> W1 W2\nB gl 1> W2 W3\nC gl 1> W2 W4' },
  { g: 'Rozjazd', n: '4→2+2', t: 'W1 -90 0\nW2 0 0\nW3 90 30\nW4 90 -30\nA gl 4> W1 W2\nB gl 2> W2 W3\nC gl 2> W2 W4' },
  { g: 'Rozjazd', n: '3→2+2', t: 'W1 -90 0\nW2 0 0\nW3 90 0\nW4 85 -40\nA gl 3> W1 W2\nB gl 2> W2 W3\nC gl 2> W2 W4 | 35 -8' },
  { g: 'Rozjazd', n: 'Zjazd', t: 'W1 -120 0\nW2 0 0\nW3 120 0\nW4 110 -45\nA au 3> W1 W2\nB au 3> W2 W3\nC lc 1> W2 W4 | 45 -8' },
  { g: 'Włącz.', n: '2+1→3', t: 'W1 -90 0\nW2 0 0\nW3 90 0\nW4 -85 -40\nA gl 2> W1 W2\nC lc 1> W4 W2 | -35 -8\nB gl 3> W2 W3' },
  { g: 'Włącz.', n: 'Wjazd', t: 'W1 -120 0\nW2 0 0\nW3 120 0\nW4 -110 -45\nA au 3> W1 W2\nC lc 1> W4 W2 | -45 -8\nB au 3> W2 W3' },
  { g: 'Skrzyż.', n: 'T', t: 'W1 -70 0\nW2 0 0\nW3 70 0\nW4 0 -60\nA gl 2 W1 W2\nB gl 2 W2 W3\nC lo 2 W2 W4' },
  { g: 'Skrzyż.', n: 'X', t: 'W1 -70 0\nW2 0 0\nW3 70 0\nW4 0 -60\nW5 0 60\nA gl 4 W1 W2\nB gl 4 W2 W3\nC lo 2 W2 W4\nD lo 2 W2 W5' },
  { g: 'Skrzyż.', n: 'Skos', t: 'W1 -70 0\nW2 0 0\nW3 70 0\nW4 -40 -55\nW5 40 55\nA gl 2 W1 W2\nB gl 2 W2 W3\nC lo 2 W2 W4\nD lo 2 W2 W5' },
  { g: 'Skrzyż.', n: 'Y', t: 'W1 -70 0\nW2 0 0\nW3 50 50\nW4 50 -50\nA gl 2 W1 W2\nB gl 2 W2 W3\nC gl 2 W2 W4' },
];
