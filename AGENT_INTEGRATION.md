# Dev Launcher Agent Integration Guide

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
