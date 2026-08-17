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
// 命中分说明:
//   命中分 = accuracy × 10(上限 10 分);未开火时按 0.6 基准给 6 分。
//   主文件 acc 在"未开火"与"开了火但全空"两种情况下均为 0,仅凭 acc 无法区分;
//   本模块默认将"accuracy 为空或 0"视为未开火 → 6 分(与任务书验收样例一致)。
//   若集成时传入 shotsFired 则可精确区分:shotsFired===0 → 6 分;
//   开火但命中率为 0 → 0 分。
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
// 权重:时间 40% / 损伤 30% / 连击 20% / 命中 10%
//   时间分 = clamp(1 - missionTime / 600, 0, 1) × 40   (600 秒 = 10 分钟)
//   损伤分 = clamp(1 - damageTaken / 120, 0, 1) × 30   (累计损伤 120 封顶)
//   连击分 = clamp(maxCombo / 40, 0, 1) × 20           (40 连击封顶)
//   命中分 = accuracy × 10(未开火按 0.6 基准给 6 分)
// 总分四舍五入;阈值:SSS≥95  SS≥85  S≥70  A≥55  B≥40  C<40
function computeRating(stats) {
  stats = stats || {};
  const mtRaw = Number(stats.missionTime);
  const dtRaw = Number(stats.damageTaken);
  const mcRaw = Number(stats.maxCombo);
  const accRaw = Number(stats.accuracy);
  const firedRaw = Number(stats.shotsFired);
  const mt = isFinite(mtRaw) && mtRaw > 0 ? mtRaw : 0;
  const dt = isFinite(dtRaw) && dtRaw > 0 ? dtRaw : 0;
  const mc = isFinite(mcRaw) && mcRaw > 0 ? mcRaw : 0;

  const timeScore = ratingClamp01(1 - mt / 600) * 40;   // 0-40
  const damageScore = ratingClamp01(1 - dt / 120) * 30; // 0-30
  const comboScore = ratingClamp01(mc / 40) * 20;       // 0-20

  let accuracyScore;                                    // 0-10
  if (isFinite(firedRaw) && firedRaw === 0) {
    accuracyScore = 6;                                  // 明确未开火 → 0.6 基准
  } else if (isFinite(firedRaw) && firedRaw > 0) {
    accuracyScore = ratingClamp01(accRaw) * 10;         // 开火 → 按真实命中率(全空 = 0 分)
  } else {
    // 未提供 shotsFired:accuracy 为空或 0 视为未开火 → 6 分(与验收样例一致)
    accuracyScore = (isFinite(accRaw) && accRaw > 0 ? ratingClamp01(accRaw) : 0.6) * 10;
  }

  const total = Math.round(timeScore + damageScore + comboScore + accuracyScore);
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
      combo: round1(comboScore),
      accuracy: round1(accuracyScore)
    }
  };
}

// ---------- 2. 结算页评级面板绘制(独立函数) ----------
// s = GAME.endStats,需含 rating(computeRating 结果对象);
// 失败结算或缺少 rating 时直接返回(不绘制)。
// 布局:结算面板中部深色圆角卡片 = 左侧评级大字母 + 徽章文案,右侧四条分项进度条;
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
    { label: '时间', score: getScore(parts.time), max: 40 },
    { label: '损伤', score: getScore(parts.damage), max: 30 },
    { label: '连击', score: getScore(parts.combo), max: 20 },
    { label: '命中', score: getScore(parts.accuracy), max: 10 }
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

  // 四条分项进度条(时间 0-40 / 损伤 0-30 / 连击 0-20 / 命中 0-10)
  let barX, barW, barH, labelX;
  if (twoCol) {
    barX = cx + cw * 0.38 + 6;
    barW = cw - (barX - cx) - 6;
    barH = 10;
    labelX = barX - 34;
    for (let i = 0; i < items.length; i++) {
      drawRatingBar(items[i], barX, cy + 10 + i * 20, barW, barH, color, labelX);
    }
  } else {
    barX = cx + 40;
    barW = cw - 48;
    barH = 9;
    labelX = cx + 4;
    for (let i = 0; i < items.length; i++) {
      drawRatingBar(items[i], barX, cy + 86 + i * 18, barW, barH, color, labelX);
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
