/* Skrzyżowanie 3 ramion – jedno skrzyżowanie, osie na środku jezdni, parametry na żywo.
   Silnik: junction(c, arms, P) → { poly (węzeł), arms[] z cięciem d, krawędzie, linie }.
   Reguły: (1) każda para sąsiednich ramion ma narożnik (łuk kołowy o promieniu R, styczny do obu krawędzi), gdy kąt między nimi < 180°;
           (2) ramiona są ucinane tam, gdzie zaczyna się łuk (+ strefa z), nie mniej niż min;
           (3) prawie współliniowe ramiona (krawędzie przecinają się bardzo daleko) łączy prosta cięciwa – bez wielkiego cięcia;
           (4) gdy wszystkie ramiona są po jednej stronie węzła, „tył” węzła jest zaokrąglony krzywą o promieniu Rb. */
'use strict';
const $ = (id) => document.getElementById(id);
const PD = [
  /* klucz, symbol, opis, min, max, krok, domyślnie */
  ['R', '◜', 'Promień narożnika (łuk krawężnika)', 0, 40, 0.5, 8],
  ['z', '⇥', 'Dodatkowa strefa: ramię ucięte dalej od węzła', 0, 30, 0.5, 0],
  ['T', '⌃', 'Maks. wcięcie łuku przy ostrych kątach', 4, 100, 1, 40],
  ['min', '⇤', 'Minimalna długość cięcia ramienia', 0, 30, 0.5, 6],
  ['gap', '┄', 'Odstęp linii pasów od węzła', 0, 20, 0.5, 2],
  ['Rb', '◠', 'Zaokrąglenie tyłu węzła (ramiona po jednej stronie)', 0, 30, 0.5, 6],
  ['lw', '▥', 'Szerokość pasa (m)', 2.5, 4.5, 0.25, 3.5],
  ['far', '↔', 'Limit „prawie prosto”: krawędzie przecinają się dalej niż × szerokość', 1, 12, 0.5, 4],
];
const DEF = {
  P: Object.fromEntries(PD.map((d) => [d[0], d[6]])),
  c: [0, 0],
  arms: [
    { p: [-70, 0], n: 2, dir: 'both' },
    { p: [70, 0], n: 2, dir: 'both' },
    { p: [0, -60], n: 2, dir: 'both' },
  ],
};
let ST = JSON.parse(JSON.stringify(DEF)),
  V = { cx: 0, cy: -10, z: 5 },
  osie = true,
  hist = [];
const cv = $('cv');

/* ================= silnik ================= */
function junction(c, A, P) {
  const lw = P.lw,
    out = { arms: [], poly: [], curbs: [], info: [] };
  const arms = A.map((a, i) => {
    const d = G.sub(a.p, c),
      L = G.len(d),
      u = G.norm(d);
    return { i, a, u, L, hw: (a.n * lw) / 2, ang: Math.atan2(u[1], u[0]), lft: [-u[1], u[0]], d: Math.max(P.min, 0), tp: null };
  });
  arms.sort((x, y) => x.ang - y.ang);
  const n = arms.length,
    edge = (A1, sgn, d) => G.add(G.add(c, G.mul(A1.u, d)), G.mul(A1.lft, sgn * A1.hw)); /* sgn +1 = lewa krawędź, −1 = prawa */
  /* narożniki */
  const cor = [];
  for (let k = 0; k < n; k++) {
    const A1 = arms[k],
      B = arms[(k + 1) % n],
      g = (B.ang - A1.ang + 2 * Math.PI) % (2 * Math.PI);
    const co = { A: A1, B, g, type: 'chord' };
    if (g < Math.PI - 0.03) {
      const x = G.lineX(edge(A1, 1, 0), A1.u, edge(B, -1, 0), B.u);
      if (x && x.t > 0 && x.s > 0 && x.t < P.far * (A1.hw + B.hw) + 10 && x.s < P.far * (A1.hw + B.hw) + 10) {
        let T = P.R > 0.01 ? P.R / Math.tan(g / 2) : 0;
        T = Math.min(T, P.T);
        co.type = 'arc';
        co.X = x.p;
        co.T = T;
        co.r = T * Math.tan(g / 2);
        co.tA = x.t + T;
        co.tB = x.s + T;
        A1.d = Math.max(A1.d, co.tA);
        B.d = Math.max(B.d, co.tB);
      }
    } else if (g > Math.PI + 0.05) {
      co.type = 'back';
    }
    cor.push(co);
  }
  /* cięcia: nie dłuższe niż 0.45 długości ramienia; strefa z */
  arms.forEach((a) => (a.d = Math.min(a.d + P.z, 0.45 * a.L)));
  /* chordy/back potrzebują co najmniej szerokości sąsiada */
  cor.forEach((co) => {
    if (co.type !== 'arc') {
      co.A.d = Math.max(co.A.d, Math.min(co.B.hw + 2, 0.45 * co.A.L));
      co.B.d = Math.max(co.B.d, Math.min(co.A.hw + 2, 0.45 * co.B.L));
    }
  });
  /* wielokąt węzła */
  for (let k = 0; k < n; k++) {
    const co = cor[k],
      A1 = co.A,
      B = co.B,
      a0 = edge(A1, 1, A1.d),
      b0 = edge(B, -1, B.d);
    out.poly.push(edge(A1, -1, A1.d));
    let path = [a0];
    if (co.type === 'arc' && co.tA <= A1.d + 1e-6 && co.tB <= B.d + 1e-6) {
      const TA = edge(A1, 1, co.tA),
        TB = edge(B, -1, co.tB);
      path.push(TA);
      if (co.r > 0.05) {
        const bis = G.norm(G.add(A1.u, B.u)),
          C0 = G.add(co.X, G.mul(bis, co.r / Math.sin(co.g / 2))),
          a1 = Math.atan2(TA[1] - C0[1], TA[0] - C0[0]);
        let da = Math.atan2(TB[1] - C0[1], TB[0] - C0[0]) - a1;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        const m = Math.max(3, Math.ceil((Math.abs(da) * co.r) / 0.5));
        for (let q = 1; q < m; q++) path.push([C0[0] + co.r * Math.cos(a1 + (da * q) / m), C0[1] + co.r * Math.sin(a1 + (da * q) / m)]);
      } else path.push(co.X);
      path.push(TB);
    } else if (co.type === 'back') {
      const th = A1.ang + co.g / 2,
        rr = 2 * Math.max(P.Rb, Math.max(A1.hw, B.hw) * 0.6);
      path = G.bez(a0, [c[0] + Math.cos(th) * rr, c[1] + Math.sin(th) * rr], b0, 16);
    }
    path.push(b0);
    out.poly.push(...path);
    out.curbs.push(path);
  }
  out.arms = arms;
  out.cor = cor;
  out.info = arms.map((a) => ({ i: a.i, ang: (a.ang * 180) / Math.PI, d: a.d }));
  return out;
}

/* ================= rysowanie ================= */
function draw() {
  const g = cv.getContext('2d'),
    dpr = window.devicePixelRatio || 1,
    W = cv.clientWidth,
    H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#dfe5d8';
  g.fillRect(0, 0, W, H);
  const X = (p) => [(p[0] - V.cx) * V.z + W / 2, H / 2 - (p[1] - V.cy) * V.z];
  const path = (Pp, close) => {
    g.beginPath();
    Pp.forEach((p, i) => {
      const s = X(p);
      i ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]);
    });
    if (close) g.closePath();
  };
  let J;
  try {
    J = junction(ST.c, ST.arms, ST.P);
  } catch (e) {
    $('stat').textContent = '⚠ ' + e.message;
    return;
  }
  const lw = ST.P.lw;
  g.fillStyle = g.strokeStyle = '#5b5f66';
  g.lineWidth = 1;
  g.lineJoin = 'round';
  path(J.poly, true);
  g.fill();
  g.stroke();
  for (const a of J.arms) {
    const eg = (sg, d) => G.add(G.add(ST.c, G.mul(a.u, d)), G.mul(a.lft, sg * a.hw));
    path([eg(-1, a.d), eg(1, a.d), eg(1, a.L), eg(-1, a.L)], true);
    g.fill();
    g.stroke();
  }
  /* oznakowanie */
  const lwp = Math.max(1.2, 0.18 * V.z);
  g.strokeStyle = '#f4f4f4';
  g.lineCap = 'butt';
  for (const a of J.arms) {
    const cfg = ST.arms[a.i],
      nl = cfg.n,
      d0 = a.d + ST.P.gap;
    for (let k = 0; k <= nl; k++) {
      const lat = -a.hw + k * lw,
        edgeL = k === 0 || k === nl,
        mid = cfg.dir === 'both' && k === Math.floor(nl / 2) && !edgeL;
      if (edgeL && 0) continue;
      const p0 = G.add(G.add(ST.c, G.mul(a.u, edgeL ? a.d : d0)), G.mul(a.lft, -lat)),
        p1 = G.add(G.add(ST.c, G.mul(a.u, a.L)), G.mul(a.lft, -lat));
      g.lineWidth = lwp * (mid ? 1.4 : 1);
      g.setLineDash(edgeL || mid ? [] : [3 * V.z, 6 * V.z]);
      path([p0, p1]);
      g.stroke();
    }
  }
  g.setLineDash([]);
  g.lineWidth = lwp;
  for (const cu of J.curbs) {
    path(cu);
    g.stroke();
  }
  /* osie, węzły, kąty */
  if (osie) {
    g.strokeStyle = 'rgba(30,136,229,.6)';
    g.lineWidth = 1.2;
    g.setLineDash([6, 4]);
    for (const a of ST.arms) {
      path([ST.c, a.p]);
      g.stroke();
    }
    g.setLineDash([]);
  }
  g.font = '600 12px system-ui';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  J.cor.forEach((co) => {
    const th = co.A.ang + co.g / 2,
      s = X(ST.c),
      r = 46;
    g.fillStyle = 'rgba(255,255,255,.9)';
    const t = Math.round((co.g * 180) / Math.PI) + '°',
      w = g.measureText(t).width + 8,
      x = s[0] + Math.cos(th) * r,
      y = s[1] - Math.sin(th) * r;
    g.fillRect(x - w / 2, y - 9, w, 18);
    g.fillStyle = co.type === 'arc' ? '#1d2330' : '#b26a00';
    g.fillText(t, x, y);
  });
  const nodes = [['W0', ST.c, true]].concat(ST.arms.map((a, i) => ['W' + (i + 1), a.p, false]));
  for (const [id, p, big] of nodes) {
    const s = X(p);
    g.beginPath();
    g.arc(s[0], s[1], big ? 8 : 6, 0, 7);
    g.fillStyle = big ? '#ff7a00' : '#fff';
    g.fill();
    g.strokeStyle = '#1d2330';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = '#1d2330';
    g.fillText(id, s[0] + 15, s[1] - 12);
  }
  $('stat').textContent = J.cor.map((c) => (c.type === 'arc' ? '◜' : c.type === 'back' ? '◠' : '─')).join(' ') + '  cięcia ' + J.arms.map((a) => a.d.toFixed(1)).join(' / ') + ' m';
}

/* ================= UI ================= */
function save() {
  try {
    localStorage.setItem('skrz1', JSON.stringify(ST));
  } catch (e) {
    /* bez zapisu */
  }
}
const redraw = () => (draw(), save());
function push() {
  hist.push(JSON.stringify(ST));
  if (hist.length > 80) hist.shift();
}
function panel() {
  $('sl').innerHTML = PD.map(
    ([k, sym, desc, mn, mx, st]) =>
      `<label title="${desc}"><span class="ic">${sym}</span><input type="range" id="p_${k}" min="${mn}" max="${mx}" step="${st}" value="${ST.P[k]}"><output id="o_${k}">${ST.P[k]}</output></label>`,
  ).join('');
  PD.forEach(([k]) => {
    const el = $('p_' + k);
    el.oninput = () => {
      ST.P[k] = +el.value;
      $('o_' + k).textContent = el.value;
      redraw();
    };
    el.onpointerdown = push;
  });
  const dirs = { both: '↔', out: '→', in: '←' };
  $('ar').innerHTML = ST.arms
    .map(
      (a, i) =>
        `<div class="arm"><b>${i + 1}</b><button data-i="${i}" data-n="-1">−</button><span>${a.n}</span><button data-i="${i}" data-n="1">+</button><button data-i="${i}" data-d="1" title="kierunek: ↔ dwukierunkowa, → od węzła, ← do węzła">${dirs[a.dir]}</button></div>`,
    )
    .join('');
  $('ar').querySelectorAll('button').forEach(
    (b) =>
      (b.onclick = () => {
        push();
        const a = ST.arms[+b.dataset.i];
        if (b.dataset.n) a.n = Math.max(1, Math.min(8, a.n + +b.dataset.n));
        if (b.dataset.d) a.dir = { both: 'out', out: 'in', in: 'both' }[a.dir];
        panel();
        redraw();
      }),
  );
}
const W2S = (p) => [(p[0] - V.cx) * V.z + cv.clientWidth / 2, cv.clientHeight / 2 - (p[1] - V.cy) * V.z];
const S2W = (x, y) => [(x - cv.clientWidth / 2) / V.z + V.cx, (cv.clientHeight / 2 - y) / V.z + V.cy];
const ptrs = new Map();
let drag = null,
  pinch = null;
cv.addEventListener('pointerdown', (e) => {
  ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
  cv.setPointerCapture(e.pointerId);
  if (ptrs.size === 2) {
    drag = null;
    const [a, b] = [...ptrs.values()];
    pinch = { d: G.dist(a, b), z: V.z, w: S2W((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) };
    return;
  }
  const hit = [['c', ST.c], ...ST.arms.map((a, i) => [i, a.p])].find(([, p]) => G.dist(W2S(p), [e.offsetX, e.offsetY]) < 14);
  if (hit) {
    push();
    drag = { k: hit[0] };
  } else drag = { pan: [e.offsetX, e.offsetY, V.cx, V.cy] };
});
cv.addEventListener('pointermove', (e) => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()],
      m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    V.z = Math.max(0.5, Math.min(60, (pinch.z * G.dist(a, b)) / (pinch.d || 1)));
    const w1 = S2W(m[0], m[1]);
    V.cx += pinch.w[0] - w1[0];
    V.cy += pinch.w[1] - w1[1];
    return draw();
  }
  if (!drag) return;
  if (drag.pan) {
    V.cx = drag.pan[2] - (e.offsetX - drag.pan[0]) / V.z;
    V.cy = drag.pan[3] + (e.offsetY - drag.pan[1]) / V.z;
    return draw();
  }
  const w = S2W(e.offsetX, e.offsetY).map((v) => Math.round(v * 2) / 2);
  if (drag.k === 'c') {
    const d = G.sub(w, ST.c);
    ST.c = w; /* środek przesuwa ramiona razem z sobą */
    ST.arms.forEach((a) => (a.p = G.add(a.p, d)));
  } else ST.arms[drag.k].p = w;
  redraw();
});
const up = (e) => {
  ptrs.delete(e.pointerId);
  if (pinch) {
    if (!ptrs.size) pinch = null;
    return;
  }
  drag = null;
};
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
cv.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const w0 = S2W(e.offsetX, e.offsetY);
    V.z = Math.max(0.5, Math.min(60, V.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
    const w1 = S2W(e.offsetX, e.offsetY);
    V.cx += w0[0] - w1[0];
    V.cy += w0[1] - w1[1];
    draw();
  },
  { passive: false },
);
addEventListener('resize', draw);
const zoomBy = (k) => ((V.z = Math.max(0.5, Math.min(60, V.z * k))), draw());
$('bZin').onclick = () => zoomBy(1.5);
$('bZout').onclick = () => zoomBy(1 / 1.5);
addEventListener('keydown', (e) => {
  if (document.activeElement.tagName === 'TEXTAREA') return;
  if (e.key === '+' || e.key === '=') zoomBy(1.4);
  if (e.key === '-' || e.key === '_') zoomBy(1 / 1.4);
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') $('bUndo').click();
});
function fit() {
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1e9,
    y1 = -1e9;
  [ST.c, ...ST.arms.map((a) => a.p)].forEach((p) => {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  });
  V.cx = (x0 + x1) / 2;
  V.cy = (y0 + y1) / 2;
  V.z = Math.min(cv.clientWidth / (x1 - x0 + 30), cv.clientHeight / (y1 - y0 + 30), 14);
}
$('bFit').onclick = () => (fit(), draw());
$('bOsie').onclick = () => {
  osie = !osie;
  $('bOsie').classList.toggle('on', osie);
  draw();
};
$('bUndo').onclick = () => {
  const t = hist.pop();
  if (t) {
    ST = JSON.parse(t);
    panel();
    redraw();
  }
};
$('bReset').onclick = () => {
  push();
  ST = JSON.parse(JSON.stringify(DEF));
  panel();
  fit();
  redraw();
};
/* kopiuj/wklej: parametry + węzły + wyliczone kąty i cięcia */
function toText() {
  const J = junction(ST.c, ST.arms, ST.P),
    f = (v) => Math.round(v * 10) / 10;
  return [
    '# skrzyzowanie 3 ramion',
    '# ' + PD.map(([k]) => k + '=' + ST.P[k]).join(' '),
    '# kąty między ramionami: ' + J.cor.map((c) => `${Math.round((c.g * 180) / Math.PI)}°(${c.type})`).join(' '),
    '# cięcia ramion: ' + J.arms.map((a) => `${a.i + 1}:${f(a.d)}`).join(' '),
    `W0 ${f(ST.c[0])} ${f(ST.c[1])}`,
    ...ST.arms.map((a, i) => `W${i + 1} ${f(a.p[0])} ${f(a.p[1])} ${a.n} ${a.dir}`),
  ].join('\n');
}
function fromText(t) {
  const S = JSON.parse(JSON.stringify(ST));
  for (const ln of t.split(/\r?\n/)) {
    if (/^#\s*[A-Za-z]+=/.test(ln))
      ln.replace(/([A-Za-z]+)=(-?[\d.]+)/g, (_, k, v) => {
        if (k in S.P) S.P[k] = +v;
      });
    const m = /^W(\d)\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s+(\d+)\s+(both|out|in))?/.exec(ln.trim());
    if (m) {
      if (m[1] === '0') S.c = [+m[2], +m[3]];
      else if (S.arms[+m[1] - 1]) {
        const a = S.arms[+m[1] - 1];
        a.p = [+m[2], +m[3]];
        if (m[4]) {
          a.n = +m[4];
          a.dir = m[5];
        }
      }
    }
  }
  return S;
}
function okno(txt, paste) {
  $('mod').style.display = 'flex';
  $('modT').value = txt;
  $('modOk').style.display = paste ? '' : 'none';
  $('modT').focus();
  $('modT').select();
}
function toast(t) {
  const e = $('toast');
  e.textContent = t;
  e.style.opacity = 1;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (e.style.opacity = 0), 2600);
}
$('bCopy').onclick = () => {
  const t = toText();
  try {
    navigator.clipboard.writeText(t).then(() => toast('Skopiowano – wklej Claude i napisz, co jest źle'), () => okno(t));
  } catch (e) {
    okno(t);
  }
};
$('bPaste').onclick = () => okno('', true);
$('modX').onclick = () => ($('mod').style.display = 'none');
$('modOk').onclick = () => {
  push();
  ST = fromText($('modT').value);
  $('mod').style.display = 'none';
  panel();
  fit();
  redraw();
};
/* test przemiatania kątów (konsola: sweepTest()) – NaN, samoprzecięcia obrysu, ciągłość */
function sweepTest() {
  const bad = [];
  for (let a1 = 20; a1 <= 340; a1 += 10)
    for (let a2 = a1 + 20; a2 <= 340; a2 += 10)
      for (const R of [0, 8, 25])
        for (const n of [1, 3]) {
          const mk = (deg) => [Math.cos((deg * Math.PI) / 180) * 60, Math.sin((deg * Math.PI) / 180) * 60];
          const A = [{ p: mk(0), n, dir: 'both' }, { p: mk(a1), n: 2, dir: 'both' }, { p: mk(a2), n, dir: 'both' }],
            P = { ...DEF.P, R };
          try {
            const J = junction([0, 0], A, P),
              pts = J.poly;
            if (pts.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) bad.push(`NaN a1=${a1} a2=${a2} R=${R}`);
            else if (J.arms.some((a) => a.d > 0.45 * a.L + 1e-6)) bad.push(`cięcie>0.45L a1=${a1} a2=${a2}`);
          } catch (e) {
            bad.push(`wyjątek ${e.message} a1=${a1} a2=${a2}`);
          }
        }
  return bad;
}
window.sweepTest = sweepTest;
try {
  const z = JSON.parse(localStorage.getItem('skrz1') || 'null');
  if (z && z.P && z.arms && z.arms.length === 3) ST = { ...DEF, ...z, P: { ...DEF.P, ...z.P } };
} catch (e) {
  /* domyślne */
}
panel();
fit();
draw();
