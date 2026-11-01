import jwt from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';
import { ILoginResponse, IRefreshTokenResponse } from '../user.interface';
import { userRepository } from '../user.repository';
import { AppError } from '@/utils/AppError';
import { env } from '@/config/env';
import { emailQueue } from '@/jobs/queues/email.queue';
import { redisClient } from '@/config/redis';
import { otpGenerator } from '@/utils/otpGenerator';
import { UserModel } from '../user.model';
import { ParentProfile, ParentChild } from '@/modules/parent/parent.model';
import { normalizeRelationshipType } from '@/modules/parent/parent.interface';
import { PlayerProfile } from '@/modules/player/player.model';
import { notificationService } from '@/modules/notification/notification.service';
import {
  getResendOtpEmailTemplate,
  getPasswordResetEmailTemplate,
  getWelcomeEmailTemplate,
  getParentConsentConfirmedEmailTemplate,
} from '@/utils/emailTemplates';
import { userProfileService } from './user-profile.service';

export class UserAuthService {
  async loginUser(email: string, candidatePassword: string): Promise<ILoginResponse> {
    const user = await userRepository.findByEmail(email, true);
    if (!user) {
      throw new AppError(StatusCodes.UNPROCESSABLE_ENTITY, 'Invalid email or password');
    }

    const isMatch = await user.comparePassword(candidatePassword);
    if (!isMatch) {
      throw new AppError(StatusCodes.UNPROCESSABLE_ENTITY, 'Invalid email or password');
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

    if (user.role === 'PLAYER' && user.dateOfBirth) {
      const birthDate = new Date(user.dateOfBirth);
      if (!isNaN(birthDate.getTime())) {
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        if (age < 16 && !user.isParentConsentVerified) {
          throw new AppError(
            StatusCodes.FORBIDDEN,
            'Parental consent is pending. A parent or guardian must verify your account before you can log in.',
          );
        }
      }
    }

    if (user.isEmailVerified && !['COACH', 'AGENT', 'CLUB'].includes(user.role)) {
      if (!user.isVerified || user.verificationStatus !== 'APPROVED') {
        user.isVerified = true;
        user.verificationStatus = 'APPROVED';
        await user.save();
      }
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

    const userObj = await userProfileService.getUserById(user._id.toString());

    return {
      user: userObj,
      accessToken,
      refreshToken,
    };
  }

  async verifyOtp(email: string, otp: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await userRepository.findByEmail(normalizedEmail);
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

    const updatePayload: Record<string, any> = { isEmailVerified: true };
    if (!['COACH', 'AGENT', 'CLUB'].includes(user.role)) {
      updatePayload.isVerified = true;
      updatePayload.verificationStatus = 'APPROVED';
    }
    await userRepository.updateById(user._id.toString(), updatePayload);
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
    const user = await userRepository.findByEmail(normalizedEmail);
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
    const user = await userRepository.findByEmail(normalizedEmail);
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
    const user = await userRepository.findByEmail(normalizedEmail);
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

    const user = await userRepository.findByEmail(targetEmail, true);
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

      const user = await userRepository.findById(decoded.userId);
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
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    const fullUser = await userRepository.findByEmail(user.email, true);
    const isMatch = await fullUser!.comparePassword(oldPassword);
    if (!isMatch) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Current password does not match');
    }

    fullUser!.password = newPassword;
    await fullUser!.save();
  }

  async verifyParentConsent(
    userId: string,
    token?: string,
    authenticatedUser?: any,
    relationshipType?: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!userId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Child user ID is required');
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Player account not found');
    }

    // 1. If Parent is logged in with matching parentEmail or is Admin
    const isParentAuthenticated =
      authenticatedUser &&
      (authenticatedUser.role === 'PARENT' ||
        authenticatedUser.role === 'GUARDIAN' ||
        authenticatedUser.role === 'SUPER_ADMIN') &&
      (authenticatedUser.role === 'SUPER_ADMIN' ||
        authenticatedUser.email?.toLowerCase().trim() === user.parentEmail?.toLowerCase().trim());

    // 2. If token is provided (from email link or body)
    const isTokenValid =
      token &&
      user.parentConsentToken &&
      user.parentConsentToken === token &&
      (!user.parentConsentExpires || user.parentConsentExpires >= new Date());

    if (!user.isParentConsentVerified && !isParentAuthenticated && !isTokenValid) {
      if (token && user.parentConsentExpires && user.parentConsentExpires < new Date()) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          'Parental consent link has expired. Please request a new verification.',
        );
      }
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Unauthorized: You must either be logged in as the child's parent or provide a valid consent token.",
      );
    }

    user.isParentConsentVerified = true;
    user.isEmailVerified = true;
    user.status = 'ACTIVE';
    user.verificationStatus = 'APPROVED';
    user.accountManagedBy = 'PARENT';
    user.parentConsentToken = undefined;
    user.parentConsentExpires = undefined;

    // Check if parent has an existing K10 account
    const parentEmailNorm = user.parentEmail?.toLowerCase().trim();
    let parentUser = null;
    if (
      authenticatedUser &&
      (authenticatedUser.role === 'PARENT' || authenticatedUser.role === 'GUARDIAN')
    ) {
      parentUser = await UserModel.findById(authenticatedUser.userId || authenticatedUser._id);
    }
    if (!parentUser && parentEmailNorm) {
      parentUser = await UserModel.findOne({
        email: { $regex: new RegExp(`^${parentEmailNorm}$`, 'i') },
        role: { $in: ['PARENT', 'GUARDIAN'] },
      });
    }

    if (parentUser) {
      let parentProfile = await ParentProfile.findOne({ userId: parentUser._id });
      if (!parentProfile) {
        parentProfile = await ParentProfile.create({
          userId: parentUser._id,
          contactPhone: parentUser.phone || (parentUser as any).contactPhone || '+8801700000000',
          firstName: parentUser.name?.split(' ')[0] || '',
          lastName: parentUser.name?.split(' ').slice(1).join(' ') || '',
        });
      }

      let playerProfile = await PlayerProfile.findOne({ userId: user._id });
      if (!playerProfile) {
        const birthDate = user.dateOfBirth ? new Date(user.dateOfBirth) : new Date('2010-01-01');
        const age = Math.max(0, new Date().getFullYear() - birthDate.getFullYear());
        playerProfile = await PlayerProfile.create({
          userId: user._id,
          fullName: user.name,
          position: user.position || 'Forward',
          dateOfBirth: birthDate,
          age,
          country: user.country || 'Bangladesh',
          height: user.height,
          weight: user.weight,
          currentClub: user.currentClub || '',
          profileImage: user.avatar || '',
          cvTier: 'BRONZE',
        });
      }

      const resolvedRel = normalizeRelationshipType(
        relationshipType ||
          (authenticatedUser as any)?.relationshipType ||
          (authenticatedUser as any)?.relationship ||
          user.parentRelationship ||
          user.relationshipType ||
          parentProfile?.relationship ||
          parentUser?.parentRelationship ||
          parentUser?.relationshipType ||
          'PARENT',
      );

      if (playerProfile) {
        user.playerId = playerProfile._id.toString();
        await ParentChild.findOneAndUpdate(
          { parentId: parentProfile._id, childPlayerId: playerProfile._id },
          {
            parentId: parentProfile._id,
            childPlayerId: playerProfile._id,
            relationshipType: resolvedRel,
          },
          { upsert: true, new: true },
        );
      }

      await notificationService
        .createNotification({
          recipientId: parentUser._id,
          recipientRole: 'PARENT',
          title: 'Child Account Activated',
          message: `Your child ${user.name}'s account has been successfully verified and linked to your dashboard.`,
          type: 'ACCOUNT_UPDATE',
        })
        .catch(() => null);
    } else if (parentEmailNorm) {
      // Parent does not have a K10 account: Inform parent via email
      const clientBaseUrl = env.CLIENT_URL || process.env.CLIENT_URL || 'http://localhost:3000';
      await emailQueue
        .add('send-parent-consent-confirmed-email', {
          to: parentEmailNorm,
          subject: 'Parental Consent Confirmed - K10 Football Account Activated',
          body: getParentConsentConfirmedEmailTemplate(user.name, `${clientBaseUrl}/login`),
        })
        .catch(() => null);
    }

    await user.save();

    return {
      success: true,
      message:
        'Parental consent successfully verified! Player account is now fully active and linked to parent.',
    };
  }
}

export const userAuthService = new UserAuthService();
