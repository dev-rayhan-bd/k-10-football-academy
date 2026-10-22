import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { UserModel } from '@/modules/user/user.model';
import QueryBuilder from '@/builder/QueryBuilder';
import { deleteFromStorage } from '@/utils/fileUpload.utils';
import { ICoachProfile, ITacticalFormation, ICoachTestimonial } from './coach.interface';
import { CoachProfile, TacticalFormation, CoachTestimonial } from './coach.model';
import { coachCvService, computeCoachProfileCompletion } from './services/coach-cv.service';
import { coachCacheService } from './services/coach-cache.service';
import { PlayerProfile, PlayerAttributes } from '@/modules/player/player.model';
import { playerStatsService } from '@/modules/player/services/player-stats.service';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { NotificationService } from '@/modules/notification/notification.service';

const notificationService = new NotificationService();

const parseIfJson = (val: any) => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
};

export class CoachService {
  // ==========================================
  // MASTER CV AGGREGATION
  // ==========================================
  async getCoachCV(id: string, viewer?: { userId?: string; role?: string }) {
    return coachCvService.getCoachCV(id, viewer);
  }

  async getMyCV(userId: string) {
    return coachCvService.getCoachCV('me', { userId });
  }

  // ==========================================
  // PROFILE CRUD & ROOT OPERATIONS
  // ==========================================
  async createProfile(payload: Partial<ICoachProfile>) {
    const existing = await CoachProfile.findOne({ userId: payload.userId });
    if (existing) {
      throw new AppError(400, 'Coach profile already exists for this user');
    }
    const profile = await CoachProfile.create(payload);
    await coachCacheService.invalidateCoachCache(profile._id, profile.userId);
    return profile;
  }

  async getProfileById(id: string) {
    let profile = null;
    if (Types.ObjectId.isValid(id)) {
      profile = await CoachProfile.findById(id).populate('userId', 'name email avatar phone');
      if (!profile) {
        profile = await CoachProfile.findOne({ userId: id }).populate(
          'userId',
          'name email avatar phone',
        );
      }
    }
    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }
    return profile;
  }

  async getMyProfile(userId: string) {
    let profile = await CoachProfile.findOne({ userId }).populate(
      'userId',
      'name email avatar phone',
    );
    if (!profile) {
      const user = await UserModel.findById(userId);
      if (user && user.role === 'COACH') {
        profile = await CoachProfile.create({
          userId: user._id,
          fullName: user.name,
          title: 'Head Coach',
          coachType: 'INDIVIDUAL_COACH',
          yearsExperience: 0,
          overallRatingScore: 88,
          licenseStatus: 'UEFA Pro Licence',
          speciality: 'Tactical Coaching',
          cvTier: 'BRONZE',
          status: 'ACTIVE',
        });
        await profile.populate('userId', 'name email avatar phone');
      }
    }
    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }
    return profile;
  }

  async getAllProfiles(query: Record<string, unknown> = {}) {
    const searchableFields = [
      'fullName',
      'title',
      'currentClub',
      'birthCountry',
      'speciality',
      'cvTier',
      'status',
    ];

    const coachQuery = new QueryBuilder(
      CoachProfile.find().populate('userId', 'name email avatar phone'),
      query,
    )
      .search(searchableFields)
      .filter()
      .sort()
      .paginate()
      .fields();

    const data = await coachQuery.modelQuery;
    const meta = await coachQuery.countTotal();

    return { meta, data };
  }

  /**
   * Unified Profile & CV Update: Updates profile sections in one single PATCH call
   */
  async updateProfile(identifier: string, rawPayload: any) {
    let profile = null;
    if (Types.ObjectId.isValid(identifier)) {
      const objId = new Types.ObjectId(identifier);
      profile = await CoachProfile.findOne({
        $or: [{ _id: objId }, { userId: objId }],
      });
    }

    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }

    const payload = { ...rawPayload };

    // 1. Personal Information mapping
    const personalInfo = parseIfJson(payload.personalInformation);
    if (personalInfo && typeof personalInfo === 'object') {
      if (personalInfo.fullName !== undefined) profile.fullName = personalInfo.fullName;
      if (personalInfo.dateOfBirth !== undefined) profile.dateOfBirth = personalInfo.dateOfBirth;
      if (personalInfo.age !== undefined) profile.age = Number(personalInfo.age);
      if (personalInfo.birthCountry !== undefined) profile.birthCountry = personalInfo.birthCountry;
      if (personalInfo.birthCountryFlag !== undefined)
        profile.birthCountryFlag = personalInfo.birthCountryFlag;
      if (personalInfo.dualNationality !== undefined)
        profile.dualNationality = personalInfo.dualNationality;
      if (personalInfo.dualNationalityFlag !== undefined)
        profile.dualNationalityFlag = personalInfo.dualNationalityFlag;
    }

    // 2. Contact mapping
    const contact = parseIfJson(payload.contact);
    if (contact && typeof contact === 'object') {
      if (contact.email !== undefined) profile.email = contact.email;
      if (contact.phone !== undefined) profile.phone = contact.phone;
      if (contact.location !== undefined) profile.location = contact.location;
      if (contact.website !== undefined) profile.website = contact.website;
    }

    // 3. Season stats mapping
    const seasonStats = parseIfJson(payload.seasonStats);
    if (seasonStats && typeof seasonStats === 'object') {
      if (seasonStats.matchesCoached !== undefined)
        profile.matchesCoached = Number(seasonStats.matchesCoached);
      if (seasonStats.totalWins !== undefined) profile.totalWins = Number(seasonStats.totalWins);
      if (seasonStats.losses !== undefined) profile.losses = Number(seasonStats.losses);
      if (seasonStats.draws !== undefined) profile.draws = Number(seasonStats.draws);
      if (seasonStats.cleanSheets !== undefined)
        profile.cleanSheets = Number(seasonStats.cleanSheets);
    }

    // 4. Transfer status mapping
    const transferStatus = parseIfJson(payload.transferStatus);
    if (transferStatus && typeof transferStatus === 'object') {
      profile.transferStatus = {
        ...profile.transferStatus,
        ...transferStatus,
      };
    }

    // 5. Direct root scalar fields
    const directFields = [
      'fullName',
      'title',
      'yearsExperience',
      'overallRatingScore',
      'licenseStatus',
      'speciality',
      'status',
      'cvTier',
      'coachType',
      'additionalNotes',
      'profileImage',
      'coverImage',
      'currentClub',
      'clubLogo',
      'dateOfBirth',
      'age',
      'birthCountry',
      'birthCountryFlag',
      'dualNationality',
      'dualNationalityFlag',
      'website',
      'phone',
      'email',
      'location',
      'validationStatus',
      'matchesCoached',
      'totalWins',
      'losses',
      'draws',
      'cleanSheets',
    ];

    for (const key of directFields) {
      if (payload[key] !== undefined) {
        (profile as any)[key] = payload[key];
      }
    }

    // 6. Sub-arrays
    if (payload.accomplishments !== undefined) {
      profile.accomplishments = parseIfJson(payload.accomplishments);
      profile.markModified('accomplishments');
    }
    if (payload.coachStyles !== undefined) {
      profile.coachStyles = parseIfJson(payload.coachStyles);
      profile.markModified('coachStyles');
    }
    if (payload.languages !== undefined) {
      profile.languages = parseIfJson(payload.languages);
      profile.markModified('languages');
    }
    if (payload.majorTrophies !== undefined) {
      profile.majorTrophies = parseIfJson(payload.majorTrophies);
      profile.markModified('majorTrophies');
    }
    if (payload.cupsPlayed !== undefined) {
      profile.cupsPlayed = parseIfJson(payload.cupsPlayed);
      profile.markModified('cupsPlayed');
    }
    if (payload.keySkills !== undefined) {
      profile.keySkills = parseIfJson(payload.keySkills);
      profile.markModified('keySkills');
    }
    if (payload.courses !== undefined) {
      profile.courses = parseIfJson(payload.courses);
      profile.markModified('courses');
    }
    if (payload.associations !== undefined) {
      profile.associations = parseIfJson(payload.associations);
      profile.markModified('associations');
    }
    if (payload.clubHistory !== undefined) {
      const history = parseIfJson(payload.clubHistory);
      if (Array.isArray(history)) {
        if (payload.clubLogosByIndex && typeof payload.clubLogosByIndex === 'object') {
          for (const [idxStr, logoUrl] of Object.entries(payload.clubLogosByIndex)) {
            const idx = parseInt(idxStr, 10);
            if (history[idx]) {
              history[idx].logoUrl = logoUrl as string;
            }
          }
        }
        if (Array.isArray(payload.clubLogosList)) {
          payload.clubLogosList.forEach((logoUrl: string, idx: number) => {
            if (history[idx]) {
              history[idx].logoUrl = logoUrl;
            }
          });
        }
        profile.clubHistory = history;
        profile.markModified('clubHistory');

        const current = history.find((c: any) => c.isCurrent);
        if (current) {
          profile.currentClub = current.clubName;
          if (current.logoUrl) profile.clubLogo = current.logoUrl;
        }
      }
    }

    // 7. Single club item addition helper
    if (payload.addClub) {
      const newClub = parseIfJson(payload.addClub);
      if (newClub && typeof newClub === 'object') {
        if (!profile.clubHistory) profile.clubHistory = [];
        const item = {
          _id: new Types.ObjectId(),
          clubName: newClub.clubName || 'Club',
          role: newClub.role || 'Head Coach',
          period: newClub.period || '2020 - Present',
          startYear: newClub.startYear,
          endYear: newClub.endYear,
          isCurrent: newClub.isCurrent ?? false,
          logoUrl: newClub.logoUrl || payload.clubLogo,
        };
        if (item.isCurrent) {
          profile.clubHistory.forEach((c) => (c.isCurrent = false));
          profile.currentClub = item.clubName;
          if (item.logoUrl) profile.clubLogo = item.logoUrl;
        }
        profile.clubHistory.push(item as any);
        profile.markModified('clubHistory');
      }
    }

    // 8. Top 3 Formations handling directly inside PATCH
    if (payload.formations !== undefined) {
      const formationsList = parseIfJson(payload.formations);
      if (Array.isArray(formationsList)) {
        for (const f of formationsList) {
          if (f.formationSlot) {
            await TacticalFormation.findOneAndUpdate(
              { coachId: profile._id, formationSlot: f.formationSlot },
              {
                coachId: profile._id,
                formationSlot: f.formationSlot,
                formationName: `FORMATION ${f.formationSlot}`,
                positionsJson:
                  typeof f.positionsJson === 'string'
                    ? f.positionsJson
                    : JSON.stringify(f.positions || f.positionsJson || []),
              },
              { upsert: true, new: true },
            );
          }
        }
      }
    }

    const formationCount = await TacticalFormation.countDocuments({ coachId: profile._id });
    const { completionPercentage, autoTier } = computeCoachProfileCompletion(
      {
        ...profile.toObject(),
        formations: formationCount > 0 ? [1] : [],
      },
      undefined,
    );
    profile.profileCompletion = completionPercentage;
    profile.cvTier = autoTier;

    await profile.save();
    await coachCacheService.invalidateCoachCache(profile._id, profile.userId);

    // Return the updated full CV so the frontend UI updates immediately
    return coachCvService.getCoachCV(profile._id.toString());
  }

  async updateMyProfile(userId: string, payload: any) {
    return this.updateProfile(userId, payload);
  }

  async requestRevalidation(identifier: string) {
    let profile = null;
    if (Types.ObjectId.isValid(identifier)) {
      const objId = new Types.ObjectId(identifier);
      profile = await CoachProfile.findOne({
        $or: [{ _id: objId }, { userId: objId }],
      });
    }
    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }
    profile.revalidationRequested = true;
    profile.revalidationRequestedAt = new Date();
    await profile.save();
    await coachCacheService.invalidateCoachCache(profile._id, profile.userId);

    return {
      coachId: profile._id,
      revalidationRequested: true,
      message: 'Re-validation request submitted successfully',
    };
  }

  // ==========================================
  // SPECIFIC DELETES (CLUBS)
  // ==========================================
  async deleteClub(identifier: string, clubId: string) {
    let profile = null;
    if (Types.ObjectId.isValid(identifier)) {
      const objId = new Types.ObjectId(identifier);
      profile = await CoachProfile.findOne({
        $or: [{ _id: objId }, { userId: objId }],
      });
    }
    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }

    const clubs = profile.clubHistory || [];
    const index = clubs.findIndex((c: any) => c._id?.toString() === clubId);
    if (index === -1) {
      throw new AppError(404, 'Club not found in coach history');
    }

    const removed = clubs[index];
    if (removed.logoUrl) {
      deleteFromStorage(removed.logoUrl).catch(() => {});
    }

    clubs.splice(index, 1);
    profile.markModified('clubHistory');
    await profile.save();
    await coachCacheService.invalidateCoachCache(profile._id, profile.userId);

    return {
      coachId: profile._id,
      deletedClubId: clubId,
      clubHistory: profile.clubHistory,
    };
  }

  // ==========================================
  // DOCUMENTS / CERTIFICATES (DEDICATED CRUD)
  // ==========================================
  async getDocuments(identifier: string) {
    let profile = null;
    if (Types.ObjectId.isValid(identifier)) {
      const objId = new Types.ObjectId(identifier);
      profile = await CoachProfile.findOne({
        $or: [{ _id: objId }, { userId: objId }],
      });
    }
    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }
    return profile.documents || [];
  }

  async addDocument(
    identifier: string,
    payload: { title: string; fileUrl: string; fileType?: string },
  ) {
    let profile = null;
    if (Types.ObjectId.isValid(identifier)) {
      const objId = new Types.ObjectId(identifier);
      profile = await CoachProfile.findOne({
        $or: [{ _id: objId }, { userId: objId }],
      });
    }
    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }

    if (!profile.documents) {
      profile.documents = [];
    }

    const newDoc = {
      _id: new Types.ObjectId(),
      title: payload.title || 'Document',
      fileUrl: payload.fileUrl,
      fileType: payload.fileType || 'image/jpeg',
      uploadedAt: new Date(),
    } as any;

    profile.documents.push(newDoc);
    profile.markModified('documents');
    await profile.save();
    await coachCacheService.invalidateCoachCache(profile._id, profile.userId);

    return {
      coachId: profile._id,
      addedDocument: newDoc,
      documents: profile.documents,
    };
  }

  async deleteDocument(identifier: string, docId: string) {
    let profile = null;
    if (Types.ObjectId.isValid(identifier)) {
      const objId = new Types.ObjectId(identifier);
      profile = await CoachProfile.findOne({
        $or: [{ _id: objId }, { userId: objId }],
      });
    }
    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }

    const docs = profile.documents || [];
    const index = docs.findIndex((d: any) => d._id?.toString() === docId);
    if (index === -1) {
      throw new AppError(404, 'Document not found');
    }

    const removed = docs[index];
    if (removed.fileUrl) {
      deleteFromStorage(removed.fileUrl).catch(() => {});
    }

    docs.splice(index, 1);
    profile.markModified('documents');
    await profile.save();
    await coachCacheService.invalidateCoachCache(profile._id, profile.userId);

    return {
      coachId: profile._id,
      deletedDocumentId: docId,
      documents: profile.documents,
    };
  }

  // ==========================================
  // TESTIMONIALS (DEDICATED CRUD)
  // ==========================================
  async getTestimonials(identifier: string) {
    let coachId = identifier;
    if (Types.ObjectId.isValid(identifier)) {
      const coach = await CoachProfile.findOne({
        $or: [{ _id: new Types.ObjectId(identifier) }, { userId: new Types.ObjectId(identifier) }],
      });
      if (coach) {
        coachId = coach._id.toString();
      }
    }
    return CoachTestimonial.find({ coachId }).sort({ createdAt: -1 });
  }

  async addTestimonial(identifier: string, payload: Partial<ICoachTestimonial>) {
    let coachId = identifier;
    if (Types.ObjectId.isValid(identifier)) {
      const coach = await CoachProfile.findOne({
        $or: [{ _id: new Types.ObjectId(identifier) }, { userId: new Types.ObjectId(identifier) }],
      });
      if (coach) {
        coachId = coach._id.toString();
      }
    }
    return CoachTestimonial.create({ ...payload, coachId });
  }

  async updateTestimonial(
    identifier: string,
    testimonialId: string,
    payload: Partial<ICoachTestimonial>,
  ) {
    let coachId = identifier;
    if (Types.ObjectId.isValid(identifier)) {
      const coach = await CoachProfile.findOne({
        $or: [{ _id: new Types.ObjectId(identifier) }, { userId: new Types.ObjectId(identifier) }],
      });
      if (coach) {
        coachId = coach._id.toString();
      }
    }
    const testimonial = await CoachTestimonial.findOneAndUpdate(
      { _id: testimonialId, coachId },
      payload,
      { new: true, runValidators: true },
    );
    if (!testimonial) {
      throw new AppError(404, 'Testimonial not found');
    }
    return testimonial;
  }

  async deleteTestimonial(identifier: string, testimonialId: string) {
    let coachId = identifier;
    if (Types.ObjectId.isValid(identifier)) {
      const coach = await CoachProfile.findOne({
        $or: [{ _id: new Types.ObjectId(identifier) }, { userId: new Types.ObjectId(identifier) }],
      });
      if (coach) {
        coachId = coach._id.toString();
      }
    }
    const testimonial = await CoachTestimonial.findOneAndDelete({
      _id: testimonialId,
      coachId,
    });
    if (!testimonial) {
      throw new AppError(404, 'Testimonial not found');
    }
    if (testimonial.authorAvatar) {
      deleteFromStorage(testimonial.authorAvatar).catch(() => {});
    }
    return {
      deletedTestimonialId: testimonialId,
    };
  }

  // ==========================================
  // FORMATIONS (BACKWARD COMPATIBLE)
  // ==========================================
  async getTacticalFormations(coachId: string) {
    return TacticalFormation.find({ coachId }).sort({ formationSlot: 1 });
  }

  async saveTacticalFormation(coachId: string, payload: Partial<ITacticalFormation>) {
    return TacticalFormation.findOneAndUpdate(
      { coachId, formationSlot: payload.formationSlot },
      { ...payload, coachId },
      { new: true, upsert: true, runValidators: true },
    );
  }

  // ==========================================
  // PLAYER CV VALIDATION (STRICT PERMISSION LOCK)
  // ==========================================
  async validatePlayerCV(
    coachUserId: string,
    playerId: string,
    payload: {
      physicalSkills?: Record<string, number>;
      technicalSkills?: Record<string, number>;
      attributes?: Record<string, number>;
      coachFeedback?: string;
      certificateNote?: string;
    },
  ) {
    // 1. Check Coach registration with an official football club or academy
    const coach = await CoachProfile.findOne({ userId: coachUserId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const coachClub =
      coach.currentClub ||
      (Array.isArray(coach.clubHistory)
        ? coach.clubHistory.find((c: any) => c.isCurrent)?.clubName
        : null);

    if (!coachClub) {
      throw new AppError(
        403,
        'Only coaches who are officially registered with a football club or academy are authorised to validate player CVs.',
      );
    }

    // 2. Check Player existence
    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(404, 'Player profile not found');
    }

    // 3. Strict Supervision Check: Coaches cannot validate players from other teams or clubs
    const playerClub = player.currentClub || player.academy;
    const isSameClub =
      playerClub && coachClub && playerClub.trim().toLowerCase() === coachClub.trim().toLowerCase();
    const isDirectlyAssigned =
      player.verifyingCoachId && player.verifyingCoachId.toString() === coach.userId.toString();

    if (!isSameClub && !isDirectlyAssigned) {
      throw new AppError(
        403,
        `Coaches are not permitted to validate CVs belonging to players from other teams or clubs. You can only validate players currently registered with ${coachClub}.`,
      );
    }

    // 4. Strict Permissions Lock: Coach has permission ONLY to edit and assess Physical Skills & Technical Skills
    const physicalKeys = [
      'pace',
      'acceleration',
      'sprintSpeed',
      'stamina',
      'strength',
      'balance',
      'agility',
      'jumping',
      'reactions',
    ];
    const technicalKeys = [
      'ballControl',
      'dribbling',
      'shortPassing',
      'longPassing',
      'crossing',
      'shooting',
      'finishing',
      'longShots',
      'headingAccuracy',
      'weakFoot',
      'firstTouch',
      'tackling',
      'standingTackle',
      'slidingTackle',
      'interception',
      'interceptions',
    ];

    const allowedSkillsToUpdate: Record<string, number> = {};
    const rawSkills = {
      ...(payload.physicalSkills || {}),
      ...(payload.technicalSkills || {}),
      ...(payload.attributes || {}),
    };

    for (const [key, val] of Object.entries(rawSkills)) {
      if (physicalKeys.includes(key) || technicalKeys.includes(key)) {
        allowedSkillsToUpdate[key] = Math.max(0, Math.min(100, Number(val)));
      }
    }

    if (Object.keys(allowedSkillsToUpdate).length > 0) {
      await PlayerAttributes.findOneAndUpdate(
        { playerId: player._id },
        { $set: allowedSkillsToUpdate },
        { upsert: true, new: true },
      );
    }

    // 5. Issue Validation Certificate and lock verification details
    player.isVerifiedByCoach = true;
    player.verifyingCoachId = coach.userId;
    player.verifyingCoachLicense = coach.licenseStatus || 'UEFA Certified Coach';
    player.coachVerification = {
      isVerified: true,
      coachName: coach.fullName || 'Official Coach',
      licenseNumber: coach.licenseStatus || 'UEFA Licence',
      clubManaged: coachClub,
      verifiedAt: new Date(),
    };

    await player.save({ validateModifiedOnly: true });

    // 6. Recalculate stats & Tier
    await playerStatsService.recalculatePlayerStats(player._id);
    await playerCacheService.invalidatePlayerCache(player._id, player.userId);

    // 7. Send notification to player
    if (player.userId) {
      await notificationService.createNotification({
        recipientId: player.userId,
        recipientRole: 'PLAYER',
        title: 'Player CV Officially Validated!',
        message: `Your coach ${coach.fullName} (${coachClub}) has validated your CV and assessed your physical and technical skills.`,
        type: 'PLAYER_CV_VALIDATED',
        data: {
          coachId: coach._id,
          club: coachClub,
          license: coach.licenseStatus,
          verifiedAt: new Date(),
        },
      });
    }

    return {
      message: 'Player CV validated successfully by club coach',
      playerId: player._id,
      coachName: coach.fullName,
      club: coachClub,
      isVerified: true,
      updatedSkills: allowedSkillsToUpdate,
      verification: player.coachVerification,
    };
  }
}

export const coachService = new CoachService();
