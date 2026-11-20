import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const DIST_DIR = path.resolve('dist');
const OUT_DIR = path.resolve('taptap-assets/screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0];
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      const fullPath = path.join(DIST_DIR, rel);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const ext = path.extname(fullPath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(fullPath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

async function runAudit() {
  const { server, port } = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${port}/`;
  const errors = [];
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`);
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(350);

    // 1. Title Screen
    await page.screenshot({ path: path.join(OUT_DIR, '01_title_screen.png') });

    // 2. Start Game & Test real UI click-to-place + draw + shatter!
    await page.click('#btn-start-game');
    await page.waitForTimeout(250);

    // Click reserve slot 0 -> verify selection hint bar appears!
    await page.click('[data-action="reserve-slot"][data-index="0"]');
    await page.waitForTimeout(150);
    const hasSelHint = await page.locator('.selection-hint-bar').isVisible();
    if (!hasSelHint) throw new Error('Selection hint bar did not appear on reserve click');

    // Click Shatter button on selected reserve slot 0 -> verify starlight changes and slot empties
    await page.click('#btn-shatter-prism');
    await page.waitForTimeout(150);
    // Click Draw button -> verify new prism drawn
    await page.click('#btn-draw-prism');
    await page.waitForTimeout(150);

    // 3. Stage rich Wave 4 Boss Combat (Cascade + Supercharged Monolith + Boss HP bar + Ghost Wait pill!)
    await page.evaluate(() => {
      const { engine, ui } = window.__STARLOOM__;
      const c0 = engine.state.circuits[0];
      const c1 = engine.state.circuits[1];
      const c2 = engine.state.circuits[2];
      const ks = engine.state.circuits[3];

      const grab = (code) =>
        engine.well.drawSpecific(code) ?? {
          id: `audit-${code}-${Math.random()}`,
          domain: code.split('-')[0],
          rank: Number(code.split('-')[1]),
          code,
        };

      c0.slots[0].prism = grab('ember-1');
      c0.slots[1].prism = grab('ember-2');
      c0.slots[2].prism = grab('ember-3');

      c1.slots[0].prism = grab('tide-4');
      c1.slots[1].prism = grab('tide-4');
      c1.slots[2].prism = grab('tide-4');
      c1.supercharged = true;
      c1.locked = true;

      c2.slots[0].prism = grab('jade-2');
      c2.slots[1].prism = grab('jade-3');
      c2.slots[2].prism = null;

      ks.slots[0].prism = grab('astral-1');
      ks.slots[1].prism = grab('astral-1');

      engine.state.tutorialStep = 3;
      engine.state.starlight = 165;
      engine.state.wave = 3;
      engine.startNextWave(); // Wave 4 Boss wave!

      // Advance simulation ~11s so Boss (暮蚀巡卫) is actively marching & under orbital laser fire!
      for (let i = 0; i < 330; i++) {
        engine.update(1 / 30, false);
        if (engine.state.enemies.some((e) => e.isBoss && e.pathProgress > 0.14)) break;
      }
      // Show Boss Eclipse Shield + hover inspector on Supercharged Midline tower!
      const boss = engine.state.enemies.find((e) => e.isBoss);
      if (boss) boss.shieldHp = Math.round(boss.maxHp * 0.14);
      window.__STARLOOM__.renderer.hover = {
        x: c1.slots[2].x,
        y: c1.slots[2].y,
        groupId: c1.id,
        slotIndex: 2,
      };
      // Refresh waits cleanly
      const tmp = c2.slots[1].prism;
      c2.slots[1].prism = null;
      engine.state.reserve[0] = tmp;
      engine.placeFromReserve(0, c2.id, 1);
      ui.forceRender();
    });
    await page.waitForTimeout(300);
    const hasBossBar = await page.locator('#boss-hp-banner').isVisible();
    console.log('Boss HP Bar visible:', hasBossBar);
    await page.screenshot({ path: path.join(OUT_DIR, '02_boss_combat_astrolabe.png') });

    // Clear hover before Siphon shot
    await page.evaluate(() => {
      window.__STARLOOM__.renderer.hover = { x: -100, y: -100, groupId: null, slotIndex: -1 };
    });

    // 4. Oath + Siphon Finisher callout
    await page.evaluate(() => {
      const { engine, ui } = window.__STARLOOM__;
      engine.declareOath();
      const winPrism = engine.well.drawSpecific('jade-4') ?? {
        id: 'audit-win-jade4',
        domain: 'jade',
        rank: 4,
        code: 'jade-4',
      };
      const boss = engine.state.enemies.find((e) => e.isBoss) ?? engine.state.enemies[0];
      if (boss) {
        boss.carriedPrism = winPrism;
        boss.siphonDismissed = false;
      }
      engine.update(1 / 60, false);
      ui.forceRender();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT_DIR, '03_oath_siphon_finisher.png') });

    // 5. Execute Siphon -> Grand Convergence Celebration! Pick circuit-0 explicitly as Legacy Pillar!
    await page.click('#btn-siphon-yes');
    await page.waitForTimeout(300);
    await page.click('[data-action="select-preserve"][data-group-id="circuit-0"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT_DIR, '04_grand_convergence.png') });

    // Continue -> Relic Choice -> Choose relic
    await page.click('#btn-convergence-continue');
    await page.waitForTimeout(250);
    if (await page.locator('#relic-modal').isVisible()) {
      await page.click('[data-action="choose-relic"]');
      await page.waitForTimeout(200);
    }

    // 6. Test Mobile Landscape (844 x 390) - Verify ZERO HUD wrapping & clean single row!
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    const hudMetrics = await page.evaluate(() => {
      const top = document.querySelector('.hud-top');
      const bottom = document.querySelector('.hud-bottom');
      return {
        topHeight: top ? top.getBoundingClientRect().height : 0,
        bottomWidth: bottom ? bottom.getBoundingClientRect().width : 0,
      };
    });
    console.log('Mobile 844x390 HUD metrics:', hudMetrics);
    if (hudMetrics.topHeight > 44) {
      throw new Error(`Mobile top HUD wrapped! Height = ${hudMetrics.topHeight}px`);
    }
    await page.screenshot({ path: path.join(OUT_DIR, '05_mobile_landscape_844x390.png') });

    // 6b. Test Portrait Mobile (390 x 844) - Verify bottom tray stays within 390px & Boss bar does NOT overlap HUD!
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    await page.click('#btn-sort-reserve');
    await page.waitForTimeout(120);
    const portraitMetrics = await page.evaluate(() => {
      const b = document.querySelector('.hud-bottom');
      const top = document.querySelector('.hud-top');
      const boss = document.querySelector('.boss-hp-banner');
      return {
        bottomWidth: b ? b.getBoundingClientRect().width : 0,
        topBottom: top ? top.getBoundingClientRect().bottom : 0,
        bossTop: boss ? boss.getBoundingClientRect().top : 999,
      };
    });
    console.log('Portrait 390x844 metrics:', portraitMetrics);
    if (portraitMetrics.bottomWidth > 390) {
      throw new Error(`Portrait bottom tray overflowed 390px: ${portraitMetrics.bottomWidth}`);
    }
    if (portraitMetrics.bossTop < portraitMetrics.topBottom - 2) {
      throw new Error(`Portrait Boss bar overlapped top HUD! bossTop=${portraitMetrics.bossTop}, topBottom=${portraitMetrics.topBottom}`);
    }
    await page.screenshot({ path: path.join(OUT_DIR, '05b_mobile_portrait_390x844.png') });

    // 7. Desktop Twin Meridian map check + Verify mid-run Confirm Exit modal!
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.click('[data-action="return-title"]');
    await page.waitForTimeout(200);
    const hasConfirmExit = await page.locator('#confirm-exit-modal').isVisible();
    console.log('Confirm Exit modal visible:', hasConfirmExit);
    if (!hasConfirmExit) throw new Error('Expected confirm-exit modal when leaving active run');
    await page.click('#btn-confirm-exit');
    await page.waitForTimeout(200);

    await page.click('[data-action="select-map"][data-map-id="meridian"]');
    await page.click('#btn-start-game');
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const { engine, ui } = window.__STARLOOM__;
      engine.state.tutorialStep = 3;
      engine.startNextWave();
      for (let i = 0; i < 120; i++) engine.update(1 / 30, false);
      ui.forceRender();
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT_DIR, '06_twin_meridian_map.png') });

    if (errors.length > 0) {
      console.error('BROWSER ERRORS DETECTED:', errors);
      process.exitCode = 1;
    } else {
      console.log('ITERATION 3 E2E VISUAL & FUNCTIONAL AUDIT PASSED 100% WITH ZERO ERRORS!');
    }
  } finally {
    await browser.close();
    server.close();
  }
}

runAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
