# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| 2.5.x | Yes |
| < 2.5.0 | No |

## Scope & Design Notes

- 浏览器游玩端为纯前端静态页面（WebGL 2 / IndexedDB / `localStorage`），不主动上传任何玩家存档或遥测数据。
- 桌面联机与本地存档服务（`szu-litchi-dev/online/server.mjs`）默认监听本地环回地址 `127.0.0.1`（局域网联机时按需开启并由房主控制房间码与配置校验）。

## Reporting a Vulnerability

如发现存档读写、联机房间规则校对或 HTTP 服务边界存在安全问题，请通过仓库 GitHub Issues（非敏感问题）或联系仓库维护者私信反馈，并附带最小复现步骤与预期影响范围。
