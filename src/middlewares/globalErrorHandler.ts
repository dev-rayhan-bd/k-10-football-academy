import { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { StatusCodes } from 'http-status-codes';
import handleZodError from '@/errors/handleZodError';
import handleValidationError from '@/errors/handleValidationError';
import handleCastError from '@/errors/handleCastError';
import handleDuplicateError from '@/errors/handleDuplicateError';
import { AppError } from '@/utils/AppError';
import { TErrorSources } from '@/interfaces/error';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';

export const globalErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR;
  let message = 'Something went wrong!';
  let errorSources: TErrorSources = [
    {
      path: '',
      message: 'Something went wrong!',
    },
  ];

  if (err instanceof ZodError) {
    const simplifiedError = handleZodError(err);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;
  } else if (err?.name === 'ValidationError') {
    const simplifiedError = handleValidationError(err);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;
  } else if (err?.name === 'CastError') {
    const simplifiedError = handleCastError(err);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;
  } else if (err?.code === 11000) {
    const simplifiedError = handleDuplicateError(err);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorSources = simplifiedError.errorSources;
  } else if (
    (err as any)?.type === 'entity.parse.failed' ||
    ((err as any)?.status === 400 && err instanceof SyntaxError)
  ) {
    statusCode = StatusCodes.BAD_REQUEST;
    message =
      'Invalid JSON in request body. Standard JSON does not support comments (//). Please provide valid JSON like {} or select Body -> none.';
    errorSources = [
      {
        path: '',
        message: err.message,
      },
    ];
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errorSources = [
      {
        path: '',
        message: err.message,
      },
    ];
  } else if (err instanceof Error) {
    message = err.message;
    errorSources = [
      {
        path: '',
        message: err.message,
      },
    ];
  }

  // Log error
  if (statusCode >= 500) {
    logger.error({ err, message }, 'Unhandled Server Error');
  } else {
    logger.warn({ statusCode, message, errorSources }, 'Client Operational Error');
  }

  res.status(statusCode).json({
    success: false,
    message,
    errorSources,
    err,
    stack: env.NODE_ENV === 'development' ? err?.stack : null,
  });
};

export default globalErrorHandler;
