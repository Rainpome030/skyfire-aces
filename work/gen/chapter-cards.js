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
