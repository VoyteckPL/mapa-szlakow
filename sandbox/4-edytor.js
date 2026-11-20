'use strict';
// ---------- Sandbox: rysowanie testowych drog z podstawowymi tagami (nigdy nie trafia do OSM: osm = 0) ----------
(() => {
  const HW = ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'secondary'],
    TLV = ['', 'left', 'slight_left', 'through', 'through;right', 'slight_right', 'right'],
    TLN = { '': '–', left: '←', slight_left: '↖', through: '↑', 'through;right': '↑→', slight_right: '↗', right: '→' };
  const PRE = {
    1: ['through', 'right', 'left', 'through;right', 'through;left'],
    2: [
      'through|right',
      'left|through',
      'through|through;right',
      'left|right',
      'through|through',
      'left;through|through',
    ],
    3: [
      'through|through|right',
      'through|right|right',
      'through|through;right|right',
      'left|through|through',
      'left|through|right',
      'through|through|through',
    ],
    4: [
      'through|through|through|right',
      'through|through|right|right',
      'left|through|through|right',
      'left|through|through|through',
      'through|through|through|through',
    ],
    5: ['through|through|through|right|right', 'left|through|through|through|right'],
    6: ['through|through|through|through|right|right'],
  }; // presety turn:lanes dla danej liczby pasow
  const ICP = {
    '': 'M5 10H11',
    through: 'M8 17V4M4 8 8 3 12 8',
    right: 'M5 17V10Q5 6 9 6H12M9 3 13 6 9 9',
    left: 'M11 17V10Q11 6 7 6H4M7 3 3 6 7 9',
    slight_right: 'M5 17 11 6M7 5H12V10',
    slight_left: 'M11 17 5 6M9 5H4V10',
    'through;right': 'M6 17V4M2 8 6 3 10 8M6 12Q6 9 9 9H13M10 6 14 9 10 12',
  };
  const ico = (v, sz = 16) =>
    `<svg width="${sz}" height="${Math.round((sz * 18) / 16)}" viewBox="0 0 16 18" fill="none" stroke="#222" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="${ICP[v] !== undefined ? ICP[v] : ICP['']}"/></svg>`;
  const icoRow = (tl) =>
    tl
      .split('|')
      .map((v) => ico(v.replace(/slight_/, v.indexOf(';') < 0 ? 'slight_' : '')))
      .join(
        '<span style="display:inline-block;width:0;height:16px;border-left:1px dashed #99a;margin:0 2px;vertical-align:middle"></span>',
      );
  const mk = (hw, lanes, tl, name) => ({
    ...newRoad([], []),
    hw,
    lanes,
    tl: tl || '',
    oneway: true,
    lw: LW_CLASS[hw.replace('_link', '')] || 3.5,
    sb: true,
    name: name || '',
  });
  const el = document.createElement('div');
  el.id = 'sbP';
  el.style.cssText =
    'position:fixed;left:10px;top:62px;z-index:14;width:262px;max-height:calc(100% - 80px);overflow:auto;background:#fff;color:#222;border:1px solid #ccd;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25);padding:10px;font:12px system-ui,sans-serif;display:none';
  document.body.appendChild(el);
  el.onpointerdown = (e) => e.stopPropagation();
  el.addEventListener('wheel', (e) => e.stopPropagation());
  const sbSel = () => {
    const r = S.doc.road[S.sel];
    return r && r.sb ? r : null;
  };
  const mut = (f) => {
    push();
    f();
    save();
    ui();
    touch();
    draw();
  };
  /* turn:lanes drog z Sandboxa dopasowuja sie same do geometrii rozjazdu (chyba ze recznie zmienione: r.tlM) */
  const oldLayout = layout;
  layout = function () {
    try {
      const R = S.doc.road,
        ends = new Map();
      R.forEach((r, i) => {
        if (!r.sb || r.osm) return;
        [
          [0, true],
          [r.pts.length - 1, false],
        ].forEach(([j, st]) => {
          const k = r.nk[j];
          if (k) (ends.get(k) || ends.set(k, []).get(k)).push({ i, st });
        });
      });
      for (const [, G] of ends) {
        const ins = G.filter((e) => !e.st),
          outs = G.filter((e) => e.st);
        if (ins.length !== 1 || outs.length !== 2) continue;
        const ri = R[ins[0].i];
        if (ri.tlM || ri.lanes < 1 || ri.lanes > 6) continue;
        const nd = ri.pts[ri.pts.length - 1],
          pv = ri.pts[ri.pts.length - 2],
          sc = (q) => {
            const a = w2s(q);
            return a;
          },
          hs = [sc(nd)[0] - sc(pv)[0], sc(nd)[1] - sc(pv)[1]],
          hl = Math.hypot(hs[0], hs[1]) || 1;
        const info = outs.map((e) => {
          const r = R[e.i],
            q = r.pts[1],
            u = [sc(q)[0] - sc(nd)[0], sc(q)[1] - sc(nd)[1]],
            ul = Math.hypot(u[0], u[1]) || 1,
            cr = (hs[0] * u[1] - hs[1] * u[0]) / (hl * ul),
            dt = (hs[0] * u[0] + hs[1] * u[1]) / (hl * ul);
          return { r, cr, dt };
        });
        const ex = Math.abs(info[0].cr) > Math.abs(info[1].cr) ? info[0] : info[1],
          mn = ex === info[0] ? info[1] : info[0];
        if (Math.abs(ex.cr) < 0.05) continue;
        const A = ri.lanes,
          B = mn.r.lanes,
          C = ex.r.lanes;
        if (B + C !== A && B + C !== A + 1) continue;
        if (B === A || C === A)
          continue; /* jezdnia biegnie dalej z ta sama liczba pasow + boczna droga: skrzyzowanie, nie rozjazd - bez automatycznych turn:lanes */
        const sh = B + C === A + 1,
          left = ex.cr < 0,
          t = [];
        for (let i = 0; i < A; i++) {
          if (left) t.push(i < C - (sh ? 1 : 0) ? 'left' : i === C - 1 && sh ? 'left;through' : 'through');
          else t.push(i < A - C ? 'through' : i === A - C && sh ? 'through;right' : 'right');
        }
        if (!left && sh) {
          t.length = 0;
          for (let i = 0; i < A; i++) t.push(i < B - 1 ? 'through' : i === B - 1 ? 'through;right' : 'right');
        }
        const v = t.join('|');
        if (ri.tl !== v) ri.tl = v;
      }
    } catch (err) {
      /* auto turn:lanes nie moze zepsuc rysowania */
    }
    return oldLayout.apply(this, arguments);
  };
  {
    /* laczenie dwoch koncow drog Sandboxa: druga droga (z ukladem) przesuwa sie do pierwszej, wezly sie scalaja */
    const endAt = (pt) => {
      let best = null,
        bd = 18;
      S.doc.road.forEach((r, i) => {
        if (!r.sb) return;
        [0, r.pts.length - 1].forEach((j) => {
          const d = dist(w2s(r.pts[j]), pt);
          if (d < bd) {
            bd = d;
            best = { i, j };
          }
        });
      });
      return best;
    };
    cv.addEventListener(
      'pointerdown',
      (e) => {
        if (!S.joinMode) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        const rc = cv.getBoundingClientRect(),
          e0 = endAt([e.clientX - rc.left, e.clientY - rc.top]);
        if (!e0) return;
        if (!S.joinPick) {
          S.joinPick = e0;
          render();
          draw();
          return;
        }
        const A = S.joinPick,
          B = e0;
        if (A.i === B.i) {
          S.joinPick = null;
          render();
          draw();
          return;
        }
        push();
        const R = S.doc.road,
          pa = R[A.i].pts[A.j],
          pb = R[B.i].pts[B.j],
          dx = pa[0] - pb[0],
          dy = pa[1] - pb[1],
          gB = R[B.i].grp,
          mvR = R.filter((x) => (gB ? x.grp === gB : x === R[B.i]));
        mvR.forEach((x) => {
          x.pts = x.pts.map((q) => [q[0] + dx, q[1] + dy]);
          if (x.rp) x.rp = x.rp.map((q) => [q[0] + dx, q[1] + dy]);
        });
        const kA = R[A.i].nk[A.j] || 'jn' + Math.random().toString(36).slice(2, 8),
          kB = R[B.i].nk[B.j];
        R[A.i].nk[A.j] = kA;
        R[B.i].nk[B.j] = kA;
        if (kB && kB !== kA)
          R.forEach((x) => {
            x.nk = x.nk.map((k) => (k === kB ? kA : k));
          });
        S.joinMode = false;
        S.joinPick = null;
        S.joinHov = null;
        save();
        ui();
        touch();
        draw();
      },
      true,
    );
    cv.addEventListener('pointermove', (e) => {
      if (!S.joinMode) return;
      const rc = cv.getBoundingClientRect(),
        e0 = endAt([e.clientX - rc.left, e.clientY - rc.top]),
        h = e0 ? S.doc.road[e0.i].pts[e0.j] : null;
      if (h !== S.joinHov) {
        S.joinHov = h;
        render();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && S.joinMode) {
        S.joinMode = false;
        S.joinPick = null;
        S.joinHov = null;
        render();
        draw();
      }
    });
  }
  function tpl(kind) {
    // gotowe uklady testowe w srodku widoku
    const c = s2w([W / 2, H / 2 + 40]),
      u0 = s2w([0, -1]),
      o0 = s2w([0, 0]);
    let ux = u0[0] - o0[0],
      uy = u0[1] - o0[1];
    const L = Math.hypot(ux, uy) || 1;
    ux /= L;
    uy /= L;
    const R = [uy, -ux],
      P = (a, b) => [c[0] + ux * a + R[0] * b, c[1] + uy * a + R[1] * b],
      key = 'sbn' + Math.random().toString(36).slice(2, 8);
    const set = (r, pts, nkIdx) => {
        r.pts = pts;
        r.nk = pts.map((_, i) => (nkIdx.includes(i) ? key : null));
        return r;
      },
      dir = (deg, d) => P(d * Math.cos((deg * Math.PI) / 180), d * Math.sin((deg * Math.PI) / 180)),
      rs = [];
    kind = { f21: 'f:3:2:1', f12: 'f:3:1:2', f22: 'f:3:2:2' }[kind] || kind;
    const mt = /^([fcm]):(\d):(\d)(?::(\d))?$/.exec(kind || '');
    if (mt && mt[1] === 'f') {
      const A = +mt[2],
        B = +mt[3],
        Cn = +mt[4],
        sh = B + Cn === A + 1;
      kind = 'f' + A + B + Cn;
      const tlA = Array.from({ length: A }, (_, i) =>
        i < Cn - (sh ? 1 : 0) ? 'left' : i === Cn - 1 && sh ? 'left;through' : 'through',
      ).join('|');
      /* zjazd odchodzi w lewo (dir 22 st. > 0 = lewa strona jazdy): lewe pasy w lewo, reszta prosto, przy wspolnym pasie left;through */ rs.push(
        set(mk('motorway', A, tlA, 'wjazd'), [P(-90, 0), P(-40, 0), P(0, 0)], [2]),
      );
      rs.push(set(mk('motorway', B, '', 'główna'), [P(0, 0), P(40, 0), P(100, 0)], [0]));
      rs.push(set(mk('motorway_link', Cn, '', 'zjazd'), [P(0, 0), dir(22, 10), dir(22, 60)], [0]));
    }
    if (mt && mt[1] === 'c') {
      const A = +mt[2],
        B = +mt[3];
      rs.push(set(mk('motorway', A, '', 'a'), [P(-90, 0), P(-40, 0), P(0, 0)], [2]));
      rs.push(set(mk('motorway', B, '', 'b'), [P(0, 0), P(40, 0), P(100, 0)], [0]));
    }
    if (mt && mt[1] === 'm') {
      const A = +mt[2],
        B = +mt[3];
      rs.push(set(mk('motorway', A, '', 'główna'), [P(-100, 0), P(-40, 0), P(0, 0)], [2]));
      rs.push(set(mk('motorway_link', B, '', 'dojazd'), [dir(-158, 60), dir(-158, 10), P(0, 0)], [2]));
      rs.push(set(mk('motorway', Math.min(6, A + B), '', 'wylot'), [P(0, 0), P(60, 0), P(120, 0)], [0]));
    }
    const def = {
      f21: ['through|through|right', 3, 2, 1],
      f12: ['through|right|right', 3, 1, 2],
      f22: ['through|through;right|right', 3, 2, 2],
    }[kind];
    if (def) {
      const [tl, ln, lm, le] = def;
      rs.push(set(mk('motorway', ln, tl, 'wjazd'), [P(-90, 0), P(-40, 0), P(0, 0)], [2]));
      rs.push(set(mk('motorway', lm, '', 'główna'), [P(0, 0), P(40, 0), P(100, 0)], [0]));
      rs.push(set(mk('motorway_link', le, '', 'zjazd'), [P(0, 0), dir(22, 10), dir(22, 60)], [0]));
    }
    if (kind === 'merge') {
      rs.push(set(mk('motorway', 2, '', 'główna'), [P(-100, 0), P(-40, 0), P(0, 0)], [2]));
      rs.push(set(mk('motorway_link', 1, '', 'dojazd'), [dir(-158, 60), dir(-158, 10), P(0, 0)], [2]));
      rs.push(set(mk('motorway', 3, '', 'wylot'), [P(0, 0), P(60, 0), P(120, 0)], [0]));
    }
    push();
    for (const r of rs) {
      r.grp = key;
      S.doc.road.push(r);
    }
    S.sel = S.doc.road.length - rs.length;
    save();
    ui();
    touch();
    draw();
  }
  function draw() {
    const r = sbSel(),
      tb = (id, t) =>
        `<button id="${id}" style="padding:3px 7px;margin:2px;border:1px solid #bbc;border-radius:6px;background:#fff;cursor:pointer">${t}</button>`;
    let h = `<div style="display:flex;justify-content:space-between;align-items:center"><b style="color:#3949ab">Sandbox</b><button id="sbX" style="border:0;background:none;font-size:16px;cursor:pointer">×</button></div><div style="color:#667;margin:2px 0 6px">Drogi testowe, nie trafiają do OSM. Najlepiej na tle „Jasne tło".</div>`;
    h +=
      tb('sbDraw', S.tool === 'road' ? 'Rysuję… (Enter = koniec)' : '✎ Rysuj drogę') +
      tb('sbSel', 'Zaznacz') +
      tb('sbClr', 'Wyczyść sandbox') +
      tb('sbJn', S.joinMode ? (S.joinPick ? 'Wskaż drugi koniec…' : 'Wskaż pierwszy koniec…') : '⛓ Złącz końce');
    {
      const W0 = 1.6,
        ic = (A, B, C, kind) => {
          const x0 = 14,
            y = (n) => n * W0;
          let g = '';
          if (kind === 'c') {
            g = `<path d="M${x0 - (A * W0) / 2} 30 L${x0 - (A * W0) / 2} 17 L${x0 - (B * W0) / 2} 8 L${x0 - (B * W0) / 2} 0 L${x0 + (B * W0) / 2} 0 L${x0 + (B * W0) / 2} 8 L${x0 + (A * W0) / 2} 17 L${x0 + (A * W0) / 2} 30Z" fill="#667"/>`;
          } else if (kind === 'f') {
            g = `<path d="M${x0 - (A * W0) / 2} 30 L${x0 - (A * W0) / 2} 14 L${x0 - (B * W0) / 2 - 2} 0 L${x0 + (B * W0) / 2 - 2} 0 L${x0 + (A * W0) / 2} 14 L${x0 + (A * W0) / 2} 30Z" fill="#667"/><path d="M${x0 + (A * W0) / 2 - 2} 16 L${x0 + (A * W0) / 2 + 8} 0 L${x0 + (A * W0) / 2 + 8 + C * W0} 0 L${x0 + (A * W0) / 2 + 2 + C * W0} 20Z" fill="#889"/>`;
          } else {
            g = `<path d="M${x0 - 4 - (A * W0) / 2} 0 L${x0 - 4 + (A * W0) / 2} 0 L${x0 - 4 + (A * W0) / 2} 14 L${x0 + ((A + B) * W0) / 2 - 4} 22 L${x0 + ((A + B) * W0) / 2 - 4} 30 L${x0 - 4 - ((A + B) * W0) / 2} 30 L${x0 - 4 - (A * W0) / 2} 14Z" fill="#667"/><path d="M${x0 + 8 + B * W0} 0 L${x0 + 8} 0 L${x0 - 2} 22 L${x0 + 2 + B * W0} 18Z" fill="#889"/>`;
          }
          return `<svg width="34" height="30" viewBox="0 0 34 30" style="display:block">${g}</svg>`;
        },
        tbi = (k, A, B, C, kind, title) =>
          `<button class="sbTpl" data-k="${k}" title="${title}" style="padding:1px 3px;margin:1px;border:1px solid #bbc;border-radius:5px;background:#fff;cursor:pointer">${ic(A, B, C, kind)}<span style="font-size:9px;color:#556">${title}</span></button>`,
        forks = {},
        chg = [],
        mrg = [];
      for (let A = 1; A <= 6; A++) {
        forks[A] = [];
        for (let B = 1; B <= A; B++)
          for (let C = 1; C <= A; C++)
            if (B + C === A || B + C === A + 1) forks[A].push(tbi(`f:${A}:${B}:${C}`, A, B, C, 'f', `${A}→${B}+${C}`));
      }
      for (let A = 1; A <= 6; A++)
        for (let B = 1; B <= 6; B++) if (A !== B) chg.push(tbi(`c:${A}:${B}`, A, B, 0, 'c', `${A}→${B}`));
      for (let A = 1; A <= 5; A++)
        for (let B = 1; A + B <= 6; B++) mrg.push(tbi(`m:${A}:${B}`, A, B, 0, 'm', `${A}+${B}→${A + B}`));
      h +=
        `<div style="margin-top:6px"><b>Gotowe układy</b>` +
        tb('sbT1', '3→2+1') +
        tb('sbT2', '3→1+2') +
        tb('sbT3', '3→2+2') +
        tb('sbT4', 'Włączenie') +
        [1, 2, 3, 4, 5, 6]
          .map(
            (A) =>
              `<details><summary>Rozjazd z ${A} ${A === 1 ? 'pasa' : 'pasów'}</summary>${forks[A].join('')}</details>`,
          )
          .join('') +
        `<details><summary>Zmiana liczby pasów</summary>${chg.join('')}</details><details><summary>Włączenia</summary>${mrg.join('')}</details></div>`;
    }
    if (!r)
      h += `<div style="margin-top:8px;color:#667">Narysuj drogę (kliknięcia, Enter) albo zaznacz drogę sandboxu, by edytować tagi. Koniec drogi na istniejącym węźle łączy drogi.</div>`;
    else {
      const n = r.lanes | 0,
        tk = (r.tl || '').split('|');
      while (tk.length < n) tk.push('');
      tk.length = n;
      h +=
        `<div style="margin-top:8px"><b>Tagi zaznaczonej drogi</b><div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;margin-top:4px">` +
        `<span>highway</span><select id="sbHw">${HW.map((x) => `<option ${x === r.hw ? 'selected' : ''}>${x}</option>`).join('')}</select>` +
        `<span>lanes</span><input id="sbLn" type="number" min="1" max="6" value="${n}" style="width:60px">` +
        `<span>oneway</span><label><input id="sbOw" type="checkbox" ${r.oneway ? 'checked' : ''}> yes</label></div>` +
        `<div style="margin-top:6px">turn:lanes (od lewej)</div><div style="display:flex;gap:3px;flex-wrap:wrap">${tk.map((v, i) => `<select class="sbTl" data-i="${i}" title="pas ${i + 1}" style="font-size:16px;width:70px">${TLV.map((x) => `<option value="${x}" ${x === v ? 'selected' : ''}>${TLN[x]}</option>`).join('')}</select>`).join('')}</div>` +
        `<input id="sbTx" value="${(r.tl || '').replace(/"/g, '&quot;')}" placeholder="turn:lanes np. through|through|right" style="width:100%;box-sizing:border-box;margin-top:4px">` +
        `<div style="margin-top:4px">${(PRE[n] || []).map((v, i) => tb('sbP' + i, icoRow(v)).replace('<button ', `<button title="${v}" `)).join('')}</div>${r.grp ? `<div style="margin-top:6px"><b>Układ</b> ${tb('sbMl', '←')}${tb('sbMu', '↑')}${tb('sbMd', '↓')}${tb('sbMr', '→')} ${tb('sbRl', '⟲')}${tb('sbRr', '⟳')} <span style="color:#667">5 m / 15°</span> ${tb('sbDg', 'Usuń cały układ')}</div>` : ''}<div style="margin-top:6px">szer. pasa: ${tb('sbWL', '◀')} <b>${(+(r.lw || 3.5)).toFixed(2)} m</b> ${tb('sbWR', '▶')}${r.grp ? tb('sbWG', 'cały układ') : ''}</div><div style="margin-top:6px">offset: ${tb('sbOL', '◀')} <b>${(() => {
          const nl = r.lanes | 0,
            base = offBase(r),
            cur = r.off != null ? +r.off : base;
          return (cur > 0 ? '+' : '') + cur + ' pasa' + (r.off == null ? ' (auto)' : '');
        })()}</b> ${tb('sbOR', '▶')}${r.off != null ? tb('sbOA', 'auto') : ''}${tb('sbOC', 'Kopiuj dane')}</div><div style="margin-top:4px">${tb('sbRev', 'Odwróć kierunek')}${tb('sbDel', 'Usuń drogę')}</div></div>`;
    }
    el.innerHTML = h;
    const $$ = (id) => el.querySelector('#' + id);
    $$('sbX').onclick = () => {
      el.style.display = 'none';
    };
    $$('sbDraw').onclick = () => {
      setTool('road');
      draw();
    };
    $$('sbSel').onclick = () => {
      setTool('sel');
      draw();
    };
    $$('sbJn').onclick = () => {
      S.joinMode = !S.joinMode;
      S.joinPick = null;
      S.joinHov = null;
      if (S.joinMode) setTool('sel');
      render();
      draw();
    };
    $$('sbClr').onclick = () => {
      if (!S.doc.road.some((x) => x.sb)) return;
      push();
      S.doc.road = S.doc.road.filter((x) => !x.sb);
      S.sel = -1;
      save();
      ui();
      touch();
      draw();
    };
    ['f21', 'f12', 'f22', 'merge'].forEach((k, i) => {
      $$('sbT' + (i + 1)).onclick = () => tpl(k);
    });
    el.querySelectorAll('.sbTpl').forEach((b) => {
      b.onclick = () => tpl(b.dataset.k);
    });
    if (r) {
      $$('sbHw').onchange = () =>
        mut(() => {
          r.hw = $$('sbHw').value;
          r.lw = LW_CLASS[r.hw.replace('_link', '')] || 3.5;
        });
      $$('sbLn').onchange = () =>
        mut(() => {
          r.lanes = Math.max(1, Math.min(6, parseInt($$('sbLn').value) || 1));
          r.tl = '';
          r.tlM = false;
        });
      $$('sbOw').onchange = () =>
        mut(() => {
          r.oneway = $$('sbOw').checked;
        });
      el.querySelectorAll('.sbTl').forEach((sel) => {
        sel.onchange = () =>
          mut(() => {
            const a = (r.tl || '').split('|');
            while (a.length < (r.lanes | 0)) a.push('');
            a.length = r.lanes | 0;
            a[+sel.dataset.i] = sel.value;
            r.tlM = true;
            r.tl = a.every((x) => !x) ? '' : a.join('|');
          });
      });
      $$('sbTx').onchange = () =>
        mut(() => {
          r.tl = $$('sbTx').value.trim();
          r.tlM = true;
          const n = r.tl ? r.tl.split('|').length : 0;
          if (n >= 1 && n <= 6) r.lanes = n;
        });
      (PRE[r.lanes | 0] || []).forEach((v, i) => {
        $$('sbP' + i).onclick = () =>
          mut(() => {
            r.tl = v;
            r.tlM = true;
          });
      });
      if (r.grp) {
        const grp = () => S.doc.road.filter((x) => x.grp === r.grp),
          mv = (dxp, dyp) =>
            mut(() => {
              const a = s2w([0, 0]),
                b2 = s2w([dxp, dyp]),
                dx = b2[0] - a[0],
                dy = b2[1] - a[1];
              grp().forEach((x) => {
                x.pts = x.pts.map((q) => [q[0] + dx, q[1] + dy]);
                if (x.rp) x.rp = x.rp.map((q) => [q[0] + dx, q[1] + dy]);
              });
            }),
          step = 5 * S.view.k,
          rot = (deg) =>
            mut(() => {
              const all = grp().flatMap((x) => x.pts),
                cx = all.reduce((t, q) => t + q[0], 0) / all.length,
                cy = all.reduce((t, q) => t + q[1], 0) / all.length,
                sgn = s2w([0, 1])[1] - s2w([0, 0])[1] > 0 ? 1 : -1,
                an = ((deg * Math.PI) / 180) * sgn,
                co = Math.cos(an),
                si = Math.sin(an),
                f = (q) => [cx + (q[0] - cx) * co - (q[1] - cy) * si, cy + (q[0] - cx) * si + (q[1] - cy) * co];
              grp().forEach((x) => {
                x.pts = x.pts.map(f);
                if (x.rp) x.rp = x.rp.map(f);
              });
            });
        $$('sbMl').onclick = () => mv(-step, 0);
        $$('sbMr').onclick = () => mv(step, 0);
        $$('sbMu').onclick = () => mv(0, -step);
        $$('sbMd').onclick = () => mv(0, step);
        $$('sbDg').onclick = () =>
          mut(() => {
            const g = r.grp;
            S.doc.road = S.doc.road.filter((x) => x.grp !== g);
            S.sel = -1;
          });
        $$('sbRl').onclick = () => rot(-15);
        $$('sbRr').onclick = () => rot(15);
      }
      {
        const setW = (v, all) =>
          mut(() => {
            v = Math.max(2.5, Math.min(5, Math.round(v * 100) / 100));
            (all && r.grp ? S.doc.road.filter((x) => x.grp === r.grp) : [r]).forEach((x) => {
              x.lw = v;
            });
          });
        $$('sbWL').onclick = () => setW((r.lw || 3.5) - 0.25, false);
        $$('sbWR').onclick = () => setW((r.lw || 3.5) + 0.25, false);
        if ($$('sbWG')) $$('sbWG').onclick = () => setW(r.lw || 3.5, true);
      }
      $$('sbOC').onclick = () => {
        const t = 'OFFSET-DO-REGULY\n' + window.offsetReport(r);
        try {
          navigator.clipboard.writeText(t);
          $$('sbOC').textContent = 'Skopiowano ✓';
        } catch (e) {
          $$('sbOC').textContent = 'Nie udało się';
        }
      };
      {
        const cur0 = () => {
          const nl = r.lanes | 0,
            base = offBase(r);
          return r.off != null ? +r.off : base;
        };
        $$('sbOL').onclick = () =>
          mut(() => {
            r.off = cur0() - 0.5;
          });
        $$('sbOR').onclick = () =>
          mut(() => {
            r.off = cur0() + 0.5;
          });
        if ($$('sbOA'))
          $$('sbOA').onclick = () =>
            mut(() => {
              delete r.off;
            });
      }
      $$('sbRev').onclick = () =>
        mut(() => {
          r.pts.reverse();
          r.nk.reverse();
          if (r.rp) r.rp.reverse();
        });
      $$('sbDel').onclick = () =>
        mut(() => {
          S.doc.road.splice(S.sel, 1);
          S.sel = -1;
        });
    }
  }
  const lc = document.getElementById('lcP');
  /* przycisk Sandboxa usuniety (panel #sbP nigdy sie nie pokazuje) */
  const oldFinish = finishDraw;
  finishDraw = function () {
    const n0 = S.doc.road.length;
    oldFinish();
    for (let i = n0; i < S.doc.road.length; i++) {
      const r = S.doc.road[i];
      if (!r.osm) {
        r.sb = true;
        r.oneway = true;
        r.hw = 'motorway';
        r.lw = 3.75;
        r.lanes = 3;
      }
    }
    save();
    draw();
  };
  document.addEventListener('pointerup', (e) => {
    if (el.contains(e.target)) return;
    /* klik w panelu nie przerysowuje go (zamykalby otwarta liste) */ setTimeout(() => {
      if (el.style.display !== 'none' && !el.contains(document.activeElement)) draw();
    }, 50);
  });
})();

// ---------- pasek offsetu dla zaznaczonej drogi: strzalki + kopiowanie danych do reguly ----------
(() => {
  const bar = document.createElement('div');
  bar.id = 'offBar';
  bar.style.cssText =
    'position:fixed;left:10px;bottom:10px;z-index:14;max-width:330px;background:#fff;border:1px solid #bbc;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.2);padding:8px 10px;font:13px system-ui,sans-serif;display:none';
  document.body.appendChild(bar);
  const bt = (id, t, tip) =>
    `<button id="${id}" title="${tip || ''}" style="padding:3px 8px;margin:2px;border:1px solid #bbc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px">${t}</button>`;
  const baseOf = (r) => offBase(r),
    curOf = (r) => (r.off != null && r.off !== '' ? +r.off : baseOf(r));
  const info = (r) => {
    const R = S.doc.road,
      ends = [
        [0, 'poczatek'],
        [r.pts.length - 1, 'koniec'],
      ].map(([j, nm]) => {
        const k = r.nk[j],
          o = k ? R.filter((x) => x !== r && x.nk.includes(k)) : [];
        return (
          nm +
          ': ' +
          (o.length
            ? o
                .map(
                  (x) => `${x.hw || '?'} ${x.lanes} pasy${x.oneway ? ' jednokier.' : ''}${x.tl ? ' tl=' + x.tl : ''}`,
                )
                .join(' + ')
            : 'WOLNY (nic sie nie laczy)')
        );
      });
    return [
      `droga: ${r.hw || '?'}, ${r.lanes} pasy, ${r.oneway ? 'jednokierunkowa' : 'dwukierunkowa'}, szer. pasa ${r.lw} m`,
      `turn:lanes: ${r.tl || '(brak)'}${r.tlb ? ' | backward: ' + r.tlb : ''}`,
      `offset automatyczny: ${baseOf(r)} pasa; offset ustawiony: ${curOf(r)} pasa${r.off != null && r.off !== '' ? ' (reczny)' : ' (auto)'}`,
      ...ends,
      `sandbox: ${r.sb ? 'tak' : 'nie'}`,
    ].join('\n');
  };
  const copy = (txt) => {
    let ok = false;
    try {
      navigator.clipboard.writeText(txt);
      ok = true;
    } catch (e) {}
    if (!ok) {
      const ta = document.getElementById('offTa');
      if (ta) {
        ta.select();
        try {
          ok = document.execCommand('copy');
        } catch (e) {}
      }
    }
    return ok;
  };
  window.offsetReport = info;
  function draw() {
    const r = S.doc.road[S.sel];
    if (true || !r || r.sb) {
      bar.style.display = 'none';
      return;
    } /* okienko Offset wylaczone (na prosbe) */
    bar.style.display = 'block';
    const cur = curOf(r),
      txt = 'OFFSET-DO-REGULY\n' + info(r);
    bar.innerHTML =
      `<div style="font-weight:600;color:#3949ab">Offset: ${r.name || r.hw || 'droga'} · ${r.lanes} pasy</div>` +
      `<div>${bt('obL', '◀', 'o pół pasa w lewo')} <b>${cur > 0 ? '+' : ''}${cur} pasa${r.off == null ? ' (auto)' : ''}</b> ${bt('obR', '▶', 'o pół pasa w prawo')}${hasOff(r) ? bt('obA', 'auto') : ''}</div>` +
      `<div>początek ${bt('obSL', '◀')} <b>${offAt(r, 0)}</b> ${bt('obSR', '▶')} koniec ${bt('obEL', '◀')} <b>${offAt(r, 1)}</b> ${bt('obER', '▶')}</div>` +
      `<div>${bt('obC', 'Kopiuj dane dla Claude')}<span id="obM" style="color:#2a8a2a"></span></div><textarea id="offTa" readonly style="width:100%;height:0;opacity:0;position:absolute"></textarea>`;
    const step = (dv) => {
      push();
      r.off = curOf(r) + dv;
      delete r.offS;
      delete r.offE;
      save();
      touch();
      draw();
    };
    const stepE = (k, dv) => {
      push();
      r[k] = (r[k] != null ? +r[k] : curOf(r)) + dv;
      save();
      touch();
      draw();
    };
    document.getElementById('obSL').onclick = () => stepE('offS', -0.5);
    document.getElementById('obSR').onclick = () => stepE('offS', 0.5);
    document.getElementById('obEL').onclick = () => stepE('offE', -0.5);
    document.getElementById('obER').onclick = () => stepE('offE', 0.5);
    document.getElementById('obL').onclick = () => step(-0.5);
    document.getElementById('obR').onclick = () => step(0.5);
    if (document.getElementById('obA'))
      document.getElementById('obA').onclick = () => {
        push();
        delete r.off;
        delete r.offS;
        delete r.offE;
        save();
        touch();
        draw();
      };
    document.getElementById('obC').onclick = () => {
      const ta = document.getElementById('offTa');
      ta.value = 'OFFSET-DO-REGULY\n' + info(r);
      const ok = copy(ta.value);
      document.getElementById('obM').textContent = ok ? ' skopiowano ✓' : ' zaznacz i skopiuj ręcznie';
      if (!ok) {
        ta.style.cssText = 'width:100%;height:120px;position:static;opacity:1';
        ta.select();
      }
    };
  }
  const oldUi = ui;
  ui = function () {
    const r0 = oldUi.apply(this, arguments);
    try {
      draw();
    } catch (e) {}
    return r0;
  };
  draw();
})();

// ---------- panel Edytor: narzedzia linii (rozdziel / rysuj) i pasy z turn:lanes w ikonach ----------
(() => {
  const el = document.createElement('div');
  el.id = 'edP';
  el.style.cssText =
    'position:fixed;left:10px;top:10px;z-index:6;width:186px;max-height:calc(100vh - 80px);overflow:auto;box-sizing:border-box;background:rgba(255,255,255,.96);border:1px solid #ccd;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.2);color:#222;padding:5px 7px;font-size:11px;display:none';
  let manual = false; /* popup w prawym gornym rogu: pokazuje sie przy zaznaczonej drodze (albo recznie przyciskiem Edytor) */
  const ICP = {
    '': 'M5 10H11',
    through: 'M8 17V4M4 8 8 3 12 8',
    right: 'M5 17V10Q5 6 9 6H12M9 3 13 6 9 9',
    left: 'M11 17V10Q11 6 7 6H4M7 3 3 6 7 9',
    slight_right: 'M5 17 11 6M7 5H12V10',
    slight_left: 'M11 17 5 6M9 5H4V10',
    'through;right': 'M6 17V4M2 8 6 3 10 8M6 12Q6 9 9 9H13M10 6 14 9 10 12',
    'through;left': 'M10 17V4M6 8 10 3 14 8M10 12Q10 9 7 9H3M6 6 2 9 6 12',
    reverse: 'M11 17V7Q11 3 8 3Q5 3 5 7V13M2 10 5 14 8 10',
    merge_to_left: 'M12 17 6 4M2.5 8 5.5 3 9.5 6',
    merge_to_right: 'M4 17 10 4M13.5 8 10.5 3 6.5 6',
  };
  const norm = (v) => {
    if (ICP[v] !== undefined) return v;
    const t = (v || '').split(';').map((x) => x.replace('sharp_', '')),
      h = (x) => t.includes(x);
    if (h('merge_to_left')) return 'merge_to_left';
    if (h('merge_to_right')) return 'merge_to_right';
    if (h('through') && (h('left') || h('slight_left'))) return 'through;left';
    if (h('through') && (h('right') || h('slight_right'))) return 'through;right';
    return ICP[t[0]] !== undefined ? t[0] : '';
  };
  const NAMES = {
    '': 'brak strzałki',
    through: 'prosto',
    left: 'w lewo',
    slight_left: 'lekko w lewo',
    right: 'w prawo',
    slight_right: 'lekko w prawo',
    'through;left': 'prosto i w lewo',
    'through;right': 'prosto i w prawo',
    reverse: 'zawracanie',
    merge_to_left: 'zlewa się w lewo',
    merge_to_right: 'zlewa się w prawo',
  };
  const ico = (v, sz = 12) =>
    `<svg width="${sz}" height="${Math.round((sz * 18) / 16)}" viewBox="0 0 16 18" fill="none" stroke="#222" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex:none"><path d="${ICP[norm(v)]}"/></svg>`;
  const svg = (d, c) =>
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="${d}"/></svg>`;
  const TOOLI = {
    sel: ['M5 3l13 8-6 2-3 6z', '#3949ab', 'Zaznacz / przesuwaj'],
    split: [
      'M6 6a2 2 0 100 4 2 2 0 000-4zM6 14a2 2 0 100 4 2 2 0 000-4zM8 9l12 9M8 15l12-9',
      '#e53935',
      'Rozdziel drogę na dwie części',
    ],
    road: ['M4 20l1-4L16 5l3 3L8 19zM14 7l3 3', '#43a047', 'Rysuj drogę'],
    addpt: ['M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3M12 19v3M2 12h3M19 12h3', '#fb8c00', 'Dodaj punkt na osi drogi'],
    meas: [
      'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
      '#ff6d00',
      'Miarka: klikaj punkty, pokaże długość (Backspace cofa punkt, Esc / dwuklik czyści)',
    ],
  };
  let open = null;
  /* droga OSM: zmiany ida przez tagi (r.tg), zeby trafily na liste "Do wyslania"; inne drogi: bezposrednio */
  const tlOf = (r) => {
    const n = Math.max(1, Math.min(6, r.lanes | 0)),
      t = ((r.osm ? effTags(r)['turn:lanes'] : r.tl) || '').split('|');
    while (t.length < n) t.push('');
    t.length = n;
    return t;
  };
  const setLanes = (r, n, t) => {
    t.length = n;
    while (t.length < n) t.push('');
    const any = t.some((x) => x),
      val = any ? t.join('|') : '';
    if (r.osm) {
      const st = (k, v) => {
        r.tg = r.tg || {};
        const b = baseTags(r)[k] || '';
        if ((v === null ? '' : v) === b) delete r.tg[k];
        else r.tg[k] = v;
      };
      st('lanes', String(n));
      st('turn:lanes', any ? val : null);
      if (!Object.keys(r.tg).length) delete r.tg;
      applyTags(r);
    } else {
      r.lanes = n;
      r.tl = val;
      r.tlM = true;
    }
  };
  const dirsOf = (r) => {
    const tg = r.osm ? effTags(r) : null,
      tok = (key, loc, n) => {
        const t = String((tg ? tg[key] : loc) || '').split('|');
        if (!(tg ? tg[key] : loc)) t.length = 0;
        while (t.length < n) t.push('');
        t.length = n;
        return t;
      }; /* kierunki ruchu drogi: jednokierunkowa = jeden wiersz, dwukierunkowa = w przod (kierunek rysowania) i w tyl */
    const NL = Math.max(1, Math.min(12, r.lanes | 0));
    if (r.oneway) {
      const n = Math.min(6, NL);
      return [{ d: 'o', lab: '', n, t: tok('turn:lanes', r.tl, n) }];
    }
    const nf = Math.max(0, Math.min(NL, r.nf == null ? Math.round(NL / 2) : r.nf)),
      nb = NL - nf;
    return [
      { d: 'f', lab: 'w przód', n: nf, t: tok('turn:lanes:forward', r.tl, nf) },
      { d: 'b', lab: 'w tył', n: nb, t: tok('turn:lanes:backward', r.tlb, nb) },
    ];
  };
  const setDir = (r, d, n, t) => {
    if (d === 'o') return setLanes(r, n, t);
    t.length = n;
    while (t.length < n) t.push('');
    const any = t.some((x) => x),
      val = any ? t.join('|') : '',
      D = dirsOf(r),
      nf = d === 'f' ? n : D[0].n,
      nb = d === 'b' ? n : D[1].n;
    if (r.osm) {
      const st = (k, v) => {
        r.tg = r.tg || {};
        const b = baseTags(r)[k] || '';
        if ((v === null ? '' : v) === b) delete r.tg[k];
        else r.tg[k] = v;
      };
      st('lanes', String(nf + nb));
      st('lanes:forward', String(nf));
      st('lanes:backward', String(nb));
      st(d === 'f' ? 'turn:lanes:forward' : 'turn:lanes:backward', any ? val : null);
      if (!Object.keys(r.tg).length) delete r.tg;
      applyTags(r);
    } else {
      r.lanes = nf + nb;
      r.nf = nf;
      if (d === 'f') r.tl = val;
      else r.tlb = val;
      r.tlM = true;
    }
  };
  const tbn = (id, inner, act, tip, w) =>
    `<button id="${id}" title="${tip}" style="padding:2px 5px;margin:1px;border:1px solid ${act ? '#3949ab' : '#bbc'};border-radius:6px;background:${act ? '#e8eaf6' : '#fff'};cursor:pointer;font-size:12px;height:24px;box-sizing:border-box;min-width:${w || 26}px">${inner}</button>`;
  function draw() {
    const r = S.doc.road[S.sel] || null,
      $$ = (id) =>
        el.querySelector(
          '#' + id,
        ); /* pasy i strzalki na kazdym typie drogi (tez dwukierunkowej: osobno w przod i w tyl) */
    let h =
      `<div style="color:#3949ab;margin:0;font-weight:700;font-size:11px;letter-spacing:.03em">LINIE</div><div>` +
      Object.entries(TOOLI)
        .map(([k, v]) => tbn('edT_' + k, svg(v[0], v[1]), S.tool === k, v[2]))
        .join('') +
      tbn(
        'edDel',
        svg('M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3', '#e53935'),
        0,
        'Usuń zaznaczoną drogę (z potwierdzeniem)',
      ) +
      `</div>`;
    {
      const rw0 = S.doc.road[S.sel];
      if (rw0) {
        const nl = Math.max(1, rw0.lanes | 0),
          tw = (rw0.lw || 3.5) * nl;
        h += `<div style="color:#3949ab;margin:6px 0 0;font-weight:700;font-size:11px;letter-spacing:.03em">SZEROKOŚĆ DROGI</div><div style="display:flex;align-items:center;gap:6px"><button id="edWm" title="Węziej o 0,1 m" style="width:24px;height:24px;padding:0;font-size:16px;line-height:1">−</button><input type="range" id="edW" min="2" max="20" step="0.1" value="${Math.min(20, tw).toFixed(1)}" style="flex:1;min-width:0;width:70px"><button id="edWp" title="Szerzej o 0,1 m" style="width:24px;height:24px;padding:0;font-size:16px;line-height:1">+</button><b id="edWt" style="min-width:3.2em;text-align:right;font-size:11px;font-variant-numeric:tabular-nums">${tw.toFixed(1)} m</b></div><div id="edWl" style="color:#667;font-size:11px">${nl} × ${(rw0.lw || 3.5).toFixed(2)} m na pas</div>`;
      }
    }
    if (r) {
      if (r.osm) {
        const t = effTags(r),
          sel = (id, v, lab) =>
            `<label style="display:flex;align-items:center;gap:4px;margin-top:2px"><span style="width:2.6em;color:#667;font-size:11px">${lab}</span><select id="${id}" style="flex:1;min-width:0;font-size:11px;padding:1px">` +
            [
              ['', 'brak'],
              ['lane', 'pas'],
              ['track', 'droga przy jezdni'],
              ['shared_lane', 'sierżant'],
              ['share_busway', 'buspas'],
              ['opposite_lane', 'kontrapas'],
              ['no', 'bez DDR'],
            ]
              .map(([k, n]) => `<option value="${k}"${(v || '') === k ? ' selected' : ''}>${n}</option>`)
              .join('') +
            `</select></label>`,
          L0 = t['cycleway:left'] || t['cycleway:both'] || t.cycleway || '',
          R0 = t['cycleway:right'] || t['cycleway:both'] || t.cycleway || '';
        h +=
          `<div style="color:#3949ab;margin:6px 0 0;font-weight:700;font-size:11px;letter-spacing:.03em">ROWERY</div>` +
          sel('edCyL', L0, 'lewa') +
          sel('edCyR', R0, 'prawa') +
          (r.oneway
            ? `<label style="display:flex;align-items:center;gap:4px;margin-top:2px;font-size:11px"><input type="checkbox" id="edCyC"${t['oneway:bicycle'] === 'no' ? ' checked' : ''}> kontraruch (pod prąd)</label>`
            : '');
      }
      h += `<div style="color:#3949ab;margin:6px 0 0;font-weight:700;font-size:11px;letter-spacing:.03em">PASY I TURN:LANES</div>`;
      for (const D of dirsOf(r)) {
        const a = D.t,
          n = D.n;
        h += `<div style="margin-top:3px">${D.lab ? `<span style="color:#667;font-size:11px;display:inline-block;min-width:4.5em">${D.lab}</span>` : ''}${tbn('edLm_' + D.d, '−', 0, 'mniej pasów', 22)}<b style="margin:0 5px">${n}</b>${tbn('edLp_' + D.d, '+', 0, 'więcej pasów', 22)}</div>`;
        h +=
          `<div style="margin-top:2px;display:flex;gap:2px;flex-wrap:wrap">` +
          a
            .map(
              (v, i) =>
                `<button class="edI" data-d="${D.d}" data-i="${i}" title="Pas ${i + 1}: ${NAMES[norm(v)] || v}. Klik: zmień strzałkę" style="height:24px;box-sizing:border-box;padding:2px 4px;border:1px solid ${open && open.d === D.d && open.i === i ? '#3949ab' : '#bbc'};border-radius:7px;background:${open && open.d === D.d && open.i === i ? '#e8eaf6' : '#fff'};cursor:pointer;">${ico(v)}</button>`,
            )
            .join('') +
          `</div>`;
        if (open && open.d === D.d && open.i < n)
          h +=
            `<div style="margin-top:4px;border:1px solid #ccd;border-radius:8px;padding:3px;display:flex;flex-direction:column">` +
            Object.keys(ICP)
              .map(
                (k) =>
                  `<button class="edO" data-k="${k}" style="display:flex;align-items:center;gap:8px;border:0;background:${norm(a[open.i]) === k ? '#e8eaf6' : '#fff'};height:20px;min-height:0;width:100%;padding:0 5px;cursor:pointer;text-align:left;font-size:11px">${ico(k, 11)}<span>${NAMES[k]}</span></button>`,
              )
              .join('') +
            `</div>`;
      }
    }
    el.innerHTML = h;
    Object.keys(TOOLI).forEach((k) => {
      $$('edT_' + k).onclick = () => {
        setTool(k);
        draw();
      };
    });
    $$('edDel').onclick = () => {
      const d = S.doc.road[S.sel];
      if (!d) {
        say('Najpierw zaznacz drogę, którą chcesz usunąć.');
        return;
      }
      const nm = d.name ? ' „' + d.name + '”' : d.hw ? ' (' + d.hw + ')' : '';
      if (d.osm && !d.sb) {
        if (
          !confirm(
            'Ukryć drogę' +
              nm +
              ' (way ' +
              d.osm +
              ') w edytorze?\n\nNIE zostanie usunięta w OSM (usuwanie całych dróg w OSM jest wyłączone). Po ponownym pobraniu wróci. Można cofnąć przyciskiem ↶.',
          )
        )
          return;
        push();
        const id = d.osm;
        S.doc.road = S.doc.road.filter((x) => x.osm !== id);
        S.sel = -1;
        S.vsel = -1;
        save();
        ui();
        touch();
        say('Droga ukryta w edytorze (OSM bez zmian; cofnij: ↶).');
        return;
      }
      if (!confirm('Usunąć drogę' + nm + ' z edytora?\nMożna cofnąć przyciskiem ↶.')) return;
      push();
      S.doc.road.splice(S.sel, 1);
      S.sel = -1;
      S.vsel = -1;
      save();
      ui();
      touch();
      say('Droga usunięta z edytora (cofnij: ↶).');
    };
    {
      const rw0 = S.doc.road[S.sel],
        wi = $$('edW');
      if (rw0 && wi) {
        let pushed = false;
        wi.oninput = () => {
          if (!pushed) {
            try {
              push();
            } catch (x) {}
            pushed = true;
          }
          const nl = Math.max(1, rw0.lanes | 0),
            tw = Math.min(20, +wi.value),
            nv = +(tw / nl).toFixed(3);
          rw0.lw = nv;
          rw0.lwM = true;
          if (rw0.osm)
            S.doc.road.forEach((q) => {
              if (q !== rw0 && q.osm === rw0.osm) {
                q.lw = nv;
                q.lwM = true;
              }
            });
          if (rw0.osm) {
            const wv = String(+tw.toFixed(1));
            S.doc.road.forEach((q) => {
              if (q.osm !== rw0.osm) return;
              q.tg = q.tg || {};
              const b = baseTags(q).width || '';
              if (b !== '' && Math.abs(parseFloat(b) - tw) < 0.05) delete q.tg.width;
              else q.tg.width = wv;
            });
          }
          /* szerokosc drogi idzie do OSM jako tag width (lista "Do wyslania") */ /* cala droga OSM (wszystkie jej odcinki) */ $$(
            'edWt',
          ).textContent = tw.toFixed(1) + ' m';
          $$('edWl').textContent = nl + ' × ' + nv.toFixed(2) + ' m na pas';
          try {
            save();
          } catch (x) {}
          touch();
        };
        wi.onchange = () => {
          pushed = false;
        };
        const bump = (d) => {
          wi.value = Math.max(2, Math.min(20, Math.round((+wi.value + d) * 10) / 10));
          wi.oninput();
          pushed = false;
        };
        $$('edWm').onclick = () => bump(-0.1);
        $$('edWp').onclick = () => bump(0.1);
        /* plus / minus: dokladnie o 0,1 m, z powtarzaniem przy przytrzymaniu */ for (const [id, d] of [
          ['edWm', -0.1],
          ['edWp', 0.1],
        ]) {
          let tm = 0,
            iv = 0;
          const stop = () => {
            clearTimeout(tm);
            clearInterval(iv);
          };
          $$(id).onpointerdown = () => {
            tm = setTimeout(() => {
              iv = setInterval(() => bump(d), 70);
            }, 400);
          };
          $$(id).onpointerup = $$(id).onpointerleave = stop;
        }
      }
    }
    if (r) {
      const mut = (fn) => {
        push();
        fn();
        save();
        ui();
        touch();
        draw();
      };
      if (r.osm && $$('edCyL')) {
        const tagSet = (k, v) => {
            r.tg = r.tg || {};
            const b = baseTags(r)[k] || '';
            if ((v === null ? '' : v) === b) delete r.tg[k];
            else r.tg[k] = v;
          },
          writeCy = (l, rr) => {
            tagSet('cycleway', null);
            tagSet('cycleway:both', null);
            tagSet('cycleway:left', l || null);
            tagSet('cycleway:right', rr || null);
            if (!Object.keys(r.tg).length) delete r.tg;
            applyTags(r);
          };
        $$('edCyL').onchange = () => mut(() => writeCy($$('edCyL').value, $$('edCyR').value));
        $$('edCyR').onchange = () => mut(() => writeCy($$('edCyL').value, $$('edCyR').value));
        if ($$('edCyC'))
          $$('edCyC').onchange = () =>
            mut(() => {
              tagSet('oneway:bicycle', $$('edCyC').checked ? 'no' : null);
              if (r.tg && !Object.keys(r.tg).length) delete r.tg;
              applyTags(r);
            });
      }
      for (const D of dirsOf(r)) {
        const n0 = D.n,
          mn = 1;
        $$('edLm_' + D.d).onclick = () => {
          if (n0 > mn && dirsOf(r).reduce((s, x) => s + x.n, 0) > 1)
            mut(() => {
              setDir(r, D.d, n0 - 1, D.t.slice());
              open = null;
            });
        };
        $$('edLp_' + D.d).onclick = () => {
          if (n0 < 6)
            mut(() => {
              setDir(r, D.d, n0 + 1, D.t.slice());
              open = null;
            });
        };
      }
      el.querySelectorAll('.edI').forEach((b) => {
        b.onclick = () => {
          const d = b.dataset.d,
            i = +b.dataset.i;
          open = open && open.d === d && open.i === i ? null : { d, i };
          draw();
        };
        b.oncontextmenu = (e) => {
          e.preventDefault();
          b.onclick();
        };
      });
      el.querySelectorAll('.edO').forEach((b) => {
        b.onclick = () =>
          mut(() => {
            const D = dirsOf(r).find((x) => x.d === open.d);
            if (!D) return;
            const t = D.t.slice();
            t[open.i] = b.dataset.k;
            setDir(r, D.d, D.n, t);
            open = null;
          });
      });
    }
  }
  const lc = document.getElementById('lcP');
  if (lc) {
    const hr = document.createElement('hr'),
      b = document.createElement('b'),
      row = document.createElement('div');
    b.textContent = 'Edytor';
    row.className = 'eb';
    row.innerHTML =
      '<button id="lcEd" title="Pokaż / ukryj menu edycji (lewy dolny róg)" style="width:auto;padding:0 8px;font-size:12px">▤ Edytor</button>';
    lc.append(hr, b, row);
    document.body.appendChild(el);
    const lp = document.getElementById('lcP');
    if (lp) {
      lp.style.maxHeight = 'calc(100vh - 70px)';
      lp.style.overflowY = 'auto';
    }
    row.firstChild.onclick = () => {
      document.getElementById('edPop').classList.toggle('open');
    };
  }
  const oldUi2 = ui;
  ui = function () {
    const r0 = oldUi2.apply(this, arguments);
    try {
      const on = manual || S.sel >= 0;
      if (!on) el.style.display = 'none';
      else {
        const was = el.style.display;
        el.style.display = 'block';
        if (was === 'none' || !el.contains(document.activeElement)) draw();
      }
    } catch (e) {}
    return r0;
  };
})();

// ---------- maly popup po lewej z tagami zaznaczonej drogi ----------
(() => {
  const el = document.createElement('div');
  el.id = 'tagPop';
  el.style.cssText =
    'position:fixed;left:10px;top:10px;z-index:13;max-width:230px;max-height:45vh;overflow:auto;background:rgba(255,255,255,.93);border:1px solid #ccd;border-radius:7px;box-shadow:0 2px 8px rgba(0,0,0,.18);padding:5px 7px;font:10px/1.3 ui-monospace,Menlo,Consolas,monospace;color:#333;display:none;pointer-events:none';
  document.body.appendChild(el);
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function draw() {
    const r = S.doc.road[S.sel];
    if (!r) {
      el.style.display = 'none';
      return;
    }
    let rows = [];
    if (r.osm) {
      const t = effTags(r),
        ch = r.tg || {};
      rows = Object.entries(t).map(([k, v]) => [k, v, k in ch]);
      for (const k of Object.keys(ch)) if (!(k in t)) rows.push([k, '(usunięty)', true]);
      rows.unshift(['way', r.osm, false]);
    } else {
      rows = [
        ['highway', r.hw || '', false],
        ['lanes', r.lanes, false],
        ['oneway', r.oneway ? 'yes' : 'no', false],
      ];
      if (r.tl) rows.push(['turn:lanes', r.tl, false]);
      if (r.lw) rows.push(['szer. pasa', r.lw + ' m', false]);
      rows.unshift(['', r.sb ? 'sandbox / własna' : 'własna droga', false]);
    }
    el.innerHTML = rows
      .map(
        ([k, v, c]) =>
          `<div style="${c ? 'color:#e65100;font-weight:600' : ''}">${k ? '<span style="color:#7a7f88">' + esc(k) + '</span>=' : ''}${esc(v)}</div>`,
      )
      .join('');
    el.style.display = 'block';
    place();
  }
  const place = () => {
    const ep = document.getElementById('edP'),
      vis = ep && ep.style.display !== 'none';
    el.style.top = (vis ? Math.round(ep.getBoundingClientRect().bottom) + 6 : 10) + 'px';
  };
  try {
    const ep0 = document.getElementById('edP');
    if (ep0 && window.ResizeObserver) new ResizeObserver(place).observe(ep0);
  } catch (e) {}
  const oldUi3 = ui;
  ui = function () {
    const r0 = oldUi3.apply(this, arguments);
    try {
      draw();
    } catch (e) {}
    return r0;
  };
  draw();
})();

// ---------- automatyczne wczytywanie drog (kafelki ~450 m, po zatrzymaniu mapy); nie nadpisuje i nie usuwa niczego, co edytowales ----------
if (!EMBED)
  (() => {
    const TW = 0.006,
      TH = 0.004,
      MINZ = 16,
      MAXW = 1600,
      MAXH = 1300,
      GAP = 1200,
      API = 'https://api.openstreetmap.org/api/0.6/map.json',
      MAXR = 420;
    const tiles = new Map();
    let lastSig = '',
      stableAt = 0,
      doneSig = '',
      running = false,
      backoff = 0,
      lastReq = 0,
      on = true;
    try {
      on = localStorage.getItem('edAutoLoad') !== '0';
    } catch (e) {}
    const lcPx = document.getElementById('lcP'),
      st = document.createElement('div');
    st.style.cssText =
      'position:fixed;left:50%;bottom:8px;transform:translateX(-50%);z-index:5;font:11px system-ui;color:#445;background:rgba(255,255,255,.85);border-radius:6px;padding:2px 8px;display:none;pointer-events:none';
    document.body.appendChild(st);
    let stT = 0;
    const say2 = (t) => {
      st.textContent = t;
      st.style.display = 'block';
      clearTimeout(stT);
      stT = setTimeout(() => {
        st.style.display = 'none';
      }, 4000);
    };
    if (lcPx) {
      const lab = document.createElement('label'),
        cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'cAuto';
      cb.checked = on;
      lab.append(cb, ' Auto-wczytywanie dróg');
      lab.title = 'Doczytuje drogi OSM po zatrzymaniu mapy (zoom 16+); nie rusza edytowanych dróg';
      const hr = [...lcPx.querySelectorAll('b')].find((b) => /warstwy/i.test(b.textContent));
      hr && hr.parentNode === lcPx
        ? lcPx.insertBefore(
            lab,
            lcPx.querySelector('#cNodeLanes') ? lcPx.querySelector('#cNodeLanes').closest('label') : null,
          )
        : lcPx.appendChild(lab);
      cb.onchange = () => {
        on = cb.checked;
        try {
          localStorage.setItem('edAutoLoad', on ? '1' : '0');
        } catch (e) {}
        doneSig = '';
      };
    }
    const zoomNow = () => Math.log2(156543.03 * Math.cos((S.org.lat * Math.PI) / 180) * S.view.k),
      sig = () => [Math.round(S.view.x), Math.round(S.view.y), S.view.k.toFixed(3), W, H].join();
    const viewLL = () => {
      const a = unproj(s2w([0, 0])),
        b = unproj(s2w([W, H]));
      return {
        lo0: Math.min(a.lon, b.lon),
        lo1: Math.max(a.lon, b.lon),
        la0: Math.min(a.lat, b.lat),
        la1: Math.max(a.lat, b.lat),
      };
    };
    const needTiles = () => {
      const v = viewLL(),
        mx = (v.lo1 - v.lo0) * 0.25,
        my = (v.la1 - v.la0) * 0.25,
        out = [],
        cx = (v.lo0 + v.lo1) / 2 / TW,
        cy = (v.la0 + v.la1) / 2 / TH;
      for (let ix = Math.floor((v.lo0 - mx) / TW); ix <= Math.floor((v.lo1 + mx) / TW); ix++)
        for (let iy = Math.floor((v.la0 - my) / TH); iy <= Math.floor((v.la1 + my) / TH); iy++)
          out.push({ ix, iy, k: ix + '_' + iy, d: Math.hypot(ix + 0.5 - cx, iy + 0.5 - cy) });
      return out.sort((a, b) => a.d - b.d);
    };
    const wayOK = (t) => OKHW.has((t.highway || '').replace('_link', '')) || isCycW(t);
    async function fetchTile(t) {
      const url =
          API +
          '?bbox=' +
          (t.ix * TW).toFixed(6) +
          ',' +
          (t.iy * TH).toFixed(6) +
          ',' +
          ((t.ix + 1) * TW).toFixed(6) +
          ',' +
          ((t.iy + 1) * TH).toFixed(6),
        ac = new AbortController(),
        to = setTimeout(() => ac.abort(), 25000);
      try {
        const r = await fetch(url, { signal: ac.signal });
        if (r.status === 429 || r.status === 509 || r.status >= 500) {
          backoff = Date.now() + 15000;
          return false;
        }
        if (!r.ok) {
          tiles.set(t.k, 1);
          return true;
        }
        const els = (await r.json()).elements || [],
          nodes = new Map();
        for (const e of els) if (e.type === 'node') nodes.set(e.id, [e.lon, e.lat]);
        for (const w of els) {
          if (w.type !== 'way' || !w.tags || !w.tags.highway || !wayOK(w.tags) || S.osm.ways.has(w.id)) continue;
          const ll = w.nodes.map((id) => nodes.get(id)).filter(Boolean);
          if (ll.length < 2) continue;
          S.osm.ways.set(w.id, {
            id: w.id,
            t: w.tags,
            g: ll.map((c) => proj(c[0], c[1])),
            nk: ll.map((c) => c[0].toFixed(7) + ',' + c[1].toFixed(7)),
          });
        }
        tiles.set(t.k, 1);
        return true;
      } catch (e) {
        backoff = Date.now() + 8000;
        return false;
      } finally {
        clearTimeout(to);
      }
    }
    const edited = (r) =>
      !!(
        r.tg ||
        r.nw ||
        r.sb ||
        !r.osm ||
        r.rp ||
        r.lwM ||
        (r.off != null && r.off !== '') ||
        r.offS != null ||
        r.offE != null ||
        r.nk.some((k) => !k) ||
        r.nk.some((k, j) => {
          if (!k) return false;
          const [lo, la] = k.split(',').map(Number),
            q = proj(lo, la);
          return Math.hypot(q[0] - r.pts[j][0], q[1] - r.pts[j][1]) > 0.15;
        })
      );
    function trim() {
      if (S.doc.road.length <= MAXR - 60) return;
      const a = s2w([0, 0]),
        b = s2w([W, H]),
        mx = Math.abs(b[0] - a[0]),
        my = Math.abs(b[1] - a[1]),
        x0 = Math.min(a[0], b[0]) - mx,
        x1 = Math.max(a[0], b[0]) + mx,
        y0 = Math.min(a[1], b[1]) - my,
        y1 = Math.max(a[1], b[1]) + my,
        sel = S.doc.road[S.sel],
        keep = [];
      for (const r of S.doc.road) {
        const inside = r.pts.some((q) => q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1);
        if (inside || r === sel || edited(r)) keep.push(r);
      }
      if (keep.length === S.doc.road.length) return;
      const dropped = new Set(S.doc.road.filter((r) => !keep.includes(r)).map((r) => r.osm));
      S.doc.road = keep;
      S.sel = sel ? keep.indexOf(sel) : -1;
      S.vsel = -1;
      /* niezmienione drogi daleko od widoku wypadaja (po powrocie wczytaja sie ponownie z pamieci) */ for (const id of dropped)
        if (!keep.some((r) => r.osm === id)) {
          const o = S.osm.ways.get(id);
          if (o && !(S.doc.del || []).includes(id)) {
            /* zostaje w S.osm.ways, wiec import po powrocie jest natychmiastowy */
          }
        }
    }
    async function run() {
      if (running) return;
      running = true;
      try {
        const z = zoomNow(),
          wm = W / S.view.k,
          hm = H / S.view.k;
        if (z < MINZ || wm > MAXW || hm > MAXH) return;
        const mySig = sig(),
          miss = needTiles().filter((t) => !tiles.has(t.k));
        let n = 0;
        for (let i = 0; i < miss.length; i++) {
          if (sig() !== mySig) return;
          const wait = Math.max(GAP - (Date.now() - lastReq), backoff - Date.now(), 0);
          if (wait) await new Promise((r) => setTimeout(r, wait));
          if (sig() !== mySig) return;
          say2('Wczytuję drogi ' + (i + 1) + '/' + miss.length + '…');
          lastReq = Date.now();
          if (!(await fetchTile(miss[i]))) {
            say2('Serwer OSM zajęty – ponawiam…');
            return;
          }
          n++;
        }
        trim();
        const before = S.doc.road.length;
        importView((0.25 * Math.max(W, H)) / S.view.k);
        if (S.doc.road.length !== before || n) {
          S.dirty = true;
          L = null;
          touch();
        }
        doneSig = mySig;
        if (n) say2('Wczytano ' + (S.doc.road.length - before) + ' nowych odcinków dróg');
      } finally {
        running = false;
      }
    }
    setInterval(() => {
      if (!on) return;
      const s0 = sig();
      if (s0 !== lastSig) {
        lastSig = s0;
        stableAt = Date.now();
        return;
      }
      if (running || doneSig === s0 || Date.now() - stableAt < 800 || backoff > Date.now() || S.tool === 'road') return;
      run();
    }, 400);
  })();
