import * as fs from 'fs';
import * as path from 'path';
import { DevService } from '../shared/types';
import { devServiceSchema, serviceRegistrationFileSchema } from '../shared/schema';
import { ServiceStore } from './serviceStore';

export class Registration {
  constructor(private store: ServiceStore) {}

  registerFromFile(filePath: string): { id: string; name: string; action: 'created' | 'updated'; previousSource?: string } {
    const resolved = path.resolve(filePath);

    if (!fs.existsSync(resolved)) {
      throw new Error(`声明文件不存在: ${resolved}`);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    } catch (err) {
      throw new Error(`声明文件 JSON 解析失败: ${(err as Error).message}`);
    }

    const parsed = serviceRegistrationFileSchema.parse(raw);
    const existing = this.store.get(parsed.id);

    const service: DevService = {
      ...parsed,
      source: 'agent',
      env: parsed.env || {},
      dependsOn: parsed.dependsOn || [],
      tags: parsed.tags || [],
    };

    const validated = devServiceSchema.parse(service);

    if (existing) {
      this.store.update(parsed.id, validated);
      return { id: parsed.id, name: parsed.name, action: 'updated', previousSource: existing.source };
    } else {
      this.store.create(validated);
      return { id: parsed.id, name: parsed.name, action: 'created' };
    }
  }

  validateFile(filePath: string): { valid: boolean; errors: string[] } {
    const resolved = path.resolve(filePath);

    if (!fs.existsSync(resolved)) {
      return { valid: false, errors: [`声明文件不存在: ${resolved}`] };
    }

    try {
      const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
      const result = serviceRegistrationFileSchema.safeParse(raw);
      if (result.success) {
        return { valid: true, errors: [] };
      } else {
        return {
          valid: false,
          errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
        };
      }
    } catch (err) {
      return { valid: false, errors: [`解析失败: ${(err as Error).message}`] };
    }
  }
}
