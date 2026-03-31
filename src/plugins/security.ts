import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';

interface SecurityOptions {
  rateLimitMax: number;
  rateLimitWindow: string;
  corsEnabled: boolean;
  corsOrigins: string[];
  corsMethods: string[];
  corsHeaders: string[];
  corsCredentials: boolean;
  corsMaxAgeSeconds: number;
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

function setCorsHeaders(request: FastifyRequest, reply: { header(name: string, value: string): unknown }, options: SecurityOptions): boolean {
  const originHeader = request.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

  if (!origin || !isOriginAllowed(origin, options.corsOrigins)) {
    return false;
  }

  const allowOrigin = options.corsOrigins.includes('*') && !options.corsCredentials ? '*' : origin;
  const requestHeaders = request.headers['access-control-request-headers'];

  reply.header('Access-Control-Allow-Origin', allowOrigin);
  reply.header('Access-Control-Allow-Methods', options.corsMethods.join(', '));
  reply.header(
    'Access-Control-Allow-Headers',
    typeof requestHeaders === 'string' && requestHeaders ? requestHeaders : options.corsHeaders.join(', ')
  );
  reply.header('Access-Control-Max-Age', String(options.corsMaxAgeSeconds));
  reply.header('Vary', 'Origin, Access-Control-Request-Headers');

  if (options.corsCredentials) {
    reply.header('Access-Control-Allow-Credentials', 'true');
  }

  return true;
}

export async function registerSecurity(app: FastifyInstance, options: SecurityOptions): Promise<void> {
  await app.register(helmet);
  await app.register(rateLimit, {
    max: options.rateLimitMax,
    timeWindow: options.rateLimitWindow
  });

  if (options.corsEnabled) {
    app.options('*', async (request, reply) => {
      const originHeader = request.headers.origin;
      const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

      if (!origin) {
        reply.code(204).send();
        return;
      }

      if (!setCorsHeaders(request, reply, options)) {
        reply.code(403).send({
          error: {
            code: 'CORS_FORBIDDEN',
            message: 'Origin is not allowed',
            status_code: 403
          },
          request_id: request.id
        });
        return;
      }

      reply.code(204).send();
    });

    app.addHook('onRequest', async (request, reply) => {
      const originHeader = request.headers.origin;
      const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

      if (request.method === 'OPTIONS') {
        return;
      }

      if (origin) {
        setCorsHeaders(request, reply, options);
      }
    });
  }
}
