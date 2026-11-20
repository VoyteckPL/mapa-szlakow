/* sandbox2 · testy geometrii: każda scena + 12 losowych wariantów (przesunięte węzły = różne kąty).
   Reguły ogólne, te same dla każdej sceny. W konsoli: testy2() → lista błędów. */
'use strict';
function sprawdz(B) {
  const E = [],
    bad = (p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]);
  const selfX = (P) => {
    for (let i = 1; i < P.length; i++) for (let j = i + 2; j < P.length; j++) if (G.segX(P[i - 1], P[i], P[j - 1], P[j])) return P[i];
    return null;
  };
  const crossX = (A, Bp) => {
    for (let i = 1; i < A.length; i++) for (let j = 1; j < Bp.length; j++) if (G.segX(A[i - 1], A[i], Bp[j - 1], Bp[j])) return A[i];
    return null;
  };
  for (const c of B.ciagi) {
    const id = c.seq.map((s) => s.r.id).join('');
    if (c.lines.some((l) => l.P.some(bad))) E.push('NaN w ' + id);
    for (const l of c.lines) {
      if (l.kind !== 'kraw') continue;
      if (selfX(l.P)) E.push('pętla krawędzi ' + id);
    }
    if (c.edgeL.length && crossX(c.edgeL, c.edgeR)) E.push('krawędzie się krzyżują ' + id);
  }
  for (const w of B.wezly) if (w.poly.some(bad)) E.push('NaN w węźle ' + w.nk);
  for (const f of B.rozjazdy) {
    const ends = (a) => (a.at ? [a.c.edgeL[a.c.edgeL.length - 1], a.c.edgeR[a.c.edgeR.length - 1]] : [a.c.edgeL[0], a.c.edgeR[0]]);
    const P = ends(f.P),
      br = ends(f.L).concat(ends(f.R));
    P.forEach((p) => br.some((q) => G.dist(p, q) < 0.1) || E.push(f.nk + ': krawędź pnia bez gałęzi'));
    br.forEach((q) => {
      const ab = G.sub(P[1], P[0]),
        t = Math.max(0, Math.min(1, G.dot(G.sub(q, P[0]), ab) / G.dot(ab, ab)));
      if (G.dist(q, G.add(P[0], G.mul(ab, t))) > 0.1) E.push(f.nk + ': gałąź poza przekrojem pnia');
    });
    /* gałąź nie wchodzi na asfalt drugiej gałęzi (głębiej niż 10 cm) */
    const inner = (a, right) => {
      const e = right ? a.c.edgeR : a.c.edgeL;
      return a.at ? e.slice().reverse() : e;
    };
    const dPoly = (p, P) => {
      let m = 1e9;
      for (let i = 1; i < P.length; i++) {
        const ab = G.sub(P[i], P[i - 1]),
          t = Math.max(0, Math.min(1, G.dot(G.sub(p, P[i - 1]), ab) / (G.dot(ab, ab) || 1)));
        m = Math.min(m, G.dist(p, G.add(P[i - 1], G.mul(ab, t))));
      }
      return m;
    };
    /* osie OSM gałęzi przecinają się = błąd danych, nie renderu → pomijamy */
    const raw = (a) => (a.at ? a.c.raw.slice().reverse() : a.c.raw).slice(0);
    const onto = (p, P) => {
      let m = 1e9;
      for (let i = 1; i < P.length; i++) {
        const ab = G.sub(P[i], P[i - 1]),
          t = Math.max(0, Math.min(1, G.dot(G.sub(p, P[i - 1]), ab) / (G.dot(ab, ab) || 1)));
        m = Math.min(m, G.dist(p, G.add(P[i - 1], G.mul(ab, t))));
      }
      return m;
    };
    /* albo koniec jednej gałęzi leży na osi drugiej (osie nachodzą) */
    const rl = raw(f.L),
      rr = raw(f.R),
      osmX = crossX(rl, rr) || onto(rl[rl.length - 1], rr) < f.R.hw + f.L.hw || onto(rr[rr.length - 1], rl) < f.R.hw + f.L.hw;
    if (!osmX && f.L.hw + f.R.hw <= f.P.hw + 0.01) for (const [a, b] of [
      [f.L, f.R],
      [f.R, f.L],
    ]) {
      const e = inner(a, a === f.L ? !a.at : !!a.at);
      if (e.some((p) => G.inPoly(p, b.c.poly) && dPoly(p, b.c.poly) > 0.1)) {
        E.push(f.nk + ': gałęzie nachodzą na siebie');
        break;
      }
    }
  }
  return [...new Set(E)];
}
function testy2(nWar = 12) {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out = [];
  for (const s of SCENY) {
    for (let v = 0; v <= nWar; v++) {
      const sc = parseScene(s.t);
      if (v) {
        for (const n of sc.nodes.values()) n.p = [n.p[0] + (rnd() - 0.5) * 50, n.p[1] + (rnd() - 0.5) * 50];
        sc.roads.forEach((r) => (r.mid = r.mid.map((p) => [p[0] + (rnd() - 0.5) * 20, p[1] + (rnd() - 0.5) * 20])));
      }
      let E;
      try {
        E = sprawdz(buduj(sc));
      } catch (e) {
        E = ['wyjątek: ' + e.message];
      }
      if (E.length) out.push({ n: s.g + ' ' + s.n + (v ? ' #' + v : ''), E, t: sceneText(sc) });
    }
  }
  out.total = SCENY.length * (nWar + 1);
  return out;
}
document.getElementById('bTest').onclick = () => {
  const R = testy2(),
    el = document.getElementById('testy');
  el.innerHTML =
    `<b>${R.total - R.length}/${R.total} OK</b>` +
    R.map((r, i) => `<div class="t bad" data-i="${i}" title="${r.E.join('\n')}">✗ ${r.n}<br><small>${r.E[0]}</small></div>`).join('');
  el.querySelectorAll('.t').forEach((d) => (d.onclick = () => (zapamietaj(), wczytaj(R[+d.dataset.i].t, R[+d.dataset.i].n))));
};
