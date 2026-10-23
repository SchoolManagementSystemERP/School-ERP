import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

/** Every error leaves the API as `{ code, message, details? }`. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Some fields are missing or invalid.',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ code: 'CONFLICT', message: 'A record with these values already exists.', details: err.meta?.target });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Record not found.' });
      return;
    }
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ code: 'BAD_JSON', message: 'Request body is not valid JSON.' });
    return;
  }
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ code: 'INTERNAL', message: 'Something went wrong. Please try again.' });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ code: 'NOT_FOUND', message: `No route ${req.method} ${req.path}` });
}
