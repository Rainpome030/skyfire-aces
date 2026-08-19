# 苍穹之翼 Three.js 正式迁移版

这是现有《苍穹之翼》的独立 v2 运行入口，不是 `chi` 原型的复制品。当前版本通过只读桥接复用稳定版的任务、武器、升级、Boss、波次、僚机、存档、输入、HUD 与完整页面流程，并用 Three.js 接管战斗世界。

## 当前视觉基线

- 低 FOV 远景狗斗镜头，飞机明显小于 v1，但仍能辨认机头与阵营。
- 旧版 Canvas `x/y` 映射到 Three.js `x/z`，Three.js `y` 只表示高度。
- 自机、僚机和敌机使用程序化低多边形模型；敌我航迹使用蓝/绿/红区分。
- 三维海面、岛屿、云层、阴影、弹道、导弹、粒子和锁定标记。
- 保留设置中的“地图朝上 / 机头朝上”相机模式。
- 统一目标解算：锁定距离/射界/高度差和机炮射击解算由 `src/core/targeting.ts` 提供，锁定标记按进度变色。
- 迁移版采用自动机炮 + 主动导弹：机炮进入前向射界自动开火，导弹仍由锁定后玩家确认发射。
- WebGL 初始化或渲染异常时自动回退旧版二维世界，不影响菜单和玩法流程。

## 运行

```powershell
Set-Location v2/skyfire-three
npm install
npm run dev
```

打开 `http://127.0.0.1:4173/`。

## 验证

```powershell
npm test
npm run build
npm run smoke
npm run gate
```

`npm test` 固定检查左右转向、航向位移、模型朝向、目标方位和世界稳定相机约定。构建会先从仓库根目录的 `src/game/` 重新生成本地 legacy bridge bundle，生成物不会提交。

`npm run smoke` 会先构建，再启动临时预览服务器和无头 Chrome/Edge。它分别在桌面 `1440x900` 与手机竖屏 `375x667` 验证：页面启动、Three.js `ready/fallback` 标记、标题→任务选择→简报→战场的真实点击流程、页面无横纵溢出、控制台无错误。Chrome 不在默认安装位置时，可用 `SKYFIRE_CHROME_PATH` 指定可执行文件。`npm run gate` 串行执行纯函数测试和完整 smoke 门禁。

浏览器中 `document.documentElement.dataset.skyfireThree` 为 `ready` 时表示 Three.js 已接管战斗世界；为 `fallback` 时表示保留旧版二维渲染。

## 工程边界

- 不直接修改或发布 `dist/`。
- `src/legacy-bridge.js` 只读暴露现有玩法状态；Three.js 渲染器不得修改模拟对象。
- `src/core/` 固化正式坐标契约，`src/render/` 只负责画面。
- 详细系统保留清单与 M0-M6 迁移顺序见 `../MIGRATION.md`。
