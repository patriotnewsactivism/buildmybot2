/**
 * Launch Gate Middleware
 *
 * Prevents new purchases / subscription checkouts until the platform owner
 * explicitly disables the gate by setting LAUNCH_GATE_ENABLED=false (or
 * removing the variable entirely).
 *
 * When active the middleware returns a friendly JSON response so the
 * frontend can show "Coming Soon" messaging instead of an error.
 */

import type { NextFunction, Request, Response } from 'express';
import { env } from '../env';

const parseEnvBool = (
  value: string | undefined,
  defaultValue = false,
): boolean => {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
};

/**
 * Returns true when the launch gate is active (purchases blocked).
 * Default: **true** — the gate is ON until you explicitly set
 * LAUNCH_GATE_ENABLED=false in the environment.
 */
export function isLaunchGateActive(): boolean {
  return parseEnvBool(env.LAUNCH_GATE_ENABLED, true);
}

/**
 * Express middleware – attach to any route that should be blocked
 * before launch (checkout, plan sync, etc.).
 */
export function requireLaunchGateOpen(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (isLaunchGateActive()) {
    return res.status(503).json({
      error: 'coming_soon',
      message:
        'BuildMyBot is launching soon! Purchases are not yet available. Stay tuned.',
    });
  }
  next();
}
