// Sandbox v1 – menu warstw (wzorce 💾 📚 🗑, siatka 🧲 ▦, ∠5, cofnij/ponów) i eksport sceny (config: JSON dla Claude).
(function () {
  var S = window.SV, H = window.SVH, lay = S.layers, btn = S.btn, commit = S.commit, draw = S.draw, drawGrid = S.drawGrid, undo = S.undo, redo = S.redo, lanesOf = S.lanesOf, GRIDS = S.GRIDS, P = S.P;
  // menu warstw Leaflet (zawsze otwarte, ikona zwija/rozwija listę): wzorce, przyciąganie/siatka, cofnij/ponów (Wojtek 18:08)
  (function () {
    var C = lay.getContainer(), list = C.querySelector('.leaflet-control-layers-list'), tg = C.querySelector('.leaflet-control-layers-toggle');
    tg.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); list.classList.toggle('sv-hide'); });
    var box = L.DomUtil.create('div', 'sv-lmenu', list);
    // wzorce: zrzuty kolejnych ustawień (kąt, offsety, ręczne krawędzie) zbierane lokalnie, na koniec kopiowane razem
    var WK = 'sv1-wzorce', wz = function () { try { return JSON.parse(localStorage.getItem(WK)) || []; } catch (e) { return []; } };
    var row2 = L.DomUtil.create('div', 'sv-row', box), cnt;
    btn(row2, '💾', 'Zapisz wzorzec (aktualna scena); potem ręczne zmiany są czyszczone', function () {
      var c = config(''); delete c.scena.edits; delete c.scena.editSig; delete c.scena.log; delete S.sc.log; c.nr = wz().length + 1;
      var a = wz(); a.push(c); try { localStorage.setItem(WK, JSON.stringify(a)); } catch (e) {}
      delete S.sc.edits; commit(); draw(); upd();
    });
    btn(row2, '📚', 'Kopiuj wszystkie wzorce', function () {
      var b = this; copy(JSON.stringify({ strona: 'sandbox-v1.html', wzorce: wz() }, null, 1)); b.textContent = '✓'; setTimeout(function () { b.textContent = '📚'; }, 1200);
    });
    btn(row2, '🗑', 'Usuń wszystkie zapisane wzorce', function () { if (wz().length && confirm('Usunąć ' + wz().length + ' wzorców?')) { localStorage.removeItem(WK); upd(); } });
    cnt = L.DomUtil.create('span', 'sv-val', row2);
    function upd() { cnt.textContent = wz().length + ' wz.'; } upd();
    var row3 = L.DomUtil.create('div', 'sv-row', box);
    var s = btn(row3, '🧲', 'Przyciąganie do siatki', function () { S.snap = !S.snap; s.classList.toggle('on', S.snap); });
    var gb = btn(row3, '▦' + S.GRID, 'Rozdzielczość siatki [m]', function () { S.GRID = GRIDS[(GRIDS.indexOf(S.GRID) + 1) % GRIDS.length]; gb.textContent = '▦' + S.GRID; drawGrid(); });
    gb.classList.add('sv-tpl');
    var sa = btn(row3, '∠5', 'Przyciąganie kąta co 5° (względem drugiej drogi w sąsiednim węźle)', function () { S.snapA = !S.snapA; sa.classList.toggle('on', S.snapA); });
    sa.classList.add('sv-tpl');
    var row4 = L.DomUtil.create('div', 'sv-row', box);
    btn(row4, '↶', 'Cofnij (Ctrl+Z)', undo); btn(row4, '↷', 'Ponów (Ctrl+Y / Ctrl+Shift+Z)', redo);
  })();
  function copy(txt) {
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(function () {
      var t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    });
  }
  function auto(r, p) { var g = G.lines(S.sc, r, p); return g.pasy || H.split(g.lanes); } // geometria z reguł (bez ręcznych zmian)
  function katy(id, p) { // kąty między kolejnymi liniami OSM w węźle [°], z nazwami dróg
    var a = []; S.sc.roads.forEach(function (r) { r.pts.forEach(function (q, i) { if (q !== id) return;
      if (i > 0) a.push({ d: r.id, q: r.pts[i - 1] }); if (i < r.pts.length - 1) a.push({ d: r.id, q: r.pts[i + 1] }); }); });
    if (a.length < 2) return undefined;
    a.forEach(function (o) { o.t = Math.atan2(p[o.q][1] - p[id][1], p[o.q][0] - p[id][0]); }); a.sort(function (x, y) { return x.t - y.t; });
    return a.map(function (o, i) { var b = a[(i + 1) % a.length], d = (b.t - o.t) * 180 / Math.PI; if (d <= 0) d += 360;
      return { miedzy: [o.d, b.d], kat: Math.round(d * 10) / 10 }; }).filter(function (o) { return a.length > 2 || o.kat <= 180; });
  }
  function config(opis) {
    var p = P(), r2 = function (v) { return Math.round(v * 100) / 100; }, pts = function (l) { return l.map(function (q) { return q.map(r2); }); };
    var c0 = { strona: 'sandbox-v1.html', opis: opis, szablon: S.sc.tpl,
      uwaga: 'xy w metrach od srodka; offset w pasach, + = w prawo wzgledem kierunku OSM; pasy od lewej, kazdy pas ma wlasna lewa i prawa krawedz',
      wezly: Object.keys(S.sc.nodes).map(function (k) { return { id: k, nm: S.sc.nodes[k].main || undefined, typ: G.nodeType(S.sc, k, p), xy: p[k].map(r2), katy: katy(k, p) }; }),
      drogi: S.sc.roads.filter(function (r) { return r.pts.length > 1; }).map(function (r) { var g = lanesOf(r, p);
        return { id: r.id, pts: r.pts, pasy: r.lanes, szer_pasa: r.w, offset_pocz: r.o0 || 0, offset_kon: r.o1 || 0,
          offset_auto: [G.endInfo(S.sc, r, true, p).oAuto, G.endInfo(S.sc, r, false, p).oAuto].map(function (v) { return v == null ? null : r2(v); }),
          pasy_krawedzie: kr(g.pasy), recznie: g.edyt || undefined,
          pasy_krawedzie_auto: g.edyt ? kr(auto(r, p)) : undefined }; }),
      scena: S.sc };
    if (c0.drogi.some(function (d) { return d.recznie; }) && S.sc.log) c0.operacje = S.sc.log; // dziennik ręcznych zmian
    return c0;
    function kr(Pz) { return Pz.filter(function (l, k) { return k % 2 === 0; }).map(function (l, j) { return { lewa: pts(l), prawa: pts(Pz[2 * j + 1]) }; }); }
  }

  S.config = config;
})();
