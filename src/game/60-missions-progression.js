// ---------- mission logic ----------
const MISSION_DEFS = [
  // ---------- 第 1 章:黎明防线 ----------
  {
    index: 1, code: 'OPERATION FIRST LIGHT', name: '黎明扫荡', theme: 'day', seed: 1121,
    brief: '敌方“铁旗”中队正在近海集结，试图封锁我方航道。升空击坠全部敌机，夺回制空权。',
    objective: '击坠全部敌机',
    total: 11,
    waves: [
      ['fighter', 'fighter', 'fighter'],
      ['fighter', 'fighter', 'gunner'],
      ['fighter', 'gunner', 'gunner'],
      ['bomber', 'fighter', 'fighter']
    ],
    timeBonus: 340,
    type: 'clear', chapter: 1
  },
  {
    index: 2, code: 'OPERATION IRON BIRD', name: '护航行动', theme: 'sunset', seed: 2307,
    brief: '我方运输机“铁鸟”载着整队飞行员撤离战区。护卫它穿越敌方拦截，安全抵达东侧补给线。',
    objective: '护送铁鸟运输机抵达补给线',
    escort: true,
    total: 13,
    waves: [
      ['fighter', 'fighter'],
      ['fighter', 'gunner', 'fighter'],
      ['bomber', 'fighter'],
      ['fighter', 'fighter', 'gunner', 'gunner'],
      ['bomber', 'fighter', 'fighter']
    ],
    timeBonus: 420,
    type: 'escort', chapter: 1
  },
  {
    index: 3, code: 'OPERATION CRIMSON GALE', name: '赤色风暴', theme: 'storm', seed: 5519,
    brief: '风暴中心，敌王牌“绯红彗星”亲自升空。突破其护卫编队，终结这位不败的指挥官。',
    objective: '击落敌王牌 绯红彗星',
    boss: true,
    total: 5,
    waves: [['fighter']],
    timeBonus: 520,
    type: 'boss', chapter: 1
  },

  // ---------- 第 2 章:深海裂谷 ----------
  {
    index: 4, code: 'OPERATION THUNDERSTRIKE', name: '雷霆拦截', theme: 'storm', seed: 4407,
    brief: '雷暴云层遮蔽整片空域，敌“猎隼”截击中队趁乱突防，直扑我方雷达枢纽。在它们突破防线之前，击落足够多的敌机！',
    objective: '限时击坠 14 架敌机',
    type: 'intercept', chapter: 2,
    timeLimit: 100, targetKills: 14,
    total: 16,
    waves: [
      ['fighter', 'fighter'],
      ['fighter', 'gunner'],
      ['gunner', 'fighter', 'gunner'],
      ['fighter', 'fighter', 'gunner'],
      ['gunner', 'fighter', 'gunner', 'fighter'],
      ['fighter', 'gunner']
    ],
    timeBonus: 320
  },
  {
    index: 5, code: 'OPERATION LAST STAND', name: '孤岛坚守', theme: 'night', seed: 7712,
    brief: '夜幕降临，孤岛基地的雷达站是整片海域最后的通信节点。敌军将发起持续围攻，坚守 90 秒，直到援军抵达！',
    objective: '坚守 90 秒',
    type: 'survive', chapter: 2,
    duration: 90,
    total: 48,
    timeBonus: 420
  },
  {
    index: 6, code: 'OPERATION ABYSS EYE', name: '深渊之眼', theme: 'night', seed: 6603,
    brief: '深海裂谷中升起不明信号——敌军秘密兵器“深渊之眼”正在苏醒。突破无人机群的封锁，摧毁这柄深海利刃！',
    objective: '击落 BOSS 深渊之眼',
    boss: true, bossKind: 'eye',
    total: 5,
    waves: [['drone', 'drone']],
    timeBonus: 480,
    type: 'boss', chapter: 2
  },

  // ---------- 第 3 章:风暴尽头 ----------
  {
    index: 7, code: 'OPERATION SPEED STORM', name: '极速竞逐', theme: 'day', seed: 9024,
    brief: '第三舰队急需最快的信使穿越风暴航线。在时限内通过全部 5 个检查点，向敌军证明苍穹之翼的速度！',
    objective: '75 秒内通过全部 5 个检查点',
    type: 'race', chapter: 3,
    timeLimit: 75,
    total: 0,
    checkpoints: [
      { x: 1500, y: 1000 },
      { x: 3400, y: 800 },
      { x: 5600, y: 1600 },
      { x: 4600, y: 3400 },
      { x: 6600, y: 4600 }
    ],
    timeBonus: 380
  },
  {
    index: 8, code: 'OPERATION ARK CONVOY', name: '方舟护航', theme: 'storm', seed: 1187,
    brief: '风暴将至，满载补给的运输机“方舟一号”“方舟二号”正穿越雷暴空域。敌军截击机群倾巢而出，务必护送双机安全抵达补给线！',
    objective: '护送双运输机抵达补给线',
    escort: true, escortCount: 2,
    total: 16,
    waves: [
      ['fighter', 'fighter'],
      ['gunner', 'gunner'],
      ['fighter', 'bomber'],
      ['gunner', 'fighter', 'fighter'],
      ['bomber', 'gunner'],
      ['fighter', 'gunner', 'fighter'],
      ['bomber', 'fighter']
    ],
    timeBonus: 460,
    type: 'escort', chapter: 3
  },
  {
    index: 9, code: 'OPERATION FINAL MONARCH', name: '终焉之王', theme: 'night', seed: 3345,
    brief: '战争的尽头，敌国最后的王牌“终焉之王”亲临战场。击穿拦截机群的重重封锁，为这场战争画上句号！',
    objective: '击落 BOSS 终焉之王',
    boss: true, bossKind: 'king',
    total: 7,
    waves: [['interceptor']],
    timeBonus: 600,
    type: 'boss', chapter: 3
  }
];

function spawnEyeBoss() {
  const p = spawnPointAround(player.x, player.y, 950, 1150);
  const e = makeEnemy('eye', p.x, p.y);
  e.phase = 1;
  enemies.push(e);
  mission.boss = e;
  addToast('深渊之眼 来袭', '#ff8a80', 18);
}

function spawnKingBoss() {
  const p = spawnPointAround(player.x, player.y, 950, 1150);
  const e = makeEnemy('king', p.x, p.y);
  e.phase = 1;
  enemies.push(e);
  mission.boss = e;
  addToast('终焉之王 来袭', '#ff5e5e', 18);
}

function startMission(index, mode) {
  GAME.mode = mode || 'campaign';
  upgradeChoice = null;
  upgradeChoiceSel = 0;
  input.missileAuto = false;
  GAME.missionIndex = index;
  // P39: 战役任务尝试计数(会话内存态,不写存档;任务成功时清零)
  if (GAME.mode !== 'endless') {
    GAME.missionAttempts = GAME.missionAttempts || {};
    GAME.missionAttempts[index] = (GAME.missionAttempts[index] || 0) + 1;
  }
  GAME.time = 0;
  GAME.missionTime = 0;
  GAME.score = 0;
  GAME.kills = 0;
  GAME.shotsFired = 0;
  GAME.shotsHit = 0;
  GAME.damageTaken = 0;
  GAME.hintTimer = 12;
  GAME.pendingState = null;
  GAME.pendingTimer = 0;
  GAME.freezeTimer = 0;
  GAME.reviveCount = 0; GAME.revivesUsed = 0; GAME.unlimitedRevive = true;
  bullets = []; missiles = []; particles = []; pickups = []; enemies = []; allies = [];
  const def = MISSION_DEFS[index];
  generateWorld(def.theme, def.seed);
  ensureRenderCache(world.theme);
  player.x = world.W / 2;
  player.y = world.H / 2;
  player.heading = -Math.PI / 2;
  player.speed = 200;
  player.hp = player.maxHp;
  player.missiles = player.maxMissiles;
  player.throttle = 0.68;
  player.altitude = 3500;   // 开局重置高度(任务书 19)
  player.target = null; player.lock = 0;
  player.alive = true; player.dead = false; player.invuln = 1;
  player.rollActive = false; player.rollT = 0; player.rollDir = 0; player.rollCd = 0;
  player.lastDirTap = { dir: null, t: -99 };
  player.dashActive = false; player.dashT = 0; player.dashCd = 0; player.dashPressed = false;
  player.contactCd = 0;   // 接触冷却重置(任务书 31: 重开/新任务)
  player.weapon = defaultWeapon();
  applyPlaneSetup();
  GAME.exp = 0; GAME.level = 1; GAME.combo = 0; GAME.comboTimer = 0;
  GAME.upgrades = {}; GAME.weapons = []; GAME.weaponCopies = {}; GAME.pendingBuffChoices = 0;
  GAME.dash = null; GAME.synth = {}; upgradeChoice = null;
  player.buffs = {};
  cam.x = player.x; cam.y = player.y; cam.shake = 0; cam.zoom = 1;

  mission = {
    def, index, escort: !!def.escort, boss: !!def.boss,
    spawned: 0, aliveTotal: 0, total: def.total,
    waveIndex: 0, waveTimer: 0.8,
    transport: null, escortDone: false, failed: false,
    bossKilled: false, complete: false
  };
  if (def.escort) spawnTransport();
  if (def.boss) {
    if (def.bossKind === 'eye') spawnEyeBoss();
    else if (def.bossKind === 'king') spawnKingBoss();
    else spawnAce();
    mission.spawned = 5;
  }
  if (def.type === 'intercept') startIntercept(mission);
  else if (def.type === 'survive') startSurvive(mission);
  else if (def.type === 'race') startRace(mission);
  if (typeof ChapterCard !== 'undefined' && (def.chapter || 0) > save.chapterCleared && GAME.mode === 'campaign') ChapterCard.start(def.chapter);
  setState('playing');
  prewarmRender();
}

function startEndless() {
  GAME.mode = 'endless';
  upgradeChoice = null;
  upgradeChoiceSel = 0;
  input.missileAuto = false;
  GAME.missionIndex = 0;
  GAME.time = 0; GAME.missionTime = 0;
  GAME.score = 0; GAME.kills = 0;
  GAME.shotsFired = 0; GAME.shotsHit = 0;
  GAME.damageTaken = 0; GAME.hintTimer = 12;
  GAME.pendingState = null; GAME.pendingTimer = 0; GAME.freezeTimer = 0;
  GAME.reviveCount = 3; GAME.revivesUsed = 0; GAME.unlimitedRevive = false;
  bullets = []; missiles = []; particles = []; pickups = []; enemies = []; allies = [];
  generateWorld(pick(['day', 'sunset', 'night']), Math.floor(Math.random() * 99999));
  ensureRenderCache(world.theme);
  player.x = world.W / 2; player.y = world.H / 2;
  player.heading = -Math.PI / 2; player.speed = 200;
  player.hp = player.maxHp; player.missiles = player.maxMissiles;
  player.throttle = 0.68; player.altitude = 3500; player.target = null; player.lock = 0;
  player.alive = true; player.dead = false; player.invuln = 1;
  player.rollActive = false; player.rollT = 0; player.rollDir = 0; player.rollCd = 0;
  player.lastDirTap = { dir: null, t: -99 };
  player.dashActive = false; player.dashT = 0; player.dashCd = 0; player.dashPressed = false;
  player.contactCd = 0;   // 接触冷却重置(任务书 31: 重开/新任务)
  player.weapon = defaultWeapon();
  applyPlaneSetup();
  GAME.exp = 0; GAME.level = 1; GAME.combo = 0; GAME.comboTimer = 0;
  GAME.upgrades = {}; GAME.weapons = []; GAME.weaponCopies = {}; GAME.pendingBuffChoices = 0;
  GAME.dash = null; GAME.synth = {}; upgradeChoice = null;
  player.buffs = {};
  cam.x = player.x; cam.y = player.y; cam.shake = 0; cam.zoom = 1;
  mission = {
    def: { index: 0, code: 'ENDLESS SORTIE', name: '自由出击', theme: 'night', objective: '存活越久，击坠越多' },
    index: 0, escort: false, boss: false,
    spawned: 0, aliveTotal: 0, total: 999999,
    waveIndex: 1, completedWaves: 0, wavePhase: 'intermission', waveTimer: 0,
    bossHistory: [], waveEliteKinds: [],
    transport: null, escortDone: false, failed: false, bossKilled: false, complete: false,
    endless: true
  };
  spawnEndlessWave(1);
  setState('playing');
  prewarmRender();
}

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

const ENDLESS_BOSS_KINDS = ['ace', 'eye', 'king'];
const ENDLESS_BOSS_NAMES = { ace: '绯红彗星', eye: '深渊之眼', king: '终焉之王' };

function endlessBossHistoryGroups(wave, history) {
  const source = Array.isArray(history) ? history : ((mission && mission.bossHistory) || []);
  const completedGroups = Math.min(
    Math.floor((Math.max(1, wave) - 1) / 5),
    Math.floor(source.length / 5)
  );
  const groups = [];
  for (let groupIndex = 0; groupIndex < completedGroups; groupIndex++) {
    const start = groupIndex * 5;
    const group = source.slice(start, start + 5).filter(kind => ENDLESS_BOSS_KINDS.includes(kind));
    if (group.length === 5) groups.push(group);
  }
  return groups;
}

function selectEndlessEliteKinds(wave, history) {
  return endlessBossHistoryGroups(wave, history).map(group => pick(group));
}

function endlessWaveKinds(wave) {
  const lv = GAME.level;
  const count = Math.min(26, 1 + Math.ceil(wave * 0.85) + Math.floor(lv / 12) + (lv > 60 ? 3 : 0));
  const kinds = [];
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    if (r < 0.48) kinds.push('fighter');
    else if (r < 0.76) kinds.push('gunner');
    else kinds.push('bomber');
  }
  return kinds;
}

function spawnEndlessElite(kind, wave) {
  const p = spawnPointAround(player.x, player.y, 850, 1250);
  const e = makeEnemy(kind, p.x, p.y);
  const scale = Math.min(0.58, 0.3 + Math.max(0, wave - 6) * 0.015);
  e.hp = Math.max(1, Math.round(e.hp * scale));
  e.maxHp = e.hp;
  e.score = Math.max(1, Math.round(e.score * 0.4));
  e.exp = Math.max(1, Math.round(e.exp * 0.4));
  e.eliteMinion = true;
  e.entered = true;
  e.phase = 1;
  e.heading = angleTo(e.x, e.y, player.x, player.y);
  enemies.push(e);
  return e;
}

function spawnEndlessWave(wave) {
  if (!mission || !mission.endless) return;
  mission.waveIndex = Math.max(1, wave);
  mission.wavePhase = 'mobs';
  mission.waveTimer = 0;
  mission.boss = null;
  mission.bossKilled = false;
  const kinds = endlessWaveKinds(mission.waveIndex);
  spawnWave(kinds);
  const eliteKinds = selectEndlessEliteKinds(mission.waveIndex);
  mission.waveEliteKinds = eliteKinds.slice();
  eliteKinds.forEach((kind, groupIndex) => {
    const elite = spawnEndlessElite(kind, mission.waveIndex);
    elite.eliteHistoryGroup = groupIndex + 1;
  });
  mission.spawned += kinds.length + eliteKinds.length;
  mission.aliveTotal = enemies.filter(e => !e.dead).length;
  addText(player.x, player.y - 70, '第 ' + mission.waveIndex + ' 波来袭', '#ffd166', 18);
  if (typeof MusicSys !== 'undefined' && MusicSys.play && GAME.state === 'playing') MusicSys.play('combat');
}

function spawnEndlessBoss(wave) {
  if (!mission || !mission.endless || mission.wavePhase === 'boss') return;
  const waveNumber = Math.max(1, wave);
  mission.bossHistory = mission.bossHistory || [];
  const historyIndex = waveNumber - 1;
  const kind = mission.bossHistory[historyIndex] || ENDLESS_BOSS_KINDS[historyIndex % ENDLESS_BOSS_KINDS.length];
  const p = spawnPointAround(player.x, player.y, 950, 1150);
  const e = makeEnemy(kind, p.x, p.y);
  const kindScale = { ace: 0.9, eye: 0.58, king: 0.48 }[kind] || 1;
  const waveScale = 1 + Math.max(0, wave - 1) * 0.12;
  e.hp = Math.max(1, Math.round(e.hp * kindScale * waveScale));
  e.maxHp = e.hp;
  e.score = Math.max(1, Math.round(e.score * (0.8 + wave * 0.08)));
  e.exp = Math.max(1, Math.round(e.exp * (0.8 + wave * 0.08)));
  e.isWaveBoss = true;
  e.waveNumber = wave;
  e.phase = 1;
  e.heading = angleTo(e.x, e.y, player.x, player.y);
  enemies.push(e);
  mission.boss = e;
  mission.bossHistory[historyIndex] = kind;
  mission.bossKilled = false;
  mission.wavePhase = 'boss';
  mission.aliveTotal = enemies.filter(x => !x.dead).length;
  addToast('第 ' + wave + ' 波 Boss · ' + ENDLESS_BOSS_NAMES[kind] + ' 来袭', '#ff8a80', 18);
  if (typeof MusicSys !== 'undefined' && MusicSys.play) MusicSys.play('boss');
}

function finishEndlessWaveReward() {
  if (!mission || !mission.endless || mission.wavePhase !== 'reward') return false;
  mission.completedWaves = Math.max(mission.completedWaves || 0, mission.waveIndex);
  mission.waveIndex++;
  mission.wavePhase = 'intermission';
  mission.waveTimer = 0.9;
  mission.boss = null;
  mission.bossKilled = false;
  player.missiles = Math.min(player.maxMissiles, player.missiles + 8);
  addText(player.x, player.y - 70, '整备完成 · 下一波即将来袭', '#7ee787', 17);
  if (typeof MusicSys !== 'undefined' && MusicSys.play) MusicSys.play('combat');
  return true;
}

function updateEndlessWave(dt) {
  mission.aliveTotal = enemies.filter(e => !e.dead).length;
  if (mission.wavePhase === 'mobs') {
    if (mission.aliveTotal === 0) {
      mission.wavePhase = 'bossPending';
      mission.waveTimer = 0.8;
      addText(player.x, player.y - 70, '高威胁目标正在接近', '#ff8a80', 17);
    }
    return;
  }
  if (mission.wavePhase === 'bossPending') {
    mission.waveTimer -= dt;
    if (mission.waveTimer <= 0) spawnEndlessBoss(mission.waveIndex);
    return;
  }
  if (mission.wavePhase === 'boss') {
    if (mission.boss && (mission.boss.dead || mission.bossKilled)) {
      for (const e of enemies) {
        if (e !== mission.boss && !e.dead) e.dead = true;
      }
      enemies = enemies.filter(e => e === mission.boss || !e.dead);
      mission.aliveTotal = 0;
      mission.wavePhase = 'reward';
      mission.completedWaves = Math.max(mission.completedWaves || 0, mission.waveIndex);
      showWeaponRewardChoice(mission.waveIndex);
    }
    return;
  }
  if (mission.wavePhase === 'reward') {
    if (!upgradeChoice) showWeaponRewardChoice(mission.waveIndex);
    return;
  }
  if (mission.wavePhase === 'intermission') {
    mission.waveTimer -= dt;
    if (mission.waveTimer <= 0) spawnEndlessWave(mission.waveIndex);
  }
}


function updateMissionSpawn(dt) {
  if (!mission || mission.complete || mission.failed) return;
  if (mission.def && (mission.def.type === 'intercept' || mission.def.type === 'survive' || mission.def.type === 'race')) return;
  if (mission.endless) {
    updateEndlessWave(dt);
    return;
  }
  mission.waveTimer -= dt;
  mission.aliveTotal = enemies.filter(e => !e.dead).length;
  const def = mission.def;
  if (mission.spawned < def.total && mission.aliveTotal < 4 && mission.waveTimer <= 0) {
    if (mission.boss) {
      if (!mission.bossKilled) spawnWave(['fighter']);
      mission.spawned++;
      mission.waveTimer = 12;
    } else {
      const kinds = def.waves[Math.min(mission.waveIndex, def.waves.length - 1)];
      spawnWave(kinds);
      mission.spawned += kinds.length;
      mission.waveIndex++;
      mission.waveTimer = 4;
    }
  }
  if (mission.escort && mission.transport && !mission.escortDone && mission.waveTimer > 0 && mission.aliveTotal < 2) {
    mission.waveTimer = Math.min(mission.waveTimer, 1.4);
  }
  if (mission.escortDone && mission.transport) {
    mission.complete = true;
  }
  if (!mission.escort && !mission.boss && mission.spawned >= def.total && mission.aliveTotal === 0) {
    mission.complete = true;
  }
  if (mission.boss && mission.bossKilled) {
    mission.complete = true;
    for (const e of enemies) if (!e.dead) e.retreat = true;
  }
}

function updateMission(dt) {
  if (GAME.freezeTimer > 0) {
    GAME.freezeTimer -= dt;
    if (GAME.freezeTimer <= 0 && GAME.pendingState) {
      finishMission(GAME.pendingState === 'gameover' ? false : true);
    }
  }
  if (!mission) return;
  if (GAME.state === 'playing' && !mission.complete && !mission.failed) {
    GAME.missionTime += dt;
  }
  if (mission.escort && mission.transport && !mission.transport.dead && !mission.escortDone) {
    updateTransport(dt);
  }
  if (mission.def && mission.def.type === 'intercept') updateIntercept(mission, dt);
  else if (mission.def && mission.def.type === 'survive') updateSurvive(mission, dt);
  else if (mission.def && mission.def.type === 'race') updateRace(mission, dt);
  if (mission.complete && !mission.completeShown) {
    mission.completeShown = true;
    GAME.pendingState = 'complete';
    GAME.pendingTimer = 1.8;
  }
  if (mission.failed && !mission.failedShown) {
    mission.failedShown = true;
    if (!GAME.pendingState) { GAME.pendingState = 'gameover'; GAME.pendingTimer = 1.6; GAME.freezeTimer = 1.0; }
  }
}

// ============================================================
// 《苍穹之翼·单机空战》正式结算评级系统
// 文件:work/gen/rating.js —— 纯 JS 代码片段(无 <script>/HTML 标签、无 import/export)
//
// 产出(供总控集成,本文件不修改主文件 outputs/skyfire-aces.html):
//   computeRating(stats)  评级计算纯函数:0-100 分 + SSS/SS/S/A/B/C + 分项明细
//   RANK_COLORS           评级颜色表(SSS 最高 → C 最低)
//   RANK_COMMENT          评级徽章文案
//   RANK_ORDER            评级等级序(SSS=6 … C=1,供存档 bestRank 比较)
//   drawRatingPanel(s)    结算页评级面板绘制(失败结算自动不绘制)
//   ratingRoundRect       内部圆角路径辅助(自包含,不依赖主文件 roundRect)
//
// 集成方式(由总控负责):
//   1) finishMission(success) 成功分支,替换原有简易 rank 计算:
//        const acc = GAME.shotsFired > 0 ? GAME.shotsHit / GAME.shotsFired : 0;
//        GAME.endStats.rating = computeRating({
//          missionTime: GAME.missionTime,
//          damageTaken: GAME.damageTaken,
//          maxCombo: GAME.maxCombo || 0,
//          accuracy: acc
//          // 可选: shotsFired: GAME.shotsFired —— 见下方"命中分说明"
//        });
//        GAME.endStats.rank = GAME.endStats.rating.rank;
//   2) registerKillCombo() 内追加一行(maxCombo 追踪):
//        GAME.maxCombo = Math.max(GAME.maxCombo || 0, GAME.combo);
//   3) drawComplete() 中,用 drawRatingPanel(s) 替换原"评级 X"大字母绘制;
//      建议同步把数据行起点 y 由 by+192 下移至 by+206 左右,避免与评级卡片重叠
//      (评级卡片占位:cy=by+104 ~ by+192/240)。
//   4) 存档挂钩(最高评级,等级序 SSS>SS>S>A>B>C):
//        if (RANK_ORDER[rating.rank] > (RANK_ORDER[save.bestRank[idx]] || 0))
//          save.bestRank[idx] = rating.rank;
//
// 命中分说明(任务书 20 起已废除):
//   评级不再计算命中度,accuracy/shotsFired 参数保留在 computeRating 签名但忽略。
//   原逻辑(命中分 = accuracy × 10,未开火按 0.6 基准给 6 分)已删除。
// ============================================================

// ---------- 评级表现常量 ----------

const RANK_COLORS = { SSS: '#ff6b6b', SS: '#ff9f43', S: '#ffd166', A: '#54c7ff', B: '#9be3ff', C: '#aebecd' };

const RANK_COMMENT = {
  SSS: '传说王牌 —— 苍穹之上，无人能敌',
  SS: '天空霸主 —— 无可争议的统治力',
  S: '王牌飞行员 —— 教科书般的发挥',
  A: '优秀 —— 距离王牌只差一步',
  B: '合格 —— 还有上升空间',
  C: '初出茅庐 —— 天空会记住你的成长'
};

// 评级等级序(数值越大评级越高),供存档 bestRank 最高评级比较
const RANK_ORDER = { SSS: 6, SS: 5, S: 4, A: 3, B: 2, C: 1 };

// ---------- 内部辅助(避开主文件已有的 clamp 等全局名) ----------

// 规整为 0-1 区间(容忍 NaN/Infinity/负数/超界)
function ratingClamp01(v) {
  v = Number(v);
  if (!isFinite(v)) return 0;
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

// 圆角矩形路径(与主文件 roundRect 同构;自包含以便 Node 环境测试)
function ratingRoundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- 1. 评级计算(纯函数) ----------
// stats = { missionTime, damageTaken, maxCombo, accuracy[, shotsFired] }
// 权重(任务书 20,去命中度):时间 45% / 损伤 35% / 连击 20%
//   时间分 = clamp(1 - missionTime / 600, 0, 1) × 45   (600 秒 = 10 分钟)
//   损伤分 = clamp(1 - damageTaken / 120, 0, 1) × 35   (累计损伤 120 封顶)
//   连击分 = clamp(maxCombo / 40, 0, 1) × 20           (40 连击封顶)
// 总分四舍五入;阈值:SSS≥95  SS≥85  S≥70  A≥55  B≥40  C<40
// accuracy/shotsFired 参数保留在签名但忽略(任务书 20:评级不计算命中度)
function computeRating(stats, revivesUsed) {
  stats = stats || {};
  revivesUsed = Number(revivesUsed != null ? revivesUsed : stats.revivesUsed);
  const mtRaw = Number(stats.missionTime);
  const dtRaw = Number(stats.damageTaken);
  const mcRaw = Number(stats.maxCombo);
  const mt = isFinite(mtRaw) && mtRaw > 0 ? mtRaw : 0;
  const dt = isFinite(dtRaw) && dtRaw > 0 ? dtRaw : 0;
  const mc = isFinite(mcRaw) && mcRaw > 0 ? mcRaw : 0;

  const timeScore = ratingClamp01(1 - mt / 600) * 45;   // 0-45
  const damageScore = ratingClamp01(1 - dt / 120) * 35; // 0-35
  const comboScore = ratingClamp01(mc / 40) * 20;       // 0-20

  let total = Math.round(timeScore + damageScore + comboScore);
  if (revivesUsed) total = Math.max(0, total - Math.max(0, revivesUsed - 1) * 5);
  let rank = 'C';
  if (total >= 95) rank = 'SSS';
  else if (total >= 85) rank = 'SS';
  else if (total >= 70) rank = 'S';
  else if (total >= 55) rank = 'A';
  else if (total >= 40) rank = 'B';

  const round1 = function (v) { return Math.round(v * 10) / 10; };
  return {
    total: total,
    rank: rank,
    parts: {
      time: round1(timeScore),
      damage: round1(damageScore),
      combo: round1(comboScore)
    }
  };
}

// ---------- 2. 结算页评级面板绘制(独立函数) ----------
// s = GAME.endStats,需含 rating(computeRating 结果对象);
// 失败结算或缺少 rating 时直接返回(不绘制)。
// 布局:结算面板中部深色圆角卡片 = 左侧评级大字母 + 徽章文案,右侧三条分项进度条(任务书 20:去命中);
// 窄屏(cw<380)自动切换为上下堆叠布局。仅依赖全局 ctx/W/H。
function drawRatingPanel(s) {
  if (!s || !s.rating) return;
  const rating = s.rating;
  const rank = RANK_ORDER[rating.rank] ? rating.rank : 'C';
  const color = RANK_COLORS[rank];
  const comment = RANK_COMMENT[rank];
  const parts = rating.parts || {};
  const getScore = function (v) {
    const n = Number(v);
    return isFinite(n) && n > 0 ? n : 0;
  };
  const items = [
    { label: '时间', score: getScore(parts.time), max: 45 },
    { label: '损伤', score: getScore(parts.damage), max: 35 },
    { label: '连击', score: getScore(parts.combo), max: 20 }
  ];

  // 与 drawComplete 一致的外层面板几何(仅依赖全局 W/H)
  const bw = Math.min(560, W * 0.86);
  const bx = W / 2 - bw / 2;
  const by = H * 0.10;
  const pad = 56;
  const cx = bx + pad;
  const cw = bw - pad * 2;
  const cy = by + 104;
  const twoCol = cw >= 380;

  // 深色圆角卡片(风格与 drawComplete 面板一致:深底 + 金色描边)
  ctx.fillStyle = 'rgba(6,14,26,0.92)';
  ctx.strokeStyle = 'rgba(255,209,102,0.4)';
  ctx.lineWidth = 1.5;
  ratingRoundRect(cx, cy, cw, twoCol ? 88 : 152, 10);
  ctx.fill();
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';
  const letterSize = Math.round(Math.min(52, W * 0.075, cw * 0.3));
  const commentLines = [comment.split('——')[0] || '', comment.split('——')[1] || ''];
  commentLines[0] = commentLines[0].trim();
  commentLines[1] = commentLines[1].trim();

  // 评级大字母(用 RANK_COLORS 着色 + 金色阴影,参照 drawComplete 的 rank 绘制)
  ctx.textAlign = 'center';
  ctx.font = '900 ' + letterSize + 'px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(255,180,60,0.65)';
  ctx.shadowBlur = 20;
  ctx.fillText(rank, twoCol ? cx + cw * 0.16 : cx + cw / 2, twoCol ? cy + 48 : cy + 42);
  ctx.shadowBlur = 0;

  // 徽章文案(两行,按" —— "拆分)
  ctx.font = '500 ' + Math.round(Math.min(11, cw * (twoCol ? 0.026 : 0.045))) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#aebecd';
  if (twoCol) {
    ctx.fillText(commentLines[0], cx + cw * 0.16, cy + 66);
    ctx.fillText(commentLines[1], cx + cw * 0.16, cy + 80);
  } else {
    ctx.fillText(commentLines[0], cx + cw / 2, cy + 62);
    ctx.fillText(commentLines[1], cx + cw / 2, cy + 76);
  }

  // 三条分项进度条(时间 0-45 / 损伤 0-35 / 连击 0-20)
  let barX, barW, barH, labelX;
  if (twoCol) {
    barX = cx + cw * 0.38 + 6;
    barW = cw - (barX - cx) - 6;
    barH = 10;
    labelX = barX - 34;
    for (let i = 0; i < items.length; i++) {
      drawRatingBar(items[i], barX, cy + 12 + i * 22, barW, barH, color, labelX);
    }
  } else {
    barX = cx + 40;
    barW = cw - 48;
    barH = 9;
    labelX = cx + 4;
    for (let i = 0; i < items.length; i++) {
      drawRatingBar(items[i], barX, cy + 96 + i * 20, barW, barH, color, labelX);
    }
  }
  ctx.textAlign = 'left';
}

// 单条分项进度条:label + 比例条(roundRect)+ 数值
function drawRatingBar(item, x, y, w, h, color, labelX) {
  const ratio = item.max > 0 ? Math.max(0, Math.min(1, item.score / item.max)) : 0;
  ctx.fillStyle = 'rgba(8,14,22,0.72)';
  ratingRoundRect(x, y, w, h, 3);
  ctx.fill();
  ctx.fillStyle = color;
  ratingRoundRect(x, y, Math.max(0, w * ratio), h, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ratingRoundRect(x, y, w, h, 3);
  ctx.stroke();
  ctx.font = '600 11px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#aebecd';
  ctx.fillText(item.label, labelX, y + h - 2);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(Math.round(item.score)), x + w - 6, y + h - 2);
}

// ---------- Node 环境自检支持(浏览器中不执行;与 work/gen 其他模块同约定) ----------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeRating, RANK_COLORS, RANK_COMMENT, RANK_ORDER, drawRatingPanel };
}


// ============================================================
// 《苍穹之翼·单机空战》成就系统(12 个)
// 文件:work/gen/achievements.js —— 纯 JS 代码片段(无 HTML 标签、无 ES module 语句)
//
// 说明:本文件不修改主文件 outputs/skyfire-aces.html;
//       由总控将本片段并入主 <script>(置于存档/全局定义之后即可)。
//
// 依赖的全局(主文件已有):
//   save             存档对象(save.totalKills/chapterCleared/difficulty/selectedPlane/
//                    bestRank/achievements;achievements 与 bestRank 主文件尚未定义,
//                    本模块自动兜底初始化,不要求主文件预置)
//   GAME             单局状态(GAME.combo/kills/mode/damageTaken)
//   addToast(text,color,size)  屏幕文字提示(主文件 L2176)
//   isPlaneUnlocked(id)        战机解锁判定(主文件 L885,凤凰=通关第二章)
//
// 本文件新增全局(均不与主文件重名):
//   ACHIEVEMENT_DEFS / ACHIEVEMENT_COUNT / findAchievement / rankRank /
//   checkOne / checkAchievements / isUnlocked / unlockAchievements /
//   markPerfectRun / toastAchievement / _perfectRun
//
// 集成方式(由总控负责):
//   1) killPlane(非玩家死亡)后:unlockAchievements() 返回 fresh 数组,
//      逐个 toastAchievement(def) + saveNow()(覆盖 first_kill/ace_100/combo50/endless100);
//   2) finishMission 成功后:更新 save.bestRank 为本次评级最高值,再
//      markPerfectRun(GAME.damageTaken === 0) 然后 unlockAchievements()
//      (覆盖 rank_s/rank_sss/chapter1-3/hard_clear/perfect;随后 saveNow());
//   3) 机库/标题显示成就计数:save.achievements.length + '/' + ACHIEVEMENT_DEFS.length。
//
// Node 环境自检支持:浏览器中 typeof module === 'undefined',导出分支不执行;
//                    node 下 require 本文件可取得全部导出(见 achievements.test.cjs)。
// ============================================================

// ---------- 1. 成就定义(数据) ----------
const ACHIEVEMENT_DEFS = [
  { id: 'first_kill', name: '初出茅庐', desc: '击坠第一架敌机' },
  { id: 'ace_100', name: '百机斩', desc: '累计击坠 100 架敌机' },
  { id: 'rank_s', name: '王牌评价', desc: '任意关卡获得 S 级及以上评级' },
  { id: 'rank_sss', name: '传说评价', desc: '任意关卡获得 SSS 评级' },
  { id: 'chapter1', name: '破晓之翼', desc: '通关第一章' },
  { id: 'chapter2', name: '风暴之海', desc: '通关第二章' },
  { id: 'chapter3', name: '永夜苍穹', desc: '通关第三章·全战役通关' },
  { id: 'combo50', name: '连击风暴', desc: '单局达成 50 连击' },
  { id: 'endless100', name: '无尽猎手', desc: '无尽模式单局击坠 100 架' },
  { id: 'plane_all', name: '机库收藏家', desc: '解锁全部战机(凤凰)' },
  { id: 'hard_clear', name: '地狱难度的勇气', desc: '困难难度通关任意一章' },
  { id: 'perfect', name: '无伤王牌', desc: '任意关卡零损伤通关' }
];
const ACHIEVEMENT_COUNT = ACHIEVEMENT_DEFS.length;

// id → 定义查找
function findAchievement(id) {
  for (const def of ACHIEVEMENT_DEFS) {
    if (def.id === id) return def;
  }
  return null;
}

// ---------- 评级比较辅助 ----------
// SSS=5 SS=4 S=3 A=2 B=1 C=0,未知/缺失返回 0
const RANK_SCORE = { SSS: 5, SS: 4, S: 3, A: 2, B: 1, C: 0 };
function rankRank(r) { return RANK_SCORE[r] ?? 0; }

// ---------- 2. 检测函数(纯函数) ----------
// perfect 成就依赖外部传入的“本次零损伤”标志:总控在 finishMission 成功后
// 调 markPerfectRun(true/false);unlockAchievements() 使用后自动复位。
let _perfectRun = false;
function markPerfectRun(v) { _perfectRun = !!v; }

// 是否已解锁(存档数组兜底:主文件 defaultSave 尚无 achievements 字段)
function isUnlocked(id) {
  return Array.isArray(save.achievements) && save.achievements.includes(id);
}

// 单条成就条件判定(纯函数,不读写存档;字段缺失按 0/未达成处理)
function checkOne(def) {
  switch (def.id) {
    case 'first_kill':  return (save.totalKills || 0) + (GAME.kills || 0) >= 1;
    case 'ace_100':     return (save.totalKills || 0) + (GAME.kills || 0) >= 100;
    case 'rank_s':      return Object.values(save.bestRank || {}).some(r => rankRank(r) >= rankRank('S'));   // S/SS/SSS
    case 'rank_sss':    return Object.values(save.bestRank || {}).some(r => rankRank(r) >= rankRank('SSS')); // 仅 SSS
    case 'chapter1':    return (save.chapterCleared || 0) >= 1;
    case 'chapter2':    return (save.chapterCleared || 0) >= 2;
    case 'chapter3':    return (save.chapterCleared || 0) >= 3;
    case 'combo50':     return (GAME.combo || 0) >= 50;
    case 'endless100':  return GAME.mode === 'endless' && (GAME.kills || 0) >= 100;
    case 'plane_all':   return save.selectedPlane === 'phoenix' || isPlaneUnlocked('phoenix');
    case 'hard_clear':  return save.difficulty === 'hard' && (save.chapterCleared || 0) >= 1;
    case 'perfect':     return _perfectRun === true;
    default:            return false;
  }
}

// 检查当前状态,返回新解锁的成就 def 数组(未解锁且条件满足的);不负责写入存档(总控写)
function checkAchievements() {
  const fresh = [];
  for (const def of ACHIEVEMENT_DEFS) {
    if (!isUnlocked(def.id) && checkOne(def)) fresh.push(def);
  }
  return fresh;
}

// ---------- 3. 解锁表现 ----------
// 总控集成:调用 unlockAchievements() 获取新解锁列表,逐个 toastAchievement(名称) + saveNow()
function unlockAchievements() {
  // 兜底:主文件 defaultSave() 尚无 achievements 字段,首次解锁前自动建数组
  if (!Array.isArray(save.achievements)) save.achievements = [];
  const fresh = [];
  for (const def of ACHIEVEMENT_DEFS) {
    if (!save.achievements.includes(def.id) && checkOne(def)) fresh.push(def);
  }
  for (const def of fresh) save.achievements.push(def.id);
  _perfectRun = false; // 单次结算标志使用后复位
  return fresh; // 总控负责 toast + saveNow
}

// 解锁提示(总控直接调用):复用主文件 addToast(text, color, size)
function toastAchievement(def) {
  addToast('成就解锁: ' + def.name, '#ffd166', 15);
}

// ---------- Node 自检导出(浏览器中 module 不存在,此分支不执行) ----------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ACHIEVEMENT_DEFS, ACHIEVEMENT_COUNT, findAchievement, rankRank,
    checkOne, checkAchievements, isUnlocked, unlockAchievements,
    markPerfectRun, toastAchievement
  };
}


// ============================================================
// 《苍穹之翼·单机空战》章节过场模块(3 章剧情卡片)
// 文件:work/gen/chapter-cards.js —— 纯 JS 代码片段(无 HTML 标签、无 ES module 语句)
//
// 说明:本文件不修改主文件 outputs/skyfire-aces.html,由总控以 <script> 引入。
//       只依赖浏览器全局 ctx / W / H(主文件已有),不引用主文件内部变量。
//
// 对外全局(仅两个,已确认与主文件无冲突):
//   CHAPTER_CARDS —— 3 章过场数据(chapter/code/title/lines)
//   ChapterCard   —— 过场状态机对象,字段 active/chapter/t/phase,
//                    方法 start(chapter) / update(dt) / draw() / isActive() / skip()
//
// 相位时间线(单位:秒):
//   in(渐入 2.0s,黑场 alpha 0→0.92) → hold(停留 2.8s,alpha 0.92)
//   → out(渐出 1.5s,alpha 0.92→0)→ 结束 active=false,总时长 6.3s
//
// 集成契约(由总控负责):
//   1) startMission 中(mission 对象创建后):
//        const ch = def.chapter || 0;
//        if (ch > 0 && ch > save.chapterCleared && GAME.mode === 'campaign') ChapterCard.start(ch);
//   2) update(dt) 的 playing 分支开头:
//        if (ChapterCard.isActive()) { ChapterCard.update(dt); return; }
//      (跳过战斗更新 → missionTime 不增加,过场期间战斗暂停)
//   3) handleCanvasPress 与 handleConfirmKey 开头:
//        if (ChapterCard.isActive()) { ChapterCard.skip(); return true; }  (后者 return 即可)
//   4) draw() 末尾:
//        if (ChapterCard.isActive()) ChapterCard.draw();
//      (盖在最上层)
//
// 音效决策:start() 与自然结束(out 相位结束)时调用 AudioSys.click()(带
//   typeof 守卫,node 测试环境下自动跳过);skip() 保持静默 —— 总控在
//   handleCanvasPress/handleConfirmKey 里通常已有点击音效,避免双重音效。
//
// Node 自检支持:node --check 校验语法;node work/gen/chapter-cards.js
//   直接运行相位时间线自测(含 mock ctx 的 draw() 冒烟测试),失败退出码非 0。
//   浏览器中 typeof module === 'undefined',自检分支不执行。
// ============================================================

const CHAPTER_CARDS = [
  {
    chapter: 1, code: 'CHAPTER I',
    title: '破晓之翼',
    lines: ['海平面升起第一道曙光。', '铁旗中队封锁了近海航道——', '升空，夺回属于我们的天空。']
  },
  {
    chapter: 2, code: 'CHAPTER II',
    title: '风暴之海',
    lines: ['暴风眼深处，母舰的轮廓在闪电中浮现。', '那是一切混乱的源头。', '穿越风暴，击碎它的核心。']
  },
  {
    chapter: 3, code: 'CHAPTER III',
    title: '永夜苍穹',
    lines: ['夜幕之下，最后的王牌在等待。', '他从未败过——直到今天。', '去吧，终结这场永夜。']
  }
];

// IIFE 封装:内部仅持有相位常量与缓动函数,不污染全局
var ChapterCard = (function () {
  // 相位时长(秒)
  var T_IN = 2.0;    // 渐入
  var T_HOLD = 2.8;  // 停留
  var T_OUT = 1.5;   // 渐出
  var MAX_ALPHA = 0.92; // 黑场峰值不透明度
  var FONT_FAMILY = '"Microsoft YaHei"';

  // 状态字段(对外可见,与任务书一致)
  var st = { active: false, chapter: 1, t: 0, phase: 'in' };

  // 缓动:easeOut 用于渐入(快起慢收),easeIn 用于渐出(慢起快收)
  function easeOut(p) { return 1 - Math.pow(1 - p, 3); }
  function easeIn(p) { return p * p * p; }

  function findCard(chapter) {
    for (var i = 0; i < CHAPTER_CARDS.length; i++) {
      if (CHAPTER_CARDS[i].chapter === chapter) return CHAPTER_CARDS[i];
    }
    return CHAPTER_CARDS[0];
  }

  // 当前黑场 alpha:0 → 0.92(渐入)→ 0.92(停留)→ 0(渐出)
  function overlayAlpha() {
    if (st.phase === 'in') return MAX_ALPHA * easeOut(Math.min(1, st.t / T_IN));
    if (st.phase === 'hold') return MAX_ALPHA;
    return MAX_ALPHA * (1 - easeIn(Math.min(1, st.t / T_OUT)));
  }

  function playClick() {
    if (typeof AudioSys !== 'undefined' && AudioSys.click) {
      try { AudioSys.click(); } catch (e) { /* 音效失败不影响过场 */ }
    }
  }

  // 激活过场(总控在 startMission 检测到新章节时调用)
  function start(chapter) {
    var card = findCard(chapter);
    st.active = true;
    st.chapter = card.chapter;
    st.t = 0;
    st.phase = 'in';
    playClick(); // 过场开始音效
  }

  // 推进相位;dt 单位:秒(主文件 update 传入 (t-lastTime)/1000)。
  // while 循环保证一次调用可跨多个相位(如 tab 切回的大 dt 帧),不会漏相位。
  function update(dt) {
    if (!st.active) return;
    st.t += dt;
    var guard = 0;
    while (st.active) {
      if (st.phase === 'in' && st.t >= T_IN) {
        st.t -= T_IN; st.phase = 'hold';
      } else if (st.phase === 'hold' && st.t >= T_HOLD) {
        st.t -= T_HOLD; st.phase = 'out';
      } else if (st.phase === 'out' && st.t >= T_OUT) {
        st.active = false; st.t = 0; st.phase = 'in';
        playClick(); // 过场结束音效
      } else {
        break;
      }
      if (++guard > 8) break; // 防御:任何情况下不无限循环
    }
  }

  // 绘制:全屏黑场 + 章节名(金色大字)+ code + 剧情行(逐行居中,行距 40)
  //      + 底部「按任意键跳过」提示。文字透明度随黑场同淡入淡出。
  // 只依赖 ctx / W / H 与自身数据,不依赖主文件任何内部变量。
  function draw() {
    if (!st.active) return;
    var a = overlayAlpha();
    var card = findCard(st.chapter);
    var cx = W / 2;
    var s = Math.min(W, H);

    // 全屏黑场
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // code(章节编号,金色小字)
    ctx.fillStyle = '#d8b45a';
    ctx.font = '600 ' + Math.max(18, Math.round(s * 0.028)) + 'px ' + FONT_FAMILY;
    ctx.fillText(card.code, cx, H * 0.30);

    // 章节名(金色大字)
    ctx.fillStyle = '#f5c94c';
    ctx.font = '700 ' + Math.max(38, Math.round(s * 0.07)) + 'px ' + FONT_FAMILY;
    ctx.fillText(card.title, cx, H * 0.41);

    // 分隔线(金色细线)
    var lw = Math.max(120, Math.round(s * 0.22));
    ctx.fillStyle = 'rgba(245,201,76,0.55)';
    ctx.fillRect(cx - lw / 2, H * 0.475, lw, 2);

    // 剧情行(逐行居中,行距 40)
    ctx.fillStyle = '#eeeeee';
    ctx.font = '400 ' + Math.max(19, Math.round(s * 0.024)) + 'px ' + FONT_FAMILY;
    var lineY = H * 0.52;
    for (var i = 0; i < card.lines.length; i++) {
      ctx.fillText(card.lines[i], cx, lineY + i * 40);
    }

    // 底部「按任意键跳过」提示(轻微呼吸闪烁,纯数学不依赖外部状态)
    var blink = 0.45 + 0.25 * Math.sin(st.t * 3.2);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = a * Math.max(0.25, blink);
    ctx.font = '400 ' + Math.max(14, Math.round(s * 0.016)) + 'px ' + FONT_FAMILY;
    ctx.fillText('按任意键跳过', cx, H * 0.88);

    ctx.restore();
  }

  function isActive() { return st.active; }

  // 立即结束(总控在 handleCanvasPress 点击或确认键时调用)。
  // 静默设计:总控按键处理本身通常已有点击音效,避免双重音效。
  function skip() {
    if (!st.active) return;
    st.active = false;
    st.t = 0;
    st.phase = 'in';
  }

  return {
    // 状态字段用 getter 实时读取闭包状态,避免镜像字段过期
    get active() { return st.active; },
    get chapter() { return st.chapter; },
    get t() { return st.t; },
    get phase() { return st.phase; },
    start: start,
    update: update,
    draw: draw,
    isActive: isActive,
    skip: skip
  };
})();

// ---------- Node 环境自检支持(浏览器中不执行) ----------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CHAPTER_CARDS: CHAPTER_CARDS, ChapterCard: ChapterCard, runSelfTest: runSelfTest };

  if (require.main === module) {
    var failed = runSelfTest();
    process.exitCode = failed ? 1 : 0;
  }

  function runSelfTest() {
    var failCount = 0;
    // draw() 只依赖全局 ctx/W/H:在 node 下注入模拟环境
    global.W = 1280; global.H = 720;
    global.ctx = makeMockCtx();
    function check(name, cond, extra) {
      var ok = !!cond;
      if (!ok) failCount++;
      console.log((ok ? '  [PASS] ' : '  [FAIL] ') + name + (extra ? ' —— ' + extra : ''));
      return ok;
    }

    console.log('==== 章节过场模块自测 ====');

    // ---- 1. 数据完整性 ----
    console.log('[1] CHAPTER_CARDS 数据');
    check('共 3 章', CHAPTER_CARDS.length === 3, '实际 ' + CHAPTER_CARDS.length);
    var chaptersOk = CHAPTER_CARDS.map(function (c) { return c.chapter; }).join(',') === '1,2,3';
    check('章节号 1/2/3', chaptersOk);
    var dataOk = CHAPTER_CARDS.every(function (c) {
      return c.code && c.title && Array.isArray(c.lines) && c.lines.length === 3 &&
        c.lines.every(function (l) { return typeof l === 'string' && l.length > 0; });
    });
    check('每章 code/title/3 行剧情齐全', dataOk);

    // ---- 2. 相位时间线(期望:in 2.0s → hold 2.8s → out 1.5s,总 6.3s)----
    console.log('[2] 相位时间线(dt=0.01 步进)');
    var T_IN = 2.0, T_HOLD = 2.8, T_OUT = 1.5, T_TOTAL = T_IN + T_HOLD + T_OUT;
    ChapterCard.start(1);
    var tNow = 0, transitions = [], phases = [];
    var phaseRows = [
      { phase: 'in',   expectStart: 0,     expectEnd: T_IN },
      { phase: 'hold', expectStart: T_IN,  expectEnd: T_IN + T_HOLD },
      { phase: 'out',  expectStart: T_IN + T_HOLD, expectEnd: T_TOTAL }
    ];
    var lastPhase = ChapterCard.phase;
    while (ChapterCard.isActive()) {
      ChapterCard.update(0.01);
      tNow += 0.01;
      if (ChapterCard.isActive() && ChapterCard.phase !== lastPhase) {
        transitions.push({ at: +tNow.toFixed(3), from: lastPhase, to: ChapterCard.phase });
        lastPhase = ChapterCard.phase;
      }
    }
    console.log('  相位变化时刻: ' + JSON.stringify(transitions));
    var phaseOk = transitions.length === 2 &&
      transitions[0].from === 'in' && transitions[0].to === 'hold' &&
      Math.abs(transitions[0].at - T_IN) < 0.02 &&
      transitions[1].from === 'hold' && transitions[1].to === 'out' &&
      Math.abs(transitions[1].at - (T_IN + T_HOLD)) < 0.02;
    check('in→hold 于 2.0s', phaseOk, '实际 ' + (transitions[0] ? transitions[0].at : 'N/A') + 's');
    check('hold→out 于 4.8s', phaseOk && transitions[1], '实际 ' + (transitions[1] ? transitions[1].at : 'N/A') + 's');
    check('out 结束于 6.3s 且 active=false', Math.abs(tNow - T_TOTAL) < 0.02 && !ChapterCard.isActive(), '实际 ' + tNow.toFixed(3) + 's');

    // ---- 3. 相位区间表(含每相位端点 alpha 验证)----
    console.log('[3] 相位区间与 alpha 采样(mock ctx)');
    console.log('  | 相位   | 区间(s)        | 期望 alpha(峰值 0.92) | 实际 alpha | 结果 |');
    var rows = [
      { phase: 'in',   t0: 0,         t1: T_IN,        expectAlphaAt0: 0,       expectAlphaAtMid: 0.92 * (1 - Math.pow(1 - 0.5, 3)) },
      { phase: 'hold', t0: T_IN,      t1: T_IN + T_HOLD, expectAlphaAt0: 0.92,  expectAlphaAtMid: 0.92 },
      { phase: 'out',  t0: T_IN + T_HOLD, t1: T_TOTAL, expectAlphaAt0: 0.92,    expectAlphaAtMid: 0.92 * (1 - Math.pow(0.5, 3)) }
    ];

    var rowOk = true;
    for (var r = 0; r < rows.length; r++) {
      // 快进到该相位中段(绝对时间)并采样 draw 的黑场 alpha
      ChapterCard.start(1);
      var tt = rows[r].t0 + (rows[r].t1 - rows[r].t0) / 2;
      var absT = 0;
      for (var s1 = 0; s1 < 1000 && ChapterCard.isActive() && absT + 0.01 <= tt; s1++) {
        ChapterCard.update(0.01);
        absT += 0.01;
      }
      // 用 mock ctx 走一遍 draw,取最后一次全屏黑场 fillRect 的 globalAlpha
      ctx.calls = [];
      ChapterCard.draw();
      var lastRectAlpha = -1;
      for (var c = ctx.calls.length - 1; c >= 0; c--) {
        if (ctx.calls[c].op === 'fillRect' && ctx.calls[c].w === 1280 && ctx.calls[c].h === 720) {
          lastRectAlpha = ctx.calls[c].alpha; break;
        }
      }
      var expMid = rows[r].expectAlphaAtMid;
      var okRow = Math.abs(lastRectAlpha - expMid) < 0.02;
      if (!okRow) rowOk = false;
      console.log('  | ' + rows[r].phase.padEnd(5) + ' | ' + rows[r].t0.toFixed(1) + '–' + rows[r].t1.toFixed(1) + '  | ' +
        expMid.toFixed(3) + '          | ' + lastRectAlpha.toFixed(3) + '    | ' + (okRow ? 'PASS' : 'FAIL') + ' |');
    }
    check('三相位 alpha 采样全部符合 0→0.92→0 曲线', rowOk);

    // ---- 4. draw() 冒烟:黑场盖全屏、文字齐全、不依赖主文件变量 ----
    console.log('[4] draw() 冒烟(mock ctx,W=1280,H=720)');
    ctx.calls = [];
    ChapterCard.start(1);
    ChapterCard.update(1.0); // 进入 in 相位中段
    ChapterCard.draw();
    var texts = ctx.calls.filter(function (x) { return x.op === 'fillText'; }).map(function (x) { return x.text; });
    var rectCount = ctx.calls.filter(function (x) { return x.op === 'fillRect'; }).length;
    check('全屏黑场 fillRect 至少 1 次', rectCount >= 2, '实际 ' + rectCount + ' 次(黑场+分隔线)');
    check('绘制章节 code', texts.indexOf('CHAPTER I') >= 0);
    check('绘制章节名', texts.indexOf('破晓之翼') >= 0);
    var linesOk = ['海平面升起第一道曙光。', '铁旗中队封锁了近海航道——', '升空，夺回属于我们的天空。']
      .every(function (l) { return texts.indexOf(l) >= 0; });
    check('绘制 3 行剧情(行距 40)', linesOk);
    check('绘制跳过提示', texts.indexOf('按任意键跳过') >= 0);
    check('字体全部为 Microsoft YaHei', ctx.calls.filter(function (x) { return x.op === 'fillText'; })
      .every(function (x) { return x.font.indexOf('Microsoft YaHei') >= 0; }));

    // ---- 5. skip() 与重入 ----
    console.log('[5] skip() / isActive() / 重入');
    ChapterCard.start(2);
    ChapterCard.update(0.5);
    check('skip 前 isActive()=true', ChapterCard.isActive());
    ChapterCard.skip();
    check('skip 后立即 active=false', !ChapterCard.isActive() && ChapterCard.t === 0 && ChapterCard.phase === 'in');
    ChapterCard.start(3);
    check('重入 start(3) 生效', ChapterCard.isActive() && ChapterCard.chapter === 3 && ChapterCard.phase === 'in');
    ChapterCard.skip();
    check('未激活时 draw() 无副作用', (function () { ctx.calls = []; ChapterCard.draw(); return ctx.calls.length === 0; })());

    console.log('==== 自测结束:' + (failCount === 0 ? '全部通过' : failCount + ' 项失败') + ' ====');
    return failCount;
  }

  // 最小 mock ctx:仅覆盖 draw() 用到的 API,任何缺失即抛错(等价于依赖检查)
  function makeMockCtx() {
    return {
      calls: [],
      globalAlpha: 1, fillStyle: '', font: '', textAlign: '', textBaseline: '',
      save: function () { this.calls.push({ op: 'save' }); },
      restore: function () { this.calls.push({ op: 'restore' }); },
      fillRect: function (x, y, w, h) {
        this.calls.push({ op: 'fillRect', x: x, y: y, w: w, h: h, alpha: this.globalAlpha });
      },
      fillText: function (text, x, y) {
        this.calls.push({ op: 'fillText', text: text, x: x, y: y, alpha: this.globalAlpha, font: this.font });
      }
    };
  }
}


function grantAchievements() {
  if (typeof unlockAchievements !== 'function') return;
  const fresh = unlockAchievements();
  for (const d of fresh) toastAchievement(d);
  if (fresh.length) saveNow();
}

// ---------- P39 结算文案:失败俏皮话分组随机(33 条命名常量,便于改词) ----------
const FAIL_LINES_ENDLESS_1_5 = [
  '刚热完身就返航啦，机库大门永远为你敞开。',
  '本次试飞到此结束，地勤已经在擦停机位了。',
  '云层还厚着呢，先回塔台喝口热茶再升空。'
];
const FAIL_LINES_ENDLESS_6_10 = [
  '战果不错，只是云里还藏着几架坏家伙。',
  '机翼有点累了，保养一下，下一轮更利索。',
  '弹舱清空的姿势很帅，补给站见。'
];
const FAIL_LINES_ENDLESS_11_15 = [
  '打得漂亮！这波敌人是组团来给你刷熟练度的。',
  '差一点就刷新纪录啦，纪录在冲你招手。',
  '王牌也需要中场休息，咖啡已经热好了。'
];
const FAIL_LINES_ENDLESS_OVER15 = [
  '十六波都扛过来了，你已经是这条航线的传说。',
  '弹尽粮绝也能优雅返航，这就是王牌风范。',
  '天空都记得你的航迹，休息片刻再战。',
  '敌军今晚的作战会议主题：讨论你怎么这么难缠。',
  '这一局够写进队史了，荣誉墙给你留了位置。',
  '引擎冒烟也挡不住你，下回让它歇口气。',
  '深空都在为你鼓掌，先回基地加满油。',
  '连王牌都有累的时候，你的记录已经闪闪发光。',
  '这一轮打得对面怀疑机生，值得开个庆功会。',
  '航迹云还没散，你的传说已经开始流传。',
  '塔台已为你清空跑道，随时欢迎再次升空。',
  '这么高的波数，地勤看了都竖起大拇指。',
  '机翼上挂满星星的你，休息也是战术的一部分。',
  '敌军电台都在问：那架飞机什么时候回来？',
  '你是这片天空的常客，稍作补给再创纪录。'
];
const FAIL_LINES_CAMPAIGN_1 = [
  '第一次侦察就摸清敌情了，下次出击更有底气。',
  '首战收集的情报很珍贵，塔台已更新战术。',
  '新手光环先攒着，下一轮就是你发光的时候。'
];
const FAIL_LINES_CAMPAIGN_2_3 = [
  '战术越打越清晰，就差最后一下了。',
  '敌机套路已经被你摸透，就差捅破那层窗户纸。',
  '每一次升空都在进步，胜利已经在倒计时。'
];
const FAIL_LINES_CAMPAIGN_4PLUS = [
  '王牌也是摔出来的，这关只是脾气比较倔。',
  '多飞几遍航线而已，你离通关只差一层云。',
  '敌机开始紧张了，因为它们知道你还会回来。'
];
// 自由模式失败分组:15 波内每 5 波一组(1-5/6-10/11-15),>15 波走 15 条大池
function failLineGroupEndless(waves) {
  if (waves <= 5) return FAIL_LINES_ENDLESS_1_5;
  if (waves <= 10) return FAIL_LINES_ENDLESS_6_10;
  if (waves <= 15) return FAIL_LINES_ENDLESS_11_15;
  return FAIL_LINES_ENDLESS_OVER15;
}
// 战役失败分组:按本次任务尝试次数(第 1 次/第 2-3 次/第 4 次及以上)
function failLineGroupCampaign(attempts) {
  if (attempts <= 1) return FAIL_LINES_CAMPAIGN_1;
  if (attempts <= 3) return FAIL_LINES_CAMPAIGN_2_3;
  return FAIL_LINES_CAMPAIGN_4PLUS;
}
// 组内随机选 1 条:结算瞬间单次消费 Math.random(),与其它随机流无调用顺序依赖
function pickFailLine(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}
// 结算统计行:自由模式(isEndless)不含「命中率」,其余统计行保持
function buildGameOverStats(s, isEndless) {
  const mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
  const rows = [
    ['存活时间', mm + ':' + (ss < 10 ? '0' : '') + ss],
    ['击坠数', s.kills]
  ];
  if (!isEndless) rows.push(['命中率', Math.round(s.accuracy * 100) + '%']);
  rows.push(['得分', fmt(s.score)]);
  return rows;
}

function finishMission(success) {
  if (success) {
    const def = mission.def;
    let timeBonus = 0;
    if (!mission.endless) {
      timeBonus = Math.max(0, Math.round((def.timeBonus || 300) - GAME.missionTime * 2.2));
    }
    GAME.score += timeBonus;
    if (!mission.endless) {
      const scoreMult = (DIFFICULTY_DEFS[save.difficulty] || DIFFICULTY_DEFS.normal).scoreMult;
      GAME.score = Math.round(GAME.score * scoreMult);
    }
    const acc = GAME.shotsFired > 0 ? GAME.shotsHit / GAME.shotsFired : 0;
    const rating = computeRating({ missionTime: GAME.missionTime, damageTaken: GAME.damageTaken, maxCombo: GAME.maxCombo || 0, accuracy: acc, shotsFired: GAME.shotsFired, revivesUsed: GAME.revivesUsed });
    const rank = rating.rank;
    GAME.endStats = {
      success: true,
      time: GAME.missionTime,
      kills: GAME.kills,
      accuracy: acc,
      damage: GAME.damageTaken,
      score: GAME.score,
      timeBonus: timeBonus,
      rank: rank,
      rating: rating,
      missionName: def.name,
      code: def.code
    };
    // P39: 战役任务成功 → 该任务尝试计数清零(下次失败回到「第 1 次」组)
    if (!mission.endless && GAME.missionAttempts) delete GAME.missionAttempts[GAME.missionIndex];
  } else {
    // P39: 失败俏皮话按战绩分组随机(自由模式=本局波数, 战役=该任务尝试次数)
    const wavesDone = mission.endless ? (mission.completedWaves || 0) : 0;
    const attemptsDone = mission.endless ? 0 : ((GAME.missionAttempts && GAME.missionAttempts[GAME.missionIndex]) || 1);
    const failPool = mission.endless ? failLineGroupEndless(wavesDone) : failLineGroupCampaign(attemptsDone);
    GAME.endStats = {
      success: false,
      time: GAME.missionTime,
      kills: GAME.kills,
      accuracy: GAME.shotsFired > 0 ? GAME.shotsHit / GAME.shotsFired : 0,
      damage: GAME.damageTaken,
      score: GAME.score,
      rank: '-',
      missionName: mission.def.name,
      code: mission.def.code,
      waves: wavesDone,
      attempts: attemptsDone,
      failLine: pickFailLine(failPool)
    };
  }
  if (mission.endless) {
    save.bestKills = Math.max(save.bestKills, GAME.kills);
    save.totalKills += GAME.kills;
    save.totalScore += GAME.score;
    saveNow();
  } else if (success) {
    const idx = GAME.missionIndex;
    save.unlockedMissions = Math.max(save.unlockedMissions, Math.min(idx + 2, MISSION_DEFS.length));
    const ch = [2, 5, 8].indexOf(idx);
    if (ch >= 0) save.chapterCleared = Math.max(save.chapterCleared, ch + 1);
    save.missionsCleared++;
    save.totalKills += GAME.kills;
    save.totalScore += GAME.score;
    save.bestScore[idx] = Math.max(save.bestScore[idx] || 0, GAME.score);
    if (rankRank(save.bestRank[idx] || '') < rankRank(GAME.endStats.rating.rank)) save.bestRank[idx] = GAME.endStats.rating.rank;
    markPerfectRun(GAME.damageTaken === 0);
    grantAchievements();
    saveNow();
  } else if (GAME.kills > 0 || GAME.score > 0) {
    save.totalKills += GAME.kills;
    save.totalScore += GAME.score;
    markPerfectRun(GAME.damageTaken === 0);
    grantAchievements();
    saveNow();
  }
  if (success) {
    setState(mission.endless ? 'gameover' : 'complete');
  } else {
    setState('gameover');
  }
}
