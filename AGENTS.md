# 项目开发与省 Token 规范（所有模型通用）

本仓库（FORZERO: BUDGET / 有限竞速：地贫线）已做精简清理。所有接手模型必须严格遵守以下规则，避免无效搜索与上下文膨胀：

## 1. 搜索范围限定
- **只搜目标源码**（`*.js` / `*.py` / `*.css` / `*-dialog.html`）：
  - 核心玩法、UI 与顺峰山/深大外围：`szu-litchi-dev/ride-update/` 与 `szu-litchi-dev/online/`。
  - 深大校内、杜鹃山或伦敦地图：按需只搜对应的 `campus-map/`、`endurance/`、`road-junctions/`、`garage/`、`architecture/`、`bloomsbury/`、`slopes/`、`london/`。
- **严禁全盘搜索或搜产物**：禁止搜索 `game.js`、`szu-litchi-loop.html`、`forzero-budget-mobile-*.html`、`release/`、`forzero-budget-*`、`szu-litchi-loop/dist/`、`HISTORY.md`。

## 2. 严禁整文件读取巨型产物与历史档
- **禁止无行号整读**：任何 `game.js`、`szu-litchi-loop.html`、`forzero-budget-mobile-*.html`、`HISTORY.md`。
- 需要确认打包后逻辑或锚点时，先精准搜索定位行号，再用 `StartLine`/`EndLine` 仅读局部区间（≤120 行）。读 `ride-update/build.py`（~190 KB）同样先搜锚点再局部读取。

## 3. 文档按需阅读
- 了解现状只读精简版 `FORZERO-WORK-GUIDE.md` 与 `CHANGELOG.md` 顶部最新版本条目；除非用户明确追问 1.8.5 及更早历史，否则不读 `HISTORY.md`。

## 4. 地图链路与零残余原则
- 若修改上游地图层，须按 **`campus-map → endurance → road-junctions → garage → architecture → bloomsbury → slopes → london → ride-update`** 从所改层依次向下运行 `build.py`（中间层若生成了 `game.js` 勿搜读或验证后移除）。
- 禁止在 `ride-update/` 残留 `*-mobile-*.html`、临时截图目录或调试脚本；`build.py` 仅向仓库根目录输出手机单文件。勿删 `rounds/drive-path.js`。
- 发布新版本后，须将旧目录、旧单文件与旧 `.zip` 移至 `D:\szubikeGPT-archive\`；移动前须确认当前版本 `save/player-data.json` 已保留最新玩家存档。

## 5. 构建与定向验证
- 修改源码后跑 `python szu-litchi-dev/ride-update/build.py`，同步 `release/*` 到当前版本目录与 `szu-litchi-loop/dist/`（禁盖 `save/`）。版本目录和定向测试见 `FORZERO-WORK-GUIDE.md`。
- 1.9.0 的专项验收入口为 `verify-190.mjs`。联机改动同时跑 `online/verify.mjs`。配件及价格共用 `online/tuning-190.cjs`，违禁成绩不得进入存档、勋章或官方影子。
