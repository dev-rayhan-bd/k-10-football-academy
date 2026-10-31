import { StatusCodes } from 'http-status-codes';
import { IUser, IUserDocument } from '../user.interface';
import { userRepository } from '../user.repository';
import { AppError } from '@/utils/AppError';
import { emailQueue } from '@/jobs/queues/email.queue';
import { redisClient } from '@/config/redis';
import { otpGenerator } from '@/utils/otpGenerator';
import { getOtpVerificationEmailTemplate } from '@/utils/emailTemplates';
import { AcademyProfile } from '@/modules/academy/academy.model';
import { CoachProfile, TacticalFormation } from '@/modules/coach/coach.model';
import { ClubProfile } from '@/modules/club/club.model';
import { AgentProfile } from '@/modules/agent/agent.model';
import {
  PlayerProfile,
  PlayerAttributes,
  PlayerMentalAnalysis,
  PlayerFullPotential,
  FifaCardStats,
} from '@/modules/player/player.model';
import { notificationService } from '@/modules/notification/notification.service';

export class UserRegistrationService {
  async registerUser(
    userData: Partial<IUser>,
  ): Promise<{ user: IUserDocument; isResent: boolean }> {
    const normalizedEmail = userData.email!.toLowerCase().trim();
    userData.email = normalizedEmail;

    if (userData.role === 'SUPER_ADMIN' || userData.role === 'ADMIN') {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Access Denied: Cannot self-register as an administrator.',
      );
    }

    if ((userData.role as string) === 'PARENT' || (userData.role as string) === 'GUARDIAN') {
      userData.role = 'PARENT';
      delete (userData as any).accountManagedBy;
    } else if (userData.role === 'PLAYER') {
      userData.accountManagedBy = userData.accountManagedBy || 'ATHLETE';
      if (userData.dateOfBirth) {
        const birthDate = new Date(userData.dateOfBirth);
        if (!isNaN(birthDate.getTime())) {
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const m = today.getMonth() - birthDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          if (age < 16) {
            const msg =
              'Players under 16 years old cannot register directly. An account must be created and managed by a parent or legal guardian.';
            throw new AppError(StatusCodes.BAD_REQUEST, msg, true, '', [
              { path: 'dateOfBirth', message: msg },
            ]);
          }
        }
      }
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

    const existingUser = await userRepository.findByEmail(normalizedEmail, true);
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
            cvTier: 'BRONZE',
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

          await userRepository.updateById(existingUser._id.toString(), {
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

    const newUser = await userRepository.create(userData);

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
          cvTier: 'BRONZE',
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

        await userRepository.updateById(newUser._id.toString(), {
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

    void notificationService.notifyAdmins({
      settingKey: 'userRegistrationAlerts',
      title: 'New User Registered',
      message: `A new ${newUser.role.toLowerCase()} "${newUser.name}" (${newUser.email}) has registered on the platform.`,
      type: 'NEW_USER',
      data: { userId: newUser._id, role: newUser.role, email: newUser.email },
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
}

export const userRegistrationService = new UserRegistrationService();
