import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9386;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const results = [];
function check(name, pass, detail = '') { results.push({ name, pass: !!pass }); console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); }

const html = readFileSync(FILE, 'utf8');
for (const fn of ['summonWingman','updateWingman','damageWingman','drawWingmanJet','drawWingmanRadarBlip','drawWingmanHud']) {
  const n = (html.match(new RegExp('function\\s+' + fn + '\\s*\\(', 'g')) || []).length;
  check('静态函数唯一 ' + fn, n === 1, 'count=' + n);
}
check('静态双拾取路径接入', /function updatePickups[\s\S]*p\.type === 'wingman'/.test(html) && /function collectLoot[\s\S]*p\.type === 'wingman'/.test(html));
check('静态现有雷达kind分流', html.includes("if (a.kind === 'wingman') blip(a.x, a.y, '#55e6c1', 6, 'wingman')") && html.includes("drawWingmanRadarBlip(rx + rx2, ry + ry2"));
check('静态无独立僚机雷达', !/function\s+drawWingmanRadar\s*\(/.test(html));
check('静态碰撞函数唯一', (html.match(/function\s+updateWingmanCollisions\s*\(/g) || []).length === 1);
check('静态主update挂接碰撞', /separateEnemies\(\);[\s\S]{0,80}updateWingmanCollisions\(dt\)/.test(html));

mkdirSync(ROOT + '/work/chrome-profile-wingman-integrate', { recursive: true });
const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new','--disable-gpu','--mute-audio','--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-wingman-integrate','--window-size=1600,900',
  '--disable-features=Translate','file:///' + FILE
], { windowsHide: true, stdio: ['ignore','ignore','pipe'] });
chrome.stderr.on('data', (d) => { const s=String(d); if (/Uncaught|SyntaxError|TypeError|ReferenceError/i.test(s)) errors.push(s.trim()); });
async function target(){ for(let i=0;i<60;i++){try{const a=await(await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();const p=a.find(x=>x.type==='page');if(p)return p;}catch{} await sleep(200);} throw Error('target'); }
let id=0, ws; const pending=new Map();
function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});}
async function connect(){const t=await target();ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=(e)=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails?.exception?.description||m.params.exceptionDetails?.text);};await send('Runtime.enable');}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}

async function main(){
 await connect(); await sleep(1000);
 const summon=await ev(`(()=>{startMission(0,'campaign');ChapterCard.skip();allies=[];const a=summonWingman();const b=summonWingman();allies[0].hp=10;allies[1].hp=20;const c=summonWingman();return{actions:[a.action,b.action,c.action],count:allies.filter(x=>x.kind==='wingman').length,hp:allies.map(x=>x.hp),boost:allies.map(x=>x.rateBoostT),sides:allies.map(x=>x.formationSide)};})()`);
 check('召唤1/2/3次=1/2/2且满编修复强化', summon.count===2&&summon.actions.join(',')==='added,added,boosted'&&summon.hp[0]===40&&summon.hp[1]===50&&summon.boost.every(x=>x===8)&&summon.sides[0]!==summon.sides[1], JSON.stringify(summon));
 const ai=await ev(`(()=>{startMission(0,'campaign');ChapterCard.skip();allies=[];enemies=[];bullets=[];const w=summonWingman().wingman;const e=makeEnemy('fighter',player.x+Math.cos(player.heading)*200,player.y+Math.sin(player.heading)*200);enemies.push(e);w.fireCd=0;updateWingman(w,.016);const b=bullets[0];return{target:w.target===e,bullet:!!b,source:b&&b.source,credit:b&&b.creditPlayer,catch0:w.catchingUp};})()`);
 check('编队索敌并生成玩家归因友方子弹', ai.target&&ai.bullet&&ai.source==='wingman'&&ai.credit===true, JSON.stringify(ai));
 const catchup=await ev(`(()=>{const w=allies.find(x=>x.kind==='wingman');w.x=player.x+1000;w.y=player.y;const before=w.speed;updateWingman(w,.016);return{catching:w.catchingUp,before,speed:w.speed};})()`);
 check('脱队追赶', catchup.catching&&catchup.speed>catchup.before, JSON.stringify(catchup));
 const isolation=await ev(`(()=>{startEndless();allies=[];enemies=[];bullets=[];missiles=[];const w=summonWingman().wingman;w.hp=8;const snap={kills:GAME.kills,score:GAME.score,exp:GAME.exp,combo:GAME.combo,rev:GAME.reviveCount,ru:GAME.revivesUsed,php:player.hp,failed:mission.failed};bullets.push({x:w.x,y:w.y,vx:0,vy:0,life:1,r:4,dmg:20,enemy:true,fromPlayer:false});updateBullets(.016);const bulletDead=!allies.includes(w);const w2=summonWingman().wingman;w2.hp=8;missiles.push({x:w2.x,y:w2.y,heading:0,speed:0,turn:0,life:1,target:w2,enemy:true,trail:1,r:5,damage:20,dmgBonus:0});updateMissiles(.016);return{bulletDead,missileDead:!allies.includes(w2),same:snap.kills===GAME.kills&&snap.score===GAME.score&&snap.exp===GAME.exp&&snap.combo===GAME.combo&&snap.rev===GAME.reviveCount&&snap.ru===GAME.revivesUsed&&snap.php===player.hp&&snap.failed===mission.failed,state:GAME.state};})()`);
 check('敌弹/敌导弹击毁僚机且生命计分任务隔离', isolation.bulletDead&&isolation.missileDead&&isolation.same&&isolation.state==='playing', JSON.stringify(isolation));
 const transport=await ev(`(()=>{startMission(1,'campaign');ChapterCard.skip();const t=mission.transport;t.hp=5;t.alive=true;t.dead=false;bullets=[{x:t.x,y:t.y,vx:0,vy:0,life:1,r:4,dmg:20,enemy:true,fromPlayer:false}];updateBullets(.016);return{dead:t.dead,failed:mission.failed,pending:GAME.pendingState};})()`);
 check('运输机仍走原伤害/护航失败链', transport.dead&&transport.failed&&transport.pending==='gameover', JSON.stringify(transport));
 const kill=await ev(`(()=>{startEndless();allies=[];enemies=[];bullets=[];const w=summonWingman().wingman;const e=makeEnemy('fighter',w.x+40,w.y);e.hp=1;enemies.push(e);const before={k:GAME.kills,s:GAME.score,x:GAME.exp,c:GAME.combo};bullets.push({x:e.x,y:e.y,vx:0,vy:0,life:1,r:4,dmg:99,enemy:false,fromPlayer:true,source:'wingman',owner:w,creditPlayer:true,pierce:0,blast:0});updateBullets(.016);return{dead:e.dead,dk:GAME.kills-before.k,ds:GAME.score-before.s,dx:GAME.exp-before.x,dc:GAME.combo-before.c};})()`);
 check('僚机真实击杀按玩家归因且仅一次', kill.dead&&kill.dk===1&&kill.ds>0&&kill.dx>0&&kill.dc===1, JSON.stringify(kill));
 const paths=await ev(`(()=>{startMission(0,'campaign');ChapterCard.skip();pickups=[{x:player.x,y:player.y,vx:0,vy:0,type:'wingman',life:2,t:0}];updatePickups(.016);const campaign=allies.filter(x=>x.kind==='wingman').length;startEndless();pickups=[{x:player.x,y:player.y,vx:0,vy:0,type:'wingman',life:2,t:0}];updatePickups(.016);const endless=allies.filter(x=>x.kind==='wingman').length;summonWingman();startEndless();return{campaign,endless,cleared:allies.filter(x=>x.kind==='wingman').length};})()`);
 check('战役/无尽拾取均召唤且重开清空', paths.campaign===1&&paths.endless===1&&paths.cleared===0, JSON.stringify(paths));
 const probability=await ev(`(()=>{let wing=0,repair=0,missilesN=0;const old=Math.random;try{for(let i=0;i<1000;i++){pickups=[];let seq=0;Math.random=()=>seq++===0?i/1000:((i%3)+0.1)/3;dropLoot(0,0);const p=pickups[0];if(p&&p.type==='wingman')wing++;if(p&&p.type==='supply'&&p.supply==='repair')repair++;if(p&&p.type==='supply'&&p.supply==='missiles')missilesN++;}}finally{Math.random=old;}return{wing,repair,missilesN};})()`);
 check('无尽僚机掉率8%-12%且关键补给可达', probability.wing>=80&&probability.wing<=120&&probability.repair>0&&probability.missilesN>0, JSON.stringify(probability));
 const pixels=await ev(`(()=>{startMission(1,'campaign');ChapterCard.skip();allies=allies.filter(a=>a.kind==='transport');const w=summonWingman().wingman;w.x=player.x;w.y=player.y-160;draw();const d=ctx.getImageData(0,0,canvas.width,canvas.height).data;let teal=0,gold=0,green=0;for(let i=0;i<d.length;i+=4){if(d[i]>65&&d[i]<115&&d[i+1]>190&&d[i+1]<245&&d[i+2]>160&&d[i+2]<225)teal++;if(d[i]>230&&d[i+1]>175&&d[i+2]<135)gold++;if(d[i]>45&&d[i]<105&&d[i+1]>150&&d[i+1]<235&&d[i+2]<145)green++;}return{teal,gold,green,hud:drawWingmanHud(allies)};})()`);
 check('造型/HUD/现有雷达颜色像素存在且HUD最多2条', pixels.teal>20&&pixels.gold>10&&pixels.green>5&&pixels.hud===1, JSON.stringify(pixels));
 const perf=await ev(`(()=>{startMission(0,'campaign');ChapterCard.skip();allies=[];summonWingman();summonWingman();for(let i=0;i<80;i++)enemies.push(makeEnemy('fighter',player.x+(i%10)*90,player.y+Math.floor(i/10)*90));for(let i=0;i<20;i++)draw();const a=[];for(let i=0;i<120;i++){const t=performance.now();draw();a.push(performance.now()-t);}a.sort((x,y)=>x-y);return{p95:a[Math.floor(a.length*.95)],particles:particles.length,allies:allies.length};})()`);
 check('2僚机稳态draw P95<=16.7ms且对象有界', perf.p95<=16.7&&perf.allies===2&&perf.particles<=600, JSON.stringify(perf));
 const collision=await ev(`(()=>{startMission(0,'campaign');ChapterCard.skip();allies=[];enemies=[];bullets=[];missiles=[];pickups=[];const w=summonWingman().wingman;const e=makeEnemy('fighter',w.x,w.y);e.fireCd=999;e.mslCd=999;e.hp=999;e.aiTarget=player;enemies.push(e);mission.waveTimer=999;const hp0=w.hp;update(0.016);const after1=w.hp;for(let i=0;i<7;i++){e.x=w.x;e.y=w.y;mission.waveTimer=999;e.fireCd=999;update(0.016);}const afterFrames=w.hp;const cdMid=w.collideCd;e.x=w.x+300;e.y=w.y+300;mission.waveTimer=999;update(0.016);const cdSep=w.collideCd;e.x=w.x;e.y=w.y;mission.waveTimer=999;update(0.016);return{hp0,after1,afterFrames,cdMid,cdSep,after2:w.hp,alive:!w.dead,inAllies:allies.includes(w)};})()`);
 check('碰撞非致死扣血/冷却不重复/分离重置/再接触结算', collision.hp0===60&&collision.after1===40&&collision.afterFrames===40&&collision.cdMid>0&&collision.cdSep===0&&collision.after2===20&&collision.alive&&collision.inAllies, JSON.stringify(collision));
 const killByCollision=await ev(`(()=>{startMission(0,'campaign');ChapterCard.skip();allies=[];enemies=[];bullets=[];missiles=[];pickups=[];const w=summonWingman().wingman;const e=makeEnemy('fighter',w.x,w.y);e.fireCd=999;e.mslCd=999;e.hp=999;e.aiTarget=player;enemies.push(e);mission.waveTimer=999;w.hp=15;const snap={kills:GAME.kills,score:GAME.score,exp:GAME.exp,combo:GAME.combo,rev:GAME.reviveCount,ru:GAME.revivesUsed,php:player.hp,failed:mission.failed,complete:mission.complete,pending:GAME.pendingState,drops:pickups.length,trans:allies.filter(a=>a.kind==='transport').length};update(0.016);const dead=!allies.includes(w);const same=snap.kills===GAME.kills&&snap.score===GAME.score&&snap.exp===GAME.exp&&snap.combo===GAME.combo&&snap.rev===GAME.reviveCount&&snap.ru===GAME.revivesUsed&&snap.php===player.hp&&snap.failed===mission.failed&&snap.complete===mission.complete&&snap.pending===GAME.pendingState&&pickups.length===snap.drops&&allies.filter(a=>a.kind==='transport').length===snap.trans;return{dead,same,state:GAME.state,left:allies.filter(x=>x.kind==='wingman').length};})()`);
 check('碰撞致死移除僚机且玩家/任务/运输机/计分掉落链零污染', killByCollision.dead&&killByCollision.same&&killByCollision.state==='playing'&&killByCollision.left===0, JSON.stringify(killByCollision));
 const refill=await ev(`(()=>{startMission(0,'campaign');ChapterCard.skip();allies=allies.filter(a=>a.kind!=='wingman');enemies=[];bullets=[];pickups=[];summonWingman();summonWingman();const w0=allies.find(x=>x.kind==='wingman');w0.hp=5;bullets.push({x:w0.x,y:w0.y,vx:0,vy:0,life:1,r:4,dmg:99,enemy:true,fromPlayer:false});updateBullets(0.016);const afterKill=allies.filter(x=>x.kind==='wingman').length;pickups=[{x:player.x,y:player.y,vx:0,vy:0,type:'wingman',life:2,t:0}];updatePickups(0.016);const afterPick=allies.filter(x=>x.kind==='wingman').length;const slots=allies.filter(x=>x.kind==='wingman').map(x=>x.slot);return{afterKill,afterPick,slots,unique:new Set(slots).size===slots.length};})()`);
 check('死亡后真实拾取补回空槽(数量2/上限2/slot唯一)', refill.afterKill===1&&refill.afterPick===2&&refill.slots.length===2&&refill.unique&&refill.slots.every(s=>s===0||s===1), JSON.stringify(refill));
 const failed=results.filter(x=>!x.pass);console.log(`\n=== P26 ${results.length-failed.length}/${results.length} 通过 ===`);if(errors.length){console.log(errors.join('\n'));process.exitCode=1;}if(failed.length)process.exitCode=1;chrome.kill();process.exit(process.exitCode||0);
}
main().catch(e=>{console.error('FATAL',e);chrome.kill();process.exit(1);});
