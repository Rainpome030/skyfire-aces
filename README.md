# 苍穹之翼 · 单机空战

一款零外部资源、可直接在浏览器运行的 Canvas 2D 单机空战游戏。画面、界面、音效和音乐均由代码生成。

## 当前入口

- 开发源码：`src/game/`、`src/styles.css`、`src/index.template.html`
- 可运行开发版：`outputs/skyfire-aces.html`
- 稳定发布版：`dist/苍穹之翼-单机空战-v1.6.1.html`

开发时修改 `src/`，然后运行 `node scripts/build.mjs` 生成单文件开发版。通过试玩和回归检查后，再更新 `dist/` 中的发布文件。

## 运行

无需安装依赖或启动服务器，直接使用现代桌面浏览器打开 HTML 文件即可。

PC 端支持键盘和鼠标；移动端当前按手机竖屏、单手操作方向设计。

## 主要操作

- `W / S`：调整油门
- `A / D`：转向；快速双击执行滚筒
- `E`：突进
- `Shift`：加力
- `空格`：机炮
- `V`：导弹
- `P / Esc`：暂停
- 升级界面：`A / D` 或 `← / →` 循环选择，`空格`确认

所有按键均以游戏内设置页显示为准。

## 目录

- `src/game/`：按职责和加载顺序拆分的游戏源码，详见 `src/README.md`
- `src/styles.css`：页面与 Canvas 样式
- `src/index.template.html`：单文件 HTML 外壳
- `scripts/build.mjs`：将结构化源码构建为可直接打开的单 HTML
- `outputs/`：当前开发版本
- `dist/`：经过验收的发布版本与历史版本
- `work/verify-*.mjs`：回归检查脚本
- `work/gen/`：曾用于生成和集成功能片段的脚本
- `苍穹之翼-蓝图.md`：玩法与内容推进蓝图
- `苍穹之翼-开发方向规划书.md`：平台和长期开发方向

## 回归检查

在仓库根目录运行：

```powershell
node scripts/build.mjs --check
node work/verify-portrait-hud.mjs
node work/verify-mobile-nowrite.mjs
```

## 代码结构说明

当前运行版本保持“单 HTML、零依赖、直接打开”的发布方式；开发源码则按 Canvas、输入、音频、游戏状态、敌机、任务、更新、绘制、HUD 和界面拆分，并保留了较多中文注释。

为了保持现有行为，当前源文件仍按顺序拼接并共享同一脚本作用域。后续同时推进 PC 端和小游戏平台时，可以在这些边界上继续收紧模块接口。

## 许可证

项目暂未选择开源许可证。在项目负责人明确许可证前，默认保留全部权利，不代表允许公开再发布或商业使用。
