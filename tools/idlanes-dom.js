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
    started = true; window.__idlDom = 1; clearInterval(boot); try { const b = document.getElementById('idlanes-badge'); if (b) b.remove(); } catch (e) {} run(sup, mm);
  }, 500);
  function run(sup, mm) {
    const cvs = document.createElement('canvas'); cvs.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none'; sup.appendChild(cvs); cvs.style.zIndex = '1'; { let a = sup.querySelector('svg.surface') || sup.querySelector('.surface') || sup.querySelector('.layer-osm'); while (a && a.parentNode !== sup) a = a.parentNode; if (a && a !== cvs) { if (getComputedStyle(a).position === 'static') a.style.position = 'relative'; a.style.zIndex = '2'; } } /* pod warstwa SVG iD: linie, wezly i uchwyty zostaja na wierzchu i da sie edytowac */
    const cx = cvs.getContext('2d'), offc = document.createElement('canvas'), ocx = offc.getContext('2d');
    const bar = document.createElement('div'); bar.style.cssText = 'position:absolute;right:64px;bottom:40px;z-index:60;display:flex;flex-direction:column;gap:4px;font:13px system-ui;pointer-events:auto;box-shadow:0 1px 6px #0006;border-radius:8px'; mm.appendChild(bar); for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'dblclick', 'wheel', 'contextmenu']) bar.addEventListener(ev, e => e.stopPropagation());
    const mk = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'padding:6px 12px;border:1px solid #889;border-radius:8px;background:#fff;color:#222;cursor:pointer'; b.onclick = () => { f(b); last = ''; }; bar.appendChild(b); };
    { const vl = document.createElement('div'); vl.textContent = 'Pasy v%VERSION%'; vl.style.cssText = 'font:11px system-ui;color:#555;background:#fff;border-radius:6px;padding:2px 6px;text-align:center'; bar.appendChild(vl); }
    mk('Pasy: wł.', b => { IDL.on = !IDL.on; b.textContent = 'Pasy: ' + (IDL.on ? 'wł.' : 'wył.'); });
    IDL.hide = false; mk('Linie iD: wł.', b => { IDL.hide = !IDL.hide; b.textContent = 'Linie iD: ' + (IDL.hide ? 'wył.' : 'wł.'); css(); });
    mk('Diagnostyka', b => { const h = {}; sup.querySelectorAll('*').forEach(e => { const c = typeof e.className === 'string' ? e.className : (e.className && e.className.baseVal) || ''; const k = e.tagName.toLowerCase() + (c ? '.' + c.trim().split(/\s+/).slice(0, 3).join('.') : ''); h[k] = (h[k] || 0) + 1; }); const top = Object.entries(h).sort((x, y) => y[1] - x[1]).slice(0, 40).map(x => x[1] + 'x ' + x[0]).join('\n'); let pn = document.getElementById('idlanes-diag'); if (!pn) { pn = document.createElement('pre'); pn.id = 'idlanes-diag'; pn.style.cssText = 'position:absolute;left:8px;top:70px;z-index:70;max-width:70%;max-height:70%;overflow:auto;font:11px monospace;background:#fff;color:#222;border:1px solid #889;padding:6px;white-space:pre-wrap;pointer-events:auto'; pn.onclick = () => pn.remove(); mm.appendChild(pn); } pn.textContent = 'DIAG v%VERSION% (klik = zamknij)\ndrogi: ' + S.doc.road.slice(0, 6).map(r => r.osm + ' lanes=' + r.lanes + ' hw=' + r.hw).join(' | ') + '\ngrafy=' + GR.length + '\n' + top; });
    const st = document.createElement('style'); document.head.appendChild(st);
    const css = () => { st.textContent = IDL.hide ? ['motorway', 'trunk', 'primary', 'secondary'].map(h => '.layer-osm path.line[class*="tag-highway-' + h + '"],.layer-osm .line[class*="tag-highway-' + h + '"]').join(',') + '{display:none!important;visibility:hidden!important;opacity:0!important}' + ',g.onewaygroup,g.sidedgroup,g.onewaygroup *,g.sidedgroup *,path.oneway,path.sided,text.linelabel,text.linelabel-halo,textpath.textpath,.layer-labels,.layer-labels *,svg [class*="pathlabel"],svg [class*="textpath"],svg [class*="oneway"],svg [class*="sided"],svg [class*="onewaygroup"],svg text.pathlabel,.labels-group,.layer-osm marker,.layer-osm use[class*="oneway"]{display:none!important}' : ''; }; css();
    const ids = new WeakMap(); let nid = 0, last = '';
    const hashView = () => { const m = /map=([\d.]+)(?:\/|%2F)(-?[\d.]+)(?:\/|%2F)(-?[\d.]+)/i.exec(decodeURIComponent(location.hash || '')); return m ? { z: +m[1], lat: +m[2], lon: +m[3] } : null; };
    function ways() { const m = new Map(); document.querySelectorAll('.layer-osm path.line').forEach(p => { const d = p.__data__; if (d && d.type === 'way' && d.tags && d.tags.highway && !m.has(d.id)) m.set(d.id, d); }); return m; }
    let hs = 0; function hideLines() { if (Date.now() - hs < 120) return; hs = Date.now(); document.querySelectorAll('.layer-osm path, .layer-osm .onewaygroup, .layer-osm .sidedgroup, .layer-osm .oneway, .layer-osm .sided').forEach(p => { let d = p.__data__, q = p; for (let u = 0; u < 4 && !(d && d.type === 'way') && q.parentNode && q.parentNode !== document; u++) { q = q.parentNode; d = q.__data__; } if (!d || d.type !== 'way' || !d.tags || !d.tags.highway) return; const hw = String(d.tags.highway).replace('_link', ''); if (!OKHW.has(hw)) return; if (IDL.hide) { if (p.style.display !== 'none') p.style.setProperty('display', 'none', 'important'); p.setAttribute('data-idl-h', '1'); } else if (p.getAttribute('data-idl-h')) { p.style.removeProperty('display'); p.removeAttribute('data-idl-h'); } }); }
    /* kalibracja pozycji: wezel z danych iD ma na SVG transform translate(x,y); stad dokladny srodek mapy z ostatniego przerysowania iD (adres #map= opoznia sie podczas przesuwania) */
    function calib(hv, k, W0, H0) {
      const xy = e => { const t = e.getAttribute && e.getAttribute('transform'); let m = t && /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(t); if (m) return [+m[1], +m[2]]; if (e.getAttribute && e.getAttribute('cx') != null) return [+e.getAttribute('cx'), +e.getAttribute('cy')]; return null; };
      let n = 0; const els = document.querySelectorAll('.layer-osm g.vertex, .layer-osm g.point, .layer-osm .node, .layer-points g');
      for (const e of els) { let d = e.__data__, q = e; if (!(d && d.loc) && e.parentNode) { q = e.parentNode; d = q.__data__; } if (!d || !d.loc) continue; const c = xy(e) || xy(q); if (!c || !isFinite(c[0])) continue; const pv = proj(d.loc[0], d.loc[1]); return [pv[0] - (c[0] - W0 / 2) / k, pv[1] - (c[1] - H0 / 2) / k]; }
      return null;
    }
    /* iD moze blokowac <style> (CSP) - dlatego strzalki i etykiety chowamy tez przez styl inline na elementach */
    let hs2 = 0; function hideExtra() { if (Date.now() - hs2 < 150) return; hs2 = Date.now(); document.querySelectorAll('g.onewaygroup, g.sidedgroup, path.oneway, path.sided, text.linelabel, text.linelabel-halo, textpath, .layer-labels text, .layer-labels g, .labels-group').forEach(e => { if (IDL.hide) { if (e.style.display !== 'none') e.style.setProperty('display', 'none', 'important'); e.setAttribute('data-idl-x', '1'); } else if (e.getAttribute('data-idl-x')) { e.style.removeProperty('display'); e.removeAttribute('data-idl-x'); } }); }
    function tick() { hideLines(); hideExtra();
      const hv = hashView(), W0 = mm.clientWidth, H0 = mm.clientHeight; if (!hv || !W0 || !H0) return;
      const wm0 = ways(); let g = null, bs = -1; for (const c of GR.slice().reverse()) { let sc = 0; try { for (const id of wm0.keys()) { const e = c.hasEntity(id); if (e) sc += (e.v || 0) + 1; } } catch (e) { continue; } if (sc > bs) { bs = sc; g = c; } } if (!g) g = GR[GR.length - 1];
      const wm = new Map(); for (const [id, d] of wm0) { let e = d; try { e = g.hasEntity(id) || d; } catch (er) {} wm.set(id, e); }
      const kk = Math.pow(2, hv.z) / (156543.03 * Math.cos(hv.lat * Math.PI / 180)), cc0 = calib(hv, kk, W0, H0), sig = [hv.z, hv.lat, hv.lon, W0, H0, IDL.on, cc0 ? cc0[0].toFixed(2) + '/' + cc0[1].toFixed(2) : '']; for (const w of wm.values()) { let i = ids.get(w); if (!i) ids.set(w, i = ++nid); sig.push(i); }
      const key = sig.join(','); if (key === last) return; last = key;
      DPR = window.devicePixelRatio || 1; W = W0; H = H0; for (const c of [cvs, offc]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); } cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
      cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cvs.width, cvs.height); if (!IDL.on || hv.z < 16 || !wm.size) return;
      // graf aktualny = taki, ktory zwraca ta sama encje drogi co element SVG
      
      S.org = { lat: hv.lat, lon: hv.lon }; S.view.k = Math.pow(2, hv.z) / (156543.03 * Math.cos(hv.lat * Math.PI / 180)); { const cc = calib(hv, S.view.k, W0, H0); S.view.x = cc ? cc[0] : 0; S.view.y = cc ? cc[1] : 0; }
      const wmap = new Map(), roads = [];
      for (const e of wm.values()) { const hw = (e.tags.highway || '').replace('_link', ''); if (!OKHW.has(hw) || e.tags.area === 'yes' || e.nodes.length < 2) continue; const pts = [], nk = []; let bad = false; for (const n of e.nodes) { const nd = g.hasEntity(n); if (!nd || !nd.loc) { bad = true; break; } pts.push(proj(nd.loc[0], nd.loc[1])); nk.push(n); } if (bad) continue; const num = +String(e.id).slice(1), o = { id: num, t: { ...e.tags }, g: pts, nk }; wmap.set(num, o); try { roads.push(makeRoad(o, 0, pts.length - 1)); } catch (er) { console.warn('idlanes makeRoad', er); } }
      S.osm.ways = wmap; S.doc.road = roads; S.dirty = true; try { L = layout(); } catch (e) { console.warn('idlanes layout', e); L = null; } S.dirty = false; if (!L) return;
      ocx.setTransform(DPR, 0, 0, DPR, 0, 0); ocx.clearRect(0, 0, W, H); try { drawLayer(ocx); } catch (e) { console.warn('idlanes draw', e); } cx.drawImage(offc, 0, 0);
    }
    let lt = 0; const loop = t => { if (t - lt >= 30) { lt = t; try { tick(); } catch (e) { console.warn('idlanes tick', e); } } requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    window.__idlanes = IDL;
  }
})();
