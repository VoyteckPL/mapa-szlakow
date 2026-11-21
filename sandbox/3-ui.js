'use strict';
// ---------- stan ----------
const snap = () => JSON.stringify(S.doc);
function push() {
  S.undo.push(snap());
  if (S.undo.length > 60) S.undo.shift();
  S.redo = [];
}
function restore(s) {
  S.doc = JSON.parse(s);
  S.sel = -1;
  S.vsel = -1;
  save();
  ui();
  touch();
}
function curHash() {
  try {
    const c = unproj(s2w([W / 2, H / 2])),
      z = Math.log2(156543.03 * Math.cos((c.lat * Math.PI) / 180) * S.view.k);
    return `#map=${z.toFixed(2)}/${c.lat.toFixed(6)}/${c.lon.toFixed(6)}`;
  } catch (e) {
    return '';
  }
}
function saveEmb() {
  // tryb edycji w piaskownicy: zapamietuje tylko zmienione osie (lon/lat) pod kluczem przypadku
  try {
    const ll = (q) => {
        const u = unproj(q);
        return [+u.lon.toFixed(7), +u.lat.toFixed(7)];
      },
      ok = (r) => r.osm + '|' + r.nk[0] + '|' + r.nk[r.nk.length - 1];
    const roads = S.doc.road
      .filter((r) => r.rp || (S.orig && S.orig.get(ok(r)) !== JSON.stringify(r.pts)))
      .map((r) => ({ osm: r.osm, nk: r.nk, pts: r.pts.map(ll), rp: r.rp ? r.rp.map(ll) : null }));
    if (roads.length) localStorage.setItem(EKEY, JSON.stringify({ v: 2, roads }));
    else localStorage.removeItem(EKEY);
  } catch (e) {}
}
function applyEmb() {
  try {
    const j = JSON.parse(localStorage.getItem(EKEY) || 'null');
    if (!j) return;
    const pr = (c) => proj(c[0], c[1]);
    for (const o of j.roads) {
      const r = S.doc.road.find(
        (x) => x.osm === o.osm && x.nk[0] === o.nk[0] && x.nk[x.nk.length - 1] === o.nk[o.nk.length - 1],
      );
      if (r) {
        r.pts = o.pts.map(pr);
        r.nk = o.nk.slice();
        if (o.rp) r.rp = o.rp.map(pr);
      }
    }
    touch();
  } catch (e) {}
}
function save() {
  if (EMBED) {
    if (EDIT) saveEmb();
    return;
  }
  const h = curHash();
  try {
    if (h) history.replaceState(null, '', h);
  } catch (e) {}
  try {
    localStorage.setItem(KEY, JSON.stringify({ doc: S.doc, view: S.view, org: S.org, h }));
  } catch (e) {}
} // zapamietuje biezaca lokacje (tez w adresie), by odswiezenie nie wracalo do pierwotnej
$('bUndo').onclick = () => {
  if (S.undo.length) {
    S.redo.push(snap());
    restore(S.undo.pop());
  }
};
$('bRedo').onclick = () => {
  if (S.redo.length) {
    S.undo.push(snap());
    restore(S.redo.pop());
  }
};
function moveNode(r, vi, x, y) {
  const k = r.nk[vi];
  const mv = (o, j) => {
    const dx = x - o.pts[j][0],
      dy = y - o.pts[j][1];
    o.pts[j] = [x, y];
    if (o.rp && o.rp[j]) o.rp[j] = [o.rp[j][0] + dx, o.rp[j][1] + dy];
  };
  mv(r, vi);
  if (k)
    for (const o of S.doc.road)
      o.nk.forEach((kk, j) => {
        if (kk === k && !(o === r && j === vi)) mv(o, j);
      });
}

// ---------- UI ----------
function setTool(t) {
  LANE_ON = false;
  hideLanePal();
  S.tool = t;
  S.draw = t === 'road' ? { pts: [], nk: [] } : null;
  if (t !== 'sel') {
    S.vsel = -1;
  }
  ui();
  render();
}
function ui() {
  $('tools').innerHTML = TOOLS.map(
    ([k, n]) => `<button data-t="${k}" class="${S.tool === k ? 'on' : ''}">${n}</button>`,
  ).join('');
  $('tools')
    .querySelectorAll('button')
    .forEach((b) => (b.onclick = () => setTool(b.dataset.t)));
  $('drawbar').style.display = S.draw ? 'flex' : 'none';
  $('hint').textContent = {
    sel: 'Przeciągnij punkt osi drogi – pasy i chevrony przeliczają się na żywo. Wspólne węzły ruszają razem. Dotknij drogi, by ją zaznaczyć (parametry w panelu).',
    pan: 'Przeciągaj, by przesuwać widok; dwa palce lub kółko zoomują.',
    addpt: 'Dodaj punkt: kliknij na osi drogi w miejscu nowego punktu (potem przeciągniesz go narzędziem Zaznacz).',
    split:
      'Rozdziel drogę: kliknij drogę w miejscu podziału (droga OSM dzieli się w najbliższym punkcie, własna w klikniętym miejscu).',
    rend: 'Przesuń render: przeciągaj błękitne punkty, by przesunąć samą wygenerowaną warstwę (oś OSM zostaje, różnica widoczna jako cienkie łączniki). Biały punkt na odcinku dodaje punkt.',
    osm: 'Dotknij szarej linii OSM, by dodać tę drogę.',
    road: 'Dotykaj kolejne punkty osi drogi; punkt blisko istniejącego węzła się z nim łączy. Potem „Zakończ”.',
  }[S.tool];
  props();
}
function numRow(label, val, fn, step = 1, live) {
  const id = 'n' + Math.random().toString(36).slice(2, 7);
  setTimeout(() => {
    const el = $(id);
    if (el) {
      el.onchange = () => fn(parseFloat(el.value));
      if (live)
        el.oninput = () => {
          const v = parseFloat(el.value);
          if (v > 0) live(v);
        };
    }
  });
  return `<label>${label}<input type="number" id="${id}" value="${val}" step="${step}"></label>`;
}
const TAGK = [
  ['lanes', 'lanes – liczba pasów'],
  ['lanes:forward', 'lanes:forward'],
  ['lanes:backward', 'lanes:backward'],
  ['oneway', 'oneway (yes/no/-1)'],
  ['turn:lanes', 'turn:lanes (np. left|through|through;right)'],
  ['turn:lanes:forward', 'turn:lanes:forward'],
  ['turn:lanes:backward', 'turn:lanes:backward'],
  ['width', 'width [m]'],
  ['lane_markings', 'lane_markings (yes/no)'],
  ['maxspeed', 'maxspeed'],
];
const osmWay = (id) => S.osm.ways.get(id) || [...S.osm.ways.values()].find((o) => o.id === id);
const baseTags = (r) => (osmWay(r.osm) || { t: {} }).t;
function effTags(r) {
  const t = { ...baseTags(r) };
  for (const [k, v] of Object.entries(r.tg || {})) {
    if (v === null || v === '') delete t[k];
    else t[k] = v;
  }
  return t;
}
function applyTags(r) {
  const w = osmWay(r.osm);
  if (!w) return;
  const m = makeRoad({ ...w, t: effTags(r) }, 0, w.g.length - 1);
  for (const k of ['lanes', 'lw', 'oneway', 'marked', 'edge', 'tl', 'tlb', 'nf']) {
    if (k === 'lw' && r.lwM) continue;
    r[k] = m[k];
  }
} /* szerokosc ustawiona recznie (suwak) zostaje */
let LSEL = { r: 0, i: 0 },
  LAN = null,
  LP = null,
  LANE_ON = false;
const laneOn = () => LANE_ON && LP && LP.sel === S.sel;
const laneAbs = (r) =>
  r.oneway ? LSEL.i : LSEL.r === 0 ? r.lanes - (r.nf || 1) + LSEL.i : r.lanes - (r.nf || 1) - 1 - LSEL.i; // bezwzgledny indeks pasa od lewej
function ensureLaneAxis(ri, g) {
  // testowa, edytowalna os pasa: poczatkowo srodek pasa wg faktycznej geometrii, co ok. 10 m
  const r = S.doc.road[ri],
    G = laneGeom(ri);
  if (!r || !G) return;
  r.la = r.la || {};
  if (r.la[g]) return;
  const C = offsetPts(
      G.Q,
      G.Q.map((_, j) => (lb(G, g, j) + lb(G, g + 1, j)) / 2),
    ),
    cum = cumOf(C),
    L = cum[cum.length - 1],
    n = Math.max(4, Math.min(16, Math.round(L / 10))),
    out = [];
  for (let k = 0; k <= n; k++) out.push(atS(C, cum, (L * k) / n).slice());
  r.la[g] = out;
}
const TURN = [
  ['left', '←', 'w lewo'],
  ['through', '↑', 'prosto'],
  ['right', '→', 'w prawo'],
  ['reverse', '↶', 'zawróć'],
  ['merge_to_left', '⇖', 'zlewa się w lewo'],
  ['merge_to_right', '⇗', 'zlewa się w prawo'],
];
function laneEditor(r, mut, bind) {
  // wizualny edytor pasów: kafelki pasów + przyciski strzałek/liczby pasów (zapisuje tagi lanes*, turn:lanes*)
  const et = effTags(r),
    nbk = parseInt(et['lanes:backward'], 10) || 0,
    nfw = parseInt(et['lanes:forward'], 10) || 0;
  const rows = r.oneway
    ? [
        {
          key: 'turn:lanes',
          cnt: 'lanes',
          n: Math.max(1, r.lanes | 0),
          lab: 'Pasy w kierunku jazdy (od lewej do prawej)',
        },
      ]
    : [
        {
          key: 'turn:lanes:forward',
          cnt: 'lanes:forward',
          n: nfw || r.nf || Math.max(1, Math.round(r.lanes / 2)),
          lab: 'Kierunek zgodny z rysowaniem (od lewej do prawej)',
        },
        {
          key: 'turn:lanes:backward',
          cnt: 'lanes:backward',
          n: nbk || Math.max(1, r.lanes - (r.nf || 1)),
          lab: 'Kierunek przeciwny',
        },
      ];
  rows.forEach((rw0) => {
    const t = (et[rw0.key] || '').split('|');
    rw0.tok = Array.from({ length: rw0.n }, (_, i) => (t.length === rw0.n ? t[i] : ''));
  });
  if (LSEL.r >= rows.length) LSEL.r = 0;
  const cur = rows[LSEL.r];
  if (LSEL.i >= cur.n) LSEL.i = cur.n - 1;
  const setTag = (k, v) => {
    r.tg = r.tg || {};
    const b = baseTags(r)[k] || '';
    if ((v === null ? '' : v) === b) delete r.tg[k];
    else r.tg[k] = v;
  };
  const commit = (row) => {
    const any = row.tok.some((x) => x);
    setTag(row.key, any ? row.tok.join('|') : null);
    setTag(row.cnt, String(row.tok.length));
    if (!r.oneway) {
      const o = rows.find((x) => x !== row);
      setTag('lanes', String(row.tok.length + o.tok.length));
    }
    if (!Object.keys(r.tg).length) delete r.tg;
    applyTags(r);
  };
  const sym = (tk) => {
    const set = tk ? tk.split(';').filter((x) => x && x !== 'none') : [];
    return (
      set.map((x) => (TURN.find((t) => t[0] === x.replace(/^(slight|sharp)_/, '')) || ['', '?'])[1]).join('') || '·'
    );
  };
  let h = '<h4 style="margin:10px 0 4px">Pasy ruchu</h4>';
  rows.forEach((row, ri) => {
    h +=
      `<div class="small">${row.lab}</div><div class="row" style="gap:4px">` +
      row.tok
        .map(
          (tk, i) =>
            `<button class="lnb" data-r="${ri}" data-i="${i}" style="min-width:44px;height:44px;font-size:18px;${ri === LSEL.r && i === LSEL.i ? 'background:#2f6fae;color:#fff;border-color:#2f6fae' : ''}" title="pas ${i + 1}">${sym(tk)}</button>`,
        )
        .join('') +
      `<button class="lnp" data-r="${ri}" title="dodaj pas po prawej">＋</button><button class="lnm" data-r="${ri}" title="usuń zaznaczony pas">−</button></div>`;
  });
  h +=
    `<div class="small">Strzałki zaznaczonego pasa (pas ${LSEL.i + 1}):</div><div class="row" style="gap:4px">` +
    TURN.map(([k, ch, lab]) => {
      const on = (cur.tok[LSEL.i] || '').split(';').includes(k);
      return `<button class="lnt" data-k="${k}" title="${lab}" style="min-width:40px;height:36px;font-size:17px;${on ? 'background:#2f6fae;color:#fff;border-color:#2f6fae' : ''}">${ch}</button>`;
    }).join('') +
    '<button class="lnt" data-k="" title="bez strzałki">∅</button></div><div class="small">Kafelek = pas; kliknij pas, potem strzałkę (można kilka). ＋/− zmienia liczbę pasów.</div>';
  const act = {
    toggle: (k) =>
      mut(() => {
        let set = (cur.tok[LSEL.i] || '').split(';').filter((x) => x && x !== 'none');
        if (!k) set = [];
        else if (set.includes(k)) set = set.filter((x) => x !== k);
        else set.push(k);
        cur.tok[LSEL.i] = set.join(';');
        commit(cur);
      }),
    add: (ri) =>
      mut(() => {
        const row = rows[ri];
        row.tok.push('');
        LSEL = { r: ri, i: row.tok.length - 1 };
        commit(row);
      }),
    del: (ri) =>
      mut(() => {
        const row = rows[ri];
        if (row.tok.length < 2) return;
        const i = ri === LSEL.r ? LSEL.i : row.tok.length - 1;
        row.tok.splice(i, 1);
        LSEL.i = Math.max(0, i - 1);
        commit(row);
      }),
  };
  LAN = { cur, idx: LSEL.i, ri: LSEL.r, act };
  bind.push(() => {
    document.querySelectorAll('.lnb').forEach(
      (b) =>
        (b.onclick = () => {
          LSEL = { r: +b.dataset.r, i: +b.dataset.i };
          props();
        }),
    );
    document.querySelectorAll('.lnt').forEach((b) => (b.onclick = () => act.toggle(b.dataset.k)));
    document.querySelectorAll('.lnp').forEach((b) => (b.onclick = () => act.add(+b.dataset.r)));
    document.querySelectorAll('.lnm').forEach((b) => (b.onclick = () => act.del(+b.dataset.r)));
  });
  return h;
}
const lb = (G, q, j) =>
  G.bd
    ? G.bd[q][j]
    : G.left[j] +
      q *
        G.lw[j]; /* granica pasa q (0 = lewa krawedz) w punkcie j; z klinem nowego pasa szerokosci pasow nie sa rowne */
function laneGeom(ri) {
  // faktyczna geometria renderu pasów drogi (z offsetem, zwężeniem, poszerzeniem): oś Q, lewa krawędź i szerokość pasa w każdym punkcie
  const c = S.CC && S.CC[ri],
    r = S.doc.road[ri];
  if (!c) return null;
  const NL = Math.max(1, r.lanes | 0),
    ex = c.e.some((v) => v > 0);
  const left = c.Q.map((_, j) => c.d[j] - c.w[j] / 2 - (ex && c.side < 0 ? c.e[j] : 0)),
    lw = c.Q.map((_, j) => (c.w[j] + c.e[j]) / NL);
  let bd = null;
  if ((c.shL || c.shR) && !ex && c.shL.length === c.Q.length) {
    /* klin przy zmianie liczby pasow: pasy ciagle maja nominalna szerokosc, zweza sie tylko skrajny pas po stronie, ktora weszla do srodka */
    const lwN = r.lw || 3.75;
    bd = [];
    for (let q = 0; q <= NL; q++) bd.push([]);
    c.Q.forEach((_, j) => {
      const ws = Array(NL).fill(lwN);
      let a = Math.max(0, c.shL[j]),
        b = Math.max(0, c.shR[j]);
      for (let q = 0; q < NL && a > 0; q++) {
        const t = Math.min(ws[q], a);
        ws[q] -= t;
        a -= t;
      }
      for (let q = NL - 1; q >= 0 && b > 0; q--) {
        const t = Math.min(ws[q], b);
        ws[q] -= t;
        b -= t;
      }
      const sum = ws.reduce((x, y) => x + y, 0),
        res = (c.w[j] - sum) / NL;
      let x = left[j];
      bd[0].push(x);
      for (let q = 0; q < NL; q++) {
        x += ws[q] + res;
        bd[q + 1].push(x);
      }
    });
  }
  return { Q: c.Q, left, lw, NL, bd };
}
function laneAt(r, w, ri) {
  // który pas (wiersz/indeks kafelka) leży pod punktem w – wg faktycznie narysowanej geometrii
  const G = laneGeom(ri);
  if (!G) return { r: 0, i: 0 };
  let bd = 1e9,
    lat = 0,
    bj = 1,
    bp = [0, 0],
    bdir = [1, 0];
  for (let j = 1; j < G.Q.length; j++) {
    const a = G.Q[j - 1],
      b = G.Q[j],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      l = Math.hypot(dx, dy) || 1,
      t = Math.max(0, Math.min(1, ((w[0] - a[0]) * dx + (w[1] - a[1]) * dy) / (l * l))),
      px = a[0] + dx * t,
      py = a[1] + dy * t,
      d = Math.hypot(w[0] - px, w[1] - py);
    if (d < bd) {
      bd = d;
      lat = ((w[0] - px) * -dy + (w[1] - py) * dx) / l;
      bj = j;
      bp = [px, py];
      bdir = [dx / l, dy / l];
    }
  }
  const idx = Math.max(0, Math.min(G.NL - 1, Math.floor((lat - G.left[bj]) / G.lw[bj])));
  LP = { sel: ri, g: idx, p: bp, dir: bdir, j: bj, back: false };
  if (r.oneway) return { r: 0, i: idx };
  const nb = r.lanes - (r.nf || 1);
  LP.back = idx < nb;
  return idx >= nb ? { r: 0, i: idx - nb } : { r: 1, i: nb - 1 - idx };
}
function hideLanePal() {
  const e = document.getElementById('lpal');
  if (e) e.remove();
}
function showLanePal(x, y) {
  hideLanePal();
  if (!LAN) return;
  const set = (LAN.cur.tok[LAN.idx] || '').split(';'),
    d = document.createElement('div');
  d.id = 'lpal';
  d.style.cssText = `position:fixed;z-index:20;right:10px;top:10px;background:var(--pn);color:var(--tx);border:1px solid var(--bd);border-radius:12px;padding:8px;box-shadow:0 6px 24px rgba(0,0,0,.35);width:240px`;
  d.innerHTML =
    `<div style="font-size:12px;margin-bottom:6px"><b>Pas ${LAN.idx + 1}</b> <span style="opacity:.7">${(S.doc.road[S.sel] && (S.doc.road[S.sel].name || S.doc.road[S.sel].hw)) || ''} · ${LAN.cur.tok.length} pas(y) w tym kierunku</span><br>strzałki pasa (można kilka):</div><div style="display:flex;flex-wrap:wrap;gap:5px">` +
    TURN.map(
      ([k, ch, lab]) =>
        `<button data-k="${k}" title="${lab}" style="width:48px;height:44px;font-size:20px;border-radius:10px;border:1px solid var(--bd);${set.includes(k) ? 'background:#2f6fae;color:#fff' : 'background:var(--bg)'};color:${set.includes(k) ? '#fff' : 'var(--tx)'}">${ch}</button>`,
    ).join('') +
    `<button data-k="" title="bez strzałki" style="width:48px;height:44px;font-size:18px;border-radius:10px;border:1px solid var(--bd);background:var(--bg);color:var(--tx)">∅</button><button data-a="add" title="dodaj pas po prawej" style="width:48px;height:44px;font-size:20px;border-radius:10px;border:1px solid var(--bd);background:var(--bg);color:var(--tx)">＋</button><button data-a="del" title="usuń ten pas" style="width:48px;height:44px;font-size:20px;border-radius:10px;border:1px solid var(--bd);background:var(--bg);color:var(--tx)">−</button></div>`;
  {
    const rb = document.createElement('button');
    rb.textContent = 'Resetuj oś pasa';
    rb.style.cssText = 'margin-top:6px;width:100%';
    rb.title = 'Oś pasa (pomarańczowa): przeciągaj punkty, środek odcinka dodaje punkt';
    rb.onclick = () => {
      const r0 = S.doc.road[S.sel];
      if (r0 && r0.la) {
        push();
        delete r0.la[laneAbs(r0)];
        ensureLaneAxis(S.sel, laneAbs(r0));
        save();
        render();
      }
    };
    d.appendChild(rb);
    const nt = document.createElement('div');
    nt.className = 'small';
    nt.style.marginTop = '4px';
    nt.textContent = 'Pomarańczowa oś pasa: przeciągaj punkty, kliknij kropkę na środku odcinka, by dodać punkt.';
    d.appendChild(nt);
  }
  document.body.appendChild(d);
  d.onpointerdown = (e) => e.stopPropagation();
  d.querySelectorAll('button').forEach(
    (b) =>
      (b.onclick = () => {
        const ri = LAN.ri;
        if (b.dataset.a === 'add') LAN.act.add(ri);
        else if (b.dataset.a === 'del') LAN.act.del(ri);
        else LAN.act.toggle(b.dataset.k);
        showLanePal(x, y);
      }),
  );
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideLanePal();
  if (
    (e.key === 'Delete' || e.key === 'Backspace') &&
    S.vsel >= 0 &&
    S.sel >= 0 &&
    !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)
  ) {
    const b = $('bDelV');
    if (b) {
      e.preventDefault();
      b.click();
    }
  }
});
function forkJson(ri, vi) {
  // 3 drogi schodzace sie w wezle -> JSON w formacie piaskownicy (rozjazd-szkielet.html): wezel = [0,0], punkty od wezla w dal
  const r0 = S.doc.road[ri],
    node = r0.pts[vi],
    arms = [];
  S.doc.road.forEach((r, i) => {
    const n = r.pts.length;
    for (const [j, st] of [
      [0, true],
      [n - 1, false],
    ])
      if (dist(r.pts[j], node) < 0.4) {
        const P = (st ? r.pts : r.pts.slice().reverse())
          .slice(1)
          .map((q) => [+(q[0] - node[0]).toFixed(2), +(q[1] - node[1]).toFixed(2)]);
        if (P.length) arms.push({ i, st, l: r.lanes | 0, P });
      }
  });
  if (new Set(arms.map((a) => a.i)).size !== 3 || arms.length !== 3) return null;
  const U = arms.map((a) => {
      const q = a.P[Math.min(2, a.P.length - 1)],
        l = Math.hypot(q[0], q[1]) || 1;
      return [q[0] / l, q[1] / l];
    }),
    mx = Math.max(...arms.map((a) => a.l));
  let xi = 0,
    best = 9;
  U.forEach((u, a) => {
    const o = [0, 1, 2].filter((b) => b !== a),
      v = u[0] * (U[o[0]][0] + U[o[1]][0]) + u[1] * (U[o[0]][1] + U[o[1]][1]);
    if (v < best) {
      best = v;
      xi = a;
    }
  });
  if (arms.filter((a) => a.l === mx).length === 1) xi = arms.findIndex((a) => a.l === mx);
  const X = arms[xi],
    Y = arms.filter((_, a) => a !== xi),
    t = U[xi],
    cr = Y.map((a) => {
      const q = a.P[Math.min(2, a.P.length - 1)];
      return t[0] * q[1] - t[1] * q[0];
    }),
    li = cr[0] < cr[1] ? 0 : 1,
    A = Y[li],
    B = Y[1 - li];
  const Rx = S.doc.road[X.i],
    cx = S.CC && S.CC[X.i],
    xN =
      Rx._edge && X.l % 2 === 1 && cx
        ? +((X.st ? 1 : -1) * (cx.d0 || 0) + (X.l * (Rx.lw || 3.75)) / 2).toFixed(3)
        : null; /* offset osi z turn:lanes */
  const ll = unproj(node);
  const tkn = String(Rx.tl || '')
      .split('|')
      .filter(Boolean),
    nt =
      !X.st && tkn.length === X.l
        ? tkn.filter((v) => v.split(';').some((x) => x === 'through')).length
        : 0; /* ile pasow wjazdu jedzie prosto */
  return JSON.stringify({
    nt,
    xN,
    nX: X.l,
    lA: A.l,
    geo: { lat: +ll.lat.toFixed(7), lon: +ll.lon.toFixed(7) },
    P: { x: X.P, a: A.P, b: B.P },
  });
}
// ---------- presety geometrii zjazdow ----------
// Kierunek galezi wg silnikow nawigacji: G = GraphHopper (1. odcinek), V = Valhalla (punkt 24/21/15 m), O = OSRM (uproszczony model).
const PZ_R = Math.PI / 180,
  pzN = (a) => ((a + 540) % 360) - 180,
  pzB = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) / PZ_R;
function pzAt(P, d) {
  const c = cumOf(P);
  return atS(P, c, Math.min(d, c[c.length - 1]));
}
function pzDev(Q, a, b) {
  const L = dist(a, b) || 1;
  let m = 0;
  for (const q of Q) m = Math.max(m, Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / L);
  return m;
}
function pzEng(e, P, hw, lanes) {
  // punkt, z ktorego silnik bierze kierunek galezi P (P[0] = wezel)
  const base = (hw || '').replace('_link', ''),
    top = base === 'motorway' || base === 'trunk',
    mid = ['primary', 'secondary', 'tertiary'].includes(base);
  if (e === 'G') return P[1];
  if (e === 'V') return pzAt(P, top ? 24 : mid ? 21 : 15);
  const L =
      (base === 'motorway' || (/_link/.test(hw || '') && top) ? 2.5 : base === 'trunk' ? 2 : 1) * (lanes || 2) * 3.25,
    c = cumOf(P);
  if (dist(P[0], P[1]) > L + 10) return P[1];
  const look = 40 + L,
    end = pzAt(P, look);
  if (pzDev(P.filter((q, i) => c[i] <= look).concat([end]), P[0], end) < 1.625) return end;
  let k = 1;
  while (k + 1 < P.length && pzDev(P.slice(0, k + 2), P[0], P[k + 1]) < 0.8125) k++;
  if (c[k] >= L + 10) return pzAt(P, 5);
  const a = pzAt(P, 4),
    b = pzAt(P, 6);
  return [P[0][0] + (b[0] - a[0]) * 10, P[0][1] + (b[1] - a[1]) * 10];
}
const PZ_T = {
  G: (a) => (a < 11.5 ? 'prosto' : a < 46 ? 'lekko' : a < 103 ? 'skręt' : 'ostro'),
  V: (a) => (a <= 10.5 ? 'prosto' : a < 44.5 ? 'lekko' : a < 135.5 ? 'skręt' : 'ostro'),
  O: (a) => (a <= 20 ? 'prosto' : a <= 40 ? 'lekko' : a <= 120 ? 'skręt' : 'ostro'),
};
function pzWalk(ri, vi, dir) {
  // galaz od wezla w dal (do ~130 m), takze przez kolejne drogi polaczone koncami
  const r0 = S.doc.road[ri],
    refs = [{ ri, vi, dir }];
  let r = r0,
    j = vi,
    s = 0,
    g = 0;
  while (s < 130 && g++ < 400) {
    const nj = j + dir;
    if (nj < 0 || nj >= r.pts.length) {
      const e = r.pts[j],
        cand = [];
      S.doc.road.forEach((o, oi) => {
        if (o === r) return;
        const n = o.pts.length;
        if (dist(o.pts[0], e) < 0.4) cand.push([oi, 0, 1]);
        else if (dist(o.pts[n - 1], e) < 0.4) cand.push([oi, n - 1, -1]);
      });
      if (cand.length !== 1) break;
      [ri, j, dir] = cand[0];
      r = S.doc.road[ri];
      continue;
    }
    s += dist(r.pts[j], r.pts[nj]);
    j = nj;
    refs.push({ ri, vi: j, dir });
  }
  return {
    refs,
    P: refs.map((f) => S.doc.road[f.ri].pts[f.vi].slice()),
    hw: r0.hw || '',
    tl: r0.tl || '',
    lanes: r0.lanes | 0,
    into: r0.oneway && refs[0].dir === -1,
    ow: r0.oneway,
  };
}
function pzWhy(node) {
  // dlaczego to nie jest rozwidlenie 1 wjazd + 2 gałęzie
  const arms = [];
  S.doc.road.forEach((r, i) =>
    r.pts.forEach((p, j) => {
      if (dist(p, node) < 0.4) {
        if (j < r.pts.length - 1) arms.push(pzWalk(i, j, 1));
        if (j > 0) arms.push(pzWalk(i, j, -1));
      }
    }),
  );
  if (arms.length < 3) return 'schodzą się tylko ' + arms.length + ' odcinki (trzeba 3)';
  if (arms.length > 3) return 'schodzi się ' + arms.length + ' odcinków (trzeba 3) – rozdziel drogę w tym węźle';
  if (arms.some((a) => a.P.length < 2)) return 'za krótka gałąź';
  const into = arms.filter((a) => a.into).length;
  if (into > 1) return 'dwie gałęzie jednokierunkowe wjeżdżają w węzeł (kierunek oneway?)';
  return 'nie rozpoznano układu (1 wjazd + 2 gałęzie pod kątem do ~75°)';
}
function pzDetect(node) {
  // uklad w wezle: 1 wjazd + 2 galezie
  const arms = [];
  S.doc.road.forEach((r, i) =>
    r.pts.forEach((p, j) => {
      if (dist(p, node) < 0.4) {
        if (j < r.pts.length - 1) arms.push(pzWalk(i, j, 1));
        if (j > 0) arms.push(pzWalk(i, j, -1));
      }
    }),
  );
  if (arms.length !== 3 || arms.some((a) => a.P.length < 2)) return null;
  const merge =
    arms.filter((a) => a.into).length === 2 &&
    arms.filter((a) => a.ow && !a.into).length ===
      1; /* wlaczenie: 2 galezie wjezdzaja, 1 wyjezdza (lustro rozwidlenia) */
  let xi = merge ? arms.findIndex((a) => !a.into) : arms.findIndex((a) => a.into);
  if (!merge && (xi < 0 || arms.filter((a) => a.into).length > 1)) {
    const U = arms.map((a) => {
      const q = pzAt(a.P, 20);
      const l = dist(q, node) || 1;
      return [(q[0] - node[0]) / l, (q[1] - node[1]) / l];
    });
    let best = 9;
    U.forEach((u, a) => {
      const o = [0, 1, 2].filter((b) => b !== a),
        v = u[0] * (U[o[0]][0] + U[o[1]][0]) + u[1] * (U[o[0]][1] + U[o[1]][1]);
      if (v < best) {
        best = v;
        xi = a;
      }
    });
  }
  const X = arms[xi],
    Y = arms.filter((_, a) => a !== xi);
  if (!merge && Y.some((a) => a.ow && a.into)) return null;
  const din = pzB(pzAt(X.P, 40), node),
    ang = (a) => pzN(pzB(node, pzAt(a.P, 25)) - din);
  const lk = Y.map((a) => /_link/.test(a.hw)),
    rk = Y.map((a) => RANK[(a.hw || '').replace('_link', '')] || 1),
    base = (X.hw || '').replace('_link', ''),
    top = base === 'motorway' || base === 'trunk';
  let type,
    main = null,
    exit = null;
  if (lk[0] !== lk[1] || rk[0] !== rk[1]) {
    const mi = lk[0] !== lk[1] ? (lk[0] ? 1 : 0) : rk[0] > rk[1] ? 0 : 1;
    main = Y[mi];
    exit = Y[1 - mi];
    type = top ? (X.lanes >= 3 && main.lanes === X.lanes - 1 ? 'C' : 'A') : 'D';
  } else {
    const tk = String(X.tl || '').split('|'),
      has = (re) => tk.some((t) => t.split(';').some((x) => re.test(x))),
      hT = has(/^through$/),
      hR = has(/right/),
      hL = has(/left/),
      s = ang(Y[0]) < ang(Y[1]);
    if (hT && hR !== hL) {
      /* turn:lanes np. through|right: galaz po stronie through jedzie prosto, druga to zjazd */ main = hR
        ? s
          ? Y[0]
          : Y[1]
        : s
          ? Y[1]
          : Y[0];
      exit = main === Y[0] ? Y[1] : Y[0];
      type = top ? (X.lanes >= 3 && main.lanes === X.lanes - 1 ? 'C' : 'A') : 'D';
    } else {
      type = 'B';
      main = s ? Y[0] : Y[1];
      exit = s ? Y[1] : Y[0];
    }
  } // B: main = lewa, exit = prawa
  if (Math.abs(ang(main)) > 75 || Math.abs(ang(exit)) > 75)
    return null; /* galaz zawraca/odchodzi pod duzym katem (np. petla rampy) - to nie rozwidlenie */
  return { node, X, main, exit, type, merge, auto: type, din, ang, a0: { main: ang(main), exit: ang(exit) } };
}
function pzAng(F, br, P) {
  return ['G', 'V', 'O'].map((e) => {
    const din = pzB(pzEng(e, F.X.P, F.X.hw, F.X.lanes), F.node),
      a = pzN(pzB(F.node, pzEng(e, P || br.P, br.hw, br.lanes)) - din);
    return { e, a, c: PZ_T[e](Math.abs(a)) };
  });
}
function pzEval(F, br, P) {
  return pzAng(F, br, P)
    .map((x) => x.e + ' ' + (x.a >= 0 ? '+' : '') + x.a.toFixed(0) + '° ' + x.c)
    .join(' · ');
}
var DUP = [],
  PZI = [];
/* duplikaty: dwie drogi biegnace rownolegle w tym samym miejscu (<1,5 m) na co najmniej 10 m i tej samej warstwie */
function dupScan() {
  const R = S.doc.road,
    out = [],
    bb = R.map((r) => {
      let a = 1e9,
        b = 1e9,
        c = -1e9,
        d = -1e9;
      for (const q of r.pts) {
        if (q[0] < a) a = q[0];
        if (q[1] < b) b = q[1];
        if (q[0] > c) c = q[0];
        if (q[1] > d) d = q[1];
      }
      return [a - 2, b - 2, c + 2, d + 2];
    });
  for (let i = 0; i < R.length; i++)
    for (let j = i + 1; j < R.length; j++) {
      const A = bb[i],
        B = bb[j];
      if (A[2] < B[0] || B[2] < A[0] || A[3] < B[1] || B[3] < A[1] || (R[i].ly | 0) !== (R[j].ly | 0)) continue;
      const P = R[i].pts,
        Q = R[j].pts,
        near = (pt) => {
          for (let k = 1; k < Q.length; k++) if (segDist(pt, Q[k - 1], Q[k]) < 1.5) return true;
          return false;
        };
      let run = [];
      const flush = () => {
        if (run.length > 1 && cumOf(run)[run.length - 1] >= 10) out.push({ P: run, i, j });
        run = [];
      };
      for (let k = 1; k < P.length; k++) {
        const a = P[k - 1],
          b = P[k],
          L = dist(a, b),
          n = Math.max(1, Math.ceil(L / 2));
        for (let t = 0; t <= n; t++) {
          const pt = [a[0] + ((b[0] - a[0]) * t) / n, a[1] + ((b[1] - a[1]) * t) / n];
          if (near(pt)) run.push(pt);
          else flush();
        }
      }
      flush();
    }
  return out;
} // wykryte problemy rozwidlen (autostrady/ekspresowe i drogi z turn:lanes through)
function pzScan() {
  const seen = new Set(),
    out = [];
  S.doc.road.forEach((r) => {
    const rb = (r.hw || '').replace('_link', '');
    if (r.pts.length < 2 || !(rb === 'motorway' || rb === 'trunk' || /through/.test(r.tl || '')))
      return; /* tylko konce drog kandydatow (wydajnosc) */
    for (const p of [r.pts[0], r.pts[r.pts.length - 1]]) {
      const k = p[0].toFixed(1) + ',' + p[1].toFixed(1);
      if (seen.has(k)) continue;
      seen.add(k);
      const F = pzDetect(p);
      if (!F) continue;
      const b = (F.X.hw || '').replace('_link', ''),
        top = b === 'motorway' || b === 'trunk',
        tl = /through/.test(F.X.tl || '');
      if (!top && !tl) continue;
      const m = pzAng(F, F.main),
        x = pzAng(F, F.exit),
        msg = [];
      let lvl = 0;
      if (F.type === 'B') {
        if (m.concat(x).some((q) => q.c === 'prosto' && q.e !== 'O')) {
          msg.push('rozwidlenie za płaskie');
          lvl = Math.max(lvl, 1);
        }
      } else {
        const md = Math.max(...m.map((q) => Math.abs(q.a)));
        if (m.some((q) => q.c !== 'prosto')) {
          msg.push('na wprost: ' + m.find((q) => q.c !== 'prosto').c + ' (' + md.toFixed(0) + '°)');
          lvl = 2;
        } else if (md > 3) {
          msg.push('na wprost krzywo ' + md.toFixed(0) + '°');
          lvl = Math.max(lvl, 1);
        }
        if (top && x.some((q) => q.c === 'prosto')) {
          msg.push('zjazd za płaski');
          lvl = 2;
        } else if (top && x.some((q) => q.c === 'skręt' || q.c === 'ostro')) {
          msg.push('zjazd za ostry');
          lvl = Math.max(lvl, 1);
        }
      }
      const am = m.find((q) => q.e === 'V').a,
        ax = x.find((q) => q.e === 'V').a,
        ag =
          F.type === 'B'
            ? `${am.toFixed(0)}° / +${ax.toFixed(0)}°`
            : `prosto ${am >= 0 ? '+' : ''}${am.toFixed(0)}°, zjazd ${ax >= 0 ? '+' : ''}${ax.toFixed(0)}°`;
      out.push({ F, p: p.slice(), lvl, msg: F.type + ': ' + (lvl ? msg.join(', ') : 'OK ' + ag) });
    }
  });
  return out;
}
var PZ = { th: null, key: '', type: null, live: null };
function pzSnap(dr, w) {
  if ($('cSn') && !$('cSn').checked) {
    PZ.live = null;
    return null;
  } // przeciaganie PIERWSZEGO wezla galezi (wjazd, na wprost, zjazd) przy rozwidleniu: kat na zywo + przyciaganie
  const cand = PZI.map((z) => z.p);
  if (PZ.sel) cand.unshift(PZ.sel.node);
  for (const node of cand) {
    if (dist(node, w) > 80) continue;
    const F = pzDetect(node);
    if (!F) continue;
    for (const [k, br] of [
      ['x', F.X],
      ['main', F.main],
      ['exit', F.exit],
    ]) {
      const kj = pzKey(br);
      let kr = br.refs[kj],
        near = false;
      const dp = S.doc.road[dr.i] && S.doc.road[dr.i].pts[dr.vi],
        same = (q) => q && dp && dist(q, dp) < 0.4;
      /* wezel wspolny dwoch drog: dopasowanie po pozycji */ if (!same(br.P[kj])) {
        if (!same(br.P[1]) || kj === 1) continue;
        kr = br.refs[1];
        near = true; /* zostawiony punkt tuz przy wezle (np. poczatek mostu): tez snapuje sie do kata */
      }
      const base = (F.X.hw || '').replace('_link', ''),
        top = base === 'motorway' || base === 'trunk',
        d0 = dist(F.node, w),
        snD = !near && Math.abs(d0 - PZ_D) * S.view.k <= 12,
        d = snD ? PZ_D : d0,
        tol = Math.min(near ? 6 : 180, Math.max(2.5, Math.atan(12 / S.view.k / Math.max(d0, 1)) / PZ_R));
      let a,
        best = null,
        T;
      if (k === 'x') {
        const tabs = pzB(F.node, F.main.P[pzKey(F.main)]) + 180;
        a = pzN(pzB(F.node, w) - tabs);
        T = [0];
        if (Math.abs(a) <= tol) best = 0;
        const ang = best ?? a,
          q =
            best == null && !snD
              ? w
              : [F.node[0] + d * Math.cos((tabs + ang) * PZ_R), F.node[1] + d * Math.sin((tabs + ang) * PZ_R)];
        PZ.sel = { node: F.node };
        return { w: q, node: F.node, a: ang, snap: best != null || snD, k };
      }
      const side = Math.sign(F.a0.exit - F.a0.main) || 1;
      T =
        k === 'main' && F.type !== 'B'
          ? [0]
          : F.type === 'B'
            ? [12, 15, 18].map((t) => t * (k === 'main' ? -1 : 1))
            : (top ? [22, 25, 30] : [30, 35, 40]).map((t) => t * side);
      a = pzN(pzB(F.node, w) - F.din);
      for (const t of T) if (Math.abs(a - t) <= tol && (best == null || Math.abs(a - t) < Math.abs(a - best))) best = t;
      const ang = best ?? a,
        q =
          best == null && !snD
            ? w
            : [F.node[0] + d * Math.cos((F.din + ang) * PZ_R), F.node[1] + d * Math.sin((F.din + ang) * PZ_R)];
      PZ.sel = { node: F.node };
      return { w: q, node: F.node, a: ang, snap: best != null || snD, k };
    }
  }
  return null;
}
const PZ_D = 10; // wspolna odleglosc kluczowych punktow gałęzi od węzła rozwidlenia [m]
function pzKey0(arm) {
  const c = cumOf(arm.P);
  for (let j = 1; j < c.length; j++) if (c[j] >= PZ_D - 0.6) return j;
  return Math.max(1, c.length - 1);
} /* scisle: pierwszy wezel w odleglosci >= 10 m (dla czyszczenia przy kliknieciu) */
function pzKey(arm) {
  const c = cumOf(arm.P);
  return c.length > 2 && c[1] >= 3 ? 1 : pzKey0(arm);
} /* punkt kluczowy do kata/snapu: pierwszy wezel od rozwidlenia (stabilny przy przeciaganiu) */
function pzIns(arm, dd) {
  // wstaw wezel w odleglosci dd (po lamanej) od rozwidlenia; false gdy juz jest (+-0,6 m) albo galezi brak
  const c = cumOf(arm.P);
  if (c[c.length - 1] < dd + 1) return false;
  let j = 0;
  while (j + 1 < c.length - 1 && c[j + 1] <= dd) j++;
  if (Math.abs(c[j] - dd) < 0.6 || Math.abs(c[j + 1] - dd) < 0.6) return false;
  const f = arm.refs[j + 1],
    r = S.doc.road[f.ri],
    vb = f.vi,
    va = vb - f.dir,
    idx = Math.max(va, vb),
    A = arm.P[j],
    B = arm.P[j + 1],
    l = dist(A, B) || 1,
    t = (dd - c[j]) / l,
    q = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
  r.pts.splice(idx, 0, q);
  if (r.nk) r.nk.splice(idx, 0, null);
  if (r.rp) r.rp.splice(idx, 0, q.slice());
  return true;
}
async function pzFocus(ri, vi) {
  // klik w wezel rozwidlenia: aktualne dane OSM + dodatkowe punkty ~10 m od wezla + podglad katow
  const n0 = S.doc.road[ri].pts[vi].slice();
  if (!pzDetect(n0)) {
    PZ.sel = null;
    render();
    return;
  }
  PZ.sel = { node: n0 };
  say('Sprawdzam aktualne dane OSM…');
  render();
  const c = unproj(n0),
    dl = 160 / 111320,
    dn = dl / Math.cos((c.lat * Math.PI) / 180);
  let live = false;
  try {
    live = await refreshLive([c.lon - dn, c.lat - dl, c.lon + dn, c.lat + dl]);
  } catch (e) {}
  let node = n0,
    bd = 6;
  S.doc.road.forEach((r) =>
    r.pts.forEach((p) => {
      const d = dist(p, n0);
      if (d < bd) {
        bd = d;
        node = p.slice();
      }
    }),
  );
  if (!pzDetect(node)) {
    PZ.sel = null;
    say('To rozwidlenie nie istnieje już w OSM.');
    render();
    return;
  }
  PZ.sel = { node };
  let added = 0;
  push();
  for (let g = 0; g < 8; g++) {
    const F = pzDetect(node);
    if (!F) break;
    let did = false;
    for (const arm of [F.X, F.main, F.exit]) {
      if (pzIns(arm, PZ_D)) {
        did = true;
        added++;
        break;
      }
    }
    if (!did) break;
  }
  let removed = 0;
  const keep = new Set();
  for (let g = 0; g < 24; g++) {
    const F = pzDetect(node);
    if (!F) break;
    let did = false;
    for (const arm of [F.X, F.main, F.exit]) {
      if (pzKey0(arm) < 2) continue;
      const f = arm.refs[1],
        r = S.doc.road[f.ri],
        q = r.pts[f.vi],
        kk = q[0].toFixed(2) + ',' + q[1].toFixed(2);
      if (keep.has(kk)) continue;
      const shared =
        f.vi === 0 ||
        f.vi === r.pts.length - 1 ||
        S.doc.road.some(
          (o, oi) => oi !== f.ri && o.pts.some((p2) => dist(p2, q) < 0.4),
        ); /* koniec drogi albo wezel wspolny z inna droga - nie ruszamy */
      if (shared) {
        keep.add(kk);
        continue;
      }
      r.pts.splice(f.vi, 1);
      if (r.nk) r.nk.splice(f.vi, 1);
      if (r.rp) r.rp.splice(f.vi, 1);
      removed++;
      did = true;
      break;
    }
    if (!did) break;
  }
  if (!added && !removed) S.undo.pop();
  else {
    save();
    S.dirty = true;
  }
  say((live ? 'OSM aktualne' : 'OSM niedostępne') + (added || removed ? `, punkty: +${added} −${removed}` : '') + '.');
  touch();
}
function pzOk(F, k, a) {
  const top = ['motorway', 'trunk'].includes((F.X.hw || '').replace('_link', '')),
    x = Math.abs(a);
  return F.type === 'B' ? x >= 6 && x <= 20 : k === 'main' ? x <= 5 : top ? x >= 15 && x <= 30 : x >= 21 && x <= 40;
}
function pzCmd(F, k) {
  // komenda kazdego silnika dla gałęzi k (main/exit): { e, a, c, exit }
  const br = F[k],
    link = /_link/.test(br.hw || ''),
    base = (F.X.hw || '').replace('_link', ''),
    top = base === 'motorway' || base === 'trunk';
  return pzAng(F, br).map((x) => ({
    ...x,
    exit: !F.merge && x.e !== 'G' && F.type !== 'B' && k === 'exit' && link && top,
  }));
}
function pzIcon(x, y, kind, a, sz, bad) {
  // ikona komendy: prosto / lekko / skret / ostro / exit; a = kat ze znakiem (prawo +)
  const side = a >= 0 ? 1 : -1,
    rot = kind === 'prosto' ? 0 : kind === 'lekko' ? 35 : kind === 'skręt' ? 90 : kind === 'exit' ? 30 : 140,
    h = sz / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-h, -h, sz, sz, 6) : ctx.rect(-h, -h, sz, sz);
  ctx.fillStyle = kind === 'merge' ? '#1f5fb8' : kind === 'exit' ? '#1a7f37' : 'rgba(255,255,255,.96)';
  ctx.fill();
  ctx.strokeStyle = bad ? '#e08a00' : kind === 'merge' ? '#123f80' : kind === 'exit' ? '#0d5a24' : '#555';
  ctx.lineWidth = bad ? 2.5 : 1.5;
  ctx.stroke();
  if (kind === 'merge') {
    const L2 = h * 0.62;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = Math.max(2, sz / 9);
    ctx.beginPath();
    ctx.moveTo(-L2 * 0.8, L2);
    ctx.lineTo(0, 0);
    ctx.moveTo(L2 * 0.8, L2);
    ctx.lineTo(0, 0);
    ctx.lineTo(0, -L2 * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -L2);
    ctx.lineTo(-L2 * 0.55, -L2 * 0.25);
    ctx.lineTo(L2 * 0.55, -L2 * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate((side * rot * Math.PI) / 180);
  const L = h * 0.62;
  ctx.strokeStyle = kind === 'exit' ? '#fff' : '#222';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = Math.max(2, sz / 9);
  ctx.beginPath();
  ctx.moveTo(0, L);
  ctx.lineTo(0, -L * 0.55);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -L);
  ctx.lineTo(-L * 0.55, -L * 0.25);
  ctx.lineTo(L * 0.55, -L * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function pzDrawArcs(F, full) {
  // prosta + galezie + luk z katem (tylko liczby); full = wybrany wezel (z kropkami i okregiem)
  if (!F) return;
  const o = w2s(F.node),
    din = F.din * PZ_R,
    R = full ? 100 : 62,
    rr = full ? 46 : 28;
  ctx.save();
  ctx.lineCap = 'round';
  if (full) {
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(40,40,40,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(o[0], o[1], PZ_D * S.view.k, 0, 7);
    ctx.stroke();
  } /* okrag: wspolna odleglosc punktow od wezla */
  if (full)
    for (const br of [F.X, F.main, F.exit]) {
      const q = w2s(br.P[pzKey(br)]);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(q[0], q[1], 6, 0, 7);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#1f6fd0';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  if (full) {
    /* dyskretne odleglosci: wezel -> kazdy z 3 punktow na okregu (m) */ ctx.save();
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    for (const br of [F.X, F.main, F.exit]) {
      const A = br.P[pzKey(br)],
        b2 = w2s(A),
        mx = (o[0] + b2[0]) / 2 + 14,
        my = (o[1] + b2[1]) / 2,
        t = dist(F.node, A).toFixed(1) + ' m';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.strokeText(t, mx, my + 3);
      ctx.fillStyle = '#35507a';
      ctx.fillText(t, mx, my + 3);
    }
    ctx.restore();
  }
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = 'rgba(40,40,40,.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(o[0], o[1]);
  ctx.lineTo(o[0] + R * Math.cos(din), o[1] + R * Math.sin(din));
  ctx.stroke();
  ctx.setLineDash([]);
  const items = [];
  for (const k of ['main', 'exit']) {
    const br = F[k],
      kp = br.P[pzKey(br)],
      a = pzN(pzB(F.node, kp) - F.din);
    if (k === 'main' && F.type !== 'B' && Math.abs(a) < 0.5) {
      items.push({ a: 0, ok: pzOk(F, 'main', a), k: 'main' });
      continue;
    }
    const ok = pzOk(F, k, a),
      col = ok ? '#1f9a4c' : '#e08a00',
      e = (F.din + a) * PZ_R;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(o[0], o[1]);
    ctx.lineTo(o[0] + R * Math.cos(e), o[1] + R * Math.sin(e));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(o[0], o[1]);
    ctx.arc(o[0], o[1], rr, din, e, a < 0);
    ctx.closePath();
    ctx.fillStyle = ok ? 'rgba(31,154,76,.20)' : 'rgba(224,138,0,.22)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(o[0], o[1], rr, din, e, a < 0);
    ctx.lineWidth = 2;
    ctx.stroke();
    items.push({ a, ok, k });
  }
  {
    /* ikony: po jednej na galaz (prosto / zjazd), kat pod kazda, wysrodkowane w jednej linii nad wezlem */
    const isz = full ? 30 : 24,
      gap = isz + 30,
      cx = o[0],
      cy =
        o[1] -
        (full
          ? Math.max(R, PZ_D * S.view.k) + 40
          : R + 26); /* ikony poza obwodem okregu 10 m, nie zaslaniaja punktow */
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    items.forEach((q, i) => {
      const x = cx + (i - (items.length - 1) / 2) * gap,
        br = q.k || 'main',
        cm = pzCmd(F, br),
        ex = cm.some((c) => c.exit),
        kk = cm.map((c) => c.c),
        kind = ex
          ? 'exit'
          : F.merge && (q.k === 'exit' || F.type === 'B')
            ? 'merge'
            : q.a === 0
              ? 'prosto'
              : kk[0] || 'lekko',
        tx = Math.abs(q.a).toFixed(0) + '°' + (q.ok ? '✓' : '');
      pzIcon(x, cy, kind, q.a, isz, false);
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.strokeText(tx, x, cy + isz / 2 + 14);
      ctx.fillStyle = q.ok ? '#13703a' : '#a35f00';
      ctx.fillText(tx, x, cy + isz / 2 + 14);
    });
    if (full) {
      /* przycisk: dodaj punkty 10 m od wezla (dopiero po kliknieciu) */ const bw = 64,
        bh = 26,
        bx = cx + ((items.length - 1) / 2) * gap + isz / 2 + 14,
        by = cy - bh / 2;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 6) : ctx.rect(bx, by, bw, bh);
      ctx.fillStyle = '#1f6fd0';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('+ punkty', bx + bw / 2, by + 17);
      PZ.btn = { x: bx, y: by, w: bw, h: bh };
    } else PZ.btn = null;
  }
  ctx.restore();
}
function vbar() {
  // pasek akcji punktu nad mapa (panel jest dlugi i przyciski bywaja poza ekranem)
  const o = document.getElementById('vbar');
  if (o) o.remove();
  const r = S.doc.road[S.sel];
  if (true || EMBED || S.tool !== 'sel' || !r || S.vsel < 0) return;
  const d = document.createElement('div');
  d.id = 'vbar';
  d.style.cssText =
    'position:fixed;z-index:15;bottom:44px;left:50%;transform:translateX(-50%);display:flex;gap:6px;padding:6px;background:var(--pn);color:var(--tx);border:1px solid var(--bd);border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.35)';
  if (S.vsel > 0 && S.vsel < r.pts.length - 1) {
    const b = document.createElement('button');
    b.textContent = 'Rozdziel drogę w tym punkcie';
    b.onclick = () => {
      const x = document.getElementById('bSplit');
      if (x) x.click();
    };
    d.appendChild(b);
  }
  {
    const fj = S.vsel === 0 || S.vsel === r.pts.length - 1 ? forkJson(S.sel, S.vsel) : null;
    if (fj) {
      const b = document.createElement('button');
      b.textContent = 'Kopiuj rozjazd do szkieletu';
      b.title = 'Skopiuj 3 drogi tego węzła; w piaskownicy kliknij „Wklej punkty”';
      b.onclick = () => {
        (navigator.clipboard ? navigator.clipboard.writeText(fj) : Promise.reject()).then(
          () => {
            b.textContent = 'Skopiowano';
            setTimeout(() => {
              b.textContent = 'Kopiuj rozjazd do szkieletu';
            }, 1500);
          },
          () => prompt('Skopiuj:', fj),
        );
      };
      d.appendChild(b);
    }
  }
  const b2 = document.createElement('button');
  b2.textContent = 'Usuń punkt';
  b2.onclick = () => {
    const x = document.getElementById('bDelV');
    if (x) x.click();
  };
  d.appendChild(b2);
  d.onpointerdown = (e) => e.stopPropagation();
  document.body.appendChild(d);
}
function showTab(t) {
  window.__tab = t;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('act', b.dataset.t === t));
  document.querySelectorAll('.tab').forEach((d) => d.classList.toggle('act', d.dataset.t === t));
  try {
    localStorage.setItem('edytor-tab-v1', t);
  } catch (e) {}
}
document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.t)));
(() => {
  let t = 'osm';
  try {
    t = localStorage.getItem('edytor-tab-v1') || 'osm';
  } catch (e) {}
  showTab(t === 'osm' || t === 'data' ? t : 'osm');
})();
function props() {
  const el = $('props'),
    r = S.doc.road[S.sel];
  window.__ls = S.sel;
  if (!r) {
    setTimeout(vbar, 0);
    el.innerHTML =
      '<div class="small">Kliknij drogę (lub konkretny pas) na mapie, żeby edytować jej pasy, strzałki i tagi.</div>';
    return;
  }
  const mut = (f) => {
      push();
      f();
      save();
      ui();
      touch();
    },
    bind = [];
  const offRow = () => {
    const nl = r.lanes | 0,
      base = offBase(r),
      cur = r.off != null && r.off !== '' ? +r.off : base,
      step = (dv) =>
        mut(() => {
          r.off = cur + dv;
        });
    bind.push(() => {
      $('offL').onclick = () => step(-0.5);
      $('offR').onclick = () => step(0.5);
      if ($('offA'))
        $('offA').onclick = () =>
          mut(() => {
            delete r.off;
          });
    });
    return `<div class="row">offset: <button id="offL" title="o pół pasa w lewo">◀</button><b>${cur > 0 ? '+' : ''}${cur} pasa${r.off == null ? ' (auto)' : ''}</b><button id="offR" title="o pół pasa w prawo">▶</button>${r.off != null ? '<button id="offA">auto</button>' : ''}</div>`;
  };
  const chk = (label, key) => {
    const id = 'c' + key;
    bind.push(() => {
      $(id).onchange = () =>
        mut(() => {
          r[key] = $(id).checked;
        });
    });
    return `<label><input type="checkbox" id="${id}" ${r[key] ? 'checked' : ''}> ${label}</label>`;
  };
  let h =
    `<h4>Droga ${r.name || ''} ${r.hw ? '(' + r.hw + ')' : ''}</h4><div class="row">` +
    numRow('pasy', r.lanes, (v) =>
      mut(() => {
        const N = Math.max(1, Math.round(v));
        if (r.osm) {
          r.tg = r.tg || {};
          const b = baseTags(r).lanes || '';
          if (String(N) === b) delete r.tg.lanes;
          else r.tg.lanes = String(N);
          if (!Object.keys(r.tg).length) delete r.tg;
          applyTags(r);
          r.lanes = N;
        } else r.lanes = N;
      }),
    ) +
    numRow(
      'szer. pasa [m]',
      r.lw,
      (v) =>
        mut(() => {
          r.lw = v;
        }),
      0.25,
      (v) => {
        r.lw = v;
        touch();
      },
    ) +
    offRow() +
    '</div><div class="row">' +
    chk('jednokierunkowa', 'oneway') +
    chk('pasy (linie)', 'marked') +
    chk('krawędziowe', 'edge') +
    chk('krawężnik', 'kerb') +
    `<select id="pc">${['auto', 'p1', 'p2', 'p4', 'brak'].map((m) => `<option ${r.centre === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div><div class="small">linia środkowa. Szerokość = pasy × szer. pasa.</div><div class="row">` +
    `<button id="bRev">Odwróć kierunek</button>${r.rp ? '<button id="bRz">Zeruj render</button>' : ''}${S.vsel >= 0 ? '<button id="bDelV">Usuń punkt</button>' : ''}${S.vsel > 0 && S.vsel < r.pts.length - 1 ? '<button id="bSplit">Rozdziel drogę w punkcie</button>' : ''}<button id="bDel" class="warn">Usuń drogę</button></div>`;
  if (r.osm) h += laneEditor(r, mut, bind);
  if (r.osm) {
    const bt = baseTags(r),
      et = effTags(r);
    h +=
      `<details ${r.tg && Object.keys(r.tg).length ? 'open' : ''}><summary>Tagi OSM tej drogi${r.tg && Object.keys(r.tg).length ? ' (zmienione: ' + Object.keys(r.tg).length + ')' : ''}</summary>` +
      TAGK.map(([k, lab], i) => {
        const ch = r.tg && k in r.tg;
        return `<div class="row"><label style="${ch ? 'color:#e58a00;font-weight:600' : ''}">${lab} <input id="tg${i}" data-k="${k}" value="${(et[k] || '').replace(/"/g, '&quot;')}" placeholder="${bt[k] ? '' : 'brak tagu'}" style="width:190px"></label></div>`;
      }).join('') +
      `<div class="small">Zmiana przelicza render od razu. Do OSM trafia przez „Wyślij do OSM” (zmieniane są tylko pola oznaczone na pomarańczowo).</div>` +
      (r.tg && Object.keys(r.tg).length ? '<div class="row"><button id="bTgReset">Cofnij tagi</button></div>' : '') +
      '</details>';
    bind.push(() => {
      TAGK.forEach(([k], i) => {
        const inp = $('tg' + i);
        if (!inp) return;
        inp.onchange = () =>
          mut(() => {
            const v = inp.value.trim(),
              b = baseTags(r)[k] || '';
            r.tg = r.tg || {};
            if (v === b) delete r.tg[k];
            else r.tg[k] = v === '' ? null : v;
            if (!Object.keys(r.tg).length) delete r.tg;
            applyTags(r);
          });
      });
      const br = $('bTgReset');
      if (br)
        br.onclick = () =>
          mut(() => {
            delete r.tg;
            applyTags(r);
          });
    });
  }
  el.innerHTML = h;
  bind.forEach((f) => f());
  setTimeout(vbar, 0);
  $('pc').onchange = () =>
    mut(() => {
      r.centre = $('pc').value;
    });
  if ($('bRz'))
    $('bRz').onclick = () =>
      mut(() => {
        delete r.rp;
      });
  $('bRev').onclick = () =>
    mut(() => {
      r.pts.reverse();
      r.nk.reverse();
      if (r.rp) r.rp.reverse();
    });
  if ($('bDelV'))
    $('bDelV').onclick = () =>
      mut(() => {
        r.pts.splice(S.vsel, 1);
        r.nk.splice(S.vsel, 1);
        if (r.rp) r.rp.splice(S.vsel, 1);
        S.vsel = -1;
        if (r.pts.length < 2) {
          S.doc.road.splice(S.sel, 1);
          S.sel = -1;
        }
      });
  if ($('bSplit'))
    $('bSplit').onclick = () => {
      const i = S.vsel;
      if (r.osm && r.nk[i] == null) {
        say('Ten punkt jest nowy (jeszcze nie w OSM) – najpierw wyślij go do OSM, potem rozdziel drogę.');
        return;
      }
      mut(() => {
        const r2 = JSON.parse(JSON.stringify(r));
        r.pts = r.pts.slice(0, i + 1);
        r.nk = r.nk.slice(0, i + 1);
        r2.pts = r2.pts.slice(i);
        r2.nk = r2.nk.slice(i);
        if (r.rp) {
          r.rp = r.rp.slice(0, i + 1);
          r2.rp = r2.rp.slice(i);
        }
        if (r.osm) r2.nw = true;
        /* nowa droga OSM przy wysylce */ S.doc.road.splice(S.sel + 1, 0, r2);
        S.vsel = -1;
      });
    };
  $('bDel').onclick = () =>
    mut(() => {
      S.doc.road.splice(S.sel, 1);
      S.sel = -1;
      S.vsel = -1;
    });
}
$('bLnk').onclick = () => loadLink($('lnk').value);
$('lnk').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadLink($('lnk').value);
});
$('lnk').addEventListener('paste', () =>
  setTimeout(() => {
    if (parseLink($('lnk').value)) loadLink($('lnk').value);
  }),
);
function resetFromOsm(idx) {
  let n = 0;
  for (const i of idx) {
    const r = S.doc.road[i],
      o = r && S.osm.ways.get(r.osm);
    if (!o) continue;
    const ia = o.nk.indexOf(r.nk[0]),
      ib = o.nk.indexOf(r.nk[r.nk.length - 1]);
    if (ia < 0 || ib < 0 || ia === ib) continue;
    S.doc.road[i] = makeRoad(o, Math.min(ia, ib), Math.max(ia, ib));
    n++;
  }
  return n;
}
$('bRst').onclick = () => {
  const a = s2w([0, 0]),
    b = s2w([W, H]),
    x0 = Math.min(a[0], b[0]),
    x1 = Math.max(a[0], b[0]),
    y0 = Math.min(a[1], b[1]),
    y1 = Math.max(a[1], b[1]);
  const idx = [];
  S.doc.road.forEach((r, i) => {
    if (gp(r).some((q) => q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1)) idx.push(i);
  });
  push();
  const n = resetFromOsm(idx);
  save();
  ui();
  touch();
  say(`Przywrócono z OSM ${n} dróg w widoku (cofnij: ↶).`);
};
$('bRstSel').onclick = () => {
  if (S.sel < 0) {
    say('Zaznacz najpierw drogę.');
    return;
  }
  push();
  const n = resetFromOsm([S.sel]);
  save();
  ui();
  touch();
  say(n ? 'Przywrócono zaznaczoną drogę z OSM (cofnij: ↶).' : 'Nie znaleziono tej drogi w danych OSM.');
};
function liveLog(m) {
  console.log('[OSM live]', m);
  const L = (window.__ll = m.startsWith('start') ? [] : window.__ll || []);
  L.push(new Date().toISOString().slice(11, 19) + ' ' + m);
  if (!m.startsWith('BLAD')) return;
  /* okno logu tylko przy bledzie */ let b = document.getElementById('liveLog');
  if (!b) {
    b = document.createElement('div');
    b.id = 'liveLog';
    b.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:99;max-width:min(560px,92vw);background:#111d;color:#cfc;font:11px/1.35 monospace;padding:6px 8px;border-radius:6px;white-space:pre-wrap;max-height:40vh;overflow:auto';
    b.innerHTML =
      '<div style="text-align:right"><button id="llC">kopiuj</button> <button id="llX">×</button></div><pre id="llT" style="margin:0;white-space:pre-wrap;user-select:text"></pre>';
    document.body.appendChild(b);
    b.querySelector('#llX').onclick = () => {
      b.remove();
    };
    b.querySelector('#llC').onclick = () => {
      try {
        navigator.clipboard.writeText(b.querySelector('#llT').textContent);
      } catch (e) {}
    };
  }
  b.querySelector('#llT').textContent = L.join('\n');
}
async function refreshLive(bb, src) {
  // aktualne dane z API OSM dla widoku; podmienia drogi o zmienionym ukladzie wezlow (bez nowych/recznych wezlow)
  const a = bb ? { lon: bb[0], lat: bb[1] } : unproj(s2w([0, 0])),
    b = bb ? { lon: bb[2], lat: bb[3] } : unproj(s2w([W, H])),
    lo = Math.min(a.lon, b.lon),
    hi = Math.max(a.lon, b.lon),
    la0 = Math.min(a.lat, b.lat),
    la1 = Math.max(a.lat, b.lat);
  if ((hi - lo) * (la1 - la0) > 0.04) {
    say('Za duży obszar – przybliż widok i spróbuj ponownie.');
    return false;
  }
  say(src === 'overpass' ? 'Pobieram drogi z Overpass…' : 'Pobieram aktualne dane z OSM…');
  const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${lo.toFixed(6)},${la0.toFixed(6)},${hi.toFixed(6)},${la1.toFixed(6)}`;
  liveLog(
    'start, bbox=' +
      [lo, la0, hi, la1].map((v) => v.toFixed(5)).join(',') +
      ' pole=' +
      ((hi - lo) * (la1 - la0)).toFixed(5),
  );
  liveLog('GET ' + url);
  /* pobieranie z ponawianiem (429/5xx/timeout) i dzieleniem obszaru na 4 czesci, gdy API odmawia: "too many nodes" (limit 50000 wezlow) */
  const getMap = async (x0, y0, x1, y1, depth) => {
    const u = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${x0.toFixed(6)},${y0.toFixed(6)},${x1.toFixed(6)},${y1.toFixed(6)}`;
    let last = null;
    for (let t = 0; t < 4; t++) {
      const ac = new AbortController(),
        to = setTimeout(() => ac.abort(), 30000);
      try {
        const rr = await fetch(u, { signal: ac.signal });
        const tx = await rr.text();
        clearTimeout(to);
        liveLog(
          'HTTP ' +
            rr.status +
            ' ' +
            tx.length +
            ' znakow (' +
            x0.toFixed(4) +
            ',' +
            y0.toFixed(4) +
            ') proba ' +
            (t + 1),
        );
        if (rr.ok) return JSON.parse(tx).elements;
        if (rr.status === 400 && /too many nodes|50000|too large/i.test(tx) && depth < 3) {
          const mx = (x0 + x1) / 2,
            my = (y0 + y1) / 2,
            out = [];
          for (const [a0, b0, a1, b1] of [
            [x0, y0, mx, my],
            [mx, y0, x1, my],
            [x0, my, mx, y1],
            [mx, my, x1, y1],
          ])
            out.push(...(await getMap(a0, b0, a1, b1, depth + 1)));
          return out;
        }
        last = new Error('HTTP ' + rr.status + ': ' + tx.slice(0, 200));
        if (![429, 500, 502, 503, 504, 509].includes(rr.status)) throw last;
      } catch (e) {
        clearTimeout(to);
        last = e.name === 'AbortError' ? new Error('przekroczono czas odpowiedzi (30 s)') : e;
        if (/^HTTP 4(?!29)/.test(last.message)) throw last;
      }
      say('OSM zajęte (' + (last && last.message.slice(0, 40)) + ') – ponawiam ' + (t + 1) + '/3…');
      await new Promise((r) => setTimeout(r, 1500 * (t + 1)));
    }
    throw last || new Error('nieznany błąd');
  };
  /* Overpass: tylko drogi (highway) z pelna geometria + ich wezly, jeden maly POST; lista serwerow z przelaczaniem przy bledzie / limicie / przeciazeniu */
  const OVP = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  const getOverpass = async (x0, y0, x1, y1) => {
    const hw = [...OKHW].join('|') + '|cycleway|[a-z_]+_link',
      q = `[out:json][timeout:25];(way["highway"~"^(${hw})$"](${y0.toFixed(6)},${x0.toFixed(6)},${y1.toFixed(6)},${x1.toFixed(6)});way["highway"~"^(footway|path|pedestrian|track)$"]["bicycle"="designated"](${y0.toFixed(6)},${x0.toFixed(6)},${y1.toFixed(6)},${x1.toFixed(6)}););(._;>;);out body qt;`;
    const start = window.__ovEp || 0;
    let last = null;
    for (let k = 0; k < OVP.length; k++) {
      const ei = (start + k) % OVP.length,
        ep = OVP[ei],
        ac = new AbortController(),
        to = setTimeout(() => ac.abort(), 30000),
        t0 = performance.now();
      try {
        say('Overpass (' + ep.split('/')[2] + ')…');
        const rr = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(q),
          signal: ac.signal,
        });
        const tx = await rr.text();
        clearTimeout(to);
        liveLog(
          'Overpass ' +
            ep.split('/')[2] +
            ' HTTP ' +
            rr.status +
            ' ' +
            tx.length +
            ' znakow, ' +
            Math.round(performance.now() - t0) +
            ' ms',
        );
        if (!rr.ok) {
          last = new Error('HTTP ' + rr.status);
          continue;
        }
        const j0 = JSON.parse(tx);
        if (j0.remark && /runtime error|timed out|out of memory/i.test(j0.remark)) {
          last = new Error(j0.remark.slice(0, 120));
          continue;
        }
        window.__ovEp = ei;
        return j0.elements || []; /* ten serwer dziala: nastepnym razem zaczynamy od niego */
      } catch (e) {
        clearTimeout(to);
        last = e.name === 'AbortError' ? new Error('przekroczono czas odpowiedzi (30 s)') : e;
        liveLog('Overpass ' + ep.split('/')[2] + ' blad: ' + last.message);
      }
    }
    throw new Error('żaden serwer Overpass nie odpowiedział (' + (last && last.message) + ')');
  };
  let j;
  try {
    const els = src === 'overpass' ? await getOverpass(lo, la0, hi, la1) : await getMap(lo, la0, hi, la1, 0),
      seen = new Set(),
      uniq = els.filter((e) => {
        const k = e.type + e.id;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    j = { elements: uniq };
    liveLog('razem elementow: ' + uniq.length);
  } catch (e) {
    liveLog('BLAD: ' + ((e && e.stack) || e));
    say('Nie udało się pobrać z OSM: ' + e.message + ' (szczegóły w oknie logu)');
    return false;
  }
  liveLog(
    'elementy: ' +
      j.elements.length +
      ' (wezly ' +
      j.elements.filter((e) => e.type === 'node').length +
      ', drogi ' +
      j.elements.filter((e) => e.type === 'way' && e.tags && e.tags.highway).length +
      ')',
  );
  try {
    const nodes = new Map();
    for (const e of j.elements) if (e.type === 'node') nodes.set(e.id, [e.lon, e.lat]);
    const fresh = new Map();
    for (const e of j.elements)
      if (e.type === 'way' && e.tags && e.tags.highway) {
        const ll = e.nodes.map((id) => nodes.get(id)).filter(Boolean);
        if (ll.length < 2) continue;
        fresh.set(e.id, {
          id: e.id,
          t: e.tags,
          g: ll.map((c) => proj(c[0], c[1])),
          nk: ll.map((c) => c[0].toFixed(7) + ',' + c[1].toFixed(7)),
        });
      }
    let del = 0;
    for (const [id, o] of [...S.osm.ways])
      if (
        !fresh.has(id) &&
        o.g.some((p, i) => {
          const u = unproj(p);
          return u.lon >= lo && u.lon <= hi && u.lat >= la0 && u.lat <= la1;
        })
      ) {
        S.osm.ways.delete(id);
        del++;
      }
    const tagCh = new Set();
    for (const [id, o] of fresh) {
      const old = S.osm.ways.get(id);
      if (old && JSON.stringify(old.t) !== JSON.stringify(o.t)) tagCh.add(id);
      S.osm.ways.set(id, o);
    }
    let rep = 0,
      keep = 0,
      gone = 0,
      tagN = 0;
    const R = S.doc.road;
    for (let i = 0; i < R.length; i++) {
      const r = R[i];
      if (!r.osm || !fresh.has(r.osm)) {
        if (r.osm && !S.osm.ways.has(r.osm)) gone++;
        continue;
      }
      const w = fresh.get(r.osm),
        ks = r.nk.filter(Boolean);
      if (ks.length !== r.nk.length || ks.length < 2) {
        keep++;
        continue;
      } // ma wlasne nowe wezly - nie ruszamy
      const ia = w.nk.indexOf(ks[0]),
        ib = w.nk.indexOf(ks[ks.length - 1]);
      const slice = ia >= 0 && ib >= 0 ? (ia <= ib ? w.nk.slice(ia, ib + 1) : w.nk.slice(ib, ia + 1).reverse()) : null;
      if (slice && slice.length === ks.length && slice.every((k, q) => k === ks[q])) {
        if (tagCh.has(r.osm)) {
          applyTags(r);
          tagN++;
          liveLog('tagi zmienione: way ' + r.osm + ' lanes=' + (w.t.lanes || '-'));
        }
        continue;
      } // uklad wezlow bez zmian
      const A = ia >= 0 && ib >= 0 ? Math.min(ia, ib) : 0,
        B = ia >= 0 && ib >= 0 ? Math.max(ia, ib) : w.g.length - 1;
      if (ia < 0 && ib < 0) {
        const m = ks.some((k) => w.nk.includes(k));
        if (!m) {
          keep++;
          continue;
        }
      }
      R[i] = makeRoad(w, ia >= 0 && ib >= 0 ? A : 0, ia >= 0 && ib >= 0 ? B : w.g.length - 1);
      rep++;
    }
    liveLog(`podmieniono ${rep}, pominieto ${keep}, brak w OSM ${gone}, usunieto z pamieci ${del}`);
    if (!bb) S.undo = [];
    save();
    if (!bb || rep || tagN || del) {
      touch();
      if (!bb) ui();
    }
    if (!bb)
      say(
        `OSM na żywo: ${fresh.size} dróg pobranych, podmieniono ${rep}, tagi zaktualizowane ${tagN}, usunięto z pamięci ${del}` +
          (keep ? `, pominięto ${keep} z ręcznymi węzłami` : '') +
          (gone ? `, ${gone} nie ma już w OSM` : '') +
          '.',
      );
    return true;
  } catch (e) {
    liveLog('BLAD przetwarzania: ' + ((e && e.stack) || e));
    try {
      const bad = [];
      S.doc.road.forEach((r, i) => {
        const nul = (r.pts || []).filter((q) => !q || !isFinite(q[0]) || !isFinite(q[1])).length,
          cq = S.CC && S.CC[i] ? S.CC[i].Q : null;
        if (
          nul ||
          !r.pts ||
          r.pts.length < 2 ||
          (r.rp && r.rp.length !== r.pts.length) ||
          (r.nk && r.nk.length !== r.pts.length) ||
          !cq ||
          cq.length < 2 ||
          cq.some((q) => !q)
        )
          bad.push(
            `#${i} way ${r.osm} ${r.hw} lanes=${r.lanes} pts=${(r.pts || []).length} rp=${r.rp ? r.rp.length : '-'} nk=${r.nk ? r.nk.length : '-'} puste=${nul} Q=${cq ? cq.length : '-'}`,
          );
      });
      liveLog('BLAD diagnoza (drogi z problemem): ' + (bad.length ? '\n' + bad.slice(0, 12).join('\n') : 'brak'));
    } catch (e2) {
      liveLog('BLAD diagnoza nie powiodla sie: ' + e2.message);
    }
    say('Błąd przetwarzania danych OSM: ' + e.message + ' (szczegóły w oknie logu)');
    return false;
  }
}
$('bLive').onclick = () => refreshLive();
async function loadFresh(src) {
  if (src !== 'overpass') src = null;
  if (Math.log2(156543.03 * Math.cos((S.org.lat * Math.PI) / 180) * S.view.k) < 16) {
    say('Przybliż mapę do zoomu 16, żeby pobrać dane.');
    return;
  }
  const un = window.__unsent ? window.__unsent() : 0;
  if (
    un &&
    !window.__noAsk &&
    !confirm(
      'Masz niewysłane zmiany w edytorze (' +
        un +
        '). Pobranie od nowa wczyta czysty stan z OSM dla tego widoku i je usunie.\n\nKontynuować?',
    )
  )
    return;
  if (!(await refreshLive(null, src))) return;
  push();
  {
    /* pobranie = wczytanie od nowa: drogi OSM z tego widoku sa usuwane i importowane ze swiezych danych (bez duplikatow); sandbox i wlasne drogi zostaja */
    const a = s2w([0, 0]),
      b = s2w([W, H]),
      m = 40,
      x0 = Math.min(a[0], b[0]) - m,
      x1 = Math.max(a[0], b[0]) + m,
      y0 = Math.min(a[1], b[1]) - m,
      y1 = Math.max(a[1], b[1]) + m,
      n0 = S.doc.road.length;
    const before = S.doc.road.slice(),
      inV = (r) => r.osm && !r.sb && r.pts.some((q) => q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1);
    S.doc.road = S.doc.road.filter((r) => !inV(r));
    S.sel = -1;
    S.vsel = -1;
    liveLog('wczytanie od nowa: usunieto ' + (n0 - S.doc.road.length) + ' dr. z widoku');
    let ok = true;
    try {
      importView();
    } catch (e) {
      ok = false;
      liveLog('BLAD importu: ' + ((e && e.stack) || e));
    }
    if (!ok || (n0 > S.doc.road.length && !S.doc.road.some(inV))) {
      S.doc.road = before;
      save();
      ui();
      touch();
      say('Nie udało się wczytać dróg od nowa – zostawiłem poprzedni stan (szczegóły w oknie logu).');
      return;
    }
  }
  save();
  ui();
  touch();
  say(
    src === 'overpass'
      ? 'Wczytano drogi z Overpass dla tego widoku.'
      : 'Wczytano od nowa aktualne dane z OSM dla tego widoku.',
  );
  const lb = $('lcLoad');
  lb.classList.remove('blink');
  void lb.offsetWidth;
  lb.classList.add('blink');
}
window.__loadFresh = loadFresh;
$('lcLoad').onclick = () => loadFresh();
$('lcSend').onclick = () => {
  const o = $('osmSub');
  const on = o.style.display === 'none';
  o.style.display = on ? 'block' : 'none';
  $('lcSend').classList.toggle('act', on);
  if (on && window.__oList) window.__oList();
};
$('lcCopy').onclick = () => $('btnCopyDoc').click();
$('lcDiscard').onclick = async () => {
  let structural = false;
  S.doc.road.forEach((r) => {
    delete r.tg;
    if (r.nw) structural = true;
    if (r.osm && r.nk.some((k) => k == null)) structural = true;
    if (r.osm)
      r.nk.forEach((k, i) => {
        if (k) {
          const [lo, la] = k.split(',').map(Number);
          r.pts[i] = proj(lo, la);
        }
      });
  });
  S.doc.del = [];
  S.dirty = true;
  L = null;
  try {
    save();
  } catch (e) {}
  touch();
  if (structural) {
    window.__noAsk = true;
    try {
      await loadFresh();
    } finally {
      window.__noAsk = false;
    }
  }
  say('Odrzucono niewysłane zmiany');
};
$('lcClr').onclick = () => {
  S.osm.ways.clear();
  S.osm.tiles.clear();
  S.doc = { road: [] };
  S.sel = -1;
  S.vsel = -1;
  S.undo = [];
  S.redo = [];
  S.nodeR = {};
  S.nodeP = {};
  S.forks = [];
  S.forks3 = [];
  try {
    ['edNodeR', 'edNodeP', 'edNodeW'].forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
  try {
    save();
  } catch (e) {}
  S.dirty = true;
  L = null;
  touch();
  say('Wyczyszczono wszystkie dane');
};
$('lcUndo').onclick = () => $('bUndo').click();
$('lcRedo').onclick = () => $('bRedo').click();
$('bImp').onclick = async () => {
  const a = unproj(s2w([0, 0])),
    b = unproj(s2w([W, H])),
    m = 0.0005,
    lo = Math.min(a.lon, b.lon) - m,
    hi = Math.max(a.lon, b.lon) + m,
    la = Math.min(a.lat, b.lat) - m,
    lb = Math.max(a.lat, b.lat) + m;
  const box = [Math.floor(lo / 0.02), Math.floor(hi / 0.02), Math.floor(la / 0.01), Math.floor(lb / 0.01)];
  if ((box[1] - box[0] + 1) * (box[3] - box[2] + 1) > 40) {
    say('Widok za duży – przybliż mapę.');
    return;
  }
  say('Pobieram dane widoku…');
  await loadOsmAround((la + lb) / 2, (lo + hi) / 2, box);
  push();
  importView();
};
try {
  const sv = JSON.parse(localStorage.getItem('edytor-podklad-v1') || 'null');
  if (sv) {
    if (sv.bm && [...$('bm').options].some((x) => x.value === sv.bm)) $('bm').value = sv.bm;
    $('cTile').checked = true;
    /* podklad zawsze wlaczony, pamietany ostatni rodzaj */ if (typeof sv.ax === 'boolean') $('cAx').checked = sv.ax;
    if (typeof sv.an === 'boolean') $('cAn').checked = sv.an;
    if (sv.ra) $('rA').value = sv.ra;
    if (sv.ft) {
      $('fT').value = sv.ft;
      $('fTv').textContent = $('fT').value;
      $('fT2').value = Math.round((+$('fT').value * 80) / 45 / 5) * 5;
      $('fT2v').textContent = $('fT2').value;
    }
  }
} catch (e) {} // zapamietany podklad
$('lcPsB').onclick = () => {
  const d = $('lcPsl'),
    o = d.style.display === 'none';
  d.style.display = o ? '' : 'none';
  $('lcPsB').textContent = o ? '▴' : '▾';
};
for (const id of ['cTile', 'cLay', 'cAx', 'cAn', 'cBlue', 'rA', 'bm'])
  $(id).oninput = () => {
    try {
      localStorage.setItem(
        'edytor-podklad-v1',
        JSON.stringify({
          bm: $('bm').value,
          tile: $('cTile').checked,
          lay: $('cLay').checked,
          ax: $('cAx').checked,
          an: $('cAn').checked,
          ra: $('rA').value,
          ft: $('fT').value,
        }),
      );
    } catch (e) {}
    render();
  };
$('cSm').oninput = () => touch();
$('fP').oninput = () => touch();
$('fT').oninput = () => {
  const v = +$('fT').value;
  try {
    $('bm').oninput();
  } catch (e) {}
  $('fTv').textContent = v;
  $('fT2').value = Math.round((v * 80) / 45 / 5) * 5;
  $('fT2v').textContent = $('fT2').value;
  touch();
}; /* jeden suwak dla wszystkich rozjazdow */
(() => {
  const lc = $('lc');
  $('lcB').onclick = () => lc.classList.toggle('open');
  /* przelaczane tylko klikiem */ const syn = () => {
    if (![...document.querySelectorAll('input[name=bmr]')].some((r) => r.value === $('bm').value))
      $('bm').value = 'orto';
    document.querySelectorAll('input[name=bmr]').forEach((r) => {
      r.checked = r.value === $('bm').value;
    });
  };
  syn();
  document.querySelectorAll('input[name=bmr]').forEach(
    (r) =>
      (r.onchange = () => {
        $('bm').value = r.value;
        $('bm').oninput();
      }),
  );
})();
$('bFinish').onclick = finishDraw;
$('bCancel').onclick = () => setTool('sel');
function finishDraw() {
  if (S.draw && S.draw.pts.length > 1) {
    push();
    S.doc.road.push(newRoad(S.draw.pts, S.draw.nk));
    S.sel = S.doc.road.length - 1;
  }
  setTool('sel');
  save();
  touch();
}
$('bExp').onclick = () => {
  $('io').value = JSON.stringify({ org: S.org, doc: S.doc });
};
$('bImpJ').onclick = () => {
  try {
    const j = JSON.parse($('io').value);
    if (j.org) S.org = j.org;
    S.doc = j.doc || j;
    S.sel = -1;
    save();
    ui();
    touch();
  } catch (e) {
    say('Błędny JSON');
  }
};
$('bClr').onclick = () => {
  push();
  S.doc = { road: [] };
  S.sel = -1;
  save();
  ui();
  touch();
};
$('bPng').onclick = () => {
  try {
    cv.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = 'pasy.png';
      a.click();
    });
  } catch (e) {
    say('Nie można zapisać PNG (podkład z innej domeny).');
  }
};

// ---------- wskaźnik ----------
const ptrs = new Map();
let drag = null,
  pinch = null;
const evp = (e) => {
  const r = cv.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};
function nearVertex(p, tolPx, skipSel) {
  let best = null,
    bd = tolPx;
  S.doc.road.forEach((r, i) =>
    r.pts.forEach((q, vi) => {
      const d = dist(w2s(q), p);
      if (d < bd) {
        bd = d;
        best = { i, vi };
      }
    }),
  );
  return best;
}
function axisDistPx(r, w) {
  let bd = 1e9;
  for (let j = 1; j < r.pts.length; j++) bd = Math.min(bd, segDist(w, r.pts[j - 1], r.pts[j]));
  return bd * S.view.k;
}
function axisProj(r, w) {
  let bd = 1e9,
    bi = 0,
    bp = null;
  for (let j = 1; j < r.pts.length; j++) {
    const a = r.pts[j - 1],
      b = r.pts[j],
      x = b[0] - a[0],
      y = b[1] - a[1],
      l2 = x * x + y * y || 1;
    let t = ((w[0] - a[0]) * x + (w[1] - a[1]) * y) / l2;
    t = Math.max(0, Math.min(1, t));
    const q = [a[0] + x * t, a[1] + y * t],
      d = Math.hypot(w[0] - q[0], w[1] - q[1]);
    if (d < bd) {
      bd = d;
      bi = j - 1;
      bp = q;
    }
  }
  return { i: bi, p: bp, d: bd * S.view.k };
}
window.__polyOf = (r) => {
  const P = r.E0.concat(r.E1.slice().reverse());
  if (r.mids) {
    if (r.mids.e) P.splice(r.E0.length, 0, ...r.mids.e);
    if (r.mids.s) P.push(...r.mids.s);
  }
  return P;
};
function hitRoad(w) {
  const tol = 10 / S.view.k;
  let best = -1,
    bd = 1e9;
  S.doc.road.forEach((r, i) => {
    const hw = Math.max(tol, rw(r) / 2 + 0.3);
    for (let j = 1; j < r.pts.length; j++) {
      const d = segDist(w, r.pts[j - 1], r.pts[j]);
      if (d < hw && d / hw < bd) {
        bd = d / hw;
        best = i;
      }
    }
  });
  return best;
} // trafienie w całą szerokość jezdni, nie tylko w oś
{
  let m0 = null;
  cv.addEventListener(
    'pointerdown',
    (e) => {
      m0 = S.tool === 'meas' && e.button === 0 ? [e.clientX, e.clientY] : null;
    },
    true,
  );
  cv.addEventListener(
    'pointerup',
    (e) => {
      if (S.tool !== 'meas' || !m0) return;
      const mv = Math.hypot(e.clientX - m0[0], e.clientY - m0[1]);
      m0 = null;
      if (mv > 5) return;
      const rc = cv.getBoundingClientRect();
      (S.meas = S.meas || []).push(s2w([e.clientX - rc.left, e.clientY - rc.top]));
      render();
    },
    true,
  );
  cv.addEventListener('dblclick', (e) => {
    if (S.tool === 'meas') {
      S.meas = [];
      render();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (
      S.tool === 'meas' &&
      (e.key === 'Escape' ||
        ((e.key === 'Backspace' || e.key === 'Delete') && document.activeElement.tagName !== 'INPUT'))
    ) {
      if (e.key === 'Escape') S.meas = [];
      else (S.meas || []).pop();
      render();
    }
  });
} /* miarka: klik = punkt, przeciaganie = przesuwanie mapy, Backspace = cofnij punkt, Esc / dwuklik = od nowa */
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, evp(e));
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: dist(a, b), k: S.view.k, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v: { x: S.view.x, y: S.view.y } };
    drag = null;
    return;
  }
  const p = evp(e),
    w = s2w(p);
  if (
    PZ.btn &&
    PZ.sel &&
    S.tool === 'sel' &&
    p[0] >= PZ.btn.x &&
    p[0] <= PZ.btn.x + PZ.btn.w &&
    p[1] >= PZ.btn.y &&
    p[1] <= PZ.btn.y + PZ.btn.h
  ) {
    drag = null;
    const nd = PZ.sel.node;
    let hit = null;
    S.doc.road.forEach((r, ri) =>
      r.pts.forEach((q, vi) => {
        if (!hit && dist(q, nd) < 0.4) hit = [ri, vi];
      }),
    );
    if (hit) pzFocus(hit[0], hit[1]);
    return;
  }
  if (e.button === 1 || e.button === 2 || S.tool === 'pan' || S.tool === 'meas') {
    drag = { m: 'pan', p, v: { x: S.view.x, y: S.view.y } };
    return;
  }
  if (S.tool === 'rend') {
    const sr = S.doc.road[S.sel];
    if (sr) {
      const G = gp(sr);
      for (let i = 0; i < G.length - 1; i++) {
        const a = G[i],
          b = G[i + 1];
        if (dist(w2s([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), p) < 12) {
          push();
          if (!sr.rp) sr.rp = sr.pts.map((q) => q.slice());
          const A = sr.pts[i],
            B = sr.pts[i + 1];
          sr.pts.splice(i + 1, 0, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]);
          sr.nk.splice(i + 1, 0, null);
          sr.rp.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
          S.vsel = i + 1;
          drag = { m: 'rvtx', i: S.sel, vi: i + 1, moved: true };
          ui();
          touch();
          return;
        }
      }
    }
    let best = null,
      bd = 14;
    S.doc.road.forEach((r, i) =>
      gp(r).forEach((q, vi) => {
        const d = dist(w2s(q), p);
        if (d < bd) {
          bd = d;
          best = { i, vi };
        }
      }),
    );
    if (best) {
      push();
      const r = S.doc.road[best.i];
      if (!r.rp) r.rp = r.pts.map((q) => q.slice());
      S.sel = best.i;
      S.vsel = best.vi;
      drag = { m: 'rvtx', i: best.i, vi: best.vi, moved: false, base: r.rp.map((q) => q.slice()) };
      ui();
      render();
      return;
    }
  }
  if (S.tool === 'sel' && laneOn() && S.doc.road[S.sel] && S.doc.road[S.sel].la) {
    // os pasa: przeciaganie punktow, srodek odcinka dodaje punkt
    const lr = S.doc.road[S.sel],
      lg = laneAbs(lr),
      A = lr.la[lg];
    if (A) {
      for (let i = 0; i < A.length; i++)
        if (dist(w2s(A[i]), p) < 12) {
          push();
          drag = { m: 'lax', i: S.sel, g: lg, vi: i };
          return;
        }
      for (let i = 0; i < A.length - 1; i++) {
        const m = [(A[i][0] + A[i + 1][0]) / 2, (A[i][1] + A[i + 1][1]) / 2];
        if (dist(w2s(m), p) < 10) {
          push();
          A.splice(i + 1, 0, m);
          drag = { m: 'lax', i: S.sel, g: lg, vi: i + 1 };
          render();
          return;
        }
      }
    }
  }
  if (S.tool === 'sel') {
    const sr = S.doc.road[S.sel];
    if (sr && !nearVertex(p, 14))
      for (let i = 0; i < sr.pts.length - 1; i++) {
        const a = sr.pts[i],
          b = sr.pts[i + 1];
        if (dist(w2s([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), p) < 12) {
          push();
          sr.pts.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
          sr.nk.splice(i + 1, 0, null);
          if (sr.rp) sr.rp.splice(i + 1, 0, [(sr.rp[i][0] + sr.rp[i + 1][0]) / 2, (sr.rp[i][1] + sr.rp[i + 1][1]) / 2]);
          S.vsel = i + 1;
          drag = { m: 'vtx', i: S.sel, vi: i + 1, moved: true };
          ui();
          touch();
          return;
        }
      }
    const v = nearVertex(p, 14);
    if (v) {
      push();
      S.sel = v.i;
      S.vsel = v.vi;
      drag = { m: 'vtx', i: v.i, vi: v.vi, moved: false, p0: p };
      ui();
      render();
      return;
    }
    if (sr && S.sel >= 0) {
      const w0 = s2w(p),
        pj = axisProj(sr, w0);
      if (pj.d < 8) {
        drag = { m: 'axisIns', i: S.sel, seg: pj.i, p, moved: false };
        return;
      }
    }
  }
  drag = { m: 'maybe', p, v: { x: S.view.x, y: S.view.y }, w };
});
cv.addEventListener('pointermove', (e) => {
  if (S.draw && e.pointerType !== 'touch') {
    S.cur = s2w(evp(e));
    const v = nearVertex(evp(e), 14),
      h = v ? S.doc.road[v.i].pts[v.vi] : null;
    const ch = h !== S.hov;
    S.hov = h;
    if (S.draw.pts.length || ch) render();
  } else if (S.hov) {
    S.hov = null;
    render();
  }
});
cv.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, evp(e));
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()],
      k = Math.max(0.0014, Math.min(200, (pinch.k * dist(a, b)) / pinch.d)),
      c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    S.view.k = k;
    S.view.x = pinch.v.x - (c[0] - pinch.c[0]) / k;
    S.view.y = pinch.v.y - (c[1] - pinch.c[1]) / k;
    render();
    return;
  }
  if (!drag) return;
  const p = evp(e);
  if (drag.m === 'axisIns') {
    if (dist(p, drag.p) < 5) return;
    const r = S.doc.road[drag.i],
      i = drag.seg,
      pj = axisProj(r, s2w(drag.p));
    push();
    r.pts.splice(i + 1, 0, pj.p);
    r.nk.splice(i + 1, 0, null);
    if (r.rp) r.rp.splice(i + 1, 0, [(r.rp[i][0] + r.rp[i + 1][0]) / 2, (r.rp[i][1] + r.rp[i + 1][1]) / 2]);
    S.vsel = i + 1;
    drag = { m: 'vtx', i: drag.i, vi: i + 1, moved: true };
    ui();
  }
  if (drag.m === 'maybe' && dist(p, drag.p) > 6) drag.m = 'pan';
  if (drag.m === 'pan') {
    S.view.x = drag.v.x - (p[0] - drag.p[0]) / S.view.k;
    S.view.y = drag.v.y - (p[1] - drag.p[1]) / S.view.k;
    render();
  } else if (drag.m === 'rvtx') {
    const w = s2w(p),
      rr = S.doc.road[drag.i],
      B = drag.base,
      R0 = Math.max(0, +$('fRo').value || 0),
      dx = w[0] - B[drag.vi][0],
      dy = w[1] - B[drag.vi][1];
    const cum = [0];
    for (let j = 1; j < B.length; j++) cum.push(cum[j - 1] + dist(B[j - 1], B[j]));
    // plynne offsetowanie: sasiednie punkty w promieniu R (po dlugosci drogi) przesuwaja sie z lagodnie malejaca waga
    for (let j = 0; j < B.length; j++) {
      const da = Math.abs(cum[j] - cum[drag.vi]),
        u = R0 > 0 ? Math.max(0, 1 - da / R0) : j === drag.vi ? 1 : 0,
        wg = j === drag.vi ? 1 : u * u * (3 - 2 * u);
      rr.rp[j] = [B[j][0] + dx * wg, B[j][1] + dy * wg];
    }
    drag.moved = true;
    touch();
  } else if (drag.m === 'lax') {
    const w = s2w(p),
      rr = S.doc.road[drag.i];
    if (rr && rr.la && rr.la[drag.g]) {
      rr.la[drag.g][drag.vi] = w;
      drag.moved = true;
      render();
    }
  } else if (drag.m === 'vtx') {
    if (!drag.moved && drag.p0 && dist(p, drag.p0) < 5) return;
    /* prog 5 px: stuknięcie nie przesuwa węzła */ let w = s2w(p);
    const sn = pzSnap(drag, w);
    if (sn) w = sn.w;
    PZ.live = sn;
    moveNode(S.doc.road[drag.i], drag.vi, w[0], w[1]);
    drag.moved = true;
    touch();
  }
});
function endPtr(e) {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.m === 'lax') {
    if (!d.moved) S.undo.pop();
    save();
    render();
    return;
  }
  if (d.m === 'axisIns') {
    hideLanePal();
    S.vsel = -1;
    ui();
    render();
    return;
  }
  if (d.m === 'maybe') {
    if (e.shiftKey && S.tool === 'sel' && !EMBED) {
      /* Shift + klik: zaznaczanie pasow z kilku roznych linii OSM naraz */ const ns = hitRoad(d.w),
        r0 = ns >= 0 ? S.doc.road[ns] : null;
      if (r0 && r0.osm) {
        const ls = laneAt(r0, d.w, ns),
          ab = r0.oneway ? ls.i : ls.r === 0 ? r0.lanes - (r0.nf || 1) + ls.i : r0.lanes - (r0.nf || 1) - 1 - ls.i,
          key = ns + ':' + ab;
        S.msel = S.msel || new Map();
        if (S.msel.has(key)) S.msel.delete(key);
        else S.msel.set(key, { i: ns, q: ab });
        say('Zaznaczone pasy: ' + S.msel.size + ' (Shift + klik dodaje/odznacza, zwykły klik czyści)');
        render();
      }
      return;
    }
    if (S.msel && S.msel.size) {
      S.msel.clear();
    }
    if (S.tool === 'sel' || S.tool === 'rend') {
      const ns = hitRoad(d.w),
        same = ns >= 0 && ns === S.sel;
      S.vsel = -1;
      const onAxis = ns >= 0 && axisDistPx(S.doc.road[ns], d.w) < 9;
      if (S.tool === 'sel' && same && !onAxis && S.doc.road[ns].osm && !EMBED) {
        LANE_ON = true;
        LSEL = laneAt(S.doc.road[ns], d.w, ns);
        ensureLaneAxis(ns, laneAbs(S.doc.road[ns]));
        save();
        ui();
        showLanePal();
      } else {
        S.sel = ns;
        LANE_ON = false;
        hideLanePal();
        ui();
      }
    } else if (S.tool === 'split') {
      const ns = hitRoad(d.w);
      if (ns < 0) {
        say('Kliknij drogę w miejscu podziału.');
      } else {
        const r = S.doc.road[ns];
        let i = -1,
          bd = r.osm ? 1e9 : 14;
        r.pts.forEach((q, j) => {
          if (j > 0 && j < r.pts.length - 1) {
            const dd = dist(w2s(q), w2s(d.w));
            if (dd < bd) {
              bd = dd;
              i = j;
            }
          }
        });
        if (i < 0 && !r.osm) {
          const pj = axisProj(r, d.w);
          if (pj.d < 12) {
            push();
            r.pts.splice(pj.i + 1, 0, pj.p);
            r.nk.splice(pj.i + 1, 0, null);
            if (r.rp) r.rp.splice(pj.i + 1, 0, pj.p.slice());
            i = pj.i + 1;
          } else {
            say('Kliknij na osi drogi.');
          }
        } else if (i < 0)
          say(
            'Ta droga nie ma punktu w środku – dodaj punkt narzędziem Zaznacz (klik w środek odcinka) i rozdziel ponownie.',
          );
        if (i > 0) {
          if (r.osm || !S.undo.length || true) {
            if (!r.nk[i]) r.nk[i] = 'n' + Math.random().toString(36).slice(2, 9);
          }
          push();
          const r2 = JSON.parse(JSON.stringify(r));
          r.pts = r.pts.slice(0, i + 1);
          r.nk = r.nk.slice(0, i + 1);
          r2.pts = r2.pts.slice(i);
          r2.nk = r2.nk.slice(i);
          if (r.rp) {
            r.rp = r.rp.slice(0, i + 1);
            r2.rp = r2.rp.slice(i);
          }
          if (r.osm) r2.nw = true;
          S.doc.road.splice(ns + 1, 0, r2);
          S.sel = ns;
          S.vsel = -1;
          touch();
          say('Droga rozdzielona na dwie części (cofnij: ↶).');
          setTool('sel');
        }
      }
    } else if (S.tool === 'addpt') {
      const ns = hitRoad(d.w);
      if (ns < 0) say('Kliknij drogę w miejscu nowego punktu.');
      else {
        const r = S.doc.road[ns],
          pj = axisProj(r, d.w);
        if (pj.d > 14) say('Kliknij bliżej osi drogi.');
        else {
          push();
          r.pts.splice(pj.i + 1, 0, pj.p);
          r.nk.splice(pj.i + 1, 0, null);
          if (r.rp) r.rp.splice(pj.i + 1, 0, pj.p.slice());
          S.sel = ns;
          S.vsel = pj.i + 1;
          touch();
          say('Dodano punkt (cofnij: ↶). Przeciągniesz go narzędziem Zaznacz.');
        }
      }
    } else if (S.tool === 'osm') {
      const o = osmAt(d.w, 12 / S.view.k);
      if (o && !S.doc.road.some((r) => r.osm === o.id)) {
        push();
        S.doc.road.push(makeRoad(o, 0, o.g.length - 1));
        S.sel = S.doc.road.length - 1;
        setTool('sel');
        touch();
      }
    } else if (S.draw) {
      const v = nearVertex(w2s(d.w), 14);
      let pt = d.w,
        nk = null;
      if (v) {
        const r = S.doc.road[v.i];
        pt = r.pts[v.vi].slice();
        nk = r.nk[v.vi] || null;
        if (!nk) {
          nk = 'n' + Math.random().toString(36).slice(2, 9);
          r.nk[v.vi] = nk;
        }
      }
      S.draw.pts.push(pt);
      S.draw.nk.push(nk);
      render();
    }
  }
  PZ.live = null;
  if (d.m === 'vtx' && !d.moved) {
    PZ.sel = null;
  }
  if ((d.m === 'vtx' || d.m === 'rvtx') && !d.moved) {
    S.undo.pop();
    if (d.m === 'vtx') {
      const rr = S.doc.road[d.i];
      if (rr && rr.pts[d.vi]) {
        const nn = rr.pts[d.vi];
        if (pzDetect(nn)) {
          PZ.sel = { node: nn.slice() };
          render();
        } else if (S.doc.road.filter((o) => o.pts.some((p2) => dist(p2, nn) < 0.4)).length > 1)
          say('To nie jest rozwidlenie: ' + pzWhy(nn) + '.');
      }
    }
    if (d.m === 'rvtx') {
      const r = S.doc.road[d.i];
      if (r && r.rp && r.rp.every((q, j) => q[0] === r.pts[j][0] && q[1] === r.pts[j][1])) delete r.rp;
    }
  }
  save();
  render();
}
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('contextmenu', (e) => e.preventDefault());
let wsT = 0;
cv.addEventListener(
  'wheel',
  (e) => {
    clearTimeout(wsT);
    wsT = setTimeout(save, 400);
    e.preventDefault();
    const p = evp(e),
      w = s2w(p),
      f = Math.exp(-e.deltaY * 0.0015);
    S.view.k = Math.max(0.0014, Math.min(200, S.view.k * f));
    S.view.x = w[0] - (p[0] - W / 2) / S.view.k;
    S.view.y = w[1] - (p[1] - H / 2) / S.view.k;
    render();
  },
  { passive: false },
);
cv.addEventListener('dblclick', (e) => {
  // podwojny klik na wezle usuwa go (cofnij: ↶)
  if (S.tool !== 'sel' || EMBED) return;
  const v = nearVertex(evp(e), 14);
  if (!v) return;
  const r = S.doc.road[v.i];
  if (!r || !r.pts[v.vi]) return;
  push();
  PZ.sel = null;
  r.pts.splice(v.vi, 1);
  r.nk.splice(v.vi, 1);
  if (r.rp) r.rp.splice(v.vi, 1);
  S.vsel = -1;
  if (r.pts.length < 2) {
    S.doc.road.splice(v.i, 1);
    S.sel = -1;
  }
  save();
  ui();
  touch();
  say('Usunięto węzeł (cofnij: ↶).');
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && S.draw && document.activeElement.tagName !== 'INPUT') finishDraw();
  if (e.key === 'Escape') setTool('sel');
});
window.addEventListener('resize', resize);

// ---------- start ----------
(async function () {
  if (EMBED) {
    document.getElementById('panel').style.display = 'none';
    S.tool = EDIT ? 'sel' : 'pan';
    document.getElementById('hint').style.display = 'none';
    if (EDIT) {
      const b = document.createElement('button');
      b.textContent = 'Zeruj';
      b.style.cssText =
        'position:fixed;right:8px;top:8px;z-index:9;padding:6px 10px;border-radius:8px;border:1px solid #888;background:#fff;font:13px system-ui';
      b.onclick = () => {
        try {
          localStorage.removeItem(EKEY);
        } catch (e) {}
        location.reload();
      };
      document.body.appendChild(b);
    }
  }
  resize();
  ui();
  {
    S.org = { lat: 54.4991, lon: 18.4615 };
    /* wezel Chwarzno (Gdynia) */ S.view = { x: 0, y: 0, k: 6 };
    render();
    return;
  } /* sandbox: bez wczytywania danych */
  const h = decodeURIComponent(location.hash || '') + ' ' + location.search;
  let sv = null;
  try {
    sv = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (e) {}
  // adres zgodny z ostatnio zapamietanym widokiem (odswiezenie) -> przywroc zapis; inny #map= (nowy link) -> wczytaj od nowa
  if (
    parseLink(location.hash) &&
    /#map=/.test(h) &&
    !(!EMBED && sv && sv.doc && sv.doc.road && sv.h === location.hash)
  ) {
    $('lnk').value = location.hash;
    await loadLink(h);
    if (EDIT) {
      S.orig = new Map(
        S.doc.road.map((r) => [r.osm + '|' + r.nk[0] + '|' + r.nk[r.nk.length - 1], JSON.stringify(r.pts)]),
      );
      applyEmb();
    }
    return;
  }
  try {
    const s = EMBED ? null : sv;
    if (s && s.doc && s.doc.road) {
      S.doc = s.doc;
      S.view = s.view;
      S.org = s.org;
      $('lnk').value = s.h || '';
      {
        const a = unproj(s2w([0, 0])),
          b = unproj(s2w([W, H]));
        await loadOsmAround(S.org.lat, S.org.lon, [
          Math.floor(Math.min(a.lon, b.lon) / 0.02),
          Math.floor(Math.max(a.lon, b.lon) / 0.02),
          Math.floor(Math.min(a.lat, b.lat) / 0.01),
          Math.floor(Math.max(a.lat, b.lat) / 0.01),
        ]);
      }
      touch();
      say(`Przywrócono ${S.doc.road.length} dróg.`);
      return;
    }
  } catch (e) {}
  say('Wklej link z openstreetmap.org i naciśnij Wczytaj.');
  render();
})();

// ---------- zapis do OSM (OAuth2 PKCE, API 0.6) ----------
if (!EMBED)
  (() => {
    const OSM = 'https://www.openstreetmap.org',
      API = 'https://api.openstreetmap.org/api/0.6',
      REDIR = location.origin + location.pathname;
    const ls = {
      get: (k) => {
        try {
          return localStorage.getItem(k);
        } catch (e) {
          return null;
        }
      },
      set: (k, v) => {
        try {
          localStorage.setItem(k, v);
        } catch (e) {}
      },
      del: (k) => {
        try {
          localStorage.removeItem(k);
        } catch (e) {}
      },
    };
    const st = (t) => {
        $('oSt').textContent = t;
      },
      b64 = (b) =>
        btoa(String.fromCharCode(...new Uint8Array(b)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
    $('oCid').value = ls.get('osm-cid') || '';
    $('oCid').onchange = () => ls.set('osm-cid', $('oCid').value.trim());
    const tok = () => ls.get('osm-tok'),
      who = () => {
        $('oWho').textContent = tok() ? ' ✓ zalogowano' : '';
        $('oLog').textContent = tok() ? 'Wyloguj' : 'Zaloguj';
      };
    who();
    $('oLog').onclick = async () => {
      if (tok()) {
        ls.del('osm-tok');
        who();
        return;
      }
      const cid = $('oCid').value.trim();
      if (!cid) {
        st('Wpisz Client ID.');
        return;
      }
      ls.set('osm-cid', cid);
      const ver = b64(crypto.getRandomValues(new Uint8Array(32))),
        ch = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ver)));
      sessionStorage.setItem('osm-ver', ver);
      sessionStorage.setItem('osm-hash', location.hash);
      try {
        save();
      } catch (e) {}
      location.href = `${OSM}/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(cid)}&redirect_uri=${encodeURIComponent(REDIR)}&scope=${encodeURIComponent('write_api read_prefs')}&code_challenge=${ch}&code_challenge_method=S256`;
    };
    (async () => {
      const m = /[?&]code=([^&]+)/.exec(location.search);
      if (!m) return;
      const ver = sessionStorage.getItem('osm-ver'),
        h = sessionStorage.getItem('osm-hash') || '';
      history.replaceState(null, '', location.pathname + h);
      if (!ver) return;
      try {
        const r = await fetch(`${OSM}/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: decodeURIComponent(m[1]),
            redirect_uri: REDIR,
            client_id: ls.get('osm-cid') || '',
            code_verifier: ver,
          }),
        });
        const j = await r.json();
        if (!j.access_token) throw new Error(JSON.stringify(j));
        ls.set('osm-tok', j.access_token);
        who();
        $('osmx').open = true;
        st('Zalogowano.');
      } catch (e) {
        st('Logowanie nieudane: ' + e.message);
      }
    })();
    const key = (lon, lat) => lon.toFixed(7) + ',' + lat.toFixed(7);
    function moves() {
      // przesunięte węzły OSM: klucz = pierwotne współrzędne, nowe = oś
      const mv = new Map();
      let conflict = 0,
        nodeless = 0;
      S.doc.road.forEach((r) => {
        if (!r.osm) return;
        r.nk.forEach((k, i) => {
          if (!k) return;
          const [lo, la] = k.split(',').map(Number),
            u = unproj(r.pts[i]),
            d = Math.hypot((u.lon - lo) * 111320 * Math.cos((la * Math.PI) / 180), (u.lat - la) * 110540);
          if (d < 0.15) return;
          const o = mv.get(k);
          if (o) {
            if (Math.hypot((u.lon - o.lon) * 70000, (u.lat - o.lat) * 110540) > 0.3) conflict++;
            o.ways.add(r.osm);
          } else mv.set(k, { lon: u.lon, lat: u.lat, d, ways: new Set([r.osm]) });
        });
      });
      return { mv, conflict };
    }
    const sent = new Map(); // droga OSM -> lista kluczy wezlow po ostatniej wysylce
    function structPlan(id, Wk) {
      // dodane/usuniete wezly: porownanie wezlow drog w edytorze z pierwotna lista wezlow drogi OSM
      const edits = [],
        news = [];
      let warn = 0,
        lo = 1e9,
        hi = -1,
        nwAny = S.doc.road.some((r) => r.osm === id && r.nw);
      for (const r of S.doc.road) {
        if (r.osm !== id) continue;
        let nk = r.nk.slice(),
          pts = r.pts.map((q) => q.slice());
        if (!nk.length || nk[0] == null || nk[nk.length - 1] == null) {
          warn++;
          continue;
        }
        let ia = Wk.indexOf(nk[0]),
          ib = Wk.lastIndexOf(nk[nk.length - 1]);
        if (ia < 0 || ib < 0) {
          warn++;
          continue;
        }
        if (ia > ib) {
          nk.reverse();
          pts.reverse();
          ia = Wk.indexOf(nk[0]);
          ib = Wk.lastIndexOf(nk[nk.length - 1]);
          if (ia < 0 || ib < 0 || ia > ib) {
            warn++;
            continue;
          }
        }
        const old = Wk.slice(ia, ib + 1),
          seq = nk.map((k, i) => (k == null ? { pt: pts[i] } : k));
        if (r.nw) {
          news.push({ ia, ib, seq, old, r });
          continue;
        }
        lo = Math.min(lo, ia);
        hi = Math.max(hi, ib);
        if (seq.length === old.length && seq.every((x, i) => x === old[i])) continue;
        edits.push({ ia, ib, seq, old });
      }
      edits.sort((a, b) => a.ia - b.ia);
      const ok = [];
      for (const e of edits) {
        if (ok.length && e.ia < ok[ok.length - 1].ib) {
          warn++;
          continue;
        }
        ok.push(e);
      }
      const all = ok.concat(news),
        keep = new Set(all.flatMap((e) => e.seq.filter((x) => typeof x === 'string'))),
        removed = [...new Set(all.flatMap((e) => e.old).filter((k) => !keep.has(k)))],
        added = all.flatMap((e) => e.seq.filter((x) => typeof x !== 'string'));
      return { edits: ok, removed, added, warn, news, span: news.length && hi >= 0 ? { lo, hi } : null };
    }
    function structCount() {
      let add = 0,
        del = 0,
        spl = 0;
      for (const id of new Set(S.doc.road.filter((r) => r.osm).map((r) => r.osm))) {
        const Wk = sent.get(id) || (osmWay(id) && osmWay(id).nk);
        if (!Wk) continue;
        const pl = structPlan(id, Wk);
        add += pl.added.length;
        del += pl.removed.length;
        spl += pl.news.length;
      }
      return { add, del, spl };
    }
    function tagChanges() {
      const m = new Map();
      S.doc.road.forEach((r) => {
        if (r.osm && r.tg && Object.keys(r.tg).length) m.set(r.osm, { ...(m.get(r.osm) || {}), ...r.tg });
      });
      return m;
    }
    const showList = () => {
      const L = $('oList');
      if (!L || $('osmSub').style.display === 'none') return;
      const { mv } = moves(),
        tg = tagChanges(),
        sc = structCount(),
        rows = [];
      if (mv.size)
        rows.push(
          `Przesunięte węzły: ${mv.size} (maks. ${Math.max(...[...mv.values()].map((v) => v.d)).toFixed(1)} m)`,
        );
      if (sc.add) rows.push(`Nowe węzły: ${sc.add}`);
      if (sc.del) rows.push(`Usunięte węzły: ${sc.del}`);
      if (sc.spl) rows.push(`Rozdzielenia dróg: ${sc.spl}`);
      for (const id of S.doc.del || []) rows.push(`Usunięcie drogi w OSM: way ${id}`);
      for (const [id, t] of tg)
        rows.push(
          `Droga ${id}: ` +
            Object.entries(t)
              .map(([k, v]) => `${k}=${v === null || v === '' ? '(usuń)' : v}`)
              .join(', '),
        );
      L.innerHTML = rows.length
        ? '<b>Do wysłania:</b>' +
          rows.map((r) => '<div>• ' + r.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</div>').join('')
        : 'Brak zmian do wysłania.';
    };
    window.__unsent = () => {
      const { mv } = moves(),
        tg = tagChanges(),
        sc = structCount();
      return mv.size + tg.size + sc.add + sc.del + sc.spl + (S.doc.del || []).length;
    };
    window.__oList = showList;
    setInterval(showList, 1500);
    let sending = false; /* blokada: drugi klik w trakcie wysylki tworzylby duplikaty nowych wezlow/drog */
    $('oSend').onclick = async () => {
      if (sending) {
        st('Wysyłka już trwa – poczekaj.');
        return;
      }
      sending = true;
      $('oSend').disabled = true;
      try {
        await doSend();
      } finally {
        sending = false;
        $('oSend').disabled = false;
      }
    };
    const doSend = async () => {
      const T = tok();
      if (!T) {
        st('Najpierw się zaloguj.');
        return;
      }
      const { mv, conflict } = moves(),
        tgc = tagChanges();
      const sc0 = structCount();
      if (!mv.size && !tgc.size && !sc0.add && !sc0.del && !sc0.spl && !(S.doc.del || []).length) {
        st('Nic do wysłania.');
        return;
      }
      if (conflict) {
        st('Sprzeczne pozycje tego samego węzła – popraw i spróbuj ponownie.');
        return;
      }
      const H = { Authorization: 'Bearer ' + T };
      try {
        st('Pobieram aktualne węzły z OSM…');
        const wayIds = [
            ...new Set([
              ...[...mv.values()].flatMap((v) => [...v.ways]),
              ...tgc.keys(),
              ...S.doc.road.filter((r) => r.osm).map((r) => r.osm),
            ]),
          ],
          nodes = new Map(),
          wayEl = new Map(),
          byId = new Map();
        for (const id of wayIds) {
          const r = await fetch(`${API}/way/${id}/full.json`, { headers: H });
          if (!r.ok) throw new Error('way ' + id + ': ' + r.status);
          for (const e of (await r.json()).elements) {
            if (e.type === 'node') {
              nodes.set(key(e.lon, e.lat), e);
              byId.set(e.id, e);
            } else if (e.type === 'way') wayEl.set(e.id, e);
          }
        }
        S.doc.del = [];
        const delWays = [],
          delSet = new Set(); /* usuwanie calych drog w OSM wylaczone */
        for (const id of delSet) {
          const r = await fetch(`${API}/way/${id}/full.json`, { headers: H });
          if (r.status === 404 || r.status === 410) continue;
          if (!r.ok) throw new Error('way ' + id + ': ' + r.status);
          const els = (await r.json()).elements;
          for (const e of els) {
            if (e.type === 'node') byId.set(e.id, e);
            else if (e.type === 'way') delWays.push(e);
          }
        }
        const mod = [],
          miss = [],
          crt = [],
          dls = [],
          nodeRefs = new Map(),
          newWays = [];
        let tid = 0;
        for (const [id, w] of wayEl) {
          if (delSet.has(id)) continue;
          const Wk = w.nodes.map((i) => byId.get(i)).map((n) => (n ? key(n.lon, n.lat) : null));
          if (Wk.some((k) => k == null)) continue;
          const pl = structPlan(id, Wk);
          if (!pl.edits.length && !pl.news.length) continue;
          const arr = w.nodes.slice(),
            mk = (x) => {
              if (typeof x === 'string') return byId.get(w.nodes[Wk.indexOf(x)]).id;
              const ck = x.pt[0].toFixed(3) + ',' + x.pt[1].toFixed(3);
              let n = crt.find((c) => c.ck === ck);
              if (!n) {
                const u0 = unproj(x.pt),
                  ex = [...byId.values()].find(
                    (e) => e.type === 'node' && Math.hypot((e.lon - u0.lon) * 70000, (e.lat - u0.lat) * 110540) < 0.05,
                  );
                if (ex) return ex.id;
                /* w tym miejscu jest juz wezel OSM (np. po utraconej odpowiedzi serwera) - uzyj go, nie dubluj */ const u =
                  unproj(x.pt);
                n = { tid: --tid, lat: u.lat, lon: u.lon, ck };
                crt.push(n);
              }
              return n.tid;
            };
          for (const nw of pl.news) newWays.push({ id, r: nw.r, refs: nw.seq.map(mk) });
          if (pl.span) arr.splice(pl.span.hi + 1);
          for (const e of pl.edits.slice().reverse()) arr.splice(e.ia, e.ib - e.ia + 1, ...e.seq.map(mk));
          if (pl.span) arr.splice(0, pl.span.lo);
          nodeRefs.set(id, arr);
          for (const k of pl.removed) {
            const n = byId.get(w.nodes[Wk.indexOf(k)]);
            if (n && !dls.some((d) => d.id === n.id)) dls.push(n);
          }
        }
        for (const [k, v] of mv) {
          const n = nodes.get(k);
          if (n) mod.push([n, v, k]);
          else miss.push(k);
        }
        const wmod = [];
        for (const [id, tg] of tgc) {
          const w = wayEl.get(id);
          if (!w) continue;
          const nt = { ...(w.tags || {}) };
          for (const [k, v] of Object.entries(tg)) {
            if (v === null || v === '') delete nt[k];
            else nt[k] = v;
          }
          if (JSON.stringify(Object.entries(nt).sort()) !== JSON.stringify(Object.entries(w.tags || {}).sort()))
            wmod.push([w, nt]);
        }
        for (const [id, arr] of nodeRefs)
          if (!wmod.some(([w]) => w.id === id)) {
            const w = wayEl.get(id);
            wmod.push([w, w.tags || {}]);
          }
        if (!mod.length && !wmod.length && !crt.length && !dls.length && !newWays.length && !delWays.length)
          throw new Error('nic nie pasuje do aktualnych danych OSM (ktoś już to zmienił lub zostało wysłane)');
        const esc = (x) =>
          String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        st('Tworzę zestaw zmian…');
        const cs = await (
          await fetch(`${API}/changeset/create`, {
            method: 'PUT',
            headers: { ...H, 'Content-Type': 'text/xml' },
            body: `<osm><changeset><tag k="created_by" v="mapa-szlakow edytor"/><tag k="comment" v="${esc($('oCom').value || 'Poprawa geometrii')}"/><tag k="source" v="Geoportal ortofotomapa"/></changeset></osm>`,
          }).then((r) => {
            if (!r.ok) throw new Error('changeset: ' + r.status);
            return r.text();
          })
        ).trim();
        const xml = `<osmChange version="0.6" generator="mapa-szlakow">${
          crt.length || newWays.length
            ? `<create>${crt.map((n) => `<node id="${n.tid}" lat="${n.lat.toFixed(7)}" lon="${n.lon.toFixed(7)}" changeset="${cs}"/>`).join('')}${newWays
                .map((nw) => {
                  const w = wayEl.get(nw.id),
                    t = (wmod.find(([x]) => x.id === nw.id) || [w, w.tags || {}])[1];
                  nw.tid = --tid;
                  return `<way id="${nw.tid}" changeset="${cs}">${nw.refs.map((n) => `<nd ref="${n}"/>`).join('')}${Object.entries(
                    t,
                  )
                    .map(([a, b]) => `<tag k="${esc(a)}" v="${esc(b)}"/>`)
                    .join('')}</way>`;
                })
                .join('')}</create>`
            : ''
        }<modify>${wmod
          .map(
            ([w, nt]) =>
              `<way id="${w.id}" version="${w.version}" changeset="${cs}">${(nodeRefs.get(w.id) || w.nodes).map((n) => `<nd ref="${n}"/>`).join('')}${Object.entries(
                nt,
              )
                .map(([a, b]) => `<tag k="${esc(a)}" v="${esc(b)}"/>`)
                .join('')}</way>`,
          )
          .join('')}${mod
          .map(
            ([n, v]) =>
              `<node id="${n.id}" version="${n.version}" lat="${v.lat.toFixed(7)}" lon="${v.lon.toFixed(7)}" changeset="${cs}">${Object.entries(
                n.tags || {},
              )
                .map(([a, b]) => `<tag k="${esc(a)}" v="${esc(b)}"/>`)
                .join('')}</node>`,
          )
          .join('')}</modify>${
          dls.length || delWays.length
            ? `<delete if-unused="true">${delWays.map((w) => `<way id="${w.id}" version="${w.version}" changeset="${cs}"/>`).join('')}${[
                ...dls,
                ...delWays.flatMap((w) =>
                  w.nodes.map((i) => byId.get(i)).filter((n) => n && !(n.tags && Object.keys(n.tags).length)),
                ),
              ]
                .filter((n, q, a) => a.findIndex((m) => m.id === n.id) === q)
                .map(
                  (n) => `<node id="${n.id}" version="${n.version}" lat="${n.lat}" lon="${n.lon}" changeset="${cs}"/>`,
                )
                .join('')}</delete>`
            : ''
        }</osmChange>`;
        st('Wysyłam…');
        const up = await fetch(`${API}/changeset/${cs}/upload`, {
          method: 'POST',
          headers: { ...H, 'Content-Type': 'text/xml' },
          body: xml,
        });
        if (!up.ok) throw new Error('upload: ' + up.status + ' ' + (await up.text()).slice(0, 160));
        const upTxt = await up.text();
        await fetch(`${API}/changeset/${cs}/close`, { method: 'PUT', headers: H });
        for (const [, v, k] of mod)
          S.doc.road.forEach((r) =>
            r.nk.forEach((kk, i) => {
              if (kk === k) r.nk[i] = key(v.lon, v.lat);
            }),
          );
        for (const nw of newWays) {
          const m = new RegExp('<way old_id="' + nw.tid + '" new_id="(\\d+)"').exec(upTxt);
          if (m) {
            nw.r.osm = +m[1];
            delete nw.r.nw;
            delete nw.r.tg;
          }
        }
        {
          const kOf = new Map();
          byId.forEach((n, id) => kOf.set(id, key(n.lon, n.lat)));
          for (const [n, v] of mod) kOf.set(n.id, key(v.lon, v.lat));
          crt.forEach((n) => kOf.set(n.tid, key(n.lon, n.lat)));
          newWays.forEach((nw) => {
            if (nw.r.osm !== nw.id)
              sent.set(
                nw.r.osm,
                nw.refs.map((x) => kOf.get(x)),
              );
          });
          for (const [id, w] of wayEl)
            if (!nodeRefs.has(id))
              sent.set(
                id,
                w.nodes.map((x) => kOf.get(x)),
              ); /* drogi tylko z przesunietymi wezlami: lista wezlow po wysylce (z nowymi pozycjami) - inaczej stara lista dawala 'usuniete wezly' po wysylce */
          for (const [id, arr] of nodeRefs) {
            sent.set(
              id,
              arr.map((x) => kOf.get(x)),
            );
            S.doc.road.forEach((r) => {
              if (r.osm === id)
                r.nk = r.nk.map((k, i) => (k == null ? key(unproj(r.pts[i]).lon, unproj(r.pts[i]).lat) : k));
            });
          }
        }
        for (const w of delWays) S.osm.ways.delete(w.id);
        S.doc.del = [];
        for (const [w, nt] of wmod) {
          const o = osmWay(w.id);
          if (o) o.t = nt;
          S.doc.road.forEach((r) => {
            if (r.osm === w.id) delete r.tg;
          });
        }
        save();
        touch();
        {
          const sb = $('oSend');
          sb.classList.remove('blink');
          void sb.offsetWidth;
          sb.classList.add('blink');
        }
        st(
          `Wysłano: nowych dróg ${newWays.length}, nowych węzłów ${crt.length}, usuniętych węzłów ${dls.length}, usuniętych dróg ${delWays.length}, przesuniętych ${mod.length}, zmienionych dróg ${wmod.length}${miss.length ? `, pominięto ${miss.length}` : ''}. Zestaw zmian: ${OSM}/changeset/${cs}`,
        );
        if (window.__loadFresh) {
          setTimeout(() => {
            S.doc.del = [];
            window.__loadFresh().catch((e) => liveLog('BLAD przeladowania po wysylce: ' + e));
          }, 2500);
        }
      } catch (e) {
        st('Błąd wysyłki: ' + e.message);
        liveLog('start wysylka OSM');
        liveLog('BLAD wysylki: ' + ((e && e.stack) || e));
      }
    };
  })();
