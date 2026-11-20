// Testy sandbox2 w Playwright: python3 -m http.server 8765 &  node tools/testy-sandbox2.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(),
    p = await b.newPage();
  p.on('pageerror', (e) => console.log('BŁĄD STRONY', e.message));
  await p.goto(`http://localhost:${process.argv[2] || 8765}/sandbox2.html`);
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const R = testy2();
    return { ok: R.total - R.length, total: R.total, bad: R.map((x) => x.n + ': ' + x.E.join('; ')) };
  });
  console.log('OK', r.ok, '/', r.total);
  r.bad.forEach((x) => console.log('✗', x));
  await b.close();
})();
