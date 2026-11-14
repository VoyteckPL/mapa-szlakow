// Pobiera dane z Overpass dla regionów z `preload: true` i zapisuje je w data/<region>.json.
// Uruchamiany co ~15 min przez GitHub Actions (.github/workflows/snapshot.yml).
// Plik jest nadpisywany tylko wtedy, gdy zmieniły się dane OSM (nie sam znacznik czasu),
// żeby nie tworzyć pustych commitów.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { REGIONS, OVERPASS, buildQuery } = require('../js/config.js');
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
process.exit(failed ? 1 : 0);
