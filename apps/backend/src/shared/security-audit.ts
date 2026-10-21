import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { isIP } from 'node:net';

type Actor = { id?: unknown; role?: unknown };
type AuditRequest = Request & { user?: Actor; securityAuditActor?: Actor; securityAuditAdmin?: boolean; securityAuditChallenge?: boolean };

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : undefined;
}

// Explicit allowlist only: never serialize requests, response bodies, cookies,
// credentials, query strings or headers other than the bounded User-Agent.
export function configureSecurityAudit(app: INestApplication, env = process.env) {
  const file = env.SECURITY_AUDIT_FILE;
  if (!file) {
    if (env.NODE_ENV === 'production') throw new Error('SECURITY_AUDIT_FILE must be configured');
    return;
  }
  if (!isAbsolute(file)) throw new Error('SECURITY_AUDIT_FILE must be an absolute path');
  let pending = Promise.resolve();
  app.use((request: AuditRequest, response: Response, next: NextFunction) => {
    const path = request.originalUrl.split('?')[0];
    const auth = request.method === 'POST' && /^\/api\/auth\/(login|register|logout|2fa\/(?:setup|confirm|disable|recovery))\/?$/.exec(path);
    const started = Date.now();
    if (auth && ['login', 'register'].includes(auth[1])) {
      const json = response.json;
      response.json = function(body: unknown) {
        if (body && typeof body === 'object' && 'code' in body && body.code === 'TWO_FACTOR_REQUIRED') request.securityAuditChallenge = true;
        if (response.statusCode < 400 && body && typeof body === 'object') {
          const actor = body as Actor;
          request.securityAuditActor = { id: actor.id, role: actor.role };
        }
        return json.call(this, body);
      };
    }
    response.once('finish', () => {
      if (!auth && !request.securityAuditAdmin) return;
      const actor = request.securityAuditActor || request.user;
      const event = {
        version: 1,
        time: new Date().toISOString(),
        action: auth ? `auth.${auth[1].replace(/\//g, '.')}` : 'admin.request',
        outcome: request.securityAuditChallenge ? 'challenge' : response.statusCode < 400 ? 'success' : 'failure',
        userId: clean(actor?.id, 100) || null,
        role: actor?.role === 'ADMIN' || actor?.role === 'USER' ? actor.role : null,
        ip: isIP(request.ip || '') ? request.ip : null,
        userAgent: clean(request.headers['user-agent'], 256) || null,
        method: request.method,
        path: clean(path, 512),
        status: response.statusCode,
        durationMs: Date.now() - started,
      };
      pending = pending.then(async () => {
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        await appendFile(file, `${JSON.stringify(event)}\n`, { mode: 0o600 });
      }).catch(() => {
        // Keep the site available, but make audit-storage failure visible.
        console.error('SECURITY_AUDIT_WRITE_FAILED');
      });
    });
    next();
  });
}
