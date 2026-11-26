import type { ApiError, ApiErrorCode } from '@projectos/contracts';
import type { ErrorRequestHandler, Response } from 'express';
import { ApiFailure } from '../errors.ts';

const DB_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  '57P01',
  '57P02',
  '57P03',
  '57014',
  '42P01',
  '42501',
  '3F000',
]);

export function sendError(response: Response, status: number, code: ApiErrorCode, message: string) {
  const body: ApiError = {
    error: { code, message, request_id: String(response.getHeader('X-Request-ID')) },
  };
  response.status(status).json(body);
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(new Error('Request failed after the response started.'));
    return;
  }

  if (error instanceof ApiFailure) {
    sendError(response, error.status, error.code, error.message);
    return;
  }
  if (
    error instanceof Error &&
    (('code' in error &&
      typeof error.code === 'string' &&
      (error.code.startsWith('08') || DB_UNAVAILABLE_CODES.has(error.code))) ||
      /^(?:Query read timeout|Connection terminated|timeout exceeded when trying to connect)/i.test(
        error.message,
      ))
  ) {
    sendError(response, 503, 'SERVICE_UNAVAILABLE', 'Database unavailable.');
    return;
  }

  const status = error instanceof Error && 'status' in error ? error.status : undefined;
  switch (status) {
    case 400:
      sendError(response, 400, 'INVALID_INPUT', 'Invalid JSON body.');
      return;
    case 413:
      sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'JSON body exceeds 2 MiB.');
      return;
    case 415:
      sendError(response, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported JSON encoding.');
      return;
    default:
      sendError(response, 500, 'INTERNAL_ERROR', 'Internal server error.');
  }
};
