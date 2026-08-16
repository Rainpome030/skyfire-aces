# 源码地图

`src/game/` 中的两位数字前缀同时表示构建顺序。当前构建仍将所有文件拼接到同一个 `<script>`，因此拆分不会改变原游戏的全局变量、执行顺序或单文件发布方式。

| 文件 | 职责 |
| --- | --- |
| `00-bootstrap.js` | Canvas 初始化、尺寸、安全区和通用工具 |
| `10-input.js` | 键盘、鼠标、触摸、按键设置与输入状态 |
| `20-audio.js` | 音效、引擎声和程序化音乐 |
| `30-game-state.js` | 配置、存档、玩家和全局游戏状态 |
| `40-world-entities.js` | 世界生成、敌机、Boss 和僚机实体 |
| `50-gameplay.js` | 粒子、伤害、玩家更新、武器和升级 |
| `60-missions-progression.js` | 任务、评级、成就、章节卡和结算数据 |
| `70-ui-flow.js` | 页面状态、设置、暂停、点击分发与过渡 |
| `80-camera.js` | 摄像机更新 |
| `81-render-foundation.js` | 渲染缓存、水面、岛屿、云层和太阳 |
| `82-render-aircraft.js` | 僚机、战机、残骸和锁定标记绘制 |
| `83-render-world.js` | 检查点和世界组合绘制 |
| `84-render-hud.js` | HUD、安全区、雷达、警告和触屏控件 |
| `85-render-screens.js` | 标题、机库、选关、结算、升级与设置界面 |
| `90-main-loop.js` | 主更新、主绘制和动画帧循环 |

## 修改流程

1. 在对应的 `src/game/*.js` 文件中修改代码。
2. 运行 `node scripts/build.mjs` 更新 `outputs/skyfire-aces.html`。
3. 运行 `node scripts/build.mjs --check` 和相关 `work/verify-*.mjs` 回归脚本。
4. 试玩验收后，再将开发版复制为新的 `dist/` 发布版本。

## 约束

- 不要直接编辑生成后的 `outputs/skyfire-aces.html`，否则下次构建会覆盖改动。
- 文件前缀和拼接顺序属于运行契约；调整顺序前必须检查全局依赖。
- 新增顶层变量或函数前先搜索同名标识符，避免共享作用域冲突。
- `dist/` 是发布记录，不应在未验收时覆盖。
