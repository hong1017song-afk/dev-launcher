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

const MAX_FILE_LOG_TAIL = 500;
const MAX_APP_LOG_LINES = 2000;

function timestamp(): string {
  return new Date().toISOString();
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export class ServiceManager {
  private runtimes: Map<string, ServiceRuntime> = new Map();
  private dependencyLaunching: Set<string> = new Set();
  private operationLocks: Map<string, Promise<void>> = new Map();
  private logDir: string;
  private appLogPath: string;
  private appLogBuffer: string[] = [];

  constructor(
    private store: ServiceStore,
    private processManager: ProcessManager,
    private portChecker: PortChecker,
    private healthChecker: HealthChecker,
    private terminalLauncher: TerminalLauncher,
    private browserLauncher: BrowserLauncher,
    logDir: string,
    appLogPath: string,
  ) {
    this.logDir = logDir;
    this.appLogPath = appLogPath;
    ensureDir(logDir);

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
      if (status === 'error' && mp?.error) {
        this.appendServiceLog(serviceId, `[LIFECYCLE] 服务进入错误状态: ${mp.error}`);
      }
      if (status === 'stopped') {
        this.appendServiceLog(serviceId, '[LIFECYCLE] 进程已停止');
      }
    });

    this.processManager.setLogCallback((serviceId, line) => {
      this.appendServiceLog(serviceId, line);
    });
  }

  private async withLock<T>(serviceId: string, fn: () => Promise<T>): Promise<T> {

    while (this.operationLocks.has(serviceId)) {
      await this.operationLocks.get(serviceId);
    }

    let resolveLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.operationLocks.set(serviceId, lockPromise);

    try {
      return await fn();
    } finally {
      this.operationLocks.delete(serviceId);
      resolveLock!();
    }
  }

  appendServiceLog(serviceId: string, line: string): void {
    try {
      const logPath = path.join(this.logDir, `${serviceId}.log`);
      fs.appendFileSync(logPath, `[${timestamp()}] ${line}\n`, 'utf-8');
    } catch { /* 日志写入失败不应影响服务运行 */ }
  }

  appendAppLog(message: string): void {
    const line = `[${timestamp()}] ${message}`;
    this.appLogBuffer.push(line);
    if (this.appLogBuffer.length > MAX_APP_LOG_LINES) {
      this.appLogBuffer = this.appLogBuffer.slice(-MAX_APP_LOG_LINES);
    }
    try {
      fs.appendFileSync(this.appLogPath, line + '\n', 'utf-8');
    } catch { /* ignore */ }
  }

  getAppLogs(): string[] {
    return [...this.appLogBuffer];
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

      if (!portFree) {
        if (managed?.pid) {
          if (await this.isServiceReachable(service)) {
            rt.status = 'running';
            rt.pid = managed.pid;
            rt.error = undefined;
            rt.stoppedAt = undefined;
            this.runtimes.set(serviceId, rt);
            return rt;
          }
        } else {
          const other = this.findOtherServiceWithPort(serviceId, service.port);
          if (other) {
            rt.error = `端口 ${service.port} 被服务 "${other.name}" (${other.id}) 占用`;
          } else {
            rt.error = `端口 ${service.port} 已被其他进程占用`;
          }
        }
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
    return this.withLock(serviceId, async () => {
      return this._startService(serviceId);
    });
  }

  private async _startService(serviceId: string): Promise<void> {
    const service = this.store.get(serviceId);
    if (!service) throw new Error(`服务 "${serviceId}" 不存在`);

    if (!service.enabled) throw new Error(`服务 "${service.name}" 已禁用`);

    this.appendServiceLog(serviceId, `[LIFECYCLE] 准备启动服务 "${service.name}"`);

    const rt = this.getRuntime(serviceId);
    if (rt.status === 'running' || rt.status === 'starting') {
      return;
    }

    if (service.port) {
      const other = this.findOtherServiceWithPort(serviceId, service.port);
      if (other) {
        this.appendServiceLog(serviceId, `[LIFECYCLE] 端口冲突: ${service.port} 已被服务 "${other.name}" 占用`);
        throw new Error(
          `端口 ${service.port} 已被启用服务 "${other.name}" (${other.id}) 占用，无法启动 "${service.name}"`,
        );
      }
    }

    if (service.dependsOn.length > 0) {
      await this.startDependencies(service);
    }

    if (service.port) {
      const portFree = await this.portChecker.isPortFree(service.port);
      if (!portFree) {
        if (await this.isServiceReachable(service)) {
          this.appendServiceLog(serviceId, `[LIFECYCLE] 端口 ${service.port} 已占用但服务可达，恢复为运行状态`);
          rt.status = 'running';
          rt.port = service.port;
          rt.portFree = false;
          rt.error = undefined;
          rt.stoppedAt = undefined;
          this.runtimes.set(serviceId, rt);
          return;
        }
        this.appendServiceLog(serviceId, `[LIFECYCLE] 启动失败: 端口 ${service.port} 已被占用`);
        throw new Error(`端口 ${service.port} 已被占用，无法启动 "${service.name}"`);
      }
      rt.portFree = true;
    }

    if (service.runMode === 'external-terminal') {
      this.appendServiceLog(serviceId, '[LIFECYCLE] 以外部终端模式启动');
      await this.startInTerminal(service);
      return;
    }

    this.appendServiceLog(serviceId, `[LIFECYCLE] 启动进程: ${service.command}`);
    await this.processManager.start(service.id, service.command, service.cwd, service.env);

    const mp = this.processManager.getProcess(service.id);
    this.appendServiceLog(serviceId, `[LIFECYCLE] 进程已启动, PID: ${mp?.pid ?? '未知'}`);

    if (service.healthCheckUrl) {
      const healthy = await this.healthChecker.waitForHealthy(service.healthCheckUrl);
      if (!healthy) {
        rt.status = 'error';
        rt.error = '健康检查超时';
        this.appendServiceLog(serviceId, '[LIFECYCLE] 健康检查超时');
        this.runtimes.set(serviceId, rt);
        throw new Error(rt.error);
      }
      this.appendServiceLog(serviceId, '[LIFECYCLE] 健康检查通过');
    }
  }

  async stopService(serviceId: string): Promise<void> {
    return this.withLock(serviceId, async () => {
      return this._stopService(serviceId);
    });
  }

  private async _stopService(serviceId: string): Promise<void> {
    const service = this.store.get(serviceId);
    if (!service) throw new Error(`服务 "${serviceId}" 不存在`);

    this.appendServiceLog(serviceId, `[LIFECYCLE] 准备停止服务 "${service.name}"`);

    const rt = this.getRuntime(serviceId);

    if (service.runMode === 'external-terminal') {
      this.appendServiceLog(serviceId, '[LIFECYCLE] 外部终端模式，标记为已停止');
      rt.status = 'stopped';
      rt.stoppedAt = Date.now();
      this.runtimes.set(serviceId, rt);
      return;
    }

    const managedProcess = this.processManager.getProcess(serviceId);
    if (managedProcess?.pid) {
      this.appendServiceLog(serviceId, `[LIFECYCLE] 通过进程树终止 PID ${managedProcess.pid}`);
      await this.processManager.stop(serviceId);
      if (service.port) {
        const portReleased = await this.waitForPortsFree([service.port]);
        this.appendServiceLog(serviceId, portReleased ? `[LIFECYCLE] 端口 ${service.port} 已释放` : `[LIFECYCLE] 端口 ${service.port} 释放等待超时`);
      }
      if (!this.processManager.getProcess(serviceId)) {
        rt.status = 'stopped';
        rt.stoppedAt = Date.now();
        rt.pid = undefined;
        rt.error = undefined;
        this.runtimes.set(serviceId, rt);
      }
      return;
    }

    if (service.port) {
      const portFree = await this.portChecker.isPortFree(service.port);
      if (!portFree) {
        this.appendServiceLog(serviceId, `[LIFECYCLE] 端口 ${service.port} 被占用，尝试识别并清理`);
        const pids = await this.portChecker.getPortPids(service.port);
        let terminated = false;

        for (const pid of pids) {
          const details = await this.portChecker.getProcessDetails(pid);
          if (!details) continue;

          const serviceCmdBase = service.command.split(' ')[0];
          const matchesCommand =
            details.command.includes(service.command) ||
            details.command.includes(serviceCmdBase);
          const matchesCwd =
            details.cwd &&
            service.cwd &&
            (details.cwd === service.cwd ||
              details.cwd.startsWith(service.cwd + '/') ||
              service.cwd.startsWith(details.cwd + '/'));

          if (matchesCommand || matchesCwd) {
            try {
              this.appendServiceLog(serviceId, `[LIFECYCLE] 终止匹配进程 PID ${pid}`);
              await this.portChecker.terminatePid(pid);
              terminated = true;
            } catch (err) {
              this.appendServiceLog(serviceId, `[LIFECYCLE] 终止 PID ${pid} 失败: ${err}`);
              console.error(`[ServiceManager] 终止 PID ${pid} 失败:`, err);
            }
          }
        }

        if (terminated) {
          await this.waitForPortsFree([service.port]);
          this.appendServiceLog(serviceId, '[LIFECYCLE] 端口已自动清理，标记为已停止');
          rt.status = 'stopped';
          rt.stoppedAt = Date.now();
          rt.pid = undefined;
          rt.error = undefined;
          this.runtimes.set(serviceId, rt);
          return;
        }

        const portStillOccupied = !(await this.portChecker.isPortFree(service.port));
        if (!portStillOccupied) {
          this.appendServiceLog(serviceId, '[LIFECYCLE] 端口已释放，标记为已停止');
          rt.status = 'stopped';
          rt.stoppedAt = Date.now();
          rt.pid = undefined;
          this.runtimes.set(serviceId, rt);
          return;
        }

        this.appendServiceLog(serviceId, `[LIFECYCLE] 停止失败: 端口 ${service.port} 被其他进程占用，拒绝自动终止`);
        rt.error =
          `无法停止 "${service.name}"：端口 ${service.port} 被其他进程占用，拒绝自动终止。请确认端口占用进程后手动处理。`;
        rt.status = 'running';
        this.runtimes.set(serviceId, rt);
        throw new Error(rt.error);
      }
    }

    this.appendServiceLog(serviceId, '[LIFECYCLE] 标记为已停止');
    rt.status = 'stopped';
    rt.stoppedAt = Date.now();
    rt.pid = undefined;
    this.runtimes.set(serviceId, rt);
  }

  async restartService(serviceId: string): Promise<void> {
    return this.withLock(serviceId, async () => {
      await this._stopService(serviceId);
      let rt = this.getRuntime(serviceId);
      while (rt.status === 'stopping') {
        await new Promise((r) => setTimeout(r, 200));
        rt = this.getRuntime(serviceId);
      }
      await this._startService(serviceId);
    });
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
    const memLogs = this.processManager.getLogs(serviceId);
    try {
      const logPath = path.join(this.logDir, `${serviceId}.log`);
      if (fs.existsSync(logPath)) {
        const content = fs.readFileSync(logPath, 'utf-8');
        const fileLines = content.trim().split('\n').filter(Boolean).map((l) => {
          const idx = l.indexOf('] ');
          return idx >= 0 ? l.slice(idx + 2) : l;
        });
        const merged = new Map<string, boolean>();
        const result: string[] = [];
        for (const line of [...fileLines.slice(-MAX_FILE_LOG_TAIL), ...memLogs]) {
          if (!merged.has(line)) {
            merged.set(line, true);
            result.push(line);
          }
        }
        return result;
      }
    } catch { /* ignore */ }
    return memLogs;
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

  private findOtherServiceWithPort(serviceId: string, port: number): DevService | undefined {
    return this.store.list().find(
      (s) => s.id !== serviceId && s.enabled && s.port === port,
    );
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
