# FORZERO 开发指导

本文件是仓库内唯一的强制开发指导。FORZERO-WORK-GUIDE.md 只提供源码索引和命令速查。

## 开始任务

1. 先阅读本文件。
2. 按任务范围查阅 FORZERO-WORK-GUIDE.md。
3. 只看 CHANGELOG.md 顶部条目，了解最近改动和已完成的验证。
4. 需要了解玩家功能时再看 README.md。

除非用户明确要求追溯历史，不要读取 HISTORY.md。

## 当前代码入口

- src/ 是 2.x 生效源码。
- src/data/ 保存玩法参数、价格、车辆、路面、赛事、车流和环境数据。
- src/ride/ 保存物理、车辆和驾驶状态机。
- src/race/ 保存赛事、AI、幽灵、赛道变体和成绩逻辑。
- src/world/ 保存地图、路网、碰撞查询和场景构建。
- src/world/assets/ 保存可复用的程序化 3D 资产。
- src/render/ 保存 WebGL2 渲染和天气效果。
- src/ui/ 保存 DOM、HUD、设置、车库和存档同步。
- src/online/ 保存客户端联机逻辑，server/ 保存本地服务端、房间/路线规则与启动器模板。
- scripts/ 保存构建、打包、自动驾驶辅助（scripts/lib/drive-path.js）和持续验证脚本。

## 搜索和阅读边界

- 使用 rg，只搜索与任务直接相关的 src/、server/ 或 scripts/ 文件。
- 源码搜索优先限定 *.js、*.py、*.css 和 *-dialog.html。package.json、fixture 和 Markdown 仅在任务需要时定点读取。
- 旧版对拍只在明确需要时查阅 szu-litchi-dev/ride-update/ 或旧地图层。
- 不搜索或整读发行产物和历史文件，包括 game.js、szu-litchi-loop.html、forzero-budget-mobile-*.html、release/、forzero-budget-*、szu-litchi-loop/dist/ 和 HISTORY.md。
- 必须确认产物时，先搜索定位行号，再局部读取不超过 120 行。ride-update/build.py 也遵循此限制。

## 修改原则

- 新增参数和规则放在 src/data/，不要把魔法数字散落在物理、地图或 UI 中。
- 新增可复用的围挡、栏杆、树、街具、路灯、车辆或场景网格时，在 src/world/assets/ 对应分类模块（`trees.js`、`rail-fence.js`、`street-furniture.js`、`lamps.js`、`barriers.js`、`traffic-vehicles.js`、`campus-v220.js`）创建或扩展 emitXxx(spec, dependencies) 形式的纯函数，并在 `src/world/assets/index.js` 统一重导出，不要把同类小件建模再内联堆入地图主文件。资产模块不得读取全局 worldState、消费全局随机流或操作 DOM。
- 地图特有逻辑通过地图注册和查询接口接入。独立子系统放在对应模块，由地图主文件或 `src/ui/app.js` 等入口装配。`app.js` 还负责帧循环调度。修改 `app.js` 时，随相关改动增量抽取能通过清晰接口独立维护的逻辑，并运行浏览器验收。
- 已稳定的地图主文件和 src/online/client.js 不做没有收益的强行拆分。
- 客户端与服务端共用的配件、价格、预算和协议规则必须同时检查两侧。违禁配件成绩不得进入正式存档、勋章或官方影子。
- 浏览器端和联机服务端保持零第三方运行时依赖。非用户明确要求，不在一级菜单或顶栏新增按钮，新开关放在发车区或二级设置。
- **渐进式 JSDoc 类型检查（`// @ts-check`）**：保持 `jsconfig.json` 中 `"checkJs": false`，不将 `.js` 源码迁移为 `.ts`，也不对旧 WebGL 渲染器、地图主文件或 `src/ui/app.js` 强行开启全局 `checkJs`。
- 新增或大幅修改纯逻辑与契约模块（如 `src/data/`、`src/race/`、`src/ride/` 纯规则、路线/皮肤校验、状态机或协议桥接）时，在文件首行添加 `// @ts-check` 并用 JSDoc（`@typedef` / `@param` / `@returns`）声明公开数据结构与函数签名；修改已开启 `// @ts-check` 的文件时，禁止通过移除 `// @ts-check` 或添加 `@ts-ignore` 绕过类型错误。
- 2.2.0 地图资产优先使用 src/world/assets/campus-v220.js 和 src/data/map-assets.js。旧资产保留为 legacy，纯视觉细节不新增碰撞体。
- 不得通过删除、注释或弱化断言来绕过验证。合法的地图、资产或版本变化要同步检查对应基线，并在更新日志说明原因。

## 构建和验证

- 修改 2.x 源码后运行 npm run build，再按改动面选择定向验证。
- 静态检查与类型门禁运行 `npm run lint` 与 `npm run typecheck`（`tsc -p jsconfig.json --noEmit`）。
- `npm run verify:hygiene` 报告 `src/ui/app.js` 的行数。超过 1700 行时提示复核改动的职责边界，校验继续执行。
- 数据、资产和地图改动优先运行 node scripts/verify-data.mjs、node scripts/verify-assets.mjs 和 node scripts/verify-maps.mjs [szu|ucl|shunde]。
- 物理、竞速、确定性和对拍改动按需运行 node scripts/verify-drafting-ai.mjs、node scripts/verify-deterministic-race.mjs、node scripts/verify-esm-parity.mjs 和 node scripts/verify-runtime-parity.mjs。
- 浏览器、存档、联机和性能改动按需运行 node scripts/verify-browser.mjs、node scripts/verify-save.mjs、node server/verify.mjs、node scripts/verify-four-player.mjs 和 node scripts/verify-performance.mjs。
- 地图资产改动还要运行 npm run verify:map-assets-perf，并检查 scripts/fixtures/map-assets-2.1.2.json、scripts/fixtures/map-regression.json 与硬件性能基线。
- 发行前运行 `npm run lint`、`npm run typecheck` 与 `npm run build:release`。版本以 package.json、scripts/build.mjs 和 src/index.html 的一致状态为准。

## 发行和存档

- 发行同步时跳过 save/、player-data.json、dist-v2/ 临时内容和旧链调试产物，不覆盖玩家存档。
- 准备公开仓库上传包 `github-upload-<version>/` 时，必须拆分为互不混杂的两部分（优先直接执行 `npm run release:github`）：
  - `github-upload-<version>/repo/`：仅保留推送到 GitHub 主干的纯净工程与文档（根目录 `.editorconfig`、`.gitattributes`、`.gitignore`、`AGENTS.md`、`CHANGELOG.md`、`CONTRIBUTING.md`、`FORZERO-ROUTE-SKIN-DESIGN.md`、`FORZERO-WORK-GUIDE.md`、`HISTORY.md`、`LICENSE`、`README.md`、`SECURITY.md`、`eslint.config.mjs`、`jsconfig.json`、`package.json`、`package-lock.json` 与 `.github/`、`src/`、`server/`、`scripts/`）；严格排除历史 1.9.1.1 大文件目录（`szu-litchi-dev/` 等）、构建分发包（`forzero-budget-*`、`*.zip`、`forzero-budget-mobile-*.html`、`szu-litchi-loop/dist/`、`dist-v2/`）、`node_modules/`、`legacy/`、`save/`、`player-data.json`、`.openai/`、`__pycache__/`、`chrome-*` 与临时调试产物，且须在 `repo/` 目录内通过 `node scripts/verify-hygiene.mjs` 与 `npm test`。
  - `github-upload-<version>/release-assets/`：仅放挂到 GitHub Releases（`v<version>`）的玩家下载产物与校验清单（`forzero-budget-<version>.zip`、`forzero-budget-mobile-<version>.html`、`SHA256SUMS.txt`、`MANIFEST.json`、`RELEASE-NOTES.md`），确保压缩包不含 `save/` 或 `player-data.json`，并核对 SHA-256 与 `SHA256SUMS.txt` 一致。
- 升级版本号并生成上传包时，同步保持 `README.md` 顶部的「直接下载游玩（玩家入口）」指向 GitHub Releases（`v<version>`）。
- 旧版 szu-litchi-dev/ride-update/build.py 只用于明确的 1.9.1.1 回归任务，不作为 2.x 入口。
- 维护旧链时保留 rounds/drive-path.js，不在 ride-update/ 残留手机单文件、截图或调试脚本。阶段产物验收后清理失效的 dist-v2/ 临时内容。
- 向公开仓库同步前检查 remote 和暂存清单。

## 收尾

- 完成代码修改并通过验证后，在 CHANGELOG.md 顶部的 Unreleased 或当前版本条目记录改动、核心路径、验证命令以及是否更新基线。
- 新增源码目录、玩法模块或验证脚本时，同步更新 FORZERO-WORK-GUIDE.md 的索引。
- 记录结论和实际验证，不写失败日志、临时调试过程或大段命令输出。
