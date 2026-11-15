// Pobiera dane z Overpass dla regionów z `preload: true` i zapisuje je w data/<region>.json.
// Uruchamiany co ~15 min przez GitHub Actions (.github/workflows/snapshot.yml).
// Plik jest nadpisywany tylko wtedy, gdy zmieniły się dane OSM (nie sam znacznik czasu),
// żeby nie tworzyć pustych commitów.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { REGIONS, OVERPASS, buildQuery, ROAD_TILE, ROAD_TAGS, buildRoadsQuery } = require('../js/config.js');
const ROADS_EVERY_MS = 6 * 60 * 60 * 1000; // jezdnie odświeżamy rzadziej (duże zapytanie)
const MAX_STALENESS_MS = 60 * 60 * 1000;

async function overpass(query) {
  let lastErr;
  for (let attempt = 0; attempt < OVERPASS.length * 3; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length];
    try {
      const res = await fetch(url, {
        method: 'POST', body: new URLSearchParams({ data: query }),
        headers: { 'User-Agent': 'mapa-szlakow-snapshot (GitHub Actions)' },
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
      const json = await res.json();
      const base = Date.parse(json.osm3s?.timestamp_osm_base);
      if (!(Date.now() - base < MAX_STALENESS_MS)) throw new Error(`${url} nieaktualne dane ${json.osm3s?.timestamp_osm_base}`);
      return json;
    } catch (e) {
      lastErr = e; console.warn(String(e.message || e));
      await new Promise(r => setTimeout(r, 10_000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
let failed = 0;
for (const [id, region] of Object.entries(REGIONS).filter(([, r]) => r.preload)) {
  const file = new URL(`../data/${id}.json`, import.meta.url);
  try {
    const json = await overpass(buildQuery(region.bbox));
    const elements = JSON.stringify(json.elements);
    let old = null;
    try { old = JSON.parse(await readFile(file, 'utf8')); } catch {}
    if (old && JSON.stringify(old.elements) === elements) { console.log(`${id}: bez zmian`); continue; }
    await writeFile(file, JSON.stringify({ region: id, osmBase: json.osm3s.timestamp_osm_base, fetchedAt: new Date().toISOString(), elements: json.elements }));
    console.log(`${id}: zapisano ${json.elements.length} elementów, stan OSM ${json.osm3s.timestamp_osm_base}`);
  } catch (e) { failed++; console.error(`${id}: ${e.message || e}`); }
}
// Jezdnie: kafelki data/roads/<region>/<x>_<y>.json, droga trafia do każdego kafelka, przez który przechodzi.
for (const [id, region] of Object.entries(REGIONS).filter(([, r]) => r.preload)) {
  const dir = new URL(`../data/roads/${id}/`, import.meta.url), meta = new URL('meta.json', dir);
  try {
    const m = JSON.parse(await readFile(meta, 'utf8'));
    if (Date.now() - Date.parse(m.fetchedAt) < ROADS_EVERY_MS) { console.log(`${id}: jezdnie aktualne`); continue; }
  } catch {}
  try {
    const json = await overpass(buildRoadsQuery(region.bbox));
    const out = new Map();
    for (const e of json.elements) {
      if (e.type !== 'way' || !e.geometry) continue;
      const t = {}; for (const k of ROAD_TAGS) if (e.tags?.[k] !== undefined) t[k] = e.tags[k];
      const g = e.geometry.map(p => [+p.lon.toFixed(7), +p.lat.toFixed(7)]);
      const keys = new Set(g.map(([x, y]) => Math.floor(x / ROAD_TILE.dlon) + '_' + Math.floor(y / ROAD_TILE.dlat)));
      for (const k of keys) { if (!out.has(k)) out.set(k, []); out.get(k).push({ i: e.id, t, g }); }
    }
    await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
    for (const [k, list] of out) await writeFile(new URL(`${k}.json`, dir), JSON.stringify(list));
    await writeFile(meta, JSON.stringify({ osmBase: json.osm3s.timestamp_osm_base, fetchedAt: new Date().toISOString(), tiles: [...out.keys()] }));
    console.log(`${id}: jezdnie ${json.elements.length} dróg w ${out.size} kafelkach`);
  } catch (e) { failed++; console.error(`${id} jezdnie: ${e.message || e}`); }
}
process.exit(failed ? 1 : 0);
