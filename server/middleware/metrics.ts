import type { NextFunction, Request, Response } from 'express';
import { systemMetricsService } from '../services/SystemMetricsService';

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();

  res.on('finish', () => {
    systemMetricsService.recordRequest({
      timestamp: Date.now(),
      status: res.statusCode,
      durationMs: Date.now() - start,
      userId: (req as any).user?.id ?? (req as any).actor?.id,
    });
  });

  next();
}
