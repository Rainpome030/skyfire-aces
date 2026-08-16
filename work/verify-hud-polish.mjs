// verify-hud-polish.mjs - P40 HUD visual hierarchy/safe-area RED-first gate
import { spawn } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const html = readFileSync(FILE, 'utf8');
const before = createHash('sha256').update(html).digest('hex');
const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
};
const block = (a, b) => {
  const i = html.indexOf(a), j = html.indexOf(b, i + 1);
  return i >= 0 && j > i ? html.slice(i, j) : '';
};
const hud = block('function drawHUD()', 'function drawPaused');
const rects = block('function hudRects()', 'function canvasPointFromClient');

check('S1 P40 six visual constants',
  html.includes("const HUD_PANEL_FILL = 'rgba(6,14,24,0.80)'") &&
  html.includes("const HUD_PANEL_STROKE = 'rgba(180,210,230,0.32)'") &&
  html.includes('const HUD_PANEL_RADIUS = 8') &&
  html.includes('const HUD_MISSION_WIDTH = 0.48') &&
  html.includes('const HUD_RADAR_SCALE_P40 = 0.75') &&
  html.includes('const RADAR_MARKER_SCALE = 0.75'));
check('S2 mission width and touch radar formulas use P40 constants',
  rects.includes('Math.min(288 * hudScale, W * HUD_MISSION_WIDTH)') &&
  rects.includes('Math.sqrt(RADAR_AREA_SCALE) * (isTouch ? HUD_RADAR_SCALE_P40 : 1)'));
check('S3 hintBox is returned by hudRects', rects.includes('hintBox') && /return\s*\{[^}]*hintBox/.test(rects));
check('S4 persistent HUD panels use unified style constants',
  hud.includes('HUD_PANEL_FILL') && hud.includes('HUD_PANEL_STROKE') && hud.includes('HUD_PANEL_RADIUS'));
check('S5 complete revive labels and scoreRight retained',
  hud.includes("'复活 ∞'") && hud.includes("'复活 ×' + GAME.reviveCount") && hud.includes('hr.scoreRight'));
check('S6 timed hint uses hintBox and remains temporary',
  hud.includes('GAME.hintTimer > 0') && hud.includes('GAME.hintTimer -= 1 / 60') &&
  hud.includes('hr.hintBox') && !rects.includes('hintTimer'));
check('S7 P38 layout/text contracts retained',
  hud.includes("'任务时间 '") && hud.includes("'击杀 '") && hud.includes("'目标：' + m.def.objective") &&
  hud.includes("'连杀 ×' + GAME.combo") && hud.includes("'速度 ' + Math.round(player.speed) + ' 高度: ' + Math.round(player.altitude)") &&
  hud.includes("'×' + player.missiles") && html.includes("'高度 ' + Math.round(player.altitude) + ' m'"));
check('S8 lock/offscreen guidance retained',
  html.includes('function drawLockIndicator') && html.includes('drawLockIndicator();') &&
  html.includes("ctx.fillText('LOCK '") && html.includes('function drawOffscreenArrow') && html.includes('drawOffscreenArrow('));
check('S9 radar marker call point remains literal',
  html.includes("if (a.kind === 'wingman') blip(a.x, a.y, '#55e6c1', 6, 'wingman')"));
check('S10 R1 critical touch font minimum exists',
  html.includes('const HUD_CRITICAL_FONT_MIN = 12'));
check('S11 R1 touch sizing branches and desktop formulas coexist',
  rects.includes('Math.max(64, 64 * hudScale)') &&
  rects.includes('Math.max(128,') && rects.includes('Math.max(28, 22 * hudScale)') &&
  rects.includes('96 * hudScale') &&
  hud.includes('Math.max(13, HUD_CRITICAL_FONT_MIN)') &&
  hud.includes('Math.max(HUD_CRITICAL_FONT_MIN, Math.round(11 * hudScale))') &&
  hud.includes('Math.max(14, 12 * hudScale)'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
class Run {
  constructor(port) {
    this.port = port;
    this.profile = join(tmpdir(), `skyfire-p40-${process.pid}-${port}`);
    this.pending = new Map(); this.id = 0; this.errors = [];
  }
  async start() {
    rmSync(this.profile, { recursive: true, force: true });
    mkdirSync(this.profile, { recursive: true });
    this.chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio',
      `--remote-debugging-port=${this.port}`, `--user-data-dir=${this.profile}`,
      '--window-size=900,900', 'file:///' + FILE], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    this.chrome.stderr.on('data', d => { const s = String(d); if (/Uncaught|SyntaxError|TypeError|ReferenceError/i.test(s)) this.errors.push(s.trim()); });
    let target;
    for (let i = 0; i < 100; i++) {
      try { const a = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json(); target = a.find(x => x.type === 'page'); if (target) break; } catch {}
      await sleep(80);
    }
    if (!target) throw new Error('Chrome target missing');
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, no) => { this.ws.onopen = ok; this.ws.onerror = no; });
    this.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.ok(m.result); }
      else if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails?.exception?.description || 'Runtime exception');
    };
    await this.send('Runtime.enable'); await this.send('Page.enable');
  }
  send(method, params = {}) { return new Promise((ok, no) => { const id = ++this.id; this.pending.set(id, { ok, no }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
  async stop() { try { this.ws?.close(); this.chrome?.kill(); } catch {} await sleep(250); rmSync(this.profile, { recursive: true, force: true }); }
}

const run = new Run(9594);
try {
  await run.start();
  for (const [W0, H0] of [[360, 780], [390, 844], [844, 390]]) {
    for (const top of [0, 47]) for (const dpr of [1, 2]) {
      await run.send('Emulation.setDeviceMetricsOverride', { width: W0, height: H0, deviceScaleFactor: dpr, mobile: false });
      await sleep(100);
      const out = await run.eval(`(() => {
        input.isTouch = true;
        document.documentElement.style.setProperty('--sat','${top}px');
        document.documentElement.style.setProperty('--sar','${top ? 21 : 0}px');
        document.documentElement.style.setProperty('--sab','${top ? 34 : 0}px');
        document.documentElement.style.setProperty('--sal','${top ? 21 : 0}px');
        refreshSafeInsets(); resize();
        const h = hudRects();
        if (!h.hintBox) return { missing:true, W, H };
        const box = r => ({x:r.x,y:r.y,w:r.w,h:r.h});
        const radar = {x:h.radar.x-h.radar.r,y:h.radar.y-h.radar.r,w:h.radar.r*2,h:h.radar.r*2};
        const overlap = (a,b) => a.x < b.x+b.w && b.x < a.x+a.w && a.y < b.y+b.h && b.y < a.y+a.h;
        const gap = (a,b) => {
          if (overlap(a,b)) return 0;
          const dx = Math.max(a.x-(b.x+b.w), b.x-(a.x+a.w), 0);
          const dy = Math.max(a.y-(b.y+b.h), b.y-(a.y+a.h), 0);
          return Math.hypot(dx,dy);
        };
        const targets = [h.statusPanel,h.msl,h.throttle,h.speedAltBox,h.pauseBtn].filter(Boolean);
        const gaps = targets.map(r => gap(h.hintBox,r));
        const touchR0 = Math.max(92,Math.min(W,H)*0.145)*Math.sqrt(RADAR_AREA_SCALE)*HUD_RADAR_SCALE_P40;
        const missionOk = h.missionPanel.w <= W*HUD_MISSION_WIDTH+1e-6;
        const safe = h.hintBox.x>=h.ml-1e-6 && h.hintBox.y>=h.mt-1e-6 && h.hintBox.x+h.hintBox.w<=W-h.mr+1e-6 && h.hintBox.y+h.hintBox.h<=H-h.mb+1e-6;
        const fallback = ${W0} <= 390 && ${H0} > ${W0} ? h.hintBox.y+h.hintBox.h <= h.msl.y-8+1e-6 : true;
        ctx.font='600 12px "Microsoft YaHei", sans-serif';
        const speedText=ctx.measureText('速度 999 高度: 9000').width;
        const statusBottom=H-h.mb-44*h.hudScale;
        const statusOk=h.statusPanel.h>=64-1e-6&&Math.abs(h.statusPanel.y+h.statusPanel.h-statusBottom)<1e-6;
        const speedOk=h.speedAltBox&&h.speedAltBox.w>=128-1e-6&&h.speedAltBox.h>=28-1e-6&&speedText<=h.speedAltBox.w-12+1e-6;
        return {missing:false,missionOk,radOk:Math.abs(h.radar.r-touchR0)<1e-6,safe,fallback,gaps,statusOk,speedOk,
          status:h.statusPanel,speed:h.speedAltBox,speedText,hint:h.hintBox,msl:h.msl,radar,realDpr:canvas.width/W};
      })()`);
      const label = `${W0}x${H0}@safe${top}/DPR${dpr}`;
      check(`L1 ${label} mission/radar`, !out.missing && out.missionOk && out.radOk, JSON.stringify(out));
      check(`L2 ${label} hint safe/gaps/fallback`, !out.missing && out.safe && out.fallback && out.gaps.every(x => x >= 8-1e-6), JSON.stringify(out));
      check(`L4 ${label} R1 status/speed readability`, !out.missing && out.statusOk && out.speedOk, JSON.stringify(out));
    }
  }

  const desk = await run.eval(`(() => { input.isTouch=false; resize(); const h=hudRects(); const base=Math.max(92,Math.min(W,H)*0.145)*Math.sqrt(RADAR_AREA_SCALE); const hs=Math.min(1,Math.max(.8,Math.min(W,H)/900)); return {mw:h.missionPanel.w,r:h.radar.r,base,hint:!!h.hintBox,status:h.statusPanel,statusExpected:{x:h.ml,y:H-h.mb-108*hs,w:262*hs,h:96*hs},speed:h.speedAltBox}; })()`);
  check('L3 desktop P38 mission/radar dimensions retained', Math.abs(desk.mw - 288 * Math.min(1,Math.max(.8,Math.min(844,390)/900))) < 1e-6 && Math.abs(desk.r-desk.base)<1e-6 && desk.hint, JSON.stringify(desk));
  check('L5 desktop P38 status/speed formulas retained', desk.speed===null && ['x','y','w','h'].every(k=>Math.abs(desk.status[k]-desk.statusExpected[k])<1e-6), JSON.stringify(desk));

  await run.send('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:2, mobile:false });
  await sleep(100);
  const pixels = await run.eval(`(() => {
    input.isTouch = true;
    document.documentElement.style.setProperty('--sat','47px');
    document.documentElement.style.setProperty('--sar','21px');
    document.documentElement.style.setProperty('--sab','34px');
    document.documentElement.style.setProperty('--sal','21px');
    refreshSafeInsets(); resize();
    startEndless(); ChapterCard.skip(); GAME.state='playing'; transition.active=false;
    player.altitude=9000; player.hp=player.maxHp; player.hitFlash=0;
    enemies=[]; missiles=[]; toasts=[]; GAME.combo=0;
    const h=hudRects(), d=canvas.width/W, M=v=>Math.round(v*d);
    const clear=r=>{ ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(M(r.x),M(r.y),M(r.w),M(r.h)); ctx.restore(); };
    const data=r=>ctx.getImageData(M(r.x),M(r.y),Math.max(1,M(r.w)),Math.max(1,M(r.h))).data;
    const alphaCount=a=>{ let n=0; for(let i=3;i<a.length;i+=4) if(a[i]>12)n++; return n; };
    const goldCount=a=>{ let n=0; for(let i=0;i<a.length;i+=4) if(a[i]>205&&a[i+1]>145&&a[i+2]<145&&a[i+3]>24)n++; return n; };

    let hintOn=0, hintOff=0;
    if (h.hintBox) {
      GAME.hintTimer=12; clear(h.hintBox); drawHUD(); hintOn=alphaCount(data(h.hintBox));
      GAME.hintTimer=0; clear(h.hintBox); drawHUD(); hintOff=alphaCount(data(h.hintBox));
    }

    const labels=[];
    const critical=[];
    const bars=[];
    const rawFillText=ctx.fillText;
    const rawDrawHudBar=drawHudBar;
    ctx.fillText=function(text,x,y,maxWidth){
      if(typeof text==='string'&&text.startsWith('复活 ')) {
        const tm=ctx.measureText(text);
        labels.push({text,x,y,w:tm.width,font:ctx.font});
      }
      if(typeof text==='string'&&(text.startsWith('Lv.')||text.startsWith('武器 ')||text.startsWith('弹药 ')||text==='无限'||text.startsWith('速度 '))) {
        const tm=ctx.measureText(text);
        const px=parseFloat(ctx.font.match(/([0-9.]+)px/)?.[1]||'0');
        const x1=ctx.textAlign==='right'?x-tm.width:ctx.textAlign==='center'?x-tm.width/2:x;
        critical.push({text,x1,x2:x1+tm.width,y1:y-(tm.actualBoundingBoxAscent||px),y2:y+(tm.actualBoundingBoxDescent||px*.25),font:px,align:ctx.textAlign});
      }
      return maxWidth===undefined ? rawFillText.call(ctx,text,x,y) : rawFillText.call(ctx,text,x,y,maxWidth);
    };
    drawHudBar=function(x,y,w,bh,pct,fill,bg,label,value){
      if(x>=h.statusPanel.x&&x<=h.statusPanel.x+h.statusPanel.w&&y>=h.statusPanel.y&&y<=h.statusPanel.y+h.statusPanel.h) bars.push({x,y,w,h:bh});
      return rawDrawHudBar(x,y,w,bh,pct,fill,bg,label,value);
    };
    const labelPixels=[];
    for (const state of [{unlimited:true,count:0,want:'复活 ∞'},{unlimited:false,count:3,want:'复活 ×3'}]) {
      GAME.unlimitedRevive=state.unlimited; GAME.reviveCount=state.count;
      labels.length=0;
      const zone={x:h.missionPanel.x,y:h.mt,w:h.scoreRight-h.missionPanel.x,h:64*h.hudScale};
      clear(zone); drawHUD();
      const q=labels[0];
      if(!q){ labelPixels.push({want:state.want,missing:true}); continue; }
      const box={x:q.x-q.w-2,y:q.y-18*h.hudScale,w:q.w+4,h:22*h.hudScale};
      const split=Math.max(1,box.w*.58);
      const left={x:box.x,y:box.y,w:split,h:box.h};
      const right={x:box.x+split,y:box.y,w:box.w-split,h:box.h};
      labelPixels.push({want:state.want,text:q.text,left:goldCount(data(left)),right:goldCount(data(right)),
        fits:box.x>=h.missionPanel.x+h.missionPanel.w+8-1e-6&&box.x>=h.ml-1e-6&&box.x+box.w<=W-h.mr+1e-6,
        missionGold:goldCount(data(h.missionPanel)),box});
    }
    critical.length=0; bars.length=0;
    player.weapon=defaultWeapon();
    Object.assign(player.weapon,{name:'能量炮',quality:'rare',limited:true,ammo:999});
    player.speed=999; player.altitude=9000;
    GAME.level=99; GAME.exp=Math.max(1,expNeeded(GAME.level)*0.76);
    drawHUD();
    const statusTexts=critical.filter(q=>q.text.startsWith('Lv.')||q.text.startsWith('武器 ')||q.text.startsWith('弹药 ')||q.text==='无限');
    const speedText=critical.find(q=>q.text==='速度 999 高度: 9000')||null;
    const expBar=bars.find(b=>b.x>=h.statusPanel.x+40)||null;
    const inside=(q,r)=>q.x1>=r.x-1e-6&&q.x2<=r.x+r.w+1e-6&&q.y1>=r.y-1e-6&&q.y2<=r.y+r.h+1e-6;
    const overlap=(a,b)=>a.x1<b.x2&&b.x1<a.x2&&a.y1<b.y2&&b.y1<a.y2;
    const barBox=expBar?{x1:expBar.x,x2:expBar.x+expBar.w,y1:expBar.y,y2:expBar.y+expBar.h}:null;
    const internalOk=statusTexts.length===3&&statusTexts.every(q=>inside(q,h.statusPanel))&&
      statusTexts.find(q=>q.text.startsWith('Lv.'))?.font>=13&&
      statusTexts.filter(q=>q.text.startsWith('武器 ')||q.text.startsWith('弹药 ')||q.text==='无限').every(q=>q.font>=12)&&
      expBar&&expBar.h>=14&&expBar.x>=h.statusPanel.x&&expBar.x+expBar.w<=h.statusPanel.x+h.statusPanel.w&&
      expBar.y>=h.statusPanel.y&&expBar.y+expBar.h<=h.statusPanel.y+h.statusPanel.h&&
      statusTexts.every(q=>!overlap(q,barBox))&&
      !overlap(statusTexts.find(q=>q.text.startsWith('武器 ')),statusTexts.find(q=>q.text.startsWith('弹药 ')||q.text==='无限'));
    const speedOk=!!speedText&&speedText.font>=12&&inside(speedText,h.speedAltBox)&&speedText.x1>=h.speedAltBox.x+6-1e-6&&speedText.x2<=h.speedAltBox.x+h.speedAltBox.w-6+1e-6;
    drawHudBar=rawDrawHudBar;
    ctx.fillText=rawFillText;
    return {hintOn,hintOff,hint:h.hintBox||null,labelPixels,internalOk,speedOk,status:h.statusPanel,speed:h.speedAltBox,statusTexts,expBar,speedText,realDpr:d};
  })()`);
  check('P1 timed hint positive/negative pixels are isolated in hintBox', !!pixels.hint && pixels.hintOn > 80 && pixels.hintOff === 0, JSON.stringify(pixels));
  check('P2 revive labels are complete and pixel-separated from mission panel', pixels.labelPixels.length===2 && pixels.labelPixels.every(x=>!x.missing&&x.text===x.want&&x.left>5&&x.right>2&&x.fits&&x.missionGold===0), JSON.stringify(pixels));
  check('P3 R1 status texts/bar fit without overlap at critical sizes', pixels.internalOk, JSON.stringify(pixels));
  check('P4 R1 longest speed/altitude text fits with 6px padding', pixels.speedOk, JSON.stringify(pixels));

  if (checks.every(c => c.pass)) {
    for (const [w,h,name] of [[390,844,'p40-hud-390x844.png'],[844,390,'p40-hud-844x390.png']]) {
      await run.send('Emulation.setDeviceMetricsOverride', { width:w,height:h,deviceScaleFactor:1,mobile:false });
      await run.eval(`input.isTouch=true; startEndless(); ChapterCard.skip(); GAME.state='playing'; GAME.hintTimer=12; player.altitude=9000; transition.active=false; resize();`);
      await sleep(150);
      const shot = await run.send('Page.captureScreenshot', { format:'png' });
      writeFileSync(ROOT + '/work/' + name, Buffer.from(shot.data,'base64'));
    }
  }
} catch (e) { check('L runtime', false, String(e?.message || e).slice(0,240)); }
await run.stop();
check('R1 no runtime errors', run.errors.length === 0, run.errors.slice(0,2).join(' | '));
check('R2 source hash unchanged', createHash('sha256').update(readFileSync(FILE)).digest('hex') === before);
const failed = checks.filter(x => !x.pass);
console.log(`\n=== P40 HUD polish: ${checks.length-failed.length}/${checks.length} passed ===`);
if (failed.length) console.log('FAILED: ' + failed.map(x => x.name).join(' | '));
process.exit(failed.length ? 1 : 0);