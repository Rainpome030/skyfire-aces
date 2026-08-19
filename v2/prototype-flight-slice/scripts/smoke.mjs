import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = 'http://127.0.0.1:4173';
const artifacts = join(root, 'artifacts');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

await mkdir(artifacts, { recursive: true });

const server = spawn(npmCommand, ['run', 'dev'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite server did not start.\n${serverOutput}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const checks = [
    { name: 'A-desktop', viewport: { width: 1440, height: 900 } },
    { name: 'A-mobile-portrait', viewport: { width: 390, height: 844 }, touch: true },
    { name: 'A-mobile-landscape', viewport: { width: 844, height: 390 }, touch: true }
  ];

  for (const check of checks) {
    const context = await browser.newContext({
      viewport: check.viewport,
      hasTouch: Boolean(check.touch),
      isMobile: Boolean(check.touch),
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__skyfireSlice));
    await page.waitForFunction(() => window.__skyfireSlice?.getState().assetsReady === true);
    await page.locator('#start-button').click();
    await page.waitForTimeout(700);
    const initial = await page.evaluate(() => window.__skyfireSlice?.getState());
    if (!initial || !initial.started || initial.timeRemaining >= 210 || initial.enemiesAlive !== 2 || initial.phase !== 'INFILTRATION') {
      throw new Error(`${check.name}: simulation did not advance correctly: ${JSON.stringify(initial)}`);
    }

    if (check.touch) {
      const altitudeBox = await page.locator('#altitude-control').boundingBox();
      if (!altitudeBox) throw new Error(`${check.name}: altitude button has no layout box`);
      await page.touchscreen.tap(altitudeBox.x + altitudeBox.width / 2, altitudeBox.y + altitudeBox.height / 2);
    }
    else await page.keyboard.press('Space');
    await page.waitForTimeout(450);
    const climbed = await page.evaluate(() => window.__skyfireSlice?.getState());
    if (!climbed || climbed.altitudeMode !== 'HIGH' || climbed.altitude <= 8) {
      throw new Error(`${check.name}: altitude action failed: ${JSON.stringify(climbed)}`);
    }

    if (check.touch) {
      const client = await context.newCDPSession(page);
      const touchX = check.viewport.width * 0.82;
      const touchY = check.viewport.height * 0.52;
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: touchY, id: 1, radiusX: 6, radiusY: 6 }] });
      await page.waitForTimeout(900);
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const missileBox = await page.locator('#missile-control').boundingBox();
      if (!missileBox) throw new Error(`${check.name}: missile button has no layout box`);
      await page.touchscreen.tap(missileBox.x + missileBox.width / 2, missileBox.y + missileBox.height / 2);
    } else {
      await page.keyboard.down('d');
      await page.waitForTimeout(900);
      await page.keyboard.up('d');
      await page.keyboard.press('e');
    }
    await page.waitForTimeout(250);
    const acted = await page.evaluate(() => window.__skyfireSlice?.getState());
    if (!acted || acted.missilesFired !== 1 || Math.abs(acted.heading - initial.heading) < 0.25) {
      throw new Error(`${check.name}: steer or missile action failed: ${JSON.stringify(acted)}`);
    }

    const canvas = page.locator('canvas');
    if ((await canvas.count()) !== 1 || !(await canvas.isVisible())) throw new Error(`${check.name}: WebGL canvas is not visible`);
    if (check.touch) {
      const buttons = await page.locator('.touch-controls button').evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
      }));
      for (const button of buttons) {
        if (button.left < 0 || button.top < 0 || button.right > check.viewport.width || button.bottom > check.viewport.height || button.width < 44 || button.height < 44) {
          throw new Error(`${check.name}: touch target is clipped or too small: ${JSON.stringify(button)}`);
        }
      }
    }
    await page.screenshot({ path: join(artifacts, `${check.name}.png`), fullPage: true });
    if (errors.length) throw new Error(`${check.name}: runtime errors: ${errors.join(' | ')}`);
    console.log(`PASS ${check.name} ${check.viewport.width}x${check.viewport.height}`);
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
