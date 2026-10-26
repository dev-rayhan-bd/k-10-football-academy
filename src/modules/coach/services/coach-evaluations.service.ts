import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { UserModel } from '@/modules/user/user.model';
import { CoachProfile } from '../coach.model';
import { PlayerProfile, PlayerAttributes } from '@/modules/player/player.model';
import { PlayerEvaluation } from '@/modules/academy/academy.model';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { NotificationService } from '@/modules/notification/notification.service';

const notificationService = new NotificationService();

export class CoachEvaluationsService {
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

export const coachEvaluationsService = new CoachEvaluationsService();
