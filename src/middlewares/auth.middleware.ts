import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { catchAsync } from '@/utils/catchAsync';
import { env } from '@/config/env';
import { UserRole } from '@/modules/user/user.interface';
import { UserModel } from '@/modules/user/user.model';
import { redisClient } from '@/config/redis';

export interface IJwtPayload extends JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: IJwtPayload;
    }
  }
}

export const auth = (...requiredRoles: UserRole[]) => {
  return catchAsync(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Authentication token missing or invalid');
    }

    const token = authHeader.split(' ')[1];

    // Check Redis Blacklist (Instant Logout verification)
    const isBlacklisted = await redisClient.get(`BL_${token}`);
    if (isBlacklisted) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        'Token has been revoked/logged out. Please log in again.',
      );
    }

    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as IJwtPayload;

      const user = await UserModel.findById(decoded.userId);
      if (!user) {
        throw new AppError(
          StatusCodes.UNAUTHORIZED,
          'User associated with this token no longer exists',
        );
      }

      if (user.status === 'BLOCKED' || user.status === 'INACTIVE') {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          `User account is currently ${user.status.toLowerCase()}`,
        );
      }

      if (requiredRoles.length > 0 && !requiredRoles.includes(decoded.role)) {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          'You do not have permission to access this resource',
        );
      }

      req.user = decoded;
      next();
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid or expired authentication token');
    }
  });
};
