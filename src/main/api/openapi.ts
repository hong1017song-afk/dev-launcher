import { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';

export async function setupOpenAPI(app: FastifyInstance): Promise<void> {
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Dev Launcher API',
        description: '本地开发服务启动器 REST API。所有接口 (除 /api/status 和 /api/openapi.json) 需要 Bearer token 鉴权。',
        version: '0.1.0',
      },
      servers: [{ url: 'http://127.0.0.1:19527' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'UUID',
            description: 'Bearer token，通过 GET /api/status 获取 (需要先认证后才能访问)',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  app.get('/api/openapi.json', async (_request, reply) => {
    return reply.send(app.swagger());
  });
}
