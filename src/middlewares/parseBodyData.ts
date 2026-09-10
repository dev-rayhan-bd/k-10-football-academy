import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to parse JSON string inside req.body.data into req.body object.
 * Useful when receiving form-data where all JSON text fields are passed inside key 'data'.
 */
export const parseBodyData = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body && req.body.data) {
    try {
      const parsedData =
        typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
      req.body = { ...parsedData, ...req.body };
      delete req.body.data;
    } catch {
      // If parsing fails, proceed and let Zod/validator handle validation error
    }
  }
  next();
};
