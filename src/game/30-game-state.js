// ---------- game state ----------
const CFG = {
  turnRate: 2.7,
  minSpeed: 95,
  maxSpeed: 370,
  abSpeed: 110,
  accel: 190,
  gunDamage: 7,
  gunRate: 0.075,
  gunSpeed: 1550,
  gunSpread: 0.05,
  missileSpeed: 760,
  missileTurn: 3.1,
  missileLife: 3.4,
  missileBlast: 105,
  missileDamage: 65,
  lockRange: 1000,
  lockCone: 0.75,
  lockTime: 0.85
};

// ---------- PC 鼠标转向常量(任务书 22,全部可调) ----------
const MOUSE_STEER_DEADZONE = 40; // px:距屏幕中心水平死区,防抖
const MOUSE_STEER_FULL = 0.35; // 屏幕宽比例:该水平距离处达满速
const MOUSE_STEER_RATE = 1.5; // 满速转向倍率(与键盘一致)
const MOUSE_STEER_MIN = 0.2; // 死区边缘最低倍率
const MOUSE_STEER_TIMEOUT = 2; // 秒:鼠标最后移动距今超时后转向失效
const MOUSE_STEER_SPEED = 0.7;  // P36: 鼠标转向角速度系数(解决"有点快"), 可调; 距离控速语义不变

const GAME = {
  state: 'title',
  mode: 'campaign',
  missionIndex: 0,
  time: 0,
  score: 0,
  kills: 0,
  shotsFired: 0,
  shotsHit: 0,
  damageTaken: 0,
  missionTime: 0,
  endStats: null,
  pendingState: null,
  pendingTimer: 0,
  freezeTimer: 0,
  hintTimer: 12,
  exp: 0,
  level: 1,
  combo: 0,
  comboTimer: 0,
  comboMax: 5,
  upgrades: {},
  weapons: [],
  dash: null,
  pickupsTaken: 0,
  reviveCount: 0,
  revivesUsed: 0,
  unlimitedRevive: false
};

const player = {
  kind: 'player',
  x: 0, y: 0, heading: 0, speed: 0, bank: 0,
  r: 16,
  hp: 100, maxHp: 100,
  altitude: 3500,   // 高度系统(任务书 19):速度驱动,初始 3500,上限 9000,归零死亡
  missiles: 40, maxMissiles: 48,
  throttle: 0.68, target: null, lock: 0,
  fireCd: 0, missileCd: 0, invuln: 0, alive: true, dead: false, reviveAnim: null,
  gunSide: 1, hitFlash: 0, afterburn: false,
  rollT: 0, rollDur: 0.85, rollDir: 0, rollActive: false, rollCd: 0,
  lastDirTap: { dir: null, t: -99 },
  buffs: {}
};

let bullets = [];
let missiles = [];
let particles = [];
let pickups = [];
let enemies = [];
let allies = [];
let cam = { x: 0, y: 0, zoom: 1, shake: 0, shakeX: 0, shakeY: 0 };
const CAM_ZOOM = 0.85;      // 追尾默认缩放(任务书 20,可调)
const CAM_ANCHOR_Y = 0.62;  // 飞机屏幕锚点 y 比例(任务书 20,可调)
let world = { W: 7200, H: 5600, clouds: [], islands: [], seed: 1, theme: null };
let mission = null;
let transition = { active: false, alpha: 0, dir: 0, cb: null };
let menuButtons = [];
let lastTime = performance.now();
let gameTime = 0;
let upgradeChoice = null;
let upgradeChoiceSel = 0;
let settingsReturn = 'title';
let achievementsReturn = 'title';   // 成就界面返回来源:title / hangar(任务书 13)

const SETTINGS_ACTIONS = [
  { action: 'throttleUp', label: '油门加速' },
  { action: 'throttleDown', label: '油门减速' },
  { action: 'turnLeft', label: '左转' },
  { action: 'turnRight', label: '右转' },
  { action: 'rollLeft', label: '滚筒左' },
  { action: 'rollRight', label: '滚筒右' },
  { action: 'dash', label: '急速突进' },
  { action: 'afterburn', label: '加力' },
  { action: 'gun', label: '机炮' },
  { action: 'missile', label: '导弹' },
  { action: 'pause', label: '暂停' },
  { action: 'mute', label: '静音' },
  { action: 'confirm', label: '确认 / 开始' },
  { action: 'menu', label: '菜单 / 取消' }
];

const QUALITY_MULT = { common: 0.8, good: 1, rare: 1.3 };
const QUALITY_NAME = { common: '普通', good: '良好', rare: '稀有' };
const QUALITY_COLOR = { common: '#dfe9f2', good: '#54c7ff', rare: '#ffd166' };
const QUALITY_ORDER = ['common', 'good', 'rare'];
const TOUCH_AUTO_FIRE_RANGE_FACTOR = 0.9;
const TOUCH_AUTO_FIRE_CONE = 0.35;

const DROP_WEAPONS = {
  scatter: {
    name: '散射机炮', limited: false, per: 2, cd: 0.135, dmg: 8, speed: 1320,
    spread: 0.09, life: 0.72, size: 4, barrel: 3, color: '#ff9f43', desc: '三管散射，近距离清场'
  },
  heavy: {
    name: '重型机炮', limited: false, per: 2, cd: 0.16, dmg: 16, speed: 1500,
    spread: 0.045, life: 0.8, size: 6, barrel: 2, color: '#ff5f56', desc: '高伤害重型弹头'
  },
  pierce: {
    name: '穿甲机炮', limited: false, per: 2, cd: 0.1, dmg: 11, speed: 1620,
    spread: 0.02, life: 0.9, size: 5, barrel: 2, pierce: 2, color: '#bfe3ff', desc: '弹道平直，贯穿目标'
  },
  laser: {
    name: '激光炮', limited: true, per: 26, cd: 0.09, dmg: 9, speed: 1850,
    spread: 0.012, life: 0.6, size: 4, barrel: 1, color: '#ff4dd8', desc: '高速光束，弹速极快'
  },
  rocket: {
    name: '火箭弹', limited: true, per: 10, cd: 0.42, dmg: 34, speed: 980,
    spread: 0.03, life: 1.1, size: 7, barrel: 1, blast: 68, color: '#ff8a3c', desc: '小范围爆炸伤害'
  },
  plasma: {
    name: '能量炮', limited: true, per: 8, cd: 0.72, dmg: 64, speed: 1220,
    spread: 0.01, life: 1.3, size: 9, barrel: 1, blast: 82, color: '#7ee787', desc: '慢速重型能量球'
  }
};

const DROP_MOVES = {
  dash: {
    name: '急速突进', key: 'E', cd: [5, 4, 2], dur: [0.24, 0.28, 0.34],
    speed: [1500, 1850, 2300], invuln: [0.14, 0.18, 0.24], color: '#9be3ff', desc: '向前急速突进，短暂无敌'
  }
};

const DROP_SUPPLIES = {
  repair: { name: '应急维修', amount: 30, color: '#7ee787' },
  missiles: { name: '导弹补给', amount: 8, color: '#54c7ff' },
  score: { name: '荣誉点数', amount: 500, color: '#ffd166' }
};

const BUFF_DEFS = {
  damage:  { name: '火力强化', icon: '火', color: '#ff5f56', dur: 15, desc: '机炮伤害 +60%' },
  rate:    { name: '急速射击', icon: '速', color: '#ff9f43', dur: 12, desc: '射速 +50%' },
  shield:  { name: '能量护盾', icon: '盾', color: '#54c7ff', dur: 20, desc: '抵挡 2 次伤害' },
  missile: { name: '导弹狂潮', icon: '导', color: '#ff4dd8', dur: 10, desc: '导弹冷却减半 · 锁定加速' },
  score:   { name: '荣誉风暴', icon: '赏', color: '#ffd166', dur: 15, desc: '击坠得分 ×2' }
};

const THEMES = {
  day: {
    name: '昼间海域',
    skyTop: '#0d4f86', skyMid: '#2f8dc0', skyBottom: '#a9dcec',
    waterTop: '#0e5f78', waterBottom: '#083548',
    sun: '#fff3c4', sunGlow: 'rgba(255,220,140,0.35)',
    sand: '#e8cd8a', grass: '#4d9a62', rock: '#71806b', tree: '#2f6f45',
    city: null, cloud: 'rgba(255,255,255,0.5)', haze: 'rgba(255,255,255,0.06)',
    wave: 'rgba(255,255,255,0.16)'
  },
  sunset: {
    name: '黄昏海域',
    skyTop: '#24336e', skyMid: '#a84f6f', skyBottom: '#ffb36b',
    waterTop: '#3a3768', waterBottom: '#171b3c',
    sun: '#ffe1a0', sunGlow: 'rgba(255,150,80,0.4)',
    sand: '#d9b478', grass: '#4f7d52', rock: '#5b5b63', tree: '#2f5538',
    city: '#ffe9a8', cloud: 'rgba(255,190,150,0.4)', haze: 'rgba(255,120,70,0.10)',
    wave: 'rgba(255,220,170,0.14)'
  },
  storm: {
    name: '风暴空域',
    skyTop: '#26303b', skyMid: '#46515c', skyBottom: '#7d857f',
    waterTop: '#2a3b46', waterBottom: '#101a22',
    sun: '#d8d9c4', sunGlow: 'rgba(210,220,190,0.18)',
    sand: '#8d8b72', grass: '#5d6b4e', rock: '#4c514e', tree: '#38462f',
    city: null, cloud: 'rgba(180,190,190,0.34)', haze: 'rgba(150,160,150,0.10)',
    wave: 'rgba(200,215,210,0.10)'
  },
  night: {
    name: '夜航空域',
    skyTop: '#070e22', skyMid: '#101c38', skyBottom: '#26385a',
    waterTop: '#0a1a30', waterBottom: '#040a16',
    sun: '#eef3ff', sunGlow: 'rgba(160,190,255,0.20)',
    sand: '#6f6f5a', grass: '#334a36', rock: '#3b4148', tree: '#243527',
    city: '#ffd27a', cloud: 'rgba(160,190,220,0.16)', haze: 'rgba(120,150,220,0.06)',
    wave: 'rgba(180,210,255,0.08)'
  }
};
