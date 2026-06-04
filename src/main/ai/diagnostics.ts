import * as fs from 'fs';
import * as path from 'path';
import { DevService, ServiceRuntime, DiagnoseResult, RepairAction } from '../shared/types';
import { getOpenAI, isInitialized, getModel } from './aiClient';
import { PortChecker } from '../services/portChecker';
import { HealthChecker } from '../services/healthChecker';

export class Diagnostics {
  constructor(
    private portChecker: PortChecker,
    private healthChecker: HealthChecker,
    private getLogs: (serviceId: string) => string[],
    private getRuntime: (serviceId: string) => ServiceRuntime,
  ) {}

  async diagnose(service: DevService): Promise<DiagnoseResult> {
    if (!isInitialized()) {
      throw new Error('AI 客户端未初始化，请先配置 OpenAI API Key');
    }

    const openai = getOpenAI();
    const runtime = this.getRuntime(service.id);
    const logs = this.getLogs(service.id);

    let portInfo = '';
    if (service.port) {
      const portFree = await this.portChecker.isPortFree(service.port);
      portInfo = `端口 ${service.port}: ${portFree ? '空闲' : '被占用'}`;
      if (!portFree) {
        const procs = await this.portChecker.getPortProcess(service.port);
        portInfo += `\n占用详情:\n${procs.join('\n')}`;
      }
    }

    let healthInfo = '';
    if (service.healthCheckUrl) {
      const healthy = await this.healthChecker.check(service.healthCheckUrl);
      healthInfo = `健康检查 (${service.healthCheckUrl}): ${healthy ? '通过' : '失败'}`;
    }

    const projectFiles = this.readRelevantFiles(service.cwd);
    const contextParts = [
      `## 服务配置`,
      `名称: ${service.name}`,
      `ID: ${service.id}`,
      `类型: ${service.kind}`,
      `工作目录: ${service.cwd}`,
      `命令: ${service.command}`,
      `运行模式: ${service.runMode === 'managed-process' ? '托管进程' : '外部终端'}`,
      portInfo,
      healthInfo,
      '',
      `## 当前状态`,
      `状态: ${runtime.status}`,
      runtime.error ? `错误: ${runtime.error}` : '',
      runtime.pid ? `PID: ${runtime.pid}` : '',
      '',
      `## 最近日志 (最近100行)`,
      logs.slice(-100).join('\n') || '(无日志)',
      '',
      `## 项目文件`,
      ...projectFiles.map((f) => `### ${f.name}\n${f.content}`),
    ].filter(Boolean).join('\n');

    const response = await openai.chat.completions.create({
      model: getModel(),
      messages: [
        {
          role: 'system',
          content: `你是一个开发服务诊断专家。分析服务的配置、状态和日志，诊断问题并提供修复建议。

返回 JSON 格式:
{
  "issues": ["问题1", "问题2"],
  "possibleCauses": ["可能原因1"],
  "suggestions": ["建议1", "建议2"],
  "repairActions": [
    {
      "type": "run-command | edit-file | open-file | restart-service",
      "title": "修复标题",
      "explanation": "详细解释",
      "command": "命令行 (type=run-command 时)",
      "cwd": "工作目录",
      "filePath": "文件路径 (type=edit-file 或 open-file 时)",
      "patchPreview": "补丁预览 (type=edit-file 时)",
      "risk": "low | medium | high"
    }
  ]
}

规则:
- 只建议低风险修复动作 (npm install, pnpm install, pip install, 文件编辑预览, 重启)
- 高风险操作只能作为建议文本，不生成修复动作
- 如果没有发现明确问题，issues 可以为空
- 命令必须使用安全、常见的包管理器命令`,
        },
        { role: 'user', content: contextParts },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    let parsed: {
      issues?: string[];
      possibleCauses?: string[];
      suggestions?: string[];
      repairActions?: RepairAction[];
    };

    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    return {
      serviceId: service.id,
      timestamp: Date.now(),
      status: runtime.status,
      issues: parsed.issues || [],
      possibleCauses: parsed.possibleCauses || [],
      suggestions: parsed.suggestions || [],
      repairActions: (parsed.repairActions || []).map((a, i) => ({
        ...a,
        id: `repair-${service.id}-${Date.now()}-${i}`,
        serviceId: service.id,
      })),
      rawResponse: content,
    };
  }

  private readRelevantFiles(cwd: string): { name: string; content: string }[] {
    const files: { name: string; content: string }[] = [];
    const candidates = [
      'package.json',
      'README.md',
      'README',
      '.env.example',
      'docker-compose.yml',
      'docker-compose.yaml',
      'requirements.txt',
      'Cargo.toml',
      'Makefile',
    ];

    for (const name of candidates) {
      const fullPath = path.join(cwd, name);
      try {
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          files.push({ name, content: content.slice(0, 3000) });
        }
      } catch { /* ignore */ }
    }

    return files;
  }
}
