/* 任务书 14 自测:planes.js 三个战机造型纯绘制函数
 *
 * 验收标准逐条覆盖:
 *   A1 三个函数以 {} 空对象调用不抛错
 *   A2 标志色 fillStyle/strokeStyle 断言(hammer #6b7684 / bolt #d8e9f2 /
 *      phoenix #f5c94c,外加各自点缀色 #ff9f43 / #66d9ff / #d84a4a)
 *   A3 不访问 ctx 外任何全局:vm 沙箱(无 GAME/save/player/CFG 等)+
 *      Proxy mock ctx 白名单,访问未 mock API 即抛错
 *   A4 绘制坐标在契约范围 x∈[-46,40], y∈[-30,30](含椭圆半径、矩形四角)
 *   A5 save/restore 配对,不污染调用方渲染状态
 *   A6 纯绘制:空对象与带字段对象的绘制调用序列完全一致(不读取 p)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CTX_METHODS = ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'closePath',
  'fill', 'stroke', 'ellipse', 'arc', 'fillRect', 'arcTo', 'createLinearGradient'];
const CTX_PROPS = ['fillStyle', 'strokeStyle', 'lineWidth'];

function makeMockCtx() {
  const calls = [];
  const record = (k) => (...args) => { calls.push([k, ...args]); };
  const base = {};
  for (const m of CTX_METHODS) base[m] = record(m);
  base.createLinearGradient = () => ({ addColorStop() {} });
  const proxy = new Proxy(base, {
    get(t, k) {
      if (typeof k === 'symbol') return t[k];
      if (k in t) return t[k];
      if (CTX_PROPS.includes(k)) return undefined; // 可写属性,未赋值时读默认值
      throw new Error('访问了未 mock 的 ctx API: ' + String(k));
    },
    set(t, k, v) {
      if (typeof k === 'symbol') { t[k] = v; return true; }
      if (CTX_METHODS.includes(k)) throw new Error('不允许给 ctx 方法赋值: ' + String(k));
      if (!CTX_PROPS.includes(k)) throw new Error('不允许设置未 mock 的 ctx 属性: ' + String(k));
      t[k] = v;
      calls.push([k, v]);
      return true;
    }
  });
  return { ctx: proxy, calls };
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  got=' + JSON.stringify(extra) : '')); }
}

// ---- 加载片段:vm 沙箱(严格模式 script,函数声明进入沙箱全局)----
const src = fs.readFileSync(path.join(__dirname, 'planes.js'), 'utf8');
const { ctx, calls } = makeMockCtx();
const sandbox = { ctx, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'planes.js' });

const FNS = {
  hammer: sandbox.drawHammerJet,
  bolt: sandbox.drawBoltJet,
  phoenix: sandbox.drawPhoenixJet
};
for (const k of Object.keys(FNS)) {
  if (typeof FNS[k] !== 'function') { check('加载:沙箱内存在函数 ' + k, false); process.exit(1); }
}
console.log('== T0 片段加载 ==');
check('planes.js 在 vm 沙箱内加载成功,三个函数均存在', true);
check('沙箱内无泄漏其他全局(除 ctx/console)', Object.keys(sandbox).filter(k => !['ctx', 'console', 'drawHammerJet', 'drawBoltJet', 'drawPhoenixJet'].includes(k)).length === 0);

// ---- A1:空对象调用不抛错 ----
console.log('== T1 空对象调用(A1) ==');
for (const [k, fn] of Object.entries(FNS)) {
  let ok = true, err = '';
  calls.length = 0;
  try { fn({}); } catch (e) { ok = false; err = e.message; }
  check('A1 ' + k + ' 以 {} 调用不抛错', ok, err);
  check('A1 ' + k + ' 无返回值(undefined)', fn({}) === undefined);
}

// ---- A2:标志色断言 ----
console.log('== T2 标志色断言(A2) ==');
function colorSeq() {
  return calls.filter(c => c[0] === 'fillStyle' || c[0] === 'strokeStyle').map(c => String(c[1]));
}
calls.length = 0; FNS.hammer({});
const hm = colorSeq();
check('A2 hammer 出现主色 #6b7684', hm.includes('#6b7684'), hm);
check('A2 hammer 出现橙警示 #ff9f43', hm.includes('#ff9f43'), hm);
calls.length = 0; FNS.bolt({});
const bt = colorSeq();
check('A2 bolt 出现主色 #d8e9f2', bt.includes('#d8e9f2'), bt);
check('A2 bolt 出现天蓝条纹 #66d9ff', bt.includes('#66d9ff'), bt);
calls.length = 0; FNS.phoenix({});
const ph = colorSeq();
check('A2 phoenix 出现主色 #f5c94c', ph.includes('#f5c94c'), ph);
check('A2 phoenix 出现深红点缀 #d84a4a', ph.includes('#d84a4a'), ph);

// ---- A3:未 mock API 访问即抛错(mock 严格性自检 + 函数未触发)----
console.log('== T3 ctx 白名单严格性(A3) ==');
let threw = false;
try { ctx.globalAlpha = 0.5; } catch (e) { threw = true; }
check('A3 自检:设置未 mock 属性 globalAlpha 抛错', threw);
threw = false;
try { const x = ctx.shadowBlur; } catch (e) { threw = true; }
check('A3 自检:读取未 mock 属性 shadowBlur 抛错', threw);
threw = false;
try { ctx.translate(1, 2); } catch (e) { threw = true; }
check('A3 自检:调用未 mock 方法 translate 抛错', threw);
// 三个函数跑通即证明未访问未 mock API(Proxy 白名单已拦截)
console.log('  (三个函数在 T1 中已全部跑通,未触发任何未 mock API)');

// ---- A4:坐标范围 x∈[-46,40], y∈[-30,30] ----
console.log('== T4 尺寸范围契约(A4) ==');
const XMIN = -46, XMAX = 40, YMIN = -30, YMAX = 30;
function geometryPoints() {
  const pts = [];
  for (const c of calls) {
    const k = c[0], a = c.slice(1);
    if (k === 'moveTo' || k === 'lineTo') pts.push([a[0], a[1]]);
    else if (k === 'ellipse') {
      pts.push([a[0] - a[2], a[1] - a[3]], [a[0] + a[2], a[1] + a[3]]);
    } else if (k === 'arc') {
      pts.push([a[0] - a[2], a[1] - a[2]], [a[0] + a[2], a[1] + a[2]]);
    } else if (k === 'fillRect') {
      pts.push([a[0], a[1]], [a[0] + a[2], a[1] + a[3]]);
    } else if (k === 'arcTo') {
      pts.push([a[0], a[1]], [a[2], a[3]]);
    }
  }
  return pts;
}
for (const [k, fn] of Object.entries(FNS)) {
  calls.length = 0; fn({});
  const pts = geometryPoints();
  const bad = pts.filter(([x, y]) => x < XMIN - 0.5 || x > XMAX + 0.5 || y < YMIN - 0.5 || y > YMAX + 0.5);
  check('A4 ' + k + ' 所有几何坐标在契约范围内(容差 0.5)', bad.length === 0, bad.slice(0, 3));
}

// ---- A5:save/restore 配对 ----
console.log('== T5 save/restore 配对(A5) ==');
for (const [k, fn] of Object.entries(FNS)) {
  calls.length = 0; fn({});
  const saves = calls.filter(c => c[0] === 'save').length;
  const restores = calls.filter(c => c[0] === 'restore').length;
  check('A5 ' + k + ' save(' + saves + ')/restore(' + restores + ') 配对', saves === 1 && restores === 1);
}

// ---- A6:纯绘制,不读取 p 任何字段(空对象 vs 带字段调用序列一致)----
console.log('== T6 不读取 p(A6) ==');
for (const [k, fn] of Object.entries(FNS)) {
  calls.length = 0; fn({});
  const seq1 = JSON.stringify(calls);
  calls.length = 0;
  fn({ x: 640, y: 360, heading: 1.2, speed: 300, afterburn: true, hitFlash: 1, planeId: k, color: '#123456' });
  const seq2 = JSON.stringify(calls);
  check('A6 ' + k + ' 空对象与带字段对象绘制调用序列完全一致', seq1 === seq2);
}

// ---- 汇总 ----
console.log('----------------------------------------');
console.log('结果:通过 ' + pass + ' 项,失败 ' + fail + ' 项');
process.exit(fail > 0 ? 1 : 0);
