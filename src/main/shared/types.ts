export type ServiceSource = "manual" | "api" | "agent";
export type ServiceKind = "web" | "api" | "database" | "redis" | "docker-compose" | "cli" | "custom";
export type RunMode = "managed-process" | "external-terminal";
export type ServiceStatus = "stopped" | "starting" | "running" | "stopping" | "error";

export interface DevService {
  id: string;
  name: string;
  group: string;
  kind: ServiceKind;
  cwd: string;
  command: string;
  runMode: RunMode;
  port?: number;
  openUrl?: string;
  healthCheckUrl?: string;
  browser?: {
    mode: "default" | "specific";
    browserId?: string;
  };
  terminal?: {
    mode: "default" | "specific";
    appId?: string;
    keepOpen?: boolean;
  };
  env: Record<string, string>;
  dependsOn: string[];
  enabled: boolean;
  source: ServiceSource;
  description?: string;
  tags: string[];
}

export interface ServiceRuntime {
  id: string;
  status: ServiceStatus;
  pid?: number;
  startedAt?: number;
  stoppedAt?: number;
  error?: string;
  port?: number;
  portFree: boolean;
}

export type AiProvider = "openai" | "deepseek";

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  model: string;
  allowRepairExecution: "approval-required";
}

export interface RepairAction {
  id: string;
  type: "run-command" | "edit-file" | "open-file" | "restart-service";
  serviceId: string;
  title: string;
  explanation: string;
  command?: string;
  cwd?: string;
  filePath?: string;
  patchPreview?: string;
  risk: "low" | "medium" | "high";
}

export interface DiagnoseResult {
  serviceId: string;
  timestamp: number;
  status: ServiceStatus;
  issues: string[];
  possibleCauses: string[];
  suggestions: string[];
  repairActions: RepairAction[];
  rawResponse: string;
}

export interface BrowserInfo {
  id: string;
  name: string;
  path?: string;
}

export interface TerminalInfo {
  id: string;
  name: string;
  command: string;
}

export interface RegisterFromFileRequest {
  filePath: string;
}

export interface RegisterFromFileResult {
  id: string;
  name: string;
  action: "created" | "updated";
  previousSource?: ServiceSource;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TokenInfo {
  token: string;
  createdAt: number;
}
