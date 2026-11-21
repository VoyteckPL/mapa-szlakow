// Sandbox v1 – start: scena z localStorage (albo szablon 2-2) i widok mapy po F5. Ładowany po modułach nm-*.
(function () {
  var S = window.SV, map = S.map, KEY = S.KEY;
  var saved = null; try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  // widok mapy (środek, zoom) pamiętany po F5
  var V = null; try { V = JSON.parse(localStorage.getItem('sv1-widok')); } catch (e) {}
  map.on('moveend', function () { try { var c = map.getCenter(); localStorage.setItem('sv1-widok', JSON.stringify({ lat: c.lat, lng: c.lng, z: map.getZoom() })); } catch (e) {} });
  if (saved && saved.roads) { S.setScene(saved); S.last = JSON.stringify(S.sc); if (V) map.setView([V.lat, V.lng], V.z); else map.setView([S.O.lat, S.O.lng], 18); S.draw(); }
  else S.loadTpl('2-2', S.TPL[0].it[0][1]);
})();
