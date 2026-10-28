import { StatusCodes } from 'http-status-codes';
import { IUser, IUserDocument } from '../user.interface';
import { userRepository } from '../user.repository';
import { AppError } from '@/utils/AppError';
import { AcademyProfile } from '@/modules/academy/academy.model';
import { CoachProfile, TacticalFormation } from '@/modules/coach/coach.model';
import { ClubProfile } from '@/modules/club/club.model';
import { AgentProfile } from '@/modules/agent/agent.model';
import { PlayerProfile, MatchRecord } from '@/modules/player/player.model';
import { ParentProfile } from '@/modules/parent/parent.model';
import { formatMarketValue } from '@/utils/ratingCalculator';

export class UserProfileService {
  async getUserById(id: string): Promise<any> {
    const user = await userRepository.findById(id);
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
    return userRepository.findAll();
  }

  async updateMyProfile(userId: string, updateData: any): Promise<any> {
    const user = await userRepository.findById(userId);
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
    await userRepository.updateById(userId, updateData);

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
      if (updateData.coachType) {
        if (updateData.coachType === 'CLUB_COACH') {
          const currentCoach = await CoachProfile.findOne({ userId });
          if (!currentCoach?.isVerifiedByAcademy || !currentCoach?.academyId) {
            throw new AppError(
              400,
              'Cannot switch to Club Coach mode without an officially approved affiliation from a registered Club or Academy.',
            );
          }
        }
        coachUpdate.coachType = updateData.coachType;
      }
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
    const existing = await userRepository.findById(id);
    if (!existing) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }
    if (existing.role === 'SUPER_ADMIN') {
      if (updateData.status && updateData.status !== 'ACTIVE') {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          'Access Denied: Cannot block or deactivate a Super Admin account',
        );
      }
      if (updateData.role && updateData.role !== 'SUPER_ADMIN') {
        throw new AppError(StatusCodes.FORBIDDEN, 'Access Denied: Cannot demote a Super Admin');
      }
    }
    const user = await userRepository.updateById(id, updateData);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    const existing = await userRepository.findById(id);
    if (!existing) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }
    if (existing.role === 'SUPER_ADMIN') {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Access Denied: Cannot delete a Super Admin account',
      );
    }
    await userRepository.deleteById(id);
  }
}

export const userProfileService = new UserProfileService();
