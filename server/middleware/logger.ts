import type { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, url } = req;
    const { statusCode } = res;

    const message = `${method} ${url} ${statusCode} ${duration}ms`;

    if (statusCode >= 500) {
      logger.error(message);
    } else if (statusCode >= 400) {
      logger.warn(message);
    } else {
      logger.http(message);
    }
  });

  next();
}
