/* ---- tryb DOM: gdy iD nie udostepnia kontekstu (iD w ramce /id). Dane z grafu iD przechwyconego przez prototyp coreGraph + encje powiazane z elementami SVG ---- */
(function () {
  const GR = [];
  function hookGraph() {
    const g = window.iD && window.iD.coreGraph; if (!g || !g.prototype) return false; if (g.prototype.__idl) return true;
    for (const m of ['hasEntity', 'entity']) { const o = g.prototype[m]; if (typeof o !== 'function') continue; g.prototype[m] = function () { if (GR[GR.length - 1] !== this) { const i = GR.indexOf(this); if (i >= 0) GR.splice(i, 1); GR.push(this); if (GR.length > 12) GR.shift(); } return o.apply(this, arguments); }; }
    g.prototype.__idl = 1; return true;
  }
  hookGraph(); const hk = setInterval(() => { if (hookGraph() && GR.length) clearInterval(hk); }, 300); setTimeout(() => clearInterval(hk), 60000);
  let started = false;
  const boot = setInterval(() => {
    if (started) return; const sup = document.querySelector('.supersurface'), mm = document.querySelector('.main-map');
    if (!sup || !mm || !window.iD || !hookGraph() || idCtx()) return; if (!GR.length) return;
    started = true; clearInterval(boot); try { const b = document.getElementById('idlanes-badge'); if (b) b.remove(); } catch (e) {} run(sup, mm);
  }, 500);
  function run(sup, mm) {
    const cvs = document.createElement('canvas'); cvs.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:50'; sup.appendChild(cvs);
    const cx = cvs.getContext('2d'), offc = document.createElement('canvas'), ocx = offc.getContext('2d');
    const bar = document.createElement('div'); bar.style.cssText = 'position:absolute;right:56px;top:8px;z-index:60;display:flex;gap:4px;font:12px system-ui;pointer-events:auto'; mm.appendChild(bar);
    const mk = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'padding:3px 8px;border:1px solid #889;border-radius:6px;background:#fff;cursor:pointer'; b.onclick = () => { f(b); last = ''; }; bar.appendChild(b); };
    mk('Pasy: wł.', b => { IDL.on = !IDL.on; b.textContent = 'Pasy: ' + (IDL.on ? 'wł.' : 'wył.'); });
    mk('Linie iD: ukryte', b => { IDL.hide = !IDL.hide; b.textContent = 'Linie iD: ' + (IDL.hide ? 'ukryte' : 'widoczne'); css(); });
    const st = document.createElement('style'); document.head.appendChild(st);
    const css = () => { st.textContent = IDL.hide ? '.layer-osm path.line.tag-highway-motorway,.layer-osm path.line.tag-highway-motorway_link,.layer-osm path.line.tag-highway-trunk,.layer-osm path.line.tag-highway-trunk_link,.layer-osm path.line.tag-highway-primary,.layer-osm path.line.tag-highway-primary_link,.layer-osm path.line.tag-highway-secondary,.layer-osm path.line.tag-highway-secondary_link{opacity:.25}' : ''; }; css();
    const ids = new WeakMap(); let nid = 0, last = '';
    const hashView = () => { const m = /map=([\d.]+)(?:\/|%2F)(-?[\d.]+)(?:\/|%2F)(-?[\d.]+)/i.exec(decodeURIComponent(location.hash || '')); return m ? { z: +m[1], lat: +m[2], lon: +m[3] } : null; };
    function ways() { const m = new Map(); document.querySelectorAll('.layer-osm path.line').forEach(p => { const d = p.__data__; if (d && d.type === 'way' && d.tags && d.tags.highway && !m.has(d.id)) m.set(d.id, d); }); return m; }
    function tick() {
      const hv = hashView(), W0 = mm.clientWidth, H0 = mm.clientHeight; if (!hv || !W0 || !H0) return;
      const wm = ways(), sig = [hv.z, hv.lat, hv.lon, W0, H0, IDL.on]; for (const w of wm.values()) { let i = ids.get(w); if (!i) ids.set(w, i = ++nid); sig.push(i); }
      const key = sig.join(','); if (key === last) return; last = key;
      DPR = window.devicePixelRatio || 1; W = W0; H = H0; for (const c of [cvs, offc]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); } cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
      cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cvs.width, cvs.height); if (!IDL.on || hv.z < 16 || !wm.size) return;
      // graf aktualny = taki, ktory zwraca ta sama encje drogi co element SVG
      const first = wm.values().next().value; let g = null; for (const c of GR.slice().reverse()) { try { if (c.hasEntity(first.id) === first) { g = c; break; } } catch (e) {} } if (!g) g = GR[GR.length - 1];
      S.org = { lat: hv.lat, lon: hv.lon }; S.view.k = Math.pow(2, hv.z) / (156543.03 * Math.cos(hv.lat * Math.PI / 180)); S.view.x = 0; S.view.y = 0;
      const wmap = new Map(), roads = [];
      for (const e of wm.values()) { const hw = (e.tags.highway || '').replace('_link', ''); if (!OKHW.has(hw) || e.tags.area === 'yes' || e.nodes.length < 2) continue; const pts = [], nk = []; let bad = false; for (const n of e.nodes) { const nd = g.hasEntity(n); if (!nd || !nd.loc) { bad = true; break; } pts.push(proj(nd.loc[0], nd.loc[1])); nk.push(n); } if (bad) continue; const num = +String(e.id).slice(1), o = { id: num, t: { ...e.tags }, g: pts, nk }; wmap.set(num, o); try { roads.push(makeRoad(o, 0, pts.length - 1)); } catch (er) { console.warn('idlanes makeRoad', er); } }
      S.osm.ways = wmap; S.doc.road = roads; S.dirty = true; try { L = layout(); } catch (e) { console.warn('idlanes layout', e); L = null; } S.dirty = false; if (!L) return;
      ocx.setTransform(DPR, 0, 0, DPR, 0, 0); ocx.clearRect(0, 0, W, H); try { drawLayer(ocx); } catch (e) { console.warn('idlanes draw', e); } cx.drawImage(offc, 0, 0);
    }
    setInterval(() => { try { tick(); } catch (e) { console.warn('idlanes tick', e); } }, 150);
    window.__idlanes = IDL;
  }
})();
