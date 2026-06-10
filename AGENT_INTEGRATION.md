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
- `port`: only set when confident. One port can only belong to one enabled service. Registering a duplicate port will fail with a clear error (port number, conflicting service name, conflicting service ID).
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

Port conflict error response (HTTP 400):

```json
{
  "success": false,
  "error": "端口 5173 已被启用服务 \"Other Service\" (other-service) 占用"
}
```

This applies to `POST /api/services`, `PUT /api/services/:id`, and `POST /api/services/register-from-file`.

## Runtime Behavior Notes

Managed process services:

- Dev Launcher starts the command with `cwd`, `shell: true`, and `env`.
- Logs are captured from stdout/stderr.
- Stop terminates the managed process tree (only the PID tracked by Dev Launcher; it does not kill processes by port).
- If a port is occupied but no managed PID exists for this service, the service will show a port conflict error instead of being marked as running. Register only one service per port.

External terminal services:

- Dev Launcher opens the configured command in a terminal.
- Logs are not reliably captured.
- PID tracking is not reliable.
- Use this for interactive CLI tools.

Port and health checks:

- `port` is used for LISTEN-state detection only.
- A service is only marked as running when Dev Launcher manages its process PID. Port occupation alone does not indicate the service is running under Dev Launcher.
- If a port is occupied by a different service's managed process, the service will show a conflict error (e.g. "Port 3000 is occupied by service X").
- If a service opens in the browser but shows as stopped or conflict, verify `port`, `openUrl`, and `healthCheckUrl` — another enabled service may have claimed the same port.
- If stop does not work for a service without a managed PID, the port may be owned by an external process. Dev Launcher will not blindly terminate processes by port. Manually stop the process, then verify.

## Troubleshooting

API connection refused:

- Dev Launcher is not running, or the API failed to start.
- Start the app and check `GET /api/status`.

401 or 403:

- Token is missing or wrong.
- Ask the user for `DEV_LAUNCHER_TOKEN`.

Port occupied on start:

- If the same port is already assigned to another enabled service, Dev Launcher will reject the start with an error naming the conflicting service. Change one of the service ports.
- If a different process occupies the port (not managed by Dev Launcher), start still fails. Stop the external process first.

Service stays running after stop:

- Check whether the process is external-terminal mode (not tracked by Dev Launcher).
- If the service has no managed PID, Dev Launcher will not kill processes by port. Manually kill the process, then the service status will update on the next refresh.
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
- `port`：只有在能可靠确认时填写。同一端口只能归属一个启用服务，注册重复端口将返回明确错误（端口号、冲突服务名称、冲突服务 ID）。
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

端口冲突错误响应（HTTP 400）：

```json
{
  "success": false,
  "error": "端口 5173 已被启用服务 \"Other Service\" (other-service) 占用"
}
```

适用于 `POST /api/services`、`PUT /api/services/:id` 和 `POST /api/services/register-from-file`。

## 运行行为说明

托管进程服务：

- Dev Launcher 使用 `cwd`、`shell: true` 和 `env` 启动命令。
- 日志从 stdout/stderr 捕获。
- 停止时会终止托管进程树（仅终止 Dev Launcher 记录的 PID，不会按端口杀进程）。
- 如果端口被占用但没有该服务的托管 PID，服务将显示端口冲突错误而非标记为 running。每个端口只注册一个服务。

外部终端服务：

- Dev Launcher 会在终端中打开配置命令。
- 日志不保证可靠捕获。
- PID 跟踪不可靠。
- 适合交互式 CLI 工具。

端口和健康检查：

- `port` 只用于 LISTEN 状态检测。
- 服务只有在 Dev Launcher 托管其进程 PID 时才会被标记为 running。端口被占用来不代表该服务在 Dev Launcher 管理下运行。
- 如果端口被其他服务的托管进程占用，本服务将显示冲突错误（如"端口 3000 被服务 X 占用"）。
- 如果服务能在浏览器打开但状态显示为 stopped 或冲突，检查 `port`、`openUrl` 和 `healthCheckUrl`——可能另一个启用服务已占用该端口。
- 如果停止没有托管 PID 的服务失败，端口可能属于外部进程。Dev Launcher 不会盲目按端口杀进程。手动终止进程，然后刷新状态。

## 排障

API connection refused：

- Dev Launcher 未运行，或 API 启动失败。
- 启动应用并检查 `GET /api/status`。

401 或 403：

- Token 缺失或错误。
- 向用户询问 `DEV_LAUNCHER_TOKEN`。

启动时端口被占用：

- 如果同端口已分配给其他启用服务，Dev Launcher 将拒绝启动并提示冲突服务名称。修改其中一个服务的端口。
- 如果其他进程（非 Dev Launcher 管理）占用端口，启动同样失败。先停止外部进程。

停止后服务仍在运行：

- 检查服务是否为 `external-terminal` 模式（Dev Launcher 不追踪）。
- 如果服务没有托管 PID，Dev Launcher 不会按端口杀进程。手动 kill 进程后，下次刷新时状态将更新。
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
