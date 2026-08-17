// Focused regression checks for the portrait-touch HUD contract.
// Run: node work/verify-portrait-hud.mjs
// Uses only the local HTML file, local Chrome, and Chrome DevTools Protocol.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FILE = join(ROOT, 'outputs', 'skyfire-aces.html');
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find(existsSync);
const PLAYWRIGHT_CANDIDATES = [
  process.env.PLAYWRIGHT_MODULE,
  process.env.USERPROFILE && join(process.env.USERPROFILE, '.cache', 'codex-runtimes',
    'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright', 'index.mjs')
].filter(Boolean);
const html = readFileSync(FILE, 'utf8');
const htmlHash = createHash('sha256').update(html).digest('hex');
const checks = [];

function check(name, pass, detail = '') {
  const ok = !!pass;
  checks.push({ name, pass: ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`);
}

function slice(a, b) {
  const i = html.indexOf(a);
  const j = html.indexOf(b, i + 1);
  return i < 0 || j < 0 ? '' : html.slice(i, j);
}

const requiredStatic = [
  ['DASH_RECT', /const\s+DASH_RECT\s*=/],
  ['portrait hudRects fields', /portraitTouch/.test(html) && /buffStack/.test(html) && /warningLane/.test(html)],
  ['missile ON/OFF state', /missileAuto/.test(html)],
  ['dt lock acquisition', /function\s+acquireLock\s*\(dt\)/],
  ['settings scroll range', /function\s+settingsMaxScroll\s*\(/]
];
for (const [name, test] of requiredStatic) {
  check(`S ${name}`, test instanceof RegExp ? test.test(html) : test);
}
check('S target change resets lock before accumulation', (() => {
  const block = slice('function acquireLock', 'function updateBullets');
  return /best\s*!==\s*previousTarget/.test(block) && /player\.lock\s*=\s*0/.test(block);
})());

async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  for (const candidate of PLAYWRIGHT_CANDIDATES) {
    if (!existsSync(candidate)) continue;
    try { return await import(pathToFileURL(candidate).href); } catch {}
  }
  throw new Error(`Playwright not found; set PLAYWRIGHT_MODULE or use the bundled Codex runtime (${PLAYWRIGHT_CANDIDATES.join(', ')})`);
}

class BrowserRun {
  constructor(width = 390, height = 844) {
    this.width = width;
    this.height = height;
    this.errors = [];
  }

  async start() {
    if (!CHROME) throw new Error(`Chrome not found; checked: ${CHROME_CANDIDATES.join(', ')}`);
    const { chromium } = await loadPlaywright();
    this.browser = await chromium.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--disable-extensions', '--disable-component-extensions-with-background-pages']
    });
    this.context = await this.browser.newContext({
      viewport: { width: this.width, height: this.height },
      deviceScaleFactor: 1
    });
    this.page = await this.context.newPage();
    this.page.on('pageerror', error => this.errors.push(String(error?.stack || error)));
    await this.page.goto(pathToFileURL(FILE).href, { waitUntil: 'load' });
    await this.page.waitForTimeout(250);
  }

  async viewport(width, height, dpr = 1) {
    this.width = width;
    this.height = height;
    if (dpr !== 1) throw new Error('This focused suite creates a DPR 1 context; launch a second context for other DPRs');
    await this.page.setViewportSize({ width, height });
    await this.page.waitForTimeout(100);
  }

  async eval(expression) {
    return this.page.evaluate(expression);
  }

  async stop() {
    try { await this.context?.close(); } catch {}
    try { await this.browser?.close(); } catch {}
  }
}

const BASE_SETUP = `
  input.isTouch = true;
  input.keys = {};
  input.mouse.down = false; input.mouse.rdown = false; input.mouse.mid = false; input.mouse.movedAt = -99;
  input.fireHeld = false; input.mslHeld = false; input.missileAuto = false;
  Object.assign(input.touch, { mslId:null, dashId:null, swipeId:null, throttleBarId:null, pauseId:null });
  touchSwipe.active = false; touchSwipe.dir = null; touchSwipe.strength = 0;
  document.documentElement.style.setProperty('--sat', '0px');
  document.documentElement.style.setProperty('--sar', '0px');
  document.documentElement.style.setProperty('--sab', '0px');
  document.documentElement.style.setProperty('--sal', '0px');
  if (typeof refreshSafeInsets === 'function') refreshSafeInsets();
  resize();
  startEndless();
  if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) ChapterCard.skip();
  if (typeof controlSchemeAsk !== 'undefined') controlSchemeAsk = false;
  upgradeChoice = null; transition.active = false; transition.cb = null;
  GAME.state = 'paused'; GAME.hintTimer = 0; GAME.freezeTimer = 0;
  player.alive = true; player.dead = false; player.invuln = 0;
  player.heading = -Math.PI / 2; player.speed = 200; player.throttle = 0.68;
  player.target = null; player.lock = 0; player.missileCd = 0;
  player.buffs = {};
  cam.x = player.x; cam.y = player.y; cam.shake = 0; cam.shakeX = 0; cam.shakeY = 0; cam.zoom = CAM_ZOOM;
`;

const TOUCH_HELPER = `
  const fireTouch = (type, id, x, y) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = rect.left + x * rect.width / W;
    const clientY = rect.top + y * rect.height / H;
    const event = new Event(type, { cancelable: true, bubbles: true });
    Object.defineProperty(event, 'changedTouches', { value: [{ identifier:id, clientX, clientY }] });
    canvas.dispatchEvent(event);
  };
`;

async function evalCheck(run, name, expression, predicate, formatter = JSON.stringify) {
  try {
    const value = await run.eval(expression);
    let pass = false;
    try { pass = !!predicate(value); } catch {}
    check(name, pass, formatter(value));
    return value;
  } catch (error) {
    check(name, false, `EXC: ${String(error?.message || error).slice(0, 240)}`);
    return undefined;
  }
}

const run = new BrowserRun();

try {
  await run.start();

  for (const [width, height] of [[360, 640], [360, 780], [390, 844]]) {
    await run.viewport(width, height);
    await evalCheck(run, `L ${width}x${height} bounds and critical overlap matrix`, `(() => {
      ${BASE_SETUP}
      const h = hudRects();
      const radar = { x:h.radar.x-h.radar.r, y:h.radar.y-h.radar.r, w:h.radar.r*2, h:h.radar.r*2 };
      const buffs = Array.from({length:4}, (_, i) => ({
        x:h.buffStack.x, y:h.buffStack.y+i*(h.buffStack.h+h.buffStack.gap),
        w:h.buffStack.w, h:h.buffStack.h
      }));
      const rects = { mission:h.missionPanel, wingman:h.wingmanPanel, throttle:h.throttle,
        speed:h.speedAltBox, missile:h.msl, dash:h.dash, pause:h.pauseBtn, status:h.statusPanel,
        radar, hp:h.hpWin, weapon:h.weaponPanel, warning:h.warningLane };
      buffs.forEach((b, i) => { rects['buff'+i] = b; });
      const finiteRect = r => r && [r.x,r.y,r.w,r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;
      const overlap = (a,b) => a && b && a.x < b.x+b.w && b.x < a.x+a.w && a.y < b.y+b.h && b.y < a.y+a.h;
      const badBounds = Object.entries(rects).filter(([,r]) => !finiteRect(r) || r.x < -0.01 || r.y < -0.01 || r.x+r.w > W+0.01 || r.y+r.h > H+0.01).map(([n]) => n);
      const pairs = [
        ['mission','radar'], ['radar','weapon'], ['weapon','warning'], ['warning','hp'],
        ['pause','buff0'], ['dash','throttle'], ['throttle','speed'], ['speed','missile'],
        ['missile','status'], ['missile','wingman'], ['hp','wingman'], ['hp','speed']
      ];
      for (let i=0;i<buffs.length;i++) {
        pairs.push(['buff'+i,'dash']);
        if (i) pairs.push(['buff'+(i-1),'buff'+i]);
      }
      const badPairs = pairs.filter(([a,b]) => overlap(rects[a],rects[b])).map(p => p.join('~'));
      const touchSafe = ['pause','dash','throttle','missile'].filter(n => {
        const r=rects[n]; return r.x<h.ml-0.01 || r.y<h.mt-0.01 || r.x+r.w>W-h.mr+0.01 || r.y+r.h>H-h.mb+0.01;
      });
      return { portrait:h.portraitTouch, badBounds, badPairs, touchSafe, rects };
    })()`, value => value?.portrait === true && value.badBounds.length === 0
      && value.badPairs.length === 0 && value.touchSafe.length === 0,
      value => value ? JSON.stringify({ badBounds:value.badBounds, badPairs:value.badPairs,
        touchSafe:value.touchSafe, hp:value.rects.hp, speed:value.rects.speed }) : 'null');
  }

  await run.viewport(390, 844);
  await evalCheck(run, 'B four buffs are drawn as one equal vertical stack', `(() => {
    ${BASE_SETUP}
    GAME.mode = 'endless';
    const ids = Object.keys(BUFF_DEFS).slice(0,4);
    ids.forEach(id => { player.buffs[id] = { t:10, n:id==='shield'?2:0 }; });
    const h = hudRects(), s = h.buffStack, calls = [];
    const originalRoundRect = roundRect;
    roundRect = function(x,y,w,hh,r) { calls.push({x,y,w,h:hh}); return originalRoundRect(x,y,w,hh,r); };
    try { drawHUD(); } finally { roundRect = originalRoundRect; }
    const near = (a,b) => Math.abs(a-b) < 0.1;
    const matches = calls.filter(c => near(c.x,s.x) && near(c.w,s.w) && near(c.h,s.h)
      && c.y >= s.y-0.1 && c.y <= s.y+3*(s.h+s.gap)+0.1);
    const unique = [];
    for (const c of matches) if (!unique.some(u => near(u.y,c.y))) unique.push(c);
    unique.sort((a,b) => a.y-b.y);
    const vertical = unique.length === 4 && unique.every((c,i) => near(c.x,s.x)
      && near(c.w,s.w) && near(c.h,s.h) && near(c.y,s.y+i*(s.h+s.gap)));
    return { ids, unique, stack:s, vertical };
  })()`, value => value?.vertical === true,
    value => value ? JSON.stringify({ count:value.unique.length, unique:value.unique, stack:value.stack }) : 'null');

  await evalCheck(run, 'H hammer full health uses ratio percent (150/150 => 100%)', `(() => {
    ${BASE_SETUP}
    player.maxHp = 150; player.hp = 150;
    const texts = [], originalFillText = ctx.fillText;
    ctx.fillText = function(text, ...args) { texts.push(String(text)); return originalFillText.call(ctx, text, ...args); };
    try { drawHUD(); } finally { ctx.fillText = originalFillText; }
    return { hasLabel:texts.includes('机体完整度'), has100:texts.includes('100%'), has150:texts.includes('150%'),
      values:texts.filter(text => /%$/.test(text)).slice(0,8) };
  })()`, value => value?.hasLabel === true && value.has100 === true && value.has150 === false, JSON.stringify);

  await evalCheck(run, 'K lock timing is dt-based at 30/60/120 FPS and ON/OFF independent', `(() => {
    ${BASE_SETUP}
    const originalBeep = AudioSys.lockBeep; AudioSys.lockBeep = () => {};
    const makeTarget = () => ({ x:player.x, y:player.y-300, dead:false, retreat:false, hp:100, r:18 });
    const timing = fps => {
      enemies = [makeTarget()]; player.target = null; player.lock = 0; player.buffs = {};
      let elapsed=0, frames=0, dt=1/fps;
      while (player.lock < CFG.lockTime && frames < fps*3) { acquireLock(dt); elapsed += dt; frames++; }
      return { fps, elapsed, frames, lock:player.lock, tolerance:dt+1e-6 };
    };
    const lockAfter = enabled => {
      input.missileAuto = enabled; enemies=[makeTarget()]; player.target=null; player.lock=0; player.buffs={};
      for (let i=0;i<24;i++) acquireLock(1/60);
      return player.lock;
    };
    try {
      const times=[30,60,120].map(timing);
      const off=lockAfter(false), on=lockAfter(true);
      return { times, off, on, cfg:CFG.lockTime };
    } finally { AudioSys.lockBeep = originalBeep; }
  })()`, value => value && value.times.every(t => Math.abs(t.elapsed-value.cfg) <= t.tolerance
      && Math.abs(t.lock-value.cfg) < 1e-9) && Math.abs(value.off-value.on) < 1e-9,
    value => value ? JSON.stringify(value) : 'null');

  await evalCheck(run, 'K target switch resets inherited lock progress', `(() => {
    ${BASE_SETUP}
    const originalBeep=AudioSys.lockBeep; AudioSys.lockBeep=()=>{};
    try {
      const a={x:player.x,y:player.y-300,dead:false,retreat:false,hp:100,r:18};
      const b={x:player.x+5,y:player.y-320,dead:false,retreat:false,hp:100,r:18};
      enemies=[a]; player.target=null; player.lock=0; acquireLock(0.4); const before=player.lock;
      enemies=[b]; acquireLock(1/60); const after=player.lock;
      return { before, after, switched:player.target===b };
    } finally { AudioSys.lockBeep=originalBeep; }
  })()`, value => value?.before >= 0.39 && value.after <= 1/60+1e-6 && value.switched === true, JSON.stringify);

  await evalCheck(run, 'M touchcancel/drag-out do not toggle; tap toggles; lock value is untouched', `(() => {
    ${BASE_SETUP}
    ${TOUCH_HELPER}
    GAME.state='playing'; transition.active=false; upgradeChoice=null; updateTouchRects();
    const b=hudRects().msl, cx=b.x+b.w/2, cy=b.y+b.h/2;
    const oldInit=AudioSys.init, oldResume=AudioSys.resume, oldClick=AudioSys.click;
    AudioSys.init=()=>{}; AudioSys.resume=()=>{}; AudioSys.click=()=>{};
    try {
      input.missileAuto=false; player.lock=0.37;
      fireTouch('touchstart',201,cx,cy); fireTouch('touchcancel',201,cx,cy);
      const afterCancel=input.missileAuto;
      fireTouch('touchstart',202,cx,cy); fireTouch('touchmove',202,b.x-20,cy); fireTouch('touchend',202,b.x-20,cy);
      const afterDrag=input.missileAuto;
      fireTouch('touchstart',203,cx,cy); fireTouch('touchend',203,cx,cy);
      return { afterCancel, afterDrag, afterTap:input.missileAuto, lock:player.lock, id:input.touch.mslId };
    } finally { AudioSys.init=oldInit; AudioSys.resume=oldResume; AudioSys.click=oldClick; }
  })()`, value => value && !value.afterCancel && !value.afterDrag && value.afterTap
      && Math.abs(value.lock-0.37)<1e-9 && value.id===null, JSON.stringify);

  await evalCheck(run, 'M ON auto-fires only when ready; OFF does not fire', `(() => {
    ${BASE_SETUP}
    GAME.state='paused';
    const target={x:player.x,y:player.y-300,dead:false,retreat:false,hp:100,r:18};
    enemies=[target]; player.target=target; player.lock=CFG.lockTime; player.missiles=5; player.missileCd=0;
    player.weapon=makeWeapon('laser','common'); player.weapon.ammo=0;
    const oldLaunch=AudioSys.missileLaunch; AudioSys.missileLaunch=()=>{};
    try {
      input.missileAuto=true; const beforeOn=missiles.length; updatePlayer(1/60); const onDelta=missiles.length-beforeOn;
      input.missileAuto=false; player.target=target; player.lock=CFG.lockTime; player.missileCd=0;
      const beforeOff=missiles.length; updatePlayer(1/60); const offDelta=missiles.length-beforeOff;
      return { onDelta, offDelta, ammo:player.missiles };
    } finally { AudioSys.missileLaunch=oldLaunch; }
  })()`, value => value?.onDelta===1 && value.offDelta===0 && value.ammo===4, JSON.stringify);

  await run.viewport(360, 640);
  await evalCheck(run, 'T settings reach exact max scroll; drag does not click; scrolled hit mapping is correct', `(() => {
    ${BASE_SETUP}
    ${TOUCH_HELPER}
    GAME.state='title'; setState('settings'); input.isTouch=true; resize(); setState('settings');
    const oldInit=AudioSys.init, oldResume=AudioSys.resume, oldClick=AudioSys.click;
    AudioSys.init=()=>{}; AudioSys.resume=()=>{}; AudioSys.click=()=>{};
    try {
      const max=settingsMaxScroll(), metrics=settingsMetrics();
      settingsScrollY=0; captureBind=null; save.sfxVolume=0.5;
      const sx=W/2, sy=(metrics.viewportTop+metrics.viewportBottom)/2;
      fireTouch('touchstart',301,sx,sy); fireTouch('touchmove',301,sx,sy-max-200); fireTouch('touchend',301,sx,sy-max-200);
      const atMax=settingsScrollY, noDragClick=captureBind===null && Math.abs(save.sfxVolume-0.5)<1e-9;
      const VL=volumeRowsLayout(), row=VL.rows[0], buttonW=settingsLayout().touchPortrait?54:64;
      const hitX=VL.x+VL.w*0.78+buttonW/2, hitY=row.y+VL.rowH/2;
      const visible=hitY>=metrics.viewportTop && hitY<=metrics.viewportBottom;
      const hit=volumeRowAt(hitX,hitY);
      handleSettingsPress(hitX,hitY);
      const volumeAfter=save.sfxVolume;
      const L=settingsLayout(), index=7;
      settingsScrollY=clamp(4+index*L.rowH,0,settingsMaxScroll());
      const L2=settingsLayout(), rowY=L2.startY+index*L2.rowH+L2.rowH/2;
      const mapped=settingsRowAt(L2.rowX+20,rowY);
      settingsScrollY=1e9; settingsLayout(); const clamped=settingsScrollY;
      return { max, atMax, noDragClick, visible, hit, volumeAfter,
        mapped:mapped&&mapped.action, expected:SETTINGS_ACTIONS[index].action, clamped };
    } finally { AudioSys.init=oldInit; AudioSys.resume=oldResume; AudioSys.click=oldClick; }
  })()`, value => value && value.max>0 && Math.abs(value.atMax-value.max)<1e-6 && value.noDragClick
      && value.visible && value.hit?.key==='sfxVolume' && value.hit?.dir===1
      && Math.abs(value.volumeAfter-0.6)<1e-9 && value.mapped===value.expected
      && Math.abs(value.clamped-value.max)<1e-6, JSON.stringify);

  check('R no runtime exceptions', run.errors.length === 0, run.errors.slice(0,3).join(' | '));
} catch (error) {
  check('R harness completed', false, String(error?.stack || error).slice(0,700));
} finally {
  await run.stop();
}

check('R source HTML stayed byte-identical during verification',
  createHash('sha256').update(readFileSync(FILE)).digest('hex') === htmlHash);

const failed = checks.filter(item => !item.pass);
console.log(`\nPortrait HUD verification: ${checks.length-failed.length}/${checks.length} passed.`);
if (failed.length) {
  console.log(`Failed checks: ${failed.map(item => item.name).join('; ')}`);
  process.exitCode = 1;
}
