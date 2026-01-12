import type { NextFunction, Request, Response } from 'express';
import { systemMetricsService } from '../services/SystemMetricsService';

interface MetricsRequest extends Request {
  user?: { id?: string };
  actor?: { id?: string };
}

export function metricsMiddleware(
  req: MetricsRequest,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();

  res.on('finish', () => {
    systemMetricsService.recordRequest({
      timestamp: Date.now(),
      status: res.statusCode,
      durationMs: Date.now() - start,
      userId: req.user?.id ?? req.actor?.id,
    });
  });

  next();
}
