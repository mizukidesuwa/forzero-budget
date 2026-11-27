# Contributing to FORZERO: BUDGET

感谢关注与参与 **FORZERO: BUDGET（有限竞速：地贫线）** 的开发！提交代码前请先阅读仓库根目录的 [AGENTS.md](AGENTS.md) 与索引 [FORZERO-WORK-GUIDE.md](FORZERO-WORK-GUIDE.md)。

## 核心原则

- **零第三方运行时依赖**：浏览器端 `src/` 与本地联机端 `server/` 不得引入外部 npm 运行时包（开发构建与静态检查仅使用 `esbuild` 与 `eslint`）。
- **纯程序化资产**：3D 场景与模型均由代码在运行时生成，请在 `src/world/assets/` 中编写纯函数，避免读取全局状态或污染随机流。
- **单源共享规则**：客户端与服务端共用的配件、预算、路网与联机规则统一维护在 `src/data/tuning-190.cjs` 与 `src/data/shared-rules.cjs`。

## 本地开发与自测

```powershell
npm ci
npm run lint
npm run build
npm test -- --skip-build
```

完整发版验收（需本机安装 Chrome/Edge，涵盖桌面/手机端到端、4 人 WebRTC 联机及 GPU 性能基线）：

```powershell
npm run verify:all
```

## Pull Request 规范

1. 从 `main` 拉取功能分支完成修改，保持 `CHANGELOG.md` 顶部同步更新。
2. 确保 `.github/workflows/ci.yml` 中的静态门禁、构建与测试全部通过，不得通过弱化断言绕过验证。
3. 请勿提交 `save/`、`player-data.json`、`dist-v2/`、构建归档 ZIP 或调试截图。
