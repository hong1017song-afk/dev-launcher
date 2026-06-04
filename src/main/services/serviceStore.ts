import * as fs from 'fs';
import * as path from 'path';
import { DevService } from '../shared/types';
import { devServiceSchema } from '../shared/schema';

export class ServiceStore {
  private filePath: string;
  private services: DevService[] = [];

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'config.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.services = parsed
            .map((s: unknown) => {
              const result = devServiceSchema.safeParse(s);
              return result.success ? result.data : null;
            })
            .filter((s): s is DevService => s !== null);
        }
      }
    } catch (err) {
      console.error('[ServiceStore] 加载配置失败:', err);
      this.backupAndReset();
    }
  }

  private backupAndReset(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.copyFileSync(this.filePath, this.filePath + '.bak');
      }
    } catch { /* ignore */ }
    this.services = [];
    this.save();
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.services, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ServiceStore] 保存配置失败:', err);
    }
  }

  list(): DevService[] {
    return [...this.services];
  }

  get(id: string): DevService | undefined {
    return this.services.find((s) => s.id === id);
  }

  create(service: DevService): DevService {
    if (this.services.find((s) => s.id === service.id)) {
      throw new Error(`服务 ID "${service.id}" 已存在`);
    }
    const parsed = devServiceSchema.parse(service);
    this.services.push(parsed);
    this.save();
    return parsed;
  }

  update(id: string, updates: Partial<DevService>): DevService {
    const index = this.services.findIndex((s) => s.id === id);
    if (index === -1) {
      throw new Error(`服务 ID "${id}" 不存在`);
    }
    const existing = this.services[index];
    const merged = { ...existing, ...updates, id: existing.id };
    const parsed = devServiceSchema.parse(merged);
    this.services[index] = parsed;
    this.save();
    return parsed;
  }

  delete(id: string): void {
    const index = this.services.findIndex((s) => s.id === id);
    if (index === -1) {
      throw new Error(`服务 ID "${id}" 不存在`);
    }
    this.services.splice(index, 1);
    this.save();
  }

  upsert(service: DevService): DevService {
    const parsed = devServiceSchema.parse(service);
    const index = this.services.findIndex((s) => s.id === parsed.id);
    if (index === -1) {
      this.services.push(parsed);
    } else {
      this.services[index] = parsed;
    }
    this.save();
    return parsed;
  }

  getFilePath(): string {
    return this.filePath;
  }
}
