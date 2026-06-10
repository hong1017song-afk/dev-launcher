import { exec } from 'child_process';
import { promisify } from 'util';
import { RepairAction } from '../shared/types';
import { ServiceManager } from '../services/serviceManager';
import { buildShellEnv } from '../services/shellEnv';
import * as path from 'path';

const execAsync = promisify(exec);

const DANGEROUS_COMMANDS = [
  'rm -rf', 'rm -r', 'git reset --hard', 'git push --force',
  'DROP ', 'DELETE FROM', 'truncate', ':(){ :|:& };:', 'mkfs.',
  'dd if=', '> /dev/', 'chmod 777', 'sudo ', 'shutdown', 'reboot',
  'format ', 'fdisk', 'wget ', 'curl.*|.*sh',
];

function isCommandDangerous(command: string): boolean {
  const lower = command.toLowerCase();
  return DANGEROUS_COMMANDS.some((p) => lower.includes(p.toLowerCase()));
}

function isCwdSafe(cwd: string | undefined, serviceCwd: string): boolean {
  if (!cwd) return false;
  const resolved = cwd.replace(/\/$/, '');
  const serviceResolved = serviceCwd.replace(/\/$/, '');
  return resolved === serviceResolved || resolved.startsWith(serviceResolved + '/');
}

export class RepairExecutor {
  constructor(private serviceManager: ServiceManager) {}

  async execute(action: RepairAction, serviceCwd: string): Promise<{ success: boolean; output: string; durationMs?: number }> {
    const startedAt = Date.now();
    let result: { success: boolean; output: string };

    switch (action.type) {
      case 'run-command': result = await this.runCommand(action, serviceCwd); break;
      case 'open-file': result = await this.openFile(action); break;
      case 'restart-service': result = await this.restartService(action); break;
      case 'edit-file': result = await this.editFile(action); break;
      default: result = { success: false, output: '未知的修复动作类型' };
    }

    return { ...result, durationMs: Date.now() - startedAt };
  }

  private async runCommand(action: RepairAction, serviceCwd: string): Promise<{ success: boolean; output: string }> {
    if (!action.command) return { success: false, output: '修复动作缺少命令' };

    if (isCommandDangerous(action.command)) {
      return { success: false, output: '高风险命令被拒绝执行' };
    }

    const cwd = action.cwd || serviceCwd;
    if (!isCwdSafe(cwd, serviceCwd)) {
      return { success: false, output: `工作目录不在服务目录内，拒绝执行。\n请求目录: ${cwd}\n服务目录: ${serviceCwd}` };
    }

    try {
      const { stdout, stderr } = await execAsync(action.command, {
        cwd,
        timeout: 60000,
        env: buildShellEnv(),
      });
      const outputParts = [stdout.trim()];
      if (stderr.trim()) outputParts.push('[STDERR]\n' + stderr.trim());
      return { success: true, output: outputParts.filter(Boolean).join('\n') || '(无输出)' };
    } catch (err: unknown) {
      const execErr = err as { message?: string; stdout?: string; stderr?: string; code?: number };
      const parts = [`命令执行失败 (退出码: ${execErr.code ?? '未知'})`];
      if (execErr.stdout?.trim()) parts.push('[STDOUT]\n' + execErr.stdout.trim());
      if (execErr.stderr?.trim()) parts.push('[STDERR]\n' + execErr.stderr.trim());
      if (!execErr.stdout?.trim() && !execErr.stderr?.trim()) parts.push(execErr.message || String(err));
      return { success: false, output: parts.join('\n') };
    }
  }

  private async openFile(action: RepairAction): Promise<{ success: boolean; output: string }> {
    if (!action.filePath) return { success: false, output: '修复动作缺少文件路径' };
    try {
      const cmd = process.platform === 'darwin'
        ? `open "${action.filePath}"`
        : process.platform === 'win32'
          ? `start "" "${action.filePath}"`
          : `xdg-open "${action.filePath}"`;
      await execAsync(cmd);
      return { success: true, output: `已打开文件: ${action.filePath}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: message };
    }
  }

  private async restartService(action: RepairAction): Promise<{ success: boolean; output: string }> {
    try {
      await this.serviceManager.restartService(action.serviceId);
      return { success: true, output: `服务 ${action.serviceId} 已重启` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: message };
    }
  }

  private async editFile(action: RepairAction): Promise<{ success: boolean; output: string }> {
    return {
      success: false,
      output: `文件编辑需要用户手动操作。\n文件: ${action.filePath || '未指定'}\n补丁预览:\n${action.patchPreview || '(无)'}`,
    };
  }
}
