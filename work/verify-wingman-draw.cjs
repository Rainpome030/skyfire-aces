'use strict';

const assert = require('assert');
const path = require('path');

function makeCtx() {
  const calls = [];
  const stack = [];
  const state = {
    globalAlpha: 0.37,
    shadowBlur: 13,
    shadowColor: '#abc',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic'
  };
  const methods = ['beginPath', 'closePath', 'moveTo', 'lineTo', 'arcTo', 'arc', 'ellipse', 'fill', 'stroke', 'fillRect', 'fillText', 'translate', 'rotate'];
  const target = {
    calls,
    save() { stack.push({ ...state }); calls.push(['save']); },
    restore() { const old = stack.pop(); if (!old) throw new Error('restore without save'); Object.assign(state, old); calls.push(['restore']); }
  };
  for (const name of methods) target[name] = (...args) => calls.push([name, ...args]);
  return new Proxy(target, {
    get(obj, key) {
      if (typeof key === 'symbol') return obj[key];
      if (key in obj) return obj[key];
      if (key in state) return state[key];
      throw new Error('Unexpected ctx read: ' + String(key));
    },
    set(obj, key, value) {
      if (!(key in state)) throw new Error('Unexpected ctx write: ' + String(key));
      state[key] = value;
      calls.push(['set', key, value]);
      return true;
    }
  });
}

function resets(ctx) { ctx.calls.length = 0; }
function sets(ctx, prop, value) { return ctx.calls.some(c => c[0] === 'set' && c[1] === prop && c[2] === value); }
function calls(ctx, name) { return ctx.calls.filter(c => c[0] === name); }
function snapshot(ctx) { return { globalAlpha: ctx.globalAlpha, shadowBlur: ctx.shadowBlur, shadowColor: ctx.shadowColor }; }

const ctx = makeCtx();
global.ctx = ctx;
global.W = 1280;
global.H = 720;
const mod = require(path.join(__dirname, 'gen', 'wingman-draw.js'));

let passed = 0;
function test(name, fn) {
  resets(ctx);
  fn();
  passed++;
  console.log('PASS', name);
}

test('颜色常量为青绿与金色', () => {
  assert.strictEqual(mod.WINGMAN_COLORS.teal, '#55e6c1');
  assert.strictEqual(mod.WINGMAN_COLORS.gold, '#ffd166');
});

test('僚机专属轮廓含短翼、金色菱形翼尖、双垂尾', () => {
  const before = snapshot(ctx);
  mod.drawWingmanJet({ hp: 80, maxHp: 100, hitFlash: 0 });
  assert(sets(ctx, 'fillStyle', '#55e6c1'));
  assert(sets(ctx, 'fillStyle', '#ffd166'));
  const paths = calls(ctx, 'moveTo');
  assert(paths.some(c => c[1] === 31 && c[2] === 0), 'missing pointed fuselage nose');
  assert(paths.some(c => c[1] === -2 && c[2] === -20), 'missing upper diamond wingtip');
  assert(paths.some(c => c[1] === -10 && c[2] === -5), 'missing upper twin tail');
  assert(paths.some(c => c[1] === -10 && c[2] === 5), 'missing lower twin tail');
  assert.deepStrictEqual(snapshot(ctx), before, 'ctx alpha/shadow state leaked');
  assert.strictEqual(calls(ctx, 'save').length, 1);
  assert.strictEqual(calls(ctx, 'restore').length, 1);
});

test('受击闪烁并恢复 globalAlpha/shadowBlur', () => {
  const before = snapshot(ctx);
  mod.drawWingmanJet({ hp: 20, maxHp: 100, hitFlash: 0.8, alpha: 0.6 });
  assert(sets(ctx, 'fillStyle', '#ffffff'));
  assert(sets(ctx, 'fillStyle', '#ff6b6b'));
  assert.deepStrictEqual(snapshot(ctx), before);
});

test('低血量烟迹接口仅在35%及以下启用', () => {
  assert.strictEqual(mod.getWingmanSmokePorts({ hp: 36, maxHp: 100 }).length, 0);
  const ports = mod.getWingmanSmokePorts({ hp: 35, maxHp: 100 });
  assert.strictEqual(ports.length, 2);
  assert.deepStrictEqual(ports.map(p => p.y), [-5, 5]);
});

test('雷达僚机为青绿菱形并有金边', () => {
  const before = snapshot(ctx);
  mod.drawWingmanRadarBlip(100, 90, 6, 'wingman', 0.3);
  assert(sets(ctx, 'fillStyle', '#55e6c1'));
  assert(sets(ctx, 'strokeStyle', '#ffd166'));
  assert.strictEqual(calls(ctx, 'fillRect').length, 0);
  assert.strictEqual(calls(ctx, 'lineTo').length, 3);
  assert.deepStrictEqual(snapshot(ctx), before);
});

test('运输机雷达仍为绿色方块', () => {
  mod.drawWingmanRadarBlip({ x: 30, y: 40, size: 5, kind: 'transport' });
  assert(sets(ctx, 'fillStyle', '#4ecb71'));
  assert.strictEqual(calls(ctx, 'fillRect').length, 1);
  assert.strictEqual(calls(ctx, 'rotate').length, 0);
});

test('HUD最多绘制两条紧凑血条且忽略运输机/死亡对象', () => {
  const before = snapshot(ctx);
  const rows = mod.drawWingmanHud([
    { kind: 'transport', hp: 300, maxHp: 320 },
    { kind: 'wingman', name: '青鸾', hp: 80, maxHp: 100 },
    { kind: 'wingman', name: '金隼', hp: 25, maxHp: 100 },
    { kind: 'wingman', name: '第三机', hp: 99, maxHp: 100 },
    { kind: 'wingman', dead: true, hp: 0, maxHp: 100 }
  ]);
  assert.strictEqual(rows, 2);
  const texts = calls(ctx, 'fillText').map(c => String(c[1]));
  assert(texts.includes('青鸾') && texts.includes('金隼'));
  assert(!texts.includes('第三机'));
  assert.strictEqual(texts.filter(t => /%$/.test(t)).length, 2);
  assert(sets(ctx, 'fillStyle', '#55e6c1'));
  assert(sets(ctx, 'fillStyle', '#ffd166'));
  assert(sets(ctx, 'fillStyle', '#ff6b6b'));
  assert.deepStrictEqual(snapshot(ctx), before);
});

test('空HUD输入安全且不触碰ctx', () => {
  assert.strictEqual(mod.drawWingmanHud(null), 0);
  assert.strictEqual(ctx.calls.length, 0);
});

console.log(`RESULT ${passed}/8 tests passed`);
