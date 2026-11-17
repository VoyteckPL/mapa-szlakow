/* ---- adapter iD: graf iD -> model edytora, rysowanie na nakladce canvas ---- */
const IDL = { on: true, hide: true, raf: 0 };
function idCtx() { return window.id || window.context || (window.iD && window.iD.context) || null; }
function idWhen(cb) { let n = 0; const t = setInterval(() => { const c = idCtx(); if (c && c.map && c.graph && c.container && c.container().select('.main-map').node()) { clearInterval(t); cb(c); } else if (++n > 600) clearInterval(t); }, 500); }
idWhen(ctxId => {
  const root = ctxId.container().select('.main-map').node();
  const cvs = document.createElement('canvas'); cvs.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:5';
  root.appendChild(cvs); const cx = cvs.getContext('2d'), offc = document.createElement('canvas'), ocx = offc.getContext('2d');
  // przelaczniki
  const bar = document.createElement('div'); bar.style.cssText = 'position:absolute;right:56px;top:8px;z-index:6;display:flex;gap:4px;font:12px system-ui;pointer-events:auto';
  const mk = (txt, f) => { const b = document.createElement('button'); b.textContent = txt; b.style.cssText = 'padding:3px 8px;border:1px solid #889;border-radius:6px;background:#fff;cursor:pointer'; b.onclick = () => { f(b); sched(); }; bar.appendChild(b); return b; };
  mk('Pasy: wł.', b => { IDL.on = !IDL.on; b.textContent = 'Pasy: ' + (IDL.on ? 'wł.' : 'wył.'); });
  mk('Linie iD: ukryte', b => { IDL.hide = !IDL.hide; b.textContent = 'Linie iD: ' + (IDL.hide ? 'ukryte' : 'widoczne'); applyCss(); });
  root.appendChild(bar);
  const st = document.createElement('style'); document.head.appendChild(st);
  const applyCss = () => { st.textContent = IDL.hide ? '.main-map .layer-osm path.line.tag-highway-motorway,.main-map .layer-osm path.line.tag-highway-motorway_link,.main-map .layer-osm path.line.tag-highway-trunk,.main-map .layer-osm path.line.tag-highway-trunk_link,.main-map .layer-osm path.line.tag-highway-primary,.main-map .layer-osm path.line.tag-highway-primary_link,.main-map .layer-osm path.line.tag-highway-secondary,.main-map .layer-osm path.line.tag-highway-secondary_link{opacity:.25}' : ''; }; applyCss();

  const kOf = (lon, lat) => lon.toFixed(7) + ',' + lat.toFixed(7);
  let cache = { v: -1 };
  function rebuild(ext) {
    const g = ctxId.graph(), ents = ctxId.history().intersects(ext);
    const ways = new Map(), roads = [];
    for (const e of ents) {
      if (e.type !== 'way' || !e.tags || !e.tags.highway || e.nodes.length < 2) continue;
      const hw = (e.tags.highway || '').replace('_link', ''); if (!OKHW.has(hw) || e.tags.area === 'yes') continue;
      const pts = [], nk = []; let bad = false;
      for (const id of e.nodes) { const n = g.hasEntity(id); if (!n || !n.loc) { bad = true; break; } pts.push(proj(n.loc[0], n.loc[1])); nk.push(id); }
      if (bad) continue;
      const num = +String(e.id).slice(1), o = { id: num, t: { ...e.tags }, g: pts, nk };
      ways.set(num, o); roads.push(makeRoad(o, 0, pts.length - 1));
    }
    S.osm.ways = ways; S.doc.road = roads; S.dirty = true;
  }
  let lastKey = '', lastGraph = null;
  function draw() {
    IDL.raf = 0; const m = ctxId.map(); const ww = root.clientWidth, hh = root.clientHeight; if (!ww || !hh) return;
    DPR = window.devicePixelRatio || 1; W = ww; H = hh;
    for (const c of [cvs, offc]) { if (c.width !== Math.round(W * DPR)) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); } }
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cvs.width, cvs.height);
    if (!IDL.on) return;
    const c = m.center(), z = m.zoom(); if (z < 16) return;
    if (!S.orig0 || Math.abs(c[1] - S.org.lat) > 0.05 || Math.abs(c[0] - S.org.lon) > 0.08) { S.org = { lat: c[1], lon: c[0] }; S.orig0 = true; lastKey = ''; }
    S.view.k = Math.pow(2, z) / (156543.03 * Math.cos(S.org.lat * Math.PI / 180)); const cp = proj(c[0], c[1]); S.view.x = cp[0]; S.view.y = cp[1];
    const ext = m.extent(), gr = ctxId.graph(), ek = ext.rectangle().map(v => v.toFixed(4)).join(',') + '|' + "";
    if (gr !== lastGraph) { lastGraph = gr; lastKey = "x"; }
    if (ek !== lastKey || S.dirty) {
      if (ek !== lastKey || !L) { const pad = 0.0015; rebuild(ext.padByMeters ? ext.padByMeters(60) : ext); lastKey = ek; }
      try { L = layout(); } catch (e) { console.warn('idlanes layout', e); L = null; } S.dirty = false;
    }
    if (!L) return;
    ocx.setTransform(DPR, 0, 0, DPR, 0, 0); ocx.clearRect(0, 0, W, H); try { drawLayer(ocx); } catch (e) { console.warn('idlanes draw', e); }
    cx.drawImage(offc, 0, 0);
  }
  function sched() { if (!IDL.raf) IDL.raf = requestAnimationFrame(draw); }
  ctxId.map().on('move.idlanes', sched); ctxId.map().on('drawn.idlanes', sched);
  try { ctxId.history().on('change.idlanes', () => { lastKey = ''; sched(); }); } catch (e) {}
  window.addEventListener('resize', sched); sched();
  window.__idlanes = IDL;
});
