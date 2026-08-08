/* ============================================================
 * 击杀慢镜模块 SlowMo(任务书 10)
 * 项目:《苍穹之翼·单机空战》 单文件 Canvas 2D 空战游戏
 * 文件:work/gen/slowmo.js(纯 JS 片段,IIFE 封装 var SlowMo,供总控集成)
 *
 * 职责:精英敌机(big 击杀)被击坠时短暂减速游戏时间,增强打击感。
 * 设计:
 *  - 慢镜只影响"游戏时间流速",不影响自身计时器:
 *    update(dt) 必须由总控传入【真实 dt】(未缩放),自身推进不受 scale 影响。
 *  - 无缓入缓出:0.35s 很短,硬切即可;结束后 getScale() 直接回到 1。
 *  - 幂等覆盖策略(见 trigger 注释):已激活时若新 duration 更长则重置计时,
 *    更短则保持原剩余时间,保证"多目标同时击坠"时取最长慢镜。
 *  - 仅暴露全局名 SlowMo,不定义 loop/update 等与主文件冲突的全局名。
 * ============================================================ */
(function (global) {
  'use strict';

  var SlowMo = {
    active: false, // 是否处于慢镜状态
    t: 0,          // 已推进的真实时间(秒)
    dur: 0.35,     // 慢镜持续时长(秒)
    scale: 0.3     // 时间缩放系数(0 < scale < 1)

    /**
     * 激活慢镜(幂等)。
     * @param {number} [duration=0.35] 持续秒数;<=0 或非数字时回退默认
     * @param {number} [scale=0.3]     时间缩放系数;非 (0,1) 区间时回退默认
     * 幂等规则:已激活时——
     *   - 新 duration > 当前剩余时间:重置 t=0、dur=新 duration(取更长覆盖);
     *   - 新 duration <= 当前剩余时间:保持原剩余时间(不缩短,防抖动);
     *   - scale 始终更新为新值。
     */
  };
  SlowMo.trigger = function (duration, scale) {
    var d = (typeof duration === 'number' && isFinite(duration) && duration > 0) ? duration : 0.35;
    var s = (typeof scale === 'number' && isFinite(scale) && scale > 0 && scale < 1) ? scale : 0.3;
    if (this.active) {
      // 已激活:取更长覆盖;更短则忽略,避免多目标连击时被反复缩短
      var remaining = this.dur - this.t;
      if (d > remaining) {
        this.t = 0;
        this.dur = d;
      }
      this.scale = s;
    } else {
      this.active = true;
      this.t = 0;
      this.dur = d;
      this.scale = s;
    }
  };

  /**
   * 用【真实 dt】(秒)推进计时;结束后 active=false。
   * 防御:负值 / NaN / 非数字 dt 一律忽略,防止状态卡死。
   */
  SlowMo.update = function (dt) {
    if (!this.active) return;
    if (typeof dt !== 'number' || !isFinite(dt) || dt <= 0) return;
    this.t += dt;
    if (this.t >= this.dur) {
      this.active = false;
      this.t = this.dur; // 钳制,便于断言
    }
  };

  /** 返回当前时间缩放:慢镜中返回 scale,否则 1。 */
  SlowMo.getScale = function () {
    return this.active ? this.scale : 1;
  };

  /** 是否处于慢镜状态。 */
  SlowMo.isActive = function () {
    return this.active;
  };

  // 仅暴露 SlowMo 一个全局名(浏览器挂 window,Node 测试挂 globalThis)
  global.SlowMo = SlowMo;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
