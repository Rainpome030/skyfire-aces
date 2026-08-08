// ============================================================
// 成就系统 mock 状态测试(12 个条件逐一验证)
// 运行:node work/gen/achievements.test.cjs
// 依赖:work/gen/achievements.js(CommonJS 导出)
// ============================================================
'use strict';
const assert = require('node:assert');
const path = require('node:path');
const A = require('./achievements.js');

// ---------- mock 全局(模拟主文件环境) ----------
function defaultSave() {
  return {
    version: 1, unlockedMissions: 1, chapterCleared: 0, selectedPlane: 'gale',
    difficulty: 'normal', bestScore: {}, bestKills: 0,
    totalKills: 0, totalScore: 0, missionsCleared: 0
  };
}
function defaultGAME() {
  return { state: 'mission', mode: 'campaign', missionIndex: 0, time: 0, score: 0,
           kills: 0, shotsFired: 0, shotsHit: 0, damageTaken: 0, missionTime: 0,
           combo: 0, comboTimer: 0, comboMax: 5 };
}
// 与主文件 L885-890 isPlaneUnlocked 一致:凤凰 unlock='chapter2' → chapterCleared >= 2
function mockIsPlaneUnlocked(id) {
  const unlock = { gale: null, hammer: null, bolt: null, phoenix: 'chapter2' }[id];
  if (unlock === undefined) return false;
  if (unlock === null) return true;
  return unlock === 'chapter2' && global.save.chapterCleared >= 2;
}

let toastCalls = [];
function mockAddToast(text, color, size) { toastCalls.push({ text, color, size }); }

function resetGlobals(overrides) {
  global.save = Object.assign(defaultSave(), overrides || {});
  global.GAME = defaultGAME();
  global.isPlaneUnlocked = mockIsPlaneUnlocked;
  global.addToast = mockAddToast;
  toastCalls = [];
}

// ---------- 断言辅助 ----------
let pass = 0, fail = 0;
const rows = [];
function run(name, fn) {
  try { fn(); pass++; rows.push({ name, 结果: 'PASS' }); }
  catch (e) { fail++; rows.push({ name, 结果: 'FAIL ' + e.message }); }
}
function ids(arr) { return arr.map(d => d.id).join(','); }

// ---------- 12 个条件逐一验证 ----------
// 每个用例构造“仅目标成就满足(其余条件不满足)”的 mock 状态,
// 预解锁同条件前置成就以保证 fresh 恰等于目标成就。
run('1. first_kill:save.totalKills>=1', () => {
  resetGlobals({ totalKills: 1 });
  const fresh = A.checkAchievements();
  assert.strictEqual(ids(fresh), 'first_kill');
});
run('2. ace_100:save.totalKills>=100', () => {
  resetGlobals({ totalKills: 100, achievements: ['first_kill'] });
  const fresh = A.checkAchievements();
  assert.strictEqual(ids(fresh), 'ace_100');
});
run('3. rank_s:bestRank>=S', () => {
  resetGlobals({ bestRank: 'S' });
  const fresh = A.checkAchievements();
  assert.strictEqual(ids(fresh), 'rank_s'); // S 不触发 rank_sss
});
run('4. rank_sss:bestRank===SSS', () => {
  resetGlobals({ bestRank: 'SSS', achievements: ['rank_s'] });
  const fresh = A.checkAchievements();
  assert.strictEqual(ids(fresh), 'rank_sss');
});
run('5. chapter1:chapterCleared>=1', () => {
  resetGlobals({ chapterCleared: 1 });
  const fresh = A.checkAchievements();
  assert.strictEqual(ids(fresh), 'chapter1');
});
run('6. chapter2:chapterCleared>=2', () => {
  // chapterCleared>=2 同时满足 plane_all(isPlaneUnlocked phoenix),一并预解锁
  resetGlobals({ chapterCleared: 2, achievements: ['chapter1', 'plane_all'] });
  const fresh = A.checkAchievements();
  assert.strictEqual(ids(fresh), 'chapter2');
});
run('7. chapter3:chapterCleared>=3', () => {
  resetGlobals({ chapterCleared: 3, achievements: ['chapter1', 'chapter2', 'plane_all'] });
  const fresh = A.checkAchievements();
  assert.strictEqual(ids(fresh), 'chapter3');
});
run('8. combo50:GAME.combo>=50', () => {
  resetGlobals();
  global.GAME.combo = 50;
  const fresh = A.checkAchievements();
  assert.strictEqual(ids(fresh), 'combo50');
  global.GAME.combo = 49; // 反例:49 不触发
  assert.strictEqual(A.checkAchievements().length, 0);
});
run('9. endless100:mode=endless && GAME.kills>=100', () => {
  resetGlobals();
  global.GAME.mode = 'endless';
  global.GAME.kills = 100;
  const fresh = A.checkAchievements();
  assert.strictEqual(ids(fresh), 'endless100');
  global.GAME.kills = 99; // 反例
  assert.strictEqual(A.checkAchievements().length, 0);
  global.GAME.kills = 100; global.GAME.mode = 'campaign'; // 反例:非无尽
  assert.strictEqual(A.checkAchievements().length, 0);
});
run('10. plane_all:isPlaneUnlocked(phoenix)(chapter2)', () => {
  resetGlobals({ chapterCleared: 2, achievements: ['chapter1', 'chapter2'] });
  const fresh = A.checkAchievements();
  assert.strictEqual(ids(fresh), 'plane_all');
});
run('10b. plane_all:selectedPlane=phoenix 路径', () => {
  resetGlobals({ selectedPlane: 'phoenix' });
  const fresh = A.checkAchievements();
  assert.ok(fresh.some(d => d.id === 'plane_all'));
});
run('11. hard_clear:difficulty=hard && chapterCleared>=1', () => {
  resetGlobals({ difficulty: 'hard', chapterCleared: 1, achievements: ['chapter1'] });
  const fresh = A.checkAchievements();
  assert.strictEqual(ids(fresh), 'hard_clear');
  resetGlobals({ difficulty: 'normal', chapterCleared: 0 }); // 反例:非 hard 且无通关
  assert.strictEqual(A.checkAchievements().length, 0);
});
run('12. perfect:markPerfectRun(true)', () => {
  resetGlobals();
  A.markPerfectRun(true);
  const fresh = A.checkAchievements();
  assert.strictEqual(ids(fresh), 'perfect');
  resetGlobals();
  A.markPerfectRun(false); // 反例:未标记
  assert.strictEqual(A.checkAchievements().length, 0);
});

// ---------- 附加验证 ----------
run('A. 零状态不解锁任何成就', () => {
  resetGlobals();
  assert.strictEqual(A.checkAchievements().length, 0);
});
run('B. rankRank 全量对照(SSS=5..C=0,未知=0)', () => {
  assert.strictEqual(A.rankRank('SSS'), 5);
  assert.strictEqual(A.rankRank('SS'), 4);
  assert.strictEqual(A.rankRank('S'), 3);
  assert.strictEqual(A.rankRank('A'), 2);
  assert.strictEqual(A.rankRank('B'), 1);
  assert.strictEqual(A.rankRank('C'), 0);
  assert.strictEqual(A.rankRank('X'), 0);
  assert.strictEqual(A.rankRank(undefined), 0);
});
run('C. 定义完整性:12 条且 id 唯一', () => {
  assert.strictEqual(A.ACHIEVEMENT_COUNT, 12);
  assert.strictEqual(A.ACHIEVEMENT_DEFS.length, 12);
  const idset = new Set(A.ACHIEVEMENT_DEFS.map(d => d.id));
  assert.strictEqual(idset.size, 12);
});
run('D. findAchievement 命中/未命中', () => {
  assert.strictEqual(A.findAchievement('combo50').name, '连击风暴');
  assert.strictEqual(A.findAchievement('nope'), null);
});
run('E. unlockAchievements 写入存档并返回新列表', () => {
  resetGlobals({ totalKills: 1 });
  const fresh = A.unlockAchievements();
  assert.strictEqual(ids(fresh), 'first_kill');
  assert.deepStrictEqual(global.save.achievements, ['first_kill']);
  // 幂等:二次调用不再返回
  assert.strictEqual(A.unlockAchievements().length, 0);
  assert.deepStrictEqual(global.save.achievements, ['first_kill']);
});
run('F. 存档无 achievements 字段时自动兜底', () => {
  resetGlobals({ totalKills: 1, achievements: undefined });
  const fresh = A.unlockAchievements();
  assert.strictEqual(ids(fresh), 'first_kill');
  assert.ok(Array.isArray(global.save.achievements));
});
run('G. unlock 后 _perfectRun 复位', () => {
  resetGlobals();
  A.markPerfectRun(true);
  assert.strictEqual(A.unlockAchievements().length, 1); // perfect
  assert.strictEqual(A.unlockAchievements().length, 0); // 已解锁且已复位
  resetGlobals({ achievements: ['perfect'] });
  A.markPerfectRun(true);
  assert.strictEqual(A.unlockAchievements().length, 0); // 已解锁不重复,标志仍复位
});
run('H. checkAchievements 不写存档(纯检查)', () => {
  resetGlobals({ totalKills: 1 });
  A.checkAchievements();
  assert.strictEqual(global.save.achievements, undefined);
});
run('I. toastAchievement 调用 addToast 正确参数', () => {
  resetGlobals();
  const def = A.findAchievement('combo50');
  A.toastAchievement(def);
  assert.strictEqual(toastCalls.length, 1);
  assert.deepStrictEqual(toastCalls[0], { text: '成就解锁: 连击风暴', color: '#ffd166', size: 15 });
});

// ---------- 汇总 ----------
console.log('========================================');
console.log('成就系统 mock 测试结果');
console.log('========================================');
const pad = s => String(s).padEnd(48, ' ');
for (const r of rows) console.log('  ' + pad(r.name) + r.结果);
console.log('----------------------------------------');
console.log(`合计:${rows.length} 项,PASS ${pass} / FAIL ${fail}`);
process.exitCode = fail > 0 ? 1 : 0;
