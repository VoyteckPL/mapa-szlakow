/* sandbox2 · budowa geometrii jezdni. Etap 1: oś OSM zawsze na środku jezdni.
   Kolejność (każdy krok to jedna, nazwana reguła):
   1. CIĄGI      – drogi połączone w węzłach stopnia 2 tworzą jeden ciąg (wspólna oś, łuki zamiast załamań).
   2. PROFIL     – granice pasów w każdym punkcie osi; zmiana pasów/szerokości = klin w szerszej drodze za węzłem.
   3. ROZJAZD / WŁĄCZENIE – 3 jednokierunkowe ramiona, dwa po jednej stronie: gałęzie zaczynają się
                    dokładnie w swoich pasach przekroju pnia i płynnie przechodzą na własną oś.
   4. SKRZYŻOWANIE – pozostałe węzły ≥3: ramiona przycięte, wielokąt węzła z zaokrąglonymi narożnikami.
   5. KRAWĘDZIE  – linie równoległe do osi z usuwaniem pętli (odporne na ostre kąty).
   Offsety (etap 2) będą przesuwać oś PRZED krokiem 1 – ten kod nie musi o nich wiedzieć. */
'use strict';
const STEP = 1; /* m: gęstość osi */

function buduj(sc) {
  const out = { ciagi: [], wezly: [], typy: {}, rozjazdy: [] };
  /* ---- stopnie węzłów ---- */
  const ends = new Map();
  sc.roads.forEach((r) => {
    (ends.get(r.a) || ends.set(r.a, []).get(r.a)).push({ r, at: 'a' });
    (ends.get(r.b) || ends.set(r.b, []).get(r.b)).push({ r, at: 'b' });
  });
  /* ---- 1. CIĄGI ---- */
  const used = new Set();
  for (const r0 of sc.roads) {
    if (used.has(r0)) continue;
    used.add(r0);
    let seq = [{ r: r0, rev: false }];
    /* w przód od b */
    for (let cur = seq[0]; ; ) {
      const nk = cur.rev ? cur.r.a : cur.r.b,
        e = ends.get(nk);
      if (e.length !== 2) break;
      const o = e.find((x) => x.r !== cur.r);
      if (!o || used.has(o.r)) break;
      used.add(o.r);
      cur = { r: o.r, rev: o.at === 'b' };
      seq.push(cur);
    }
    /* wstecz od a */
    for (let cur = seq[0]; ; ) {
      const nk = cur.rev ? cur.r.b : cur.r.a,
        e = ends.get(nk);
      if (e.length !== 2) break;
      const o = e.find((x) => x.r !== cur.r);
      if (!o || used.has(o.r)) break;
      used.add(o.r);
      cur = { r: o.r, rev: o.at === 'a' };
      seq.unshift(cur);
    }
    out.ciagi.push(ciag(sc, seq));
  }
  out.ciagi.forEach((c) => c.joints.forEach((j) => (out.typy[j.node] = j.typ)));
  /* ---- 3./4. węzły ≥ 3 ---- */
  for (const [nk, e] of ends) {
    if (e.length < 3) {
      if (e.length === 1) out.typy[nk] = 'koniec';
      continue;
    }
    const arms = [];
    for (const c of out.ciagi) {
      if (c.na === nk) arms.push({ c, at: 0 });
      if (c.nb === nk) arms.push({ c, at: 1 });
    }
    arms.forEach((a) => {
      const P = a.at ? a.c.raw.slice().reverse() : a.c.raw;
      a.u = G.dirFrom(P, 12);
      a.uFar = G.dirFrom(P, 40); /* do rozróżnienia lewej/prawej gałęzi */
      a.p = sc.nodes.get(nk).p;
      a.hw = a.at ? a.c.hwE : a.c.hw0;
      a.road = a.at ? a.c.seq[a.c.seq.length - 1] : a.c.seq[0];
    });
    const f = arms.length === 3 && jakRozjazd(arms);
    if (f) {
      rozjazd(f);
      f.nk = nk;
      out.rozjazdy.push(f);
      out.typy[nk] = f.wlacz ? 'włączenie' : 'rozjazd';
    } else {
      out.wezly.push(skrzyzowanie(nk, arms));
      out.typy[nk] = 'skrzyżowanie';
    }
  }
  out.ciagi.forEach(krawedzie);
  out.rozjazdy.forEach(przytnijOznakowanie);
  return out;
}

/* ---------- 1+2. ciąg: oś, łuki, profil pasów ---------- */
function ciag(sc, seq) {
  const raw = [],
    jIdx = []; /* indeks wierzchołka styku w raw */
  seq.forEach((s, k) => {
    let P = roadPts(sc, s.r);
    if (s.rev) P = P.reverse();
    if (k) {
      jIdx.push(raw.length - 1);
      P = P.slice(1);
    }
    raw.push(...P);
  });
  const R = Math.max(...seq.map((s) => Math.max((TYPY[s.r.typ] || TYPY.gl).R, hwOf(s.r) * 2.5)));
  G.emax = Math.max(...seq.map((s) => hwOf(s.r))) + 2;
  G.rmin = Math.max(...seq.map((s) => hwOf(s.r))) * 1.5 + 1 /* nawrót: zawsze zaokrąglony, krawędź wewnętrzna bez załamania */;
  const Q = G.dense(G.fillet(raw, R), STEP),
    C = G.cum(Q);
  /* długość s każdego styku = najbliższy punkt osi do wierzchołka */
  const sJ = jIdx.map((ix) => {
    let b = 0,
      bd = 1e9;
    Q.forEach((q, i) => {
      const d = G.dist(q, raw[ix]);
      if (d < bd) {
        bd = d;
        b = i;
      }
    });
    return C[b];
  });
  const L = C[C.length - 1],
    edgesS = [0].concat(sJ, [L]),
    nodeOf = (s) => (s.rev ? [s.r.b, s.r.a] : [s.r.a, s.r.b]);
  /* układ pasów drogi: granice od lewej, nb = pasy „pod prąd” po lewej */
  const lay = (s) => {
    const n = s.r.pasy,
      lw = lwOf(s.r),
      nb = s.r.jedn ? (s.rev ? n : 0) : s.rev ? n - Math.floor(n / 2) : Math.floor(n / 2);
    return { n, lw, nb, b: Array.from({ length: n + 1 }, (_, j) => -(n * lw) / 2 + j * lw) };
  };
  const LY = seq.map(lay);
  /* klin: w szerszej drodze, za węzłem; węższa pełna do węzła */
  const joints = sJ.map((s, k) => {
    const A = LY[k],
      B = LY[k + 1],
      wa = A.n * A.lw,
      wb = B.n * B.lw,
      same = A.n === B.n && Math.abs(wa - wb) < 1e-6,
      wideB = B.n > A.n || (B.n === A.n && wb >= wa),
      lenW = edgesS[k + (wideB ? 2 : 1)] - edgesS[k + (wideB ? 1 : 0)],
      Lw = same ? 0 : Math.min(0.45 * lenW, Math.max(15, 30 * Math.abs(B.n - A.n) + 4 * Math.abs(wb - wa)));
    return { s, k, A, B, wideB, Lw, node: nodeOf(seq[k])[1], typ: same ? 'ciąg' : A.n !== B.n ? 'zmiana pasów' : 'zmiana szerokości' };
  });
  /* klin SYMETRYCZNY: szersza jezdnia na styku ma szerokość węższej (pasy równomiernie węższe), potem rozszerza się po obu stronach osi */
  const squeeze = (W, N) => W.b.map((x) => (x * (N.n * N.lw)) / (W.n * W.lw));
  const bd = Q.map((_, i) => {
    const s = C[i];
    let k = 0;
    while (k < seq.length - 1 && s > edgesS[k + 1]) k++;
    const W = LY[k];
    /* czy punkt leży w klinie sąsiedniego styku */
    for (const J of joints) {
      if (!J.Lw) continue;
      if (J.wideB && J.k + 1 === k && s - J.s < J.Lw) return squeeze(W, J.A).map((x, j) => x + (W.b[j] - x) * G.sstep((s - J.s) / J.Lw));
      if (!J.wideB && J.k === k && J.s - s < J.Lw) return squeeze(W, J.B).map((x, j) => x + (W.b[j] - x) * G.sstep((J.s - s) / J.Lw));
    }
    return W.b.slice();
  });
  const div = Q.map((_, i) => {
    let k = 0;
    while (k < seq.length - 1 && C[i] > edgesS[k + 1]) k++;
    return seq[k].r.jedn ? -1 : LY[k].nb;
  });
  return {
    seq,
    raw,
    Q,
    C,
    bd,
    div,
    joints,
    na: nodeOf(seq[0])[0],
    nb: nodeOf(seq[seq.length - 1])[1],
    hw0: hwOf(seq[0].r),
    hwE: hwOf(seq[seq.length - 1].r),
    cut0: 0,
    cut1: 0,
  };
}

/* ---------- 3. rozjazd / włączenie ----------
   Warunek: 3 ramiona jednokierunkowe; pień naprzeciw dwóch gałęzi (każda ≤ 70° od przedłużenia pnia). */
function jakRozjazd(arms) {
  if (!arms.every((a) => a.road.r.jedn)) return null;
  let best = null;
  for (let i = 0; i < 3; i++) {
    const P = arms[i],
      br = arms.filter((_, j) => j !== i),
      p = G.mul(P.u, -1),
      an = br.map((b) => G.ang(p, b.u)),
      af = br.map((b) => G.ang(p, b.uFar));
    if (Math.max(Math.abs(an[0]), Math.abs(an[1])) > (70 * Math.PI) / 180) continue;
    const sc = Math.abs(an[0]) + Math.abs(an[1]);
    if (!best || sc < best.sc) {
      /* gałąź z mniejszym kątem (bardziej zgodnie z zegarem) = prawa */
      const [R, Lf] = af[0] < af[1] ? [br[0], br[1]] : [br[1], br[0]];
      best = { sc, P, R, L: Lf, p };
    }
  }
  if (!best) return null;
  /* kierunek ruchu: pień wjeżdża do węzła = rozjazd, wyjeżdża = włączenie */
  const pr = best.P.road;
  best.wlacz = (best.P.at === 1) === !!pr.rev ? true : false;
  return best;
}

/* ROZJAZD/WŁĄCZENIE (etap 1, osie na środku).
   - gałąź „prosta” (kąt do przedłużenia pnia < 9°) zostaje na swojej osi; jej przekrój zwęża się symetrycznie z szerokości pnia (klin po obu stronach),
   - gałąź boczna startuje w swoim pasie przekroju pnia (po swojej stronie), jedzie równolegle do pnia i łagodną krzywą Hermite'a
     dochodzi do własnej osi OSM w punkcie, w którym obie gałęzie są już rozdzielone (bez falowania: jedna krzywa, nie dwa zakręty). */
function rozjazd(f) {
  const hwP = f.P.hw,
    o = f.P.p,
    nR = G.right(f.p),
    Tmin = 14 + 3 * hwP;
  const info = [f.L, f.R].map((b, i) => {
    const c = b.c,
      at = !!b.at,
      P = at ? c.Q.slice().reverse() : c.Q.slice(),
      C = G.cum(P);
    return { b, c, at, P, C, L: C[C.length - 1], ang: G.ang(f.p, b.uFar), s0: (i ? 1 : -1) * (hwP - b.hw), bdN: at ? c.bd.slice().reverse() : c.bd.slice(), dvN: at ? c.div.slice().reverse() : c.div.slice(), oldC: C };
  });
  const thr = info.reduce((m, x) => (Math.abs(x.ang) < Math.abs(m.ang) ? x : m));
  thr.through = Math.abs(thr.ang) < 0.16;
  if (thr.through) thr.s0 = 0;
  const dPoly = (p, P) => {
    let m = 1e9;
    for (let i = 1; i < P.length; i++) {
      const ab = G.sub(P[i], P[i - 1]),
        t = Math.max(0, Math.min(1, G.dot(G.sub(p, P[i - 1]), ab) / (G.dot(ab, ab) || 1)));
      m = Math.min(m, G.dist(p, G.add(P[i - 1], G.mul(ab, t))));
    }
    return m;
  };
  info.forEach((g, gi) => {
    const other = info[1 - gi];
    let P2 = g.P,
      C2 = g.C;
    {
      /* punkt dojścia do własnej osi (gałąź prosta: stały, bliski; boczna: dopiero po rozdzieleniu gałęzi) */
      const Tg = Math.min(Tmin, 0.45 * g.L) /* krótka gałąź: krótsze przejście */,
        smax = Math.max(Tg, 0.7 * g.L);
      let sj = Tg;
      const side = g.s0 >= 0 ? 1 : -1;
      for (; !g.through && sj < smax; sj += 1) {
        const J = G.at(g.P, g.C, sj).p;
        if (dPoly(J, other.P) >= g.b.hw + other.b.hw + 0.3 && side * (G.dot(G.sub(J, o), nR) - g.s0) > 0.2) break;
      }
      sj = Math.min(sj, g.L * 0.75);
      const J = G.at(g.P, g.C, sj),
        S0 = G.add(o, G.mul(nR, g.s0)),
        P0 = G.add(S0, G.mul(f.p, 2)) /* prosty odcinek startowy: krawędzie dokładnie w przekroju pnia */,
        m = 0.7 * G.dist(P0, J.p),
        n = Math.max(4, Math.ceil(G.dist(P0, J.p))),
        H = [S0];
      for (let k = 0; k <= n; k++) {
        const t = k / n,
          h00 = 2 * t ** 3 - 3 * t * t + 1,
          h10 = t ** 3 - 2 * t * t + t,
          h01 = -2 * t ** 3 + 3 * t * t,
          h11 = t ** 3 - t * t;
        H.push([h00 * P0[0] + h10 * m * f.p[0] + h01 * J.p[0] + h11 * m * J.u[0], h00 * P0[1] + h10 * m * f.p[1] + h01 * J.p[1] + h11 * m * J.u[1]]);
      }
      P2 = H.concat(g.P.filter((_, k) => g.C[k] > sj + 0.5));
      C2 = G.cum(P2);
    }
    /* przeniesienie profilu pasów po długości łuku */
    let k = 0;
    const Tw = Math.min(Tmin * 1.5, 0.8 * g.L),
      bd = [],
      dv = [];
    P2.forEach((_, i) => {
      const sFrac = C2[i];
      while (k < g.oldC.length - 1 && Math.abs(g.oldC[k + 1] - sFrac) < Math.abs(g.oldC[k] - sFrac)) k++;
      let row = g.bdN[k].slice();
      if (g.through && sFrac < Tw) {
        const fk = 1 + (hwP / g.b.hw - 1) * (1 - G.sstep(sFrac / Tw));
        row = row.map((x) => x * fk);
      }
      bd.push(row);
      dv.push(g.dvN[k]);
    });
    g.b.c.Q = g.at ? P2.slice().reverse() : P2;
    g.b.c.bd = g.at ? bd.reverse() : bd;
    g.b.c.div = g.at ? dv.reverse() : dv;
    g.b.c.C = G.cum(g.b.c.Q);
  });
}

/* ---------- 4. skrzyżowanie: przycięcie ramion + wielokąt ---------- */
function skrzyzowanie(nk, arms) {
  const p = arms[0].p,
    CURB = 4;
  arms.sort((a, b) => Math.atan2(a.u[1], a.u[0]) - Math.atan2(b.u[1], b.u[0]));
  const n = arms.length,
    lft = (a) => [-a.u[1], a.u[0]];
  arms.forEach((a) => (a.d = a.hw * 0.5));
  const cor = [];
  for (let i = 0; i < n; i++) {
    const A = arms[i],
      B = arms[(i + 1) % n],
      x = G.lineX(G.add(p, G.mul(lft(A), A.hw)), A.u, G.add(p, G.mul(lft(B), -B.hw)), B.u),
      gap = (Math.atan2(B.u[1], B.u[0]) - Math.atan2(A.u[1], A.u[0]) + 2 * Math.PI) % (2 * Math.PI);
    /* wklęsły „tył” węzła (wszystkie ramiona po jednej stronie): zaokrąglenie wokół węzła zamiast prostej cięciwy daleko od niego */
    if (gap > Math.PI + 0.05) {
      const th = Math.atan2(A.u[1], A.u[0]) + gap / 2,
        r = 2 * (Math.max(A.hw, B.hw) + CURB);
      cor.push([p[0] + Math.cos(th) * r, p[1] + Math.sin(th) * r]);
      A.d = Math.max(A.d, B.hw + CURB);
      B.d = Math.max(B.d, A.hw + CURB);
      continue;
    }
    const okX = x && x.t > -A.hw && x.s > -B.hw && x.t < 4 * A.hw + 40 && x.s < 4 * B.hw + 40;
    cor.push(okX ? x.p : null);
    if (okX) {
      A.d = Math.max(A.d, x.t + CURB);
      B.d = Math.max(B.d, x.s + CURB);
    } else {
      A.d = Math.max(A.d, B.hw + CURB);
      B.d = Math.max(B.d, A.hw + CURB);
    }
  }
  /* przycięcie ciągów i końcowe przekroje */
  arms.forEach((a) => {
    const c = a.c,
      L = c.C[c.C.length - 1],
      d = Math.min(a.d, 0.45 * L);
    if (a.at) c.cut1 = d;
    else c.cut0 = d;
    const g = G.at(c.Q, c.C, a.at ? L - d : d),
      u = a.at ? G.mul(g.u, -1) : g.u;
    a.eL = G.add(g.p, G.mul(lft({ u }), a.hw));
    a.eR = G.add(g.p, G.mul(lft({ u }), -a.hw));
  });
  const poly = [],
    curbs = [];
  for (let i = 0; i < n; i++) {
    const A = arms[i],
      B = arms[(i + 1) % n],
      cv = cor[i] ? G.bez(A.eL, cor[i], B.eR, 12) : [A.eL, B.eR];
    poly.push(A.eR, ...cv);
    curbs.push(cv);
  }
  return { nk, poly, curbs };
}

/* ---------- 5. krawędzie i linie pasów ---------- */
function krawedzie(c) {
  const L = c.C[c.C.length - 1],
    i0 = c.C.findIndex((s) => s >= c.cut0),
    i1 = c.C.length - 1 - [...c.C].reverse().findIndex((s) => s <= L - c.cut1),
    Q = c.Q.slice(i0, i1 + 1),
    bd = c.bd.slice(i0, i1 + 1);
  /* dokładne punkty cięcia (styk z wielokątem skrzyżowania bez szczeliny) */
  if (c.cut0 > 0 && c.C[i0] - c.cut0 > 1e-3) {
    Q.unshift(G.at(c.Q, c.C, c.cut0).p);
    bd.unshift(bd[0]);
  }
  if (c.cut1 > 0 && L - c.cut1 - c.C[i1] > 1e-3) {
    Q.push(G.at(c.Q, c.C, L - c.cut1).p);
    bd.push(bd[bd.length - 1]);
  }
  const N = G.normals(Q);
  c.Qv = Q;
  c.lines = [];
  /* liczba granic może się zmieniać wzdłuż ciągu – linie budujemy odcinkami o stałej liczbie granic */
  let st = 0;
  const pieces = [];
  for (let i = 1; i <= Q.length; i++) {
    if (i === Q.length || bd[i].length !== bd[st].length) {
      pieces.push([st, i]);
      st = i;
    }
  }
  c.edgeL = [];
  c.edgeR = [];
  const div = c.div.slice(i0, i1 + 1);
  if (c.cut0 > 0 && div.length < Q.length) div.unshift(div[0]);
  pieces.forEach(([a, b]) => {
    /* punkt b (pierwszy następnego odcinka) dokleja się z układem bieżącego odcinka – linie bez szczelin */
    const e = Math.min(b + 1, Q.length),
      k = bd[a].length,
      seg = Q.slice(a, e),
      Ns = N.slice(a, e),
      B = bd.slice(a, b).concat(e > b ? [bd[b - 1]] : []);
    for (let j = 0; j < k; j++) {
      const line = G.offset(
        seg,
        B.map((x) => x[j]),
        Ns,
      );
      const kind = j === 0 || j === k - 1 ? 'kraw' : div[a] === j ? 'oddz' : 'pas';
      c.lines.push({ kind, P: line });
      if (j === 0) c.edgeL.push(...line);
      if (j === k - 1) c.edgeR.push(...line);
    }
  });
  c.poly = c.edgeL.concat(c.edgeR.slice().reverse());
}

/* ---------- 6. oznakowanie w rozjeździe: linie gałęzi leżące na asfalcie drugiej gałęzi są ukryte
   (wspólny pas 3 → 2+2: krawędzie wewnętrzne pojawiają się dopiero tam, gdzie gałęzie się rozchodzą = klin) ---------- */
function przytnijOznakowanie(f) {
  const inside = (p, P) => {
    if (!G.inPoly(p, P)) return false;
    for (let i = 1; i < P.length; i++) {
      const ab = G.sub(P[i], P[i - 1]),
        t = Math.max(0, Math.min(1, G.dot(G.sub(p, P[i - 1]), ab) / (G.dot(ab, ab) || 1)));
      if (G.dist(p, G.add(P[i - 1], G.mul(ab, t))) < 0.05) return false;
    }
    return true;
  };
  [
    [f.L.c, f.R.c],
    [f.R.c, f.L.c],
  ].forEach(([c, o]) => {
    const out = [];
    for (const l of c.lines) {
      let cur = [];
      for (const p of l.P) {
        if (inside(p, o.poly)) {
          if (cur.length > 1) out.push({ kind: l.kind, P: cur });
          cur = [];
        } else cur.push(p);
      }
      if (cur.length > 1) out.push({ kind: l.kind, P: cur });
    }
    c.linesClip = out;
  });
  f.L.c.lines = f.L.c.linesClip;
  f.R.c.lines = f.R.c.linesClip;
}
