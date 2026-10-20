import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { IAcademyProfile, ITeam, IGameReport, IPlayerEvaluation } from './academy.interface';
import { AcademyProfile, Team, GameReport, PlayerEvaluation } from './academy.model';
import QueryBuilder from '@/builder/QueryBuilder';

export class AcademyService {
  async createProfile(payload: Partial<IAcademyProfile>) {
    const existing = await AcademyProfile.findOne({ userId: payload.userId });
    if (existing) {
      throw new AppError(400, 'Academy profile already exists');
    }
    return AcademyProfile.create(payload);
  }

  async getProfileById(id: string) {
    let profile = null;
    if (Types.ObjectId.isValid(id)) {
      profile = await AcademyProfile.findOne({
        $or: [{ _id: id }, { userId: id }],
      }).populate('userId', 'name email avatar phone');
    }
    if (!profile) {
      throw new AppError(404, 'Academy profile not found');
    }
    return profile;
  }

  async getMyProfile(userId: string) {
    const profile = await AcademyProfile.findOne({ userId }).populate(
      'userId',
      'name email avatar phone',
    );
    if (!profile) {
      throw new AppError(404, 'Academy profile not found for this user');
    }
    return profile;
  }

  async getAllProfiles(query: Record<string, unknown> = {}) {
    const academyQuery = new QueryBuilder(
      AcademyProfile.find().populate('userId', 'name email avatar phone'),
      query,
    )
      .search([
        'name',
        'category',
        'country',
        'city',
        'location',
        'registrationId',
        'estimatedAcademySize',
      ])
      .filter()
      .sort()
      .paginate()
      .fields();

    const result = await academyQuery.modelQuery;
    const meta = await academyQuery.countTotal();
    return { meta, result };
  }

  async createTeam(academyId: string, payload: Partial<ITeam>) {
    return Team.create({ ...payload, academyId });
  }

  async getTeams(academyId: string) {
    return Team.find({ academyId });
  }

  async createGameReport(academyId: string, payload: Partial<IGameReport>) {
    return GameReport.create({ ...payload, academyId });
  }

  async getGameReports(academyId: string, query: Record<string, unknown> = {}) {
    const reportQuery = new QueryBuilder(
      GameReport.find({ academyId })
        .populate('playerId', 'fullName position overallRating')
        .populate('coachId', 'fullName title'),
      query,
    )
      .search(['matchTitle', 'opponent'])
      .filter()
      .sort()
      .paginate();

    const result = await reportQuery.modelQuery;
    const meta = await reportQuery.countTotal();

    return {
      meta,
      result,
    };
  }

  async createPlayerEvaluation(academyId: string, payload: Partial<IPlayerEvaluation>) {
    return PlayerEvaluation.create({ ...payload, academyId });
  }

  async getPlayerEvaluations(academyId: string, playerId?: string) {
    const filter: Record<string, unknown> = { academyId };
    if (playerId) filter.playerId = playerId;
    return PlayerEvaluation.find(filter).populate('playerId', 'fullName position');
  }
}

export const academyService = new AcademyService();
