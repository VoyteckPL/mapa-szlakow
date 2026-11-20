// Testy geometrii sandboksu w Playwright (chmura). Uruchom w katalogu repo:
//   python3 -m http.server 8765 &  node tools/testy-sandbox.js [port]
// Wypisuje liczbę scen OK, błędy wg typu i grupy. Kod testów: sandbox/7-testy.js
const { chromium } = require('playwright');
(async () => {
  const port = process.argv[2] || 8765,
    b = await chromium.launch(),
    p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  p.on('pageerror', (e) => console.log('BŁĄD STRONY', e.message));
  await p.goto(`http://localhost:${port}/sandbox-drog.html`);
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => sxTesty.runAll().map((x) => ({ n: x.n, E: x.E.map((e) => e.t + ': ' + e.m) })));
  const bad = r.filter((x) => x.E.length);
  console.log('OK', r.length - bad.length, '/', r.length);
  const g = {};
  r.forEach((x) => {
    const k = x.n.split(' · ')[0];
    g[k] = g[k] || { n: 0, bad: 0 };
    g[k].n++;
    if (x.E.length) g[k].bad++;
  });
  for (const k in g) console.log(String(g[k].bad).padStart(3), '/', g[k].n, k);
  for (const x of bad) console.log('✗', x.n, '|', x.E.slice(0, 2).join(' || '));
  await b.close();
})();
