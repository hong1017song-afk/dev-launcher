import { app, BrowserWindow } from 'electron';
import * as path from 'path';

app.setName('Dev Launcher');

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

import { createWindow, getMainWindow } from './window';
import { registerIpcHandlers } from './ipc';
import { ServiceStore } from './services/serviceStore';
import { ServiceManager } from './services/serviceManager';
import { ProcessManager } from './services/processManager';
import { PortChecker } from './services/portChecker';
import { HealthChecker } from './services/healthChecker';
import { TerminalLauncher } from './services/terminalLauncher';
import { BrowserLauncher } from './services/browserLauncher';
import { TokenStore } from './services/tokenStore';
import { Registration } from './services/registration';
import { Diagnostics } from './ai/diagnostics';
import { RepairExecutor } from './ai/repairExecutor';
import { ApiServer } from './api/auth';
import { registerRoutes } from './api/routes';
import { setupOpenAPI } from './api/openapi';
import { initAI } from './ai/aiClient';
import { AiSettings } from './shared/types';
import * as fs from 'fs';

if (gotTheLock) {
let apiServer: ApiServer | null = null;
let serviceManager: ServiceManager | null = null;

async function setupApp(): Promise<void> {
  const userDataPath = app.getPath('userData');

  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const logDir = path.join(userDataPath, 'logs');
  const appLogPath = path.join(userDataPath, 'logs', 'app.log');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const store = new ServiceStore(userDataPath);
  const tokenStore = new TokenStore(userDataPath);
  const processManager = new ProcessManager();
  const portChecker = new PortChecker();
  const healthChecker = new HealthChecker();
  const terminalLauncher = new TerminalLauncher();
  const browserLauncher = new BrowserLauncher();

  serviceManager = new ServiceManager(store, processManager, portChecker, healthChecker, terminalLauncher, browserLauncher, logDir, appLogPath);

  const getLogs = (serviceId: string) => serviceManager!.getLogs(serviceId);
  const getRuntime = (serviceId: string) => serviceManager!.getRuntime(serviceId);

  const registration = new Registration(store);
  const diagnostics = new Diagnostics(portChecker, healthChecker, getLogs, getRuntime);
  const repairExecutor = new RepairExecutor(serviceManager);

  processManager.setLogCallback((serviceId, line) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('service:log', serviceId, line);
    }
  });

  processManager.setStatusChangeCallback((serviceId, status) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('service:statusChange', serviceId, status);
    }
  });

  registerIpcHandlers(store, serviceManager, registration, diagnostics, repairExecutor, browserLauncher, terminalLauncher, tokenStore, userDataPath);

  const settingsPath = path.join(userDataPath, 'ai-settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as AiSettings;
      if (settings.apiKey) {
        initAI(settings);
        serviceManager.appendAppLog('AI 客户端初始化成功');
      }
    }
  } catch {
    serviceManager.appendAppLog('AI 设置文件读取失败，将使用默认设置');
  }

  apiServer = new ApiServer(tokenStore);
  await setupOpenAPI(apiServer.getApp());
  registerRoutes(apiServer.getApp(), store, serviceManager, registration, diagnostics);

  apiServer.start().then(() => {
    serviceManager!.appendAppLog('API 服务器已启动 (端口 19527)');
  }).catch((err) => {
    const msg = `API 启动失败: ${err instanceof Error ? err.message : String(err)}`;
    console.error('[Main]', msg);
    serviceManager!.appendAppLog(msg);
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('app:apiError', msg);
    }
  });
}

app.whenReady().then(() => {
  setupApp().catch((err) => {
    console.error('[Main] 应用初始化失败:', err);
    if (serviceManager) {
      serviceManager.appendAppLog(`应用初始化失败: ${err instanceof Error ? err.message : String(err)}`);
    }
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('app:apiError', `应用初始化失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  if (apiServer) {
    await apiServer.stop();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (apiServer) {
    await apiServer.stop();
  }
});
}
