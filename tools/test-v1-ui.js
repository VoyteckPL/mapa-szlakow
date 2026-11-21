// Test regresji UI sandbox-v1 (Playwright, chmura):  python3 -m http.server 8765 &  node tools/test-v1-ui.js [--zapisz] [port]
// Każdy szablon + przełączenie każdej nakładki: odcisk narysowanych ścieżek SVG i tekstu paneli; błędy strony = błąd.
// --zapisz zapisuje odciski do tools/v1-ui-oczekiwane.json, bez flagi porównuje.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const zap = process.argv.includes('--zapisz'), port = process.argv.filter((a) => /^\d+$/.test(a))[0] || 8765;
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1400, height: 900 } }), bl = [];
  p.on('pageerror', (e) => bl.push(e.message));
  // bez dostępu do unpkg: LEAFLET_DIR=…/leaflet/dist (npm pack leaflet@1.9.4); kafelki podkładu blokowane (nie wpływają na wynik)
  if (process.env.LEAFLET_DIR) await p.route(/unpkg\.com\/leaflet@1\.9\.4\/dist\//, (r) => r.fulfill({ path: path.join(process.env.LEAFLET_DIR, r.request().url().split('/dist/')[1]) }));
  await p.route(/tile|arcgis|geoportal/i, (r) => r.abort());
  await p.goto(`http://localhost:${port}/sandbox-v1.html`);
  await p.waitForSelector('.sv-tpl', { state: 'attached' }); await p.waitForTimeout(500);
  const stan = () => p.evaluate(() => [...document.querySelectorAll('path')].map((e) => e.getAttribute('d') + '|' + e.getAttribute('stroke') + '|' + e.getAttribute('fill')).join('\n')
    + '\n#' + [...document.querySelectorAll('.leaflet-control')].map((e) => e.innerText).join('\n') + '\n#' + [...document.querySelectorAll('.leaflet-marker-icon,.leaflet-tooltip')].length);
  const h = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16), wyn = {};
  const tpl = await p.$$eval('.sv-tpl', (a) => a.map((e) => e.textContent));
  const nak = await p.$$eval('.leaflet-control-layers-overlays label', (a) => a.map((e) => e.textContent.trim()));
  for (let i = 0; i < tpl.length; i++) {
    await p.evaluate((i) => document.querySelectorAll('.sv-tpl')[i].click(), i); await p.waitForTimeout(150);
    wyn['szablon ' + tpl[i]] = h(await stan());
    if (tpl[i] !== '3-2+1') continue;
    for (let j = 0; j < nak.length; j++) {
      const kl = () => p.evaluate((j) => document.querySelectorAll('.leaflet-control-layers-overlays input')[j].click(), j);
      await kl(); await p.waitForTimeout(150); wyn['3-2+1 nakładka ' + nak[j]] = h(await stan()); await kl(); await p.waitForTimeout(100);
    }
  }
  // zaznaczenie punktu i drogi (panel), przeciąganie z ∠5, 💾 wzorzec (config), F5 (scena z localStorage)
  await p.evaluate(() => [...document.querySelectorAll('.sv-tpl')].find((e) => e.textContent === '3-2+1').click()); await p.waitForTimeout(150);
  const bx = await p.$eval('#map', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.evaluate(() => document.querySelectorAll('.sv-pt')[1].click()); await p.waitForTimeout(150); wyn['panel punktu'] = h(await stan());
  await p.mouse.click(bx.x - 120, bx.y); await p.waitForTimeout(150); wyn['panel drogi'] = h(await stan());
  await p.evaluate(() => [...document.querySelectorAll('.sv-btn')].find((e) => e.textContent === '∠5').click());
  const pt = await p.$$eval('.sv-pt', (a) => { const r = a[a.length - 1].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.mouse.move(pt.x, pt.y); await p.mouse.down(); await p.mouse.move(pt.x + 23, pt.y + 31, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(200);
  wyn['przeciąganie ∠5'] = h(await stan());
  await p.evaluate(() => [...document.querySelectorAll('.sv-btn')].find((e) => e.textContent === '💾').click()); await p.waitForTimeout(150);
  wyn['wzorzec 💾'] = h(await p.evaluate(() => localStorage.getItem('sv1-wzorce')));
  await p.reload(); await p.waitForSelector('.sv-tpl', { state: 'attached' }); await p.waitForTimeout(500); wyn['po F5'] = h(await stan());
  wyn['błędy strony'] = bl.join(' | ');
  await b.close();
  const plik = path.join(__dirname, 'v1-ui-oczekiwane.json');
  if (zap) { fs.writeFileSync(plik, JSON.stringify(wyn, null, 1) + '\n'); console.log('zapisano', Object.keys(wyn).length, bl.length ? 'BŁĘDY: ' + bl : ''); return; }
  const ocz = JSON.parse(fs.readFileSync(plik, 'utf8')); let n = 0;
  for (const k in ocz) if (ocz[k] !== wyn[k]) { n++; console.log('✗', k, wyn[k]); }
  console.log(n ? 'BŁĘDY: ' + n : 'OK ' + Object.keys(ocz).length); process.exit(n ? 1 : 0);
})();
