// ============================================================
// 《苍穹之翼·单机空战》四战机程序化造型 —— 重锤 / 迅雷 / 凤凰
// 文件:work/gen/planes.js —— 纯 JS 代码片段(无 HTML 标签、无 ES module 语句)
//
// 说明:本文件不修改主文件 outputs/skyfire-aces.html,由总控以 <script> 引入。
//       只依赖全局 ctx(主文件已有),不引用 save/GAME/player/CFG/TAU 等任何游戏
//       全局,不读取 p 的任何字段 —— 纯矢量绘制,配色全部写死。
//
// 对外全局(仅三个函数,已确认与主文件无冲突):
//   drawHammerJet(p)  —— 重锤:宽体重装(深灰蓝 #6b7684 主色 + 橙警示 #ff9f43)
//   drawBoltJet(p)    —— 迅雷:细长三角翼(银白 #d8e9f2 主色 + 天蓝条纹 #66d9ff)
//   drawPhoenixJet(p) —— 凤凰:羽翼金机(金色 #f5c94c 主色 + 深红点缀 #d84a4a)
//
// 调用约定(由总控在 drawPlayerJet(p) 内分发):
//   被调用时 ctx 已 translate(p.x, p.y) + rotate(p.heading) 到机身局部坐标,
//   机头朝 +x,原点 = 机身中心;尺寸约 x ∈ [-46, 40], y ∈ [-30, 30]。
//   只画机身本体:尾焰、受击红闪、复活动画光晕、roll 翼展缩放均由总控通用层
//   在分发前统一处理(与 gale 共用),本文件不处理,也不触碰
//   ctx.globalAlpha / shadow 等任何额外状态;函数体整体包在 save/restore 中,
//   不污染调用方渲染状态。函数签名 drawXxxJet(p),无返回值。
//
// Node 自检:node --check work/gen/planes.js 校验语法;
//   node work/gen/planes.test.cjs 运行 mock ctx 自测(验收标准逐条)。
// ============================================================

'use strict';

// ---------- 重锤:宽体重装 ----------
// 形态:短粗宽大机身(半宽 15)+ 后掠梯形厚实主翼(翼展 ±26,翼尖橙警示条)+
//       机身两侧双引擎舱(粗圆筒 + 深色喷口 + 橙环)+ 机腹挂载点(挂架 + 炸弹,
//       橙弹头 + 尾翼,左右各一)+ 宽短座舱(橙框)。
// 配色:深灰蓝 #6b7684 主色,深描边 #2a3440,橙警示 #ff9f43(翼尖 / 机尾 /
//       机头 / 弹头 / 座舱框 / 引擎环)。
function drawHammerJet(p) {
  ctx.save();
  // -- 厚实主翼(左右对称,后掠梯形) --
  ctx.fillStyle = '#6b7684';
  ctx.beginPath();
  ctx.moveTo(14, -8); ctx.lineTo(4, -26); ctx.lineTo(-18, -26); ctx.lineTo(-16, -10);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, 8); ctx.lineTo(4, 26); ctx.lineTo(-18, 26); ctx.lineTo(-16, 10);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#2a3440'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(14, -8); ctx.lineTo(4, -26); ctx.lineTo(-18, -26); ctx.lineTo(-16, -10);
  ctx.closePath(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(14, 8); ctx.lineTo(4, 26); ctx.lineTo(-18, 26); ctx.lineTo(-16, 10);
  ctx.closePath(); ctx.stroke();
  // -- 翼尖橙警示条 --
  ctx.fillStyle = '#ff9f43';
  ctx.beginPath();
  ctx.moveTo(2, -26); ctx.lineTo(-18, -26); ctx.lineTo(-18, -22); ctx.lineTo(2, -22);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(2, 26); ctx.lineTo(-18, 26); ctx.lineTo(-18, 22); ctx.lineTo(2, 22);
  ctx.closePath(); ctx.fill();
  // -- 短粗宽大机身 --
  ctx.fillStyle = '#6b7684';
  ctx.beginPath();
  ctx.moveTo(30, 0); ctx.lineTo(14, -7); ctx.lineTo(2, -13); ctx.lineTo(-10, -15);
  ctx.lineTo(-24, -12); ctx.lineTo(-36, -5); ctx.lineTo(-38, 0); ctx.lineTo(-36, 5);
  ctx.lineTo(-24, 12); ctx.lineTo(-10, 15); ctx.lineTo(2, 13); ctx.lineTo(14, 7);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#2a3440'; ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(30, 0); ctx.lineTo(14, -7); ctx.lineTo(2, -13); ctx.lineTo(-10, -15);
  ctx.lineTo(-24, -12); ctx.lineTo(-36, -5); ctx.lineTo(-38, 0); ctx.lineTo(-36, 5);
  ctx.lineTo(-24, 12); ctx.lineTo(-10, 15); ctx.lineTo(2, 13); ctx.lineTo(14, 7);
  ctx.closePath(); ctx.stroke();
  // -- 宽短座舱(深色玻璃 + 橙框) --
  ctx.fillStyle = '#2a3440';
  ctx.beginPath(); ctx.ellipse(4, 0, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(4, 0, 9, 4, 0, 0, Math.PI * 2); ctx.stroke();
  // -- 双引擎舱(机身两侧粗圆筒) --
  ctx.fillStyle = '#6b7684';
  ctx.beginPath(); ctx.ellipse(-20, -20, 7, 6.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-20, 20, 7, 6.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a3440'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(-20, -20, 7, 6.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-20, 20, 7, 6.5, 0, 0, Math.PI * 2); ctx.stroke();
  // -- 引擎喷口(深色)与橙环 --
  ctx.fillStyle = '#2a3440';
  ctx.beginPath(); ctx.ellipse(-26, -20, 2.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-26, 20, 2.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(-20, -20, 7, 6.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-20, 20, 7, 6.5, 0, 0, Math.PI * 2); ctx.stroke();
  // -- 机腹挂载点(挂架 + 炸弹 + 橙弹头 + 尾翼,左右各一) --
  ctx.fillStyle = '#2a3440';
  ctx.fillRect(-14, 14, 22, 3);
  ctx.fillRect(-14, -17, 22, 3);
  ctx.fillStyle = '#4a5460';
  ctx.fillRect(-10, 17, 18, 5);
  ctx.fillRect(-10, -22, 18, 5);
  ctx.fillStyle = '#ff9f43';
  ctx.fillRect(8, 17, 3, 5);
  ctx.fillRect(8, -22, 3, 5);
  ctx.fillStyle = '#2a3440';
  ctx.fillRect(-13, 17, 2, 5);
  ctx.fillRect(-13, -22, 2, 5);
  // -- 机尾 / 机头橙警示条 --
  ctx.fillStyle = '#ff9f43';
  ctx.fillRect(-38, -2, 4, 4);
  ctx.fillRect(26, -1, 4, 2);
  ctx.restore();
}

// ---------- 迅雷:细长三角翼 ----------
// 形态:狭长机身(半宽 5,尖头)+ 大后掠三角主翼(前缘自机头附近直掠至机尾
//       翼尖 ±24)+ 单垂尾(机尾上方细长三角)+ 翼面 / 机身天蓝高速条纹。
// 配色:银白 #d8e9f2 主色,描边 #9db8c9,天蓝 #66d9ff(条纹 / 座舱框 / 垂尾舵条)。
function drawBoltJet(p) {
  ctx.save();
  // -- 大后掠三角主翼(左右) --
  ctx.fillStyle = '#d8e9f2';
  ctx.beginPath();
  ctx.moveTo(34, 0); ctx.lineTo(-38, -24); ctx.lineTo(-38, -14); ctx.lineTo(-2, -3);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(34, 0); ctx.lineTo(-38, 24); ctx.lineTo(-38, 14); ctx.lineTo(-2, 3);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#9db8c9'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(34, 0); ctx.lineTo(-38, -24); ctx.lineTo(-38, -14); ctx.lineTo(-2, -3);
  ctx.closePath(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(34, 0); ctx.lineTo(-38, 24); ctx.lineTo(-38, 14); ctx.lineTo(-2, 3);
  ctx.closePath(); ctx.stroke();
  // -- 翼面天蓝高速条纹(斜线,左右各两条) --
  ctx.strokeStyle = '#66d9ff'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(18, -1.5); ctx.lineTo(-30, -9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -3.5); ctx.lineTo(-33, -12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(18, 1.5); ctx.lineTo(-30, 9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, 3.5); ctx.lineTo(-33, 12); ctx.stroke();
  // -- 狭长机身(尖头) --
  ctx.fillStyle = '#d8e9f2';
  ctx.beginPath();
  ctx.moveTo(40, 0); ctx.lineTo(18, -3); ctx.lineTo(0, -5); ctx.lineTo(-20, -5);
  ctx.lineTo(-38, -4); ctx.lineTo(-40, 0); ctx.lineTo(-38, 4); ctx.lineTo(-20, 5);
  ctx.lineTo(0, 5); ctx.lineTo(18, 3);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#9db8c9'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(40, 0); ctx.lineTo(18, -3); ctx.lineTo(0, -5); ctx.lineTo(-20, -5);
  ctx.lineTo(-38, -4); ctx.lineTo(-40, 0); ctx.lineTo(-38, 4); ctx.lineTo(-20, 5);
  ctx.lineTo(0, 5); ctx.lineTo(18, 3);
  ctx.closePath(); ctx.stroke();
  // -- 机身中央天蓝线(高速条纹) --
  ctx.strokeStyle = '#66d9ff'; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-30, 0); ctx.stroke();
  // -- 单垂尾(机尾上方细长三角) --
  ctx.fillStyle = '#d8e9f2';
  ctx.beginPath();
  ctx.moveTo(-24, -4); ctx.lineTo(-36, -15); ctx.lineTo(-40, -6); ctx.lineTo(-28, -2);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#9db8c9'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-24, -4); ctx.lineTo(-36, -15); ctx.lineTo(-40, -6); ctx.lineTo(-28, -2);
  ctx.closePath(); ctx.stroke();
  // -- 垂尾天蓝舵条 --
  ctx.strokeStyle = '#66d9ff'; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(-29, -5.5); ctx.lineTo(-35, -13.5); ctx.stroke();
  // -- 细长座舱(深蓝玻璃 + 天蓝框) --
  ctx.fillStyle = '#1d2b38';
  ctx.beginPath(); ctx.ellipse(10, 0, 11, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#66d9ff'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(10, 0, 11, 2.2, 0, 0, Math.PI * 2); ctx.stroke();
  // -- 尾喷口 --
  ctx.fillStyle = '#2a3a44';
  ctx.fillRect(-41, -2, 3, 4);
  ctx.restore();
}

// ---------- 凤凰:羽翼金机 ----------
// 形态:金色流线机身 + 羽状分层机翼(后掠翼基 + 3 片色阶羽条,羽条深红描边
//       分层,翼面 3 条羽纹折线)+ 双垂尾(机尾两侧)+ 机头金鹰徽记(深红环 +
//       鹰喙 + 金瞳)+ 机身中央深红饰条 + 渐变座舱玻璃。
// 配色:金色 #f5c94c 主色,羽条色阶 #f5c94c → #eab63c → #e0a83c,深红 #d84a4a
//       点缀(羽条描边 / 饰条 / 机尾 / 垂尾描边 / 徽记),描边 #a5741f。
function drawPhoenixJet(p) {
  ctx.save();
  // -- 翼基(后掠,金色,左右) --
  ctx.fillStyle = '#f5c94c';
  ctx.beginPath();
  ctx.moveTo(16, -4); ctx.lineTo(6, -22); ctx.lineTo(-16, -17); ctx.lineTo(-8, -8);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(16, 4); ctx.lineTo(6, 22); ctx.lineTo(-16, 17); ctx.lineTo(-8, 8);
  ctx.closePath(); ctx.fill();
  // -- 羽条(3 片分层,色阶由亮到深,左翼) --
  ctx.fillStyle = '#f5c94c';
  ctx.beginPath();
  ctx.moveTo(-8, -16); ctx.lineTo(-20, -28); ctx.lineTo(-27, -21); ctx.lineTo(-13, -12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#eab63c';
  ctx.beginPath();
  ctx.moveTo(-13, -13); ctx.lineTo(-29, -22); ctx.lineTo(-32, -15); ctx.lineTo(-16, -9);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e0a83c';
  ctx.beginPath();
  ctx.moveTo(-15, -12); ctx.lineTo(-33, -15); ctx.lineTo(-32, -7); ctx.lineTo(-15, -7);
  ctx.closePath(); ctx.fill();
  // -- 羽条(右翼对称) --
  ctx.fillStyle = '#f5c94c';
  ctx.beginPath();
  ctx.moveTo(-8, 16); ctx.lineTo(-20, 28); ctx.lineTo(-27, 21); ctx.lineTo(-13, 12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#eab63c';
  ctx.beginPath();
  ctx.moveTo(-13, 13); ctx.lineTo(-29, 22); ctx.lineTo(-32, 15); ctx.lineTo(-16, 9);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e0a83c';
  ctx.beginPath();
  ctx.moveTo(-15, 12); ctx.lineTo(-33, 15); ctx.lineTo(-32, 7); ctx.lineTo(-15, 7);
  ctx.closePath(); ctx.fill();
  // -- 羽条深红描边(羽状分层) --
  ctx.strokeStyle = '#d84a4a'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-8, -16); ctx.lineTo(-20, -28); ctx.lineTo(-27, -21); ctx.lineTo(-13, -12);
  ctx.closePath(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-13, -13); ctx.lineTo(-29, -22); ctx.lineTo(-32, -15); ctx.lineTo(-16, -9);
  ctx.closePath(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-15, -12); ctx.lineTo(-33, -15); ctx.lineTo(-32, -7); ctx.lineTo(-15, -7);
  ctx.closePath(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8, 16); ctx.lineTo(-20, 28); ctx.lineTo(-27, 21); ctx.lineTo(-13, 12);
  ctx.closePath(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-13, 13); ctx.lineTo(-29, 22); ctx.lineTo(-32, 15); ctx.lineTo(-16, 9);
  ctx.closePath(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-15, 12); ctx.lineTo(-33, 15); ctx.lineTo(-32, 7); ctx.lineTo(-15, 7);
  ctx.closePath(); ctx.stroke();
  // -- 翼面羽纹折线(多段线条,左翼 3 条 / 右翼对称) --
  ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(2, -14); ctx.lineTo(-6, -19); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(-2, -16); ctx.lineTo(-10, -18.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(-6, -17); ctx.lineTo(-14, -17); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10, 6); ctx.lineTo(2, 14); ctx.lineTo(-6, 19); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, 8); ctx.lineTo(-2, 16); ctx.lineTo(-10, 18.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2, 9); ctx.lineTo(-6, 17); ctx.lineTo(-14, 17); ctx.stroke();
  // -- 金色机身 --
  ctx.fillStyle = '#f5c94c';
  ctx.beginPath();
  ctx.moveTo(34, 0); ctx.lineTo(16, -4.5); ctx.lineTo(2, -9); ctx.lineTo(-12, -10);
  ctx.lineTo(-28, -8); ctx.lineTo(-36, -3.5); ctx.lineTo(-38, 0); ctx.lineTo(-36, 3.5);
  ctx.lineTo(-28, 8); ctx.lineTo(-12, 10); ctx.lineTo(2, 9); ctx.lineTo(16, 4.5);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#a5741f'; ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(34, 0); ctx.lineTo(16, -4.5); ctx.lineTo(2, -9); ctx.lineTo(-12, -10);
  ctx.lineTo(-28, -8); ctx.lineTo(-36, -3.5); ctx.lineTo(-38, 0); ctx.lineTo(-36, 3.5);
  ctx.lineTo(-28, 8); ctx.lineTo(-12, 10); ctx.lineTo(2, 9); ctx.lineTo(16, 4.5);
  ctx.closePath(); ctx.stroke();
  // -- 机身中央深红饰条(翼根至座舱前,座舱后画覆盖中段) --
  ctx.fillStyle = '#d84a4a';
  ctx.fillRect(-8, -2, 28, 4);
  // -- 双垂尾(机尾两侧,金色 + 深红描边) --
  ctx.fillStyle = '#f5c94c';
  ctx.beginPath();
  ctx.moveTo(-24, -7); ctx.lineTo(-33, -21); ctx.lineTo(-40, -16); ctx.lineTo(-33, -6);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-24, 7); ctx.lineTo(-33, 21); ctx.lineTo(-40, 16); ctx.lineTo(-33, 6);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#d84a4a'; ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-24, -7); ctx.lineTo(-33, -21); ctx.lineTo(-40, -16); ctx.lineTo(-33, -6);
  ctx.closePath(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-24, 7); ctx.lineTo(-33, 21); ctx.lineTo(-40, 16); ctx.lineTo(-33, 6);
  ctx.closePath(); ctx.stroke();
  // -- 座舱(金色渐变玻璃 + 深红框) --
  const canopyGrad = ctx.createLinearGradient(0, -3.4, 16, 3.4);
  canopyGrad.addColorStop(0, '#ffe9a0');
  canopyGrad.addColorStop(1, '#b8860b');
  ctx.fillStyle = canopyGrad;
  ctx.beginPath(); ctx.ellipse(8, 0, 8, 3.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d84a4a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(8, 0, 8, 3.4, 0, 0, Math.PI * 2); ctx.stroke();
  // -- 机尾深红条 --
  ctx.fillStyle = '#d84a4a';
  ctx.fillRect(-38, -2, 4, 4);
  // -- 机头金鹰徽记(深红环 + 鹰喙 + 金瞳) --
  ctx.strokeStyle = '#d84a4a'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(26, 0, 2.2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#d84a4a';
  ctx.beginPath();
  ctx.moveTo(23.5, -2); ctx.lineTo(29.8, 0); ctx.lineTo(23.5, 2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f5c94c';
  ctx.beginPath(); ctx.arc(26, 0, 1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
