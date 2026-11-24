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
