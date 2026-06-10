import { contextBridge, ipcRenderer } from 'electron';
import type { DevService, ServiceRuntime, DiagnoseResult, RepairAction, BrowserInfo, TerminalInfo, TokenInfo, RegisterFromFileResult, AiSettings } from '../main/shared/types';

const api = {
  services: {
    list: () => ipcRenderer.invoke('services:list') as Promise<(DevService & { runtime: ServiceRuntime })[]>,
    get: (id: string) => ipcRenderer.invoke('services:get', id) as Promise<(DevService & { runtime: ServiceRuntime }) | null>,
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('services:create', data) as Promise<DevService>,
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('services:update', id, data) as Promise<DevService>,
    delete: (id: string) => ipcRenderer.invoke('services:delete', id) as Promise<boolean>,
    start: (id: string) => ipcRenderer.invoke('services:start', id) as Promise<ServiceRuntime>,
    stop: (id: string) => ipcRenderer.invoke('services:stop', id) as Promise<ServiceRuntime>,
    restart: (id: string) => ipcRenderer.invoke('services:restart', id) as Promise<ServiceRuntime>,
    startAll: () => ipcRenderer.invoke('services:startAll') as Promise<ServiceRuntime[]>,
    stopAll: () => ipcRenderer.invoke('services:stopAll') as Promise<ServiceRuntime[]>,
    getLogs: (id: string) => ipcRenderer.invoke('services:getLogs', id) as Promise<string[]>,
    registerFromFile: (filePath: string) => ipcRenderer.invoke('services:registerFromFile', filePath) as Promise<RegisterFromFileResult>,
    validate: (filePath: string) => ipcRenderer.invoke('services:validate', filePath) as Promise<{ valid: boolean; errors: string[] }>,
  },
  ai: {
    diagnoseService: (serviceId: string) => ipcRenderer.invoke('ai:diagnoseService', serviceId) as Promise<DiagnoseResult>,
    createRepairPlan: (serviceId: string) => ipcRenderer.invoke('ai:createRepairPlan', serviceId) as Promise<DiagnoseResult>,
    executeRepairAction: (action: RepairAction) => ipcRenderer.invoke('ai:executeRepairAction', action) as Promise<{ success: boolean; output: string }>,
    getSettings: () => ipcRenderer.invoke('ai:getSettings') as Promise<AiSettings>,
    updateSettings: (settings: AiSettings) => ipcRenderer.invoke('ai:updateSettings', settings) as Promise<{ success: boolean; error?: string }>,
    isInitialized: () => ipcRenderer.invoke('ai:isInitialized') as Promise<boolean>,
  },
  system: {
    listBrowsers: () => ipcRenderer.invoke('system:listBrowsers') as Promise<BrowserInfo[]>,
    listTerminals: () => ipcRenderer.invoke('system:listTerminals') as Promise<TerminalInfo[]>,
    openUrl: (serviceId: string) => ipcRenderer.invoke('system:openUrl', serviceId) as Promise<boolean>,
    openFolder: (serviceId: string) => ipcRenderer.invoke('system:openFolder', serviceId) as Promise<boolean>,
  },
  app: {
    getStatus: () => ipcRenderer.invoke('app:getStatus') as Promise<{ version: string; serviceCount: number; runningCount: number }>,
    getTokenInfo: () => ipcRenderer.invoke('app:getTokenInfo') as Promise<TokenInfo>,
    getAppLogs: () => ipcRenderer.invoke('app:getAppLogs') as Promise<string[]>,
  },
  onLog: (callback: (serviceId: string, line: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, serviceId: string, line: string) => {
      callback(serviceId, line);
    };
    ipcRenderer.on('service:log', listener);
    return () => ipcRenderer.removeListener('service:log', listener);
  },
  onStatusChange: (callback: (serviceId: string, status: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, serviceId: string, status: string) => {
      callback(serviceId, status);
    };
    ipcRenderer.on('service:statusChange', listener);
    return () => ipcRenderer.removeListener('service:statusChange', listener);
  },
  onApiError: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => {
      callback(message);
    };
    ipcRenderer.on('app:apiError', listener);
    return () => ipcRenderer.removeListener('app:apiError', listener);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
