# FORZERO: BUDGET（有限竞速：地贫线）开发速查

本文档是源码、构建和验证的按需索引，不是第二份开发规则。规则只看仓库根目录的 AGENTS.md。

## 2.5.1 生效源码索引

2.5.1 在 2.5.0 基础上新增 ESLint AST 静态检查（`eslint.config.mjs`，拦截 `no-undef` 等语法缺陷，零运行时依赖），并将活跃服务端与自动跑圈助手迁移至 `server/` 与 `scripts/lib/drive-path.js`（彻底将历史包 `szu-litchi-dev/` 移出公开仓库）。玩法功能、地图、资产与物理基线与 2.5.0 完全一致。

| 入口 | 依赖 | 定向测试 |
| --- | --- | --- |
| `src/entry.js`、`src/debug-bridge.js`、`src/test-exports.js` | `src/ride/`、`src/world/`、`src/data/`、`scripts/lib/drive-path.js` | `npm test`、`node scripts/verify-esm-parity.mjs`、`node scripts/verify-runtime-parity.mjs` |
| `src/ui/language.js`、`src/ui/presentation-text.js`、`src/data/english-text.js` | 设置语言选择、界面词条和动态文案。翻译应用于界面与俯视地图文字。路线身份、记录键及场景招牌沿用原数据 | `npm run verify:hygiene`、`node scripts/verify-browser.mjs`、`node scripts/verify-four-player.mjs --drive` |
| `src/ui/app.js`、`friend-duel.js`、`medal-travel.js`、`workshop-ui.js`、`settings-dialog.js` | 主舞台/循环胶水、友人对战弹窗、勋章/三站旅行与海拔图、车库/预算/皮肤导入 UI、二级设置面板 | `npm run build`、`npm run verify:hygiene`、`node scripts/verify-browser.mjs` |
| `src/data/interface.js`、`src/ui/hud-controls.js`、`src/render/ride-camera.js` | HUD / 触屏按钮缩放和视角偏好、全屏视角控制、三档镜头 | `node scripts/verify-browser.mjs`、`node scripts/verify-save.mjs` |
| `src/data/vehicles.js`、`parts.js`、`surfaces.js` | `src/ride/vehicles.js`、`physics.js` | `node scripts/verify-data.mjs` |
| `src/data/shared-rules.cjs`、`server/shared-rules.cjs` | 联机捉人、路线规则/路网快照与皮肤限制单源真源（双端复用） | `npm run lint`、`node scripts/verify-data.mjs`、`node server/verify.mjs` |
| `src/data/routes.js`、`src/race/route-code.js`、`src/race/route-key.js`、`src/race/route-validation.js` | 版本化 fixed/seed/network RouteRef、R1 编码、网络 revision/边链校验、canonical key 和环境键 | `node scripts/verify-data.mjs`、路线编码回环和网络重建探针 |
| `src/world/route-resolver.js`、`src/world/route-builder.js`、`src/world/seed-courses.js`、`src/ui/map-controls.js`、`src/ui/seed-dialog.js`、`src/ui/app.js` | fixed/seed/network `R1...` 路线导入、地图点选道路建线、道路边路线重建、方向/圈数变体和联机身份 | `npm run build`、`node scripts/verify-route-builder-chase.mjs`、`node scripts/verify-browser.mjs` |
| `src/data/rider-skins.js`、`src/ride/rider-skin.js`、`src/ride/models.js` | shared-rider-v1 SkinModelSpec、AI JSON/ModelFile 导入、比例/挂点/图元白名单、完整非人类模型发射 | `node scripts/verify-data.mjs`、SkinModelSpec 导入和网格探针 |
| `src/ride/vehicles.js`、`src/ride/models.js`、`src/data/vehicles.js`、`src/replay/ghost.js`、`src/online/client.js`、`server/server.mjs` | 独立骑手皮肤缓存与四载具座椅挂点适配、本地/Ghost/联机 profile、规范哈希、低频 manifest 和旧字段回退 | `node scripts/verify-data.mjs`、`node scripts/verify-save.mjs`、`node scripts/verify-four-player.mjs --drive`、`node server/verify.mjs` |
| `src/world/traffic.js`、`src/render/traffic.js`、`src/ride/physics.js` | 按物理时间复用车流姿态，渲染点与碰撞姿态隔离 | `node scripts/verify-maps.mjs`、`node scripts/verify-esm-parity.mjs` |
| `src/render/webgl-renderer.js` | 动态骑手网格容量复用和 `bufferSubData` 更新 | `node scripts/verify-browser.mjs`、`node scripts/verify-performance.mjs --repeat-maps --route --memory` |
| `src/data/tuning-190.cjs`、`server/tuning-190.cjs` | 客户端及 `server/` 房间服务 | `node scripts/verify-data.mjs`、`node server/verify.mjs` |
| `src/world/assets/`、`src/world/maps/ucl/gardens.js` 的 `extraGardenFences` | `src/world/maps/ucl.js` | `node scripts/verify-assets.mjs` |
| `src/world/maps/{szu,ucl,shunde}/` 中的 `courses.js` 检查点与地图数据 | `src/world/query.js`、`src/world/scene-builder.js` | `node scripts/verify-maps.mjs [szu|ucl|shunde]` |
| `src/data/modes.js`、`src/race/chase.js`、`src/race/online-chase.js`、`src/race/blind-nav.js`、`src/ui/mode-hud.js` | 单人影子追捕、联机捉人与夜骑盲区规则常量、纯状态机与 HUD 渲染 | `node scripts/verify-route-builder-chase.mjs`、`node scripts/verify-chase-blind.mjs`、`node scripts/verify-esm-parity.mjs`、`node scripts/verify-browser.mjs` |
| `eslint.config.mjs`、`scripts/build.mjs`、`scripts/verify-hygiene.mjs`、`scripts/verify-all.mjs`、`scripts/stage-release.mjs` | ESLint AST 检查（`no-undef` 等）、esbuild 0.28.2、`metafile` 体积汇报、静态门禁、分层验收编排、校验暂存与 GitHub 分包上传（`--github`） | `npm run lint`、`npm test`、`npm run verify:e2e`、`npm run verify:all`、`npm run build:release`、`npm run release:stage`、`npm run release:github` |
| `server/server.mjs`、`server/room-rules.cjs`、`server/route-rules.cjs` | 桌面本地服务、房规与 canonical 路线 profile、跨版本存档迁移 | `node scripts/verify-save.mjs`、`node server/verify.mjs` |

> 历史交付与早期架构见 [HISTORY.md](HISTORY.md)；版本流水见 [CHANGELOG.md](CHANGELOG.md)；1.8.6 车流见本地归档 `szu-litchi-dev/ride-update/1.8.6-traffic.md`。巨型 `perf-*.json`、截图与旧包已归档至 `D:\szubikeGPT-archive\`。

## 1. 2.5.1 构建产物与本地版

- `npm run build:release` 生成 `dist-v2/desktop/`、`dist-v2/forzero-budget-2.5.1.zip` 和 `dist-v2/forzero-budget-mobile-2.5.1.html`。
- `npm run release:stage` 将可分发归档、校验清单（`SHA256SUMS.txt`、`MANIFEST.json`、`RELEASE-NOTES.md`）暂存到 `dist-v2/release/v2.5.1/`；`npm run release:github` 按 `AGENTS.md` 规范生成拆分式 GitHub 上传目录 `github-upload-2.5.1/repo/`（纯净源码树，含 `src/`、`server/`、`scripts/`、`.github/` 且不含 `szu-litchi-dev/`）与 `github-upload-2.5.1/release-assets/`（Releases 附件与 `RELEASE-NOTES.md`）。
- `.github/workflows/ci.yml`（推送/PR 到 `main` 时自动在 Ubuntu 与 Windows 双平台运行 `verify` 节点检查，并在 `ubuntu-latest` 运行 `browser-e2e` 无头 Chrome 桌面/手机 E2E 验收；`scripts/browser-runner.mjs` 支持 Windows/Linux/macOS）、`.github/workflows/pages.yml`（校验并发布静态网页到 GitHub Pages）与 `.github/workflows/release.yml`（推送 `v*` tag 后自动执行 `build:release`、`verify:fast`、`release:stage` 并发布 GitHub Release 附件）。
- 本地 `szu-litchi-dev/` 全量历史包仅保留在本地硬盘作离线 `1.9.1.1` 对拍，不再放入公开 GitHub 仓库。
- 2.5.1 桌面版优先读取同级 `forzero-budget-2.5.0/save/player-data.json`，并向下兼容 `2.4.0`、`2.3.4` 及前序存档。手机单文件可通过游戏设置导出和导入备份。

### 2.3.1 本地路径

- **桌面目录**：`forzero-budget-2.3.1/`（个人存档在 `save/player-data.json`），公开分发使用同名 ZIP。
- **手机单文件**：`forzero-budget-mobile-2.3.1.html`。
- **分发镜像**：`szu-litchi-loop/dist/` 与公开发布目录 `github-upload-2.3.1/`。
- **回归基线**：1.9.1.1，以下旧链索引用于定位旧版行为。

## 2. 1.9.1.1 旧链源码与地图索引

### 上游纯净地图源码层（自上而下重构建顺序）
`street-riding/szu-litchi-loop.html` → `campus-map` → `endurance` → `road-junctions` → `garage` → `architecture` → `bloomsbury` → `slopes` → `london` → `ride-update`

| 地图/基础层 | 保留源码职责 |
| --- | --- |
| `campus-map/` | 深大路网（`campus-plan.js`）、校门（`entrances.js`）、场地（`grounds.js`）、地标与沧海区域 |
| `endurance/` / `road-junctions/` | 校内耐力线、校外干道（`public-roads.js`）与立交桥梁（`bridges.js`） |
| `garage/` / `architecture/` | 载具基模、西门/南区/院系楼宇模型（`faculty.js`、`south.js`、`west-gate.js`） |
| `bloomsbury/` / `slopes/` | 伦敦街区/高街（`buildings.js`、`high-street.js`）、杜鹃山地形与立交赛（`terrain.js`、`courses.js`） |
| `london/` | 伦敦完整建筑、路网、商铺、公交与 7 条固定赛（`layout.js`、`races.js`、`shops.js`、`transport.js` 等） |
| `rounds/drive-path.js` | 多条 `verify*.mjs` 复用的自动跑圈驱动脚本（勿删） |

### 末端汇总与玩法模块（`szu-litchi-dev/ride-update/` 与 `online/`）

| 文件 | 职责 |
| --- | --- |
| `ride-update/build.py` | 读 `london/szu-litchi-loop.html`、注入模块并生成 `game.js`、`release/` 与根目录手机单文件 |
| `ride-update/traffic.js` | 局内车流阵型、发车 28m 保护区、确定性位置查询 |
| `ride-update/qingyun.js` / `shunde-mountain.js` | 顺峰山、青云湖、神步山爬坡/下坡、碎石路与落水/落崖判定（含通用 `nearestPathSpot`） |
| `ride-update/szu-boundaries.js` | 深大校门广场区、紧致围栏收口、外侧引道低缘绿篱与文山湖落水 AABB 遣返 |
| `ride-update/shenzhen-perimeter.js` / `shenzhen-courses.js` | 深大外围退界/道路、荔香公园与城景赛事 |
| `ride-update/gameplay-170.js` / `gameplay-170.css` | 实时差值、风场、紫牌与勋章、闪送（含 `nearestCourierLandmark`） |
| `ride-update/vehicle-skills.js` / `environment-190.js` | 载具技能、速度视野、积水几何和判定、种子阵风与两点遮挡 |
| `ride-update/ai-rivals.js` / `practice-review.js` | 从赛道基准推进 AI،复用碰撞与尾流、俯视回放与单练 |
| `online/tuning-190.cjs` | 客户端与服务端共用配件目录、价格和预算规则 |
| `ride-update/bike.js` / `bike-workshop.js` / `bike-models.js` / `bike-workshop.css` | 载具数值、5 槽调校、外观、HUD 与移动端触屏样式 |
| `ride-update/online-ui.js` / `online-rtc.js` / `online-dialog.html` / `online.css` | P2P 联机界面、WebRTC 同步、改车倒计时与尾流 |
| `ride-update/save-sync.js` / `sound.js` / `atmosphere.js` / `shortcuts.js` / `practice-review.js` / `station-travel.js` | 存档同步、音效、天气、近路、复盘单练、三站旅行 |
| `online/server.mjs` / `room-rules.cjs` / `start-game.bat` | 本地应用壳 `--app`、信令、房间状态机与轮次结算 |

## 3. 构建、同步与定向验证

2.3.1 使用 `npm run build:release`。依赖缺失时再运行 `npm ci`。把 `dist-v2/desktop/` 中的发行文件同步到当前版本目录和 `szu-litchi-loop/dist/`，跳过 `save/`。以下 Python 与旧版验证命令只用于重建 1.9.1.1 回归基线。2.1.2 仅作为地图资产和性能基线。

```powershell
python szu-litchi-dev/ride-update/build.py
node --check szu-litchi-dev/ride-update/game.js
node --check szu-litchi-dev/online/server.mjs

# 按改动面定向跑对应验证：
node szu-litchi-dev/ride-update/verify-190.mjs               # 车型技能、天气、闪送、AI、回放、预算与隔离
node szu-litchi-dev/ride-update/verify-map.mjs               # 深大边界、去捷径、落水遣返与 UCL 净空
node szu-litchi-dev/ride-update/verify-186-ui.mjs            # 四车型车库 / HUD / 触屏 / 二级说明 / freeRide
node szu-litchi-dev/ride-update/verify-traffic.mjs           # 车流阵型与时钟
node szu-litchi-dev/ride-update/verify-1.6.0.mjs --traffic   # Chrome 车流开关与碰撞
node szu-litchi-dev/ride-update/verify-1.6.0.mjs --mobile-save # 手机存档导入导出
node szu-litchi-dev/ride-update/verify-park.mjs              # 青云湖环线 / 湖心栈道双向通行 / 落水遣返
node szu-litchi-dev/ride-update/verify-mountain.mjs          # 神步山上下坡 / 动力载具碎石调校与雨天制动
node szu-litchi-dev/ride-update/verify.mjs                   # 核心物理、种子与 UCL 净空
node szu-litchi-dev/online/verify.mjs                        # 联机服务端 API 与房间状态机
```

## 4. 模块化与资产化边界（接手必读）

> 本节说明当前源码的模块边界与持续验证入口，完整规则见仓库根目录的 AGENTS.md。

| 模块目录 | 职责边界 | 禁止事项 |
| --- | --- | --- |
| `src/data/` | 载具、配件、路面、赛事、技能与环境常量表（`tuning-190.cjs` 与服务端共用） | 不混入 DOM、渲染逻辑或运行时可变状态 |
| `src/world/assets/` | 纯函数程序化 3D 资产（`emitXxx(spec, { scenery, footprint, ... })`） | 不读 `worldState`、不消耗全局随机流、不耦合 UI |
| `src/world/maps/<campus>/` | 校区路网、赛道、地形与花园数据，主文件通过 `registerCampus()` 接入 `registry.js` / `query.js` | 不在地图主文件直接堆砌零散几何体或新业务系统 |
| `src/ride/` | 物理步进、车型实例化、预算/调校规则与独立驾驶状态机（导出至 `src/test-exports.js`） | 不在物理循环硬编码散落魔法数字或直接操作 DOM |
| `src/race/` | 计时赛、AI 对手、闪送、纪录、种子码与赛道变体派生 | 不突破违禁件隔离规则，不与特定校园实现强耦合 |
| `src/render/` | WebGL2 分块上传、着色器、天空/天气渲染与视锥剔除 | 不承载游戏规则判定或存档逻辑 |
| `src/ui/` | DOM 交互、HUD、小地图、音效与本地存档同步 | 不在 `app.js` 内混写物理/地图算法，不擅自扩充一级菜单按钮 |

- **基线与版本同步**：合法变更几何、资产或升级版本号时，须同步核对并更新 `scripts/build.mjs` 版本常量、`scripts/verify-assets.mjs` 与 `scripts/verify-maps.mjs` 快照，禁止注释或弱化断言；服务端迁移序列同步支持前序正式版存档读取。

### 2.1.0 玩法入口

| 功能 | 模块 | 验收 |
| --- | --- | --- |
| 尾流蓄力和弹弓 | `src/ride/drafting.js`、`src/data/race.js`、`src/render/wake-lines.js`、`src/ui/draft-hud.js` | `node scripts/verify-210.mjs` |
| 深大通行和伦敦车流 | `src/world/maps/szu/barriers.js`、`src/world/maps/ucl/traffic.js`、`src/data/traffic.js`、`src/world/assets/` | `node scripts/verify-assets.mjs`、`node scripts/verify-maps.mjs` |
| 反向、顺峰山闭环多圈与 AI 胜场 | `src/race/course-variants.js`、`rival-pace.js`、`ai-results.js`、`src/ui/race-options.js` | `node scripts/verify-210.mjs` |
| 四项全能与预算 | `szu-litchi-dev/online/room-rules.cjs` | `node szu-litchi-dev/online/verify.mjs` |
| 桌面与手机单文件、长按触控 | `src/styles/base.css`、`src/ui/app.js` | `node scripts/verify-browser.mjs` |

深大地图快照更新对应棕榈退界、可通行草地和新增围墙碰撞。UCL 静态场景快照继续对拍原有资产，新增动态车模单独校验随机流、面数和发车保护。

### 2.3.1 继承的车流与尾流入口

- 伦敦车流的道路、密度、发车视野、路端渐隐及空档由 `src/data/traffic.js`、`src/world/maps/ucl/traffic.js` 和 `src/world/traffic.js` 管理。运行 `node scripts/verify-maps.mjs ucl` 检查双向路端、闭环接缝和车流分布。
- `src/world/assets/traffic-vehicles.js` 生成两档车模，`src/render/traffic.js` 负责视锥裁剪和分批提交。运行 `node scripts/verify-browser.mjs` 检查 WebGL 实例绘制及手机单文件。
- `src/world/traffic.js` 以 actor 和物理时间缓存 `trafficPosition`，`src/render/traffic.js` 使用独立 `renderPoint`，避免渲染高程修正污染碰撞姿态。当前复用精确姿态，不额外改变 `drawScene` 时序，渲染 accumulator 插值留待独立 profiling。
- `src/ride/physics.js` 只对 AI 和联机骑手采样尾流。普通车流仍由碰撞开关控制。用 `node scripts/verify-210.mjs` 和 `node scripts/verify-esm-parity.mjs` 检查蓄力、弹弓及对拍。
- 当前安装和上传目录为 `forzero-budget-2.3.1/`、`github-upload-2.3.1/`。已迁移存档的旧发行文件放在本地 `legacy/`。

### 2.3.1 确定性竞速与复盘入口

- `src/world/traffic.js`、`src/race/environment-key.js` 和 Ghost 元数据为固定赛道、变体、车流、天气与风生成稳定环境标识，旧 Ghost 缺少该字段时按旧数据回退。
- `src/race/rival-pace.js`、`src/data/race.js` 和 `src/race/rivals.js` 为标准/强劲 AI 提供确定性的线路偏置、弯道配速、受控失误、跟车增益和技能延迟。
- `src/race/courier.js` 通过事件/会话种子注入随机源，`src/race/feedback.js` 与 `src/ui/app.js` 在完赛复盘显示尾流、车流、逆风、路面和弯道反馈。
- 定向验收使用 `node scripts/verify-212.mjs`、`node scripts/verify-210.mjs`、`node scripts/verify-esm-parity.mjs`、`node scripts/verify-browser.mjs`、`node scripts/verify-performance.mjs` 和 `node scripts/verify-four-player.mjs --drive`。

### 2.3.1 地图资产精修与性能入口

- src/world/assets/campus-v220.js 是三张地图共用的纯函数细节发射器，src/data/map-assets.js 保存版本标记、风格参数和性能预算。2.1.2 的旧地图函数与资产保留为 legacy 基础层。
- UCL 空地细节从 src/world/maps/ucl/gardens.js 的官方坐标轮廓接入，补充庭院轴线、树阵、花池和座椅。到达庭院门口花坛由 `src/data/map-assets.js` 提供单一床位数据，`src/world/assets/campus-v220.js` 同时接收视觉 sink 和既有 footprint sink，`src/world/maps/ucl.js` 只负责注入 `uclFixtures`。候选填充楼层按 legacy 街墙和现有前排建筑过滤，避免重复建模。
- 深大城市细节从现有 perimeterLots 接入，补充街区立面层和遮荫构件，不新增 citySolid。
- 顺峰山牌坊保留旧视觉模型，新增牌坊广场、石桥栏杆和屋檐细节。牌坊石柱使用独立的窄碰撞 footprint，中心门洞和内侧净空由 node scripts/verify-maps.mjs shunde 固化验收。
- 精细化性能预算以 2.1.2 为基线，运行 npm run verify:map-assets-perf 检查三角面与 mesh cell 增量。发行后运行 node scripts/verify-performance.mjs --repeat-maps --route --memory 检查浏览器帧时延、绘制调用、三角面和内存。
- 2.3.1 第一阶段性能优化保持碰撞语义和姿态包结构。UCL 定点花坛修复同步更新资产哈希、ESM 统计断言、运行时树摘要和性能统计，发行入口使用 npm run build:release，产物位于 dist-v2/desktop/、dist-v2/forzero-budget-mobile-2.3.1.html 和对应确定性 ZIP。同步版本目录时跳过 save/ 和 player-data.json。
