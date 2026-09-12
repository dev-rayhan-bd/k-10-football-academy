import jwt from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';
import { IUser, IUserDocument, ILoginResponse, IRefreshTokenResponse } from './user.interface';
import { userRepository, UserRepository } from './user.repository';
import { AppError } from '@/utils/AppError';
import { env } from '@/config/env';
import { emailQueue } from '@/jobs/queues/email.queue';
import { redisClient } from '@/config/redis';
import { otpGenerator } from '@/utils/otpGenerator';
import {
  getOtpVerificationEmailTemplate,
  getResendOtpEmailTemplate,
  getPasswordResetEmailTemplate,
  getWelcomeEmailTemplate,
} from '@/utils/emailTemplates';

export class UserService {
  constructor(private readonly userRepo: UserRepository) {}

  async registerUser(userData: Partial<IUser>): Promise<IUserDocument> {
    const existingUser = await this.userRepo.findByEmail(userData.email!);
    if (existingUser) {
      throw new AppError(StatusCodes.CONFLICT, 'Email address is already registered');
    }

    const newUser = await this.userRepo.create(userData);

    // Generate 6-digit OTP
    const otp = otpGenerator.generate(6);

    // Save OTP to Redis with 5-minute expiration (300s)
    await redisClient.set(`OTP_${newUser.email}`, otp, 'EX', 300);

    // Queue OTP email via BullMQ with Professional HTML Template
    await emailQueue.add('send-otp-email', {
      to: newUser.email,
      subject: 'Verify your K10 Football Academy Account',
      body: getOtpVerificationEmailTemplate(newUser.name, otp),
    });

    return newUser;
  }

  async loginUser(email: string, candidatePassword: string): Promise<ILoginResponse> {
    const user = await this.userRepo.findByEmail(email, true);
    if (!user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid credentials');
    }

    const isMatch = await user.comparePassword(candidatePassword);
    if (!isMatch) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid credentials');
    }

    if (user.status === 'BLOCKED' || user.status === 'INACTIVE') {
      throw new AppError(StatusCodes.FORBIDDEN, `Account is ${user.status.toLowerCase()}`);
    }

    // Generate Access Token (Short-lived 15m)
    const accessToken = jwt.sign(
      { userId: user._id.toString(), email: user.email, role: user.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    );

    // Generate Refresh Token (Long-lived 30d)
    const refreshToken = jwt.sign(
      { userId: user._id.toString(), email: user.email, role: user.role },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    );

    const userObj = user.toObject() as unknown as IUser;

    return {
      user: userObj,
      accessToken,
      refreshToken,
    };
  }

  async verifyOtp(email: string, otp: string): Promise<boolean> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    if (user.isEmailVerified) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Email is already verified');
    }

    const cachedOtp = await redisClient.get(`OTP_${email}`);
    if (!cachedOtp) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'OTP has expired or does not exist');
    }

    if (cachedOtp !== otp) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid OTP code');
    }

    await this.userRepo.updateById(user._id.toString(), { isEmailVerified: true });
    await redisClient.del(`OTP_${email}`);

    // Send Welcome Email asynchronously
    await emailQueue.add('send-welcome-email', {
      to: user.email,
      subject: 'Welcome to K10 Football Academy!',
      body: getWelcomeEmailTemplate(user.name, user.role),
    });

    return true;
  }

  async resendOtp(email: string): Promise<void> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    if (user.isEmailVerified) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Email is already verified');
    }

    // Rate-limit check in Redis (Max 1 resend per 60 seconds)
    const isRateLimited = await redisClient.get(`OTP_LIMIT_${email}`);
    if (isRateLimited) {
      throw new AppError(
        StatusCodes.TOO_MANY_REQUESTS,
        'Please wait 60 seconds before requesting a new OTP code',
      );
    }

    const otp = otpGenerator.generate(6);
    await redisClient.set(`OTP_${email}`, otp, 'EX', 300);
    await redisClient.set(`OTP_LIMIT_${email}`, '1', 'EX', 60);

    await emailQueue.add('send-otp-email', {
      to: user.email,
      subject: 'Resend Verification Code - K10 Football Academy',
      body: getResendOtpEmailTemplate(user.name, otp),
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User with this email does not exist');
    }

    const isRateLimited = await redisClient.get(`RESET_LIMIT_${email}`);
    if (isRateLimited) {
      throw new AppError(
        StatusCodes.TOO_MANY_REQUESTS,
        'Please wait 60 seconds before requesting another password reset',
      );
    }

    const resetOtp = otpGenerator.generate(6);
    await redisClient.set(`RESET_OTP_${email}`, resetOtp, 'EX', 600); // 10 mins
    await redisClient.set(`RESET_LIMIT_${email}`, '1', 'EX', 60);

    await emailQueue.add('send-reset-password-email', {
      to: user.email,
      subject: 'Password Reset Request - K10 Football Academy',
      body: getPasswordResetEmailTemplate(user.name, resetOtp),
    });
  }

  async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findByEmail(email, true);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    const cachedOtp = await redisClient.get(`RESET_OTP_${email}`);
    if (!cachedOtp || cachedOtp !== otp) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid or expired password reset OTP code');
    }

    user.password = newPassword;
    await user.save();

    await redisClient.del(`RESET_OTP_${email}`);
  }

  async refreshToken(refreshToken: string): Promise<IRefreshTokenResponse> {
    try {
      // Check if refresh token is blacklisted in Redis
      const isBlacklisted = await redisClient.get(`BL_${refreshToken}`);
      if (isBlacklisted) {
        throw new AppError(
          StatusCodes.UNAUTHORIZED,
          'Refresh token has been revoked. Please log in again.',
        );
      }

      const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as {
        userId: string;
        email: string;
        role: any;
      };

      const user = await this.userRepo.findById(decoded.userId);
      if (!user || user.status !== 'ACTIVE') {
        throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid refresh token or inactive account');
      }

      const newAccessToken = jwt.sign(
        { userId: user._id.toString(), email: user.email, role: user.role },
        env.JWT_ACCESS_SECRET,
        { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
      );

      return { accessToken: newAccessToken };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid or expired refresh token');
    }
  }

  async logoutUser(token: string): Promise<void> {
    if (!token) return;
    const cleanToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;

    // Blacklist token in Redis for 24 hours (86400 seconds)
    await redisClient.set(`BL_${cleanToken}`, '1', 'EX', 86400);
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    const fullUser = await this.userRepo.findByEmail(user.email, true);
    const isMatch = await fullUser!.comparePassword(oldPassword);
    if (!isMatch) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Current password does not match');
    }

    fullUser!.password = newPassword;
    await fullUser!.save();
  }

  async getUserById(id: string): Promise<IUserDocument> {
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }
    return user;
  }

  async getAllUsers(): Promise<IUserDocument[]> {
    return this.userRepo.findAll();
  }

  async updateUser(id: string, updateData: Partial<IUser>): Promise<IUserDocument> {
    const user = await this.userRepo.updateById(id, updateData);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.userRepo.deleteById(id);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }
  }
}

export const userService = new UserService(userRepository);
