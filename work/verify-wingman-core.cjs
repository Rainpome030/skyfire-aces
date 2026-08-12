'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const modulePath = path.join(__dirname, 'gen', 'wingman-core.js');
const source = fs.readFileSync(modulePath, 'utf8');

global.player = {
  kind: 'player', x: 1000, y: 1000, heading: 0, speed: 220,
  alive: true, dead: false,
  weapon: { dmg: 20, speed: 900, life: 1.25, size: 4 }
};
global.allies = [];
global.enemies = [];
global.bullets = [];
global.GAME = { shotsFired: 0 };

global.explodeCalls = 0;
global.explode = () => { global.explodeCalls++; };
global.burstDebris = () => {};

const core = require(modulePath);
const {
  WINGMAN_CONFIG,
  makeWingman,
  summonWingman,
  updateWingman,
  acquireWingmanTarget,
  fireWingmanGun,
  damageWingman,
  removeWingman
} = core;

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('PASS', name);
}
function near(actual, expected, epsilon, message) {
  assert.ok(Math.abs(actual - expected) <= epsilon,
    (message || 'values differ') + `: expected ${expected}, got ${actual}`);
}
function reset() {
  global.allies = [];
  global.enemies = [];
  global.bullets = [];
  global.GAME = { shotsFired: 0 };
  global.explodeCalls = 0;
  Object.assign(global.player, {
    x: 1000, y: 1000, heading: 0, speed: 220, alive: true, dead: false,
    weapon: { dmg: 20, speed: 900, life: 1.25, size: 4 }
  });
}

test('fragment is plain JS and static global references stay on the integration allowlist', () => {
  assert.ok(!/<script\b|<\/script>|\bimport\s|\bexport\s/.test(source));
  const browserGlobals = new Set(['player', 'allies', 'enemies', 'bullets', 'GAME', 'explode', 'burstDebris']);
  const allowedInfrastructure = new Set(['module', 'exports', 'require', 'globalThis', 'window', 'console']);
  const declared = new Set();
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\r\n]*/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, ' ');
  for (const match of codeOnly.matchAll(/\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)) declared.add(match[1]);
  const identifiers = new Set(Array.from(codeOnly.matchAll(/\b[A-Za-z_$][\w$]*\b/g), m => m[0]));
  const suspiciousGameGlobals = ['player', 'allies', 'enemies', 'bullets', 'missiles', 'particles', 'pickups', 'GAME', 'mission', 'world', 'cam', 'ctx', 'AudioSys', 'explode', 'burstDebris', 'damagePlane', 'killPlane'];
  const usedGameGlobals = suspiciousGameGlobals.filter(name => identifiers.has(name) && !declared.has(name));
  assert.deepStrictEqual(usedGameGlobals.sort(), Array.from(browserGlobals).sort());
  for (const name of usedGameGlobals) assert.ok(browserGlobals.has(name) || allowedInfrastructure.has(name));
});

test('configuration exposes the approved balance values', () => {
  assert.strictEqual(WINGMAN_CONFIG.maxCount, 2);
  assert.strictEqual(WINGMAN_CONFIG.maxHp, 60);
  assert.strictEqual(WINGMAN_CONFIG.damageRatio, 0.35);
  assert.strictEqual(WINGMAN_CONFIG.fireCd, 0.28);
  assert.strictEqual(WINGMAN_CONFIG.targetRange, 1100);
  assert.strictEqual(WINGMAN_CONFIG.breakDistance, 520);
  assert.strictEqual(WINGMAN_CONFIG.fullRepair, 30);
  assert.strictEqual(WINGMAN_CONFIG.boostDuration, 8);
  assert.strictEqual(WINGMAN_CONFIG.boostRate, 1.25);
});

test('one and two summons add wingmen; third summon does not exceed cap', () => {
  reset();
  const one = summonWingman();
  const two = summonWingman();
  const three = summonWingman();
  assert.strictEqual(one.action, 'added');
  assert.strictEqual(two.action, 'added');
  assert.strictEqual(three.action, 'boosted');
  assert.strictEqual(allies.filter(a => a.kind === 'wingman').length, 2);
  assert.deepStrictEqual(allies.filter(a => a.kind === 'wingman').map(a => a.slot), [0, 1]);
});

test('full formation pickup repairs 30 hp and grants eight second rate boost', () => {
  reset();
  summonWingman(); summonWingman();
  allies[0].hp = 10;
  allies[1].hp = 50;
  summonWingman();
  assert.strictEqual(allies[0].hp, 40);
  assert.strictEqual(allies[1].hp, 60);
  assert.strictEqual(allies[0].rateBoostT, 8);
  assert.strictEqual(allies[1].rateBoostT, 8);
  allies[0].fireCd = 0;
  enemies.push({ kind: 'fighter', x: 1200, y: 1000, hp: 50, dead: false });
  fireWingmanGun(allies[0]);
  near(allies[0].fireCd, 0.28 / 1.25, 1e-12);
  updateWingman(allies[0], 8.1);
  assert.strictEqual(allies[0].rateBoostT, 0);
});

test('makeWingman creates distinct left and right formation slots', () => {
  reset();
  const left = makeWingman(0);
  const right = makeWingman(1);
  near(left.formationSide, -1, 0);
  near(right.formationSide, 1, 0);
  near(left.x, 905, 1e-9);
  near(left.y, 928, 1e-9);
  near(right.x, 905, 1e-9);
  near(right.y, 1072, 1e-9);
  assert.strictEqual(left.kind, 'wingman');
  assert.strictEqual(left.hp, 60);
});

test('formation update holds left and right offsets behind a turning player', () => {
  reset();
  player.heading = Math.PI / 2;
  const left = makeWingman(0);
  const right = makeWingman(1);
  allies.push(left, right);
  updateWingman(left, 0.1);
  updateWingman(right, 0.1);
  assert.ok(left.formationX > right.formationX, 'left slot should be on player left at north heading');
  near(left.formationX, 1072, 1e-9);
  near(left.formationY, 905, 1e-9);
  near(right.formationX, 928, 1e-9);
  near(right.formationY, 905, 1e-9);
});

test('a detached wingman accelerates to catch up without teleporting', () => {
  reset();
  const w = makeWingman(0);
  w.x = 0; w.y = 0; w.speed = 100;
  allies.push(w);
  const beforeX = w.x;
  updateWingman(w, 0.1);
  assert.strictEqual(w.catchingUp, true);
  assert.ok(w.speed > 100);
  assert.ok(w.speed <= WINGMAN_CONFIG.catchupSpeed);
  assert.ok(Math.hypot(w.x - beforeX, w.y) < 100, 'movement must be continuous, not teleport');
});

test('target acquisition selects nearest valid enemy within range', () => {
  reset();
  const w = makeWingman(0);
  enemies.push(
    { kind: 'fighter', x: w.x + 500, y: w.y, hp: 10, dead: false },
    { kind: 'fighter', x: w.x + 150, y: w.y, hp: 10, dead: false },
    { kind: 'fighter', x: w.x + 50, y: w.y, hp: 0, dead: true },
    { kind: 'fighter', x: w.x + 1500, y: w.y, hp: 10, dead: false }
  );
  assert.strictEqual(acquireWingmanTarget(w), enemies[1]);
  enemies[1].dead = true;
  assert.strictEqual(acquireWingmanTarget(w), enemies[0]);
});

test('gun fire creates a player-friendly credited bullet with 35 percent damage', () => {
  reset();
  const w = makeWingman(0);
  const target = { kind: 'fighter', x: w.x + 300, y: w.y, hp: 50, dead: false };
  enemies.push(target);
  w.target = target;
  w.fireCd = 0;
  const bullet = fireWingmanGun(w);
  assert.strictEqual(bullets.length, 1);
  assert.strictEqual(bullet.enemy, false);
  assert.strictEqual(bullet.fromPlayer, true);
  assert.strictEqual(bullet.source, 'wingman');
  assert.strictEqual(bullet.owner, w);
  assert.strictEqual(bullet.creditPlayer, true);
  assert.strictEqual(bullet.dmg, 7);
  assert.strictEqual(GAME.shotsFired, 1);
});

test('damage lowers hp; lethal damage removes only the wingman and emits explosion', () => {
  reset();
  const transport = { kind: 'transport', hp: 320, dead: false };
  const w = makeWingman(0);
  allies.push(transport, w);
  assert.strictEqual(damageWingman(w, 20), false);
  assert.strictEqual(w.hp, 40);
  assert.strictEqual(damageWingman(w, 50), true);
  assert.strictEqual(w.dead, true);
  assert.strictEqual(allies.includes(w), false);
  assert.strictEqual(allies.includes(transport), true);
  assert.strictEqual(transport.dead, false);
  assert.strictEqual(explodeCalls, 1);
});

test('transport objects are isolated from wingman APIs and cap counting', () => {
  reset();
  const transport = { kind: 'transport', hp: 320, dead: false };
  allies.push(transport);
  assert.strictEqual(damageWingman(transport, 999), false);
  assert.strictEqual(removeWingman(transport), false);
  summonWingman(); summonWingman();
  assert.strictEqual(allies.length, 3);
  assert.strictEqual(allies[0], transport);
  assert.strictEqual(transport.hp, 320);
});

test('functions use the live allies array after mission reset reassignment', () => {
  reset();
  summonWingman();
  const oldAllies = allies;
  global.allies = [];
  const result = summonWingman();
  assert.strictEqual(result.action, 'added');
  assert.strictEqual(allies.length, 1);
  assert.strictEqual(oldAllies.length, 1);
  assert.notStrictEqual(allies[0], oldAllies[0]);
});

test('invalid dt and damage are ignored safely', () => {
  reset();
  const w = makeWingman(0);
  allies.push(w);
  const snapshot = { x: w.x, y: w.y, hp: w.hp };
  updateWingman(w, NaN);
  damageWingman(w, -10);
  assert.strictEqual(w.x, snapshot.x);
  assert.strictEqual(w.y, snapshot.y);
  assert.strictEqual(w.hp, snapshot.hp);
});

console.log(`\n${passed} wingman-core mock tests passed.`);
