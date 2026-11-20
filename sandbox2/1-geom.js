/* sandbox2 · geometria 2D. Układ świata: metry, y w górę. Offset dodatni = w prawo od kierunku. */
'use strict';
const G = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, k) => [a[0] * k, a[1] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1],
  cross: (a, b) => a[0] * b[1] - a[1] * b[0],
  len: (a) => Math.hypot(a[0], a[1]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1]) || 1;
    return [a[0] / l, a[1] / l];
  },
  right: (u) => [u[1], -u[0]] /* prawa normalna kierunku u */,
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
  sstep: (x) => {
    x = Math.max(0, Math.min(1, x));
    return x * x * (3 - 2 * x);
  },
  ang: (a, b) => Math.atan2(G.cross(a, b), G.dot(a, b)) /* kąt ze znakiem od a do b (CCW +) */,
};

/* skumulowana długość łamanej */
G.cum = (P) => {
  const c = [0];
  for (let i = 1; i < P.length; i++) c.push(c[i - 1] + G.dist(P[i - 1], P[i]));
  return c;
};

/* zagęszczenie: odcinki nie dłuższe niż step */
G.dense = (P, step) => {
  const o = [P[0]];
  for (let i = 1; i < P.length; i++) {
    const n = Math.max(1, Math.ceil(G.dist(P[i - 1], P[i]) / step));
    for (let k = 1; k <= n; k++) o.push(G.lerp(P[i - 1], P[i], k / n));
  }
  return o;
};

/* zaokrąglenie wierzchołków łukami: promień R, styczna ograniczona do połowy sąsiednich odcinków
   (na końcach łamanej – całego odcinka). Wynik bez załamań przy każdym kącie. */
G.fillet = (P, R) => {
  if (P.length < 3) return P.slice();
  const o = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1],
      b = P[i],
      c = P[i + 1],
      u = G.norm(G.sub(b, a)),
      v = G.norm(G.sub(c, b)),
      th = Math.abs(G.ang(u, v));
    if (th < 0.01) {
      o.push(b);
      continue;
    }
    const la = G.dist(a, b) * (i === 1 ? 0.9 : 0.5),
      lc = G.dist(b, c) * (i === P.length - 2 ? 0.9 : 0.5),
      /* odsunięcie łuku od wierzchołka ≤ emax (przy nawrotach łuk nie ucieka daleko od węzła) */
      ex = 1 / Math.cos(Math.min(th, 3.1) / 2) - 1,
      Rm = Math.max(Math.min(R, (G.emax || 1e9) / Math.max(ex, 1e-9)), G.rmin || 0),
      t = Math.min(Rm * Math.tan(th / 2), la, lc),
      r = t / Math.tan(th / 2),
      p0 = G.sub(b, G.mul(u, t)),
      n = Math.max(2, Math.ceil((th * r) / 1)),
      sg = Math.sign(G.cross(u, v)),
      cen = G.add(p0, G.mul([-u[1] * sg, u[0] * sg], r)),
      a0 = Math.atan2(p0[1] - cen[1], p0[0] - cen[0]);
    for (let k = 0; k <= n; k++) {
      const al = a0 + (sg * th * k) / n;
      o.push([cen[0] + r * Math.cos(al), cen[1] + r * Math.sin(al)]);
    }
  }
  o.push(P[P.length - 1]);
  return o;
};

/* przecięcie odcinków ab i cd (wnętrza) */
G.segX = (a, b, c, d) => {
  const r = G.sub(b, a),
    s = G.sub(d, c),
    den = G.cross(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const w = G.sub(c, a),
    t = G.cross(w, s) / den,
    u = G.cross(w, r) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9 ? { t, u, p: G.add(a, G.mul(r, t)) } : null;
};

/* przecięcie prostych p+t·u i q+s·v → {t, s, p} */
G.lineX = (p, u, q, v) => {
  const den = G.cross(u, v);
  if (Math.abs(den) < 1e-6) return null;
  const w = G.sub(q, p),
    t = G.cross(w, v) / den,
    s = G.cross(w, u) / den;
  return { t, s, p: G.add(p, G.mul(u, t)) };
};

/* usuwa pętle (krawędź po wewnętrznej stronie ciasnego łuku) – zostaje punkt przecięcia; okno 160 punktów */
G.unloop = (P) => {
  const o = P.slice();
  for (let i = 1; i < o.length; i++) {
    for (let j = Math.min(o.length - 1, i + 160); j > i + 1; j--) {
      const x = G.segX(o[i - 1], o[i], o[j - 1], o[j]);
      if (x) {
        o.splice(i, j - i, x.p);
        break;
      }
    }
  }
  return o;
};

/* normalne (prawe) w punktach łamanej – dwusieczna sąsiednich odcinków */
G.normals = (P) =>
  P.map((_, i) => {
    const a = P[Math.max(0, i - 1)],
      b = P[Math.min(P.length - 1, i + 1)];
    return G.right(G.norm(G.sub(b, a)));
  });

/* linia równoległa: d = liczba albo tablica (offset w każdym punkcie); pętle usunięte */
G.offset = (P, d, N) => {
  N = N || G.normals(P);
  return G.unloop(P.map((p, i) => G.add(p, G.mul(N[i], typeof d === 'number' ? d : d[i]))));
};

/* punkt i kierunek na długości s */
G.at = (P, C, s) => {
  s = Math.max(0, Math.min(C[C.length - 1], s));
  let i = 1;
  while (i < P.length - 1 && C[i] < s) i++;
  const t = (s - C[i - 1]) / (C[i] - C[i - 1] || 1);
  return { p: G.lerp(P[i - 1], P[i], t), u: G.norm(G.sub(P[i], P[i - 1])), i };
};

/* kierunek łamanej od jej początku, uśredniony na długości L */
G.dirFrom = (P, L) => {
  const C = G.cum(P);
  return G.norm(G.sub(G.at(P, C, Math.min(L, C[C.length - 1])).p, P[0]));
};

G.inPoly = (p, P) => {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++)
    if (P[i][1] > p[1] !== P[j][1] > p[1] && p[0] < ((P[j][0] - P[i][0]) * (p[1] - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  return c;
};

/* krzywa Béziera 2. stopnia a→b z punktem kontrolnym c */
G.bez = (a, c, b, n) => {
  const o = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n,
      m = 1 - t;
    o.push([m * m * a[0] + 2 * m * t * c[0] + t * t * b[0], m * m * a[1] + 2 * m * t * c[1] + t * t * b[1]]);
  }
  return o;
};
