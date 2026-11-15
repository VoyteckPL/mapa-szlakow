// Wspólna konfiguracja: używana przez stronę (index.html) i przez skrypt snapshotu (scripts/snapshot.mjs).
(function (root) {
  const REGIONS = {
    gdynia: { name: 'Gdynia', bbox: [54.42, 18.36, 54.61, 18.60], center: [18.49, 54.51], zoom: 12, preload: true },
    trojmiasto: { name: 'Trójmiasto', bbox: [54.27, 18.33, 54.62, 18.80], center: [18.57, 54.43], zoom: 11, preload: false },
    polska: { name: 'Polska', bbox: [49.0, 14.1, 54.9, 24.2], center: [19.4, 52.0], zoom: 6, preload: false },
  };

  const OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];

  // Zapytanie Overpass: relacje szlaków + ich drogi w bbox + infrastruktura rowerowa.
  function buildQuery(b) {
    const bb = b.map(v => v.toFixed(5)).join(',');
    return `[out:json][timeout:120];
  rel[type=route][route~"^(bicycle|mtb|hiking|foot|walking)$"](${bb})->.r;
  .r out body;
  way(r.r)(${bb})->.rw;
  (
    way[highway=cycleway](${bb});
    way[highway][cycleway=crossing](${bb});
    way[highway~"^(path|footway|pedestrian|track|service|living_street|bridleway)$"][bicycle=designated](${bb});
    way[highway][~"^cycleway(:both|:left|:right)?$"~"^(lane|opposite_lane|track|opposite_track|share_busway|opposite_share_busway|shared_lane|opposite)$"](${bb});
    way[highway]["oneway:bicycle"=no][oneway~"^(yes|-1|1|true)$"](${bb});
  )->.inf;
  (.rw; .inf;);
  out geom;`;
  }

  // Wszystkie jezdnie (do realistycznego widoku na największym zoomie). Zapisywane w kafelkach
  // ROAD_TILE (stopnie), żeby przeglądarka wczytywała tylko widoczny fragment miasta.
  const ROAD_TILE = { dlat: 0.01, dlon: 0.02 };
  const ROAD_TAGS = ['highway', 'name', 'lanes', 'lanes:forward', 'lanes:backward', 'oneway', 'width', 'surface', 'junction',
    'turn:lanes', 'turn:lanes:forward', 'turn:lanes:backward', 'lane_markings', 'layer', 'bridge',
    'cycleway', 'cycleway:both', 'cycleway:left', 'cycleway:right', 'oneway:bicycle'];
  function buildRoadsQuery(b) {
    const bb = b.map(v => v.toFixed(5)).join(',');
    return `[out:json][timeout:180];
  way[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|busway)(_link)?$"][area!=yes][tunnel!~"^(yes|building_passage)$"][covered!=yes](${bb});
  out geom;`;
  }

  const C = { REGIONS, OVERPASS, buildQuery, ROAD_TILE, ROAD_TAGS, buildRoadsQuery };
  if (typeof module !== 'undefined' && module.exports) module.exports = C; else root.MS_CONFIG = C;
})(typeof window !== 'undefined' ? window : globalThis);
