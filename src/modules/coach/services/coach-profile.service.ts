import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { UserModel } from '@/modules/user/user.model';
import QueryBuilder from '@/builder/QueryBuilder';
import { deleteFromStorage } from '@/utils/fileUpload.utils';
import { ICoachProfile, ITacticalFormation, ICoachTestimonial } from '../coach.interface';
import { CoachProfile, TacticalFormation, CoachTestimonial } from '../coach.model';
import { coachCvService, computeCoachProfileCompletion } from './coach-cv.service';
import { coachCacheService } from './coach-cache.service';
import { Media } from '@/modules/media/media.model';

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

export class CoachProfileService {
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
}

export const coachProfileService = new CoachProfileService();
