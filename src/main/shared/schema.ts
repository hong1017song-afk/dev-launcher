import { z } from 'zod';

const serviceSourceSchema = z.enum(["manual", "api", "agent"]);
const serviceKindSchema = z.enum(["web", "api", "database", "redis", "docker-compose", "cli", "custom"]);
const runModeSchema = z.enum(["managed-process", "external-terminal"]);
const serviceStatusSchema = z.enum(["stopped", "starting", "running", "stopping", "error"]);

const browserConfigSchema = z.object({
  mode: z.enum(["default", "specific"]),
  browserId: z.string().optional(),
}).optional();

const terminalConfigSchema = z.object({
  mode: z.enum(["default", "specific"]),
  appId: z.string().optional(),
  keepOpen: z.boolean().optional(),
}).optional();

export const devServiceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  group: z.string().default("Default"),
  kind: serviceKindSchema,
  cwd: z.string().min(1),
  command: z.string().min(1),
  runMode: runModeSchema,
  port: z.number().int().positive().optional(),
  openUrl: z.string().optional(),
  healthCheckUrl: z.string().optional(),
  browser: browserConfigSchema,
  terminal: terminalConfigSchema,
  env: z.record(z.string()).default({}),
  dependsOn: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  source: serviceSourceSchema,
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export const devServiceUpdateSchema = devServiceSchema.partial().omit({ id: true });

export const serviceRuntimeSchema = z.object({
  id: z.string(),
  status: serviceStatusSchema,
  pid: z.number().optional(),
  startedAt: z.number().optional(),
  stoppedAt: z.number().optional(),
  error: z.string().optional(),
  port: z.number().optional(),
  portFree: z.boolean().default(true),
});

export const aiSettingsSchema = z.object({
  provider: z.enum(["openai", "deepseek"]),
  apiKey: z.string().optional().default(''),
  model: z.string().min(1),
  allowRepairExecution: z.literal("approval-required"),
});

export const repairActionSchema = z.object({
  id: z.string(),
  type: z.enum(["run-command", "edit-file", "open-file", "restart-service"]),
  serviceId: z.string(),
  title: z.string(),
  explanation: z.string(),
  command: z.string().optional(),
  cwd: z.string().optional(),
  filePath: z.string().optional(),
  patchPreview: z.string().optional(),
  risk: z.enum(["low", "medium", "high"]),
});

export const registerFromFileRequestSchema = z.object({
  filePath: z.string().min(1),
});

export const serviceRegistrationFileSchema = devServiceSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: serviceKindSchema,
  cwd: z.string().min(1),
  command: z.string().min(1),
  runMode: runModeSchema,
  source: z.literal("agent"),
});
