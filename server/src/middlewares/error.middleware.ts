import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { isPermitDomainError } from '../domain/permit';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (process.env.NODE_ENV !== 'test') {
    console.error('API Error:', err);
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: err.errors,
    });
  }

  if (isPermitDomainError(err)) {
    return res.status(err.httpStatus).json({
      error: err.code,
      message: err.message,
    });
  }

  if (err instanceof Error) {
    const status = (err as any).httpStatus || (err as any).status || 500;
    return res.status(status).json({
      error: (err as any).code || 'INTERNAL_SERVER_ERROR',
      message: err.message,
    });
  }

  return res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}
