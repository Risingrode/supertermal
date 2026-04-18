# CC-Web

面向 Claude Code 和 Codex 的浏览器端超级终端。它把持久化终端、Agent 会话、远程主机接入、通知推送和本地历史导入整合到同一个 Web 界面里，适合在桌面或手机上远程接管本机 / VPS 的开发环境。

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

[更新日志](./CHANGELOG.md)

<p align="center">
  <img src="https://github.com/user-attachments/assets/ae974fcd-b6a7-4bdf-8553-bfcf2e7038a4" alt="界面截图 1" width="30%" />
  <img src="https://github.com/user-attachments/assets/eb0291c1-2b38-4379-9a07-8eecc6c87d8f" alt="界面截图 2" width="30%" />
  <img src="https://github.com/user-attachments/assets/09cec007-a949-44cf-9f2a-88c1eda60082" alt="界面截图 3" width="30%" />
</p>

## 项目定位

CC-Web 不是单纯的聊天壳，它更像一个轻量级的 Web 控制台：

- 在浏览器里管理本机或远程主机上的持久化终端
- 在同一套后端里切换 Claude / Codex 会话
- 保留长任务运行状态，浏览器断开后仍可继续执行
- 统一管理通知、API 配置、SSH Host 和 GitHub 凭证

如果你的场景是“手机上看 VPS 终端”“浏览器里继续 Claude/Codex 会话”“任务跑完自动通知我”，这个项目就是为这类使用方式设计的。

## 核心能力

- 持久化终端：基于 `tmux` 创建和恢复终端，会话断开后仍可保留
- 双 Agent 支持：Claude 和 Codex 共用一套 Web 后端，按 Agent 维度隔离会话和设置
- 权限模式切换：支持 `yolo`、`default`、`plan` 模式
- 本地 / 远程任务：新建会话时可直接指定本地目录，或通过 SSH Host 启动远程任务
- 本地历史导入：支持导入 `~/.claude/projects/` 和 `~/.codex/sessions/` 中的原生历史
- 图片附件：支持拖拽、粘贴和按钮上传图片，单条消息最多 4 张
- 通知推送：支持 PushPlus、Telegram、Server酱、飞书机器人、Qmsg
- AI 摘要通知：任务完成后可基于 Claude / Codex 当前配置或自定义 API 生成简短摘要
- 开发者配置：在设置面板中保存 SSH 主机、GitHub Token 和仓库信息
- 密码认证：首次启动可自动生成密码，支持强制改密、会话失效和基础防暴力破解

## 环境要求

- Node.js 18 及以上，推荐 Node.js 22+
- 已安装 `claude` 和 / 或 `codex` CLI，并且可在命令行直接调用
- 已安装 `tmux`，否则无法使用持久化终端

按需安装：

- `sshpass`：仅在 SSH Host 使用密码登录时需要
- `sqlite3`：如果你的 Node 版本较低且要导入 Codex 本地历史，建议安装

CLI 安装示例：

```bash
npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex
```

## 快速开始

### Linux / macOS

```bash
git clone https://github.com/ZgDaniel/cc-web.git
cd cc-web
npm install
cp .env.example .env
npm start
```

### Windows

```cmd
git clone https://github.com/ZgDaniel/cc-web.git
cd cc-web
npm install
copy .env.example .env
node server.js
```

也可以直接双击 [`start.bat`](./start.bat) 启动。

启动后访问 `http://localhost:8002`。

- 如果没有配置 `CC_WEB_PASSWORD`，首次启动会自动生成随机密码并打印到控制台
- 首次自动生成的密码登录后需要修改

## 配置说明

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CC_WEB_PASSWORD` | 自动生成 | Web 登录密码 |
| `PORT` | `8002` | 服务监听端口 |
| `CLAUDE_PATH` | `claude` | Claude CLI 可执行文件路径 |
| `CODEX_PATH` | `codex` | Codex CLI 可执行文件路径 |
| `PUSHPLUS_TOKEN` | 空 | 首次启动时可迁移到通知配置 |
| `CC_WEB_CONFIG_DIR` | `./config` | 配置目录覆写，适合测试隔离 |
| `CC_WEB_SESSIONS_DIR` | `./sessions` | 会话与运行时数据目录覆写 |
| `CC_WEB_LOGS_DIR` | `./logs` | 日志目录覆写 |
| `CC_WEB_PUBLIC_DIR` | `./public` | 静态资源目录覆写 |
| `CC_WEB_IP_WHITELIST` | 空 | 额外的登录失败白名单 IP，多个值可用逗号或空格分隔 |

参考模板见 [`.env.example`](./.env.example)。

### 运行时生成的配置文件

项目启动后会在 `config/` 下维护这些文件：

- `auth.json`：登录密码与首次改密状态
- `notify.json`：通知渠道和 AI 摘要配置
- `model.json`：Claude 相关模型与模板配置
- `codex.json`：Codex profile 与运行时配置
- `dev.json`：SSH Host、GitHub Token、仓库列表
- `banned_ips.json`：触发防暴力破解后的封禁记录

### 登录与防护

- 认证方式为密码登录 + WebSocket Token
- 连续多次输错密码会触发 IP 封禁
- `127.0.0.1`、`::1`、Tailscale `100.x.x.x` 默认不会被封

## 主要使用方式

### 1. 作为 Web 终端

- 在左侧 Host 区域管理本机和远程主机
- 通过 `+` 创建持久化终端
- 终端底层使用 `tmux`，刷新页面或重新登录后可重新挂载
- 移动端提供额外按键栏，方便发送 `ESC`、方向键、`CTRL` 等操作

### 2. 作为 Claude / Codex 会话面板

- 在会话中切换 Agent、模型和权限模式
- 支持本地目录任务和远程 SSH 任务
- Claude / Codex 的历史、设置、导入入口彼此隔离
- 工具调用、流式输出和部分 token 信息会在界面中展示

### 3. 作为通知中心

- 任务完成、异常、中断或上下文压缩后可触发通知
- AI 摘要支持三种凭证来源：
  - Claude 当前激活模板
  - Codex 当前激活 Profile
  - 独立自定义 OpenAI 兼容接口

## 架构概览

```text
Browser
  ├─ WebSocket / HTTP
  ▼
server.js
  ├─ Claude / Codex 子进程管理
  ├─ tmux 终端会话管理
  ├─ 配置、会话、附件、日志持久化
  └─ 通知与历史导入
```

几个关键实现点：

- Agent 任务与 Web 连接解耦，浏览器关闭后进程仍可继续运行
- Claude / Codex 运行时由 [`lib/agent-runtime.js`](./lib/agent-runtime.js) 统一封装
- Codex 本地 rollout 导入由 [`lib/codex-rollouts.js`](./lib/codex-rollouts.js) 解析
- 持久化终端依赖 `tmux` + `node-pty`
- 附件存储在 `sessions/_attachments/`，默认只接受图片

## 目录结构

```text
cc-web/
├── server.js
├── lib/
├── public/
├── scripts/
├── test/
├── config/        # 运行后生成
├── sessions/      # 运行后生成
├── logs/          # 运行后生成
├── package.json
├── CHANGELOG.md
└── README.md
```

## 测试与验证

可用的本地验证方式：

```bash
node --test test/*.test.js
npm run regression
```

- `test/` 里是前端终端输入与 attach 状态的单测
- `npm run regression` 会启动隔离环境，用 mock CLI 校验主流程

## 部署建议

### systemd

可以把 CC-Web 作为常驻服务运行，关键点是只重启 Node 进程，不要误杀 Claude / Codex 子进程：

```ini
[Unit]
Description=CC-Web
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/cc-web
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
KillMode=process

[Install]
WantedBy=multi-user.target
```

### Nginx 反代

如果对外提供访问，需要开启 WebSocket 代理，并适当放宽长连接超时：

```nginx
location / {
    proxy_pass http://127.0.0.1:8002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

## 已知前提

- 没有 `tmux` 时，终端功能不可用
- 没有安装对应 CLI 时，Claude / Codex 只能使用已安装的一侧
- Codex 本地历史导入依赖 SQLite 能力，低版本 Node 建议额外安装 `sqlite3`

## 许可证

MIT
