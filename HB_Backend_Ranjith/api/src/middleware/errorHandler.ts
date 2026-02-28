import type { Context, ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { AppError, ValidationError, DatabaseError } from '../utils/errors';

interface ErrorResponse {
  success: false;
  errors: string[];
  code: string;
  stack?: string;
  [key: string]: unknown;
}

const isPrismaError = (error: unknown): boolean => {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as Record<string, unknown>).code === 'string' &&
    (error as any).code.startsWith('P')
  );
};

const handlePrismaError = (error: unknown): AppError => {
  const prismaError = error as { code: string; meta?: Record<string, unknown> };

  switch (prismaError.code) {
    case 'P2002':
      return new AppError('Unique constraint violation', 409, 'CONFLICT');
    case 'P2025':
      return new AppError('Record not found', 404, 'NOT_FOUND');
    case 'P2003':
      return new AppError('Foreign key constraint violation', 400, 'FOREIGN_KEY_ERROR');
    case 'P2014':
      return new AppError('Required relation violation', 400, 'RELATION_ERROR');
    default:
      return new DatabaseError(`Database error: ${prismaError.code}`);
  }
};

const normalizeError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof HTTPException) {
    return new AppError(error.message, error.status, 'HTTP_ERROR');
  }

  if (error instanceof ZodError) {
    const errorMessages: string[] = [];
    for (const issue of error.issues) {
      const path = issue.path.join('.');
      const message = path ? `${path}: ${issue.message}` : issue.message;
      errorMessages.push(message);
    }
    return new AppError(errorMessages.join(', '), 400, 'VALIDATION_ERROR');
  }

  if (error instanceof SyntaxError) {
    return new AppError('Invalid JSON', 400, 'PARSE_ERROR');
  }

  if (isPrismaError(error)) {
    return handlePrismaError(error);
  }

  if (error instanceof Error) {
    return new AppError(error.message, 500, 'INTERNAL_ERROR', false);
  }

  return new AppError('Unknown error occurred', 500, 'UNKNOWN_ERROR', false);
};

export const errorHandler: ErrorHandler = (error: unknown, c: Context) => {
  const normalizedError = normalizeError(error);
  const isDev = process.env.NODE_ENV === 'development';

  console.error(`[ERROR] ${normalizedError.code}: ${normalizedError.message}`);
  if (isDev && normalizedError.stack) {
    console.error(normalizedError.stack);
  }

  const response: ErrorResponse = {
    success: false,
    errors: [normalizedError.message],
    code: normalizedError.code,
  };

  if (normalizedError.meta && typeof normalizedError.meta === 'object') {
    Object.assign(response, normalizedError.meta);
  }

  if (isDev && normalizedError.stack) {
    response.stack = normalizedError.stack;
  }

  return c.json(
    response,
    normalizedError.statusCode as 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502
  );
};

export const notFoundHandler = (c: Context) => {
  return c.json(
    {
      success: false,
      errors: ['Route not found'],
      code: 'NOT_FOUND',
    },
    404
  );
};
