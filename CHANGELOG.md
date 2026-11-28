# 更新日志（CHANGELOG）

## 2.6.3 — 统一骑行界面与玩法提示

- 驾驶仪表跨车型和玩法保持同一位置。计时、校园闪送、影子追捕、联机捉人共用左上状态区，导航、警告、检查点反馈和夜骑提示各有位置。漏过检查点和回归赛道的提示可与下一站同时显示，手机横竖屏沿用相同的信息顺序。关联 `src/index.html` 与 `src/styles/hud-compact.css`。
- 玩法提供计时、任务、警告和阶段提示的显示状态，`src/ui/scene-hud.js` 统一控制显隐和内容。切换玩法清除前一模式的提示，开关俯视地图沿用当前的倒计时、暂停或结算状态。关联 `src/ui/race-hud.js`、`src/ui/mode-hud.js` 与 `src/ui/map-controls.js`。
- 桌面版优先迁移同级的 2.6.2 存档，按当前安装包型匹配，并在存档损坏时继续尝试可用备份。关联 `server/server.mjs`、`scripts/verify-save.mjs` 与 `scripts/verify-desktop-start.mjs`。
- 通过 `npm run lint`、`npm run typecheck`、`npm run build:release` 与 `npm run verify:all -- --skip-build` 的 18 项检查。覆盖计时、闪送、追捕和夜骑的切换，地图开关与暂停提示，四种手机尺寸下 150% 缩放，以及真实联机捉人和离房清理。运行时快照基线沿用已发布 v2.6.0。

## 2.6.2 — 统一驾驶 HUD 与坡度读数

- 统一四种车型的驾驶 HUD。速度、路面、坡度和道路名使用固定位置，坡度从当前骑行世界查询读取。风况并入驾驶状态区，与积水、尾流及自行车骑姿共用提示样式。手机紧凑布局允许状态并存，夜骑按触屏或键盘显示摇铃提示。关联 `src/ui/hud-controls.js`、`src/ui/app.js`、`src/ui/mode-hud.js` 与 `src/styles/hud-compact.css`。
- 桌面版优先迁移同级的 2.6.1 存档，同版本优先匹配当前安装包型。关联 `server/server.mjs`、`scripts/verify-save.mjs` 与 `scripts/verify-desktop-start.mjs`。
- 通过 `npm run lint`、`npm run typecheck`、`npm run build:release` 与 `npm run verify:all -- --skip-build` 的 18 项检查。浏览器覆盖四车型真实正负坡度、平路、自由与计时的共用路况，以及四种手机尺寸下 150% 缩放的驾驶信息和夜骑触控。四人联机、存档迁移和性能验证通过，沿用已发布 v2.6.0 的运行时基线。

## 2.6.1 — 地形断层与桥面通行修复

- 共享骑行物理在贴地前沿位移检测向上的地形断层。超过 0.40 米的单级断面触发减速和沿边滑移，连续坡面按细分高度样本判断。斜向避让和车辆接触推挤也检查过渡，重叠的桥面与地面分别取高。关联 `src/ride/physics.js`、`src/ride/terrain-transition.js` 与 `src/data/surfaces.js`。
- 高地上恰好 0.40 米的台阶可以通过，桥面埋入地面时按地面高度判断断层。`node scripts/verify-terrain-transition.mjs` 纳入快速和全量检查，覆盖四车型、倒车、斜撞、落崖、连续陡坡、窄脊、桥面分层和车辆推挤。深大立交和顺峰山三条捷径通过实际移动探针。
- 桌面版优先迁移同级 2.6.0 存档。同版本优先读取与当前安装包型匹配的存档。关联 `server/server.mjs`、`scripts/verify-save.mjs` 与 `scripts/verify-desktop-start.mjs`。

- 日常运行时对拍从入库快照读取参考值。快照从已发布 v2.6.0（`7d86888`）采集，与 v2.5.7 核对了 20 条赛道、3 张地图、9 次固定跑圈和四车型轨迹。关联 `scripts/verify-esm-parity.mjs`、`scripts/verify-all.mjs` 与 `scripts/fixtures/runtime-baseline.json`。
- 通过 `npm run build`、`npm run lint`、`npm run typecheck`、`npm run build:release -- --bundle-node` 和 `npm run verify:all -- --skip-build` 的 18 项检查，覆盖地图、资产、确定性、桌面和手机浏览器、四人联机与性能。用 `node scripts/verify-desktop-start.mjs --portable` 验证解压后的免安装包在空 `PATH` 下启动、迁移存档和建房。沿用地图、资产和性能基线，运行时对拍使用上述 v2.6.0 快照。

## 2.6.0 — 动力车五槽改装与预算策略

- 越野小摩托增加制动分配与出弯牵引，电自增加车架几何与超频回收，轮椅增加制动响应与双电机分配。新增槽位各提供 ¥0 原厂件和两种合法取舍。现有配件价格与违禁清单沿用，动力火箭继续独立计算。关联 `src/data/parts.js`、`src/data/tuning-190.cjs` 与 `src/ride/physics.js`。
- 三种动力车的 ¥700 档分别允许 272、270 和 301 套合法搭配，均少于全目录的 432 套。穷举三车型的 ¥400 与 ¥700 合法配装，比较无风干直道、雨地带刹转向和短陡坡，六组均无同时在三个工况领先的构筑。动力二手光头胎的铺装加成收敛至 1.5%、滚阻系数 0.94，保留廉价干地定位与原雨地代价。
- 车库按配件目录显示槽位，沿用通用数值、预算高亮和发车锁定。2.5.7 桌面存档可迁移，历史三槽配装读取为新增槽位的原厂件。联机升级到协议 v4，采用同一套五槽核价、技能效果和发车配置。关联 `src/ui/workshop-ui.js`、`server/server.mjs` 与 `server/verify.mjs`。

- 调整自行车二手光头胎、各车型二手轻框和电自合法电控。电自新国标原厂保留 ¥0、25 km/h 与原草地表现，标准、强扭、平顺电控的铺装上限为 45、42、42 km/h。价格表与违禁规则沿用现有配置。关联 `src/data/parts.js`。
- 自行车火箭收敛冲刺峰值并提高消耗。三种动力车型的火箭改为技能键触发，爆发 2 秒、冷却 8 秒，替代原主动技能。HUD 显示就绪、爆发与冷却，持续按键、发车倒计时和返场均按同一计时规则处理。关联 `src/data/vehicle-skills.js`、`src/ride/physics.js`、`src/race/time-trial.js` 和 `src/ui/hud-controls.js`。
- 车库能力栏增加雨地抓地、雨地带刹抓地与雨地直线制动，按同车型原厂在无积水湿铺装下的表现比较。自行车原越野湿地综合项改为草地表现。关联 `src/ui/workshop-ui.js`、`src/ride/vehicles.js` 和 `scripts/verify-browser.mjs`。
- 平衡改动通过 `npm run verify:all -- --skip-build` 的 17 项检查。雨地面板完成后重跑 `npm run build`、`npm run lint`、`npm run typecheck`、`npm run verify:fast -- --skip-build` 与 `node scripts/verify-browser.mjs`。车库选装及 Shift 火箭烟测通过，面板接入前后的干地、雨地与爬坡物理对照一致。沿用地图、资产、物理与性能验证基线。
- 四种车型的速度仪表统一显示实时抓地余量与技能百分比。抓地余量沿用各车型当下的横向转向极限，包含路面、雨地、带刹和甩尾修正。车库将六项同口径能力放在相同位置，后接车型特色项。关联 `src/ride/physics.js`、`src/ui/hud-controls.js` 与 `src/ui/workshop-ui.js`。
- 仪表和车库统一通过 `npm run build`、`npm run lint`、`npm run typecheck`、`npm run verify:fast -- --skip-build`、`node scripts/verify-deterministic-race.mjs` 与 `node scripts/verify-browser.mjs`。浏览器覆盖四车型转向读数、车库顺序和三个手机尺寸的仪表布局。沿用现有验证基线。
- 2.6.0 通过 `npm run lint`、`npm run typecheck`、`npm run build:release` 与 `npm run verify:all -- --skip-build` 的 17 项检查，覆盖桌面和手机五槽、联机过预算及旧协议拒绝、四人 WebRTC、存档迁移和性能。沿用现有地图、资产、原厂物理及性能基线。

## 2.5.7 — 桌面存档恢复与联机比赛修复

- 同一桌面安装写盘失败后，重开会保留有效的更快个人最佳，以及尚待写盘的手动导入成绩。临时写入失败会在设置中提示并重试。采集存档时一次枚举安装内的存储键。关联 `src/ui/save-sync.js`、`src/core/browser-storage.js` 和 `scripts/verify-browser.mjs`。
- 普通联机赛通过姿态包同步有效赛程，可区分同一位置的不同圈次。旧客户端继续使用原姿态包，多圈进度不足时暂缓显示实时名次。房间连续换线时只采用最新路线，服务端拒绝针对过期路线发出的准备和发车请求。关联 `src/online/client.js`、`server/server.mjs` 和 `scripts/verify-four-player.mjs`。
- 联机捉人按本轮退赛记录计算存活人数，退赛骑手从雷达和拦截候选中移除。关联 `src/race/online-chase.js`、`src/ui/mode-hud.js` 和 `scripts/verify-route-builder-chase.mjs`。
- 桌面版优先从同级 2.5.6 轻量版或 Windows 免安装版迁移存档，同版本优先匹配当前包型。关联 `server/server.mjs`、`scripts/verify-save.mjs` 和 `scripts/verify-desktop-start.mjs`。
- 通过 `npm run lint`、`npm run typecheck`、`npm run build`、`npm run build:release -- --bundle-node`、`npm run verify:all -- --skip-build` 的 17 项检查及 `node scripts/verify-four-player.mjs --network-only --drive`。便携 ZIP 解压后用 `node scripts/verify-desktop-start.mjs --portable` 验证了包内 Node.js 启动、2.5.6 存档迁移与建房。地图、资产、物理和性能沿用现有基线。

## 2.5.6 — 桌面存档隔离、玩法成绩与联机修复

- 桌面版按安装实例隔离浏览器缓存和友人档案，读取该安装的磁盘快照后才开启自动保存。服务端校验写入请求的安装身份，防止旧标签页在端口复用后覆盖另一份存档。旧的无实例标记浏览器缓存原样保留，桌面恢复沿用磁盘存档和同级版本迁移。关联 `src/core/browser-storage.js`、`src/ui/save-sync.js`、`src/replay/ghost.js` 和 `server/server.mjs`。
- 从同级 2.5.4 升级时优先读取上一版存档，并支持 Windows 免安装版和轻量版的解压目录名。关联 `scripts/verify-save.mjs` 和 `scripts/verify-desktop-start.mjs`。
- 影子追捕和夜骑盲区的进度进入备份和桌面存档，最佳成绩按方向、圈数和车型记录。导入写入失败时回滚本次已写入的个人数据。关联 `src/ui/save-sync.js`、`src/race/chase.js` 和 `src/race/blind-nav.js`。
- 耐力赛分段单练只展示该段的完赛结果。普通联机赛按房间规则发车，实时排名使用远端姿态的 X/Z 坐标。关联 `src/race/race-review.js`、`src/race/launch-options.js`、`src/ui/app.js` 和 `src/online/client.js`。
- 手机预览默认从当前构建清单选取并校验 HTML。GitHub 导出在候选源码的隔离副本完成依赖安装和测试，通过后再替换旧导出。关联 `scripts/serve-phone.mjs`、`scripts/stage-release.mjs` 和 `scripts/verify-release-staging.mjs`。
- 耐力单练的浏览器验收通过固定物理步进完成骑行，完赛后仍检查三次实际游戏帧更新，避免托管 CI 的渲染帧率触发自动暂停。2.5.5 标签的发布流程在浏览器验收失败后停止，本版接续发行。关联 `scripts/verify-browser.mjs`。
- 通过 `npm run lint`、`npm run typecheck`、`npm run build`、`npm run build:release` 和 `npm run verify:all -- --skip-build` 的 17 项检查。Chrome 覆盖同端口双安装、导入写入失败及回滚失败、耐力单练实骑、联机预选追捕后的发车与实时排名。隔离导出通过 12 项快速检查，桌面 ZIP 和手机 HTML 的 SHA-256 一致。沿用原有基线。
- 移除未接入当前验证流程的旧版桌面验收脚本 `server/browser.mjs`、`server/browser-mock.js` 和 `server/verify-version-folder.mjs`，归档历史性能采样报告。通过 `npm run build`（临时输出）、`npm run typecheck`、`npm run verify:hygiene` 和 `npm test -- --skip-build`。正式基线校验值一致。

## 2.5.4 — 联机复赛、存档兼容与发布验收

- CI 的四客户端联机验收完成场景初始化后暂停持续绘制，覆盖实际 WebRTC、骑行状态、重连和 BO1 复赛。桌面与手机浏览器验收继续覆盖完整渲染。关联 `scripts/verify-four-player.mjs` 和 `.github/workflows/ci.yml`。
- 验收结束时通过 DevTools 关闭 Chrome，等待进程退出后再清理临时配置目录。关联 `scripts/browser-runner.mjs`。

- 联机比赛和轮次分别使用服务端身份。BO1 结算后，同一房间可以连续开跑同一赛道，旧轮次的完赛请求会被拒绝。浏览器联机验收覆盖只改天气的复赛。关联 `server/room-rules.cjs`、`server/server.mjs`、`src/online/client.js` 和 `scripts/verify-four-player.mjs`。
- 桌面端按版本查找轻量版和 Windows 便携版的解压目录，同版本优先匹配当前包型。实例按规范化后的存档位置识别。关联 `server/server.mjs`、`scripts/verify-save.mjs` 和 `scripts/verify-desktop-start.mjs`。
- 备份包含自定义骑手皮肤库，并兼容从旧备份的驾驶员记录恢复内嵌模型。友人影子档案超限时，导出和自动存档回退到可导入的个人存档并提示，桌面端保留已保存的友人档案。友人对战列表复用导入时的路线布局校验，支持重玩青云湖等固定赛道变体。关联 `src/ui/save-sync.js`、`src/ride/rider-skin.js`、`src/ride/vehicles.js`、`src/replay/ghost.js` 和 `src/ui/friend-duel.js`。
- 手机验收和发行暂存按本次构建清单取文件，校验文件内容，手机文件缺失直接失败。Pages 和 Release 等同一提交的 CI 通过后运行，Release 从暂存的 Windows ZIP 解压，使用包内 Node.js 验收启动和建房。关联 `scripts/build.mjs`、`scripts/build-manifest.mjs`、`scripts/stage-release.mjs`、`scripts/verify-browser.mjs` 和 `.github/workflows/`。
- 通过 `npm run lint`、`npm run typecheck`、`npm run build`、`npm run build:release:win`、`npm run release:stage -- --skip-build`、`npm run verify:all -- --skip-build` 的 17 项检查和 `actionlint`。从暂存 ZIP 解压后以空 `PATH` 运行 `node scripts/verify-desktop-start.mjs --portable`，验证存档迁移、双安装隔离与建房。地图、资产、物理及性能沿用现有基线。
- 手机 HUD 布局验收通过游戏的固定物理步进完成发车倒计时，覆盖原有的引导、触控和相机布局断言。通过 `node scripts/verify-browser.mjs`、`npm run lint` 和 `npm run typecheck`。地图、资产和物理基线沿用原有数据。
- `scripts/verify-hygiene.mjs` 报告 `src/ui/app.js` 行数，超过 1700 行时给出职责边界审阅提示并继续执行校验。同步开发指导、工作指南、贡献说明和 PR 模板。通过 `npm run lint`、`npm run typecheck` 和 `npm test`，并验证 1700 行、1701 行及提示后触发其他校验错误的行为。沿用现有基线。

## 2.5.3 — 存档、工坊影子、联机轮换与发行修复

- 导入备份时刷新受影响的个人最佳缓存，并在返回自由骑行或重新发车时应用恢复的车辆配置，保持当局配件和发车资格一致。关联 `src/ui/save-sync.js`、`src/race/time-trial.js` 和 `src/ui/workshop-ui.js`。
- 路线工坊影子随文件保存 R1 路线码。导入时重建路线并校验地图、赛道、方向与圈数、布局及检查点数量，支持在友人对战列表重玩。关联 `src/replay/ghost.js` 和 `src/ui/friend-duel.js`。
- 联机捉人由服务端从在房玩家中轮换捉人者，比分结算保留离场记录。轮间预告读取服务端房间状态。关联 `server/room-rules.cjs`、`server/server.mjs` 和 `src/race/online-chase.js`。
- GitHub 导出在独立暂存目录完成校验，只替换内容完整的旧导出。当前版本性能检查独立运行并对帧耗时、JS 堆和浏览器进程内存设立上限，历史对比通过显式参数启用。关联 `scripts/stage-release.mjs` 和 `scripts/verify-performance.mjs`。
- Windows 便携包要求提供完整的 Node.js 许可。发行工作流校验官方 Windows x64 归档的 SHA-256 后从同一归档取用二进制和许可。桌面启动器优先迁移同级 2.5.2 存档。关联 `scripts/build.mjs`、`.github/workflows/release.yml` 和 `server/server.mjs`。
- 通过 `npm run lint`、`npm run typecheck`、`npm run build:release:win`、`npm run verify:fast -- --skip-build`、导出源码树内的 `npm test` 与 `npm run verify:all -- --skip-build`。核对附件 SHA-256、官方 Node.js 许可及空 `PATH` 建房。地图、资产、物理和历史性能基线沿用原有数据。

## 2.5.2 — Windows 免安装便携 Node.js 运行时发行包

- **自定义导入角色四肢动态联动（兼容无四肢/Q 版角色）**：新增 `// @ts-check` 契约模块 [src/ride/skin-animation.js](src/ride/skin-animation.js) 并接入 [src/ride/models.js](src/ride/models.js)、[src/ui/app.js](src/ui/app.js) 与 [src/data/rider-skin-prompt.js](src/data/rider-skin-prompt.js)；依据 `anchor`（`leftHand`/`rightHand`/`leftFoot`/`rightFoot`）及兜底四肢命名自动识别左右臂与左右腿，骑行自行车时恢复曲柄脚踏旋转并驱动腿脚自适应踩踏、手臂/手随车把转向，电自与越野小摩托同步驱动手臂随车把转向；未标四肢或无四肢角色与耳/尾配饰保持原样静态随车体动作，协议 `schemaVersion` 与 `skinSpecHash` 保持兼容，并在 [scripts/verify-data.mjs](scripts/verify-data.mjs) 新增四肢与无肢模型探针校验。
- **新增内置 Node.js 的 Windows 免安装完整版**：[scripts/deterministic-zip.mjs](scripts/deterministic-zip.mjs) 支持 `zlib.crc32` 与按大文件自动切换压缩级别及外部文件条目映射；[scripts/build.mjs](scripts/build.mjs) 新增 `--bundle-node`（对应 [package.json](package.json) 的 `npm run build:release:win`），生成额外包含 `runtime/node.exe`（Node.js 22 win-x64 便携运行时）与 `runtime/NODE-LICENSE.txt` 的 **`forzero-budget-windows-x64-2.5.2.zip`**，玩家解压后直接双击 `启动游戏.bat` 即可开启应用壳自动存档与房主建房，无需电脑提前安装 Node.js。
- **保持 GitHub 主干轻量无二进制**：[scripts/stage-release.mjs](scripts/stage-release.mjs) 自动识别并暂存 `forzero-budget-windows-x64-2.5.2.zip` 至 Release 附件目录，同时显式阻止 `.exe`/`.zip` 进入 `repo/` 源码树；[.github/workflows/release.yml](.github/workflows/release.yml) 切换至 `windows-latest` 执行 `npm run build:release -- --bundle-node`，在推送 `v*` 标签后自动同时上传 Windows 免安装完整版、轻量版与手机离线单文件至 GitHub Releases。
- **启动器缺失提示与离线建房防误触**：[server/start-game.bat](server/start-game.bat) 在轻量版未检测到 `node.exe` 时明确提示可改用 `forzero-budget-windows-x64-*.zip` 免装版或安装 Node.js 22+（停留 8 秒便于阅读）；[src/online/client.js](src/online/client.js) 在 `file://` 离线网页或 `*.github.io` 静态站点模式下禁用「创建房间」按钮并展示双语引导（填入 IP 仅解锁「加入房间」不再误导本地建房），同步在 [src/data/english-text.js](src/data/english-text.js) 与 [scripts/verify-data.mjs](scripts/verify-data.mjs) 补齐双语校验；版本同步升级至 `2.5.2`，`server/server.mjs` 与 `scripts/verify-save.mjs` 新增同级 `2.5.1.1` 存档优先迁移。
- 通过 `npm run typecheck`、`npm run lint`、`npm run build:release:win`、无系统 Node 环境（清空 `PATH` 仅运行解压包内 `runtime\node.exe`）建房实测、`npm run verify:fast -- --skip-build`、`node scripts/verify-browser.mjs`、`node scripts/verify-four-player.mjs` 与导出仓库独立校验。

## 2.5.1.1 — 联机错误双语诊断与源码直启路径修复

- **修复源码目录直接启动 `server/server.mjs` 的遗留路径报错**：[server/server.mjs](server/server.mjs) 找不到同级 `index.html` 时的回退构建路径由已移除的 `../ride-update/release/` 修正为 `../dist-v2/desktop/`，并在缺失构建产物时给出明确的中英文 `npm run build` 提示；`previousSaveFile` 新增同级 `forzero-budget-2.5.1/save/player-data.json` 优先迁移并向后兼容 `2.5.0` 及前序版本。
- **细化 `Failed to fetch` 双语联机错误提示**：[src/online/client.js](src/online/client.js) 为 `onlineRequest` 补充 HTTPS/HTTP 混合内容拦截提示、请求超时提示、本机应用壳连接失败提示（提示通过 `启动游戏.bat` 重启并放行 `127.0.0.1` 代理/防火墙）、远端房主不可达提示及 GitHub Pages / 静态站点无法直接开房的引导文案；同步在 [src/data/english-text.js](src/data/english-text.js) 补全全部 5 条新增提示的完整英文翻译，并在 [scripts/verify-data.mjs](scripts/verify-data.mjs) 增加双语断言覆盖。
- **版本升级至 `2.5.1.1`**：同步更新 `package.json`、`package-lock.json`、`scripts/build.mjs`、`src/index.html`、`server/README.md`、`README.md`、`FORZERO-WORK-GUIDE.md` 与 `scripts/verify-save.mjs`；通过 `npm run typecheck`、`npm run lint`、`npm run build:release`、`npm run verify:fast -- --skip-build`、`node scripts/verify-browser.mjs`、`node scripts/verify-four-player.mjs` 与导出仓库独立校验。

## 2.5.1 — AST 静态检查、`server/` 目录迁移与工程治理

- **双平台 CI 与零警告门禁**：[.github/workflows/ci.yml](.github/workflows/ci.yml) 新增 `ubuntu-latest` + `windows-latest` 双系统矩阵覆盖 Windows 桌面启动器与路径兼容；清理全仓 34 处无用导入/变量并将 `no-unused-vars` 升级为 `error`，`npm run lint` 达到 0 errors、0 warnings。
- **CI 补齐无头浏览器 E2E**：[scripts/browser-runner.mjs](scripts/browser-runner.mjs) 补充 Linux/macOS Chrome/Chromium 路径探测与 `--disable-dev-shm-usage`；[.github/workflows/ci.yml](.github/workflows/ci.yml) 新增 `browser-e2e` 任务在 `ubuntu-latest` 上自动执行 `node scripts/verify-browser.mjs`（覆盖桌面/手机双语、全屏视角、Ghost 导入、每周种子赛、3 圈 AI 与触屏自适应）。
- **AST 级静态分析与依赖修复**：新增 `eslint.config.mjs`（开发期 `devDependencies` 引入 `eslint` + `globals`，浏览器与联机服务端继续保持零第三方运行时依赖），`npm run lint` 在仓库卫生检查前强制运行 `no-undef`、`no-unreachable` 等语法级检查；收口 `src/debug-bridge.js` 为单一 `globalThis.__FORZERO__` 命名空间并显式补齐 `src/online/client.js` 中 `buildBike` 导入。
- **彻底剥离公开仓库遗留目录**：将活跃的联机服务端与规则模板从 `szu-litchi-dev/online/` 迁移至顶层 `server/`，将 `szu-litchi-dev/rounds/drive-path.js` 迁至 `scripts/lib/drive-path.js`；公开仓库彻底移除 `szu-litchi-dev/`（本地 `szu-litchi-dev/` 保留作离线 `1.9.1.1` 对拍）。
- **版本与存档迁移**：按规范升级至 `2.5.1`（`package.json`、`package-lock.json`、`scripts/build.mjs`、`src/index.html`、`server/README.md`、`README.md`），`server/server.mjs` 优先发现并迁移同级 `2.5.0` 与 `2.4.0` 存档（同步扩展 `scripts/verify-save.mjs`、`scripts/verify-browser.mjs` 动态读取 `package.json` 版本号）。
- **纯函数通用小件资产库归拢（零几何回归）**：将散落在 `geometry.js`、`campus-v220.js` 及三张地图主文件中的树（`emitLowTree`、`emitMountainTree`、`emitGatePalm` → [src/world/assets/trees.js](src/world/assets/trees.js)）、栏杆/边界（`emitStoneRail`、`emitIronGateRail`、`emitLowHedgeBorder`、`emitSlopedCourtRail` → [src/world/assets/rail-fence.js](src/world/assets/rail-fence.js)）、街具与护桩（`emitParkBench`、`emitCourtyardBench`、`emitPlanter`、`emitTrailPost` → [src/world/assets/street-furniture.js](src/world/assets/street-furniture.js)）及三图车流载具（`emitCityTrafficVehicle`、`emitParkShuttleVehicle` → [src/world/assets/traffic-vehicles.js](src/world/assets/traffic-vehicles.js)）收拢并统一从 [src/world/assets/index.js](src/world/assets/index.js) 导出；`src/world/assets/` 纯模块（`index`/`trees`/`rail-fence`/`street-furniture`/`traffic-vehicles`/`barriers`/`lamps`）全量启用 `// @ts-check` + JSDoc 契约，并在 `scripts/verify-assets.mjs` 新增 13 类小件纯函数隔离与几何探针，三图 SHA-256 几何快照逐字节保持一致。
- **渐进式 JSDoc 类型契约与双平台类型门禁**：`devDependencies` 新增 `typescript`（运行时零依赖不变），`package.json` 新增 `npm run typecheck`（`tsc -p jsconfig.json --noEmit`）并保持 `jsconfig.json` `"checkJs": false` 避免存量 WebGL/地图文件噪音；为 5 个核心纯逻辑契约模块（`src/race/seed-code.js`、`src/race/route-code.js`、`src/race/route-key.js`、`src/ride/rider-skin.js`、`src/race/online-chase.js`）启用 `// @ts-check` 与完整 JSDoc `@typedef` 契约，接入 `.github/workflows/ci.yml`（Ubuntu + Windows）及 `scripts/verify-hygiene.mjs`，并在 `AGENTS.md`、`CONTRIBUTING.md` 与 `FORZERO-WORK-GUIDE.md` 固化后续 Agent 与社区 PR 规范。
- 通过 `npm run typecheck`、`npm run lint`、`npm run build:release`、`npm run verify:fast -- --skip-build`、`node scripts/verify-drafting-ai.mjs`、`node scripts/verify-deterministic-race.mjs`、`npm run verify:map-assets-perf`、`npm run release:stage -- --skip-build`、`npm run release:github -- --skip-build` 及导出仓库独立 `npm test` / ESLint / `tsc` 校验（同步保留前序 `npm run verify:all` 全量浏览器/联机/性能/对拍基线）；玩法、地图、资产与物理基线保持不变。

## 2.5.0 — 联机捉人、可视化路线工坊与工程健康重构

- 新增 **「联机捉人 · 1 追 N（三轮轮换）」** 联机赛制（`src/data/modes.js`、`szu-litchi-dev/online/room-rules.cjs`、`szu-litchi-dev/online/server.mjs`、`src/race/online-chase.js`、`src/online/client.js`、`src/ui/mode-hud.js`）：2–4 人房间轮流担任捉人者（3 轮），开局统一倒计时后逃跑者先发 6 秒；支持非对称视野显形（55m/85m）、每 4 秒周期雷达多目标扫描与逼近感知、8.5m/3.5m 服务端 `tag` 拦截判定、全抓即时结算或 120 秒超时脱逃计分，并将 `chase` 角色、抓获耗时与总分完整接入房间列表与战绩统计。
- 新增 **「地图点选路线工坊」**（`src/world/route-builder.js`、`src/ui/map-controls.js`、`src/ui/minimap.js`、`src/world/seed-courses.js`、`src/core/state.js`）：在全屏俯视地图 `.map-tools` 接入二次面板开关，支持深大粤海与伦敦 Bloomsbury 路网节点高亮与鼠标点选连线（Dijkstra 防急转回溯寻路 + 闭环/撤销/清空），实时生成可分享 `R1...` 路线代码并一键构建可直接开跑和建房的自定义赛道（同步补齐 `makeNetworkCourse` 的 `cityAccess`、`referenceCornerScores` 与伦敦弯道修正，并入 `availableCourses` 列表）。
- 升级 **`liveDeltaMs` 参考影子速度曲线实时插值**（`src/race/records.js`）：利用 `reference.samples` 在 `[refPrev, refNext]` 区间内的真实里程-时间曲线进行二分反查，消除平路与爬坡/碎石混段间的实时领先/落后秒数漂移，并保留无采样数据时的线性回退。
- 工程健康与版本同步：
  - 新增单源共享规则真源 `src/data/shared-rules.cjs`（`ONLINE_CHASE_RULES`、`ROUTE_RULES`、`CAMPUS_NETWORKS`、`SKIN_CONSTANTS`）与服务端桥接 `szu-litchi-dev/online/shared-rules.cjs`，`src/data/{modes,routes,rider-skins}.js` 与 `szu-litchi-dev/online/{room-rules.cjs,route-rules.cjs,server.mjs}` 统一引用；`scripts/build.mjs` 同步复制 `shared-rules.cjs` 至桌面产物/ZIP，并开启 esbuild `metafile: true` 输出 Top 6 源码体积构成。
  - 从 `src/ui/app.js` 增量拆分 `src/ui/seed-dialog.js`、`src/ui/map-controls.js`、`src/ui/friend-duel.js`、`src/ui/medal-travel.js`、`src/ui/workshop-ui.js` 与 `src/ui/settings-dialog.js`（`app.js` 降至 1,686 行），补全 `src/data/english-text.js` 全部新增双语词条。
  - 渲染相位平滑与自定义路线显存回收：`src/race/time-trial.js` 新增只读 `previousRiderPose` 与 `interpolatedRiderPose()` 供 `drawScene` 采样（物理状态保持整数步进确定性）；`drawScene` 切图/换线时主动 `dispose()` 过期自定义 `networkEdges` 路线网格，防止 `routeMeshes` 累积。
  - 新增统一静态门禁 `scripts/verify-hygiene.mjs`（版本一致性、`.cjs` 双侧同源、`app.js` 行数上限、Pure Asset/零第三方运行时依赖、`src/entry.js` 零全局命名空间污染、CI/Pages/Release 工作流完整性与英文词条全覆盖）、一键回归编排 `scripts/verify-all.mjs` 与发行暂存/分包器 `scripts/stage-release.mjs`（`package.json` 暴露 `test`、`lint`、`verify:*` 与 `release:*` 脚本）；并将版本硬编码验证脚本语义化重命名为 `verify-drafting-ai.mjs`、`verify-deterministic-race.mjs`、`verify-chase-blind.mjs` 与 `verify-route-builder-chase.mjs`。
  - 收口全局调试桥接并补齐 GitHub 工程配套：新增 [src/debug-bridge.js](src/debug-bridge.js) 将测试钩子收口为单一 `globalThis.__FORZERO__` 命名空间，简化 `src/entry.js`；补齐 `.github/workflows/ci.yml`（push/PR 主干自动化测试）、`CONTRIBUTING.md`、`SECURITY.md`、`.editorconfig`、`.gitattributes`、`jsconfig.json` 与 Issue/PR 模板；公开仓库导出包 `release:github` 瘦身 `szu-litchi-dev/`（仅含 `online/` 与 `rounds/drive-path.js` 并自动剔除 `LOCAL-ONLY` 规范区块）。
  - 版本统一升级至 `2.5.0`（`package.json`、`scripts/build.mjs`、`src/index.html`、`szu-litchi-dev/online/README.md`），存档迁移序列优先读取 `2.4.0`（同步扩展 `scripts/verify-save.mjs`）。
- 通过 `npm run lint`、`npm run build:release`、`npm run verify:all`（含 `verify-route-builder-chase`、`verify-chase-blind`、`verify-data`、`verify-assets`、`verify-maps`、`verify-esm-parity`、`verify-runtime-parity`、`verify-drafting-ai`、`verify-deterministic-race`、`verify-save`、`szu-litchi-dev/online/verify.mjs`、`npm run verify:map-assets-perf`、`verify-browser`、`verify-four-player`、`verify-performance --repeat-maps --route --memory`）、`npm run release:stage -- --skip-build`、`npm run release:github -- --skip-build` 及导出仓库内无构建包独立 `npm test` 验证；原有地图、资产与物理基线保持不变。

## 2.4.0 — 影子追捕与夜骑盲区

- 新增开放地图单人玩法 **「影子追捕」**（`src/data/modes.js`、`src/race/chase.js`、`src/ui/mode-hud.js`）：参考黎明杀机非对称追逃节奏重构，发车前统一 3 秒快启动倒计时并让逃跑者刷新在赛道前方约 110–180 米处以低配速巡航逃跑（标准 `0.65×`、强劲 `0.76×`），既告别原地秒抓，又确保追击者具备稳定机动优势；支持周期性雷达扫描与逼近感知（`far` / `near` / `locked`）、55m/45m 显形并显示头顶距离标牌、放宽拦截距离（8.5m/7.0m）与 3.5m 立交高差校验、闭环 2 圈脱逃与独立 `forzero-chase-v1` 存档。
- 新增 **「夜骑盲区」** 独立玩法模式（`src/race/blind-nav.js`、`src/ui/mode-hud.js`、`src/ui/audio.js`）：与单人计时、车队、1v1、影子追捕并列放入底栏五选一菜单，去掉底部多余复选框保持底栏紧凑；开赛临时锁定夜景并在退出/切图后恢复原天气，隐藏小地图/大地图/3D 引导线与刹车线；优化 `B`/`H` 或 `#touchBell` 摇铃回声（2 秒冷却、3.5 秒显示且立即清除并屏蔽危险警告覆盖，穿过检查点自动清理旧回声），精简弯道误报探针并将通关记录写入独立 `forzero-blind-v1`。
- `src/ui/race-options.js`、`src/ui/minimap.js`、`src/ui/app.js`、`src/index.html`、`src/styles/gameplay-170.css` 与 `src/data/english-text.js` 接入五选一模式切换、雷达扫频绘制、逃跑目标头顶标牌、暂停/结算双语文案及触屏摇铃按钮；版本与存档迁移链升级至 `2.4.0`（优先读取同级 `2.3.4` 并向下兼容）。
- 更新并运行 `node scripts/verify-240.mjs`，通过 `npm run build`、`npm run build:release`、`node scripts/verify-data.mjs`、`node scripts/verify-assets.mjs`、`node scripts/verify-maps.mjs`、`node scripts/verify-esm-parity.mjs`、`node scripts/verify-210.mjs`、`node scripts/verify-212.mjs`、`node scripts/verify-save.mjs`、`node szu-litchi-dev/online/verify.mjs`、`node scripts/verify-browser.mjs` 及桌面/英文浏览器端到端冒烟验证，并输出 `github-upload-2.4.0/` 上传包（跳过 `save/`）；沿用现有地图、资产与物理基线。

## 2.3.4 — 骑手皮肤独立化、四载具通用与导入清洗

- 将骑手皮肤从自行车底盘解耦：`src/ride/models.js` 新增独立于车型的 `riderSkinBodyCache` 与 `makeRiderSkinBody`，`bicycleRigCache` 仅缓存自行车涂装与配件，不再按皮肤重复构建车架；`src/data/vehicles.js` 新增 `RIDER_SKIN_HIP` 与 `vehicleSkinMounts`，通过 `vehicleSkinTransform` 与 `poweredPose` 将同一自定义皮肤网格适配到自行车、电动自行车、电动轮椅和越野小摩托四款载具。
- 车库 UI 拆分独立折叠区：`src/index.html` 将 `#riderSkin` 及其导入工具移出 `#bikeParts` 为独立的 `#riderSkinGroup`，切换四款载具均可随时选择与导入骑手皮肤；`src/ui/app.js` 与 `src/replay/ghost.js` 同步覆盖玩家本体、影子、AI 与联机对手在四款载具下的皮肤导出与渲染。
- `src/ride/rider-skin.js` 新增 `extractSkinJsonText` 与 `skinAllowedOnVehicle`，导入时先在客户端自动剥离外围 Markdown 代码围栏、`\` 行尾续行符、`&#x20;` 空白实体与零宽字符，再执行严格白名单校验；英文翻译同步至 `src/data/english-text.js`。
- 版本与存档迁移链升级至 `2.3.4`（优先读取同级 `2.3.3.1` 并向下兼容）。通过 `npm run build`、`npm run build:release`、`node scripts/verify-data.mjs`、`node scripts/verify-maps.mjs`、`node scripts/verify-esm-parity.mjs`、`node scripts/verify-210.mjs`、`node scripts/verify-save.mjs`、`node szu-litchi-dev/online/verify.mjs`、`node scripts/verify-browser.mjs` 及四载具皮肤切换浏览器验收；沿用现有地图、资产与物理基线。

## 2.3.3.1 — SkinModelSpec 校验与弱模型提示词修正

- 修复客户端 `src/ride/rider-skin.js`（`MODEL_MATERIAL`）与联机服务端 `szu-litchi-dev/online/server.mjs`（`SKIN_MATERIAL`）中图元 `material` 正则禁止大写字母、与 `palette` 键及 AI 提示词允许驼峰命名冲突的问题；同时将 `tube` 外包络半径计算修正为 `Math.max(radius, radius2)`。
- 重构 `validateSkinSpec` 与新增 `validateSkinProposal` 返回具体字段级错误，`src/ui/app.js` 的 `importRiderSkinText` 与 `src/data/english-text.js` 直接展示具体失败字段路径，避免笼统提示误导。
- 更新中英文提示词 `src/data/rider-skin-prompt.js` 与 `FORZERO-ROUTE-SKIN-DESIGN.md`：明确 `neckLengthScale` 必须落在 `0.04–0.22`（默认 `0.08`）、补充图元数量安全配额与固定 `triangleBudget: 2400`、给出免心算安全坐标盒与 `bounds` 推荐值，并同步设计文档旧示例尺寸。
- 桌面启动器 `szu-litchi-dev/online/server.mjs` 优先读取同级 `2.3.3` 存档并兼容前序版本，验证测试补入 `scripts/verify-data.mjs` 与 `scripts/verify-save.mjs`。使用 `flash_lite` 盲测子代理配合随机参考图完成客户端、联机服务端哈希对拍和 `makeRider` 全链路跑通。通过 `npm run build`、`npm run build:release`、`node scripts/verify-data.mjs`、`node scripts/verify-esm-parity.mjs`、`node scripts/verify-save.mjs`、`node szu-litchi-dev/online/verify.mjs` 与 `node scripts/verify-browser.mjs`，沿用现有地图、资产和物理回归基线。

## 2.3.3 — HUD 缩放与骑行视角

- FPS 与路线提示按行排列。HUD 和触屏按钮各自支持 50%–150% 缩放，保留 HUD 自动档。触屏热区跟随缩放，横向空间不足时按屏幕宽度收紧按钮。旧缩放偏好可继续读取。
- 新增游戏画面内的视角切换，依次使用第一人称、前方回看的第二人称和后方跟随的第三人称。全屏也可使用按钮，电脑快捷键为 `V`。镜头逻辑位于 `src/render/ride-camera.js`，缩放与设置接入位于 `src/data/interface.js`、`src/ui/hud-controls.js`。
- 桌面启动器可读取同级 2.3.2 存档。通过 `npm run build`、`npm run build:release`、`node scripts/verify-browser.mjs`、`node scripts/verify-data.mjs`、`node scripts/verify-esm-parity.mjs`、`node scripts/verify-save.mjs` 及三图横竖屏镜头方向检查。沿用现有地图、资产和物理回归基线。

## 2.3.2 — 游戏内英文界面

- 新增「设置 → 界面语言」，桌面版和手机离线单文件共用中英双语资源。菜单、操作说明、车库、HUD、赛事结算、联机提示和地图界面文字支持英文。默认简体中文，手动选择单独保存在本机。
- `src/ui/language.js`、`src/ui/presentation-text.js`、`src/data/english-text.js` 接入界面和动态文案翻译。赛道标识、存档键、协议 v3 和 3D 场景招牌沿用原数据。桌面版兼容同级 2.3.1 的存档。
- 通过 `npm run build`、`npm run build:release`、`node scripts/verify-data.mjs`、`node scripts/verify-browser.mjs`、`node scripts/verify-save.mjs`、`node scripts/verify-esm-parity.mjs`、`node scripts/verify-maps.mjs`、`node szu-litchi-dev/online/verify.mjs` 和 `node scripts/verify-four-player.mjs --drive`。四个中英文客户端同房完成比赛并结算。地图和资产基线沿用原快照。

## 2.3.1 — UCL 门口花坛与骑手外观修正

- 将 UCL 到达庭院两组花坛从铺装道路内的 `zOffset ±17.5` 移到庭院边缘 `zOffset ±31.5`，视觉和碰撞继续由同一 `beds` 数据生成，路线层保持不变。
- 移除标准自行车与动力车型的默认安全帽、背包几何。SkinSpec 导入可省略这两类部件，客户端和服务端继续拒绝显式的 `helmet`、`backpack` 图元，并移除失败的 `yellow-orb` 内置皮肤。
- 同步 2.3.1 版本源、联机说明、手机入口、浏览器验收入口和发行指南。构建生成桌面目录、手机单文件和确定性 ZIP，个人存档目录不随发行包覆盖。
- 新增 `github-upload-2.3.1/` GitHub 上传包，包含桌面 `index.html`、`style.css`、`game.js`、联机服务文件、许可证、声音目录和 `forzero-budget-mobile-2.3.1.html`，不包含 `save/`。该目录已针对 `mizukidesuwa/forzero:budget` 整理。
- 重写图片识别到 SkinSpec 的 AI 提示词，加入唯一 JSON envelope、字段白名单、精确范围、局部坐标、图元属性、面数公式、完整身体部位、非人类头躯干连接、禁止项和失败重算流程，并同步 `FORZERO-ROUTE-SKIN-DESIGN.md`。
- 收紧 SkinSpec 比例与 bounds 范围，明确米制坐标、ellipsoid 半径、box 完整尺寸和 tube 半径语义。客户端 `src/ride/rider-skin.js` 与联机服务端 `szu-litchi-dev/online/server.mjs` 都重新计算缩放后的最终外包络，校验整体宽高深、body/head 中心与每轴尺寸、部位跨度、髋部偏移和 bounds 上限，拒绝恶意过大、过小、远移或虚报 bounds 的模型，并拒绝字符串数字。
- 修正合法模型到达车把参考点时的误判。x 方向偏移检查保留最终 depth 和髋部安全约束，同时允许覆盖 `[0.43, 1.052, ±0.238]` 的把手位置，并在提示词中明确手臂可延伸到该挂点。客户端和联机服务端规则同步。
- 将髋部偏移阈值写入 `skinGeometryRules.hipOffset`，并把客户端、联机服务端使用的同一计算公式加入图片识别 Prompt 和设计文档。生成器现在必须预检 `x=max(bounds.depth×0.72,0.76)`、`y=bounds.height×0.75`、`z=bounds.width×0.72` 三轴限制。
- 定向验证运行 `npm run build`、`npm run build:release`、`node scripts/verify-maps.mjs ucl`、`node scripts/verify-assets.mjs`、`npm run verify:map-assets-perf`、`node scripts/verify-esm-parity.mjs`、`node szu-litchi-dev/online/verify.mjs` 及 SkinSpec 冒烟检查，未执行全量回归。
- 数值边界补丁追加运行 `node --check src/ride/rider-skin.js`、`node --check szu-litchi-dev/online/server.mjs`、合法/恶意 SkinSpec 冒烟、`node scripts/verify-data.mjs`、`node scripts/verify-esm-parity.mjs`、PowerShell 设置 `FORZERO_RELEASE_DIR=D:\\FORZERO\\github-upload-2.3.1` 后运行 `node szu-litchi-dev/online/verify.mjs` 和 `node scripts/verify-browser.mjs`，均通过。上传包已在最终 `npm run build:release` 后刷新。

## 2.3.0 — 路线代码、SkinModelSpec UCG 与第一阶段性能优化

- 新增 `src/data/routes.js`、`src/race/route-code.js` 和 `src/race/route-key.js`，提供版本化路线引用、编码/解析、canonical key 和环境键。路线代码限制为固定/种子/道路图逻辑引用，不携带自由坐标。
- 新增 `src/data/rider-skins.js` 与 `src/ride/rider-skin.js`，提供 `shared-rider-v1` 的 SkinModelSpec 白名单、比例边界、非人类头躯干一体模式、配饰挂点、面数预算和规范化哈希。玩家可把参考图与强约束提示词交给外部 AI 生成 JSON/ModelFile，再在车库导入并生成完整骑手网格。
- 路线代码已接入路线对话框、`src/world/route-resolver.js` 和联机房间。fixed/seed/network 三类 `R1...` 代码均由客户端和服务端 canonicalize，网络路线校验 revision、边存在性、首尾连接、长度、方向和圈数，联机只传路线身份与边列表并在各端重建。
- 车库导入皮肤统一按完整特殊 `SkinModelSpec` 处理。内置黄团示例已移除，导入模型不自动添加安全帽或背包，自定义 `skinSpec/skinSpecHash` 继续进入本地 profile、Ghost 外观和联机低频 profile。
- SkinModelSpec 校验现在按声明式 `ellipsoid`、`tube`、`box` 的实际 emitter 三角面成本核对 `triangleBudget`，客户端和服务端拒绝超预算模型。标准自行车与动力车型的共享骑手网格都不再强制生成安全帽或背包，导入皮肤可以保持完整身体轮廓。
- `src/world/traffic.js`、`src/render/traffic.js` 与 `src/ride/physics.js` 复用按物理时间缓存的车流姿态，渲染高程修正使用独立点位，避免污染碰撞姿态。
- `src/render/webgl-renderer.js` 为动态骑手网格预分配容量，容量可复用时使用 `bufferSubData`，保持顶点布局变化时的安全重分配。
- `src/data/traffic.js` 与 `src/ride/physics.js` 修复车流碰撞持续推行。碰撞现在按法线安全推出，失败回滚到碰撞前位置，加入 780 ms 同车免疫、160 ms 全局恢复、侧擦减伤、单步限次和 960 ms 无位移后的 `nearestSafeRoad` 脱困。恢复状态使用不可枚举字段，不进入存档或联机对象。
- 更新版本源、构建入口、验证入口和工作指南为 2.3.0。路线、SkinSpec 与性能模块均导出至 `src/test-exports.js`。地图与资产基线保持可追踪，UCL 视觉层另完成一次定点去重修复。
- 修复 UCL 到达庭院花坛向道路凸出的问题，并过滤与 legacy 街墙、前排建筑重叠的候选填充楼层。门口花坛规格集中在 `src/data/map-assets.js`，`src/world/assets/campus-v220.js` 统一生成视觉和 `uclFixtures` footprint，`src/world/maps/ucl.js` 移除旧内院重复种植绘制。同步更新 `scripts/verify-assets.mjs` 与 `scripts/verify-esm-parity.mjs` 的 UCL 几何统计断言。UCL 资产校验为 311,402 三角面、535 个 mesh cell，2.1.2 基线为 302,654/533，ESM batch 统计为 311,400 静态三角面。
- 本次局部修复将 UCL 到达庭院两组花坛从铺装道路内的 `zOffset ±17.5` 移到庭院边缘 `zOffset ±31.5`，视觉树冠与碰撞 footprint 继续由同一 `beds` 数据生成。同步更新 UCL 有序几何哈希，并移除标准骑手的默认安全帽和背包几何。定向验证运行 `npm run build`、`node scripts/verify-maps.mjs ucl`、`node scripts/verify-assets.mjs`、`npm run verify:map-assets-perf`、`node scripts/verify-esm-parity.mjs`、`node szu-litchi-dev/online/verify.mjs` 及 SkinSpec 冒烟检查，未执行全量回归。
- 已通过 `npm run build`、`npm run build:release`、`node scripts/verify-runtime-parity.mjs`、`node scripts/verify-data.mjs`、`node scripts/verify-assets.mjs`、`node scripts/verify-maps.mjs szu`、`node scripts/verify-maps.mjs ucl`、`node scripts/verify-maps.mjs shunde`、`node scripts/verify-210.mjs`、`node scripts/verify-212.mjs`、`node scripts/verify-esm-parity.mjs`、`node scripts/verify-save.mjs`、`node scripts/verify-browser.mjs`、`node scripts/verify-four-player.mjs --drive`、`node scripts/verify-performance.mjs --repeat-maps --route --memory`、`npm run verify:map-assets-perf`、`node szu-litchi-dev/online/verify.mjs` 及路线/SkinModelSpec/碰撞定向探针。`scripts/fixtures/hardware-perf.json` 和 `scripts/fixtures/runtime-baseline.json` 已记录本次 2.3.0 硬件与 UCL 去重基线，资产性能和 ESM 统计已同步。

## 2.2.0 — 真实地图资产精修

- 基于 2.1.2 源码新增 `src/world/assets/campus-v220.js` 与 `src/data/map-assets.js`，按 UCL 官方校园地图、深圳大学官方校园地图和顺峰山牌坊实景参考，为三张地图增加庭院、街区立面、牌坊前场和石桥栏杆细节。2.1.2 旧资产保留为 legacy 基础层。
- UCL 全图新增候选街区地块与浅层 Bloomsbury 街墙，经过道路与旧建筑间距过滤后作为独立视觉层接入，主 Quad 到达右转区域增加低墙、树阵、花池和连续庭院边界，旧店铺名字与原有碰撞路线保持不变。
- 顺峰山牌坊视觉模型与碰撞 footprint 分离，缩小石柱碰撞盒并加入牌坊中心通道、内侧净空和柱体保留阻挡验收。
- 新增 FPS HUD 与设置开关，复用现有 HUD，不增加一级菜单按钮。
- 统一骑手初始 drafting 状态，保持 ESM 与旧运行时交通验收结果一致。
- 删除旧迁移 Prompt、阶段维护脚本和旧阶段命名残留，将持续验证入口改为按职责命名的 `verify-assets.mjs`、`verify-maps.mjs`、`verify-browser.mjs`、`verify-performance.mjs` 等。
- 在 `D:\\zeroprompt4GPT\\FORZERO-GPT-开发指导.md` 补齐当前 2.2.0 的源码、资产、发布和验收交接说明。
- 新增 `D:\\zeroprompt4GPT\\UCL-穿模定点修复Prompt.md`，将 UCL 穿模排查限制为坐标复现、局部读取、视觉/碰撞分层和定向验证。
- 新增 `scripts/verify-map-assets-perf.mjs` 与 2.1.2 基线 fixture，UCL 精修后为 323,428 静态三角面，仍处于 10% 资产预算内。
- 通过 `npm run build`、`npm run build:release`、`node scripts/verify-runtime-parity.mjs`、`node scripts/verify-data.mjs`、`node scripts/verify-assets.mjs`、`node scripts/verify-maps.mjs`、`node scripts/verify-esm-parity.mjs`、`node scripts/verify-210.mjs`、`node scripts/verify-212.mjs`、`npm run verify:map-assets-perf`、`node scripts/verify-save.mjs`、`node scripts/verify-browser.mjs`、`node scripts/verify-performance.mjs --repeat-maps --route --memory`、`node scripts/verify-four-player.mjs --drive` 和 `node szu-litchi-dev/online/verify.mjs`。地图与资产基线已同步更新。

## 2.1.2 — 确定性竞速、AI 行为与完整验收

- `src/world/traffic.js`、`src/data/traffic.js`、`src/race/environment-key.js` 和 `src/replay/ghost.js` 为固定赛道、赛道变体、车流、天气与风生成稳定环境标识，旧 Ghost 继续按原格式读取。`src/race/rival-pace.js`、`src/race/rivals.js` 与 `src/data/race.js` 加入确定性的线路偏置、弯道配速、受控失误、跟车增益和技能延迟。
- `src/race/courier.js` 改为事件/会话种子随机源。新增 `src/race/feedback.js`，`src/race/time-trial.js`、`src/ride/physics.js` 和完赛复盘 UI 展示尾流、车流、逆风、路面与弯道反馈。
- 版本源、桌面/手机发行文件、联机说明和验证入口统一更新为 2.1.2。`scripts/fixtures/map-regression.json` 仅补充 Ghost 环境元数据，地图几何与资产基线未变化。
- 通过 `npm run build`、`npm run build:release`、`node scripts/verify-212.mjs`、`node scripts/verify-esm-parity.mjs`、`node scripts/verify-210.mjs`、`node scripts/verify-data.mjs`、`node scripts/verify-assets.mjs`、`node scripts/verify-maps.mjs szu|ucl|shunde`、`node scripts/verify-save.mjs`、`node scripts/verify-browser.mjs`、`node scripts/verify-performance.mjs --memory --route`、`node scripts/verify-four-player.mjs`、`node scripts/verify-four-player.mjs --drive` 和 `node szu-litchi-dev/online/verify.mjs`。

## 2.1.1 — 伦敦车流优化

- `src/data/traffic.js`、`src/world/traffic.js`、`src/world/maps/ucl/traffic.js` 为 UCL 开放路线加入路端渐隐和回流空档，保留 Russell Square 连续闭环。降低车流密度并避开发车前方。
- `src/render/traffic.js`、`src/render/webgl-renderer.js`、`src/world/assets/traffic-vehicles.js` 加入车流视锥裁剪、远处简模和 WebGL 实例绘制。
- `src/ride/physics.js` 取消普通 NPC 尾流，保留 AI 和联机骑手的蓄力与弹弓。青云湖自动跑圈预期随之更新，静态地图和资产快照保持原值。
- 通过 `npm run build`、`npm run build:release`、`node scripts/verify-esm-parity.mjs`、`node scripts/verify-210.mjs`、`node scripts/verify-data.mjs`、`node scripts/verify-assets.mjs`、`node scripts/verify-maps.mjs`、`node scripts/verify-browser.mjs`、`node scripts/verify-save.mjs` 和 `node szu-litchi-dev/online/verify.mjs`。

## 2.1.0 — 尾流竞速

- 深大开放校外草地、荔香公园及八座校门外侧引道。实心围墙、道路围挡和立交低净空有实体或路障提示，立德门北侧两棵棕榈退出主路。
- 四种载具均可吸取车流、AI 和联机对手的尾流。尾流约 1.5 秒充满，横切超车触发约 1.5 秒弹弓加速。UCL 主干道新增黑出租和少量双层巴士。
- AI 车队赛从后排发车，可选标准或强劲难度。王牌按车型和赛道金牌线配速，AI 胜场独立保存。
- 固定赛道支持反向，青云湖环线和顺峰山环山耐力赛支持 1–3 圈。方向和圈数各有独立计时成绩与影子。
- 联机四项全能依次锁定自行车、电动自行车、电动轮椅和越野小摩托，并按轮校验改车预算。
- 触屏长按骑行按钮时保持按键输入，抑制系统选字和菜单。桌面版可自动发现同级 2.0.0 存档。
- `scripts/verify-esm-parity.mjs` 保留 1.9.1.1 快照，单列 2.1.0 围挡、草地通行、伦敦车流、青云湖尾流及轮椅路面变化的预期。几何和地图快照已随 2.1.0 更新。
- 发行通过 `npm run build:release`、`node scripts/verify-esm-parity.mjs`、`node scripts/verify-210.mjs`、`node scripts/verify-data.mjs`、`node scripts/verify-assets.mjs`、`node scripts/verify-maps.mjs`、`node scripts/verify-browser.mjs`、`node scripts/verify-save.mjs` 和 `node szu-litchi-dev/online/verify.mjs`。

## Unreleased

- 收敛开发指导。仓库根目录的 AGENTS.md 作为唯一权威入口，FORZERO-WORK-GUIDE.md 标记为按需索引，删除外部重复提示词。同步修正工作指南中的 2.2.0 版本和构建说明，未更新地图或资产基线。
- 在 `AGENTS.md` 第 6 节补充大文件治理边界：对 `src/ui/app.js` 采用“改到哪拆哪”的增量剥离原则（改一块用 `node scripts/verify-browser.mjs` 验一块），不搞重构专项；已稳定的 `szu.js`、`ucl.js`、`client.js` 不作无收益硬拆。

## 2.0.0 — 架构迁移

- 客户端改为 ESM 源码与统一打包，四种载具、三张地图、20 条固定赛事和联机协议 v3 保持原有规则。
- 车型与配件参数、地图道路和检查点、程序化资产写入独立模块。桌面与手机单文件使用同一份客户端构建。
- 桌面版首次启动可自动读取同级 1.9.1.1 的存档，也支持原有 JSON 备份导入。手机继续支持单文件离线游玩。

## 1.9.1.1 — AI 发车与追尾修复

- AI 起步加入反应时间与渐进加速，后排站位平滑并入正常赛线。发车后前 3 秒免受 AI 碰撞，随后 AI 追上玩家时优先让车，避免从后方顶退。

## 1.9.1 — 小屏 HUD 与发车提示

- 手机默认使用精简 HUD。设置新增 HUD 缩放，支持自动、65%、80%、100%、115% 和 130%，触屏按键大小单独调节。
- 「下一站」移到右上角操作区下方，竖屏小地图也移到同一区域。
- 「娱乐改装 · 不计榜」显示在发车区、倒计时和结算页，比赛中清除提示。

## 1.9.0 — 车型技能、天气路况、AI 车队、地贫预算

- 四种车型共用 Shift 和原触屏技能键。自行车保留体力冲刺，越野摩托甩尾后可获得出弯牵引，电自支持回收与超频过热保护，轮椅可差速急转与低速爆发。相机按速度和推进状态平滑拉伸视野，遵循减少动态效果设置。
- 三图各加入 10 处雨天积水，共 240 个三角面，使用原场景绘制与单独积水抓地判定。风场支持恒定和确定性阵风，迎风两点判定遮挡。三图闪送按车速、距离和高差给时，7.8 米内且高度匹配时可交单，新增方向箭头。
- 单人发车区可选计时、三车 AI 竞速或 1v1。AI 有独立排名、尾流和可选实体碰撞。AI 成绩单独结算。完赛俯视对比支持双车动画、暂停、1×/2× 和进度拖动。
- 车库配件直开并标价，加入二手光头胎、二手轻框和四类娱乐魔改。单人任选不限预算、¥400 或 ¥700，超额无法发车；违禁件可体验赛道，隔离个人记录、勋章与官方影子。
- 联机协议升至 v3。房规同步预算、轮次盲盒额度、娱乐配件通行权和阵风参数。服务端验证配车并在发车时锁定实际配置。

## 1.8.8 — 动力载具碎石调校、统一车库、青云湖湖心亭栈道

- 越野小摩托、电动自行车和电动轮椅分别计算碎石限速、滚阻、驱动力、抓地与制动，雨天再按各自的轮胎和刹车配置降低抓地与制动力。现有越野轮胎和悬挂选项影响碎石表现。电动自行车原厂电控保持 25 km/h 铺装限速，碎石和草地限速随原厂电控一起下调。
- 四种载具的车库复用极速卡片、能力条和性能调校分组，均显示铺装、碎石和草地极速。动力载具能力条对照本车型原厂配置。
- 顺峰山湖心亭原为水中景观。青云塔山脚新增约 79 米长、2.8 米宽的无护栏栈道，连接环湖路和可掉头的亭台。导览图标注路径，驶出边缘会触发落水遣返。

## 1.8.7 · 深大校门边界对齐、移除压路捷径与落水强制遣返

- **移除深大高风险捷径（方案 B）**：
  - 清空 `szuHighRiskShortcuts`（原杜鹃山坡脚内切线 / 双湖坡脚窄切线与护桩侵占主路及坡脚路口），保留 UCL 捷径与顺峰山捷径不受影响。
- **深大校门口去空气墙与边界可视化对齐**：
  - 新增 `szuAprons()` / `gateApronAt(x, z)` 开放 8 座校门前石材广场与立德门双弧道中间可骑行区域（仅保留门房与标志建筑实体碰撞），并将计入 `surfaceAt` 铺装表面。
  - 重写 `boundaryEdges()`，去除原 `< 9.6 m` 粗暴大缺口，靠近校门/路口段自动细分为 5 格并严格贴合 `cityStreetAt || gateApronAt || buildingAt` 真实边界收口，彻底消除无围栏区域的空气墙。
  - 新增 `drawGateLinkBorders()`，沿校外联络通道与暴露在外侧的校门广场边缘自动生成低矮石缘与修剪绿篱（纯视觉网格，不占用 `roads` 净空），`online/server.mjs` 本地存档序列同步支持 `1.8.6` 迁移。
- **深大文山湖落水强制遣返（复用顺峰山机制 + AABB 预剔除）**：
  - 在 `qingyun.js` 抽离通用 `nearestPathSpot(paths, x, z, elevFn)` 供顺峰山 `parkNearestRoad` 与深大 `nearestSafeRoad` 复用，并在 `szu-boundaries.js` 新增 `szuWaterBoxes()` / `szuInWater()`（三处湖泊 `basins` 先经外接矩形快速剔除再算 `lakeClearance(x, z) <= .08`）与通用 `waterHazardAt(x, z)`。
  - `safeToRide(..., skipHazard)` 统一顺峰山与深大：正常 AI/出生点校验避开湖面，玩家骑行经 `mayRide` 传入 `skipHazard = true` 取消湖边空气墙，落水后直接接入 `TimeTrial.step()` 强制遣返逻辑（自由骑行传回最近路面并弹出 `落水，已强制遣返最近赛道` 与提示音，计时赛触发 `rejoin()` 回赛道并 `+2s` 罚时）。
- **自动化校验升级**：
  - 在 `verify-map.mjs` 新增 `szuShortcuts === 0`、无围栏开口 `fenceAirWalls` 一致性扫描、立德门门前广场可骑性、三处湖泊 `waterHazardAt`/`nearestSafeRoad` 及 `TimeTrial` 自由/竞赛落水遣返集成测试。

## 1.8.6 · 局内车流、独立碰撞箱与 HUD / 触屏体验升级

- **局内动态车流与独立碰撞**：
  - 深大校外和顺峰山新增关闭、稀疏、标准车流档。默认稀疏，碰撞箱另选。
  - 单人重开换种子，周赛按周码派生种子，联机房间每轮同步种子和密度。倒计时与比赛连续推进车流，回归赛道罚时不改变车流位置。
  - 1.8.6 联机房间要求客户端和服务端使用协议 2。桌面首次读取存档时优先检查 1.8.5。
- **速度表与 HUD 精简（电脑 & 手机统一生效）**：
  - 移除无实战作用的踏频 `rpm`（`#bikeCadence`）及重复的「路面抓地 / 抓地接近上限」文案；`#surfaceType` 聚焦纯路段位置与路面状态（自由骑行显示地标/路名 + 路面类型，竞赛显示路面状态与路名），抓地极限提示统一交由底部「抓地」进度条表达。
  - 将非默认骑行姿态（`伏身破风` / `起身摇车`）与 `尾流破风` 移至速度表正上方外侧胶囊区（`#speedBadges`），常态「坐姿巡航」隐藏不占空间，显著压缩左下角信息框高度。
- **手机端 L 形大触控区、滑动切键与按键大小设置**：
  - 触控区重构为左手放大转向（`左转` / `右转`）+ 右手 L 形布局（`加速` 为大主键、`冲刺` 置顶、`刹车` 置左；非自行车车型自动隐藏 `冲刺` 行），按钮外缘增加 `::after` 扩边热区。
  - 取消单键 `setPointerCapture`，改为 `.touch` 容器 + `window` 级多点追踪，支持拇指左右滑动无缝切转向、按住 `加速` 上滑直接进 `冲刺`。
  - 「设置」新增 `触屏按键大小`（`紧凑` / `标准` / `超大`，默认 `标准`）并持久化至偏好设置；竖屏联动抬升底部 HUD、横屏将速度表与小地图内收至触控区两侧内缘，确保全档位不遮挡，同时适度放大移动端顶栏与底栏功能按钮。
- **二级菜单「玩法说明」与顶部状态按钮整理**：
  - 在「设置」弹窗标题栏内置二级视图入口 **`玩法说明 / 返回设置`**（`#guideSettings`），集中说明键鼠/触屏滑动、破风姿态、路面与抓地及联机玩法，不额外增加一级界面按钮。
  - 顶部 `#freeRide` 按钮在自由骑行时自动隐藏以精简顶栏；进入倒计时/比赛或完赛时自动显示为 **`退出比赛`** / **`返回自由骑行`**，同时保留「设置」弹窗内的退出入口。

## 1.8.5 · 顺峰山手感优化、车辆碰撞箱、联机改装阶段与品牌更名
- **全局可调地图风速与风向**：将风场控制从每周挑战专属中解放出来——单人设置面板（`0–15 m/s` + 8 方位风向）与联机房主规则均支持自由调节地图风速/风向（周赛仍保留其确定性风场），风力实时作用于自由骑行与竞赛物理并在 HUD 显示。
- **中文更名与新透明 SVG 标志**：中文正式名称更名为 **「有限竞速：地贫线」**（英文 `FORZERO: BUDGET`），接入无底色 `340×150` 透明斜体 SVG 主标志与精简顶栏标志；移除加载屏、主界面与页面描述中的冗余标语。
- **修复耐力赛上山挡路树木**：将伏波桥北侧树丛中侵占「顺峰山环山耐力赛」爬坡入口（`d = 832 m`）的路树 `[143, 90.8]` 移至路旁 `[137.5, 88.5]`，保证进山斜坡全程通畅并维持青云塔视线遮挡变化。
- **去除顺峰山捷径与草地过多空气墙 + 落水/落崖强制遣返**：
  - 开放公园干地草坪与 3 条捷径两侧的通行边界（`parkRideable` 仅保留实体建筑/牌坊石柱/护桩/树干/桥栏/青云塔陡坡核心及外围陡山物理阻挡），分离 `paved`（`路面抓地`）、`gravel`（`碎石路面`）与 `grass`（`草地减速`）三级地表判定。
  - 新增 `parkInWater`（湖区多边形 + 桥侧水道检测，桥面除外）与 `parkMountainDropOff`（山路高层悬崖检测）：骑手落水或冲出山路悬崖时触发**强制遣返赛道**（计时赛自动 `rejoin()` 传回赛道并 `+2.0s` 罚时，自由骑行传回最近路面并弹出 HUD 提示）。
- **可选本局「车辆碰撞箱」开关**：
  - 设置面板新增 `车辆碰撞箱` 开关（`preferences.collision`，默认关闭）；开启后单人游玩会与深大车流 / 顺峰山观光车产生实体 OBB 推离与减速碰撞，联机开启时同时支持房内骑手间实体碰撞推挤。
- **联机模式扩展（顺峰山地图 + 赛前改车倒计时 + 碰撞箱规则）**：
  - 开放顺峰山公园在线联机游玩（取消顺峰山联机按钮隐藏，`server.mjs` 支持 `shunde` 赛道校验）。
  - 新增联机**改车时间**设置（`0–180s`，UI 默认 `30s`）与**车辆碰撞箱**房间规则；房主发车后若设定改车时间大于 `0`，全房进入 `tuning` 阶段，支持直接在车库/工坊内查看实时倒计时、即时同步配件与涂装、个人点「完成改装」提前就绪（全员完成或倒计时结束自动进入发车倒计时，房主亦可点「立即发车」跳过）。
  - `server.mjs` 本地存档迁移序列新增 `../forzero-budget-1.8.1/save/player-data.json` 最高优先级。
- **1.8.5 性能与减面专项优化**：
  - **顺峰山物理 CPU 大幅减负**：[qingyun.js](file:///d:/szubikeGPT/szu-litchi-dev/ride-update/qingyun.js) 新增 `parkWaterBounds` 湖区 AABB 预剔除，[shunde-mountain.js](file:///d:/szubikeGPT/szu-litchi-dev/ride-update/shunde-mountain.js) 预计算 `shundeHighRiskShortcuts` 段向量与外接框，且 `moveCyclist` 与 `parkRideable(x,z,true)` 合并重复落水/悬崖/路面判定。120 Hz 单步耗时：`shunde-endur-default` 由 `150.38 µs` 降至 **`29.71 µs`**（约 **5.06×** 提速，60 Hz 单帧 `0.059 ms`），`shunde-lake` 由 `121.30 µs` 降至 **`32.07 µs`**，`shunde-endur-coll+wind` 由 `148.76 µs` 降至 **`45.70 µs`**。
  - **深大 / UCL 静态减面（零可见轮廓损失）**：`deciduous`/`palm` 默认使用 `light = true` 树冠细分（完整保留树位随机数序列）并将荔枝果改为紧凑小方块；深大 `lamppost` 灯头改用盒体/6 边管体；UCL 收敛 `londonFence`（`1.35m` 间距 4 边无盖管）、`londonLantern`、`londonArch` 细分并仅在 1–2 层保留细窗棂/窄窗台。深大静态三角面由 `689,567` 降至 **`432,323`**（`-37.3%`），UCL 由 `426,032` 降至 **`302,654`**（`-29.0%`），顺峰山维持 **`105,324`** 不变。
  - **渲染与加载提速**：硬件 GPU（`1280×720` `auto`）深大起点 `74.8 → 192.0 FPS`、UCL `73.1 → 165.0 FPS`、顺峰山牌坊 `72.4 → 170.6 FPS`、伏波桥 `82.0 → 172.2 FPS`，冷启动 `1,086 → 790 ms`；SwiftShader 纯软渲染（`987×522` `fast` + `fxaa`）深大起点 `24.5 → 30.4 FPS`、UCL `24.2 → 26.6 FPS`；稳态显存缓冲 `0 / 0`。

## 1.8.1 · 发布前品牌与工程整理
- **品牌与标识更新**：
  - 正式英文名定为 **FORZERO: BUDGET**，中文名定为 **有限竞速：零预算**，英文宣传语 `AAA Ambition. Zero Budget. Two Wheels.`，中文宣传语 `3A 级野心，零预算，两只轮子。`；保留「荔园环骑」作为深圳大学地图与对应赛事名称。
  - 接入纯代码原创 SVG Logo（`FORZERO: BUDGET` 深黑竞速风格）至顶栏、主菜单自由骑行面板、WebGL 加载界面（`#bootLoader`）及 SVG Favicon。
- **玩家默认名与商标合规**：
  - 新玩家默认名称与空名称回退统一为小写 `player`（前端 `DEFAULT_RIDER_NAME` 与联机服务端 `normalizeName` 同步），清除源码中硬编码的开发者个人名称，同时完整保留已有玩家本地存档及已导出 `.ghost.json` 影子中的原始名称。
  - 场景内商业商标改写为近似非侵权名称（`Lidl` → `Laodl`、`Tesco Express` → `Lesgo Express`、`Boots` → `Root`、`腾讯大厦` → `Southizzahut 大厦` 等），保留 UCL、深圳大学与顺峰山公共地标名称。
- **工程与许可整理**：
  - 根目录新增 `LICENSE`（PolyForm Noncommercial License 1.0.0 原文与 `Required Notice`）、`README.md`、`CHANGELOG.md`、`.gitignore`，同步更新开发交接文档并清理示例 IP。
  - 当前 1.8.1 发行目录与交付文件更名为 `forzero-budget-1.8.1/`、`forzero-budget-mobile-1.8.1.html` 与 `FORZERO-WORK-GUIDE.md`（保留内部构建目录及历史版本目录名以兼容测试与旧存档迁移）。
- **趣味配件**：
  - 电动自行车（新国标）电控输出默认配置为「原厂配件」（`stock`，最高速度限制为 `25 km/h`），并保留「标准输出」（`standard`，`48 km/h`）等可选调校。
- **顺峰山性能优化**：
  - 精简顺峰山路旁乔木（`deciduous(..., light=true)`）与棕榈（`palm(..., light=true)`）网格细分数及隐蔽内枝、外围山丘背向球冠（`parkHills`）、环湖外围树带与碎石路缘标记密度，并在 `plantMountainTree` 中区分路旁圆冠与远坡轻量树冠，顺峰山总静态实体三角面由 `168,826` 降至 `101,602`（其中 `foliage` `99,292 → 51,948`，`scenery` `61,114 → 41,234`）。
  - 将 `parkReflectionBounds` 收紧为贴合实际湖区与桥道水面的 28m 网格分块（避免陆地触发全屏宽反射），并在渲染管线中为镜像反射加入 `275m` 水平距离裁剪、反射单次阴影采样及 95m 外主阴影单次采样 / 近景阴影裁剪。

## 1.8.1 · 顺峰山山地扩展与玩法升级
- 顺峰山公园新增「神步山爬坡赛」（`516.04 m`，爬升 `34.0 m`）、「神步山下坡赛」（`498.33 m`，下降 `34.0 m`）与「顺峰山环山耐力赛」（`shunde-endurance`，约 `1,954 m` 闭环串联牌坊、青云湖、伏波桥与神步山上下坡，固定赛道总计 `20` 条）。
- **碎石路独立物理分级**：顺峰山路内碎石段与深大/UCL 离路草地分离，保留越野配置抓地与极速优势的同时，提升非越野轮胎的压实碎石巡航极速（`×1.32` 自行车 / `×1.18` 电动与摩托基准草地上限，不超过公路极速）、缓和超速入区减速与滚阻，并开放弱化冲刺推力（`0.68×`）以改善爬坡二次起步与下坡连贯手感。
- **高风险窄切捷径、观光车尾流与公园闪送**：
  - 新增 3 条顺峰山窄切线（`牌坊东弯窄切线`、`神步山林间土坡捷径`、`下山坡脚林荫斜切线`），搭配护桩标识与大地图橙色虚线标记。
  - 环青云湖主路新增 6 辆随高程起伏的观光接驳车，支持自由骑行与计时赛触发自行车尾流破风。
  - 顺峰山开放自由骑行「闪送」模式（`CampusCourier` 覆盖牌坊、伏波桥、青云塔山脚与神步山观景台等 10 处高程地标）。
- 地图区分为上山橙色与下山浅蓝路线，「看赛道」支持高亮并展示海拔剖面；碎石段提供路牌提示与 HUD `碎石路面` 反馈。
- `server.mjs` 本地存档自动迁移序列加入 `1.8.0` 优先级。

## 1.8.0 · 顺峰山公园与三站直达
- 新增「佛山顺德 · 顺峰山公园」场景及「青云湖环线」（`1,072.74 m`，含顺峰山牌坊、九孔伏波桥与青云塔）。
- 深大粤海、伦敦 Bloomsbury（UCL）与顺峰山公园支持任一站台间直达旅行。

## 1.7.0 · 玩法深化与多影子系统
- 电动自行车（`48 km/h`）、电动轮椅（`36 km/h`）节奏升级，越野小摩托保持 `63 km/h`。
- 新增实时滚动毫秒差（`#liveDelta`）、周赛绑定天气与风场（`1.0–2.4 m/s`）、紫牌大师挑战与 16 赛道勋章总览、限定涂装（`amethyst` / `obsidian`）、自由骑行「校园闪送」、多影子同场群跑、联机 `random`（盲盒随机）与 `triathlon`（铁人三项）赛制、动态车流尾流与 Web Audio 动态骑行音效。

## 1.6.1 – 1.6.6 · 街景、赛道 v2 与稳定性迭代
- `1.6.6` / `1.6.5`：历史坏档回退保护与存档恢复加固。
- `1.6.4`：消除 `avoidWall()` 离散采样镜头抖动、统一更名「友人对战」、修复周赛检查点与过点反馈。
- `1.6.2` – `1.6.3`：新增深大「荔香公园城景环线」「白石科创城际冲刺」与 UCL 4 条赛道，种子系统升级至 v2（`S2-*` / `U2-*`）。
- `1.6.1`：工坊极速看板、UCL 正门共面闪烁修复、手机竖/横屏自适应与独立单文件构建。

## 1.6.0 · 自行车工坊与骑行姿态
- 新增自动双姿态（伏身破风 / 起身摇车）、自行车专属反馈 HUD（坡度/踏频/抓地余量）、门类联动 3D 车模与 LRU 缓存、4 套预设与 5 槽外观定制。

## 1.4.0 – 1.5.0 · 联机主机壳、天气与复盘
- `1.5.0`：全车型平衡改装（自行车 5 槽 + 摩托/电驴/轮椅各 3 槽）、4 种时段天气、高风险切线近路、俯视图走线对比与区间单练、本地 `save/player-data.json` 自动同步及 `sound/` 自定义音效目录。
- `1.4.0`：多文件目录与 `--app` 本地房主应用壳，支持跨源直连 IP 好友房。

## 1.0.0 – 1.3.2 · 初始发布与早期演进
- 深圳大学粤海校区 3D 计时赛起步，陆续引入伦敦 Bloomsbury（UCL）地图、种子赛道、`.ghost.json` 友人影子、WebGL 2 静态分块性能优化与 WebRTC 多人联机原型。
