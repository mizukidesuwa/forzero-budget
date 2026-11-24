# FORZERO: BUDGET（有限竞速：地贫线）开发速查

> 历史交付与早期架构见 [HISTORY.md](HISTORY.md)；版本流水见 [CHANGELOG.md](CHANGELOG.md)；1.8.6 车流见 [1.8.6-traffic.md](szu-litchi-dev/ride-update/1.8.6-traffic.md)。巨型 `perf-*.json`、截图与旧包已归档至 `D:\szubikeGPT-archive\`。

## 1. 当前基线（1.9.1）

- **桌面目录**：`forzero-budget-1.9.1/`（含 `save/player-data.json` 个人存档）；分发使用同名 ZIP。
- **手机单文件**：`forzero-budget-mobile-1.9.1.html`
- **分发镜像**：`szu-litchi-loop/dist/`（同步 `release/*`，不含 `save/`）
- **最新修订**：`hud-compact.css` 处理小屏 HUD 布局与缩放。竖屏小地图与「下一站」都置于右上角。「不计榜」仅在发车与结算流程中提示。

## 2. 活跃源码与地图构建链

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

```powershell
python szu-litchi-dev/ride-update/build.py
node --check szu-litchi-dev/ride-update/game.js
node --check szu-litchi-dev/online/server.mjs
$releaseItems = Get-ChildItem szu-litchi-dev/ride-update/release | Where-Object Name -ne 'save'
foreach ($item in $releaseItems) {
  Copy-Item -LiteralPath $item.FullName -Destination forzero-budget-1.9.1/ -Recurse -Force
  Copy-Item -LiteralPath $item.FullName -Destination szu-litchi-loop/dist/ -Recurse -Force
}

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
