import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { IAcademyProfile, ITeam, IGameReport, IPlayerEvaluation } from './academy.interface';
import { AcademyProfile, Team, GameReport, PlayerEvaluation } from './academy.model';
import QueryBuilder from '@/builder/QueryBuilder';

import { NotificationService } from '@/modules/notification/notification.service';
import { PlayerProfile, PlayerAttributes } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';

const notificationService = new NotificationService();

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

  async getGameReports(academyId: string) {
    return GameReport.find({ academyId })
      .populate('playerId', 'fullName position overallRating')
      .populate('coachId', 'fullName title');
  }

  async createPlayerEvaluation(academyId: string, payload: Partial<IPlayerEvaluation>) {
    return PlayerEvaluation.create({ ...payload, academyId });
  }

  async getPlayerEvaluations(academyId: string, playerId?: string) {
    const filter: Record<string, unknown> = { academyId };
    if (playerId) filter.playerId = playerId;
    return PlayerEvaluation.find(filter)
      .populate('playerId', 'fullName position profileImage overallRating currentClub')
      .populate('coachId', 'fullName title profileImage licenseStatus');
  }

  // ==========================================
  // 4-MONTH EVALUATION & REMINDER SYSTEM
  // ==========================================
  async getEvaluationDashboard(academyIdentifier: string) {
    let academy = null;
    if (Types.ObjectId.isValid(academyIdentifier)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: academyIdentifier }, { userId: academyIdentifier }],
      });
    }
    if (!academy) {
      throw new AppError(404, 'Academy profile not found');
    }

    const evaluations = await PlayerEvaluation.find({ academyId: academy._id })
      .populate('playerId', 'fullName position profileImage overallRating currentClub')
      .populate('coachId', 'fullName title profileImage phone email licenseStatus')
      .sort({ createdAt: -1 });

    const now = new Date();
    const evaluated: any[] = [];
    const due: any[] = [];
    const overdue: any[] = [];

    for (const item of evaluations) {
      // Auto check expiration (4-month cycle)
      if (item.expiresAt && new Date(item.expiresAt) < now && item.status !== 'EXPIRED') {
        item.status = 'EXPIRED';
        item.save().catch(() => {});
      }

      if (item.status === 'EVALUATED') {
        evaluated.push(item);
      } else if (item.status === 'EXPIRED' || item.status === 'OVERDUE') {
        overdue.push(item);
      } else {
        due.push(item);
      }
    }

    return {
      summary: {
        totalEvaluations: evaluations.length,
        evaluatedCount: evaluated.length,
        dueCount: due.length,
        overdueCount: overdue.length,
        evaluationCycleMonths: 4,
      },
      due,
      overdue,
      evaluated,
    };
  }

  async requestPlayerEvaluation(
    academyIdentifier: string,
    managerUserId: string,
    payload: { playerId: string; coachId: string; notes?: string },
  ) {
    let academy = null;
    if (Types.ObjectId.isValid(academyIdentifier)) {
      academy = await AcademyProfile.findOne({
        $or: [{ _id: academyIdentifier }, { userId: academyIdentifier }],
      });
    }
    if (!academy) {
      throw new AppError(404, 'Academy profile not found');
    }

    const player = await PlayerProfile.findById(payload.playerId);
    if (!player) {
      throw new AppError(404, 'Player not found');
    }

    const coach = await CoachProfile.findOne({
      $or: [{ _id: payload.coachId }, { userId: payload.coachId }],
    });
    if (!coach) {
      throw new AppError(404, 'Coach not found');
    }

    // 4-month expiration deadline
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000); // 120 days = 4 months

    const evaluation = await PlayerEvaluation.create({
      academyId: academy._id,
      playerId: player._id,
      coachId: coach._id,
      status: 'NEED_EVALUATION',
      nextEvaluationDue: now,
      expiresAt,
      requestedByManagerId: new Types.ObjectId(managerUserId),
      notes: payload.notes || '4-month official academy player evaluation requested by management.',
    });

    // Notify Coach
    await notificationService.createNotification({
      recipientId: coach.userId,
      recipientRole: 'COACH',
      title: 'Player Evaluation Required',
      message: `Management has requested an evaluation for ${player.fullName}. Evaluations expire every 4 months.`,
      type: 'PLAYER_EVALUATION_REQUESTED',
      data: {
        evaluationId: evaluation._id,
        playerId: player._id,
        playerName: player.fullName,
      },
    });

    return evaluation;
  }

  async sendEvaluationReminder(evaluationId: string, _managerUserId?: string) {
    const evaluation = await PlayerEvaluation.findById(evaluationId)
      .populate('playerId', 'fullName')
      .populate('coachId', 'userId fullName');

    if (!evaluation) {
      throw new AppError(404, 'Player evaluation record not found');
    }

    const coach = evaluation.coachId as any;
    const player = evaluation.playerId as any;

    evaluation.reminderCount = (evaluation.reminderCount || 0) + 1;
    evaluation.reminderSentAt = new Date();
    await evaluation.save();

    // Send urgent reminder notification to Coach
    await notificationService.createNotification({
      recipientId: coach.userId,
      recipientRole: 'COACH',
      title: 'Reminder: Player Evaluation Due',
      message: `URGENT: Player evaluation for ${player?.fullName || 'your player'} is due. Please submit the evaluation assessment.`,
      type: 'PLAYER_EVALUATION_REMINDER',
      data: {
        evaluationId: evaluation._id,
        reminderCount: evaluation.reminderCount,
      },
    });

    return {
      message: 'Evaluation reminder sent to coach successfully',
      evaluationId: evaluation._id,
      coachId: coach._id,
      reminderCount: evaluation.reminderCount,
      sentAt: evaluation.reminderSentAt,
    };
  }

  async submitPlayerEvaluation(
    evaluationId: string,
    coachUserId: string,
    payload: {
      technicalScore: number;
      physicalScore: number;
      mentalScore: number;
      overallRating?: number;
      coachFeedback?: string;
    },
  ) {
    const evaluation = await PlayerEvaluation.findById(evaluationId);
    if (!evaluation) {
      throw new AppError(404, 'Player evaluation record not found');
    }

    const coach = await CoachProfile.findOne({ userId: coachUserId });
    if (!coach || evaluation.coachId.toString() !== coach._id.toString()) {
      throw new AppError(403, 'Only the assigned coach can submit this player evaluation');
    }

    const overallRating =
      payload.overallRating ||
      Math.round((payload.technicalScore + payload.physicalScore + payload.mentalScore) / 3);

    const now = new Date();
    const nextDue = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000); // 4 months cycle

    evaluation.evaluationDate = now;
    evaluation.overallRating = overallRating;
    evaluation.technicalScore = payload.technicalScore;
    evaluation.physicalScore = payload.physicalScore;
    evaluation.mentalScore = payload.mentalScore;
    evaluation.status = 'EVALUATED';
    evaluation.nextEvaluationDue = nextDue;
    evaluation.expiresAt = nextDue;
    evaluation.coachFeedback = payload.coachFeedback;
    await evaluation.save();

    // Also update Player attributes & mental analysis
    await PlayerAttributes.findOneAndUpdate(
      { playerId: evaluation.playerId },
      {
        stamina: payload.physicalScore,
        strength: payload.physicalScore,
        ballControl: payload.technicalScore,
        dribbling: payload.technicalScore,
      },
      { upsert: true },
    );

    // Notify player and manager
    const player = await PlayerProfile.findById(evaluation.playerId);
    if (player && player.userId) {
      await notificationService.createNotification({
        recipientId: player.userId,
        recipientRole: 'PLAYER',
        title: 'Player Evaluation Completed',
        message: `Coach ${coach.fullName} has completed your official 4-month evaluation. Rating: ${overallRating}/100.`,
        type: 'PLAYER_EVALUATION_COMPLETED',
        data: { evaluationId: evaluation._id, overallRating },
      });
    }

    return evaluation;
  }
}

export const academyService = new AcademyService();
