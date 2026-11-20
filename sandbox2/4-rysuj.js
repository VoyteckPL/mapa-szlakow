/* sandbox2 · rysowanie na canvas. Render tylko rysuje gotową geometrię z buduj(). */
'use strict';
const KOL = {
  tlo: '#dfe5d8',
  asf: '#5b5f66',
  bial: '#f4f4f4',
  os: 'rgba(30,136,229,.55)',
  wez: '#ff7a00',
  pkt: '#1e88e5',
};

function rysuj(cv, V, sc, B, opt) {
  const g = cv.getContext('2d'),
    dpr = window.devicePixelRatio || 1,
    W = cv.clientWidth,
    H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = KOL.tlo;
  g.fillRect(0, 0, W, H);
  const X = (p) => [(p[0] - V.cx) * V.z + W / 2, H / 2 - (p[1] - V.cy) * V.z];
  const path = (P, close) => {
    g.beginPath();
    P.forEach((p, i) => {
      const s = X(p);
      i ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]);
    });
    if (close) g.closePath();
  };
  /* asfalt: ciągi + wielokąty węzłów; cienki obrys tym samym kolorem zamyka szwy antyaliasingu */
  g.fillStyle = g.strokeStyle = KOL.asf;
  g.lineWidth = 1;
  g.lineJoin = 'round';
  for (const c of B.ciagi) {
    path(c.poly, true);
    g.fill();
    g.stroke();
  }
  for (const w of B.wezly) {
    path(w.poly, true);
    g.fill();
    g.stroke();
  }
  /* oznakowanie */
  const lw = Math.max(1.5, 0.2 * V.z);
  g.strokeStyle = KOL.bial;
  g.lineCap = 'butt';
  for (const c of B.ciagi)
    for (const l of c.lines) {
      g.lineWidth = l.kind === 'oddz' ? lw * 1.6 : lw;
      g.setLineDash(l.kind === 'pas' ? [3 * V.z, 6 * V.z] : []);
      path(l.P);
      g.stroke();
    }
  g.setLineDash([]);
  g.lineWidth = lw;
  for (const w of B.wezly)
    for (const cv2 of w.curbs) {
      path(cv2);
      g.stroke();
    }
  /* osie OSM, węzły, nazwy */
  if (opt.osie) {
    g.strokeStyle = KOL.os;
    g.lineWidth = 1.2;
    g.setLineDash([6, 4]);
    for (const r of sc.roads) {
      path(roadPts(sc, r));
      g.stroke();
      /* strzałka kierunku dla jednokierunkowych */
      if (r.jedn) {
        const P = roadPts(sc, r),
          C = G.cum(P),
          m = G.at(P, C, C[C.length - 1] / 2),
          s = X(m.p),
          a = Math.atan2(-m.u[1], m.u[0]);
        g.save();
        g.translate(s[0], s[1]);
        g.rotate(a);
        g.beginPath();
        g.moveTo(7, 0);
        g.lineTo(-4, -5);
        g.lineTo(-4, 5);
        g.closePath();
        g.fillStyle = KOL.os;
        g.fill();
        g.restore();
      }
    }
    g.setLineDash([]);
    g.fillStyle = KOL.pkt;
    for (const r of sc.roads)
      r.mid.forEach((p) => {
        const s = X(p);
        g.beginPath();
        g.arc(s[0], s[1], 4, 0, 7);
        g.fill();
      });
  }
  g.font = '600 12px system-ui';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const r of sc.roads) {
    const P = roadPts(sc, r),
      C = G.cum(P),
      m = G.at(P, C, C[C.length - 1] * 0.62),
      s = X(G.add(m.p, G.mul([-m.u[1], m.u[0]], hwOf(r) + 3))),
      t = `${r.id} ${r.typ}${r.pasy}${r.jedn ? '>' : ''}`;
    g.fillStyle = r === opt.sel ? '#ffe082' : 'rgba(255,255,255,.85)';
    const w = g.measureText(t).width + 8;
    g.fillRect(s[0] - w / 2, s[1] - 9, w, 18);
    g.fillStyle = '#1d2330';
    g.fillText(t, s[0], s[1]);
  }
  for (const n of sc.nodes.values()) {
    const s = X(n.p),
      typ = B.typy[n.id],
      big = typ && typ !== 'koniec';
    g.beginPath();
    g.arc(s[0], s[1], big ? 7 : 5, 0, 7);
    g.fillStyle = big ? KOL.wez : '#fff';
    g.fill();
    g.strokeStyle = '#1d2330';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = '#1d2330';
    g.fillText(n.id, s[0] + 14, s[1] - 12);
  }
}

/* miniatura sceny jako SVG (ikona na liście) */
function ikona(txt) {
  const sc = parseScene(txt);
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1e9,
    y1 = -1e9;
  sc.roads.forEach((r) =>
    roadPts(sc, r).forEach((p) => {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }),
  );
  const k = 40 / Math.max(x1 - x0, y1 - y0, 1),
    ox = 24 - ((x0 + x1) / 2) * k,
    oy = 24 + ((y0 + y1) / 2) * k;
  const ln = sc.roads
    .map((r) => {
      const d = roadPts(sc, r)
        .map((p, i) => (i ? 'L' : 'M') + (ox + p[0] * k).toFixed(1) + ' ' + (oy - p[1] * k).toFixed(1))
        .join('');
      return `<path d="${d}" stroke="currentColor" stroke-width="${Math.max(2, Math.min(9, hwOf(r) * 2 * k * 2.2)).toFixed(1)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join('');
  return `<svg viewBox="0 0 48 48" width="40" height="40">${ln}</svg>`;
}
