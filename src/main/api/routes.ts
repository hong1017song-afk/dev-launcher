import { FastifyInstance } from 'fastify';
import { ServiceStore } from '../services/serviceStore';
import { ServiceManager } from '../services/serviceManager';
import { Registration } from '../services/registration';
import { Diagnostics } from '../ai/diagnostics';
import { createRepairPlan } from '../ai/repairPlanner';
import { devServiceSchema, registerFromFileRequestSchema } from '../shared/schema';
import { ApiResponse, DevService, DiagnoseResult } from '../shared/types';

export function registerRoutes(
  app: FastifyInstance,
  store: ServiceStore,
  serviceManager: ServiceManager,
  registration: Registration,
  diagnostics: Diagnostics,
): void {
  // GET /api/services
  app.get('/api/services', async (_request, reply) => {
    const services = store.list();
    const runtimes = await serviceManager.getAllRuntimes();
    return reply.send({
      success: true,
      data: services.map((s) => ({
        ...s,
        runtime: runtimes.find((r) => r.id === s.id),
      })),
    } as ApiResponse);
  });

  // GET /api/services/:id
  app.get<{ Params: { id: string } }>('/api/services/:id', async (request, reply) => {
    const service = store.get(request.params.id);
    if (!service) {
      return reply.status(404).send({ success: false, error: '服务不存在' } as ApiResponse);
    }
    const runtime = serviceManager.getRuntime(request.params.id);
    return reply.send({ success: true, data: { ...service, runtime } } as ApiResponse);
  });

  // POST /api/services
  app.post('/api/services', async (request, reply) => {
    try {
      const parsed = devServiceSchema.parse(request.body);
      const created = store.create(parsed);
      return reply.status(201).send({ success: true, data: created } as ApiResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '无效的服务配置';
      return reply.status(400).send({ success: false, error: message } as ApiResponse);
    }
  });

  // PUT /api/services/:id
  app.put<{ Params: { id: string } }>('/api/services/:id', async (request, reply) => {
    const exists = store.get(request.params.id);
    if (!exists) {
      return reply.status(404).send({ success: false, error: '服务不存在' } as ApiResponse);
    }
    try {
      const updated = store.update(request.params.id, request.body as Partial<DevService>);
      return reply.send({ success: true, data: updated } as ApiResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '更新失败';
      return reply.status(400).send({ success: false, error: message } as ApiResponse);
    }
  });

  // DELETE /api/services/:id
  app.delete<{ Params: { id: string } }>('/api/services/:id', async (request, reply) => {
    const exists = store.get(request.params.id);
    if (!exists) {
      return reply.status(404).send({ success: false, error: '服务不存在' } as ApiResponse);
    }
    store.delete(request.params.id);
    return reply.send({ success: true } as ApiResponse);
  });

  // POST /api/services/:id/start
  app.post<{ Params: { id: string } }>('/api/services/:id/start', async (request, reply) => {
    try {
      await serviceManager.startService(request.params.id);
      return reply.send({ success: true } as ApiResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '启动失败';
      return reply.status(500).send({ success: false, error: message } as ApiResponse);
    }
  });

  // POST /api/services/:id/stop
  app.post<{ Params: { id: string } }>('/api/services/:id/stop', async (request, reply) => {
    try {
      await serviceManager.stopService(request.params.id);
      return reply.send({ success: true } as ApiResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '停止失败';
      return reply.status(500).send({ success: false, error: message } as ApiResponse);
    }
  });

  // POST /api/services/:id/restart
  app.post<{ Params: { id: string } }>('/api/services/:id/restart', async (request, reply) => {
    try {
      await serviceManager.restartService(request.params.id);
      return reply.send({ success: true } as ApiResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '重启失败';
      return reply.status(500).send({ success: false, error: message } as ApiResponse);
    }
  });

  // GET /api/services/:id/logs
  app.get<{ Params: { id: string } }>('/api/services/:id/logs', async (request, reply) => {
    const logs = serviceManager.getLogs(request.params.id);
    return reply.send({ success: true, data: logs } as ApiResponse);
  });

  // POST /api/services/register-from-file
  app.post('/api/services/register-from-file', async (request, reply) => {
    try {
      const { filePath } = registerFromFileRequestSchema.parse(request.body);
      const result = registration.registerFromFile(filePath);
      return reply.status(result.action === 'created' ? 201 : 200).send({
        success: true,
        data: result,
      } as ApiResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '注册失败';
      return reply.status(400).send({ success: false, error: message } as ApiResponse);
    }
  });

  // POST /api/services/validate
  app.post('/api/services/validate', async (request, reply) => {
    try {
      const { filePath } = registerFromFileRequestSchema.parse(request.body);
      const result = registration.validateFile(filePath);
      return reply.send({ success: result.valid, data: result, error: result.errors.join('; ') || undefined } as ApiResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '校验失败';
      return reply.status(400).send({ success: false, error: message } as ApiResponse);
    }
  });

  // POST /api/ai/services/:id/diagnose
  app.post<{ Params: { id: string } }>('/api/ai/services/:id/diagnose', async (request, reply) => {
    const service = store.get(request.params.id);
    if (!service) {
      return reply.status(404).send({ success: false, error: '服务不存在' } as ApiResponse);
    }
    try {
      const result = await diagnostics.diagnose(service);
      return reply.send({ success: true, data: result } as ApiResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '诊断失败';
      return reply.status(500).send({ success: false, error: message } as ApiResponse);
    }
  });

  // POST /api/ai/services/:id/repair-plan
  app.post<{ Params: { id: string } }>('/api/ai/services/:id/repair-plan', async (request, reply) => {
    const service = store.get(request.params.id);
    if (!service) {
      return reply.status(404).send({ success: false, error: '服务不存在' } as ApiResponse);
    }
    try {
      const diagResult = await diagnostics.diagnose(service);
      const plan = createRepairPlan(diagResult);
      return reply.send({ success: true, data: plan } as ApiResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '生成修复计划失败';
      return reply.status(500).send({ success: false, error: message } as ApiResponse);
    }
  });

  // GET /api/status
  app.get('/api/status', async (_request, reply) => {
    const runtimes = await serviceManager.getAllRuntimes();
    return reply.send({
      success: true,
      data: {
        version: '0.1.0',
        serviceCount: store.list().length,
        runningCount: runtimes.filter((r) => r.status === 'running').length,
        uptime: process.uptime(),
      },
    } as ApiResponse);
  });
}
