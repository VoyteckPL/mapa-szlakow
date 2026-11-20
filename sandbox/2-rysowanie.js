'use strict';
// ---------- rysowanie ----------
const TILES = new Map();
let tq = 0;
const tw = [];
const merc = (x, y, n) => {
  const R = 20037508.342789244;
  return [(x / n) * 2 * R - R, R - (y / n) * 2 * R];
};
window.__tst = { ok: 0, err: 0, last: '' };
async function fetchTile(kind, z, x, y, im) {
  if (kind === 'orto' || kind === 'ortolo' || kind === 'esri') await osmIdle();
  while (tq >= (kind === 'orto' || kind === 'ortolo' ? 6 : 4)) await new Promise((r) => tw.push(r));
  tq++;
  try {
    {
      /* kafelek, ktory przestal byc widoczny (przesuniecie/zoom w trakcie kolejki), nie jest pobierany: kolejka obsluguje to, co jest na ekranie */ const n =
          2 ** z,
        lo = (v) => (v / n) * 360 - 180,
        la = (v) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * v) / n))) * 180) / Math.PI,
        a = w2s(proj(lo(x), la(y))),
        b = w2s(proj(lo(x + 1), la(y + 1))),
        zc = Math.log2(156543.03 * Math.cos((S.org.lat * Math.PI) / 180) * S.view.k);
      if (b[0] < -300 || b[1] < -300 || a[0] > W + 300 || a[1] > H + 300 || Math.abs(z - Math.round(zc)) > 3) {
        TILES.delete(kind + z + '/' + x + '/' + y);
        return;
      }
    }
    let url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    if (kind === 'topo') url = `https://${'abc'[(x + y) % 3]}.tile.opentopomap.org/${z}/${x}/${y}.png`;
    if (kind === 'quiet') url = `https://a.basemaps.cartocdn.com/light_nolabels/${z}/${x}/${y}.png`;
    if (kind === 'esri')
      url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    if (kind === 'ortolo') {
      const n = 2 ** z,
        a = merc(x, y + 1, n),
        b = merc(x + 1, y, n);
      url = `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=Raster&STYLES=&FORMAT=image/jpeg&TRANSPARENT=FALSE&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX=${a[0]},${a[1]},${b[0]},${b[1]}`;
    }
    if (kind === 'orto') {
      const n = 2 ** z,
        a = merc(x, y + 1, n),
        b = merc(x + 1, y, n);
      url = `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=Raster&STYLES=&FORMAT=image/jpeg&TRANSPARENT=FALSE&CRS=EPSG:3857&WIDTH=512&HEIGHT=512&BBOX=${a[0]},${a[1]},${b[0]},${b[1]}`;
    }
    let cache = null;
    try {
      cache = await caches.open('edytor-podklad-v1');
      const hit = await cache.match(url);
      if (hit) {
        im.src = URL.createObjectURL(await hit.blob());
        return;
      }
    } catch (e) {}
    for (let t = 0; t < 5; t++) {
      const r = await fetch(url);
      if (r.ok) {
        window.__tst.ok++;
        try {
          if (cache) cache.put(url, r.clone());
        } catch (e) {}
        im.src = URL.createObjectURL(await r.blob());
        return;
      }
      window.__tst.err++;
      window.__tst.last = kind + ' HTTP ' + r.status;
      if (![429, 500, 502, 503, 504].includes(r.status)) return;
      await new Promise((q) => setTimeout(q, 400 * 2 ** t));
    }
  } catch (e) {
    window.__tst.err++;
    window.__tst.last = kind + ' ' + ((e && e.message) || e);
  } finally {
    tq--;
    const n = tw.pop();
    if (n) n();
  } /* najnowsze zadania pierwsze (LIFO): po przesunieciu mapy najpierw widoczne kafelki */
}
let srT = 0,
  srLast = 0;
function schedRender() {
  if (srT) return;
  const wait = 0;
  srT = setTimeout(() => {
    srT = 0;
    srLast = performance.now();
    requestAnimationFrame(render);
  }, wait);
} /* zlaczone przerysowania po zaladowaniu kafelkow (w jezdzie max co ~350 ms) */
function tile(kind, z, x, y) {
  const k = kind + z + '/' + x + '/' + y;
  let im = TILES.get(k);
  if (!im) {
    im = new Image();
    im.onload = schedRender;
    TILES.set(k, im);
    fetchTile(kind, z, x, y, im);
  }
  return im;
}
function drawTiles() {
  if (!$('cTile').checked) return;
  const kind = $('bm').value;
  if (kind === 'quiet') {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#eceef1';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.restore();
    return;
  }
  let z = Math.round(Math.log2(156543.03 * Math.cos((S.org.lat * Math.PI) / 180) * S.view.k));
  z = Math.max(2, Math.min(kind === 'topo' ? 17 : kind === 'orto' ? 20 : kind === 'ortolo' ? 18 : 19, z));
  const a = unproj(s2w([0, 0])),
    b = unproj(s2w([W, H])),
    n = 2 ** z;
  const tx = (lon) => ((lon + 180) / 360) * n,
    ty = (lat) =>
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  const lonOf = (x) => (x / n) * 360 - 180,
    latOf = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const x0 = Math.floor(tx(a.lon)),
    x1 = Math.floor(tx(b.lon)),
    y0 = Math.floor(ty(a.lat)),
    y1 = Math.floor(ty(b.lat));
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 80) return;
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      const im = tile(kind, z, x, y),
        p = w2s(proj(lonOf(x), latOf(y))),
        q = w2s(proj(lonOf(x + 1), latOf(y + 1)));
      if (!im.complete || !im.naturalWidth) {
        // do czasu wczytania: kafel z niższego zoomu
        for (let up = 1; up <= 3 && z - up >= 2; up++) {
          const pk = kind + (z - up) + '/' + (x >> up) + '/' + (y >> up),
            pim = TILES.get(pk);
          if (pim && pim.complete && pim.naturalWidth) {
            const f = 2 ** up,
              sw = pim.naturalWidth / f,
              sh = pim.naturalHeight / f;
            ctx.drawImage(pim, (x % f) * sw, (y % f) * sh, sw, sh, p[0], p[1], q[0] - p[0] + 0.6, q[1] - p[1] + 0.6);
            break;
          }
        }
        continue;
      }
      ctx.drawImage(im, p[0], p[1], q[0] - p[0] + 0.6, q[1] - p[1] + 0.6);
    }
}
function pathOf(g, P, closed) {
  const s = P.map(w2s);
  g.beginPath();
  s.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  if (closed) g.closePath();
}
function drawLayer(g) {
  const lys = [...new Set([...L.polys, ...L.gores, ...L.lines, ...L.arrows].map((q) => q.ly | 0))].sort(
    (a, b) => a - b,
  );
  for (const ly of lys) drawGroup(g, ly);
}
let ASPT = null;
const SFP = {};
const surfOf = (r) => {
  let v = r.sf;
  if (v == null && r.osm) {
    const o = S.osm.ways.get(r.osm);
    v = o && o.t && o.t.surface;
  }
  v = String(v || '').split(';')[0];
  return /^(paving_stones|sett|cobblestone|unhewn_cobblestone|paved_stones)/.test(v)
    ? 'brick'
    : /^(concrete|concrete:plates|concrete:lanes)/.test(v)
      ? 'concrete'
      : /^(gravel|fine_gravel|compacted|pebblestone|woodchips)/.test(v)
        ? 'gravel'
        : /^(unpaved|dirt|ground|earth|mud|sand|grass)/.test(v)
          ? 'dirt'
          : '';
};
function surfPat(kind) {
  if (SFP[kind]) return SFP[kind];
  const N = 128,
    c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  let sd = 11;
  const rnd = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296; /* kafel 4 m */
  const base = { brick: '#9b948c', concrete: '#aeb0ac', gravel: '#b5a888', dirt: '#9a8466' }[kind];
  x.fillStyle = base;
  x.fillRect(0, 0, N, N);
  if (kind === 'brick') {
    const bw = 16,
      bh = 8;
    for (let r = 0; r < N / bh; r++)
      for (let q = 0; q < N / bw; q++) {
        const o = ((r % 2) * bw) / 2,
          v = 128 + (rnd() - 0.5) * 36;
        x.fillStyle = `rgb(${v + 12},${v + 4},${v - 6})`;
        x.fillRect(q * bw + o + 0.7, r * bh + 0.7, bw - 1.4, bh - 1.4);
        if (o && q === 0) x.fillRect(o - bw + 0.7, r * bh + 0.7, bw - 1.4, bh - 1.4);
      }
  } else if (kind === 'concrete') {
    for (let i = 0; i < 1500; i++) {
      x.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '90,90,90'},${rnd() * 0.12})`;
      x.fillRect(rnd() * N, rnd() * N, 1.5, 1.5);
    }
    x.strokeStyle = 'rgba(70,70,70,.45)';
    x.lineWidth = 0.7;
    x.strokeRect(0.5, 0.5, N - 1, N - 1);
    x.beginPath();
    x.moveTo(N / 2, 0);
    x.lineTo(N / 2, N);
    x.stroke();
  } else {
    for (let i = 0; i < (kind === 'gravel' ? 2600 : 1800); i++) {
      const v = rnd();
      x.fillStyle =
        kind === 'gravel'
          ? `rgba(${v < 0.5 ? '235,225,200' : '120,105,80'},${0.15 + rnd() * 0.3})`
          : `rgba(${v < 0.5 ? '170,140,100' : '70,50,30'},${0.12 + rnd() * 0.25})`;
      x.beginPath();
      x.arc(rnd() * N, rnd() * N, 0.5 + rnd() * (kind === 'gravel' ? 1.4 : 2.2), 0, 7);
      x.fill();
    }
  }
  return (SFP[kind] = c);
}
function asphaltPat(g, k) {
  // tekstura asfaltu: ziarno + plamy, kafel zakotwiczony w metrach (skaluje sie z zoomem)
  if (!ASPT) {
    const N = 256,
      c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d'),
      im = x.createImageData(N, N);
    let sd = 7;
    const rnd = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < N * N; i++) {
      const r0 = rnd(),
        v = 103 + (rnd() - 0.5) * 18 + (r0 < 0.035 ? 26 + rnd() * 30 : 0) - (r0 > 0.975 ? 18 : 0);
      im.data[i * 4] = v;
      im.data[i * 4 + 1] = v + 3;
      im.data[i * 4 + 2] = v + 8;
      im.data[i * 4 + 3] = 255;
    } /* kolor jak asfalt na ortofotomapie (Geoportal): sredni szary z chlodnym odcieniem, jasne ziarna kruszywa i ciemne pory */
    x.putImageData(im, 0, 0);
    for (let q = 0; q < 26; q++) {
      const px = rnd() * N,
        py = rnd() * N,
        r = 14 + rnd() * 34,
        a = (rnd() - 0.5) * 0.09;
      for (const dx of [-N, 0, N])
        for (const dy of [-N, 0, N]) {
          const gr = x.createRadialGradient(px + dx, py + dy, 0, px + dx, py + dy, r),
            col = a > 0 ? '255,255,255' : '0,0,0';
          gr.addColorStop(0, 'rgba(' + col + ',' + Math.abs(a) + ')');
          gr.addColorStop(1, 'rgba(' + col + ',0)');
          x.fillStyle = gr;
          x.fillRect(px + dx - r, py + dy - r, 2 * r, 2 * r);
        }
    }
    ASPT = c;
  }
  const p = g.createPattern(ASPT, 'repeat'),
    o = w2s([0, 0]),
    sc = k / 40;
  try {
    p.setTransform(new DOMMatrix([sc, 0, 0, sc, o[0], o[1]]));
  } catch (e) {}
  return p;
}
let EDGE_C = null,
  EDGE_PEND = null,
  SM_C = null;
function pipN(pt, P) {
  if (!P || P.length < 3) return false;
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i],
      b = P[j];
    if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
} /* punkt w wielokacie wezla */
function drawGroup(g, ly) {
  const k = S.view.k;
  g.lineJoin = 'round';
  const PAT = asphaltPat(g, k) || '#7c8083';
  const Lp = L.polys.filter((q) => (q.ly | 0) === ly),
    Lg = L.gores.filter((q) => (q.ly | 0) === ly),
    Ll = L.lines.filter((q) => (q.ly | 0) === ly && !(window.__noEdge && q.st === 'p2')),
    La = L.arrows.filter((q) => (q.ly | 0) === ly);
  if (ly > 0)
    for (const q of Lp)
      if (q.br && q.P.length > 2) {
        /* cien mostu rzucony na nizsze warstwy: rozmyty, przesuniety w dol-prawo (slonce z lewej-gory), z ciemniejszym rdzeniem przy krawedzi */
        g.save();
        g.lineJoin = 'round';
        {
          /* cien tylko miedzy poprzecznymi koncami mostu: nie zachodzi na drogi dojazdowe (asfalt jednolity przy wjezdach) */ const A0 =
              q.L[0],
            B0 = q.R[0],
            A1 = q.L[q.L.length - 1],
            B1 = q.R[q.R.length - 1],
            n0 = [B0[0] - A0[0], B0[1] - A0[1]],
            n1 = [B1[0] - A1[0], B1[1] - A1[1]],
            l0 = Math.hypot(n0[0], n0[1]) || 1,
            l1 = Math.hypot(n1[0], n1[1]) || 1,
            W = 60,
            m0 = [(A0[0] + B0[0]) / 2, (A0[1] + B0[1]) / 2],
            m1 = [(A1[0] + B1[0]) / 2, (A1[1] + B1[1]) / 2];
          pathOf(
            g,
            [
              [m0[0] - (n0[0] / l0) * W, m0[1] - (n0[1] / l0) * W],
              [m0[0] + (n0[0] / l0) * W, m0[1] + (n0[1] / l0) * W],
              [m1[0] + (n1[0] / l1) * W, m1[1] + (n1[1] / l1) * W],
              [m1[0] - (n1[0] / l1) * W, m1[1] - (n1[1] / l1) * W],
            ],
            true,
          );
          g.clip();
        }
        for (const [dx, dy, bl, al] of [
          [2.6, 3.2, 1.6, 0.2],
          [1.2, 1.5, 0.7, 0.22],
        ]) {
          g.save();
          try {
            g.filter = 'blur(' + Math.max(0.5, bl * k) + 'px)';
          } catch (e) {}
          g.translate(dx * k, dy * k);
          pathOf(g, q.P, true);
          g.fillStyle = 'rgba(8,10,14,' + al + ')';
          g.fill();
          g.restore();
        }
        g.restore();
      } // cień wiaduktu na niższych drogach
  if (!(window.__smooth || window.__nodeGeom)) {
    g.lineCap = 'butt';
    g.lineJoin = 'round';
    for (const [col, wd] of [
      ['#6f716c', 0.84],
      ['#c4c6c0', 0.68],
    ]) {
      g.strokeStyle = col;
      g.lineWidth = Math.max(1.5, wd * k);
      for (const q of Lp)
        if (q.P.length > 2 && q.kerb !== false)
          for (const E of [q.L, q.R]) {
            pathOf(g, E, false);
            g.stroke();
          }
    }
  } /* najpierw wszystkie ciemne obrysy, potem jasne: bez szwow na zlaczach segmentow */ // krawezniki: waski jasny pasek na zewnatrz konturu (wnetrze przykrywa jezdnia)
  if (!(window.__smooth || window.__nodeGeom)) {
    // asfalt jezdni: jeden wspolny obrys (jednolita powierzchnia bez szwow miedzy jezdniami); kierunek obrysow ujednolicony, zeby nakladajace sie nie wycinaly dziur
    g.beginPath();
    let any = false;
    for (const q of Lp)
      if (q.P.length > 2) {
        let P = q.P.map(w2s),
          ar = 0;
        for (let i = 0; i < P.length; i++) {
          const a2 = P[i],
            b2 = P[(i + 1) % P.length];
          ar += a2[0] * b2[1] - b2[0] * a2[1];
        }
        if (ar < 0) P = P.reverse();
        P.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.closePath();
        any = true;
      }
    if (any) {
      g.fillStyle = g.strokeStyle = '#7c8083';
      g.lineWidth = 1;
      g.fill('nonzero');
      g.fillStyle = PAT;
      g.fill('nonzero');
      g.lineJoin = 'round';
      g.lineWidth = Math.max(2.5, 0.3 * k);
      g.strokeStyle = '#7c8083';
      g.stroke();
      g.strokeStyle = PAT;
      g.stroke();
    } /* obrys zakrywa waskie szczeliny miedzy sasiednimi jezdniami */
  }
  const UN = !window.__noUnion && Lp.some((q) => q.ed);
  if (UN) {
    /* biala krawedz z wspolnego obrysu asfaltu (ciagla i plynna na zlaczach): maska sumy jezdni, erozja przez przesuniecia, pas = maska minus erozja */
    const cw = g.canvas.width,
      ch = g.canvas.height,
      mk = () => {
        const c = document.createElement('canvas');
        c.width = cw;
        c.height = ch;
        return c;
      };
    EDGE_C = EDGE_C || [mk(), mk(), mk(), mk(), mk()];
    for (const c of EDGE_C)
      if (c.width !== cw || c.height !== ch) {
        c.width = cw;
        c.height = ch;
      }
    const [M, E, Bd, E2, L2] = EDGE_C,
      mg = M.getContext('2d'),
      eg = E.getContext('2d'),
      bg = Bd.getContext('2d'),
      tr = g.getTransform(),
      dp = tr.a;
    mg.setTransform(1, 0, 0, 1, 0, 0);
    mg.clearRect(0, 0, cw, ch);
    mg.setTransform(tr);
    mg.beginPath();
    for (const q of Lp)
      if (q.P.length > 2 && q.ed) {
        let P = q.P.map(w2s),
          ar = 0;
        for (let i = 0; i < P.length; i++) {
          const a2 = P[i],
            b2 = P[(i + 1) % P.length];
          ar += a2[0] * b2[1] - b2[0] * a2[1];
        }
        if (ar < 0) P = P.reverse();
        P.forEach((p, i) => (i ? mg.lineTo(p[0], p[1]) : mg.moveTo(p[0], p[1])));
        mg.closePath();
      }
    mg.fillStyle = mg.strokeStyle = '#fff';
    mg.fill('nonzero');
    mg.lineJoin = 'round';
    mg.lineWidth = Math.max(2.5, 0.3 * k);
    mg.stroke(); /* jak asfalt: zamyka waskie szczeliny miedzy sasiednimi poligonami */
    if (window.__smooth || window.__nodeGeom) {
      /* gladkie rogi: maska sumy rozmyta i uciete progiem (zaokraglenie ~0,2 m), asfalt/krawezniki/linia ze wspolnej maski */
      if (!document.getElementById('smBlur')) {
        const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        sv.setAttribute('width', 0);
        sv.setAttribute('height', 0);
        sv.style.position = 'absolute';
        sv.innerHTML = ['smBlur:50:-25', 'smKd:20:-4', 'smKl:20:-4']
          .map((x) => {
            const [id, sl, ic] = x.split(':');
            return (
              '<filter id="' +
              id +
              '" color-interpolation-filters="sRGB" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur id="' +
              id +
              'G" stdDeviation="2"/><feComponentTransfer><feFuncA type="linear" slope="' +
              sl +
              '" intercept="' +
              ic +
              '"/></feComponentTransfer></filter>'
            );
          })
          .join('');
        document.body.appendChild(sv);
      }
      SM_C = SM_C || [mk(), mk(), mk()];
      for (const c of SM_C)
        if (c.width !== cw || c.height !== ch) {
          c.width = cw;
          c.height = ch;
        }
      const ppm = k * dp,
        ps = (id, px) => document.getElementById(id + 'G').setAttribute('stdDeviation', Math.max(0.3, px)),
        [T1, T2, T3] = SM_C,
        t1 = T1.getContext('2d'),
        t2 = T2.getContext('2d'),
        t3 = T3.getContext('2d');
      {
        /* domkniecie maski (dylatacja, potem erozja kolem ~0,8 m, kilka malych krokow): wcieca/schodki krawedzi zalane na zewnatrz, proste krawedzie i duze wyspy bez zmian */
        const NS = 4,
          sp = ((window.__smC || 1.3) / NS) * ppm;
        let cur = M;
        const O = [t2, t3],
          OC = [T2, T3];
        let bi = 0;
        const stepD = (src, dil) => {
          const t = O[bi],
            c = OC[bi];
          bi ^= 1;
          t.setTransform(1, 0, 0, 1, 0, 0);
          t.globalCompositeOperation = 'source-over';
          t.clearRect(0, 0, cw, ch);
          if (dil) {
            for (let q = 0; q < 12; q++) {
              const an = (q * Math.PI) / 6;
              t.drawImage(src, Math.cos(an) * sp, Math.sin(an) * sp);
            }
          } else {
            t.drawImage(src, 0, 0);
            t.globalCompositeOperation = 'destination-in';
            for (let q = 0; q < 12; q++) {
              const an = (q * Math.PI) / 6;
              t.drawImage(src, Math.cos(an) * sp, Math.sin(an) * sp);
            }
          }
          return c;
        };
        for (let q = 0; q < NS; q++) cur = stepD(cur, true);
        for (let q = 0; q < NS; q++) cur = stepD(cur, false);
        mg.setTransform(1, 0, 0, 1, 0, 0);
        mg.clearRect(0, 0, cw, ch);
        mg.drawImage(cur, 0, 0);
      }
      t1.setTransform(1, 0, 0, 1, 0, 0);
      t1.clearRect(0, 0, cw, ch);
      ps('smBlur', (window.__smS || 0.4) * ppm);
      t1.filter = 'url(#smBlur)';
      t1.drawImage(M, 0, 0);
      t1.filter = 'none';
      mg.setTransform(1, 0, 0, 1, 0, 0);
      mg.clearRect(0, 0, cw, ch);
      mg.drawImage(T1, 0, 0);
      mg.setTransform(tr); /* M = wygladzona maska */
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      for (const [id, col, dm] of [
        ['smKd', '#6f716c', 0.42],
        ['smKl', '#c4c6c0', 0.34],
      ]) {
        ps(id, (dm * ppm) / 0.84);
        t2.setTransform(1, 0, 0, 1, 0, 0);
        t2.globalCompositeOperation = 'source-over';
        t2.clearRect(0, 0, cw, ch);
        t2.filter = 'url(#' + id + ')';
        t2.drawImage(M, 0, 0);
        t2.filter = 'none';
        t2.globalCompositeOperation = 'source-in';
        t2.fillStyle = col;
        t2.fillRect(0, 0, cw, ch);
        g.drawImage(T2, 0, 0);
      }
      t3.setTransform(1, 0, 0, 1, 0, 0);
      t3.globalCompositeOperation = 'source-over';
      t3.clearRect(0, 0, cw, ch);
      t3.drawImage(M, 0, 0);
      t3.globalCompositeOperation = 'source-in';
      t3.setTransform(tr);
      t3.fillStyle = PAT;
      t3.fillRect(-1e5, -1e5, 2e5, 2e5);
      t3.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(T3, 0, 0);
      g.restore();
    }
    const d = Math.max(1.2, 0.2 * k * dp); /* grubosc paska [px urzadzenia] = 0,2 m jak linia ciagla */
    eg.setTransform(1, 0, 0, 1, 0, 0);
    eg.globalCompositeOperation = 'source-over';
    eg.clearRect(0, 0, cw, ch);
    eg.drawImage(M, 0, 0);
    eg.globalCompositeOperation = 'destination-in';
    for (let q = 0; q < 12; q++) {
      const an = (q * Math.PI) / 6;
      eg.drawImage(M, Math.round(Math.cos(an) * d), Math.round(Math.sin(an) * d));
    }
    bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.globalCompositeOperation = 'source-over';
    bg.clearRect(0, 0, cw, ch);
    bg.drawImage(M, 0, 0);
    bg.globalCompositeOperation = 'destination-out';
    bg.drawImage(E, 0, 0);
    bg.globalCompositeOperation = 'source-in';
    bg.fillStyle = '#f2f2f2';
    bg.fillRect(0, 0, cw, ch);
    {
      /* krawedzie wewnatrz sumy (np. miedzy sasiednimi jezdniami): zostaja tylko tam, gdzie leza dalej niz 0,5 m od obrysu */
      const e2 = E2.getContext('2d'),
        l2 = L2.getContext('2d'),
        d2 = Math.max(2, 0.5 * k * dp);
      e2.setTransform(1, 0, 0, 1, 0, 0);
      e2.globalCompositeOperation = 'source-over';
      e2.clearRect(0, 0, cw, ch);
      e2.drawImage(M, 0, 0);
      e2.globalCompositeOperation = 'destination-in';
      for (let q = 0; q < 12; q++) {
        const an = (q * Math.PI) / 6;
        e2.drawImage(M, Math.round(Math.cos(an) * d2), Math.round(Math.sin(an) * d2));
      }
      l2.setTransform(1, 0, 0, 1, 0, 0);
      l2.globalCompositeOperation = 'source-over';
      l2.clearRect(0, 0, cw, ch);
      l2.setTransform(tr);
      l2.lineCap = 'butt';
      l2.lineJoin = 'round';
      l2.strokeStyle = '#f2f2f2';
      l2.lineWidth = Math.max(1, LS.p2.w * k);
      for (const l of Ll)
        if (l.st === 'p2' && !l.noInt) {
          if (window.__smooth || window.__nodeGeom) continue;
          if (window.__smooth || window.__nodeGeom) {
            let tl = 0;
            for (let z = 1; z < l.P.length; z++) tl += Math.hypot(l.P[z][0] - l.P[z - 1][0], l.P[z][1] - l.P[z - 1][1]);
            if (tl < 2) continue;
          }
          pathOf(l2, l.P, false);
          l2.stroke();
        }
      l2.setTransform(1, 0, 0, 1, 0, 0);
      l2.globalCompositeOperation = 'destination-in';
      l2.drawImage(E2, 0, 0);
      bg.globalCompositeOperation = 'source-over';
      bg.drawImage(L2, 0, 0);
    }
    EDGE_PEND = Bd;
  }
  for (const q of Lp)
    if (q.P.length > 2) {
      if (ly > 0 && q.br) {
        g.lineCap = 'butt';
        g.lineJoin = 'round';
        for (const E of [q.L, q.R]) {
          /* dzwigar/fasada pomostu widoczna od spodu */ g.save();
          g.translate(0.5 * k, 0.65 * k);
          pathOf(g, E, false);
          g.strokeStyle = '#43474d';
          g.lineWidth = Math.max(2.5, 0.95 * k);
          g.stroke();
          g.translate(-0.22 * k, -0.28 * k);
          pathOf(g, E, false);
          g.strokeStyle = '#8d9197';
          g.lineWidth = Math.max(1.5, 0.38 * k);
          g.stroke();
          g.restore();
          /* barierki mostu: betonowy parapet 3D: cien rzucony na jezdnie, ciemna sciana boczna, jasny wierzch z listwa swiatla i slupki */ const sh =
            0.55 * k;
          g.save();
          g.translate(sh * 0.7, sh * 0.8);
          pathOf(g, E, false);
          g.strokeStyle = 'rgba(10,12,16,.32)';
          g.lineWidth = Math.max(2.5, 0.75 * k);
          g.stroke();
          g.restore();
          pathOf(g, E, false);
          g.strokeStyle = '#6b6f75';
          g.lineWidth = Math.max(2.5, 0.72 * k);
          g.stroke();
          g.save();
          g.translate(-0.07 * k, -0.09 * k);
          pathOf(g, E, false);
          g.strokeStyle = '#b4b8bd';
          g.lineWidth = Math.max(1.5, 0.5 * k);
          g.stroke();
          pathOf(g, E, false);
          g.strokeStyle = '#e4e6e9';
          g.lineWidth = Math.max(1, 0.2 * k);
          g.stroke();
          g.restore();
          g.save();
          pathOf(g, E, false);
          g.setLineDash([Math.max(1, 0.18 * k), Math.max(3, 4 * k)]);
          g.strokeStyle = '#555960';
          g.lineWidth = Math.max(2.5, 0.74 * k);
          g.stroke();
          g.restore();
        }
      }
    }
  if (EDGE_PEND) {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(EDGE_PEND, 0, 0);
    g.restore();
    EDGE_PEND = null;
  }
  for (const q of Lg) {
    pathOf(g, q.poly, true);
    g.fillStyle = g.strokeStyle = '#7c8083';
    g.lineWidth = 1;
    g.fill();
    g.fillStyle = PAT;
    g.fill();
    g.stroke();
  }
  for (const q of Lg)
    if (q.cap) {
      g.strokeStyle = '#c9cdd2';
      g.lineWidth = Math.max(1.5, 0.7 * k);
      g.lineCap = 'butt';
      pathOf(g, q.cap, false);
      g.stroke();
    } // koniec wyspy: krawężnik łączy się z krawężnikami jezdni
  const line = (P, st, col) => {
    const sty = LS[st] || LS.p1,
      one = (Q) => {
        pathOf(g, Q, false);
        g.setLineDash(sty.dash ? sty.dash.map((v) => v * k) : []);
        g.lineWidth = Math.max(1, sty.w * k);
        g.strokeStyle = col || '#f2f2f2';
        g.lineCap = 'butt';
        g.stroke();
        g.setLineDash([]);
      };
    if (sty.dbl) {
      one(offsetPts(P, -sty.dbl));
      one(offsetPts(P, sty.dbl));
    } else one(P);
  };
  for (const l of Ll) {
    if (UN && l.st === 'p2') continue;
    line(l.P, l.st);
  }
  for (const q of Lg) {
    if (!q.nl) {
      line(q.A, 'p2');
      line(q.B, 'p2');
    }
    for (const e of q.extra || []) line(e, 'p2');
    if (q.chev.length) {
      g.save();
      pathOf(g, q.clip || q.A.concat(q.B.slice().reverse()), true);
      g.clip();
    }
    for (const c of q.chev) {
      pathOf(g, c, false);
      g.strokeStyle = '#f2f2f2';
      g.lineWidth = Math.max(1.5, 0.4 * k);
      g.lineJoin = 'miter';
      g.lineCap = 'butt';
      g.stroke();
      g.lineJoin = 'round';
    }
    if (q.chev.length) g.restore();
  }
  for (const a of La) {
    const p = w2s([a.x, a.y]);
    g.save();
    g.translate(p[0], p[1]);
    g.rotate(((a.rot - 90) * Math.PI) / 180);
    const sc = (5 * k) / 48;
    g.scale(sc, sc);
    g.translate(-24, -16);
    glyph(g, a.type);
    g.restore();
  }
}
function cutClip(ri, kk) {
  /* sciezka (evenodd): wszystko poza prostokatami za granicami wezlow, ale tylko dla ramion drogi ri */
  const out = [];
  for (const nv of S.nodeViz || [])
    (nv.mini ? [] : nv.cuts || []).forEach((c, j) => {
      if (!c || !nv.lanes[j] || nv.lanes[j].ri !== ri) return;
      const wd = Math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1]),
        mid = [(c[1][0] + c[2][0]) / 2, (c[1][1] + c[2][1]) / 2];
      let u = wd > 1e-6 ? [(c[2][1] - c[1][1]) / wd, -(c[2][0] - c[1][0]) / wd] : nv.lanes[j].u;
      if ((mid[0] - nv.o[0]) * u[0] + (mid[1] - nv.o[1]) * u[1] < 0)
        u = [-u[0], -u[1]]; /* prostopadle do granicy (droga moze skrecac przy wezle), od wezla na zewnatrz */
      const E1 = w2s(c[1]),
        E2 = w2s(c[2]),
        Lp = Math.max(1, (mid[0] - nv.o[0]) * u[0] + (mid[1] - nv.o[1]) * u[1] + 0.4 + wd) * kk,
        ex = E2[0] - E1[0],
        ey = E2[1] - E1[1],
        el = Math.hypot(ex, ey) || 1,
        wx = (ex / el) * kk * (0.4 + wd * 0.5),
        wy = (ey / el) * kk * (0.4 + wd * 0.5),
        F1 = [E1[0] - wx, E1[1] - wy],
        F2 = [E2[0] + wx, E2[1] + wy],
        ov = 0.12 * kk,
        G1 = [F1[0] - u[0] * ov, F1[1] - u[1] * ov],
        G2 = [F2[0] - u[0] * ov, F2[1] - u[1] * ov];
      const cp = new Path2D();
      cp.rect(-1e5, -1e5, 2e5, 2e5);
      cp.moveTo(G1[0], G1[1]);
      cp.lineTo(G2[0], G2[1]);
      cp.lineTo(F2[0] - u[0] * Lp, F2[1] - u[1] * Lp);
      cp.lineTo(F1[0] - u[0] * Lp, F1[1] - u[1] * Lp);
      cp.closePath();
      out.push(cp);
    }); /* osobna sciezka na kazdy koniec: nakladajace sie prostokaty (krotka droga miedzy bliskimi wezlami) nie znosza sie w evenodd */
  return out;
}
function busLanes(ri, NL) {
  /* pasy autobusowe z tagow OSM (+ zmiany w edytorze): bus:lanes / psv:lanes (:forward/:backward), lanes:bus / lanes:psv, busway; indeksy pasow od lewej krawedzi jezdni */
  const r = S.doc.road[ri],
    out = new Set();
  if (!r) return out;
  const w = r.osm && S.osm.ways.get(r.osm),
    t = Object.assign({}, (w && w.t) || {}, r.tg || {}),
    ow = !!r.oneway,
    nb = ow ? 0 : NL - (r.nf || 1),
    nf = NL - nb,
    isB = (v) => /^(designated|only|yes_designated)$/.test(String(v || '').trim());
  const tok = (k1, k2) => {
    const v = t[k1] || t[k2];
    return v ? String(v).split('|') : null;
  };
  const fw = ow
      ? tok('bus:lanes', 'psv:lanes') || tok('bus:lanes:forward', 'psv:lanes:forward')
      : tok('bus:lanes:forward', 'psv:lanes:forward'),
    bw = ow ? null : tok('bus:lanes:backward', 'psv:lanes:backward');
  if (fw && fw.length === nf)
    fw.forEach((v, i) => {
      if (isB(v)) out.add(nb + i);
    });
  if (bw && bw.length === nb)
    bw.forEach((v, i) => {
      if (isB(v)) out.add(nb - 1 - i);
    });
  const cnt = (k) => parseInt(t[k], 10) || 0,
    nF = ow
      ? cnt('lanes:bus') || cnt('lanes:psv') || cnt('lanes:bus:forward') || cnt('lanes:psv:forward')
      : cnt('lanes:bus:forward') || cnt('lanes:psv:forward'),
    nB = ow ? 0 : cnt('lanes:bus:backward') || cnt('lanes:psv:backward');
  for (let i = 0; i < Math.min(nF, nf); i++) out.add(NL - 1 - i);
  for (let i = 0; i < Math.min(nB, nb); i++) out.add(i);
  const bwy = (k) => String(t[k] || '') === 'lane';
  if (bwy('busway:right') || bwy('busway:both') || (ow && bwy('busway'))) out.add(NL - 1);
  if (bwy('busway:left') || bwy('busway:both')) out.add(0);
  if (out.size >= NL && NL > 0 && !/^(busway|bus_guideway)$/.test(r.hw || '')) {
    /* wszystkie pasy autobusowe na zwyklej drodze: zostaw tak jak w tagach */
  }
  return out;
}
function nodeHole(ri) {
  /* sciezka (evenodd): wszystko poza wielokatami wezlow, do ktorych dochodzi droga ri - czesc drogi zalamanej w wezle nie wystaje z wezla */
  const cp = new Path2D();
  cp.rect(-1e5, -1e5, 2e5, 2e5);
  const out = [];
  for (const nv of S.nodeViz || []) {
    if (nv.mini) continue;
    const ms = (nv.lanes || []).filter((m) => m.ri === ri);
    if (!ms.length) continue;
    const cp = new Path2D();
    cp.rect(-1e5, -1e5, 2e5, 2e5);
    nv.poly.forEach((q, i) => {
      const w = w2s(q);
      i ? cp.lineTo(w[0], w[1]) : cp.moveTo(w[0], w[1]);
    });
    cp.closePath();
    out.push(cp);
    if (ms.length === 1) {
      const u = ms[0].u,
        n = [-u[1], u[0]],
        o = nv.o,
        hw = (ms[0].h || 2) + 1.5,
        dp = 2 * (ms[0].h || 2) + 3,
        hp = new Path2D();
      hp.rect(-1e5, -1e5, 2e5, 2e5);
      [
        [hw, -0.02],
        [-hw, -0.02],
        [-hw, -dp],
        [hw, -dp],
      ].forEach((d, i) => {
        const w = w2s([o[0] + n[0] * d[0] + u[0] * d[1], o[1] + n[1] * d[0] + u[1] * d[1]]);
        i ? hp.lineTo(w[0], w[1]) : hp.moveTo(w[0], w[1]);
      });
      hp.closePath();
      out.push(hp);
    } /* tylko maly prostokat tuz za srodkiem wezla (nie cala polplaszczyzna: droga moze wracac petla do innego wezla) */
    (nv.cuts || []).forEach((c, j) => {
      const m = nv.lanes[j];
      if (!c || !m || m.ri === ri) return;
      const u = m.u,
        n = [-u[1], u[0]],
        mid = [(c[1][0] + c[2][0]) / 2, (c[1][1] + c[2][1]) / 2],
        hw = Math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1]) / 2 + 0.05,
        b0 = [mid[0] + u[0] * 0.02, mid[1] + u[1] * 0.02],
        xp = new Path2D();
      xp.rect(-1e5, -1e5, 2e5, 2e5);
      [
        [hw, 0],
        [-hw, 0],
        [-hw, 2 * hw + 1],
        [hw, 2 * hw + 1],
      ].forEach((d, i) => {
        const w = w2s([b0[0] + n[0] * d[0] + u[0] * d[1], b0[1] + n[1] * d[0] + u[1] * d[1]]);
        i ? xp.lineTo(w[0], w[1]) : xp.moveTo(w[0], w[1]);
      });
      xp.closePath();
      out.push(xp);
    });
  } /* koniec drogi nie wystaje za srodek wezla ani za granice innych ramion */
  return out;
}
let CYPT = null;
function cyclePat(g, k) {
  /* tekstura czerwonej nawierzchni dróg rowerowych: ziarno, jasne kruszywo, ciemne pory, delikatne plamy; kafel zakotwiczony w metrach */
  if (!CYPT) {
    const N = 256,
      c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d'),
      im = x.createImageData(N, N);
    let sd = 11;
    const rnd = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < N * N; i++) {
      const r0 = rnd(),
        v = (rnd() - 0.5) * 22 + (r0 < 0.03 ? 22 + rnd() * 26 : 0) - (r0 > 0.98 ? 24 : 0);
      im.data[i * 4] = 190 + v;
      im.data[i * 4 + 1] = 86 + v * 0.7;
      im.data[i * 4 + 2] = 76 + v * 0.6;
      im.data[i * 4 + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    for (let q = 0; q < 22; q++) {
      const px = rnd() * N,
        py = rnd() * N,
        r = 12 + rnd() * 30,
        a = (rnd() - 0.5) * 0.12;
      for (const dx of [-N, 0, N])
        for (const dy of [-N, 0, N]) {
          const gr = x.createRadialGradient(px + dx, py + dy, 0, px + dx, py + dy, r),
            col = a > 0 ? '255,235,225' : '70,10,5';
          gr.addColorStop(0, 'rgba(' + col + ',' + Math.abs(a) + ')');
          gr.addColorStop(1, 'rgba(' + col + ',0)');
          x.fillStyle = gr;
          x.fillRect(px + dx - r, py + dy - r, 2 * r, 2 * r);
        }
    }
    CYPT = c;
  }
  const p = g.createPattern(CYPT, 'repeat'),
    o = w2s([0, 0]),
    sc = k / 40;
  try {
    p.setTransform(new DOMMatrix([sc, 0, 0, sc, o[0], o[1]]));
  } catch (e) {}
  return p;
}
function drawBikeI(g, cx, cy, s, col) {
  const r = s * 0.2,
    lx = cx - s * 0.28,
    rx = cx + s * 0.28,
    wy = cy + s * 0.1;
  g.strokeStyle = col;
  g.lineWidth = Math.max(0.4, s * 0.07);
  g.beginPath();
  g.arc(lx, wy, r, 0, 7);
  g.moveTo(rx + r, wy);
  g.arc(rx, wy, r, 0, 7);
  g.stroke();
  g.beginPath();
  g.moveTo(lx, wy);
  g.lineTo(cx - s * 0.02, wy);
  g.lineTo(cx + s * 0.16, cy - s * 0.16);
  g.lineTo(cx - s * 0.12, cy - s * 0.16);
  g.lineTo(lx, wy);
  g.moveTo(cx - s * 0.02, wy);
  g.lineTo(cx - s * 0.15, cy - s * 0.24);
  g.moveTo(cx - s * 0.21, cy - s * 0.24);
  g.lineTo(cx - s * 0.08, cy - s * 0.24);
  g.moveTo(rx, wy);
  g.lineTo(cx + s * 0.14, cy - s * 0.27);
  g.lineTo(cx + s * 0.23, cy - s * 0.29);
  g.stroke();
}
function drawWalkerI(g, cx, cy, s, col) {
  g.fillStyle = col;
  g.strokeStyle = col;
  g.lineWidth = Math.max(0.4, s * 0.11);
  g.beginPath();
  g.arc(cx + s * 0.04, cy - s * 0.36, s * 0.12, 0, 7);
  g.fill();
  g.beginPath();
  g.moveTo(cx, cy - s * 0.2);
  g.lineTo(cx - s * 0.04, cy + s * 0.1);
  g.lineTo(cx - s * 0.2, cy + s * 0.4);
  g.moveTo(cx - s * 0.04, cy + s * 0.1);
  g.lineTo(cx + s * 0.16, cy + s * 0.4);
  g.moveTo(cx - s * 0.2, cy - s * 0.02);
  g.lineTo(cx, cy - s * 0.16);
  g.lineTo(cx + s * 0.18, cy);
  g.stroke();
}
function drawSignC(g, cls, x, y, size) {
  /* C-13 (droga dla rowerow) i C-13/16 (ciag pieszo-rowerowy) jak w index.html */ g.save();
  g.translate(x - size / 2, y - size / 2);
  g.scale(size / 22, size / 22);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  g.arc(11, 11, 10, 0, 7);
  g.fillStyle = '#1659c7';
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = '#fff';
  g.stroke();
  if (cls === 'ciag') {
    g.beginPath();
    g.moveTo(2.5, 11);
    g.lineTo(19.5, 11);
    g.lineWidth = 1.2;
    g.stroke();
    drawWalkerI(g, 11, 6.8, 7, '#fff');
    drawBikeI(g, 11, 15.2, 10, '#fff');
  } else drawBikeI(g, 11, 11.5, 14, '#fff');
  g.restore();
}
function drawCycle(kk, aC, LY) {
  /* czerwone pasy i drogi rowerowe: (1) osobne drogi (highway=cycleway) z danych OSM, (2) pasy / drogi przy jezdni z tagow cycleway:left|right|both = lane|track; na czerwieni biale rowerki */
  const RED = '#c4584e',
    a = s2w([0, 0]),
    b = s2w([W, H]),
    mg = 25,
    x0 = Math.min(a[0], b[0]) - mg,
    x1 = Math.max(a[0], b[0]) + mg,
    y0 = Math.min(a[1], b[1]) - mg,
    y1 = Math.max(a[1], b[1]) + mg,
    marks = [],
    signsC = [];
  const pathOf2 = (P) => {
    ctx.beginPath();
    P.forEach((q, i) => {
      const w = w2s(q);
      i ? ctx.lineTo(w[0], w[1]) : ctx.moveTo(w[0], w[1]);
    });
  };
  const addMarks = (P, step, w, dir) => {
    if (kk < 5 || w * kk < 7) return;
    const cm = cumOf(P),
      L0 = cm[cm.length - 1];
    for (let sv = Math.min(12, L0 / 2); sv < L0 - 4; sv += step) {
      let z = 1;
      while (z < cm.length - 1 && cm[z] < sv) z++;
      const f = (sv - cm[z - 1]) / (cm[z] - cm[z - 1] || 1),
        A = P[z - 1],
        B = P[z],
        p = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
      if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) continue;
      marks.push({ p, ang: Math.atan2(B[1] - A[1], B[0] - A[0]), w, dir });
    }
  };
  const cycEnds = new Map(),
    axisHW =
      new Map(); /* konce drog rowerowych: gdy koniec lezy na osi jezdni i nikt po drugiej stronie nie kontynuuje, to dojazd (przycinamy do krawedzi jezdni); gdy kontynuuje, to przejazd przez cala jezdnie */
  for (const o of S.osm.ways.values())
    if (o.t && isCycW(o.t) && o.nk && o.nk.length > 1)
      for (const k of [o.nk[0], o.nk[o.nk.length - 1]]) cycEnds.set(k, (cycEnds.get(k) || 0) + 1);
  if (cycEnds.size) {
    S.doc.road.forEach((rd) => {
      const hwd = rw(rd) / 2;
      rd.nk.forEach((k) => {
        if (k && cycEnds.has(k)) axisHW.set(k, Math.max(axisHW.get(k) || 0, hwd));
      });
    });
    for (const o of S.osm.ways.values()) {
      if (!o.t || isCycW(o.t) || !OKHW.has((o.t.highway || '').replace('_link', '')) || !o.nk) continue;
      for (const k of o.nk)
        if (cycEnds.has(k) && !axisHW.has(k))
          axisHW.set(
            k,
            ((LW_CLASS[(o.t.highway || '').replace('_link', '')] || 3) * Math.max(1, parseInt(o.t.lanes, 10) || 2)) / 2,
          );
    }
  }
  const axisAt = (kn) => {
    const us = [];
    S.doc.road.forEach((rd, ri) => {
      if (!rd.osm || rd.pts.length < 2) return;
      const n = rd.nk.length;
      for (let j = 0; j < n; j++) {
        if (rd.nk[j] !== kn) continue;
        for (const dj of [1, -1]) {
          const b = rd.pts[j + dj],
            a = rd.pts[j];
          if (!b) continue;
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          us.push({ ri, u: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] });
        }
      }
    });
    let best = null,
      bd = 1;
    for (let i = 0; i < us.length; i++)
      for (let j = i + 1; j < us.length; j++) {
        const d = us[i].u[0] * us[j].u[0] + us[i].u[1] * us[j].u[1];
        if (d < bd) {
          bd = d;
          best = [us[i], us[j]];
        }
      }
    if (!best || bd > -0.6) return null;
    return { tg: [best[1].u[0] - best[0].u[0], best[1].u[1] - best[0].u[1]], main: new Set([best[0].ri, best[1].ri]) };
  }; /* os jezdni glownej w wezle: dwa przeciwne kierunki (takze gdy jezdnia jest podzielona w tym wezle) */
  const sameSide =
    new Map(); /* konce drog rowerowych na osi jezdni: gdy wszystkie dochodza z tej samej strony jezdni (V), to zadna nie przechodzi na druga strone - kazda konczy sie na krawedzi jezdni */
  if (cycEnds.size) {
    const sides = new Map();
    for (const o of S.osm.ways.values()) {
      if (!o.t || !isCycW(o.t) || !o.nk || o.nk.length < 2 || !o.g) continue;
      for (const [kk2, a, b] of [
        [o.nk[0], o.g[0], o.g[1]],
        [o.nk[o.nk.length - 1], o.g[o.g.length - 1], o.g[o.g.length - 2]],
      ]) {
        if (!axisHW.has(kk2)) continue;
        const ax0 = axisAt(kk2),
          tg = ax0 && ax0.tg;
        if (!tg) continue;
        const cr = tg[0] * (b[1] - a[1]) - tg[1] * (b[0] - a[0]);
        (sides.get(kk2) || sides.set(kk2, []).get(kk2)).push(cr > 0 ? 1 : -1);
      }
    }
    for (const [kk2, arr] of sides) if (arr.length >= 2 && arr.every((v) => v === arr[0])) sameSide.set(kk2, true);
  }
  const trimPoly = (D, a0, b0) => {
    const cm = cumOf(D),
      L0 = cm[cm.length - 1];
    if (a0 + b0 >= L0 - 0.5) return [];
    const at = (sv) => {
      let z = 1;
      while (z < cm.length - 1 && cm[z] < sv) z++;
      const f = (sv - cm[z - 1]) / (cm[z] - cm[z - 1] || 1);
      return [D[z - 1][0] + (D[z][0] - D[z - 1][0]) * f, D[z - 1][1] + (D[z][1] - D[z - 1][1]) * f];
    };
    const out = [at(a0)];
    for (let z = 0; z < D.length; z++) if (cm[z] > a0 + 0.05 && cm[z] < L0 - b0 - 0.05) out.push(D[z]);
    out.push(at(L0 - b0));
    return out;
  };
  ctx.save();
  ctx.globalAlpha = aC * (LY != null && LY < 0 ? 0.5 : 1);
  ctx.strokeStyle = cyclePat(ctx, kk) || RED;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round'; /* okragle konce: bez prześwitu na stykach odcinkow */
  for (const o of S.osm.ways.values()) {
    const t = o.t || {};
    if (!isCycW(t) || !o.g || o.g.length < 2) continue;
    if (LY != null && layerOf(t) !== LY) continue;
    /* warstwa (layer / most / tunel): droga rowerowa pod mostem rysowana pod nim */ let bx0 = 1e9,
      by0 = 1e9,
      bx1 = -1e9,
      by1 = -1e9;
    for (const q of o.g) {
      if (q[0] < bx0) bx0 = q[0];
      if (q[0] > bx1) bx1 = q[0];
      if (q[1] < by0) by0 = q[1];
      if (q[1] > by1) by1 = q[1];
    }
    if (bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1) continue;
    const icl = infraCls(t)[0] || { cls: 'droga', dir: 0 },
      w =
        parseFloat(String(t.width || '').replace(',', '.')) ||
        (icl.cls === 'przejazd' ? 2.4 : icl.cls === 'ciag' ? 2.8 : icl.dir ? 2.0 : 2.5);
    ctx.lineWidth = Math.max(1.2, w * kk);
    let D = dense(o.g, 2);
    {
      const k0 = o.nk && o.nk[0],
        k1 = o.nk && o.nk[o.nk.length - 1],
        c0 = axisHW.has(k0) && (cycEnds.get(k0) === 1 || sameSide.get(k0)) ? axisHW.get(k0) + 0.5 : 0,
        c1 = axisHW.has(k1) && (cycEnds.get(k1) === 1 || sameSide.get(k1)) ? axisHW.get(k1) + 0.5 : 0;
      if (c0 || c1) D = trimPoly(D, c0, c1);
    }
    if (D.length < 2) continue;
    pathOf2(D);
    ctx.stroke();
    if (icl.cls === 'przejazd') {
      /* przejazd rowerowy P-11: biale kwadraty po bokach */ ctx.save();
      ctx.strokeStyle = '#fff';
      ctx.lineCap = 'butt';
      ctx.lineWidth = Math.max(1, 0.5 * kk);
      ctx.setLineDash([0.5 * kk, 0.5 * kk]);
      for (const sg of [-1, 1]) {
        pathOf2(
          offsetPts(
            D,
            D.map(() => sg * (w / 2 - 0.35)),
          ),
        );
        ctx.stroke();
      }
      if (icl.zebra) {
        ctx.setLineDash([]);
      }
      ctx.restore();
    } else if (icl.cls === 'ciag') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      ctx.lineCap = 'butt';
      ctx.lineWidth = Math.max(1, 0.12 * kk);
      ctx.setLineDash([1.2 * kk, 1.0 * kk]);
      pathOf2(D);
      ctx.stroke();
      ctx.restore();
    } else addMarks(D, 45, w, icl.dir === 2 ? 0 : icl.dir);
    if (icl.cls === 'ciag' || icl.cls === 'droga') {
      const cmD = cumOf(D),
        lenD = cmD[cmD.length - 1];
      if (lenD >= 4) {
        const k2 = lenD < 20 ? 0 : Math.max(0, Math.ceil(lenD / 110) - 1),
          ps =
            lenD < 20
              ? [lenD / 2]
              : [3].concat(
                  Array.from({ length: k2 }, (_, i) => (lenD * (i + 1)) / (k2 + 1)),
                  [lenD - 3],
                );
        for (const m of ps) signsC.push({ p: atS(D, cmD, m), cls: icl.cls });
      }
    }
  }
  const lanes = [];
  S.doc.road.forEach((r, i) => {
    if (!r.osm || r.sb) return;
    if (LY != null && (r.ly | 0) !== LY) return;
    if (/^(motorway|trunk|busway)/.test(r.hw || '')) return;
    const t = effTags(r),
      rev = t.oneway === '-1',
      items = infraCls(t)
        .filter((c) => c.cls !== 'przejazd' && c.cls !== 'droga_ow')
        .map((c) => ({
          cls: c.cls,
          sd: c.side === 0 ? 'C' : c.side > 0 !== rev ? 'R' : 'L',
          dir: c.dir === 2 || c.dir === 0 ? c.dir : rev ? -c.dir : c.dir,
        }));
    if (items.length) lanes.push({ i, items });
  }); /* wszystkie klasy infrastruktury przy jezdni: pas, kontrapas, droga (track), buspas, sharrow, kontraruch */
  const strips = new Map(); /* srodki pasow wg drogi i strony (do laczenia na stykach) */
  const WSTR = { pas: 1.5, kontrapas: 1.5, droga: 2.0, buspas: 1.2, sharrow: 0.8, kontraruch: 0.8 },
    CSTR = { buspas: '#9a2f2b', sharrow: 'rgba(196,88,78,.55)', kontraruch: 'rgba(196,88,78,.85)' };
  for (const ln of lanes) {
    let G = null;
    try {
      G = laneGeom(ln.i);
    } catch (e) {}
    if (!G || G.Q.length < 2) continue;
    let bx0 = 1e9,
      by0 = 1e9,
      bx1 = -1e9,
      by1 = -1e9;
    for (const q of G.Q) {
      if (q[0] < bx0) bx0 = q[0];
      if (q[0] > bx1) bx1 = q[0];
      if (q[1] < by0) by0 = q[1];
      if (q[1] > by1) by1 = q[1];
    }
    if (bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1) continue;
    for (const it of ln.items) {
      const kind = it.cls,
        w = WSTR[kind] || 1.5,
        gap = kind === 'droga' ? 0.5 : 0.1,
        sd = it.sd;
      let cen;
      if (sd === 'C') cen = G.Q.map((_, j) => G.left[j] + (G.NL * G.lw[j]) / 2);
      else cen = G.Q.map((_, j) => (sd === 'R' ? G.left[j] + G.NL * G.lw[j] + gap + w / 2 : G.left[j] - gap - w / 2));
      const P = offsetPts(G.Q, cen);
      ctx.save();
      ctx.lineWidth = Math.max(1.2, w * kk);
      if (CSTR[kind]) ctx.strokeStyle = CSTR[kind];
      if (kind === 'kontraruch') {
        ctx.lineCap = 'butt';
        ctx.setLineDash([0.4 * kk, 1.0 * kk]);
      }
      pathOf2(P);
      ctx.stroke();
      ctx.restore();
      if (kind !== 'kontraruch') addMarks(P, 40, w, it.dir === 2 ? 0 : it.dir);
      strips.set(ln.i + sd, { P, w, kind });
    }
  }
  {
    const endsAt = new Map();
    S.doc.road.forEach((rd, i) => {
      if (rd.pts.length < 2) return;
      [
        [0, true],
        [rd.nk.length - 1, false],
      ].forEach(([j, st]) => {
        const k = rd.nk[j];
        if (k) (endsAt.get(k) || endsAt.set(k, []).get(k)).push({ i, st });
      });
    }); /* laczniki: na wspolnym wezle dwoch drog pas konczy sie na obu odcinkach w roznych punktach (przesuniecie boczne): wypelnienie klina po zewnetrznej stronie zakretu */
    for (const [, ls] of endsAt) {
      if (ls.length !== 2 || ls[0].i === ls[1].i) continue;
      const [e0, e1] = ls;
      for (const sd of ['R', 'L']) {
        const a = strips.get(e0.i + sd),
          sd2 = e0.st === e1.st ? (sd === 'R' ? 'L' : 'R') : sd,
          b = strips.get(e1.i + sd2);
        if (!a || !b || a.kind !== b.kind) continue;
        const pa = e0.st ? a.P[0] : a.P[a.P.length - 1],
          pb = e1.st ? b.P[0] : b.P[b.P.length - 1];
        ctx.lineWidth = Math.max(1.2, Math.min(a.w, b.w) * kk);
        pathOf2([pa, pb]);
        ctx.stroke();
      }
    }
  }
  {
    /* DDR konczace sie w wezle na osi jezdni glownej (z jednej strony) + pasy rowerowe drogi bocznej w tym wezle: prosty przejazd przez jezdnie (P-11) z kazdej DDR do pasa po tej samej stronie; bez V w osi */
    const at = (P, sv) => atS(P, cumOf(P), sv);
    for (const [kn] of sameSide) {
      const hwm = axisHW.get(kn);
      if (hwm == null) continue;
      const cuts = [];
      for (const o of S.osm.ways.values()) {
        if (!o.t || !isCycW(o.t) || !o.nk || o.nk.length < 2 || !o.g) continue;
        const st0 = o.nk[0] === kn,
          en0 = o.nk[o.nk.length - 1] === kn;
        if (!st0 && !en0) continue;
        const D0 = dense(o.g, 2),
          D = st0 ? D0 : D0.slice().reverse();
        if (D.length < 2) continue;
        cuts.push({ o, E: at(D, hwm + 0.5), w: parseFloat(String(o.t.width || '').replace(',', '.')) || 2.4 });
      }
      if (cuts.length < 2) continue;
      const axn = axisAt(kn);
      S.doc.road.forEach((rr, ri) => {
        if (!rr.osm || rr.nk.length < 2 || (axn && axn.main.has(ri))) return;
        const first = rr.nk[0] === kn,
          last = rr.nk[rr.nk.length - 1] === kn;
        if (!first && !last) return;
        for (const sd of ['L', 'R']) {
          const st = strips.get(ri + sd);
          if (!st || st.P.length < 2) continue;
          const P = first ? st.P : st.P.slice().reverse(),
            S2 = at(P, hwm + 0.5);
          let best = null,
            bd = 1e9;
          for (const c of cuts) {
            if (c.used) continue;
            const d = Math.hypot(c.E[0] - S2[0], c.E[1] - S2[1]);
            if (d < bd) {
              bd = d;
              best = c;
            }
          }
          if (!best || bd > 25) continue;
          best.used = true;
          const w = Math.max(st.w, 1.5);
          let nx = -axn.tg[1],
            ny = axn.tg[0];
          const nl = Math.hypot(nx, ny) || 1;
          nx /= nl;
          ny /= nl;
          if ((best.E[0] - S2[0]) * nx + (best.E[1] - S2[1]) * ny < 0) {
            nx = -nx;
            ny = -ny;
          }
          const NN = [S2[0] + nx * 2 * (hwm + 0.5), S2[1] + ny * 2 * (hwm + 0.5)];
          /* przejazd prostopadly do jezdni: od krawedzi po stronie DDR prosto do pasa; DDR dochodzi do jego poczatku */ ctx.save();
          ctx.lineWidth = Math.max(1.2, w * kk);
          ctx.lineCap = 'butt';
          pathOf2([best.E, NN]);
          ctx.stroke();
          ctx.lineCap = 'round';
          ctx.lineWidth = Math.max(1.2, Math.min(w, best.w) * kk);
          pathOf2([best.E, NN]);
          ctx.stroke();
          ctx.lineCap = 'butt';
          ctx.lineWidth = Math.max(1.2, w * kk);
          pathOf2([NN, S2]);
          ctx.stroke();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = Math.max(1, 0.5 * kk);
          ctx.setLineDash([0.5 * kk, 0.5 * kk]);
          for (const sg of [-1, 1]) {
            pathOf2(offsetPts([NN, S2], [sg * (w / 2 - 0.35), sg * (w / 2 - 0.35)]));
            ctx.stroke();
          }
          ctx.restore();
        }
      });
    }
  }
  for (const sg of signsC) {
    const sp = w2s(sg.p);
    if (sp[0] < -30 || sp[1] < -30 || sp[0] > W + 30 || sp[1] > H + 30) continue;
    drawSignC(ctx, sg.cls, sp[0], sp[1], Math.max(14, Math.min(30, 2.6 * kk)));
  } /* znaki C-13 / C-13/16 na drogach rowerowych */
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const m of marks) {
    const sp = w2s(m.p),
      sz = Math.min(1.25, 0.82 * m.w) / 1.3,
      ca = Math.cos(m.ang),
      sa = Math.sin(
        m.ang,
      ); /* piktogram na jezdni: rowerek z boku, os poprzecznie do pasa, przodem w prawo (jak w drodze rowerowej), nad nim strzalka kierunku */
    ctx.save();
    ctx.translate(sp[0], sp[1]);
    ctx.rotate(m.ang + (m.dir < 0 ? Math.PI : 0) + Math.PI / 2);
    ctx.scale(kk * sz, kk * sz);
    ctx.lineWidth = 0.12;
    /* gora rowerka = kierunek ruchu na pasie (jak strzalka) */ ctx.beginPath();
    ctx.arc(-0.55, 0, 0.3, 0, 6.2832);
    ctx.moveTo(0.85, 0);
    ctx.arc(0.55, 0, 0.3, 0, 6.2832);
    ctx.stroke();
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.moveTo(-0.55, 0);
    ctx.lineTo(-0.28, -0.5);
    ctx.lineTo(0.36, -0.52);
    ctx.lineTo(0.55, 0);
    ctx.moveTo(-0.55, 0);
    ctx.lineTo(-0.02, 0);
    ctx.lineTo(0.36, -0.52);
    ctx.moveTo(-0.28, -0.5);
    ctx.lineTo(-0.02, 0);
    ctx.moveTo(0.36, -0.52);
    ctx.lineTo(0.3, -0.72);
    ctx.lineTo(0.5, -0.72);
    ctx.moveTo(-0.33, -0.62);
    ctx.lineTo(-0.1, -0.62);
    ctx.stroke();
    ctx.restore();
    if (m.dir) {
      const ap = w2s([m.p[0] + m.dir * ca * 1.15 * sz, m.p[1] + m.dir * sa * 1.15 * sz]);
      ctx.save();
      ctx.translate(ap[0], ap[1]);
      ctx.rotate(m.ang + (m.dir < 0 ? Math.PI : 0));
      ctx.scale(kk * sz, kk * sz);
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      ctx.moveTo(-0.38, 0);
      ctx.lineTo(0.2, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.52, 0);
      ctx.lineTo(0.12, -0.2);
      ctx.lineTo(0.12, 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}
function drawNodeDash() {
  const tkR = !document.getElementById('cNodeRend') || document.getElementById('cNodeRend').checked,
    tkE = tkR && S.view.k >= 1.8 && !window.__noEdge,
    tkM =
      tkR &&
      S.view.k >=
        2.0; /* poziomy szczegolow (k = px/m; zoom 16 ~ 0,7, 17 ~ 1,4, 18 ~ 2,9, 19 ~ 5,8): < 1,05 same kreski; od 1,05 wypelnienie jezdni; od 1,8 kraweznik i linia krawedzi; od 2,0 linie pasow; od 3 strzalki, warstwy mostow, cienie i barierki - kazdy element pojawia sie plynnie (przezroczystosc rosnie ze skala) */
  const cl01 = (x) => Math.max(0, Math.min(1, x)),
    aE = cl01((S.view.k - 1.8) / 1.4),
    aM = cl01((S.view.k - 2.0) / 1.4),
    aA = cl01((S.view.k - 3.0) / 1.5),
    aL = cl01((S.view.k - 3.0) / 2.0);
  if (tkR && S.view.k < 1.05 && window.__nodeGeom && L) {
    /* zoom <= 16: same proste kreski dróg, bez wezlow, warstw, kraweznikow i oznakowania */
    const kk0 = S.view.k,
      rs = [];
    for (let i = 0; i < S.doc.road.length; i++) {
      let G = null;
      try {
        G = laneGeom(i);
      } catch (e) {}
      if (!G || G.Q.length < 2) continue;
      const NLg = G.NL,
        E0 = offsetPts(
          G.Q,
          G.Q.map((_, j) => G.left[j]),
        ),
        E1 = offsetPts(
          G.Q,
          G.Q.map((_, j) => G.left[j] + NLg * G.lw[j]),
        );
      rs.push({ ly: S.doc.road[i].ly | 0, P: E0.concat(E1.slice().reverse()) });
    }
    rs.sort((a, b) => a.ly - b.ly);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.fillStyle = ctx.strokeStyle = '#6f7378';
    const zz0 = Math.log2(156543.03 * Math.cos((S.org.lat * Math.PI) / 180) * kk0),
      fz = Math.max(0, Math.min(1, (zz0 - 14) / 2.5));
    ctx.lineWidth = 0.55 + 0.85 * fz - 0.5 * fz * Math.min(1, Math.max(0, (kk0 - 0.3) / 0.7));
    /* obrys kreski: od 0,55 px (zoom 14) do ok. 1,4 px (zoom ~16), potem zanika, bo jezdnia ma juz wlasna szerokosc */ ctx.globalAlpha = 1;
    for (const r of rs) {
      const W0 = r.P.map(w2s),
        Wq = [];
      for (let z = 0; z < W0.length; z++) {
        const q = W0[z],
          l = Wq[Wq.length - 1];
        if (!l || z === W0.length - 1 || Math.abs(q[0] - l[0]) + Math.abs(q[1] - l[1]) > 0.8) Wq.push(q);
      }
      /* redukcja punktow wzgledem ostatniego zachowanego (nie poprzedniego): gesta geometria zostaje, a nie sprowadza sie do cieciwy */ let x0 = 1e9,
        y0 = 1e9,
        x1 = -1e9,
        y1 = -1e9;
      for (const q of Wq) {
        if (q[0] < x0) x0 = q[0];
        if (q[0] > x1) x1 = q[0];
        if (q[1] < y0) y0 = q[1];
        if (q[1] > y1) y1 = q[1];
      }
      if (x1 < -4 || y1 < -4 || x0 > W + 4 || y0 > H + 4) continue;
      ctx.globalAlpha = (r.ly < 0 ? 0.45 : 1) * (0.7 + 0.3 * fz);
      ctx.beginPath();
      Wq.forEach((q, z) => (z ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    return;
  } /* jedna warstwa: asfalt, krawezniki, oznakowanie, strzalki */
  if (window.__nodeGeom && L && (tkR || tkE)) {
    /* lekki render w nowej geometrii: drogi (asfalt z tekstura, krawezniki, linie, strzalki) od granicy do granicy + wezly jako wielokat */
    const kk = S.view.k,
      PAT = (typeof asphaltPat === 'function' && asphaltPat(ctx, kk)) || '#676a70',
      fq = (list) => {
        ctx.beginPath();
        for (const q of list) {
          const W = q.map(w2s);
          let ar = 0;
          for (let z = 0; z < W.length; z++) {
            const a = W[z],
              b = W[(z + 1) % W.length];
            ar += a[0] * b[1] - b[0] * a[1];
          }
          if (ar < 0) W.reverse();
          W.forEach((p, z) => (z ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.closePath();
        }
        ctx.fillStyle = PAT;
        ctx.fill();
      },
      pl = (P, close) => {
        ctx.beginPath();
        P.forEach((q, i) => {
          const w = w2s(q);
          i ? ctx.lineTo(w[0], w[1]) : ctx.moveTo(w[0], w[1]);
        });
        if (close) ctx.closePath();
      };
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    const aC = cl01((kk - 2.5) / 1.5); /* warstwa rowerowa rysowana na koncu, nad drogami */
    const cp = new Path2D();
    {
      cp.rect(-1e5, -1e5, 2e5, 2e5);
      for (const nv of S.nodeViz || [])
        (nv.mini ? [] : nv.cuts || []).forEach((c, j) => {
          if (!c || !nv.lanes[j]) return;
          const u = nv.lanes[j].u,
            E1 = w2s(c[1]),
            E2 = w2s(c[2]),
            Lp = Math.max(1, (c[1][0] - nv.o[0]) * u[0] + (c[1][1] - nv.o[1]) * u[1] + 0.4) * kk,
            ex = E2[0] - E1[0],
            ey = E2[1] - E1[1],
            el = Math.hypot(ex, ey) || 1,
            wx = (ex / el) * kk * 0.5,
            wy = (ey / el) * kk * 0.5,
            F1 = [E1[0] - wx, E1[1] - wy],
            F2 = [E2[0] + wx, E2[1] + wy];
          const ov = 0.12 * kk,
            G1 = [F1[0] - u[0] * ov, F1[1] - u[1] * ov],
            G2 = [F2[0] - u[0] * ov, F2[1] - u[1] * ov];
          cp.moveTo(G1[0], G1[1]);
          cp.lineTo(G2[0], G2[1]);
          cp.lineTo(F2[0] - u[0] * Lp, F2[1] - u[1] * Lp);
          cp.lineTo(F1[0] - u[0] * Lp, F1[1] - u[1] * Lp);
          cp.closePath();
        });
    }
    {
      /* maska sumy asfaltu (drogi jako czworokaty, wezly jako trojkaty) -> krawezniki i linia krawedzi z maski: jeden obrys, bez podwojnych krawezników */
      const Wd = cv.width,
        Hd = cv.height,
        PL = (window.__cvPool = window.__cvPool || []);
      let pi = 0;
      const mk = () => {
          let c = PL[pi];
          if (!c) {
            c = document.createElement('canvas');
            PL[pi] = c;
          }
          pi++;
          const g = c.getContext('2d');
          if (c.width !== Wd || c.height !== Hd) {
            c.width = Wd;
            c.height = Hd;
          } else {
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.globalCompositeOperation = 'source-over';
            g.globalAlpha = 1;
            g.clearRect(0, 0, Wd, Hd);
          }
          return c;
        },
        M = mk(); /* plotna wielokrotnego uzytku (bez tworzenia nowych w kazdej klatce) */
      const roads = [];
      for (let i = 0; i < S.doc.road.length; i++) {
        let G = null;
        try {
          G = laneGeom(i);
        } catch (e) {}
        if (!G) continue;
        const E0 = offsetPts(
            G.Q,
            G.Q.map((_, j) => G.left[j]),
          ),
          E1 = offsetPts(
            G.Q,
            G.Q.map((_, j) => G.left[j] + G.NL * G.lw[j]),
          );
        let mids = null;
        if (window.__cutRot && (S.doc.road[i].cutSh || S.doc.road[i]._cs || S.doc.road[i]._cs2) && E0.length > 1)
          for (const en of ['s', 'e']) {
            const sh =
              (S.doc.road[i].cutSh || {})[en] || (S.doc.road[i]._cs || {})[en] || (S.doc.road[i]._cs2 || {})[en];
            if (!sh || !sh.some((v) => v)) continue;
            const NLc = Math.max(1, S.doc.road[i].lanes | 0),
              s0 = en === 's',
              i0 = s0 ? 0 : E0.length - 1,
              i1 = s0 ? 1 : E0.length - 2,
              tx = E0[i1][0] - E0[i0][0],
              ty = E0[i1][1] - E0[i0][1],
              tl = Math.hypot(tx, ty) || 1,
              ux = tx / tl,
              uy = ty / tl,
              bL = E0[i0].slice(),
              bR = E1[i0].slice(),
              md = [];
            for (let q = 1; q < NLc; q++) {
              const f = q / NLc,
                bx = bL[0] + (bR[0] - bL[0]) * f,
                by = bL[1] + (bR[1] - bL[1]) * f;
              md.push(
                [bx + ux * (sh[2 * q - 1] || 0), by + uy * (sh[2 * q - 1] || 0)],
                [bx + ux * (sh[2 * q] || 0), by + uy * (sh[2 * q] || 0)],
              );
            }
            E0[i0] = [bL[0] + ux * (sh[0] || 0), bL[1] + uy * (sh[0] || 0)];
            E1[i0] = [bR[0] + ux * (sh[2 * NLc - 1] || 0), bR[1] + uy * (sh[2 * NLc - 1] || 0)];
            (mids = mids || {})[en] = s0 ? md.reverse() : md;
          }
        let strips = null;
        if (window.__cutRot && S.doc.road[i]._cs && E0.length > 1)
          for (const en of ['s', 'e']) {
            if (!S.doc.road[i]._cs[en]) continue;
            const i0 = en === 's' ? 0 : E0.length - 1,
              A = E0[i0],
              B = E1[i0],
              dx = B[0] - A[0],
              dy = B[1] - A[1],
              ln = Math.hypot(dx, dy) || 1,
              nx = (-dy / ln) * 0.08,
              ny = (dx / ln) * 0.08;
            (strips = strips || []).push([
              [A[0] + nx, A[1] + ny],
              [B[0] + nx, B[1] + ny],
              [B[0] - nx, B[1] - ny],
              [A[0] - nx, A[1] - ny],
            ]);
          }
        roads.push({ G, E0, E1, mids, strips, ri: i, ly: S.doc.road[i].ly | 0 });
      }
      {
        /* koniec drogi za granica wezla: geometria drogi obcieta dokladnie na granicy (wg dlugosci luku), nie tylko prostokatem - droga skrecajaca tuz za granica nie wystaje ogonem na asfalt wezla */
        const byRi = new Map(roads.map((r) => [r.ri, r])),
          cut = new Map();
        for (const nv of S.nodeViz || []) {
          if (nv.mini) continue;
          (nv.cuts || []).forEach((c, j) => {
            const m = nv.lanes && nv.lanes[j];
            if (!c || !m || c.D == null) return;
            const r = byRi.get(m.ri);
            if (!r) return;
            const Q = r.G.Q,
              o0 = m.o || nv.o,
              side = dist(o0, Q[0]) <= dist(o0, Q[Q.length - 1]) ? 0 : 1,
              e = cut.get(r) || [0, 0];
            e[side] = Math.max(e[side], Math.max(0, c.D - 0.12));
            cut.set(r, e);
          });
        }
        for (const [r, [ds, de]] of cut) {
          const cm = cumOf(r.G.Q),
            Lq = cm[cm.length - 1];
          if (ds + de >= Lq - 0.5 || (ds < 0.2 && de < 0.2)) continue;
          const sub = (E) => {
            const out = [];
            const at = (sv) => {
              let z = 1;
              while (z < cm.length - 1 && cm[z] < sv) z++;
              const f = Math.max(0, Math.min(1, (sv - cm[z - 1]) / (cm[z] - cm[z - 1] || 1)));
              return [E[z - 1][0] + (E[z][0] - E[z - 1][0]) * f, E[z - 1][1] + (E[z][1] - E[z - 1][1]) * f];
            };
            out.push(ds > 0.2 ? at(ds) : E[0]);
            for (let z = 0; z < E.length; z++) if (cm[z] > ds + 0.05 && cm[z] < Lq - de - 0.05) out.push(E[z]);
            out.push(de > 0.2 ? at(Lq - de) : E[E.length - 1]);
            return out;
          };
          r.E0 = sub(r.E0);
          r.E1 = sub(r.E1);
        }
      }

      const fm = (c, list, clip, sw) => {
        const WL = [];
        let x0 = 1e9,
          y0 = 1e9,
          x1 = -1e9,
          y1 = -1e9;
        for (const q of list) {
          const W0 = q.map(w2s),
            Wq = [];
          if (W0.length > 8) {
            for (let z = 0; z < W0.length; z++) {
              const p = W0[z],
                l = Wq[Wq.length - 1];
              if (!l || z === W0.length - 1 || Math.abs(p[0] - l[0]) + Math.abs(p[1] - l[1]) > 0.75) Wq.push(p);
            }
          } else for (const p of W0) Wq.push(p);
          /* redukcja wzgledem ostatniego zachowanego punktu */ for (const p of Wq) {
            if (p[0] < x0) x0 = p[0];
            if (p[0] > x1) x1 = p[0];
            if (p[1] < y0) y0 = p[1];
            if (p[1] > y1) y1 = p[1];
          }
          WL.push(Wq);
        }
        const m = (sw || 0) + 2;
        if (x1 < -m || y1 < -m || x0 > W + m || y0 > H + m) return;
        /* poza ekranem: pomijamy */ const g2 = c.getContext('2d');
        g2.save();
        g2.setTransform(DPR, 0, 0, DPR, 0, 0);
        if (clip) {
          g2.beginPath();
          g2.rect(
            Math.max(-2, x0 - m),
            Math.max(-2, y0 - m),
            Math.min(W + 4, x1 + m) - Math.max(-2, x0 - m),
            Math.min(H + 4, y1 + m) - Math.max(-2, y0 - m),
          );
          g2.clip();
          [].concat(clip).forEach((cq) => g2.clip(cq, 'evenodd'));
        }
        /* najpierw maly prostokat wokol drogi: przyciecia licza sie tylko na nim, nie na calym ekranie */ g2.beginPath();
        for (const Wq of WL) {
          let ar = 0;
          for (let z = 0; z < Wq.length; z++) {
            const a = Wq[z],
              b = Wq[(z + 1) % Wq.length];
            ar += a[0] * b[1] - b[0] * a[1];
          }
          if (ar < 0) Wq.reverse();
          Wq.forEach((p, z) => (z ? g2.lineTo(p[0], p[1]) : g2.moveTo(p[0], p[1])));
          g2.closePath();
        }
        g2.fillStyle = '#000';
        g2.fill();
        if (sw) {
          g2.strokeStyle = '#000';
          g2.lineWidth = sw;
          g2.lineJoin = 'round';
          g2.stroke();
        }
        g2.restore();
      };
      const allRoads = roads,
        NVL = (S.nodeViz || []).map((nv) => ({
          nv,
          ly: (() => {
            const ls = (nv.lanes || [])
                .map((a) => (S.doc.road[a.ri] ? S.doc.road[a.ri].ly | 0 : 99))
                .filter((v) => v < 99),
              mn = ls.length ? Math.min(...ls) : 99,
              mx = ls.length ? Math.max(...ls) : 99;
            return mx > mn && mx > 0 && ls.filter((v) => v === mx).length >= 2 ? mx : mn;
          })(),
        })) /* wezel laczacy droge z mostem lezy na poziomie nizszej drogi (wjazd na most jest na ziemi); gdy co najmniej dwie jego drogi sa na moscie (skrzyzowanie na wiadukcie) - na poziomie mostu: jednolity asfalt bez 'zakonczen' mostu */,
        LYS = [
          ...new Set(
            allRoads
              .map((r) => r.ly)
              .concat(NVL.map((x) => x.ly))
              .concat([...S.osm.ways.values()].filter((o) => o.t && isCycW(o.t)).map((o) => layerOf(o.t))),
          ),
        ]
          .filter((v) => v > -9)
          .sort((a, b) => a - b);
      const SEAMS = (() => {
        /* jezdnie jednokierunkowe biegnace obok siebie (rampa przy jezdni glownej): szczelina < 1,6 m wypelniana asfaltem, na srodku linia pasa */
        if (window.__noSeams) return [];
        if (L.__seams) return L.__seams;
        const out = [],
          inf = allRoads.map((r) => {
            const rd = S.doc.road[r.ri];
            if (!rd || !rd.oneway || r.E0.length < 2) return null;
            let x0 = 1e9,
              y0 = 1e9,
              x1 = -1e9,
              y1 = -1e9;
            for (const q of r.E0.concat(r.E1)) {
              if (q[0] < x0) x0 = q[0];
              if (q[0] > x1) x1 = q[0];
              if (q[1] < y0) y0 = q[1];
              if (q[1] > y1) y1 = q[1];
            }
            return { r, bb: [x0 - 2, y0 - 2, x1 + 2, y1 + 2] };
          });
        const tg = (P, k) => {
          const a = P[Math.max(0, k - 1)],
            b = P[Math.min(P.length - 1, k + 1)],
            l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
        };
        for (let i = 0; i < inf.length; i++) {
          const A0 = inf[i];
          if (!A0) continue;
          for (let j = i + 1; j < inf.length; j++) {
            const B0 = inf[j];
            if (!B0 || A0.r.ly !== B0.r.ly) continue;
            const a = A0.bb,
              b = B0.bb;
            if (a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]) continue;
            for (const EA of [A0.r.E0, A0.r.E1])
              for (const EB of [B0.r.E0, B0.r.E1]) {
                let run = [];
                const flush = () => {
                  if (run.length >= 4) {
                    let len = 0;
                    for (let z = 1; z < run.length; z++) len += dist(run[z - 1].m, run[z].m);
                    if (len > 2)
                      out.push({
                        ly: A0.r.ly,
                        A: run.map((x) => x.p),
                        B: run.map((x) => x.q),
                        mid: run.map((x) => x.m),
                      });
                  }
                  run = [];
                };
                for (let k = 0; k < EA.length; k++) {
                  const p = EA[k];
                  if (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3]) {
                    flush();
                    continue;
                  }
                  let bd = 1e9,
                    bq = null,
                    bt = null;
                  for (let z = 1; z < EB.length; z++) {
                    const x0 = EB[z - 1];
                    if (
                      p[0] < Math.min(x0[0], EB[z][0]) - 1.7 ||
                      p[0] > Math.max(x0[0], EB[z][0]) + 1.7 ||
                      p[1] < Math.min(x0[1], EB[z][1]) - 1.7 ||
                      p[1] > Math.max(x0[1], EB[z][1]) + 1.7
                    )
                      continue;
                    const dx = EB[z][0] - x0[0],
                      dy = EB[z][1] - x0[1],
                      L2 = dx * dx + dy * dy || 1,
                      t = Math.max(0, Math.min(1, ((p[0] - x0[0]) * dx + (p[1] - x0[1]) * dy) / L2)),
                      qx = x0[0] + dx * t,
                      qy = x0[1] + dy * t,
                      d = Math.hypot(qx - p[0], qy - p[1]);
                    if (d < bd) {
                      bd = d;
                      bq = [qx, qy];
                      bt = [dx / Math.sqrt(L2), dy / Math.sqrt(L2)];
                    }
                  }
                  const ta = tg(EA, k),
                    ok = bq && bd < 1.6 && ta[0] * bt[0] + ta[1] * bt[1] > 0.97;
                  if (ok) run.push({ p, q: bq, m: [(p[0] + bq[0]) / 2, (p[1] + bq[1]) / 2] });
                  else flush();
                }
                flush();
              }
          }
        }
        return (L.__seams = out);
      })();
      window.__busPts = [];
      for (const LY of kk >= 3 ? LYS : [null]) {
        pi = 0;
        const baseA = LY !== null && LY < 0 ? 0.5 : 1;
        const roads = allRoads.filter((r) => LY === null || r.ly === LY),
          nvs = NVL.filter((x) => LY === null || x.ly === LY).map((x) => x.nv);
        if (!roads.length && !nvs.length) {
          if (kk >= 3) {
            const cy0 = document.getElementById('cCycle');
            if (aC > 0 && tkR && (!cy0 || cy0.checked)) drawCycle(kk, aC, LY);
          }
          continue;
        }
        const M = mk();
        ctx.save();
        if (LY < 0) ctx.globalAlpha = 0.5; /* warstwy po kolei: tunele (polprzezroczyste), teren, mosty nad nimi */
        const ER = new Path2D(),
          ERS = new Path2D(),
          EXT = [];
        let anyER = false;
        for (const r of LY === null ? [] : roads) {
          const rd = S.doc.road[r.ri],
            Q = r.G.Q;
          if (Q.length < 2) continue;
          for (const [ix, jx] of [
            [0, 0],
            [rd.nk.length - 1, 1],
          ]) {
            const k = rd.nk[ix];
            if (!k || !S.doc.road.some((q) => (q.ly | 0) !== LY && q.nk.includes(k))) continue;
            const Pq = jx ? Q[Q.length - 1] : Q[0],
              P2 = jx ? Q[Q.length - 2] : Q[1],
              tl = dist(Pq, P2) || 1,
              t = [(P2[0] - Pq[0]) / tl, (P2[1] - Pq[1]) / tl],
              n = [-t[1], t[0]],
              hw =
                (r.G.NL * r.G.lw[jx ? Q.length - 1 : 0]) / 2 +
                Math.abs(r.G.left[jx ? Q.length - 1 : 0] + (r.G.NL * r.G.lw[jx ? Q.length - 1 : 0]) / 2) +
                1.5;
            const P = (() => {
              for (const nv of S.nodeViz || []) {
                const j = (nv.lanes || []).findIndex((a) => a.ri === r.ri);
                if (j < 0 || !nv.cuts || !nv.cuts[j] || !nv.o || dist(nv.o, Pq) > 1) continue;
                const c = nv.cuts[j];
                return [(c[1][0] + c[2][0]) / 2, (c[1][1] + c[2][1]) / 2];
              }
              return Pq;
            })();
            /* przy wezle koniec mostu lezy na ciecie wezla (nie w jego srodku): tam znika kraweznik i cien */ {
              const h2 = hw - 1.5,
                A = [P[0] + n[0] * h2, P[1] + n[1] * h2],
                B = [P[0] - n[0] * h2, P[1] - n[1] * h2];
              EXT.push([A, B, [B[0] - t[0] * 0.3, B[1] - t[1] * 0.3], [A[0] - t[0] * 0.3, A[1] - t[1] * 0.3]]);
            }
            /* asfalt lekko za koniec: bez szczeliny na styku warstw */ [
              [hw + 2, -6],
              [-hw - 2, -6],
              [-hw - 2, 3.5],
              [hw + 2, 3.5],
            ].forEach((d, i) => {
              const w = w2s([P[0] + n[0] * d[0] + t[0] * d[1], P[1] + n[1] * d[0] + t[1] * d[1]]);
              i ? ERS.lineTo(w[0], w[1]) : ERS.moveTo(w[0], w[1]);
            });
            ERS.closePath();
            /* przy wjezdzie most jest na poziomie terenu: bez cienia */ {
              const he = hw - 1.5 - 0.22;
              [
                [he, -0.6],
                [-he, -0.6],
                [-he, 0.6],
                [he, 0.6],
              ].forEach((d, i) => {
                const w = w2s([P[0] + n[0] * d[0] + t[0] * d[1], P[1] + n[1] * d[0] + t[1] * d[1]]);
                i ? ER.lineTo(w[0], w[1]) : ER.moveTo(w[0], w[1]);
              });
              ER.closePath();
            }
            anyER = true;
          }
        } /* styk z droga innej warstwy (wjazd na most): bez kraweznika i linii krawedzi w poprzek */
        const erase = (T) => {
          if (anyER && T) {
            const g = T.getContext('2d');
            g.save();
            g.setTransform(DPR, 0, 0, DPR, 0, 0);
            g.globalCompositeOperation = 'destination-out';
            g.fill(ER);
            g.restore();
          }
          return T;
        };
        if (EXT.length) fm(M, EXT, null);
        {
          const sq = SEAMS.filter((x) => LY === null || x.ly === LY);
          if (sq.length)
            fm(
              M,
              sq.map((x) => {
                const n = x.A.length,
                  gp0 = dist(x.A[0], x.B[0]),
                  gp1 = dist(x.A[n - 1], x.B[n - 1]),
                  cum = [0];
                for (let z = 1; z < n; z++) cum.push(cum[z - 1] + dist(x.mid[z - 1], x.mid[z]));
                const Ls = cum[n - 1],
                  TL = Math.min(15, Ls * 0.6),
                  op =
                    gp1 > gp0
                      ? 1
                      : 0; /* klin: od strony, gdzie jezdnie sie rozchodza, wypelnienie zweza sie do zera - ostry czubek */
                const Bf = x.B.map((q, z) => {
                  const dd = op ? Ls - cum[z] : cum[z],
                    f = Math.max(0, Math.min(1, dd / TL)),
                    p = x.A[z];
                  return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
                });
                return x.A.concat(Bf.reverse());
              }),
              null,
            );
        }
        const nts = nvs.flatMap(
          (nv) => nv.asph || [nv.poly],
        ); /* wielokat wezla wypelniany w calosci (nie tysiace trojkatow wachlarza) */
        if (kk >= 2.5) {
          for (const r of roads)
            fm(M, [window.__polyOf(r), ...(r.strips || [])], [...cutClip(r.ri, kk), ...nodeHole(r.ri)]);
        } else
          fm(
            M,
            roads.flatMap((r) => [window.__polyOf(r), ...(r.strips || [])]),
            null,
          );
        /* jeden wielokat na droge; przy oddaleniu wszystkie drogi jednym wypelnieniem */ {
          const g0 = M.getContext('2d');
          g0.globalCompositeOperation = 'destination-out';
          fm(M, nts, false);
          g0.globalCompositeOperation = 'source-over';
        }
        fm(M, nts, false);
        {
          const g3 = M.getContext('2d');
          g3.save();
          g3.setTransform(DPR, 0, 0, DPR, 0, 0);
          g3.beginPath();
          for (const nv of nvs)
            for (const PP of nv.asph || [nv.poly]) {
              PP.forEach((q, i) => {
                const w = w2s(q);
                i ? g3.lineTo(w[0], w[1]) : g3.moveTo(w[0], w[1]);
              });
              g3.closePath();
            }
          g3.strokeStyle = '#000';
          g3.lineWidth = Math.max(1.4, 0.05 * kk);
          g3.lineJoin = 'round';
          g3.stroke();
          g3.restore();
        } /* obrys tylko zewnetrzny wielokata wezla (nie kazdego trojkata wachlarza) */
        {
          const g0 = M.getContext('2d');
          g0.globalCompositeOperation = 'source-over';
          g0.drawImage(M, 0, 0);
          g0.drawImage(M, 0, 0);
        } /* maska prawie binarna: polprzezroczyste szwy na stykach drog (antyaliasing) nie daja linii w krawezniku */
        if (kk >= 2.5 && !window.__noGapClose && 'filter' in M.getContext('2d')) {
          const rb = (0.12 * kk * DPR).toFixed(2),
            D = mk(),
            dg = D.getContext('2d');
          dg.filter = 'blur(' + rb + 'px)';
          dg.drawImage(M, 0, 0);
          dg.filter = 'none';
          for (let q = 0; q < 5; q++) dg.drawImage(D, 0, 0);
          const E = mk(),
            eg = E.getContext('2d');
          eg.filter = 'blur(' + rb + 'px)';
          eg.drawImage(D, 0, 0);
          eg.filter = 'none';
          eg.globalCompositeOperation = 'destination-in';
          for (let q = 0; q < 5; q++) eg.drawImage(E, 0, 0);
          eg.globalCompositeOperation = 'source-over';
          M.getContext('2d').drawImage(E, 0, 0);
        } /* domkniecie wlosowatych szczelin (< ok. 0,3 m) miedzy stykajacymi sie jezdniami, np. rampa przy jezdni glownej */
        const DIR = [
          [1, 0],
          [0.7071, 0.7071],
          [0, 1],
          [-0.7071, 0.7071],
          [-1, 0],
          [-0.7071, -0.7071],
          [0, -1],
          [0.7071, -0.7071],
        ];
        const grow = (src, px) => {
          const T = mk(),
            t = T.getContext('2d');
          t.drawImage(src, 0, 0);
          for (const [x, y] of DIR) t.drawImage(src, x * px * DPR, y * px * DPR);
          return T;
        };
        const shrink = (src, px) => {
          const T = mk(),
            t = T.getContext('2d');
          t.drawImage(src, 0, 0);
          t.globalCompositeOperation = 'destination-in';
          for (const [x, y] of DIR) t.drawImage(src, x * px * DPR, y * px * DPR);
          return T;
        };
        const tintIn = (T, col) => {
            const t = T.getContext('2d');
            t.globalCompositeOperation = 'source-in';
            t.fillStyle = col;
            t.fillRect(0, 0, Wd, Hd);
            t.globalCompositeOperation = 'source-over';
            return T;
          },
          tint = (src, col) => {
            const T = mk();
            T.getContext('2d').drawImage(src, 0, 0);
            return tintIn(T, col);
          };
        let ring = null;
        if (tkE) {
          const cg = M.getContext('2d');
          if ('filter' in cg) {
            ring = mk();
            const rg0 = ring.getContext('2d');
            rg0.filter = 'blur(' + (0.13 * kk * DPR).toFixed(2) + 'px)';
            rg0.drawImage(M, 0, 0);
            rg0.filter = 'none';
            rg0.globalCompositeOperation = 'destination-in';
            for (let q = 0; q < 5; q++) rg0.drawImage(ring, 0, 0);
            rg0.globalCompositeOperation = 'source-over';
            for (let q = 0; q < 4; q++) rg0.drawImage(ring, 0, 0);
          } /* progowanie: potega alfy (a^32), potem wzmocnienie - ostra krawedz */ else ring = shrink(M, 0.2 * kk);
          /* zwezenie maski przez rozmycie (izotropowe): bez promieni przy waskich szczelinach */ const rg =
            ring.getContext('2d');
          rg.globalCompositeOperation = 'source-out';
          rg.drawImage(M, 0, 0);
          rg.globalCompositeOperation = 'source-over';
          tintIn(ring, '#e4e5e1');
        } /* biala linia krawedzi: maska minus maska zwezona */
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (LY !== null && LY > 0 && LY > LYS[0] && tkR && aL > 0) {
          const SH = tint(M, 'rgba(0,0,0,0.42)');
          if (anyER) {
            const g = SH.getContext('2d');
            g.save();
            g.setTransform(DPR, 0, 0, DPR, 0, 0);
            g.globalCompositeOperation = 'destination-out';
            g.fillStyle = '#000';
            /* pelne wymazanie (pedzel z kolorem cienia ma alfe 0,42 i kasowal tylko ulamek) */ g.fill(ERS);
            g.restore();
          }
          ctx.save();
          ctx.globalAlpha = aL;
          if ('filter' in ctx) ctx.filter = 'blur(' + Math.max(1, 0.9 * kk * DPR).toFixed(1) + 'px)';
          ctx.drawImage(SH, 0.9 * kk * DPR, 1.3 * kk * DPR);
          ctx.restore();
        }
        /* cien mostu na drogach pod spodem (slonce z lewej-gory) */ if (tkE) {
          const G1 = grow(M, 0.17 * kk),
            G2 = grow(G1, 0.04 * kk); /* kraweznik 0,21 m */
          const NOK = /^(motorway|trunk)(?!_link)/,
            noK = (T) => {
              /* bez kraweznika na drogach primary / secondary i nizszych (zostaja tylko autostrady i drogi ekspresowe); biala linia krawedzi bez zmian */ const g =
                T.getContext('2d');
              g.save();
              g.setTransform(DPR, 0, 0, DPR, 0, 0);
              g.globalCompositeOperation = 'destination-out';
              g.fillStyle = g.strokeStyle = '#000';
              g.lineJoin = 'round';
              g.lineWidth = 0.8 * kk;
              const poly = (P) => {
                g.beginPath();
                P.forEach((q, i) => {
                  const w = w2s(q);
                  i ? g.lineTo(w[0], w[1]) : g.moveTo(w[0], w[1]);
                });
                g.closePath();
                g.fill();
                g.stroke();
              };
              for (const r of roads) {
                if (NOK.test(S.doc.road[r.ri].hw || '')) continue;
                if (r.E0.length < 2) continue;
                poly(window.__polyOf(r));
              }
              for (const nv of nvs)
                if (
                  (nv.lanes || []).length &&
                  (nv.lanes || []).every((m) => S.doc.road[m.ri] && !NOK.test(S.doc.road[m.ri].hw || ''))
                )
                  (nv.asph || [nv.poly]).forEach(poly);
              g.restore();
              return T;
            };
          ctx.globalAlpha = baseA * aE;
          ctx.drawImage(noK(erase(tintIn(G2, '#6f716c'))), 0, 0);
          ctx.drawImage(noK(erase(tintIn(G1, '#c4c6c0'))), 0, 0);
          ctx.globalAlpha = baseA;
        }
        if (tkR)
          for (const r of roads) {
            const sk = window.__surfOn ? surfOf(S.doc.road[r.ri]) : '';
            if (!sk) continue;
            /* na razie tylko asfalt: inne nawierzchnie wylaczone (window.__surfOn) */ const q1 = [];
            for (let z = 1; z < r.E0.length; z++) q1.push([r.E0[z - 1], r.E0[z], r.E1[z], r.E1[z - 1]]);
            const SM = mk();
            fm(SM, q1, [...cutClip(r.ri, kk), ...nodeHole(r.ri)]);
            const T = tint(SM, '#000'),
              t = T.getContext('2d');
            t.globalCompositeOperation = 'source-in';
            const pt = t.createPattern(surfPat(sk), 'repeat');
            const sc = ((kk * 4) / 128) * 1;
            pt.setTransform(new DOMMatrix().scale(sc, sc));
            t.fillStyle = pt;
            t.fillRect(0, 0, Wd, Hd);
            r.surf = T;
          }
        if (tkR) {
          ctx.drawImage(tintIn(M, PAT), 0, 0);
          for (const r of roads) if (r.surf) ctx.drawImage(r.surf, 0, 0);
        } /* asfalt: maska barwiona w miejscu (bez dodatkowej kopii) */
        if (ring) {
          erase(ring);
          const MIN = /^(residential|service|living_street|track)/,
            mr = roads.filter((r) => MIN.test(S.doc.road[r.ri].hw || ''));
          if (mr.length) {
            const g = ring.getContext('2d');
            g.save();
            g.setTransform(DPR, 0, 0, DPR, 0, 0);
            g.globalCompositeOperation = 'destination-out';
            g.beginPath();
            for (const r of mr) {
              const P = offsetPts(
                r.G.Q,
                r.G.Q.map((_, j) => r.G.left[j] - 0.3),
              ).concat(
                offsetPts(
                  r.G.Q,
                  r.G.Q.map((_, j) => r.G.left[j] + r.G.NL * r.G.lw[j] + 0.3),
                ).reverse(),
              );
              P.forEach((q, i) => {
                const w = w2s(q);
                i ? g.lineTo(w[0], w[1]) : g.moveTo(w[0], w[1]);
              });
              g.closePath();
            }
            for (const nv of nvs)
              if ((nv.lanes || []).every((m) => S.doc.road[m.ri] && MIN.test(S.doc.road[m.ri].hw || ''))) {
                nv.poly.forEach((q, i) => {
                  const w = w2s(q);
                  i ? g.lineTo(w[0], w[1]) : g.moveTo(w[0], w[1]);
                });
                g.closePath();
              }
            g.fill('nonzero');
            g.restore();
          }
          ctx.globalAlpha = baseA * aE;
          ctx.drawImage(ring, 0, 0);
          ctx.globalAlpha = baseA;
        }
        /* residential/service: sam asfalt z kraweznikiem, bez bialej linii krawedzi */ ctx.restore();
        const EM = new Map();
        S.doc.road.forEach((rd, i) => {
          [
            [0, true],
            [rd.nk.length - 1, false],
          ].forEach(([j, st]) => {
            const k = rd.nk[j];
            if (k) (EM.get(k) || EM.set(k, []).get(k)).push({ ri: i, st });
          });
        });
        const byRiAll = new Map(allRoads.map((r) => [r.ri, r])),
          PHm = new Map(),
          PDash = 7.5; /* faza wzoru kresek: ciagla przez styki jezdni jednokierunkowych (kreska nie zaczyna sie od nowa na kazdym odcinku) */
        const phaseOf = (ri, depth) => {
          if (PHm.has(ri)) return PHm.get(ri);
          PHm.set(ri, 0);
          const rd = S.doc.road[ri];
          let ph = 0;
          if (rd && rd.oneway && depth < 60) {
            const k = rd.nk[0],
              ls = k && EM.get(k);
            if (ls && ls.length === 2) {
              const o = ls.find((e) => e.ri !== ri),
                ro = o && S.doc.road[o.ri],
                rp = o && byRiAll.get(o.ri);
              if (o && !o.st && ro.oneway && rp) {
                const cmp = cumOf(rp.G.Q);
                ph = (phaseOf(o.ri, depth + 1) + cmp[cmp.length - 1]) % PDash;
              }
            }
          }
          PHm.set(ri, ph);
          return ph;
        };
        const laneAdj = (ri, G) => {
          /* zmiana liczby pasow o 1 na styku dwoch jezdni jednokierunkowych: wszystkie linie pasow leza w stalym odstepie (nominalna szerokosc pasa) od stalej krawedzi jezdni; rozszerzajacy sie / zwezajacy pas wyrasta z drugiej krawedzi (linia pasa, ktory sie konczy, dochodzi do krawedzi) */
          const rd = S.doc.road[ri];
          if (G.NL < 1 || G.Q.length < 3) return null;
          const nbkL = rd.oneway ? 0 : G.NL - Math.max(0, Math.min(G.NL, rd.nf == null ? Math.round(G.NL / 2) : rd.nf));
          const cm = cumOf(G.Q),
            Lq = cm[cm.length - 1];
          let res = null;
          for (const [ix, st] of [
            [0, true],
            [rd.nk.length - 1, false],
          ]) {
            const k = rd.nk[ix];
            if (!k) continue;
            const ls = EM.get(k);
            if (!ls || ls.length !== 2) continue;
            const oth = ls.find((e) => e.ri !== ri);
            if (!oth || oth.st === st || ls.filter((e) => e.ri === ri).length !== 1) continue;
            const ro = S.doc.road[oth.ri];
            if (!ro || !!ro.oneway !== !!rd.oneway || (!rd.oneway && ((ro.nf | 0) !== (rd.nf | 0) || nbkL <= 0)))
              continue;
            const dN = (ro.lanes | 0) - (rd.lanes | 0);
            if (Math.abs(dN) !== 1) continue;
            let Go = null;
            try {
              Go = laneGeom(oth.ri);
            } catch (e) {}
            if (!Go) continue;
            const jw = st ? 0 : G.Q.length - 1,
              nd = G.Q[jw];
            if ((S.nodeViz || []).some((nv) => !nv.mini && dist(nv.o, nd) < 2))
              continue; /* z prawdziwym wezlem (3+ drog) zostaje po staremu; maly wezel dwoch drog to zwykly styk */
            const T = Math.min(Math.max(10, +($('fT') ? $('fT').value : 35) || 35), 0.45 * Lq);
            if (T < 5) continue;
            const wide = dN < 0,
              w0 = Math.min(rd.lw || 3.75, ro.lw || 3.75),
              rg = (j) => G.left[j] + G.NL * G.lw[j];
            const sideR = (Gx, stx) => {
              const nx = Gx.Q.length,
                cx = cumOf(Gx.Q),
                Lx = cx[nx - 1],
                Tx = Math.min(Math.max(10, +($('fT') ? $('fT').value : 35) || 35), 0.45 * Lx),
                jx = stx ? 0 : nx - 1;
              let jf = jx;
              while (stx ? jf < nx - 1 : jf > 0) {
                if ((stx ? cx[jf] : Lx - cx[jf]) >= 1.5 * Tx) break;
                jf += stx ? 1 : -1;
              }
              const rgx = (j) => Gx.left[j] + Gx.NL * Gx.lw[j];
              return Math.abs(rgx(jx) - rgx(jf)) < Math.abs(Gx.left[jx] - Gx.left[jf]) - 0.05;
            };
            const anchR = !rd.oneway
              ? true
              : wide
                ? sideR(G, st)
                : sideR(
                    Go,
                    oth.st,
                  ); /* dwukierunkowa: stala liczba pasow w przod (prawa strona), zmienia sie liczba pasow przeciwnych (lewa) - kotwica prawa krawedz */ /* ta sama kotwica po obu stronach styku (wg szerszego odcinka): bez przeskoku linii */ /* ktora krawedz stoi w miejscu: ta, do ktorej kotwiczymy linie */
            res = res || new Map();
            if (!rd.oneway && Go.NL >= 3) res.dbl = true;
            const qMax = wide ? G.NL - 1 : G.NL; /* odcinek wezszy dostaje dodatkowa linie (poczatek nowego pasa) */
            for (let q = 1; q <= qMax; q++) {
              const cur = res.get(q) || { off: null, keep: null };
              const off = cur.off || G.Q.map((_, j) => lb(G, q, j)),
                keep = cur.keep || G.Q.map(() => true);
              if (q === nbkL && !wide && !rd.oneway && Go.NL >= 3) {
                cur.fade = cur.fade || G.Q.map(() => 0);
                for (let j = 0; j < off.length; j++) {
                  const sv = st ? cm[j] : Lq - cm[j];
                  cur.fade[j] = Math.max(cur.fade[j], sv >= T ? 0 : 1 - sm5((sv - 0.5 * T) / (0.5 * T)));
                }
              } /* podwojna ciagla wchodzi w wezszy odcinek i zanika */
              for (let j = 0; j < off.length; j++) {
                const sv = st ? cm[j] : Lq - cm[j];
                if (sv >= 2 * T) {
                  if (q === G.NL) keep[j] = false;
                  continue;
                }
                const g = sv <= T ? 1 : 1 - sm5((sv - T) / T),
                  anc = anchR ? rg(j) - (q === G.NL ? G.NL : G.NL - q) * w0 : G.left[j] + q * w0;
                if (q === G.NL) {
                  const gapEdge = anchR ? anc - G.left[j] : rg(j) - anc;
                  if (gapEdge < 0.35) keep[j] = false;
                  off[j] = anc;
                } else off[j] = off[j] * (1 - g) + anc * g;
              }
              cur.off = off;
              cur.keep = keep;
              res.set(q, cur);
            }
          }
          if (res) ((res.cm = cm), (res.Lq = Lq));
          return res;
        };
        if (tkM)
          for (const r of roads) {
            ctx.save();
            cutClip(r.ri, kk).forEach((cq) => ctx.clip(cq, 'evenodd'));
            nodeHole(r.ri).forEach((cq) => ctx.clip(cq, 'evenodd'));
            const G = r.G,
              BL = busLanes(r.ri, G.NL),
              LAD = BL.size ? null : laneAdj(r.ri, G),
              ph0 = phaseOf(r.ri, 0);
            ctx.strokeStyle = '#f2f2f2';
            ctx.globalAlpha = baseA * aM * 0.82;
            const minorR =
              /^(residential|living_street|service|unclassified|track|road|pedestrian)/.test(
                S.doc.road[r.ri].hw || '',
              ) && !BL.size;
            /* male uliczki: bez linii pasow */ const rdv = S.doc.road[r.ri],
              nbk = rdv.oneway
                ? 0
                : G.NL -
                  Math.max(
                    0,
                    Math.min(G.NL, rdv.nf == null ? Math.round(G.NL / 2) : rdv.nf),
                  ); /* pasy kierunku przeciwnego (od lewej) */
            for (let q = 1; q < (minorR ? 1 : LAD && LAD.has(G.NL) ? G.NL + 1 : G.NL); q++) {
              const adv = LAD && LAD.get(q);
              if (q === nbk && nbk > 0 && !BL.size && (G.NL >= 3 || (adv && LAD.dbl))) {
                /* droga dwukierunkowa z >= 3 pasami (i poczatek wezszego odcinka przy styku): cienka podwojna ciagla miedzy kierunkami */ ctx.setLineDash(
                  [],
                );
                ctx.lineWidth = 0.08 * kk;
                const offv = adv && adv.off ? adv.off : G.Q.map((_, j) => lb(G, q, j)),
                  fd = adv && adv.fade,
                  a0 = ctx.globalAlpha;
                if (fd) {
                  for (let j = 1; j < G.Q.length; j++) {
                    const al = Math.min(fd[j - 1], fd[j]);
                    if (al <= 0.02) continue;
                    ctx.globalAlpha = a0 * al;
                    for (const dz of [-0.1, 0.1]) {
                      pl(offsetPts([G.Q[j - 1], G.Q[j]], [offv[j - 1] + dz, offv[j] + dz]), false);
                      ctx.stroke();
                    }
                  }
                  ctx.globalAlpha = a0;
                  /* za koncem zanikania podwojnej ciaglej wraca zwykla przerywana linia srodka */ ctx.setLineDash([
                    2.5 * kk,
                    5 * kk,
                  ]);
                  ctx.lineDashOffset = ph0 * kk;
                  ctx.lineWidth = 0.12 * kk;
                  let run = [];
                  const flushD = () => {
                    if (run.length > 1) {
                      pl(
                        offsetPts(
                          run.map((j) => G.Q[j]),
                          run.map((j) => offv[j]),
                        ),
                        false,
                      );
                      ctx.stroke();
                    }
                    run = [];
                  };
                  for (let j = 0; j < G.Q.length; j++) {
                    if (fd[j] <= 0.02) run.push(j);
                    else flushD();
                  }
                  flushD();
                  ctx.setLineDash([]);
                } else
                  for (const dz of [-0.1, 0.1]) {
                    pl(
                      offsetPts(
                        G.Q,
                        offv.map((v) => v + dz),
                      ),
                      false,
                    );
                    ctx.stroke();
                  }
                continue;
              }
              const solid = BL.has(q - 1) !== BL.has(q);
              ctx.setLineDash(solid ? [] : [2.5 * kk, 5 * kk]);
              ctx.lineDashOffset = ph0 * kk;
              ctx.lineWidth = (solid ? 0.2 : 0.12) * kk;
              {
                const ad = LAD && LAD.get(q);
                if (ad) {
                  const off = ad.off || G.Q.map((_, j) => lb(G, q, j)),
                    ix = [];
                  for (let j = 0; j < G.Q.length; j++) if (!ad.keep || ad.keep[j]) ix.push(j);
                  if (ix.length > 1) {
                    /* odcinki ciagle (maska moze miec przerwy) */ let run = [];
                    for (let z = 0; z <= ix.length; z++) {
                      if (z < ix.length && (run.length === 0 || ix[z] === run[run.length - 1] + 1)) {
                        run.push(ix[z]);
                        continue;
                      }
                      if (run.length > 1) {
                        pl(
                          offsetPts(
                            run.map((j) => G.Q[j]),
                            run.map((j) => off[j]),
                          ),
                          false,
                        );
                        ctx.lineDashOffset = ((ph0 + LAD.cm[run[0]]) % PDash) * kk;
                        ctx.stroke();
                      }
                      run = z < ix.length ? [ix[z]] : [];
                    }
                    continue;
                  } else continue;
                } else
                  pl(
                    offsetPts(
                      G.Q,
                      G.Q.map((_, j) => lb(G, q, j)),
                    ),
                    false,
                  );
              }
              ctx.stroke();
            }
            ctx.setLineDash([]); /* pas autobusowy oddzielony szeroka linia ciagla */
            if (BL.size && kk > 3) {
              const rd = S.doc.road[r.ri],
                nb = rd.oneway ? 0 : G.NL - (rd.nf || 1),
                cum = [0];
              for (let z = 1; z < G.Q.length; z++) cum.push(cum[z - 1] + dist(G.Q[z - 1], G.Q[z]));
              const Ltot = cum[cum.length - 1];
              ctx.fillStyle = '#f2f2f2';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.font = 'bold ' + (1.5 * kk).toFixed(1) + 'px Arial, sans-serif';
              for (const q of BL) {
                const back = q < nb;
                for (let sd = Math.min(12, Ltot / 2); sd < Ltot; sd += 35) {
                  let z = 1;
                  while (z < cum.length - 1 && cum[z] < sd) z++;
                  const f = (sd - cum[z - 1]) / (cum[z] - cum[z - 1] || 1),
                    A = G.Q[z - 1],
                    B = G.Q[z],
                    tl0 = Math.hypot(B[0] - A[0], B[1] - A[1]);
                  if (tl0 < 1e-9) continue;
                  const t = [(B[0] - A[0]) / tl0, (B[1] - A[1]) / tl0];
                  const lat = (lb(G, q, z) + lb(G, q + 1, z)) / 2,
                    P = [A[0] + (B[0] - A[0]) * f - t[1] * lat, A[1] + (B[1] - A[1]) * f + t[0] * lat],
                    sp = w2s(P),
                    dir = back ? [-t[0], -t[1]] : t;
                  window.__busPts.push(P);
                  ctx.save();
                  ctx.translate(sp[0], sp[1]);
                  ctx.rotate(Math.atan2(dir[1], dir[0]) + Math.PI / 2);
                  ctx.scale(0.75, 1.6);
                  ctx.fillText('BUS', 0, 0);
                  ctx.restore();
                }
              }
            } /* napis BUS na pasie, czytany w kierunku jazdy, wydluzony jak na jezdni */
            ctx.restore();
          }
        if (tkM)
          for (const sq of SEAMS) {
            if (LY !== null && sq.ly !== LY) continue;
            const cum = [0];
            for (let z = 1; z < sq.mid.length; z++) cum.push(cum[z - 1] + dist(sq.mid[z - 1], sq.mid[z]));
            const Ls = cum[cum.length - 1],
              fade = 0.6,
              nA = sq.A.length,
              opn = dist(sq.A[nA - 1], sq.B[nA - 1]) > dist(sq.A[0], sq.B[0]),
              TLs = Math.min(15, Ls * 0.6);
            ctx.save();
            ctx.globalAlpha = baseA * aM;
            ctx.strokeStyle = '#f2f2f2';
            ctx.lineWidth = 0.15 * kk;
            ctx.setLineDash([2.5 * kk, 5 * kk]);
            pl(
              sq.mid.filter((_, z) => cum[z] > fade && cum[z] < Ls - fade && (opn ? Ls - cum[z] : cum[z]) > TLs),
              false,
            );
            /* bez linii w zwezajacym sie klinie */ ctx.stroke();
            ctx.restore();
          } /* linia pasa miedzy rampa a jezdnia glowna */
        if (tkE && LY !== null && LY > 0 && aL > 0)
          for (const r of roads) {
            const G = r.G,
              NL = G.NL;
            ctx.save();
            ctx.globalAlpha = aL;
            cutClip(r.ri, kk).forEach((cq) => ctx.clip(cq, 'evenodd'));
            nodeHole(r.ri).forEach((cq) => ctx.clip(cq, 'evenodd'));
            ctx.lineCap = 'butt';
            ctx.lineJoin =
              'round'; /* barierki mostu: betonowa podstawa, slupki i jasna porecz przesunieta w gore-lewo (lekkie 3D) */
            const cq = cumOf(G.Q),
              Lq = cq[cq.length - 1],
              ix = G.Q.map((_, j) => j).filter((j) => cq[j] > 0.8 && cq[j] < Lq - 0.8);
            if (ix.length < 2) {
              ctx.restore();
              continue;
            }
            /* barierki konczą sie przed koncem odcinka (krotkie odcinki na zlaczu maja przypadkowy kierunek) */ for (const sd of [
              -1, 1,
            ]) {
              const off = ix.map((j) => (sd < 0 ? G.left[j] - 0.45 : G.left[j] + NL * G.lw[j] + 0.45)),
                E = offsetPts(
                  ix.map((j) => G.Q[j]),
                  off,
                );
              pl(E, false);
              ctx.strokeStyle = '#6c6f6a';
              ctx.lineWidth = 0.55 * kk;
              ctx.stroke();
              ctx.setLineDash([0.14 * kk, 1.86 * kk]);
              ctx.strokeStyle = '#4a4c48';
              ctx.lineWidth = 0.75 * kk;
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.save();
              ctx.translate(-0.12 * kk, -0.18 * kk);
              pl(E, false);
              ctx.strokeStyle = '#e6e7e3';
              ctx.lineWidth = 0.22 * kk;
              ctx.stroke();
              ctx.restore();
            }
            ctx.restore();
          }
        if (tkM)
          for (const a of L.arrows || []) {
            if (LY !== null && (a.ly | 0) !== LY) continue;
            if (window.__busPts && window.__busPts.some((bp) => Math.hypot(bp[0] - a.x, bp[1] - a.y) < 4.3)) continue;
            /* strzalka nie nachodzi na napis BUS */ if (
              (S.nodeViz || []).some(
                (nv) =>
                  pipN([a.x, a.y], nv.poly) ||
                  (nv.cuts || []).some((c) => {
                    if (!c) return false;
                    const mx = (c[1][0] + c[2][0]) / 2,
                      my = (c[1][1] + c[2][1]) / 2;
                    return Math.hypot(a.x - mx, a.y - my) < 6;
                  }),
              )
            )
              continue;
            const p = w2s([a.x, a.y]);
            ctx.save();
            ctx.globalAlpha = baseA * aA;
            window.__arrCol = '#dcdcd8';
            ctx.translate(p[0], p[1]);
            ctx.rotate(((a.rot - 90) * Math.PI) / 180);
            const sc = (4.2 * Math.min(1, Math.max(0.55, (a.lw || 3.5) / 3.5)) * kk) / 48;
            /* strzalka proporcjonalna do szerokosci pasa (waskie pasy: mniejsze, bez zachodzenia) */ ctx.scale(sc, sc);
            ctx.translate(-24, -16);
            try {
              glyph(ctx, a.type);
            } catch (e) {}
            window.__arrCol = null;
            ctx.restore();
          }
        ctx.restore();
        {
          const cy = document.getElementById('cCycle');
          if (aC > 0 && tkR && (!cy || cy.checked)) drawCycle(kk, aC, LY);
        } /* drogi i pasy rowerowe tuz nad drogami swojej warstwy (pod mostem - nizej, na moscie - wyzej) */
      }
    }
    if (false)
      for (const a of L.arrows || []) {
        if (
          (S.nodeViz || []).some((nv) =>
            (nv.cuts || []).some((c) => {
              if (!c) return false;
              const mx = (c[1][0] + c[2][0]) / 2,
                my = (c[1][1] + c[2][1]) / 2;
              return Math.hypot(a.x - mx, a.y - my) < 4.5;
            }),
          )
        )
          continue;
        const p = w2s([a.x, a.y]);
        ctx.save();
        ctx.translate(p[0], p[1]);
        ctx.rotate(((a.rot - 90) * Math.PI) / 180);
        const sc = (5 * kk) / 48;
        ctx.scale(sc, sc);
        ctx.translate(-24, -16);
        try {
          glyph(ctx, a.type);
        } catch (e) {}
        ctx.restore();
      }
    ctx.restore();
  }
  if (window.__nodeGeom && document.getElementById('cNodeLanes') && document.getElementById('cNodeLanes').checked) {
    /* obrysy kazdego pasa kazdej jezdni (osobna warstwa), przyciete na zoltej granicy wezla */
    const T = document.createElement('canvas');
    T.width = cv.width;
    T.height = cv.height;
    const t = T.getContext('2d');
    t.setTransform(DPR, 0, 0, DPR, 0, 0);
    const pth = (P) => {
      t.beginPath();
      P.forEach((q, i) => {
        const w = w2s(q);
        i ? t.lineTo(w[0], w[1]) : t.moveTo(w[0], w[1]);
      });
      t.closePath();
    };
    t.lineJoin = 'round';
    t.lineWidth = 1.5;
    for (let i = 0; i < S.doc.road.length; i++) {
      let G = null;
      try {
        G = laneGeom(i);
      } catch (e) {}
      if (!G) continue;
      t.strokeStyle = 'hsl(' + ((i * 67) % 360) + ',85%,45%)';
      t.fillStyle = 'hsla(' + ((i * 67) % 360) + ',85%,50%,.10)';
      t.save();
      cutClip(i, S.view.k).forEach((cq) => t.clip(cq, 'evenodd'));
      nodeHole(i).forEach((cq) => t.clip(cq, 'evenodd'));
      for (let q = 0; q < G.NL; q++) {
        const A0 = offsetPts(
            G.Q,
            G.Q.map((_, j) => lb(G, q, j)),
          ),
          B0 = offsetPts(
            G.Q,
            G.Q.map((_, j) => lb(G, q + 1, j)),
          );
        if (window.__cutRot && (S.doc.road[i].cutSh || S.doc.road[i]._cs || S.doc.road[i]._cs2) && A0.length > 1)
          for (const en of ['s', 'e']) {
            const sh =
              (S.doc.road[i].cutSh || {})[en] || (S.doc.road[i]._cs || {})[en] || (S.doc.road[i]._cs2 || {})[en];
            if (!sh) continue;
            const s0 = en === 's',
              i0 = s0 ? 0 : A0.length - 1,
              i1 = s0 ? 1 : A0.length - 2,
              tx = A0[i1][0] - A0[i0][0],
              ty = A0[i1][1] - A0[i0][1],
              tl = Math.hypot(tx, ty) || 1,
              ux = tx / tl,
              uy = ty / tl;
            A0[i0] = [A0[i0][0] + ux * (sh[2 * q] || 0), A0[i0][1] + uy * (sh[2 * q] || 0)];
            B0[i0] = [B0[i0][0] + ux * (sh[2 * q + 1] || 0), B0[i0][1] + uy * (sh[2 * q + 1] || 0)];
          }
        pth(A0.concat(B0.slice().reverse()));
        t.fill();
        t.stroke();
      }
      t.restore();
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(T, 0, 0);
    ctx.restore();
  }
  if (
    window.__nodeGeom &&
    S.nodeViz &&
    document.getElementById('cNodeBord') &&
    document.getElementById('cNodeBord').checked
  )
    for (const nv of S.nodeViz) {
      if (nv.mini || nv.fkt)
        continue; /* widoczna geometria wezla: obrys wielokata (przerywany) i luki w narozach (niebieskie) */
      ctx.save();
      {
        /* sasiednie wezly: granice lezace wewnatrz innego wezla sa niewidoczne (wezly sie lacza) */ const cp =
          new Path2D();
        cp.rect(-1e5, -1e5, 2e5, 2e5);
        let any = false;
        for (const o2 of S.nodeViz) {
          if (o2 === nv || o2.mini) continue;
          o2.poly.forEach((q, i) => {
            const w = w2s(q);
            i ? cp.lineTo(w[0], w[1]) : cp.moveTo(w[0], w[1]);
          });
          cp.closePath();
          any = true;
        }
        if (any) ctx.clip(cp, 'evenodd');
        const cnt = new Map();
        for (const o2 of S.nodeViz) {
          if (o2.mini) continue;
          (o2.lanes || []).forEach((m, j) => {
            const c = o2.cuts && o2.cuts[j];
            if (c && c.D != null) cnt.set(m.ri, (cnt.get(m.ri) || []).concat(c.D));
          });
        }
        for (const [ri, Ds] of cnt) {
          if (Ds.length < 2) continue;
          let G = null;
          try {
            G = laneGeom(ri);
          } catch (e) {}
          if (!G) continue;
          let len = 0;
          for (let z = 1; z < G.Q.length; z++) len += dist(G.Q[z - 1], G.Q[z]);
          if (len > Ds[0] + Ds[1] + 0.5)
            continue; /* krotka droga miedzy dwoma bliskimi wezlami (w calosci w wezle): jej obszar bez linii granic */
          const E0 = offsetPts(
              G.Q,
              G.Q.map((_, j) => G.left[j]),
            ),
            E1 = offsetPts(
              G.Q,
              G.Q.map((_, j) => G.left[j] + G.NL * G.lw[j]),
            ),
            sp = new Path2D();
          sp.rect(-1e5, -1e5, 2e5, 2e5);
          E0.concat(E1.slice().reverse()).forEach((q, i) => {
            const w = w2s(q);
            i ? sp.lineTo(w[0], w[1]) : sp.moveTo(w[0], w[1]);
          });
          sp.closePath();
          ctx.clip(sp, 'evenodd');
        }
      }
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#f5b400';
      ctx.beginPath();
      nv.poly.forEach((q, i) => {
        const w = w2s(q);
        i ? ctx.lineTo(w[0], w[1]) : ctx.moveTo(w[0], w[1]);
      });
      ctx.closePath();
      ctx.stroke();
      if (nv.cuts && nv.cuts.some(Boolean)) {
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffc400';
        for (const c of nv.cuts) {
          if (!c) continue;
          ctx.beginPath();
          c.forEach((q, i) => {
            const w = w2s(q);
            i ? ctx.lineTo(w[0], w[1]) : ctx.moveTo(w[0], w[1]);
          });
          ctx.stroke();
        }
      } else if (nv.arcs.length > 1) {
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffc400';
        for (let q = 0; q < nv.arcs.length; q++) {
          const A0 = nv.arcs[q],
            B0 = nv.arcs[(q + 1) % nv.arcs.length],
            e1 = w2s(A0[A0.length - 1]),
            s1 = w2s(B0[0]);
          ctx.beginPath();
          ctx.moveTo(e1[0], e1[1]);
          ctx.lineTo(s1[0], s1[1]);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#0050ff';
      if (!window.__noBlue)
        for (const ar of nv.arcs) {
          ctx.beginPath();
          ar.forEach((q, j) => {
            const w = w2s(q);
            j ? ctx.lineTo(w[0], w[1]) : ctx.moveTo(w[0], w[1]);
          });
          ctx.stroke();
        }
      ctx.restore();
      ctx.restore();
    }
  if (S.msel && S.msel.size)
    for (const { i, q } of S.msel.values()) {
      const G = laneGeom(i);
      if (!G || q < 0 || q >= G.NL) continue;
      const A0 = offsetPts(
          G.Q,
          G.Q.map((_, j) => lb(G, q, j)),
        ),
        B0 = offsetPts(
          G.Q,
          G.Q.map((_, j) => lb(G, q + 1, j)),
        );
      ctx.save();
      pathOf(ctx, A0.concat(B0.slice().reverse()), true);
      ctx.fillStyle = 'rgba(255,122,0,.35)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,122,0,.95)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  {
    const nb = document.getElementById('nrbar'),
      nk =
        nb && nb.style.display !== 'none'
          ? nb.dataset.k
          : ''; /* geometria przejscia wybranego wezla: przerywana os drog na dlugosci przejscia + znaczniki poczatku i konca */
    if (nk) {
      const P = S.nodeP[nk] || {},
        T = P.T || +$('fT').value || 35,
        SA = P.s != null ? P.s : 0.3;
      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ff7a00';
      for (const r of S.doc.road) {
        const j = r.nk.indexOf(nk);
        if (j < 0) continue;
        for (const dir of [1, -1]) {
          if (j + dir < 0 || j + dir >= r.pts.length) continue;
          let acc = 0,
            prev = r.pts[j],
            pts = [prev],
            mk = [];
          for (let q = j + dir; q >= 0 && q < r.pts.length && acc < T; q += dir) {
            const cur = r.pts[q],
              d = dist(prev, cur),
              room = T - acc,
              f = d > room ? room / d : 1,
              pt = [prev[0] + (cur[0] - prev[0]) * f, prev[1] + (cur[1] - prev[1]) * f];
            if (acc < SA * T && acc + d * f >= SA * T) {
              const g2 = (SA * T - acc) / (d * f || 1);
              mk.push([prev[0] + (pt[0] - prev[0]) * g2, prev[1] + (pt[1] - prev[1]) * g2]);
            }
            acc += d * f;
            pts.push(pt);
            prev = cur;
            if (f < 1) break;
          }
          ctx.beginPath();
          pts.forEach((q, i) => {
            const w = w2s(q);
            i ? ctx.lineTo(w[0], w[1]) : ctx.moveTo(w[0], w[1]);
          });
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#ff7a00';
          for (const q of mk.concat([pts[pts.length - 1]])) {
            const w = w2s(q);
            ctx.beginPath();
            ctx.arc(w[0], w[1], 4, 0, 7);
            ctx.fill();
          }
          ctx.setLineDash([7, 5]);
        }
      }
      ctx.restore();
    }
  }
}
function render() {
  const k = S.view.k,
    D = S.doc;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#e9ecdf';
  ctx.fillRect(0, 0, W, H);
  {
    const zz = Math.log2(156543.03 * Math.cos((S.org.lat * Math.PI) / 180) * k),
      lb = $('lcLoad');
    if (lb) {
      const off = zz < 16;
      if (lb.disabled !== off) {
        lb.disabled = off;
        lb.title = off ? 'Przybliż do zoomu 16, żeby pobrać dane z OSM' : 'Wczytaj aktualne dane z OSM dla tego widoku';
      }
      const lo2 = $('lcLoadOv');
      if (lo2 && lo2.disabled !== off) {
        lo2.disabled = off;
        lo2.title = off
          ? 'Przybliż do zoomu 16, żeby pobrać dane z OSM'
          : 'Pobierz szybciej: tylko drogi, przez Overpass';
      }
    }
  }
  drawTiles();
  try {
    updNr();
  } catch (e) {}
  if (Math.log2(156543.03 * Math.cos((S.org.lat * Math.PI) / 180) * k) < 14) {
    drawScale();
    return;
  } /* drogi od zoomu 14 (sama kreska, grubosc maleje z oddaleniem), dalej sam podklad */
  if (S.dirty || !L) {
    L = layout();
    S.dirty = false;
    try {
      DUP = dupScan();
    } catch (e) {
      DUP = [];
      console.warn('dupScan', e);
    }
    try {
      PZI = pzScan();
    } catch (e) {
      PZI = [];
      console.warn('pzScan', e);
    }
  }
  if ($('cLay').checked && !window.__nodeGeom) {
    octx.setTransform(DPR, 0, 0, DPR, 0, 0);
    octx.clearRect(0, 0, W, H);
    drawLayer(octx);
    ctx.globalAlpha = +$('rA').value;
    ctx.drawImage(off, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  if (!window.__nodeGeom && $('cBlue') && $('cBlue').checked && !EMBED) {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(47,139,255,.9)';
    ctx.fillStyle = 'rgba(47,111,174,.12)';
    for (const pl of L.polys) {
      pathOf(ctx, pl.P, true);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(47,139,255,.18)';
    for (const g of L.gores) {
      if (g.poly && g.poly.length > 2) {
        pathOf(ctx, g.poly, true);
        ctx.fill();
        ctx.stroke();
      }
      if (g.A && g.A.length > 1 && g.B.length > 1) {
        ctx.strokeStyle = 'rgba(255,140,0,.95)';
        ctx.fillStyle = 'rgba(255,140,0,.18)';
        pathOf(ctx, g.A.concat(g.B.slice().reverse()), true);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(47,139,255,.9)';
        ctx.fillStyle = 'rgba(47,139,255,.18)';
      }
    }
    ctx.restore();
  }
  if (!window.__nodeGeom && S.tool === 'sel' && S.sel >= 0 && !EMBED && S.doc.road[S.sel] && S.doc.road[S.sel].osm) {
    // zaznaczona droga: podswietlone wszystkie pasy; po kliknieciu pasa - ten pas innym kolorem + podglad strzalki
    const r = S.doc.road[S.sel],
      nb = r.oneway ? 0 : r.lanes - (r.nf || 1),
      g = r.oneway ? LSEL.i : LSEL.r === 0 ? nb + LSEL.i : nb - 1 - LSEL.i,
      G = laneGeom(S.sel);
    if (G) {
      for (let q = 0; q < G.NL; q++) {
        const A0 = offsetPts(
            G.Q,
            G.Q.map((_, j) => lb(G, q, j)),
          ),
          B0 = offsetPts(
            G.Q,
            G.Q.map((_, j) => lb(G, q + 1, j)),
          );
        ctx.save();
        pathOf(ctx, A0.concat(B0.slice().reverse()), true);
        ctx.fillStyle = q % 2 ? 'rgba(47,111,174,.16)' : 'rgba(47,111,174,.28)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(47,139,255,.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    }
    if (r.la)
      for (const gk of Object.keys(r.la)) {
        const A = r.la[gk],
          sel = laneOn() && +gk === laneAbs(r);
        if (!A || A.length < 2) continue;
        ctx.save();
        pathOf(ctx, smoothDense(A, 1, null, null, true), false);
        ctx.strokeStyle = sel ? '#ff3b00' : 'rgba(255,140,0,.7)';
        ctx.lineWidth = sel ? 2.5 : 1.5;
        ctx.setLineDash(sel ? [] : [5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (sel) {
          A.forEach((q, i) => {
            const sp = w2s(q);
            ctx.beginPath();
            ctx.arc(sp[0], sp[1], 6, 0, 7);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.stroke();
            if (i < A.length - 1) {
              const m = w2s([(q[0] + A[i + 1][0]) / 2, (q[1] + A[i + 1][1]) / 2]);
              ctx.beginPath();
              ctx.arc(m[0], m[1], 3.5, 0, 7);
              ctx.fillStyle = 'rgba(255,59,0,.55)';
              ctx.fill();
            }
          });
        }
        ctx.restore();
      }
    if (G && laneOn() && LAN) {
      let A = offsetPts(
          G.Q,
          G.Q.map((_, j) => lb(G, g, j)),
        ),
        B = offsetPts(
          G.Q,
          G.Q.map((_, j) => lb(G, g + 1, j)),
        );
      if (r.la && r.la[g] && r.la[g].length > 1) {
        const hw = G.lw.reduce((x, y) => x + y, 0) / G.lw.length / 2,
          Ad = smoothDense(r.la[g], 1, null, null, true);
        A = offsetPts(Ad, -hw);
        B = offsetPts(Ad, hw);
      }
      /* pas podaza za wlasna osia */ ctx.save();
      pathOf(ctx, A.concat(B.slice().reverse()), true);
      ctx.fillStyle = 'rgba(255,140,0,.45)';
      ctx.fill();
      ctx.strokeStyle = '#ff8c00';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
      const tk = (LAN.cur.tok[LAN.idx] || '').split(';'),
        key = ['through', 'left', 'right', 'reverse'].filter((x) => tk.includes(x)).join('-');
      if (key && (key === 'through-left-right' || ARR.has(key)) && LP && LP.sel === S.sel) {
        const j = LP.j,
          n = [-LP.dir[1], LP.dir[0]],
          lat = (lb(G, g, j) + lb(G, g + 1, j)) / 2,
          pp = [LP.p[0] + n[0] * lat, LP.p[1] + n[1] * lat],
          sp = w2s(pp),
          ang = (Math.atan2(LP.dir[1], LP.dir[0]) * 180) / Math.PI + 90 + (LP.back ? 180 : 0);
        ctx.save();
        ctx.translate(sp[0], sp[1]);
        ctx.rotate(((ang - 90) * Math.PI) / 180);
        const sc = (5 * k) / 48;
        ctx.scale(sc, sc);
        ctx.translate(-24, -16);
        glyph(ctx, key);
        ctx.restore();
      }
    }
  }
  try {
    /* warstwa drog z pamiecia podreczna: przy przesuwaniu/zoomie rysujemy gotowy obraz (przesuniety, przeskalowany), pelne przerysowanie po zatrzymaniu */
    const al = window.__roadAlpha != null ? window.__roadAlpha : 1,
      RC = (window.__roadCache = window.__roadCache || { cv: document.createElement('canvas') }),
      ids = ['cNodeRend', 'cNodeLanes', 'cNodeBord', 'cCycle']
        .map((id) => {
          const e = document.getElementById(id);
          return e && e.checked ? 1 : 0;
        })
        .join('');
    const key = ids + '|' + cv.width + 'x' + cv.height + '|' + DPR,
      V = S.view,
      same = RC.L === L && RC.key === key,
      sameView = same && RC.v && RC.v.x === V.x && RC.v.y === V.y && RC.v.k === V.k;
    const full = () => {
      const real = ctx,
        tr = real.getTransform();
      if (RC.cv.width !== cv.width || RC.cv.height !== cv.height) {
        RC.cv.width = cv.width;
        RC.cv.height = cv.height;
      }
      ctx = RC.cv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, RC.cv.width, RC.cv.height);
      ctx.setTransform(tr);
      try {
        drawNodeDash();
      } finally {
        ctx = real;
      }
      RC.L = L;
      RC.key = key;
      RC.v = { x: V.x, y: V.y, k: V.k };
    };
    const moving = same && !sameView && RC.v && performance.now() - (RC.full || 0) > 0 && !window.__noRoadCache;
    if (moving) {
      clearTimeout(RC.tm);
      RC.tm = setTimeout(() => {
        RC.full = performance.now();
        RC.v = null;
        render();
      }, 150);
    } else if (!sameView) full();
    const s = moving ? V.k / RC.v.k : 1,
      dx = moving ? DPR * ((W / 2) * (1 - s) + (RC.v.x - V.x) * V.k) : 0,
      dy = moving ? DPR * ((H / 2) * (1 - s) + (RC.v.y - V.y) * V.k) : 0;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = al;
    ctx.drawImage(RC.cv, dx, dy, RC.cv.width * s, RC.cv.height * s);
    ctx.restore();
  } catch (er) {
    console.warn('nodeDash', er);
  }
  // niezaimportowane drogi OSM (szare, przerywane)
  const have = new Set(D.road.map((r) => r.osm));
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(80,90,100,.6)';
  for (const o of S.osm.ways.values())
    if (!have.has(o.id) && o.g.length > 1 && OKHW.has((o.t.highway || '').replace('_link', ''))) {
      pathOf(ctx, o.g, false);
      ctx.stroke();
    }
  ctx.setLineDash([]);
  if ($('cAx').checked) {
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    D.road.forEach((r, i) => {
      const c = HW_COL[(r.hw || '').replace('_link', '')] || '#6a7f94',
        isSel = i === S.sel;
      pathOf(ctx, r.pts, false);
      ctx.strokeStyle = isSel ? '#ffd23f' : c;
      /* os OSM: prosta lamana, bez wygladzania */ ctx.lineWidth = isSel ? 3 : 1.8;
      ctx.stroke();
      if (k > 6 || isSel)
        r.pts.forEach((p, vi) => {
          const s = w2s(p);
          if (s[0] < -10 || s[1] < -10 || s[0] > W + 10 || s[1] > H + 10) return;
          ctx.beginPath();
          ctx.arc(s[0], s[1], isSel ? (vi === S.vsel ? 7 : 5) : r.nk[vi] ? 3.5 : 2.5, 0, 7);
          ctx.fillStyle = isSel ? (vi === S.vsel ? '#ff5a36' : '#ffd23f') : '#fff';
          ctx.fill();
          ctx.strokeStyle = c;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        });
      if (r.rp) {
        ctx.strokeStyle = 'rgba(0,200,255,.9)';
        ctx.lineWidth = 1;
        r.pts.forEach((q, j) => {
          const a = w2s(q),
            b = w2s(r.rp[j]);
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        });
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.6;
        pathOf(ctx, smoothDense(r.rp, 3), false);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (S.tool === 'rend') {
        gp(r).forEach((q, vi) => {
          const s = w2s(q);
          if (s[0] < -10 || s[1] < -10 || s[0] > W + 10 || s[1] > H + 10) return;
          ctx.fillStyle = vi === S.vsel && isSel ? '#ff5a36' : '#00c8ff';
          ctx.fillRect(s[0] - 4, s[1] - 4, 8, 8);
          ctx.strokeStyle = '#003';
          ctx.lineWidth = 1;
          ctx.strokeRect(s[0] - 4, s[1] - 4, 8, 8);
        });
      }
      if (isSel && S.tool === 'rend') {
        const G = gp(r);
        for (let vi = 0; vi < G.length - 1; vi++) {
          const m = w2s([(G[vi][0] + G[vi + 1][0]) / 2, (G[vi][1] + G[vi + 1][1]) / 2]);
          ctx.beginPath();
          ctx.arc(m[0], m[1], 4, 0, 7);
          ctx.fillStyle = 'rgba(255,255,255,.8)';
          ctx.fill();
          ctx.strokeStyle = '#333';
          ctx.stroke();
        }
      }
      if (isSel && S.tool !== 'rend')
        for (let vi = 0; vi < r.pts.length - 1; vi++) {
          const a = r.pts[vi],
            b = r.pts[vi + 1],
            m = w2s([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
          ctx.beginPath();
          ctx.arc(m[0], m[1], 4, 0, 7);
          ctx.fillStyle = 'rgba(255,255,255,.75)';
          ctx.fill();
          ctx.strokeStyle = '#333';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      if (isSel || k > 9) {
        const mid = w2s(r.pts[Math.floor(r.pts.length / 2)]);
        if (mid[0] > 0 && mid[0] < W && mid[1] > 0 && mid[1] < H) {
          const label = [r.name, r.hw, r.lanes + ' pasy'].filter(Boolean).join(' · ');
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(255,255,255,.85)';
          ctx.strokeText(label, mid[0], mid[1] - 6);
          ctx.fillStyle = c;
          ctx.fillText(label, mid[0], mid[1] - 6);
        }
      }
    });
    ctx.textAlign = 'start';
  }
  if (S.tool === 'sel' && !EMBED && $('cAn').checked)
    for (const z of PZI) {
      const q = w2s(z.p);
      if (q[0] < -20 || q[1] < -20 || q[0] > W + 20 || q[1] > H + 20) continue;
      const cl = ['#1f9a4c', '#e08a00', '#d22'][z.lvl];
      ctx.beginPath();
      ctx.arc(q[0], q[1], z.lvl ? 12 : 9, 0, 7);
      ctx.fillStyle = ['rgba(30,160,80,.25)', 'rgba(240,150,0,.30)', 'rgba(220,40,40,.30)'][z.lvl];
      ctx.fill();
      ctx.strokeStyle = cl;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      if (k > 1.2 && z.F && !(PZ.sel && dist(PZ.sel.node, z.p) < 1)) pzDrawArcs(z.F, false);
    } /* znaczniki presetu zjazdu: stuknij = okienko presetu */
  if (PZ.live) {
    const z = PZ.live,
      a = w2s(z.node),
      b = w2s(z.w);
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = z.snap ? '#1f9a4c' : '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } /* kat na zywo przy przeciaganiu */
  if ($('cAn').checked && PZ.sel && S.tool === 'sel') pzDrawArcs(pzDetect(PZ.sel.node), true);
  if (FORK_MARKS)
    for (const f of S.forks3 || []) {
      const q = w2s(f);
      ctx.beginPath();
      ctx.arc(q[0], q[1], 18, 0, 7);
      ctx.fillStyle = 'rgba(30,120,255,.22)';
      ctx.fill();
      ctx.strokeStyle = '#1e78ff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.font = 'bold 11px system-u';
      ctx.fillStyle = '#1e78ff';
      ctx.textAlign = 'center';
      ctx.fillText('3→2+1', q[0], q[1] - 24);
      ctx.textAlign = 'start';
    }
  if (FORK_MARKS)
    for (const f of S.forks || []) {
      const q = w2s(f);
      ctx.beginPath();
      ctx.arc(q[0], q[1], 18, 0, 7);
      ctx.fillStyle = 'rgba(255,140,0,.22)';
      ctx.fill();
      ctx.strokeStyle = '#ff8c00';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.font = 'bold 11px system-ui';
      ctx.fillStyle = '#b85c00';
      ctx.textAlign = 'center';
      ctx.fillText('2→1+1', q[0], q[1] - 22);
      ctx.textAlign = 'start';
    }
  if (S.joinMode) {
    /* tryb laczenia koncow ukladow Sandboxa */
    S.doc.road.forEach((r) => {
      if (!r.sb) return;
      [0, r.pts.length - 1].forEach((j) => {
        const q = w2s(r.pts[j]);
        ctx.beginPath();
        ctx.arc(q[0], q[1], 6, 0, 7);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#2a7de1';
        ctx.stroke();
      });
    });
    for (const [pt, col] of [
      [S.joinHov, '#ffb400'],
      [S.joinPick && S.doc.road[S.joinPick.i] && S.doc.road[S.joinPick.i].pts[S.joinPick.j], '#2ecc40'],
    ])
      if (pt) {
        const q = w2s(pt);
        ctx.beginPath();
        ctx.arc(q[0], q[1], 11, 0, 7);
        ctx.fillStyle = col + '55';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = col;
        ctx.stroke();
      }
  }
  if (S.draw) {
    S.doc.road.forEach((r) =>
      r.pts.forEach((p) => {
        const s = w2s(p);
        ctx.beginPath();
        ctx.arc(s[0], s[1], 3.5, 0, 7);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#2a7de1';
        ctx.stroke();
      }),
    );
    if (S.hov) {
      const s = w2s(S.hov);
      ctx.beginPath();
      ctx.arc(s[0], s[1], 9, 0, 7);
      ctx.fillStyle = 'rgba(255,200,0,.35)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffb400';
      ctx.stroke();
    }
    const P = S.draw.pts;
    if (P.length && S.cur) {
      const a = w2s(P[P.length - 1]),
        b = w2s(S.hov || S.cur);
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.strokeStyle = '#ff5a36';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    if (P.length) {
      pathOf(ctx, P, false);
      ctx.strokeStyle = '#ff5a36';
      ctx.lineWidth = 2;
      ctx.stroke();
      P.forEach((p) => {
        const s = w2s(p);
        ctx.beginPath();
        ctx.arc(s[0], s[1], 5, 0, 7);
        ctx.fillStyle = '#ff5a36';
        ctx.fill();
      });
    }
  }
  if (DUP.length) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const d of DUP) {
      const P = d.P.map(w2s);
      ctx.beginPath();
      P.forEach((q, k) => (k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.strokeStyle = 'rgba(255,0,60,.35)';
      ctx.lineWidth = 12;
      ctx.stroke();
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = '#ff003c';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.setLineDash([]);
      const m = P[Math.floor(P.length / 2)];
      ctx.font = '600 11px system-ui,sans-serif';
      const tx = 'duplikat';
      const w = ctx.measureText(tx).width + 10;
      ctx.fillStyle = '#ff003c';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(m[0] + 8, m[1] - 22, w, 16, 4) : ctx.rect(m[0] + 8, m[1] - 22, w, 16);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(tx, m[0] + 13, m[1] - 10);
    }
    ctx.restore();
  }
  drawMeas();
  drawScale();
}
function drawScale() {
  const k = S.view.k,
    bar = k > 40 ? 1 : k > 8 ? 5 : k > 2 ? 20 : k > 0.3 ? 100 : k > 0.08 ? 500 : 2000;
  ctx.fillStyle = '#222';
  ctx.fillRect(12, H - 16, bar * k, 3);
  ctx.font = '11px system-ui';
  ctx.fillText(bar >= 1000 ? bar / 1000 + ' km' : bar + ' m', 12, H - 22);
}
/* Node Controller: reczny promien rogow skrzyzowania T (suwak po zaznaczeniu wezla), zapis w localStorage */
try {
  S.nodeR = JSON.parse(localStorage.getItem('edNodeR') || '{}') || {};
} catch (e) {
  S.nodeR = {};
}
try {
  S.nodeP = JSON.parse(localStorage.getItem('edNodeP') || '{}') || {};
} catch (e) {
  S.nodeP = {};
}
try {
  S.nodeW = JSON.parse(localStorage.getItem('edNodeW') || '{}') || {};
} catch (e) {
  S.nodeW = {};
}
function drawMeas() {
  /* miarka: punkty klikniete narzedziem Miarka, dlugosc odcinkow i suma */
  const M = S.meas;
  if (!M || !M.length || S.tool !== 'meas') return;
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#ff6d00';
  ctx.setLineDash([]);
  ctx.beginPath();
  M.forEach((q, i) => {
    const w = w2s(q);
    i ? ctx.lineTo(w[0], w[1]) : ctx.moveTo(w[0], w[1]);
  });
  ctx.stroke();
  let tot = 0;
  ctx.font = 'bold 12px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const lab = (t, x, y) => {
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.strokeText(t, x, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(t, x, y);
  };
  for (let i = 1; i < M.length; i++) {
    const d = dist(M[i - 1], M[i]);
    tot += d;
    if (M.length > 2) {
      const a = w2s(M[i - 1]),
        b = w2s(M[i]);
      lab(d.toFixed(2) + ' m', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 4);
    }
  }
  M.forEach((q) => {
    const w = w2s(q);
    ctx.beginPath();
    ctx.arc(w[0], w[1], 4.5, 0, 7);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ff6d00';
    ctx.stroke();
  });
  if (M.length > 1) {
    const e = w2s(M[M.length - 1]);
    ctx.textAlign = 'left';
    lab((M.length > 2 ? 'suma ' : '') + tot.toFixed(2) + ' m', e[0] + 9, e[1] - 6);
  }
  ctx.restore();
}
function updLw() {
  /* Node Controller: szerokosc pasa wybranej drogi (suwak przy dolnej krawedzi) */
  let bar = document.getElementById('lwbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'lwbar';
    bar.style.cssText =
      'position:fixed;left:10px;bottom:84px;z-index:30;background:rgba(30,34,40,.92);color:#fff;font:12px system-ui,sans-serif;padding:7px 10px;border-radius:8px;display:none;align-items:center;gap:8px';
    bar.innerHTML =
      'Szerokość pasa <input type="range" id="lwv" min="2" max="5" step="0.05" style="width:140px"> <b id="lwt" style="min-width:52px;display:inline-block"></b>';
    document.body.appendChild(bar);
    bar.querySelector('#lwv').oninput = (e) => {
      const r = S.doc.road[S.sel];
      if (!r) return;
      if (!bar.dataset.pushed) {
        try {
          push();
        } catch (x) {}
        bar.dataset.pushed = '1';
      }
      const nv = +(+e.target.value).toFixed(2);
      r.lw = nv;
      if (r.osm)
        S.doc.road.forEach((q) => {
          if (q !== r && q.osm === r.osm) q.lw = nv;
        });
      /* cala droga OSM (wszystkie jej odcinki) */ try {
        save();
      } catch (x) {}
      touch();
    };
    bar.querySelector('#lwv').onchange = () => {
      delete bar.dataset.pushed;
    };
  }
  const r = S.doc && S.doc.road && S.doc.road[S.sel];
  bar.style.display = r ? 'flex' : 'none';
  if (!r) {
    bar.dataset.i = '';
    return;
  }
  const key = S.sel + '|' + r.lw;
  if (bar.dataset.i !== key) {
    bar.dataset.i = key;
    bar.querySelector('#lwv').value = r.lw || 3.5;
    bar.querySelector('#lwt').textContent = (r.lw || 3.5).toFixed(2) + ' m × ' + r.lanes;
  }
}
function updNr() {
  let bar = document.getElementById('nrbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'nrbar';
    bar.style.cssText =
      'position:fixed;left:10px;bottom:70px;z-index:30;background:rgba(30,34,40,.92);color:#fff;font:12px system-ui,sans-serif;padding:7px 10px;border-radius:8px;display:none;align-items:center;gap:8px';
    bar.style.flexWrap = 'wrap';
    bar.style.maxWidth = '340px';
    bar.innerHTML =
      'Promień rogów <input type="range" id="nrv" min="0" max="8" step="0.5" style="width:120px"> <b id="nrt" style="min-width:42px;display:inline-block"></b> <button id="nra" style="font:inherit;padding:2px 6px">auto</button><div style="flex-basis:100%;border-top:1px solid #fff4;padding-top:5px">Przejście pasów: długość <input type="range" id="npT" min="3" max="60" step="1" style="width:90px"> <b id="npTt"></b><br>początek <input type="range" id="npS" min="0" max="0.7" step="0.05" style="width:90px"> <b id="npSt"></b> <label><input type="checkbox" id="npA"> pełna do węzła</label> <button id="npR" style="font:inherit;padding:2px 6px">auto</button></div>';
    document.body.appendChild(bar);
    const saveP = () => {
        try {
          localStorage.setItem('edNodeP', JSON.stringify(S.nodeP));
        } catch (e) {}
      },
      setP = (f, v) => {
        if (!bar.dataset.k) return;
        const P = (S.nodeP[bar.dataset.k] = S.nodeP[bar.dataset.k] || {});
        P[f] = v;
        saveP();
        touch();
      };
    bar.querySelector('#npT').oninput = (e) => setP('T', +e.target.value);
    bar.querySelector('#npS').oninput = (e) => setP('s', +e.target.value);
    bar.querySelector('#npA').onchange = (e) => setP('af', e.target.checked ? 1 : 0);
    bar.querySelector('#npR').onclick = () => {
      if (bar.dataset.k) {
        delete S.nodeP[bar.dataset.k];
        saveP();
        touch();
      }
    };
    const save = () => {
      try {
        localStorage.setItem('edNodeR', JSON.stringify(S.nodeR));
      } catch (e) {}
    };
    bar.querySelector('#nrv').oninput = (e) => {
      if (bar.dataset.k) {
        S.nodeR[bar.dataset.k] = +e.target.value;
        save();
        touch();
      }
    };
    bar.querySelector('#nra').onclick = () => {
      if (bar.dataset.k) {
        delete S.nodeR[bar.dataset.k];
        save();
        touch();
      }
    };
  }
  const r = S.doc && S.doc.road && S.doc.road[S.sel],
    k = r && S.vsel >= 0 ? r.nk[S.vsel] : null;
  let show = false;
  if (k) {
    let deg = 0;
    for (const q of S.doc.road) if (q.nk.includes(k)) deg++;
    show = deg >= 2;
  }
  bar.style.display = show ? 'flex' : 'none';
  if (!show) {
    bar.dataset.k = '';
    return;
  }
  {
    const P = S.nodeP[k] || {};
    bar.querySelector('#npT').value = P.T || 35;
    bar.querySelector('#npTt').textContent = P.T ? P.T + ' m' : 'auto';
    bar.querySelector('#npS').value = P.s != null ? P.s : 0.3;
    bar.querySelector('#npSt').textContent = P.s != null ? P.s : 'auto';
    bar.querySelector('#npA').checked = !!P.af;
  }
  const v = S.nodeR[k],
    cur = v != null ? v : 3.5;
  if (bar.dataset.k !== k || bar.dataset.v !== String(v)) {
    bar.dataset.k = k;
    bar.dataset.v = String(v);
    bar.querySelector('#nrv').value = cur;
    bar.querySelector('#nrt').textContent = v != null ? cur + ' m' : 'auto';
  }
}
function touch() {
  S.dirty = true;
  render();
}
function say(t) {
  $('st').textContent = t;
}
function resize() {
  const r = $('stage').getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  W = r.width;
  H = r.height;
  for (const c of [cv, off]) {
    c.width = Math.round(W * DPR);
    c.height = Math.round(H * DPR);
  }
  render();
}
