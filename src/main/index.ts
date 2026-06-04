import { app, BrowserWindow } from 'electron';
import * as path from 'path';

app.setName('Dev Launcher');
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

let apiServer: ApiServer | null = null;

async function setupApp(): Promise<void> {
  const userDataPath = app.getPath('userData');

  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const store = new ServiceStore(userDataPath);
  const tokenStore = new TokenStore(userDataPath);
  const processManager = new ProcessManager();
  const portChecker = new PortChecker();
  const healthChecker = new HealthChecker();
  const terminalLauncher = new TerminalLauncher();
  const browserLauncher = new BrowserLauncher();

  const getLogs = (serviceId: string) => processManager.getLogs(serviceId);
  const getRuntime = (serviceId: string) => {
    const mp = processManager.getProcess(serviceId);
    const rt = {
      id: serviceId,
      status: mp?.status || ('stopped' as const),
      pid: mp?.pid,
      startedAt: mp?.startedAt,
      stoppedAt: mp?.stoppedAt,
      error: mp?.error,
      portFree: true,
    };
    return rt;
  };

  const serviceManager = new ServiceManager(store, processManager, portChecker, healthChecker, terminalLauncher, browserLauncher);
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
      }
    }
  } catch { /* ignore */ }

  apiServer = new ApiServer(tokenStore);
  await setupOpenAPI(apiServer.getApp());
  registerRoutes(apiServer.getApp(), store, serviceManager, registration, diagnostics);

  apiServer.start().catch((err) => {
    console.error('[Main] API 启动失败:', err);
  });
}

app.whenReady().then(() => {
  setupApp().catch((err) => {
    console.error('[Main] 应用初始化失败:', err);
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
