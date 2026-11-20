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
  /* granice pasów (w indeksach szerszego układu) zwężone do węższego */
  const squeeze = (W, N) =>
    W.b.map((_, j) => {
      let jn = j <= W.nb ? j - (W.nb - N.nb) : N.nb + (j - W.nb);
      jn = Math.max(0, Math.min(N.n, jn));
      return N.b[jn];
    });
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

/* ROZJAZD/WŁĄCZENIE. Korytarz = średnia osi OSM obu gałęzi, na początku płynnie przechodzący z kierunku pnia
   (styczność w węźle). Gałąź startuje w swoich pasach przekroju pnia (s0), jedzie w korytarzu równolegle,
   dopóki jej oś OSM nie wyjdzie na zewnątrz poza s0, potem płynnie (Tb) przechodzi na swoją oś OSM.
   Gałąź, której oś nie wychodzi na zewnątrz, wraca na nią dopiero, gdy druga gałąź odjechała.
   Gałąź nigdy nie skręca w stronę drugiej gałęzi przed jej odjazdem. */
function rozjazd(f) {
  const hwP = f.P.hw,
    o = f.P.p,
    Tb = 12 + 2 * hwP;
  /* osie gałęzi od węzła, równo co 1 m */
  const fromNode = (b) => {
    const c = b.c,
      P = b.at ? c.Q.slice().reverse() : c.Q.slice(),
      C = G.cum(P);
    return { P, C, L: C[C.length - 1] };
  };
  const AL = fromNode(f.L),
    AR = fromNode(f.R),
    S = Math.min(AL.L, AR.L),
    M = [];
  for (let s = 0; s <= S; s += 1) {
    const m = G.lerp(G.at(AL.P, AL.C, s).p, G.at(AR.P, AR.C, s).p, 0.5),
      base = G.add(o, G.mul(f.p, s));
    M.push(G.lerp(base, m, G.sstep(s / Tb)));
  }
  const MC = G.cum(M),
    MN = G.normals(M);
  const frame = (s) => {
    const k = Math.max(0, Math.min(M.length - 1, Math.round(s)));
    return { m: M[k], n: MN[k], t: [-MN[k][1], MN[k][0]] };
  };
  void MC;
  const G2 = [
    [f.L, -hwP + f.L.hw, AL],
    [f.R, hwP - f.R.hw, AR],
  ].map(([b, s0, A]) => {
    const side = s0 >= 0 ? 1 : -1;
    let sx = null;
    for (let k = 0; k < A.P.length && A.C[k] <= S; k++) {
      const F = frame(A.C[k]);
      if (side * (G.dot(G.sub(A.P[k], F.m), F.n) - s0) >= 0) {
        sx = A.C[k];
        break;
      }
    }
    return { b, s0, A, sx, tb: Math.min(Tb, 0.45 * A.L) };
  });
  G2.forEach((g, i) => {
    const o2 = G2[1 - i],
      gone = o2.sx == null ? S : o2.sx + o2.tb;
    if (g.sx == null) g.sx = Math.max(g.tb, gone);
    g.sx = Math.max(0, Math.min(g.sx, 3 * Tb, S - g.tb, g.A.L - g.tb));
  });
  G2.forEach((g) => {
    const { b, s0, A, sx, tb } = g,
      out = A.P.map((q, k) => {
        const s = A.C[k];
        if (s >= sx + tb || s > S) return q;
        const F = frame(s),
          d = G.sub(q, F.m),
          la = G.dot(d, F.n),
          al = G.dot(d, F.t),
          w = s <= sx ? 0 : G.sstep((s - sx) / tb),
          la2 = s0 + (la - s0) * w;
        return G.add(G.add(F.m, G.mul(F.t, al * w)), G.mul(F.n, la2));
      });
    b.c.Q = b.at ? out.reverse() : out;
    b.c.C = G.cum(b.c.Q);
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
      x = G.lineX(G.add(p, G.mul(lft(A), A.hw)), A.u, G.add(p, G.mul(lft(B), -B.hw)), B.u);
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
