// Opens Roni's live site in Safari's engine (WebKit, as on an iPhone) and Chrome's, goes to her map, switches to
// the street map and the satellite, and reports what loaded and what failed, as notes on the run.
const { webkit, chromium, devices } = require('playwright');
const fs = require('fs');
const pw = JSON.parse(fs.readFileSync('roni/content.json', 'utf8')).site.password;
const note = (s) => console.log('::notice::' + s.replace(/\n/g, ' ').slice(0, 900));
(async () => {
  for (const [name, type, dev] of [['iPhone/WebKit', webkit, devices['iPhone 13']], ['Chrome', chromium, devices['Pixel 7']]]) {
    const browser = await type.launch();
    const page = await (await browser.newContext({ ...dev })).newPage();
    const log = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(m.type() + ': ' + m.text()); });
    page.on('pageerror', (e) => log.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => { if (!/fonts|open-meteo/.test(r.url())) log.push('failed: ' + r.url().slice(0, 100) + ' ' + (r.failure() || {}).errorText); });
    const tiles = { ok: 0, bad: 0 };
    page.on('response', (r) => { if (/cartocdn|arcgisonline/.test(r.url())) r.status() === 200 ? tiles.ok++ : (tiles.bad++, log.push('tile ' + r.status() + ' ' + r.url().slice(0, 90))); });
    await page.goto('https://alonzvisabag.github.io/roni/?me', { waitUntil: 'networkidle' });
    await page.fill('#pw-input', pw);
    await page.press('#pw-input', 'Enter');
    await page.waitForSelector('#reveal-continue.show-text', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.click('#reveal-continue');
    await page.waitForTimeout(4000);
    const launch = await page.$('#pl-launch .pl-l-later');
    if (launch) await launch.click();
    await page.$eval('#places-open-btn', (b) => b.click());
    await page.waitForTimeout(1500);
    for (const mode of ['map', 'sat']) {
      await page.click(`.pl-modes [data-mode="${mode}"]`);
      await page.waitForTimeout(5000);
      const st = await page.evaluate(() => {
        const box = document.getElementById('pl-real');
        const r = box.getBoundingClientRect();
        return `L=${typeof window.L} hidden=${box.hidden} size=${Math.round(r.width)}x${Math.round(r.height)} tiles=${box.querySelectorAll('img.leaflet-tile').length} loaded=${box.querySelectorAll('img.leaflet-tile-loaded').length} pins=${box.querySelectorAll('.pl-pin').length} css=${!!document.querySelector('link[href="lib/leaflet.css"]')}`;
      });
      note(`${name} ${mode}: ${st}; tile responses ok=${tiles.ok} bad=${tiles.bad}`);
      await page.screenshot({ path: `shot-${name.replace(/\W/g, '')}-${mode}.png` });
    }
    // close and open again: her phone remembers the last look, so the screen opens straight into it
    await page.click('#places-back-btn');
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.$eval('#places-open-btn', (b) => b.click());
    await page.waitForTimeout(5000);
    note(`${name} reopened: ` + await page.evaluate(() => {
      const box = document.getElementById('pl-real');
      return `hidden=${box.hidden} loaded=${box.querySelectorAll('img.leaflet-tile-loaded').length} pins=${box.querySelectorAll('.pl-pin').length} fix=${!!document.querySelector('script[src="places.js"]')}`;
    }) + ' places.js has the fix: ' + (await (await page.request.get('https://alonzvisabag.github.io/roni/places.js')).text()).includes('fitWhenVisible'));
    note(`${name} problems: ${log.slice(0, 8).join(' | ') || 'none'}`);
    await browser.close();
  }
})().catch((e) => { note('crash: ' + e.message); process.exit(1); });
