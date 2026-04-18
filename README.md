# SuperTermal

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

浏览器端 AI Agent 终端工作台 — 在网页里远程操控 Claude / Codex CLI。

手机、平板、任意浏览器，随时接管你 VPS 上的开发环境。

## 功能一览

- **持久化终端** — tmux 驱动，关掉网页任务照样跑
- **多 Agent 工作台** — Claude / Codex 一键切换，会话完全隔离
- **SSH 远程接入** — 保存 Host，密钥/密码认证，统一界面管理
- **智能通知** — PushPlus、Telegram、飞书、Server酱、Qmsg 多渠道推送
- **AI 摘要** — 任务完成自动生成摘要，推送到手机
- **本地历史导入** — 读取 `~/.claude/projects/` 和 `~/.codex/sessions/` 的原生记录
- **移动端适配** — 手机浏览器可用，自带方向键/ESC/CTRL 按键栏
- **安全防护** — 登录密码、强制改密、会话失效、防暴力破解

## 快速部署

```bash
git clone https://github.com/Risingrode/supertermal.git
cd supertermal
npm install
cp .env.example .env
npm start
```

打开 http://localhost:8002 ，首次密码会自动写入 `.env`。

### 用 PM2 常驻

```bash
npm i -g pm2
pm2 start server.js --name supertermal
pm2 save
```

## 运行要求

| 必需 | 可选 |
| --- | --- |
| Node.js 18+ | sshpass（SSH 密码登录） |
| tmux | sqlite3（导入 Codex 历史） |
| claude / codex CLI | |

## 环境变量

在 `.env` 中配置，首次启动会自动生成密码。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8002` | 监听端口 |
| `SUPERTERMAL_PASSWORD` | 自动生成 | Web 登录密码 |
| `SUPERTERMAL_PASSWORD_MUST_CHANGE` | `false` | 是否强制首次改密 |
| `CLAUDE_PATH` | `claude` | Claude CLI 路径 |
| `CODEX_PATH` | `codex` | Codex CLI 路径 |
| `PUSHPLUS_TOKEN` | 空 | PushPlus 通知 Token |
| `SUPERTERMAL_CONFIG_DIR` | `./config` | 配置目录 |
| `SUPERTERMAL_SESSIONS_DIR` | `./sessions` | 会话目录 |
| `SUPERTERMAL_LOGS_DIR` | `./logs` | 日志目录 |
| `SUPERTERMAL_ENV_FILE` | `./.env` | .env 路径覆写 |

## 配置文件

运行后在 `config/` 下维护：

- `notify.json` — 通知渠道和 AI 摘要配置
- `codex.json` — Codex profile 和运行时配置
- `dev.json` — GitHub Token、仓库列表、SSH Host 列表
- `banned_ips.json` — 封禁记录

> 部署时注意：GitHub Token 和 SSH 密码保存在 `config/dev.json`，确保目录权限安全。

## 项目结构

```
supertermal/
├── server.js               # HTTP / WebSocket 主服务
├── lib/
│   ├── agent-runtime.js    # Claude / Codex 运行时封装
│   ├── codex-rollouts.js   # Codex 本地历史解析
│   ├── sqlite.js           # SQLite 支持
│   └── terminal-manager.js # 终端生命周期管理
├── public/
│   ├── app.js              # 前端主逻辑
│   ├── index.html          # 页面入口
│   └── style.css           # 样式
├── scripts/                # 模拟脚本和回归测试
├── test/                   # 单元测试
├── config/                 # 运行时配置
├── .env                    # 环境变量
└── package.json
```

## 测试

```bash
node --test test/*.test.js
npm run regression
```

覆盖范围：终端输入/挂载状态、终端持久化/重连、密码迁移、改密回写。

## License

MIT
