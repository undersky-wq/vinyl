import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';

export function configureHttpSecurity(app: INestApplication, env = process.env) {
  const server = app.getHttpAdapter().getInstance();
  // Production binds backend to loopback; nginx appends the actual client IP.
  // Trust only that last proxy hop, never the leftmost user-supplied XFF value.
  server.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);
  server.disable('x-powered-by');
  const origins = new Set([
    new URL(env.APP_URL || 'http://localhost:3000').origin,
    ...(env.CORS_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
  ]);
  if (origins.has('https://mityadima.ru')) origins.add('https://www.mityadima.ru');

  app.use((request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
    if (env.NODE_ENV === 'production') response.setHeader('Strict-Transport-Security', 'max-age=15552000');
    if (request.path.startsWith('/api/auth/')) response.setHeader('Cache-Control', 'no-store');
    // CORS alone does not stop cross-origin form submissions. Reject mutations
    // with an untrusted Origin, while retaining native clients without Origin.
    const origin = request.headers.origin;
    if (origin && !origins.has(origin) && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      response.status(403).json({ statusCode: 403, message: 'Origin not allowed' });
      return;
    }
    next();
  });
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow: boolean) => void) =>
      callback(null, !origin || origins.has(origin)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  const message = { statusCode: 429, message: 'Too many attempts. Please try again later.' };
  app.use('/api/auth/2fa', rateLimit({
    windowMs: 15 * 60 * 1000, limit: 20,
    skip: request => request.method !== 'POST',
    standardHeaders: 'draft-8', legacyHeaders: false, message,
  }));
  app.use('/api/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    skipSuccessfulRequests: true,
    skip: request => request.method !== 'POST',
    standardHeaders: 'draft-8', legacyHeaders: false, message,
  }));
  app.use('/api/auth/register', rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    skip: request => request.method !== 'POST',
    standardHeaders: 'draft-8', legacyHeaders: false, message,
  }));
}
