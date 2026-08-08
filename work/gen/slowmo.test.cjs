/* 任务书 10 状态机自测:slowmo.js 触发/推进/结束/幂等 */
'use strict';
require('./slowmo.js');
const S = globalThis.SlowMo;
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  got=' + JSON.stringify(extra) : '')); }
}
function fresh() { S.active = false; S.t = 0; S.dur = 0.35; S.scale = 0.3; }

console.log('== T1 初始状态 ==');
fresh();
check('初始非激活', S.isActive() === false);
check('初始 scale=1', S.getScale() === 1);

console.log('== T2 触发(默认参数) ==');
fresh();
S.trigger();
check('触发后激活', S.isActive() === true);
check('默认 dur=0.35', S.dur === 0.35);
check('默认 scale=0.3', S.scale === 0.3);
check('getScale=0.3', S.getScale() === 0.3);

console.log('== T3 推进与结束 ==');
fresh();
S.trigger();
S.update(0.1);
check('0.1s 后仍激活', S.isActive() === true);
check('t 已推进', Math.abs(S.t - 0.1) < 1e-9);
S.update(0.25); // t=0.35
check('满 0.35s 后结束', S.isActive() === false);
check('结束后 scale=1', S.getScale() === 1);
check('t 钳制到 dur', S.t === S.dur);

console.log('== T4 幂等:更长覆盖 ==');
fresh();
S.trigger(0.2, 0.3);
S.update(0.1); // 剩余 0.1
S.trigger(0.5, 0.25); // 更长 -> 重置
check('更长覆盖后仍激活', S.isActive() === true);
check('重置 t=0', S.t === 0);
check('dur 更新为 0.5', S.dur === 0.5);
check('scale 更新', S.scale === 0.25);
S.update(0.5);
check('按新时长结束', S.isActive() === false);

console.log('== T5 幂等:更短不缩短 ==');
fresh();
S.trigger(0.5, 0.3);
S.update(0.1); // 剩余 0.4
S.trigger(0.2, 0.3); // 更短 -> 忽略
check('更短覆盖仍激活', S.isActive() === true);
check('t 未重置', Math.abs(S.t - 0.1) < 1e-9);
check('dur 未被缩短', S.dur === 0.5);
S.update(0.4);
check('按原剩余时间结束', S.isActive() === false);

console.log('== T6 多目标连击(连续 trigger 同参) ==');
fresh();
S.trigger(0.35);
S.update(0.3); // 剩余 0.05
S.trigger(0.35); // 更长 -> 重置
check('连击仍激活', S.isActive() === true);
check('连击重置 t', S.t === 0);
S.update(0.35);
check('连击后结束', S.isActive() === false);

console.log('== T7 防御输入 ==');
fresh();
S.trigger();
S.update(-1);
check('负 dt 忽略', S.t === 0 && S.isActive());
S.update(NaN);
check('NaN dt 忽略', S.t === 0 && S.isActive());
S.update('x');
check('字符串 dt 忽略', S.t === 0 && S.isActive());
S.trigger(0, 0);
check('非法参数回退默认', S.dur === 0.35 && S.scale === 0.3);
S.trigger(-5, 2);
check('非法参数回退默认2', S.dur === 0.35 && S.scale === 0.3);

console.log('== T8 结束后再触发 ==');
fresh();
S.trigger(0.1);
S.update(0.1);
check('结束态', S.isActive() === false);
S.trigger(0.2, 0.5);
check('可再次激活', S.isActive() === true);
check('新 scale 生效', S.getScale() === 0.5);
S.update(0.2);
check('再次结束', S.isActive() === false);

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
