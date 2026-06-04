import { ChildProcess, spawn } from 'child_process';
import treeKill from 'tree-kill';
import { LogBuffer } from './logBuffer';
import { ServiceStatus } from '../shared/types';

export interface ManagedProcess {
  serviceId: string;
  status: ServiceStatus;
  process?: ChildProcess;
  pid?: number;
  logBuffer: LogBuffer;
  startedAt?: number;
  stoppedAt?: number;
  error?: string;
}

export class ProcessManager {
  private processes: Map<string, ManagedProcess> = new Map();
  private statusCallbacks: Array<(serviceId: string, status: ServiceStatus) => void> = [];
  private logCallbacks: Array<(serviceId: string, line: string) => void> = [];

  setStatusChangeCallback(cb: (serviceId: string, status: ServiceStatus) => void): void {
    this.statusCallbacks.push(cb);
  }

  setLogCallback(cb: (serviceId: string, line: string) => void): void {
    this.logCallbacks.push(cb);
  }

  getProcess(serviceId: string): ManagedProcess | undefined {
    return this.processes.get(serviceId);
  }

  getAllProcesses(): Map<string, ManagedProcess> {
    return new Map(this.processes);
  }

  start(serviceId: string, command: string, cwd: string, env: Record<string, string>): void {
    const existing = this.processes.get(serviceId);
    if (existing && existing.status === 'running') {
      return;
    }

    const mp: ManagedProcess = {
      serviceId,
      status: 'starting',
      logBuffer: new LogBuffer(),
      startedAt: Date.now(),
    };

    this.processes.set(serviceId, mp);
    this.emitStatus(serviceId, 'starting');

    try {
      const childEnv = { ...process.env, ...env };
      const child = spawn(command, {
        cwd,
        shell: true,
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      mp.process = child;
      mp.pid = child.pid ?? undefined;

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        const lines = text.split('\n').filter(Boolean);
        for (const line of lines) {
          mp.logBuffer.append(line);
          this.emitLog(serviceId, line);
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        const lines = text.split('\n').filter(Boolean);
        for (const line of lines) {
          mp.logBuffer.append('[ERR] ' + line);
          this.emitLog(serviceId, '[ERR] ' + line);
        }
      });

      child.on('error', (err) => {
        mp.status = 'error';
        mp.error = err.message;
        mp.logBuffer.append('[ERROR] ' + err.message);
        this.emitStatus(serviceId, 'error');
      });

      child.on('exit', (code) => {
        mp.logBuffer.append(`[EXIT] 进程退出, 退出码: ${code ?? 'null'}`);
        mp.status = 'stopped';
        mp.stoppedAt = Date.now();
        mp.process = undefined;
        mp.pid = undefined;
        this.emitStatus(serviceId, 'stopped');
      });

      setTimeout(() => {
        if (mp.status === 'starting') {
          mp.status = 'running';
          this.emitStatus(serviceId, 'running');
        }
      }, 1000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      mp.status = 'error';
      mp.error = message;
      this.emitStatus(serviceId, 'error');
    }
  }

  async stop(serviceId: string): Promise<void> {
    const mp = this.processes.get(serviceId);
    if (!mp || mp.status === 'stopped') return;

    mp.status = 'stopping';
    this.emitStatus(serviceId, 'stopping');

    const killPid = mp.pid;

    if (killPid) {
      return new Promise((resolve) => {
        treeKill(killPid, 'SIGTERM', (err) => {
          if (err) {
            console.error(`[ProcessManager] tree-kill 失败 (${serviceId}):`, err);
          }
          mp.status = 'stopped';
          mp.stoppedAt = Date.now();
          mp.process = undefined;
          mp.pid = undefined;
          this.emitStatus(serviceId, 'stopped');
          resolve();
        });
      });
    }
  }

  getLogs(serviceId: string): string[] {
    const mp = this.processes.get(serviceId);
    return mp ? mp.logBuffer.getAll() : [];
  }

  private emitStatus(serviceId: string, status: ServiceStatus): void {
    for (const cb of this.statusCallbacks) {
      cb(serviceId, status);
    }
  }

  private emitLog(serviceId: string, line: string): void {
    for (const cb of this.logCallbacks) {
      cb(serviceId, line);
    }
  }
}
