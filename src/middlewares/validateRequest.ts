import { Request, Response, NextFunction } from 'express';
import { AnyZodObject } from 'zod';
import { catchAsync } from '@/utils/catchAsync';
import { AppError } from '@/utils/AppError';
import { StatusCodes } from 'http-status-codes';

export const validateRequest = (schema: AnyZodObject) => {
  return catchAsync(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (req.body && req.body.data) {
      if (typeof req.body.data === 'string') {
        try {
          const parsedData = JSON.parse(req.body.data);
          req.body = { ...req.body, ...parsedData };
          delete req.body.data;
        } catch {
          try {
            // Auto-heal trailing commas in JSON text (e.g. `{"role": "PARENT",}`)
            const cleaned = req.body.data.replace(/,\s*([}\]])/g, '$1');
            const parsedData = JSON.parse(cleaned);
            req.body = { ...req.body, ...parsedData };
            delete req.body.data;
          } catch {
            throw new AppError(
              StatusCodes.BAD_REQUEST,
              "Invalid JSON syntax in 'data' field. Please verify quotation marks and remove extra commas.",
            );
          }
        }
      } else if (typeof req.body.data === 'object') {
        req.body = { ...req.body, ...req.body.data };
        delete req.body.data;
      }
    }

    const parsed = await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
      cookies: req.cookies,
    });

    if (parsed.body) req.body = parsed.body;
    if (parsed.query) req.query = parsed.query;
    if (parsed.params) req.params = parsed.params;

    next();
  });
};
