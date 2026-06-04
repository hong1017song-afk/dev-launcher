import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { TokenInfo } from '../shared/types';

export class TokenStore {
  private filePath: string;
  private token: TokenInfo | null = null;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'token.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.token && parsed.createdAt) {
          this.token = parsed;
        }
      }
    } catch (err) {
      console.error('[TokenStore] 加载 Token 失败:', err);
    }
    if (!this.token) {
      this.token = {
        token: uuidv4(),
        createdAt: Date.now(),
      };
      this.save();
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.token, null, 2), 'utf-8');
    } catch (err) {
      console.error('[TokenStore] 保存 Token 失败:', err);
    }
  }

  getToken(): string {
    return this.token!.token;
  }

  getTokenInfo(): TokenInfo {
    return { ...this.token! };
  }

  regenerate(): string {
    this.token = {
      token: uuidv4(),
      createdAt: Date.now(),
    };
    this.save();
    return this.token.token;
  }
}
