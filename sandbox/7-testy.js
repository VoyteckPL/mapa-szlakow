/* Testy geometrii (etap 0 planu docs/PLAN-silnik.md).
   Sprawdza WYNIK silnika (S.CC: oś Q, offset d, szerokość w; laneGeom: granice pasów),
   nie zmienia geometrii. Każda asercja to reguła ogólna, ta sama dla wszystkich scen.
   Użycie: przycisk „Testy” w panelu albo w konsoli: sxTesty.runAll() / sxTesty.check(). */
(function () {
  const TOL = 0.1; /* m: styk krawędzi / granic pasów */
  const MAX_DD = 0.3; /* m offsetu na 1 m drogi */
  const MAX_DW = 0.6; /* m szerokości na 1 m drogi (klin) */
  const MAX_KINK = 25; /* stopnie: załamanie krawędzi na krótkim odcinku */
  const LIN = 40; /* stopnie: węzeł „liniowy” (ciągłość, zmiana pasów, rozjazd, włączenie) */
  const ok = (v) => Number.isFinite(v);

  /* granice pasów drogi i: tablica [0..NL] polilinii (krawędzie = pierwsza i ostatnia) */
  function bounds(i) {
    const c = S.CC && S.CC[i];
    if (!c) return null;
    const G = laneGeom(i),
      nrm = (j) => {
        const a = c.Q[Math.max(0, j - 1)],
          b = c.Q[Math.min(c.Q.length - 1, j + 1)],
          l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
      };
    const NL = G.NL,
      out = [];
    for (let q = 0; q <= NL; q++)
      out.push(
        c.Q.map((p, j) => {
          const o = G.bd ? G.bd[q][j] : G.left[j] + q * G.lw[j],
            n = nrm(j);
          return [p[0] + n[0] * o, p[1] + n[1] * o];
        }),
      );
    return out;
  }
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= TOL;
  function segX(a, b, c, d) {
    const r = [b[0] - a[0], b[1] - a[1]],
      s = [d[0] - c[0], d[1] - c[1]],
      den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) return false;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den,
      u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
  }
  function inPoly(p, P) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++)
      if (P[i][1] > p[1] !== P[j][1] > p[1] && p[0] < ((P[j][0] - P[i][0]) * (p[1] - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0])
        c = !c;
    return c;
  }
  function polyDist(p, P) {
    let m = 1e9;
    for (let i = 1; i < P.length; i++) m = Math.min(m, segDist(p, P[i - 1], P[i]));
    return m;
  }

  /* sprawdza bieżącą scenę; zwraca listę błędów {t: typ, m: opis, p: punkt} */
  function check() {
    const R = S.doc.road,
      E = [],
      B = R.map((_, i) => {
        try {
          return bounds(i);
        } catch (e) {
          E.push({ t: 'wyjątek', m: 'droga ' + i + ': ' + e.message });
          return null;
        }
      });
    /* 1. liczby: brak NaN, szerokość > 0 */
    R.forEach((r, i) => {
      const c = S.CC && S.CC[i];
      if (!c) return E.push({ t: 'brak geometrii', m: 'droga ' + i });
      if (!c.Q.every((p) => ok(p[0]) && ok(p[1])) || !c.d.every(ok) || !c.w.every(ok))
        E.push({ t: 'NaN', m: 'droga ' + i + ': NaN w osi/offsecie/szerokości' });
      if (c.w.some((v) => v <= 0)) E.push({ t: 'szerokość', m: 'droga ' + i + ': szerokość ≤ 0' });
      if (B[i] && B[i].some((L) => L.some((p) => !ok(p[0]) || !ok(p[1]))))
        E.push({ t: 'NaN', m: 'droga ' + i + ': NaN w granicach pasów' });
    });
    /* 2. płynność: brak skoków offsetu/szerokości i załamań krawędzi */
    R.forEach((r, i) => {
      const c = S.CC && S.CC[i];
      if (!c || !B[i]) return;
      for (let j = 1; j < c.Q.length; j++) {
        const ds = Math.max(0.05, Math.hypot(c.Q[j][0] - c.Q[j - 1][0], c.Q[j][1] - c.Q[j - 1][1]));
        if (Math.abs(c.d[j] - c.d[j - 1]) / ds > MAX_DD) {
          E.push({ t: 'skok offsetu', m: 'droga ' + i + ' pkt ' + j + ': Δd ' + (c.d[j] - c.d[j - 1]).toFixed(2) + ' m na ' + ds.toFixed(2) + ' m', p: c.Q[j] });
          break;
        }
        if (Math.abs(c.w[j] - c.w[j - 1]) / ds > MAX_DW) {
          E.push({ t: 'skok szerokości', m: 'droga ' + i + ' pkt ' + j + ': Δw ' + (c.w[j] - c.w[j - 1]).toFixed(2) + ' m', p: c.Q[j] });
          break;
        }
      }
      [0, B[i].length - 1].forEach((q) => {
        const L = B[i][q];
        for (let j = 1; j < L.length - 1; j++) {
          const a = L[j - 1],
            b = L[j],
            d = L[j + 1],
            l1 = Math.hypot(b[0] - a[0], b[1] - a[1]),
            l2 = Math.hypot(d[0] - b[0], d[1] - b[1]);
          if (l1 < 0.05 || l2 < 0.05 || l1 + l2 > 8) continue;
          const an = Math.abs(Math.atan2((b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]), (b[0] - a[0]) * (d[0] - b[0]) + (b[1] - a[1]) * (d[1] - b[1])));
          if ((an * 180) / Math.PI > MAX_KINK) {
            E.push({ t: 'załamanie krawędzi', m: 'droga ' + i + (q ? ' prawa' : ' lewa') + ' krawędź: ' + ((an * 180) / Math.PI).toFixed(0) + '°', p: b });
            break;
          }
        }
        /* pętla na krawędzi (offset większy niż promień łuku) */
        let loop = false;
        for (let j = 1; j < L.length && !loop; j++)
          for (let k = j + 2; k < L.length && !loop; k++) if (segX(L[j - 1], L[j], L[k - 1], L[k])) loop = true;
        if (loop) E.push({ t: 'pętla krawędzi', m: 'droga ' + i + (q ? ' prawa' : ' lewa') + ' krawędź przecina samą siebie' });
      });
    });
    /* 3. węzły liniowe: każda granica pasa przy węźle ma partnera w innej drodze (styk bez szczelin i schodków) */
    const nodes = new Map();
    R.forEach((r, i) => {
      if (!B[i] || !r.nk) return;
      [0, r.nk.length - 1].forEach((j) => {
        const k = r.nk[j];
        if (!k) return;
        const end = j === 0 ? 0 : 1,
          Q = S.CC[i].Q,
          a = end ? Q[Q.length - 1] : Q[0],
          b = end ? Q[Math.max(0, Q.length - 4)] : Q[Math.min(Q.length - 1, 3)],
          l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        (nodes.get(k) || nodes.set(k, []).get(k)).push({ i, end, dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l], pts: B[i].map((L) => (end ? L[L.length - 1] : L[0])) });
      });
    });
    for (const [k, arms] of nodes) {
      if (arms.length < 2) continue;
      const d0 = arms[0].dir,
        lin = arms.every((a) => Math.abs(a.dir[0] * d0[0] + a.dir[1] * d0[1]) >= Math.cos((LIN * Math.PI) / 180));
      if (!lin) continue; /* skrzyżowania T/X – osobna reguła w przyszłości */
      for (const a of arms) {
        const others = arms.filter((b) => b !== a).flatMap((b) => b.pts);
        a.pts.forEach((p, q) => {
          if (others.some((o) => near(p, o))) return;
          const dm = Math.min(...others.map((o) => Math.hypot(p[0] - o[0], p[1] - o[1])));
          const nm = q === 0 || q === a.pts.length - 1 ? 'krawędź' : 'granica pasa ' + q;
          E.push({ t: 'styk', m: 'węzeł ' + k + ', droga ' + a.i + ': ' + nm + ' bez pary (najbliżej ' + dm.toFixed(2) + ' m)', p });
        });
      }
      /* 4. nakładanie: środki pasów jednej drogi nie wchodzą w asfalt innej drogi tego węzła (poza 1 m od styku) */
      for (const a of arms)
        for (const b of arms) {
          if (a === b) continue;
          const Bb = B[b.i],
            P = Bb[0].concat(Bb[Bb.length - 1].slice().reverse()),
            Ba = B[a.i],
            L = Ba[0].length;
          let hit = null;
          for (let q = 0; q < Ba.length - 1 && !hit; q++)
            for (let j = 0; j < L && !hit; j++) {
              const p = [(Ba[q][j][0] + Ba[q + 1][j][0]) / 2, (Ba[q][j][1] + Ba[q + 1][j][1]) / 2],
                cm = S.CC[a.i].cum,
                fromEnd = a.end ? cm[cm.length - 1] - cm[j] : cm[j];
              if (fromEnd < 1) continue;
              if (inPoly(p, P) && polyDist(p, P) > 0.3) hit = p;
            }
          if (hit) E.push({ t: 'nakładanie', m: 'węzeł ' + k + ': pas drogi ' + a.i + ' wchodzi na asfalt drogi ' + b.i, p: hit });
        }
    }
    return E;
  }

  /* wszystkie (albo wybrane) scenariusze; scena użytkownika jest przywracana */
  function runAll(names) {
    const sx = window.__sx,
      keep = JSON.stringify(S.doc.road),
      out = [];
    names = names || Object.keys(sx.SC);
    for (const n of names) {
      S.doc.road = [];
      let E;
      try {
        sx.load(n);
        E = check();
      } catch (e) {
        E = [{ t: 'wyjątek', m: e.message }];
      }
      out.push({ n, E });
    }
    S.doc.road = JSON.parse(keep);
    sx.changed();
    return out;
  }

  function show(res) {
    const el = document.getElementById('sxTest');
    if (!el) return;
    const bad = res.filter((r) => r.E.length);
    el.innerHTML =
      '<div class="mu">' + (res.length - bad.length) + '/' + res.length + ' OK</div>' +
      res
        .map(
          (r) =>
            '<div class="tr ' + (r.E.length ? 'bad' : 'ok') + '" data-n="' + r.n.replace(/"/g, '&quot;') + '" title="' +
            r.E.map((e) => e.t + ': ' + e.m).join('\n').replace(/"/g, '&quot;') + '">' +
            (r.E.length ? '✗ ' : '✓ ') + r.n + (r.E.length ? ' <b>(' + [...new Set(r.E.map((e) => e.t))].join(', ') + ')</b>' : '') + '</div>',
        )
        .join('');
    el.querySelectorAll('.tr').forEach((d) => (d.onclick = () => window.__sx.load(d.dataset.n)));
  }

  window.sxTesty = { check, runAll, show };
  const b = document.getElementById('sxTestGo');
  if (b) b.onclick = () => show(runAll(document.getElementById('sxTestAll').checked ? null : window.__sx.SCG.flatMap((g) => g.names)));
})();
