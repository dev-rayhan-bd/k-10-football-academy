import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { IPlayerEvaluation } from '../academy.interface';
import { AcademyProfile, PlayerEvaluation, AcademyCoach } from '../academy.model';
import { NotificationService } from '@/modules/notification/notification.service';
import { PlayerProfile, PlayerAttributes } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';

const notificationService = new NotificationService();

export class AcademyEvaluationsService {
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

  async getAcademyPlayerEvaluationDashboard(
    academyIdentifier: string,
    query: Record<string, unknown> = {},
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

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const searchTerm = query.searchTerm ? String(query.searchTerm).trim() : '';
    const ageGroupFilter = query.ageGroup ? String(query.ageGroup).trim() : '';

    // Find all players of this academy
    const academyPlayers = await PlayerProfile.find({
      $or: [{ academyId: academy._id }, { currentClub: academy.name }],
    })
      .select('_id fullName age dateOfBirth position profileImage currentClub tier overallRating')
      .lean();

    const academyPlayerIds = academyPlayers.map((p) => p._id);

    // Find all evaluations associated with this academy or its players
    const allEvaluations = await PlayerEvaluation.find({
      $or: [{ academyId: academy._id }, { playerId: { $in: academyPlayerIds } }],
    })
      .populate(
        'playerId',
        'fullName age dateOfBirth position profileImage currentClub tier overallRating',
      )
      .populate('coachId', 'fullName title profileImage currentClub coachingLicenseLevel')
      .sort({ evaluationDate: -1, createdAt: -1 })
      .lean();

    // Helper for age group
    const getAgeGroup = (player: any): string => {
      if (!player) return 'U-16';
      if (player.ageGroup) return player.ageGroup;
      let age = player.age;
      if (!age && player.dateOfBirth) {
        const diff = Date.now() - new Date(player.dateOfBirth).getTime();
        age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
      }
      return age ? `U-${age}` : 'U-16';
    };

    // 1. Metric Cards Calculation
    const totalEvaluations = allEvaluations.length;
    let sumOverallRating = 0;
    let countRated = 0;
    let improvingCount = 0;
    let evaluatedThisMonth = 0;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Group evaluations by player to calculate deltas
    const evalsByPlayer = new Map<string, any[]>();
    for (const ev of allEvaluations) {
      const pid = ev.playerId ? ((ev.playerId as any)._id || ev.playerId).toString() : null;
      if (pid) {
        if (!evalsByPlayer.has(pid)) {
          evalsByPlayer.set(pid, []);
        }
        evalsByPlayer.get(pid)!.push(ev);
      }

      if (
        typeof ev.overallRating === 'number' &&
        !isNaN(ev.overallRating) &&
        ev.overallRating > 0
      ) {
        sumOverallRating += ev.overallRating;
        countRated++;
      }

      const evalDate = ev.evaluationDate
        ? new Date(ev.evaluationDate)
        : ev.createdAt
          ? new Date(ev.createdAt)
          : null;
      if (
        evalDate &&
        evalDate.getMonth() === currentMonth &&
        evalDate.getFullYear() === currentYear
      ) {
        evaluatedThisMonth++;
      }
    }

    // Calculate player deltas
    const playerDeltas: Array<{
      playerId: string;
      playerName: string;
      ageGroup: string;
      delta: number;
      rating: number;
    }> = [];

    evalsByPlayer.forEach((playerEvals, pid) => {
      const latest = playerEvals[0];
      const previous = playerEvals.length > 1 ? playerEvals[1] : null;
      let delta =
        typeof latest.improvementDelta === 'number' && latest.improvementDelta !== 0
          ? latest.improvementDelta
          : 0;

      if (
        delta === 0 &&
        previous &&
        typeof latest.overallRating === 'number' &&
        typeof previous.overallRating === 'number'
      ) {
        const rawDiff = latest.overallRating - previous.overallRating;
        delta = rawDiff > 10 ? +(rawDiff / 10).toFixed(1) : +rawDiff.toFixed(1);
      }

      const player = latest.playerId as any;
      if (delta > 0) {
        improvingCount++;
      }

      if (player) {
        playerDeltas.push({
          playerId: pid,
          playerName: player.fullName || 'Player',
          ageGroup: getAgeGroup(player),
          delta,
          rating: latest.overallRating || player.overallRating || 0,
        });
      }
    });

    const avgOverallRatingRaw = countRated > 0 ? sumOverallRating / countRated : 0;
    const avgOverallRating =
      avgOverallRatingRaw > 10
        ? +(avgOverallRatingRaw / 10).toFixed(1)
        : +avgOverallRatingRaw.toFixed(1);

    // 2. Right Sidebar Widgets
    // Most Improved widget: players with deltas sorted desc
    const mostImproved = [...playerDeltas]
      .filter((d) => d.delta !== 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5)
      .map((item) => ({
        playerId: item.playerId,
        playerName: item.playerName,
        ageGroup: item.ageGroup,
        delta: item.delta > 0 ? `+${item.delta.toFixed(1)}` : `${item.delta.toFixed(1)}`,
        deltaValue: item.delta,
        isPositive: item.delta >= 0,
      }));

    // Top Performers widget: players sorted by overall rating
    const topPerformersMap = new Map<string, any>();
    for (const ev of allEvaluations) {
      const p = ev.playerId as any;
      if (p && p._id && !topPerformersMap.has(p._id.toString())) {
        topPerformersMap.set(p._id.toString(), {
          playerId: p._id,
          playerName: p.fullName || 'Player',
          ageGroup: getAgeGroup(p),
          position: (p.position || 'FORWARD').toUpperCase(),
          rawRating: ev.overallRating || p.overallRating || 0,
        });
      }
    }

    const topPerformers = Array.from(topPerformersMap.values())
      .sort((a, b) => b.rawRating - a.rawRating)
      .slice(0, 5)
      .map((p, idx) => {
        const rOutOf10 =
          p.rawRating > 10 ? +(p.rawRating / 10).toFixed(1) : +p.rawRating.toFixed(1);
        return {
          rank: idx + 1,
          playerId: p.playerId,
          playerName: p.playerName,
          ageGroup: p.ageGroup,
          position: p.position,
          rating: rOutOf10,
        };
      });

    // 3. Scale scores & format dates
    const scaleScoreTo20 = (score?: number) => {
      if (typeof score !== 'number' || isNaN(score)) return 15;
      if (score <= 20) return Math.round(score);
      return Math.min(20, Math.max(1, Math.round(score / 5)));
    };

    const formatDate = (date?: Date | string): string => {
      if (!date) return '';
      const d = new Date(date);
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    };

    // Filter evaluations by searchTerm & ageGroup
    let filteredEvaluations = allEvaluations;

    if (searchTerm) {
      const regex = new RegExp(searchTerm, 'i');
      filteredEvaluations = filteredEvaluations.filter((ev) => {
        const p = ev.playerId as any;
        const c = ev.coachId as any;
        return (
          (p?.fullName && regex.test(p.fullName)) ||
          (p?.position && regex.test(p.position)) ||
          (p?.currentClub && regex.test(p.currentClub)) ||
          (c?.fullName && regex.test(c.fullName))
        );
      });
    }

    if (ageGroupFilter) {
      filteredEvaluations = filteredEvaluations.filter((ev) => {
        const p = ev.playerId as any;
        return getAgeGroup(p).toLowerCase() === ageGroupFilter.toLowerCase();
      });
    }

    const totalCount = filteredEvaluations.length;
    const totalPage = Math.ceil(totalCount / limit) || 1;
    const skip = (page - 1) * limit;
    const paginatedEvals = filteredEvaluations.slice(skip, skip + limit);

    const evaluations = paginatedEvals.map((ev) => {
      const p = ev.playerId as any;
      const c = ev.coachId as any;
      const rawRating = ev.overallRating || p?.overallRating || 0;
      const ratingOutOf10 = rawRating > 10 ? +(rawRating / 10).toFixed(1) : +rawRating.toFixed(1);
      const ageGroup = getAgeGroup(p);
      const pos = p?.position || 'PLAYER';
      const tier = p?.tier || 'TIER 1';

      return {
        _id: ev._id,
        evaluationId: ev._id,
        evaluationDate: ev.evaluationDate || ev.createdAt,
        formattedDate: formatDate(ev.evaluationDate || ev.createdAt),
        ageGroup,
        player: {
          _id: p?._id,
          name: p?.fullName || 'Unknown Player',
          avatar: p?.profileImage || '',
          position: pos,
          tier,
          tierBadge: `${pos.toUpperCase()} - ${tier.toUpperCase()}`,
          currentClub: p?.currentClub || academy.name,
        },
        coach: {
          _id: c?._id,
          name: c?.fullName || 'Assigned Coach',
          avatar: c?.profileImage || '',
          title: c?.title || 'Youth Coach',
        },
        overallRating: ratingOutOf10,
        overallRatingFormatted: `(${ratingOutOf10}/10)`,
        rawOverallRating: rawRating,
        scores: {
          technical: scaleScoreTo20(ev.technicalScore),
          physical: scaleScoreTo20(ev.physicalScore),
          mental: scaleScoreTo20(ev.mentalScore),
          technicalScore: ev.technicalScore || 0,
          physicalScore: ev.physicalScore || 0,
          mentalScore: ev.mentalScore || 0,
        },
        improvementDelta: ev.improvementDelta || 0,
        status: ev.status || 'EVALUATED',
        nextEvaluationDue: ev.nextEvaluationDue || null,
      };
    });

    return {
      metrics: {
        avgOverallRating,
        improvingPlayers: improvingCount,
        evaluatedThisMonth,
        totalEvaluations,
      },
      mostImproved,
      topPerformers,
      evaluations,
      meta: {
        page,
        limit,
        total: totalCount,
        totalPage,
      },
    };
  }

  async getAcademyPlayerEvaluationDetails(targetId: string, _academyIdentifier?: string) {
    let evaluation: any = null;
    let player: any = null;

    if (Types.ObjectId.isValid(targetId)) {
      evaluation = await PlayerEvaluation.findById(targetId)
        .populate('playerId')
        .populate('coachId')
        .populate('academyId')
        .lean();
      if (evaluation && evaluation.playerId) {
        player = evaluation.playerId;
      }
    }

    if (!player && Types.ObjectId.isValid(targetId)) {
      player = await PlayerProfile.findById(targetId).lean();
      if (player) {
        evaluation = await PlayerEvaluation.findOne({ playerId: player._id })
          .sort({ evaluationDate: -1, createdAt: -1 })
          .populate('coachId')
          .populate('academyId')
          .lean();
      }
    }

    if (!evaluation && !player) {
      throw new AppError(404, 'Player evaluation report not found');
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

    const coach = evaluation?.coachId as any;
    const academy = evaluation?.academyId as any;

    const evalDate = evaluation?.evaluationDate || evaluation?.createdAt || new Date();
    const formattedDate = new Date(evalDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const nextDue = evaluation?.nextEvaluationDue
      ? new Date(evaluation.nextEvaluationDue).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : new Date(new Date(evalDate).getTime() + 120 * 24 * 60 * 60 * 1000).toLocaleDateString(
          'en-US',
          {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          },
        );

    const rawRating = evaluation?.overallRating || player?.overallRating || 0;
    const ratingOutOf10 = rawRating > 10 ? +(rawRating / 10).toFixed(1) : +rawRating.toFixed(1);

    // Standard list for TECHNICAL skills (matching Screenshot 2)
    const technicalSkillsConfig = [
      { key: 'dribbling', label: 'Dribbling' },
      { key: 'ballMastery', label: 'Ball Mastery' },
      { key: 'runningWithBall', label: 'Running with Ball' },
      { key: 'rangeOfPassing', label: 'Range of Passing' },
      { key: 'strikingFinishing', label: 'Striking / Finishing' },
      { key: 'defending', label: 'Defending' },
      { key: 'firstTouch', label: 'First Touch' },
      { key: 'nonDominantFoot', label: 'Non dominant foot' },
    ];

    const technicalList = technicalSkillsConfig.map((item) => {
      const val = techniques[item.key] || 'IMPROVEMENT';
      return {
        key: item.key,
        skill: item.label,
        rating: String(val).toUpperCase(),
      };
    });

    // Standard list for MENTAL skills (matching Screenshot 2)
    const mentalSkillsConfig = [
      { key: 'gameAwareness', label: 'Game Awareness' },
      { key: 'gamesUnderstanding', label: 'Games Understanding' },
      { key: 'decisionMaking', label: 'Decision Making' },
      { key: 'concentration', label: 'Concentration' },
      { key: 'leadership', label: 'Leadership' },
      { key: 'desire', label: 'Desire' },
      { key: 'maturity', label: 'Maturity' },
    ];

    const mentalList = mentalSkillsConfig.map((item) => {
      const val = characteristics[item.key] || 'IMPROVEMENT';
      return {
        key: item.key,
        skill: item.label,
        rating: String(val).toUpperCase(),
      };
    });

    // Standard list for PHYSICAL skills
    const physicalSkillsConfig = [
      { key: 'speedAcceleration', label: 'Speed & Acceleration' },
      { key: 'movement', label: 'Movement' },
      { key: 'balance', label: 'Balance' },
      { key: 'power', label: 'Power' },
      { key: 'strength', label: 'Strength' },
      { key: 'agility', label: 'Agility' },
      { key: 'coordination', label: 'Coordination' },
    ];

    const physicalList = physicalSkillsConfig.map((item) => {
      const val = physical[item.key] || 'IMPROVEMENT';
      return {
        key: item.key,
        skill: item.label,
        rating: String(val).toUpperCase(),
      };
    });

    const scaleScoreTo20 = (score?: number) => {
      if (typeof score !== 'number' || isNaN(score)) return 15;
      if (score <= 20) return Math.round(score);
      return Math.min(20, Math.max(1, Math.round(score / 5)));
    };

    return {
      reportTitle: 'PLAYER EVALUATION REPORT',
      subtitle: `DEVELOPMENT REPORT SHEET OVERLAY FOR ${(player?.fullName || 'PLAYER').toUpperCase()}`,
      evaluationId: evaluation?._id || targetId,
      evaluationDate: evalDate,
      formattedDate,
      cycle: '4-Month Progress Evaluation',
      status: evaluation?.status || 'EVALUATED',
      nextEvaluationDue: nextDue,
      overallRating: ratingOutOf10,
      overallRatingFormatted: `(${ratingOutOf10}/10)`,
      rawOverallRating: rawRating,
      grade: rawRating >= 90 ? 'EXCELLENT' : rawRating >= 75 ? 'GOOD' : 'NEEDS_IMPROVEMENT',
      categoryScores: {
        technical: scaleScoreTo20(evaluation?.technicalScore),
        physical: scaleScoreTo20(evaluation?.physicalScore),
        mental: scaleScoreTo20(evaluation?.mentalScore),
        technicalScore: evaluation?.technicalScore || 0,
        physicalScore: evaluation?.physicalScore || 0,
        mentalScore: evaluation?.mentalScore || 0,
      },
      player: {
        _id: player?._id,
        name: player?.fullName || 'Unknown Player',
        position: player?.position || 'Forward',
        age: player?.age || null,
        avatar: player?.profileImage || '',
        academy: academy?.name || player?.currentClub || 'K10 Football Academy',
        currentClub: player?.currentClub || academy?.name || 'K10 Football Academy',
        overallRating: ratingOutOf10,
        tier: player?.tier || 'TIER 1',
        tierBadge: `${(player?.position || 'PLAYER').toUpperCase()} - ${(player?.tier || 'TIER 1').toUpperCase()}`,
      },
      coach: {
        _id: coach?._id,
        name: coach?.fullName || 'Assigned Coach',
        club: coach?.currentClub || academy?.name || 'K10 Football Academy',
        avatar: coach?.profileImage || '',
        license:
          coach?.coachingLicenseLevel || coach?.licenseNumber || coach?.title || 'UEFA Certified',
      },
      academy: {
        _id: academy?._id,
        name: academy?.name || player?.currentClub || 'K10 Football Academy',
        logo: academy?.logo || '',
      },
      sections: {
        technical: technicalList,
        mental: mentalList,
        physical: physicalList,
      },
      techniquesRaw: techniques,
      characteristicsRaw: characteristics,
      physicalRaw: physical,
      coachFeedback:
        evaluation?.coachFeedback || evaluation?.notes || 'Player is performing consistently well.',
      notes: evaluation?.notes || '',
      downloadPdfUrl: `/api/v1/academies/player-evaluations/${evaluation?._id || targetId}/pdf`,
    };
  }

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

    // Ensure the coach is an officially approved coach of this academy
    const approvedAffiliation = await AcademyCoach.findOne({
      academyId: academy._id,
      coachId: coach._id,
      status: 'APPROVED',
    });
    if (!approvedAffiliation) {
      throw new AppError(
        400,
        `Coach ${coach.fullName} is not an officially approved coach of ${academy.name}. Only verified academy coaches can evaluate academy players.`,
      );
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

export const academyEvaluationsService = new AcademyEvaluationsService();
