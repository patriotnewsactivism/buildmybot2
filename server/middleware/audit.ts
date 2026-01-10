import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AuditService } from '../services/AuditService';

const auditService = new AuditService();

export function auditLog(action?: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return next();
      }

      const auditAction =
        action || `${req.method.toLowerCase()}.${req.path.split('/')[2]}`;
      const ipAddress = req.ip || req.socket.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';

      const originalSend = res.send.bind(res);

      res.send = (body: any): Response => {
        auditService
          .log({
            userId: (req as any).actor?.id || user.id,
            organizationId: (req as any).organization?.id,
            action: auditAction,
            resourceType: req.params.id ? req.path.split('/')[2] : undefined,
            resourceId: req.params.id || req.params.botId || req.params.leadId,
            oldValues:
              req.method === 'PUT' || req.method === 'DELETE'
                ? req.body
                : undefined,
            newValues:
              req.method === 'POST' || req.method === 'PUT'
                ? {
                    data: body,
                    impersonatedUserId: (req as any).impersonation
                      ?.targetUserId,
                  }
                : undefined,
            ipAddress,
            userAgent,
          })
          .catch((err) => console.error('Audit log error:', err));

        return originalSend(body);
      };

      next();
    } catch (error) {
      console.error('Audit middleware error:', error);
      next();
    }
  };
}

export function auditSensitiveAction(actionName: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return next();
      }

      await auditService.log({
        userId: (req as any).actor?.id || user.id,
        organizationId: (req as any).organization?.id,
        action: `sensitive.${actionName}`,
        resourceType: 'system',
        oldValues: { path: req.path, method: req.method },
        newValues: {
          query: req.query,
          params: req.params,
          impersonatedUserId: (req as any).impersonation?.targetUserId,
        },
        ipAddress: req.ip || req.socket.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
      });

      next();
    } catch (error) {
      console.error('Sensitive action audit error:', error);
      next();
    }
  };
}
