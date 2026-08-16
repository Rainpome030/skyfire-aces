// P37 wingman escort RED/GREEN verification.
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const PORT = 9737;
const html = readFileSync(FILE, 'utf8');
const profile = join(tmpdir(), `skyfire-p37-${process.pid}`);
const checks = [];
const runtimeErrors = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
}

const expectedConfig = {
  orbitRadius: 120, orbitSpeed: 1.25, orbitCenterBehind: 55,
  engageViewFactor: 0.9, engageConeHalf: 1.15, fireLineClear: 48
};
for (const [key, value] of Object.entries(expectedConfig)) {
  check(`S config ${key}=${value}`, new RegExp(`${key}\\s*:\\s*${String(value).replace('.', '\\.')}(?:\\D|$)`).test(html));
}
for (const fn of ['wingmanViewRange', 'wingmanInView', 'wingmanOrbitPoint', 'wingmanFireLineClear']) {
  check(`S function unique ${fn}`, (html.match(new RegExp(`function\\s+${fn}\\s*\\(`, 'g')) || []).length === 1);
}
const acquireBody = html.slice(html.indexOf('function acquireWingmanTarget'), html.indexOf('function fireWingmanGun'));
const fireBody = html.slice(html.indexOf('function fireWingmanGun'), html.indexOf('function updateWingman'));
const updateBody = html.slice(html.indexOf('function updateWingman'), html.indexOf('function removeWingman'));
check('S acquire filters retreat and view', acquireBody.includes('enemy.retreat') && acquireBody.includes('wingmanInView(enemy)'));
check('S fire rechecks view and line', fireBody.includes('wingmanInView(target)') && fireBody.includes('wingmanFireLineClear(w, target)'));
check('S fire has no instant heading assignment', !/w\.heading\s*=\s*angle\s*;/.test(fireBody));
check('S update switches orbit/formation by target', updateBody.includes('wingmanOrbitPoint(') && updateBody.includes('wingmanFormationPoint('));

rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--mute-audio', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--window-size=1000,800', 'file:///' + FILE
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', data => {
  const text = String(data);
  if (/Uncaught|SyntaxError|TypeError|ReferenceError/i.test(text)) runtimeErrors.push(text.trim());
});
let ws, id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const callId = ++id;
    pending.set(callId, { resolve, reject });
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function connect() {
  let target;
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find(item => item.type === 'page');
      if (target) break;
    } catch {}
    await sleep(100);
  }
  if (!target) throw new Error('Chrome target not found');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const waiter = pending.get(message.id); pending.delete(message.id);
      message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      runtimeErrors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Runtime exception');
    }
  };
  await send('Runtime.enable');
}

const setup = `startMission(0,'campaign'); ChapterCard.skip(); allies=[]; enemies=[]; bullets=[]; player.x=3000; player.y=2800; player.heading=0; player.speed=0; player.alive=true; player.dead=false; cam.zoom=0.85; const w=summonWingman().wingman; w.x=player.x-95; w.y=player.y+72; w.heading=0; w.speed=0; w.fireCd=0;`;
const enemyExpr = (x, y, extra = '') => `({kind:'fighter',x:${x},y:${y},hp:100,maxHp:100,r:18,dead:false,retreat:false${extra}})`;

async function main() {
  try {
    await connect(); await sleep(500);
    const api = await evaluate(`(()=>({view:typeof wingmanViewRange==='function',inView:typeof wingmanInView==='function',orbit:typeof wingmanOrbitPoint==='function',line:typeof wingmanFireLineClear==='function'}))()`);
    check('A0 runtime APIs available', api.view && api.inView && api.orbit && api.line, JSON.stringify(api));

    const formula = await evaluate(`(()=>{if(typeof wingmanViewRange!=='function')return null;cam.zoom=.85;return{actual:wingmanViewRange(),expected:Math.hypot(W/2,H*.62)/cam.zoom};})()`);
    check('A1 view range formula', !!formula && Math.abs(formula.actual-formula.expected)<1e-9, JSON.stringify(formula));
    const cone = await evaluate(`(()=>{${setup} const r=typeof wingmanViewRange==='function'?.9*wingmanViewRange():500;const inside=${enemyExpr('player.x+r*.98*Math.cos(1.14)','player.y+r*.98*Math.sin(1.14)')};const outside=${enemyExpr('player.x+r*.98*Math.cos(1.16)','player.y+r*.98*Math.sin(1.16)')};return{inside:typeof wingmanInView==='function'&&wingmanInView(inside),outside:typeof wingmanInView==='function'&&wingmanInView(outside)};})()`);
    check('A2 cone boundary includes 1.14 excludes 1.16', cone.inside && !cone.outside, JSON.stringify(cone));
    const distance = await evaluate(`(()=>{${setup} const r=typeof wingmanViewRange==='function'?.9*wingmanViewRange():500;const inside=${enemyExpr('player.x+r-1','player.y')};const outside=${enemyExpr('player.x+r+1','player.y')};return{inside:typeof wingmanInView==='function'&&wingmanInView(inside),outside:typeof wingmanInView==='function'&&wingmanInView(outside)};})()`);
    check('A3 distance boundary', distance.inside && !distance.outside, JSON.stringify(distance));
    const targeting = await evaluate(`(()=>{${setup} const near=${enemyExpr('player.x+400','player.y')};const far=${enemyExpr('player.x+700','player.y')};enemies.push(far,near);const nearest=acquireWingmanTarget(w)===near;near.dead=true;far.retreat=true;const none=acquireWingmanTarget(w)===null;const rear=${enemyExpr('player.x-300','player.y')};enemies=[rear];const rearRejected=acquireWingmanTarget(w)===null;return{nearest,none,rearRejected};})()`);
    check('A4 nearest valid target preserved', targeting.nearest, JSON.stringify(targeting));
    check('A5 retreat/dead targets rejected', targeting.none, JSON.stringify(targeting));
    check('A6 rear target rejected', targeting.rearRejected, JSON.stringify(targeting));

    const orbit = await evaluate(`(()=>{${setup} const w2=makeWingman(1);if(typeof wingmanOrbitPoint!=='function')return null;const t=.8;const p0=wingmanOrbitPoint(w,t),p1=wingmanOrbitPoint(w2,t);const cx=player.x-Math.cos(player.heading)*120*0-55,cy=player.y;const r0=Math.hypot(p0.x-cx,p0.y-cy),r1=Math.hypot(p1.x-cx,p1.y-cy);const phase=Math.abs(Math.abs(angDiff(Math.atan2(p0.y-cy,p0.x-cx),Math.atan2(p1.y-cy,p1.x-cx)))-Math.PI);const pNext=wingmanOrbitPoint(w,t+.4);return{r0,r1,phase,moved:Math.hypot(pNext.x-p0.x,pNext.y-p0.y)};})()`);
    check('B1 orbit radius 120', !!orbit && Math.abs(orbit.r0-120)<1e-9 && Math.abs(orbit.r1-120)<1e-9, JSON.stringify(orbit));
    check('B2 two slots opposite phase', !!orbit && orbit.phase<1e-9, JSON.stringify(orbit));
    check('B3 orbit point advances with time', !!orbit && orbit.moved>40, JSON.stringify(orbit));
    const mode = await evaluate(`(()=>{${setup} w.x=player.x-95;w.y=player.y+72;w.speed=0;w.fireCd=999;const ox=w.x,oy=w.y;updateWingman(w,.2);const noTargetLeavesFormation=Math.hypot(w.x-ox,w.y-oy)>5;const e=${enemyExpr('player.x+400','player.y')};enemies=[e];w.target=e;w.x=player.x-95;w.y=player.y+72;w.speed=0;const fx=w.x,fy=w.y;updateWingman(w,.05);return{noTargetLeavesFormation,fightNearFormation:Math.hypot(w.x-fx,w.y-fy)<8,target:w.target===e};})()`);
    check('B4 no-target update leaves static formation for orbit', mode.noTargetLeavesFormation, JSON.stringify(mode));
    check('B5 target update returns to formation behavior', mode.fightNearFormation && mode.target, JSON.stringify(mode));

    const fire = await evaluate(`(()=>{${setup} const e=${enemyExpr('player.x+400','player.y')};enemies=[e];w.target=e;w.x=player.x-20;w.y=player.y+47;w.heading=.4;const h=w.heading;const b0=bullets.length;const blocked=fireWingmanGun(w)===null&&bullets.length===b0&&w.fireCd===0;w.target=e;w.fireCd=0;w.y=player.y+48;const shot=fireWingmanGun(w);const headingSame=w.heading===h;return{blocked,shot:!!shot,headingSame,source:shot&&shot.source,credit:shot&&shot.creditPlayer,enemy:shot&&shot.enemy,fromPlayer:shot&&shot.fromPlayer};})()`);
    check('C1 fire line blocks lateral 47 without cooldown', fire.blocked, JSON.stringify(fire));
    check('C2 fire line allows lateral 48', fire.shot, JSON.stringify(fire));
    check('C3 firing does not snap heading', fire.headingSame, JSON.stringify(fire));
    check('C4 bullet attribution preserved', fire.source==='wingman' && fire.credit===true && fire.enemy===false && fire.fromPlayer===true, JSON.stringify(fire));
    const fireGate = await evaluate(`(()=>{${setup} const rear=${enemyExpr('player.x-300','player.y')};w.target=rear;const outsideCone=fireWingmanGun(w)===null&&bullets.length===0;const far=${enemyExpr('player.x+(typeof wingmanViewRange===\"function\"?.9*wingmanViewRange()+10:1000)','player.y')};w.target=far;w.fireCd=0;const outsideView=fireWingmanGun(w)===null&&bullets.length===0;return{outsideCone,outsideView};})()`);
    check('C5 outside cone does not fire', fireGate.outsideCone, JSON.stringify(fireGate));
    check('C6 outside view does not fire', fireGate.outsideView, JSON.stringify(fireGate));
    const cooldown = await evaluate(`(()=>{${setup} const e=${enemyExpr('player.x+400','player.y')};w.y=player.y+72;w.target=e;const first=!!fireWingmanGun(w);const n=bullets.length;const second=fireWingmanGun(w);return{first,blocked:second===null&&bullets.length===n};})()`);
    check('C7 cooldown still blocks second shot', cooldown.first && cooldown.blocked, JSON.stringify(cooldown));

    const summon = await evaluate(`(()=>{${setup} summonWingman();const third=summonWingman();return{count:allies.filter(a=>a.kind==='wingman'&&!a.dead).length,action:third.action};})()`);
    check('D1 summon remains capped at two and boosts full formation', summon.count===2 && summon.action==='boosted', JSON.stringify(summon));
    check('D2 radar and HUD hooks preserved', html.includes("if (a.kind === 'wingman') blip(a.x, a.y, '#55e6c1', 6, 'wingman')") && html.includes('drawWingmanHud('));
    check('D3 dual pickup paths preserved', /function updatePickups[\s\S]*p\.type === 'wingman'/.test(html) && /function collectLoot[\s\S]*p\.type === 'wingman'/.test(html));
    check('D4 no Runtime exceptions', runtimeErrors.length===0, runtimeErrors.join(' || '));
  } finally {
    try { ws?.close(); } catch {}
    try { chrome.kill(); } catch {}
    await sleep(150);
    rmSync(profile, { recursive: true, force: true });
  }
  const failed = checks.filter(item => !item.pass);
  console.log(`\n=== P37 ${checks.length-failed.length}/${checks.length} passed ===`);
  if (failed.length) process.exitCode = 1;
}
main().catch(async error => {
  console.error('FATAL', error);
  try { chrome.kill(); } catch {}
  await sleep(100);
  rmSync(profile, { recursive: true, force: true });
  process.exit(1);
});
