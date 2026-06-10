import { exec } from 'child_process';
import { promisify } from 'util';
import treeKill from 'tree-kill';

const execAsync = promisify(exec);

function treeKillAsync(pid: number, signal?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal) {
      treeKill(pid, signal, (err) => (err ? reject(err) : resolve()));
    } else {
      treeKill(pid, (err) => (err ? reject(err) : resolve()));
    }
  });
}

export class PortChecker {
  async isPortFree(port: number): Promise<boolean> {
    try {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        const { stdout } = await execAsync(`lsof -tiTCP:${port} -sTCP:LISTEN`);
        return !stdout.trim();
      } else if (process.platform === 'win32') {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        return !stdout.trim();
      }
      return true;
    } catch {
      return true;
    }
  }

  async getPortProcess(port: number): Promise<string[]> {
    try {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        const { stdout } = await execAsync(`lsof -nP -iTCP:${port} -sTCP:LISTEN`);
        return stdout.trim().split('\n').filter(Boolean);
      } else if (process.platform === 'win32') {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        return stdout.trim().split('\n').filter(Boolean);
      }
      return [];
    } catch {
      return [];
    }
  }

  async getPortPids(port: number): Promise<number[]> {
    try {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        const { stdout } = await execAsync(`lsof -tiTCP:${port} -sTCP:LISTEN`);
        return stdout
          .trim()
          .split('\n')
          .map((pid) => Number(pid.trim()))
          .filter((pid) => Number.isInteger(pid) && pid > 0);
      } else if (process.platform === 'win32') {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        const pids = stdout
          .trim()
          .split('\n')
          .map((line) => Number(line.trim().split(/\s+/).pop()))
          .filter((pid) => Number.isInteger(pid) && pid > 0);
        return Array.from(new Set(pids));
      }
      return [];
    } catch {
      return [];
    }
  }

  async terminatePid(pid: number): Promise<void> {
    try {
      if (process.platform === 'win32') {
        await execAsync(`taskkill /PID ${pid} /T /F`);
      } else {
        await treeKillAsync(pid, 'SIGTERM');
      }
    } catch {
      // The process may already have exited.
    }
  }

  async terminatePort(port: number): Promise<void> {
    const pids = await this.getPortPids(port);
    for (const pid of pids) {
      await this.terminatePid(pid);
    }
  }

  async getProcessDetails(pid: number): Promise<{ command: string; cwd?: string } | null> {
    try {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        const { stdout: cmdOut } = await execAsync(`ps -p ${pid} -o args=`);
        const command = cmdOut.trim();
        if (!command) return null;

        let cwd: string | undefined;
        try {
          const { stdout: cwdOut } = await execAsync(`lsof -p ${pid} -a -d cwd -Fn`);
          const lines = cwdOut.split('\n');
          for (const line of lines) {
            if (line.startsWith('n')) {
              cwd = line.substring(1);
              break;
            }
          }
        } catch { /* cwd not available */ }

        return { command, cwd };
      }
      return null;
    } catch {
      return null;
    }
  }
}
