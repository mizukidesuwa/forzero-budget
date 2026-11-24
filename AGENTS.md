# 项目开发与省 Token 规范（所有模型通用）

## 2.0.0 开发与发行

- 2.0.0 的生效源码在 `src/`，构建与验收脚本在 `scripts/`。开发入口和可运行的测试见 `FORZERO-WORK-GUIDE.md`。
- `npm run build` 用于开发，`npm run build:release` 生成压缩桌面、手机单文件和确定性 ZIP。定向测试见 `FORZERO-WORK-GUIDE.md`。
- 公开仓库保留当前版本的发行文件、源码、程序化资产和构建工具。发行同步与公开上传均排除个人 `save/`，本地版本目录的存档单独迁移与校验。

本仓库（FORZERO: BUDGET / 有限竞速：地贫线）已做精简清理。所有接手模型必须严格遵守以下规则，避免无效搜索与上下文膨胀：

## 1. 搜索范围限定
- **只搜目标源码**（`*.js` / `*.py` / `*.css` / `*-dialog.html`）：
  - 2.0.0 查 `src/` 的对应模块，联机服务查 `szu-litchi-dev/online/`。
  - 对拍 1.9.1.1 时按需查 `ride-update/` 或对应旧地图层，不以旧链文件为 2.0.0 生效入口。
- **严禁全盘搜索或搜产物**：禁止搜索 `game.js`、`szu-litchi-loop.html`、`forzero-budget-mobile-*.html`、`release/`、`forzero-budget-*`、`szu-litchi-loop/dist/`、`HISTORY.md`。

## 2. 严禁整文件读取巨型产物与历史档
- **禁止无行号整读**：任何 `game.js`、`szu-litchi-loop.html`、`forzero-budget-mobile-*.html`、`HISTORY.md`。
- 需要确认打包后逻辑或锚点时，先精准搜索定位行号，再用 `StartLine`/`EndLine` 仅读局部区间（≤120 行）。读 `ride-update/build.py`（~190 KB）同样先搜锚点再局部读取。

## 3. 文档按需阅读
- 了解现状只读精简版 `FORZERO-WORK-GUIDE.md` 与 `CHANGELOG.md` 顶部最新版本条目；除非用户明确追问 1.8.5 及更早历史，否则不读 `HISTORY.md`。

## 4. 临时产物与旧版基线

- 正式包验收后，清理 `dist-v2/` 中已失效的阶段构建。验收入口应指向正式安装目录、公开仓库根目录或显式指定的产物目录。
- 以下旧链和归档规则适用于包含 1.9.1.1 基线的完整工作区。公开仓库通过 Git 历史保留旧发行文件。
- 若维护旧链的上游地图层，按 **`campus-map → endurance → road-junctions → garage → architecture → bloomsbury → slopes → london → ride-update`** 从所改层向下运行 `build.py`（中间层生成的 `game.js` 验证后移除）。
- 禁止在 `ride-update/` 残留 `*-mobile-*.html`、临时截图目录或调试脚本；`build.py` 仅向仓库根目录输出手机单文件。勿删 `rounds/drive-path.js`。
- 发布新版本后，将旧目录、旧单文件与旧 `.zip` 移至本地工作区指引指定的归档目录。移动前确认当前版本 `save/player-data.json` 已保留最新玩家存档。

## 5. 构建与定向验证
- 修改 2.0.0 源码后跑 ESM 构建与定向测试。完整工作区发布时用 `npm run build:release` 的桌面产物同步版本目录和 `szu-litchi-loop/dist/`，不得覆盖 `save/`。旧 `ride-update/build.py` 仅生成回归基线。
- 1.9.0 的专项验收入口为 `verify-190.mjs`。联机改动同时跑 `online/verify.mjs`。配件及价格共用 `online/tuning-190.cjs`，违禁成绩不得进入存档、勋章或官方影子。

## 6. 2.0.0 模块化与资产化规范（防屎山红线）
- **数据与逻辑分离**：新增玩法参数、配速、价格、车流与环境常量统一写入 `src/data/`（如 `race.js`、`parts.js`、`surfaces.js`、`environment.js`、`tuning-190.cjs` 等），严禁在物理、地图或 UI 代码中散落魔法数字。
- **程序化 3D 模型必须资产化**：新增可复用场景道具、路障/围挡、车流载具等程序化网格，一律在 `src/world/assets/` 下按 `rail-fence.js`、`lamps.js`、`trees.js` 的纯函数 Emitter 规范独立建文件（如 `emitXxx(spec, { scenery, urban, footprint, ... })`），所有依赖通过参数注入；严禁在资产模块内读取 `worldState`、消费全局随机流或耦合 DOM/UI，严禁将零散 `box`/`tube` 直接堆进 `szu.js`、`ucl.js`、`shunde.js` 主文件。
- **禁止继续膨胀大文件**：禁止向 `src/world/maps/szu.js`、`src/ui/app.js` 等大聚合文件直接堆叠新子系统；独立玩法特性（如赛道变体派生、尾流弹弓状态机等）应拆分为独立纯函数模块并按需导出至 `src/test-exports.js`；地图特有逻辑通过 `registerCampus()` 接入 `src/world/registry.js` / `query.js`，避免业务层到处写 `if (campus === ...)` 分支。对 `src/ui/app.js` 遵循增量剥离原则：不专门发起重构专项，后续需修改车库、设置弹窗或输入控制等 UI/玩法时，顺手将对应区块抽成独立模块，改一块并用 `node scripts/verify-stage6-browser.mjs` 验一块；已稳定的地图主文件（`szu.js`、`ucl.js`）与 `src/online/client.js` 不作无收益硬拆。
- **基线与版本硬编码同步纪律**：禁止通过注释、删除或弱化 `scripts/verify-*.mjs` 断言来绕过校验；当合法修改改变了地图几何、资产或版本号时，须同步检查并更新 `scripts/build.mjs` 版本常量、`scripts/verify-stage4-assets.mjs` / `scripts/verify-stage5-maps.mjs` 对应基线快照，并说明变更原因；浏览器端与联机服务端保持零第三方运行时依赖。
- **UI 与公开上传纪律**：非用户明确要求，禁止在一级菜单或顶栏新增按钮（新开关收敛进发车区或二级设置）；向 GitHub 提交或同步前必须核查 remote 与暂存清单，严禁包含 `save/`、`player-data.json`、`dist-v2/` 临时缓存或旧链调试产物。

## 7. 收尾留痕与交接规范
- **改动留痕统一写进 `CHANGELOG.md` 顶部**：每次完成代码修改并通过验证后，必须在 `CHANGELOG.md` 顶部条目（如 `## Unreleased` 或对应版本 `## 2.1.0`）用简洁条目记录：做了什么改动、涉及的核心模块路径、跑过的定向验证命令，以及是否更新了地图/资产基线快照。
- **结构变更同步更新 `FORZERO-WORK-GUIDE.md`**：新增资产目录、玩法模块或验证脚本时，须同步更新 `FORZERO-WORK-GUIDE.md`（注意仅追加在第 78 行之后，不得改动或破坏前 78 行给 `scripts/verify-stage6-maintenance.mjs` 使用的读取窗口行号）。
- **控制体量，不写流水账**：禁止把大段控制台日志、失败尝试或临时调试流水写进 `CHANGELOG.md`、`AGENTS.md` 或膨胀 `HISTORY.md`，保证下一任模型只读 `CHANGELOG.md` 顶部几十行即可准确接手。
