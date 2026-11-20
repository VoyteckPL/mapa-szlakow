window.__smCap = 0.5;
try {
  window.__nodeGeom = true;
  S.arcMode = +(localStorage.getItem('edArcMode') || 1);
  var _g = document.getElementById('cNodeBord'),
    _m = document.getElementById('selArc');
  _m.value = String(S.arcMode);
  document.getElementById('btnCopyDoc').onclick = function () {
    try {
      var t = JSON.stringify({
        org: S.org,
        view: S.view,
        nodeR: S.nodeR,
        nodeP: S.nodeP,
        road: S.doc.road.map(function (r) {
          return {
            hw: r.hw,
            lanes: r.lanes,
            lw: r.lw,
            pts: r.pts,
            nk: r.nk,
            oneway: r.oneway,
            nf: r.nf,
            tl: r.tl,
            osm: r.osm,
            rp: r.rp,
            ly: r.ly,
            sb: r.sb,
          };
        }),
      });
      navigator.clipboard.writeText(t).then(
        function () {
          say('Skopiowano stan dróg (' + t.length + ' znaków) – wklej do czatu');
        },
        function () {
          var ta = document.createElement('textarea');
          ta.value = t;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          say('Skopiowano stan dróg');
        },
      );
    } catch (e) {
      say('Błąd kopiowania: ' + e);
    }
  };
  var _r = document.getElementById('rNodeR0'),
    _rv = parseFloat(localStorage.getItem('edNodeR0') || '1');
  window.__nodeR0 = _rv;
  _r.value = _rv;
  document.getElementById('vNodeR0').textContent = _rv + ' m';
  _r.oninput = function () {
    window.__nodeR0 = +this.value;
    if (S.nodeR) for (var _k in S.nodeR) delete S.nodeR[_k];
    document.getElementById('vNodeR0').textContent = this.value + ' m';
    try {
      localStorage.setItem('edNodeR0', this.value);
    } catch (e) {}
    if (typeof touch === 'function') touch();
  };
  _g.onchange = function () {
    if (typeof touch === 'function') touch();
  };
  _m.onchange = function () {
    S.arcMode = +this.value;
    try {
      localStorage.setItem('edArcMode', this.value);
    } catch (e) {}
    if (typeof touch === 'function') touch();
  };
} catch (e) {}
try {
  window.__smooth = false;
  document.getElementById('cSmooth').checked = window.__smooth;
  try {
    var _c = parseFloat(localStorage.getItem('edSmC2') || '1.3');
    window.__smC = _c;
    document.getElementById('rSmC').value = _c;
    document.getElementById('vSmC').textContent = _c + ' m';
    document.getElementById('rSmC').oninput = function () {
      window.__smC = +this.value;
      document.getElementById('vSmC').textContent = this.value + ' m';
      try {
        localStorage.setItem('edSmC2', this.value);
      } catch (e) {}
      if (typeof touch === 'function') touch();
    };
  } catch (e) {}
  document.getElementById('cSmooth').onchange = function () {
    window.__smooth = this.checked;
    try {
      localStorage.setItem('edSmooth', this.checked ? '1' : '0');
    } catch (e) {}
    if (typeof touch === 'function') touch();
  };
} catch (e) {}
setInterval(function () {
  try {
    var d = document.getElementById('diag'),
      t = window.__tst;
    if (d && t)
      d.textContent =
        'Podkład ' +
        $('bm').value +
        ($('cTile').checked ? '' : ' (WYŁĄCZONY)') +
        ': ok ' +
        t.ok +
        ', błędy ' +
        t.err +
        (t.last ? ' (' + t.last + ')' : '') +
        ' · drogi OSM w pamięci: ' +
        S.osm.ways.size;
  } catch (e) {}
}, 1000);
try {
  [
    ['edMiniR', 'rMiniR', 'vMiniR', '__miniR', ' m', 1],
    ['edMiniMin', 'rMiniMin', 'vMiniMin', '__miniMin', ' m', 2],
  ].forEach(function (c) {
    var v = localStorage.getItem(c[0]);
    if (v != null) {
      document.getElementById(c[1]).value = v;
      window[c[3]] = +v;
      document.getElementById(c[2]).textContent = (c[5] == 2 ? (+v).toFixed(2) : v) + c[4];
    }
  });
} catch (e) {}
try {
  var _t = document.getElementById('cTileV');
  _t.checked = document.getElementById('cTile').checked;
  _t.onchange = function () {
    document.getElementById('cTile').checked = this.checked;
    document.getElementById('cTile').dispatchEvent(new Event('input'));
    if (typeof touch === 'function') touch();
  };
} catch (e) {}
try {
  var _w = document.getElementById('smWrap'),
    _lc = document.getElementById('lc'),
    _pn = _lc && _lc.querySelector('div');
  if (_w && _pn) {
    var _h = document.createElement('hr'),
      _b = document.createElement('b');
    _b.textContent = '▸ Ustawienia węzłów';
    _b.style.cursor = 'pointer';
    _b.title = 'Rozwiń / zwiń';
    _w.style.cssText = 'font:12px system-ui;margin-top:4px;display:none';
    _b.onclick = function () {
      var o = _w.style.display === 'none';
      _w.style.display = o ? 'block' : 'none';
      _b.textContent = (o ? '▾ ' : '▸ ') + 'Ustawienia węzłów';
    };
    _pn.append(_w);
  }
} catch (e) {}
try {
  var _ids = ['cNodeRend', 'cNodeEdge', 'cNodeLanes', 'cNodeBord', 'cCycle', 'cAx', 'cAn', 'cSn', 'cTileV'],
    _sv = JSON.parse(localStorage.getItem('edLayers-v1') || '{}');
  _ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (typeof _sv[id] === 'boolean') {
      el.checked = _sv[id];
      if (id === 'cTileV') {
        document.getElementById('cTile').checked = _sv[id];
      }
    }
    el.addEventListener('change', function () {
      try {
        var o = JSON.parse(localStorage.getItem('edLayers-v1') || '{}');
        o[id] = el.checked;
        localStorage.setItem('edLayers-v1', JSON.stringify(o));
      } catch (e) {}
    });
  });
  if (typeof touch === 'function') touch();
} catch (e) {}
try {
  var _ra = document.getElementById('rRoadA'),
    _v = parseFloat(localStorage.getItem('edRoadA') || '1');
  window.__roadAlpha = _v;
  _ra.value = _v;
  _ra.oninput = function () {
    window.__roadAlpha = +this.value;
    try {
      localStorage.setItem('edRoadA', this.value);
    } catch (e) {}
    if (typeof touch === 'function') touch();
  };
} catch (e) {}
