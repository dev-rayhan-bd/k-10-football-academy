import { TErrorSources } from '@/interfaces/error';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly status: string;
  public readonly isOperational: boolean;
  public readonly errorSources?: TErrorSources;

  constructor(
    statusCode: number,
    message: string,
    isOperational = true,
    stack = '',
    errorSources?: TErrorSources,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = isOperational;
    if (errorSources) {
      this.errorSources = errorSources;
    }

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
