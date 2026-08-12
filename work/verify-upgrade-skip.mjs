import { spawn } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const html = readFileSync(FILE, 'utf8');
const configs = [
  { name: '360x800', width: 360, height: 800, port: 9781 },
  { name: '390x844', width: 390, height: 844, port: 9782 },
  { name: '844x390', width: 844, height: 390, port: 9783 }
];
const checks = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
}

check('静态存在独立放弃动作', /function\s+skipUpgradeChoice\s*\(/.test(html));
check('静态存在明确按钮文案', html.includes('放弃并保留当前装备'));
check('静态存在同源布局函数', /function\s+upgradeChoiceLayout\s*\(/.test(html));

class Run {
  constructor(c) {
    this.c = c;
    this.profile = join(tmpdir(), `skyfire-p28-${process.pid}-${c.port}`);
    this.pending = new Map(); this.id = 0; this.errors = [];
  }
  async start() {
    rmSync(this.profile, { recursive: true, force: true }); mkdirSync(this.profile, { recursive: true });
    this.chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio',
      `--remote-debugging-port=${this.c.port}`, `--user-data-dir=${this.profile}`,
      `--window-size=${this.c.width},${this.c.height}`, 'file:///' + FILE],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    this.chrome.stderr.on('data', d => { const s = String(d); if (/Uncaught|SyntaxError|TypeError|ReferenceError/i.test(s)) this.errors.push(s.trim()); });
    let target;
    for (let i = 0; i < 100; i++) {
      try { const list = await (await fetch(`http://127.0.0.1:${this.c.port}/json/list`)).json(); target = list.find(x => x.type === 'page'); if (target) break; } catch {}
      await sleep(80);
    }
    if (!target) throw new Error('Chrome target not found');
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
      else if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'Runtime exception');
    };
    await this.send('Runtime.enable'); await this.send('Page.enable');
    await this.send('Emulation.setDeviceMetricsOverride', { width: this.c.width, height: this.c.height, deviceScaleFactor: 1, mobile: false });
    await this.send('Page.reload', { ignoreCache: true }); await sleep(350);
  }
  send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
  async mouse(x, y) { await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); }
  async touch(x, y, id = 1) { await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id, radiusX: 1, radiusY: 1, force: 1 }] }); await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  async key(key, code) { await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: key === 'Enter' ? 13 : key === 'Escape' ? 27 : 80 }); await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: key === 'Enter' ? 13 : key === 'Escape' ? 27 : 80 }); }
  async stop() { try { this.ws?.close(); } catch {} try { this.chrome?.kill(); } catch {} await sleep(120); rmSync(this.profile, { recursive: true, force: true }); }
}

const setupBody = `
  transition.active = false; if (ChapterCard.isActive()) ChapterCard.skip();
  startEndless(); if (ChapterCard.isActive()) ChapterCard.skip(); transition.active = false; GAME.state = 'playing';
  enemies.length = 0; allies.length = 0; bullets.length = 0; missiles.length = 0; pickups.length = 0; particles.length = 0;
  const ids = Object.keys(DROP_WEAPONS); upgradeChoice = { options: ids.slice(0, 3).map(id => ({ id, quality: 'common' })), index: -1, timer: 0 };
  input.touch = { active:false, mslId:null, swipeId:null, throttleBarId:null }; input.keys = {}; input.mslHeld = false; input.fireHeld = false;
`;
const SETUP = `(() => {
  ${setupBody}
  return upgradeChoiceLayout();
})()`;
const clientPoint = (r, x, y) => r.eval(`(() => { const q=canvas.getBoundingClientRect(); return {x:q.left+${x}*q.width/W,y:q.top+${y}*q.height/H}; })()`);
const buildSnap = `JSON.stringify({weapon:{id:player.weapon.id,quality:player.weapon.quality,count:player.weapon.count,ammo:player.weapon.ammo,limited:player.weapon.limited},weaponIndex:GAME.weapons.indexOf(player.weapon),weapons:GAME.weapons.map(w=>({id:w.id,quality:w.quality,count:w.count,ammo:w.ammo,limited:w.limited})),synth:GAME.synth,upgrades:GAME.upgrades,buffs:player.buffs,dash:GAME.dash,hp:player.hp,missiles:player.missiles,level:GAME.level,xp:GAME.xp})`;

let fatal = null;
for (const c of configs) {
  const r = new Run(c);
  try {
    await r.start();
    let L = await r.eval(SETUP);
    check(`${c.name} 按钮完整可见且高度>=44`, L.skip.x >= 0 && L.skip.y >= 0 && L.skip.x + L.skip.w <= c.width && L.skip.y + L.skip.h <= c.height && L.skip.h >= 44, JSON.stringify(L.skip));
    let p = await clientPoint(r, L.skip.x + L.skip.w / 2, L.skip.y + L.skip.h / 2);
    const before = await r.eval(buildSnap); await r.mouse(p.x, p.y);
    let out = await r.eval(`({closed:upgradeChoice===null,build:${buildSnap}})`);
    check(`${c.name} 真实鼠标放弃且构筑深比较`, out.closed && out.build === before);

    L = await r.eval(SETUP); p = await clientPoint(r, L.skip.x + L.skip.w / 2, L.skip.y + L.skip.h / 2); const beforeTouch = await r.eval(buildSnap); await r.touch(p.x, p.y, 20);
    out = await r.eval(`({closed:upgradeChoice===null,build:${buildSnap},msl:input.touch.mslId})`);
    check(`${c.name} 真实触摸放弃且不走战斗热区`, out.closed && out.build === beforeTouch && out.msl === null);

    L = await r.eval(SETUP); p = await clientPoint(r, Math.max(2, L.skip.x - 4), L.skip.y + L.skip.h / 2); await r.mouse(p.x, p.y);
    check(`${c.name} 按钮外不放弃`, await r.eval('upgradeChoice !== null'));

    await r.eval(SETUP); await r.key('Enter', 'Enter'); check(`${c.name} Enter不关闭`, await r.eval(`upgradeChoice !== null && GAME.state === 'playing'`));
    await r.eval(SETUP); await r.key('Escape', 'Escape'); check(`${c.name} Esc优先放弃并保持playing`, await r.eval(`upgradeChoice === null && GAME.state === 'playing'`));
    await r.eval(SETUP); await r.key('p', 'KeyP'); check(`${c.name} P仍暂停且模态保留`, await r.eval(`upgradeChoice !== null && GAME.state === 'paused'`));
    await r.eval(`upgradeChoice=null; GAME.state='playing'; input.keys={};`); await r.key('Escape', 'Escape'); check(`${c.name} 无模态Esc仍暂停`, await r.eval(`GAME.state === 'paused'`));

    const freeze = await r.eval(`(() => {
      ${setupBody}
      player.x=1000; player.y=1000; player.speed=250; player.fireCd=2; player.mslCd=2; player.invuln=2;
      enemies.push({x:1200,y:1000,vx:5,vy:6,heading:0,speed:80,hp:10,maxHp:10,alive:true,dead:false,type:'fighter'});
      allies.push({kind:'wingman',x:900,y:1000,heading:0,speed:100,hp:50,maxHp:100,alive:true,dead:false,smokeT:.1});
      bullets.push({x:1000,y:1000,vx:100,vy:0,life:3,enemy:false,damage:1}); missiles.push({x:1000,y:1000,vx:50,vy:0,life:3,enemy:false});
      pickups.push({x:1000,y:1000,vx:1,vy:2,life:5,type:'supply'}); particles.push({x:1000,y:1000,vx:3,vy:4,life:2,maxLife:2,size:2,type:'spark',color:'#fff'});
      GAME.missionTime=12; GAME.score=345; GAME.pendingTimer=1.25; GAME.pendingState='complete'; GAME.freezeTimer=.75;
      mission.waveTimer=2.5; mission.waveIndex=3; mission.spawned=4; mission.aliveTotal=1; mission.testTimer=9;
      cam.x=10; cam.y=20; cam.zoom=.7; cam.shake=8; cam.shakeX=2; cam.shakeY=3;
      const snap=()=>JSON.stringify({player:{x:player.x,y:player.y,speed:player.speed,fireCd:player.fireCd,mslCd:player.mslCd,invuln:player.invuln},enemies,allies,bullets,missiles,pickups,particles,cam,mission,missionTime:GAME.missionTime,score:GAME.score,pendingTimer:GAME.pendingTimer,pendingState:GAME.pendingState,freezeTimer:GAME.freezeTimer,combo:GAME.combo,comboTimer:GAME.comboTimer});
      const a=snap(), gt=gameTime; update(.5); update(.5); const b=snap(); return {same:a===b,gameTimeAdvanced:gameTime>gt,a,b};
    })()`);
    check(`${c.name} 模态完整冻结世界/任务/pending/freeze`, freeze.same && freeze.gameTimeAdvanced, freeze.same ? '' : 'snapshot changed');

    const resume = await r.eval(`(() => { ${setupBody} GAME.missionTime=5; player.x=1000; player.speed=200; skipUpgradeChoice(); const x=player.x,t=GAME.missionTime; update(.1); return {closed:upgradeChoice===null,advanced:GAME.missionTime>t || player.x!==x}; })()`);
    check(`${c.name} 放弃后下一帧恢复`, resume.closed && resume.advanced, JSON.stringify(resume));

    if (c.width === 360) {
      const selected = await r.eval(`(() => { ${setupBody} const u=upgradeChoice.options[0]; let calls=0; const old=applyWeapon; applyWeapon=(id,q)=>{calls++;}; applyUpgrade(u); applyWeapon=old; return {calls,closed:upgradeChoice===null}; })()`);
      check('旧卡选择仍调用applyUpgrade链', selected.calls === 1 && selected.closed);
      const overlap = await r.eval(`(() => { const L=${SETUP}; const card=L.cards[2]; MSL_RECT.x=card.x+card.w*.5; MSL_RECT.y=card.y+card.h*.5; MSL_RECT.w=card.w*.5; MSL_RECT.h=card.h*.5; return {x:MSL_RECT.x+2,y:MSL_RECT.y+2}; })()`);
      p = await clientPoint(r, overlap.x, overlap.y); await r.touch(p.x,p.y,41);
      check('P27重叠路由仍优先升级卡', await r.eval(`upgradeChoice===null && input.touch.mslId===null && !input.mslHeld`));
    }
    check(`${c.name} 无Runtime异常`, r.errors.length === 0, r.errors.join(' | '));
  } catch (e) { fatal = e; console.error(`FATAL ${c.name}:`, e.stack || e); }
  finally { await r.stop(); check(`${c.name} profile已清理`, !existsSync(r.profile), r.profile); }
  if (fatal) break;
}
const failed = checks.filter(x => !x.pass);
console.log(`\nRESULT ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) console.log('FAILED: ' + failed.map(x => x.name).join('; '));
if (fatal || failed.length) process.exitCode = 1;
