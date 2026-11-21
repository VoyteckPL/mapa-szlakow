// Sandbox v1 – panel prawy dolny: zaznaczona droga (pasy, szerokość, kierunek) lub punkt (Nm, offsety dróg).
(function () {
  var S = window.SV, H = window.SVH, ctl = S.ctl, btn = S.btn, commit = S.commit, draw = S.draw, cleanup = S.cleanup, delNode = S.delNode, P = S.P;
  // prawy dolny: zaznaczona droga lub punkt
  var rp; ctl('bottomright', function (d) { rp = d; });
  function num(body, icon, title, get, setv, step, min, max, fmt) {
    var rw = L.DomUtil.create('div', 'sv-row', body), s = L.DomUtil.create('span', 'sv-val', rw); s.textContent = icon; s.title = title;
    function ch(dv) { var v = Math.round((get() + dv) * 100) / 100; if (v < min || v > max) return; setv(v); commit(); draw(); }
    btn(rw, '−', title + ' −', function () { ch(-step); });
    var v = L.DomUtil.create('span', 'sv-val', rw); v.textContent = fmt ? fmt(get()) : get();
    btn(rw, '+', title + ' +', function () { ch(step); });
  }
  var sgn = function (v) { return (v > 0 ? '+' : '') + v; };
  function panel() {
    rp.innerHTML = ''; rp.classList.toggle('sv-hide', !S.sel); if (!S.sel) return;
    var body = L.DomUtil.create('div', 'sv-body', rp);
    if (S.sel.t === 'road') {
      var r = S.sc.roads.filter(function (x) { return x.id === S.sel.id; })[0]; if (!r) { S.sel = null; return panel(); }
      num(body, '≡', 'Liczba pasów', function () { return r.lanes; }, function (v) { r.lanes = v; }, 1, 1, 8);
      num(body, '↔', 'Szerokość pasa [m]', function () { return r.w; }, function (v) { r.w = v; }, 0.25, 2.5, 5);
      if (H.turnPanel) H.turnPanel(body, r);
      var rw = L.DomUtil.create('div', 'sv-row', body); L.DomUtil.create('span', 'sv-val', rw).textContent = r.id;
      btn(rw, '⇄', 'Odwróć kierunek', function () { r.pts.reverse(); var a = r.o0 || 0; r.o0 = -(r.o1 || 0); r.o1 = -a; commit(); draw(); });
      btn(rw, '🗑', 'Usuń drogę (Del)', function () { S.sc.roads.splice(S.sc.roads.indexOf(r), 1); cleanup(); S.sel = null; commit(); draw(); });
    } else {
      var id = S.sel.id, n = S.sc.nodes[id]; if (!n) { S.sel = null; return panel(); }
      var top = L.DomUtil.create('div', 'sv-row', body); L.DomUtil.create('span', 'sv-val', top).textContent = id;
      var nb = btn(top, '◉', 'Nm (węzeł główny)', function () { n.main = !n.main; commit(); draw(); }); nb.classList.toggle('on', !!n.main);
      btn(top, '🗑', 'Usuń punkt (Del)', function () { delNode(id); S.sel = null; commit(); draw(); });
      S.sc.roads.forEach(function (r) { // offset dróg kończących się w tym punkcie
        ['o0', 'o1'].forEach(function (k, e) {
          if (r.pts[e ? r.pts.length - 1 : 0] !== id) return;
          if (G.endInfo(S.sc, r, !e, P()).oAuto != null) return; // offset automatyczny (odnoga rozwidlenia)
          num(body, r.id, 'Offset ' + r.id + ' przy tym końcu [pasy, + w prawo]', function () { return r[k] || 0; }, function (v) { r[k] = v; }, 0.5, -8, 8, sgn);
        });
      });
    }
  }

  H.panel = panel;
})();
