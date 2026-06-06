import * as fs from 'fs';
import * as path from 'path';
import { DevService, ServiceRuntime, ServiceStatus } from '../shared/types';
import { devServiceSchema } from '../shared/schema';
import { ServiceStore } from './serviceStore';
import { ProcessManager } from './processManager';
import { PortChecker } from './portChecker';
import { HealthChecker } from './healthChecker';
import { TerminalLauncher } from './terminalLauncher';
import { BrowserLauncher } from './browserLauncher';

export class ServiceManager {
  private runtimes: Map<string, ServiceRuntime> = new Map();
  private dependencyLaunching: Set<string> = new Set();

  constructor(
    private store: ServiceStore,
    private processManager: ProcessManager,
    private portChecker: PortChecker,
    private healthChecker: HealthChecker,
    private terminalLauncher: TerminalLauncher,
    private browserLauncher: BrowserLauncher,
  ) {
    this.processManager.setStatusChangeCallback((serviceId, status) => {
      const rt = this.runtimes.get(serviceId) || {
        id: serviceId,
        status: 'stopped' as ServiceStatus,
        portFree: true,
      };
      rt.status = status;
      const mp = this.processManager.getProcess(serviceId);
      if (mp) {
        rt.pid = mp.pid;
        rt.error = mp.error;
      }
      this.runtimes.set(serviceId, rt);
    });

    this.processManager.setLogCallback((_serviceId, _line) => {
      // Logs are handled via getLogs IPC
    });
  }

  getRuntime(serviceId: string): ServiceRuntime {
    return this.runtimes.get(serviceId) || {
      id: serviceId,
      status: 'stopped',
      portFree: true,
    };
  }

  async refreshRuntime(serviceId: string): Promise<ServiceRuntime> {
    const service = this.store.get(serviceId);
    if (!service) return this.getRuntime(serviceId);

    const rt = this.getRuntime(serviceId);
    const managed = this.processManager.getProcess(serviceId);
    if (managed?.status === 'running' || managed?.status === 'starting') {
      return rt;
    }

    if (service.port) {
      const portFree = await this.portChecker.isPortFree(service.port);
      rt.port = service.port;
      rt.portFree = portFree;

      if (!portFree && await this.isServiceReachable(service)) {
        rt.status = 'running';
        rt.error = undefined;
        rt.stoppedAt = undefined;
        this.runtimes.set(serviceId, rt);
        return rt;
      }

      if (!portFree && rt.status === 'stopped') {
        rt.error = `端口 ${service.port} 已被其他进程占用`;
      }

      if (portFree && rt.status === 'running') {
        rt.status = 'stopped';
        rt.pid = undefined;
        rt.error = undefined;
      }
    }

    this.runtimes.set(serviceId, rt);
    return rt;
  }

  async getAllRuntimes(): Promise<ServiceRuntime[]> {
    const runtimes: ServiceRuntime[] = [];
    for (const service of this.store.list()) {
      runtimes.push(await this.refreshRuntime(service.id));
    }
    return runtimes;
  }

  async startService(serviceId: string): Promise<void> {
    const service = this.store.get(serviceId);
    if (!service) throw new Error(`服务 "${serviceId}" 不存在`);

    if (!service.enabled) throw new Error(`服务 "${service.name}" 已禁用`);

    const rt = this.getRuntime(serviceId);
    if (rt.status === 'running' || rt.status === 'starting') {
      return;
    }

    if (service.dependsOn.length > 0) {
      await this.startDependencies(service);
    }

    if (service.port) {
      const portFree = await this.portChecker.isPortFree(service.port);
      if (!portFree) {
        if (await this.isServiceReachable(service)) {
          rt.status = 'running';
          rt.port = service.port;
          rt.portFree = false;
          rt.error = undefined;
          rt.stoppedAt = undefined;
          this.runtimes.set(serviceId, rt);
          return;
        }
        throw new Error(`端口 ${service.port} 已被占用，无法启动 "${service.name}"`);
      }
      rt.portFree = true;
    }

    if (service.runMode === 'external-terminal') {
      await this.startInTerminal(service);
      return;
    }

    await this.processManager.start(service.id, service.command, service.cwd, service.env);

    if (service.healthCheckUrl) {
      const healthy = await this.healthChecker.waitForHealthy(service.healthCheckUrl);
      if (!healthy) {
        rt.status = 'error';
        rt.error = '健康检查超时';
        this.runtimes.set(serviceId, rt);
        throw new Error(rt.error);
      }
    }
  }

  async stopService(serviceId: string): Promise<void> {
    const service = this.store.get(serviceId);
    if (!service) throw new Error(`服务 "${serviceId}" 不存在`);

    const rt = this.getRuntime(serviceId);

    if (service.runMode === 'external-terminal') {
      rt.status = 'stopped';
      rt.stoppedAt = Date.now();
      this.runtimes.set(serviceId, rt);
      return;
    }

    const managedProcess = this.processManager.getProcess(serviceId);
    if (!managedProcess?.pid && service.runMode === 'managed-process') {
      const ports = this.getServicePorts(service);
      for (const port of ports) {
        await this.portChecker.terminatePort(port);
      }

      const stopped = await this.waitForPortsFree(ports);
      rt.status = stopped ? 'stopped' : 'running';
      rt.stoppedAt = stopped ? Date.now() : undefined;
      rt.pid = undefined;
      rt.portFree = stopped;
      rt.error = stopped ? undefined : `端口 ${ports.join(', ')} 仍被占用`;
      this.runtimes.set(serviceId, rt);

      if (!stopped) {
        throw new Error(`无法停止 "${service.name}"，端口 ${ports.join(', ')} 仍被占用`);
      }
      return;
    }

    await this.processManager.stop(serviceId);
    if (!this.processManager.getProcess(serviceId)) {
      rt.status = 'stopped';
      rt.stoppedAt = Date.now();
      rt.pid = undefined;
      this.runtimes.set(serviceId, rt);
    }
  }

  async restartService(serviceId: string): Promise<void> {
    await this.stopService(serviceId);
    const rt = this.getRuntime(serviceId);
    while (rt.status === 'stopping') {
      await new Promise((r) => setTimeout(r, 200));
      const updated = this.getRuntime(serviceId);
      rt.status = updated.status;
    }
    await this.startService(serviceId);
  }

  async startAll(): Promise<void> {
    const services = this.store.list().filter((s) => s.enabled);
    const sorted = this.topologicalSort(services);

    for (const service of sorted) {
      try {
        await this.startService(service.id);
      } catch (err) {
        console.error(`[ServiceManager] 启动 "${service.name}" 失败:`, err);
      }
    }
  }

  async stopAll(): Promise<void> {
    const services = this.store.list();
    for (const service of services) {
      try {
        await this.stopService(service.id);
      } catch (err) {
        console.error(`[ServiceManager] 停止 "${service.name}" 失败:`, err);
      }
    }
  }

  getLogs(serviceId: string): string[] {
    return this.processManager.getLogs(serviceId);
  }

  async openUrl(serviceId: string): Promise<void> {
    const service = this.store.get(serviceId);
    if (!service) throw new Error(`服务 "${serviceId}" 不存在`);

    const url = service.openUrl || (service.port ? `http://127.0.0.1:${service.port}` : undefined);
    if (!url) throw new Error(`服务 "${service.name}" 未配置 URL 或端口`);

    const { exec } = await import('child_process');
    const cmd = this.buildOpenUrlCommand(service, url);
    exec(cmd, (err) => {
      if (err) console.error(`[ServiceManager] 打开 URL 失败:`, err);
    });
  }

  async openFolder(serviceId: string): Promise<void> {
    const service = this.store.get(serviceId);
    if (!service) throw new Error(`服务 "${serviceId}" 不存在`);

    const { exec } = await import('child_process');
    const cmd = process.platform === 'darwin'
      ? `open "${service.cwd}"`
      : process.platform === 'win32'
        ? `explorer "${service.cwd}"`
        : `xdg-open "${service.cwd}"`;
    exec(cmd, (err) => {
      if (err) console.error(`[ServiceManager] 打开目录失败:`, err);
    });
  }

  private async startDependencies(service: DevService): Promise<void> {
    for (const depId of service.dependsOn) {
      if (this.dependencyLaunching.has(depId)) continue;

      const depRt = this.getRuntime(depId);
      if (depRt.status === 'running') continue;

      this.dependencyLaunching.add(depId);
      try {
        await this.startService(depId);
      } finally {
        this.dependencyLaunching.delete(depId);
      }
    }
  }

  private async startInTerminal(service: DevService): Promise<void> {
    const { exec } = await import('child_process');
    const promisifyFn = (await import('util')).promisify;
    const execAsync = promisifyFn(exec);

    let terminalCmd: string;

    if (service.terminal?.mode === 'specific' && service.terminal.appId) {
      const termInfo = this.terminalLauncher.getTerminal(service.terminal.appId);
      if (!termInfo) throw new Error(`未找到终端 "${service.terminal.appId}"`);

      const keepOpen = service.terminal.keepOpen !== false;
      if (process.platform === 'darwin') {
        const escapedCmd = service.command.replace(/"/g, '\\"');
        if (keepOpen) {
          terminalCmd = `osascript -e 'tell app "${termInfo.name}" to activate' -e 'tell app "${termInfo.name}" to do script "${escapedCmd}"'`;
        } else {
          terminalCmd = `osascript -e 'tell app "${termInfo.name}" to do script "${escapedCmd}"'`;
        }
      } else {
        terminalCmd = termInfo.command.replace('$CMD', service.command);
      }
    } else {
      if (process.platform === 'darwin') {
        const escapedCmd = service.command.replace(/"/g, '\\"');
        const keepOpen = service.terminal?.keepOpen !== false;
        terminalCmd = keepOpen
          ? `osascript -e 'tell app "Terminal" to do script "${escapedCmd}"' -e 'tell app "Terminal" to activate'`
          : `osascript -e 'tell app "Terminal" to do script "${escapedCmd}"'`;
      } else if (process.platform === 'win32') {
        terminalCmd = `start cmd /k "${service.command}"`;
      } else {
        terminalCmd = `gnome-terminal -- bash -c "${service.command}; exec bash"`;
      }
    }

    await execAsync(terminalCmd, { cwd: service.cwd });

    const rt = this.getRuntime(service.id);
    rt.status = 'running';
    rt.startedAt = Date.now();
    this.runtimes.set(service.id, rt);
  }

  private async isServiceReachable(service: DevService): Promise<boolean> {
    const url = service.healthCheckUrl || service.openUrl || (service.port ? `http://127.0.0.1:${service.port}` : undefined);
    if (!url) return false;
    return this.healthChecker.check(url, 1500);
  }

  private getServicePorts(service: DevService): number[] {
    const ports = new Set<number>();
    if (service.port) ports.add(service.port);

    for (const url of [service.openUrl, service.healthCheckUrl]) {
      if (!url) continue;
      try {
        const parsed = new URL(url);
        if (parsed.port) {
          ports.add(Number(parsed.port));
        }
      } catch {
        // Ignore invalid or non-URL values here; schema validation handles config quality.
      }
    }

    return Array.from(ports).filter((port) => Number.isInteger(port) && port > 0);
  }

  private async waitForPortsFree(ports: number[], timeoutMs: number = 5000): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const checks = await Promise.all(ports.map((port) => this.portChecker.isPortFree(port)));
      if (checks.every(Boolean)) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return ports.length === 0;
  }

  private buildOpenUrlCommand(service: DevService, url: string): string {
    if (service.browser?.mode === 'specific' && service.browser.browserId && service.browser.browserId !== 'default') {
      if (process.platform === 'darwin') {
        const browser = this.browserLauncher.getBrowser(service.browser.browserId);
        const name = browser?.name || service.browser.browserId;
        return `open -a "${name}" "${url}"`;
      } else if (process.platform === 'win32') {
        return `start ${service.browser.browserId} "${url}"`;
      } else {
        return `${service.browser.browserId} "${url}"`;
      }
    }

    if (process.platform === 'darwin') {
      return `open "${url}"`;
    } else if (process.platform === 'win32') {
      return `start "" "${url}"`;
    } else {
      return `xdg-open "${url}"`;
    }
  }

  private topologicalSort(services: DevService[]): DevService[] {
    const idSet = new Set(services.map((s) => s.id));
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const result: DevService[] = [];

    function dfs(node: DevService): void {
      if (visited.has(node.id)) return;
      if (inStack.has(node.id)) {
        throw new Error(`检测到依赖循环: ${node.id}`);
      }
      inStack.add(node.id);
      for (const depId of node.dependsOn) {
        if (!idSet.has(depId)) continue;
        const dep = services.find((s) => s.id === depId);
        if (dep) dfs(dep);
      }
      inStack.delete(node.id);
      visited.add(node.id);
      result.push(node);
    }

    for (const service of services) {
      if (!visited.has(service.id)) {
        dfs(service);
      }
    }

    return result;
  }
}
