// Sandbox v1 – pamięć ustawień po F5 (localStorage 'sv1-ustaw'): warstwy (podkład + nakładki), przełączniki (przyciski z klasą .on,
// rozpoznawane po tytule – zapamiętywane te, które kiedykolwiek się przełączyły) i rozdzielczość siatki ▦.
(function () {
  var S = window.SV, map = S.map, lay = S.layers, K = 'sv1-ustaw', st = {};
  try { st = JSON.parse(localStorage.getItem(K)) || {}; } catch (e) {}
  st.tg = st.tg || {};
  var btns = function () { return [].slice.call(document.querySelectorAll('.sv-btn')); };
  var ready = false;
  function save() {
    if (!ready) return;
    var ov = [], base = null;
    lay._layers.forEach(function (o) { if (map.hasLayer(o.layer)) { if (o.overlay) ov.push(o.name); else base = o.name; } });
    st.ov = ov; st.base = base;
    btns().forEach(function (b) { if (b.title in st.tg) st.tg[b.title] = b.classList.contains('on'); if (b.textContent[0] === '▦') st.grid = b.textContent; });
    try { localStorage.setItem(K, JSON.stringify(st)); } catch (e) {}
  }
  // przyciski: zapamiętaj, które są przełącznikami (zmieniły .on po kliknięciu)
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.sv-btn'); if (!b) return;
    var was = b.classList.contains('on');
    setTimeout(function () { if (b.classList.contains('on') !== was) st.tg[b.title] = true; save(); }, 0);
  }, true);
  map.on('overlayadd overlayremove baselayerchange', save);
  // przywracanie
  if (st.base) lay._layers.forEach(function (o) { if (!o.overlay) { if (o.name === st.base) map.addLayer(o.layer); else map.removeLayer(o.layer); } });
  if (st.ov) lay._layers.forEach(function (o) { if (o.overlay) { var on = st.ov.indexOf(o.name) >= 0; if (on && !map.hasLayer(o.layer)) map.addLayer(o.layer); if (!on && map.hasLayer(o.layer)) map.removeLayer(o.layer); } });
  btns().forEach(function (b) {
    if (b.title in st.tg && b.classList.contains('on') !== st.tg[b.title]) b.click();
    if (st.grid && b.textContent[0] === '▦') for (var i = 0; i < 12 && b.textContent !== st.grid; i++) b.click();
  });
  ready = true;
})();
