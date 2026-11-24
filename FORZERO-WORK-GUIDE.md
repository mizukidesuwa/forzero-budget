# FORZERO: BUDGET 2.1.0 开发速查

安装 Node.js 22 或更新版本，运行 `npm ci` 和 `npm run build:release`。桌面版、手机单文件和 ZIP 输出到 `dist-v2/`。仓库根目录是正式发行版。

| 修改内容 | 源码入口 | 定向验证 |
| --- | --- | --- |
| 浏览器界面和触屏 | `src/entry.js`、`src/ui/`、`src/styles/` | `node scripts/verify-stage6-browser.mjs` |
| 车辆、配件与路面 | `src/data/`、`src/ride/` | `node scripts/verify-stage3-data.mjs` |
| 程序化资产和三图道路、碰撞 | `src/world/assets/`、`src/world/maps/`、`src/world/query.js` | `node scripts/verify-stage4-assets.mjs`、`node scripts/verify-stage5-maps.mjs` |
| 尾流、赛道方向和圈数、AI | `src/ride/drafting.js`、`src/race/course-variants.js`、`src/race/rival-pace.js` | `node scripts/verify-210.mjs` |
| 联机协议 v3 和四项全能 | `src/online/client.js`、`szu-litchi-dev/online/` | `node szu-litchi-dev/online/verify.mjs`、`node scripts/verify-stage6-four-player.mjs --drive` |
| 桌面存档及旧版迁移 | `szu-litchi-dev/online/server.mjs` | `node scripts/verify-stage6-save.mjs` |

浏览器和存档验证默认使用仓库根目录的发行文件。验证重新构建的版本时，在 PowerShell 设置 `$env:FORZERO_RELEASE_DIR = 'dist-v2/desktop'` 和 `$env:FORZERO_MOBILE_HTML = 'dist-v2/forzero-budget-mobile-2.1.0.html'`。四人测试需要 Chrome 或 Edge 和可访问的本地 HTTP。

对拍使用 `node scripts/verify-esm-parity.mjs`。1.9.1.1 快照保存在 `scripts/fixtures/stage0-baseline.json`，2.1.0 的预期变更在脚本中列出。个人 `save/` 不随发行版上传。旧版发行文件可从 Git 历史取回。
