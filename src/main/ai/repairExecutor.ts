import { exec } from 'child_process';
import { promisify } from 'util';
import { RepairAction } from '../shared/types';
import { ServiceManager } from '../services/serviceManager';

const execAsync = promisify(exec);

export class RepairExecutor {
  constructor(private serviceManager: ServiceManager) {}

  async execute(action: RepairAction): Promise<{ success: boolean; output: string }> {
    switch (action.type) {
      case 'run-command':
        return this.runCommand(action);
      case 'open-file':
        return this.openFile(action);
      case 'restart-service':
        return this.restartService(action);
      case 'edit-file':
        return this.editFile(action);
      default:
        return { success: false, output: '未知的修复动作类型' };
    }
  }

  private async runCommand(action: RepairAction): Promise<{ success: boolean; output: string }> {
    if (!action.command) {
      return { success: false, output: '修复动作缺少命令' };
    }

    const dangerous = [
      'rm -rf',
      'git reset --hard',
      'DROP',
      'DELETE FROM',
      'truncate',
      ':(){ :|:& };:',
      'mkfs.',
      'dd if=',
    ];

    if (dangerous.some((d) => action.command!.toLowerCase().includes(d.toLowerCase()))) {
      return { success: false, output: '高风险命令被拒绝执行' };
    }

    try {
      const cwd = action.cwd || process.cwd();
      const { stdout, stderr } = await execAsync(action.command, {
        cwd,
        timeout: 60000,
        env: { ...process.env },
      });
      return { success: true, output: stdout + (stderr ? '\n[STDERR]\n' + stderr : '') };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: message };
    }
  }

  private async openFile(action: RepairAction): Promise<{ success: boolean; output: string }> {
    if (!action.filePath) {
      return { success: false, output: '修复动作缺少文件路径' };
    }

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
      output: `文件编辑需要用户手动操作。\n文件: ${action.filePath || '未指定'}\n补丁预览:\n${action.patchPreview || '无'}`,
    };
  }
}
