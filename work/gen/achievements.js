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
    case 'first_kill':  return (save.totalKills || 0) >= 1;
    case 'ace_100':     return (save.totalKills || 0) >= 100;
    case 'rank_s':      return rankRank(save.bestRank) >= rankRank('S');   // S/SS/SSS
    case 'rank_sss':    return rankRank(save.bestRank) >= rankRank('SSS'); // 仅 SSS
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
