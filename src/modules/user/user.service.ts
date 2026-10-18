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
import { AcademyProfile } from '@/modules/academy/academy.model';
import { CoachProfile, TacticalFormation } from '@/modules/coach/coach.model';
import { ClubProfile } from '@/modules/club/club.model';
import { AgentProfile } from '@/modules/agent/agent.model';
import {
  PlayerProfile,
  MatchRecord,
  PlayerAttributes,
  PlayerMentalAnalysis,
  PlayerFullPotential,
  FifaCardStats,
} from '@/modules/player/player.model';
import { ParentProfile } from '@/modules/parent/parent.model';
import { formatMarketValue } from '@/utils/ratingCalculator';

export class UserService {
  constructor(private readonly userRepo: UserRepository) {}

  async registerUser(
    userData: Partial<IUser>,
  ): Promise<{ user: IUserDocument; isResent: boolean }> {
    const normalizedEmail = userData.email!.toLowerCase().trim();
    userData.email = normalizedEmail;

    if ((userData.role as string) === 'PARENT' || (userData.role as string) === 'GUARDIAN') {
      userData.role = 'PARENT';
      delete (userData as any).accountManagedBy;
    } else if (userData.role === 'PLAYER') {
      userData.accountManagedBy = userData.accountManagedBy || 'ATHLETE';
    } else {
      delete (userData as any).accountManagedBy;
    }

    if ((userData as any).licenseId && !userData.fifaLicenseNumber) {
      userData.fifaLicenseNumber = (userData as any).licenseId;
    }
    if ((userData as any).country && !userData.countryOfOperation) {
      userData.countryOfOperation = (userData as any).country;
    }
    if ((userData as any).countryOfOperation && !userData.country) {
      userData.country = (userData as any).countryOfOperation;
    }

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
      if (existingUser.role === 'PLAYER') {
        existingUser.accountManagedBy =
          userData.accountManagedBy || existingUser.accountManagedBy || 'ATHLETE';
      } else {
        (existingUser as any).accountManagedBy = undefined;
      }
      if (userData.avatar) {
        existingUser.avatar = userData.avatar;
      }
      if (userData.phone) {
        existingUser.phone = userData.phone;
      }
      if (userData.height !== undefined) {
        existingUser.height = Number(userData.height);
      }
      if (userData.weight !== undefined) {
        existingUser.weight = Number(userData.weight);
      }
      if (userData.position !== undefined) {
        existingUser.position = userData.position;
      }
      if (userData.currentClub !== undefined) {
        existingUser.currentClub = userData.currentClub;
      }
      if (userData.dateOfBirth !== undefined) {
        existingUser.dateOfBirth = new Date(userData.dateOfBirth);
      }
      if (userData.yearsExperience !== undefined) {
        existingUser.yearsExperience = Number(userData.yearsExperience);
      }
      if (userData.licenseStatus !== undefined || userData.coachingLicenseLevel !== undefined) {
        existingUser.licenseStatus = (userData.licenseStatus ||
          userData.coachingLicenseLevel) as any;
        existingUser.coachingLicenseLevel = (userData.coachingLicenseLevel ||
          userData.licenseStatus) as any;
      }
      if (userData.preferredFormation !== undefined) {
        existingUser.preferredFormation = userData.preferredFormation as any;
      }
      if ((userData as any).clubName !== undefined) {
        existingUser.clubName = (userData as any).clubName;
      }
      if ((userData as any).title !== undefined) {
        existingUser.title = (userData as any).title;
      }
      if ((userData as any).league !== undefined || (userData as any).leagueTier !== undefined) {
        existingUser.league = (userData as any).league || (userData as any).leagueTier;
        existingUser.leagueTier = (userData as any).leagueTier || (userData as any).league;
      }
      if ((userData as any).country !== undefined) {
        existingUser.country = (userData as any).country;
      }
      if (
        (userData as any).fifaLicenseNumber !== undefined ||
        (userData as any).licenseId !== undefined
      ) {
        existingUser.fifaLicenseNumber =
          (userData as any).fifaLicenseNumber || (userData as any).licenseId;
      }
      if ((userData as any).agencyName !== undefined) {
        existingUser.agencyName = (userData as any).agencyName;
      }
      if (
        (userData as any).countryOfOperation !== undefined ||
        (userData as any).country !== undefined
      ) {
        existingUser.countryOfOperation =
          (userData as any).countryOfOperation || (userData as any).country;
        if (!existingUser.country) {
          existingUser.country = (userData as any).countryOfOperation || (userData as any).country;
        }
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

      if (existingUser.role === 'ACADEMY') {
        const location = (userData as any).location || '';
        const parts = location ? location.split(',') : [];
        const city = parts.length > 0 ? parts[0].trim() : 'Dhaka';
        const country = parts.length > 1 ? parts[1].trim() : 'Bangladesh';

        await AcademyProfile.findOneAndUpdate(
          { userId: existingUser._id },
          {
            userId: existingUser._id,
            name: (userData as any).academyName || userData.name || existingUser.name,
            category:
              (userData as any).estimatedAcademySize ||
              (userData as any).academySize ||
              'General Academy',
            location: location || 'Dhaka, Bangladesh',
            registrationId: (userData as any).registrationId || '',
            estimatedAcademySize:
              (userData as any).estimatedAcademySize || (userData as any).academySize || '',
            city,
            country,
            logo: userData.avatar || existingUser.avatar || '',
          },
          { upsert: true, new: true },
        );
      }

      if (existingUser.role === 'COACH') {
        const coachProf = await CoachProfile.findOneAndUpdate(
          { userId: existingUser._id },
          {
            userId: existingUser._id,
            fullName: userData.name || existingUser.name,
            title: (userData as any).title || 'Football Coach',
            coachType: (userData as any).coachType || 'INDIVIDUAL_COACH',
            yearsExperience: Number((userData as any).yearsExperience) || 0,
            licenseStatus:
              (userData as any).coachingLicenseLevel ||
              (userData as any).licenseStatus ||
              'No Official License',
            speciality:
              (userData as any).preferredFormation ||
              (userData as any).speciality ||
              'Tactical Coaching',
            cvTier: 'BRONZE',
            status: 'AVAILABLE',
          },
          { upsert: true, new: true },
        );

        if ((userData as any).preferredFormation && coachProf) {
          await TacticalFormation.findOneAndUpdate(
            { coachId: coachProf._id, formationSlot: 1 },
            {
              coachId: coachProf._id,
              formationSlot: 1,
              formationName: (userData as any).preferredFormation,
              positionsJson: JSON.stringify({ formation: (userData as any).preferredFormation }),
            },
            { upsert: true, new: true },
          );
        }
      }

      if (existingUser.role === 'CLUB') {
        await ClubProfile.findOneAndUpdate(
          { userId: existingUser._id },
          {
            userId: existingUser._id,
            name: (userData as any).clubName || userData.name || existingUser.name,
            clubType: (userData as any).title || 'Professional Club',
            establishedYear: (userData as any).establishedYear || new Date().getFullYear(),
            country: (userData as any).country || 'Bangladesh',
            league: (userData as any).leagueTier || (userData as any).league || 'Premier League',
            logo: userData.avatar || existingUser.avatar || '',
          },
          { upsert: true, new: true },
        );
      }

      if (existingUser.role === 'AGENT') {
        await AgentProfile.findOneAndUpdate(
          { userId: existingUser._id },
          {
            userId: existingUser._id,
            licenseId:
              (userData as any).fifaLicenseNumber ||
              (userData as any).licenseId ||
              existingUser.fifaLicenseNumber ||
              '',
            certifications: (userData as any).agencyName || existingUser.agencyName || '',
          },
          { upsert: true, new: true },
        );
      }

      if (existingUser.role === 'PLAYER') {
        const birthDate = userData.dateOfBirth
          ? new Date(userData.dateOfBirth)
          : existingUser.dateOfBirth
            ? new Date(existingUser.dateOfBirth)
            : new Date('2006-01-01');
        const age = !isNaN(birthDate.getTime())
          ? new Date().getFullYear() - birthDate.getFullYear()
          : 18;
        const playerProf = await PlayerProfile.findOneAndUpdate(
          { userId: existingUser._id },
          {
            userId: existingUser._id,
            fullName: userData.name || existingUser.name,
            position: userData.position || existingUser.position || 'Forward',
            dateOfBirth: birthDate,
            age,
            country: userData.country || existingUser.country || 'Bangladesh',
            height: userData.height || existingUser.height,
            weight: userData.weight || existingUser.weight,
            currentClub: userData.currentClub || existingUser.currentClub || '',
            profileImage: userData.avatar || existingUser.avatar || '',
          },
          { upsert: true, new: true },
        );

        if (playerProf) {
          await PlayerAttributes.findOneAndUpdate(
            { playerId: playerProf._id },
            { playerId: playerProf._id },
            { upsert: true, new: true },
          );
          await PlayerMentalAnalysis.findOneAndUpdate(
            { playerId: playerProf._id },
            { playerId: playerProf._id },
            { upsert: true, new: true },
          );
          await PlayerFullPotential.findOneAndUpdate(
            { playerId: playerProf._id },
            { playerId: playerProf._id },
            { upsert: true, new: true },
          );
          await FifaCardStats.findOneAndUpdate(
            { playerId: playerProf._id },
            { playerId: playerProf._id, overallRating: 50, position: playerProf.position },
            { upsert: true, new: true },
          );

          await this.userRepo.updateById(existingUser._id.toString(), {
            playerId: playerProf._id.toString(),
          });
          (existingUser as any).playerId = playerProf._id.toString();
        }
      }

      const userObj = existingUser.toObject() as unknown as IUser;
      delete (userObj as any).password;
      if (userObj.role === 'PLAYER' && (existingUser as any).playerId) {
        (userObj as any).playerId = (existingUser as any).playerId;
      } else if (userObj.role !== 'PLAYER') {
        delete (userObj as any).accountManagedBy;
      }
      return { user: userObj as unknown as IUserDocument, isResent: true };
    }

    const newUser = await this.userRepo.create(userData);

    if (newUser.role === 'ACADEMY') {
      const location = (userData as any).location || '';
      const parts = location ? location.split(',') : [];
      const city = parts.length > 0 ? parts[0].trim() : 'Dhaka';
      const country = parts.length > 1 ? parts[1].trim() : 'Bangladesh';

      await AcademyProfile.findOneAndUpdate(
        { userId: newUser._id },
        {
          userId: newUser._id,
          name: (userData as any).academyName || userData.name || newUser.name,
          category:
            (userData as any).estimatedAcademySize ||
            (userData as any).academySize ||
            'General Academy',
          location: location || 'Dhaka, Bangladesh',
          registrationId: (userData as any).registrationId || '',
          estimatedAcademySize:
            (userData as any).estimatedAcademySize || (userData as any).academySize || '',
          city,
          country,
          logo: userData.avatar || newUser.avatar || '',
        },
        { upsert: true, new: true },
      );
    }

    if (newUser.role === 'COACH') {
      const coachProf = await CoachProfile.findOneAndUpdate(
        { userId: newUser._id },
        {
          userId: newUser._id,
          fullName: newUser.name,
          title: (userData as any).title || 'Football Coach',
          coachType: (userData as any).coachType || 'INDIVIDUAL_COACH',
          yearsExperience: Number((userData as any).yearsExperience) || 0,
          licenseStatus:
            (userData as any).coachingLicenseLevel ||
            (userData as any).licenseStatus ||
            'No Official License',
          speciality:
            (userData as any).preferredFormation ||
            (userData as any).speciality ||
            'Tactical Coaching',
          cvTier: 'BRONZE',
          status: 'AVAILABLE',
        },
        { upsert: true, new: true },
      );

      if ((userData as any).preferredFormation && coachProf) {
        await TacticalFormation.findOneAndUpdate(
          { coachId: coachProf._id, formationSlot: 1 },
          {
            coachId: coachProf._id,
            formationSlot: 1,
            formationName: (userData as any).preferredFormation,
            positionsJson: JSON.stringify({ formation: (userData as any).preferredFormation }),
          },
          { upsert: true, new: true },
        );
      }
    }

    if (newUser.role === 'CLUB') {
      await ClubProfile.findOneAndUpdate(
        { userId: newUser._id },
        {
          userId: newUser._id,
          name: (userData as any).clubName || newUser.name,
          clubType: (userData as any).title || 'Professional Club',
          establishedYear: (userData as any).establishedYear || new Date().getFullYear(),
          country: (userData as any).country || 'Bangladesh',
          league: (userData as any).leagueTier || (userData as any).league || 'Premier League',
          logo: userData.avatar || newUser.avatar || '',
        },
        { upsert: true, new: true },
      );
    }

    if (newUser.role === 'AGENT') {
      await AgentProfile.findOneAndUpdate(
        { userId: newUser._id },
        {
          userId: newUser._id,
          licenseId:
            (userData as any).fifaLicenseNumber ||
            (userData as any).licenseId ||
            newUser.fifaLicenseNumber ||
            '',
          certifications: (userData as any).agencyName || newUser.agencyName || '',
        },
        { upsert: true, new: true },
      );
    }

    if (newUser.role === 'PLAYER') {
      const birthDate = userData.dateOfBirth
        ? new Date(userData.dateOfBirth)
        : newUser.dateOfBirth
          ? new Date(newUser.dateOfBirth)
          : new Date('2006-01-01');
      const age = !isNaN(birthDate.getTime())
        ? new Date().getFullYear() - birthDate.getFullYear()
        : 18;
      const playerProf = await PlayerProfile.findOneAndUpdate(
        { userId: newUser._id },
        {
          userId: newUser._id,
          fullName: newUser.name,
          position: userData.position || newUser.position || 'Forward',
          dateOfBirth: birthDate,
          age,
          country: userData.country || newUser.country || 'Bangladesh',
          height: userData.height || newUser.height,
          weight: userData.weight || newUser.weight,
          currentClub: userData.currentClub || newUser.currentClub || '',
          profileImage: userData.avatar || newUser.avatar || '',
        },
        { upsert: true, new: true },
      );

      if (playerProf) {
        await PlayerAttributes.findOneAndUpdate(
          { playerId: playerProf._id },
          { playerId: playerProf._id },
          { upsert: true, new: true },
        );
        await PlayerMentalAnalysis.findOneAndUpdate(
          { playerId: playerProf._id },
          { playerId: playerProf._id },
          { upsert: true, new: true },
        );
        await PlayerFullPotential.findOneAndUpdate(
          { playerId: playerProf._id },
          { playerId: playerProf._id },
          { upsert: true, new: true },
        );
        await FifaCardStats.findOneAndUpdate(
          { playerId: playerProf._id },
          { playerId: playerProf._id, overallRating: 50, position: playerProf.position },
          { upsert: true, new: true },
        );

        await this.userRepo.updateById(newUser._id.toString(), {
          playerId: playerProf._id.toString(),
        });
        (newUser as any).playerId = playerProf._id.toString();
      }
    }

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

    const userObj = newUser.toObject() as unknown as IUser;
    delete (userObj as any).password;
    if (userObj.role === 'PLAYER' && (newUser as any).playerId) {
      (userObj as any).playerId = (newUser as any).playerId;
    } else if (userObj.role !== 'PLAYER') {
      delete (userObj as any).accountManagedBy;
    }
    return { user: userObj as unknown as IUserDocument, isResent: false };
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

    const userObj = await this.getUserById(user._id.toString());

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

  async getUserById(id: string): Promise<any> {
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    const userObj: any = user.toObject();
    delete userObj.password;

    if (user.role === 'COACH') {
      const coachProfile = await CoachProfile.findOne({ userId: user._id });
      if (coachProfile) {
        userObj.yearsExperience = userObj.yearsExperience ?? coachProfile.yearsExperience;
        userObj.licenseStatus = userObj.licenseStatus ?? coachProfile.licenseStatus;
        userObj.coachingLicenseLevel = userObj.coachingLicenseLevel ?? coachProfile.licenseStatus;
        userObj.preferredFormation = userObj.preferredFormation ?? coachProfile.speciality;
      }
    }

    if (user.role === 'CLUB') {
      const clubProfile = await ClubProfile.findOne({ userId: user._id });
      if (clubProfile) {
        userObj.clubName = userObj.clubName ?? clubProfile.name;
        userObj.title = userObj.title ?? clubProfile.clubType;
        userObj.league = userObj.league ?? clubProfile.league;
        userObj.leagueTier = userObj.leagueTier ?? clubProfile.league;
        userObj.country = userObj.country ?? clubProfile.country;
      }
    }

    if (user.role === 'AGENT') {
      const agentProfile = await AgentProfile.findOne({ userId: user._id });
      if (agentProfile) {
        userObj.fifaLicenseNumber = userObj.fifaLicenseNumber ?? agentProfile.licenseId;
        userObj.agencyName = userObj.agencyName ?? agentProfile.certifications;
      }
      userObj.countryOfOperation = userObj.countryOfOperation ?? userObj.country;
      userObj.country = userObj.country ?? userObj.countryOfOperation;
    }

    if (user.role === 'PLAYER') {
      const playerProfile = await PlayerProfile.findOne({ userId: user._id });
      if (playerProfile) {
        userObj.playerId = playerProfile._id;
        userObj.position = userObj.position ?? playerProfile.position;
        userObj.secondaryPositions = userObj.secondaryPositions ?? playerProfile.secondaryPositions;
        userObj.preferredFoot = userObj.preferredFoot ?? playerProfile.preferredFoot;
        userObj.dateOfBirth = userObj.dateOfBirth ?? playerProfile.dateOfBirth;
        userObj.age = userObj.age ?? playerProfile.age;
        userObj.height = userObj.height ?? playerProfile.height;
        userObj.weight = userObj.weight ?? playerProfile.weight;
        userObj.currentClub = userObj.currentClub ?? playerProfile.currentClub;
        userObj.contractUntil = userObj.contractUntil ?? playerProfile.contractUntil;
        userObj.country = userObj.country ?? playerProfile.country;
        userObj.overallRating = userObj.overallRating ?? playerProfile.overallRating;
        userObj.marketValue = userObj.marketValue ?? playerProfile.marketValue;
        const mvObj = formatMarketValue(userObj.marketValue);
        userObj.marketValueFormatted = mvObj.formatted;
        userObj.cvTier = userObj.cvTier ?? playerProfile.cvTier;
        userObj.profileCompletion = userObj.profileCompletion ?? playerProfile.profileCompletion;
        userObj.isVerifiedByCoach = userObj.isVerifiedByCoach ?? playerProfile.isVerifiedByCoach;
        userObj.profileViews = playerProfile.profileViews ?? 0;
        userObj.totalLikes = playerProfile.totalLikes ?? 0;

        const matchCount = await MatchRecord.countDocuments({ playerId: playerProfile._id });
        const totalReports =
          (playerProfile as any).reports !== undefined &&
          (playerProfile as any).reports !== null &&
          (playerProfile as any).reports > 0
            ? (playerProfile as any).reports
            : matchCount;
        delete (userObj as any).reports;
        userObj.totalReports = totalReports;
        userObj.overviewStats = {
          profileViews: userObj.profileViews,
          totalLikes: userObj.totalLikes,
          reports: totalReports,
        };
      }
    }

    if (user.role === 'ACADEMY') {
      const academyProfile = await AcademyProfile.findOne({ userId: user._id });
      if (academyProfile) {
        userObj.academyId = academyProfile._id;
        userObj.academyName = userObj.academyName ?? academyProfile.name;
        userObj.location = userObj.location ?? academyProfile.location;
        userObj.city = userObj.city ?? academyProfile.city;
        userObj.country = userObj.country ?? academyProfile.country;
        userObj.registrationId = userObj.registrationId ?? academyProfile.registrationId;
        userObj.estimatedAcademySize =
          userObj.estimatedAcademySize ?? academyProfile.estimatedAcademySize;
        userObj.category = userObj.category ?? academyProfile.category;
      }
    }

    if ((user.role as string) === 'GUARDIAN' || (user.role as string) === 'PARENT') {
      const parentProfile = await ParentProfile.findOne({ userId: user._id });
      if (parentProfile) {
        userObj.parentProfileId = parentProfile._id;
        userObj.contactPhone = userObj.contactPhone ?? parentProfile.contactPhone;
        userObj.address = userObj.address ?? (parentProfile as any).address;
      }
    }

    return userObj;
  }

  async getAllUsers(): Promise<IUserDocument[]> {
    return this.userRepo.findAll();
  }

  async updateMyProfile(userId: string, updateData: any): Promise<any> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    // Protect sensitive fields from arbitrary override
    delete updateData.password;
    delete updateData.email;
    delete updateData.role;
    delete updateData.isEmailVerified;
    delete updateData._id;

    // Normalizations
    if (updateData.coachingLicenseLevel && !updateData.licenseStatus) {
      updateData.licenseStatus = updateData.coachingLicenseLevel;
    }
    if (updateData.licenseStatus && !updateData.coachingLicenseLevel) {
      updateData.coachingLicenseLevel = updateData.licenseStatus;
    }
    if (updateData.leagueTier && !updateData.league) {
      updateData.league = updateData.leagueTier;
    }
    if (updateData.league && !updateData.leagueTier) {
      updateData.leagueTier = updateData.league;
    }
    if (updateData.licenseId && !updateData.fifaLicenseNumber) {
      updateData.fifaLicenseNumber = updateData.licenseId;
    }
    if (updateData.fifaLicenseNumber && !updateData.licenseId) {
      updateData.licenseId = updateData.fifaLicenseNumber;
    }
    if (updateData.countryOfOperation && !updateData.country) {
      updateData.country = updateData.countryOfOperation;
    }
    if (updateData.country && !updateData.countryOfOperation) {
      updateData.countryOfOperation = updateData.country;
    }
    if (updateData.height !== undefined && updateData.height !== '') {
      updateData.height = Number(updateData.height);
    }
    if (updateData.weight !== undefined && updateData.weight !== '') {
      updateData.weight = Number(updateData.weight);
    }
    if (updateData.yearsExperience !== undefined && updateData.yearsExperience !== '') {
      updateData.yearsExperience = Number(updateData.yearsExperience);
    }
    if (updateData.dateOfBirth) {
      updateData.dateOfBirth = new Date(updateData.dateOfBirth);
    }

    // 1. Update User document
    await this.userRepo.updateById(userId, updateData);

    // 2. Sync Role-Specific Profiles
    if (user.role === 'PLAYER') {
      const playerUpdate: any = {};
      if (updateData.name) playerUpdate.fullName = updateData.name;
      if (updateData.position) playerUpdate.position = updateData.position;
      if (updateData.secondaryPositions)
        playerUpdate.secondaryPositions = updateData.secondaryPositions;
      if (updateData.preferredFoot) playerUpdate.preferredFoot = updateData.preferredFoot;
      if (updateData.height !== undefined && updateData.height !== '')
        playerUpdate.height = Number(updateData.height);
      if (updateData.weight !== undefined && updateData.weight !== '')
        playerUpdate.weight = Number(updateData.weight);
      if (updateData.currentClub !== undefined) playerUpdate.currentClub = updateData.currentClub;
      if (updateData.contractUntil !== undefined)
        playerUpdate.contractUntil = new Date(updateData.contractUntil);
      if (updateData.reports !== undefined && updateData.reports !== '')
        playerUpdate.reports = Number(updateData.reports);
      if (updateData.profileViews !== undefined && updateData.profileViews !== '')
        playerUpdate.profileViews = Number(updateData.profileViews);
      if (updateData.totalLikes !== undefined && updateData.totalLikes !== '')
        playerUpdate.totalLikes = Number(updateData.totalLikes);
      if (updateData.country !== undefined) playerUpdate.country = updateData.country;
      if (updateData.dateOfBirth) {
        playerUpdate.dateOfBirth = new Date(updateData.dateOfBirth);
        const birthYear = new Date(updateData.dateOfBirth).getFullYear();
        if (!isNaN(birthYear)) playerUpdate.age = new Date().getFullYear() - birthYear;
      }
      if (updateData.avatar) playerUpdate.profileImage = updateData.avatar;

      if (Object.keys(playerUpdate).length > 0) {
        await PlayerProfile.findOneAndUpdate({ userId }, { $set: playerUpdate }, { new: true });
      }
    } else if (user.role === 'COACH') {
      const coachUpdate: any = {};
      if (updateData.name) coachUpdate.fullName = updateData.name;
      if (updateData.title) coachUpdate.title = updateData.title;
      if (updateData.coachType) coachUpdate.coachType = updateData.coachType;
      if (updateData.yearsExperience !== undefined && updateData.yearsExperience !== '')
        coachUpdate.yearsExperience = Number(updateData.yearsExperience);
      if (updateData.licenseStatus || updateData.coachingLicenseLevel) {
        coachUpdate.licenseStatus = updateData.coachingLicenseLevel || updateData.licenseStatus;
      }
      if (updateData.preferredFormation) coachUpdate.speciality = updateData.preferredFormation;

      if (Object.keys(coachUpdate).length > 0) {
        const coachProf = await CoachProfile.findOneAndUpdate(
          { userId },
          { $set: coachUpdate },
          { new: true },
        );
        if (updateData.preferredFormation && coachProf) {
          await TacticalFormation.findOneAndUpdate(
            { coachId: coachProf._id, formationSlot: 1 },
            {
              coachId: coachProf._id,
              formationSlot: 1,
              formationName: updateData.preferredFormation,
              positionsJson: JSON.stringify({ formation: updateData.preferredFormation }),
            },
            { upsert: true, new: true },
          );
        }
      }
    } else if (user.role === 'CLUB') {
      const clubUpdate: any = {};
      if (updateData.clubName || updateData.name)
        clubUpdate.name = updateData.clubName || updateData.name;
      if (updateData.title) clubUpdate.clubType = updateData.title;
      if (updateData.leagueTier || updateData.league)
        clubUpdate.league = updateData.leagueTier || updateData.league;
      if (updateData.country) clubUpdate.country = updateData.country;
      if (updateData.avatar) clubUpdate.logo = updateData.avatar;

      if (Object.keys(clubUpdate).length > 0) {
        await ClubProfile.findOneAndUpdate({ userId }, { $set: clubUpdate }, { new: true });
      }
    } else if (user.role === 'AGENT') {
      const agentUpdate: any = {};
      if (updateData.fifaLicenseNumber || updateData.licenseId) {
        agentUpdate.licenseId = updateData.fifaLicenseNumber || updateData.licenseId;
      }
      if (updateData.agencyName) agentUpdate.certifications = updateData.agencyName;

      if (Object.keys(agentUpdate).length > 0) {
        await AgentProfile.findOneAndUpdate({ userId }, { $set: agentUpdate }, { new: true });
      }
    } else if ((user.role as string) === 'GUARDIAN' || (user.role as string) === 'PARENT') {
      const parentUpdate: any = {};
      if (updateData.phone || updateData.contactPhone)
        parentUpdate.contactPhone = updateData.phone || updateData.contactPhone;
      if (updateData.address) parentUpdate.address = updateData.address;
      if (updateData.avatar) parentUpdate.profileImage = updateData.avatar;

      if (Object.keys(parentUpdate).length > 0) {
        await ParentProfile.findOneAndUpdate({ userId }, { $set: parentUpdate }, { new: true });
      }
    } else if (user.role === 'ACADEMY') {
      const academyUpdate: any = {};
      if (updateData.academyName || updateData.name)
        academyUpdate.name = updateData.academyName || updateData.name;
      if (updateData.avatar) academyUpdate.logo = updateData.avatar;
      if (updateData.country) academyUpdate.country = updateData.country;

      if (Object.keys(academyUpdate).length > 0) {
        await AcademyProfile.findOneAndUpdate({ userId }, { $set: academyUpdate }, { new: true });
      }
    }

    return this.getUserById(userId);
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
