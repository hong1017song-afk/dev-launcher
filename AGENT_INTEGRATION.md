# Dev Launcher Agent Integration Guide

English | [中文](#中文)

This document is for coding agents that need to connect a local project to Dev Launcher.

Dev Launcher is a local desktop service manager. It stores service definitions in the user's Dev Launcher config and exposes a local API at `http://127.0.0.1:19527`.

## Rules For Agents

- Do not modify business source code.
- Do not run install, build, migration, reset, delete, or destructive commands unless the user explicitly asks.
- Only create or update `dev-launcher.service.json` in the current project root.
- Prefer existing project scripts over inventing commands.
- If a value cannot be discovered confidently, leave it empty or omit it. Do not guess ports.
- Preserve existing manual fields in `dev-launcher.service.json` when updating, especially `description`, `tags`, `dependsOn`, `browser`, and `terminal`.

## Service Discovery

Inspect the current project root for common entry files:

- `package.json`
- `README.md`
- `vite.config.*`
- `next.config.*`
- `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, `compose.yaml`
- `pyproject.toml`
- `requirements.txt`
- `run_server.sh`
- `start.sh`
- macOS `.app` bundles

Pick the command using these rules:

- Node project: use the package manager already used by the project.
- Prefer `dev` script over `start`.
- If both frontend and backend are started by one script, use that script.
- Python service: prefer an existing `run_server.sh`.
- Docker Compose service: use `docker compose up`.
- CLI or interactive tool: use `external-terminal`.
- Plain web/API service: use `managed-process`.

## Registration File

Create or update this file in the project root:

```txt
dev-launcher.service.json
```

Required shape:

```json
{
  "id": "my-service",
  "name": "My Service",
  "group": "local-projects",
  "kind": "web",
  "cwd": "/absolute/path/to/project",
  "command": "npm run dev",
  "runMode": "managed-process",
  "port": 5173,
  "openUrl": "http://localhost:5173",
  "healthCheckUrl": "http://localhost:5173",
  "env": {},
  "dependsOn": [],
  "enabled": true,
  "source": "agent",
  "description": "Short service description.",
  "tags": ["node", "vite", "web"]
}
```

Allowed values:

- `source`: `manual`, `api`, `agent`
- `kind`: `web`, `api`, `database`, `redis`, `docker-compose`, `cli`, `custom`
- `runMode`: `managed-process`, `external-terminal`

Field rules:

- `id`: kebab-case project identifier.
- `name`: use `package.json.name` when available; otherwise use directory name.
- `cwd`: absolute path to the project root.
- `source`: use `agent`.
- `enabled`: use `true`.
- `env`: use `{}` unless the project explicitly requires values.
- `dependsOn`: use `[]` unless the user or project clearly declares dependencies.
- `port`: only set when confident.
- `openUrl`: only set when confident.
- `healthCheckUrl`: prefer a real health endpoint. If none exists, use `openUrl` only when the page responds reliably.

## Known Good Examples

Node web app:

```json
{
  "id": "my-web-app",
  "name": "my-web-app",
  "group": "local-projects",
  "kind": "web",
  "cwd": "/absolute/path/to/my-web-app",
  "command": "npm run dev",
  "runMode": "managed-process",
  "port": 5173,
  "openUrl": "http://localhost:5173",
  "healthCheckUrl": "http://localhost:5173",
  "env": {},
  "dependsOn": [],
  "enabled": true,
  "source": "agent",
  "description": "Local React/Vite web app.",
  "tags": ["node", "react", "vite", "web"]
}
```

CLI service:

```json
{
  "id": "my-cli-tool",
  "name": "My CLI Tool",
  "group": "local-tools",
  "kind": "cli",
  "cwd": "/absolute/path/to/project",
  "command": "npm run cli",
  "runMode": "external-terminal",
  "terminal": {
    "mode": "default",
    "keepOpen": true
  },
  "env": {},
  "dependsOn": [],
  "enabled": true,
  "source": "agent",
  "description": "Interactive CLI tool.",
  "tags": ["cli"]
}
```

Python API service:

```json
{
  "id": "my-python-api",
  "name": "My Python API",
  "group": "local-projects",
  "kind": "api",
  "cwd": "/absolute/path/to/my-python-api",
  "command": "./run_server.sh",
  "runMode": "managed-process",
  "port": 8000,
  "openUrl": "http://127.0.0.1:8000",
  "healthCheckUrl": "http://127.0.0.1:8000/health",
  "env": {},
  "dependsOn": [],
  "enabled": true,
  "source": "agent",
  "description": "Local FastAPI service.",
  "tags": ["python", "fastapi", "api"]
}
```

## API Registration

Dev Launcher API:

```txt
http://127.0.0.1:19527
```

Use token auth for all service APIs:

```txt
Authorization: Bearer <token>
```

Token source:

1. Prefer environment variable `DEV_LAUNCHER_TOKEN`.
2. If missing, ask the user for the token.
3. Do not search private directories for secrets unless the user explicitly asks.

Basic checks:

```bash
curl http://127.0.0.1:19527/api/status
curl http://127.0.0.1:19527/api/openapi.json
```

Validate registration file:

```bash
curl -X POST http://127.0.0.1:19527/api/services/validate \
  -H "Authorization: Bearer $DEV_LAUNCHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filePath":"/absolute/path/to/project/dev-launcher.service.json"}'
```

Register from file:

```bash
curl -X POST http://127.0.0.1:19527/api/services/register-from-file \
  -H "Authorization: Bearer $DEV_LAUNCHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filePath":"/absolute/path/to/project/dev-launcher.service.json"}'
```

Expected success response:

```json
{
  "success": true,
  "data": {
    "id": "my-service",
    "name": "My Service",
    "action": "created"
  }
}
```

`action` may also be `updated`.

## Runtime Behavior Notes

Managed process services:

- Dev Launcher starts the command with `cwd`, `shell: true`, and `env`.
- Logs are captured from stdout/stderr.
- Stop terminates the managed process tree.
- If the service was already running outside Dev Launcher, Dev Launcher may identify it through `port` and `healthCheckUrl`.
- Stop can terminate listener processes on the declared service ports. Be careful: only declare ports owned by this service.

External terminal services:

- Dev Launcher opens the configured command in a terminal.
- Logs are not reliably captured.
- PID tracking is not reliable.
- Use this for interactive CLI tools.

Port and health checks:

- `port` is used for LISTEN-state detection only.
- `healthCheckUrl` is used to decide whether an occupied port is actually the target service.
- If a service opens in the browser but shows as stopped, verify `port`, `openUrl`, and `healthCheckUrl`.
- If stop does not work, verify all service-owned listening ports are declared.

## Troubleshooting

API connection refused:

- Dev Launcher is not running, or the API failed to start.
- Start the app and check `GET /api/status`.

401 or 403:

- Token is missing or wrong.
- Ask the user for `DEV_LAUNCHER_TOKEN`.

Port occupied on start:

- If `healthCheckUrl` is healthy, Dev Launcher should mark the service as running.
- If not healthy, do not overwrite the port. Report the conflict.

Service stays running after stop:

- Check whether the process is external-terminal mode.
- Check whether the declared `port`, `openUrl`, and `healthCheckUrl` include all service-owned ports.
- Do not kill unrelated ports.

OpenAPI:

- Read `GET /api/openapi.json` before making assumptions about API shape.

## Final Response Format For Agents

After integration, report:

- Service id and name
- Detected type and run mode
- Command
- Port and URL
- Registration file path
- Whether validation passed
- Whether API registration succeeded
- Any fields that need manual confirmation

---

## 中文

# Dev Launcher Agent 集成指南

本文档面向需要把本地项目接入 Dev Launcher 的 coding agent。

Dev Launcher 是一个本地桌面服务管理工具。它会把服务定义存储在用户的 Dev Launcher 配置中，并在 `http://127.0.0.1:19527` 暴露本地 API。

## Agent 规则

- 不要修改业务源码。
- 除非用户明确要求，不要运行安装、构建、迁移、重置、删除或破坏性命令。
- 只在当前项目根目录创建或更新 `dev-launcher.service.json`。
- 优先使用项目已有脚本，不要自行发明启动命令。
- 如果某个值无法可靠判断，留空或省略。不要猜测端口。
- 更新 `dev-launcher.service.json` 时保留已有人工字段，尤其是 `description`、`tags`、`dependsOn`、`browser` 和 `terminal`。

## 服务发现

检查当前项目根目录中的常见入口文件：

- `package.json`
- `README.md`
- `vite.config.*`
- `next.config.*`
- `docker-compose.yml`、`docker-compose.yaml`、`compose.yml`、`compose.yaml`
- `pyproject.toml`
- `requirements.txt`
- `run_server.sh`
- `start.sh`
- macOS `.app` 应用包

按以下规则选择命令：

- Node 项目：使用项目已经采用的包管理器。
- 优先使用 `dev` 脚本，其次才是 `start`。
- 如果前后端由同一个脚本启动，使用该脚本。
- Python 服务：优先使用已有的 `run_server.sh`。
- Docker Compose 服务：使用 `docker compose up`。
- CLI 或交互式工具：使用 `external-terminal`。
- 普通 Web/API 服务：使用 `managed-process`。

## 注册文件

在项目根目录创建或更新：

```txt
dev-launcher.service.json
```

基本结构：

```json
{
  "id": "my-service",
  "name": "My Service",
  "group": "local-projects",
  "kind": "web",
  "cwd": "/absolute/path/to/project",
  "command": "npm run dev",
  "runMode": "managed-process",
  "port": 5173,
  "openUrl": "http://localhost:5173",
  "healthCheckUrl": "http://localhost:5173",
  "env": {},
  "dependsOn": [],
  "enabled": true,
  "source": "agent",
  "description": "Short service description.",
  "tags": ["node", "vite", "web"]
}
```

允许值：

- `source`: `manual`, `api`, `agent`
- `kind`: `web`, `api`, `database`, `redis`, `docker-compose`, `cli`, `custom`
- `runMode`: `managed-process`, `external-terminal`

字段规则：

- `id`：kebab-case 项目标识。
- `name`：优先使用 `package.json.name`，否则使用目录名。
- `cwd`：项目根目录的绝对路径。
- `source`：使用 `agent`。
- `enabled`：使用 `true`。
- `env`：除非项目明确需要，否则使用 `{}`。
- `dependsOn`：除非用户或项目明确声明依赖，否则使用 `[]`。
- `port`：只有在能可靠确认时填写。
- `openUrl`：只有在能可靠确认时填写。
- `healthCheckUrl`：优先使用真实健康检查端点；如果没有，只有页面能稳定响应时才使用 `openUrl`。

## 示例

Node Web 应用：

```json
{
  "id": "my-web-app",
  "name": "my-web-app",
  "group": "local-projects",
  "kind": "web",
  "cwd": "/absolute/path/to/my-web-app",
  "command": "npm run dev",
  "runMode": "managed-process",
  "port": 5173,
  "openUrl": "http://localhost:5173",
  "healthCheckUrl": "http://localhost:5173",
  "env": {},
  "dependsOn": [],
  "enabled": true,
  "source": "agent",
  "description": "Local React/Vite web app.",
  "tags": ["node", "react", "vite", "web"]
}
```

CLI 服务：

```json
{
  "id": "my-cli-tool",
  "name": "My CLI Tool",
  "group": "local-tools",
  "kind": "cli",
  "cwd": "/absolute/path/to/project",
  "command": "npm run cli",
  "runMode": "external-terminal",
  "terminal": {
    "mode": "default",
    "keepOpen": true
  },
  "env": {},
  "dependsOn": [],
  "enabled": true,
  "source": "agent",
  "description": "Interactive CLI tool.",
  "tags": ["cli"]
}
```

Python API 服务：

```json
{
  "id": "my-python-api",
  "name": "My Python API",
  "group": "local-projects",
  "kind": "api",
  "cwd": "/absolute/path/to/my-python-api",
  "command": "./run_server.sh",
  "runMode": "managed-process",
  "port": 8000,
  "openUrl": "http://127.0.0.1:8000",
  "healthCheckUrl": "http://127.0.0.1:8000/health",
  "env": {},
  "dependsOn": [],
  "enabled": true,
  "source": "agent",
  "description": "Local FastAPI service.",
  "tags": ["python", "fastapi", "api"]
}
```

## API 注册

Dev Launcher API：

```txt
http://127.0.0.1:19527
```

服务 API 使用 token 鉴权：

```txt
Authorization: Bearer <token>
```

Token 来源：

1. 优先使用环境变量 `DEV_LAUNCHER_TOKEN`。
2. 如果缺失，向用户询问 token。
3. 除非用户明确要求，不要搜索私人目录中的敏感信息。

基础检查：

```bash
curl http://127.0.0.1:19527/api/status
curl http://127.0.0.1:19527/api/openapi.json
```

校验注册文件：

```bash
curl -X POST http://127.0.0.1:19527/api/services/validate \
  -H "Authorization: Bearer $DEV_LAUNCHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filePath":"/absolute/path/to/project/dev-launcher.service.json"}'
```

从文件注册：

```bash
curl -X POST http://127.0.0.1:19527/api/services/register-from-file \
  -H "Authorization: Bearer $DEV_LAUNCHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filePath":"/absolute/path/to/project/dev-launcher.service.json"}'
```

成功响应示例：

```json
{
  "success": true,
  "data": {
    "id": "my-service",
    "name": "My Service",
    "action": "created"
  }
}
```

`action` 也可能是 `updated`。

## 运行行为说明

托管进程服务：

- Dev Launcher 使用 `cwd`、`shell: true` 和 `env` 启动命令。
- 日志从 stdout/stderr 捕获。
- 停止时会终止托管进程树。
- 如果服务已在 Dev Launcher 外部运行，Dev Launcher 可能通过 `port` 和 `healthCheckUrl` 识别它。
- 停止操作可能终止声明端口上的监听进程。只声明该服务自己拥有的端口。

外部终端服务：

- Dev Launcher 会在终端中打开配置命令。
- 日志不保证可靠捕获。
- PID 跟踪不可靠。
- 适合交互式 CLI 工具。

端口和健康检查：

- `port` 只用于 LISTEN 状态检测。
- `healthCheckUrl` 用于判断被占用端口是否属于目标服务。
- 如果服务能在浏览器打开但状态显示为 stopped，检查 `port`、`openUrl` 和 `healthCheckUrl`。
- 如果停止失败，检查该服务拥有的所有监听端口是否都已声明。

## 排障

API connection refused：

- Dev Launcher 未运行，或 API 启动失败。
- 启动应用并检查 `GET /api/status`。

401 或 403：

- Token 缺失或错误。
- 向用户询问 `DEV_LAUNCHER_TOKEN`。

启动时端口被占用：

- 如果 `healthCheckUrl` 健康，Dev Launcher 应将服务标记为 running。
- 如果不健康，不要覆盖该端口，应报告冲突。

停止后服务仍在运行：

- 检查服务是否为 `external-terminal` 模式。
- 检查声明的 `port`、`openUrl` 和 `healthCheckUrl` 是否覆盖所有服务端口。
- 不要终止无关端口。

OpenAPI：

- 在假设 API 结构前，先读取 `GET /api/openapi.json`。

## Agent 最终回复格式

集成完成后，报告：

- 服务 id 和名称
- 检测到的类型和运行模式
- 启动命令
- 端口和 URL
- 注册文件路径
- 校验是否通过
- API 注册是否成功
- 需要人工确认的字段
