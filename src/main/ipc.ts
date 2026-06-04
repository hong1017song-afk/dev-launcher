import { ipcMain, BrowserWindow, shell } from 'electron';
import { ServiceStore } from './services/serviceStore';
import { ServiceManager } from './services/serviceManager';
import { Registration } from './services/registration';
import { Diagnostics } from './ai/diagnostics';
import { createRepairPlan } from './ai/repairPlanner';
import { RepairExecutor } from './ai/repairExecutor';
import { BrowserLauncher } from './services/browserLauncher';
import { TerminalLauncher } from './services/terminalLauncher';
import { TokenStore } from './services/tokenStore';
import { initAI, isInitialized } from './ai/aiClient';
import { AiSettings } from './shared/types';
import * as fs from 'fs';
import * as path from 'path';

export function registerIpcHandlers(
  store: ServiceStore,
  serviceManager: ServiceManager,
  registration: Registration,
  diagnostics: Diagnostics,
  repairExecutor: RepairExecutor,
  browserLauncher: BrowserLauncher,
  terminalLauncher: TerminalLauncher,
  tokenStore: TokenStore,
  userDataPath: string,
): void {
  // --- 服务 CRUD ---
  ipcMain.handle('services:list', async () => {
    const services = store.list();
    const runtimes = await serviceManager.getAllRuntimes();
    return services.map((s) => ({
      ...s,
      runtime: runtimes.find((r) => r.id === s.id) || serviceManager.getRuntime(s.id),
    }));
  });

  ipcMain.handle('services:get', (_e, id: string) => {
    const service = store.get(id);
    if (!service) return null;
    return { ...service, runtime: serviceManager.getRuntime(id) };
  });

  ipcMain.handle('services:create', (_e, data: Record<string, unknown>) => {
    return store.create(data as any);
  });

  ipcMain.handle('services:update', (_e, id: string, data: Record<string, unknown>) => {
    return store.update(id, data as any);
  });

  ipcMain.handle('services:delete', (_e, id: string) => {
    store.delete(id);
    return true;
  });

  // --- 服务启停 ---
  ipcMain.handle('services:start', async (_e, id: string) => {
    await serviceManager.startService(id);
    return serviceManager.getRuntime(id);
  });

  ipcMain.handle('services:stop', async (_e, id: string) => {
    await serviceManager.stopService(id);
    return serviceManager.getRuntime(id);
  });

  ipcMain.handle('services:restart', async (_e, id: string) => {
    await serviceManager.restartService(id);
    return serviceManager.getRuntime(id);
  });

  ipcMain.handle('services:startAll', async () => {
    await serviceManager.startAll();
    return serviceManager.getAllRuntimes();
  });

  ipcMain.handle('services:stopAll', async () => {
    await serviceManager.stopAll();
    return serviceManager.getAllRuntimes();
  });

  ipcMain.handle('services:getLogs', (_e, id: string) => {
    return serviceManager.getLogs(id);
  });

  // --- 服务注册 ---
  ipcMain.handle('services:registerFromFile', async (_e, filePath: string) => {
    return registration.registerFromFile(filePath);
  });

  ipcMain.handle('services:validate', async (_e, filePath: string) => {
    return registration.validateFile(filePath);
  });

  // --- AI 诊断 ---
  ipcMain.handle('ai:diagnoseService', async (_e, serviceId: string) => {
    const service = store.get(serviceId);
    if (!service) throw new Error('服务不存在');
    return diagnostics.diagnose(service);
  });

  ipcMain.handle('ai:createRepairPlan', async (_e, serviceId: string) => {
    const service = store.get(serviceId);
    if (!service) throw new Error('服务不存在');
    const diagResult = await diagnostics.diagnose(service);
    return createRepairPlan(diagResult);
  });

  ipcMain.handle('ai:executeRepairAction', async (_e, action: Record<string, unknown>) => {
    return repairExecutor.execute(action as any);
  });

  ipcMain.handle('ai:getSettings', () => {
    try {
      const settingsPath = path.join(userDataPath, 'ai-settings.json');
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {
        provider: 'deepseek',
        model: 'deepseek-v4-pro',
        allowRepairExecution: 'approval-required',
        apiKey: process.env.DEEPSEEK_API_KEY || '',
      } as AiSettings;
    }
  });

  ipcMain.handle('ai:updateSettings', (_e, settings: AiSettings) => {
    try {
      const settingsPath = path.join(userDataPath, 'ai-settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      if (settings.apiKey) {
        initAI(settings);
      }

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('ai:isInitialized', () => {
    return isInitialized();
  });

  // --- 系统工具 ---
  ipcMain.handle('system:listBrowsers', () => {
    return browserLauncher.listBrowsers();
  });

  ipcMain.handle('system:listTerminals', () => {
    return terminalLauncher.listTerminals();
  });

  ipcMain.handle('system:openUrl', async (_e, serviceId: string) => {
    await serviceManager.openUrl(serviceId);
    return true;
  });

  ipcMain.handle('system:openFolder', async (_e, serviceId: string) => {
    await serviceManager.openFolder(serviceId);
    return true;
  });

  // --- 应用信息 ---
  ipcMain.handle('app:getStatus', async () => {
    const runtimes = await serviceManager.getAllRuntimes();
    return {
      version: '0.1.0',
      serviceCount: store.list().length,
      runningCount: runtimes.filter((r) => r.status === 'running').length,
    };
  });

  ipcMain.handle('app:getTokenInfo', () => {
    return tokenStore.getTokenInfo();
  });
}
