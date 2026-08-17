import { spawn } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9791;
const PROFILE = join(tmpdir(), `skyfire-p29-${process.pid}`);
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const html = readFileSync(FILE, 'utf8');
const checks = [];
const errors = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
}

check('静态:射程折扣命名常量0.9', html.includes('TOUCH_AUTO_FIRE_RANGE_FACTOR = 0.9'));
check('静态:机头半锥命名常量0.35', html.includes('TOUCH_AUTO_FIRE_CONE = 0.35'));
check('静态:manualFire/touchAutoFire来源分层', html.includes("const manualFire = isActionDown('gun') || input.fireHeld") && html.includes('const touchAutoFire = input.isTouch && !manualFire'));
check('静态:保留旧wantFire兼容表达式', html.includes("const wantFire = isActionDown('gun') || input.fireHeld || input.isTouch"));

let chrome;
let ws;
let seq = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function start() {
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--mute-audio', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--window-size=844,390', 'file:///' + FILE
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.on('data', data => {
    const text = String(data);
    if (/Uncaught|SyntaxError|TypeError|ReferenceError/i.test(text)) errors.push(text.trim());
  });
  let target;
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find(item => item.type === 'page');
      if (target) break;
    } catch {}
    await sleep(80);
  }
  if (!target) throw new Error('Chrome target not found');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Runtime exception');
    }
  };
  await send('Runtime.enable');
  await sleep(250);
}

async function stop() {
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  await sleep(150);
  rmSync(PROFILE, { recursive: true, force: true });
}

let fatal = null;
try {
  await start();
  const out = await evalJs(`(() => {
    transition.active=false; if (ChapterCard.isActive()) ChapterCard.skip();
    startEndless(); if (ChapterCard.isActive()) ChapterCard.skip(); transition.active=false; GAME.state='playing'; upgradeChoice=null;
    input.keys={}; input.fireHeld=false; input.mslHeld=false; input.mouse.movedAt=-99;
    input.touch={active:false,mslId:null,swipeId:null,throttleBarId:null}; touchSwipe.active=false; touchSwipe.dir=null;
    const touch = new Event('touchstart', {cancelable:true,bubbles:true});
    Object.defineProperty(touch, 'changedTouches', {value:[{identifier:729,clientX:W/2,clientY:H/2}]});
    canvas.dispatchEvent(touch);
    const touchEnd = new Event('touchend', {cancelable:true,bubbles:true});
    Object.defineProperty(touchEnd, 'changedTouches', {value:[{identifier:729,clientX:W/2,clientY:H/2}]});
    canvas.dispatchEvent(touchEnd);
    const realTouch = input.isTouch === true;
    let audioCalls=0; const oldGun=AudioSys.gun; AudioSys.gun=()=>{audioCalls++;};
    const rows=[];
    const snap=()=>JSON.stringify({ammo:player.weapon.ammo,fireCd:player.fireCd,shots:GAME.shotsFired,bullets:bullets.length,gunSide:player.gunSide,audio:audioCalls});
    const reset=(id,q)=>{
      enemies.length=0; bullets.length=0; missiles.length=0; allies.length=0; particles.length=0; pickups.length=0;
      const w=makeWeapon(id,q); GAME.weapons=[defaultWeapon(),w]; player.weapon=w;
      player.x=2000; player.y=2000; player.heading=0; player.speed=0; player.alive=true; player.fireCd=0; player.gunSide=1;
      player.throttle=0; player.afterburn=false; player.buffs={}; player.fireRateMult=1; player.gunDmgMult=1;
      GAME.shotsFired=0; audioCalls=0; input.keys={}; input.fireHeld=false; input.isTouch=true;
      return w;
    };
    const enemy=(distance,angle,extra={})=>({x:player.x+Math.cos(angle)*distance,y:player.y+Math.sin(angle)*distance,hp:10,maxHp:10,dead:false,retreat:false,alive:true,r:20,...extra});
    const fire=(name,shouldFire)=>{const before=snap(); updatePlayer(0); const after=snap(); rows.push({name,pass:shouldFire?bullets.length>0&&player.weapon.ammo===JSON.parse(before).ammo-1:after===before,before,after});};
    for (const id of ['laser','rocket','plasma']) for (const q of ['common','good','rare']) {
      let w=reset(id,q); fire(id+'/'+q+' 无敌人零变化',false);
      w=reset(id,q); enemies.push(enemy(0.9*w.speed*w.life+1,0)); fire(id+'/'+q+' gateRange+1阻止',false);
      w=reset(id,q); enemies.push(enemy(0.9*w.speed*w.life-1,0)); fire(id+'/'+q+' gateRange-1发射',true);
      w=reset(id,q); enemies.push(enemy(200,Math.PI)); fire(id+'/'+q+' 机尾阻止',false);
      w=reset(id,q); enemies.push(enemy(Math.min(200,0.9*w.speed*w.life-1),0.35-0.01)); fire(id+'/'+q+' cone-0.01发射',true);
      w=reset(id,q); enemies.push(enemy(Math.min(200,0.9*w.speed*w.life-1),0.35+0.01)); fire(id+'/'+q+' cone+0.01阻止',false);
    }
    let w=reset('laser','common'); enemies.push(enemy(100,0,{dead:true}),enemy(100,0,{retreat:true}),enemy(100,0,{hp:0})); fire('dead/retreat/hp0均无效',false);
    w=reset('laser','common'); enemies.push(enemy(5000,0),enemy(100,0)); fire('多目标任一有效即可',true);
    w=reset('laser','common'); input.isTouch=false; input.keys.Space=true; fire('PC主动无目标有限武器盲射',true);
    w=reset('rocket','common'); input.fireHeld=true; fire('触屏fireHeld无目标有限武器盲射',true);
    for (const id of ['default','scatter','heavy','pierce']) {
      if (id==='default') { const base=defaultWeapon(); GAME.weapons=[base]; player.weapon=base; enemies.length=0; bullets.length=0; player.fireCd=0; GAME.shotsFired=0; audioCalls=0; input.keys={}; input.fireHeld=false; input.isTouch=true; }
      else reset(id,'common');
      const before=bullets.length; updatePlayer(0); rows.push({name:id+' 无限武器触屏无目标自动射击',pass:bullets.length>before});
    }
    w=reset('plasma','rare'); enemies.push(enemy(100,0)); player.fireCd=0.01; fire('冷却未到不射且资源不变',false);
    player.fireCd=0; fire('冷却到0后射击',true);
    w=reset('laser','common'); w.ammo=1; enemies.push(enemy(100,0)); const previous=GAME.weapons[0]; updatePlayer(0); rows.push({name:'成功耗尽后回退保持',pass:player.weapon===previous&&w.ammo===0&&bullets.length===1});
    const targetSentinel={tag:'unchanged'}; w=reset('laser','common'); player.target=targetSentinel; enemies.push(enemy(100,0)); updatePlayer(0); rows.push({name:'门控不改player.target',pass:player.target===targetSentinel});
    w=reset('laser','common'); enemies.push(enemy(100,0,{type:'boss'})); fire('存活BOSS同规则有效',true);
    AudioSys.gun=oldGun;
    const freezeBefore=JSON.stringify({missionTime:GAME.missionTime,playerX:player.x,bullets:bullets.length,ammo:player.weapon.ammo});
    upgradeChoice={options:[],index:-1,timer:0}; update(0.5);
    const freezeAfter=JSON.stringify({missionTime:GAME.missionTime,playerX:player.x,bullets:bullets.length,ammo:player.weapon.ammo});
    rows.push({name:'P28升级模态update完整冻结',pass:freezeBefore===freezeAfter});
    return {realTouch,rows};
  })()`);
  check('真实触摸事件建立input.isTouch', out.realTouch);
  for (const row of out.rows) check(row.name, row.pass, row.pass ? '' : `${row.before || ''} -> ${row.after || ''}`);
  check('无Runtime异常', errors.length === 0, errors.join(' | '));
} catch (error) {
  fatal = error;
  console.error('FATAL', error.stack || error);
} finally {
  await stop();
  check('profile已清理', !existsSync(PROFILE), PROFILE);
}

const failed = checks.filter(item => !item.pass);
console.log(`\nRESULT ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) console.log('FAILED: ' + failed.map(item => item.name).join('; '));
if (fatal || failed.length) process.exitCode = 1;