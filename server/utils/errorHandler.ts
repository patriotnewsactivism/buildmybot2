import type { Response } from 'express';
import logger from './logger';
import { Sentry } from './sentry';

export interface AppError {
  statusCode: number;
  message: string;
  code?: string;
  details?: unknown;
}

export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMIT: 'RATE_LIMIT',
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export const UserFriendlyMessages: Record<string, string> = {
  [ErrorCodes.VALIDATION_ERROR]: 'Please check your input and try again.',
  [ErrorCodes.AUTHENTICATION_ERROR]: 'Please log in to continue.',
  [ErrorCodes.AUTHORIZATION_ERROR]:
    'You do not have permission to perform this action.',
  [ErrorCodes.NOT_FOUND]: 'The requested resource was not found.',
  [ErrorCodes.RATE_LIMIT]:
    'Too many requests. Please wait a moment and try again.',
  [ErrorCodes.PAYMENT_REQUIRED]:
    'Please upgrade your plan to access this feature.',
  [ErrorCodes.EXTERNAL_SERVICE_ERROR]:
    'An external service is temporarily unavailable. Please try again later.',
  [ErrorCodes.DATABASE_ERROR]: 'A database error occurred. Please try again.',
  [ErrorCodes.INTERNAL_ERROR]: 'Something went wrong. Please try again later.',
};

export function createError(
  statusCode: number,
  message: string,
  code?: string,
  details?: unknown,
): AppError {
  return { statusCode, message, code, details };
}

export function handleError(
  res: Response,
  error: unknown,
  context?: string,
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(`Error${context ? ` in ${context}` : ''}: ${errorMessage}`, {
    error,
  });

  // Log to Sentry
  if (error instanceof Error) {
    Sentry.captureException(error, {
      extra: { context },
    });
  } else {
    Sentry.captureMessage(String(error), {
      level: 'error',
      extra: { context },
    });
  }

  if (isAppError(error)) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      ...(process.env.NODE_ENV === 'development' && error.details
        ? { details: error.details }
        : {}),
    });
    return;
  }

  if (error instanceof Error) {
    const statusCode = getStatusCodeFromError(error);
    const code = getErrorCodeFromError(error);
    const userMessage = UserFriendlyMessages[code] || error.message;

    res.status(statusCode).json({
      error: userMessage,
      code,
      ...(process.env.NODE_ENV === 'development' ? { stack: error.stack } : {}),
    });
    return;
  }

  res.status(500).json({
    error: UserFriendlyMessages[ErrorCodes.INTERNAL_ERROR],
    code: ErrorCodes.INTERNAL_ERROR,
  });
}

function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    'message' in error
  );
}

function getStatusCodeFromError(error: Error): number {
  const message = error.message.toLowerCase();

  if (
    message.includes('unauthorized') ||
    message.includes('not authenticated')
  ) {
    return 401;
  }
  if (
    message.includes('forbidden') ||
    message.includes('not authorized') ||
    message.includes('access denied')
  ) {
    return 403;
  }
  if (message.includes('not found')) {
    return 404;
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return 400;
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return 429;
  }
  if (message.includes('payment') || message.includes('subscription')) {
    return 402;
  }

  return 500;
}

function getErrorCodeFromError(error: Error): string {
  const message = error.message.toLowerCase();

  if (
    message.includes('unauthorized') ||
    message.includes('not authenticated')
  ) {
    return ErrorCodes.AUTHENTICATION_ERROR;
  }
  if (
    message.includes('forbidden') ||
    message.includes('not authorized') ||
    message.includes('access denied')
  ) {
    return ErrorCodes.AUTHORIZATION_ERROR;
  }
  if (message.includes('not found')) {
    return ErrorCodes.NOT_FOUND;
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return ErrorCodes.VALIDATION_ERROR;
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return ErrorCodes.RATE_LIMIT;
  }
  if (message.includes('payment') || message.includes('subscription')) {
    return ErrorCodes.PAYMENT_REQUIRED;
  }
  if (
    message.includes('database') ||
    message.includes('sql') ||
    message.includes('postgres')
  ) {
    return ErrorCodes.DATABASE_ERROR;
  }

  return ErrorCodes.INTERNAL_ERROR;
}

export const validationError = (message: string, details?: unknown): AppError =>
  createError(400, message, ErrorCodes.VALIDATION_ERROR, details);

export const authenticationError = (
  message = 'Authentication required',
): AppError => createError(401, message, ErrorCodes.AUTHENTICATION_ERROR);

export const authorizationError = (message = 'Access denied'): AppError =>
  createError(403, message, ErrorCodes.AUTHORIZATION_ERROR);

export const notFoundError = (resource = 'Resource'): AppError =>
  createError(404, `${resource} not found`, ErrorCodes.NOT_FOUND);

export const rateLimitError = (message = 'Rate limit exceeded'): AppError =>
  createError(429, message, ErrorCodes.RATE_LIMIT);

export const paymentRequiredError = (message = 'Upgrade required'): AppError =>
  createError(402, message, ErrorCodes.PAYMENT_REQUIRED);

export const externalServiceError = (service: string): AppError =>
  createError(
    503,
    `${service} is temporarily unavailable`,
    ErrorCodes.EXTERNAL_SERVICE_ERROR,
  );

export const databaseError = (message = 'Database error'): AppError =>
  createError(500, message, ErrorCodes.DATABASE_ERROR);

export const internalError = (message = 'Internal server error'): AppError =>
  createError(500, message, ErrorCodes.INTERNAL_ERROR);
