# Dev Launcher — 本地开发服务启动器

## 概述

Dev Launcher 是一款基于 Electron 的桌面应用，用于统一管理本机开发服务的启动、停止、日志查看和 AI 排障。同时暴露本地 REST API，供 coding agent 通过接口自动注册和管理服务。

- **技术栈**：Electron + TypeScript（主进程）、React + Vite + Ant Design（渲染进程）、Fastify（本地 API）
- **平台**：macOS（优先），兼容 Windows / Linux
- **版本**：0.1.0 MVP

---

## 架构

```
┌──────────────────────────────────────────────────┐
│                  Electron 主进程                   │
│                                                    │
│  ┌──────────┐  ┌───────────┐  ┌────────────────┐  │
│  │ IPC 层   │  │ 服务管理层 │  │ Fastify API    │  │
│  │ ipc.ts   │  │ (启停/状态)│  │ (127.0.0.1)    │  │
│  └──────────┘  └───────────┘  └────────────────┘  │
│                                                    │
│  ┌──────────┐  ┌───────────┐  ┌────────────────┐  │
│  │ AI 模块  │  │ 子进程管理 │  │ 配置持久化      │  │
│  │ (OpenAI) │  │ (spawn)   │  │ (JSON 文件)    │  │
│  └──────────┘  └───────────┘  └────────────────┘  │
└──────────────────────────────────────────────────┘
         │ IPC (contextBridge)          │ HTTP
         ▼                              ▼
┌──────────────────┐         ┌──────────────────┐
│   渲染进程 (React)│         │   Coding Agent   │
│   Ant Design UI  │         │   (外部调用者)    │
└──────────────────┘         └──────────────────┘
```

### 关键设计决策

- **主进程**负责所有业务逻辑（配置读写、进程管理、AI 调用、API 服务），渲染进程只做 UI 展示
- 渲染进程通过 `contextBridge` 暴露的 `window.electronAPI` 调用主进程，不直接访问 Node.js
- 本地 API 仅监听 `127.0.0.1:19527`，不对外暴露
- API 使用 Bearer token 鉴权，token 存储在 `{userData}/token.json`
- 服务配置存储在 `{userData}/config.json`，AI 设置存储在 `{userData}/ai-settings.json`

---

## 项目目录结构

```
dev-launcher/
├── package.json
├── electron-builder.yml          # electron-builder 打包配置
├── vite.config.ts                # Vite 构建配置（渲染进程）
├── tsconfig.json                 # TypeScript 项目引用
├── tsconfig.main.json            # 主进程 + 预加载脚本 TS 配置
├── tsconfig.renderer.json        # 渲染进程 TS 配置
├── Dev Launcher.command          # macOS 双击启动脚本
│
├── src/
│   ├── main/                     # 主进程
│   │   ├── index.ts              # 应用入口，初始化所有模块
│   │   ├── window.ts             # 窗口创建与管理
│   │   ├── ipc.ts                # 所有 IPC handler 注册
│   │   │
│   │   ├── api/                  # Fastify 本地 API
│   │   │   ├── server.ts         # API 服务器（鉴权中间件、启停）
│   │   │   ├── routes.ts         # 所有 REST 路由
│   │   │   ├── auth.ts           # Bearer token 鉴权
│   │   │   └── openapi.ts        # @fastify/swagger OpenAPI 生成
│   │   │
│   │   ├── services/             # 服务管理核心
│   │   │   ├── serviceStore.ts   # 配置 JSON 读写（CRUD）
│   │   │   ├── serviceManager.ts # 服务启停编排（依赖、端口、健康检查）
│   │   │   ├── processManager.ts # 子进程 spawn 管理（tree-kill 终止）
│   │   │   ├── portChecker.ts    # 端口占用检测（lsof / netstat）
│   │   │   ├── healthChecker.ts  # HTTP 健康检查轮询
│   │   │   ├── logBuffer.ts      # 日志缓冲区（每服务 1000 行）
│   │   │   ├── tokenStore.ts     # API token 管理
│   │   │   ├── terminalLauncher.ts # 系统终端检测与命令生成
│   │   │   ├── browserLauncher.ts  # 浏览器检测与 URL 打开
│   │   │   └── registration.ts   # dev-launcher.service.json 注册
│   │   │
│   │   ├── ai/                   # AI 排障模块
│   │   │   ├── aiClient.ts       # OpenAI 客户端初始化
│   │   │   ├── diagnostics.ts    # 服务诊断（收集上下文 → OpenAI）
│   │   │   ├── repairPlanner.ts  # 修复计划过滤（移除高风险动作）
│   │   │   └── repairExecutor.ts # 修复动作执行器
│   │   │
│   │   └── shared/               # 共享类型和校验
│   │       ├── types.ts          # 所有 TypeScript 类型定义
│   │       └── schema.ts         # Zod 校验 schema
│   │
│   ├── preload/
│   │   └── index.ts              # contextBridge 暴露 electronAPI
│   │
│   └── renderer/                 # 渲染进程（React）
│       ├── index.html
│       ├── main.tsx              # React 入口
│       ├── App.tsx               # 布局（侧边栏 + 内容区）
│       ├── electron.d.ts         # electronAPI 类型声明
│       │
│       ├── pages/
│       │   └── ServiceDashboard.tsx  # 服务管理主页面
│       │
│       └── components/
│           ├── ServiceTable.tsx       # 服务列表表格
│           ├── ServiceForm.tsx        # 添加/编辑服务表单
│           ├── LogPanel.tsx           # 实时日志查看
│           ├── AiDiagnosticsPanel.tsx # AI 诊断结果与修复执行
│           ├── AiSettingsPanel.tsx    # AI API Key 设置
│           ├── ApiInfoPanel.tsx       # API Token 和端点信息
│           └── BrowserSelector.tsx    # 浏览器选择器
│
└── dist/                         # 构建输出
    ├── main/                     # 主进程 JS
    ├── preload/                  # 预加载脚本 JS
    └── renderer/                 # Vite 打包的静态文件
```

---

## 数据结构

### DevService（服务配置）

```ts
interface DevService {
  id: string;              // 唯一标识，如 "my-web-app"
  name: string;            // 显示名称，如 "My Web App"
  group: string;           // 分组，如 "Development"
  kind: ServiceKind;       // "web" | "api" | "database" | "redis" | "docker-compose" | "cli" | "custom"
  cwd: string;             // 工作目录绝对路径
  command: string;         // 启动命令，如 "npm run dev"
  runMode: RunMode;        // "managed-process"（托管追踪）| "external-terminal"（新终端窗口）
  port?: number;           // 服务端口
  openUrl?: string;        // 打开网页 URL
  healthCheckUrl?: string; // 健康检查 URL
  browser?: {
    mode: "default" | "specific";
    browserId?: string;    // 如 "safari", "google chrome", "firefox"
  };
  terminal?: {
    mode: "default" | "specific";
    appId?: string;        // 如 "terminal", "iterm"
    keepOpen?: boolean;    // 命令执行后保持终端打开
  };
  env: Record<string, string>;    // 环境变量
  dependsOn: string[];            // 依赖的其他服务 ID
  enabled: boolean;               // 是否启用
  source: ServiceSource;          // "manual" | "api" | "agent"
  description?: string;
  tags: string[];
}
```

### ServiceRuntime（运行时状态）

```ts
interface ServiceRuntime {
  id: string;
  status: "stopped" | "starting" | "running" | "stopping" | "error";
  pid?: number;
  startedAt?: number;
  stoppedAt?: number;
  error?: string;
  port?: number;
  portFree: boolean;
}
```

### AiSettings

```ts
interface AiSettings {
  provider: "openai";
  apiKeyStorage: "system-keychain" | "env";
  model: string;                    // 如 "gpt-4o"
  allowRepairExecution: "approval-required";
  apiKey?: string;                  // 可选直接填入，优先从 OPENAI_API_KEY 环境变量读取
}
```

### RepairAction（AI 修复动作）

```ts
interface RepairAction {
  id: string;
  type: "run-command" | "edit-file" | "open-file" | "restart-service";
  serviceId: string;
  title: string;          // 简短描述
  explanation: string;    // 详细说明
  command?: string;       // type=run-command 时
  cwd?: string;
  filePath?: string;      // type=edit-file / open-file 时
  patchPreview?: string;  // type=edit-file 时
  risk: "low" | "medium" | "high";
}
```

### DiagnoseResult（AI 诊断结果）

```ts
interface DiagnoseResult {
  serviceId: string;
  timestamp: number;
  status: ServiceStatus;
  issues: string[];           // 发现的问题
  possibleCauses: string[];   // 可能原因
  suggestions: string[];      // 建议
  repairActions: RepairAction[];
  rawResponse: string;        // OpenAI 原始响应
}
```

---

## IPC 通道

渲染进程通过 `window.electronAPI` 调用以下 IPC 通道（全部返回 Promise）：

### 服务管理

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `services:list` | 无 | `(DevService & {runtime})[]` | 获取所有服务及运行时状态 |
| `services:get` | `id: string` | `DevService & {runtime}` | 获取单个服务 |
| `services:create` | `data: object` | `DevService` | 创建服务 |
| `services:update` | `id, data` | `DevService` | 更新服务 |
| `services:delete` | `id: string` | `boolean` | 删除服务 |
| `services:start` | `id: string` | `ServiceRuntime` | 启动服务 |
| `services:stop` | `id: string` | `ServiceRuntime` | 停止服务 |
| `services:restart` | `id: string` | `ServiceRuntime` | 重启服务 |
| `services:startAll` | 无 | `ServiceRuntime[]` | 启动全部 |
| `services:stopAll` | 无 | `ServiceRuntime[]` | 停止全部 |
| `services:getLogs` | `id: string` | `string[]` | 获取日志 |
| `services:registerFromFile` | `filePath: string` | `RegisterFromFileResult` | 从声明文件注册 |
| `services:validate` | `filePath: string` | `{valid, errors}` | 校验声明文件 |

### AI 诊断

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `ai:diagnoseService` | `serviceId: string` | `DiagnoseResult` | 诊断服务 |
| `ai:createRepairPlan` | `serviceId: string` | `DiagnoseResult` | 生成修复计划 |
| `ai:executeRepairAction` | `action: RepairAction` | `{success, output}` | 执行修复动作 |
| `ai:getSettings` | 无 | `AiSettings` | 获取 AI 设置 |
| `ai:updateSettings` | `settings: AiSettings` | `{success, error?}` | 更新 AI 设置 |
| `ai:isInitialized` | 无 | `boolean` | AI 是否已就绪 |

### 系统工具

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `system:listBrowsers` | 无 | `BrowserInfo[]` | 列出可用浏览器 |
| `system:listTerminals` | 无 | `TerminalInfo[]` | 列出可用终端 |
| `system:openUrl` | `serviceId: string` | `boolean` | 用配置的浏览器打开 URL |
| `system:openFolder` | `serviceId: string` | `boolean` | 在文件管理器中打开目录 |

### 应用信息

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `app:getStatus` | 无 | `{version, serviceCount, runningCount}` | 应用运行状态 |
| `app:getTokenInfo` | 无 | `{token, createdAt}` | API Token 信息 |

### 事件推送（渲染进程监听）

| 事件 | 参数 | 说明 |
|------|------|------|
| `service:log` | `(serviceId, line)` | 服务日志实时推送 |
| `service:statusChange` | `(serviceId, status)` | 服务状态变更推送 |

---

## REST API

- Base URL: `http://127.0.0.1:19527`
- 鉴权: `Authorization: Bearer <token>`
- OpenAPI: `GET /api/openapi.json`（无需鉴权）
- API Token 获取: 桌面应用 →「API 信息」页面查看

### 端点列表

#### 服务管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/services` | 获取所有服务（含运行时状态） |
| `GET` | `/api/services/:id` | 获取单个服务 |
| `POST` | `/api/services` | 创建服务（body 为完整 DevService） |
| `PUT` | `/api/services/:id` | 更新服务 |
| `DELETE` | `/api/services/:id` | 删除服务 |

#### 服务操作

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/services/:id/start` | 启动服务 |
| `POST` | `/api/services/:id/stop` | 停止服务 |
| `POST` | `/api/services/:id/restart` | 重启服务 |
| `GET` | `/api/services/:id/logs` | 获取服务日志 |

#### 注册与校验

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/services/register-from-file` | 从声明文件注册（body: `{filePath}`） |
| `POST` | `/api/services/validate` | 校验声明文件 |

#### AI 诊断

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/ai/services/:id/diagnose` | 诊断服务 |
| `POST` | `/api/ai/services/:id/repair-plan` | 诊断 + 生成修复计划 |

#### 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/status` | 应用状态（无需鉴权） |
| `GET` | `/api/openapi.json` | OpenAPI 文档（无需鉴权） |

> MVP 不通过 REST API 执行修复动作，修复必须在桌面 UI 中确认。

---

## Coding Agent 自动注册服务流程

这是 coding agent 与 Dev Launcher 交互的核心工作流。

### 步骤 1：创建声明文件

在目标项目根目录创建 `dev-launcher.service.json`：

```json
{
  "id": "my-service",
  "name": "我的服务",
  "group": "Agent Tools",
  "kind": "web",
  "cwd": "/absolute/path/to/project",
  "command": "npm run dev",
  "runMode": "managed-process",
  "port": 3000,
  "openUrl": "http://localhost:3000",
  "healthCheckUrl": "http://localhost:3000/health",
  "env": { "NODE_ENV": "development" },
  "dependsOn": ["redis-local"],
  "enabled": true,
  "source": "agent",
  "description": "服务描述",
  "tags": ["web", "react"]
}
```

### 步骤 2：获取 API Token

```bash
# coding agent 应先提示用户从桌面应用的「API 信息」页复制 Token
# 或者如果 coding agent 能读取文件系统，可以直接读取：
cat ~/Library/Application\ Support/Dev\ Launcher/token.json
```

### 步骤 3：通过 API 注册

```bash
curl -s -X POST \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"filePath":"/absolute/path/to/dev-launcher.service.json"}' \
  http://127.0.0.1:19527/api/services/register-from-file
```

返回示例：

```json
{
  "success": true,
  "data": {
    "id": "my-service",
    "name": "我的服务",
    "action": "created"
  }
}
```

- `action: "created"` — 新注册
- `action: "updated"` — 同 id 已存在，更新配置
- `previousSource` — 更新时返回之前的 source 类型

### 步骤 4（可选）：诊断服务

```bash
curl -s -X POST \
  -H "Authorization: Bearer <TOKEN>" \
  http://127.0.0.1:19527/api/ai/services/my-service/diagnose
```

### 校验声明文件格式

```bash
curl -s -X POST \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"filePath":"/path/to/dev-launcher.service.json"}' \
  http://127.0.0.1:19527/api/services/validate
```

---

## 服务启停机制

### 托管进程模式（managed-process）

1. 启动前检测端口是否被占用，占用则拒绝启动并提示
2. 按拓扑序（DFS）启动依赖服务，检测循环依赖
3. 使用 `child_process.spawn(command, { cwd, shell: true, env })` 启动
4. 捕获 stdout / stderr 到日志缓冲区（每服务最近 1000 行）
5. 进程存活 1 秒后标记为 `running`
6. 如有 `healthCheckUrl`，轮询健康检查（最多 30 次，间隔 1 秒）
7. 停止时使用 `tree-kill` 以 SIGTERM 终止进程树

### 外部终端模式（external-terminal）

1. 使用 AppleScript（macOS）打开系统终端并执行命令
2. Windows 使用 `start cmd /k`，Linux 使用 `gnome-terminal`
3. MVP 中不追踪 pid、不捕获日志
4. UI 状态显示为"已打开终端"

### 浏览器打开

- 支持系统默认浏览器和指定浏览器（Safari / Chrome / Firefox / Edge）
- macOS 使用 `open -a "<Browser>" <url>`

---

## AI 排障流程

### 诊断上下文收集

AI 诊断时收集以下信息发送给 OpenAI：

1. 服务配置（id、name、kind、cwd、command、runMode、port 等）
2. 当前运行时状态（status、pid、error）
3. 最近 100 行日志
4. 端口占用检测结果
5. 健康检查结果
6. 项目根目录中的 `package.json`、`README.md`、`.env.example`、`docker-compose.yml` 等文件内容（截取前 3000 字符）

### 安全约束

- **不允许 AI 静默修改文件** — `edit-file` 类型修复动作只显示补丁预览
- **高风险命令拒绝执行** — 包含 `rm -rf`、`git reset --hard`、`DROP`、`DELETE FROM` 等的命令不提供一键执行
- **修复必须在 UI 中确认** — REST API 不提供修复执行接口
- **API Key 不写入日志** — OpenAI API Key 优先从环境变量 `OPENAI_API_KEY` 读取

### 允许的修复动作

| 类型 | 说明 | 风险级别 |
|------|------|----------|
| `run-command` | 运行安全命令（npm/pnpm/pip install 等） | low/medium |
| `restart-service` | 重启服务 | low |
| `open-file` | 在编辑器中打开文件 | low |
| `edit-file` | 显示补丁预览，需用户手动操作 | medium |

---

## 配置文件存储

所有配置存储在 Electron 的 `userData` 目录：

```
~/Library/Application Support/Dev Launcher/
├── config.json          # 服务配置列表
├── token.json           # API Bearer token
└── ai-settings.json     # AI 配置
```

- 配置损坏时自动备份为 `.bak` 并重建空配置
- 服务校验使用 Zod，无效配置项会被过滤
- API Key 不存储在配置文件中，优先读取环境变量 `OPENAI_API_KEY`

---

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式（需要两个终端）
npm run dev:renderer   # 终端1：启动 Vite dev server (localhost:5173)
npm run dev:main       # 终端2：编译主进程 + 启动 Electron

# 生产构建
npm run build          # 编译主进程 + Vite 打包渲染进程

# 启动（构建后）
npm start

# 类型检查
npm run typecheck

# 打包为 .app
npm run dist
```

---

## 已知限制（MVP）

以下功能不在第一版范围内：

- 无自动修复（需用户逐一确认）
- 无完整 AI agent 沙箱
- 无浏览器 profile 管理
- 无终端 session 管理
- 无完整 PTY 集成
- 无 Docker 可视化面板
- 无 Redis/MySQL 专用管理面板
- 无日志全文索引
- 无远程访问
- 无插件系统
- 无多用户权限
- 无自动扫描全盘项目
- 无服务依赖 DAG 可视化
- API Key 未存系统 Keychain（当前读取环境变量或存本地文件）
- 外部终端模式不保证完整 pid 追踪和日志捕获
