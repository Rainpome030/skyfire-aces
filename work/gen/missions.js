// ============================================================
// 《苍穹之翼·单机空战》战役扩展 MISSION_DEFS(9 关 3 章节)
// 文件:work/gen/missions.js —— 纯 JS 代码片段(无 HTML 标签、无 ES module 语句)
//
// 说明:本文件不修改主文件 outputs/skyfire-aces.html;
//       前 3 关(黎明扫荡/铁翼护航/赤色风暴)数据与主文件完全一致,
//       仅追加新字段 type(任务类型)与 chapter(章节)。
//       新增 6 关覆盖 3 种新任务类型:intercept(限时拦截)/ survive(生存坚守)/ race(竞速),
//       以及 2 个新 BOSS 标记 bossKind:'eye'/'king'(具体 BOSS 行为由总控/平行任务实现,
//       本文件只负责数据)。
//
// 集成方式(由总控负责):
//   1) 用本文件的 MISSION_DEFS 整体替换主文件同名常量(或在其后覆盖);
//   2) 在 startMission 中按 def.type 调用 mission-logic.js 的 start* 函数;
//   3) 在 updateMission 中按 mission.def.type 调用对应 update* 函数
//      (intercept/survive/race 三种类型下,不要再调用主文件 updateMissionSpawn,
//       以免重复刷怪);
//   4) 在 drawHUD 中调用 missionTimerText(),返回值非空则绘制在屏幕顶部中央。
//
// Node 环境自检支持:浏览器中 typeof module === 'undefined',此分支不执行;
//                    node 下 require 本文件可取得 { MISSION_DEFS }。
// ============================================================

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

// ---------- Node 环境自检支持(浏览器中不执行) ----------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MISSION_DEFS };
}
