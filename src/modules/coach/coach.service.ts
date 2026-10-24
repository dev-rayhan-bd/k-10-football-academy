import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { UserModel } from '@/modules/user/user.model';
import QueryBuilder from '@/builder/QueryBuilder';
import { deleteFromStorage } from '@/utils/fileUpload.utils';
import {
  ICoachProfile,
  ITacticalFormation,
  ICoachTestimonial,
  ICoachAnalyticsResponse,
  ICoachProfileAnalysis,
  ICoachTournamentStats,
  ICoachTrophyDetail,
} from './coach.interface';
import { CoachProfile, TacticalFormation, CoachTestimonial } from './coach.model';
import { coachCvService, computeCoachProfileCompletion } from './services/coach-cv.service';
import { coachCacheService } from './services/coach-cache.service';
import { PlayerProfile, PlayerAttributes, MatchRecord } from '@/modules/player/player.model';
import { PlayerEvaluation, Team } from '@/modules/academy/academy.model';
import { TrainingSession, TrainingAttendance } from '@/modules/training/training.model';
import { AttendanceStatus } from '@/modules/training/training.interface';
import { playerStatsService } from '@/modules/player/services/player-stats.service';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { NotificationService } from '@/modules/notification/notification.service';
import { Media } from '@/modules/media/media.model';

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

    const [picturesCount, videosCount, formationCount] = await Promise.all([
      Media.countDocuments({ coachId: profile._id, mediaType: 'IMAGE' }).catch(() => 0),
      Media.countDocuments({ coachId: profile._id, mediaType: 'VIDEO' }).catch(() => 0),
      TacticalFormation.countDocuments({ coachId: profile._id }).catch(() => 0),
    ]);

    const { completionPercentage, autoTier } = computeCoachProfileCompletion(
      profile,
      (profile.userId as any)?.avatar,
      picturesCount,
      videosCount,
      formationCount > 0,
    );
    if (profile.profileCompletion !== completionPercentage || profile.cvTier !== autoTier) {
      profile.profileCompletion = completionPercentage;
      profile.cvTier = autoTier;
      await CoachProfile.updateOne(
        { _id: profile._id },
        { profileCompletion: completionPercentage, cvTier: autoTier },
      );
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
          title: '',
          coachType: 'INDIVIDUAL_COACH',
          yearsExperience: 0,
          overallRatingScore: 0,
          licenseStatus: '',
          speciality: '',
          cvTier: 'BRONZE',
          status: 'ACTIVE',
        });
        await profile.populate('userId', 'name email avatar phone');
      }
    }
    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }

    const [picturesCount, videosCount, formationCount] = await Promise.all([
      Media.countDocuments({ coachId: profile._id, mediaType: 'IMAGE' }).catch(() => 0),
      Media.countDocuments({ coachId: profile._id, mediaType: 'VIDEO' }).catch(() => 0),
      TacticalFormation.countDocuments({ coachId: profile._id }).catch(() => 0),
    ]);

    const { completionPercentage, autoTier } = computeCoachProfileCompletion(
      profile,
      (profile.userId as any)?.avatar,
      picturesCount,
      videosCount,
      formationCount > 0,
    );
    if (profile.profileCompletion !== completionPercentage || profile.cvTier !== autoTier) {
      profile.profileCompletion = completionPercentage;
      profile.cvTier = autoTier;
      await CoachProfile.updateOne(
        { _id: profile._id },
        { profileCompletion: completionPercentage, cvTier: autoTier },
      );
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

    // Guard: Switching to CLUB_COACH requires an officially approved Academy affiliation
    if (payload.coachType === 'CLUB_COACH') {
      const isAffiliated = profile.isVerifiedByAcademy && profile.academyId;
      if (!isAffiliated) {
        throw new AppError(
          400,
          'Cannot switch to Club Coach mode without an officially approved affiliation from a registered Club or Academy.',
        );
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
    if (payload.coachProfileAnalysis !== undefined) {
      profile.coachProfileAnalysis = {
        ...(profile.coachProfileAnalysis || {}),
        ...parseIfJson(payload.coachProfileAnalysis),
      };
      profile.markModified('coachProfileAnalysis');
    }
    if (payload.tournamentStats !== undefined) {
      profile.tournamentStats = {
        ...(profile.tournamentStats || {}),
        ...parseIfJson(payload.tournamentStats),
      };
      profile.markModified('tournamentStats');
    }
    if (payload.trophiesTable !== undefined) {
      profile.trophiesTable = parseIfJson(payload.trophiesTable);
      profile.markModified('trophiesTable');
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

    // 1. Strict Club/Academy Registration Check: Coach MUST have an officially approved academy affiliation
    if (!coach.isVerifiedByAcademy || !coach.academyId) {
      throw new AppError(
        403,
        'Only coaches who are officially registered and approved by a football club or academy are authorised to validate player CVs.',
      );
    }

    const coachClub = coach.currentClub || 'Official Academy';

    // 2. Check Player existence
    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(404, 'Player profile not found');
    }

    // 3. Strict Supervision Check: Coaches cannot validate players from other teams or clubs
    const isSameAcademy =
      player.academyId &&
      coach.academyId &&
      player.academyId.toString() === coach.academyId.toString();

    const playerClub = player.currentClub || player.academy;
    const isSameClub =
      playerClub && coachClub && playerClub.trim().toLowerCase() === coachClub.trim().toLowerCase();

    const isDirectlyAssigned =
      player.verifyingCoachId && player.verifyingCoachId.toString() === coach.userId.toString();

    if (!isSameAcademy && !isSameClub && !isDirectlyAssigned) {
      throw new AppError(
        403,
        `Coaches are not permitted to validate CVs belonging to players from other teams or clubs. You can only validate players currently registered with your approved academy (${coachClub}).`,
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
      ...((payload as any).physical || {}),
      ...((payload as any).technical || {}),
      ...(payload.attributes || {}),
      ...(payload as any),
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
    if (coach.academyId && !player.academyId) {
      player.academyId = coach.academyId;
    }

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

  /**
   * Screen: "PLAYER CV VALIDATIONS" (Dashboard with 4 Cards & Table)
   */
  async getPlayerCvValidationsDashboard(userId: string, query: Record<string, unknown> = {}) {
    const coach = await CoachProfile.findOne({ userId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);

    const targetAcademyId = (query.academyId as string) || coach.academyId;
    const targetClub = (query.clubName as string) || coach.currentClub;

    // Filter players under coach's academy/club or verified by coach
    const playerFilter: any = {};
    if (targetAcademyId) {
      playerFilter.$or = [{ academyId: targetAcademyId }];
      if (targetClub) {
        playerFilter.$or.push({ currentClub: targetClub });
      }
    } else if (targetClub) {
      playerFilter.currentClub = targetClub;
    } else {
      playerFilter.$or = [
        { verifyingCoachId: coach.userId },
        { 'coachVerification.coachName': coach.fullName },
      ];
    }

    // Direct email search
    if (query.email && typeof query.email === 'string') {
      const emailRegex = new RegExp(String(query.email).trim(), 'i');
      const matchedUserIds = await UserModel.find({ email: emailRegex }).distinct('_id');
      playerFilter.userId = { $in: matchedUserIds };
      delete playerFilter.$or;
      delete playerFilter.currentClub;
    }

    // Search term filter (?searchTerm=...)
    if (query.searchTerm && typeof query.searchTerm === 'string') {
      const term = query.searchTerm.trim();
      const searchRegex = new RegExp(term, 'i');
      const matchedUserIds = await UserModel.find({
        $or: [{ email: searchRegex }, { name: searchRegex }],
      }).distinct('_id');

      const orClauses: any[] = [
        { fullName: searchRegex },
        { position: searchRegex },
        { currentClub: searchRegex },
        { country: searchRegex },
      ];

      if (matchedUserIds.length > 0) {
        orClauses.push({ userId: { $in: matchedUserIds } });
      }

      playerFilter.$and = playerFilter.$and || [];
      playerFilter.$and.push({ $or: orClauses });
    }

    const allMatchingPlayers = await PlayerProfile.find(playerFilter)
      .populate('userId', 'email name avatar')
      .lean();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    let pendingCount = 0;
    let verifiedCount = 0;
    let updatedThisMonthCount = 0;
    let expiredCount = 0;

    const playerIds = allMatchingPlayers.map((p) => p._id);

    // Aggregate match stats (goals, assists)
    const matchStatsAgg = await MatchRecord.aggregate([
      { $match: { playerId: { $in: playerIds } } },
      {
        $group: {
          _id: '$playerId',
          matches: { $sum: 1 },
          goals: {
            $sum: {
              $ifNull: ['$goals', { $ifNull: ['$stats.goalScored', 0] }],
            },
          },
          assists: {
            $sum: {
              $ifNull: ['$assists', { $ifNull: ['$stats.assists', 0] }],
            },
          },
        },
      },
    ]);

    const statsMap = new Map<string, any>();
    matchStatsAgg.forEach((s) => statsMap.set(s._id.toString(), s));

    const processedList: any[] = [];

    allMatchingPlayers.forEach((p: any) => {
      const verifiedAt = p.coachVerification?.verifiedAt
        ? new Date(p.coachVerification.verifiedAt)
        : null;
      const isVerified = Boolean(p.isVerifiedByCoach || p.coachVerification?.isVerified);

      let status: 'VERIFIED' | 'PENDING' | 'EXPIRED';

      if (isVerified && verifiedAt) {
        if (verifiedAt < oneYearAgo) {
          status = 'EXPIRED';
          expiredCount++;
        } else {
          status = 'VERIFIED';
          verifiedCount++;
        }
      } else {
        status = 'PENDING';
        pendingCount++;
      }

      const updatedAt = new Date(p.updatedAt || p.createdAt || 0);
      if (updatedAt >= startOfMonth || (verifiedAt && verifiedAt >= startOfMonth)) {
        updatedThisMonthCount++;
      }

      const st = statsMap.get(p._id.toString()) || { goals: 0, assists: 0, matches: 0 };

      processedList.push({
        _id: p._id,
        name: p.fullName,
        email: (p.userId as any)?.email || '',
        position: p.position,
        avatar: p.profileImage || (p.userId as any)?.avatar || '',
        rating: p.overallRating || 0,
        club: p.currentClub || coach.currentClub || 'Academy Player',
        goals: st.goals,
        assists: st.assists,
        matches: st.matches,
        lastValidated: verifiedAt ? verifiedAt.toISOString().split('T')[0] : 'Never',
        status,
        createdAt: p.createdAt,
      });
    });

    // Filter by tab status if passed (?status=VERIFIED or PENDING or EXPIRED)
    let filteredList = processedList;
    if (query.status && typeof query.status === 'string' && query.status !== 'ALL') {
      const s = query.status.toUpperCase().trim();
      filteredList = processedList.filter((item) => item.status === s);
    }

    const total = filteredList.length;
    const totalPage = Math.ceil(total / limit) || 1;
    const skip = (page - 1) * limit;
    const paginatedList = filteredList.slice(skip, skip + limit);

    return {
      meta: {
        page,
        limit,
        total,
        totalPage,
      },
      data: {
        summary: {
          pendingValidations: pendingCount,
          verifiedCvs: verifiedCount,
          updatedThisMonth: updatedThisMonthCount,
          expiredStatus: expiredCount,
        },
        players: paginatedList,
      },
    };
  }

  // ==========================================
  // COACH ANALYTICS (RADAR, PIE, BAR & TROPHIES TABLE)
  // ==========================================
  async getCoachAnalytics(coachIdentifier: string): Promise<ICoachAnalyticsResponse> {
    let profile: any = null;
    if (Types.ObjectId.isValid(coachIdentifier)) {
      const objId = new Types.ObjectId(coachIdentifier);
      profile = await CoachProfile.findOne({
        $or: [{ _id: objId }, { userId: objId }],
      });
    }

    if (!profile) {
      throw new AppError(404, 'Coach profile not found');
    }

    // Fetch linked formations and testimonials in parallel for real aggregation
    const [formations, testimonials] = await Promise.all([
      TacticalFormation.find({ coachId: profile._id }).lean(),
      CoachTestimonial.find({ coachId: profile._id }).lean(),
    ]);

    // Real media counts and formations for accurate tier and completion calculation
    const [picturesCount, videosCount, formationCount] = await Promise.all([
      Media.countDocuments({ coachId: profile._id, mediaType: 'IMAGE' }).catch(() => 0),
      Media.countDocuments({ coachId: profile._id, mediaType: 'VIDEO' }).catch(() => 0),
      TacticalFormation.countDocuments({ coachId: profile._id }).catch(() => 0),
    ]);

    const { completionPercentage, autoTier } = computeCoachProfileCompletion(
      profile,
      (profile.userId as any)?.avatar,
      picturesCount,
      videosCount,
      formationCount > 0,
    );

    if (profile.cvTier !== autoTier || profile.profileCompletion !== completionPercentage) {
      profile.cvTier = autoTier;
      profile.profileCompletion = completionPercentage;
      await CoachProfile.updateOne(
        { _id: profile._id },
        { cvTier: autoTier, profileCompletion: completionPercentage },
      );
    }

    // 1. Radar Profile Analysis (Calculated directly from Coach DB records)
    let coachProfileAnalysis: ICoachProfileAnalysis | null;
    if (profile.coachProfileAnalysis && Object.keys(profile.coachProfileAnalysis).length > 0) {
      const raw = profile.coachProfileAnalysis;
      const tactics = Number(raw.tactics ?? 0);
      const leadership = Number(raw.leadership ?? 0);
      const communication = Number(raw.communication ?? 0);
      const adaptability = Number(raw.adaptability ?? 0);
      const discipline = Number(raw.discipline ?? 0);
      const development = Number(raw.development ?? 0);
      const overall =
        raw.overall !== undefined
          ? Number(raw.overall)
          : Math.round(
              (tactics + leadership + communication + adaptability + discipline + development) / 6,
            );

      coachProfileAnalysis = {
        tactics,
        leadership,
        communication,
        adaptability,
        discipline,
        development,
        overall,
      };
    } else {
      // Aggregate from real DB fields (no mock numbers)
      const baseRating = Number(profile.overallRatingScore || 0);
      const totalMatches = Number(profile.matchesCoached || 0);
      const wins = Number(profile.totalWins || 0);
      const cleanSheets = Number(profile.cleanSheets || 0);
      const winRatio = totalMatches > 0 ? wins / totalMatches : 0;
      const cleanSheetRatio = totalMatches > 0 ? cleanSheets / totalMatches : 0;

      const formationsCount = (formations || []).length;
      const coursesCount = Array.isArray(profile.courses) ? profile.courses.length : 0;
      const languagesCount = Array.isArray(profile.languages) ? profile.languages.length : 0;
      const clubsCount = Array.isArray(profile.clubHistory) ? profile.clubHistory.length : 0;
      const yearsExp = Number(profile.yearsExperience || 0);
      const avgRating =
        testimonials.length > 0
          ? testimonials.reduce((acc: number, t: any) => acc + Number(t.rating || 0), 0) /
            testimonials.length
          : 0;

      if (baseRating === 0 && totalMatches === 0 && yearsExp === 0 && formationsCount === 0) {
        coachProfileAnalysis = {
          tactics: 0,
          leadership: 0,
          communication: 0,
          adaptability: 0,
          discipline: 0,
          development: 0,
          overall: 0,
        };
      } else {
        const effectiveBase = baseRating > 0 ? baseRating : Math.min(75, 50 + yearsExp * 2);
        const tactics = Math.min(
          99,
          Math.max(0, Math.round(effectiveBase + (formationsCount >= 2 ? 3 : 0))),
        );
        const leadership = Math.min(
          99,
          Math.max(
            0,
            Math.round(
              effectiveBase + Math.min(5, Math.floor(yearsExp / 3)) + (winRatio > 0.6 ? 2 : 0),
            ),
          ),
        );
        const communication = Math.min(
          99,
          Math.max(
            0,
            Math.round(effectiveBase + Math.min(4, languagesCount * 2) + (avgRating >= 4 ? 2 : 0)),
          ),
        );
        const adaptability = Math.min(
          99,
          Math.max(0, Math.round(effectiveBase + Math.min(4, clubsCount * 2))),
        );
        const discipline = Math.min(
          99,
          Math.max(0, Math.round(effectiveBase + Math.min(5, Math.round(cleanSheetRatio * 10)))),
        );
        const development = Math.min(
          99,
          Math.max(
            0,
            Math.round(
              effectiveBase + Math.min(4, coursesCount) + (profile.youthYearsExperience ? 2 : 0),
            ),
          ),
        );
        const overall = Math.round(
          (tactics + leadership + communication + adaptability + discipline + development) / 6,
        );

        coachProfileAnalysis = {
          tactics,
          leadership,
          communication,
          adaptability,
          discipline,
          development,
          overall,
        };
      }
    }

    // 2. Tournament Stats (Pie Chart & Percentages - aggregated from real match records)
    let tournamentStats: ICoachTournamentStats | null;
    if (profile.tournamentStats && Object.keys(profile.tournamentStats).length > 0) {
      const raw = profile.tournamentStats;
      const win = Number(raw.win ?? 0);
      const loss = Number(raw.loss ?? 0);
      const draw = Number(raw.draw ?? 0);
      const runnerUp = Number(raw.runnerUp ?? 0);
      const champion = Number(raw.champion ?? 0);
      const totalMatches = win + loss + draw + runnerUp + champion;

      const percentages =
        totalMatches > 0
          ? {
              win: Math.round((win / totalMatches) * 100),
              loss: Math.round((loss / totalMatches) * 100),
              draw: Math.round((draw / totalMatches) * 100),
              runnerUp: Math.round((runnerUp / totalMatches) * 100),
              champion: Math.round((champion / totalMatches) * 100),
            }
          : {
              win: 0,
              loss: 0,
              draw: 0,
              runnerUp: 0,
              champion: 0,
            };

      tournamentStats = {
        win,
        loss,
        draw,
        runnerUp,
        champion,
        totalMatches,
        percentages,
      };
    } else {
      const win = Number(profile.totalWins || 0);
      const loss = Number(profile.losses || 0);
      const draw = Number(profile.draws || 0);
      const champion = Array.isArray(profile.majorTrophies)
        ? profile.majorTrophies.reduce((acc: number, t: any) => acc + Number(t.count || 0), 0)
        : 0;
      const runnerUp = Array.isArray(profile.cupsPlayed)
        ? Math.max(0, profile.cupsPlayed.length - champion)
        : 0;

      const totalMatches =
        Number(profile.matchesCoached) ||
        win + loss + draw + runnerUp + champion ||
        win + loss + draw;

      const percentages =
        totalMatches > 0
          ? {
              win: Math.round((win / totalMatches) * 100),
              loss: Math.round((loss / totalMatches) * 100),
              draw: Math.round((draw / totalMatches) * 100),
              runnerUp: Math.min(100, Math.round((runnerUp / totalMatches) * 100)),
              champion: Math.min(100, Math.round((champion / totalMatches) * 100)),
            }
          : {
              win: 0,
              loss: 0,
              draw: 0,
              runnerUp: 0,
              champion: 0,
            };

      tournamentStats = {
        win,
        loss,
        draw,
        runnerUp,
        champion,
        totalMatches: totalMatches || 0,
        percentages,
      };
    }

    // 3. Major Trophies (Bar Chart) - Strictly from DB
    const majorTrophies: Array<{ name: string; value: number }> =
      Array.isArray(profile.majorTrophies) && profile.majorTrophies.length > 0
        ? profile.majorTrophies.map((t: any) => ({
            name: (t.title || 'TROPHY').toUpperCase(),
            value: Number(t.count || 1),
          }))
        : [];

    // 4. Trophies Table - Aggregated directly from DB majorTrophies and match history
    let trophiesTable: ICoachTrophyDetail[] = [];
    if (Array.isArray(profile.trophiesTable) && profile.trophiesTable.length > 0) {
      trophiesTable = profile.trophiesTable;
    } else if (Array.isArray(profile.majorTrophies) && profile.majorTrophies.length > 0) {
      const trophiesCount = profile.majorTrophies.length;
      trophiesTable = profile.majorTrophies.map((t: any) => {
        const champCount = Number(t.count || 1);
        const matches =
          Number(profile.matchesCoached || 0) > 0
            ? Math.max(champCount, Math.round(Number(profile.matchesCoached) / trophiesCount))
            : champCount;
        const wins =
          Number(profile.totalWins || 0) > 0
            ? Math.max(champCount, Math.round(Number(profile.totalWins) / trophiesCount))
            : champCount;
        const losses =
          Number(profile.losses || 0) > 0 ? Math.round(Number(profile.losses) / trophiesCount) : 0;
        const draws = Math.max(0, matches - wins - losses);

        return {
          _id: t._id,
          trophyName: (t.title || 'Tournament').toUpperCase(),
          number: matches,
          win: wins,
          loss: losses,
          draw: draws,
          runnerUp: 0,
          champion: champCount,
        };
      });
    }

    return {
      coachType: profile.coachType,
      cvTier: autoTier,
      coachProfileAnalysis,
      tournamentStats,
      majorTrophies,
      trophiesTable,
    };
  }

  /**
   * Screen: "MY TEAMS"
   * Top 4 Metric Cards (TOTAL PLAYERS, AVG RATING, ACTIVE, INJURED)
   * + Squad Players table (Name, Rating, Matches, Goals, Assists, Status, Actions)
   * With Pagination & Email/Name Search
   */
  async getMyTeamsSquad(userId: string, query: Record<string, unknown> = {}) {
    const coach = await CoachProfile.findOne({ userId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);

    // Determine target academy / club
    const targetAcademyId = (query.academyId as string) || coach.academyId;
    const targetClub = (query.clubName as string) || coach.currentClub;

    // Resolve coach's teams
    const coachTeams = await Team.find({
      $or: [{ coachIds: coach._id }, ...(coach.academyId ? [{ academyId: coach.academyId }] : [])],
    }).lean();
    const coachTeamIds = coachTeams.map((t) => t._id);
    const teamPlayerIds = coachTeams.flatMap((t) => t.playerIds || []);

    // Filter condition for players
    const playerFilter: any = {};
    const hasExplicitEmail = Boolean(query.email && typeof query.email === 'string');
    const isGlobalScope = query.scope === 'all' || query.all === 'true';

    // If not searching for a specific email globally, scope to coach's academy/club/teams
    if (!hasExplicitEmail && !isGlobalScope) {
      const orScopes: any[] = [];
      if (teamPlayerIds.length > 0) {
        orScopes.push({ _id: { $in: teamPlayerIds } });
      }
      if (targetAcademyId) {
        orScopes.push({ academyId: targetAcademyId });
      }
      if (targetClub) {
        orScopes.push({ currentClub: targetClub });
      }
      if (orScopes.length > 0) {
        playerFilter.$or = orScopes;
      } else {
        // If coach is independent or unverified, look for players supervised by this coach
        playerFilter.$or = [
          { verifyingCoachId: coach.userId },
          { 'coachVerification.coachName': coach.fullName },
        ];
      }
    }

    // 1. Direct Email Filter (?email=...)
    if (hasExplicitEmail) {
      const emailRegex = new RegExp(String(query.email).trim(), 'i');
      const matchedUserIds = await UserModel.find({ email: emailRegex }).distinct('_id');
      playerFilter.userId = { $in: matchedUserIds };
    }

    // 2. Search term filter (?searchTerm=...) covering email, name, position, country
    if (query.searchTerm && typeof query.searchTerm === 'string') {
      const term = query.searchTerm.trim();
      const searchRegex = new RegExp(term, 'i');
      const matchedUserIds = await UserModel.find({
        $or: [{ email: searchRegex }, { name: searchRegex }],
      }).distinct('_id');

      const orClauses: any[] = [
        { fullName: searchRegex },
        { position: searchRegex },
        { country: searchRegex },
      ];

      if (matchedUserIds.length > 0) {
        orClauses.push({ userId: { $in: matchedUserIds } });
      }

      playerFilter.$and = playerFilter.$and || [];
      playerFilter.$and.push({ $or: orClauses });
    }

    // 3. Status filter (?status=ACTIVE or ?status=INJURED)
    if (query.status && typeof query.status === 'string' && query.status !== 'ALL') {
      playerFilter.fitnessStatus = query.status.toUpperCase();
    }

    // Resolve date & training sessions for attendance tracking
    const selectedDateStr =
      typeof query.date === 'string' && query.date.trim()
        ? query.date.trim()
        : new Date().toISOString().split('T')[0];

    const startOfDay = new Date(selectedDateStr);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDateStr);
    endOfDay.setHours(23, 59, 59, 999);

    const sessionOr: any[] = [{ coachId: coach._id }];
    if (coach.academyId) sessionOr.push({ academyId: coach.academyId });
    if (coachTeamIds.length > 0) sessionOr.push({ teamId: { $in: coachTeamIds } });

    const availableSessions = await TrainingSession.find({
      sessionDate: { $gte: startOfDay, $lte: endOfDay },
      $or: sessionOr,
    })
      .populate('teamId', 'teamName ageGroup')
      .sort({ startTime: 1 })
      .lean();

    let activeSession: any = null;
    if (
      query.sessionId &&
      typeof query.sessionId === 'string' &&
      Types.ObjectId.isValid(query.sessionId)
    ) {
      activeSession =
        availableSessions.find((s) => s._id.toString() === query.sessionId) ||
        (await TrainingSession.findById(query.sessionId)
          .populate('teamId', 'teamName ageGroup')
          .lean());
    } else if (availableSessions.length > 0) {
      activeSession = availableSessions[0];
    }

    // Lookup existing attendance records for the active session
    const attendanceMap = new Map<string, any>();
    if (activeSession) {
      const attendances = await TrainingAttendance.find({ sessionId: activeSession._id }).lean();
      attendances.forEach((a) => {
        const pid = a.playerId?.toString() || a.childPlayerId?.toString();
        if (pid) attendanceMap.set(pid, a);
      });
    }

    const allMatchingPlayers = await PlayerProfile.find(playerFilter)
      .populate('userId', 'email name avatar')
      .select(
        'fullName position overallRating profileImage fitnessStatus transferStatus currentClub country age userId jerseyNumber',
      )
      .lean();

    const totalCount = allMatchingPlayers.length;
    const totalPage = Math.ceil(totalCount / limit) || 1;

    const sessionInfo = {
      selectedDate: selectedDateStr,
      activeSession: activeSession
        ? {
            _id: activeSession._id,
            id: activeSession._id,
            sessionName:
              activeSession.sessionName || activeSession.sessionTitle || 'Daily Training Session',
            sessionDate: activeSession.sessionDate,
            startTime: activeSession.startTime,
            endTime: activeSession.endTime,
            timeRange: `${activeSession.startTime} - ${activeSession.endTime}`,
            trainingLocation:
              activeSession.trainingLocation || activeSession.locationField || 'Main Field',
            sessionType: activeSession.sessionType || 'Technical',
            focusArea: activeSession.focusArea || 'Team Practice',
            presentCount: activeSession.presentCount || 0,
            lateCount: activeSession.lateCount || 0,
            absentCount: activeSession.absentCount || 0,
            unmarkedCount: activeSession.unmarkedCount || 0,
            totalPlayers: activeSession.totalPlayers || totalCount,
            attendancePercentage: activeSession.attendancePercentage || 0,
            isAttendanceCompleted: Boolean(activeSession.isAttendanceCompleted),
          }
        : null,
      availableSessions: availableSessions.map((s: any) => ({
        _id: s._id,
        id: s._id,
        sessionName: s.sessionName || s.sessionTitle || 'Training Session',
        sessionDate: s.sessionDate,
        startTime: s.startTime,
        endTime: s.endTime,
        timeRange: `${s.startTime} - ${s.endTime}`,
        trainingLocation: s.trainingLocation || s.locationField || 'Main Field',
        teamName: (s.teamId as any)?.teamName || '',
        presentCount: s.presentCount || 0,
        totalPlayers: s.totalPlayers || 0,
      })),
    };

    if (totalCount === 0) {
      return {
        meta: {
          page,
          limit,
          total: 0,
          totalPage: 1,
        },
        data: {
          summary: {
            totalPlayers: 0,
            avgRating: 0,
            active: 0,
            injured: 0,
          },
          academy: {
            id: coach.academyId || null,
            name: coach.currentClub || '',
            logo: coach.clubLogo || '',
          },
          sessionInfo,
          players: [],
        },
      };
    }

    const playerIds = allMatchingPlayers.map((p) => p._id);

    // Aggregate match stats for all matching players
    const matchStatsAgg = await MatchRecord.aggregate([
      { $match: { playerId: { $in: playerIds } } },
      {
        $group: {
          _id: '$playerId',
          matches: { $sum: 1 },
          goals: {
            $sum: {
              $ifNull: ['$goals', { $ifNull: ['$stats.goalScored', 0] }],
            },
          },
          assists: {
            $sum: {
              $ifNull: ['$assists', { $ifNull: ['$stats.assists', 0] }],
            },
          },
          avgMatchRating: { $avg: '$playerRating' },
        },
      },
    ]);

    const statsMap = new Map<string, any>();
    matchStatsAgg.forEach((s) => {
      statsMap.set(s._id.toString(), s);
    });

    let totalRatingSum = 0;
    let activeCount = 0;
    let injuredCount = 0;

    const formattedPlayers = allMatchingPlayers.map((p: any) => {
      const st = statsMap.get(p._id.toString()) || { matches: 0, goals: 0, assists: 0 };

      // Compute display rating (e.g. 9.2 or 8.8)
      let rating = 0;
      if (p.overallRating) {
        rating =
          p.overallRating > 10 ? Math.round((p.overallRating / 10) * 10) / 10 : p.overallRating;
      } else if (st.avgMatchRating) {
        rating = Math.round(st.avgMatchRating * 10) / 10;
      }
      totalRatingSum += rating;

      const fitnessStatus = (p.fitnessStatus ||
        (p.transferStatus?.status === 'Injured' ? 'INJURED' : 'ACTIVE')) as 'ACTIVE' | 'INJURED';
      if (fitnessStatus === 'INJURED') {
        injuredCount++;
      } else {
        activeCount++;
      }

      // Resolve player attendance for the active session
      const att = activeSession ? attendanceMap.get(p._id.toString()) : null;
      const attStatus = (att?.status || att?.attendanceStatus || 'UNMARKED').toUpperCase();
      const isIn = attStatus === 'PRESENT' || attStatus === 'LATE';

      return {
        _id: p._id,
        id: p._id,
        name: p.fullName,
        email: (p.userId as any)?.email || '',
        position: p.position || 'FORWARD',
        avatar: p.profileImage || (p.userId as any)?.avatar || '',
        jerseyNumber: p.jerseyNumber ? `#${p.jerseyNumber}` : '',
        rating,
        matches: st.matches || 0,
        goals: st.goals || 0,
        assists: st.assists || 0,
        status: fitnessStatus,
        country: p.country,
        age: p.age,
        attendance: {
          sessionId: activeSession?._id || null,
          attendanceId: att?._id || null,
          status: attStatus,
          isAttended: isIn,
          isIn,
          markedAt:
            att?.signInTime ||
            (att?.updatedAt
              ? new Date(att.updatedAt).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })
              : null),
          rsvpStatus: att?.rsvpStatus || 'PENDING',
          notes: att?.notes || '',
        },
      };
    });

    const avgRating =
      formattedPlayers.length > 0
        ? Math.round((totalRatingSum / formattedPlayers.length) * 10) / 10
        : 0;

    // Apply pagination slice
    const skip = (page - 1) * limit;
    const paginatedPlayers = formattedPlayers.slice(skip, skip + limit);

    return {
      meta: {
        page,
        limit,
        total: totalCount,
        totalPage,
      },
      data: {
        summary: {
          totalPlayers: totalCount,
          avgRating,
          active: activeCount,
          injured: injuredCount,
        },
        academy: {
          id: coach.academyId || null,
          name: coach.currentClub || '',
          logo: coach.clubLogo || '',
        },
        sessionInfo,
        players: paginatedPlayers,
      },
    };
  }

  /**
   * Fast Coach Attendance Tick / Sign In - Sign Out
   * When player arrives on pitch, coach ticks (isIn: true) -> 'PRESENT' & records signInTime
   * When player leaves pitch, coach unticks (isIn: false) -> 'ABSENT'/'OUT' & records signOutTime
   */
  async tickPlayerAttendance(
    userId: string,
    payload: {
      playerId: string;
      sessionId?: string;
      teamId?: string;
      date?: string;
      isIn?: boolean;
      status?: 'PRESENT' | 'LATE' | 'ABSENT' | 'UNMARKED' | 'EXCUSED';
      time?: string;
      notes?: string;
    },
  ) {
    const coach = await CoachProfile.findOne({ userId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const player = await PlayerProfile.findById(payload.playerId);
    if (!player) {
      throw new AppError(404, 'Player not found');
    }

    let session: any;
    const dateStr = payload.date || new Date().toISOString().split('T')[0];
    const sessionDate = new Date(dateStr);

    if (payload.sessionId && Types.ObjectId.isValid(payload.sessionId)) {
      session = await TrainingSession.findById(payload.sessionId);
      if (!session) {
        throw new AppError(404, 'Specified training session not found');
      }
    } else {
      // Find session for this date & coach/team
      const startOfDay = new Date(sessionDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(sessionDate);
      endOfDay.setHours(23, 59, 59, 999);

      const coachTeams = await Team.find({
        $or: [
          { coachIds: coach._id },
          ...(coach.academyId ? [{ academyId: coach.academyId }] : []),
        ],
      }).lean();
      const coachTeamIds = coachTeams.map((t) => t._id);

      const sessionOr: any[] = [{ coachId: coach._id }];
      if (coach.academyId) sessionOr.push({ academyId: coach.academyId });
      if (coachTeamIds.length > 0) sessionOr.push({ teamId: { $in: coachTeamIds } });
      if (payload.teamId && Types.ObjectId.isValid(payload.teamId)) {
        sessionOr.unshift({ teamId: payload.teamId });
      }

      session = await TrainingSession.findOne({
        sessionDate: { $gte: startOfDay, $lte: endOfDay },
        $or: sessionOr,
      }).sort({ createdAt: -1 });

      // If no session exists yet for today, auto-create one so coach's tick is zero-friction!
      if (!session) {
        let targetTeamId: any = payload.teamId;
        if (!targetTeamId && coachTeamIds.length > 0) targetTeamId = coachTeamIds[0];
        if (!targetTeamId) {
          const teamWithPlayer = await Team.findOne({ playerIds: player._id });
          if (teamWithPlayer) targetTeamId = teamWithPlayer._id;
        }

        const academyId = coach.academyId || player.academyId;
        if (!targetTeamId) {
          let defaultTeam = await Team.findOne({ academyId: academyId || coach._id });
          if (!defaultTeam && academyId) {
            defaultTeam = await Team.create({
              academyId,
              teamName: coach.currentClub ? `${coach.currentClub} Squad` : 'Academy Squad',
              ageGroup: 'U-17',
              coachIds: [coach._id],
              playerIds: [player._id],
            });
          }
          targetTeamId = defaultTeam?._id;
        }

        session = await TrainingSession.create({
          academyId: academyId || coach._id,
          teamId: targetTeamId,
          coachId: coach._id,
          sessionName: `${coach.fullName ? coach.fullName + "'s " : ''}Daily Training Session`,
          sessionTitle: 'Daily Training Session',
          sessionDate,
          startTime: '09:00 AM',
          endTime: '11:00 AM',
          trainingLocation: coach.currentClub ? `${coach.currentClub} Ground` : 'Main Pitch',
          locationField: 'Main Pitch',
          sessionType: 'Technical',
          focusArea: 'Team Practice & Fitness',
          totalPlayers: 1,
          unmarkedCount: 1,
        });
      }
    }

    // Determine status & In/Out (handles PRESENT, LATE, ABSENT, UNMARKED)
    const nowTimeStr =
      payload.time ||
      new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

    let status: AttendanceStatus;
    let isIn: boolean;

    if (payload.status) {
      status = payload.status;
      isIn = status === 'PRESENT' || status === 'LATE';
    } else if (payload.isIn !== undefined) {
      isIn = payload.isIn;
      status = isIn ? 'PRESENT' : 'ABSENT';
    } else {
      status = 'PRESENT';
      isIn = true;
    }

    const updateData: any = {
      sessionId: session._id,
      playerId: player._id,
      childPlayerId: player._id,
      status,
      attendanceStatus: status,
      markedBy: coach.userId,
    };
    if (payload.notes) updateData.notes = payload.notes;

    if (status === 'PRESENT' || status === 'LATE') {
      updateData.signInTime = nowTimeStr;
    } else if (status === 'ABSENT') {
      updateData.signOutTime = nowTimeStr;
    }

    await TrainingAttendance.findOneAndUpdate(
      { sessionId: session._id, $or: [{ playerId: player._id }, { childPlayerId: player._id }] },
      { $set: updateData },
      { upsert: true, new: true },
    );

    // Recalculate session statistics
    const allSessionAttendances = await TrainingAttendance.find({ sessionId: session._id }).lean();
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let unmarkedCount = 0;

    allSessionAttendances.forEach((a) => {
      const st = (a.status || a.attendanceStatus || 'UNMARKED').toUpperCase();
      if (st === 'PRESENT') presentCount++;
      else if (st === 'LATE') lateCount++;
      else if (st === 'ABSENT') absentCount++;
      else unmarkedCount++;
    });

    const total = allSessionAttendances.length;
    session.presentCount = presentCount;
    session.lateCount = lateCount;
    session.absentCount = absentCount;
    session.unmarkedCount = unmarkedCount;
    session.totalPlayers = Math.max(total, session.totalPlayers || 0);
    session.attendancePercentage =
      total > 0 ? Math.round(((presentCount + lateCount) / total) * 100) : 0;
    session.isAttendanceCompleted = unmarkedCount === 0 && total > 0;
    await session.save();

    const statusMessages: Record<string, string> = {
      PRESENT: 'Player marked present successfully',
      LATE: 'Player marked late successfully',
      ABSENT: 'Player marked absent successfully',
      UNMARKED: 'Player attendance unmarked',
    };

    return {
      message: statusMessages[status] || 'Player attendance updated successfully',
      attendance: {
        sessionId: session._id,
        sessionName: session.sessionName || session.sessionTitle,
        sessionDate: session.sessionDate,
        playerId: player._id,
        playerName: player.fullName,
        position: player.position,
        jerseyNumber: (player as any).jerseyNumber || (player as any).kitNumber || '',
        avatar: player.profileImage,
        status,
        isAttended: isIn,
        isIn,
        markedAt: nowTimeStr,
        markedBy: coach.fullName || 'Coach',
        notes: payload.notes || '',
      },
      sessionStats: {
        presentCount,
        lateCount,
        absentCount,
        unmarkedCount,
        totalPlayers: session.totalPlayers,
        attendancePercentage: session.attendancePercentage,
        isAttendanceCompleted: session.isAttendanceCompleted,
      },
    };
  }

  /**
   * Bulk Update Coach Attendance (Multiple players or Mark All Present/Absent)
   */
  async bulkUpdateCoachAttendance(
    userId: string,
    payload: {
      sessionId?: string;
      teamId?: string;
      date?: string;
      markAll?: 'PRESENT' | 'ABSENT' | 'CLEAR' | 'UNMARKED';
      attendances?: Array<{
        playerId: string;
        isIn?: boolean;
        status?: 'PRESENT' | 'LATE' | 'ABSENT' | 'UNMARKED' | 'EXCUSED';
        notes?: string;
        time?: string;
      }>;
    },
  ) {
    const coach = await CoachProfile.findOne({ userId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    let session: any = null;
    const dateStr = payload.date || new Date().toISOString().split('T')[0];
    const sessionDate = new Date(dateStr);

    if (payload.sessionId && Types.ObjectId.isValid(payload.sessionId)) {
      session = await TrainingSession.findById(payload.sessionId);
    }
    if (!session) {
      const startOfDay = new Date(sessionDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(sessionDate);
      endOfDay.setHours(23, 59, 59, 999);

      session = await TrainingSession.findOne({
        sessionDate: { $gte: startOfDay, $lte: endOfDay },
        $or: [{ coachId: coach._id }, ...(coach.academyId ? [{ academyId: coach.academyId }] : [])],
      }).sort({ createdAt: -1 });
    }

    if (!session) {
      throw new AppError(404, 'Training session not found for attendance update');
    }

    const nowTimeStr = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    // 1. Mark All Present / Absent
    if (payload.markAll) {
      const targetStatus = payload.markAll === 'PRESENT' ? 'PRESENT' : 'ABSENT';
      await TrainingAttendance.updateMany(
        { sessionId: session._id },
        {
          $set: {
            status: targetStatus,
            attendanceStatus: targetStatus,
            markedBy: coach.userId,
            ...(targetStatus === 'PRESENT'
              ? { signInTime: nowTimeStr }
              : { signOutTime: nowTimeStr }),
          },
        },
      );
    }

    // 2. Process list
    if (Array.isArray(payload.attendances)) {
      for (const item of payload.attendances) {
        if (!item.playerId) continue;
        let st: AttendanceStatus = item.status || 'PRESENT';
        let isIn = item.isIn;
        if (isIn !== undefined) {
          st = isIn ? 'PRESENT' : 'ABSENT';
        } else {
          isIn = st === 'PRESENT' || st === 'LATE';
        }

        const updateData: any = {
          sessionId: session._id,
          playerId: item.playerId,
          childPlayerId: item.playerId,
          status: st,
          attendanceStatus: st,
          markedBy: coach.userId,
        };
        if (item.notes) updateData.notes = item.notes;
        if (isIn) updateData.signInTime = item.time || nowTimeStr;
        else updateData.signOutTime = item.time || nowTimeStr;

        await TrainingAttendance.findOneAndUpdate(
          {
            sessionId: session._id,
            $or: [{ playerId: item.playerId }, { childPlayerId: item.playerId }],
          },
          { $set: updateData },
          { upsert: true, new: true },
        );
      }
    }

    // Recalculate
    const allSessionAttendances = await TrainingAttendance.find({ sessionId: session._id }).lean();
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let unmarkedCount = 0;

    allSessionAttendances.forEach((a) => {
      const st = (a.status || a.attendanceStatus || 'UNMARKED').toUpperCase();
      if (st === 'PRESENT') presentCount++;
      else if (st === 'LATE') lateCount++;
      else if (st === 'ABSENT') absentCount++;
      else unmarkedCount++;
    });

    const total = allSessionAttendances.length;
    session.presentCount = presentCount;
    session.lateCount = lateCount;
    session.absentCount = absentCount;
    session.unmarkedCount = unmarkedCount;
    session.totalPlayers = Math.max(total, session.totalPlayers || 0);
    session.attendancePercentage =
      total > 0 ? Math.round(((presentCount + lateCount) / total) * 100) : 0;
    session.isAttendanceCompleted = unmarkedCount === 0 && total > 0;
    await session.save();

    return {
      message: 'Bulk attendance updated successfully',
      sessionId: session._id,
      sessionName: session.sessionName || session.sessionTitle,
      stats: {
        presentCount,
        lateCount,
        absentCount,
        unmarkedCount,
        totalPlayers: session.totalPlayers,
        attendancePercentage: session.attendancePercentage,
        isAttendanceCompleted: session.isAttendanceCompleted,
      },
    };
  }

  /**
   * Get Coach's Training Sessions list with date/month filters
   */
  async getCoachTrainingSessions(userId: string, query: Record<string, unknown> = {}) {
    const coach = await CoachProfile.findOne({ userId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const filter: any = {};
    const coachTeams = await Team.find({
      $or: [{ coachIds: coach._id }, ...(coach.academyId ? [{ academyId: coach.academyId }] : [])],
    }).lean();
    const coachTeamIds = coachTeams.map((t) => t._id);

    const orClauses: any[] = [{ coachId: coach._id }];
    if (coach.academyId) orClauses.push({ academyId: coach.academyId });
    if (coachTeamIds.length > 0) orClauses.push({ teamId: { $in: coachTeamIds } });
    filter.$or = orClauses;

    // Filter by single date: ?date=YYYY-MM-DD
    if (query.date && typeof query.date === 'string') {
      const startOfDay = new Date(query.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(query.date);
      endOfDay.setHours(23, 59, 59, 999);
      filter.sessionDate = { $gte: startOfDay, $lte: endOfDay };
    } else if (query.month && typeof query.month === 'string') {
      // Filter by month: ?month=YYYY-MM
      const [year, month] = query.month.split('-').map(Number);
      if (year && month) {
        const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
        filter.sessionDate = { $gte: startOfMonth, $lte: endOfMonth };
      }
    }

    if (query.teamId && Types.ObjectId.isValid(query.teamId as string)) {
      filter.teamId = query.teamId;
    }

    const sessions = await TrainingSession.find(filter)
      .populate('teamId', 'teamName ageGroup')
      .sort({ sessionDate: -1, startTime: 1 })
      .lean();

    return {
      total: sessions.length,
      sessions: sessions.map((s: any) => ({
        _id: s._id,
        id: s._id,
        sessionName: s.sessionName || s.sessionTitle || 'Training Session',
        sessionDate: s.sessionDate,
        startTime: s.startTime,
        endTime: s.endTime,
        timeRange: `${s.startTime} - ${s.endTime}`,
        trainingLocation: s.trainingLocation || s.locationField || 'Field 1',
        sessionType: s.sessionType,
        focusArea: s.focusArea,
        teamName: (s.teamId as any)?.teamName || '',
        teamAgeGroup: (s.teamId as any)?.ageGroup || '',
        presentCount: s.presentCount || 0,
        lateCount: s.lateCount || 0,
        absentCount: s.absentCount || 0,
        totalPlayers: s.totalPlayers || 0,
        attendancePercentage: s.attendancePercentage || 0,
        isAttendanceCompleted: Boolean(s.isAttendanceCompleted),
      })),
    };
  }

  /**
   * Update Player Fitness Status (ACTIVE / INJURED) by Coach
   */
  async updatePlayerFitnessStatus(userId: string, playerId: string, status: 'ACTIVE' | 'INJURED') {
    const coach = await CoachProfile.findOne({ userId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(404, 'Player not found');
    }

    player.fitnessStatus = status;
    if (player.transferStatus) {
      player.transferStatus.status = status === 'INJURED' ? 'Injured' : 'Active';
    }
    await player.save();

    return {
      playerId: player._id,
      status: player.fitnessStatus,
    };
  }

  // =============================================================
  // PLAYER EVALUATION (Development Programme - 4-Month Progress)
  // =============================================================
  async getPlayerEvaluationsDashboard(userId: string, query: Record<string, unknown> = {}) {
    const coach = await CoachProfile.findOne({ userId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const statusFilter = ((query.status as string) || 'PENDING').toUpperCase();

    const targetAcademyId = (query.academyId as string) || coach.academyId;
    const targetClub = (query.clubName as string) || coach.currentClub;

    // Filter candidate players for this coach
    const playerFilter: any = {};
    if (targetAcademyId) {
      playerFilter.$or = [{ academyId: targetAcademyId }];
      if (targetClub) {
        playerFilter.$or.push({ currentClub: targetClub });
      }
    } else if (targetClub) {
      playerFilter.currentClub = targetClub;
    } else {
      playerFilter.$or = [
        { verifyingCoachId: coach.userId },
        { 'coachVerification.coachName': coach.fullName },
      ];
    }

    // Include players who already have evaluation records under this coach
    const evaluatedPlayerIds = await PlayerEvaluation.find({ coachId: coach._id }).distinct(
      'playerId',
    );
    if (evaluatedPlayerIds.length > 0) {
      if (playerFilter.$or) {
        playerFilter.$or.push({ _id: { $in: evaluatedPlayerIds } });
      } else {
        playerFilter.$or = [{ ...playerFilter }, { _id: { $in: evaluatedPlayerIds } }];
      }
    }

    // Direct email search
    if (query.email && typeof query.email === 'string') {
      const emailRegex = new RegExp(String(query.email).trim(), 'i');
      const matchedUserIds = await UserModel.find({ email: emailRegex }).distinct('_id');
      playerFilter.userId = { $in: matchedUserIds };
      delete playerFilter.$or;
      delete playerFilter.currentClub;
    }

    // Search term filter (?searchTerm=...)
    if (query.searchTerm && typeof query.searchTerm === 'string') {
      const term = query.searchTerm.trim();
      const searchRegex = new RegExp(term, 'i');
      const matchedUserIds = await UserModel.find({
        $or: [{ email: searchRegex }, { name: searchRegex }],
      }).distinct('_id');

      const orClauses: any[] = [
        { fullName: searchRegex },
        { position: searchRegex },
        { currentClub: searchRegex },
        { country: searchRegex },
      ];

      if (matchedUserIds.length > 0) {
        orClauses.push({ userId: { $in: matchedUserIds } });
      }

      playerFilter.$and = playerFilter.$and || [];
      playerFilter.$and.push({ $or: orClauses });
    }

    const allMatchingPlayers = await PlayerProfile.find(playerFilter)
      .populate('userId', 'email name avatar')
      .lean();

    const allPlayerIds = allMatchingPlayers.map((p) => p._id);
    const existingEvaluations = await PlayerEvaluation.find({
      coachId: coach._id,
      playerId: { $in: allPlayerIds },
    })
      .sort({ createdAt: -1 })
      .lean();

    // Map each evaluation by playerId
    const evalMap = new Map<string, any>();
    for (const ev of existingEvaluations) {
      const pid = ev.playerId.toString();
      if (!evalMap.has(pid)) {
        evalMap.set(pid, ev);
      }
    }

    let pendingCount = 0;
    let evaluatedCount = 0;

    const mappedPlayers = allMatchingPlayers.map((p) => {
      const latestEval = evalMap.get(p._id.toString());
      const isEvaluated = latestEval && latestEval.status === 'EVALUATED';

      if (isEvaluated) {
        evaluatedCount++;
      } else {
        pendingCount++;
      }

      let lastEvaluatedStr = 'Pending Review';
      if (latestEval && latestEval.evaluationDate) {
        try {
          lastEvaluatedStr = new Date(latestEval.evaluationDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });
        } catch {
          lastEvaluatedStr = 'Pending Review';
        }
      }

      const rating = latestEval?.overallRating || p.overallRating || 0;

      return {
        _id: p._id,
        evaluationId: latestEval ? latestEval._id : null,
        name: p.fullName,
        avatar: p.profileImage || (p.userId as any)?.avatar || '',
        position: p.position || 'N/A',
        rating,
        academy: p.currentClub || coach.currentClub || 'N/A',
        lastEvaluated: lastEvaluatedStr,
        status: isEvaluated ? 'EVALUATED' : 'PENDING',
        nextEvaluationDue: latestEval?.nextEvaluationDue || null,
      };
    });

    // Filter by tab / status
    let filteredList = mappedPlayers;
    if (statusFilter === 'EVALUATED') {
      filteredList = mappedPlayers.filter((p) => p.status === 'EVALUATED');
    } else if (statusFilter === 'PENDING') {
      filteredList = mappedPlayers.filter((p) => p.status === 'PENDING');
    }

    const totalCount = filteredList.length;
    const totalPage = Math.ceil(totalCount / limit) || 1;
    const skip = (page - 1) * limit;
    const paginatedPlayers = filteredList.slice(skip, skip + limit);

    return {
      meta: {
        page,
        limit,
        total: totalCount,
        totalPage,
      },
      data: {
        summary: {
          pendingCount,
          evaluatedCount,
        },
        players: paginatedPlayers,
      },
    };
  }

  async getPlayerEvaluationDetails(userId: string, targetId: string) {
    const coach = userId ? await CoachProfile.findOne({ userId }) : null;

    let evaluation: any = null;
    let player: any = null;

    if (Types.ObjectId.isValid(targetId)) {
      evaluation = await PlayerEvaluation.findById(targetId).populate('playerId').lean();
      if (evaluation && evaluation.playerId) {
        player = evaluation.playerId;
      }
    }

    if (!player && Types.ObjectId.isValid(targetId)) {
      player = await PlayerProfile.findById(targetId).lean();
      if (player) {
        const query: any = { playerId: player._id };
        if (coach) query.coachId = coach._id;
        evaluation = await PlayerEvaluation.findOne(query).sort({ createdAt: -1 }).lean();
      }
    }

    if (!player) {
      throw new AppError(404, 'Player or evaluation record not found');
    }

    const techniques = evaluation?.techniques
      ? evaluation.techniques instanceof Map
        ? Object.fromEntries(evaluation.techniques)
        : evaluation.techniques
      : {};
    const characteristics = evaluation?.characteristics
      ? evaluation.characteristics instanceof Map
        ? Object.fromEntries(evaluation.characteristics)
        : evaluation.characteristics
      : {};
    const physical = evaluation?.physical
      ? evaluation.physical instanceof Map
        ? Object.fromEntries(evaluation.physical)
        : evaluation.physical
      : {};

    return {
      player: {
        _id: player._id,
        name: player.fullName,
        age: player.age || null,
        avatar: player.profileImage || '',
        position: player.position || '',
        centre: player.currentClub || coach?.currentClub || 'N/A',
        rating: evaluation?.overallRating || player.overallRating || 0,
      },
      evaluation: {
        _id: evaluation?._id || null,
        date: evaluation?.evaluationDate || new Date(),
        status: evaluation?.status || 'PENDING',
        overallRating: evaluation?.overallRating || player.overallRating || 0,
        technicalScore: evaluation?.technicalScore || 0,
        physicalScore: evaluation?.physicalScore || 0,
        mentalScore: evaluation?.mentalScore || 0,
        techniques,
        characteristics,
        physical,
        notes: evaluation?.notes || evaluation?.coachFeedback || '',
        nextEvaluationDue: evaluation?.nextEvaluationDue || null,
      },
    };
  }

  async getPlayerEvaluationProgressPdfData(userId?: string, targetId?: string) {
    let coach = userId ? await CoachProfile.findOne({ userId }) : null;
    let evaluation: any = null;
    let player: any = null;

    if (targetId && Types.ObjectId.isValid(targetId)) {
      evaluation = await PlayerEvaluation.findById(targetId)
        .populate('playerId')
        .populate('coachId')
        .populate('academyId')
        .lean();
      if (evaluation && evaluation.playerId) {
        player = evaluation.playerId;
        if (!coach && evaluation.coachId) {
          coach = evaluation.coachId;
        }
      }
    }

    if (!player && targetId && Types.ObjectId.isValid(targetId)) {
      player = await PlayerProfile.findById(targetId).lean();
      if (player) {
        evaluation = await PlayerEvaluation.findOne({
          playerId: player._id,
        })
          .sort({ evaluationDate: -1, createdAt: -1 })
          .populate('coachId')
          .populate('academyId')
          .lean();
        if (evaluation && evaluation.coachId && !coach) {
          coach = evaluation.coachId;
        }
      }
    }

    if (!player && !evaluation) {
      throw new AppError(404, 'Evaluation progress report not found');
    }

    const techniques = evaluation?.techniques
      ? evaluation.techniques instanceof Map
        ? Object.fromEntries(evaluation.techniques)
        : evaluation.techniques
      : {};
    const characteristics = evaluation?.characteristics
      ? evaluation.characteristics instanceof Map
        ? Object.fromEntries(evaluation.characteristics)
        : evaluation.characteristics
      : {};
    const physical = evaluation?.physical
      ? evaluation.physical instanceof Map
        ? Object.fromEntries(evaluation.physical)
        : evaluation.physical
      : {};

    const evalDate = evaluation?.evaluationDate || evaluation?.createdAt || new Date();
    const formattedDate = new Date(evalDate).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const nextDue = evaluation?.nextEvaluationDue
      ? new Date(evaluation.nextEvaluationDue).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : new Date(new Date(evalDate).getTime() + 120 * 24 * 60 * 60 * 1000).toLocaleDateString(
          'en-GB',
          {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          },
        );

    const academyName =
      (evaluation?.academyId as any)?.name ||
      player?.academy ||
      coach?.currentClub ||
      'K10 Football Academy';
    const academyLogo = (evaluation?.academyId as any)?.logo || '';

    const overallRating = evaluation?.overallRating || player?.overallRating || 85;

    return {
      reportTitle: 'Player Development Programme Progress Report',
      evaluationId: evaluation?._id || targetId,
      evaluationDate: evalDate,
      formattedDate,
      cycle: '4-Month Progress Evaluation',
      status: evaluation?.status || 'COMPLETED',
      nextEvaluationDue: nextDue,
      overallRating,
      grade: overallRating >= 90 ? 'EXCELLENT' : overallRating >= 75 ? 'GOOD' : 'NEEDS_IMPROVEMENT',
      categoryScores: {
        technical: evaluation?.technicalScore || 80,
        physical: evaluation?.physicalScore || 75,
        mental: evaluation?.mentalScore || 80,
      },
      player: {
        id: player?._id,
        name: player?.fullName || 'Player',
        position: player?.position || 'Forward',
        age: player?.age || null,
        avatar: player?.profileImage || '',
        academy: academyName,
        currentClub: player?.currentClub || academyName,
      },
      coach: {
        id: coach?._id,
        name: coach?.fullName || 'Assigned Coach',
        club: coach?.currentClub || academyName,
        avatar: coach?.profileImage || '',
        license:
          (coach as any)?.coachingLicenseLevel ||
          (coach as any)?.licenseNumber ||
          (coach as any)?.title ||
          'UEFA Certified',
      },
      academy: {
        name: academyName,
        logo: academyLogo,
      },
      breakdown: {
        techniques,
        characteristics,
        physical,
      },
      coachFeedback:
        evaluation?.coachFeedback || evaluation?.notes || 'Player is performing consistently well.',
      notes: evaluation?.notes || '',
      downloadUrl: `/api/v1/coaches/me/player-evaluations/${evaluation?._id || targetId}/pdf?download=true`,
      isOfficial: true,
      generatedAt: new Date(),
    };
  }

  async submitPlayerEvaluation(userId: string, targetId: string, payload: any) {
    const coach = await CoachProfile.findOne({ userId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    let evaluation: any = null;
    let playerId = targetId || payload.playerId;

    if (targetId && Types.ObjectId.isValid(targetId)) {
      evaluation = await PlayerEvaluation.findById(targetId);
      if (evaluation) {
        playerId = evaluation.playerId.toString();
      }
    }

    if (!evaluation && payload.evaluationId && Types.ObjectId.isValid(payload.evaluationId)) {
      evaluation = await PlayerEvaluation.findById(payload.evaluationId);
      if (evaluation) {
        playerId = evaluation.playerId.toString();
      }
    }

    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(404, 'Player not found');
    }

    if (!evaluation) {
      evaluation = await PlayerEvaluation.findOne({
        playerId: player._id,
        coachId: coach._id,
        status: { $in: ['NEED_EVALUATION', 'PENDING'] },
      });
      if (!evaluation) {
        evaluation = new PlayerEvaluation({
          playerId: player._id,
          coachId: coach._id,
          academyId: coach.academyId || player.academyId,
          status: 'NEED_EVALUATION',
        });
      }
    }

    const gradeToScore = (val: any): number => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const upper = val.toUpperCase().trim();
        if (upper.includes('EXCELLENT')) return 95;
        if (upper.includes('GOOD')) return 80;
        if (upper.includes('IMPROVEMENT')) return 65;
        const parsed = Number(val);
        if (!isNaN(parsed)) return parsed;
      }
      return 75;
    };

    const calcCategoryAvg = (catObj?: Record<string, any>): number => {
      if (!catObj || typeof catObj !== 'object') return 0;
      const values = Object.values(catObj);
      if (values.length === 0) return 0;
      const total = values.reduce((sum: number, v: any) => sum + gradeToScore(v), 0);
      return Math.round(total / values.length);
    };

    const techniques =
      payload.techniques ||
      (evaluation.techniques
        ? evaluation.techniques instanceof Map
          ? Object.fromEntries(evaluation.techniques)
          : evaluation.techniques
        : {});
    const characteristics =
      payload.characteristics ||
      (evaluation.characteristics
        ? evaluation.characteristics instanceof Map
          ? Object.fromEntries(evaluation.characteristics)
          : evaluation.characteristics
        : {});
    const physical =
      payload.physical ||
      (evaluation.physical
        ? evaluation.physical instanceof Map
          ? Object.fromEntries(evaluation.physical)
          : evaluation.physical
        : {});

    const technicalScore = payload.technicalScore || calcCategoryAvg(techniques) || 75;
    const mentalScore = payload.mentalScore || calcCategoryAvg(characteristics) || 75;
    const physicalScore = payload.physicalScore || calcCategoryAvg(physical) || 75;

    const overallRating =
      payload.overallRating || Math.round((technicalScore + mentalScore + physicalScore) / 3);

    const now = new Date();
    const nextDue = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000); // 4-month cycle

    evaluation.evaluationDate = now;
    evaluation.overallRating = overallRating;
    evaluation.technicalScore = technicalScore;
    evaluation.mentalScore = mentalScore;
    evaluation.physicalScore = physicalScore;
    evaluation.techniques = techniques;
    evaluation.characteristics = characteristics;
    evaluation.physical = physical;
    evaluation.status = 'EVALUATED';
    evaluation.nextEvaluationDue = nextDue;
    evaluation.expiresAt = nextDue;
    evaluation.coachFeedback = payload.coachFeedback || payload.notes || evaluation.coachFeedback;
    evaluation.notes = payload.notes || payload.coachFeedback || evaluation.notes;
    await evaluation.save();

    // Update player profile
    player.overallRating = overallRating;
    if (!player.playerEvaluation) {
      player.playerEvaluation = {} as any;
    }
    (player.playerEvaluation as any).lastEvaluationDate = now;
    (player.playerEvaluation as any).overallRating = overallRating;
    await player.save();
    await playerCacheService.invalidatePlayerCache(player._id, player.userId);

    // Update player attributes
    await PlayerAttributes.findOneAndUpdate(
      { playerId: player._id },
      {
        stamina: physicalScore,
        strength: physicalScore,
        ballControl: technicalScore,
        dribbling: technicalScore,
      },
      { upsert: true },
    );

    // Notify player
    if (player.userId) {
      await notificationService.createNotification({
        recipientId: player.userId,
        recipientRole: 'PLAYER',
        title: 'Player Development Report Completed',
        message: `Coach ${coach.fullName} has completed your Player Development Programme progress evaluation. Overall Rating: ${overallRating}/100.`,
        type: 'PLAYER_EVALUATION_COMPLETED',
        data: { evaluationId: evaluation._id, overallRating },
      });
    }

    return {
      evaluation,
      player: {
        _id: player._id,
        name: player.fullName,
        overallRating,
      },
    };
  }
}

export const coachService = new CoachService();
