# FORZERO: BUDGET 2.0.0 开发速查

安装 Node.js 22 或更新版本，运行 `npm ci` 和 `npm run build:release`。输出位于 `dist-v2/`，桌面版和手机单文件使用同一份客户端构建。根目录保留当前正式发行文件。

| 修改内容 | 源码入口 | 定向验证 |
| --- | --- | --- |
| 浏览器入口与界面 | `src/entry.js`、`src/ui/`、`src/styles/` | `node scripts/verify-stage6-browser.mjs` |
| 车辆、配件与路面 | `src/data/`、`src/ride/` | `node scripts/verify-stage3-data.mjs` |
| 程序化资产与栏杆 | `src/world/assets/`、`src/world/maps/ucl/gardens.js` | `node scripts/verify-stage4-assets.mjs` |
| 三图道路、检查点与碰撞 | `src/world/maps/`、`src/world/query.js` | `node scripts/verify-stage5-maps.mjs` |
| 联机协议 v3 | `src/online/client.js`、`szu-litchi-dev/online/server.mjs` | `node szu-litchi-dev/online/verify.mjs`、`node scripts/verify-stage6-four-player.mjs --drive` |
| 打包与命名 | `scripts/build.mjs`、`scripts/deterministic-zip.mjs` | `npm run build:release` |

浏览器验收默认使用仓库根目录已发布的版本。测试重新构建的版本时，在 PowerShell 设 `$env:FORZERO_RELEASE_DIR = 'dist-v2/desktop'`。四人测试需要 Chrome 或 Edge 和可访问的本地 HTTP。

配件价格、预算和违禁规则共用 `src/data/tuning-190.cjs`。违禁成绩不得进入存档、勋章或官方影子。发行文件排除个人 `save/`。旧版发行文件可以从 Git 历史取回。
