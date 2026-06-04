import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { TokenStore } from '../services/tokenStore';

export class ApiServer {
  private app: FastifyInstance;
  private tokenStore: TokenStore;

  constructor(tokenStore: TokenStore) {
    this.tokenStore = tokenStore;
    this.app = Fastify({ logger: false });
  }

  async start(port: number = 19527): Promise<void> {
    await this.app.register(cors, { origin: false });
    this.setupAuth();

    await this.app.listen({ port, host: '127.0.0.1' });
    console.log(`[API] 本地 API 已启动: http://127.0.0.1:${port}`);
  }

  async stop(): Promise<void> {
    await this.app.close();
  }

  getApp(): FastifyInstance {
    return this.app;
  }

  getToken(): string {
    return this.tokenStore.getToken();
  }

  getTokenStore(): TokenStore {
    return this.tokenStore;
  }

  private setupAuth(): void {
    this.app.addHook('onRequest', async (request, reply) => {
      if (request.url === '/api/openapi.json' || request.url === '/api/status') {
        return;
      }

      const auth = request.headers.authorization;
      if (!auth || !auth.startsWith('Bearer ')) {
        reply.status(401).send({ success: false, error: '缺少 Bearer token' });
        return;
      }

      const token = auth.slice(7);
      if (token !== this.tokenStore.getToken()) {
        reply.status(403).send({ success: false, error: 'Token 无效' });
        return;
      }
    });
  }
}
