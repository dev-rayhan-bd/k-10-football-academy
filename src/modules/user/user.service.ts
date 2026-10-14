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

  async registerUser(
    userData: Partial<IUser>,
  ): Promise<{ user: IUserDocument; isResent: boolean }> {
    const normalizedEmail = userData.email!.toLowerCase().trim();
    userData.email = normalizedEmail;

    const existingUser = await this.userRepo.findByEmail(normalizedEmail, true);
    if (existingUser) {
      if (existingUser.isEmailVerified) {
        throw new AppError(
          StatusCodes.CONFLICT,
          'Email address is already registered. Please log in.',
        );
      }

      // If user previously registered but has not verified email, update info and resend fresh OTP
      existingUser.name = userData.name || existingUser.name;
      if (userData.password) {
        existingUser.password = userData.password;
      }
      if (userData.role) {
        existingUser.role = userData.role;
      }
      if (userData.avatar) {
        existingUser.avatar = userData.avatar;
      }
      if (userData.phone) {
        existingUser.phone = userData.phone;
      }
      if (userData.accountManagedBy) {
        existingUser.accountManagedBy = userData.accountManagedBy;
      }
      await existingUser.save();

      // Generate 6-digit OTP
      const otp = otpGenerator.generate(6);

      // Save OTP to Redis with 5-minute expiration (300s)
      await redisClient.set(`OTP_${normalizedEmail}`, otp, 'EX', 300);

      // Queue OTP email via BullMQ
      await emailQueue.add('send-otp-email', {
        to: normalizedEmail,
        subject: 'Verify your K10 Football Academy Account',
        body: getOtpVerificationEmailTemplate(existingUser.name, otp),
      });

      return { user: existingUser, isResent: true };
    }

    const newUser = await this.userRepo.create(userData);

    // Generate 6-digit OTP
    const otp = otpGenerator.generate(6);

    // Save OTP to Redis with 5-minute expiration (300s)
    await redisClient.set(`OTP_${normalizedEmail}`, otp, 'EX', 300);

    // Queue OTP email via BullMQ with Professional HTML Template
    await emailQueue.add('send-otp-email', {
      to: normalizedEmail,
      subject: 'Verify your K10 Football Academy Account',
      body: getOtpVerificationEmailTemplate(newUser.name, otp),
    });

    return { user: newUser, isResent: false };
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

    if (!user.isEmailVerified) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Email is not verified. Please verify your email before logging in.',
      );
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
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.userRepo.findByEmail(normalizedEmail);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    if (user.isEmailVerified) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Email is already verified');
    }

    const cachedOtp = await redisClient.get(`OTP_${normalizedEmail}`);
    if (!cachedOtp) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'OTP has expired or does not exist');
    }

    if (cachedOtp !== otp) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid OTP code');
    }

    await this.userRepo.updateById(user._id.toString(), { isEmailVerified: true });
    await redisClient.del(`OTP_${normalizedEmail}`);

    // Send Welcome Email asynchronously
    await emailQueue.add('send-welcome-email', {
      to: user.email,
      subject: 'Welcome to K10 Football Academy!',
      body: getWelcomeEmailTemplate(user.name, user.role),
    });

    return true;
  }

  async resendOtp(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.userRepo.findByEmail(normalizedEmail);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    if (user.isEmailVerified) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Email is already verified');
    }

    // Rate-limit check in Redis (Max 1 resend per 60 seconds)
    const isRateLimited = await redisClient.get(`OTP_LIMIT_${normalizedEmail}`);
    if (isRateLimited) {
      throw new AppError(
        StatusCodes.TOO_MANY_REQUESTS,
        'Please wait 60 seconds before requesting a new OTP code',
      );
    }

    const otp = otpGenerator.generate(6);
    await redisClient.set(`OTP_${normalizedEmail}`, otp, 'EX', 300);
    await redisClient.set(`OTP_LIMIT_${normalizedEmail}`, '1', 'EX', 60);

    await emailQueue.add('send-otp-email', {
      to: user.email,
      subject: 'Resend Verification Code - K10 Football Academy',
      body: getResendOtpEmailTemplate(user.name, otp),
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.userRepo.findByEmail(normalizedEmail);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User with this email does not exist');
    }

    const isRateLimited = await redisClient.get(`RESET_LIMIT_${normalizedEmail}`);
    if (isRateLimited) {
      throw new AppError(
        StatusCodes.TOO_MANY_REQUESTS,
        'Please wait 60 seconds before requesting another password reset',
      );
    }

    const resetOtp = otpGenerator.generate(6);
    await redisClient.set(`RESET_OTP_${normalizedEmail}`, resetOtp, 'EX', 600); // 10 mins
    await redisClient.set(`RESET_LIMIT_${normalizedEmail}`, '1', 'EX', 60);

    await emailQueue.add('send-reset-password-email', {
      to: user.email,
      subject: 'Password Reset Request - K10 Football Academy',
      body: getPasswordResetEmailTemplate(user.name, resetOtp),
    });
  }

  async verifyResetOtp(email: string, otp: string): Promise<{ resetToken: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.userRepo.findByEmail(normalizedEmail);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User with this email does not exist');
    }

    const cachedOtp = await redisClient.get(`RESET_OTP_${normalizedEmail}`);
    if (!cachedOtp || cachedOtp !== otp) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid or expired password reset OTP code');
    }

    // OTP is valid! Delete OTP from Redis so it cannot be reused
    await redisClient.del(`RESET_OTP_${normalizedEmail}`);

    // Mark as verified in Redis for 15 minutes
    await redisClient.set(`RESET_VERIFIED_${normalizedEmail}`, 'true', 'EX', 900);

    // Generate short-lived reset token (valid for 15m)
    const resetToken = jwt.sign(
      { userId: user._id.toString(), email: user.email, type: 'PASSWORD_RESET' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' },
    );

    return { resetToken };
  }

  async resetPassword(params: {
    email?: string;
    newPassword: string;
    resetToken?: string;
    otp?: string;
  }): Promise<void> {
    let targetEmail = params.email ? params.email.toLowerCase().trim() : '';

    // If resetToken is provided, decode and verify it
    if (params.resetToken) {
      try {
        const decoded = jwt.verify(params.resetToken, env.JWT_ACCESS_SECRET) as {
          email: string;
        };
        if (decoded.email) {
          targetEmail = decoded.email.toLowerCase().trim();
        }
      } catch {
        throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid or expired password reset token');
      }
    }

    if (!targetEmail) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Email address or resetToken is required');
    }

    const user = await this.userRepo.findByEmail(targetEmail, true);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User with this email does not exist');
    }

    // If resetToken was not used, check if the email was verified via verify-reset-otp
    if (!params.resetToken) {
      const isVerified = await redisClient.get(`RESET_VERIFIED_${targetEmail}`);

      if (!isVerified) {
        // If not verified in Redis, check if OTP was passed directly
        if (!params.otp) {
          throw new AppError(
            StatusCodes.BAD_REQUEST,
            'Please verify your OTP code first before resetting your password',
          );
        }

        const cachedOtp = await redisClient.get(`RESET_OTP_${targetEmail}`);
        if (!cachedOtp || cachedOtp !== params.otp) {
          throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid or expired password reset OTP code');
        }
      }
    }

    user.password = params.newPassword;
    await user.save();

    await redisClient.del(`RESET_OTP_${targetEmail}`);
    await redisClient.del(`RESET_VERIFIED_${targetEmail}`);
    await redisClient.del(`RESET_LIMIT_${targetEmail}`);
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
