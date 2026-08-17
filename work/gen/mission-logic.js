// ============================================================
// 《苍穹之翼·单机空战》新任务类型逻辑函数
// 文件:work/gen/mission-logic.js —— 纯 JS 代码片段(无 HTML 标签、无 ES module 语句)
//
// 覆盖 3 种新任务类型:
//   intercept —— 限时拦截:timeLimit 内击杀 targetKills 架敌机
//   survive   —— 生存坚守:duration 秒内顶住波次递增的围攻
//   race      —— 极速竞逐:timeLimit 内按序飞越全部 checkpoints
//
// 本文件只调用主文件已有的全局函数/变量:
//   spawnWave / addText / addToast / dist / enemies / player / GAME / mission
//   (均在 outputs/skyfire-aces.html 中定义,未重新定义任何主文件函数)
//
// 集成方式(由总控负责):
//   1) startMission 中按 def.type 调用对应 start*(在现有关卡初始化之后);
//   2) updateMission 中按 mission.def.type 调用对应 update*(在现有 escort/boss 逻辑旁);
//      注意:intercept/survive/race 三种类型下不要调用主文件 updateMissionSpawn,
//      否则会重复刷怪;
//   3) drawHUD 中调用 missionTimerText(),返回值非空则绘制在屏幕顶部中央(黄色 16px)。
//
// 完成/失败流转:
//   - 置 m.complete = true → 主文件 updateMission 自动走完成流程
//     (pendingState='complete' → finishMission(true));
//   - 置 m.failed = true → 主文件只标记 failedShown,不会自动切 gameover!
//     主文件中 mission.failed 仅由运输机死亡设置(同时设置 pendingState='gameover')。
//     因此总控需在 updateMission 中补一个钩子:检测 mission.failed 且
//     GAME.pendingState === null 时,设置 GAME.pendingState='gameover'、
//     GAME.pendingTimer=1.0,否则超时失败会卡在 playing 状态。
//     玩家坠毁仍由主文件 killPlane 处理,无需本文件干预。
//
// Node 环境自检支持:浏览器中 typeof module === 'undefined',此分支不执行。
// ============================================================

// ---------- HUD 计时文本 ----------
// 返回 HUD 字符串;非 intercept/survive/race 类型返回 null(总控据此决定是否绘制)。
// intercept → '剩余 {s}s 目标 {k}/{targetKills}'
// survive   → '坚守 {remaining}s'
// race      → '检查点 {i}/{n} 剩余 {s}s'
function missionTimerText() {
  if (!mission || !mission.def) return null;
  const def = mission.def;
  const type = def.type;
  if (type === 'intercept') {
    const remain = Math.max(0, Math.ceil((def.timeLimit || 0) - GAME.missionTime));
    return '剩余 ' + remain + 's 目标 ' + GAME.kills + '/' + def.targetKills;
  }
  if (type === 'survive') {
    const remain = Math.max(0, Math.ceil((def.duration || 0) - GAME.missionTime));
    return '坚守 ' + remain + 's';
  }
  if (type === 'race') {
    const n = (def.checkpoints || []).length;
    const i = Math.min((mission.raceIndex || 0) + 1, n);
    const remain = Math.max(0, Math.ceil((def.timeLimit || 0) - GAME.missionTime));
    return '检查点 ' + i + '/' + n + ' 剩余 ' + remain + 's';
  }
  return null;
}

// ---------- intercept 限时拦截 ----------
// 初始化:预刷首波,mission.spawned 按首波数量预置
// (参照主文件 startMission 中 boss 关的预置方式:spawnAce() 后 mission.spawned = 5)。
function startIntercept(m) {
  const waves = m.def.waves || [];
  m.spawned = 0;
  m.waveIndex = 0;
  m.waveTimer = 0.8;
  m.aliveTotal = 0;
  if (waves.length > 0) {
    const first = waves[0];
    spawnWave(first);
    m.spawned = first.length;
    m.waveIndex = 1;
  }
}

// 波次生成:场上存活敌机 < 4 且 waveTimer <= 0 时刷下一波(节奏与主文件 updateMissionSpawn 类似);
// 击杀数达到 targetKills → m.complete = true(主文件 updateMission 会走完成流程);
// 剩余时间 ≤ 0 且未完成 → m.failed = true。
function updateIntercept(m, dt) {
  if (!m || m.complete || m.failed) return;
  m.waveTimer -= dt;
  m.aliveTotal = enemies.filter(e => !e.dead).length;
  const waves = m.def.waves || [];
  if (m.waveIndex < waves.length && m.aliveTotal < 4 && m.waveTimer <= 0) {
    const kinds = waves[m.waveIndex];
    spawnWave(kinds);
    m.spawned += kinds.length;
    m.waveIndex++;
    m.waveTimer = 4;
  }
  if (GAME.kills >= m.def.targetKills) {
    m.complete = true;
    return;
  }
  if (GAME.missionTime >= (m.def.timeLimit || 0)) {
    m.failed = true;
  }
}

// ---------- survive 生存坚守 ----------
// 初始化:清零波次状态,首波在 1 秒内到来。
function startSurvive(m) {
  m.spawned = 0;
  m.waveIndex = 1;
  m.waveTimer = 1.0;
  m.aliveTotal = 0;
}

// 每 12s 一波;第 N 波强度 = 2 + ceil(N * 0.8) 架;
// 类型随 N 升级:初期(N<=2)以 fighter 为主,中期(N 3~5)加入 gunner,后期(N>=6)加入 bomber;
// duration 倒数 ≤ 0 → m.complete = true;玩家坠毁由主文件现有流程处理。
function updateSurvive(m, dt) {
  if (!m || m.complete || m.failed) return;
  m.waveTimer -= dt;
  m.aliveTotal = enemies.filter(e => !e.dead).length;
  if (m.waveTimer <= 0) {
    const N = m.waveIndex;
    const count = 2 + Math.ceil(N * 0.8);
    const kinds = [];
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      if (N >= 6 && r < 0.28) kinds.push('bomber');
      else if (N >= 3 && r < 0.62) kinds.push('gunner');
      else kinds.push('fighter');
    }
    spawnWave(kinds);
    m.spawned += kinds.length;
    m.waveIndex++;
    m.waveTimer = 12;
    addText(player.x, player.y - 70, '第 ' + (m.waveIndex - 1) + ' 波来袭', '#ffd166', 18);
  }
  if (GAME.missionTime >= (m.def.duration || 0)) {
    m.complete = true;
  }
}

// ---------- race 极速竞逐 ----------
// 初始化:raceIndex = 0;检查点从 m.def.checkpoints 取。
function startRace(m) {
  m.raceIndex = 0;
  m.spawned = 0;
  m.waveTimer = 0;
  m.aliveTotal = 0;
}

// 玩家与当前检查点距离 < 380 → 通过并推进(addToast 提示);
// 全部通过 → m.complete = true;剩余时间 ≤ 0 → m.failed = true。
function updateRace(m, dt) {
  if (!m || m.complete || m.failed) return;
  const cps = m.def.checkpoints || [];
  const n = cps.length;
  if (n === 0) {
    m.complete = true;
    return;
  }
  if (m.raceIndex < n) {
    const cp = cps[m.raceIndex];
    if (dist(player.x, player.y, cp.x, cp.y) < 380) {
      m.raceIndex++;
      addToast('检查点 ' + m.raceIndex + '/' + n + ' 通过', '#ffd166', 18);
      if (m.raceIndex >= n) {
        m.complete = true;
        return;
      }
    }
  }
  if (GAME.missionTime >= (m.def.timeLimit || 0)) {
    m.failed = true;
  }
}

// ---------- Node 环境自检支持(浏览器中不执行) ----------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    missionTimerText,
    startIntercept, updateIntercept,
    startSurvive, updateSurvive,
    startRace, updateRace
  };
}
