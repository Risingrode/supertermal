# CC-Web

CC-Web 是一个面向 `claude` 和 `codex` CLI 的浏览器端工作台。它把持久化终端、Agent 会话、远程主机接入、通知推送和本地历史导入整合到同一个 Node.js 服务里，适合在桌面或手机上远程接管本机或 VPS 的开发环境。

## 主要能力

- 通过 WebSocket 连接浏览器和后端，在页面内运行持久化终端
- 用 `tmux` 保持终端常驻，断开网页后任务仍可继续
- 在同一套界面里切换 Claude / Codex 会话
- 支持本地目录启动任务，也支持基于 SSH Host 启动远程任务
- 支持图片附件上传、粘贴和拖拽
- 支持导入 `~/.claude/projects/` 和 `~/.codex/sessions/` 中的本地历史
- 支持 PushPlus、Telegram、Server 酱、飞书机器人、Qmsg 通知
- 支持为通知生成 AI 摘要
- 支持保存 GitHub Token、仓库列表和 SSH 主机信息
- 提供登录密码、改密、会话失效和基础防暴力破解

## 运行要求

- Node.js 18 及以上
- 已安装 `tmux`
- 已安装 `claude` 和 / 或 `codex`，并且命令可直接执行

按需安装：

- `sshpass`：只在 SSH Host 使用密码登录时需要
- `sqlite3`：导入部分 Codex 本地历史时会尝试使用

## 安装与启动

```bash
git clone https://github.com/ZgDaniel/cc-web.git
cd cc-web
npm install
cp .env.example .env
npm start
```

默认访问地址：

```text
http://localhost:8002
```

## 密码与 `.env`

Web 登录密码现在以 `.env` 为唯一持久化来源。

- `CC_WEB_PASSWORD`：当前 Web 登录密码
- `CC_WEB_PASSWORD_MUST_CHANGE`：是否要求登录后立刻改密
- 如果 `.env` 里没有 `CC_WEB_PASSWORD`，服务首次启动会自动生成随机密码，并回写到 `.env`
- 如果存在旧版 `config/auth.json`，服务启动时会自动迁移到 `.env` 并删除旧文件
- 在 Web 页面里修改密码后，后端会直接改写 `.env`

当前仓库内的默认 `.env` 还支持这些变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CC_WEB_PASSWORD` | 空或现有值 | Web 登录密码 |
| `CC_WEB_PASSWORD_MUST_CHANGE` | `false` | 是否强制首次改密 |
| `PORT` | `8002` | HTTP / WebSocket 监听端口 |
| `CLAUDE_PATH` | `claude` | Claude CLI 可执行路径 |
| `CODEX_PATH` | `codex` | Codex CLI 可执行路径 |
| `PUSHPLUS_TOKEN` | 空 | 首次启动时会迁移到通知配置 |
| `CC_WEB_CONFIG_DIR` | `./config` | 配置目录覆写 |
| `CC_WEB_SESSIONS_DIR` | `./sessions` | 会话目录覆写 |
| `CC_WEB_LOGS_DIR` | `./logs` | 日志目录覆写 |
| `CC_WEB_PUBLIC_DIR` | `./public` | 静态资源目录覆写 |
| `CC_WEB_IP_WHITELIST` | 空 | 登录失败白名单 IP |
| `CC_WEB_ENV_FILE` | `./.env` | `.env` 文件路径覆写，主要用于测试或隔离运行 |

参考模板见 [`.env.example`](/home/cc-web/.env.example)。

## 配置文件

运行后会在 `config/` 下维护这些文件：

- `notify.json`：通知渠道和 AI 摘要配置
- `model.json`：Claude 模型模板配置
- `codex.json`：Codex profile 和运行时配置
- `dev.json`：GitHub Token、仓库列表、SSH Host 列表
- `banned_ips.json`：登录失败触发的封禁记录

注意：

- GitHub Token 和 SSH Host 密码会保存在 `config/dev.json`
- 登录密码不再写入 `config/auth.json`

## 常用使用方式

### 1. 浏览器终端

- 左侧可管理终端和会话
- 终端底层使用 `tmux`
- 页面刷新、浏览器断开或重新登录后，可重新挂载已有终端
- 移动端提供额外按键栏，方便发送方向键、`ESC`、`CTRL` 等按键

### 2. Claude / Codex 工作台

- 新建会话时可以选择 Agent、模型、权限模式和工作目录
- Claude / Codex 的会话和设置彼此隔离
- 可以直接导入本地原生历史
- 页面会展示流式输出、工具调用和部分 token 统计

### 3. 远程主机入口

- 通过设置面板保存 SSH Host
- 支持密钥认证和密码认证
- 远程任务仍通过统一的 Web 界面管理

### 4. 通知中心

- 支持任务完成、异常、中断、压缩上下文等场景通知
- AI 摘要支持使用 Claude、Codex 或自定义 OpenAI 兼容接口

## 项目结构

```text
cc-web/
├── server.js
├── lib/
├── public/
├── scripts/
├── test/
├── config/
├── sessions/
├── logs/
├── .env
└── package.json
```

几个关键文件：

- [`server.js`](/home/cc-web/server.js)：HTTP / WebSocket 服务、认证、终端、配置、通知主逻辑
- [`lib/agent-runtime.js`](/home/cc-web/lib/agent-runtime.js)：Claude / Codex 运行时封装
- [`lib/codex-rollouts.js`](/home/cc-web/lib/codex-rollouts.js)：Codex 本地 rollout 解析
- [`public/app.js`](/home/cc-web/public/app.js)：前端主逻辑
- [`public/style.css`](/home/cc-web/public/style.css)：界面样式

## 测试

本地可运行：

```bash
node --test test/*.test.js
npm run regression
```

目前仓库内的测试覆盖主要包括：

- 终端输入与挂载状态
- 终端持久化与重连
- 密码迁移到 `.env`
- 改密后回写 `.env`

## 已知实现约束

- 持久化终端依赖本机 `tmux`
- SSH 密码登录依赖系统存在 `sshpass`
- 登录密码在 `.env` 中明文存储，这是当前项目的设计选择
- GitHub Token 和 SSH Host 密码保存在 `config/dev.json`，部署时应确保目录权限正确
